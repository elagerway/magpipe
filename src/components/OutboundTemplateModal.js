/**
 * OutboundTemplateModal Component
 * Modal for selecting call purpose/goal before making outbound calls
 */

import { OutboundTemplate } from '../models/OutboundTemplate.js';
import { getCurrentUser } from '../lib/supabase.js';

/**
 * Create and show the outbound template modal
 * @param {string} phoneNumber - The number being called (for display)
 * @param {Function} onConfirm - Callback with {purpose, goal, templateId?}
 * @param {Function} onCancel - Callback when user cancels
 * @returns {HTMLElement} The modal element
 */
export function createOutboundTemplateModal(phoneNumber, onConfirm, onCancel) {
  // Remove any existing modal
  const existing = document.getElementById('outbound-template-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'outbound-template-modal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-content" style="max-width: 500px;">
      <div class="modal-mobile-header">
        <button type="button" class="back-btn" id="template-modal-back">
          <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>
        <span>Call Purpose</span>
      </div>

      <div class="desktop-only" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h3 style="margin: 0;">Call Purpose</h3>
        <button type="button" class="close-btn" id="template-modal-close" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-secondary);">&times;</button>
      </div>

      <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">
        Calling: <strong>${formatPhoneNumber(phoneNumber)}</strong>
      </p>

      <div id="templates-section">
        <div id="templates-loading" style="text-align: center; padding: 2rem;">
          <div class="spinner"></div>
          <p style="color: var(--text-secondary); margin-top: 0.5rem;">Loading templates...</p>
        </div>
        <div id="templates-list" class="hidden"></div>
      </div>

      <div style="display: flex; align-items: center; margin: 1.5rem 0; gap: 1rem;">
        <div style="flex: 1; height: 1px; background: var(--border-color);"></div>
        <span style="color: var(--text-muted); font-size: 0.875rem;">or enter details</span>
        <div style="flex: 1; height: 1px; background: var(--border-color);"></div>
      </div>

      <div id="adhoc-section">
        <div class="form-group">
          <label class="form-label" for="adhoc-purpose">Purpose</label>
          <input
            type="text"
            id="adhoc-purpose"
            class="form-input"
            placeholder="Why are you calling? (e.g., follow up on inquiry)"
          />
          <p class="form-help">Brief description of why you're making this call</p>
        </div>

        <div class="form-group">
          <label class="form-label" for="adhoc-goal">Goal</label>
          <input
            type="text"
            id="adhoc-goal"
            class="form-input"
            placeholder="Desired outcome (e.g., schedule appointment)"
          />
          <p class="form-help">What do you want to achieve from this call?</p>
        </div>

        <div class="form-group" style="display: flex; align-items: center; gap: 0.5rem;">
          <input type="checkbox" id="save-as-template" style="width: auto;">
          <label for="save-as-template" style="margin: 0; font-size: 0.875rem; color: var(--text-secondary);">
            Save as template for future calls
          </label>
        </div>

        <div id="template-name-group" class="form-group hidden">
          <label class="form-label" for="template-name">Template Name</label>
          <input
            type="text"
            id="template-name"
            class="form-input"
            placeholder="e.g., Sales Follow-up"
          />
        </div>
      </div>

      <div style="display: flex; gap: 0.75rem; margin-top: 1.5rem;">
        <button type="button" class="btn btn-secondary" id="template-cancel-btn" style="flex: 1;">
          Cancel
        </button>
        <button type="button" class="btn btn-primary" id="template-confirm-btn" style="flex: 1;">
          Start Call
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // State
  let selectedTemplateId = null;
  let templates = [];

  // Load templates
  loadTemplates();

  // Event listeners
  const backdrop = modal.querySelector('.modal-backdrop');
  const closeBtn = modal.querySelector('#template-modal-close');
  const backBtn = modal.querySelector('#template-modal-back');
  const cancelBtn = modal.querySelector('#template-cancel-btn');
  const confirmBtn = modal.querySelector('#template-confirm-btn');
  const saveCheckbox = modal.querySelector('#save-as-template');
  const templateNameGroup = modal.querySelector('#template-name-group');
  const adhocPurpose = modal.querySelector('#adhoc-purpose');
  const adhocGoal = modal.querySelector('#adhoc-goal');

  const closeModal = () => {
    modal.remove();
    if (onCancel) onCancel();
  };

  backdrop.addEventListener('click', closeModal);
  closeBtn?.addEventListener('click', closeModal);
  backBtn?.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  // Show/hide template name field based on checkbox
  saveCheckbox.addEventListener('change', () => {
    templateNameGroup.classList.toggle('hidden', !saveCheckbox.checked);
  });

  // Clear template selection when typing in ad-hoc fields
  adhocPurpose.addEventListener('input', () => {
    if (adhocPurpose.value.trim()) {
      clearTemplateSelection();
    }
  });
  adhocGoal.addEventListener('input', () => {
    if (adhocGoal.value.trim()) {
      clearTemplateSelection();
    }
  });

  // Confirm button
  confirmBtn.addEventListener('click', async () => {
    let purpose, goal, templateId = null;

    if (selectedTemplateId) {
      // Using a template
      const template = templates.find(t => t.id === selectedTemplateId);
      if (template) {
        purpose = template.purpose;
        goal = template.goal;
        templateId = template.id;
      }
    } else {
      // Using ad-hoc values
      purpose = adhocPurpose.value.trim();
      goal = adhocGoal.value.trim();

      if (!purpose || !goal) {
        alert('Please enter both purpose and goal, or select a template.');
        return;
      }

      // Save as template if checked
      if (saveCheckbox.checked) {
        const templateName = modal.querySelector('#template-name').value.trim();
        if (!templateName) {
          alert('Please enter a name for the template.');
          return;
        }

        const { user } = await getCurrentUser();
        if (user) {
          const { template, error } = await OutboundTemplate.create(user.id, {
            name: templateName,
            purpose,
            goal
          });
          if (error) {
            console.error('Failed to save template:', error);
          } else {
            templateId = template.id;
          }
        }
      }
    }

    modal.remove();
    if (onConfirm) {
      onConfirm({ purpose, goal, templateId });
    }
  });

  async function loadTemplates() {
    const loadingEl = modal.querySelector('#templates-loading');
    const listEl = modal.querySelector('#templates-list');

    try {
      const { user } = await getCurrentUser();
      if (!user) {
        loadingEl.classList.add('hidden');
        return;
      }

      const { templates: userTemplates, error } = await OutboundTemplate.list(user.id);

      loadingEl.classList.add('hidden');

      if (error || !userTemplates || userTemplates.length === 0) {
        // No templates - just show the ad-hoc section
        return;
      }

      templates = userTemplates;
      listEl.classList.remove('hidden');
      renderTemplates();
    } catch (err) {
      console.error('Error loading templates:', err);
      loadingEl.classList.add('hidden');
    }
  }

  function renderTemplates() {
    const listEl = modal.querySelector('#templates-list');

    listEl.innerHTML = `
      <label class="form-label" style="margin-bottom: 0.75rem;">My Templates</label>
      <div style="display: flex; flex-direction: column; gap: 0.5rem; max-height: 200px; overflow-y: auto;">
        ${templates.map(t => `
          <label class="template-option" data-id="${t.id}" style="
            display: flex;
            align-items: flex-start;
            gap: 0.75rem;
            padding: 0.75rem;
            border: 2px solid var(--border-color);
            border-radius: var(--radius-md);
            cursor: pointer;
            transition: all 0.2s;
          ">
            <input type="radio" name="template" value="${t.id}" style="margin-top: 0.25rem;" ${t.is_default ? 'checked' : ''}>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 500; color: var(--text-primary);">
                ${escapeHtml(t.name)}
                ${t.is_default ? '<span style="font-size: 0.75rem; color: var(--primary-color); margin-left: 0.5rem;">(default)</span>' : ''}
              </div>
              <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">
                ${escapeHtml(t.purpose)} &rarr; ${escapeHtml(t.goal)}
              </div>
            </div>
          </label>
        `).join('')}
      </div>
    `;

    // Add click handlers for templates
    listEl.querySelectorAll('.template-option').forEach(option => {
      option.addEventListener('click', () => {
        const templateId = option.dataset.id;
        selectTemplate(templateId);
      });
    });

    // Pre-select default template if exists
    const defaultTemplate = templates.find(t => t.is_default);
    if (defaultTemplate) {
      selectTemplate(defaultTemplate.id);
    }
  }

  function selectTemplate(templateId) {
    selectedTemplateId = templateId;

    // Update radio buttons
    modal.querySelectorAll('input[name="template"]').forEach(radio => {
      radio.checked = radio.value === templateId;
    });

    // Update option styling
    modal.querySelectorAll('.template-option').forEach(option => {
      if (option.dataset.id === templateId) {
        option.style.borderColor = 'var(--primary-color)';
        option.style.background = 'var(--primary-color-light, #EEF2FF)';
      } else {
        option.style.borderColor = 'var(--border-color)';
        option.style.background = 'transparent';
      }
    });

    // Clear ad-hoc fields
    adhocPurpose.value = '';
    adhocGoal.value = '';
    saveCheckbox.checked = false;
    templateNameGroup.classList.add('hidden');
  }

  function clearTemplateSelection() {
    selectedTemplateId = null;
    modal.querySelectorAll('input[name="template"]').forEach(radio => {
      radio.checked = false;
    });
    modal.querySelectorAll('.template-option').forEach(option => {
      option.style.borderColor = 'var(--border-color)';
      option.style.background = 'transparent';
    });
  }

  return modal;
}

/**
 * Show the template modal and return a promise
 * @param {string} phoneNumber - The number being called
 * @returns {Promise<{purpose: string, goal: string, templateId?: string}|null>}
 */
export function showOutboundTemplateModal(phoneNumber) {
  return new Promise((resolve) => {
    createOutboundTemplateModal(
      phoneNumber,
      (data) => resolve(data),
      () => resolve(null)
    );
  });
}

// Helper functions
function formatPhoneNumber(phone) {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  } else if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Add component styles
const style = document.createElement('style');
style.textContent = `
  #outbound-template-modal .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid var(--border-color);
    border-top-color: var(--primary-color);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  #outbound-template-modal .template-option:hover {
    border-color: var(--primary-color) !important;
  }

  @media (max-width: 768px) {
    #outbound-template-modal .desktop-only {
      display: none !important;
    }

    #outbound-template-modal .modal-content {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      max-width: none;
      border-radius: 0;
      overflow-y: auto;
    }

    #outbound-template-modal .modal-mobile-header {
      display: flex !important;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      border-bottom: 1px solid var(--border-color);
      background: var(--bg-primary);
      position: sticky;
      top: 0;
      z-index: 10;
    }

    #outbound-template-modal .modal-mobile-header .back-btn {
      background: none;
      border: none;
      padding: 0;
      cursor: pointer;
      color: var(--primary-color);
    }
  }

  @media (min-width: 769px) {
    #outbound-template-modal .modal-mobile-header {
      display: none !important;
    }
  }
`;

if (!document.getElementById('outbound-template-modal-styles')) {
  style.id = 'outbound-template-modal-styles';
  document.head.appendChild(style);
}
