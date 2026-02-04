/**
 * DialogManager - Shared dialog utility for flow applications
 *
 * Provides promise-based dialog functions that replace native alert/prompt/confirm
 * with styled modal dialogs.
 *
 * Usage:
 *   import { DialogManager } from './lib/flow-engine/DialogManager.js';
 *   const dialog = new DialogManager('dialog-modal');
 *   await dialog.alert('Hello!');
 *   const name = await dialog.prompt('Enter name:');
 *   const confirmed = await dialog.confirm('Delete?');
 */

export class DialogManager {
  /**
   * @param {string} modalId - ID of the dialog modal element
   * @param {object} options - Configuration options
   * @param {string} options.titleId - ID of title element (default: 'dialog-title')
   * @param {string} options.messageId - ID of message element (default: 'dialog-message')
   * @param {string} options.inputId - ID of input element (default: 'dialog-input')
   * @param {string} options.okBtnId - ID of OK button (default: 'dialog-ok')
   * @param {string} options.cancelBtnId - ID of cancel button (default: 'dialog-cancel')
   */
  constructor(modalId, options = {}) {
    this.modalId = modalId;
    this.titleId = options.titleId || 'dialog-title';
    this.messageId = options.messageId || 'dialog-message';
    this.inputId = options.inputId || 'dialog-input';
    this.okBtnId = options.okBtnId || 'dialog-ok';
    this.cancelBtnId = options.cancelBtnId || 'dialog-cancel';
  }

  /**
   * Get DOM elements for the dialog
   * @private
   */
  _getElements() {
    return {
      overlay: document.getElementById(this.modalId),
      title: document.getElementById(this.titleId),
      message: document.getElementById(this.messageId),
      input: document.getElementById(this.inputId),
      okBtn: document.getElementById(this.okBtnId),
      cancelBtn: document.getElementById(this.cancelBtnId),
    };
  }

  /**
   * Show a dialog with configurable options
   * @param {object} options - Dialog options
   * @param {string} options.title - Dialog title
   * @param {string} options.message - Dialog message
   * @param {boolean} options.input - Show input field
   * @param {string} options.defaultValue - Default input value
   * @param {boolean} options.showCancel - Show cancel button
   * @returns {Promise<string|boolean|null>} - Input value, true, or null if cancelled
   */
  show({ title, message, input, defaultValue, showCancel }) {
    return new Promise((resolve) => {
      const els = this._getElements();

      if (!els.overlay) {
        console.warn('DialogManager: Modal element not found:', this.modalId);
        resolve(input ? null : true);
        return;
      }

      els.title.textContent = title || 'Message';
      els.message.textContent = message || '';
      els.input.hidden = !input;
      els.input.value = defaultValue || '';
      els.cancelBtn.hidden = !showCancel;
      els.overlay.hidden = false;

      if (input) els.input.focus();

      const cleanup = () => {
        els.overlay.hidden = true;
        els.okBtn.removeEventListener('click', onOk);
        els.cancelBtn.removeEventListener('click', onCancel);
        els.overlay.removeEventListener('click', onOverlay);
        els.input.removeEventListener('keydown', onKey);
      };

      const onOk = () => {
        cleanup();
        resolve(input ? els.input.value : true);
      };

      const onCancel = () => {
        cleanup();
        resolve(input ? null : false);
      };

      const onOverlay = (e) => {
        if (e.target === els.overlay) onCancel();
      };

      const onKey = (e) => {
        if (e.key === 'Enter') onOk();
        if (e.key === 'Escape') onCancel();
      };

      els.okBtn.addEventListener('click', onOk);
      els.cancelBtn.addEventListener('click', onCancel);
      els.overlay.addEventListener('click', onOverlay);
      if (input) els.input.addEventListener('keydown', onKey);
    });
  }

  /**
   * Show an alert dialog (OK button only)
   * @param {string} message - Message to display
   * @param {string} title - Dialog title (default: 'Notice')
   * @returns {Promise<true>}
   */
  alert(message, title = 'Notice') {
    return this.show({ title, message });
  }

  /**
   * Show a prompt dialog with input field
   * @param {string} message - Message/prompt text
   * @param {string} defaultValue - Default input value
   * @param {string} title - Dialog title (default: 'Input')
   * @returns {Promise<string|null>} - Input value or null if cancelled
   */
  prompt(message, defaultValue = '', title = 'Input') {
    return this.show({ title, message, input: true, defaultValue, showCancel: true });
  }

  /**
   * Show a confirmation dialog (OK/Cancel)
   * @param {string} message - Message to display
   * @param {string} title - Dialog title (default: 'Confirm')
   * @returns {Promise<boolean>} - true if confirmed, false if cancelled
   */
  confirm(message, title = 'Confirm') {
    return this.show({ title, message, showCancel: true });
  }
}

/**
 * Create standalone dialog functions bound to a specific modal
 * @param {string} modalId - ID of the dialog modal element
 * @param {object} options - Configuration options (same as DialogManager constructor)
 * @returns {object} - Object with showDialog, dialogAlert, dialogPrompt, dialogConfirm functions
 */
export function createDialogFunctions(modalId, options = {}) {
  const manager = new DialogManager(modalId, options);

  return {
    showDialog: (opts) => manager.show(opts),
    dialogAlert: (message, title) => manager.alert(message, title),
    dialogPrompt: (message, defaultValue, title) => manager.prompt(message, defaultValue, title),
    dialogConfirm: (message, title) => manager.confirm(message, title),
  };
}

// Default export for simple usage
export default DialogManager;
