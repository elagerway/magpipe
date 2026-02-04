/**
 * ConfirmModal Component
 * Reusable confirmation modal that matches the app design
 * Use instead of native confirm() dialogs
 */

/**
 * Show a confirmation modal
 * @param {Object} options
 * @param {string} options.title - Modal title
 * @param {string} options.message - Modal message/description
 * @param {string} [options.confirmText='Confirm'] - Confirm button text
 * @param {string} [options.cancelText='Cancel'] - Cancel button text
 * @param {string} [options.confirmStyle='primary'] - 'primary', 'danger', or 'secondary'
 * @param {string} [options.icon] - Optional icon HTML
 * @returns {Promise<boolean>} - True if confirmed, false if cancelled
 */
export function showConfirmModal({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmStyle = 'primary',
  icon = null
}) {
  return new Promise((resolve) => {
    // Remove any existing modal
    const existing = document.getElementById('confirm-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'confirm-modal';
    modal.className = 'modal';

    // Determine button styles
    const confirmBtnStyle = confirmStyle === 'danger'
      ? 'background: #ef4444; border-color: #ef4444; color: white;'
      : confirmStyle === 'secondary'
        ? ''
        : 'background: var(--primary-color); border-color: var(--primary-color); color: white;';

    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content" style="max-width: 400px;">
        <div class="modal-mobile-header">
          <button type="button" class="back-btn" id="confirm-modal-back">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <span>${escapeHtml(title)}</span>
        </div>

        <div class="desktop-only" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h3 style="margin: 0; display: flex; align-items: center; gap: 0.5rem;">
            ${icon || ''}
            ${escapeHtml(title)}
          </h3>
          <button type="button" class="close-btn" id="confirm-modal-close" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-secondary);">&times;</button>
        </div>

        <p style="color: var(--text-secondary); margin-bottom: 1.5rem; line-height: 1.5;">
          ${escapeHtml(message)}
        </p>

        <div style="display: flex; gap: 0.75rem;">
          <button type="button" class="btn btn-secondary" id="confirm-modal-cancel" style="flex: 1;">
            ${escapeHtml(cancelText)}
          </button>
          <button type="button" class="btn" id="confirm-modal-confirm" style="flex: 1; ${confirmBtnStyle}">
            ${escapeHtml(confirmText)}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Focus trap and keyboard handling
    const confirmBtn = modal.querySelector('#confirm-modal-confirm');
    const cancelBtn = modal.querySelector('#confirm-modal-cancel');
    confirmBtn.focus();

    const closeModal = (result) => {
      modal.remove();
      resolve(result);
    };

    // Event listeners
    modal.querySelector('.modal-backdrop').addEventListener('click', () => closeModal(false));
    modal.querySelector('#confirm-modal-close')?.addEventListener('click', () => closeModal(false));
    modal.querySelector('#confirm-modal-back')?.addEventListener('click', () => closeModal(false));
    cancelBtn.addEventListener('click', () => closeModal(false));
    confirmBtn.addEventListener('click', () => closeModal(true));

    // Keyboard handling
    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal(false);
      } else if (e.key === 'Enter') {
        closeModal(true);
      }
    });
  });
}

/**
 * Show a delete confirmation modal (pre-configured for delete actions)
 * @param {string} itemName - Name of the item being deleted (e.g., "3 conversations")
 * @returns {Promise<boolean>}
 */
export function showDeleteConfirmModal(itemName) {
  return showConfirmModal({
    title: 'Delete',
    message: `Are you sure you want to delete ${itemName}? This action cannot be undone.`,
    confirmText: 'Delete',
    cancelText: 'Cancel',
    confirmStyle: 'danger',
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>`
  });
}

/**
 * Show an alert modal (no cancel option)
 * @param {string} title
 * @param {string} message
 * @param {string} [buttonText='OK']
 * @returns {Promise<void>}
 */
export function showAlertModal(title, message, buttonText = 'OK') {
  return new Promise((resolve) => {
    const existing = document.getElementById('alert-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'alert-modal';
    modal.className = 'modal';

    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content" style="max-width: 400px;">
        <div class="modal-mobile-header">
          <button type="button" class="back-btn" id="alert-modal-back">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <span>${escapeHtml(title)}</span>
        </div>

        <div class="desktop-only" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h3 style="margin: 0;">${escapeHtml(title)}</h3>
          <button type="button" class="close-btn" id="alert-modal-close" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-secondary);">&times;</button>
        </div>

        <p style="color: var(--text-secondary); margin-bottom: 1.5rem; line-height: 1.5;">
          ${escapeHtml(message)}
        </p>

        <button type="button" class="btn btn-primary" id="alert-modal-ok" style="width: 100%;">
          ${escapeHtml(buttonText)}
        </button>
      </div>
    `;

    document.body.appendChild(modal);

    const okBtn = modal.querySelector('#alert-modal-ok');
    okBtn.focus();

    const closeModal = () => {
      modal.remove();
      resolve();
    };

    modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);
    modal.querySelector('#alert-modal-close')?.addEventListener('click', closeModal);
    modal.querySelector('#alert-modal-back')?.addEventListener('click', closeModal);
    okBtn.addEventListener('click', closeModal);

    modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        closeModal();
      }
    });
  });
}

// Helper function
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Add component styles
const style = document.createElement('style');
style.textContent = `
  #confirm-modal .modal-content,
  #alert-modal .modal-content {
    animation: modalSlideIn 0.2s ease-out;
  }

  @keyframes modalSlideIn {
    from {
      opacity: 0;
      transform: scale(0.95) translateY(-10px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  @media (max-width: 768px) {
    #confirm-modal .desktop-only,
    #alert-modal .desktop-only {
      display: none !important;
    }

    #confirm-modal .modal-content,
    #alert-modal .modal-content {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      max-width: none;
      border-radius: 0;
      display: flex;
      flex-direction: column;
    }

    #confirm-modal .modal-content > p,
    #alert-modal .modal-content > p {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 2rem;
    }

    #confirm-modal .modal-content > div:last-child,
    #alert-modal .modal-content > button:last-child {
      padding: 1rem;
      border-top: 1px solid var(--border-color);
    }

    #confirm-modal .modal-mobile-header,
    #alert-modal .modal-mobile-header {
      display: flex !important;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      border-bottom: 1px solid var(--border-color);
      background: var(--bg-primary);
    }

    #confirm-modal .modal-mobile-header .back-btn,
    #alert-modal .modal-mobile-header .back-btn {
      background: none;
      border: none;
      padding: 0;
      cursor: pointer;
      color: var(--primary-color);
    }
  }

  @media (min-width: 769px) {
    #confirm-modal .modal-mobile-header,
    #alert-modal .modal-mobile-header {
      display: none !important;
    }
  }
`;

if (!document.getElementById('confirm-modal-styles')) {
  style.id = 'confirm-modal-styles';
  document.head.appendChild(style);
}
