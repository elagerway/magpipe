/**
 * Inbox Page - Modern Messaging UI
 */

import { getCurrentUser, supabase } from '../lib/supabase.js';
import { renderBottomNav } from '../components/BottomNav.js';

export default class InboxPage {
  constructor() {
    this.conversations = [];
    this.selectedContact = null;
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    await this.loadConversations(user.id);

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="inbox-container">
        <!-- Conversation List Sidebar -->
        <div class="conversation-list" id="conversation-list">
          <div class="inbox-header">
            <h1 style="margin: 0; font-size: 1.5rem;">Messages</h1>
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

    // Group by contact phone number
    const grouped = {};

    messages?.forEach(msg => {
      // For inbound: sender_number is the contact, for outbound: recipient_number is the contact
      const phone = msg.direction === 'inbound' ? msg.sender_number : msg.recipient_number;
      if (!grouped[phone]) {
        grouped[phone] = {
          phone,
          messages: [],
          calls: [],
          lastActivity: new Date(msg.sent_at || msg.created_at),
          lastMessage: msg.content,
        };
      }
      grouped[phone].messages.push(msg);
      const msgDate = new Date(msg.sent_at || msg.created_at);
      if (msgDate > grouped[phone].lastActivity) {
        grouped[phone].lastActivity = msgDate;
        grouped[phone].lastMessage = msg.content;
      }
    });

    calls?.forEach(call => {
      const phone = call.contact_phone;
      if (!grouped[phone]) {
        grouped[phone] = {
          phone,
          messages: [],
          calls: [],
          lastActivity: new Date(call.started_at),
          lastMessage: `${call.direction === 'inbound' ? 'Incoming' : 'Outgoing'} call`,
        };
      }
      grouped[phone].calls.push(call);
      const callDate = new Date(call.started_at);
      if (callDate > grouped[phone].lastActivity) {
        grouped[phone].lastActivity = callDate;
        grouped[phone].lastMessage = `${call.direction === 'inbound' ? 'Incoming' : 'Outgoing'} call`;
      }
    });

    // Convert to array and sort by last activity
    this.conversations = Object.values(grouped).sort((a, b) => b.lastActivity - a.lastActivity);
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
      const isSelected = this.selectedContact === conv.phone;
      return `
        <div class="conversation-item ${isSelected ? 'selected' : ''}" data-phone="${conv.phone}">
          <div class="conversation-avatar">
            ${this.getInitials(conv.phone)}
          </div>
          <div class="conversation-content">
            <div class="conversation-header">
              <span class="conversation-name">${this.formatPhoneNumber(conv.phone)}</span>
              <span class="conversation-time">${this.formatTimestamp(conv.lastActivity)}</span>
            </div>
            <div class="conversation-preview">${conv.lastMessage}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  renderMessageThread() {
    const conv = this.conversations.find(c => c.phone === this.selectedContact);
    if (!conv) return this.renderEmptyState();

    // Combine messages and calls, sort chronologically
    const items = [
      ...conv.messages.map(m => ({ type: 'message', data: m, timestamp: new Date(m.sent_at || m.created_at) })),
      ...conv.calls.map(c => ({ type: 'call', data: c, timestamp: new Date(c.started_at) })),
    ].sort((a, b) => a.timestamp - b.timestamp);

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
        ${items.map(item => this.renderThreadItem(item)).join('')}
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

  renderThreadItem(item) {
    if (item.type === 'message') {
      const msg = item.data;
      const isInbound = msg.direction === 'inbound';
      return `
        <div class="message-bubble ${isInbound ? 'inbound' : 'outbound'}">
          <div class="message-content">${msg.content}</div>
          <div class="message-time">${this.formatTime(item.timestamp)}</div>
        </div>
      `;
    } else {
      const call = item.data;
      return `
        <div class="call-indicator">
          <span class="call-icon">${call.direction === 'inbound' ? '📞' : '📱'}</span>
          <span>${call.direction === 'inbound' ? 'Incoming' : 'Outgoing'} call</span>
          ${call.duration ? `<span>• ${Math.floor(call.duration / 60)}m ${call.duration % 60}s</span>` : ''}
          <span class="call-time">${this.formatTime(item.timestamp)}</span>
        </div>
      `;
    }
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
    const isMobile = window.innerWidth <= 768;

    // Click on conversation to view thread
    document.querySelectorAll('.conversation-item').forEach(item => {
      item.addEventListener('click', async () => {
        this.selectedContact = item.dataset.phone;

        // Update selected state
        document.querySelectorAll('.conversation-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');

        // Update thread view
        const threadElement = document.getElementById('message-thread');
        threadElement.innerHTML = this.renderMessageThread();

        // Attach message input listeners
        this.attachMessageInputListeners();

        // Show thread on mobile
        if (isMobile) {
          threadElement.classList.add('show');

          // Show back button on mobile
          const backButton = document.getElementById('back-button');
          if (backButton) {
            backButton.style.display = 'block';
            backButton.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              threadElement.classList.remove('show');
            });
          }
        }

        // Scroll to bottom of messages
        const threadMessages = document.getElementById('thread-messages');
        if (threadMessages) {
          setTimeout(() => {
            threadMessages.scrollTop = threadMessages.scrollHeight;
          }, 100);
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