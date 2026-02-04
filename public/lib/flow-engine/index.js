/**
 * Flow Engine - Shared utilities for OAuth flow applications
 *
 * This module provides reusable components for building OAuth flow simulators:
 * - DialogManager: Promise-based modal dialogs
 * - ConfigManager: Configuration persistence (localStorage + server)
 * - StepController: Step UI state management
 * - CurlGenerator: cURL command formatting and display
 * - TokenDisplay: Token decoding, display, and copy
 * - ScopeSelector: OAuth scope selection UI
 * - AuthServerPicker: Authorization server selection
 * - FlowRenderer: Generate HTML from JSON flow definitions
 * - FlowEngine: Runtime engine for JSON-driven flows
 * - ExpressionAutocomplete: Autocomplete for template expressions ({{variable}})
 *
 * Usage:
 *   import {
 *     DialogManager,
 *     ConfigManager,
 *     StepController,
 *     formatCurl,
 *     TokenDisplay,
 *     ScopeSelector,
 *     AuthServerPicker,
 *     FlowEngine,
 *     initFlow
 *   } from './lib/flow-engine/index.js';
 */

// Dialog utilities
export { DialogManager, createDialogFunctions } from './DialogManager.js';

// Configuration management
export { ConfigManager, createConfigFunctions } from './ConfigManager.js';

// Step UI management
export { StepController, createStepFunctions } from './StepController.js';

// cURL utilities
export {
  escapeHtml,
  escapeAttr,
  formatCurl,
  showActualCurl,
  clearActualCurl,
  buildCurl,
  interpolateCurlTemplate
} from './CurlGenerator.js';

// Token display utilities
export {
  TokenDisplay,
  formatJson,
  decodeTokenForDisplay,
  decodeJwt,
  buildTokenCopyButtons,
  createTokenTabs
} from './TokenDisplay.js';

// Scope selector
export { ScopeSelector, createScopeSelectorFunctions } from './ScopeSelector.js';

// Auth server picker
export {
  AuthServerPicker,
  StepAuthServerPicker,
  createAuthServerPickerFunctions,
  setupOktaDomainAutoCorrect
} from './AuthServerPicker.js';

// Flow renderer (HTML generation from JSON)
export { FlowRenderer, renderFlow } from './FlowRenderer.js';

// Flow engine (runtime for JSON-driven flows)
export { FlowEngine, initFlow } from './FlowEngine.js';

// Expression autocomplete for template fields
export { ExpressionAutocomplete } from './ExpressionAutocomplete.js';

// Settings picker (centralized org/app/agent selection)
export { SettingsPicker, createSettingsPicker } from './SettingsPicker.js';
