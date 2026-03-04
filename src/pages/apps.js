/**
 * Apps Page
 * Connected Apps and MCP Servers management
 */

import { getCurrentUser, supabase } from '../lib/supabase.js';
import { renderBottomNav, attachBottomNav } from '../components/BottomNav.js';
import { createIntegrationSettings, addIntegrationSettingsStyles } from '../components/IntegrationSettings.js';
import { createMcpServerCatalog, addMcpCatalogStyles } from '../components/McpServerCatalog.js';
import { User } from '../models/index.js';

export default class AppsPage {
  constructor() {
    this.integrationSettings = null;
    this.mcpCatalog = null;
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    // Fetch user profile
    const { profile } = await User.getProfile(user.id);

    // Add component styles
    addIntegrationSettingsStyles();
    addMcpCatalogStyles();

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container with-bottom-nav" style="max-width: 800px; padding: 2rem 1rem;">
        <!-- Back button (mobile only) -->
        <button class="back-btn mobile-only" onclick="navigateTo('/settings')" style="margin-bottom: 1rem;">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
        </button>

        <h1 style="margin-bottom: 1.5rem;">Apps</h1>

        <!-- Connected Apps / Integrations -->
        <div id="integration-settings-container" style="margin-bottom: 1rem;"></div>

        <!-- MCP Servers -->
        <div id="mcp-catalog-container" style="margin-bottom: 1rem;"></div>
      </div>
      ${renderBottomNav('/apps')}
    `;

    attachBottomNav();
    this.attachEventListeners(user.id);
  }

  attachEventListeners(userId) {
    // Initialize Integration Settings (Connected Apps)
    const integrationContainer = document.getElementById('integration-settings-container');
    if (integrationContainer) {
      createIntegrationSettings('integration-settings-container');
    }

    // Initialize MCP Server Catalog
    const mcpContainer = document.getElementById('mcp-catalog-container');
    if (mcpContainer) {
      createMcpServerCatalog('mcp-catalog-container');
    }
  }

  cleanup() {
    // Cleanup if needed
    this.integrationSettings = null;
    this.mcpCatalog = null;
  }
}
