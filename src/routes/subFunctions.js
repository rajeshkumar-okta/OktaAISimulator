/**
 * Sub Functions API Routes
 *
 * Provides REST endpoints for listing, inspecting, and executing sub functions.
 * These are reusable server-side operations for the flow builder.
 *
 * Endpoints:
 *   GET  /api/sub-functions           - List all available sub functions
 *   GET  /api/sub-functions/categories - List categories with counts
 *   GET  /api/sub-functions/:id       - Get details of a specific function
 *   POST /api/sub-functions/:id/execute - Execute a function with inputs
 *   POST /api/sub-functions/chain     - Execute a chain of functions
 */

import { Router } from 'express';
import {
  listFunctions,
  getFunction,
  getCategories,
  execute,
  executeChain
} from '../services/subFunctions/index.js';

const router = Router();

// ============================================================================
// GET /api/sub-functions
// ============================================================================
// List all available sub functions with their metadata.
// Optionally filter by category using ?category=jwt
//
// Response:
// {
//   "functions": [
//     { "id": "createJwtAssertion", "name": "...", "category": "jwt", ... },
//     ...
//   ]
// }

router.get('/', (req, res) => {
  try {
    const { category } = req.query;
    const functions = listFunctions(category || null);

    res.json({
      functions,
      total: functions.length,
      filter: category || null
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to list sub functions',
      message: err.message
    });
  }
});

// ============================================================================
// GET /api/sub-functions/categories
// ============================================================================
// List all categories with function counts.
//
// Response:
// {
//   "categories": [
//     { "name": "jwt", "count": 2 },
//     { "name": "oauth", "count": 2 },
//     { "name": "http", "count": 1 }
//   ]
// }

router.get('/categories', (req, res) => {
  try {
    const categories = getCategories();

    res.json({
      categories
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to list categories',
      message: err.message
    });
  }
});

// ============================================================================
// GET /api/sub-functions/:id
// ============================================================================
// Get full details of a specific sub function.
//
// Response:
// {
//   "id": "createJwtAssertion",
//   "name": "Create JWT Client Assertion",
//   "category": "jwt",
//   "description": "...",
//   "inputs": { ... },
//   "outputs": { ... }
// }

router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const fn = getFunction(id);

    if (!fn) {
      return res.status(404).json({
        error: 'Sub function not found',
        id,
        available: listFunctions().map(f => f.id)
      });
    }

    res.json(fn);
  } catch (err) {
    res.status(500).json({
      error: 'Failed to get sub function',
      message: err.message
    });
  }
});

// ============================================================================
// POST /api/sub-functions/:id/execute
// ============================================================================
// Execute a sub function with provided inputs.
//
// Request body:
// {
//   "inputs": {
//     "privateJwk": "...",
//     "issuer": "...",
//     ...
//   },
//   "context": {
//     "config": { ... },  // Optional: flow config for {{config.x}} resolution
//     "state": { ... }    // Optional: flow state for {{state.x}} resolution
//   }
// }
//
// Response (success):
// {
//   "success": true,
//   "outputs": {
//     "assertion": "eyJ...",
//     ...
//   },
//   "curl": "curl -X POST ..."  // If applicable
// }
//
// Response (error):
// {
//   "success": false,
//   "error": "Missing required input: privateJwk"
// }

router.post('/:id/execute', async (req, res) => {
  try {
    const { id } = req.params;
    const { inputs, context } = req.body;

    // Validate function exists
    const fn = getFunction(id);
    if (!fn) {
      return res.status(404).json({
        success: false,
        error: `Sub function not found: ${id}`,
        available: listFunctions().map(f => f.id)
      });
    }

    // Execute the function
    const result = await execute(id, inputs || {}, context || {});

    // Return result with appropriate status
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Execution failed',
      message: err.message
    });
  }
});

// ============================================================================
// POST /api/sub-functions/chain
// ============================================================================
// Execute a chain of sub functions in sequence.
// Each function's outputs are available to subsequent functions via {{subFn.id.output}}.
//
// Request body:
// {
//   "chain": [
//     {
//       "fn": "createJwtAssertion",
//       "id": "clientAuth",
//       "inputs": {
//         "privateJwk": "{{config.privateJwk}}",
//         "issuer": "{{config.clientId}}",
//         ...
//       }
//     },
//     {
//       "fn": "tokenExchange",
//       "id": "exchange",
//       "inputs": {
//         "clientAssertion": "{{subFn.clientAuth.assertion}}",
//         ...
//       },
//       "storeResults": [
//         { "from": "access_token", "to": "newToken" }
//       ]
//     }
//   ],
//   "context": {
//     "config": { ... },
//     "state": { ... }
//   }
// }
//
// Response (success):
// {
//   "success": true,
//   "results": [
//     { "id": "clientAuth", "fn": "createJwtAssertion", "success": true, "outputs": {...} },
//     { "id": "exchange", "fn": "tokenExchange", "success": true, "outputs": {...}, "curl": "..." }
//   ],
//   "stateUpdates": {
//     "newToken": "eyJ..."
//   }
// }
//
// Response (partial failure):
// {
//   "success": false,
//   "error": "Token Exchange Error: invalid_client",
//   "failedAt": 1,
//   "failedStep": "exchange",
//   "results": [
//     { "id": "clientAuth", "fn": "createJwtAssertion", "success": true, "outputs": {...} },
//     { "id": "exchange", "fn": "tokenExchange", "success": false, "error": "..." }
//   ]
// }

router.post('/chain', async (req, res) => {
  try {
    const { chain, context } = req.body;

    if (!chain || !Array.isArray(chain)) {
      return res.status(400).json({
        success: false,
        error: 'Request body must include "chain" array'
      });
    }

    // Validate all functions exist before executing
    for (let i = 0; i < chain.length; i++) {
      const step = chain[i];
      if (!step.fn) {
        return res.status(400).json({
          success: false,
          error: `Chain step ${i} missing "fn" (function ID)`
        });
      }
      const fn = getFunction(step.fn);
      if (!fn) {
        return res.status(400).json({
          success: false,
          error: `Unknown function "${step.fn}" in chain step ${i}`,
          available: listFunctions().map(f => f.id)
        });
      }
    }

    // Execute the chain
    const result = await executeChain(chain, context || {});

    // Return result with appropriate status
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Chain execution failed',
      message: err.message
    });
  }
});

export default router;
