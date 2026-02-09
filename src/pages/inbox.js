/**
 * Inbox Page - Modern Messaging UI
 */

import { getCurrentUser, supabase } from '../lib/supabase.js';
import { renderBottomNav, clearUnreadBadge, setPhoneNavActive, resetInboxManagedCount, markAsRead, recalculateUnreads } from '../components/BottomNav.js';
import { markAllAsRead as markAllReadService, recalculateUnreads as refreshUnreadBadge } from '../services/unreadService.js';
import { showDeleteConfirmModal, showAlertModal } from '../components/ConfirmModal.js';
import { User, ChatSession } from '../models/index.js';

// Lazy load heavy libraries only when needed for calls
let sipClient = null;
let livekitClient = null;
let VoiceRecognition = null;
let isVoiceSupported = () => false;

async function loadSipClient() {
  if (!sipClient) {
    const module = await import('../lib/sipClient.js');
    sipClient = module.sipClient;
  }
  return sipClient;
}

async function loadLivekitClient() {
  if (!livekitClient) {
    const module = await import('../lib/livekitClient.js');
    livekitClient = module.livekitClient;
  }
  return livekitClient;
}

async function loadVoiceRecognition() {
  if (!VoiceRecognition) {
    const module = await import('../lib/voiceRecognition.js');
    VoiceRecognition = module.VoiceRecognition;
    isVoiceSupported = module.isSupported;
  }
  return { VoiceRecognition, isVoiceSupported };
}

export default class InboxPage {
  constructor() {
    this.conversations = [];
    this.selectedContact = null;
    this.selectedServiceNumber = null; // Which of our numbers the conversation is on
    this.selectedCallId = null;
    this.selectedChatSessionId = null; // For chat conversations
    this.subscription = null;
    this.userId = null;
    this.dropdownListenersAttached = false;
    this.phoneLinkHandlerAttached = false;
    this.lastFetchTime = 0;
    this.hiddenConversations = new Set(); // Track hidden conversations locally
    // Load viewed conversations from localStorage (persists across page navigation)
    const savedViewed = localStorage.getItem('inbox_viewed_conversations');
    this.viewedConversations = savedViewed ? new Set(JSON.parse(savedViewed)) : new Set();
    this.swipeState = null; // Track active swipe
    // Filters can be combined: type (all/calls/texts) + direction (all/in/out) + sentiment
    this.typeFilter = 'all'; // all, calls, texts
    this.directionFilter = 'all'; // all, inbound, outbound
    this.missedFilter = false; // special filter for missed calls
    this.unreadFilter = false; // filter for unread conversations
    this.sentimentFilter = 'all'; // all, positive, neutral, negative
    this.filtersExpanded = false; // Toggle for filter visibility
    this.searchQuery = ''; // search filter
    this.dateFilter = 'all'; // all, today, yesterday, week, month
    this.searchExpanded = false; // whether search is expanded
    this.editModeExpanded = false; // Toggle for edit mode options
    this.selectMode = false; // Multi-select mode for deletion
    this.selectedForDeletion = new Set(); // Conversations selected for deletion
  }

  /**
   * Convert phone numbers and addresses in text to clickable links
   */
  linkifyPhoneNumbers(text) {
    // Escape HTML to prevent XSS
    let escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    // First, linkify addresses (before phone numbers to avoid conflicts)
    // Match addresses with street number, street name, and optional city/state/zip
    // Examples: "123 Main St", "456 Oak Avenue, Seattle, WA 98101"
    const addressRegex = /\b\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Ct|Court|Pl|Place|Pkwy|Parkway|Cir|Circle))(?:[\s,]+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)?(?:,?\s+[A-Z]{2})?\s*\d{5}(?:-\d{4})?\b/g;

    escaped = escaped.replace(addressRegex, (match) => {
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(match)}`;
      return `<a href="${mapsUrl}" target="_blank" rel="noopener" class="message-address-link" style="color: inherit; text-decoration: underline; cursor: pointer;">${match}</a>`;
    });

    // Then linkify phone numbers
    // Match phone numbers in various formats:
    // (555) 123-4567, 555-123-4567, 5551234567, +1 555 123 4567, etc.
    const phoneRegex = /(\+?\d{1}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;

    escaped = escaped.replace(phoneRegex, (match) => {
      // Clean phone number for URL (remove spaces, dashes, parens)
      const cleanNumber = match.replace(/[\s.\-()]/g, '');
      return `<a href="#" class="message-phone-link" data-phone="${cleanNumber}" style="color: inherit; text-decoration: underline; cursor: pointer;">${match}</a>`;
    });

    return escaped;
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    // Load voice recognition early (small module) for UI check
    loadVoiceRecognition(); // Don't await - load in background

    this.userId = user.id;

    // Fetch user profile for bottom nav
    const { profile } = await User.getProfile(user.id);

    // Load hidden conversations from localStorage
    this.loadHiddenConversations();
    if (this.hiddenConversations.size > 0) {
      console.log('Hidden conversations loaded:', Array.from(this.hiddenConversations));
    }

    // Use cached data if fetched within last 30 seconds
    const now = Date.now();
    if (this.conversations.length === 0 || (now - this.lastFetchTime) > 30000) {
      await this.loadConversations(user.id);
      this.lastFetchTime = now;
    }

    // Handle initial selection
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      // Clear selection on mobile (no item should be highlighted on first view)
      this.selectedContact = null;
      this.selectedServiceNumber = null;
      this.selectedCallId = null;
    } else {
      // On desktop, restore last viewed conversation or select most recent
      const lastViewedContact = localStorage.getItem('inbox_last_selected_contact');
      const lastViewedServiceNumber = localStorage.getItem('inbox_last_selected_service_number');
      const lastViewedCallId = localStorage.getItem('inbox_last_selected_call');

      if (lastViewedCallId && this.conversations.some(c => c.type === 'call' && c.callId === lastViewedCallId)) {
        this.selectedCallId = lastViewedCallId;
        this.selectedContact = null;
        this.selectedServiceNumber = null;
      } else if (lastViewedContact && lastViewedServiceNumber &&
                 this.conversations.some(c => c.type === 'sms' && c.phone === lastViewedContact && c.serviceNumber === lastViewedServiceNumber)) {
        this.selectedContact = lastViewedContact;
        this.selectedServiceNumber = lastViewedServiceNumber;
        this.selectedCallId = null;
      } else if (this.conversations.length > 0) {
        // Default to most recent conversation
        const mostRecent = this.conversations[0];
        if (mostRecent.type === 'call') {
          this.selectedCallId = mostRecent.callId;
          this.selectedContact = null;
          this.selectedServiceNumber = null;
        } else {
          this.selectedContact = mostRecent.phone;
          this.selectedServiceNumber = mostRecent.serviceNumber;
          this.selectedCallId = null;
        }
      }
    }

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="inbox-container">
        <!-- Conversation List Sidebar -->
        <div class="conversation-list" id="conversation-list">
          <div class="inbox-header" style="position: relative;">
            <h1 style="margin: 0; font-size: 1rem; font-weight: 600;">Inbox</h1>
            <div id="inbox-search-container" style="display: flex; align-items: center; margin-left: auto; margin-right: 0.5rem;">
              <button id="inbox-search-toggle" style="
                background: none;
                border: none;
                padding: 0.375rem;
                cursor: pointer;
                display: ${this.searchQuery || this.searchExpanded ? 'none' : 'flex'};
                align-items: center;
                color: var(--text-secondary);
              ">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="M21 21l-4.35-4.35"></path>
                </svg>
              </button>
              <div id="inbox-search-expanded" style="display: ${this.searchQuery || this.searchExpanded ? 'flex' : 'none'}; align-items: center; gap: 0.5rem;">
                <input type="text" id="inbox-search" placeholder="Search..." value="${this.searchQuery || ''}" style="
                  width: 120px;
                  padding: 0.375rem 0.75rem;
                  border: 1px solid var(--border-color);
                  border-radius: 9999px;
                  font-size: 0.8rem;
                  outline: none;
                " />
                <select id="inbox-date-filter" style="
                  padding: 0.375rem 0.5rem;
                  border: 1px solid var(--border-color);
                  border-radius: 9999px;
                  font-size: 0.7rem;
                  outline: none;
                  background: var(--bg-primary);
                  cursor: pointer;
                ">
                  <option value="all" ${this.dateFilter === 'all' ? 'selected' : ''}>All Time</option>
                  <option value="today" ${this.dateFilter === 'today' ? 'selected' : ''}>Today</option>
                  <option value="yesterday" ${this.dateFilter === 'yesterday' ? 'selected' : ''}>Yesterday</option>
                  <option value="week" ${this.dateFilter === 'week' ? 'selected' : ''}>Last 7 Days</option>
                  <option value="month" ${this.dateFilter === 'month' ? 'selected' : ''}>Last 30 Days</option>
                </select>
              </div>
            </div>
            <button id="new-conversation-btn" style="
              background: white;
              color: var(--primary-color);
              border: 2px solid transparent;
              background-image: linear-gradient(white, white), linear-gradient(135deg, #6366f1, #8b5cf6);
              background-origin: padding-box, border-box;
              background-clip: padding-box, border-box;
              border-radius: 50%;
              width: 29px;
              height: 29px;
              font-size: 1rem;
              font-weight: 300;
              cursor: pointer;
              display: ${this.searchExpanded ? 'none' : 'flex'};
              align-items: center;
              justify-content: center;
              line-height: 1;
              flex-shrink: 0;
              transition: all 0.2s ease;
            " onmouseover="this.style.backgroundImage='linear-gradient(var(--bg-secondary), var(--bg-secondary)), linear-gradient(135deg, #6366f1, #8b5cf6)'" onmouseout="this.style.backgroundImage='linear-gradient(white, white), linear-gradient(135deg, #6366f1, #8b5cf6)'">+</button>
            <button id="filter-toggle-btn" style="
              background: ${this.filtersExpanded || this.hasActiveFilters() ? 'var(--primary-color)' : 'none'};
              color: ${this.filtersExpanded || this.hasActiveFilters() ? 'white' : 'var(--text-secondary)'};
              border: 1px solid ${this.filtersExpanded || this.hasActiveFilters() ? 'var(--primary-color)' : 'var(--border-color)'};
              border-radius: 50%;
              width: 29px;
              height: 29px;
              cursor: pointer;
              display: ${this.searchExpanded ? 'none' : 'flex'};
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
              transition: all 0.2s ease;
            ">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
              </svg>
            </button>
            <button id="edit-toggle-btn" style="
              background: ${this.editModeExpanded ? 'var(--primary-color)' : 'none'};
              color: ${this.editModeExpanded ? 'white' : 'var(--text-secondary)'};
              border: 1px solid ${this.editModeExpanded ? 'var(--primary-color)' : 'var(--border-color)'};
              border-radius: 50%;
              width: 29px;
              height: 29px;
              cursor: pointer;
              display: ${this.searchExpanded ? 'none' : 'flex'};
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
              transition: all 0.2s ease;
            ">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>

            <!-- New Message Dropdown Menu -->
            <div id="new-message-dropdown" style="
              display: none;
              position: absolute;
              top: 100%;
              right: 0;
              margin-top: 2px;
              background: var(--bg-primary);
              border: 1px solid var(--border-color);
              border-radius: 8px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.15);
              min-width: 200px;
              z-index: 100;
              overflow: hidden;
            ">
              <button class="dropdown-item" data-action="new-message" style="
                display: flex;
                align-items: center;
                gap: 0.75rem;
                width: 100%;
                padding: 0.75rem 1rem;
                border: none;
                background: none;
                cursor: pointer;
                font-size: 0.875rem;
                color: var(--text-primary);
                text-align: left;
                transition: background 0.15s;
              " onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='none'">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <span>Message</span>
              </button>
              <button class="dropdown-item" data-action="agent-message" style="
                display: flex;
                align-items: center;
                gap: 0.75rem;
                width: 100%;
                padding: 0.75rem 1rem;
                border: none;
                background: none;
                cursor: pointer;
                font-size: 0.875rem;
                color: var(--text-primary);
                text-align: left;
                transition: background 0.15s;
              " onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='none'">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"></path>
                  <circle cx="7.5" cy="14.5" r="1.5"></circle>
                  <circle cx="16.5" cy="14.5" r="1.5"></circle>
                </svg>
                <span>Agent Message</span>
              </button>
              <button class="dropdown-item" data-action="bulk-message" style="
                display: flex;
                align-items: center;
                gap: 0.75rem;
                width: 100%;
                padding: 0.75rem 1rem;
                border: none;
                background: none;
                cursor: not-allowed;
                font-size: 0.875rem;
                color: var(--text-primary);
                text-align: left;
                opacity: 0.5;
              ">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                <span>Bulk Message</span>
                <span style="margin-left: auto; font-size: 0.7rem; background: var(--border-color); padding: 0.125rem 0.375rem; border-radius: 4px;">Soon</span>
              </button>
              <button class="dropdown-item" data-action="bulk-agent-message" style="
                display: flex;
                align-items: center;
                gap: 0.75rem;
                width: 100%;
                padding: 0.75rem 1rem;
                border: none;
                background: none;
                cursor: not-allowed;
                font-size: 0.875rem;
                color: var(--text-primary);
                text-align: left;
                opacity: 0.5;
              ">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                <span>Bulk Agent Message</span>
                <span style="margin-left: auto; font-size: 0.7rem; background: var(--border-color); padding: 0.125rem 0.375rem; border-radius: 4px;">Soon</span>
              </button>
            </div>
          </div>

          <!-- Filter Tabs -->
          <div id="filters-container" style="display: ${this.filtersExpanded ? 'block' : 'none'};">
            <div class="inbox-filters" id="inbox-filters" style="justify-content: center; gap: 0.5rem; border-bottom: none; padding-bottom: 0;">
              <button class="inbox-filter-btn ${this.typeFilter === 'all' && this.directionFilter === 'all' && !this.missedFilter && this.sentimentFilter === 'all' && !this.unreadFilter ? 'active' : ''}" data-filter-type="all" data-filter-reset="true">All</button>
              <button class="inbox-filter-btn ${this.typeFilter === 'calls' ? 'active' : ''}" data-filter-type="calls">Calls</button>
              <button class="inbox-filter-btn ${this.typeFilter === 'texts' ? 'active' : ''}" data-filter-type="texts">Texts</button>
              <button class="inbox-filter-btn ${this.typeFilter === 'chat' ? 'active' : ''}" data-filter-type="chat">Chat</button>
            </div>
            <div class="inbox-filters" id="inbox-filters-status" style="justify-content: center; gap: 0.5rem; padding-top: 0.375rem; border-bottom: none; padding-bottom: 0;">
              <button class="inbox-filter-btn ${this.directionFilter === 'inbound' ? 'active' : ''}" data-filter-direction="inbound">In</button>
              <button class="inbox-filter-btn ${this.directionFilter === 'outbound' ? 'active' : ''}" data-filter-direction="outbound">Out</button>
              <button class="inbox-filter-btn ${this.missedFilter ? 'active' : ''}" data-filter-missed="true">Missed</button>
              <button class="inbox-filter-btn ${this.unreadFilter ? 'active' : ''}" data-filter-unread="true">Unread</button>
            </div>
            <div class="inbox-filters" id="inbox-filters-sentiment" style="justify-content: center; gap: 0.5rem; padding-top: 0.375rem;">
              <button class="inbox-filter-btn ${this.sentimentFilter === 'positive' ? 'active' : ''}" data-filter-sentiment="positive">Positive</button>
              <button class="inbox-filter-btn ${this.sentimentFilter === 'neutral' ? 'active' : ''}" data-filter-sentiment="neutral">Neutral</button>
              <button class="inbox-filter-btn ${this.sentimentFilter === 'negative' ? 'active' : ''}" data-filter-sentiment="negative">Negative</button>
            </div>
          </div>

          <!-- Edit Actions -->
          <div id="edit-actions-container" style="display: ${this.editModeExpanded ? 'block' : 'none'};">
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
          </div>

          <div id="conversations">
            ${this.renderConversationList()}
          </div>
        </div>

        <!-- Message Thread -->
        <div class="message-thread" id="message-thread">
          ${(this.selectedContact || this.selectedCallId || this.selectedChatSessionId) ? this.renderMessageThread() : this.renderEmptyState()}
        </div>
      </div>
      ${renderBottomNav('/inbox')}
    `;

    // Sync badge with unified service (single source of truth)
    refreshUnreadBadge();

    // Defer heavy operations to allow UI to be scrollable immediately
    requestAnimationFrame(() => {
      this.attachEventListeners();
      // Defer subscription even more to not block
      setTimeout(() => this.subscribeToMessages(), 100);
    });

    // Expose showCallInterface globally for phone nav button
    window.showDialpad = () => this.showCallInterface();

    // Check for contact parameter in URL (e.g., /inbox?contact=+16045551234)
    const urlParams = new URLSearchParams(window.location.search);
    const contactNumber = urlParams.get('contact');
    if (contactNumber) {
      // Clear the URL parameter without reloading
      window.history.replaceState({}, '', '/inbox');
      // Open new conversation with this contact
      this.openNewConversation(contactNumber);
    }
  }

  openNewConversation(phoneNumber, serviceNumber = null) {
    console.log('openNewConversation called with:', phoneNumber, 'service:', serviceNumber);

    // Set the selected contact and show the message input
    this.selectedContact = phoneNumber;
    this.selectedCallId = null;

    // Check if conversation exists (with specific service number if provided)
    const existingConv = serviceNumber
      ? this.conversations.find(c => c.type === 'sms' && c.phone === phoneNumber && c.serviceNumber === serviceNumber)
      : this.conversations.find(c => c.type === 'sms' && c.phone === phoneNumber);

    if (existingConv) {
      this.selectedServiceNumber = existingConv.serviceNumber;
    } else {
      // For new conversations, use the provided service number or leave null
      // (will need to be selected when sending)
      this.selectedServiceNumber = serviceNumber;
    }
    console.log('Existing SMS conv found:', !!existingConv, 'using serviceNumber:', this.selectedServiceNumber);

    if (!existingConv && serviceNumber) {
      // Create a new conversation entry temporarily (only if we have a service number)
      const newConv = {
        type: 'sms',
        phone: phoneNumber,
        serviceNumber: serviceNumber,
        lastMessage: '',
        lastActivity: new Date().toISOString(),
        messages: [],
        unreadCount: 0
      };
      this.conversations.unshift(newConv);
    }

    // Update the UI
    const conversationsEl = document.getElementById('conversations');
    if (conversationsEl) {
      conversationsEl.innerHTML = this.renderConversationList();
    }
    const threadElement = document.getElementById('message-thread');
    if (threadElement) {
      threadElement.innerHTML = this.renderMessageThread();

      // Show thread on mobile
      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        threadElement.classList.add('show');
      }

      // Attach back button listener
      this.attachBackButtonListener(threadElement, conversationsEl, isMobile);

      // Attach message input listeners for SMS
      this.attachMessageInputListeners();
    }
    this.attachEventListeners();

    // Scroll to bottom of messages and focus the input
    setTimeout(() => {
      const threadMessages = document.getElementById('thread-messages');
      if (threadMessages) {
        threadMessages.scrollTop = threadMessages.scrollHeight;
      }
      const messageInput = document.getElementById('message-input');
      if (messageInput) {
        messageInput.focus();
      }
    }, 100);
  }

  subscribeToMessages() {
    // Clean up existing subscription
    if (this.subscription) {
      this.subscription.unsubscribe();
    }

    console.log('Setting up inbox subscription for user:', this.userId);

    // Subscribe to new messages
    this.subscription = supabase
      .channel('inbox-messages')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'sms_messages',
        filter: `user_id=eq.${this.userId}`
      }, (payload) => {
        console.log('📨 New message received in inbox:', payload);
        this.handleNewMessage(payload.new);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'call_records',
        filter: `user_id=eq.${this.userId}`
      }, (payload) => {
        console.log('📞 New call received in inbox:', payload);
        this.handleNewCall(payload.new);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'call_records',
        filter: `user_id=eq.${this.userId}`
      }, (payload) => {
        console.log('📞 Call updated in inbox:', payload);
        this.handleCallUpdate(payload.new);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'sms_messages',
        filter: `user_id=eq.${this.userId}`
      }, (payload) => {
        console.log('📨 SMS status updated:', payload);
        this.handleSmsUpdate(payload.new);
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages'
      }, (payload) => {
        console.log('💬 New chat message received:', payload);
        this.handleNewChatMessage(payload.new);
      })
      .subscribe((status) => {
        console.log('Inbox subscription status:', status);
      });
  }

  async handleNewChatMessage(chatMessage) {
    // Find the session this message belongs to
    const conv = this.conversations.find(c =>
      c.type === 'chat' && c.session?.id === chatMessage.session_id
    );

    if (!conv) {
      // New session, reload conversations
      await this.loadConversations(this.userId);
      const conversationsEl = document.getElementById('conversations');
      if (conversationsEl) {
        conversationsEl.innerHTML = this.renderConversationList();
      }
      return;
    }

    // Update conversation preview
    conv.lastMessage = chatMessage.content;
    conv.lastMessageRole = chatMessage.role;
    conv.lastActivity = new Date(chatMessage.created_at);

    // If visitor message, increment unread (badge updated by service subscription)
    if (chatMessage.role === 'visitor') {
      conv.unreadCount = (conv.unreadCount || 0) + 1;
    }

    // Update conversation list
    const conversationsEl = document.getElementById('conversations');
    if (conversationsEl) {
      conversationsEl.innerHTML = this.renderConversationList();
    }

    // If this chat is currently selected, reload messages
    if (this.selectedChatSessionId === chatMessage.session_id) {
      await this.loadChatMessages(this.selectedChatSessionId);
    }
  }

  async handleNewMessage(message) {
    console.log('handleNewMessage called with:', message);

    // Auto-enrich contact for new interactions
    const contactPhone = message.direction === 'inbound' ? message.sender_number : message.recipient_number;
    const serviceNumber = message.direction === 'inbound' ? message.recipient_number : message.sender_number;
    this.autoEnrichContact(contactPhone); // Fire and forget - don't await

    // Unhide conversation if it was hidden (user swipe-deleted it)
    const convKey = `sms_${contactPhone}_${serviceNumber}`;
    if (this.hiddenConversations.has(convKey)) {
      console.log('Unhiding conversation due to new message:', convKey);
      this.unhideConversation(convKey);
    }

    // For outbound messages, update local data and re-render if viewing that thread
    if (message.direction === 'outbound') {
      // Update local data
      const conv = this.conversations?.find(c => c.phone === contactPhone && c.serviceNumber === serviceNumber);
      if (conv && conv.messages) {
        const exists = conv.messages.some(m => m.id === message.id);
        if (!exists) {
          conv.messages.push(message);
          conv.lastMessage = message.content;
          conv.lastActivity = message.sent_at || new Date().toISOString();
        }
      }

      // Re-render thread if this is the selected contact
      if (this.selectedContact === contactPhone && this.selectedServiceNumber === serviceNumber) {
        const threadElement = document.getElementById('message-thread');
        if (threadElement) {
          threadElement.innerHTML = this.renderMessageThread();
          this.attachMessageInputListeners();

          // Scroll to bottom
          setTimeout(() => {
            const threadMessages = document.getElementById('thread-messages');
            if (threadMessages) {
              threadMessages.scrollTop = threadMessages.scrollHeight;
            }
          }, 50);
        }
      }

      // Update conversation list to show latest message
      const conversationsEl = document.getElementById('conversations');
      if (conversationsEl) {
        conversationsEl.innerHTML = this.renderConversationList();
        this.attachConversationListeners();
      }
      return;
    }

    // For inbound messages, do the full update
    console.log('Currently selected contact:', this.selectedContact);

    // Reload conversations to update list
    await this.loadConversations(this.userId);

    // Update conversation list
    const conversationsEl = document.getElementById('conversations');
    if (conversationsEl) {
      conversationsEl.innerHTML = this.renderConversationList();
      this.attachConversationListeners();
    }

    // If this message is for the currently selected contact, update the thread
    console.log('Contact phone from message:', contactPhone, 'service:', serviceNumber);
    console.log('Match?', this.selectedContact === contactPhone && this.selectedServiceNumber === serviceNumber);

    if (this.selectedContact === contactPhone && this.selectedServiceNumber === serviceNumber) {
      console.log('Updating thread for selected contact');

      // Mark conversation as read since user is viewing it (service handles badge)
      const smsKey = `${contactPhone}_${serviceNumber}`;
      markAsRead('sms', smsKey);

      // Clear unread count for this conversation locally
      const conv = this.conversations.find(c => c.type === 'sms' && c.phone === contactPhone && c.serviceNumber === serviceNumber);
      if (conv) {
        conv.unreadCount = 0;
      }

      const threadElement = document.getElementById('message-thread');
      if (threadElement) {
        threadElement.innerHTML = this.renderMessageThread();
        this.attachMessageInputListeners();

        // Scroll to bottom
        setTimeout(() => {
          const threadMessages = document.getElementById('thread-messages');
          if (threadMessages) {
            threadMessages.scrollTop = threadMessages.scrollHeight;
          }
        }, 100);
      }
    }
  }

  async handleNewCall(call) {
    // Auto-enrich contact for new calls
    const contactPhone = call.direction === 'inbound' ? call.caller_number : call.callee_number;
    this.autoEnrichContact(contactPhone); // Fire and forget - don't await

    // Unhide conversation if it was hidden (user swipe-deleted it)
    // Note: For calls, we use the call ID as the key
    if (call.id) {
      const convKey = `call_${call.id}`;
      if (this.hiddenConversations.has(convKey)) {
        console.log('Unhiding call conversation due to new call:', convKey);
        this.unhideConversation(convKey);
      }
    }

    // Reload conversations to update list
    await this.loadConversations(this.userId);

    // Update conversation list
    const conversationsEl = document.getElementById('conversations');
    if (conversationsEl) {
      conversationsEl.innerHTML = this.renderConversationList();
      this.attachConversationListeners();
    }

    // If viewing this call, update the thread
    if (this.selectedCallId === call.id) {
      const threadElement = document.getElementById('message-thread');
      if (threadElement) {
        threadElement.innerHTML = this.renderMessageThread();
      }
    }
  }

  async handleCallUpdate(call) {
    console.log('Handling call update:', call);

    // Reload conversations to update list
    await this.loadConversations(this.userId);

    // Update conversation list
    const conversationsEl = document.getElementById('conversations');
    if (conversationsEl) {
      conversationsEl.innerHTML = this.renderConversationList();
      this.attachConversationListeners();
    }

    // If viewing this call, update the thread
    if (this.selectedCallId === call.id) {
      const threadElement = document.getElementById('message-thread');
      if (threadElement) {
        threadElement.innerHTML = this.renderMessageThread();
      }
    }
  }

  handleSmsUpdate(message) {
    console.log('Handling SMS update:', message);

    // Update the message in our local data
    if (this.conversations) {
      for (const conv of this.conversations) {
        if (conv.messages) {
          const msgIndex = conv.messages.findIndex(m => m.id === message.id);
          if (msgIndex !== -1) {
            conv.messages[msgIndex] = { ...conv.messages[msgIndex], ...message };
            break;
          }
        }
      }
    }

    // Update just the delivery status icon without re-rendering entire thread
    const msgElement = document.querySelector(`.message-bubble[data-message-id="${message.id}"]`);
    if (msgElement) {
      const statusEl = msgElement.querySelector('.delivery-status');
      if (statusEl) {
        const newStatusHtml = this.getDeliveryStatusIcon(message);
        if (newStatusHtml) {
          statusEl.outerHTML = newStatusHtml;
        }
      }
    }
  }

  /**
   * Auto-enrich contact if phone number doesn't exist in contacts
   * Called when new interactions (calls/SMS) occur
   */
  async autoEnrichContact(phoneNumber) {
    if (!phoneNumber || !this.userId) return;

    // Normalize phone number (ensure E.164 format)
    const normalizedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber.replace(/\D/g, '')}`;

    try {
      // Check if contact already exists
      const { data: existingContact, error: checkError } = await supabase
        .from('contacts')
        .select('id')
        .eq('user_id', this.userId)
        .eq('phone_number', normalizedPhone)
        .maybeSingle();

      if (checkError) {
        console.error('Error checking for existing contact:', checkError);
        return;
      }

      if (existingContact) {
        console.log('Contact already exists for', normalizedPhone);
        return;
      }

      console.log('No contact found for', normalizedPhone, '- attempting lookup');

      // Get session for API call
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('No session for contact lookup');
        return;
      }

      // Call the contact-lookup Edge Function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contact-lookup`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phone: normalizedPhone }),
        }
      );

      const data = await response.json();

      if (!response.ok || data.notFound || !data.success) {
        // No data found - create a basic contact with just the phone number
        console.log('No enrichment data found for', normalizedPhone, '- creating basic contact');
        const { error: createError } = await supabase
          .from('contacts')
          .insert({
            user_id: this.userId,
            phone_number: normalizedPhone,
            first_name: 'Unknown',
            is_whitelisted: false
          });

        if (createError) {
          console.error('Error creating basic contact:', createError);
        } else {
          console.log('Created basic contact for', normalizedPhone);
        }
        return;
      }

      // Create enriched contact
      const contact = data.contact;
      const contactData = {
        user_id: this.userId,
        phone_number: normalizedPhone,
        first_name: contact.first_name || (contact.name ? contact.name.split(' ')[0] : 'Unknown'),
        last_name: contact.last_name || (contact.name ? contact.name.split(' ').slice(1).join(' ') : null),
        email: contact.email || null,
        address: contact.address || null,
        company: contact.company || null,
        job_title: contact.job_title || null,
        avatar_url: contact.avatar_url || null,
        linkedin_url: contact.linkedin_url || null,
        twitter_url: contact.twitter_url || null,
        facebook_url: contact.facebook_url || null,
        enriched_at: new Date().toISOString(),
        is_whitelisted: false
      };

      const { error: createError } = await supabase
        .from('contacts')
        .insert(contactData);

      if (createError) {
        console.error('Error creating enriched contact:', createError);
      } else {
        console.log('Created enriched contact for', normalizedPhone, contactData);
      }

    } catch (error) {
      console.error('Error in autoEnrichContact:', error);
    }
  }

  cleanup() {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
    // Reset the flag so BottomNav can track unread count again
    resetInboxManagedCount();
  }

  async loadConversations(userId) {
    // Load all data in parallel for speed
    const [messagesResult, callsResult, contactsResult, chatSessionsResult] = await Promise.all([
      supabase.from('sms_messages').select('*').eq('user_id', userId).order('sent_at', { ascending: false }),
      supabase.from('call_records').select('*').eq('user_id', userId).order('started_at', { ascending: false }),
      supabase.from('contacts').select('*').eq('user_id', userId),
      ChatSession.getRecentWithPreview(userId, 50)
    ]);

    const messages = messagesResult.data;
    const calls = callsResult.data;
    const contacts = contactsResult.data;
    const chatSessions = chatSessionsResult.sessions || [];
    console.log('Inbox loaded:', messages?.length || 0, 'messages,', calls?.length || 0, 'calls,', chatSessions.length, 'chats');

    // Create a map of phone number to contact for quick lookup
    this.contactsMap = {};
    contacts?.forEach(contact => {
      if (contact.phone_number) {
        this.contactsMap[contact.phone_number] = contact;
      }
    });
    console.log('Contacts loaded:', contacts?.length || 0);

    const conversationsList = [];

    // Group SMS messages by contact phone + service number (separate threads per line)
    const smsGrouped = {};
    messages?.forEach(msg => {
      const phone = msg.direction === 'inbound' ? msg.sender_number : msg.recipient_number;
      // For inbound: recipient_number is the service number (our number being texted)
      // For outbound: sender_number is the service number (our number sending)
      const serviceNumber = msg.direction === 'inbound' ? msg.recipient_number : msg.sender_number;

      // Group by contact + service number so each line has its own conversation
      const convKey = `${phone}_${serviceNumber}`;

      if (!smsGrouped[convKey]) {
        smsGrouped[convKey] = {
          type: 'sms',
          phone,
          serviceNumber, // Which of our numbers this conversation is on
          messages: [],
          lastActivity: new Date(msg.sent_at || msg.created_at || Date.now()),
          lastMessage: msg.content,
          unreadCount: 0,
        };
      }
      smsGrouped[convKey].messages.push(msg);

      // Count unread inbound messages (skip if viewed in this session)
      if (msg.direction === 'inbound' && !this.viewedConversations.has(convKey)) {
        const lastViewedKey = `conversation_last_viewed_sms_${convKey}`;
        const lastViewed = localStorage.getItem(lastViewedKey);
        const msgDate = new Date(msg.sent_at || msg.created_at || Date.now());

        if (!lastViewed || msgDate > new Date(lastViewed)) {
          smsGrouped[convKey].unreadCount++;
        }
      }

      const msgDate = new Date(msg.sent_at || msg.created_at || Date.now());
      if (msgDate > smsGrouped[convKey].lastActivity) {
        smsGrouped[convKey].lastActivity = msgDate;
        smsGrouped[convKey].lastMessage = msg.content;
      }
    });

    // Sort messages within each conversation (oldest first for display)
    Object.values(smsGrouped).forEach(conv => {
      conv.messages.sort((a, b) => {
        const dateA = new Date(a.sent_at || a.created_at);
        const dateB = new Date(b.sent_at || b.created_at);
        return dateA - dateB;
      });
    });

    // Add SMS conversations to list
    conversationsList.push(...Object.values(smsGrouped));

    // Add each call as a separate conversation
    calls?.forEach(call => {
      console.log('Processing call:', call);

      const duration = call.duration_seconds || 0;
      const durationText = duration > 0
        ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`
        : '0:00';

      const statusInfo = this.getCallStatusInfo(call.status);

      // Use contact_phone if available, otherwise use caller_number for inbound calls
      const phoneNumber = call.contact_phone || call.caller_number || 'Unknown';

      // Calculate unread count for inbound calls
      const convKey = `call_${call.id}`;
      const lastViewedKey = `conversation_last_viewed_call_${call.id}`;
      const lastViewed = localStorage.getItem(lastViewedKey);
      const callDate = new Date(call.started_at || call.created_at || Date.now());

      // Inbound calls are unread if not viewed in this session and not previously marked as viewed
      let unreadCount = 0;
      if (call.direction === 'inbound' && !this.viewedConversations.has(convKey)) {
        if (!lastViewed || callDate > new Date(lastViewed)) {
          unreadCount = 1;
        }
      }

      conversationsList.push({
        type: 'call',
        callId: call.id,
        phone: phoneNumber,
        call: call,
        lastActivity: callDate,
        lastMessage: `${call.direction === 'inbound' ? 'Incoming' : 'Outgoing'} Call • ${durationText}`,
        statusInfo: statusInfo,
        unreadCount: unreadCount,
      });
    });

    // Add chat sessions to list
    chatSessions?.forEach(session => {
      const convKey = `chat_${session.id}`;
      const lastViewedKey = `conversation_last_viewed_chat_${session.id}`;
      const lastViewed = localStorage.getItem(lastViewedKey);
      const lastMessageDate = new Date(session.lastMessageAt || session.last_message_at || Date.now());

      // Count as unread if there's a visitor message we haven't seen
      let unreadCount = 0;
      if (session.lastMessageRole === 'visitor' && !this.viewedConversations.has(convKey)) {
        if (!lastViewed || lastMessageDate > new Date(lastViewed)) {
          unreadCount = 1;
        }
      }

      conversationsList.push({
        type: 'chat',
        chatSessionId: session.id,
        session: session,
        visitorName: session.visitor_name || 'Website Visitor',
        visitorEmail: session.visitor_email,
        widgetName: session.chat_widgets?.name || 'Web Chat',
        lastActivity: lastMessageDate,
        lastMessage: session.lastMessage || 'New chat session',
        lastMessageRole: session.lastMessageRole,
        unreadCount: unreadCount,
        aiPaused: session.ai_paused_until && new Date(session.ai_paused_until) > new Date(),
      });
    });

    // Sort all conversations by last activity
    this.conversations = conversationsList.sort((a, b) => b.lastActivity - a.lastActivity);

    // Auto-unhide conversations that have new messages since they were hidden
    // This handles the case where a user hides a conversation, then receives new messages while away
    // Check for any recent inbound messages (within last 24 hours) in hidden conversations
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    this.conversations.forEach(conv => {
      const convKey = this.getConversationKey(conv);
      if (this.hiddenConversations.has(convKey)) {
        // Check if there are any recent inbound messages
        const hasRecentInbound = conv.type === 'sms' && conv.messages?.some(m =>
          m.direction === 'inbound' && new Date(m.sent_at || m.created_at) > twentyFourHoursAgo
        );
        // For calls, check if the call was recent
        const isRecentCall = conv.type === 'call' &&
          new Date(conv.lastActivity) > twentyFourHoursAgo;
        // For chat, check if there's recent visitor activity
        const hasRecentChat = conv.type === 'chat' &&
          conv.lastMessageRole === 'visitor' &&
          new Date(conv.lastActivity) > twentyFourHoursAgo;

        if (hasRecentInbound || isRecentCall || hasRecentChat) {
          console.log('Auto-unhiding conversation with recent activity:', convKey);
          this.unhideConversation(convKey);
        }
      }
    });

    // Badge is updated by refreshUnreadBadge() in render()
  }

  // Helper to get consistent conversation key
  getConversationKey(conv) {
    if (conv.type === 'call') return `call_${conv.callId}`;
    if (conv.type === 'chat') return `chat_${conv.chatSessionId}`;
    return `sms_${conv.phone}_${conv.serviceNumber}`;
  }

  renderConversationList() {
    // Filter out hidden conversations
    let visibleConversations = this.conversations.filter(conv => {
      const convKey = this.getConversationKey(conv);
      return !this.hiddenConversations.has(convKey);
    });

    // Apply type filter (calls/texts/chat)
    if (this.typeFilter !== 'all') {
      visibleConversations = visibleConversations.filter(conv => {
        if (this.typeFilter === 'calls') return conv.type === 'call';
        if (this.typeFilter === 'texts') return conv.type === 'sms';
        if (this.typeFilter === 'chat') return conv.type === 'chat';
        return true;
      });
    }

    // Apply direction filter (in/out) - based on how the conversation started
    // Note: Chat doesn't have direction, so it's always included when filter is active
    if (this.directionFilter !== 'all') {
      visibleConversations = visibleConversations.filter(conv => {
        if (conv.type === 'chat') {
          // Chat is always considered "inbound" since visitors initiate
          return this.directionFilter === 'inbound';
        } else if (conv.type === 'call') {
          return conv.call?.direction === this.directionFilter;
        } else {
          // For SMS, check direction of first message (how conversation started)
          const firstMessage = conv.messages?.[0];
          return firstMessage?.direction === this.directionFilter;
        }
      });
    }

    // Apply missed filter (only for calls)
    if (this.missedFilter) {
      visibleConversations = visibleConversations.filter(conv => {
        return conv.type === 'call' && (conv.call?.status === 'missed' || conv.call?.status === 'no-answer');
      });
    }

    // Apply unread filter
    if (this.unreadFilter) {
      visibleConversations = visibleConversations.filter(conv => {
        return (conv.unreadCount || 0) > 0;
      });
    }

    // Apply sentiment filter
    if (this.sentimentFilter !== 'all') {
      visibleConversations = visibleConversations.filter(conv => {
        const sentiment = this.getConversationSentiment(conv);
        return sentiment === this.sentimentFilter;
      });
    }

    // Apply search filter
    if (this.searchQuery && this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase().trim();
      visibleConversations = visibleConversations.filter(conv => {
        // Search by phone number
        if (conv.phone?.toLowerCase().includes(query)) return true;

        // Search by contact name
        const contact = this.contactsMap?.[conv.phone];
        const contactName = contact ? [contact.first_name, contact.last_name, contact.name].filter(Boolean).join(' ').toLowerCase() : '';
        if (contactName.includes(query)) return true;

        // Search by message content (SMS)
        if (conv.type === 'sms' && conv.messages?.some(m => m.content?.toLowerCase().includes(query))) return true;

        // Search by transcript (calls)
        if (conv.type === 'call' && conv.call?.transcript?.toLowerCase().includes(query)) return true;

        return false;
      });
    }

    // Apply date filter
    if (this.dateFilter !== 'all') {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let cutoffDate;

      switch (this.dateFilter) {
        case 'today':
          cutoffDate = startOfToday;
          break;
        case 'yesterday':
          cutoffDate = new Date(startOfToday);
          cutoffDate.setDate(cutoffDate.getDate() - 1);
          break;
        case 'week':
          cutoffDate = new Date(startOfToday);
          cutoffDate.setDate(cutoffDate.getDate() - 7);
          break;
        case 'month':
          cutoffDate = new Date(startOfToday);
          cutoffDate.setDate(cutoffDate.getDate() - 30);
          break;
      }

      if (cutoffDate) {
        visibleConversations = visibleConversations.filter(conv => {
          return conv.lastActivity >= cutoffDate;
        });
      }
    }

    if (visibleConversations.length === 0) {
      return `
        <div style="padding: 2rem; text-align: center; color: var(--text-secondary);">
          <p style="font-size: 1rem; margin-bottom: 0.5rem;">No messages yet</p>
          <p style="font-size: 0.875rem;">When your assistant receives calls or messages, they'll appear here.</p>
        </div>
      `;
    }

    return visibleConversations.map(conv => {
      const isSelected = (conv.type === 'sms' && this.selectedContact === conv.phone && this.selectedServiceNumber === conv.serviceNumber && !this.selectedCallId && !this.selectedChatSessionId) ||
                        (conv.type === 'call' && this.selectedCallId === conv.callId) ||
                        (conv.type === 'chat' && this.selectedChatSessionId === conv.chatSessionId);

      if (conv.type === 'chat') {
        // Chat conversation rendering
        const chatIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
        </svg>`;

        return `
          <div class="swipe-container" data-conv-key="chat_${conv.chatSessionId}">
            <div class="swipe-delete-btn" data-conv-key="chat_${conv.chatSessionId}">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>Delete</span>
            </div>
            <div class="conversation-item swipe-content ${isSelected ? 'selected' : ''} ${conv.unreadCount > 0 ? 'unread' : ''}" data-chat-session-id="${conv.chatSessionId}" data-type="chat" style="display: flex !important; flex-direction: row !important; gap: 0.75rem;">
              ${this.selectMode ? `
              <label class="select-checkbox" style="display: flex; align-items: center; flex-shrink: 0; cursor: pointer;">
                <input type="checkbox" data-conv-key="chat_${conv.chatSessionId}" ${this.selectedForDeletion.has(`chat_${conv.chatSessionId}`) ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--primary-color);">
              </label>
              ` : ''}
              <div class="conversation-avatar chat-avatar" style="flex-shrink: 0; background: linear-gradient(135deg, #6366f1, #8b5cf6);">
                ${chatIcon}
              </div>
              <div class="conversation-content" style="flex: 1 !important; min-width: 0;">
                <div class="conversation-header" style="display: flex !important; justify-content: space-between !important; align-items: baseline; width: 100%;">
                  <span class="conversation-name">${conv.visitorName}${conv.aiPaused ? ' <span style="font-size: 0.65rem; background: #fef3c7; color: #92400e; padding: 0.125rem 0.375rem; border-radius: 0.25rem; margin-left: 0.25rem;">Human</span>' : ''}</span>
                  <div style="display: flex; align-items: center; gap: 0.5rem; margin-left: 0.5rem;">
                    ${conv.unreadCount > 0 ? `<span class="conversation-unread-badge">${conv.unreadCount > 99 ? '99+' : conv.unreadCount}</span>` : ''}
                    <span class="conversation-time" style="white-space: nowrap;">${this.formatTimestamp(conv.lastActivity)}</span>
                  </div>
                </div>
                <div style="font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 2px;">${conv.widgetName}</div>
                <div class="conversation-preview" style="display: flex; align-items: center;">
                  <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${conv.lastMessage}</span>
                </div>
              </div>
            </div>
          </div>
        `;
      } else if (conv.type === 'call') {
        // Determine icon based on direction - using Feather icons
        const isOutbound = conv.call.direction === 'outbound';
        const iconSvg = isOutbound
          ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
               <polyline points="23 7 23 1 17 1"></polyline>
               <line x1="13" y1="11" x2="23" y2="1"></line>
               <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
             </svg>` // phone-outgoing
          : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
               <polyline points="16 2 16 8 22 8"></polyline>
               <line x1="23" y1="1" x2="16" y2="8"></line>
               <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
             </svg>`; // phone-incoming

        // For outbound: show "To: contact" and "From: service number"
        // For inbound: show "From: contact" and "To: service number"
        const primaryNumber = conv.phone; // The contact number
        const serviceNumber = conv.call.service_number || conv.call.caller_number;

        // Look up contact name
        const contact = this.contactsMap?.[primaryNumber];
        const contactName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.name : null;

        return `
          <div class="swipe-container" data-conv-key="call_${conv.callId}">
            <div class="swipe-delete-btn" data-conv-key="call_${conv.callId}">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>Delete</span>
            </div>
            <div class="conversation-item swipe-content ${isSelected ? 'selected' : ''} ${conv.unreadCount > 0 ? 'unread' : ''}" data-call-id="${conv.callId}" data-type="call" style="display: flex !important; flex-direction: row !important; gap: 0.75rem;">
              ${this.selectMode ? `
              <label class="select-checkbox" style="display: flex; align-items: center; flex-shrink: 0; cursor: pointer;">
                <input type="checkbox" data-conv-key="call_${conv.callId}" ${this.selectedForDeletion.has(`call_${conv.callId}`) ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--primary-color);">
              </label>
              ` : ''}
              <div class="conversation-avatar call-avatar" style="flex-shrink: 0;">
                ${iconSvg}
              </div>
              <div class="conversation-content" style="flex: 1 !important; min-width: 0;">
                <div class="conversation-header" style="display: flex !important; justify-content: space-between !important; align-items: baseline; width: 100%;">
                  <span class="conversation-name">${contactName || this.formatPhoneNumber(primaryNumber)}</span>
                  <span class="conversation-time" style="white-space: nowrap; margin-left: 0.5rem;">${this.formatTimestamp(conv.lastActivity)}</span>
                </div>
                ${contactName ? `<div style="font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 2px;">${this.formatPhoneNumber(primaryNumber)}</div>` : ''}
                <div class="conversation-preview" style="display: flex; align-items: center;">
                  <span class="call-status-indicator ${conv.statusInfo.class}" style="color: ${conv.statusInfo.color}; margin-right: 0.25rem;">${conv.statusInfo.icon}</span>
                  <span style="flex: 1;">${conv.lastMessage}</span>
                  ${this.formatSentimentLabel(this.getConversationSentiment(conv))}
                </div>
              </div>
            </div>
          </div>
        `;
      } else {
        // Get contact info if available
        const contact = this.contactsMap?.[conv.phone];
        const contactName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.name : null;

        return `
          <div class="swipe-container" data-conv-key="sms_${conv.phone}_${conv.serviceNumber}">
            <div class="swipe-delete-btn" data-conv-key="sms_${conv.phone}_${conv.serviceNumber}">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>Delete</span>
            </div>
            <div class="conversation-item swipe-content ${isSelected ? 'selected' : ''} ${conv.unreadCount > 0 ? 'unread' : ''}" data-phone="${conv.phone}" data-service-number="${conv.serviceNumber}" data-type="sms" style="display: flex !important; flex-direction: row !important; gap: 0.75rem;">
              ${this.selectMode ? `
              <label class="select-checkbox" style="display: flex; align-items: center; flex-shrink: 0; cursor: pointer;">
                <input type="checkbox" data-conv-key="sms_${conv.phone}_${conv.serviceNumber}" ${this.selectedForDeletion.has(`sms_${conv.phone}_${conv.serviceNumber}`) ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--primary-color);">
              </label>
              ` : ''}
              <div class="conversation-avatar sms-avatar" style="flex-shrink: 0; ${contact?.avatar_url ? 'padding: 0; background: none;' : ''}">
                ${contact?.avatar_url
                  ? `<img src="${contact.avatar_url}" alt="${contactName}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" />`
                  : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>`
                }
              </div>
              <div class="conversation-content" style="flex: 1 !important; min-width: 0;">
                <div class="conversation-header" style="display: flex !important; justify-content: space-between !important; align-items: baseline; width: 100%;">
                  <span class="conversation-name">${contactName || this.formatPhoneNumber(conv.phone)}</span>
                  <div style="display: flex; align-items: center; gap: 0.5rem; margin-left: 0.5rem;">
                    ${conv.unreadCount > 0 ? `<span class="conversation-unread-badge">${conv.unreadCount > 99 ? '99+' : conv.unreadCount}</span>` : ''}
                    <span class="conversation-time" style="white-space: nowrap;">${this.formatTimestamp(conv.lastActivity)}</span>
                  </div>
                </div>
                ${contactName ? `<div style="font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 2px;">${this.formatPhoneNumber(conv.phone)}</div>` : ''}
                <div class="conversation-preview" style="display: flex; align-items: center;">
                  <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${conv.lastMessage}</span>
                  ${this.formatSentimentLabel(this.getConversationSentiment(conv))}
                </div>
              </div>
            </div>
          </div>
        `;
      }
    }).join('');
  }

  renderMessageThread() {
    // Deactivate phone nav when showing message thread
    setPhoneNavActive(false);

    // Reactivate inbox button
    const inboxBtn = document.querySelector('.bottom-nav-item[onclick*="inbox"]');
    if (inboxBtn) {
      inboxBtn.classList.add('active');
    }
    // Check if we're viewing a call or SMS conversation
    if (this.selectedCallId) {
      const conv = this.conversations.find(c => c.type === 'call' && c.callId === this.selectedCallId);
      if (!conv) return this.renderEmptyState();
      return this.renderCallDetailView(conv.call);
    }

    // Check if we're viewing a chat conversation
    if (this.selectedChatSessionId) {
      const conv = this.conversations.find(c => c.type === 'chat' && c.chatSessionId === this.selectedChatSessionId);
      if (!conv) return this.renderEmptyState();
      return this.renderChatThreadView(conv);
    }

    const conv = this.conversations.find(c => c.type === 'sms' && c.phone === this.selectedContact && c.serviceNumber === this.selectedServiceNumber);
    if (!conv) return this.renderEmptyState();

    // Get contact info if available
    const contact = this.contactsMap?.[conv.phone];
    const contactName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.name : null;
    const serviceNumberDisplay = this.formatPhoneNumber(conv.serviceNumber);
    const smsSentiment = this.getConversationSentiment(conv);

    return `
      <div class="thread-header" style="display: flex; align-items: flex-start; gap: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border-color);">
        <button class="back-button" id="back-button" style="
          display: none;
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0;
          margin: 0;
          color: var(--primary-color);
          line-height: 1;
        ">←</button>
        ${contact?.avatar_url ? `
          <img src="${contact.avatar_url}" alt="${contactName}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0;" />
        ` : ''}
        <div style="flex: 1; display: flex; flex-direction: column; gap: 0.25rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem; justify-content: space-between;">
            <h2 style="margin: 0; font-size: calc(1.125rem - 5px); font-weight: 600; line-height: 1;">
              ${contactName || this.formatPhoneNumber(conv.phone)}
            </h2>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <div style="
                display: flex;
                border: 1px solid var(--border-color, #e5e7eb);
                border-radius: 6px;
                overflow: hidden;
                font-size: 0.8rem;
              ">
                <a href="#" id="call-action-btn" data-phone="${conv.phone}" style="
                  padding: 0.35rem 0.75rem;
                  color: var(--primary-color, #6366f1);
                  text-decoration: none;
                ">Call</a>
              </div>
              ${contact?.company || contact?.job_title || contact?.linkedin_url || contact?.twitter_url ? `
                <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--text-secondary);">
                  ${contact?.company || contact?.job_title ? `
                    <span>${[contact.job_title, contact.company].filter(Boolean).join(' at ')}</span>
                  ` : ''}
                  ${contact?.linkedin_url ? `
                    <a href="${contact.linkedin_url}" target="_blank" rel="noopener" style="color: #0077b5; display: flex;" title="LinkedIn">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                      </svg>
                    </a>
                  ` : ''}
                  ${contact?.twitter_url ? `
                    <a href="${contact.twitter_url}" target="_blank" rel="noopener" style="color: #1da1f2; display: flex;" title="Twitter/X">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                      </svg>
                    </a>
                  ` : ''}
                </div>
              ` : ''}
                          </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: -5px;">
            <span style="font-size: 0.8rem; color: var(--text-secondary);">${contactName ? this.formatPhoneNumber(conv.phone) : ''}</span>
            <span style="font-size: 0.75rem; color: var(--text-secondary); opacity: 0.7;">Messaged: ${serviceNumberDisplay}</span>
          </div>
        </div>
      </div>
      <div class="thread-messages" id="thread-messages">
        ${conv.messages.map(msg => this.renderSmsMessage(msg)).join('')}
      </div>
      <div class="message-input-container">
        <textarea
          id="message-input"
          class="message-input"
          placeholder=""
          rows="1"
        ></textarea>
        <button id="agent-reply-btn" class="agent-reply-button" title="Generate AI response">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"></path>
            <circle cx="7.5" cy="14.5" r="1.5"></circle>
            <circle cx="16.5" cy="14.5" r="1.5"></circle>
          </svg>
        </button>
        <button id="send-button" class="send-button">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>

      <!-- Agent Reply Modal -->
      <div id="agent-reply-modal" class="modal hidden">
        <div class="modal-backdrop"></div>
        <div class="modal-content" style="max-width: 500px;">
          <h2 style="margin: 0 0 1rem 0; display: flex; align-items: center; gap: 0.5rem;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"></path>
              <circle cx="7.5" cy="14.5" r="1.5"></circle>
              <circle cx="16.5" cy="14.5" r="1.5"></circle>
            </svg>
            AI Response
          </h2>
          <p style="color: var(--text-secondary); margin: 0 0 1rem 0; font-size: 0.875rem;">
            Describe what you want to say and AI will generate and send the message.
          </p>
          <textarea
            id="agent-reply-prompt"
            placeholder="e.g., Thank them for their patience, confirm appointment tomorrow at 2pm"
            style="
              width: 100%;
              min-height: 100px;
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
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              ${isVoiceSupported() ? `
              <button id="voice-reply-btn" title="Speak your prompt" style="
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
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
              </button>
              <span id="voice-reply-status" style="font-size: 0.75rem; color: var(--text-secondary); display: none;"></span>
              ` : ''}
            </div>
            <div style="display: flex; gap: 0.75rem;">
              <button id="cancel-agent-reply" class="btn btn-secondary">Cancel</button>
              <button id="send-agent-reply" class="btn btn-primary" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
                Generate & Send
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderSmsMessage(msg) {
    const isInbound = msg.direction === 'inbound';
    const isAI = msg.is_ai_generated === true;
    const timestamp = new Date(msg.sent_at || msg.created_at);

    // Get delivery status indicator for outbound messages
    const deliveryStatus = this.getDeliveryStatusIcon(msg);

    return `
      <div class="message-bubble ${isInbound ? 'inbound' : 'outbound'} ${isAI ? 'ai-message' : ''}" data-message-id="${msg.id}">
        ${isAI ? `
          <div class="ai-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="10" rx="2"></rect>
              <circle cx="8" cy="16" r="1"></circle>
              <circle cx="16" cy="16" r="1"></circle>
              <path d="M9 7h6"></path>
              <path d="M12 7v4"></path>
            </svg>
          </div>
        ` : ''}
        <div class="message-content">${this.linkifyPhoneNumbers(msg.content)}</div>
        <div class="message-time">
          ${this.formatTime(timestamp)}
          ${deliveryStatus}
        </div>
      </div>
    `;
  }

  getDeliveryStatusIcon(msg) {
    // Only show delivery status for outbound messages
    if (msg.direction === 'inbound') return '';

    const status = msg.status || 'sent';

    switch (status) {
      case 'delivered':
        // Double checkmark for delivered
        return `<span class="delivery-status delivered" title="Delivered">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1 12 5 16 11 6"></polyline>
            <polyline points="9 12 13 16 22 6"></polyline>
          </svg>
        </span>`;
      case 'sent':
      case 'pending':
        // Single checkmark for sent/pending
        return `<span class="delivery-status sent" title="${status === 'pending' ? 'Sending...' : 'Sent'}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 12 9 17 20 6"></polyline>
          </svg>
        </span>`;
      case 'failed':
      case 'undelivered':
        // X icon for failed
        return `<span class="delivery-status failed" title="Not delivered">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </span>`;
      default:
        return '';
    }
  }

  renderCallDetailView(call) {
    const duration = call.duration_seconds || call.duration || 0;
    const durationText = duration > 0
      ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`
      : '0:00';
    const statusInfo = this.getCallStatusInfo(call.status);
    const messages = this.parseTranscript(call.transcript);

    // Look up contact for this call
    const contact = this.contactsMap?.[call.contact_phone];
    const contactName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.name : null;

    return `
      <div class="thread-header" style="display: flex; flex-direction: column; gap: 0.25rem;">
        <div style="display: flex; align-items: center; gap: 0.75rem; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <button class="back-button" id="back-button" style="
              display: none;
              background: none;
              border: none;
              font-size: 1.5rem;
              cursor: pointer;
              padding: 0;
              margin: 0;
              color: var(--primary-color);
              line-height: 1;
            ">←</button>
            <h2 style="margin: 0; font-size: calc(1.125rem - 5px); font-weight: 600; line-height: 1;">
              ${contactName || this.formatPhoneNumber(call.contact_phone)}
            </h2>
          </div>
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="
              display: flex;
              border: 1px solid var(--border-color, #e5e7eb);
              border-radius: 6px;
              overflow: hidden;
              font-size: 0.8rem;
            ">
              <a href="#" id="call-action-btn" data-phone="${call.contact_phone}" style="
                padding: 0.35rem 0.75rem;
                color: var(--primary-color, #6366f1);
                text-decoration: none;
                border-right: 1px solid var(--border-color, #e5e7eb);
              ">Call</a>
              <a href="#" id="message-action-btn" data-phone="${call.contact_phone}" style="
                padding: 0.35rem 0.75rem;
                color: var(--primary-color, #6366f1);
                text-decoration: none;
              ">Message</a>
            </div>
            ${contact?.company || contact?.job_title || contact?.linkedin_url || contact?.twitter_url ? `
              <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--text-secondary);">
                ${contact?.company || contact?.job_title ? `
                  <span>${[contact.job_title, contact.company].filter(Boolean).join(' at ')}</span>
                ` : ''}
                ${contact?.linkedin_url ? `
                  <a href="${contact.linkedin_url}" target="_blank" rel="noopener" style="color: #0077b5; display: flex;" title="LinkedIn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                  </a>
                ` : ''}
                ${contact?.twitter_url ? `
                  <a href="${contact.twitter_url}" target="_blank" rel="noopener" style="color: #1da1f2; display: flex;" title="Twitter/X">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                  </a>
                ` : ''}
              </div>
            ` : ''}
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: -5px;">
          <span style="font-size: 0.8rem; color: var(--text-secondary);">${contactName ? this.formatPhoneNumber(call.contact_phone) : ''}</span>
          <span style="font-size: 0.75rem; color: var(--text-secondary); opacity: 0.7;">Called: ${this.formatPhoneNumber(call.service_number || (call.direction === 'inbound' ? call.callee_number : call.caller_number) || '')}</span>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 1rem; background: var(--bg-tertiary); border-bottom: 1px solid var(--border-color); font-size: 0.75rem; color: var(--text-secondary);">
        <span>${call.created_at ? new Date(call.created_at).toLocaleString() : ''}</span>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <span style="font-family: monospace;">${call.id || ''}</span>
          <button class="copy-call-id-btn" data-call-id="${call.id}" title="Copy call ID" style="background: none; border: none; padding: 2px; cursor: pointer; color: var(--text-secondary); display: flex; align-items: center;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
          </button>
        </div>
      </div>

      <div class="thread-messages" id="thread-messages">
        ${this.renderRecordings(call, messages)}
      </div>
    `;
  }

  formatRecordingLabel(label) {
    const labels = {
      'conversation': 'Conversation',
      'reconnect_conversation': 'Reconnect Conversation',
      'main': 'Main Call',
      'transfer_conference': 'Transferred Call',
      'transferee_consult': 'Transfer Consultation',
      'reconnect_after_decline': 'Reconnect After Decline',
      'reconnect_to_agent': 'Reconnect',
      'back_to_agent': 'Back to Agent',
    };
    return labels[label] || label.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Split a transcript text into segments by detecting speaker changes.
   * Detects speaker changes at:
   * - Question marks (Q&A pattern)
   * - After prompts like "say you're busy" followed by a short response
   * - Before phrases like "I'll let [name] know" (bot responding to input)
   */
  splitTranscriptBySpeaker(text, startsAsAgent) {
    const segments = [];
    let isAgent = startsAsAgent;

    // First, try to detect the transfer consultation pattern:
    // "...or say you're busy. [short response]. I'll let [name] know..."
    const consultMatch = text.match(/^(.+(?:say you're busy|or say busy)[^.]*\.)\s*([^.]{1,30}\.)\s*(I'll let .+)$/i);
    if (consultMatch) {
      segments.push({ text: consultMatch[1].trim(), isAgent });
      segments.push({ text: consultMatch[2].trim(), isAgent: !isAgent });
      segments.push({ text: consultMatch[3].trim(), isAgent });
      return segments;
    }

    // Split on question marks followed by a space and capital letter
    const parts = text.split(/(\?)\s+(?=[A-Z])/);

    let currentSegment = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === '?') {
        currentSegment += '?';
        if (currentSegment.trim()) {
          segments.push({ text: currentSegment.trim(), isAgent });
        }
        currentSegment = '';
        isAgent = !isAgent; // Switch speaker after question
      } else {
        currentSegment += part;
      }
    }

    // Add remaining text
    if (currentSegment.trim()) {
      segments.push({ text: currentSegment.trim(), isAgent });
    }

    return segments.length > 0 ? segments : [{ text, isAgent: startsAsAgent }];
  }

  formatDurationShort(seconds) {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }

  /**
   * Refresh call recordings from the database and re-render if updated
   */
  async refreshCallRecordings(callId) {
    console.log('📥 Refreshing recordings for call:', callId);

    try {
      // Fetch latest call record from database
      const { data: updatedCall, error } = await supabase
        .from('call_records')
        .select('*')
        .eq('id', callId)
        .single();

      if (error || !updatedCall) {
        console.error('Failed to refresh call:', error);
        return;
      }

      // Update the call in our conversations array
      const convIndex = this.conversations.findIndex(c => c.type === 'call' && c.callId === callId);
      if (convIndex !== -1) {
        this.conversations[convIndex].call = updatedCall;

        // Check if recordings are now complete
        const recordings = updatedCall.recordings || [];
        const stillPending = recordings.some(rec => {
          const isSupabaseUrl = rec.url && rec.url.includes('supabase.co');
          const hasTranscript = !!rec.transcript;
          return !isSupabaseUrl || !hasTranscript;
        });

        // Re-render if this call is currently selected
        if (this.selectedCallId === callId) {
          const threadMessages = document.getElementById('thread-messages');
          if (threadMessages) {
            threadMessages.innerHTML = this.renderRecordings(updatedCall, []);
          }
        }

        // If still pending, schedule another refresh
        if (stillPending && recordings.length > 0) {
          console.log('📥 Recordings still syncing, will retry in 10s...');
          this._recordingRefreshTimer = setTimeout(() => {
            this._recordingRefreshTimer = null;
            this.refreshCallRecordings(callId);
          }, 10000);
        } else {
          console.log('✅ Recordings fully synced');
        }
      }
    } catch (err) {
      console.error('Error refreshing recordings:', err);
    }
  }

  renderRecordings(call, messages = []) {
    // Build recordings array from recordings field or fallback to recording_url
    const recordings = call.recordings || [];
    if (recordings.length === 0 && call.recording_url) {
      recordings.push({ url: call.recording_url, label: 'main', duration: call.duration_seconds });
    }

    // Check if any recordings are still syncing (no Supabase URL or no transcript)
    const hasPendingRecordings = recordings.some(rec => {
      // Recording is pending if it doesn't have a Supabase URL yet
      const isSupabaseUrl = rec.url && rec.url.includes('supabase.co');
      const hasTranscript = !!rec.transcript;
      return !isSupabaseUrl || !hasTranscript;
    });

    // If recordings are pending and we haven't already set up a refresh timer
    if (hasPendingRecordings && recordings.length > 0 && !this._recordingRefreshTimer) {
      console.log('📥 Recordings still syncing, will retry in 10s...');
      this._recordingRefreshTimer = setTimeout(() => {
        this._recordingRefreshTimer = null;
        this.refreshCallRecordings(call.id);
      }, 10000);
    }

    // If no recordings, just show transcript if available
    if (recordings.length === 0) {
      if (call.transcript) {
        const lines = call.transcript.split('\n').filter(l => l.trim());
        if (lines.length > 0 && lines[0].includes(':')) {
          const bubbles = [];
          for (const line of lines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0 && colonIndex < 20) {
              const speaker = line.substring(0, colonIndex).trim().toLowerCase();
              let text = line.substring(colonIndex + 1).trim();
              // Caller/User are always the caller; any other name is the agent (supports custom agent names)
              const isAgent = !['caller', 'user'].includes(speaker);

              // Split text into segments by detecting speaker changes
              const segments = this.splitTranscriptBySpeaker(text, isAgent);
              for (const seg of segments) {
                bubbles.push(`<div class="message-bubble ${seg.isAgent ? 'outbound' : 'inbound'}">
                  <div class="message-content">${this.linkifyPhoneNumbers(seg.text)}</div>
                </div>`);
              }
            } else {
              bubbles.push(`<div style="color: var(--text-secondary);">${this.linkifyPhoneNumbers(line)}</div>`);
            }
          }
          return `<div style="display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem;">${bubbles.join('')}</div>`;
        }
        return `<div style="font-size: 0.9rem; color: var(--text-secondary); white-space: pre-wrap; padding: 0.5rem;">${this.linkifyPhoneNumbers(call.transcript)}</div>`;
      }
      return `<div style="padding: 3rem 1.5rem; text-align: center; color: var(--text-secondary);"><p>No transcript available for this call.</p></div>`;
    }

    // Sort recordings: "conversation" first (LiveKit initial), then "main", then by timestamp
    const sortedRecordings = [...recordings].sort((a, b) => {
      // conversation (LiveKit) comes first - it's the initial agent conversation
      if (a.label === 'conversation' && b.label !== 'conversation') return -1;
      if (b.label === 'conversation' && a.label !== 'conversation') return 1;
      // main comes next
      if (a.label === 'main') return -1;
      if (b.label === 'main') return 1;
      return new Date(a.timestamp || a.created_at || 0) - new Date(b.timestamp || b.created_at || 0);
    });

    // Find the first conversation recording to attach the call transcript
    const firstConversationIdx = sortedRecordings.findIndex(r => r.label === 'conversation');

    return sortedRecordings.map((rec, idx) => {
      // Show transcript under the recording - use the recording's own transcript
      let transcriptHtml = '';
      let recTranscript = rec.transcript;

      // Show call.transcript under the first "conversation" recording (LiveKit initial conversation)
      // This is where the main agent conversation transcript belongs
      if (!recTranscript && rec.label === 'conversation' && idx === firstConversationIdx && call.transcript) {
        recTranscript = call.transcript;
      }

      if (recTranscript) {
        // Parse speaker-labeled transcript into SMS-style chat bubbles
        const lines = recTranscript.split('\n').filter(l => l.trim());
        if (lines.length > 0 && lines[0].includes(':')) {
          const bubbles = [];
          for (const line of lines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0 && colonIndex < 20) {
              const speaker = line.substring(0, colonIndex).trim().toLowerCase();
              let text = line.substring(colonIndex + 1).trim();
              // Caller/User are always the caller; any other name is the agent (supports custom agent names)
              const isAgent = !['caller', 'user'].includes(speaker);

              // Split text into segments by detecting speaker changes at question marks
              const segments = this.splitTranscriptBySpeaker(text, isAgent);
              for (const seg of segments) {
                bubbles.push(`<div class="message-bubble ${seg.isAgent ? 'outbound' : 'inbound'}">
                  <div class="message-content">${this.linkifyPhoneNumbers(seg.text)}</div>
                </div>`);
              }
            } else {
              bubbles.push(`<div style="color: var(--text-secondary); margin: 0.25rem 0;">${this.linkifyPhoneNumbers(line)}</div>`);
            }
          }
          // Wrap in flex container for proper bubble alignment
          transcriptHtml = `<div style="display: flex; flex-direction: column; gap: 0.5rem;">${bubbles.join('')}</div>`;
        } else {
          // No speaker labels - show as plain text
          transcriptHtml = `<div style="font-size: 0.85rem; color: var(--text-secondary); white-space: pre-wrap;">${this.linkifyPhoneNumbers(recTranscript)}</div>`;
        }
      }

      // Check if this recording is still syncing
      // A recording is ready if it has a valid URL (Supabase or SignalWire fallback)
      const hasValidUrl = rec.url && (
        rec.url.includes('supabase.co') ||
        rec.url.includes('signalwire.com') ||
        rec.note === 'fallback_signalwire_url'
      );
      const isSyncing = !hasValidUrl;

      const syncingIndicator = isSyncing ? `
        <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: var(--bg-secondary); border-radius: 6px; margin-top: 0.5rem;">
          <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" stroke-width="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
          </svg>
          <span style="font-size: 0.8rem; color: var(--text-secondary);">Syncing recording...</span>
        </div>
      ` : '';

      return `
        <div style="width: 100%; margin-bottom: 0.75rem; padding: 0.75rem; background: var(--bg-tertiary); border-radius: 8px;">
          <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem; display: flex; justify-content: space-between; align-items: center;">
            <span>
              <span style="font-weight: 500;">${this.formatRecordingLabel(rec.label)}</span>
              ${rec.recording_sid ? `<span style="font-family: monospace; font-size: 0.6rem; opacity: 0.5; margin-left: 0.5rem;">${rec.recording_sid}</span>` : ''}
            </span>
            ${rec.duration || rec.duration_seconds ? `<span>${this.formatDurationShort(rec.duration || rec.duration_seconds)}</span>` : ''}
          </div>
          <audio controls src="${rec.url}" style="width: 100%; height: 36px;"></audio>
          ${syncingIndicator}
          ${transcriptHtml ? `<div style="margin-top: 0.5rem;">${transcriptHtml}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  getCallStatusInfo(status) {
    // SVG icons for consistent cross-platform rendering (no emoji backgrounds)
    const checkIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    const xIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    const circleXIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    const spinIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>';
    const arrowIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>';
    const blockedIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>';
    const voicemailIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="11.5" r="4.5"></circle><circle cx="18.5" cy="11.5" r="4.5"></circle><line x1="5.5" y1="16" x2="18.5" y2="16"></line></svg>';
    const dotIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"></circle></svg>';

    const statusMap = {
      'completed': {
        icon: checkIcon,
        text: 'Completed',
        class: 'status-completed',
        color: '#10b981'
      },
      'in-progress': {
        icon: spinIcon,
        text: 'In Progress',
        class: 'status-progress',
        color: '#6366f1'
      },
      'no-answer': {
        icon: circleXIcon,
        text: 'No Answer',
        class: 'status-missed',
        color: '#ef4444'
      },
      'failed': {
        icon: xIcon,
        text: 'Failed',
        class: 'status-failed',
        color: '#ef4444'
      },
      'busy': {
        icon: circleXIcon,
        text: 'Busy',
        class: 'status-busy',
        color: '#f59e0b'
      },
      'answered_by_pat': {
        icon: checkIcon,
        text: 'Answered by AI',
        class: 'status-completed',
        color: '#10b981'
      },
      'transferred_to_user': {
        icon: arrowIcon,
        text: 'Transferred',
        class: 'status-transferred',
        color: '#6366f1'
      },
      'screened_out': {
        icon: blockedIcon,
        text: 'Screened Out',
        class: 'status-screened',
        color: '#9ca3af'
      },
      'voicemail': {
        icon: voicemailIcon,
        text: 'Voicemail',
        class: 'status-voicemail',
        color: '#8b5cf6'
      },
      'Caller Hungup': {
        icon: circleXIcon,
        text: 'Hung Up',
        class: 'status-hungup',
        color: '#f59e0b'
      },
      'outbound_completed': {
        icon: checkIcon,
        text: 'Completed',
        class: 'status-completed',
        color: '#10b981'
      },
      'outbound_no_answer': {
        icon: circleXIcon,
        text: 'No Answer',
        class: 'status-missed',
        color: '#ef4444'
      },
      'outbound_busy': {
        icon: circleXIcon,
        text: 'Busy',
        class: 'status-busy',
        color: '#f59e0b'
      },
      'outbound_failed': {
        icon: xIcon,
        text: 'Failed',
        class: 'status-failed',
        color: '#ef4444'
      }
    };

    return statusMap[status] || {
      icon: dotIcon,
      text: status || 'Unknown',
      class: 'status-unknown',
      color: '#9ca3af'
    };
  }

  truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  renderEmptyState() {
    return `
      <div class="empty-thread">
        <div style="font-size: 3rem; margin-bottom: 1rem;">💬</div>
        <h3 style="margin: 0 0 0.5rem 0; font-weight: 600;">Select a conversation</h3>
        <p style="margin: 0; color: var(--text-secondary); font-size: 0.875rem;">
          Choose a conversation from the list to view messages
        </p>
      </div>
    `;
  }

  /**
   * Render chat thread view for web chat conversations
   */
  renderChatThreadView(conv) {
    // Deactivate phone nav when showing chat thread
    setPhoneNavActive(false);

    // Reactivate inbox button
    const inboxBtn = document.querySelector('.bottom-nav-item[onclick*="inbox"]');
    if (inboxBtn) {
      inboxBtn.classList.add('active');
    }

    const aiPaused = conv.session?.ai_paused_until && new Date(conv.session.ai_paused_until) > new Date();

    return `
      <div class="thread-header" style="display: flex; align-items: flex-start; gap: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border-color);">
        <button class="back-button" id="back-button" style="
          display: none;
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0;
          margin: 0;
          color: var(--primary-color);
          line-height: 1;
        ">←</button>
        <div class="conversation-avatar chat-avatar" style="width: 40px; height: 40px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
          </svg>
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 0.25rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem; justify-content: space-between;">
            <h2 style="margin: 0; font-size: calc(1.125rem - 5px); font-weight: 600; line-height: 1;">
              ${conv.visitorName}
            </h2>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              ${aiPaused ? `
                <span style="font-size: 0.7rem; background: #fef3c7; color: #92400e; padding: 0.25rem 0.5rem; border-radius: 0.25rem;">
                  AI Paused
                </span>
                <button id="resume-ai-btn" class="btn btn-sm btn-secondary" style="font-size: 0.7rem; padding: 0.25rem 0.5rem;">Resume AI</button>
              ` : ''}
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: var(--text-secondary);">
            <span>${conv.widgetName}</span>
            ${conv.visitorEmail ? `<span>• ${conv.visitorEmail}</span>` : ''}
          </div>
        </div>
      </div>

      <div class="thread-messages" id="thread-messages">
        <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
          Loading messages...
        </div>
      </div>

      <div class="message-input-container">
        <textarea
          id="message-input"
          class="message-input"
          placeholder="Type a reply... (will pause AI for 5 min)"
          rows="1"
          style="resize: none;"
        ></textarea>
        <button class="send-button" id="send-chat-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    `;
  }

  getInitials(phone) {
    // Use last 2 digits of phone as "initials"
    return phone.slice(-2);
  }

  hasActiveFilters() {
    return this.typeFilter !== 'all' ||
           this.directionFilter !== 'all' ||
           this.missedFilter ||
           this.unreadFilter ||
           this.sentimentFilter !== 'all';
  }

  formatPhoneNumber(phone) {
    if (!phone) return 'Unknown';
    const cleaned = phone.replace(/\D/g, '');
    const match = cleaned.match(/^1?(\d{3})(\d{3})(\d{4})$/);
    if (match) {
      return `+1 (${match[1]}) ${match[2]}-${match[3]}`;
    }
    return phone;
  }

  formatTimestamp(date) {
    try {
      // Handle invalid dates
      if (!date) return '';

      // Convert string to Date if needed
      let dateObj;
      if (date instanceof Date) {
        dateObj = date;
      } else {
        dateObj = new Date(date);
      }

      // Check if valid date - multiple safety checks
      if (!dateObj || typeof dateObj.getTime !== 'function') return '';
      if (isNaN(dateObj.getTime())) return '';

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const dateDay = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());

      const timeStr = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

      // Today: just show time
      if (dateDay.getTime() === today.getTime()) {
        return timeStr;
      }

      // Yesterday: show "Yesterday" + time
      if (dateDay.getTime() === yesterday.getTime()) {
        return `Yesterday ${timeStr}`;
      }

      // Older: show full date + time
      if (typeof dateObj.toLocaleDateString !== 'function') return '';
      const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${dateStr} ${timeStr}`;
    } catch (err) {
      console.error('formatTimestamp error:', err, 'date:', date);
      return '';
    }
  }

  formatTime(date) {
    try {
      if (!date) return '';
      const dateObj = date instanceof Date ? date : new Date(date);
      if (!dateObj || typeof dateObj.getTime !== 'function') return '';
      if (isNaN(dateObj.getTime())) return '';
      if (typeof dateObj.toLocaleTimeString !== 'function') return '';
      return dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch (err) {
      console.error('formatTime error:', err);
      return '';
    }
  }

  /**
   * Format sentiment for display as an inline label
   * @param {string|null} sentiment - 'positive', 'neutral', 'negative', or null
   * @returns {string} HTML for sentiment label
   */
  formatSentimentLabel(sentiment) {
    if (!sentiment) return '';

    const config = {
      positive: { label: 'Positive', color: '#22c55e', bg: '#dcfce7' },
      neutral: { label: 'Neutral', color: '#6b7280', bg: '#f3f4f6' },
      negative: { label: 'Negative', color: '#ef4444', bg: '#fee2e2' }
    };

    const cfg = config[sentiment];
    if (!cfg) return '';

    return `<span class="sentiment-label sentiment-${sentiment}" style="
      font-size: 0.65rem;
      padding: 0.125rem 0.375rem;
      border-radius: 0.25rem;
      background: ${cfg.bg};
      color: ${cfg.color};
      font-weight: 500;
      margin-left: 0.5rem;
    ">${cfg.label}</span>`;
  }

  /**
   * Get sentiment for a conversation
   * For calls: use user_sentiment from call record
   * For SMS: use sentiment from most recent inbound message
   */
  getConversationSentiment(conv) {
    if (conv.type === 'call') {
      return conv.call?.user_sentiment || null;
    } else if (conv.type === 'sms') {
      // Find most recent inbound message with sentiment
      const inboundWithSentiment = conv.messages
        ?.filter(m => m.direction === 'inbound' && m.sentiment)
        ?.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
      return inboundWithSentiment?.[0]?.sentiment || null;
    }
    return null;
  }

  async showNewConversationModal() {
    // Directly show the new message interface
    this.showMessageInterface();
  }

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
  }

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
  }

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
  }

  updateCharCount(text) {
    const charCount = document.getElementById('char-count');
    const length = text.length;
    const segments = Math.ceil(length / 160) || 1;
    charCount.textContent = `${length} characters · ${segments} segment${segments !== 1 ? 's' : ''}`;
  }

  toggleVoiceInput(btnId = 'voice-prompt-btn', statusId = 'voice-status', inputId = 'agent-prompt') {
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
  }

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
  }

  showCallInterface() {
    const isMobile = window.innerWidth <= 768;
    const threadElement = document.getElementById('message-thread');

    // Use thread element for both mobile and desktop
    threadElement.innerHTML = this.renderCallInterfaceContent();
    threadElement.style.display = 'flex';
    threadElement.style.flexDirection = 'column';
    threadElement.style.overflow = 'auto';
    threadElement.style.background = 'var(--bg-primary)';

    // On mobile, add padding at bottom for navigation bar and ensure scrolling
    if (isMobile) {
      threadElement.style.paddingBottom = '100px';
      threadElement.style.height = '100%';
      threadElement.style.maxHeight = '100%';
    } else {
      threadElement.style.paddingBottom = '0';
    }

    // Set phone nav button as active
    setPhoneNavActive(true);

    this.attachCallEventListeners();
  }

  renderCallInterfaceContent() {
    const isMobile = window.innerWidth <= 768;

    return `
      <div style="
        display: flex;
        flex-direction: column;
        min-height: 100%;
        background: var(--bg-primary);
        padding: 1rem 0.5rem;
        overflow: visible;
        position: relative;
      ">
        <!-- Call header -->
        <div style="text-align: center; margin-bottom: 0.5rem; flex-shrink: 0; position: relative;">

          <!-- SIP Status Indicator -->
          <div id="sip-status" style="
            position: absolute;
            top: 50%;
            right: 1rem;
            transform: translateY(-50%);
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.75rem;
            color: var(--text-secondary);
          ">
            <div id="sip-led" style="
              width: 8px;
              height: 8px;
              border-radius: 50%;
              background: #6b7280;
              box-shadow: 0 0 4px rgba(107, 116, 128, 0.5);
            "></div>
            <span id="sip-status-text">Connecting...</span>
          </div>
        </div>

        <!-- Caller ID selector -->
        <div style="
          padding: 0 0.5rem;
          max-width: 300px;
          margin: 0 auto 0.5rem auto;
          width: 100%;
          flex-shrink: 0;
        ">
          <label id="call-state-label" style="
            display: block;
            font-size: 0.7rem;
            color: var(--text-secondary);
            margin-bottom: 0.2rem;
            text-align: center;
          ">Call from</label>
          <select
            id="caller-id-select"
            style="
              width: 100%;
              padding: 0.5rem;
              border: 1px solid rgba(128, 128, 128, 0.2);
              border-radius: 8px;
              background: var(--bg-secondary);
              color: var(--text-primary);
              font-size: 1.2rem;
              font-weight: 300;
              text-align: center;
              cursor: pointer;
              outline: none;
            "
          >
            <option value="">Loading numbers...</option>
          </select>
          <!-- Recording toggle -->
          <div style="
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 12px;
            padding: 8px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
          ">
            <input
              type="checkbox"
              id="record-call-toggle"
              checked
              style="
                width: 18px;
                height: 18px;
                cursor: pointer;
              "
            >
            <label
              for="record-call-toggle"
              style="
                font-size: 14px;
                color: rgba(255, 255, 255, 0.9);
                cursor: pointer;
                user-select: none;
              "
            >
              🎙️ Record call
            </label>
          </div>
        </div>

        <!-- Phone number display with search -->
        <div style="
          padding: 0.5rem 0.5rem;
          margin: 0 auto 0.4rem auto;
          min-height: 2.5rem;
          max-width: 300px;
          width: 100%;
          position: relative;
          flex-shrink: 0;
        ">
          <div style="
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
          ">
            <input
              type="text"
              id="call-search-input"
              placeholder="Enter name or number"
              style="
                width: 100%;
                font-size: 1.2rem;
                font-weight: 300;
                color: var(--text-primary);
                letter-spacing: 0.05em;
                min-height: 1.5rem;
                text-align: center;
                border: 1px solid rgba(128, 128, 128, 0.2);
                border-radius: 8px;
                padding: 0.5rem;
                background: transparent;
                outline: none;
              "
            />
            <button
              id="delete-btn"
              style="
                position: absolute;
                right: 0;
                top: 50%;
                transform: translateY(-50%);
                width: 32px;
                height: 32px;
                border-radius: 50%;
                border: none;
                background: var(--bg-secondary);
                color: var(--text-secondary);
                cursor: pointer;
                display: none;
                align-items: center;
                justify-content: center;
                transition: all 0.15s ease;
                flex-shrink: 0;
              "
              onmousedown="this.style.background='var(--border-color)'; this.style.transform='translateY(-50%) scale(0.95)'"
              onmouseup="this.style.background='var(--bg-secondary)'; this.style.transform='translateY(-50%) scale(1)'"
              onmouseleave="this.style.background='var(--bg-secondary)'; this.style.transform='translateY(-50%) scale(1)'"
              ontouchstart="this.style.background='var(--border-color)'; this.style.transform='translateY(-50%) scale(0.95)'"
              ontouchend="this.style.background='var(--bg-secondary)'; this.style.transform='translateY(-50%) scale(1)'"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22 3H7c-.69 0-1.23.35-1.59.88L0 12l5.41 8.11c.36.53.9.89 1.59.89h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-3 12.59L17.59 17 14 13.41 10.41 17 9 15.59 12.59 12 9 8.41 10.41 7 14 10.59 17.59 7 19 8.41 15.41 12 19 15.59z"/>
              </svg>
            </button>
          </div>

          <!-- Contact suggestions dropdown -->
          <div id="contact-suggestions" style="
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: var(--bg-primary);
            border: 1px solid var(--border-color);
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-lg);
            max-height: 200px;
            overflow-y: auto;
            display: none;
            z-index: 100;
            margin-top: 0.25rem;
          "></div>
        </div>

        <!-- DTMF Keypad -->
        <div style="
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.5rem;
          max-width: ${isMobile ? '225px' : '300px'};
          margin: ${isMobile ? '10px auto 0 auto' : '0 auto'};
          width: 100%;
          flex-shrink: 0;
        ">
          ${this.renderDTMFButton('1', '')}
          ${this.renderDTMFButton('2', 'ABC')}
          ${this.renderDTMFButton('3', 'DEF')}
          ${this.renderDTMFButton('4', 'GHI')}
          ${this.renderDTMFButton('5', 'JKL')}
          ${this.renderDTMFButton('6', 'MNO')}
          ${this.renderDTMFButton('7', 'PQRS')}
          ${this.renderDTMFButton('8', 'TUV')}
          ${this.renderDTMFButton('9', 'WXYZ')}
          ${this.renderDTMFButton('*', '')}
          ${this.renderDTMFButton('0', '')}
          ${this.renderDTMFButton('#', '')}
        </div>

        <!-- Spacer -->
        <div style="${isMobile ? 'height: 15px;' : 'height: 2rem;'}"></div>

        <!-- Call action button -->
        <div style="
          display: flex;
          justify-content: center;
          padding: 0;
          flex-shrink: 0;
          margin-top: ${isMobile ? '20px' : '0'};
        ">
          <button
            id="call-btn"
            style="
              width: 56px;
              height: 56px;
              border-radius: 50%;
              border: none;
              background: linear-gradient(135deg, #10b981, #059669);
              color: white;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              transition: all 0.2s ease;
              box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
            "
            onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 6px 16px rgba(16, 185, 129, 0.4)'"
            onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(16, 185, 129, 0.3)'"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  renderDTMFButton(digit, letters) {
    const digitStyle = digit === '*' ? 'font-size: 3.15rem; font-weight: 300; line-height: 1; position: relative; top: 11px; left: 2px;' :
                       digit === '#' ? 'font-size: 2rem; font-weight: 400;' : '';
    return `
      <button
        class="dtmf-btn"
        data-digit="${digit}"
        style="
          aspect-ratio: 1;
          border: none;
          border-radius: 50%;
          background: var(--bg-secondary);
          color: var(--text-primary);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
          font-weight: 300;
          transition: all 0.15s ease;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          padding: 0.5rem;
        "
        onmousedown="this.style.background='var(--border-color)'; this.style.transform='scale(0.95)'"
        onmouseup="this.style.background='var(--bg-secondary)'; this.style.transform='scale(1)'"
        onmouseleave="this.style.background='var(--bg-secondary)'; this.style.transform='scale(1)'"
        ontouchstart="this.style.background='var(--border-color)'; this.style.transform='scale(0.95)'"
        ontouchend="this.style.background='var(--bg-secondary)'; this.style.transform='scale(1)'"
      >
        <span style="line-height: 1; ${digitStyle}">${digit}</span>
        ${letters ? `<span style="font-size: 0.6rem; font-weight: 600; letter-spacing: 0.05em; margin-top: 0.1rem; color: var(--text-secondary);">${letters}</span>` : ''}
      </button>
    `;
  }

  attachCallEventListeners() {
    const searchInput = document.getElementById('call-search-input');
    const deleteBtn = document.getElementById('delete-btn');
    const suggestionsEl = document.getElementById('contact-suggestions');
    const callerIdSelect = document.getElementById('caller-id-select');
    const recordCallToggle = document.getElementById('record-call-toggle');

    let selectedContact = null;

    const updateDeleteButton = () => {
      if (deleteBtn && searchInput) {
        deleteBtn.style.display = searchInput.value.length > 0 ? 'flex' : 'none';
      }
    };

    // Load recording preference from localStorage (default: true)
    const recordingPref = localStorage.getItem('record_calls_preference');
    if (recordCallToggle) {
      recordCallToggle.checked = recordingPref !== 'false'; // Default to true
    }

    // Save recording preference when toggled
    if (recordCallToggle) {
      recordCallToggle.addEventListener('change', (e) => {
        const shouldRecord = e.target.checked;
        localStorage.setItem('record_calls_preference', shouldRecord.toString());
        console.log('📹 Call recording preference:', shouldRecord ? 'ON' : 'OFF');
      });
    }

    // Load service numbers for caller ID selector
    this.loadServiceNumbers();

    // Prompt for microphone access and initialize SIP client
    this.requestMicrophoneAndInitializeSIP();

    // Search input for contact autocomplete
    if (searchInput) {
      // Show recent numbers on focus when input is empty
      searchInput.addEventListener('focus', async () => {
        if (searchInput.value.trim().length === 0) {
          await this.showRecentNumbers(suggestionsEl, searchInput, () => {
            selectedContact = null;
            updateDeleteButton();
          });
        }
      });

      searchInput.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        updateDeleteButton();

        if (query.length === 0) {
          // Show recent numbers when input is cleared
          await this.showRecentNumbers(suggestionsEl, searchInput, () => {
            selectedContact = null;
            updateDeleteButton();
          });
          return;
        }

        // Search contacts
        const contacts = await this.searchContacts(query);

        if (contacts.length > 0) {
          suggestionsEl.innerHTML = contacts.map(contact => `
            <div class="contact-suggestion" data-phone="${contact.phone_number}" style="
              padding: 0.75rem;
              cursor: pointer;
              border-bottom: 1px solid var(--border-color);
              transition: background 0.15s;
            " onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='transparent'">
              <div style="font-weight: 600; color: var(--text-primary);">
                ${contact.first_name || ''} ${contact.last_name || ''}
              </div>
              <div style="font-size: 0.875rem; color: var(--text-secondary);">
                ${this.formatPhoneNumber(contact.phone_number)}
              </div>
            </div>
          `).join('');
          suggestionsEl.style.display = 'block';

          // Add click handlers to suggestions
          suggestionsEl.querySelectorAll('.contact-suggestion').forEach(suggestion => {
            suggestion.addEventListener('click', () => {
              const phone = suggestion.dataset.phone;
              searchInput.value = phone;
              selectedContact = contacts.find(c => c.phone_number === phone);
              suggestionsEl.style.display = 'none';
              updateDeleteButton();
            });
          });
        } else {
          suggestionsEl.style.display = 'none';
        }
      });

      // Focus input on load
      searchInput.focus();

      // Close suggestions when clicking outside
      document.addEventListener('click', (e) => {
        if (!suggestionsEl.contains(e.target) && e.target !== searchInput) {
          suggestionsEl.style.display = 'none';
        }
      });
    }

    // DTMF buttons - append to input OR send DTMF if call is active
    document.querySelectorAll('.dtmf-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const digit = btn.dataset.digit;

        // If call is active, send DTMF tone
        if (sipClient.isInCall()) {
          console.log('Sending DTMF:', digit);
          sipClient.sendDTMF(digit);
          // Visual feedback
          btn.style.transform = 'scale(0.95)';
          setTimeout(() => {
            btn.style.transform = 'scale(1)';
          }, 100);
        } else {
          // Otherwise, append to input
          if (searchInput) {
            searchInput.value += digit;
            updateDeleteButton();
            suggestionsEl.style.display = 'none';
          }
        }
      });
    });

    // Delete button - remove last character
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = searchInput.value.slice(0, -1);
          updateDeleteButton();
        }
      });
    }

    // Call button - handles both call and hangup actions
    document.getElementById('call-btn').addEventListener('click', async () => {
      const callBtn = document.getElementById('call-btn');

      // Check if this is a hangup action (button is red)
      if (callBtn.dataset.action === 'hangup') {
        console.log('Hanging up call...');
        this.userHungUp = true;

        // Hangup SIP call
        sipClient.hangup();

        // Reset UI
        this.updateCallState('idle');
        this.transformToCallButton();
        return;
      }

      // Otherwise, initiate a new call
      const phoneNumber = searchInput ? searchInput.value.trim() : '';

      if (!phoneNumber) {
        await showAlertModal('Missing Phone Number', 'Please enter a phone number');
        return;
      }

      // Get selected caller ID
      const selectedCallerId = callerIdSelect ? callerIdSelect.value : null;

      if (!selectedCallerId) {
        await showAlertModal('No Caller ID', 'No active phone number selected');
        return;
      }

      // Close modal if on mobile
      const modal = document.getElementById('call-modal');
      if (modal) {
        modal.remove();
      }

      await this.initiateCall(phoneNumber, selectedCallerId);
    });

    // Close modal on backdrop click (mobile only)
    const backdrop = document.querySelector('#call-modal .modal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', () => {
        document.getElementById('call-modal').remove();
      });
    }
  }

  async initiateCall(phoneNumber, callerIdNumber = null) {
    console.log('Initiating SIP call to:', phoneNumber);

    // Load SIP client on demand
    sipClient = await loadSipClient();

    // Track if user clicks hangup button
    this.userHungUp = false;

    try {
      // Get caller ID number and SIP credentials
      let fromNumber = callerIdNumber;
      let sipCredentials = null;

      if (!fromNumber) {
        const { data: serviceNumbers } = await supabase
          .from('service_numbers')
          .select('phone_number, sip_username, sip_password, sip_domain, sip_ws_server')
          .eq('user_id', this.userId)
          .eq('is_active', true)
          .order('purchased_at', { ascending: false })
          .limit(1);

        if (serviceNumbers && serviceNumbers.length > 0) {
          fromNumber = serviceNumbers[0].phone_number;
          sipCredentials = serviceNumbers[0];
        } else {
          await showAlertModal('No Service Numbers', 'No active service numbers found');
          return;
        }
      } else {
        // Get SIP credentials for the selected caller ID
        const { data: serviceNumber } = await supabase
          .from('service_numbers')
          .select('sip_username, sip_password, sip_domain, sip_ws_server')
          .eq('phone_number', fromNumber)
          .eq('is_active', true)
          .single();

        if (!serviceNumber) {
          await showAlertModal('Number Not Found', 'Selected number not found or inactive');
          return;
        }
        sipCredentials = serviceNumber;
      }

      // Get user's name for CNAM (Caller Name)
      const { data: userData } = await supabase
        .from('users')
        .select('name')
        .eq('id', this.userId)
        .single();

      // Format name as "FirstName L" (first name + last initial)
      let displayName = fromNumber; // fallback to phone number
      if (userData && userData.name) {
        const nameParts = userData.name.trim().split(/\s+/);
        if (nameParts.length > 1) {
          // Has first and last name
          const firstName = nameParts[0];
          const lastInitial = nameParts[nameParts.length - 1].charAt(0).toUpperCase();
          displayName = `${firstName} ${lastInitial}`;
        } else {
          // Only first name
          displayName = nameParts[0];
        }
      }

      // Check if recording is enabled
      const recordCallToggle = document.getElementById('record-call-toggle');
      const recordCall = recordCallToggle ? recordCallToggle.checked : false;

      // If recording is enabled, use bridged call approach
      // Otherwise use direct SIP calling
      if (recordCall) {
        console.log('🎙️ Recording enabled - using bridged call approach');
        await this.initiateBridgedCall(phoneNumber, fromNumber);
        return;
      }

      // Show connecting state
      this.updateCallState('connecting', 'Registering...');

      console.log('🔧 Initializing SIP client...');
      console.log('📞 Using display name (CNAM):', displayName);

      // Initialize SIP client with credentials
      await sipClient.initialize({
        sipUri: `sip:${sipCredentials.sip_username}@${sipCredentials.sip_domain}`,
        sipPassword: sipCredentials.sip_password,
        wsServer: sipCredentials.sip_ws_server,
        displayName: displayName
      });

      console.log('✅ SIP client registered');
      this.updateCallState('connecting', 'Calling...');

      // Create call record
      const callStartTime = new Date().toISOString();

      // Normalize phone number to E.164 format (+1234567890)
      let normalizedPhoneNumber = phoneNumber;
      if (!normalizedPhoneNumber.startsWith('+')) {
        // Strip all non-digit characters first
        const digitsOnly = normalizedPhoneNumber.replace(/\D/g, '');
        // If number starts with 1 and is 11 digits, just add +
        // Otherwise assume North America and add +1
        if (digitsOnly.startsWith('1') && digitsOnly.length === 11) {
          normalizedPhoneNumber = '+' + digitsOnly;
        } else {
          normalizedPhoneNumber = '+1' + digitsOnly;
        }
      }

      const { data: callRecord, error: callRecordError } = await supabase
        .from('call_records')
        .insert({
          user_id: this.userId,
          caller_number: normalizedPhoneNumber,
          contact_phone: normalizedPhoneNumber,
          service_number: fromNumber,
          direction: 'outbound',
          disposition: 'outbound_failed', // Will update on success
          status: 'failed', // Will update on success
          started_at: callStartTime
        })
        .select()
        .single();

      if (callRecordError) {
        console.error('Failed to create call record:', callRecordError);
      } else {
        console.log('✅ Call record created:', callRecord.id);
      }

      const callRecordId = callRecord?.id;
      let callConnectedTime = null;

      // Make call via SIP
      await sipClient.makeCall(phoneNumber, fromNumber, displayName, {
        onProgress: () => {
          console.log('📞 Call ringing...');
          this.updateCallState('ringing', 'Ringing...');
        },
        onConfirmed: () => {
          console.log('✅ Call connected');
          callConnectedTime = new Date();
          this.updateCallState('established', 'Connected');
          this.transformToHangupButton();
        },
        onFailed: async (cause) => {
          console.error('❌ Call failed:', cause);
          this.updateCallState('failed', `Call failed: ${cause}`);

          // Update call record with failure
          if (callRecordId) {
            const disposition = cause.toLowerCase().includes('busy') ? 'outbound_busy' : 'outbound_failed';
            const status = cause.toLowerCase().includes('busy') ? 'busy' : 'failed';
            await supabase
              .from('call_records')
              .update({
                disposition,
                status,
                ended_at: new Date().toISOString(),
                duration: 0,
                duration_seconds: 0
              })
              .eq('id', callRecordId);
          }

          showAlertModal('Call Failed', `Call failed: ${cause}`);
          this.transformToCallButton();
        },
        onEnded: async () => {
          console.log('📞 Call ended');

          // Update call record with final disposition and duration
          if (callRecordId) {
            const endTime = new Date();
            const duration = callConnectedTime
              ? Math.round((endTime - callConnectedTime) / 1000)
              : 0;

            const disposition = callConnectedTime
              ? 'outbound_completed'
              : 'outbound_no_answer';

            const status = callConnectedTime
              ? 'completed'
              : 'no-answer';

            await supabase
              .from('call_records')
              .update({
                disposition,
                status,
                ended_at: endTime.toISOString(),
                duration,
                duration_seconds: duration,
                contact_phone: normalizedPhoneNumber,
                service_number: fromNumber
              })
              .eq('id', callRecordId);

            console.log(`✅ Call record updated: ${disposition}, duration: ${duration}s`);
          }

          this.updateCallState('idle');
          this.transformToCallButton();
        }
      });

      console.log('📞 SIP call initiated');

    } catch (error) {
      console.error('Failed to initiate call:', error);
      showAlertModal('Call Error', `Failed to initiate call: ${error.message}`);
      this.updateCallState('idle');
      this.transformToCallButton();
    }
  }

  async initiateBridgedCall(phoneNumber, callerIdNumber) {
    console.log('📞 Initiating bridged call with recording');
    console.log('   To:', phoneNumber);
    console.log('   From:', callerIdNumber);

    // Load SIP client on demand
    sipClient = await loadSipClient();

    try {
      // Show connecting state
      this.updateCallState('connecting', 'Registering SIP...');

      // Get SIP credentials for the selected caller ID
      const { data: serviceNumber } = await supabase
        .from('service_numbers')
        .select('sip_username, sip_password, sip_domain, sip_ws_server')
        .eq('phone_number', callerIdNumber)
        .eq('is_active', true)
        .single();

      if (!serviceNumber) {
        throw new Error('Selected number not found or inactive');
      }

      // Initialize SIP client so it can receive the incoming call
      console.log('🔧 Initializing SIP client for incoming call...');
      await sipClient.initialize({
        sipUri: `sip:${serviceNumber.sip_username}@${serviceNumber.sip_domain}`,
        sipPassword: serviceNumber.sip_password,
        wsServer: serviceNumber.sip_ws_server,
        displayName: callerIdNumber
      });

      console.log('✅ SIP client registered and ready');
      this.updateCallState('connecting', 'Initiating call...');

      // Normalize phone number to E.164 format
      let normalizedPhoneNumber = phoneNumber;
      if (!normalizedPhoneNumber.startsWith('+')) {
        const digitsOnly = normalizedPhoneNumber.replace(/\D/g, '');
        if (digitsOnly.startsWith('1') && digitsOnly.length === 11) {
          normalizedPhoneNumber = '+' + digitsOnly;
        } else {
          normalizedPhoneNumber = '+1' + digitsOnly;
        }
      }

      // Call the Edge Function to initiate bridged call
      const { data, error } = await supabase.functions.invoke('initiate-bridged-call', {
        body: {
          phone_number: normalizedPhoneNumber,
          caller_id: callerIdNumber
        }
      });

      if (error) {
        throw new Error(error.message || 'Failed to initiate bridged call');
      }

      console.log('✅ Bridged call initiated:', data);
      console.log('   Call SID:', data.call_sid);
      console.log('   Call Record ID:', data.call_record_id);

      // Update UI to show call is in progress
      this.updateCallState('ringing', 'Your phone will ring shortly...');
      this.transformToHangupButton();

      // Store call info for hangup
      this.currentBridgedCallSid = data.call_sid;
      this.currentCallRecordId = data.call_record_id;

    } catch (error) {
      console.error('Failed to initiate bridged call:', error);
      showAlertModal('Call Error', `Failed to initiate call: ${error.message}`);
      this.updateCallState('idle');
      this.transformToCallButton();
    }
  }

  showCallStatus(status) {
    const statusEl = document.getElementById('call-status');
    if (statusEl) {
      statusEl.textContent = status;
    }
  }

  transformToHangupButton() {
    const callBtn = document.getElementById('call-btn');
    if (!callBtn) return;

    // Change to red hangup button
    callBtn.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
    callBtn.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
    callBtn.dataset.action = 'hangup';
    callBtn.disabled = false;
    callBtn.style.opacity = '1';
    callBtn.style.cursor = 'pointer';

    // Update hover effects
    callBtn.onmouseover = () => {
      callBtn.style.transform = 'scale(1.05)';
      callBtn.style.boxShadow = '0 6px 16px rgba(239, 68, 68, 0.4)';
    };
    callBtn.onmouseout = () => {
      callBtn.style.transform = 'scale(1)';
      callBtn.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
    };

    // Change icon to hangup icon (phone with X)
    callBtn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.68-1.36-2.66-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
      </svg>
    `;

    console.log('🔴 Button transformed to HANGUP');
  }

  transformToCallButton() {
    const callBtn = document.getElementById('call-btn');
    if (!callBtn) return;

    // Change back to green call button
    callBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
    callBtn.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
    callBtn.dataset.action = 'call';
    callBtn.disabled = false;
    callBtn.style.opacity = '1';
    callBtn.style.cursor = 'pointer';

    // Restore hover effects
    callBtn.onmouseover = () => {
      callBtn.style.transform = 'scale(1.05)';
      callBtn.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)';
    };
    callBtn.onmouseout = () => {
      callBtn.style.transform = 'scale(1)';
      callBtn.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
    };

    // Restore phone icon
    callBtn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
      </svg>
    `;

    console.log('🟢 Button transformed to CALL');
  }

  updateCallState(state, message = null) {
    const stateLabel = document.getElementById('call-state-label');
    const callBtn = document.getElementById('call-btn');

    console.log('📞 Updating call state to:', state, 'Message:', message, 'Label found:', !!stateLabel);

    if (!stateLabel) {
      console.warn('⚠️ Call state label not found');
      return;
    }

    switch (state) {
      case 'connecting':
        stateLabel.textContent = 'Connecting...';
        stateLabel.style.color = 'var(--text-secondary)';
        // Transform to hangup button as soon as call starts
        this.transformToHangupButton();
        break;

      case 'progress':
      case 'ringing':
        stateLabel.textContent = 'Ringing...';
        stateLabel.style.color = '#f59e0b'; // Orange color
        // Keep hangup button active during ringing
        this.transformToHangupButton();
        break;

      case 'established':
        stateLabel.textContent = 'Call Established';
        stateLabel.style.color = '#10b981'; // Green color
        // Keep hangup button active when call is established
        this.transformToHangupButton();
        // Show recording indicator if recording is enabled
        this.showRecordingIndicator();
        break;

      case 'hungup':
        stateLabel.textContent = 'Hung Up';
        stateLabel.style.color = '#ef4444'; // Red color
        // Transform back to call button when hung up
        this.transformToCallButton();
        // Hide recording indicator
        this.hideRecordingIndicator();
        break;

      case 'idle':
      default:
        stateLabel.textContent = message || 'Call from';
        stateLabel.style.color = 'var(--text-secondary)';
        // Transform back to call button when idle
        this.transformToCallButton();
        // Hide recording indicator
        this.hideRecordingIndicator();
        break;
    }
  }

  showRecordingIndicator() {
    const recordToggle = document.getElementById('record-call-toggle');
    const recordIcon = document.getElementById('record-icon');

    // Only show indicator if recording is enabled
    if (!recordToggle || !recordToggle.checked || !recordIcon) return;

    // Add pulsing red dot to the center of the icon
    const existingDot = document.getElementById('recording-dot');
    if (existingDot) return; // Already showing

    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('id', 'recording-dot');
    dot.setAttribute('cx', '12');
    dot.setAttribute('cy', '12');
    dot.setAttribute('r', '3');
    dot.setAttribute('fill', '#ef4444');

    // Add pulse animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes recording-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
      #recording-dot {
        animation: recording-pulse 1.5s ease-in-out infinite;
      }
    `;
    if (!document.getElementById('recording-pulse-style')) {
      style.id = 'recording-pulse-style';
      document.head.appendChild(style);
    }

    recordIcon.appendChild(dot);
    console.log('🔴 Recording indicator shown');
  }

  hideRecordingIndicator() {
    const dot = document.getElementById('recording-dot');
    if (dot) {
      dot.remove();
      console.log('⚫ Recording indicator hidden');
    }
  }

  async searchContacts(query) {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, phone_number')
        .eq('user_id', this.userId)
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone_number.ilike.%${query}%`)
        .limit(5);

      if (error) {
        console.error('Error searching contacts:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Failed to search contacts:', error);
      return [];
    }
  }

  async showRecentNumbers(suggestionsEl, searchInput, onSelectCallback) {
    try {
      // Fetch user's service numbers to exclude them
      const { data: serviceNumbers, error: serviceError } = await supabase
        .from('service_numbers')
        .select('phone_number')
        .eq('user_id', this.userId);

      if (serviceError) {
        console.error('Error fetching service numbers:', serviceError);
      }

      const userNumbers = new Set(
        (serviceNumbers || []).map(sn => sn.phone_number)
      );

      // Fetch recent call records (both inbound and outbound)
      const { data, error } = await supabase
        .from('call_records')
        .select('caller_number, contact_phone, direction, started_at')
        .eq('user_id', this.userId)
        .order('started_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error fetching recent numbers:', error);
        return;
      }

      if (!data || data.length === 0) {
        suggestionsEl.style.display = 'none';
        return;
      }

      // Extract unique phone numbers (excluding user's service numbers)
      const seenNumbers = new Set();
      const recentNumbers = [];

      for (const record of data) {
        // For outbound calls, use contact_phone (the number we called)
        // For inbound calls, use caller_number (the number that called us)
        const phoneNumber = record.direction === 'outbound'
          ? record.contact_phone
          : record.caller_number;

        // Skip if it's a user's service number or already seen
        if (phoneNumber && !userNumbers.has(phoneNumber) && !seenNumbers.has(phoneNumber)) {
          seenNumbers.add(phoneNumber);
          recentNumbers.push({
            phone: phoneNumber,
            direction: record.direction,
            date: new Date(record.started_at)
          });

          if (recentNumbers.length >= 10) break; // Limit to 10 recent numbers
        }
      }

      if (recentNumbers.length === 0) {
        suggestionsEl.style.display = 'none';
        return;
      }

      // Display recent numbers
      suggestionsEl.innerHTML = `
        <div style="padding: 0.5rem 0.75rem; font-size: 0.75rem; color: var(--text-secondary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">
          Recent Numbers
        </div>
        ${recentNumbers.map(item => `
          <div class="contact-suggestion" data-phone="${item.phone}" style="
            padding: 0.75rem;
            cursor: pointer;
            border-bottom: 1px solid var(--border-color);
            transition: background 0.15s;
          " onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='transparent'">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 600; color: var(--text-primary);">
                  ${this.formatPhoneNumber(item.phone)}
                </div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">
                  ${item.direction === 'outbound' ? '↗ Outbound' : '↙ Inbound'} • ${this.formatRelativeTime(item.date)}
                </div>
              </div>
            </div>
          </div>
        `).join('')}
      `;
      suggestionsEl.style.display = 'block';

      // Add click handlers
      suggestionsEl.querySelectorAll('.contact-suggestion').forEach(suggestion => {
        suggestion.addEventListener('click', () => {
          const phone = suggestion.dataset.phone;
          searchInput.value = phone;
          suggestionsEl.style.display = 'none';
          onSelectCallback();
        });
      });
    } catch (error) {
      console.error('Failed to show recent numbers:', error);
    }
  }

  formatRelativeTime(date) {
    try {
      if (!date) return '';
      const dateObj = date instanceof Date ? date : new Date(date);
      if (!dateObj || typeof dateObj.getTime !== 'function') return '';
      if (isNaN(dateObj.getTime())) return '';

      const now = new Date();
      const diffMs = now - dateObj;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      if (typeof dateObj.toLocaleDateString !== 'function') return '';
      return dateObj.toLocaleDateString();
    } catch (err) {
      console.error('formatRelativeTime error:', err);
      return '';
    }
  }

  async requestMicrophoneAndInitializeSIP() {
    try {
      // First check if permission is already blocked
      let isBlocked = false;
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
        isBlocked = permissionStatus.state === 'denied';
        console.log('🎤 Microphone permission state:', permissionStatus.state);
      } catch (e) {
        console.log('Could not check permission status:', e);
      }

      if (isBlocked) {
        // Show instructions to unblock
        await showAlertModal('Microphone Blocked', 'To enable calling:\n\n1. Look at your browser address bar\n2. Click the camera/lock icon on the left side\n3. Find "Microphone" and change it to "Allow"\n4. Refresh this page\n5. Try again');
        this.updateSIPStatus('error', 'Mic blocked');
        return;
      }

      // Show a custom prompt asking user to grant microphone access
      const promptModal = document.createElement('div');
      promptModal.id = 'mic-permission-modal';
      promptModal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      `;

      promptModal.innerHTML = `
        <div style="
          background: var(--bg-primary);
          border-radius: 12px;
          padding: 2rem;
          max-width: 400px;
          margin: 1rem;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        ">
          <div style="text-align: center; margin-bottom: 1.5rem;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">🎤</div>
            <h2 style="margin: 0 0 0.5rem 0; font-size: 1.5rem; color: var(--text-primary);">Microphone Access Required</h2>
            <p style="margin: 0; color: var(--text-secondary); line-height: 1.5;">
              We need access to your microphone to make calls.
              Your browser will ask for permission.
            </p>
          </div>
          <div style="display: flex; gap: 1rem;">
            <button id="allow-mic-btn" style="
              flex: 1;
              background: linear-gradient(135deg, #6366f1, #8b5cf6);
              color: white;
              border: none;
              border-radius: 8px;
              padding: 0.75rem 1.5rem;
              font-size: 1rem;
              font-weight: 600;
              cursor: pointer;
            ">Allow Microphone</button>
            <button id="cancel-mic-btn" style="
              background: var(--bg-secondary);
              color: var(--text-secondary);
              border: 1px solid var(--border-color);
              border-radius: 8px;
              padding: 0.75rem 1rem;
              font-size: 1rem;
              cursor: pointer;
            ">Cancel</button>
          </div>
        </div>
      `;

      document.body.appendChild(promptModal);

      // Wait for user to click Allow or Cancel
      const userChoice = await new Promise((resolve) => {
        document.getElementById('allow-mic-btn').addEventListener('click', () => resolve('allow'));
        document.getElementById('cancel-mic-btn').addEventListener('click', () => resolve('cancel'));
      });

      promptModal.remove();

      if (userChoice === 'cancel') {
        this.updateSIPStatus('error', 'Cancelled');
        return;
      }

      // Request microphone permission
      console.log('🎤 Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      console.log('✅ Microphone access granted');

      // Stop the stream immediately - we just needed permission
      stream.getTracks().forEach(track => track.stop());

      // Now initialize SIP client
      await this.initializeSIPClient();
    } catch (error) {
      console.error('❌ Microphone access error:', error);
      this.updateSIPStatus('error', 'Mic denied');

      if (error.name === 'NotAllowedError') {
        showAlertModal('Microphone Denied', 'The browser denied microphone access.\n\nTry:\n1. Click the lock/camera icon in the address bar\n2. Reset permissions for this site\n3. Refresh and try again');
      } else {
        showAlertModal('Microphone Error', `${error.name}: ${error.message}`);
      }
    }
  }

  async initializeSIPClient() {
    const sipLed = document.getElementById('sip-led');
    const sipStatusText = document.getElementById('sip-status-text');

    if (!sipLed || !sipStatusText) return;

    // Load SIP client on demand
    sipClient = await loadSipClient();

    // Set to connecting state
    this.updateSIPStatus('connecting');

    try {
      // Get SIP credentials from user record
      const { data: userRecord, error: userError } = await supabase
        .from('users')
        .select('sip_username, sip_password, sip_realm, sip_ws_server')
        .eq('id', this.userId)
        .single();

      if (userError || !userRecord) {
        this.updateSIPStatus('error', 'No SIP endpoint');
        return;
      }

      if (!userRecord.sip_username || !userRecord.sip_password) {
        this.updateSIPStatus('error', 'Not configured');
        return;
      }

      // Build SIP URI from user record
      const sipUri = `sip:${userRecord.sip_username}@${userRecord.sip_realm}`;

      // Initialize SIP client
      await sipClient.initialize({
        sipUri,
        sipPassword: userRecord.sip_password,
        wsServer: userRecord.sip_ws_server,
        displayName: 'AI Assistant',
      });

      this.updateSIPStatus('registered');
    } catch (error) {
      console.error('SIP initialization failed:', error);
      this.updateSIPStatus('error', error.message);
    }
  }

  updateSIPStatus(status, message = '') {
    const sipLed = document.getElementById('sip-led');
    const sipStatusText = document.getElementById('sip-status-text');

    if (!sipLed || !sipStatusText) return;

    switch (status) {
      case 'connecting':
        sipLed.style.background = '#6b7280';
        sipLed.style.boxShadow = '0 0 4px rgba(107, 116, 128, 0.5)';
        sipStatusText.textContent = 'Connecting...';
        sipStatusText.style.color = 'var(--text-secondary)';
        break;
      case 'registered':
        sipLed.style.background = '#10b981';
        sipLed.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.8)';
        sipStatusText.textContent = 'Ready';
        sipStatusText.style.color = '#10b981';
        break;
      case 'error':
        sipLed.style.background = '#ef4444';
        sipLed.style.boxShadow = '0 0 8px rgba(239, 68, 68, 0.8)';
        sipStatusText.textContent = message || 'Error';
        sipStatusText.style.color = '#ef4444';
        break;
    }
  }

  async loadServiceNumbers() {
    const callerIdSelect = document.getElementById('caller-id-select');
    if (!callerIdSelect) return;

    try {
      const { data: serviceNumbers, error } = await supabase
        .from('service_numbers')
        .select('id, phone_number, friendly_name, is_active')
        .eq('user_id', this.userId)
        .eq('is_active', true)
        .order('purchased_at', { ascending: false });

      if (error) {
        console.error('Error loading service numbers:', error);
        callerIdSelect.innerHTML = '<option value="+10000000000">Test Number (No active numbers)</option>';
        return;
      }

      if (!serviceNumbers || serviceNumbers.length === 0) {
        callerIdSelect.innerHTML = '<option value="+10000000000">Test Number (No active numbers)</option>';
        return;
      }

      // Populate dropdown with service numbers
      callerIdSelect.innerHTML = serviceNumbers.map((number, index) => {
        const flag = this.getCountryFlag(number.phone_number);
        const formattedNumber = this.formatPhoneNumber(number.phone_number);
        return `<option value="${number.phone_number}" ${index === 0 ? 'selected' : ''}>
          ${flag} ${formattedNumber}
        </option>`;
      }).join('');
    } catch (error) {
      console.error('Failed to load service numbers:', error);
      callerIdSelect.innerHTML = '<option value="+10000000000">Test Number (Error loading)</option>';
    }
  }

  getCountryFlag(phoneNumber) {
    // Normalize phone number
    const cleaned = phoneNumber.replace(/\D/g, '');

    // Check area code for US vs Canada
    if (cleaned.startsWith('1')) {
      const areaCode = cleaned.substring(1, 4);
      // Canadian area codes
      const canadianAreaCodes = ['204', '226', '236', '249', '250', '289', '306', '343', '365', '403', '416', '418', '431', '437', '438', '450', '506', '514', '519', '579', '581', '587', '604', '613', '639', '647', '672', '705', '709', '778', '780', '782', '807', '819', '825', '867', '873', '902', '905'];

      if (canadianAreaCodes.includes(areaCode)) {
        return '🇨🇦'; // Canada flag
      }
      return '🇺🇸'; // US flag
    }

    // Default to globe for unknown
    return '🌍';
  }

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
  }

  attachEventListeners() {
    this.attachConversationListeners();
    this.attachFilterListeners();
    this.attachSearchListener();
    this.attachFilterToggleListener();
    this.attachEditToggleListener();

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
  }

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

          // Re-render conversation list
          const conversationsEl = document.getElementById('conversations');
          if (conversationsEl) {
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
  }

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
  }

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
  }

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
  }

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
  }

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
  }

  refreshConversationList() {
    const conversationsEl = document.getElementById('conversations');
    if (conversationsEl) {
      // Remove delegated flag so listeners get re-attached
      delete conversationsEl.dataset.delegated;
      conversationsEl.innerHTML = this.renderConversationList();
      this.attachConversationListeners();
    }
  }

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
          const conversationsEl = document.getElementById('conversations');
          if (conversationsEl) {
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
        const conversationsEl = document.getElementById('conversations');
        if (conversationsEl) {
          conversationsEl.innerHTML = this.renderConversationList();
          this.attachConversationListeners();
        }
      });
    }
  }

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

      // Re-render conversation list
      const conversationsEl = document.getElementById('conversations');
      if (conversationsEl) {
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
  }

  updateFilterButtonStates() {
    const allBtn = document.querySelector('[data-filter-reset]');
    const callsBtn = document.querySelector('[data-filter-type="calls"]');
    const textsBtn = document.querySelector('[data-filter-type="texts"]');
    const inBtn = document.querySelector('[data-filter-direction="inbound"]');
    const outBtn = document.querySelector('[data-filter-direction="outbound"]');
    const missedBtn = document.querySelector('[data-filter-missed]');
    const unreadBtn = document.querySelector('[data-filter-unread]');
    const positiveBtn = document.querySelector('[data-filter-sentiment="positive"]');
    const neutralBtn = document.querySelector('[data-filter-sentiment="neutral"]');
    const negativeBtn = document.querySelector('[data-filter-sentiment="negative"]');

    // Reset all
    [allBtn, callsBtn, textsBtn, inBtn, outBtn, missedBtn, unreadBtn, positiveBtn, neutralBtn, negativeBtn].forEach(b => b?.classList.remove('active'));

    // Set active states
    const isAllClear = this.typeFilter === 'all' && this.directionFilter === 'all' && !this.missedFilter && !this.unreadFilter && this.sentimentFilter === 'all';
    if (isAllClear) {
      allBtn?.classList.add('active');
    } else {
      if (this.typeFilter === 'calls') callsBtn?.classList.add('active');
      if (this.typeFilter === 'texts') textsBtn?.classList.add('active');
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
  }

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
      });
    }
  }

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
          }
          // Future actions: bulk-message, bulk-agent-message
        });
      });
    }
  }

  attachConversationListeners() {
    // Use event delegation - single listener on parent instead of one per item
    // This dramatically improves mobile scroll performance
    const conversationsEl = document.getElementById('conversations');
    if (!conversationsEl || conversationsEl.dataset.delegated) return;

    // Mark as delegated to prevent duplicate listeners
    conversationsEl.dataset.delegated = 'true';

    // Attach swipe handlers for mobile
    this.attachSwipeHandlers(conversationsEl);

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

      // Handle copy call ID button click
      const copyBtn = e.target.closest('.copy-call-id-btn');
      if (copyBtn) {
        e.preventDefault();
        e.stopPropagation();
        const callId = copyBtn.dataset.callId;
        if (callId) {
          navigator.clipboard.writeText(callId).then(() => {
            // Show brief feedback
            const originalHtml = copyBtn.innerHTML;
            copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            copyBtn.style.color = 'var(--success-color)';
            setTimeout(() => {
              copyBtn.innerHTML = originalHtml;
              copyBtn.style.color = '';
            }, 1500);
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
      } else {
        // Handle SMS conversation click
        this.selectedContact = item.dataset.phone;
        this.selectedServiceNumber = item.dataset.serviceNumber;
        this.selectedCallId = null;
        this.selectedChatSessionId = null;

        // Save as last selected for next page load
        localStorage.setItem('inbox_last_selected_contact', this.selectedContact);
        localStorage.setItem('inbox_last_selected_service_number', this.selectedServiceNumber);
        localStorage.removeItem('inbox_last_selected_call');
        localStorage.removeItem('inbox_last_selected_chat');

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
  }

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
  }

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
  }

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
  }

  loadHiddenConversations() {
    // Load hidden conversations from localStorage
    const hidden = JSON.parse(localStorage.getItem('hiddenConversations') || '[]');
    this.hiddenConversations = new Set(hidden);
  }

  unhideConversation(convKey) {
    // Remove from hidden set
    this.hiddenConversations.delete(convKey);

    // Update localStorage
    const hidden = JSON.parse(localStorage.getItem('hiddenConversations') || '[]');
    const updated = hidden.filter(k => k !== convKey);
    localStorage.setItem('hiddenConversations', JSON.stringify(updated));
  }

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
  }

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
            const originalHtml = copyBtn.innerHTML;
            copyBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            copyBtn.style.color = 'var(--success-color)';
            setTimeout(() => {
              copyBtn.innerHTML = originalHtml;
              copyBtn.style.color = '';
            }, 1500);
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
  }

  attachMessageInputListeners() {
    const input = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const sendChatBtn = document.getElementById('send-chat-btn');

    console.log('Attaching message input listeners', { input, sendButton, sendChatBtn });

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

  }

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
        const timestamp = new Date(msg.created_at);

        return `
          <div class="message-bubble ${isVisitor ? 'inbound' : 'outbound'} ${isAI ? 'ai-message' : ''}" data-message-id="${msg.id}">
            ${isAI ? `
              <div class="ai-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="10" rx="2"></rect>
                  <circle cx="8" cy="16" r="1"></circle>
                  <circle cx="16" cy="16" r="1"></circle>
                  <path d="M9 7h6"></path>
                  <path d="M12 7v4"></path>
                </svg>
              </div>
            ` : ''}
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
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

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
  }

  parseTranscript(transcript) {
    if (!transcript) return [];

    // Parse transcript in "Speaker: Message" format
    // Caller/User = left side (caller)
    // Any other name = right side (agent with custom name like "Amy", "Maggie", etc.)
    const lines = transcript.split('\n').filter(line => line.trim().length > 0);
    const messages = [];

    for (const line of lines) {
      // Match any speaker label at the start (up to 20 chars before colon)
      const match = line.match(/^([^:]{1,20}):\s*(.+)$/);
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
  }

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
  }

  formatSentiment(sentiment) {
    const sentimentMap = {
      'positive': 'Positive',
      'neutral': 'Neutral',
      'negative': 'Negative'
    };
    return sentimentMap[sentiment.toLowerCase()] || sentiment;
  }

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
          <div class="message-bubble outbound" data-message-id="${msgId}">
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
  }

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
  }
}