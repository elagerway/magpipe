import { supabase } from '../../lib/supabase.js';
import { showToast } from '../../lib/toast.js';
import { User, Organization } from '../../models/index.js';

// System agent UUID for unassigned numbers
const SYSTEM_AGENT_ID = '00000000-0000-0000-0000-000000000002';

export const numberManagementMethods = {
  async loadServiceNumbers() {
    const select = document.getElementById('caller-id-select');
    if (!select) return;

    // Load SignalWire service numbers
    const { data: serviceNumbers, error: serviceError } = await supabase
      .from('service_numbers')
      .select('phone_number')
      .eq('user_id', this.userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (serviceError) {
      console.error('Error loading service numbers:', serviceError);
    }

    // Load external SIP trunk numbers
    const { data: externalNumbers, error: externalError } = await supabase
      .from('external_sip_numbers')
      .select('phone_number, friendly_name, external_sip_trunks!inner(name, is_active)')
      .eq('user_id', this.userId)
      .eq('is_active', true)
      .eq('external_sip_trunks.is_active', true);

    if (externalError) {
      console.error('Error loading external SIP numbers:', externalError);
    }

    const allNumbers = [];

    // Add service numbers
    if (serviceNumbers && serviceNumbers.length > 0) {
      serviceNumbers.forEach(num => {
        allNumbers.push({
          phone_number: num.phone_number,
          label: num.phone_number,
          source: 'signalwire'
        });
      });
    }

    // Add external SIP numbers
    if (externalNumbers && externalNumbers.length > 0) {
      externalNumbers.forEach(num => {
        const trunkName = num.external_sip_trunks?.name || 'External';
        allNumbers.push({
          phone_number: num.phone_number,
          label: `${num.phone_number} (${trunkName})`,
          source: 'external_sip'
        });
      });
    }

    if (allNumbers.length > 0) {
      select.innerHTML = allNumbers
        .map(num => `<option value="${num.phone_number}" data-source="${num.source}">${num.label}</option>`)
        .join('');
    } else {
      select.innerHTML = '<option value="">No numbers available</option>';
    }
  },

  async loadServiceNumbersList() {
    const container = document.getElementById('numbers-list-container');
    if (!container) return;

    try {
      // Load service numbers with assigned agent info
      const { data: numbers, error } = await supabase
        .from('service_numbers')
        .select(`
          *,
          agent:agent_configs!service_numbers_agent_id_fkey (
            id,
            name
          ),
          text_agent:agent_configs!service_numbers_text_agent_id_fkey (
            id,
            name
          )
        `)
        .eq('user_id', this.userId)
        .order('purchased_at', { ascending: false });

      if (error) throw error;

      this.serviceNumbers = (numbers || []).map(n => ({ ...n, source: 'signalwire' }));

      // Load external SIP numbers
      const { data: extNumbers } = await supabase
        .from('external_sip_numbers')
        .select('*, trunk:external_sip_trunks!inner(name), agent:agent_configs(id, name)')
        .eq('user_id', this.userId);

      if (extNumbers) {
        const mapped = extNumbers.map(n => ({
          id: n.id,
          phone_number: n.phone_number,
          is_active: !!n.agent,
          source: 'external_sip',
          trunk_name: n.trunk?.name,
          capabilities: n.capabilities || { voice: true, sms: false, mms: false },
          agent: n.agent || null,
        }));
        this.serviceNumbers = [...this.serviceNumbers, ...mapped];
      }

      // Sync capabilities from SignalWire and is_active based on agent assignment (non-blocking)
      this.syncNumbersState(this.serviceNumbers);

      // Load numbers scheduled for deletion
      const { data: toDelete, error: deleteError } = await supabase
        .from('numbers_to_delete')
        .select('*')
        .eq('user_id', this.userId)
        .eq('deletion_status', 'pending')
        .order('scheduled_deletion_date', { ascending: true });

      if (deleteError) console.error('Error loading deletion queue:', deleteError);
      this.numbersToDelete = toDelete || [];

      if (this.serviceNumbers.length === 0 && this.numbersToDelete.length === 0) {
        container.innerHTML = `
          <div class="text-muted" style="text-align: center; padding: 2rem;">
            <p style="margin-bottom: 1rem;">You don't have any service numbers yet</p>
            <button class="btn btn-primary" onclick="navigateTo('/select-number')">
              Get Your First Number
            </button>
          </div>
        `;
      } else {
        container.innerHTML = this.renderServiceNumbersList();
        this.attachNumbersEventListeners();
      }
    } catch (error) {
      console.error('Error loading numbers:', error);
      container.innerHTML = `
        <div class="text-muted" style="text-align: center; padding: 2rem; color: var(--error-color);">
          Failed to load numbers: ${error.message}
        </div>
      `;
    }
  },

  async syncNumbersState(numbers) {
    const SYSTEM_AGENT_ID = '00000000-0000-0000-0000-000000000002';
    try {
      // Sync is_active based on agent assignment
      for (const num of numbers) {
        const isAssigned = num.agent && num.agent.id !== SYSTEM_AGENT_ID;
        if (num.is_active !== !!isAssigned) {
          const table = num.source === 'external_sip' ? 'external_sip_numbers' : 'service_numbers';
          await supabase.from(table).update({ is_active: !!isAssigned }).eq('id', num.id);
        }
      }

      // Sync capabilities from providers
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const syncCalls = [];
        const hasSignalWire = numbers.some(n => n.source === 'signalwire');
        const hasExternal = numbers.some(n => n.source === 'external_sip');

        if (hasSignalWire) {
          syncCalls.push(fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fix-number-capabilities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          }));
        }
        if (hasExternal) {
          syncCalls.push(fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-external-capabilities`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          }));
        }

        const results = await Promise.allSettled(syncCalls);
        let anyUpdated = false;
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value.ok) {
            const json = await r.value.json();
            if (json.updated > 0) anyUpdated = true;
          }
        }

        if (anyUpdated) {
          // Reload capabilities from both tables
          const [swFresh, extFresh] = await Promise.all([
            supabase.from('service_numbers').select('id, capabilities').eq('user_id', this.userId),
            supabase.from('external_sip_numbers').select('id, capabilities').eq('user_id', this.userId),
          ]);
          for (const f of (swFresh.data || []).concat(extFresh.data || [])) {
            const num = this.serviceNumbers.find(n => n.id === f.id);
            if (num) num.capabilities = f.capabilities;
          }
          const container = document.getElementById('numbers-list-container');
          if (container) {
            container.innerHTML = this.renderServiceNumbersList();
            this.attachNumbersEventListeners();
          }
        }
      }
    } catch (err) {
      console.error('Error syncing numbers state:', err);
    }
  },

  renderServiceNumbersList() {
    // Filter out US Relay numbers
    const SYSTEM_AGENT_ID = '00000000-0000-0000-0000-000000000002';
    const isUSRelay = (n) => n.friendly_name?.includes('Auto US Relay');
    const isAssigned = (n) => n.agent && n.agent.id !== SYSTEM_AGENT_ID;
    const activeNumbers = this.serviceNumbers.filter(n => isAssigned(n) && !isUSRelay(n));
    const inactiveNumbers = this.serviceNumbers.filter(n => !isAssigned(n) && !isUSRelay(n));

    return `
      ${activeNumbers.length > 0 ? `
        <div style="margin-bottom: 1.5rem;">
          <h3 style="margin-bottom: 0.75rem; font-size: 0.875rem; display: flex; align-items: center; gap: 0.5rem;">
            <span style="width: 8px; height: 8px; background: #10b981; border-radius: 50%;"></span>
            Active (${activeNumbers.length})
          </h3>
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${activeNumbers.map(num => this.renderNumberItem(num)).join('')}
          </div>
        </div>
      ` : ''}

      ${inactiveNumbers.length > 0 ? `
        <div style="margin-bottom: 1.5rem;">
          <h3 style="margin-bottom: 0.75rem; font-size: 0.875rem; display: flex; align-items: center; gap: 0.5rem;">
            <span style="width: 8px; height: 8px; background: #9ca3af; border-radius: 50%;"></span>
            Inactive (${inactiveNumbers.length})
          </h3>
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${inactiveNumbers.map(num => this.renderNumberItem(num)).join('')}
          </div>
        </div>
      ` : ''}

      ${this.numbersToDelete.length > 0 ? `
        <div>
          <h3 style="margin-bottom: 0.75rem; font-size: 0.875rem; display: flex; align-items: center; gap: 0.5rem;">
            <span style="width: 8px; height: 8px; background: #ef4444; border-radius: 50%;"></span>
            Scheduled for Deletion (${this.numbersToDelete.length})
          </h3>
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${this.numbersToDelete.map(num => this.renderDeletionItem(num)).join('')}
          </div>
        </div>
      ` : ''}
    `;
  },

  renderNumberItem(number) {
    const capabilities = number.capabilities || {};
    const hasVoice = capabilities.voice !== false;
    const hasSms = capabilities.sms !== false;
    const SYSTEM_AGENT_ID = '00000000-0000-0000-0000-000000000002';
    const isAssigned = number.agent && number.agent.id !== SYSTEM_AGENT_ID;
    const agentName = isAssigned ? number.agent.name : null;

    return `
      <div class="number-item" style="
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding: 0.75rem;
        background: var(--bg-secondary);
        border-radius: var(--radius-md);
        border: none;
      " data-number-id="${number.id}">
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; font-size: 0.9375rem;">${this.formatPhoneNumber(number.phone_number)}</div>
          ${number.source === 'external_sip' && number.trunk_name ? `<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.125rem;">${number.trunk_name}</div>` : ''}
          <div style="display: flex; gap: 0.5rem; margin-top: 0.25rem;">
            ${hasVoice ? '<span style="font-size: 0.7rem; padding: 0.125rem 0.375rem; background: rgba(34, 197, 94, 0.1); color: rgb(34, 197, 94); border-radius: 0.25rem;">Voice</span>' : ''}
            ${hasSms ? '<span style="font-size: 0.7rem; padding: 0.125rem 0.375rem; background: rgba(59, 130, 246, 0.1); color: rgb(59, 130, 246); border-radius: 0.25rem;">SMS</span>' : ''}
            ${number.cnam_name ? `<span style="font-size: 0.7rem; padding: 0.125rem 0.375rem; background: rgba(168, 85, 247, 0.1); color: rgb(168, 85, 247); border-radius: 0.25rem;">CNAM: ${number.cnam_name}</span>` : ''}
          </div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.375rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <button class="edit-number-btn" data-number-id="${number.id}" style="
              background: transparent;
              border: none;
              padding: 0.25rem;
              cursor: pointer;
              color: var(--text-secondary);
              display: flex;
              align-items: center;
              justify-content: center;
              border-radius: 0.25rem;
            " title="Manage agent assignment">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="1"/>
                <circle cx="12" cy="5" r="1"/>
                <circle cx="12" cy="19" r="1"/>
              </svg>
            </button>
            <label class="toggle-switch" style="margin: 0;">
              <input type="checkbox" class="number-toggle" data-id="${number.id}" ${isAssigned ? 'checked' : ''} />
              <span class="toggle-slider"></span>
            </label>
          </div>
          ${agentName ? `
            <span style="font-size: 0.7rem; padding: 0.125rem 0.375rem; background: rgba(99, 102, 241, 0.1); color: rgb(99, 102, 241); border-radius: 0.25rem; display: inline-flex; align-items: center; gap: 0.25rem;">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              ${number.text_agent?.name ? 'Voice: ' : ''}${agentName}
            </span>
          ` : ''}
          ${number.text_agent?.name ? `
            <span style="font-size: 0.7rem; padding: 0.125rem 0.375rem; background: rgba(21, 128, 61, 0.1); color: rgb(21, 128, 61); border-radius: 0.25rem; display: inline-flex; align-items: center; gap: 0.25rem;">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              Text: ${number.text_agent.name}
            </span>
          ` : ''}
        </div>
      </div>
    `;
  },

  renderDeletionItem(number) {
    const scheduledDate = new Date(number.scheduled_deletion_date);
    const now = new Date();
    const daysRemaining = Math.ceil((scheduledDate - now) / (1000 * 60 * 60 * 24));

    return `
      <div class="number-item" style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem;
        background: rgba(239, 68, 68, 0.05);
        border-radius: var(--radius-md);
        border: 1px solid rgba(239, 68, 68, 0.3);
      " data-deletion-id="${number.id}">
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; font-size: 0.9375rem; color: rgba(239, 68, 68, 0.8);">${this.formatPhoneNumber(number.phone_number)}</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">
            Deletes in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}
          </div>
        </div>
        <button class="btn btn-sm btn-secondary cancel-deletion-btn" data-phone="${number.phone_number}">
          Cancel
        </button>
      </div>
    `;
  },

  attachNumbersEventListeners() {
    // Add number button
    const addNumberBtn = document.getElementById('add-number-btn');
    addNumberBtn?.addEventListener('click', () => {
      navigateTo('/select-number');
    });

    // Toggle switches
    document.querySelectorAll('.number-toggle').forEach(toggle => {
      toggle.addEventListener('change', async (e) => {
        const numberId = e.target.dataset.id;
        const newStatus = e.target.checked;
        await this.toggleNumberStatus(numberId, newStatus);
      });
    });

    // Edit number buttons
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

    // Cancel deletion buttons
    document.querySelectorAll('.cancel-deletion-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const phoneNumber = e.target.dataset.phone;
        await this.cancelDeletion(phoneNumber);
      });
    });
  },

  async toggleNumberStatus(numberId, newStatus) {
    try {
      const number = this.serviceNumbers.find(n => n.id === numberId);
      if (!number) return;

      // Update the number status in the correct table
      const table = number.source === 'external_sip' ? 'external_sip_numbers' : 'service_numbers';
      const { error } = await supabase
        .from(table)
        .update({ is_active: newStatus })
        .eq('id', numberId);

      if (error) throw error;

      // Reload the list
      await this.loadServiceNumbersList();

      // Also reload the caller ID dropdown
      await this.loadServiceNumbers();
    } catch (error) {
      console.error('Error toggling number:', error);
      showToast(`Failed to update number: ${error.message}`, 'error');
      // Reload to revert UI
      await this.loadServiceNumbersList();
    }
  },

  async cancelDeletion(phoneNumber) {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cancel-number-deletion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ phone_number: phoneNumber }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to cancel deletion');
      }

      // Reload the list
      await this.loadServiceNumbersList();
    } catch (error) {
      console.error('Error cancelling deletion:', error);
      showToast(`Failed to cancel deletion: ${error.message}`, 'error');
    }
  },

  async renderBrandedCallingSummary() {
    const container = document.getElementById('branded-calling-summary');
    if (!container) return;

    // Get SignalWire numbers only (CNAM doesn't apply to external SIP)
    const swNumbers = this.serviceNumbers.filter(n => n.source === 'signalwire');
    if (swNumbers.length === 0) {
      container.innerHTML = '<div class="text-muted" style="font-size: 0.875rem;">No service numbers configured yet.</div>';
      return;
    }

    // Fetch pending CNAM requests
    const numberIds = swNumbers.map(n => n.id);
    const { data: pendingRequests } = await supabase
      .from('cnam_requests')
      .select('service_number_id, requested_name, status')
      .in('service_number_id', numberIds)
      .in('status', ['pending', 'submitted', 'processing']);

    const pendingMap = {};
    (pendingRequests || []).forEach(r => {
      pendingMap[r.service_number_id] = r;
    });

    const activeNumbers = swNumbers.filter(n => n.cnam_name);
    const pendingNumbers = swNumbers.filter(n => !n.cnam_name && pendingMap[n.id]);

    if (activeNumbers.length === 0 && pendingNumbers.length === 0) {
      container.innerHTML = '<div class="text-muted" style="font-size: 0.875rem;">No branded numbers configured yet.</div>';
      return;
    }

    const chips = [];
    activeNumbers.forEach(n => {
      chips.push(`<span style="
        display: inline-flex; align-items: center; gap: 0.375rem;
        font-size: 0.75rem; padding: 0.25rem 0.5rem;
        background: rgba(168, 85, 247, 0.1); color: rgb(168, 85, 247);
        border-radius: 0.375rem; font-weight: 500;
      ">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
          <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        ${this.formatPhoneNumber(n.phone_number)} — ${n.cnam_name}
      </span>`);
    });
    pendingNumbers.forEach(n => {
      const req = pendingMap[n.id];
      chips.push(`<span style="
        display: inline-flex; align-items: center; gap: 0.375rem;
        font-size: 0.75rem; padding: 0.25rem 0.5rem;
        background: rgba(234, 179, 8, 0.1); color: rgb(180, 140, 10);
        border-radius: 0.375rem; font-weight: 500;
      ">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        ${this.formatPhoneNumber(n.phone_number)} — "${req.requested_name}" (Pending)
      </span>`);
    });

    container.innerHTML = `<div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">${chips.join('')}</div>`;
  },

  async showBrandedCallingModal() {
    // Fetch org name for pre-population
    const { organization } = await Organization.getForUser(this.userId);
    const orgName = organization?.name ? organization.name.substring(0, 15) : '';

    // Get SignalWire numbers only
    const swNumbers = this.serviceNumbers.filter(n => n.source === 'signalwire');

    // Fetch latest CNAM requests for all numbers
    const numberIds = swNumbers.map(n => n.id);
    const { data: cnamRequests } = await supabase
      .from('cnam_requests')
      .select('service_number_id, requested_name, status')
      .in('service_number_id', numberIds)
      .order('created_at', { ascending: false });

    // Build a map of latest request per number
    const latestRequestMap = {};
    (cnamRequests || []).forEach(r => {
      if (!latestRequestMap[r.service_number_id]) {
        latestRequestMap[r.service_number_id] = r;
      }
    });

    // Identify unconfigured numbers (no active CNAM, no pending request)
    const unconfiguredNumbers = swNumbers.filter(num => {
      const req = latestRequestMap[num.id];
      const isPending = req && ['pending', 'submitted', 'processing'].includes(req.status);
      return !num.cnam_name && !isPending;
    });

    const modal = document.createElement('div');
    modal.id = 'branded-calling-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
    `;

    const numberRows = swNumbers.map(num => {
      const req = latestRequestMap[num.id];
      const isPending = req && ['pending', 'submitted', 'processing'].includes(req.status);

      if (num.cnam_name) {
        // Active CNAM
        return `
          <div style="
            display: flex; justify-content: space-between; align-items: center;
            padding: 0.75rem;
            background: var(--bg-secondary);
            border-radius: var(--radius-md);
          ">
            <div>
              <div style="font-weight: 600; font-size: 0.9375rem;">${this.formatPhoneNumber(num.phone_number)}</div>
              <div style="display: flex; align-items: center; gap: 0.375rem; margin-top: 0.25rem; color: rgb(168, 85, 247); font-size: 0.8rem; font-weight: 500;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                ${num.cnam_name}
              </div>
            </div>
            <span style="font-size: 0.7rem; color: rgb(168, 85, 247); padding: 0.125rem 0.5rem; background: rgba(168, 85, 247, 0.1); border-radius: 0.25rem; font-weight: 500;">Active</span>
          </div>
        `;
      } else if (isPending) {
        // Pending request
        return `
          <div style="
            display: flex; justify-content: space-between; align-items: center;
            padding: 0.75rem;
            background: var(--bg-secondary);
            border-radius: var(--radius-md);
          ">
            <div>
              <div style="font-weight: 600; font-size: 0.9375rem;">${this.formatPhoneNumber(num.phone_number)}</div>
              <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">"${req.requested_name}"</div>
            </div>
            <span style="font-size: 0.7rem; color: rgb(234, 179, 8); padding: 0.125rem 0.5rem; background: rgba(234, 179, 8, 0.1); border-radius: 0.25rem; font-weight: 500;">Pending</span>
          </div>
        `;
      } else {
        // Unconfigured - shows "Using global" by default, with override option
        return `
          <div style="
            padding: 0.75rem;
            background: var(--bg-secondary);
            border-radius: var(--radius-md);
          " data-cnam-row="${num.id}">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="font-weight: 600; font-size: 0.9375rem;">${this.formatPhoneNumber(num.phone_number)}</div>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span class="cnam-using-global" data-number-id="${num.id}" style="font-size: 0.7rem; color: var(--text-secondary); font-style: italic;">Using global name</span>
                <button class="btn btn-sm cnam-override-btn" data-number-id="${num.id}" style="
                  background: transparent;
                  color: var(--text-secondary);
                  border: 1px solid var(--border-color);
                  padding: 0.25rem 0.5rem;
                  font-size: 0.7rem;
                  cursor: pointer;
                ">Override</button>
              </div>
            </div>
            <div class="cnam-override-input" data-number-id="${num.id}" style="display: none; margin-top: 0.5rem;">
              <div style="display: flex; gap: 0.5rem; align-items: flex-end;">
                <div style="flex: 1;">
                  <input type="text" class="cnam-input" data-number-id="${num.id}" maxlength="15"
                    placeholder="Different name for this number" value=""
                    style="
                      width: 100%;
                      padding: 0.5rem 0.75rem;
                      border: 1px solid var(--border-color);
                      border-radius: var(--radius-md);
                      background: var(--bg-primary);
                      color: var(--text-primary);
                      font-size: 0.875rem;
                      box-sizing: border-box;
                    "
                  />
                  <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 0.25rem; text-align: right;">
                    <span class="cnam-char-count">0</span>/15 characters
                  </div>
                </div>
                <button class="btn btn-sm cnam-submit-single-btn" data-number-id="${num.id}" style="
                  background: rgb(168, 85, 247);
                  color: white;
                  border: none;
                  padding: 0.5rem 0.75rem;
                  white-space: nowrap;
                  margin-bottom: 1.25rem;
                ">Submit</button>
              </div>
              <button class="cnam-cancel-override-btn" data-number-id="${num.id}" style="
                background: none; border: none; color: var(--text-secondary);
                font-size: 0.75rem; cursor: pointer; padding: 0; margin-top: 0.25rem;
                text-decoration: underline;
              ">Cancel — use global name</button>
            </div>
          </div>
        `;
      }
    }).join('');

    modal.innerHTML = `
      <div style="
        background: var(--bg-primary);
        border-radius: var(--radius-lg);
        max-width: 480px;
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
          <h3 style="margin: 0; font-size: 1rem;">Branded Calling</h3>
          <button id="close-branded-modal" style="
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
          <div style="
            padding: 0.75rem;
            background: rgba(234, 179, 8, 0.08);
            border: 1px solid rgba(234, 179, 8, 0.25);
            border-radius: var(--radius-md);
            margin-bottom: 1rem;
            font-size: 0.8rem;
            color: var(--text-secondary);
            line-height: 1.4;
          ">
            CNAM registration is submitted to telecom carriers and typically takes 3–7 business days to propagate across networks. Some carriers may take longer.
          </div>

          <!-- Global Brand Name -->
          <div style="
            padding: 1rem;
            background: rgba(168, 85, 247, 0.05);
            border: 1px solid rgba(168, 85, 247, 0.2);
            border-radius: var(--radius-md);
            margin-bottom: 1rem;
          ">
            <label style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600;">
              Global Brand Name
            </label>
            <p style="font-size: 0.75rem; color: var(--text-secondary); margin: 0.25rem 0 0.5rem;">
              Applies to all numbers below. Per-number overrides take precedence.
            </p>
            <div style="display: flex; gap: 0.5rem; align-items: flex-end;">
              <div style="flex: 1;">
                <input type="text" id="global-cnam-input" maxlength="15"
                  placeholder="Business name" value="${orgName}"
                  style="
                    width: 100%;
                    padding: 0.5rem 0.75rem;
                    border: 1px solid rgba(168, 85, 247, 0.3);
                    border-radius: var(--radius-md);
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    font-size: 0.9375rem;
                    font-weight: 600;
                    box-sizing: border-box;
                  "
                />
                <div style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 0.25rem; text-align: right;">
                  <span id="global-cnam-char-count">${orgName.length}</span>/15 characters
                </div>
              </div>
              ${unconfiguredNumbers.length > 0 ? `
                <button id="apply-global-cnam-btn" class="btn btn-sm" style="
                  background: rgb(168, 85, 247);
                  color: white;
                  border: none;
                  padding: 0.5rem 0.75rem;
                  white-space: nowrap;
                  margin-bottom: 1.25rem;
                  font-weight: 600;
                ">Apply to All (${unconfiguredNumbers.length})</button>
              ` : ''}
            </div>
          </div>

          <!-- Per-Number List -->
          ${swNumbers.length === 0 ? `
            <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
              No service numbers available. Add a number first.
            </div>
          ` : `
            <label style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; display: block;">
              Numbers
            </label>
            <div style="display: flex; flex-direction: column; gap: 0.5rem;">
              ${numberRows}
            </div>
          `}
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Global character counter
    const globalInput = document.getElementById('global-cnam-input');
    const globalCharCount = document.getElementById('global-cnam-char-count');
    if (globalInput && globalCharCount) {
      globalInput.addEventListener('input', () => {
        globalCharCount.textContent = globalInput.value.length;
      });
    }

    // Override buttons — show per-number input, hide "Using global" label
    modal.querySelectorAll('.cnam-override-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const numberId = btn.dataset.numberId;
        const overrideDiv = modal.querySelector(`.cnam-override-input[data-number-id="${numberId}"]`);
        const usingGlobalLabel = modal.querySelector(`.cnam-using-global[data-number-id="${numberId}"]`);
        if (overrideDiv) overrideDiv.style.display = 'block';
        if (usingGlobalLabel) usingGlobalLabel.style.display = 'none';
        btn.style.display = 'none';
        // Focus the input
        const input = overrideDiv?.querySelector('.cnam-input');
        if (input) input.focus();
      });
    });

    // Cancel override buttons — hide input, show "Using global" label
    modal.querySelectorAll('.cnam-cancel-override-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const numberId = btn.dataset.numberId;
        const overrideDiv = modal.querySelector(`.cnam-override-input[data-number-id="${numberId}"]`);
        const usingGlobalLabel = modal.querySelector(`.cnam-using-global[data-number-id="${numberId}"]`);
        const overrideBtn = modal.querySelector(`.cnam-override-btn[data-number-id="${numberId}"]`);
        if (overrideDiv) overrideDiv.style.display = 'none';
        if (usingGlobalLabel) usingGlobalLabel.style.display = '';
        if (overrideBtn) overrideBtn.style.display = '';
        // Clear the input
        const input = overrideDiv?.querySelector('.cnam-input');
        if (input) input.value = '';
      });
    });

    // Character counters for per-number inputs
    modal.querySelectorAll('.cnam-input').forEach(input => {
      const row = input.closest('[data-cnam-row]');
      const counter = row?.querySelector('.cnam-char-count');
      if (counter) {
        input.addEventListener('input', () => {
          counter.textContent = input.value.length;
        });
      }
    });

    // Helper: submit CNAM for a single number, returns true on success
    const submitCnamForNumber = async (numberId, name, session) => {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-cnam-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          serviceNumberId: numberId,
          requestedName: name,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit CNAM request');
      }
      return true;
    };

    // Helper: replace a row with pending badge
    const replaceRowWithPending = (numberId, name) => {
      const row = modal.querySelector(`[data-cnam-row="${numberId}"]`);
      if (row) {
        const num = swNumbers.find(n => n.id === numberId);
        row.removeAttribute('data-cnam-row');
        row.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-weight: 600; font-size: 0.9375rem;">${this.formatPhoneNumber(num?.phone_number || '')}</div>
              <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.25rem;">"${name}"</div>
            </div>
            <span style="font-size: 0.7rem; color: rgb(234, 179, 8); padding: 0.125rem 0.5rem; background: rgba(234, 179, 8, 0.1); border-radius: 0.25rem; font-weight: 500;">Pending</span>
          </div>
        `;
      }
    };

    // "Apply to All" button — submits global name for all unconfigured numbers
    const applyAllBtn = document.getElementById('apply-global-cnam-btn');
    if (applyAllBtn && globalInput) {
      applyAllBtn.addEventListener('click', async () => {
        const name = globalInput.value.trim();
        if (!name || name.length < 2) {
          showToast('Global name must be at least 2 characters', 'error');
          return;
        }
        if (name.length > 15) {
          showToast('Global name must be 15 characters or less', 'error');
          return;
        }

        // Find remaining unconfigured rows (not yet submitted)
        const remainingRows = modal.querySelectorAll('[data-cnam-row]');
        if (remainingRows.length === 0) {
          showToast('All numbers already configured', 'info');
          return;
        }

        applyAllBtn.disabled = true;
        applyAllBtn.textContent = 'Submitting...';

        try {
          const { data: { session } } = await supabase.auth.getSession();
          let successCount = 0;

          for (const row of remainingRows) {
            const numberId = row.dataset.cnamRow;
            // Check if this number has a per-number override input visible with a value
            const overrideDiv = row.querySelector('.cnam-override-input');
            const overrideInput = row.querySelector('.cnam-input');
            const isOverriding = overrideDiv?.style.display !== 'none' && overrideInput?.value.trim();
            const nameToSubmit = isOverriding ? overrideInput.value.trim() : name;

            try {
              await submitCnamForNumber(numberId, nameToSubmit, session);
              replaceRowWithPending(numberId, nameToSubmit);
              successCount++;
            } catch (err) {
              console.error(`CNAM submit error for ${numberId}:`, err);
            }
          }

          if (successCount > 0) {
            showToast(`CNAM submitted for ${successCount} number${successCount > 1 ? 's' : ''}`, 'success');
            this.renderBrandedCallingSummary();
          }

          // Update button or hide if all done
          const stillUnconfigured = modal.querySelectorAll('[data-cnam-row]');
          if (stillUnconfigured.length === 0) {
            applyAllBtn.style.display = 'none';
          } else {
            applyAllBtn.disabled = false;
            applyAllBtn.textContent = `Apply to All (${stillUnconfigured.length})`;
          }
        } catch (err) {
          console.error('Apply all error:', err);
          showToast(err.message || 'Failed to submit CNAM requests', 'error');
          applyAllBtn.disabled = false;
          applyAllBtn.textContent = `Apply to All (${remainingRows.length})`;
        }
      });
    }

    // Per-number submit buttons (for overrides)
    modal.querySelectorAll('.cnam-submit-single-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const numberId = btn.dataset.numberId;
        const row = modal.querySelector(`[data-cnam-row="${numberId}"]`);
        const input = row?.querySelector('.cnam-input');
        if (!input) return;

        const name = input.value.trim();
        if (!name || name.length < 2) {
          showToast('Name must be at least 2 characters', 'error');
          return;
        }
        if (name.length > 15) {
          showToast('Name must be 15 characters or less', 'error');
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Submitting...';

        try {
          const { data: { session } } = await supabase.auth.getSession();
          await submitCnamForNumber(numberId, name, session);

          showToast('CNAM request submitted', 'success');
          replaceRowWithPending(numberId, name);
          this.renderBrandedCallingSummary();

          // Update "Apply to All" button count
          const stillUnconfigured = modal.querySelectorAll('[data-cnam-row]');
          const applyBtn = document.getElementById('apply-global-cnam-btn');
          if (applyBtn) {
            if (stillUnconfigured.length === 0) {
              applyBtn.style.display = 'none';
            } else {
              applyBtn.textContent = `Apply to All (${stillUnconfigured.length})`;
            }
          }
        } catch (err) {
          console.error('CNAM submit error:', err);
          showToast(err.message || 'Failed to submit CNAM request', 'error');
          btn.disabled = false;
          btn.textContent = 'Submit';
        }
      });
    });

    // Close button
    document.getElementById('close-branded-modal').addEventListener('click', () => {
      modal.remove();
    });

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  },

  async showAgentAssignmentModal(number) {
    // Load all agents for this user (excluding system agent)
    const { data: agents, error } = await supabase
      .from('agent_configs')
      .select('id, name')
      .eq('user_id', this.userId)
      .neq('id', SYSTEM_AGENT_ID)
      .order('name');

    if (error) {
      console.error('Error loading agents:', error);
      return;
    }

    // Don't show current assignment if it's the system agent
    const isSystemAgent = number.agent_id === SYSTEM_AGENT_ID;
    const currentAgentId = isSystemAgent ? null : number.agent_id;
    const currentAgentName = isSystemAgent ? null : number.agent?.name;

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
            ">System default (not assigned)</div>
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
      const btn = e.target;
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
          .update({ agent_id: SYSTEM_AGENT_ID })
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
        await this.loadServiceNumbersList();
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
        await this.loadServiceNumbersList();
      });
    });
  },

};
