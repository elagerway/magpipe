/**
 * Access Code Settings Component
 * Manage phone admin access code
 */

import { requestChange, verifyChange, hasAccessCode, isLocked } from '../services/accessCodeService.js';
import { showToast } from '../lib/toast.js';

/**
 * Create access code settings component
 * @param {HTMLElement} container - Container element
 * @returns {object} Component API
 */
export function createAccessCodeSettings(container) {
  // Component state
  let accessCodeSet = false;
  let accountLocked = false;
  let isChanging = false;
  let confirmationId = null;
  let attemptingVerify = false;
  let newCodeValue = '';

  // Create elements
  const settingsContainer = document.createElement('div');
  settingsContainer.className = 'access-code-settings';

  // Title
  const title = document.createElement('h3');
  title.textContent = 'Phone Admin Access';
  settingsContainer.appendChild(title);

  // Description
  const description = document.createElement('p');
  description.className = 'settings-description';
  description.textContent = 'Set up an access code to manage your assistant by calling your service number.';
  settingsContainer.appendChild(description);

  // Status container
  const statusContainer = document.createElement('div');
  statusContainer.className = 'status-container';
  settingsContainer.appendChild(statusContainer);

  // Form container
  const formContainer = document.createElement('div');
  formContainer.className = 'form-container';
  settingsContainer.appendChild(formContainer);

  // Append to container
  container.appendChild(settingsContainer);

  // Load initial state
  loadStatus();

  /**
   * Load access code status
   */
  async function loadStatus() {
    try {
      // Check if access code is set
      accessCodeSet = await hasAccessCode();

      // Check if account is locked
      const lockStatus = await isLocked();
      accountLocked = lockStatus.isLocked;

      renderStatus();

    } catch (error) {
      console.error('Load status error:', error);
      showToast('Failed to load access code status', 'error');
    }
  }

  /**
   * Render status display
   */
  function renderStatus() {
    statusContainer.innerHTML = '';

    if (accountLocked) {
      const lockWarning = document.createElement('div');
      lockWarning.className = 'lock-warning';
      lockWarning.innerHTML = `
        <strong>⚠️ Account Locked</strong>
        <p>Your phone admin access is currently locked due to too many failed attempts. Change your access code to unlock.</p>
      `;
      statusContainer.appendChild(lockWarning);
    }

    if (accessCodeSet) {
      const statusDisplay = document.createElement('div');
      statusDisplay.className = 'status-display';

      const codeDisplay = document.createElement('div');
      codeDisplay.className = 'code-display';
      codeDisplay.innerHTML = `
        <span class="code-label">Access Code:</span>
        <span class="code-value">••••</span>
      `;
      statusDisplay.appendChild(codeDisplay);

      const changeButton = document.createElement('button');
      changeButton.className = 'btn-change-code';
      changeButton.textContent = accountLocked ? 'Reset Access Code' : 'Change Access Code';
      changeButton.addEventListener('click', showChangeForm);
      statusDisplay.appendChild(changeButton);

      statusContainer.appendChild(statusDisplay);

    } else {
      const setupPrompt = document.createElement('div');
      setupPrompt.className = 'setup-prompt';
      setupPrompt.innerHTML = `
        <p>No access code set. Set one up to manage your assistant via phone.</p>
      `;

      const setupButton = document.createElement('button');
      setupButton.className = 'btn-setup-code';
      setupButton.textContent = 'Set Up Access Code';
      setupButton.addEventListener('click', showChangeForm);
      setupPrompt.appendChild(setupButton);

      statusContainer.appendChild(setupPrompt);
    }
  }

  /**
   * Show change/setup form
   */
  function showChangeForm() {
    isChanging = true;
    formContainer.innerHTML = '';

    const form = document.createElement('form');
    form.className = 'change-code-form';

    const formTitle = document.createElement('h4');
    formTitle.textContent = accessCodeSet ? 'Change Access Code' : 'Set Up Access Code';
    form.appendChild(formTitle);

    // New code input
    const codeLabel = document.createElement('label');
    codeLabel.textContent = 'New Access Code (4-20 characters):';

    const codeInput = document.createElement('input');
    codeInput.type = 'text';
    codeInput.name = 'new_code';
    codeInput.placeholder = '1234';
    codeInput.minLength = 4;
    codeInput.maxLength = 20;
    codeInput.required = true;
    codeInput.autocomplete = 'off';

    codeLabel.appendChild(codeInput);
    form.appendChild(codeLabel);

    // Hint
    const hint = document.createElement('p');
    hint.className = 'input-hint';
    hint.textContent = 'This code will be required when calling your service number for admin access.';
    form.appendChild(hint);

    // Buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'button-container';

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'btn-submit';
    submitBtn.textContent = 'Send Confirmation';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', cancelChange);

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(submitBtn);
    form.appendChild(buttonContainer);

    // Form submit handler
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const newCode = codeInput.value.trim();

      if (newCode.length < 4 || newCode.length > 20) {
        showToast('Access code must be 4-20 characters', 'error');
        return;
      }

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';

        newCodeValue = newCode; // Store for later
        const result = await requestChange(newCode);

        confirmationId = result.confirmationId;

        // Show verification form
        showVerificationForm(result);

      } catch (error) {
        console.error('Request change error:', error);
        showToast(error.message || 'Failed to send confirmation code', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Confirmation';
      }
    });

    formContainer.appendChild(form);

    // Focus input
    codeInput.focus();
  }

  /**
   * Show verification form (after SMS sent)
   */
  function showVerificationForm(requestResult) {
    formContainer.innerHTML = '';

    const verifyForm = document.createElement('form');
    verifyForm.className = 'verify-code-form';

    const title = document.createElement('h4');
    title.textContent = 'Verify Access Code';
    verifyForm.appendChild(title);

    const instructions = document.createElement('p');
    instructions.className = 'verify-instructions';
    instructions.textContent = 'Check your phone for a 6-digit confirmation code.';
    verifyForm.appendChild(instructions);

    // Show dev code in development
    if (requestResult.devCode) {
      const devCodeDisplay = document.createElement('div');
      devCodeDisplay.className = 'dev-code-display';
      devCodeDisplay.textContent = `Development Code: ${requestResult.devCode}`;
      verifyForm.appendChild(devCodeDisplay);
    }

    // Confirmation code input
    const codeLabel = document.createElement('label');
    codeLabel.textContent = 'Confirmation Code:';

    const codeInput = document.createElement('input');
    codeInput.type = 'text';
    codeInput.name = 'confirmation_code';
    codeInput.placeholder = '123456';
    codeInput.maxLength = 6;
    codeInput.pattern = '[0-9]{6}';
    codeInput.required = true;
    codeInput.autocomplete = 'off';
    codeInput.inputMode = 'numeric';

    codeLabel.appendChild(codeInput);
    verifyForm.appendChild(codeLabel);

    // Attempts message
    const attemptsMsg = document.createElement('p');
    attemptsMsg.className = 'attempts-message';
    attemptsMsg.id = 'attempts-message';
    attemptsMsg.textContent = 'You have 3 attempts.';
    verifyForm.appendChild(attemptsMsg);

    // Buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'button-container';

    const verifyBtn = document.createElement('button');
    verifyBtn.type = 'submit';
    verifyBtn.className = 'btn-submit';
    verifyBtn.textContent = 'Verify';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', cancelChange);

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(verifyBtn);
    verifyForm.appendChild(buttonContainer);

    // Form submit handler
    verifyForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const confirmCode = codeInput.value.trim();

      if (!/^[0-9]{6}$/.test(confirmCode)) {
        showToast('Confirmation code must be 6 digits', 'error');
        return;
      }

      try {
        verifyBtn.disabled = true;
        verifyBtn.textContent = 'Verifying...';
        attemptingVerify = true;

        const result = await verifyChange(confirmCode);

        // Success!
        showToast(result.message, 'success');

        // Reset state
        isChanging = false;
        confirmationId = null;
        attemptingVerify = false;
        formContainer.innerHTML = '';

        // Reload status
        await loadStatus();

      } catch (error) {
        console.error('Verify change error:', error);

        // Parse error for attempts remaining
        if (error.message.includes('Invalid confirmation code')) {
          // Extract attempts remaining if present
          const match = error.message.match(/(\d+)\s+attempt/);
          if (match) {
            const remaining = parseInt(match[1]);
            attemptsMsg.textContent = `Invalid code. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} remaining.`;
            attemptsMsg.style.color = '#ef4444';
          } else {
            showToast('Invalid confirmation code. Please try again.', 'error');
          }
        } else if (error.message.includes('Too many')) {
          showToast('Too many failed attempts. Please request a new code.', 'error');
          cancelChange();
        } else {
          showToast(error.message || 'Verification failed', 'error');
        }

        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify';
        attemptingVerify = false;

        // Clear input
        codeInput.value = '';
        codeInput.focus();
      }
    });

    formContainer.appendChild(verifyForm);

    // Focus input
    codeInput.focus();
  }

  /**
   * Cancel change process
   */
  function cancelChange() {
    isChanging = false;
    confirmationId = null;
    attemptingVerify = false;
    newCodeValue = '';
    formContainer.innerHTML = '';
  }

  // Public API
  return {
    destroy: () => {
      settingsContainer.remove();
    },
    refresh: () => {
      loadStatus();
    },
  };
}

/**
 * Add CSS styles for access code settings
 */
export function addAccessCodeSettingsStyles() {
  if (document.getElementById('access-code-settings-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'access-code-settings-styles';
  style.textContent = `
    .access-code-settings {
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }

    .access-code-settings h3 {
      margin: 0 0 8px 0;
      font-size: 20px;
      font-weight: 600;
    }

    .settings-description {
      color: #6b7280;
      margin-bottom: 24px;
    }

    .lock-warning {
      background: #fee;
      border: 2px solid #ef4444;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 20px;
    }

    .lock-warning strong {
      color: #c00;
      display: block;
      margin-bottom: 8px;
    }

    .lock-warning p {
      color: #374151;
      margin: 0;
    }

    .status-display {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
    }

    .code-display {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }

    .code-label {
      font-weight: 600;
      color: #374151;
    }

    .code-value {
      font-family: monospace;
      font-size: 18px;
      letter-spacing: 4px;
      color: #6b7280;
    }

    .btn-change-code,
    .btn-setup-code {
      padding: 10px 20px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-change-code:hover,
    .btn-setup-code:hover {
      background: #2563eb;
    }

    .setup-prompt {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }

    .setup-prompt p {
      color: #6b7280;
      margin-bottom: 16px;
    }

    .change-code-form,
    .verify-code-form {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 24px;
      margin-top: 20px;
    }

    .change-code-form h4,
    .verify-code-form h4 {
      margin: 0 0 20px 0;
      font-size: 18px;
    }

    .change-code-form label,
    .verify-code-form label {
      display: block;
      margin-bottom: 16px;
      font-weight: 500;
    }

    .change-code-form input,
    .verify-code-form input {
      width: 100%;
      padding: 12px 16px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 16px;
      margin-top: 4px;
    }

    .change-code-form input:focus,
    .verify-code-form input:focus {
      outline: none;
      border-color: #3b82f6;
    }

    .input-hint,
    .verify-instructions {
      color: #6b7280;
      font-size: 14px;
      margin: 8px 0 16px 0;
    }

    .dev-code-display {
      background: #fef3c7;
      border: 1px solid #f59e0b;
      border-radius: 6px;
      padding: 12px;
      margin: 12px 0;
      font-family: monospace;
      text-align: center;
      color: #92400e;
    }

    .attempts-message {
      font-size: 14px;
      color: #6b7280;
      margin: 8px 0 16px 0;
    }

    .button-container {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 20px;
    }

    .button-container button {
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-submit {
      background: #3b82f6;
      color: white;
    }

    .btn-submit:hover:not(:disabled) {
      background: #2563eb;
    }

    .btn-cancel {
      background: #e5e7eb;
      color: #374151;
    }

    .btn-cancel:hover {
      background: #d1d5db;
    }

    .button-container button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Mobile responsive */
    @media (max-width: 768px) {
      .access-code-settings {
        padding: 12px;
      }

      .change-code-form,
      .verify-code-form {
        padding: 16px;
      }

      .button-container {
        flex-direction: column-reverse;
      }

      .button-container button {
        width: 100%;
      }
    }
  `;

  document.head.appendChild(style);
}
