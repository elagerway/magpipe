/**
 * Inbox Page - Modern Messaging UI
 */

import { getCurrentUser, supabase } from '../../lib/supabase.js';
import { renderBottomNav, clearUnreadBadge, setPhoneNavActive, resetInboxManagedCount, markAsRead, recalculateUnreads } from '../../components/BottomNav.js';
import { markAllAsRead as markAllReadService, recalculateUnreads as refreshUnreadBadge } from '../../services/unreadService.js';
import { showDeleteConfirmModal, showAlertModal } from '../../components/ConfirmModal.js';
import { showToast } from '../../lib/toast.js';
import { User, ChatSession } from '../../models/index.js';
import { loadVoiceRecognition } from './voice-loader.js';

import { viewsMethods } from './views.js';
import { messagingMethods } from './messaging.js';
import { callInterfaceMethods } from './call-interface.js';
import { listenersMethods } from './listeners.js';

class InboxPage {
  constructor() {
    this.conversations = [];
    this.selectedContact = null;
    this.selectedServiceNumber = null; // Which of our numbers the conversation is on
    this.selectedCallId = null;
    this.selectedChatSessionId = null; // For chat conversations
    this.selectedEmailThreadId = null; // For email conversations
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
    this.displayLimit = 20; // Render-window pagination: how many conversations to show
    this.DISPLAY_PAGE_SIZE = 20; // How many more to load on scroll
  }

  /**
   * Check if translate links should be shown for a given service number.
   * Returns false when the agent language already matches the translate target
   * (e.g. English agent + English owner = no need to translate).
   */
  shouldShowTranslate(serviceNumber) {
    if (!this.translateTo) return false;
    const agentLang = serviceNumber ? this.serviceNumberLanguages?.[serviceNumber] : null;
    // If we don't know the agent language, default to showing translate
    if (!agentLang) return true;
    // Multi-language agents always need translate
    if (agentLang === 'multi') return true;
    // Compare base language (e.g. 'en-US' → 'en') to translate target
    const baseLang = agentLang.split('-')[0].toLowerCase();
    const targetLang = this.translateTo.includes('-') ? this.translateTo.split('-').pop() : this.translateTo;
    return baseLang !== targetLang;
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

    // Inject spin keyframes for syncing badge
    if (!document.getElementById('inbox-spin-style')) {
      const spinStyle = document.createElement('style');
      spinStyle.id = 'inbox-spin-style';
      spinStyle.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } @keyframes skeleton-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`;
      document.head.appendChild(spinStyle);
    }

    this.userId = user.id;

    // Load hidden conversations from localStorage
    this.loadHiddenConversations();
    if (this.hiddenConversations.size > 0) {
      console.log('Hidden conversations loaded:', Array.from(this.hiddenConversations));
    }

    const now = Date.now();
    const needsFetch = this.conversations.length === 0 || (now - this.lastFetchTime) > 30000;
    const appElement = document.getElementById('app');

    if (needsFetch) {
      // Render shell immediately with skeleton conversation list — don't block on data
      appElement.innerHTML = this._renderInboxShell(true);
      requestAnimationFrame(() => {
        this.attachEventListeners();
        setTimeout(() => this.subscribeToMessages(), 100);
      });

      // Fetch data in background
      await Promise.all([
        User.getProfile(user.id),
        this.loadConversations(user.id).then(() => { this.lastFetchTime = Date.now(); }),
      ]);

      // Apply deep-link / restore selection now that data is ready
      this._applyInitialSelection();

      // Update conversation list
      const conversationsEl = document.getElementById('conversations');
      if (conversationsEl) {
        conversationsEl.innerHTML = this.renderConversationList();
        this.attachConversationListeners();
      }

      // Update message thread if selection resolved
      if (this.selectedContact || this.selectedCallId || this.selectedChatSessionId || this.selectedEmailThreadId) {
        const messageThreadEl = document.getElementById('message-thread');
        if (messageThreadEl) {
          messageThreadEl.innerHTML = this.renderMessageThread();
        }
      }
    } else {
      // Data already cached — apply selection (handles URL deep-links) then render
      this._applyInitialSelection();
      appElement.innerHTML = this._renderInboxShell(false);
      requestAnimationFrame(() => {
        this.attachEventListeners();
        setTimeout(() => this.subscribeToMessages(), 100);
      });
    }

    refreshUnreadBadge();


    // Refresh conversations when tab becomes visible (catches missed realtime events)
    this._visibilityHandler = async () => {
      if (!document.hidden && this.userId) {
        const timeSinceLastFetch = Date.now() - (this.lastFetchTime || 0);
        if (timeSinceLastFetch > 10000) { // Only if >10s since last fetch
          await this.loadConversations(this.userId);
          this.lastFetchTime = Date.now();
          const conversationsEl = document.getElementById('conversations');
          if (conversationsEl) {
            conversationsEl.innerHTML = this.renderConversationList();
            this.attachConversationListeners();
          }
        }
      }
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);

    // Expose showCallInterface globally for phone nav button
    window.showDialpad = () => this.showCallInterface();

    // Handle deferred contact open from deep-link (needs DOM to be ready)
    if (this._pendingContactOpen) {
      const contactNumber = this._pendingContactOpen;
      this._pendingContactOpen = null;
      this.openNewConversation(contactNumber);
    }

    // Scroll the deep-linked conversation into view in the sidebar
    if (this._deepLinkUsed) {
      this._deepLinkUsed = false;
      requestAnimationFrame(() => {
        const selected = document.querySelector('.conversation-item.selected');
        if (selected) {
          selected.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      });
    }
  }

  openNewConversation(phoneNumber, serviceNumber = null) {
    console.log('openNewConversation called with:', phoneNumber, 'service:', serviceNumber);

    // Set the selected contact and show the message input
    this.selectedContact = phoneNumber;
    this.selectedCallId = null;
    this.selectedEmailThreadId = null;

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
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'email_messages'
      }, (payload) => {
        console.log('📧 Email realtime event:', payload.new?.direction, payload.new?.user_id);
        if (payload.new?.user_id === this.userId) {
          console.log('📧 New email received in inbox');
          this.handleNewEmailMessage(payload.new);
        }
      })
      .subscribe((status) => {
        console.log('Inbox subscription status:', status);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('⚠️ Inbox realtime disconnected, reconnecting in 5s...');
          setTimeout(() => this.subscribeToMessages(), 5000);
        }
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
    console.log('Handling call update:', call.id, call.status);

    const isCurrentCall = this.selectedCallId === call.id;

    // Update the call in our local conversations array (avoid full reload)
    const convIndex = this.conversations?.findIndex(c => c.type === 'call' && c.callId === call.id);
    if (convIndex !== -1 && convIndex !== undefined) {
      this.conversations[convIndex].call = call;
      this.conversations[convIndex].lastActivity = call.ended_at || call.started_at || call.created_at;
    }

    // Update conversation list sidebar
    const conversationsEl = document.getElementById('conversations');
    if (conversationsEl) {
      conversationsEl.innerHTML = this.renderConversationList();
      this.attachConversationListeners();
    }

    // If viewing this call, update the thread (but not during audio playback)
    if (isCurrentCall) {
      const audioPlaying = document.querySelector('#thread-messages audio');
      const isPlaying = audioPlaying && !audioPlaying.paused;
      if (!isPlaying) {
        const threadElement = document.getElementById('message-thread');
        if (threadElement) {
          threadElement.innerHTML = this.renderMessageThread();
        }
      }
    }

    // Auto-sync recordings when a call completes (only if actually pending)
    if (call.status === 'completed' && this.callHasPendingRecordings(call)) {
      console.log('📥 Call completed, auto-syncing recordings for', call.id);
      this.syncPendingRecordings(call.id);
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

  async handleNewEmailMessage(emailMsg) {
    // Find existing email thread
    const conv = this.conversations.find(c =>
      c.type === 'email' && c.emailThreadId === emailMsg.thread_id
    );

    if (!conv) {
      // New thread, reload conversations
      await this.loadConversations(this.userId);
      const conversationsEl = document.getElementById('conversations');
      if (conversationsEl) {
        conversationsEl.innerHTML = this.renderConversationList();
        this.attachConversationListeners();
      }
      return;
    }

    // Add message to existing thread
    const exists = conv.messages.some(m => m.id === emailMsg.id);
    if (!exists) {
      conv.messages.push(emailMsg);
      conv.lastMessage = emailMsg.body_text || emailMsg.subject || 'Email';
      conv.lastActivity = new Date(emailMsg.sent_at || emailMsg.created_at);
      if (emailMsg.subject) conv.subject = emailMsg.subject;

      if (emailMsg.direction === 'inbound') {
        conv.unreadCount = (conv.unreadCount || 0) + 1;
        refreshUnreadBadge(this.userId);
      }
    }

    // Update conversation list
    const conversationsEl = document.getElementById('conversations');
    if (conversationsEl) {
      conversationsEl.innerHTML = this.renderConversationList();
      this.attachConversationListeners();
    }

    // If viewing this email thread, reload
    if (this.selectedEmailThreadId === emailMsg.thread_id) {
      const threadElement = document.getElementById('message-thread');
      if (threadElement) {
        threadElement.innerHTML = this.renderMessageThread();
        setTimeout(() => {
          const threadMessages = document.getElementById('thread-messages');
          if (threadMessages) threadMessages.scrollTop = threadMessages.scrollHeight;
        }, 50);
      }
    }
  }

  cleanup() {
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = null;
    }
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
    if (this.scrollObserver) {
      this.scrollObserver.disconnect();
      this.scrollObserver = null;
    }
    // Clear any pending recording refresh timers
    if (this._recordingRefreshTimers) {
      for (const timer of this._recordingRefreshTimers.values()) {
        clearTimeout(timer);
      }
      this._recordingRefreshTimers.clear();
    }
    if (this._recordingRetryCount) this._recordingRetryCount.clear();
    if (this._syncingCallIds) this._syncingCallIds.clear();
    // Reset the flag so BottomNav can track unread count again
    resetInboxManagedCount();
  }

  async loadConversations(userId) {
    // Load all data in parallel for speed
    const [messagesResult, callsResult, contactsResult, chatSessionsResult, agentConfigsResult, serviceNumbersResult, emailResult] = await Promise.all([
      supabase.from('sms_messages').select('id, user_id, sender_number, recipient_number, content, sent_at, created_at, direction, status, sentiment').eq('user_id', userId).order('sent_at', { ascending: false }).limit(500),
      supabase.from('call_records').select('id, user_id, caller_number, contact_phone, started_at, ended_at, duration, direction, status, recording_url, transcript, call_summary, user_sentiment, service_number, agent_id, created_at').eq('user_id', userId).order('started_at', { ascending: false }).limit(300),
      supabase.from('contacts').select('id, user_id, name, phone_number, email, first_name, last_name, company, avatar_url').eq('user_id', userId),
      ChatSession.getRecentWithPreview(userId, 50),
      supabase.from('agent_configs').select('id, translate_to, language').eq('user_id', userId),
      supabase.from('service_numbers').select('phone_number, agent_id, text_agent_id').eq('user_id', userId).eq('is_active', true),
      supabase.from('email_messages').select('*').eq('user_id', userId).order('sent_at', { ascending: false }).limit(500),
    ]);

    // Log any query errors (these were previously silently swallowed)
    if (messagesResult.error) console.error('SMS query error:', messagesResult.error);
    if (callsResult.error) console.error('Calls query error:', callsResult.error);
    if (contactsResult.error) console.error('Contacts query error:', contactsResult.error);
    if (chatSessionsResult.error) console.error('Chat sessions error:', chatSessionsResult.error);
    if (agentConfigsResult.error) console.error('Agent configs error:', agentConfigsResult.error);
    if (serviceNumbersResult.error) console.error('Service numbers error:', serviceNumbersResult.error);
    if (emailResult.error) console.error('Email query error:', emailResult.error);

    const messages = messagesResult.data;
    const calls = callsResult.data;
    const contacts = contactsResult.data;
    const chatSessions = chatSessionsResult.sessions || [];
    const emailMessages = emailResult.data || [];

    // Build agent configs map and service number → agent language mapping
    const agentConfigs = agentConfigsResult.data || [];
    const agentConfigMap = {};
    agentConfigs.forEach(ac => { agentConfigMap[ac.id] = ac; });

    // Map service numbers to their agent's language
    // For SMS context, prefer text_agent_id language when available
    this.serviceNumberLanguages = {};
    const serviceNumbers = serviceNumbersResult.data || [];
    serviceNumbers.forEach(sn => {
      const smsAgentId = sn.text_agent_id || sn.agent_id;
      if (smsAgentId && agentConfigMap[smsAgentId]) {
        this.serviceNumberLanguages[sn.phone_number] = agentConfigMap[smsAgentId].language || 'en-US';
      }
    });

    // Check if any agent has translate_to configured
    const translateConfigs = agentConfigs.filter(ac => ac.translate_to);
    this.translateTo = translateConfigs.length > 0 ? translateConfigs[0].translate_to : null;

    // Create a map of phone number to contact for quick lookup
    this.contactsMap = {};
    this.contactsEmailMap = {};
    contacts?.forEach(contact => {
      if (contact.phone_number) {
        this.contactsMap[contact.phone_number] = contact;
      }
      if (contact.email) {
        this.contactsEmailMap[contact.email.toLowerCase()] = contact;
      }
    });

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
      const duration = this.calculateTotalDuration(call);
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

    // Group email messages by thread_id
    const emailGrouped = {};
    emailMessages?.forEach(em => {
      if (!emailGrouped[em.thread_id]) {
        // Determine the "other party" email (not us)
        const otherEmail = em.direction === 'inbound' ? em.from_email : em.to_email;
        emailGrouped[em.thread_id] = {
          type: 'email',
          emailThreadId: em.thread_id,
          email: otherEmail,
          fromName: em.direction === 'inbound' ? em.from_name : null,
          subject: em.subject,
          messages: [],
          lastActivity: new Date(em.sent_at || em.created_at || Date.now()),
          lastMessage: em.body_text || em.subject || 'Email',
          unreadCount: 0,
          agentId: em.agent_id,
        };
      }
      emailGrouped[em.thread_id].messages.push(em);

      // Track unread inbound emails
      const convKey = `email_${em.thread_id}`;
      if (em.direction === 'inbound' && !em.is_read) {
        const lastViewedKey = `conversation_last_viewed_email_${em.thread_id}`;
        const lastViewed = localStorage.getItem(lastViewedKey);
        const msgDate = new Date(em.sent_at || em.created_at || Date.now());
        const isNew = !lastViewed || msgDate > new Date(lastViewed);
        if (isNew) {
          emailGrouped[em.thread_id].unreadCount++;
        }
      }

      // Capture fromName from any inbound message if not set yet
      if (!emailGrouped[em.thread_id].fromName && em.direction === 'inbound' && em.from_name) {
        emailGrouped[em.thread_id].fromName = em.from_name;
      }

      const msgDate = new Date(em.sent_at || em.created_at || Date.now());
      if (msgDate > emailGrouped[em.thread_id].lastActivity) {
        emailGrouped[em.thread_id].lastActivity = msgDate;
        emailGrouped[em.thread_id].lastMessage = em.body_text || em.subject || 'Email';
        emailGrouped[em.thread_id].subject = em.subject || emailGrouped[em.thread_id].subject;
        if (em.direction === 'inbound' && em.from_name) {
          emailGrouped[em.thread_id].fromName = em.from_name;
        }
      }
    });

    // Sort email messages within each thread (oldest first)
    Object.values(emailGrouped).forEach(conv => {
      conv.messages.sort((a, b) => new Date(a.sent_at || a.created_at) - new Date(b.sent_at || b.created_at));
    });

    conversationsList.push(...Object.values(emailGrouped));

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
        // For email, check if there's recent inbound email
        const hasRecentEmail = conv.type === 'email' && conv.messages?.some(m =>
          m.direction === 'inbound' && new Date(m.sent_at || m.created_at) > twentyFourHoursAgo
        );

        if (hasRecentInbound || isRecentCall || hasRecentChat || hasRecentEmail) {
          console.log('Auto-unhiding conversation with recent activity:', convKey);
          this.unhideConversation(convKey);
        }
      }
    });

    // Auto-sync recordings for calls that still need data
    this.conversations.forEach(conv => {
      if (conv.type !== 'call') return;
      if (this.callHasPendingRecordings(conv.call)) {
        console.log('📥 Found call with pending data:', conv.callId, conv.call?.status);
        this.syncPendingRecordings(conv.callId);
      }
    });

    // Badge is updated by refreshUnreadBadge() in render()
  }

  // Apply deep-link URL params or restore last selected conversation
  _applyInitialSelection() {
    // Check for deep-link parameters in URL (take priority over saved selection)
    const urlParams = new URLSearchParams(window.location.search);
    const deepLinkCallId = urlParams.get('call');
    const deepLinkSmsPhone = urlParams.get('sms');
    const deepLinkSmsService = urlParams.get('service');
    const deepLinkContact = urlParams.get('contact');

    if (deepLinkCallId) {
      window.history.replaceState({}, '', '/inbox');
      const callConv = this.conversations.find(c => c.type === 'call' && c.callId === deepLinkCallId);
      if (callConv) {
        this.selectedCallId = deepLinkCallId;
        this.selectedContact = null;
        this.selectedServiceNumber = null;
        this.selectedChatSessionId = null;
        this.selectedEmailThreadId = null;
        this._deepLinkUsed = true;
      }
    } else if (deepLinkSmsPhone) {
      window.history.replaceState({}, '', '/inbox');
      const smsConv = this.conversations.find(c => c.type === 'sms' && c.phone === deepLinkSmsPhone && (!deepLinkSmsService || c.serviceNumber === deepLinkSmsService));
      if (smsConv) {
        this.selectedContact = smsConv.phone;
        this.selectedServiceNumber = smsConv.serviceNumber;
        this.selectedCallId = null;
        this.selectedChatSessionId = null;
        this.selectedEmailThreadId = null;
        this._deepLinkUsed = true;
      }
    } else if (deepLinkContact) {
      window.history.replaceState({}, '', '/inbox');
      this._pendingContactOpen = deepLinkContact;
    }

    // Only apply default selection logic if no deep-link and no current selection
    const hasDeepLink = deepLinkCallId || deepLinkSmsPhone || deepLinkContact;
    const hasSelection = this.selectedContact || this.selectedCallId || this.selectedChatSessionId || this.selectedEmailThreadId;

    if (!hasDeepLink && !hasSelection) {
      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        // Clear selection on mobile (no item highlighted on first view)
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
    }
  }

  // Render the full inbox shell. showSkeleton=true shows pulsing placeholder rows
  // in #conversations instead of the real list (used while data is loading).
  _renderInboxShell(showSkeleton) {
    return `
      <div class="inbox-container">
        <!-- Conversation List Sidebar -->
        <div class="conversation-list" id="conversation-list">
          <div class="inbox-header" style="position: relative; margin-top: -4px;">
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
              <button class="dropdown-item" data-action="new-email" style="
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
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                <span>Email</span>
              </button>
              <button class="dropdown-item" data-action="agent-email" style="
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
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                  <circle cx="19" cy="5" r="4" fill="var(--primary-color)" stroke="var(--primary-color)"></circle>
                  <text x="19" y="7" text-anchor="middle" font-size="6" fill="white" font-weight="bold">AI</text>
                </svg>
                <span>Agent Email</span>
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
              <button class="inbox-filter-btn ${this.typeFilter === 'email' ? 'active' : ''}" data-filter-type="email">Email</button>
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
            ${showSkeleton ? this._renderConversationSkeleton() : this.renderConversationList()}
          </div>
        </div>

        <!-- Message Thread -->
        <div class="message-thread" id="message-thread">
          ${(this.selectedContact || this.selectedCallId || this.selectedChatSessionId || this.selectedEmailThreadId) ? this.renderMessageThread() : this.renderEmptyState()}
        </div>
      </div>
      ${renderBottomNav('/inbox')}
    `;
  }

  // Returns 6 pulsing placeholder rows shown while conversations are loading
  _renderConversationSkeleton() {
    const row = `
      <div style="display: flex; align-items: center; gap: 0.75rem; padding: 0.625rem 0.75rem; border-radius: 8px;">
        <div style="width: 42px; height: 42px; border-radius: 50%; background: var(--border-color); flex-shrink: 0; animation: skeleton-pulse 1.5s ease-in-out infinite;"></div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 0.375rem; min-width: 0;">
          <div style="height: 13px; background: var(--border-color); border-radius: 4px; width: 55%; animation: skeleton-pulse 1.5s ease-in-out infinite;"></div>
          <div style="height: 11px; background: var(--border-color); border-radius: 4px; width: 80%; animation: skeleton-pulse 1.5s ease-in-out infinite; animation-delay: 0.2s;"></div>
        </div>
        <div style="width: 36px; height: 10px; background: var(--border-color); border-radius: 4px; flex-shrink: 0; animation: skeleton-pulse 1.5s ease-in-out infinite; animation-delay: 0.1s;"></div>
      </div>`;
    return [row, row, row, row, row, row].join('');
  }

  // Helper to get consistent conversation key
  getConversationKey(conv) {
    if (conv.type === 'call') return `call_${conv.callId}`;
    if (conv.type === 'chat') return `chat_${conv.chatSessionId}`;
    if (conv.type === 'email') return `email_${conv.emailThreadId}`;
    return `sms_${conv.phone}_${conv.serviceNumber}`;
  }

}

Object.assign(InboxPage.prototype,
  viewsMethods,
  messagingMethods,
  callInterfaceMethods,
  listenersMethods,
);

export default InboxPage;
