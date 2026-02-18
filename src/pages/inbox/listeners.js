import { getCurrentUser, supabase } from '../../lib/supabase.js';
import { markAsRead } from '../../components/BottomNav.js';
import { markAllAsRead as markAllReadService } from '../../services/unreadService.js';
import { showDeleteConfirmModal, showAlertModal } from '../../components/ConfirmModal.js';
import { showToast } from '../../lib/toast.js';
import { User, ChatSession } from '../../models/index.js';

export const listenersMethods = {
  async sendNewConversation() {
    const phoneInput = document.getElementById('text-phone');
    const messageInput = document.getElementById('message-input-new');
    const sendBtn = document.getElementById('send-button-new');
    const threadMessages = document.getElementById('thread-messages');

    // Use stored phone from contact selection, or extract from input value
    let phone = phoneInput.dataset.selectedPhone || phoneInput.value.trim();

    // If no stored phone, try to extract phone number from input (in case user typed "Name +1234567890")
    if (!phoneInput.dataset.selectedPhone && phone) {
      // Extract just digits and + from the value for phone number
      const phoneMatch = phone.match(/\+?[\d\s()-]+$/);
      if (phoneMatch) {
        phone = phoneMatch[0].replace(/[\s()-]/g, '');
      }
    }

    const message = messageInput.value.trim();
    const serviceNumber = this.selectedServiceNumber;

    if (!phone) {
      threadMessages.innerHTML = '<div class="alert alert-error" style="margin: 1rem;">Please enter a phone number</div>';
      return;
    }

    if (!message) {
      threadMessages.innerHTML = '<div class="alert alert-error" style="margin: 1rem;">Please enter a message</div>';
      return;
    }

    if (!serviceNumber) {
      threadMessages.innerHTML = '<div class="alert alert-error" style="margin: 1rem;">Please select a number to send from</div>';
      return;
    }

    sendBtn.disabled = true;
    threadMessages.innerHTML = '<div class="alert alert-info" style="margin: 1rem;">Sending message...</div>';

    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Normalize phone number
      let normalizedPhone = phone.replace(/\D/g, '');
      if (!normalizedPhone.startsWith('1') && normalizedPhone.length === 10) {
        normalizedPhone = '1' + normalizedPhone;
      }
      if (!normalizedPhone.startsWith('+')) {
        normalizedPhone = '+' + normalizedPhone;
      }

      // Send SMS
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/send-user-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          serviceNumber,
          contactPhone: normalizedPhone,
          message,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send message');
      }

      // Success - reload conversations and select this one
      await this.loadConversations(this.userId);
      this.selectedContact = normalizedPhone;
      this.selectedServiceNumber = serviceNumber;
      this.selectedCallId = null;

      // Update UI
      const conversationsEl = document.getElementById('conversations');
      conversationsEl.innerHTML = this.renderConversationList();
      this.attachConversationListeners();

      const threadElement = document.getElementById('message-thread');
      threadElement.innerHTML = this.renderMessageThread();
      this.attachMessageInputListeners();

    } catch (error) {
      console.error('Send new conversation error:', error);
      threadMessages.innerHTML = `<div class="alert alert-error" style="margin: 1rem;">${error.message || 'Failed to send message'}</div>`;
      sendBtn.disabled = false;
    }
  },

  attachEventListeners() {
    this.attachConversationListeners();
    this.attachFilterListeners();
    this.attachSearchListener();
    this.attachFilterToggleListener();
    this.attachEditToggleListener();

    // Attach call-specific listeners if viewing a call
    if (this.selectedCallId) {
      this.attachRedialButtonListener();
    }

    // Only attach dropdown listeners once
    if (!this.dropdownListenersAttached) {
      this.attachDropdownListeners();
      this.dropdownListenersAttached = true;
    }

    // Attach phone link handler once (only if not already attached)
    if (!this.phoneLinkHandlerAttached) {
      this.attachPhoneLinkHandler();
      this.phoneLinkHandlerAttached = true;
    }
  },

  attachFilterToggleListener() {
    const filterToggleBtn = document.getElementById('filter-toggle-btn');
    const filtersContainer = document.getElementById('filters-container');

    if (filterToggleBtn && filtersContainer) {
      filterToggleBtn.addEventListener('click', () => {
        this.filtersExpanded = !this.filtersExpanded;
        filtersContainer.style.display = this.filtersExpanded ? 'block' : 'none';

        // Reset filters to All when hiding the filter panel
        if (!this.filtersExpanded && this.hasActiveFilters()) {
          this.typeFilter = 'all';
          this.directionFilter = 'all';
          this.missedFilter = false;
          this.unreadFilter = false;
          this.sentimentFilter = 'all';
          this.displayLimit = this.DISPLAY_PAGE_SIZE;

          // Re-render conversation list
          const conversationsEl = document.getElementById('conversations');
          if (conversationsEl) {
            delete conversationsEl.dataset.delegated;
            conversationsEl.innerHTML = this.renderConversationList();
            this.attachConversationListeners();
          }
        }

        // Update button appearance
        filterToggleBtn.style.background = this.filtersExpanded ? 'var(--primary-color)' : 'none';
        filterToggleBtn.style.color = this.filtersExpanded ? 'white' : 'var(--text-secondary)';
        filterToggleBtn.style.borderColor = this.filtersExpanded ? 'var(--primary-color)' : 'var(--border-color)';
      });
    }
  },

  attachEditToggleListener() {
    const editToggleBtn = document.getElementById('edit-toggle-btn');
    const editActionsContainer = document.getElementById('edit-actions-container');

    // Only attach toggle button listener once (check for flag)
    if (editToggleBtn && editActionsContainer && !editToggleBtn.dataset.listenerAttached) {
      editToggleBtn.dataset.listenerAttached = 'true';
      editToggleBtn.addEventListener('click', () => {
        this.editModeExpanded = !this.editModeExpanded;
        editActionsContainer.style.display = this.editModeExpanded ? 'block' : 'none';

        // Exit select mode when closing edit actions
        if (!this.editModeExpanded && this.selectMode) {
          this.selectMode = false;
          this.selectedForDeletion.clear();
          this.refreshConversationList();
        }

        // Update button appearance
        editToggleBtn.style.background = this.editModeExpanded ? 'var(--primary-color)' : 'none';
        editToggleBtn.style.color = this.editModeExpanded ? 'white' : 'var(--text-secondary)';
        editToggleBtn.style.borderColor = this.editModeExpanded ? 'var(--primary-color)' : 'var(--border-color)';
      });
    }

    // Attach action button listeners (these get re-attached when container is re-rendered)
    this.attachEditActionListeners();
  },

  attachEditActionListeners() {
    // Mark All Read button
    const markAllReadBtn = document.getElementById('mark-all-read-btn');
    if (markAllReadBtn) {
      markAllReadBtn.addEventListener('click', () => this.markAllAsRead());
    }

    // Select to Delete button
    const selectDeleteBtn = document.getElementById('select-delete-btn');
    if (selectDeleteBtn) {
      selectDeleteBtn.addEventListener('click', () => {
        this.selectMode = !this.selectMode;
        if (!this.selectMode) {
          this.selectedForDeletion.clear();
        }
        this.refreshConversationList();
        // Re-render edit actions to update button state
        const editActionsContainer = document.getElementById('edit-actions-container');
        if (editActionsContainer) {
          editActionsContainer.innerHTML = this.renderEditActions();
          this.attachEditActionListeners(); // Re-attach action listeners only
        }
      });
    }

    // Confirm Delete button
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    if (confirmDeleteBtn) {
      confirmDeleteBtn.addEventListener('click', () => this.deleteSelectedConversations());
    }
  },

  renderEditActions() {
    return `
      <div class="inbox-filters" style="justify-content: center; gap: 0.5rem;">
        <button class="inbox-filter-btn" id="mark-all-read-btn" style="display: flex; align-items: center; gap: 0.375rem;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          Mark All Read
        </button>
        <button class="inbox-filter-btn ${this.selectMode ? 'active' : ''}" id="select-delete-btn" style="display: flex; align-items: center; gap: 0.375rem;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          ${this.selectMode ? 'Cancel Selection' : 'Select to Delete'}
        </button>
        ${this.selectMode && this.selectedForDeletion.size > 0 ? `
        <button class="inbox-filter-btn" id="confirm-delete-btn" style="background: #ef4444; color: white; border-color: #ef4444; display: flex; align-items: center; gap: 0.375rem;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
          Delete (${this.selectedForDeletion.size})
        </button>
        ` : ''}
      </div>
    `;
  },

  async markAllAsRead() {
    // Use unified service to mark all as read
    await markAllReadService();

    // Update local conversation state
    for (const conv of this.conversations) {
      if (conv.unreadCount > 0) {
        const convKey = this.getConversationKey(conv);
        this.viewedConversations.add(convKey);
        conv.unreadCount = 0;

        // Also mark chat sessions in database
        if (conv.type === 'chat') {
          ChatSession.markAsRead(conv.chatSessionId);
        }
      }
    }

    // Refresh the list
    this.refreshConversationList();
  },

  async deleteSelectedConversations() {
    if (this.selectedForDeletion.size === 0) return;

    const count = this.selectedForDeletion.size;
    const itemName = count === 1 ? 'this conversation' : `${count} conversations`;
    const confirmDelete = await showDeleteConfirmModal(itemName);
    if (!confirmDelete) return;

    const { user } = await getCurrentUser();
    if (!user) return;

    for (const convKey of this.selectedForDeletion) {
      const conv = this.conversations.find(c => this.getConversationKey(c) === convKey);
      if (!conv) continue;

      try {
        if (conv.type === 'sms') {
          // Delete all SMS messages for this conversation
          await supabase
            .from('sms_messages')
            .delete()
            .eq('user_id', user.id)
            .or(`sender_number.eq.${conv.phone},recipient_number.eq.${conv.phone}`);
        } else if (conv.type === 'chat') {
          // Delete chat session and messages
          await supabase.from('chat_messages').delete().eq('session_id', conv.chatSessionId);
          await supabase.from('chat_sessions').delete().eq('id', conv.chatSessionId);
        } else if (conv.type === 'email') {
          // Delete email messages for this thread
          await supabase.from('email_messages').delete().eq('thread_id', conv.emailThreadId).eq('user_id', user.id);
        } else if (conv.type === 'call') {
          // Delete call record
          await supabase.from('call_records').delete().eq('id', conv.callId);
        }

        // Remove from conversations list
        const index = this.conversations.findIndex(c => this.getConversationKey(c) === convKey);
        if (index > -1) {
          this.conversations.splice(index, 1);
        }
      } catch (error) {
        console.error('Error deleting conversation:', error);
      }
    }

    // Clear selection and exit select mode
    this.selectedForDeletion.clear();
    this.selectMode = false;

    // Refresh the list and edit actions
    this.refreshConversationList();
    const editActionsContainer = document.getElementById('edit-actions-container');
    if (editActionsContainer) {
      editActionsContainer.innerHTML = this.renderEditActions();
      this.attachEditActionListeners();
    }
  },

  refreshConversationList() {
    const conversationsEl = document.getElementById('conversations');
    if (conversationsEl) {
      // Remove delegated flag so listeners get re-attached
      delete conversationsEl.dataset.delegated;
      conversationsEl.innerHTML = this.renderConversationList();
      this.attachConversationListeners();
    }
  },

  attachSearchListener() {
    const searchToggle = document.getElementById('inbox-search-toggle');
    const searchExpanded = document.getElementById('inbox-search-expanded');
    const searchInput = document.getElementById('inbox-search');
    const dateFilter = document.getElementById('inbox-date-filter');

    const newConversationBtn = document.getElementById('new-conversation-btn');

    // Toggle search expansion
    if (searchToggle) {
      searchToggle.addEventListener('click', () => {
        this.searchExpanded = true;
        searchToggle.style.display = 'none';
        searchExpanded.style.display = 'flex';
        if (newConversationBtn) newConversationBtn.style.display = 'none';
        searchInput?.focus();
      });
    }

    // Collapse search when input loses focus and is empty
    const searchContainer = document.getElementById('inbox-search-container');
    if (searchInput) {
      searchInput.addEventListener('blur', () => {
        // Delay to allow clicking date filter or other elements in container
        setTimeout(() => {
          // Check if focus moved to another element within the search container
          const activeElement = document.activeElement;
          const isStillInContainer = searchContainer?.contains(activeElement);

          if (!isStillInContainer && !this.searchQuery && this.dateFilter === 'all') {
            this.searchExpanded = false;
            if (searchToggle) searchToggle.style.display = 'flex';
            if (searchExpanded) searchExpanded.style.display = 'none';
            if (newConversationBtn) newConversationBtn.style.display = 'flex';
          }
        }, 150);
      });
    }

    // Also collapse when date filter loses focus (if both are empty/default)
    if (dateFilter) {
      dateFilter.addEventListener('blur', () => {
        setTimeout(() => {
          const activeElement = document.activeElement;
          const isStillInContainer = searchContainer?.contains(activeElement);

          if (!isStillInContainer && !this.searchQuery && this.dateFilter === 'all') {
            this.searchExpanded = false;
            if (searchToggle) searchToggle.style.display = 'flex';
            if (searchExpanded) searchExpanded.style.display = 'none';
            if (newConversationBtn) newConversationBtn.style.display = 'flex';
          }
        }, 150);
      });
    }

    // Debounce search to avoid too many re-renders
    let debounceTimer;
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.searchQuery = e.target.value;
          this.displayLimit = this.DISPLAY_PAGE_SIZE;
          const conversationsEl = document.getElementById('conversations');
          if (conversationsEl) {
            delete conversationsEl.dataset.delegated;
            conversationsEl.innerHTML = this.renderConversationList();
            this.attachConversationListeners();
          }
        }, 300);
      });
    }

    // Date filter change
    if (dateFilter) {
      dateFilter.addEventListener('change', (e) => {
        this.dateFilter = e.target.value;
        this.displayLimit = this.DISPLAY_PAGE_SIZE;
        const conversationsEl = document.getElementById('conversations');
        if (conversationsEl) {
          delete conversationsEl.dataset.delegated;
          conversationsEl.innerHTML = this.renderConversationList();
          this.attachConversationListeners();
        }
      });
    }
  },

  attachFilterListeners() {
    const filtersContainer = document.getElementById('inbox-filters');
    const statusFiltersContainer = document.getElementById('inbox-filters-status');
    const sentimentFiltersContainer = document.getElementById('inbox-filters-sentiment');
    if (!filtersContainer) return;

    const handleFilterClick = (e) => {
      const btn = e.target.closest('.inbox-filter-btn');
      if (!btn) return;

      // Handle "All" reset button
      if (btn.dataset.filterReset) {
        this.typeFilter = 'all';
        this.directionFilter = 'all';
        this.missedFilter = false;
        this.unreadFilter = false;
        this.sentimentFilter = 'all';
      }
      // Handle type filter (calls/texts)
      else if (btn.dataset.filterType) {
        const type = btn.dataset.filterType;
        // Toggle: if already selected, go back to 'all'
        this.typeFilter = this.typeFilter === type ? 'all' : type;
        // Clear missed filter when changing type (unless selecting calls)
        if (type === 'texts') this.missedFilter = false;
      }
      // Handle direction filter (in/out)
      else if (btn.dataset.filterDirection) {
        const direction = btn.dataset.filterDirection;
        // Toggle: if already selected, go back to 'all'
        this.directionFilter = this.directionFilter === direction ? 'all' : direction;
      }
      // Handle missed filter
      else if (btn.dataset.filterMissed) {
        this.missedFilter = !this.missedFilter;
        // Missed only applies to calls
        if (this.missedFilter && this.typeFilter === 'texts') {
          this.typeFilter = 'calls';
        }
      }
      // Handle unread filter
      else if (btn.dataset.filterUnread) {
        this.unreadFilter = !this.unreadFilter;
      }
      // Handle sentiment filter
      else if (btn.dataset.filterSentiment) {
        const sentiment = btn.dataset.filterSentiment;
        // Toggle: if already selected, go back to 'all'
        this.sentimentFilter = this.sentimentFilter === sentiment ? 'all' : sentiment;
      }

      // Update button states
      this.updateFilterButtonStates();

      // Reset pagination and re-render conversation list
      this.displayLimit = this.DISPLAY_PAGE_SIZE;
      const conversationsEl = document.getElementById('conversations');
      if (conversationsEl) {
        delete conversationsEl.dataset.delegated;
        conversationsEl.innerHTML = this.renderConversationList();
        this.attachConversationListeners();
      }
    };

    filtersContainer.addEventListener('click', handleFilterClick);
    if (statusFiltersContainer) {
      statusFiltersContainer.addEventListener('click', handleFilterClick);
    }
    if (sentimentFiltersContainer) {
      sentimentFiltersContainer.addEventListener('click', handleFilterClick);
    }
  },

  updateFilterButtonStates() {
    const allBtn = document.querySelector('[data-filter-reset]');
    const callsBtn = document.querySelector('[data-filter-type="calls"]');
    const textsBtn = document.querySelector('[data-filter-type="texts"]');
    const chatBtn = document.querySelector('[data-filter-type="chat"]');
    const emailBtn = document.querySelector('[data-filter-type="email"]');
    const inBtn = document.querySelector('[data-filter-direction="inbound"]');
    const outBtn = document.querySelector('[data-filter-direction="outbound"]');
    const missedBtn = document.querySelector('[data-filter-missed]');
    const unreadBtn = document.querySelector('[data-filter-unread]');
    const positiveBtn = document.querySelector('[data-filter-sentiment="positive"]');
    const neutralBtn = document.querySelector('[data-filter-sentiment="neutral"]');
    const negativeBtn = document.querySelector('[data-filter-sentiment="negative"]');

    // Reset all
    [allBtn, callsBtn, textsBtn, chatBtn, emailBtn, inBtn, outBtn, missedBtn, unreadBtn, positiveBtn, neutralBtn, negativeBtn].forEach(b => b?.classList.remove('active'));

    // Set active states
    const isAllClear = this.typeFilter === 'all' && this.directionFilter === 'all' && !this.missedFilter && !this.unreadFilter && this.sentimentFilter === 'all';
    if (isAllClear) {
      allBtn?.classList.add('active');
    } else {
      if (this.typeFilter === 'calls') callsBtn?.classList.add('active');
      if (this.typeFilter === 'texts') textsBtn?.classList.add('active');
      if (this.typeFilter === 'chat') chatBtn?.classList.add('active');
      if (this.typeFilter === 'email') emailBtn?.classList.add('active');
      if (this.directionFilter === 'inbound') inBtn?.classList.add('active');
      if (this.directionFilter === 'outbound') outBtn?.classList.add('active');
      if (this.missedFilter) missedBtn?.classList.add('active');
      if (this.unreadFilter) unreadBtn?.classList.add('active');
      if (this.sentimentFilter === 'positive') positiveBtn?.classList.add('active');
      if (this.sentimentFilter === 'neutral') neutralBtn?.classList.add('active');
      if (this.sentimentFilter === 'negative') negativeBtn?.classList.add('active');
    }

    // Update filter toggle button appearance
    const filterToggleBtn = document.getElementById('filter-toggle-btn');
    if (filterToggleBtn) {
      const hasFilters = !isAllClear;
      filterToggleBtn.style.background = (this.filtersExpanded || hasFilters) ? 'var(--primary-color)' : 'none';
      filterToggleBtn.style.color = (this.filtersExpanded || hasFilters) ? 'white' : 'var(--text-secondary)';
      filterToggleBtn.style.borderColor = (this.filtersExpanded || hasFilters) ? 'var(--primary-color)' : 'var(--border-color)';
    }
  },

  attachPhoneLinkHandler() {
    // Event delegation for phone number links in messages
    // Attach to message-thread parent (not replaced on re-render)
    const threadElement = document.getElementById('message-thread');
    if (threadElement) {
      threadElement.addEventListener('click', (e) => {
        if (e.target.classList.contains('message-phone-link')) {
          e.preventDefault();
          const phoneNumber = e.target.dataset.phone;
          window.navigateTo(`/phone?dial=${encodeURIComponent(phoneNumber)}`);
        }
        // Translate single SMS message
        if (e.target.classList.contains('translate-msg-link')) {
          e.preventDefault();
          const msgId = e.target.dataset.translateMsgId;
          if (msgId) this.translateMessage(msgId, e.target);
        }
        // Translate call transcript
        if (e.target.classList.contains('translate-transcript-link')) {
          e.preventDefault();
          const callId = e.target.dataset.translateCallId;
          if (callId) this.translateTranscript(callId, e.target);
        }
        // Translate all messages in conversation
        if (e.target.closest('.translate-all-link')) {
          e.preventDefault();
          this.translateAllMessages(e.target.closest('.translate-all-link'));
        }
      });
    }
  },

  attachDropdownListeners() {
    // New conversation button - toggle dropdown
    const newConvBtn = document.getElementById('new-conversation-btn');
    const dropdown = document.getElementById('new-message-dropdown');

    if (newConvBtn && dropdown) {
      newConvBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
      });

      // Close dropdown on outside click
      document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && e.target !== newConvBtn) {
          dropdown.style.display = 'none';
        }
      });

      // Close dropdown on Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          dropdown.style.display = 'none';
        }
      });

      // Handle dropdown item clicks
      dropdown.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
          const action = item.dataset.action;
          dropdown.style.display = 'none';

          if (action === 'new-message') {
            this.showNewConversationModal();
          } else if (action === 'agent-message') {
            this.showAgentMessageInterface();
          } else if (action === 'new-email') {
            this.showEmailComposeInterface();
          } else if (action === 'agent-email') {
            this.showEmailComposeInterface({ agentMode: true });
          }
          // Future actions: bulk-message, bulk-agent-message
        });
      });
    }
  },

  attachConversationListeners() {
    // Use event delegation - single listener on parent instead of one per item
    // This dramatically improves mobile scroll performance
    const conversationsEl = document.getElementById('conversations');
    if (!conversationsEl || conversationsEl.dataset.delegated) return;

    // Mark as delegated to prevent duplicate listeners
    conversationsEl.dataset.delegated = 'true';

    // Attach swipe handlers for mobile
    this.attachSwipeHandlers(conversationsEl);

    // Infinite scroll: observe sentinel to load more conversations
    if (this.scrollObserver) this.scrollObserver.disconnect();
    const sentinel = conversationsEl.querySelector('.inbox-load-more-sentinel');
    if (sentinel) {
      this.scrollObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          this.displayLimit += this.DISPLAY_PAGE_SIZE;
          // Remove delegated flag so listeners get re-attached after re-render
          delete conversationsEl.dataset.delegated;
          conversationsEl.innerHTML = this.renderConversationList();
          this.attachConversationListeners();
        }
      });
      this.scrollObserver.observe(sentinel);
    }

    conversationsEl.addEventListener('click', async (e) => {
      // Handle delete button click
      const deleteBtn = e.target.closest('.swipe-delete-btn');
      if (deleteBtn) {
        e.preventDefault();
        e.stopPropagation();
        const convKey = deleteBtn.dataset.convKey;
        this.showDeleteConfirmation(convKey);
        return;
      }

      // Handle copy call ID click
      const copyBtn = e.target.closest('.copy-call-id-btn');
      if (copyBtn) {
        e.preventDefault();
        e.stopPropagation();
        const callId = copyBtn.dataset.callId;
        if (callId) {
          navigator.clipboard.writeText(callId).then(() => {
            // Show "Copied" tooltip at mouse position
            const tooltip = document.createElement('span');
            tooltip.textContent = 'Copied';
            tooltip.style.cssText = `position: fixed; top: ${e.clientY - 30}px; left: ${e.clientX}px; transform: translateX(-50%); background: var(--bg-primary); color: var(--text-primary); padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 10000; pointer-events: none;`;
            document.body.appendChild(tooltip);
            setTimeout(() => tooltip.remove(), 3000);
          });
        }
        return;
      }

      // Handle select mode checkbox click
      const checkbox = e.target.closest('input[type="checkbox"][data-conv-key]');
      if (checkbox && this.selectMode) {
        const convKey = checkbox.dataset.convKey;
        if (checkbox.checked) {
          this.selectedForDeletion.add(convKey);
        } else {
          this.selectedForDeletion.delete(convKey);
        }
        // Update the delete button count
        const editActionsContainer = document.getElementById('edit-actions-container');
        if (editActionsContainer) {
          editActionsContainer.innerHTML = this.renderEditActions();
          this.attachEditActionListeners();
        }
        return;
      }

      // Don't trigger conversation click if container is swiped
      const swipeContainer = e.target.closest('.swipe-container');
      if (swipeContainer && swipeContainer.classList.contains('swiped')) {
        // Close the swipe instead
        swipeContainer.classList.remove('swiped');
        return;
      }
      const item = e.target.closest('.conversation-item');
      if (!item) return;

      const isMobile = window.innerWidth <= 768;
      const type = item.dataset.type;

      if (type === 'call') {
        // Handle call conversation click
        this.selectedCallId = item.dataset.callId;
        this.selectedContact = null;
        this.selectedServiceNumber = null;
        this.selectedChatSessionId = null;
        this.selectedEmailThreadId = null;

        // Save as last selected for next page load
        localStorage.setItem('inbox_last_selected_call', this.selectedCallId);
        localStorage.removeItem('inbox_last_selected_contact');
        localStorage.removeItem('inbox_last_selected_service_number');
        localStorage.removeItem('inbox_last_selected_chat');

        // Mark as read using unified service
        markAsRead('call', this.selectedCallId);
        this.viewedConversations.add(`call_${this.selectedCallId}`);

        // Clear unread count for this call
        const conv = this.conversations.find(c => c.type === 'call' && c.callId === this.selectedCallId);
        if (conv) {
          conv.unreadCount = 0;
        }
      } else if (type === 'chat') {
        // Handle chat conversation click
        this.selectedChatSessionId = item.dataset.chatSessionId;
        this.selectedContact = null;
        this.selectedServiceNumber = null;
        this.selectedCallId = null;
        this.selectedEmailThreadId = null;

        // Save as last selected for next page load
        localStorage.setItem('inbox_last_selected_chat', this.selectedChatSessionId);
        localStorage.removeItem('inbox_last_selected_contact');
        localStorage.removeItem('inbox_last_selected_service_number');
        localStorage.removeItem('inbox_last_selected_call');

        // Mark as read using unified service
        markAsRead('chat', this.selectedChatSessionId);
        this.viewedConversations.add(`chat_${this.selectedChatSessionId}`);

        // Clear unread count for this conversation
        const conv = this.conversations.find(c => c.type === 'chat' && c.chatSessionId === this.selectedChatSessionId);
        if (conv) {
          conv.unreadCount = 0;
        }

        // Mark messages as read in database
        ChatSession.markAsRead(this.selectedChatSessionId);
      } else if (type === 'email') {
        // Handle email conversation click
        this.selectedEmailThreadId = item.dataset.emailThreadId;
        this.selectedContact = null;
        this.selectedServiceNumber = null;
        this.selectedCallId = null;
        this.selectedChatSessionId = null;

        // Save as last selected for next page load
        localStorage.setItem('inbox_last_selected_email', this.selectedEmailThreadId);
        localStorage.removeItem('inbox_last_selected_contact');
        localStorage.removeItem('inbox_last_selected_service_number');
        localStorage.removeItem('inbox_last_selected_call');
        localStorage.removeItem('inbox_last_selected_chat');

        // Mark as read
        markAsRead('email', this.selectedEmailThreadId);
        this.viewedConversations.add(`email_${this.selectedEmailThreadId}`);

        // Clear unread count
        const conv = this.conversations.find(c => c.type === 'email' && c.emailThreadId === this.selectedEmailThreadId);
        if (conv) {
          conv.unreadCount = 0;
        }
      } else {
        // Handle SMS conversation click
        this.selectedContact = item.dataset.phone;
        this.selectedServiceNumber = item.dataset.serviceNumber;
        this.selectedCallId = null;
        this.selectedChatSessionId = null;
        this.selectedEmailThreadId = null;

        // Save as last selected for next page load
        localStorage.setItem('inbox_last_selected_contact', this.selectedContact);
        localStorage.setItem('inbox_last_selected_service_number', this.selectedServiceNumber);
        localStorage.removeItem('inbox_last_selected_call');
        localStorage.removeItem('inbox_last_selected_chat');
        localStorage.removeItem('inbox_last_selected_email');

        // Mark as read using unified service
        const smsKey = `${this.selectedContact}_${this.selectedServiceNumber}`;
        markAsRead('sms', smsKey);
        this.viewedConversations.add(smsKey);

        // Clear unread count for this conversation
        const conv = this.conversations.find(c => c.type === 'sms' && c.phone === this.selectedContact && c.serviceNumber === this.selectedServiceNumber);
        if (conv) {
          conv.unreadCount = 0;
        }
      }

      // Update conversation list - use fresh references to avoid stale DOM issues
      const freshConversationsEl = document.getElementById('conversations');
      if (freshConversationsEl) {
        freshConversationsEl.innerHTML = this.renderConversationList();
      }

      // Update thread view
      const threadElement = document.getElementById('message-thread');
      if (threadElement) {
        threadElement.innerHTML = this.renderMessageThread();
      }

      // Attach input listeners for SMS and chat threads
      if (type === 'sms' || type === 'chat') {
        this.attachMessageInputListeners();
      }

      // Attach email reply button listener
      if (type === 'email') {
        this.attachEmailReplyListener();
        // Scroll to bottom
        const threadMessages = document.getElementById('thread-messages');
        if (threadMessages) {
          setTimeout(() => { threadMessages.scrollTop = threadMessages.scrollHeight; }, 100);
        }
      }

      // Show thread on mobile
      if (isMobile && threadElement) {
        threadElement.classList.add('show');
      }

      // Attach back button listener with fresh references
      this.attachBackButtonListener(threadElement, freshConversationsEl, isMobile);

      // Attach redial button listener for calls
      if (type === 'call') {
        this.attachRedialButtonListener();
      }

      // Scroll to bottom of messages for SMS
      if (type === 'sms') {
        const threadMessages = document.getElementById('thread-messages');
        if (threadMessages) {
          setTimeout(() => {
            threadMessages.scrollTop = threadMessages.scrollHeight;
          }, 100);
        }
      }
    });
  },

  attachSwipeHandlers(conversationsEl) {
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) return; // Only enable swipe on mobile

    let startX = 0;
    let startY = 0;
    let currentContainer = null;
    let isSwiping = false;

    conversationsEl.addEventListener('touchstart', (e) => {
      const container = e.target.closest('.swipe-container');
      if (!container) return;

      // Close any other open swipe containers
      document.querySelectorAll('.swipe-container.swiped').forEach(c => {
        if (c !== container) c.classList.remove('swiped');
      });

      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      currentContainer = container;
      isSwiping = false;
    }, { passive: true });

    conversationsEl.addEventListener('touchmove', (e) => {
      if (!currentContainer) return;

      const deltaX = e.touches[0].clientX - startX;
      const deltaY = e.touches[0].clientY - startY;

      // Only swipe if horizontal movement is greater than vertical
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
        isSwiping = true;
        const content = currentContainer.querySelector('.swipe-content');
        const deleteBtn = currentContainer.querySelector('.swipe-delete-btn');

        if (content && deleteBtn) {
          // Only allow left swipe (negative deltaX)
          const translateX = Math.max(-80, Math.min(0, deltaX));
          content.style.transition = 'none';
          content.style.transform = `translateX(${translateX}px)`;
          deleteBtn.style.transition = 'none';
          deleteBtn.style.transform = `translateX(${translateX + 80}px)`;
        }
      }
    }, { passive: true });

    conversationsEl.addEventListener('touchend', (e) => {
      if (!currentContainer || !isSwiping) {
        currentContainer = null;
        return;
      }

      const content = currentContainer.querySelector('.swipe-content');
      const deleteBtn = currentContainer.querySelector('.swipe-delete-btn');
      const deltaX = e.changedTouches[0].clientX - startX;

      if (content && deleteBtn) {
        // Reset transitions
        content.style.transition = '';
        content.style.transform = '';
        deleteBtn.style.transition = '';
        deleteBtn.style.transform = '';

        // If swiped more than 40px left, reveal delete button
        if (deltaX < -40) {
          currentContainer.classList.add('swiped');
        } else {
          currentContainer.classList.remove('swiped');
        }
      }

      currentContainer = null;
      isSwiping = false;
    }, { passive: true });
  },

  showDeleteConfirmation(convKey) {
    // Create confirmation modal
    const overlay = document.createElement('div');
    overlay.className = 'delete-confirm-overlay';
    overlay.innerHTML = `
      <div class="delete-confirm-modal">
        <div class="delete-confirm-header">
          <h3>Delete Conversation</h3>
          <p>This conversation will be hidden. It will reappear if you receive a new message.</p>
        </div>
        <div class="delete-confirm-actions">
          <button class="delete-confirm-btn danger" id="confirm-delete-btn">Delete</button>
          <button class="delete-confirm-btn cancel" id="cancel-delete-btn">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Handle delete confirmation
    document.getElementById('confirm-delete-btn').addEventListener('click', () => {
      this.hideConversation(convKey);
      overlay.remove();
    });

    // Handle cancel
    document.getElementById('cancel-delete-btn').addEventListener('click', () => {
      // Close swipe on the conversation
      document.querySelectorAll('.swipe-container.swiped').forEach(c => {
        c.classList.remove('swiped');
      });
      overlay.remove();
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        document.querySelectorAll('.swipe-container.swiped').forEach(c => {
          c.classList.remove('swiped');
        });
        overlay.remove();
      }
    });
  },

  hideConversation(convKey) {
    // Add to hidden conversations set
    this.hiddenConversations.add(convKey);

    // Save to localStorage for persistence
    const hidden = JSON.parse(localStorage.getItem('hiddenConversations') || '[]');
    if (!hidden.includes(convKey)) {
      hidden.push(convKey);
      localStorage.setItem('hiddenConversations', JSON.stringify(hidden));
    }

    // Re-render conversation list
    const conversationsEl = document.getElementById('conversations');
    if (conversationsEl) {
      conversationsEl.innerHTML = this.renderConversationList();
    }
  },

  loadHiddenConversations() {
    // Load hidden conversations from localStorage
    const hidden = JSON.parse(localStorage.getItem('hiddenConversations') || '[]');
    this.hiddenConversations = new Set(hidden);
  },

  unhideConversation(convKey) {
    // Remove from hidden set
    this.hiddenConversations.delete(convKey);

    // Update localStorage
    const hidden = JSON.parse(localStorage.getItem('hiddenConversations') || '[]');
    const updated = hidden.filter(k => k !== convKey);
    localStorage.setItem('hiddenConversations', JSON.stringify(updated));
  },

  attachBackButtonListener(threadElement, conversationsEl, isMobile) {
    const backButton = document.getElementById('back-button');
    if (!backButton) return;

    // Use a single listener approach - remove old and add new
    const newBackButton = backButton.cloneNode(true);
    backButton.parentNode.replaceChild(newBackButton, backButton);

    newBackButton.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isMobile) {
        threadElement.classList.remove('show');
      } else {
        // On desktop, clear selection
        this.selectedContact = null;
        this.selectedServiceNumber = null;
        this.selectedCallId = null;
        threadElement.innerHTML = this.renderEmptyState();

        // Update conversation list - use fresh reference to avoid stale DOM issues
        const freshConversationsEl = document.getElementById('conversations');
        if (freshConversationsEl) {
          freshConversationsEl.innerHTML = this.renderConversationList();
        }
      }
    });
  },

  attachEmailReplyListener() {
    const replyBtn = document.getElementById('email-reply-btn');
    if (replyBtn) {
      replyBtn.addEventListener('click', () => {
        const conv = this.conversations.find(c => c.type === 'email' && c.emailThreadId === this.selectedEmailThreadId);
        if (!conv) return;

        // Pre-fill compose with reply context
        const lastInbound = [...conv.messages].reverse().find(m => m.direction === 'inbound');
        const replyTo = lastInbound?.from_email || conv.email;
        const replySubject = conv.subject?.startsWith('Re:') ? conv.subject : `Re: ${conv.subject || ''}`;
        const threadId = conv.emailThreadId;
        const inReplyTo = lastInbound?.gmail_message_id;

        this.showEmailComposeInterface({
          replyTo,
          subject: replySubject,
          threadId,
          inReplyTo,
        });
      });
    }
  },

  attachRedialButtonListener() {
    // Copy call ID button (in call detail header)
    const copyBtns = document.querySelectorAll('#message-thread .copy-call-id-btn');
    copyBtns.forEach(copyBtn => {
      copyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const callId = copyBtn.dataset.callId;
        if (callId) {
          navigator.clipboard.writeText(callId).then(() => {
            const tooltip = document.createElement('span');
            tooltip.textContent = 'Copied';
            tooltip.style.cssText = `position: fixed; top: ${e.clientY - 30}px; left: ${e.clientX}px; transform: translateX(-50%); background: var(--bg-primary); color: var(--text-primary); padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 10000; pointer-events: none;`;
            document.body.appendChild(tooltip);
            setTimeout(() => tooltip.remove(), 3000);
          });
        }
      });
    });

    // Call action button
    const callBtn = document.getElementById('call-action-btn');
    if (callBtn) {
      callBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const phoneNumber = callBtn.dataset.phone;
        if (phoneNumber) {
          window.navigateTo(`/phone?dial=${encodeURIComponent(phoneNumber)}`);
        }
      });
    }

    // Message action button - open SMS thread directly (already on inbox page)
    const messageBtn = document.getElementById('message-action-btn');
    console.log('Attaching Message button listener:', !!messageBtn, messageBtn?.dataset?.phone);
    if (messageBtn) {
      messageBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const phoneNumber = messageBtn.dataset.phone;
        console.log('Message button clicked, phone:', phoneNumber);

        // Visual feedback
        messageBtn.style.backgroundColor = '#e0e0ff';
        setTimeout(() => { messageBtn.style.backgroundColor = ''; }, 200);

        if (phoneNumber && phoneNumber !== 'undefined' && phoneNumber !== 'null') {
          try {
            this.openNewConversation(phoneNumber);
          } catch (err) {
            console.error('Error in openNewConversation:', err);
            showAlertModal('Error', err.message);
          }
        } else {
          console.error('No valid phone number on message button:', phoneNumber);
          showAlertModal('No Phone Number', 'No phone number available for this call');
        }
      });
    } else {
      console.warn('Message button not found when attaching listener');
    }

    // Clickable phone numbers - copy on click with tooltip at mouse position
    const clickablePhones = document.querySelectorAll('#message-thread .clickable-phone');
    clickablePhones.forEach(phoneEl => {
      phoneEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const phone = phoneEl.dataset.phone;
        if (phone) {
          navigator.clipboard.writeText(phone).then(() => {
            const tooltip = document.createElement('span');
            tooltip.textContent = 'Copied';
            tooltip.style.cssText = `position: fixed; top: ${e.clientY - 30}px; left: ${e.clientX}px; transform: translateX(-50%); background: var(--bg-primary); color: var(--text-primary); padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 10000; pointer-events: none;`;
            document.body.appendChild(tooltip);
            setTimeout(() => tooltip.remove(), 3000);
          });
        }
      });
    });

    // Clickable IDs (recording_sid, etc.) - copy on click with tooltip at mouse position
    const clickableIds = document.querySelectorAll('#message-thread .clickable-id');
    clickableIds.forEach(idEl => {
      idEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = idEl.dataset.id;
        if (id) {
          navigator.clipboard.writeText(id).then(() => {
            const tooltip = document.createElement('span');
            tooltip.textContent = 'Copied';
            tooltip.style.cssText = `position: fixed; top: ${e.clientY - 30}px; left: ${e.clientX}px; transform: translateX(-50%); background: var(--bg-primary); color: var(--text-primary); padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 10000; pointer-events: none;`;
            document.body.appendChild(tooltip);
            setTimeout(() => tooltip.remove(), 3000);
          });
        }
      });
    });

    // Add contact link - show modal to confirm adding suggested name as contact
    const addContactLinks = document.querySelectorAll('#message-thread .add-contact-link');
    addContactLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const name = link.dataset.name;
        const phone = link.dataset.phone;
        if (name && phone) {
          this.showAddContactModal(name, phone);
        }
      });
    });
  },

  showAddContactModal(name, phone) {
    // Remove any existing modal
    const existing = document.getElementById('add-contact-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'add-contact-modal-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10001;
    `;

    overlay.innerHTML = `
      <div style="
        background: var(--bg-primary);
        border-radius: 12px;
        padding: 1.5rem;
        max-width: 320px;
        width: 90%;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      ">
        <h3 style="margin: 0 0 0.75rem; font-size: 1rem; font-weight: 600;">Add to Contacts</h3>
        <p style="margin: 0 0 1.25rem; color: var(--text-secondary); font-size: 0.9rem;">
          Add <strong>${name}</strong> as a contact for ${this.formatPhoneNumber(phone)}?
        </p>
        <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
          <button id="add-contact-no" style="
            padding: 0.5rem 1rem;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            background: transparent;
            color: var(--text-primary);
            cursor: pointer;
            font-size: 0.85rem;
          ">No</button>
          <button id="add-contact-yes" style="
            padding: 0.5rem 1rem;
            border: none;
            border-radius: 6px;
            background: var(--primary-color);
            color: white;
            cursor: pointer;
            font-size: 0.85rem;
          ">Yes</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Handle No button
    document.getElementById('add-contact-no').addEventListener('click', () => {
      overlay.remove();
    });

    // Handle Yes button
    document.getElementById('add-contact-yes').addEventListener('click', async () => {
      await this.saveContactName(name, phone);
      overlay.remove();
      showToast('Contact saved!', 'success');
    });

    // Close on backdrop click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  },

  async saveContactName(name, phone) {
    try {
      // Check if contact exists
      const existingContact = this.contactsMap?.[phone];

      if (existingContact) {
        // Update existing contact
        await supabase
          .from('contacts')
          .update({ first_name: name })
          .eq('id', existingContact.id);

        // Update local cache
        existingContact.first_name = name;
        existingContact.name = name;
      } else {
        // Create new contact
        const { data: newContact, error } = await supabase
          .from('contacts')
          .insert({
            user_id: this.userId,
            phone_number: phone,
            first_name: name
          })
          .select()
          .single();

        if (!error && newContact) {
          // Add to local cache
          this.contactsMap[phone] = newContact;
        }
      }

      // Re-render the thread to show updated name
      const threadElement = document.getElementById('message-thread');
      if (threadElement && this.selectedCallId) {
        threadElement.innerHTML = this.renderMessageThread();
        this.attachRedialButtonListener();
      }
    } catch (err) {
      console.error('Error saving contact:', err);
    }
  },

  attachMessageInputListeners() {
    const input = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const sendChatBtn = document.getElementById('send-chat-btn');

    console.log('Attaching message input listeners', { input, sendButton, sendChatBtn });

    // Clickable phone numbers - copy on click with tooltip at mouse position
    const clickablePhones = document.querySelectorAll('#message-thread .clickable-phone');
    clickablePhones.forEach(phoneEl => {
      phoneEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const phone = phoneEl.dataset.phone;
        if (phone) {
          navigator.clipboard.writeText(phone).then(() => {
            const tooltip = document.createElement('span');
            tooltip.textContent = 'Copied';
            tooltip.style.cssText = `position: fixed; top: ${e.clientY - 30}px; left: ${e.clientX}px; transform: translateX(-50%); background: var(--bg-primary); color: var(--text-primary); padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 10000; pointer-events: none;`;
            document.body.appendChild(tooltip);
            setTimeout(() => tooltip.remove(), 3000);
          });
        }
      });
    });

    // Call action button (for SMS thread header)
    const callBtn = document.getElementById('call-action-btn');
    if (callBtn && !callBtn._listenerAttached) {
      callBtn._listenerAttached = true;
      callBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const phoneNumber = callBtn.dataset.phone;
        if (phoneNumber) {
          window.navigateTo(`/phone?dial=${encodeURIComponent(phoneNumber)}`);
        }
      });
    }

    // For SMS, we need input and sendButton
    // For Chat, we need input and sendChatBtn
    // Handle chat-specific listeners first if this is a chat thread
    if (sendChatBtn && this.selectedChatSessionId) {
      // Load chat messages
      this.loadChatMessages(this.selectedChatSessionId);

      // Send button listener
      sendChatBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.sendChatMessage();
      });

      // Enter to send for chat
      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendChatMessage();
          }
        });

        // Auto-resize textarea for chat
        input.addEventListener('input', () => {
          input.style.height = 'auto';
          input.style.height = input.scrollHeight + 'px';
        });
      }

      // Resume AI button
      const resumeAiBtn = document.getElementById('resume-ai-btn');
      if (resumeAiBtn) {
        resumeAiBtn.addEventListener('click', async () => {
          await ChatSession.resumeAI(this.selectedChatSessionId);
          // Reload to reflect the change
          const threadElement = document.getElementById('message-thread');
          if (threadElement) {
            const conv = this.conversations.find(c => c.type === 'chat' && c.chatSessionId === this.selectedChatSessionId);
            if (conv) {
              conv.aiPaused = false;
              conv.session.ai_paused_until = null;
              threadElement.innerHTML = this.renderChatThreadView(conv);
              this.attachMessageInputListeners();
            }
          }
        });
      }

      return; // Chat listeners attached, don't continue to SMS logic
    }

    if (!input || !sendButton) {
      console.error('Message input or send button not found');
      return;
    }

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = input.scrollHeight + 'px';
    });

    // Send on Enter (not Shift+Enter)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        console.log('Enter pressed, sending message');
        this.sendMessage();
      }
    });

    // Send on button click
    const clickHandler = (e) => {
      console.log('Click handler fired', e);
      e.preventDefault();
      e.stopPropagation();
      console.log('Send button clicked, calling sendMessage');
      this.sendMessage();
    };
    sendButton.addEventListener('click', clickHandler);
    console.log('Event listener attached to send button');

    // Agent reply button and modal
    const agentReplyBtn = document.getElementById('agent-reply-btn');
    const agentReplyModal = document.getElementById('agent-reply-modal');
    const agentReplyPrompt = document.getElementById('agent-reply-prompt');
    const cancelAgentReply = document.getElementById('cancel-agent-reply');
    const sendAgentReply = document.getElementById('send-agent-reply');

    if (agentReplyBtn && agentReplyModal) {
      // Open modal
      agentReplyBtn.addEventListener('click', () => {
        agentReplyModal.classList.remove('hidden');
        agentReplyPrompt.value = '';
        agentReplyPrompt.focus();
      });

      // Close modal on cancel
      cancelAgentReply?.addEventListener('click', () => {
        agentReplyModal.classList.add('hidden');
      });

      // Close modal on backdrop click
      agentReplyModal.querySelector('.modal-backdrop')?.addEventListener('click', () => {
        agentReplyModal.classList.add('hidden');
      });

      // Close modal on Escape
      agentReplyPrompt?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          agentReplyModal.classList.add('hidden');
        }
      });

      // Generate and send on button click
      sendAgentReply?.addEventListener('click', async () => {
        await this.generateAndSendAgentReply();
      });

      // Generate and send on Enter (not Shift+Enter)
      agentReplyPrompt?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.generateAndSendAgentReply();
        }
      });

      // Voice input for agent reply modal
      const voiceReplyBtn = document.getElementById('voice-reply-btn');
      if (voiceReplyBtn) {
        voiceReplyBtn.addEventListener('click', () => {
          this.toggleVoiceInput('voice-reply-btn', 'voice-reply-status', 'agent-reply-prompt');
        });
      }
    }

  },

  async loadChatMessages(sessionId) {
    const container = document.getElementById('thread-messages');
    if (!container) return;

    try {
      const { messages, error } = await ChatSession.getMessages(sessionId);

      if (error) {
        container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Error loading messages</div>`;
        return;
      }

      if (!messages || messages.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">No messages yet</div>`;
        return;
      }

      // Use same styling as SMS messages
      container.innerHTML = messages.map(msg => {
        const isVisitor = msg.role === 'visitor';
        const isAI = msg.is_ai_generated === true;
        const isHuman = !isVisitor && !isAI;
        const timestamp = new Date(msg.created_at);

        return `
          <div class="message-bubble ${isVisitor ? 'inbound' : 'outbound'} ${isAI ? 'ai-message' : ''} ${isHuman ? 'human-message' : ''}" data-message-id="${msg.id}">
            <div class="message-content">${this.escapeHtml(msg.content)}</div>
            <div class="message-time">
              ${this.formatTime(timestamp)}
            </div>
          </div>
        `;
      }).join('');

      // Scroll to bottom
      container.scrollTop = container.scrollHeight;
    } catch (err) {
      console.error('Error loading chat messages:', err);
      container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Error loading messages</div>`;
    }
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  async sendChatMessage() {
    const input = document.getElementById('message-input');
    const message = input?.value?.trim();

    if (!message || !this.selectedChatSessionId) return;

    // Disable input while sending
    input.disabled = true;
    input.value = '';

    try {
      // Add message and pause AI
      const { message: savedMsg, error } = await ChatSession.addMessage(this.selectedChatSessionId, message, false);

      if (error) {
        console.error('Error sending chat message:', error);
        showAlertModal('Send Failed', 'Failed to send message. Please try again.');
        input.value = message;
        input.disabled = false;
        return;
      }

      // Pause AI for 5 minutes
      await ChatSession.pauseAI(this.selectedChatSessionId, 5);

      // Update conversation in list
      const conv = this.conversations.find(c => c.type === 'chat' && c.chatSessionId === this.selectedChatSessionId);
      if (conv) {
        conv.aiPaused = true;
        conv.lastMessage = message;
        conv.lastMessageRole = 'agent';
        conv.lastActivity = new Date();
      }

      // Reload messages
      await this.loadChatMessages(this.selectedChatSessionId);

      // Update the header to show AI paused
      const threadElement = document.getElementById('message-thread');
      if (threadElement && conv) {
        threadElement.innerHTML = this.renderChatThreadView(conv);
        this.attachMessageInputListeners();
      }
    } catch (err) {
      console.error('Error sending chat message:', err);
      showAlertModal('Send Failed', 'Failed to send message. Please try again.');
      input.value = message;
    } finally {
      input.disabled = false;
      input.focus();
    }
  },

  parseTranscript(transcript) {
    if (!transcript) return [];

    // Parse transcript in "Speaker: Message" format
    // Caller/User = left side (caller)
    // Any other name = right side (agent with custom name like "Amy", "Maggie", etc.)
    const lines = transcript.split('\n').filter(line => line.trim().length > 0);
    const messages = [];

    for (const line of lines) {
      // Match any speaker label at the start (up to 20 chars before colon)
      const match = line.match(/^([^:]{1,60}):\s*(.+)$/);
      if (match) {
        const [, speaker, text] = match;
        const speakerLower = speaker.toLowerCase();
        // Caller/User = left side (other party), everything else is the agent
        const isOurSide = !['caller', 'user'].includes(speakerLower);
        messages.push({
          speaker: isOurSide ? 'agent' : 'user',
          speakerLabel: speaker,  // Keep original label for display
          text: text.trim()
        });
      }
    }

    return messages;
  },

  getSpeakerDisplayLabel(speakerLabel) {
    // Map known labels, otherwise show the agent's custom name
    const labelMap = {
      'Agent': 'AI Assistant',
      'You': 'You',
      'User': 'Caller',
      'Caller': 'Caller',
      'Callee': 'Callee'
    };
    return labelMap[speakerLabel] || speakerLabel || 'Unknown';
  },

  formatSentiment(sentiment) {
    const sentimentMap = {
      'positive': 'Positive',
      'neutral': 'Neutral',
      'negative': 'Negative'
    };
    return sentimentMap[sentiment.toLowerCase()] || sentiment;
  },

  async sendMessage() {
    console.log('sendMessage called');
    const input = document.getElementById('message-input');
    const message = input.value.trim();

    console.log('Message:', message);

    if (!message) {
      console.log('No message, returning');
      return;
    }

    // Disable input while sending
    input.disabled = true;
    const sendButton = document.getElementById('send-button');
    sendButton.disabled = true;
    console.log('Input disabled, determining service number...');

    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Get the service number from the current conversation
      // Use the most recent message's service number (the one they last texted)
      const conv = this.conversations.find(c => c.type === 'sms' && c.phone === this.selectedContact && c.serviceNumber === this.selectedServiceNumber);
      if (!conv || !conv.messages || conv.messages.length === 0) {
        await showAlertModal('Error', 'No conversation found.');
        return;
      }

      // Get the most recent message to determine which service number to use
      const recentMsg = conv.messages[conv.messages.length - 1];
      const serviceNumber = recentMsg.direction === 'inbound'
        ? recentMsg.recipient_number  // They texted TO this number
        : recentMsg.sender_number;     // We sent FROM this number

      console.log('Using service number from conversation:', serviceNumber);

      if (!serviceNumber) {
        await showAlertModal('Error', 'Could not determine service number.');
        return;
      }

      // Send via API
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const response = await fetch(`${supabaseUrl}/functions/v1/send-user-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          serviceNumber,
          contactPhone: this.selectedContact,
          message,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      // Clear input
      input.value = '';
      input.style.height = 'auto';

      // Fetch the newly created message to get its ID
      const { data: newMsgData } = await supabase
        .from('sms_messages')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('recipient_number', this.selectedContact)
        .eq('content', message)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Add message to UI with proper ID and status (if not already rendered by real-time)
      const threadMessages = document.getElementById('thread-messages');
      const msgId = newMsgData?.id || `temp-${Date.now()}`;

      // Check if message already exists in DOM (from real-time subscription)
      const existingMsg = threadMessages.querySelector(`[data-message-id="${msgId}"]`);
      if (!existingMsg) {
        const statusIcon = this.getDeliveryStatusIcon({ status: newMsgData?.status || 'pending', direction: 'outbound' });
        const newMessage = `
          <div class="message-bubble outbound human-message" data-message-id="${msgId}">
            <div class="message-content">${this.linkifyPhoneNumbers(message)}</div>
            <div class="message-time">
              ${this.formatTime(new Date())}
              ${statusIcon}
            </div>
          </div>
        `;
        threadMessages.insertAdjacentHTML('beforeend', newMessage);
        threadMessages.scrollTop = threadMessages.scrollHeight;
      }

      // Also add to local conversations data (if not already added by real-time)
      if (newMsgData) {
        const conv = this.conversations?.find(c => c.phone === this.selectedContact && c.serviceNumber === this.selectedServiceNumber);
        if (conv && conv.messages) {
          const exists = conv.messages.some(m => m.id === newMsgData.id);
          if (!exists) {
            conv.messages.push(newMsgData);
          }
        }
      }

    } catch (error) {
      console.error('Error sending message:', error);
      showAlertModal('Send Failed', 'Failed to send message. Please try again.');
    } finally {
      input.disabled = false;
      sendButton.disabled = false;
      input.focus();
    }
  },

  async generateAndSendAgentReply() {
    const modal = document.getElementById('agent-reply-modal');
    const promptInput = document.getElementById('agent-reply-prompt');
    const sendBtn = document.getElementById('send-agent-reply');
    const prompt = promptInput?.value.trim();

    if (!prompt) {
      await showAlertModal('Missing Prompt', 'Please enter a prompt describing what you want to say');
      promptInput?.focus();
      return;
    }

    // Show loading state
    sendBtn.disabled = true;
    const originalContent = sendBtn.innerHTML;
    sendBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 6v6l4 2"></path>
      </svg>
      Generating...
    `;

    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Get the service number from the current conversation
      const conv = this.conversations.find(c => c.type === 'sms' && c.phone === this.selectedContact && c.serviceNumber === this.selectedServiceNumber);
      if (!conv || !conv.messages || conv.messages.length === 0) {
        throw new Error('No conversation found');
      }

      // Get the most recent message to determine which service number to use
      const recentMsg = conv.messages[conv.messages.length - 1];
      const serviceNumber = recentMsg.direction === 'inbound'
        ? recentMsg.recipient_number
        : recentMsg.sender_number;

      if (!serviceNumber) {
        throw new Error('Could not determine service number');
      }

      // Get contact name if available
      const contact = this.conversations.find(c => c.phone === this.selectedContact && c.serviceNumber === this.selectedServiceNumber);
      const recipientName = contact?.name || null;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || window.SUPABASE_URL || 'https://api.magpipe.ai';

      // Step 1: Generate the message
      const generateResponse = await fetch(`${supabaseUrl}/functions/v1/generate-agent-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          prompt,
          recipient_phone: this.selectedContact,
          recipient_name: recipientName
        })
      });

      if (!generateResponse.ok) {
        const error = await generateResponse.json();
        throw new Error(error.error || 'Failed to generate message');
      }

      const generateResult = await generateResponse.json();
      const generatedMessage = generateResult.message;

      console.log('Generated message:', generatedMessage);

      // Step 2: Send the message
      sendBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="M12 6v6l4 2"></path>
        </svg>
        Sending...
      `;

      const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-user-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          serviceNumber,
          contactPhone: this.selectedContact,
          message: generatedMessage,
          isAiGenerated: true
        })
      });

      if (!sendResponse.ok) {
        throw new Error('Failed to send message');
      }

      // Close modal
      modal.classList.add('hidden');

      // Fetch the newly created message
      const { data: newMsgData } = await supabase
        .from('sms_messages')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('recipient_number', this.selectedContact)
        .eq('content', generatedMessage)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Add message to UI (if not already rendered by real-time)
      const threadMessages = document.getElementById('thread-messages');
      const msgId = newMsgData?.id || `temp-${Date.now()}`;

      // Check if message already exists in DOM (from real-time subscription)
      const existingMsg = threadMessages.querySelector(`[data-message-id="${msgId}"]`);
      if (!existingMsg) {
        const statusIcon = this.getDeliveryStatusIcon({ status: newMsgData?.status || 'pending', direction: 'outbound' });
        const newMessage = `
          <div class="message-bubble outbound ai-message" data-message-id="${msgId}">
            <div class="message-content">${this.linkifyPhoneNumbers(generatedMessage)}</div>
            <div class="message-time">
              ${this.formatTime(new Date())}
              ${statusIcon}
            </div>
          </div>
        `;
        threadMessages.insertAdjacentHTML('beforeend', newMessage);
        threadMessages.scrollTop = threadMessages.scrollHeight;
      }

      // Update local data (if not already added by real-time)
      if (newMsgData) {
        if (conv && conv.messages) {
          const exists = conv.messages.some(m => m.id === newMsgData.id);
          if (!exists) {
            conv.messages.push(newMsgData);
          }
        }
      }

    } catch (error) {
      console.error('Error generating/sending agent reply:', error);
      showAlertModal('Error', error.message || 'Failed to generate and send message. Please try again.');
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = originalContent;
    }
  },
};
