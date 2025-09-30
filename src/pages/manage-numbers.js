/**
 * Service Numbers Management Page
 */

import { getCurrentUser, supabase } from '../lib/supabase.js';
import { renderBottomNav } from '../components/BottomNav.js';

export default class ManageNumbersPage {
  constructor() {
    this.serviceNumbers = [];
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container with-bottom-nav" style="max-width: 1000px; padding-top: 1rem;">
        <div style="margin-bottom: 1.5rem;">
          <h1 style="margin-bottom: 0.5rem;">My Service Numbers</h1>
          <p class="text-muted" style="margin-bottom: 1rem;">Manage your phone numbers for Pat AI</p>
          <button class="btn btn-primary btn-full" id="add-number-btn">
            + Add New Number
          </button>
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
      ${renderBottomNav('/settings')}
    `;

    this.attachEventListeners();
    await this.loadNumbers();
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
      const { data: numbers, error } = await supabase
        .from('service_numbers')
        .select('*')
        .order('purchased_at', { ascending: false });

      if (error) throw error;

      this.serviceNumbers = numbers || [];

      loading.classList.add('hidden');

      if (this.serviceNumbers.length === 0) {
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

    const activeNumbers = this.serviceNumbers.filter(n => n.is_active);
    const inactiveNumbers = this.serviceNumbers.filter(n => !n.is_active);

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
        <div>
          <h3 style="margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
            <span style="width: 8px; height: 8px; background: #9ca3af; border-radius: 50%;"></span>
            Inactive Numbers (${inactiveNumbers.length})
          </h3>
          <div style="display: grid; gap: 1rem;">
            ${inactiveNumbers.map(num => this.renderNumberCard(num)).join('')}
          </div>
        </div>
      ` : ''}
    `;

    // Attach toggle listeners
    this.serviceNumbers.forEach(num => {
      const toggleBtn = document.getElementById(`toggle-${num.id}`);
      toggleBtn?.addEventListener('click', () => this.toggleNumber(num.id, !num.is_active));
    });
  }

  renderNumberCard(number) {
    const capabilities = number.capabilities || {};
    const hasVoice = capabilities.voice !== false;
    const hasSms = capabilities.sms !== false;
    const hasMms = capabilities.mms !== false;

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
            <div style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.25rem;">
              ${this.formatPhoneNumber(number.phone_number)}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">
              ${number.friendly_name || 'Pat AI - ' + number.user_id?.substring(0, 8)}
            </div>
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
        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.75rem;">
          ${hasVoice ? `<span style="font-size: 0.875rem; color: #10b981;">📞 Voice</span>` : ''}
          ${hasSms ? `<span style="font-size: 0.875rem; color: #10b981;">💬 SMS</span>` : ''}
          ${hasMms ? `<span style="font-size: 0.875rem; color: #10b981;">📷 MMS</span>` : ''}
        </div>

        <!-- Purchase date -->
        <p class="text-muted" style="font-size: 0.75rem; margin: 0;">
          Purchased: ${new Date(number.purchased_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          })}
        </p>
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
        successMessage.textContent = 'Setting up Pat for this number...';

        // Check if user has an agent, create if not
        await this.ensureAgentExists();

        // Configure SignalWire webhooks for this number
        await this.configureSignalWireNumber(number.phone_number);
      } else {
        // If deactivating, disassociate phone from agent in Retell
        successMessage.className = 'alert alert-info';
        successMessage.textContent = 'Deactivating Pat for this number...';

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
          name: 'Pat AI Assistant',
          prompt: 'You are Pat, a helpful AI assistant answering calls for the user. Be friendly, professional, and helpful. Take messages and provide information as needed.',
        }
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error('Failed to set up Pat AI assistant');
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
}