/**
 * Bulk Calling Page - Outbound calling from contacts with agent
 */

import { getCurrentUser, supabase } from '../lib/supabase.js';
import { renderBottomNav } from '../components/BottomNav.js';
import { showToast } from '../lib/toast.js';

export default class BulkCallingPage {
  constructor() {
    this.userId = null;
    this.contacts = [];
    this.selectedContacts = new Set();
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      window.navigateTo('/login');
      return;
    }

    this.userId = user.id;

    const appElement = document.getElementById('app');
    const isMobile = window.innerWidth <= 768;

    appElement.innerHTML = `
      <div class="container with-bottom-nav" style="padding-top: 1rem;">
        <!-- Header with back button -->
        <div style="
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1.5rem;
        ">
          <button id="back-btn" style="
            display: flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 40px;
            border: none;
            border-radius: 50%;
            background: var(--bg-secondary);
            color: var(--text-primary);
            cursor: pointer;
            transition: all 0.15s ease;
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <h1 style="
            margin: 0;
            font-size: 1.5rem;
            font-weight: 600;
            color: var(--text-primary);
          ">Bulk Calling</h1>
        </div>

        <!-- Info card -->
        <div style="
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.2);
          border-radius: 12px;
          padding: 1rem;
          margin-bottom: 1.5rem;
        ">
          <div style="display: flex; gap: 0.75rem;">
            <div style="color: #6366f1; flex-shrink: 0;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 16v-4M12 8h.01"></path>
              </svg>
            </div>
            <div style="color: var(--text-secondary); font-size: 0.875rem; line-height: 1.5;">
              Select contacts from your list to make automated calls with your AI agent.
              Each contact will be called sequentially.
            </div>
          </div>
        </div>

        <!-- Caller ID selector -->
        <div style="margin-bottom: 1rem;">
          <label style="
            display: block;
            font-size: 0.875rem;
            color: var(--text-secondary);
            margin-bottom: 0.5rem;
          ">Call from:</label>
          <select id="caller-id-select" style="
            width: 100%;
            padding: 0.75rem;
            border: 1px solid rgba(128, 128, 128, 0.2);
            border-radius: 8px;
            background: var(--bg-secondary);
            color: var(--text-primary);
            font-size: 1rem;
            cursor: pointer;
            outline: none;
          ">
            <option value="">Loading numbers...</option>
          </select>
        </div>

        <!-- Select all / Start calls header -->
        <div style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        ">
          <label style="
            display: flex;
            align-items: center;
            gap: 0.5rem;
            cursor: pointer;
            user-select: none;
          ">
            <input type="checkbox" id="select-all" style="
              width: 18px;
              height: 18px;
              cursor: pointer;
            ">
            <span style="font-size: 0.875rem; color: var(--text-secondary);">
              Select all
            </span>
          </label>
          <span id="selected-count" style="
            font-size: 0.875rem;
            color: var(--text-secondary);
          ">0 selected</span>
        </div>

        <!-- Contacts list -->
        <div id="contacts-list" style="
          flex: 1;
          overflow-y: auto;
          background: var(--bg-secondary);
          border-radius: 12px;
          border: 1px solid rgba(128, 128, 128, 0.2);
        ">
          <div style="
            padding: 2rem;
            text-align: center;
            color: var(--text-secondary);
          ">Loading contacts...</div>
        </div>

        <!-- Start calling button -->
        <div style="
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid rgba(128, 128, 128, 0.2);
        ">
          <button id="start-calls-btn" disabled style="
            width: 100%;
            padding: 1rem;
            border: none;
            border-radius: 12px;
            background: linear-gradient(135deg, #10b981, #059669);
            color: white;
            font-size: 1rem;
            font-weight: 600;
            cursor: not-allowed;
            opacity: 0.5;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
            Start Calling
          </button>
        </div>
      </div>
      ${renderBottomNav('/phone')}
    `;

    this.attachEventListeners();
    await this.loadServiceNumbers();
    await this.loadContacts();
  }

  attachEventListeners() {
    // Back button
    const backBtn = document.getElementById('back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        window.navigateTo('/phone');
      });
    }

    // Select all checkbox
    const selectAllCheckbox = document.getElementById('select-all');
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', () => {
        const isChecked = selectAllCheckbox.checked;
        this.contacts.forEach(contact => {
          if (contact.phone_number) {
            if (isChecked) {
              this.selectedContacts.add(contact.id);
            } else {
              this.selectedContacts.delete(contact.id);
            }
          }
        });
        this.updateContactCheckboxes();
        this.updateSelectedCount();
      });
    }

    // Start calls button
    const startCallsBtn = document.getElementById('start-calls-btn');
    if (startCallsBtn) {
      startCallsBtn.addEventListener('click', () => {
        this.startBulkCalls();
      });
    }
  }

  async loadServiceNumbers() {
    const select = document.getElementById('caller-id-select');
    if (!select) return;

    const { data: numbers, error } = await supabase
      .from('service_numbers')
      .select('phone_number')
      .eq('user_id', this.userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading service numbers:', error);
      select.innerHTML = '<option value="">No numbers available</option>';
      return;
    }

    if (numbers && numbers.length > 0) {
      select.innerHTML = numbers
        .map(num => `<option value="${num.phone_number}">${num.phone_number}</option>`)
        .join('');
    } else {
      select.innerHTML = '<option value="">No numbers available</option>';
    }
  }

  async loadContacts() {
    const listEl = document.getElementById('contacts-list');
    if (!listEl) return;

    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', this.userId)
      .order('name', { ascending: true });

    if (error) {
      console.error('Error loading contacts:', error);
      listEl.innerHTML = `
        <div style="padding: 2rem; text-align: center; color: var(--text-secondary);">
          Error loading contacts
        </div>
      `;
      return;
    }

    this.contacts = contacts || [];

    if (this.contacts.length === 0) {
      listEl.innerHTML = `
        <div style="padding: 2rem; text-align: center; color: var(--text-secondary);">
          <div style="margin-bottom: 0.5rem;">No contacts found</div>
          <a href="#" onclick="window.navigateTo('/contacts'); return false;" style="color: #6366f1;">
            Add contacts
          </a>
        </div>
      `;
      return;
    }

    this.renderContacts();
  }

  renderContacts() {
    const listEl = document.getElementById('contacts-list');
    if (!listEl) return;

    listEl.innerHTML = this.contacts.map(contact => {
      const hasPhone = !!contact.phone_number;
      const isSelected = this.selectedContacts.has(contact.id);

      return `
        <div class="contact-row" data-id="${contact.id}" style="
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          border-bottom: 1px solid rgba(128, 128, 128, 0.1);
          cursor: ${hasPhone ? 'pointer' : 'default'};
          opacity: ${hasPhone ? '1' : '0.5'};
        ">
          <input
            type="checkbox"
            class="contact-checkbox"
            data-id="${contact.id}"
            ${isSelected ? 'checked' : ''}
            ${!hasPhone ? 'disabled' : ''}
            style="
              width: 18px;
              height: 18px;
              cursor: ${hasPhone ? 'pointer' : 'not-allowed'};
            "
          >
          <div style="flex: 1; min-width: 0;">
            <div style="
              font-weight: 500;
              color: var(--text-primary);
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            ">${contact.name || 'Unknown'}</div>
            <div style="
              font-size: 0.875rem;
              color: var(--text-secondary);
            ">${contact.phone_number || 'No phone number'}</div>
          </div>
        </div>
      `;
    }).join('');

    // Add click handlers
    listEl.querySelectorAll('.contact-row').forEach(row => {
      const id = row.dataset.id;
      const contact = this.contacts.find(c => c.id === id);
      if (!contact?.phone_number) return;

      row.addEventListener('click', (e) => {
        if (e.target.type === 'checkbox') return; // Let checkbox handle itself

        if (this.selectedContacts.has(id)) {
          this.selectedContacts.delete(id);
        } else {
          this.selectedContacts.add(id);
        }
        this.updateContactCheckboxes();
        this.updateSelectedCount();
      });
    });

    // Checkbox change handlers
    listEl.querySelectorAll('.contact-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        const id = checkbox.dataset.id;
        if (checkbox.checked) {
          this.selectedContacts.add(id);
        } else {
          this.selectedContacts.delete(id);
        }
        this.updateSelectedCount();
      });
    });
  }

  updateContactCheckboxes() {
    document.querySelectorAll('.contact-checkbox').forEach(checkbox => {
      const id = checkbox.dataset.id;
      checkbox.checked = this.selectedContacts.has(id);
    });
  }

  updateSelectedCount() {
    const countEl = document.getElementById('selected-count');
    const startBtn = document.getElementById('start-calls-btn');
    const count = this.selectedContacts.size;

    if (countEl) {
      countEl.textContent = `${count} selected`;
    }

    if (startBtn) {
      if (count > 0) {
        startBtn.disabled = false;
        startBtn.style.cursor = 'pointer';
        startBtn.style.opacity = '1';
      } else {
        startBtn.disabled = true;
        startBtn.style.cursor = 'not-allowed';
        startBtn.style.opacity = '0.5';
      }
    }

    // Update select all checkbox
    const selectAllCheckbox = document.getElementById('select-all');
    const contactsWithPhone = this.contacts.filter(c => c.phone_number).length;
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = count > 0 && count === contactsWithPhone;
      selectAllCheckbox.indeterminate = count > 0 && count < contactsWithPhone;
    }
  }

  async startBulkCalls() {
    const callerIdSelect = document.getElementById('caller-id-select');
    const callerId = callerIdSelect?.value;

    if (!callerId) {
      showToast('Please select a caller ID', 'warning');
      return;
    }

    if (this.selectedContacts.size === 0) {
      showToast('Please select at least one contact', 'warning');
      return;
    }

    const selectedContactsList = this.contacts.filter(c => this.selectedContacts.has(c.id));

    // For now, show a message that this feature is coming soon
    showToast(`Bulk calling feature coming soon! Will call ${selectedContactsList.length} contacts from ${callerId}`, 'info');
  }
}
