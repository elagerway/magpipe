/**
 * External SIP Trunk Settings Component
 *
 * Allows users to configure external SIP trunks from providers like Twilio, SignalWire, etc.
 */

import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { showConfirmModal } from './ConfirmModal.js';

const LIVEKIT_SIP_DOMAIN = import.meta.env.VITE_LIVEKIT_SIP_DOMAIN;

const PROVIDER_LABELS = {
  twilio: 'Twilio',
  signalwire: 'SignalWire',
  other: 'Generic SIP'
};

export function addExternalTrunkSettingsStyles() {
  if (document.getElementById('external-trunk-settings-styles')) return;

  const style = document.createElement('style');
  style.id = 'external-trunk-settings-styles';
  style.textContent = `
    .external-trunk-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .external-trunk-card {
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 1rem;
    }

    .external-trunk-card.inactive {
      opacity: 0.6;
    }

    .trunk-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 0.75rem;
    }

    .trunk-title {
      font-weight: 600;
      font-size: 1rem;
    }

    .trunk-provider {
      font-size: 0.875rem;
      color: var(--text-secondary);
    }

    .trunk-status {
      padding: 0.25rem 0.5rem;
      border-radius: 1rem;
      font-size: 0.75rem;
      font-weight: 500;
    }

    .trunk-status.active {
      background: var(--success-color);
      color: white;
    }

    .trunk-status.pending {
      background: var(--warning-color);
      color: white;
    }

    .trunk-status.error {
      background: var(--error-color);
      color: white;
    }

    .trunk-status.disabled {
      background: var(--text-secondary);
      color: white;
    }

    .trunk-details {
      margin-bottom: 0.75rem;
    }

    .trunk-detail-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.875rem;
      padding: 0.25rem 0;
    }

    .trunk-detail-label {
      color: var(--text-secondary);
    }

    .trunk-numbers {
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid var(--border-color);
    }

    .trunk-numbers-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }

    .trunk-numbers-title {
      font-weight: 600;
      font-size: 0.875rem;
    }

    .trunk-number-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem;
      background: var(--bg-secondary);
      border-radius: var(--radius-sm);
      margin-bottom: 0.5rem;
    }

    .trunk-number-info {
      display: flex;
      flex-direction: column;
    }

    .trunk-number-value {
      font-family: var(--font-mono);
      font-size: 0.875rem;
    }

    .trunk-number-name {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .trunk-sip-info {
      margin-top: 0.75rem;
      padding: 0.75rem;
      background: var(--bg-secondary);
      border-radius: var(--radius-sm);
      font-size: 0.875rem;
    }

    .trunk-sip-info-title {
      font-weight: 600;
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
    }

    .trunk-sip-info-title:hover {
      color: var(--primary-color);
    }

    .trunk-sip-info-content {
      display: none;
    }

    .trunk-sip-info-content.expanded {
      display: block;
    }

    .sip-uri-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.25rem 0;
      word-break: break-all;
    }

    .trunk-actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.75rem;
      justify-content: flex-end;
      padding: 5px;
    }

    .add-number-form {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }

    .add-number-form input {
      flex: 1;
    }

    .auth-type-selector {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .auth-type-btn {
      flex: 1;
      padding: 0.75rem;
      border: 2px solid var(--border-color);
      border-radius: var(--radius-md);
      background: transparent;
      cursor: pointer;
      text-align: center;
      transition: all 0.2s;
    }

    .auth-type-btn.selected {
      border-color: var(--primary-color);
      background: var(--primary-color);
      color: white;
    }

    .auth-type-btn:hover:not(.selected) {
      border-color: var(--primary-color);
    }

    .ip-list-input {
      min-height: 80px;
      resize: vertical;
    }
  `;
  document.head.appendChild(style);
}

export function createExternalTrunkSettings(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Initial render
  container.innerHTML = `
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <div>
          <h2 style="margin: 0;">External SIP Trunks</h2>
          <p class="text-muted" style="margin: 0.25rem 0 0 0; font-size: 0.875rem;">Connect your own SIP providers (Twilio, SignalWire, etc.)</p>
        </div>
        <button class="btn btn-primary" id="add-external-trunk-btn">
          Add Trunk
        </button>
      </div>

      <div id="external-trunk-list" class="external-trunk-list">
        <div class="text-muted" style="text-align: center; padding: 2rem;">
          Loading trunks...
        </div>
      </div>
    </div>
  `;

  // Attach event listeners
  document.getElementById('add-external-trunk-btn').addEventListener('click', () => {
    showAddTrunkModal();
  });

  // Load trunks
  loadTrunks();
}

async function loadTrunks() {
  const listContainer = document.getElementById('external-trunk-list');
  if (!listContainer) return;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-external-trunk`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action: 'list' })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to load trunks');

    const trunks = data.trunks || [];

    if (trunks.length === 0) {
      listContainer.innerHTML = `
        <div class="text-muted" style="text-align: center; padding: 2rem;">
          No external SIP trunks configured yet.<br>
          <button class="btn btn-secondary" style="margin-top: 1rem;" onclick="document.getElementById('add-external-trunk-btn').click()">
            Add Your First Trunk
          </button>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = trunks.map(trunk => renderTrunkCard(trunk)).join('');

    // Attach trunk event listeners
    trunks.forEach(trunk => {
      attachTrunkEventListeners(trunk);
    });

  } catch (error) {
    console.error('Error loading trunks:', error);
    listContainer.innerHTML = `
      <div class="text-muted" style="text-align: center; padding: 2rem; color: var(--error-color);">
        Failed to load trunks: ${error.message}
      </div>
    `;
  }
}

function renderTrunkCard(trunk) {
  const numbers = trunk.external_sip_numbers || [];
  const providerLabel = PROVIDER_LABELS[trunk.provider] || trunk.provider || 'Generic SIP';

  return `
    <div class="external-trunk-card ${trunk.is_active ? '' : 'inactive'}" data-trunk-id="${trunk.id}">
      <div class="trunk-header">
        <div>
          <div class="trunk-title">${trunk.name}</div>
          <div class="trunk-provider">Provider: ${providerLabel}</div>
        </div>
        <span class="trunk-status ${trunk.status}">${trunk.status}</span>
      </div>

      <div class="trunk-details">
        <div class="trunk-detail-row">
          <span class="trunk-detail-label">Auth Type:</span>
          <span>${trunk.auth_type === 'ip' ? 'IP Whitelist' : 'Registration'}</span>
        </div>
        ${trunk.auth_type === 'ip' && trunk.allowed_source_ips ? `
          <div class="trunk-detail-row">
            <span class="trunk-detail-label">Allowed IPs:</span>
            <span>${trunk.allowed_source_ips.join(', ')}</span>
          </div>
        ` : ''}
        ${trunk.auth_type === 'registration' && trunk.auth_username ? `
          <div class="trunk-detail-row">
            <span class="trunk-detail-label">Auth Username:</span>
            <span>${trunk.auth_username}</span>
          </div>
        ` : ''}
      </div>

      <!-- SIP Connection Info -->
      <div class="trunk-sip-info">
        <div class="trunk-sip-info-title" id="sip-info-toggle-${trunk.id}">
          <span>SIP Connection Info</span>
          <span id="sip-info-arrow-${trunk.id}">+</span>
        </div>
        <div class="trunk-sip-info-content" id="sip-info-content-${trunk.id}">
          <div class="sip-uri-row">
            <span class="trunk-detail-label">Domain:</span>
            <code>${LIVEKIT_SIP_DOMAIN}</code>
          </div>
          <div class="sip-uri-row">
            <span class="trunk-detail-label">Port (UDP/TCP):</span>
            <code>5060</code>
          </div>
          <div class="sip-uri-row">
            <span class="trunk-detail-label">Port (TLS):</span>
            <code>5061</code>
          </div>
          <p style="margin-top: 0.5rem; font-size: 0.8rem; color: var(--text-secondary);">
            Configure your SIP provider to send calls to the SIP URIs listed below.
          </p>
        </div>
      </div>

      <!-- Numbers Section -->
      <div class="trunk-numbers">
        <div class="trunk-numbers-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
          <span class="trunk-numbers-title">Phone Numbers (${numbers.length})</span>
          <button class="btn btn-sm btn-secondary" id="show-add-number-${trunk.id}">
            + Add Number
          </button>
        </div>

        ${numbers.length > 0 ? numbers.map(num => `
          <div class="trunk-number-item" data-number-id="${num.id}">
            <div class="trunk-number-info">
              <span class="trunk-number-value">${num.phone_number}</span>
              ${num.friendly_name ? `<span class="trunk-number-name">${num.friendly_name}</span>` : ''}
              <span class="trunk-number-name">SIP: sip:${num.phone_number}@${LIVEKIT_SIP_DOMAIN}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              ${num.is_active ? '<span style="color: var(--success-color); font-size: 0.75rem;">Active</span>' : '<span style="color: var(--text-secondary); font-size: 0.75rem;">Inactive</span>'}
              <button class="btn btn-sm btn-secondary remove-number-btn" data-number-id="${num.id}" data-trunk-id="${trunk.id}">Remove</button>
            </div>
          </div>
        `).join('') : '<p class="text-muted" style="font-size: 0.875rem;">No numbers added yet</p>'}

        <div class="add-number-form" id="add-number-form-${trunk.id}" style="display: none;">
          <input type="tel" class="form-input" id="new-number-input-${trunk.id}" placeholder="+237xxxxxxxxx" />
          <input type="text" class="form-input" id="new-number-name-${trunk.id}" placeholder="Label (optional)" style="max-width: 150px;" />
          <button class="btn btn-sm btn-primary" id="save-number-btn-${trunk.id}">Add</button>
          <button class="btn btn-sm btn-secondary" id="cancel-number-btn-${trunk.id}">Cancel</button>
        </div>
      </div>

      <div class="trunk-actions">
        <button class="btn btn-sm btn-secondary" id="edit-trunk-${trunk.id}">
          Edit
        </button>
        <button class="btn btn-sm btn-secondary" id="toggle-trunk-${trunk.id}">
          ${trunk.is_active ? 'Disable' : 'Enable'}
        </button>
        <button class="btn btn-sm btn-danger" id="delete-trunk-${trunk.id}">
          Delete
        </button>
      </div>
    </div>
  `;
}

function attachTrunkEventListeners(trunk) {
  // SIP info toggle
  const sipToggle = document.getElementById(`sip-info-toggle-${trunk.id}`);
  const sipContent = document.getElementById(`sip-info-content-${trunk.id}`);
  const sipArrow = document.getElementById(`sip-info-arrow-${trunk.id}`);

  if (sipToggle) {
    sipToggle.addEventListener('click', () => {
      sipContent.classList.toggle('expanded');
      sipArrow.textContent = sipContent.classList.contains('expanded') ? '-' : '+';
    });
  }

  // Show add number form
  const showAddNumberBtn = document.getElementById(`show-add-number-${trunk.id}`);
  const addNumberForm = document.getElementById(`add-number-form-${trunk.id}`);

  if (showAddNumberBtn) {
    showAddNumberBtn.addEventListener('click', () => {
      addNumberForm.style.display = 'flex';
      showAddNumberBtn.style.display = 'none';
      document.getElementById(`new-number-input-${trunk.id}`).focus();
    });
  }

  // Cancel add number
  const cancelNumberBtn = document.getElementById(`cancel-number-btn-${trunk.id}`);
  if (cancelNumberBtn) {
    cancelNumberBtn.addEventListener('click', () => {
      addNumberForm.style.display = 'none';
      showAddNumberBtn.style.display = 'block';
      document.getElementById(`new-number-input-${trunk.id}`).value = '';
      document.getElementById(`new-number-name-${trunk.id}`).value = '';
    });
  }

  // Save new number
  const saveNumberBtn = document.getElementById(`save-number-btn-${trunk.id}`);
  if (saveNumberBtn) {
    saveNumberBtn.addEventListener('click', async () => {
      const phoneNumber = document.getElementById(`new-number-input-${trunk.id}`).value.trim();
      const friendlyName = document.getElementById(`new-number-name-${trunk.id}`).value.trim();

      if (!phoneNumber) {
        showToast('Please enter a phone number', 'warning');
        return;
      }

      saveNumberBtn.disabled = true;
      saveNumberBtn.textContent = 'Adding...';

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-external-numbers`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'add',
            trunk_id: trunk.id,
            phone_number: phoneNumber,
            friendly_name: friendlyName || null
          })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to add number');

        // Reload trunks to show new number
        loadTrunks();
      } catch (error) {
        console.error('Error adding number:', error);
        showToast(`Failed to add number: ${error.message}`, 'error');
        saveNumberBtn.disabled = false;
        saveNumberBtn.textContent = 'Add';
      }
    });
  }

  // Remove number buttons
  const trunkCard = document.querySelector(`[data-trunk-id="${trunk.id}"]`);
  if (trunkCard) {
    trunkCard.querySelectorAll('.remove-number-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const numberId = btn.dataset.numberId;
        const confirmed = await showConfirmModal({
          title: 'Remove Number',
          message: 'Are you sure you want to remove this number from the trunk?',
          confirmText: 'Remove',
          confirmStyle: 'danger'
        });
        if (!confirmed) return;

        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Not authenticated');

          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-external-numbers`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              action: 'remove',
              number_id: numberId
            })
          });

          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Failed to remove number');

          loadTrunks();
        } catch (error) {
          console.error('Error removing number:', error);
          showToast(`Failed to remove number: ${error.message}`, 'error');
        }
      });
    });
  }

  // Toggle trunk
  const toggleTrunkBtn = document.getElementById(`toggle-trunk-${trunk.id}`);
  if (toggleTrunkBtn) {
    toggleTrunkBtn.addEventListener('click', async () => {
      toggleTrunkBtn.disabled = true;
      toggleTrunkBtn.textContent = 'Updating...';

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-external-trunk`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'update',
            trunk_id: trunk.id,
            is_active: !trunk.is_active
          })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to update trunk');

        loadTrunks();
      } catch (error) {
        console.error('Error toggling trunk:', error);
        showToast(`Failed to update trunk: ${error.message}`, 'error');
        toggleTrunkBtn.disabled = false;
        toggleTrunkBtn.textContent = trunk.is_active ? 'Disable' : 'Enable';
      }
    });
  }

  // Edit trunk
  const editTrunkBtn = document.getElementById(`edit-trunk-${trunk.id}`);
  if (editTrunkBtn) {
    editTrunkBtn.addEventListener('click', () => {
      showEditTrunkModal(trunk);
    });
  }

  // Delete trunk
  const deleteTrunkBtn = document.getElementById(`delete-trunk-${trunk.id}`);
  if (deleteTrunkBtn) {
    deleteTrunkBtn.addEventListener('click', async () => {
      const confirmed = await showConfirmModal({
        title: 'Delete Trunk',
        message: `Are you sure you want to delete the trunk "${trunk.name}"? This will also remove all associated phone numbers.`,
        confirmText: 'Delete',
        confirmStyle: 'danger'
      });
      if (!confirmed) return;

      deleteTrunkBtn.disabled = true;
      deleteTrunkBtn.textContent = 'Deleting...';

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-external-trunk`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'delete',
            trunk_id: trunk.id
          })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to delete trunk');

        loadTrunks();
      } catch (error) {
        console.error('Error deleting trunk:', error);
        showToast(`Failed to delete trunk: ${error.message}`, 'error');
        deleteTrunkBtn.disabled = false;
        deleteTrunkBtn.textContent = 'Delete';
      }
    });
  }
}

// Helper: get provider-specific fields HTML for add/edit modals
function getProviderFieldsHTML(provider, values = {}) {
  const isEdit = Object.keys(values).length > 0;
  const passwordPlaceholder = isEdit ? 'Leave blank to keep existing' : '';

  if (provider === 'twilio') {
    return `
      <div class="form-group">
        <label for="trunk-account-sid">Account SID *</label>
        <input type="text" id="trunk-account-sid" class="form-input" placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" value="${values.api_account_sid || values.auth_username || ''}" />
      </div>
      <div class="form-group">
        <label for="trunk-auth-token">Auth Token *</label>
        <input type="password" id="trunk-auth-token" class="form-input" placeholder="${passwordPlaceholder || 'Your Twilio Auth Token'}" value="" />
        ${isEdit ? '<small class="text-muted">Leave blank to keep the current token</small>' : ''}
      </div>
    `;
  }

  if (provider === 'signalwire') {
    return `
      <div class="form-group">
        <label for="trunk-space-url">Space URL *</label>
        <input type="text" id="trunk-space-url" class="form-input" placeholder="yourspace.signalwire.com" value="${values.provider_space_url || ''}" />
        <small class="text-muted">Your SignalWire space URL (e.g., yourspace.signalwire.com)</small>
      </div>
      <div class="form-group">
        <label for="trunk-project-id">Project ID *</label>
        <input type="text" id="trunk-project-id" class="form-input" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value="${values.api_account_sid || values.auth_username || ''}" />
      </div>
      <div class="form-group">
        <label for="trunk-api-token">API Token *</label>
        <input type="password" id="trunk-api-token" class="form-input" placeholder="${passwordPlaceholder || 'Your SignalWire API Token'}" value="" />
        ${isEdit ? '<small class="text-muted">Leave blank to keep the current token</small>' : ''}
      </div>
    `;
  }

  // 'other' — generic SIP: show existing auth type toggle, IP/registration fields, outbound server
  const authType = values.auth_type || 'ip';
  const isIpAuth = authType === 'ip';
  return `
    <div class="form-group">
      <label>Authentication Type *</label>
      <div class="auth-type-selector">
        <button type="button" class="auth-type-btn ${isIpAuth ? 'selected' : ''}" data-auth-type="ip">
          <strong>IP Whitelist</strong><br>
          <small>Authenticate by source IP</small>
        </button>
        <button type="button" class="auth-type-btn ${!isIpAuth ? 'selected' : ''}" data-auth-type="registration">
          <strong>Registration</strong><br>
          <small>Username & password</small>
        </button>
      </div>
    </div>

    <div class="auth-fields" id="modal-ip-auth-fields" style="display: ${isIpAuth ? 'block' : 'none'};">
      <div class="form-group">
        <label for="modal-allowed-ips">Allowed IP Addresses *</label>
        <textarea id="modal-allowed-ips" class="form-input ip-list-input" placeholder="Enter IP addresses (one per line)&#10;e.g., 192.168.1.100&#10;10.0.0.0/24">${(values.allowed_source_ips || []).join('\n')}</textarea>
        <small class="text-muted">Enter IP addresses or CIDR ranges, one per line</small>
      </div>
    </div>

    <div class="auth-fields" id="modal-registration-auth-fields" style="display: ${!isIpAuth ? 'block' : 'none'};">
      <div class="form-group">
        <label for="modal-auth-username">Username *</label>
        <input type="text" id="modal-auth-username" class="form-input" placeholder="SIP username" value="${values.auth_username || ''}" />
      </div>
      <div class="form-group">
        <label for="modal-auth-password">Password *</label>
        <input type="password" id="modal-auth-password" class="form-input" placeholder="${passwordPlaceholder || 'SIP password'}" value="" />
        ${isEdit ? '<small class="text-muted">Leave blank to keep the current password</small>' : ''}
      </div>
    </div>

    <div class="form-group">
      <label for="modal-outbound-address">Outbound SIP Server (optional)</label>
      <input type="text" id="modal-outbound-address" class="form-input" placeholder="e.g., sip.provider.com:5060" value="${values.outbound_address || ''}" />
      <small class="text-muted">Required if you want to make outbound calls via this trunk</small>
    </div>
  `;
}

// Attach auth-type toggle listeners for 'other' provider fields
function attachOtherProviderListeners(modalEl) {
  const authTypeBtns = modalEl.querySelectorAll('.auth-type-btn');
  const ipFields = modalEl.querySelector('#modal-ip-auth-fields');
  const regFields = modalEl.querySelector('#modal-registration-auth-fields');

  if (!authTypeBtns.length || !ipFields || !regFields) return;

  authTypeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      authTypeBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      if (btn.dataset.authType === 'ip') {
        ipFields.style.display = 'block';
        regFields.style.display = 'none';
      } else {
        ipFields.style.display = 'none';
        regFields.style.display = 'block';
      }
    });
  });
}

// Collect form data based on provider
function collectProviderFormData(provider, modalEl) {
  const requestBody = {};

  if (provider === 'twilio') {
    const accountSid = document.getElementById('trunk-account-sid')?.value.trim();
    const authToken = document.getElementById('trunk-auth-token')?.value;
    if (!accountSid) {
      showToast('Please enter your Twilio Account SID', 'warning');
      return null;
    }
    requestBody.auth_type = 'registration';
    requestBody.auth_username = accountSid;
    if (authToken) requestBody.auth_password = authToken;
    requestBody.api_account_sid = accountSid;
    if (authToken) requestBody.api_auth_token = authToken;
    requestBody.outbound_address = 'us1.pstn.twilio.com';
    requestBody.outbound_transport = 'tls';
  } else if (provider === 'signalwire') {
    const spaceUrl = document.getElementById('trunk-space-url')?.value.trim();
    const projectId = document.getElementById('trunk-project-id')?.value.trim();
    const apiToken = document.getElementById('trunk-api-token')?.value;
    if (!spaceUrl || !projectId) {
      showToast('Please enter your SignalWire Space URL and Project ID', 'warning');
      return null;
    }
    // Extract domain from space URL (remove protocol if present)
    const spaceDomain = spaceUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    requestBody.auth_type = 'registration';
    requestBody.auth_username = projectId;
    if (apiToken) requestBody.auth_password = apiToken;
    requestBody.api_account_sid = projectId;
    if (apiToken) requestBody.api_auth_token = apiToken;
    requestBody.provider_space_url = spaceDomain;
    requestBody.outbound_address = spaceDomain;
    requestBody.outbound_transport = 'tls';
  } else {
    // 'other' — generic SIP
    const selectedAuthBtn = modalEl.querySelector('.auth-type-btn.selected');
    const authType = selectedAuthBtn?.dataset.authType || 'ip';
    requestBody.auth_type = authType;

    if (authType === 'ip') {
      const ipsText = document.getElementById('modal-allowed-ips')?.value.trim();
      if (!ipsText) {
        showToast('Please enter at least one allowed IP address', 'warning');
        return null;
      }
      requestBody.allowed_source_ips = ipsText.split('\n').map(ip => ip.trim()).filter(ip => ip);
      requestBody.auth_username = null;
      requestBody.auth_password = null;
    } else {
      const username = document.getElementById('modal-auth-username')?.value.trim();
      const password = document.getElementById('modal-auth-password')?.value;
      if (!username) {
        showToast('Please enter a username', 'warning');
        return null;
      }
      requestBody.auth_username = username;
      if (password) requestBody.auth_password = password;
      requestBody.allowed_source_ips = null;
    }

    const outboundAddress = document.getElementById('modal-outbound-address')?.value.trim();
    requestBody.outbound_address = outboundAddress || null;
  }

  return requestBody;
}

function showAddTrunkModal() {
  // Remove existing modal if any
  const existingModal = document.getElementById('add-trunk-modal-overlay');
  if (existingModal) existingModal.remove();

  const overlay = document.createElement('div');
  overlay.id = 'add-trunk-modal-overlay';
  overlay.className = 'contact-modal-overlay';
  overlay.style.display = 'flex';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  overlay.innerHTML = `
    <div class="contact-modal" style="max-width: 550px;" onclick="event.stopPropagation()">
      <div class="contact-modal-header">
        <h3>Add External SIP Trunk</h3>
        <button class="close-modal-btn" id="close-add-trunk-modal">&times;</button>
      </div>
      <form id="add-trunk-form">
        <div class="contact-modal-body scrollable">
          <div class="form-group">
            <label for="trunk-name">Trunk Name *</label>
            <input type="text" id="trunk-name" class="form-input" placeholder="e.g., My Twilio Trunk" required />
          </div>

          <div class="form-group">
            <label for="trunk-provider">Provider *</label>
            <select id="trunk-provider" class="form-input">
              <option value="twilio">Twilio</option>
              <option value="signalwire">SignalWire</option>
              <option value="other">Other / Generic SIP</option>
            </select>
          </div>

          <div id="provider-fields">
            ${getProviderFieldsHTML('twilio')}
          </div>
        </div>
        <div class="contact-modal-footer">
          <button type="button" class="btn btn-secondary" id="cancel-add-trunk">Cancel</button>
          <button type="submit" class="btn btn-primary" id="save-add-trunk">Create Trunk</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  // Provider dropdown change handler
  const providerSelect = document.getElementById('trunk-provider');
  const providerFieldsContainer = document.getElementById('provider-fields');

  providerSelect.addEventListener('change', () => {
    providerFieldsContainer.innerHTML = getProviderFieldsHTML(providerSelect.value);
    if (providerSelect.value === 'other') {
      attachOtherProviderListeners(overlay);
    }
  });

  // Close modal
  const closeModal = () => overlay.remove();
  document.getElementById('close-add-trunk-modal').addEventListener('click', closeModal);
  document.getElementById('cancel-add-trunk').addEventListener('click', closeModal);

  // Save trunk
  document.getElementById('add-trunk-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('save-add-trunk');
    const name = document.getElementById('trunk-name').value.trim();
    const provider = providerSelect.value;

    if (!name) {
      showToast('Please enter a trunk name', 'warning');
      return;
    }

    const providerData = collectProviderFormData(provider, overlay);
    if (!providerData) return; // validation failed

    // For create, twilio/signalwire require the token
    if (provider === 'twilio' && !providerData.auth_password) {
      showToast('Please enter your Twilio Auth Token', 'warning');
      return;
    }
    if (provider === 'signalwire' && !providerData.auth_password) {
      showToast('Please enter your SignalWire API Token', 'warning');
      return;
    }
    if (provider === 'other' && providerData.auth_type === 'registration' && !providerData.auth_password) {
      showToast('Please enter a password', 'warning');
      return;
    }

    const requestBody = {
      action: 'create',
      name,
      provider,
      ...providerData
    };

    saveBtn.disabled = true;
    saveBtn.textContent = 'Creating...';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-external-trunk`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create trunk');

      closeModal();
      loadTrunks();
      showToast(`Trunk "${name}" created successfully!`, 'success');
    } catch (error) {
      console.error('Error creating trunk:', error);
      showToast(`Failed to create trunk: ${error.message}`, 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Create Trunk';
    }
  });
}

function showEditTrunkModal(trunk) {
  // Remove existing modal if any
  const existingModal = document.getElementById('edit-trunk-modal-overlay');
  if (existingModal) existingModal.remove();

  const overlay = document.createElement('div');
  overlay.id = 'edit-trunk-modal-overlay';
  overlay.className = 'contact-modal-overlay';
  overlay.style.display = 'flex';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  const provider = trunk.provider || 'other';

  overlay.innerHTML = `
    <div class="contact-modal" style="max-width: 550px;" onclick="event.stopPropagation()">
      <div class="contact-modal-header">
        <h3>Edit SIP Trunk</h3>
        <button class="close-modal-btn" id="close-edit-trunk-modal">&times;</button>
      </div>
      <form id="edit-trunk-form">
        <div class="contact-modal-body scrollable">
          <div class="form-group">
            <label for="edit-trunk-name">Trunk Name *</label>
            <input type="text" id="edit-trunk-name" class="form-input" value="${trunk.name || ''}" required />
          </div>

          <div class="form-group">
            <label for="edit-trunk-provider">Provider *</label>
            <select id="edit-trunk-provider" class="form-input">
              <option value="twilio" ${provider === 'twilio' ? 'selected' : ''}>Twilio</option>
              <option value="signalwire" ${provider === 'signalwire' ? 'selected' : ''}>SignalWire</option>
              <option value="other" ${provider === 'other' ? 'selected' : ''}>Other / Generic SIP</option>
            </select>
          </div>

          <div id="edit-provider-fields">
            ${getProviderFieldsHTML(provider, trunk)}
          </div>
        </div>
        <div class="contact-modal-footer">
          <button type="button" class="btn btn-secondary" id="cancel-edit-trunk">Cancel</button>
          <button type="submit" class="btn btn-primary" id="save-edit-trunk">Save Changes</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  // Attach auth type listeners if 'other'
  if (provider === 'other') {
    attachOtherProviderListeners(overlay);
  }

  // Provider dropdown change handler
  const providerSelect = document.getElementById('edit-trunk-provider');
  const providerFieldsContainer = document.getElementById('edit-provider-fields');

  providerSelect.addEventListener('change', () => {
    // When switching provider, reset fields (don't carry over values for different provider)
    const newProvider = providerSelect.value;
    const values = newProvider === trunk.provider ? trunk : {};
    providerFieldsContainer.innerHTML = getProviderFieldsHTML(newProvider, values);
    if (newProvider === 'other') {
      attachOtherProviderListeners(overlay);
    }
  });

  // Close modal
  const closeModal = () => overlay.remove();
  document.getElementById('close-edit-trunk-modal').addEventListener('click', closeModal);
  document.getElementById('cancel-edit-trunk').addEventListener('click', closeModal);

  // Save trunk changes
  document.getElementById('edit-trunk-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('save-edit-trunk');
    const name = document.getElementById('edit-trunk-name').value.trim();
    const newProvider = providerSelect.value;

    if (!name) {
      showToast('Please enter a trunk name', 'warning');
      return;
    }

    const providerData = collectProviderFormData(newProvider, overlay);
    if (!providerData) return; // validation failed

    // For edit, password/token is optional (leave blank to keep existing)
    // But for 'other' with registration, username is still required (handled in collectProviderFormData)

    const requestBody = {
      action: 'update',
      trunk_id: trunk.id,
      name,
      provider: newProvider,
      ...providerData
    };

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-external-trunk`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update trunk');

      closeModal();
      loadTrunks();
    } catch (error) {
      console.error('Error updating trunk:', error);
      showToast(`Failed to update trunk: ${error.message}`, 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    }
  });
}
