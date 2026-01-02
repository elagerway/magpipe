/**
 * Inbox Page - Modern Messaging UI
 */

import { getCurrentUser, supabase } from '../lib/supabase.js';
import { renderBottomNav, clearUnreadBadge, setPhoneNavActive } from '../components/BottomNav.js';

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
    this.subscription = null;
    this.userId = null;
    this.dropdownListenersAttached = false;
    this.lastFetchTime = 0;
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

    // Use cached data if fetched within last 30 seconds
    const now = Date.now();
    if (this.conversations.length === 0 || (now - this.lastFetchTime) > 30000) {
      await this.loadConversations(user.id);
      this.lastFetchTime = now;
    }

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="inbox-container">
        <!-- Conversation List Sidebar -->
        <div class="conversation-list" id="conversation-list">
          <div class="inbox-header" style="position: relative;">
            <h1 style="margin: 0; font-size: 1rem; font-weight: 600;">Inbox</h1>
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
              display: flex;
              align-items: center;
              justify-content: center;
              line-height: 1;
              flex-shrink: 0;
              transition: all 0.2s ease;
            " onmouseover="this.style.backgroundImage='linear-gradient(var(--bg-secondary), var(--bg-secondary)), linear-gradient(135deg, #6366f1, #8b5cf6)'" onmouseout="this.style.backgroundImage='linear-gradient(white, white), linear-gradient(135deg, #6366f1, #8b5cf6)'">+</button>

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
          <div id="conversations">
            ${this.renderConversationList()}
          </div>
        </div>

        <!-- Message Thread -->
        <div class="message-thread" id="message-thread">
          ${this.selectedContact ? this.renderMessageThread() : this.renderEmptyState()}
        </div>
      </div>
      ${renderBottomNav('/inbox')}
    `;

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

  openNewConversation(phoneNumber) {
    // Set the selected contact and show the message input
    this.selectedContact = phoneNumber;
    this.selectedCallId = null;

    // Check if conversation exists
    const existingConv = this.conversations.find(c => c.type === 'sms' && c.phone === phoneNumber);

    if (!existingConv) {
      // Create a new conversation entry temporarily
      const newConv = {
        type: 'sms',
        phone: phoneNumber,
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
      .subscribe((status) => {
        console.log('Inbox subscription status:', status);
      });
  }

  async handleNewMessage(message) {
    console.log('handleNewMessage called with:', message);

    // Auto-enrich contact for new interactions
    const contactPhone = message.direction === 'inbound' ? message.sender_number : message.recipient_number;
    this.autoEnrichContact(contactPhone); // Fire and forget - don't await

    // For outbound messages, update local data and re-render if viewing that thread
    if (message.direction === 'outbound') {
      // Update local data
      const conv = this.conversations?.find(c => c.phone === contactPhone);
      if (conv && conv.messages) {
        const exists = conv.messages.some(m => m.id === message.id);
        if (!exists) {
          conv.messages.push(message);
          conv.lastMessage = message.content;
          conv.lastActivity = message.sent_at || new Date().toISOString();
        }
      }

      // Re-render thread if this is the selected contact
      if (this.selectedContact === contactPhone) {
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
    console.log('Contact phone from message:', contactPhone);
    console.log('Match?', this.selectedContact === contactPhone);

    if (this.selectedContact === contactPhone) {
      console.log('Updating thread for selected contact');
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
  }

  async loadConversations(userId) {
    // Load all data in parallel for speed
    const [messagesResult, callsResult, contactsResult] = await Promise.all([
      supabase.from('sms_messages').select('*').eq('user_id', userId).order('sent_at', { ascending: false }),
      supabase.from('call_records').select('*').eq('user_id', userId).order('started_at', { ascending: false }),
      supabase.from('contacts').select('*').eq('user_id', userId)
    ]);

    const messages = messagesResult.data;
    const calls = callsResult.data;
    const contacts = contactsResult.data;

    // Create a map of phone number to contact for quick lookup
    this.contactsMap = {};
    contacts?.forEach(contact => {
      if (contact.phone_number) {
        this.contactsMap[contact.phone_number] = contact;
      }
    });
    console.log('Contacts loaded:', contacts?.length || 0);

    const conversationsList = [];

    // Group SMS messages by contact phone number
    const smsGrouped = {};
    messages?.forEach(msg => {
      const phone = msg.direction === 'inbound' ? msg.sender_number : msg.recipient_number;
      // For inbound: recipient_number is the service number (our number being texted)
      // For outbound: sender_number is the service number (our number sending)
      const serviceNumber = msg.direction === 'inbound' ? msg.recipient_number : msg.sender_number;

      if (!smsGrouped[phone]) {
        smsGrouped[phone] = {
          type: 'sms',
          phone,
          serviceNumbers: new Set([serviceNumber]), // Track all service numbers
          messages: [],
          lastActivity: new Date(msg.sent_at || msg.created_at),
          lastMessage: msg.content,
          unreadCount: 0,
        };
      } else {
        // Add this service number to the set
        smsGrouped[phone].serviceNumbers.add(serviceNumber);
      }
      smsGrouped[phone].messages.push(msg);

      // Count unread inbound messages
      if (msg.direction === 'inbound') {
        const lastViewedKey = `conversation_last_viewed_sms_${phone}`;
        const lastViewed = localStorage.getItem(lastViewedKey);
        const msgDate = new Date(msg.sent_at || msg.created_at);

        if (!lastViewed || msgDate > new Date(lastViewed)) {
          smsGrouped[phone].unreadCount++;
        }
      }

      const msgDate = new Date(msg.sent_at || msg.created_at);
      if (msgDate > smsGrouped[phone].lastActivity) {
        smsGrouped[phone].lastActivity = msgDate;
        smsGrouped[phone].lastMessage = msg.content;
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

      conversationsList.push({
        type: 'call',
        callId: call.id,
        phone: phoneNumber,
        call: call,
        lastActivity: new Date(call.started_at),
        lastMessage: `${call.direction === 'inbound' ? 'Incoming' : 'Outgoing'} Call • ${durationText}`,
        statusInfo: statusInfo,
      });
    });

    // Sort all conversations by last activity
    this.conversations = conversationsList.sort((a, b) => b.lastActivity - a.lastActivity);
  }

  renderConversationList() {
    if (this.conversations.length === 0) {
      return `
        <div style="padding: 2rem; text-align: center; color: var(--text-secondary);">
          <p style="font-size: 1rem; margin-bottom: 0.5rem;">No messages yet</p>
          <p style="font-size: 0.875rem;">When Pat receives calls or messages, they'll appear here.</p>
        </div>
      `;
    }

    return this.conversations.map(conv => {
      const isSelected = (conv.type === 'sms' && this.selectedContact === conv.phone && !this.selectedCallId) ||
                        (conv.type === 'call' && this.selectedCallId === conv.callId);

      if (conv.type === 'call') {
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
          <div class="conversation-item ${isSelected ? 'selected' : ''}" data-call-id="${conv.callId}" data-type="call" style="display: flex !important; flex-direction: row !important; gap: 0.75rem;">
            <div class="conversation-avatar call-avatar" style="flex-shrink: 0;">
              ${iconSvg}
            </div>
            <div class="conversation-content" style="flex: 1 !important; min-width: 0;">
              <div class="conversation-header" style="display: flex !important; justify-content: space-between !important; align-items: baseline; width: 100%;">
                <span class="conversation-name">${contactName || this.formatPhoneNumber(primaryNumber)}</span>
                <span class="conversation-time" style="white-space: nowrap; margin-left: 0.5rem;">${this.formatTimestamp(conv.lastActivity)}</span>
              </div>
              <div style="font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 2px;">
                ${contactName ? this.formatPhoneNumber(primaryNumber) + ' • ' : ''}${isOutbound ? 'From' : 'To'}: ${this.formatPhoneNumber(serviceNumber)}
              </div>
              <div class="conversation-preview">
                <span class="call-status-indicator ${conv.statusInfo.class}" style="color: ${conv.statusInfo.color}; margin-right: 0.25rem;">${conv.statusInfo.icon}</span>
                ${conv.lastMessage}
              </div>
            </div>
          </div>
        `;
      } else {
        // Get contact info if available
        const contact = this.contactsMap?.[conv.phone];
        const contactName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.name : null;

        return `
          <div class="conversation-item ${isSelected ? 'selected' : ''}" data-phone="${conv.phone}" data-type="sms" style="display: flex !important; flex-direction: row !important; gap: 0.75rem;">
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
              <div class="conversation-preview">${conv.lastMessage}</div>
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

    const conv = this.conversations.find(c => c.type === 'sms' && c.phone === this.selectedContact);
    if (!conv) return this.renderEmptyState();

    // Get contact info if available
    const contact = this.contactsMap?.[conv.phone];
    const contactName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.name : null;

    return `
      <div class="thread-header" style="display: flex; align-items: flex-start; gap: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border-color);">
        <button class="back-button" id="back-button" style="
          display: none;
          background: none;
          border: none;
          font-size: 1.75rem;
          cursor: pointer;
          padding: 0;
          color: var(--primary-color);
          line-height: 1;
        ">←</button>
        ${contact?.avatar_url ? `
          <img src="${contact.avatar_url}" alt="${contactName}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover; flex-shrink: 0;" />
        ` : ''}
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h2 style="margin: 0; font-size: 1rem; font-weight: 600;">
              ${contactName || this.formatPhoneNumber(conv.phone)}
            </h2>
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
          ${contactName ? `<div style="font-size: 0.8rem; color: var(--text-secondary);">${this.formatPhoneNumber(conv.phone)}</div>` : ''}
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
        <div class="message-content">${msg.content}</div>
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
      <div class="thread-header" style="display: flex; align-items: center; gap: 0.75rem; justify-content: space-between;">
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
          <div>
            <h2 style="margin: 0; font-size: calc(1.125rem - 5px); font-weight: 600; line-height: 1;">
              ${contactName || this.formatPhoneNumber(call.contact_phone)}
            </h2>
            ${contactName ? `<div style="font-size: 0.75rem; color: var(--text-secondary);">${this.formatPhoneNumber(call.contact_phone)}</div>` : ''}
          </div>
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
          <div style="font-size: 0.875rem; color: var(--text-secondary); display: flex; gap: 0.5rem; align-items: center; white-space: nowrap;">
            <span>${call.direction === 'inbound' ? 'Incoming' : 'Outgoing'} Call</span>
            <span>•</span>
            <span>${durationText}</span>
            ${call.user_sentiment ? `
              <span>•</span>
              <span>User Sentiment: <span class="sentiment-${call.user_sentiment.toLowerCase()}">${call.user_sentiment}</span></span>
            ` : ''}
          </div>
        </div>
      </div>

      <div class="thread-messages" id="thread-messages">
        ${call.recording_url ? `
          <div style="width: 100%; margin-bottom: 0.5rem;">
            <audio controls src="${call.recording_url}" style="width: 100%; height: 40px;"></audio>
          </div>
        ` : ''}

        ${messages.length > 0 ? messages.map(msg => `
          <div class="message-bubble ${msg.speaker === 'agent' ? 'outbound' : 'inbound'}">
            <div class="message-content">${msg.text}</div>
          </div>
        `).join('') : call.transcript ? `
          <div class="message-bubble inbound" style="max-width: 100%;">
            <div class="message-content">${call.transcript}</div>
          </div>
        ` : `
          <div style="padding: 3rem 1.5rem; text-align: center; color: var(--text-secondary);">
            <p>No transcript available for this call.</p>
          </div>
        `}
      </div>
    `;
  }

  getCallStatusInfo(status) {
    const statusMap = {
      'completed': {
        icon: '✓',
        text: 'Completed',
        class: 'status-completed',
        color: '#10b981'
      },
      'in-progress': {
        icon: '⟳',
        text: 'In Progress',
        class: 'status-progress',
        color: '#6366f1'
      },
      'no-answer': {
        icon: '⊗',
        text: 'No Answer',
        class: 'status-missed',
        color: '#ef4444'
      },
      'failed': {
        icon: '✕',
        text: 'Failed',
        class: 'status-failed',
        color: '#ef4444'
      },
      'busy': {
        icon: '⊗',
        text: 'Busy',
        class: 'status-busy',
        color: '#f59e0b'
      },
      'answered_by_pat': {
        icon: '✓',
        text: 'Answered by Pat',
        class: 'status-completed',
        color: '#10b981'
      },
      'transferred_to_user': {
        icon: '↗',
        text: 'Transferred',
        class: 'status-transferred',
        color: '#6366f1'
      },
      'screened_out': {
        icon: '🚫',
        text: 'Screened Out',
        class: 'status-screened',
        color: '#9ca3af'
      },
      'voicemail': {
        icon: '💬',
        text: 'Voicemail',
        class: 'status-voicemail',
        color: '#8b5cf6'
      },
      'Caller Hungup': {
        icon: '⊗',
        text: 'Hung Up',
        class: 'status-hungup',
        color: '#f59e0b'
      },
      'outbound_completed': {
        icon: '✓',
        text: 'Completed',
        class: 'status-completed',
        color: '#10b981'
      },
      'outbound_no_answer': {
        icon: '⊗',
        text: 'No Answer',
        class: 'status-missed',
        color: '#ef4444'
      },
      'outbound_busy': {
        icon: '⊗',
        text: 'Busy',
        class: 'status-busy',
        color: '#f59e0b'
      },
      'outbound_failed': {
        icon: '✕',
        text: 'Failed',
        class: 'status-failed',
        color: '#ef4444'
      }
    };

    return statusMap[status] || {
      icon: '•',
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

  getInitials(phone) {
    // Use last 2 digits of phone as "initials"
    return phone.slice(-2);
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
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  formatTime(date) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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
                  ${num.friendly_name ? `<div style="font-size: 0.8rem; color: var(--text-secondary);">${num.friendly_name}</div>` : ''}
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
                  ${num.friendly_name ? `<div style="font-size: 0.8rem; color: var(--text-secondary);">${num.friendly_name}</div>` : ''}
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
      alert('Please enter a recipient phone number');
      phoneInput.focus();
      return;
    }

    if (!prompt) {
      alert('Please enter a prompt describing what you want to say');
      promptInput.focus();
      return;
    }

    if (!this.selectedServiceNumber) {
      alert('Please select a From number');
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
      const generateResponse = await fetch(`${window.SUPABASE_URL || 'https://mtxbiyilvgwhbdptysex.supabase.co'}/functions/v1/generate-agent-message`, {
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
      const sendResponse = await fetch(`${window.SUPABASE_URL || 'https://mtxbiyilvgwhbdptysex.supabase.co'}/functions/v1/send-user-sms`, {
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
      alert(error.message || 'Failed to send message');
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
      alert('Voice input is not available in this browser');
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
      alert('Please enter a recipient phone number');
      return;
    }

    if (!message) {
      alert('Please generate a message first');
      return;
    }

    if (!serviceNumber) {
      alert('Please select a From number');
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

      const response = await fetch(`${window.SUPABASE_URL || 'https://mtxbiyilvgwhbdptysex.supabase.co'}/functions/v1/send-sms`, {
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
      alert(error.message || 'Failed to send message');
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
        alert('Please enter a phone number');
        return;
      }

      // Get selected caller ID
      const selectedCallerId = callerIdSelect ? callerIdSelect.value : null;

      if (!selectedCallerId) {
        alert('No active phone number selected');
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
          alert('No active service numbers found');
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
          alert('Selected number not found or inactive');
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

          alert(`Call failed: ${cause}`);
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
      alert(`Failed to initiate call: ${error.message}`);
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
      alert(`Failed to initiate call: ${error.message}`);
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
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
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
        alert('⚠️ Microphone is BLOCKED\n\nTo enable calling:\n\n1. Look at your browser address bar (where it shows localhost:3000)\n2. Click the camera/lock icon on the LEFT side\n3. Find "Microphone" and change it to "Allow"\n4. Refresh this page\n5. Try again');
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
              Pat needs access to your microphone to make calls.
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
        alert('⚠️ Microphone was denied\n\nThe browser denied microphone access.\n\nTry:\n1. Click the lock/camera icon in the address bar\n2. Reset permissions for this site\n3. Refresh and try again');
      } else {
        alert(`⚠️ Microphone error: ${error.name}\n\n${error.message}`);
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
        displayName: 'Pat AI',
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

    // Only attach dropdown listeners once
    if (!this.dropdownListenersAttached) {
      this.attachDropdownListeners();
      this.dropdownListenersAttached = true;
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

    conversationsEl.addEventListener('click', async (e) => {
      const item = e.target.closest('.conversation-item');
      if (!item) return;

      const isMobile = window.innerWidth <= 768;
      const type = item.dataset.type;

      if (type === 'call') {
        // Handle call conversation click
        this.selectedCallId = item.dataset.callId;
        this.selectedContact = null;
      } else {
        // Handle SMS conversation click
        this.selectedContact = item.dataset.phone;
        this.selectedCallId = null;

        // Clear unread badge when viewing a conversation
        clearUnreadBadge();

        // Mark this conversation as viewed
        const lastViewedKey = `conversation_last_viewed_sms_${this.selectedContact}`;
        localStorage.setItem(lastViewedKey, new Date().toISOString());

        // Clear unread count for this conversation
        const conv = this.conversations.find(c => c.type === 'sms' && c.phone === this.selectedContact);
        if (conv) {
          conv.unreadCount = 0;
        }
      }

      // Update conversation list to update selection (no need to re-attach listeners with delegation)
      conversationsEl.innerHTML = this.renderConversationList();

      // Update thread view
      const threadElement = document.getElementById('message-thread');
      threadElement.innerHTML = this.renderMessageThread();

      // Attach input listeners only for SMS threads
      if (type === 'sms') {
        this.attachMessageInputListeners();
      }

      // Show thread on mobile
      if (isMobile) {
        threadElement.classList.add('show');
      }

      // Attach back button listener
      this.attachBackButtonListener(threadElement, conversationsEl, isMobile);

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
        this.selectedCallId = null;
        threadElement.innerHTML = this.renderEmptyState();

        // Update conversation list
        conversationsEl.innerHTML = this.renderConversationList();
      }
    });
  }

  attachRedialButtonListener() {
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
    if (messageBtn) {
      messageBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const phoneNumber = messageBtn.dataset.phone;
        if (phoneNumber) {
          this.openNewConversation(phoneNumber);
        }
      });
    }
  }

  attachMessageInputListeners() {
    const input = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');

    console.log('Attaching message input listeners', { input, sendButton });

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

  parseTranscript(transcript) {
    if (!transcript) return [];

    // Parse transcript in "Speaker: Message" format
    // Supports:
    // - "Agent:/Pat:" (AI agent) -> right side
    // - "You:" (our user in direct calls) -> right side
    // - "User:/Caller:/Callee:" (other party) -> left side
    const lines = transcript.split('\n').filter(line => line.trim().length > 0);
    const messages = [];

    for (const line of lines) {
      // Match speaker labels at the start
      const match = line.match(/^(Agent|Pat|You|User|Caller|Callee):\s*(.+)$/);
      if (match) {
        const [, speaker, text] = match;
        // Agent, Pat, You = right side (our side)
        // User, Caller, Callee = left side (other party)
        const isOurSide = (speaker === 'Agent' || speaker === 'Pat' || speaker === 'You');
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
    // Map transcript speaker labels to display names
    const labelMap = {
      'Agent': 'Pat (AI)',
      'Pat': 'Pat (AI)',
      'You': 'You',
      'User': 'Caller',
      'Caller': 'Caller',
      'Callee': 'Callee'
    };
    return labelMap[speakerLabel] || speakerLabel || 'Unknown';
  }

  formatSentiment(sentiment) {
    const sentimentMap = {
      'positive': 'User Sentiment: Positive',
      'neutral': 'User Sentiment: Neutral',
      'negative': 'User Sentiment: Negative'
    };
    return sentimentMap[sentiment.toLowerCase()] || `User Sentiment: ${sentiment}`;
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
      const conv = this.conversations.find(c => c.type === 'sms' && c.phone === this.selectedContact);
      if (!conv || !conv.messages || conv.messages.length === 0) {
        alert('No conversation found.');
        return;
      }

      // Get the most recent message to determine which service number to use
      const recentMsg = conv.messages[conv.messages.length - 1];
      const serviceNumber = recentMsg.direction === 'inbound'
        ? recentMsg.recipient_number  // They texted TO this number
        : recentMsg.sender_number;     // We sent FROM this number

      console.log('Using service number from conversation:', serviceNumber);

      if (!serviceNumber) {
        alert('Could not determine service number.');
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
            <div class="message-content">${message}</div>
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
        const conv = this.conversations?.find(c => c.phone === this.selectedContact);
        if (conv && conv.messages) {
          const exists = conv.messages.some(m => m.id === newMsgData.id);
          if (!exists) {
            conv.messages.push(newMsgData);
          }
        }
      }

    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
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
      alert('Please enter a prompt describing what you want to say');
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
      const conv = this.conversations.find(c => c.type === 'sms' && c.phone === this.selectedContact);
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
      const contact = this.conversations.find(c => c.phone === this.selectedContact);
      const recipientName = contact?.name || null;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || window.SUPABASE_URL || 'https://mtxbiyilvgwhbdptysex.supabase.co';

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
            <div class="message-content">${generatedMessage}</div>
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
      alert(error.message || 'Failed to generate and send message. Please try again.');
    } finally {
      sendBtn.disabled = false;
      sendBtn.innerHTML = originalContent;
    }
  }
}