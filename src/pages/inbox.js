/**
 * Inbox Page - Modern Messaging UI
 */

import { getCurrentUser, supabase } from '../lib/supabase.js';
import { renderBottomNav, clearUnreadBadge } from '../components/BottomNav.js';

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
            <h1 style="margin: 0; font-size: 1.5rem;">Conversations</h1>
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
      if (!smsGrouped[phone]) {
        smsGrouped[phone] = {
          type: 'sms',
          phone,
          messages: [],
          lastActivity: new Date(msg.sent_at || msg.created_at),
          lastMessage: msg.content,
          unreadCount: 0,
        };
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
      const duration = call.duration_seconds || 0;
      const durationText = duration > 0
        ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`
        : '0:00';

      const statusInfo = this.getCallStatusInfo(call.status);

      conversationsList.push({
        type: 'call',
        callId: call.id,
        phone: call.contact_phone,
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
        return `
          <div class="conversation-item ${isSelected ? 'selected' : ''}" data-call-id="${conv.callId}" data-type="call">
            <div class="conversation-avatar call-avatar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
            </div>
            <div class="conversation-content">
              <div class="conversation-header">
                <span class="conversation-name">${this.formatPhoneNumber(conv.phone)}</span>
                <span class="conversation-time">${this.formatTimestamp(conv.lastActivity)}</span>
              </div>
              <div class="conversation-preview">
                <span class="call-status-indicator ${conv.statusInfo.class}">${conv.statusInfo.icon}</span>
                ${conv.lastMessage}
              </div>
            </div>
          </div>
        `;
      } else {
        return `
          <div class="conversation-item ${isSelected ? 'selected' : ''}" data-phone="${conv.phone}" data-type="sms">
            <div class="conversation-avatar sms-avatar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <div class="conversation-content">
              <div class="conversation-header">
                <span class="conversation-name">${this.formatPhoneNumber(conv.phone)}</span>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  ${conv.unreadCount > 0 ? `<span class="conversation-unread-badge">${conv.unreadCount > 99 ? '99+' : conv.unreadCount}</span>` : ''}
                  <span class="conversation-time">${this.formatTimestamp(conv.lastActivity)}</span>
                </div>
              </div>
              <div class="conversation-preview">${conv.lastMessage}</div>
            </div>
          </div>
        `;
      }
    }).join('');
  }

  renderMessageThread() {
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
        <h2 style="margin: 0; font-size: 1.125rem; font-weight: 600; flex: 1;">
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
          placeholder="Type a message..."
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
        <div class="message-time">${this.formatTime(timestamp)}</div>
      </div>
    `;
  }

  renderCallDetailView(call) {
    const duration = call.duration_seconds || call.duration || 0;
    const durationText = duration > 0
      ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`
      : '0:00';
    const statusInfo = this.getCallStatusInfo(call.status);
    const messages = this.parseTranscript(call.transcript);

    return `
      <div class="thread-header" style="display: flex; align-items: center; gap: 0.75rem;">
        <button class="back-button" id="back-button" style="
          display: block;
          background: none;
          border: none;
          font-size: 1.75rem;
          cursor: pointer;
          padding: 0;
          color: var(--primary-color);
          line-height: 1;
        ">←</button>
        <div style="flex: 1;">
          <h2 style="margin: 0; font-size: 1.125rem; font-weight: 600;">
            ${this.formatPhoneNumber(call.contact_phone)}
          </h2>
          <div style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.125rem; display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
            <span>${call.direction === 'inbound' ? 'Incoming' : 'Outgoing'} Call</span>
            <span>•</span>
            <span>${durationText}</span>
            ${call.user_sentiment ? `
              <span>•</span>
              <span class="sentiment-${call.user_sentiment.toLowerCase()}">${this.formatSentiment(call.user_sentiment)}</span>
            ` : ''}
          </div>
        </div>
      </div>

      <div class="thread-messages" id="thread-messages" style="overflow-y: auto;">
        ${call.recording_url ? `
          <div class="call-detail-recording" style="padding: 6px;">
            <audio controls src="${call.recording_url}" style="width: 100%; height: 40px; padding: 0;"></audio>
          </div>
        ` : ''}

        ${messages.length > 0 ? `
          <div class="call-detail-transcript">
            <div class="transcript-messages">
              ${messages.map(msg => `
                <div class="transcript-bubble ${msg.speaker}">
                  <div class="transcript-speaker-label">${msg.speaker === 'agent' ? 'Pat (AI)' : 'Caller'}</div>
                  <div class="transcript-content">${msg.text}</div>
                </div>
              `).join('')}
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
        class: 'status-completed'
      },
      'in-progress': {
        icon: '⟳',
        text: 'In Progress',
        class: 'status-progress'
      },
      'no-answer': {
        icon: '⊗',
        text: 'No Answer',
        class: 'status-missed'
      },
      'failed': {
        icon: '✕',
        text: 'Failed',
        class: 'status-failed'
      },
      'busy': {
        icon: '⊗',
        text: 'Busy',
        class: 'status-busy'
      },
      'answered_by_pat': {
        icon: '✓',
        text: 'Answered by Pat',
        class: 'status-completed'
      },
      'transferred_to_user': {
        icon: '↗',
        text: 'Transferred',
        class: 'status-transferred'
      },
      'screened_out': {
        icon: '🚫',
        text: 'Screened Out',
        class: 'status-screened'
      },
      'voicemail': {
        icon: '💬',
        text: 'Voicemail',
        class: 'status-voicemail'
      }
    };

    return statusMap[status] || {
      icon: '•',
      text: status || 'Unknown',
      class: 'status-unknown'
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

  attachEventListeners() {
    this.attachConversationListeners();
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

        // Update selected state
        document.querySelectorAll('.conversation-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');

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
    // Supports both "Agent:/User:" (from Retell) and "Pat:/Caller:" formats
    const lines = transcript.split('\n').filter(line => line.trim().length > 0);
    const messages = [];

    for (const line of lines) {
      // Match "Agent:", "Pat:", "User:", or "Caller:" at the start
      const match = line.match(/^(Agent|Pat|User|Caller):\s*(.+)$/);
      if (match) {
        const [, speaker, text] = match;
        messages.push({
          speaker: (speaker === 'Agent' || speaker === 'Pat') ? 'agent' : 'user',
          text: text.trim()
        });
      }
    }

    return messages;
  }

  formatSentiment(sentiment) {
    const sentimentMap = {
      'positive': '😊 Positive',
      'neutral': '😐 Neutral',
      'negative': '😞 Negative'
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
    console.log('Input disabled, fetching service number...');

    try {
      // Get the user's active SignalWire service number
      const { data: { session } } = await supabase.auth.getSession();
      const { data: serviceNumbers, error: numberError } = await supabase
        .from('service_numbers')
        .select('phone_number')
        .eq('user_id', session.user.id)
        .eq('is_active', true)
        .limit(1);

      console.log('Service numbers:', serviceNumbers, 'Error:', numberError);

      const serviceNumber = serviceNumbers?.[0]?.phone_number;

      if (!serviceNumber) {
        alert('No active service number found. Please configure a number first.');
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