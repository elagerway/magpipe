/**
 * Service Numbers Management Page
 */

import { getCurrentUser, supabase } from '../lib/supabase.js';
import { renderBottomNav } from '../components/BottomNav.js';
import { User } from '../models/index.js';

export default class ManageNumbersPage {
  constructor() {
    this.serviceNumbers = [];
    this.numbersToDelete = [];
    this.user = null;
  }

  async render() {
    // On desktop, redirect to phone page where numbers management now lives
    if (window.innerWidth > 768) {
      navigateTo('/phone');
      return;
    }

    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    this.user = user;

    // Fetch user profile for bottom nav
    const { profile } = await User.getProfile(user.id);

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container with-bottom-nav" style="max-width: 1000px; padding-top: 1rem;">
        <div style="margin-bottom: 1.5rem;">
          <button onclick="navigateTo('/settings')" style="
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            padding: 0.5rem 0.5rem 0.5rem 0;
            display: flex;
            align-items: center;
            gap: 0.25rem;
            font-size: 0.875rem;
            transition: color 0.2s;
            margin-bottom: 1rem;
          " onmouseover="this.style.color='var(--primary-color)'" onmouseout="this.style.color='var(--text-secondary)'">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
            Back
          </button>

          <h1 style="margin-bottom: 0.5rem;">My Service Numbers</h1>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <p class="text-muted" style="margin: 0;">Manage your phone numbers</p>
            <button class="btn btn-primary" id="add-number-btn">
              + Add New Number
            </button>
          </div>
        </div>

        <div class="card" style="padding: 1rem;">

          <div id="error-message" class="hidden"></div>
          <div id="success-message" class="hidden"></div>

          <div id="loading" style="text-align: center; padding: 3rem;">
            <p class="text-muted">Loading your numbers...</p>
          </div>

          <div id="numbers-container" class="hidden"></div>

          <div id="empty-state" class="hidden" style="text-align: center; padding: 3rem;">
            <p class="text-muted" style="font-size: 1.125rem; margin-bottom: 1.5rem;">
              You don't have any service numbers yet
            </p>
            <button class="btn btn-primary" id="add-first-number-btn">
              Get Your First Number
            </button>
          </div>
        </div>
      </div>

      <!-- Delete Confirmation Modal -->
      <div id="delete-modal" class="modal hidden">
        <div class="modal-backdrop"></div>
        <div class="modal-content" style="max-width: 400px;">
          <h2 style="margin-bottom: 1rem;">Delete Phone Number?</h2>
          <p style="margin-bottom: 1.5rem;">
            Are you sure you want to delete <strong id="delete-number-display"></strong>?
          </p>
          <p class="text-muted" style="font-size: 0.875rem; margin-bottom: 1.5rem;" id="delete-modal-warning">
            This number will be deactivated immediately and permanently deleted in 30 days.
          </p>
          <div style="display: flex; gap: 0.75rem;">
            <button class="btn btn-secondary" id="cancel-delete-btn" style="flex: 1;">
              Cancel
            </button>
            <button class="btn" id="confirm-delete-btn" style="flex: 1; background: #ef4444; border-color: #ef4444; color: white;">
              Yes, Delete
            </button>
          </div>
        </div>
      </div>

      ${renderBottomNav('/settings')}
    `;

    this.attachEventListeners();
    await this.loadNumbers();

    // Automatically fix capabilities in the background
    this.fixCapabilities().catch(err => console.error('Background capability fix failed:', err));
  }

  attachEventListeners() {
    const addNumberBtn = document.getElementById('add-number-btn');
    const addFirstNumberBtn = document.getElementById('add-first-number-btn');

    addNumberBtn?.addEventListener('click', () => {
      navigateTo('/select-number');
    });

    addFirstNumberBtn?.addEventListener('click', () => {
      navigateTo('/select-number');
    });
  }

  async loadNumbers() {
    const loading = document.getElementById('loading');
    const numbersContainer = document.getElementById('numbers-container');
    const emptyState = document.getElementById('empty-state');
    const errorMessage = document.getElementById('error-message');

    try {
      // Load active/inactive service numbers with assigned agent info
      const { data: numbers, error } = await supabase
        .from('service_numbers')
        .select(`
          *,
          agent:agent_configs!service_numbers_agent_id_fkey (
            id,
            name
          )
        `)
        .eq('user_id', this.user.id)
        .order('purchased_at', { ascending: false });

      if (error) throw error;

      this.serviceNumbers = numbers || [];

      // Load numbers scheduled for deletion for current user only
      const { data: toDelete, error: deleteError } = await supabase
        .from('numbers_to_delete')
        .select('*')
        .eq('user_id', this.user.id)
        .eq('deletion_status', 'pending')
        .order('scheduled_deletion_date', { ascending: true });

      if (deleteError) console.error('Error loading deletion queue:', deleteError);

      this.numbersToDelete = toDelete || [];

      loading.classList.add('hidden');

      if (this.serviceNumbers.length === 0 && this.numbersToDelete.length === 0) {
        emptyState.classList.remove('hidden');
      } else {
        numbersContainer.classList.remove('hidden');
        this.renderNumbers();
      }
    } catch (error) {
      console.error('Error loading numbers:', error);
      loading.classList.add('hidden');
      errorMessage.className = 'alert alert-error';
      errorMessage.textContent = 'Failed to load service numbers';
    }
  }

  renderNumbers() {
    const container = document.getElementById('numbers-container');

    // Filter out US Relay numbers - they're shown as reference on Canadian numbers
    const isUSRelay = (n) => n.friendly_name?.includes('Auto US Relay');
    const activeNumbers = this.serviceNumbers.filter(n => n.is_active && !isUSRelay(n));
    const inactiveNumbers = this.serviceNumbers.filter(n => !n.is_active && !isUSRelay(n));

    container.innerHTML = `
      ${activeNumbers.length > 0 ? `
        <div style="margin-bottom: 2rem;">
          <h3 style="margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
            <span style="width: 8px; height: 8px; background: #10b981; border-radius: 50%;"></span>
            Active Numbers (${activeNumbers.length})
          </h3>
          <div style="display: grid; gap: 1rem;">
            ${activeNumbers.map(num => this.renderNumberCard(num)).join('')}
          </div>
        </div>
      ` : ''}

      ${inactiveNumbers.length > 0 ? `
        <div style="margin-bottom: 2rem;">
          <h3 style="margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
            <span style="width: 8px; height: 8px; background: #9ca3af; border-radius: 50%;"></span>
            Inactive Numbers (${inactiveNumbers.length})
          </h3>
          <div style="display: grid; gap: 1rem;">
            ${inactiveNumbers.map(num => this.renderNumberCard(num)).join('')}
          </div>
        </div>
      ` : ''}

      ${this.numbersToDelete.length > 0 ? `
        <div>
          <h3 style="margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
            <span style="width: 8px; height: 8px; background: #ef4444; border-radius: 50%;"></span>
            Scheduled for Deletion (${this.numbersToDelete.length})
          </h3>
          <div style="display: grid; gap: 1rem;">
            ${this.numbersToDelete.map(num => this.renderDeletionCard(num)).join('')}
          </div>
        </div>
      ` : ''}
    `;

    // Attach toggle listeners
    this.serviceNumbers.forEach(num => {
      const toggleBtn = document.getElementById(`toggle-${num.id}`);
      toggleBtn?.addEventListener('click', () => this.toggleNumber(num.id, !num.is_active));

      // Attach delete button listeners
      const deleteBtn = document.getElementById(`delete-${num.id}`);
      deleteBtn?.addEventListener('click', () => this.showDeleteModal(num));

      // Attach remove agent button listeners
      const removeAgentBtn = document.getElementById(`remove-agent-${num.id}`);
      removeAgentBtn?.addEventListener('click', () => this.removeAgentFromNumber(num));
    });

    // Attach edit button listeners
    document.querySelectorAll('.edit-number-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const numberId = btn.dataset.numberId;
        const number = this.serviceNumbers.find(n => n.id === numberId);
        if (number) {
          await this.showAgentAssignmentModal(number);
        }
      });
    });

    // Attach cancel deletion listeners
    this.numbersToDelete.forEach(num => {
      const cancelBtn = document.getElementById(`cancel-delete-${num.id}`);
      cancelBtn?.addEventListener('click', () => this.cancelDeletion(num));
    });

    // Attach modal listeners
    this.attachModalListeners();
  }

  attachModalListeners() {
    const modal = document.getElementById('delete-modal');
    const cancelBtn = document.getElementById('cancel-delete-btn');
    const confirmBtn = document.getElementById('confirm-delete-btn');
    const backdrop = modal?.querySelector('.modal-backdrop');

    const closeModal = () => {
      modal?.classList.add('hidden');
      this.numberToDelete = null;
    };

    cancelBtn?.addEventListener('click', closeModal);
    backdrop?.addEventListener('click', closeModal);

    confirmBtn?.addEventListener('click', async () => {
      if (this.numberToDelete) {
        await this.deleteNumber(this.numberToDelete);
        closeModal();
      }
    });
  }

  showDeleteModal(number) {
    this.numberToDelete = number;
    const modal = document.getElementById('delete-modal');
    const numberDisplay = document.getElementById('delete-number-display');
    const warningText = document.getElementById('delete-modal-warning');

    if (numberDisplay) {
      numberDisplay.textContent = this.formatPhoneNumber(number.phone_number);
    }

    // Calculate days until deletion (30 days from purchase date)
    if (warningText && number.purchased_at) {
      const purchaseDate = new Date(number.purchased_at);
      const deletionDate = new Date(purchaseDate);
      deletionDate.setDate(purchaseDate.getDate() + 30);

      const now = new Date();
      const daysRemaining = Math.max(0, Math.ceil((deletionDate - now) / (1000 * 60 * 60 * 24)));

      warningText.textContent = `This number will be deactivated immediately and permanently deleted in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}.`;
    }

    modal?.classList.remove('hidden');
  }

  async deleteNumber(number) {
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');
    const confirmBtn = document.getElementById('confirm-delete-btn');

    errorMessage.classList.add('hidden');
    successMessage.classList.add('hidden');

    try {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Deleting...';

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      const { data: { user } } = await supabase.auth.getUser();

      // Queue the number for deletion
      const response = await fetch(`${supabaseUrl}/functions/v1/queue-number-deletion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: user.email,
          phone_numbers: [number.phone_number]
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to queue number for deletion');
      }

      const result = await response.json();

      // Get days until deletion from the result
      const daysUntilDeletion = result.results?.[0]?.days_until_deletion || 30;

      successMessage.className = 'alert alert-success';
      successMessage.textContent = `Number queued for deletion. It will be permanently deleted in ${daysUntilDeletion} day${daysUntilDeletion !== 1 ? 's' : ''}.`;

      // Reload numbers to reflect changes
      await this.loadNumbers();

    } catch (error) {
      console.error('Error deleting number:', error);
      errorMessage.className = 'alert alert-error';
      errorMessage.textContent = error.message || 'Failed to delete number';
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Yes, Delete';
    }
  }

  async cancelDeletion(number) {
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');

    errorMessage.classList.add('hidden');
    successMessage.classList.add('hidden');

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();

      // Call Edge Function to cancel deletion
      const response = await fetch(`${supabaseUrl}/functions/v1/cancel-number-deletion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          phone_number: number.phone_number
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to cancel deletion');
      }

      const result = await response.json();

      successMessage.className = 'alert alert-success';
      successMessage.textContent = `Deletion cancelled. Number restored to inactive status.`;

      // Reload numbers to reflect changes
      await this.loadNumbers();

    } catch (error) {
      console.error('Error cancelling deletion:', error);
      errorMessage.className = 'alert alert-error';
      errorMessage.textContent = error.message || 'Failed to cancel deletion';
    }
  }

  renderNumberCard(number) {
    const capabilities = number.capabilities || {};
    const hasVoice = capabilities.voice !== false;
    const hasSms = capabilities.sms !== false;
    const hasMms = capabilities.mms !== false;

    // Check if this is a US Relay number and find the associated Canadian number
    const canadianAreaCodes = ['+1604', '+1778', '+1236', '+1250', '+1587', '+1403', '+1780', '+1825'];
    const isUSRelay = number.friendly_name?.includes('Auto US Relay');
    const isCanadian = canadianAreaCodes.some(code => number.phone_number.startsWith(code));

    let relayForNumber = null;
    let usRelayNumber = null;

    if (isUSRelay) {
      // Find the Canadian number (non-relay number with Canadian area code)
      relayForNumber = this.serviceNumbers.find(n =>
        !n.friendly_name?.includes('Auto US Relay') &&
        canadianAreaCodes.some(code => n.phone_number.startsWith(code))
      );
    } else if (isCanadian) {
      // Find the US Relay number for this Canadian number
      usRelayNumber = this.serviceNumbers.find(n =>
        n.friendly_name?.includes('Auto US Relay')
      );
    }

    return `
      <div class="number-card" style="
        padding: 1rem;
        border: 2px solid ${number.is_active ? 'var(--primary-color)' : 'var(--border-color)'};
        border-radius: var(--radius-md);
        background: ${number.is_active ? 'rgba(99, 102, 241, 0.05)' : 'var(--bg-primary)'};
        margin-bottom: 1rem;
      ">
        <!-- Header with phone number and toggle -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
              <span style="font-size: 1.125rem; font-weight: 600;">
                ${this.formatPhoneNumber(number.phone_number)}
              </span>
              <button class="edit-number-btn" data-number-id="${number.id}" style="
                background: transparent;
                border: none;
                padding: 0.25rem;
                cursor: pointer;
                color: var(--text-secondary);
                display: flex;
                align-items: center;
              ">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="1"/>
                  <circle cx="12" cy="5" r="1"/>
                  <circle cx="12" cy="19" r="1"/>
                </svg>
              </button>
            </div>
            ${number.agent?.name ? `
              <div style="font-size: 0.75rem; color: var(--text-secondary); display: flex; align-items: center; gap: 0.25rem;">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                ${number.agent.name}
              </div>
            ` : ''}
            ${isUSRelay && relayForNumber ? `
              <div style="font-size: 0.75rem; color: var(--primary-color); margin-top: 0.25rem;">
                Relay for: ${this.formatPhoneNumber(relayForNumber.phone_number)}
              </div>
            ` : ''}
            ${isCanadian && usRelayNumber ? `
              <div style="font-size: 0.75rem; color: var(--primary-color); margin-top: 0.25rem;">
                US Relay: ${this.formatPhoneNumber(usRelayNumber.phone_number)}
              </div>
            ` : ''}
          </div>
          <label class="toggle-switch" style="flex-shrink: 0;">
            <input
              type="checkbox"
              id="toggle-${number.id}"
              ${number.is_active ? 'checked' : ''}
            />
            <span class="toggle-slider"></span>
          </label>
        </div>

        <!-- Status badge -->
        <div style="margin-bottom: 0.75rem;">
          <span style="
            display: inline-block;
            padding: 0.25rem 0.75rem;
            background: ${number.is_active ? '#10b981' : '#9ca3af'};
            color: white;
            border-radius: 9999px;
            font-size: 0.75rem;
            font-weight: 600;
          ">
            ${number.is_active ? 'ACTIVE' : 'INACTIVE'}
          </span>
        </div>

        <!-- Capabilities -->
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem;">
          ${hasVoice ? '<span style="display: inline-block; padding: 0.125rem 0.5rem; background: rgba(34, 197, 94, 0.1); color: rgb(34, 197, 94); border-radius: 0.25rem; font-size: 0.75rem; font-weight: 500;">Voice</span>' : '<span style="display: inline-block; padding: 0.125rem 0.5rem; background: rgba(156, 163, 175, 0.1); color: rgb(107, 114, 128); border-radius: 0.25rem; font-size: 0.75rem; font-weight: 500;">No Voice</span>'}
          ${hasSms ? '<span style="display: inline-block; padding: 0.125rem 0.5rem; background: rgba(59, 130, 246, 0.1); color: rgb(59, 130, 246); border-radius: 0.25rem; font-size: 0.75rem; font-weight: 500;">SMS</span>' : '<span style="display: inline-block; padding: 0.125rem 0.5rem; background: rgba(156, 163, 175, 0.1); color: rgb(107, 114, 128); border-radius: 0.25rem; font-size: 0.75rem; font-weight: 500;">No SMS</span>'}
        </div>

        <!-- Assigned Agent -->
        ${number.agent ? `
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; padding: 0.5rem 0.75rem; background: rgba(99, 102, 241, 0.08); border-radius: 0.375rem;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--primary-color); flex-shrink: 0;">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span style="font-size: 0.8125rem; color: var(--text-primary); flex: 1;">
              Agent: <strong>${number.agent.name}</strong>
            </span>
            <button
              id="remove-agent-${number.id}"
              style="
                background: none;
                border: none;
                color: var(--text-secondary);
                cursor: pointer;
                padding: 0.25rem;
                display: flex;
                align-items: center;
                transition: color 0.2s;
              "
              title="Remove agent from this number"
              onmouseover="this.style.color='#ef4444'"
              onmouseout="this.style.color='var(--text-secondary)'"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        ` : `
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; padding: 0.5rem 0.75rem; background: rgba(156, 163, 175, 0.08); border-radius: 0.375rem;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--text-muted); flex-shrink: 0;">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span style="font-size: 0.8125rem; color: var(--text-muted);">
              No agent assigned
            </span>
          </div>
        `}

        <!-- Purchase date and delete button -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border-color);">
          <p class="text-muted" style="font-size: 0.75rem; margin: 0;">
            Purchased: ${new Date(number.purchased_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            })}
          </p>
          <button
            id="delete-${number.id}"
            class="btn"
            style="
              padding: 0.375rem 0.75rem;
              font-size: 0.75rem;
              background: ${number.is_active ? '#9ca3af' : '#ef4444'};
              border-color: ${number.is_active ? '#9ca3af' : '#ef4444'};
              color: white;
              cursor: ${number.is_active ? 'not-allowed' : 'pointer'};
              opacity: ${number.is_active ? '0.6' : '1'};
            "
            ${number.is_active ? 'disabled' : ''}
            title="${number.is_active ? 'Deactivate number before deleting' : 'Delete this number'}"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline; vertical-align: middle; margin-right: 0.25rem;">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Delete
          </button>
        </div>
      </div>
    `;
  }

  renderDeletionCard(number) {
    const scheduledDate = new Date(number.scheduled_deletion_date);
    const now = new Date();
    const daysRemaining = Math.ceil((scheduledDate - now) / (1000 * 60 * 60 * 24));

    return `
      <div class="number-card" style="
        padding: 1.25rem;
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: var(--radius-md);
        background: rgba(239, 68, 68, 0.02);
        margin-bottom: 1rem;
      ">
        <!-- Header with phone number -->
        <div style="margin-bottom: 0.75rem;">
          <div style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.25rem; color: rgba(239, 68, 68, 0.8);">
            ${this.formatPhoneNumber(number.phone_number)}
          </div>
          ${number.agent?.name ? `
            <div style="font-size: 0.75rem; color: var(--text-secondary); display: flex; align-items: center; gap: 0.25rem;">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              ${number.agent.name}
            </div>
          ` : ''}
        </div>

        <!-- Deletion warning -->
        <div style="
          padding: 0.75rem;
          background: rgba(239, 68, 68, 0.04);
          border-left: 2px solid rgba(239, 68, 68, 0.4);
          border-radius: 0.25rem;
          margin-bottom: 0.75rem;
        ">
          <div style="font-size: 0.875rem; font-weight: 600; color: rgba(220, 38, 38, 0.8); margin-bottom: 0.25rem;">
            ⚠️ Scheduled for Deletion
          </div>
          <div style="font-size: 0.875rem; color: var(--text-secondary);">
            This number will be permanently deleted in <strong style="color: rgba(239, 68, 68, 0.9);">${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}</strong>
          </div>
        </div>

        <!-- Deletion date and cancel button -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(239, 68, 68, 0.1);">
          <div style="font-size: 0.75rem; color: var(--text-secondary);">
            Deletion Date: ${scheduledDate.toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            })}
          </div>
          <button
            id="cancel-delete-${number.id}"
            class="btn btn-secondary"
            style="
              padding: 0.375rem 0.75rem;
              font-size: 0.75rem;
            "
            title="Cancel deletion and restore number"
          >
            Cancel Deletion
          </button>
        </div>
      </div>
    `;
  }

  formatPhoneNumber(phoneNumber) {
    const cleaned = phoneNumber.replace(/\D/g, '');
    const match = cleaned.match(/^1?(\d{3})(\d{3})(\d{4})$/);

    if (match) {
      return `+1 (${match[1]}) ${match[2]}-${match[3]}`;
    }

    return phoneNumber;
  }

  async toggleNumber(numberId, newStatus) {
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');

    errorMessage.classList.add('hidden');
    successMessage.classList.add('hidden');

    try {
      const number = this.serviceNumbers.find(n => n.id === numberId);

      // If activating, ensure agent is created and phone is registered with Retell
      if (newStatus) {
        successMessage.className = 'alert alert-info';
        successMessage.textContent = 'Setting up AI assistant for this number...';

        // Check if user has an agent, create if not
        await this.ensureAgentExists();

        // Configure SignalWire webhooks for this number
        await this.configureSignalWireNumber(number.phone_number);
      } else {
        // If deactivating, disassociate phone from agent in Retell
        successMessage.className = 'alert alert-info';
        successMessage.textContent = 'Deactivating AI assistant for this number...';

        if (number.retell_phone_id) {
          await this.deactivatePhoneInRetell(number.phone_number);
        }
      }

      // Update the number status
      const { error } = await supabase
        .from('service_numbers')
        .update({ is_active: newStatus })
        .eq('id', numberId);

      if (error) throw error;

      // Check if this is a Canadian number and toggle paired US number
      await this.togglePairedUSNumber(number, newStatus);

      successMessage.className = 'alert alert-success';
      successMessage.textContent = `Number ${newStatus ? 'activated' : 'deactivated'} successfully`;

      // Reload numbers
      await this.loadNumbers();
    } catch (error) {
      console.error('Error toggling number:', error);
      errorMessage.className = 'alert alert-error';

      // Show detailed error if available
      let errorText = error.message || 'Failed to update number status';
      if (error.details) {
        errorText += ` (${error.details})`;
      }
      errorMessage.textContent = errorText;

      // Revert the toggle
      await this.loadNumbers();
    }
  }

  async removeAgentFromNumber(number) {
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');

    errorMessage.classList.add('hidden');
    successMessage.classList.add('hidden');

    if (!number.agent) {
      return;
    }

    try {
      // Update the service_numbers record to remove agent_id
      const { error } = await supabase
        .from('service_numbers')
        .update({ agent_id: null })
        .eq('id', number.id);

      if (error) throw error;

      successMessage.className = 'alert alert-success';
      successMessage.textContent = `Agent "${number.agent.name}" removed from ${this.formatPhoneNumber(number.phone_number)}`;

      // Reload numbers to reflect changes
      await this.loadNumbers();
    } catch (error) {
      console.error('Error removing agent from number:', error);
      errorMessage.className = 'alert alert-error';
      errorMessage.textContent = error.message || 'Failed to remove agent from number';
    }
  }

  async showAgentAssignmentModal(number) {
    // Load all agents for this user
    const { data: agents, error } = await supabase
      .from('agent_configs')
      .select('id, name')
      .eq('user_id', this.user.id)
      .order('name');

    if (error) {
      console.error('Error loading agents:', error);
      return;
    }

    const currentAgentId = number.agent_id;
    const currentAgentName = number.agent?.name;

    const modal = document.createElement('div');
    modal.id = 'agent-assignment-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
    `;

    modal.innerHTML = `
      <div style="
        background: var(--bg-primary);
        border-radius: var(--radius-lg);
        max-width: 400px;
        width: 100%;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      ">
        <div style="
          padding: 1rem;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          justify-content: space-between;
          align-items: center;
        ">
          <div>
            <h3 style="margin: 0; font-size: 1rem;">Agent Assignment</h3>
            <p style="margin: 0.25rem 0 0; font-size: 0.875rem; color: var(--text-secondary);">${this.formatPhoneNumber(number.phone_number)}</p>
          </div>
          <button id="close-agent-modal" style="
            background: transparent;
            border: none;
            padding: 0.25rem;
            cursor: pointer;
            color: var(--text-secondary);
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div style="padding: 1rem; overflow-y: auto;">
          ${currentAgentId ? `
            <div style="margin-bottom: 1rem;">
              <label style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">Current Assignment</label>
              <div style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 0.75rem;
                background: rgba(99, 102, 241, 0.1);
                border: 1px solid rgba(99, 102, 241, 0.3);
                border-radius: var(--radius-md);
                margin-top: 0.5rem;
              ">
                <span style="display: flex; align-items: center; gap: 0.5rem;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgb(99, 102, 241)" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  ${currentAgentName}
                </span>
                <button class="detach-agent-btn" data-agent-id="${currentAgentId}" style="
                  background: transparent;
                  border: 1px solid rgba(239, 68, 68, 0.5);
                  color: rgb(239, 68, 68);
                  padding: 0.25rem 0.5rem;
                  border-radius: 0.25rem;
                  font-size: 0.75rem;
                  cursor: pointer;
                ">Detach</button>
              </div>
            </div>
          ` : `
            <div style="
              padding: 0.75rem;
              background: var(--bg-secondary);
              border-radius: var(--radius-md);
              margin-bottom: 1rem;
              text-align: center;
              color: var(--text-secondary);
              font-size: 0.875rem;
            ">No agent assigned</div>
          `}

          <div>
            <label style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em;">
              ${currentAgentId ? 'Change to' : 'Assign Agent'}
            </label>
            <div style="margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem;">
              ${agents.length === 0 ? `
                <div style="
                  padding: 1rem;
                  text-align: center;
                  color: var(--text-secondary);
                  font-size: 0.875rem;
                ">No agents available. Create an agent first.</div>
              ` : agents.filter(a => a.id !== currentAgentId).map(agent => `
                <button class="assign-agent-btn" data-agent-id="${agent.id}" style="
                  display: flex;
                  align-items: center;
                  gap: 0.5rem;
                  padding: 0.75rem;
                  background: var(--bg-secondary);
                  border: 1px solid var(--border-color);
                  border-radius: var(--radius-md);
                  cursor: pointer;
                  text-align: left;
                  width: 100%;
                  color: var(--text-primary);
                  transition: border-color 0.15s;
                ">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  ${agent.name}
                </button>
              `).join('')}
              ${agents.length > 0 && agents.filter(a => a.id !== currentAgentId).length === 0 ? `
                <div style="
                  padding: 1rem;
                  text-align: center;
                  color: var(--text-secondary);
                  font-size: 0.875rem;
                ">All agents already assigned or no other agents available.</div>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close button
    document.getElementById('close-agent-modal').addEventListener('click', () => {
      modal.remove();
    });

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });

    // Detach button
    modal.querySelector('.detach-agent-btn')?.addEventListener('click', async (e) => {
      const agentName = currentAgentName;

      // Show confirmation modal
      const confirmModal = document.createElement('div');
      confirmModal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1001;
        padding: 1rem;
      `;
      confirmModal.innerHTML = `
        <div style="
          background: var(--bg-primary);
          border-radius: var(--radius-lg);
          max-width: 320px;
          width: 100%;
          padding: 1.25rem;
        ">
          <h3 style="margin: 0 0 0.5rem; font-size: 1rem;">Detach Agent?</h3>
          <p style="margin: 0 0 1rem; color: var(--text-secondary); font-size: 0.875rem;">
            Remove <strong>${agentName}</strong> from ${this.formatPhoneNumber(number.phone_number)}? The agent will no longer handle calls or messages on this number.
          </p>
          <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
            <button id="cancel-detach" class="btn btn-secondary btn-sm">Cancel</button>
            <button id="confirm-detach" class="btn btn-sm" style="background: rgb(239, 68, 68); color: white;">Detach</button>
          </div>
        </div>
      `;
      document.body.appendChild(confirmModal);

      document.getElementById('cancel-detach').addEventListener('click', () => {
        confirmModal.remove();
      });

      document.getElementById('confirm-detach').addEventListener('click', async () => {
        const confirmBtn = document.getElementById('confirm-detach');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Detaching...';

        const { error } = await supabase
          .from('service_numbers')
          .update({ agent_id: null })
          .eq('id', number.id);

        if (error) {
          console.error('Error detaching agent:', error);
          confirmBtn.disabled = false;
          confirmBtn.textContent = 'Detach';
          confirmModal.remove();
          return;
        }

        confirmModal.remove();
        modal.remove();
        await this.loadNumbers();
      });
    });

    // Assign buttons
    modal.querySelectorAll('.assign-agent-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const agentId = btn.dataset.agentId;
        btn.disabled = true;
        btn.style.opacity = '0.5';

        const { error } = await supabase
          .from('service_numbers')
          .update({ agent_id: agentId })
          .eq('id', number.id);

        if (error) {
          console.error('Error assigning agent:', error);
          btn.disabled = false;
          btn.style.opacity = '1';
          return;
        }

        modal.remove();
        await this.loadNumbers();
      });
    });
  }

  async togglePairedUSNumber(canadianNumber, newStatus) {
    try {
      // Check if this is a Canadian number
      const isCanadian = canadianNumber.phone_number.startsWith('+1604') ||
                         canadianNumber.phone_number.startsWith('+1778') ||
                         canadianNumber.phone_number.startsWith('+1236') ||
                         canadianNumber.phone_number.startsWith('+1250');

      if (!isCanadian) {
        console.log('Not a Canadian number, skipping paired US number toggle');
        return;
      }

      // Get authenticated user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Find the paired US number (has "Auto US Relay" in friendly_name and same user_id)
      const { data: pairedNumbers, error: searchError } = await supabase
        .from('service_numbers')
        .select('*')
        .eq('user_id', user.id)
        .ilike('friendly_name', '%Auto US Relay%');

      if (searchError) {
        console.error('Error searching for paired US number:', searchError);
        return;
      }

      if (!pairedNumbers || pairedNumbers.length === 0) {
        console.log('No paired US relay number found');
        return;
      }

      // Toggle all paired US numbers (should typically be just one)
      for (const pairedNumber of pairedNumbers) {
        console.log(`${newStatus ? 'Activating' : 'Deactivating'} paired US number:`, pairedNumber.phone_number);

        // If activating the paired US number, configure it first
        if (newStatus) {
          await this.configureSignalWireNumber(pairedNumber.phone_number);
        } else {
          // If deactivating, deactivate in Retell
          if (pairedNumber.retell_phone_id) {
            await this.deactivatePhoneInRetell(pairedNumber.phone_number);
          }
        }

        // Update the paired number status
        const { error: updateError } = await supabase
          .from('service_numbers')
          .update({ is_active: newStatus })
          .eq('id', pairedNumber.id);

        if (updateError) {
          console.error('Error updating paired US number status:', updateError);
        } else {
          console.log(`✅ Paired US number ${newStatus ? 'activated' : 'deactivated'}`);
        }
      }
    } catch (error) {
      console.error('Error toggling paired US number:', error);
      // Don't throw - this is a non-critical operation
    }
  }

  async ensureAgentExists() {
    // Check if agent already exists
    const { data: agentConfig } = await supabase
      .from('agent_configs')
      .select('*')
      .single();

    if (agentConfig && agentConfig.retell_agent_id) {
      console.log('Agent already exists:', agentConfig.retell_agent_id);
      return agentConfig;
    }

    // Create agent
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const { data: { session } } = await supabase.auth.getSession();

    const response = await fetch(`${supabaseUrl}/functions/v1/create-retell-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        agentConfig: {
          name: 'AI Assistant',
          prompt: 'You are a helpful AI assistant answering calls for the user. Be friendly, professional, and helpful. Take messages and provide information as needed.',
        }
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error('Failed to set up AI assistant');
    }

    return await response.json();
  }

  async configureSignalWireNumber(phoneNumber) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const { data: { session } } = await supabase.auth.getSession();

    const response = await fetch(`${supabaseUrl}/functions/v1/configure-signalwire-number`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ phoneNumber }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Configure SignalWire error:', errorData);
      const error = new Error(errorData.error || errorData.message || 'Failed to configure number');
      error.details = errorData.details;
      error.status = errorData.status;
      throw error;
    }

    return await response.json();
  }

  async deactivatePhoneInRetell(phoneNumber) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const { data: { session } } = await supabase.auth.getSession();

    const response = await fetch(`${supabaseUrl}/functions/v1/deactivate-phone-in-retell`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ phoneNumber }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error('Failed to deactivate number');
    }

    return await response.json();
  }

  async fixCapabilities() {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(`${supabaseUrl}/functions/v1/fix-number-capabilities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fix capabilities');
      }

      const result = await response.json();

      // Silently reload numbers to show updated capabilities
      if (result.updated > 0) {
        await this.loadNumbers();
      }
    } catch (error) {
      // Log error silently, don't show to user
      console.error('Error fixing capabilities:', error);
    }
  }
}