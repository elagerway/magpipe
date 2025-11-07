/**
 * Dashboard Page - Agent Chat Interface
 */

import { getCurrentUser } from '../lib/supabase.js';
import { createAdminChatInterface, addAdminChatStyles } from '../components/AdminChatInterface.js';
import { renderBottomNav, attachBottomNav } from '../components/BottomNav.js';

export default class DashboardPage {
  constructor() {
    this.chatInterface = null;
  }

  async render() {
    console.log('Dashboard render started');
    const { user } = await getCurrentUser();

    if (!user) {
      console.log('No user, redirecting to login');
      navigateTo('/login');
      return;
    }

    console.log('User found, rendering dashboard');

    // Remove old agent page styles if they exist
    const oldAgentStyles = document.getElementById('agent-page-styles');
    if (oldAgentStyles) {
      oldAgentStyles.remove();
    }

    // Add component styles
    addAdminChatStyles();
    this.addPageStyles();

    const appElement = document.getElementById('app');
    console.log('App element:', appElement);

    appElement.innerHTML = `
      <div class="dashboard-page">
        <div class="dashboard-content">
          <div id="chat-container"></div>
        </div>

        ${renderBottomNav('/dashboard')}
      </div>
    `;

    this.attachEventListeners();
    attachBottomNav();
  }

  attachEventListeners() {
    // Initialize chat interface
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
      try {
        this.chatInterface = createAdminChatInterface(chatContainer);
        this.chatInterface.addWelcomeMessage();
      } catch (error) {
        console.error('Failed to create chat interface:', error);
        chatContainer.innerHTML = `<div style="padding: 20px; color: red;">Error: ${error.message}</div>`;
      }
    }
  }

  addPageStyles() {
    // Remove any existing dashboard styles
    const oldStyles = document.getElementById('dashboard-page-styles');
    if (oldStyles) {
      oldStyles.remove();
    }

    const style = document.createElement('style');
    style.id = 'dashboard-page-styles';
    style.textContent = `
      .dashboard-page {
        display: flex;
        flex-direction: column;
        height: 100vh;
        background: #f9fafb;
      }

      .dashboard-content {
        flex: 1;
        display: flex;
        overflow: hidden;
      }

      #chat-container {
        flex: 1;
        display: flex;
      }

      #chat-container .admin-chat-interface {
        width: 100%;
      }

      /* Mobile responsive */
      @media (max-width: 768px) {
        #chat-container {
          padding: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  cleanup() {
    if (this.chatInterface && this.chatInterface.destroy) {
      this.chatInterface.destroy();
      this.chatInterface = null;
    }
  }
}