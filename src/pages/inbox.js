/**
 * Inbox Page - Modern Messaging UI
 */

import { getCurrentUser, supabase } from '../lib/supabase.js';
import { renderBottomNav, clearUnreadBadge, setPhoneNavActive } from '../components/BottomNav.js';
import { sipClient } from '../lib/sipClient.js';
import { livekitClient } from '../lib/livekitClient.js';

export default class InboxPage {
  constructor() {
    this.conversations = [];
    this.selectedContact = null;
    this.subscription = null;
    this.userId = null;
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    this.userId = user.id;
    await this.loadConversations(user.id);

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="inbox-container">
        <!-- Conversation List Sidebar -->
        <div class="conversation-list" id="conversation-list">
          <div class="inbox-header">
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

    this.attachEventListeners();
    this.subscribeToMessages();

    // Expose showCallInterface globally for phone nav button
    window.showDialpad = () => this.showCallInterface();
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
      .subscribe((status) => {
        console.log('Inbox subscription status:', status);
      });
  }

  async handleNewMessage(message) {
    console.log('handleNewMessage called with:', message);
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
    const contactPhone = message.direction === 'inbound' ? message.sender_number : message.recipient_number;
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

  cleanup() {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
  }

  async loadConversations(userId) {
    // Load all SMS messages and calls
    const { data: messages, error: msgError } = await supabase
      .from('sms_messages')
      .select('*')
      .eq('user_id', userId)
      .order('sent_at', { ascending: false });

    console.log('Messages loaded:', messages, msgError);

    const { data: calls, error: callError } = await supabase
      .from('call_records')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false });

    console.log('Calls loaded:', calls, callError);
    console.log('Number of calls:', calls?.length || 0);
    if (calls && calls.length > 0) {
      console.log('First call record:', calls[0]);
    }

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

        return `
          <div class="conversation-item ${isSelected ? 'selected' : ''}" data-call-id="${conv.callId}" data-type="call" style="display: flex !important; flex-direction: row !important; gap: 0.75rem;">
            <div class="conversation-avatar call-avatar" style="flex-shrink: 0;">
              ${iconSvg}
            </div>
            <div class="conversation-content" style="flex: 1 !important; min-width: 0;">
              <div class="conversation-header" style="display: flex !important; justify-content: space-between !important; align-items: baseline; width: 100%;">
                <span class="conversation-name">${this.formatPhoneNumber(primaryNumber)}</span>
                <span class="conversation-time" style="white-space: nowrap; margin-left: 0.5rem;">${this.formatTimestamp(conv.lastActivity)}</span>
              </div>
              <div style="font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 2px;">
                ${isOutbound ? 'From' : 'To'}: ${this.formatPhoneNumber(serviceNumber)}
              </div>
              <div class="conversation-preview">
                <span class="call-status-indicator ${conv.statusInfo.class}" style="color: ${conv.statusInfo.color}; margin-right: 0.25rem;">${conv.statusInfo.icon}</span>
                ${conv.lastMessage}
              </div>
            </div>
          </div>
        `;
      } else {
        return `
          <div class="conversation-item ${isSelected ? 'selected' : ''}" data-phone="${conv.phone}" data-type="sms" style="display: flex !important; flex-direction: row !important; gap: 0.75rem;">
            <div class="conversation-avatar sms-avatar" style="flex-shrink: 0;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <div class="conversation-content" style="flex: 1 !important; min-width: 0;">
              <div class="conversation-header" style="display: flex !important; justify-content: space-between !important; align-items: baseline; width: 100%;">
                <span class="conversation-name">${this.formatPhoneNumber(conv.phone)}</span>
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-left: 0.5rem;">
                  ${conv.unreadCount > 0 ? `<span class="conversation-unread-badge">${conv.unreadCount > 99 ? '99+' : conv.unreadCount}</span>` : ''}
                  <span class="conversation-time" style="white-space: nowrap;">${this.formatTimestamp(conv.lastActivity)}</span>
                </div>
              </div>
              <div style="font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 2px;">To: ${Array.from(conv.serviceNumbers).map(n => this.formatPhoneNumber(n)).join(', ')}</div>
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

    return `
      <div class="thread-header" style="display: flex; align-items: center; gap: 0.75rem;">
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
        <h2 style="margin: 0; font-size: 0.88rem; font-weight: 600; flex: 1;">
          ${this.formatPhoneNumber(conv.phone)}
        </h2>
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
        <button id="send-button" class="send-button">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
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
      <div class="message-bubble ${isInbound ? 'inbound' : 'outbound'} ${isAI ? 'ai-message' : ''}">
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
        // Single checkmark for sent
        return `<span class="delivery-status sent" title="Sent">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 12 9 17 20 6"></polyline>
          </svg>
        </span>`;
      case 'pending':
        // Clock icon for pending
        return `<span class="delivery-status pending" title="Sending...">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
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
          <h2 style="margin: 0; font-size: calc(1.125rem - 5px); font-weight: 600; line-height: 1;">
            ${this.formatPhoneNumber(call.contact_phone)}
          </h2>
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

      <div class="thread-messages" id="thread-messages" style="overflow-y: auto;">
        ${call.recording_url ? `
          <div class="call-detail-recording" style="padding: 0 6px 6px 6px;">
            <audio controls src="${call.recording_url}" style="width: 100%; height: 40px; padding: 0;"></audio>
          </div>
        ` : ''}

        ${messages.length > 0 ? `
          <div class="call-detail-transcript">
            <div class="transcript-messages">
              ${messages.map(msg => `
                <div class="transcript-bubble ${msg.speaker}">
                  <div class="transcript-speaker-label">${this.getSpeakerDisplayLabel(msg.speakerLabel)}</div>
                  <div class="transcript-content">${msg.text}</div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : call.transcript ? `
          <div class="call-detail-transcript">
            <div class="transcript-plain" style="padding: 12px; background: var(--card-bg, #f9fafb); border-radius: 8px; margin: 8px;">
              <p style="margin: 0; line-height: 1.5; color: var(--text-primary, #111827);">${call.transcript}</p>
            </div>
          </div>
        ` : `
          <div class="call-detail-no-transcript">
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
        <div style="display: flex; align-items: center; margin-bottom: 0.5rem;">
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
          <input
            type="tel"
            id="text-phone"
            placeholder="Enter phone number"
            style="
              flex: 1;
              border: none;
              outline: none;
              background: transparent;
              font-size: 0.88rem;
              font-weight: 600;
              color: var(--text-primary);
            "
          />
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

    // Handle mobile back button
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      const backBtn = document.getElementById('back-button-new');
      if (backBtn) {
        backBtn.style.display = 'block';
        backBtn.addEventListener('click', async () => {
          // On mobile, completely re-render the inbox to show conversation list
          await this.render();
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

    // Focus phone input
    document.getElementById('text-phone').focus();
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

    const phone = phoneInput.value.trim();
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

    // New conversation button
    const newConvBtn = document.getElementById('new-conversation-btn');
    if (newConvBtn) {
      newConvBtn.addEventListener('click', () => {
        this.showNewConversationModal();
      });
    }
  }

  attachConversationListeners() {
    const isMobile = window.innerWidth <= 768;

    // Click on conversation to view thread
    document.querySelectorAll('.conversation-item').forEach(item => {
      item.addEventListener('click', async () => {
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

        // Update conversation list to update selection
        const conversationsEl = document.getElementById('conversations');
        if (conversationsEl) {
          conversationsEl.innerHTML = this.renderConversationList();
          this.attachConversationListeners();
        }

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
        const backButton = document.getElementById('back-button');
        if (backButton) {
          backButton.addEventListener('click', (e) => {
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
              this.attachConversationListeners();
            }
          });
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
    });
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

      // Add message to UI immediately
      const threadMessages = document.getElementById('thread-messages');
      const newMessage = `
        <div class="message-bubble outbound">
          <div class="message-content">${message}</div>
          <div class="message-time">${this.formatTime(new Date())}</div>
        </div>
      `;
      threadMessages.insertAdjacentHTML('beforeend', newMessage);
      threadMessages.scrollTop = threadMessages.scrollHeight;

    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      input.disabled = false;
      sendButton.disabled = false;
      input.focus();
    }
  }
}