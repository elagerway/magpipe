/**
 * External SIP Trunk Settings Component
 *
 * Allows users to configure external SIP trunks from providers like Orange, Twilio, etc.
 */

import { supabase } from '../lib/supabase.js';

const LIVEKIT_SIP_DOMAIN = '378ads1njtd.sip.livekit.cloud';

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

    /* Add Trunk Modal */
    .add-trunk-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .add-trunk-modal-content {
      background: var(--bg-primary);
      border-radius: var(--radius-lg);
      padding: 1.5rem;
      width: 90%;
      max-width: 500px;
      max-height: 90vh;
      overflow-y: auto;
    }

    .add-trunk-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .add-trunk-modal-title {
      font-size: 1.25rem;
      font-weight: 600;
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

    .auth-fields {
      margin-bottom: 1rem;
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
          <p class="text-muted" style="margin: 0.25rem 0 0 0; font-size: 0.875rem;">Connect your own SIP providers (Orange, Twilio, etc.)</p>
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
  const activeNumbers = numbers.filter(n => n.is_active);

  return `
    <div class="external-trunk-card ${trunk.is_active ? '' : 'inactive'}" data-trunk-id="${trunk.id}">
      <div class="trunk-header">
        <div>
          <div class="trunk-title">${trunk.name}</div>
          ${trunk.provider ? `<div class="trunk-provider">Provider: ${trunk.provider}</div>` : ''}
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
              <button class="btn btn-sm btn-secondary" onclick="removeNumber('${num.id}', '${trunk.id}')">Remove</button>
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
        alert('Please enter a phone number');
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
        alert(`Failed to add number: ${error.message}`);
        saveNumberBtn.disabled = false;
        saveNumberBtn.textContent = 'Add';
      }
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
        alert(`Failed to update trunk: ${error.message}`);
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
      if (!confirm(`Are you sure you want to delete the trunk "${trunk.name}"? This will also remove all associated phone numbers.`)) {
        return;
      }

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
        alert(`Failed to delete trunk: ${error.message}`);
        deleteTrunkBtn.disabled = false;
        deleteTrunkBtn.textContent = 'Delete';
      }
    });
  }
}

// Global function for removing numbers (called from onclick)
window.removeNumber = async function(numberId, trunkId) {
  if (!confirm('Are you sure you want to remove this number?')) {
    return;
  }

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
    alert(`Failed to remove number: ${error.message}`);
  }
};

function showAddTrunkModal() {
  // Remove existing modal if any
  const existingModal = document.getElementById('add-trunk-modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.id = 'add-trunk-modal';
  modal.className = 'add-trunk-modal';
  modal.innerHTML = `
    <div class="add-trunk-modal-content">
      <div class="add-trunk-modal-header">
        <h2 class="add-trunk-modal-title">Add External SIP Trunk</h2>
        <button class="btn btn-sm btn-secondary" id="close-add-trunk-modal">&times;</button>
      </div>

      <div class="form-group">
        <label for="trunk-name">Trunk Name *</label>
        <input type="text" id="trunk-name" class="form-input" placeholder="e.g., Orange West Africa" required />
      </div>

      <div class="form-group">
        <label for="trunk-provider">Provider (optional)</label>
        <input type="text" id="trunk-provider" class="form-input" placeholder="e.g., Orange" />
      </div>

      <div class="form-group">
        <label>Authentication Type *</label>
        <div class="auth-type-selector">
          <button type="button" class="auth-type-btn selected" data-auth-type="ip">
            <strong>IP Whitelist</strong><br>
            <small>Authenticate by source IP</small>
          </button>
          <button type="button" class="auth-type-btn" data-auth-type="registration">
            <strong>Registration</strong><br>
            <small>Username & password</small>
          </button>
        </div>
      </div>

      <div class="auth-fields" id="ip-auth-fields">
        <div class="form-group">
          <label for="allowed-ips">Allowed IP Addresses *</label>
          <textarea id="allowed-ips" class="form-input ip-list-input" placeholder="Enter IP addresses (one per line)&#10;e.g., 192.168.1.100&#10;10.0.0.0/24"></textarea>
          <small class="text-muted">Enter IP addresses or CIDR ranges, one per line</small>
        </div>
      </div>

      <div class="auth-fields" id="registration-auth-fields" style="display: none;">
        <div class="form-group">
          <label for="auth-username">Username *</label>
          <input type="text" id="auth-username" class="form-input" placeholder="SIP username" />
        </div>
        <div class="form-group">
          <label for="auth-password">Password *</label>
          <input type="password" id="auth-password" class="form-input" placeholder="SIP password" />
        </div>
      </div>

      <div class="form-group">
        <label for="outbound-address">Outbound SIP Server (optional)</label>
        <input type="text" id="outbound-address" class="form-input" placeholder="e.g., sip.orange.cm:5060" />
        <small class="text-muted">Required if you want to make outbound calls via this trunk</small>
      </div>

      <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1.5rem;">
        <button class="btn btn-secondary" id="cancel-add-trunk">Cancel</button>
        <button class="btn btn-primary" id="save-add-trunk">Create Trunk</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Auth type selector
  const authTypeBtns = modal.querySelectorAll('.auth-type-btn');
  const ipAuthFields = document.getElementById('ip-auth-fields');
  const registrationAuthFields = document.getElementById('registration-auth-fields');

  authTypeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      authTypeBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');

      const authType = btn.dataset.authType;
      if (authType === 'ip') {
        ipAuthFields.style.display = 'block';
        registrationAuthFields.style.display = 'none';
      } else {
        ipAuthFields.style.display = 'none';
        registrationAuthFields.style.display = 'block';
      }
    });
  });

  // Close modal
  const closeModal = () => modal.remove();
  document.getElementById('close-add-trunk-modal').addEventListener('click', closeModal);
  document.getElementById('cancel-add-trunk').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Save trunk
  document.getElementById('save-add-trunk').addEventListener('click', async () => {
    const saveBtn = document.getElementById('save-add-trunk');
    const name = document.getElementById('trunk-name').value.trim();
    const provider = document.getElementById('trunk-provider').value.trim();
    const authType = modal.querySelector('.auth-type-btn.selected').dataset.authType;
    const outboundAddress = document.getElementById('outbound-address').value.trim();

    // Validate
    if (!name) {
      alert('Please enter a trunk name');
      return;
    }

    let requestBody = {
      action: 'create',
      name,
      provider: provider || null,
      auth_type: authType,
      outbound_address: outboundAddress || null
    };

    if (authType === 'ip') {
      const ipsText = document.getElementById('allowed-ips').value.trim();
      if (!ipsText) {
        alert('Please enter at least one allowed IP address');
        return;
      }
      const ips = ipsText.split('\n').map(ip => ip.trim()).filter(ip => ip);
      requestBody.allowed_source_ips = ips;
    } else {
      const username = document.getElementById('auth-username').value.trim();
      const password = document.getElementById('auth-password').value;
      if (!username || !password) {
        alert('Please enter both username and password');
        return;
      }
      requestBody.auth_username = username;
      requestBody.auth_password = password;
    }

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

      // Show success message with SIP info
      alert(`Trunk "${name}" created successfully!\n\nConfigure your SIP provider to send calls to:\n${LIVEKIT_SIP_DOMAIN}:5060 (UDP/TCP)\n${LIVEKIT_SIP_DOMAIN}:5061 (TLS)`);
    } catch (error) {
      console.error('Error creating trunk:', error);
      alert(`Failed to create trunk: ${error.message}`);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Create Trunk';
    }
  });
}

function showEditTrunkModal(trunk) {
  // Remove existing modal if any
  const existingModal = document.getElementById('edit-trunk-modal');
  if (existingModal) existingModal.remove();

  const isIpAuth = trunk.auth_type === 'ip';

  const modal = document.createElement('div');
  modal.id = 'edit-trunk-modal';
  modal.className = 'add-trunk-modal';
  modal.innerHTML = `
    <div class="add-trunk-modal-content">
      <div class="add-trunk-modal-header">
        <h2 class="add-trunk-modal-title">Edit SIP Trunk</h2>
        <button class="btn btn-sm btn-secondary" id="close-edit-trunk-modal">&times;</button>
      </div>

      <div class="form-group">
        <label for="edit-trunk-name">Trunk Name *</label>
        <input type="text" id="edit-trunk-name" class="form-input" value="${trunk.name || ''}" required />
      </div>

      <div class="form-group">
        <label for="edit-trunk-provider">Provider (optional)</label>
        <input type="text" id="edit-trunk-provider" class="form-input" value="${trunk.provider || ''}" />
      </div>

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

      <div class="auth-fields" id="edit-ip-auth-fields" style="display: ${isIpAuth ? 'block' : 'none'};">
        <div class="form-group">
          <label for="edit-allowed-ips">Allowed IP Addresses *</label>
          <textarea id="edit-allowed-ips" class="form-input ip-list-input" placeholder="Enter IP addresses (one per line)&#10;e.g., 192.168.1.100&#10;10.0.0.0/24">${(trunk.allowed_source_ips || []).join('\n')}</textarea>
          <small class="text-muted">Enter IP addresses or CIDR ranges, one per line</small>
        </div>
      </div>

      <div class="auth-fields" id="edit-registration-auth-fields" style="display: ${!isIpAuth ? 'block' : 'none'};">
        <div class="form-group">
          <label for="edit-auth-username">Username *</label>
          <input type="text" id="edit-auth-username" class="form-input" value="${trunk.auth_username || ''}" placeholder="SIP username" />
        </div>
        <div class="form-group">
          <label for="edit-auth-password">Password</label>
          <input type="password" id="edit-auth-password" class="form-input" placeholder="Leave blank to keep existing" />
          <small class="text-muted">Leave blank to keep the current password</small>
        </div>
      </div>

      <div class="form-group">
        <label for="edit-outbound-address">Outbound SIP Server (optional)</label>
        <input type="text" id="edit-outbound-address" class="form-input" value="${trunk.outbound_address || ''}" placeholder="e.g., sip.orange.cm:5060" />
        <small class="text-muted">Required if you want to make outbound calls via this trunk</small>
      </div>

      <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1.5rem;">
        <button class="btn btn-secondary" id="cancel-edit-trunk">Cancel</button>
        <button class="btn btn-primary" id="save-edit-trunk">Save Changes</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Auth type selector
  const authTypeBtns = modal.querySelectorAll('.auth-type-btn');
  const ipAuthFields = document.getElementById('edit-ip-auth-fields');
  const registrationAuthFields = document.getElementById('edit-registration-auth-fields');

  authTypeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      authTypeBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');

      const authType = btn.dataset.authType;
      if (authType === 'ip') {
        ipAuthFields.style.display = 'block';
        registrationAuthFields.style.display = 'none';
      } else {
        ipAuthFields.style.display = 'none';
        registrationAuthFields.style.display = 'block';
      }
    });
  });

  // Close modal
  const closeModal = () => modal.remove();
  document.getElementById('close-edit-trunk-modal').addEventListener('click', closeModal);
  document.getElementById('cancel-edit-trunk').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Save trunk changes
  document.getElementById('save-edit-trunk').addEventListener('click', async () => {
    const saveBtn = document.getElementById('save-edit-trunk');
    const name = document.getElementById('edit-trunk-name').value.trim();
    const provider = document.getElementById('edit-trunk-provider').value.trim();
    const authType = modal.querySelector('.auth-type-btn.selected').dataset.authType;
    const outboundAddress = document.getElementById('edit-outbound-address').value.trim();

    // Validate
    if (!name) {
      alert('Please enter a trunk name');
      return;
    }

    let requestBody = {
      action: 'update',
      trunk_id: trunk.id,
      name,
      provider: provider || null,
      auth_type: authType,
      outbound_address: outboundAddress || null
    };

    if (authType === 'ip') {
      const ipsText = document.getElementById('edit-allowed-ips').value.trim();
      if (!ipsText) {
        alert('Please enter at least one allowed IP address');
        return;
      }
      const ips = ipsText.split('\n').map(ip => ip.trim()).filter(ip => ip);
      requestBody.allowed_source_ips = ips;
      // Clear registration fields
      requestBody.auth_username = null;
      requestBody.auth_password = null;
    } else {
      const username = document.getElementById('edit-auth-username').value.trim();
      const password = document.getElementById('edit-auth-password').value;
      if (!username) {
        alert('Please enter a username');
        return;
      }
      requestBody.auth_username = username;
      // Only include password if it was changed
      if (password) {
        requestBody.auth_password = password;
      }
      // Clear IP fields
      requestBody.allowed_source_ips = null;
    }

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
      alert(`Failed to update trunk: ${error.message}`);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    }
  });
}
