/**
 * SMS Messages Page
 */

import { SmsMessage } from '../models/SmsMessage.js';
import { getCurrentUser } from '../lib/supabase.js';

export default class MessagesPage {
  constructor() {
    this.conversations = [];
    this.currentContactId = null;
    this.currentThread = [];
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    // Fetch conversations
    const { conversations } = await SmsMessage.getConversations(user.id);
    this.conversations = conversations;

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container" style="padding-top: 2rem;">
        <h1>Messages</h1>

        <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 1rem; margin-top: 2rem;">
          <!-- Conversations List -->
          <div class="card" style="max-height: 600px; overflow-y: auto;">
            <h3 style="margin-bottom: 1rem;">Conversations</h3>
            <div id="conversations-list">
              ${this.renderConversationsList()}
            </div>
          </div>

          <!-- Message Thread -->
          <div class="card" style="display: flex; flex-direction: column; height: 600px;">
            <div id="thread-header" class="hidden" style="padding-bottom: 1rem; border-bottom: 1px solid var(--border-color);">
              <h3 id="thread-contact-name"></h3>
              <p class="text-sm text-muted" id="thread-contact-phone"></p>
            </div>

            <div id="thread-messages" style="flex: 1; overflow-y: auto; padding: 1rem 0;">
              <p class="text-muted text-center">Select a conversation to view messages</p>
            </div>

            <div id="thread-reply" class="hidden" style="border-top: 1px solid var(--border-color); padding-top: 1rem;">
              <form id="reply-form" style="display: flex; gap: 0.5rem;">
                <input
                  type="text"
                  id="reply-input"
                  class="form-input"
                  placeholder="Type a message..."
                  style="flex: 1;"
                />
                <button type="submit" class="btn btn-primary">Send</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  renderConversationsList() {
    if (this.conversations.length === 0) {
      return '<p class="text-muted text-center">No conversations yet</p>';
    }

    return this.conversations
      .map(
        (conversation) => `
        <div class="conversation-item ${this.currentContactId === conversation.contact_id ? 'active' : ''}"
             data-contact-id="${conversation.contact_id}"
             style="
               padding: 0.75rem;
               border-radius: var(--radius-md);
               cursor: pointer;
               margin-bottom: 0.5rem;
               background: ${this.currentContactId === conversation.contact_id ? 'var(--bg-secondary)' : 'transparent'};
             "
             onmouseover="if (!this.classList.contains('active')) this.style.backgroundColor='var(--bg-secondary)'"
             onmouseout="if (!this.classList.contains('active')) this.style.backgroundColor='transparent'">
          <div style="font-weight: 600; margin-bottom: 0.25rem;">
            ${conversation.contacts?.name || conversation.contacts?.phone_number || 'Unknown'}
          </div>
          <div class="text-sm text-muted" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${conversation.direction === 'outbound' ? 'You: ' : ''}${conversation.body.substring(0, 50)}${conversation.body.length > 50 ? '...' : ''}
          </div>
          <div class="text-xs text-muted" style="margin-top: 0.25rem;">
            ${this.formatDateTime(conversation.created_at)}
          </div>
        </div>
      `
      )
      .join('');
  }

  renderThread() {
    if (this.currentThread.length === 0) {
      return '<p class="text-muted text-center">No messages in this conversation</p>';
    }

    return this.currentThread
      .map(
        (message) => `
        <div style="margin-bottom: 1rem; display: flex; justify-content: ${message.direction === 'outbound' ? 'flex-end' : 'flex-start'};">
          <div style="
            max-width: 70%;
            padding: 0.75rem;
            border-radius: var(--radius-md);
            background: ${message.direction === 'outbound' ? 'var(--primary-color)' : 'var(--bg-secondary)'};
            color: ${message.direction === 'outbound' ? 'white' : 'var(--text-primary)'};
          ">
            <div style="word-wrap: break-word;">${message.body}</div>
            <div style="
              margin-top: 0.5rem;
              font-size: 0.75rem;
              opacity: 0.7;
            ">
              ${this.formatDateTime(message.created_at)}
              ${message.status !== 'delivered' && message.direction === 'outbound' ? ` • ${message.status}` : ''}
            </div>
          </div>
        </div>
      `
      )
      .join('');
  }

  formatDateTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  attachEventListeners() {
    const replyForm = document.getElementById('reply-form');

    // Conversation item clicks
    this.attachConversationListeners();

    // Reply form
    replyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.sendMessage();
    });
  }

  attachConversationListeners() {
    document.querySelectorAll('.conversation-item').forEach((item) => {
      item.addEventListener('click', async (e) => {
        const contactId = e.currentTarget.dataset.contactId;
        await this.loadThread(contactId);
      });
    });
  }

  async loadThread(contactId) {
    this.currentContactId = contactId;

    // Update conversation list styling
    document.getElementById('conversations-list').innerHTML = this.renderConversationsList();
    this.attachConversationListeners();

    // Fetch thread
    const { messages } = await SmsMessage.getThread(contactId);
    this.currentThread = messages;

    // Find contact info
    const conversation = this.conversations.find((c) => c.contact_id === contactId);

    // Update thread header
    const threadHeader = document.getElementById('thread-header');
    const threadContactName = document.getElementById('thread-contact-name');
    const threadContactPhone = document.getElementById('thread-contact-phone');

    threadHeader.classList.remove('hidden');
    threadContactName.textContent = conversation?.contacts?.name || 'Unknown';
    threadContactPhone.textContent = conversation?.contacts?.phone_number || '';

    // Render messages
    document.getElementById('thread-messages').innerHTML = this.renderThread();

    // Show reply form
    document.getElementById('thread-reply').classList.remove('hidden');

    // Scroll to bottom
    const threadMessages = document.getElementById('thread-messages');
    threadMessages.scrollTop = threadMessages.scrollHeight;
  }

  async sendMessage() {
    const replyInput = document.getElementById('reply-input');
    const messageBody = replyInput.value.trim();

    if (!messageBody || !this.currentContactId) return;

    // Disable input
    replyInput.disabled = true;

    try {
      const { user } = await getCurrentUser();

      // Create message
      const { message, error } = await SmsMessage.create({
        user_id: user.id,
        contact_id: this.currentContactId,
        direction: 'outbound',
        body: messageBody,
        status: 'sending',
        signalwire_message_sid: `SM${Date.now()}temp`, // Temporary ID
      });

      if (error) throw error;

      // Add to thread
      this.currentThread.push(message);

      // Re-render thread
      document.getElementById('thread-messages').innerHTML = this.renderThread();

      // Scroll to bottom
      const threadMessages = document.getElementById('thread-messages');
      threadMessages.scrollTop = threadMessages.scrollHeight;

      // Clear input
      replyInput.value = '';
      replyInput.disabled = false;
      replyInput.focus();

      // TODO: In production, trigger Edge Function to send SMS via SignalWire
      // and update message status when webhook confirms delivery
    } catch (error) {
      console.error('Send message error:', error);
      alert('Failed to send message. Please try again.');
      replyInput.disabled = false;
    }
  }
}