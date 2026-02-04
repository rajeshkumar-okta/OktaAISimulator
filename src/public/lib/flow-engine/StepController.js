/**
 * StepController - Shared step UI management for flow applications
 *
 * Manages step states (locked, unlocked, loading, completed, error)
 * and provides utilities for updating step UI.
 *
 * Usage:
 *   import { StepController } from './lib/flow-engine/StepController.js';
 *   const steps = new StepController({ stepPrefix: 'step-', buttonPrefix: 'btn-step-' });
 *   steps.lock(2);
 *   steps.unlock(2);
 *   steps.showLoading(2);
 *   steps.complete(2);
 *   steps.error(2, 'Something went wrong');
 */

import { escapeHtml } from './CurlGenerator.js';

export class StepController {
  /**
   * @param {object} options - Configuration options
   * @param {string} options.stepPrefix - Prefix for step element IDs (default: 'step-')
   * @param {string} options.buttonPrefix - Prefix for button element IDs (default: 'btn-step-')
   * @param {string} options.resultPrefix - Prefix for result element IDs (default: 'result-')
   * @param {number} options.totalSteps - Total number of steps in the flow
   */
  constructor(options = {}) {
    this.stepPrefix = options.stepPrefix || 'step-';
    this.buttonPrefix = options.buttonPrefix || 'btn-step-';
    this.resultPrefix = options.resultPrefix || 'result-';
    this.totalSteps = options.totalSteps || 4;
  }

  /**
   * Get step element by number
   * @param {number} step - Step number
   * @returns {HTMLElement|null}
   */
  getStepElement(step) {
    return document.getElementById(`${this.stepPrefix}${step}`);
  }

  /**
   * Get button element by step number
   * @param {number} step - Step number
   * @returns {HTMLElement|null}
   */
  getButtonElement(step) {
    return document.getElementById(`${this.buttonPrefix}${step}`);
  }

  /**
   * Get result element by step number
   * @param {number} step - Step number
   * @returns {HTMLElement|null}
   */
  getResultElement(step) {
    return document.getElementById(`${this.resultPrefix}${step}`);
  }

  /**
   * Lock a step (disable interaction)
   * @param {number} step - Step number
   */
  lock(step) {
    const stepEl = this.getStepElement(step);
    const btn = this.getButtonElement(step);

    if (stepEl) {
      stepEl.classList.add('locked');
      stepEl.classList.remove('completed', 'error');
    }
    if (btn) {
      btn.disabled = true;
    }
  }

  /**
   * Unlock a step (enable interaction)
   * @param {number} step - Step number
   */
  unlock(step) {
    const stepEl = this.getStepElement(step);
    const btn = this.getButtonElement(step);

    if (stepEl) {
      stepEl.classList.remove('locked');
    }
    if (btn) {
      btn.disabled = false;
    }
  }

  /**
   * Set step to loading state
   * @param {number} step - Step number
   * @param {boolean} loading - Whether step is loading
   */
  setLoading(step, loading) {
    const btn = this.getButtonElement(step);
    if (btn) {
      btn.disabled = loading;
    }
  }

  /**
   * Show loading indicator in step result area
   * @param {number} step - Step number
   * @param {string} message - Loading message (default: 'Processing...')
   */
  showLoading(step, message = 'Processing...') {
    const resultEl = this.getResultElement(step);
    if (resultEl) {
      resultEl.innerHTML = `<div class="loading">${escapeHtml(message)}</div>`;
      resultEl.classList.add('visible');
    }
  }

  /**
   * Mark step as completed
   * @param {number} step - Step number
   */
  complete(step) {
    const stepEl = this.getStepElement(step);
    if (stepEl) {
      stepEl.classList.remove('locked', 'error');
      stepEl.classList.add('completed');
    }
  }

  /**
   * Mark step as error
   * @param {number} step - Step number
   * @param {string} message - Error message
   * @param {string} logTimestamp - Optional log timestamp for linking to log viewer
   */
  error(step, message, logTimestamp) {
    const stepEl = this.getStepElement(step);
    const resultEl = this.getResultElement(step);

    if (stepEl) {
      stepEl.classList.remove('completed');
      stepEl.classList.add('error');
    }

    if (resultEl) {
      const logLink = logTimestamp
        ? ` <a class="log-link" href="/log-viewer.html#${encodeURIComponent(logTimestamp)}" target="_blank">view log</a>`
        : ` <a class="log-link" href="/log-viewer.html" target="_blank">view log</a>`;
      resultEl.innerHTML = `<div class="error-box">${escapeHtml(message)}${logLink}</div>`;
      resultEl.classList.add('visible');
    }

    this.setLoading(step, false);
  }

  /**
   * Show result content in step
   * @param {number} step - Step number
   * @param {string} html - HTML content to display
   */
  showResult(step, html) {
    const resultEl = this.getResultElement(step);
    if (resultEl) {
      resultEl.innerHTML = html;
      resultEl.classList.add('visible');
    }
  }

  /**
   * Hide/clear result area
   * @param {number} step - Step number
   */
  hideResult(step) {
    const resultEl = this.getResultElement(step);
    if (resultEl) {
      resultEl.innerHTML = '';
      resultEl.classList.remove('visible');
    }
  }

  /**
   * Reset all steps to initial state
   * @param {number} firstUnlockedStep - First step to leave unlocked (default: 1)
   */
  resetAll(firstUnlockedStep = 1) {
    for (let i = 1; i <= this.totalSteps; i++) {
      const stepEl = this.getStepElement(i);
      const btn = this.getButtonElement(i);

      if (stepEl) {
        stepEl.classList.remove('completed', 'error');
        if (i >= firstUnlockedStep) {
          stepEl.classList.remove('locked');
        } else {
          stepEl.classList.add('locked');
        }
      }

      if (btn) {
        btn.disabled = i > firstUnlockedStep;
      }

      this.hideResult(i);
    }
  }

  /**
   * Unlock the next step after completion
   * @param {number} currentStep - The step that just completed
   */
  unlockNext(currentStep) {
    if (currentStep < this.totalSteps) {
      this.unlock(currentStep + 1);
    }
  }

  /**
   * Mark step complete and unlock next
   * @param {number} step - Step number
   */
  completeAndUnlockNext(step) {
    this.complete(step);
    this.unlockNext(step);
  }
}

/**
 * Create standalone step control functions
 * @param {object} options - Same as StepController constructor
 * @returns {object} - Object with step control functions
 */
export function createStepFunctions(options = {}) {
  const controller = new StepController(options);

  return {
    lock: (step) => controller.lock(step),
    unlock: (step) => controller.unlock(step),
    setLoading: (step, loading) => controller.setLoading(step, loading),
    showLoading: (step, message) => controller.showLoading(step, message),
    complete: (step) => controller.complete(step),
    error: (step, message, logTimestamp) => controller.error(step, message, logTimestamp),
    showResult: (step, html) => controller.showResult(step, html),
    hideResult: (step) => controller.hideResult(step),
    resetAll: (firstUnlockedStep) => controller.resetAll(firstUnlockedStep),
    unlockNext: (step) => controller.unlockNext(step),
    completeAndUnlockNext: (step) => controller.completeAndUnlockNext(step),
  };
}

// Default export
export default StepController;
