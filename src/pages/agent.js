/**
 * Agent Page
 * Conversational interface for managing AI assistant
 */

import { getCurrentUser } from '../lib/supabase.js';
import { createAdminChatInterface, addAdminChatStyles } from '../components/AdminChatInterface.js';
import { renderBottomNav, attachBottomNav } from '../components/BottomNav.js';

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

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="agent-page">
        <div class="agent-content">
          <div id="chat-container"></div>
        </div>

        ${renderBottomNav('/agent')}
      </div>
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
}

// Add page-specific styles
const style = document.createElement('style');
style.textContent = `
  .agent-page {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #f9fafb;
  }

  .agent-content {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  #chat-container {
    flex: 1;
    display: flex;
    padding: 20px;
  }

  #chat-container .admin-chat-interface {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    #chat-container {
      padding: 12px;
    }

    #chat-container .admin-chat-interface {
      max-width: none;
    }
  }
`;

document.head.appendChild(style);
