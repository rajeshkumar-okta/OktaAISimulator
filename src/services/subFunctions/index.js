/**
 * Sub Functions Registry
 *
 * This module provides a registry of reusable server-side functions that can be
 * composed into flow steps. Each function is self-documenting with OpenAPI-style
 * metadata including descriptions, inputs, outputs, and examples.
 *
 * EDUCATIONAL PURPOSE:
 * These functions are designed for learners and testers to understand OAuth/OIDC
 * protocols. Each function includes detailed descriptions explaining what it does,
 * when to use it, and links to relevant specifications.
 *
 * Usage:
 *   import { registry, execute, getFunction, listFunctions } from './subFunctions/index.js';
 */

import createJwtAssertion from './createJwtAssertion.js';
import tokenExchange from './tokenExchange.js';
import jwtBearerGrant from './jwtBearerGrant.js';
import decodeJwt from './decodeJwt.js';
import httpRequest from './httpRequest.js';

// ============================================================================
// REGISTRY
// ============================================================================
// All available sub functions, keyed by their ID.
// Each function exports its own metadata and execute method.

const registry = {
  createJwtAssertion,
  tokenExchange,
  jwtBearerGrant,
  decodeJwt,
  httpRequest
};

// ============================================================================
// HELPER: Resolve Template Expressions
// ============================================================================
// Replaces {{variable}} expressions in input values with actual values.
//
// Supported namespaces:
//   - {{config.xxx}} - Values from flow configuration
//   - {{state.xxx}}  - Values from flow state (previous step results)
//   - {{subFn.id.output}} - Output from a previous sub-function in this step
//   - {{env.xxx}} - Environment variables (for testing)

function resolveExpression(template, context) {
  if (typeof template !== 'string') {
    return template;
  }

  // Match {{namespace.path}} or {{namespace.path.nested}}
  return template.replace(/\{\{([^}]+)\}\}/g, (match, expr) => {
    const parts = expr.trim().split('.');
    const namespace = parts[0];
    const path = parts.slice(1);

    let value;
    switch (namespace) {
      case 'config':
        value = getNestedValue(context.config, path);
        break;
      case 'state':
        value = getNestedValue(context.state, path);
        break;
      case 'subFn':
        // subFn.functionId.outputName
        const fnId = path[0];
        const outputPath = path.slice(1);
        value = getNestedValue(context.subFnResults?.[fnId], outputPath);
        break;
      case 'env':
        value = process.env[path.join('.')];
        break;
      default:
        // Try direct lookup in context
        value = getNestedValue(context, parts);
    }

    // If value is undefined, return the original expression for debugging
    if (value === undefined) {
      return match;
    }

    // If the entire template is just this expression, return the raw value
    // This preserves objects/arrays instead of stringifying them
    if (template === match) {
      return value;
    }

    // Otherwise, convert to string for concatenation
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}

function getNestedValue(obj, path) {
  if (!obj || !path.length) return obj;
  let current = obj;
  for (const key of path) {
    if (current === null || current === undefined) return undefined;
    current = current[key];
  }
  return current;
}

// ============================================================================
// RESOLVE ALL INPUTS
// ============================================================================
// Resolves all template expressions in an inputs object.

function resolveInputs(inputs, context) {
  const resolved = {};
  for (const [key, value] of Object.entries(inputs || {})) {
    if (typeof value === 'string') {
      resolved[key] = resolveExpression(value, context);
    } else if (typeof value === 'object' && value !== null) {
      // Recursively resolve nested objects
      resolved[key] = resolveInputs(value, context);
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

// ============================================================================
// VALIDATE INPUTS
// ============================================================================
// Checks that all required inputs are provided and types match.

function validateInputs(fn, resolvedInputs) {
  const errors = [];

  for (const [inputName, inputDef] of Object.entries(fn.inputs || {})) {
    const value = resolvedInputs[inputName];

    // Check required fields
    if (inputDef.required && (value === undefined || value === null || value === '')) {
      errors.push(`Missing required input: ${inputName}`);
      continue;
    }

    // Skip validation for optional fields that aren't provided
    if (value === undefined || value === null) {
      continue;
    }

    // Type validation (basic)
    if (inputDef.type === 'jwk' && typeof value === 'string') {
      try {
        JSON.parse(value);
      } catch {
        errors.push(`Input "${inputName}" must be valid JSON (JWK format)`);
      }
    }
  }

  return errors;
}

// ============================================================================
// EXECUTE A SUB FUNCTION
// ============================================================================
// Executes a sub function with resolved inputs and returns its outputs.
//
// Parameters:
//   - fnId: The function ID (e.g., 'createJwtAssertion')
//   - inputs: Raw inputs (may contain {{expressions}})
//   - context: { config, state, subFnResults }
//
// Returns:
//   - { success: true, outputs: {...}, curl?: '...' }
//   - { success: false, error: '...' }

export async function execute(fnId, inputs, context = {}) {
  // Get the function definition
  const fn = registry[fnId];
  if (!fn) {
    return {
      success: false,
      error: `Unknown sub function: ${fnId}. Available: ${Object.keys(registry).join(', ')}`
    };
  }

  // Resolve template expressions in inputs
  const resolvedInputs = resolveInputs(inputs, context);

  // Validate inputs
  const validationErrors = validateInputs(fn, resolvedInputs);
  if (validationErrors.length > 0) {
    return {
      success: false,
      error: `Validation failed: ${validationErrors.join('; ')}`
    };
  }

  // Execute the function
  try {
    const result = await fn.execute(resolvedInputs, context);
    return {
      success: true,
      outputs: result.outputs || result,
      curl: result.curl || null
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || String(err)
    };
  }
}

// ============================================================================
// EXECUTE A CHAIN OF SUB FUNCTIONS
// ============================================================================
// Executes multiple sub functions in sequence, with each function's outputs
// available to subsequent functions via {{subFn.id.output}}.
//
// Parameters:
//   - chain: Array of { fn, id, inputs, storeResults }
//   - context: { config, state }
//
// Returns:
//   - { success: true, results: [...], stateUpdates: {...} }
//   - { success: false, error: '...', failedAt: index }

export async function executeChain(chain, context = {}) {
  const results = [];
  const subFnResults = {};
  const stateUpdates = {};

  for (let i = 0; i < chain.length; i++) {
    const step = chain[i];
    const { fn: fnId, id: stepId, inputs, storeResults } = step;

    // Execute with accumulated subFnResults
    const result = await execute(fnId, inputs, {
      ...context,
      subFnResults
    });

    // Store result for this step
    const stepResult = {
      id: stepId || `step-${i}`,
      fn: fnId,
      ...result
    };
    results.push(stepResult);

    // If failed, stop the chain
    if (!result.success) {
      return {
        success: false,
        error: result.error,
        failedAt: i,
        failedStep: stepId || fnId,
        results
      };
    }

    // Store outputs for subsequent functions
    subFnResults[stepId || fnId] = result.outputs;

    // Process storeResults to update state
    if (storeResults && result.outputs) {
      for (const mapping of storeResults) {
        const { from, to } = mapping;
        const value = result.outputs[from];
        if (value !== undefined) {
          stateUpdates[to] = value;
        }
      }
    }
  }

  return {
    success: true,
    results,
    stateUpdates
  };
}

// ============================================================================
// GET FUNCTION DEFINITION
// ============================================================================
// Returns the full definition of a sub function (for UI display).

export function getFunction(fnId) {
  const fn = registry[fnId];
  if (!fn) return null;

  // Return metadata without the execute function
  return {
    id: fn.id,
    name: fn.name,
    category: fn.category,
    description: fn.description,
    inputs: fn.inputs,
    outputs: fn.outputs
  };
}

// ============================================================================
// LIST ALL FUNCTIONS
// ============================================================================
// Returns a list of all available sub functions with their metadata.
// Optionally filter by category.

export function listFunctions(category = null) {
  return Object.values(registry)
    .filter(fn => !category || fn.category === category)
    .map(fn => ({
      id: fn.id,
      name: fn.name,
      category: fn.category,
      description: fn.description,
      inputs: fn.inputs,
      outputs: fn.outputs
    }));
}

// ============================================================================
// GET CATEGORIES
// ============================================================================
// Returns a list of unique categories with their function counts.

export function getCategories() {
  const categories = {};
  for (const fn of Object.values(registry)) {
    categories[fn.category] = (categories[fn.category] || 0) + 1;
  }
  return Object.entries(categories).map(([name, count]) => ({ name, count }));
}

// Export the registry for direct access
export { registry };

// Default export for convenience
export default {
  registry,
  execute,
  executeChain,
  getFunction,
  listFunctions,
  getCategories
};
