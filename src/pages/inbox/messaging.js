import { supabase } from '../../lib/supabase.js';
import { showAlertModal } from '../../components/ConfirmModal.js';
import { showToast } from '../../lib/toast.js';
import { loadVoiceRecognition, isVoiceSupported } from './voice-loader.js';

export const messagingMethods = {
  async showNewConversationModal() {
    // Directly show the new message interface
    this.showMessageInterface();
  },

  async showMessageInterface() {
    const threadElement = document.getElementById('message-thread');

    // Load active service numbers
    const { data: { session } } = await supabase.auth.getSession();
    const { data: serviceNumbers } = await supabase
      .from('service_numbers')
      .select('phone_number, friendly_name')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .order('purchased_at', { ascending: false });

    // Load contacts for autocomplete
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, name, phone_number, company, job_title')
      .eq('user_id', session.user.id)
      .order('name', { ascending: true });

    this.newMessageContacts = contacts || [];

    // Default to first service number if available
    this.selectedServiceNumber = serviceNumbers?.[0]?.phone_number || null;
    const defaultNumber = serviceNumbers?.[0];

    threadElement.innerHTML = `
      <!-- Thread header with To: and From: fields -->
      <div class="thread-header" style="
        display: flex;
        flex-direction: column;
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--border-color);
      ">
        <div style="display: flex; align-items: center; margin-bottom: 0.5rem; position: relative;">
          <button class="back-button" id="back-button-new" style="
            display: none;
            background: none;
            border: none;
            font-size: 1.75rem;
            cursor: pointer;
            padding: 0;
            margin-right: 0.75rem;
            color: var(--primary-color);
            line-height: 1;
          ">←</button>
          <span style="color: var(--text-secondary); margin-right: 0.75rem; font-size: 0.88rem; min-width: 40px;">To:</span>
          <div style="flex: 1; position: relative;">
            <input
              type="text"
              id="text-phone"
              placeholder="Search contacts or enter number"
              autocomplete="off"
              style="
                width: 100%;
                border: none;
                outline: none;
                background: transparent;
                font-size: 0.88rem;
                font-weight: 600;
                color: var(--text-primary);
              "
            />
            <!-- Contact suggestions dropdown -->
            <div id="contact-suggestions" style="
              display: none;
              position: absolute;
              top: 100%;
              left: -40px;
              right: 0;
              margin-top: 0.5rem;
              background: var(--bg-primary);
              border: 1px solid var(--border-color);
              border-radius: 8px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
              max-height: 250px;
              overflow-y: auto;
              z-index: 100;
            "></div>
          </div>
        </div>
        <div style="display: flex; align-items: center;">
          <span style="color: var(--text-secondary); margin-right: 0.75rem; font-size: 0.88rem; min-width: 40px;">From:</span>
          <button
            id="from-number-btn"
            style="
              display: flex;
              align-items: center;
              gap: 0.5rem;
              background: none;
              border: none;
              padding: 0.25rem 0.5rem;
              border-radius: var(--radius-sm);
              cursor: pointer;
              font-size: 0.88rem;
              font-weight: 600;
              color: var(--text-primary);
            "
            onmouseover="this.style.background='var(--bg-secondary)'"
            onmouseout="this.style.background='none'"
          >
            <span style="font-size: 1.2rem;">${defaultNumber ? this.getCountryFlag(defaultNumber.phone_number) : '🌍'}</span>
            <span id="selected-number-display">${defaultNumber ? this.formatPhoneNumber(defaultNumber.phone_number) : 'Select number'}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>
      </div>

      <!-- Empty messages area -->
      <div class="thread-messages" id="thread-messages" style="flex: 1;"></div>

      <!-- Message input -->
      <div class="message-input-container">
        <textarea
          id="message-input-new"
          class="message-input"
          placeholder=""
          rows="1"
        ></textarea>
        <button id="send-button-new" class="send-button">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>

      <!-- Service Number Selection Modal -->
      <div id="number-select-modal" class="modal hidden">
        <div class="modal-backdrop"></div>
        <div class="modal-content" style="max-width: 400px;">
          <h2 style="margin-bottom: 1rem;">Select Number</h2>
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${serviceNumbers?.map(num => `
              <button
                class="number-option-btn"
                data-number="${num.phone_number}"
                style="
                  display: flex;
                  align-items: center;
                  gap: 0.75rem;
                  padding: 0.75rem;
                  border: 2px solid var(--border-color);
                  border-radius: var(--radius-md);
                  background: var(--bg-primary);
                  cursor: pointer;
                  transition: all 0.2s;
                "
                onmouseover="this.style.borderColor='var(--primary-color)'; this.style.background='var(--bg-secondary)'"
                onmouseout="this.style.borderColor='var(--border-color)'; this.style.background='var(--bg-primary)'"
              >
                <span style="font-size: 1.5rem;">${this.getCountryFlag(num.phone_number)}</span>
                <div style="flex: 1; text-align: left;">
                  <div style="font-weight: 600; font-size: 0.95rem;">${this.formatPhoneNumber(num.phone_number)}</div>
                </div>
              </button>
            `).join('') || '<p class="text-muted">No active numbers</p>'}
          </div>
          <button class="btn btn-secondary" id="close-number-modal" style="margin-top: 1rem; width: 100%;">
            Cancel
          </button>
        </div>
      </div>
    `;

    // Handle mobile view
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      // Add 'show' class to slide in the thread on mobile
      threadElement.classList.add('show');

      const backBtn = document.getElementById('back-button-new');
      if (backBtn) {
        backBtn.style.display = 'block';
        backBtn.addEventListener('click', async () => {
          // Remove 'show' class to slide out, then re-render
          threadElement.classList.remove('show');
          // Small delay for animation
          setTimeout(async () => {
            await this.render();
          }, 300);
        });
      }
    }

    // From number button - open modal
    document.getElementById('from-number-btn').addEventListener('click', () => {
      document.getElementById('number-select-modal').classList.remove('hidden');
    });

    // Number option buttons
    document.querySelectorAll('.number-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const number = btn.dataset.number;
        this.selectedServiceNumber = number;

        // Update display
        const displayEl = document.getElementById('selected-number-display');
        const flagEl = document.getElementById('from-number-btn').querySelector('span');
        displayEl.textContent = this.formatPhoneNumber(number);
        flagEl.textContent = this.getCountryFlag(number);

        // Close modal
        document.getElementById('number-select-modal').classList.add('hidden');
      });
    });

    // Close modal button
    document.getElementById('close-number-modal').addEventListener('click', () => {
      document.getElementById('number-select-modal').classList.add('hidden');
    });

    // Close modal on backdrop click
    const modal = document.getElementById('number-select-modal');
    modal.querySelector('.modal-backdrop').addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    // Send button
    document.getElementById('send-button-new').addEventListener('click', async () => {
      await this.sendNewConversation();
    });

    // Contact search functionality
    const phoneInput = document.getElementById('text-phone');
    const suggestionsEl = document.getElementById('contact-suggestions');

    phoneInput.addEventListener('input', (e) => {
      const query = e.target.value.trim().toLowerCase();

      if (query.length === 0) {
        suggestionsEl.style.display = 'none';
        return;
      }

      // Filter contacts by name or phone number
      const filtered = this.newMessageContacts.filter(c => {
        const nameMatch = c.name?.toLowerCase().includes(query);
        const phoneMatch = c.phone_number?.replace(/\D/g, '').includes(query.replace(/\D/g, ''));
        const companyMatch = c.company?.toLowerCase().includes(query);
        return nameMatch || phoneMatch || companyMatch;
      }).slice(0, 8); // Limit to 8 results

      if (filtered.length === 0) {
        suggestionsEl.style.display = 'none';
        return;
      }

      // Render suggestions
      suggestionsEl.innerHTML = filtered.map(contact => `
        <div class="contact-suggestion" data-phone="${contact.phone_number}" data-name="${contact.name || ''}" style="
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          cursor: pointer;
          transition: background 0.15s;
        " onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='none'">
          <div style="
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 600;
            font-size: 0.875rem;
          ">${(contact.name || contact.phone_number || '?').charAt(0).toUpperCase()}</div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 600; font-size: 0.875rem; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${contact.name || 'Unknown'}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">
              ${this.formatPhoneNumber(contact.phone_number)}${contact.company ? ` · ${contact.company}` : ''}
            </div>
          </div>
        </div>
      `).join('');

      suggestionsEl.style.display = 'block';

      // Attach click handlers to suggestions
      suggestionsEl.querySelectorAll('.contact-suggestion').forEach(el => {
        el.addEventListener('click', () => {
          const phone = el.dataset.phone;
          suggestionsEl.style.display = 'none';
          // Use openNewConversation which handles existing threads
          this.openNewConversation(phone);
        });
      });
    });

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
      if (!suggestionsEl.contains(e.target) && e.target !== phoneInput) {
        suggestionsEl.style.display = 'none';
      }
    });

    // Close suggestions on Escape
    phoneInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        suggestionsEl.style.display = 'none';
      }
    });

    // Focus phone input
    document.getElementById('text-phone').focus();
  },

  async showAgentMessageInterface() {
    const threadElement = document.getElementById('message-thread');

    // Load active service numbers
    const { data: { session } } = await supabase.auth.getSession();
    const { data: serviceNumbers } = await supabase
      .from('service_numbers')
      .select('phone_number, friendly_name')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .order('purchased_at', { ascending: false });

    // Load contacts for autocomplete
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, name, phone_number, company, job_title')
      .eq('user_id', session.user.id)
      .order('name', { ascending: true });

    this.agentMessageContacts = contacts || [];

    // Default to first service number if available
    this.selectedServiceNumber = serviceNumbers?.[0]?.phone_number || null;
    const defaultNumber = serviceNumbers?.[0];

    threadElement.innerHTML = `
      <div id="agent-message-interface">
      <!-- Agent Message Header -->
      <div class="thread-header" style="
        display: flex;
        flex-direction: column;
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--border-color);
      ">
        <div style="display: flex; align-items: center; margin-bottom: 0.5rem; position: relative;">
          <button class="back-button" id="back-button-agent" style="
            display: none;
            background: none;
            border: none;
            font-size: 1.75rem;
            cursor: pointer;
            padding: 0;
            margin-right: 0.75rem;
            color: var(--primary-color);
            line-height: 1;
          ">←</button>
          <span style="color: var(--text-secondary); margin-right: 0.75rem; font-size: 0.88rem; min-width: 40px;">To:</span>
          <div style="flex: 1; position: relative;">
            <input
              type="text"
              id="agent-phone"
              placeholder="Search contacts or enter number"
              autocomplete="off"
              style="
                width: 100%;
                border: none;
                outline: none;
                background: transparent;
                font-size: 0.88rem;
                font-weight: 600;
                color: var(--text-primary);
              "
            />
            <!-- Contact suggestions dropdown -->
            <div id="agent-contact-suggestions" style="
              display: none;
              position: absolute;
              top: 100%;
              left: -40px;
              right: 0;
              margin-top: 0.5rem;
              background: var(--bg-primary);
              border: 1px solid var(--border-color);
              border-radius: 8px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
              max-height: 250px;
              overflow-y: auto;
              z-index: 100;
            "></div>
          </div>
        </div>
        <div style="display: flex; align-items: center;">
          <span style="color: var(--text-secondary); margin-right: 0.75rem; font-size: 0.88rem; min-width: 40px;">From:</span>
          <button
            id="agent-from-number-btn"
            style="
              display: flex;
              align-items: center;
              gap: 0.5rem;
              background: none;
              border: none;
              padding: 0.25rem 0.5rem;
              border-radius: var(--radius-sm);
              cursor: pointer;
              font-size: 0.88rem;
              font-weight: 600;
              color: var(--text-primary);
            "
            onmouseover="this.style.background='var(--bg-secondary)'"
            onmouseout="this.style.background='none'"
          >
            <span style="font-size: 1.2rem;">${defaultNumber ? this.getCountryFlag(defaultNumber.phone_number) : '🌍'}</span>
            <span id="agent-selected-number-display">${defaultNumber ? this.formatPhoneNumber(defaultNumber.phone_number) : 'Select number'}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
        </div>
      </div>

      <!-- Prompt Section -->
      <div style="padding: 1rem; border-bottom: 1px solid var(--border-color);">
        <label style="display: block; font-weight: 600; margin-bottom: 0.5rem; color: var(--text-primary); font-size: 0.875rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline; vertical-align: middle; margin-right: 0.25rem;">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"></path>
            <circle cx="7.5" cy="14.5" r="1.5"></circle>
            <circle cx="16.5" cy="14.5" r="1.5"></circle>
          </svg>
          Agent Prompt
        </label>
        <textarea
          id="agent-prompt"
          placeholder="Describe what you want to say...

Examples:
• Follow up on yesterday's meeting
• Remind about appointment tomorrow at 2pm
• Thank them for their business, friendly tone"
          style="
            width: 100%;
            min-height: 160px;
            padding: 0.75rem;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            font-size: 0.875rem;
            resize: vertical;
            font-family: inherit;
            background: var(--bg-primary);
            color: var(--text-primary);
          "
        ></textarea>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.75rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            ${isVoiceSupported() ? `
            <button id="voice-prompt-btn" title="Speak your prompt" style="
              display: flex;
              align-items: center;
              justify-content: center;
              width: 40px;
              height: 40px;
              background: var(--bg-secondary);
              border: 1px solid var(--border-color);
              border-radius: 50%;
              cursor: pointer;
              transition: all 0.2s;
            " onmouseover="this.style.background='var(--bg-tertiary)'" onmouseout="if(!this.classList.contains('recording')){this.style.background='var(--bg-secondary)'}">
              <svg id="mic-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            </button>
            <span id="voice-status" style="font-size: 0.75rem; color: var(--text-secondary); display: none;"></span>
            ` : ''}
          </div>
          <button id="generate-message-btn" style="
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.625rem 1.25rem;
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 0.875rem;
            cursor: pointer;
            transition: opacity 0.2s;
          " onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
            Send
          </button>
        </div>
      </div>

      <!-- Placeholder for removed sections -->
      <div id="generated-message-section" style="display: none;"></div>
      <div id="agent-action-buttons" style="display: none;">
        <button id="regenerate-btn" style="display: none;"></button>
        <button id="send-agent-message-btn" style="display: none;"></button>
        <textarea id="generated-message" style="display: none;"></textarea>
        <span id="char-count" style="display: none;"></span>
      </div>

      <!-- Hidden placeholder to prevent JS errors -->
      <div style="display: none;"><button id="placeholder-btn" style="
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.625rem 1.25rem;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.875rem;
          cursor: pointer;
          margin-left: auto;
        ">
          Send
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>

      <!-- Service Number Selection Modal -->
      <div id="agent-number-select-modal" class="modal hidden">
        <div class="modal-backdrop"></div>
        <div class="modal-content" style="max-width: 400px;">
          <h2 style="margin-bottom: 1rem;">Select Number</h2>
          <div style="display: flex; flex-direction: column; gap: 0.5rem;">
            ${serviceNumbers?.map(num => `
              <button
                class="agent-number-option-btn"
                data-number="${num.phone_number}"
                style="
                  display: flex;
                  align-items: center;
                  gap: 0.75rem;
                  padding: 0.75rem;
                  border: 2px solid var(--border-color);
                  border-radius: var(--radius-md);
                  background: var(--bg-primary);
                  cursor: pointer;
                  transition: all 0.2s;
                "
                onmouseover="this.style.borderColor='var(--primary-color)'; this.style.background='var(--bg-secondary)'"
                onmouseout="this.style.borderColor='var(--border-color)'; this.style.background='var(--bg-primary)'"
              >
                <span style="font-size: 1.5rem;">${this.getCountryFlag(num.phone_number)}</span>
                <div style="flex: 1; text-align: left;">
                  <div style="font-weight: 600; font-size: 0.95rem;">${this.formatPhoneNumber(num.phone_number)}</div>
                </div>
              </button>
            `).join('') || '<p class="text-muted">No active numbers</p>'}
          </div>
          <button class="btn btn-secondary" id="close-agent-number-modal" style="margin-top: 1rem; width: 100%;">
            Cancel
          </button>
        </div>
      </div>
      </div><!-- Close agent-message-interface -->
    `;

    // Handle mobile view
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      // Add 'show' class to slide in the thread on mobile
      threadElement.classList.add('show');

      const backBtn = document.getElementById('back-button-agent');
      if (backBtn) {
        backBtn.style.display = 'block';
        backBtn.addEventListener('click', async () => {
          // Remove 'show' class to slide out, then re-render
          threadElement.classList.remove('show');
          // Small delay for animation
          setTimeout(async () => {
            await this.render();
          }, 300);
        });
      }
    }

    // From number button - open modal
    document.getElementById('agent-from-number-btn').addEventListener('click', () => {
      document.getElementById('agent-number-select-modal').classList.remove('hidden');
    });

    // Number option buttons
    document.querySelectorAll('.agent-number-option-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const number = btn.dataset.number;
        this.selectedServiceNumber = number;
        const displayEl = document.getElementById('agent-selected-number-display');
        const flagEl = document.getElementById('agent-from-number-btn').querySelector('span');
        displayEl.textContent = this.formatPhoneNumber(number);
        flagEl.textContent = this.getCountryFlag(number);
        document.getElementById('agent-number-select-modal').classList.add('hidden');
      });
    });

    // Close modal button
    document.getElementById('close-agent-number-modal').addEventListener('click', () => {
      document.getElementById('agent-number-select-modal').classList.add('hidden');
    });

    // Close modal on backdrop click
    const modal = document.getElementById('agent-number-select-modal');
    modal.querySelector('.modal-backdrop').addEventListener('click', () => {
      modal.classList.add('hidden');
    });

    // Contact search functionality
    const phoneInput = document.getElementById('agent-phone');
    const suggestionsEl = document.getElementById('agent-contact-suggestions');

    phoneInput.addEventListener('input', (e) => {
      const query = e.target.value.trim().toLowerCase();

      if (query.length === 0) {
        suggestionsEl.style.display = 'none';
        return;
      }

      const filtered = this.agentMessageContacts.filter(c => {
        const nameMatch = c.name?.toLowerCase().includes(query);
        const phoneMatch = c.phone_number?.replace(/\D/g, '').includes(query.replace(/\D/g, ''));
        const companyMatch = c.company?.toLowerCase().includes(query);
        return nameMatch || phoneMatch || companyMatch;
      }).slice(0, 8);

      if (filtered.length === 0) {
        suggestionsEl.style.display = 'none';
        return;
      }

      suggestionsEl.innerHTML = filtered.map(contact => `
        <div class="agent-contact-suggestion" data-phone="${contact.phone_number}" data-name="${contact.name || ''}" style="
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          cursor: pointer;
          transition: background 0.15s;
        " onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='none'">
          <div style="
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 600;
            font-size: 0.875rem;
          ">${(contact.name || contact.phone_number || '?').charAt(0).toUpperCase()}</div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 600; font-size: 0.875rem; color: var(--text-primary);">
              ${contact.name || 'Unknown'}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">
              ${this.formatPhoneNumber(contact.phone_number)}${contact.company ? ` · ${contact.company}` : ''}
            </div>
          </div>
        </div>
      `).join('');

      suggestionsEl.style.display = 'block';

      suggestionsEl.querySelectorAll('.agent-contact-suggestion').forEach(el => {
        el.addEventListener('click', () => {
          const phone = el.dataset.phone;
          const name = el.dataset.name;
          phoneInput.value = name ? `${name} ${this.formatPhoneNumber(phone)}` : phone;
          phoneInput.dataset.selectedPhone = phone;
          phoneInput.dataset.selectedName = name;
          suggestionsEl.style.display = 'none';
        });
      });
    });

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
      if (!suggestionsEl.contains(e.target) && e.target !== phoneInput) {
        suggestionsEl.style.display = 'none';
      }
    });

    // Generate message button
    document.getElementById('generate-message-btn').addEventListener('click', async () => {
      await this.generateAgentMessage();
    });

    // Voice input button
    const voiceBtn = document.getElementById('voice-prompt-btn');
    if (voiceBtn) {
      voiceBtn.addEventListener('click', () => {
        this.toggleVoiceInput();
      });
    }

    // Focus phone input
    document.getElementById('agent-phone').focus();
  },

  async generateAgentMessage() {
    const phoneInput = document.getElementById('agent-phone');
    const promptInput = document.getElementById('agent-prompt');
    const generateBtn = document.getElementById('generate-message-btn');

    const phone = phoneInput.dataset.selectedPhone || phoneInput.value.trim();
    const recipientName = phoneInput.dataset.selectedName || null;
    const prompt = promptInput.value.trim();

    // Validate inputs
    if (!phone) {
      showAlertModal('Missing Information', 'Please enter a recipient phone number');
      phoneInput.focus();
      return;
    }

    if (!prompt) {
      showAlertModal('Missing Information', 'Please enter a prompt describing what you want to say');
      promptInput.focus();
      return;
    }

    if (!this.selectedServiceNumber) {
      showAlertModal('Missing Information', 'Please select a From number');
      return;
    }

    // Show loading state
    generateBtn.disabled = true;
    generateBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 6v6l4 2"></path>
      </svg>
      Sending...
    `;

    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Step 1: Generate the message
      const generateResponse = await fetch(`${window.SUPABASE_URL || 'https://api.magpipe.ai'}/functions/v1/generate-agent-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          prompt,
          recipient_phone: phone,
          recipient_name: recipientName,
          user_id: session.user.id
        })
      });

      if (!generateResponse.ok) {
        const error = await generateResponse.json();
        throw new Error(error.error || 'Failed to generate message');
      }

      const result = await generateResponse.json();
      const generatedText = result.message;

      // Step 2: Send the message
      const sendResponse = await fetch(`${window.SUPABASE_URL || 'https://api.magpipe.ai'}/functions/v1/send-user-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          serviceNumber: this.selectedServiceNumber,
          contactPhone: phone,
          message: generatedText
        })
      });

      if (!sendResponse.ok) {
        const error = await sendResponse.json();
        throw new Error(error.error || 'Failed to send message');
      }

      // Step 3: Open the conversation thread
      this.openNewConversation(phone, recipientName);

    } catch (error) {
      console.error('Agent message error:', error);
      showAlertModal('Error', error.message || 'Failed to send message');
      generateBtn.disabled = false;
      generateBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
        Send
      `;
    }
  },

  updateCharCount(text) {
    const charCount = document.getElementById('char-count');
    const length = text.length;
    const segments = Math.ceil(length / 160) || 1;
    charCount.textContent = `${length} characters · ${segments} segment${segments !== 1 ? 's' : ''}`;
  },

  async toggleVoiceInput(btnId = 'voice-prompt-btn', statusId = 'voice-status', inputId = 'agent-prompt') {
    const voiceBtn = document.getElementById(btnId);
    const voiceStatus = document.getElementById(statusId);
    const promptInput = document.getElementById(inputId);

    if (!voiceBtn || !promptInput) {
      console.error('Voice input elements not found');
      return;
    }

    // If already recording, stop
    if (this.voiceRecognition) {
      this.voiceRecognition.stop();
      this.voiceRecognition = null;
      voiceBtn.classList.remove('recording');
      voiceBtn.style.background = 'var(--bg-secondary)';
      voiceBtn.style.borderColor = 'var(--border-color)';
      if (voiceStatus) voiceStatus.style.display = 'none';
      return;
    }

    // Start recording
    try {
      const { VoiceRecognition } = await loadVoiceRecognition();
      this.voiceRecognition = new VoiceRecognition();
      this.voiceRecognition.setContinuous(false); // Stop after one result

      this.voiceRecognition.onStart(() => {
        voiceBtn.classList.add('recording');
        voiceBtn.style.background = '#ef4444';
        voiceBtn.style.borderColor = '#ef4444';
        if (voiceStatus) {
          voiceStatus.textContent = 'Listening...';
          voiceStatus.style.display = 'inline';
          voiceStatus.style.color = '#ef4444';
        }
      });

      this.voiceRecognition.onResult((result) => {
        // Append to existing prompt text
        const currentText = promptInput.value;
        const newText = currentText ? `${currentText} ${result.transcript}` : result.transcript;
        promptInput.value = newText;
        promptInput.focus();

        // Reset UI
        voiceBtn.classList.remove('recording');
        voiceBtn.style.background = 'var(--bg-secondary)';
        voiceBtn.style.borderColor = 'var(--border-color)';
        if (voiceStatus) voiceStatus.style.display = 'none';
        this.voiceRecognition = null;
      });

      this.voiceRecognition.onError((error) => {
        console.error('Voice recognition error:', error);
        if (voiceStatus) {
          voiceStatus.textContent = error;
          voiceStatus.style.color = '#ef4444';
          setTimeout(() => {
            voiceStatus.style.display = 'none';
          }, 3000);
        }

        voiceBtn.classList.remove('recording');
        voiceBtn.style.background = 'var(--bg-secondary)';
        voiceBtn.style.borderColor = 'var(--border-color)';
        this.voiceRecognition = null;
      });

      this.voiceRecognition.onEnd(() => {
        voiceBtn.classList.remove('recording');
        voiceBtn.style.background = 'var(--bg-secondary)';
        voiceBtn.style.borderColor = 'var(--border-color)';
        if (voiceStatus) voiceStatus.style.display = 'none';
        this.voiceRecognition = null;
      });

      this.voiceRecognition.start();
    } catch (error) {
      console.error('Failed to start voice recognition:', error);
      showAlertModal('Voice Input Unavailable', 'Voice input is not available in this browser');
    }
  },

  async sendAgentMessage() {
    const phoneInput = document.getElementById('agent-phone');
    const generatedMessage = document.getElementById('generated-message');
    const sendBtn = document.getElementById('send-agent-message-btn');

    let phone = phoneInput.dataset.selectedPhone || phoneInput.value.trim();
    const message = generatedMessage.value.trim();
    const serviceNumber = this.selectedServiceNumber;

    // Extract phone if contains name
    if (!phoneInput.dataset.selectedPhone && phone) {
      const phoneMatch = phone.match(/\+?[\d\s()-]+$/);
      if (phoneMatch) {
        phone = phoneMatch[0].replace(/[\s()-]/g, '');
      }
    }

    if (!phone) {
      showAlertModal('Missing Information', 'Please enter a recipient phone number');
      return;
    }

    if (!message) {
      showAlertModal('Missing Information', 'Please generate a message first');
      return;
    }

    if (!serviceNumber) {
      showAlertModal('Missing Information', 'Please select a From number');
      return;
    }

    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';

    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Normalize phone number
      let normalizedPhone = phone.replace(/[\s()-]/g, '');
      if (!normalizedPhone.startsWith('+')) {
        normalizedPhone = '+1' + normalizedPhone;
      }

      const response = await fetch(`${window.SUPABASE_URL || 'https://api.magpipe.ai'}/functions/v1/send-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          to: normalizedPhone,
          from: serviceNumber,
          message: message,
          user_id: session.user.id
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send message');
      }

      // Success - open the conversation
      this.openNewConversation(normalizedPhone);

    } catch (error) {
      console.error('Send agent message error:', error);
      showAlertModal('Error', error.message || 'Failed to send message');
      sendBtn.disabled = false;
      sendBtn.innerHTML = `
        Send
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      `;
    }
  },

  async showEmailComposeInterface(options = {}) {
    const threadElement = document.getElementById('message-thread');
    const { replyTo, subject, threadId, inReplyTo, agentMode } = options;

    // Load contacts for autocomplete
    const { data: { session } } = await supabase.auth.getSession();
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, name, first_name, last_name, phone_number, email, company')
      .eq('user_id', session.user.id)
      .not('email', 'is', null)
      .order('name', { ascending: true });

    this.emailContacts = contacts || [];

    const title = replyTo ? 'Reply' : (agentMode ? 'Agent Email' : 'New Email');

    threadElement.innerHTML = `
      <div class="thread-header" style="
        display: flex;
        flex-direction: column;
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--border-color);
      ">
        <div style="display: flex; align-items: center; margin-bottom: 0.75rem;">
          <button class="back-button" id="back-button-email" style="
            display: none;
            background: none;
            border: none;
            font-size: 1.75rem;
            cursor: pointer;
            padding: 0;
            margin-right: 0.75rem;
            color: var(--primary-color);
            line-height: 1;
          ">←</button>
          <h2 style="margin: 0; font-size: 1rem; font-weight: 600;">${title}</h2>
          ${agentMode ? `<span style="margin-left: 0.5rem; font-size: 0.65rem; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 0.125rem 0.375rem; border-radius: 0.25rem;">AI</span>` : ''}
        </div>
        <div style="display: flex; align-items: center; margin-bottom: 0.5rem; position: relative;">
          <span style="color: var(--text-secondary); margin-right: 0.75rem; font-size: 0.88rem; min-width: 40px;">To:</span>
          <div style="flex: 1; position: relative;">
            <input
              type="email"
              id="email-to"
              value="${replyTo || ''}"
              placeholder="Search contacts or enter email"
              autocomplete="off"
              style="
                width: 100%;
                border: none;
                outline: none;
                background: transparent;
                font-size: 0.88rem;
                font-weight: 600;
                color: var(--text-primary);
              "
            />
            <div id="email-contact-suggestions" style="
              display: none;
              position: absolute;
              top: 100%;
              left: -40px;
              right: 0;
              margin-top: 0.5rem;
              background: var(--bg-primary);
              border: 1px solid var(--border-color);
              border-radius: 8px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
              max-height: 250px;
              overflow-y: auto;
              z-index: 100;
            "></div>
          </div>
        </div>
        <div id="cc-bcc-toggle" style="display: ${(options.cc || options.bcc) ? 'none' : 'block'}; margin-bottom: 0.5rem;">
          <a href="#" id="show-cc-bcc" style="font-size: 0.75rem; color: var(--text-secondary); text-decoration: none;">CC/BCC</a>
        </div>
        <div id="cc-bcc-fields" style="display: ${(options.cc || options.bcc) ? 'block' : 'none'};">
          <div style="display: flex; align-items: center; margin-bottom: 0.5rem;">
            <span style="color: var(--text-secondary); margin-right: 0.75rem; font-size: 0.88rem; min-width: 40px;">CC:</span>
            <input type="text" id="email-cc" value="${options.cc || ''}" placeholder="Comma-separated emails" style="
              flex: 1; border: none; outline: none; background: transparent; font-size: 0.88rem; color: var(--text-primary);
            " />
          </div>
          <div style="display: flex; align-items: center; margin-bottom: 0.5rem;">
            <span style="color: var(--text-secondary); margin-right: 0.75rem; font-size: 0.88rem; min-width: 40px;">BCC:</span>
            <input type="text" id="email-bcc" value="${options.bcc || ''}" placeholder="Comma-separated emails" style="
              flex: 1; border: none; outline: none; background: transparent; font-size: 0.88rem; color: var(--text-primary);
            " />
          </div>
        </div>
      </div>

      <!-- Subject -->
      <div style="display: flex; align-items: center; padding: 0.5rem 1rem; border-bottom: 1px solid var(--border-color);">
        <span style="color: var(--text-secondary); margin-right: 0.75rem; font-size: 0.88rem; min-width: 55px;">Subject:</span>
        <input type="text" id="email-subject" value="${subject || ''}" placeholder="Email subject" style="
          flex: 1; border: none; outline: none; background: transparent; font-size: 0.88rem; font-weight: 600; color: var(--text-primary);
        " />
      </div>

      <!-- Toolbar -->
      <div id="email-toolbar" style="
        display: flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.375rem 1rem;
        border-bottom: 1px solid var(--border-color);
        background: var(--bg-secondary);
      ">
        <button class="email-format-btn" data-cmd="bold" title="Bold" style="
          background: none; border: none; padding: 0.375rem; cursor: pointer; border-radius: 4px; color: var(--text-primary); font-weight: bold; font-size: 0.875rem;
        ">B</button>
        <button class="email-format-btn" data-cmd="italic" title="Italic" style="
          background: none; border: none; padding: 0.375rem; cursor: pointer; border-radius: 4px; color: var(--text-primary); font-style: italic; font-size: 0.875rem;
        ">I</button>
        <button class="email-format-btn" data-cmd="underline" title="Underline" style="
          background: none; border: none; padding: 0.375rem; cursor: pointer; border-radius: 4px; color: var(--text-primary); text-decoration: underline; font-size: 0.875rem;
        ">U</button>
        <div style="width: 1px; height: 18px; background: var(--border-color); margin: 0 0.25rem;"></div>
        <button class="email-format-btn" data-cmd="createLink" title="Insert Link" style="
          background: none; border: none; padding: 0.375rem; cursor: pointer; border-radius: 4px; color: var(--text-primary);
        ">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
        </button>
        <button class="email-format-btn" data-cmd="insertUnorderedList" title="Bulleted List" style="
          background: none; border: none; padding: 0.375rem; cursor: pointer; border-radius: 4px; color: var(--text-primary);
        ">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="8" y1="6" x2="21" y2="6"></line>
            <line x1="8" y1="12" x2="21" y2="12"></line>
            <line x1="8" y1="18" x2="21" y2="18"></line>
            <line x1="3" y1="6" x2="3.01" y2="6"></line>
            <line x1="3" y1="12" x2="3.01" y2="12"></line>
            <line x1="3" y1="18" x2="3.01" y2="18"></line>
          </svg>
        </button>
        <button class="email-format-btn" data-cmd="formatBlock" data-value="blockquote" title="Quote" style="
          background: none; border: none; padding: 0.375rem; cursor: pointer; border-radius: 4px; color: var(--text-primary); font-size: 1rem;
        ">&ldquo;</button>
      </div>

      <!-- Body -->
      <div id="email-body" contenteditable="true" style="
        flex: 1;
        padding: 1rem;
        outline: none;
        font-size: 0.875rem;
        line-height: 1.6;
        color: var(--text-primary);
        min-height: 200px;
        overflow-y: auto;
      " data-placeholder="Compose your email..."></div>

      <!-- Send button -->
      <div style="
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: 0.75rem 1rem;
        border-top: 1px solid var(--border-color);
        background: var(--bg-primary);
      ">
        <button id="send-email-btn" style="
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.625rem 1.5rem;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.875rem;
          cursor: pointer;
          transition: opacity 0.2s;
        " onmouseover="this.style.opacity='0.9'" onmouseout="this.style.opacity='1'">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
          Send Email
        </button>
      </div>
    `;

    // Store compose context
    this._emailComposeContext = {
      threadId: threadId || null,
      inReplyTo: inReplyTo || null,
      agentMode: agentMode || false,
    };

    // Handle mobile
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      threadElement.classList.add('show');
      const backBtn = document.getElementById('back-button-email');
      if (backBtn) {
        backBtn.style.display = 'block';
        backBtn.addEventListener('click', async () => {
          threadElement.classList.remove('show');
          setTimeout(async () => { await this.render(); }, 300);
        });
      }
    }

    // CC/BCC toggle
    const ccBccToggle = document.getElementById('show-cc-bcc');
    if (ccBccToggle) {
      ccBccToggle.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('cc-bcc-toggle').style.display = 'none';
        document.getElementById('cc-bcc-fields').style.display = 'block';
      });
    }

    // Formatting toolbar
    document.querySelectorAll('.email-format-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const cmd = btn.dataset.cmd;
        if (cmd === 'createLink') {
          const url = prompt('Enter URL:');
          if (url) document.execCommand('createLink', false, url);
        } else if (cmd === 'formatBlock') {
          document.execCommand(cmd, false, btn.dataset.value);
        } else {
          document.execCommand(cmd, false, null);
        }
        document.getElementById('email-body').focus();
      });
    });

    // Placeholder behavior for contenteditable
    const emailBody = document.getElementById('email-body');
    const updatePlaceholder = () => {
      if (!emailBody.textContent.trim() && !emailBody.querySelector('img')) {
        emailBody.classList.add('empty');
      } else {
        emailBody.classList.remove('empty');
      }
    };
    emailBody.addEventListener('input', updatePlaceholder);
    emailBody.addEventListener('focus', updatePlaceholder);
    emailBody.addEventListener('blur', updatePlaceholder);
    updatePlaceholder();

    // Contact search for To field
    const toInput = document.getElementById('email-to');
    const suggestionsEl = document.getElementById('email-contact-suggestions');

    toInput.addEventListener('input', (e) => {
      const query = e.target.value.trim().toLowerCase();
      if (query.length === 0) {
        suggestionsEl.style.display = 'none';
        return;
      }

      const filtered = this.emailContacts.filter(c => {
        const nameMatch = (c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim()).toLowerCase().includes(query);
        const emailMatch = c.email?.toLowerCase().includes(query);
        const companyMatch = c.company?.toLowerCase().includes(query);
        return (nameMatch || emailMatch || companyMatch) && c.email;
      }).slice(0, 8);

      if (filtered.length === 0) {
        suggestionsEl.style.display = 'none';
        return;
      }

      suggestionsEl.innerHTML = filtered.map(contact => {
        const displayName = contact.name || [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email;
        return `
          <div class="email-contact-suggestion" data-email="${contact.email}" style="
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.75rem 1rem;
            cursor: pointer;
            transition: background 0.15s;
          " onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='none'">
            <div style="
              width: 36px; height: 36px; border-radius: 50%;
              background: linear-gradient(135deg, #f59e0b, #d97706);
              display: flex; align-items: center; justify-content: center;
              color: white; font-weight: 600; font-size: 0.875rem;
            ">${(displayName || '?').charAt(0).toUpperCase()}</div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 600; font-size: 0.875rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${displayName}</div>
              <div style="font-size: 0.75rem; color: var(--text-secondary);">${contact.email}${contact.company ? ` · ${contact.company}` : ''}</div>
            </div>
          </div>
        `;
      }).join('');

      suggestionsEl.style.display = 'block';

      suggestionsEl.querySelectorAll('.email-contact-suggestion').forEach(el => {
        el.addEventListener('click', () => {
          toInput.value = el.dataset.email;
          suggestionsEl.style.display = 'none';
        });
      });
    });

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
      if (!suggestionsEl.contains(e.target) && e.target !== toInput) {
        suggestionsEl.style.display = 'none';
      }
    });

    // Send email button
    document.getElementById('send-email-btn').addEventListener('click', async () => {
      await this.sendEmail();
    });

    // Focus the To field if no reply, otherwise focus body
    if (replyTo) {
      emailBody.focus();
    } else {
      toInput.focus();
    }
  },

  async sendEmail() {
    const toEmail = document.getElementById('email-to')?.value.trim();
    const cc = document.getElementById('email-cc')?.value.trim() || '';
    const bcc = document.getElementById('email-bcc')?.value.trim() || '';
    const subject = document.getElementById('email-subject')?.value.trim();
    const bodyEl = document.getElementById('email-body');
    const bodyHtml = bodyEl?.innerHTML || '';
    const bodyText = bodyEl?.textContent?.trim() || '';
    const sendBtn = document.getElementById('send-email-btn');

    if (!toEmail) {
      showAlertModal('Error', 'Please enter a recipient email address');
      return;
    }
    if (!subject) {
      showAlertModal('Error', 'Please enter a subject');
      return;
    }
    if (!bodyText) {
      showAlertModal('Error', 'Please enter a message');
      return;
    }

    sendBtn.disabled = true;
    sendBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
      </svg>
      Sending...
    `;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const ctx = this._emailComposeContext || {};

      const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          to_email: toEmail,
          cc: cc || undefined,
          bcc: bcc || undefined,
          subject,
          body_html: bodyHtml,
          body_text: bodyText,
          agent_id: ctx.agentMode ? undefined : undefined, // Agent selection TBD
          thread_id: ctx.threadId || undefined,
          in_reply_to: ctx.inReplyTo || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send email');
      }

      // Success - reload conversations and select the new thread
      await this.loadConversations(this.userId);
      this.selectedEmailThreadId = data.thread_id;
      this.selectedContact = null;
      this.selectedCallId = null;
      this.selectedChatSessionId = null;

      // Re-render
      const conversationsEl = document.getElementById('conversations');
      if (conversationsEl) {
        conversationsEl.innerHTML = this.renderConversationList();
        this.attachConversationListeners();
      }

      const threadElement = document.getElementById('message-thread');
      if (threadElement) {
        threadElement.innerHTML = this.renderMessageThread();
        this.attachEmailReplyListener();
      }

      showToast('Email sent successfully');
    } catch (error) {
      console.error('Send email error:', error);
      showAlertModal('Error', error.message || 'Failed to send email');
      sendBtn.disabled = false;
      sendBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
        Send Email
      `;
    }
  },

};
