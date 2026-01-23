/**
 * Agent Page
 * Conversational interface for managing AI assistant
 */

import { getCurrentUser, supabase } from '../lib/supabase.js';
import { createAdminChatInterface, addAdminChatStyles } from '../components/AdminChatInterface.js';
import { renderBottomNav, attachBottomNav } from '../components/BottomNav.js';

// Preload Inbox module immediately for faster navigation
const inboxModulePromise = import('../pages/inbox.js');

export default class AgentPage {
  constructor() {
    this.chatInterface = null;
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    // Add component styles
    addAdminChatStyles();

    // Prefetch inbox data in background while user is on Agent page
    this.prefetchInboxData(user.id);

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="agent-page">
        <div class="agent-content">
          <div id="chat-container"></div>
        </div>
      </div>
      ${renderBottomNav('/agent')}
    `;

    this.attachEventListeners();
    attachBottomNav();
  }

  attachEventListeners() {
    // Initialize chat interface
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
      this.chatInterface = createAdminChatInterface(chatContainer);
      this.chatInterface.addWelcomeMessage();
    }
  }

  cleanup() {
    if (this.chatInterface && this.chatInterface.destroy) {
      this.chatInterface.destroy();
      this.chatInterface = null;
    }
  }

  // Prefetch inbox data so it's ready when user navigates
  async prefetchInboxData(userId) {
    try {
      // Store prefetched data globally for inbox page to use
      if (!window._prefetchedInboxData) {
        const { data } = await supabase
          .from('sms_messages')
          .select('id, contact_phone, content, is_incoming, is_ai_generated, created_at, is_read, service_number')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        window._prefetchedInboxData = {
          data,
          userId,
          timestamp: Date.now()
        };
      }
    } catch (e) {
      // Ignore prefetch errors
    }
  }
}

// Add page-specific styles - copy inbox CSS properties directly
const style = document.createElement('style');
style.textContent = `
  /* Match inbox-container pattern exactly */
  .agent-page {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: calc(60px + env(safe-area-inset-bottom, 0px));
    display: flex;
    flex-direction: column;
    background: #f9fafb;
    overflow: hidden;
  }

  .agent-content {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  #chat-container {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }

  #chat-container .admin-chat-interface {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: row;
  }

  /* Chat area - must use !important to override component styles */
  #chat-container .chat-area {
    flex: 1 !important;
    display: flex !important;
    flex-direction: column !important;
    overflow: hidden !important;
    height: 100% !important;
  }

  /* Messages - must constrain height for input to show */
  #chat-container .chat-messages {
    flex: 1 1 0 !important;
    min-height: 0 !important;
    max-height: calc(100% - 80px) !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch;
  }

  /* Input - must stay at bottom */
  #chat-container .chat-input-container {
    flex: 0 0 auto !important;
    flex-shrink: 0 !important;
    padding: 0.75rem 1rem !important;
    padding-bottom: 1rem !important;
    margin-bottom: 0 !important;
    background: var(--bg-primary, #fff);
    border-top: 1px solid #e5e7eb;
  }

  /* Desktop */
  @media (min-width: 769px) {
    .agent-page {
      bottom: 60px;
    }
  }
`;

document.head.appendChild(style);
