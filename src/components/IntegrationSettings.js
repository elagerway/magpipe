/**
 * IntegrationSettings Component
 * Main integrations section for Settings page
 * Shows available and connected integrations with connect/disconnect functionality
 */

import { supabase } from '../lib/supabase.js';
import { createIntegrationCard, addIntegrationCardStyles } from './IntegrationCard.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Create the integrations settings section
 * @param {string} containerId - DOM element ID to render into
 * @returns {object} - Controller with refresh method
 */
export async function createIntegrationSettings(containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error('Integration settings container not found:', containerId);
    return null;
  }

  // Add styles
  addIntegrationCardStyles();
  addIntegrationSettingsStyles();

  // Show loading state
  container.innerHTML = `
    <div class="integration-settings">
      <h2>Connected Apps</h2>
      <p class="text-muted" style="margin-bottom: 1.5rem;">
        Connect third-party services to extend your assistant's capabilities
      </p>
      <div class="integration-loading">Loading integrations...</div>
    </div>
  `;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    // Fetch integration providers and user's connections in parallel
    const [providersResult, connectionsResult, calComResult] = await Promise.all([
      supabase
        .from('integration_providers')
        .select('id, slug, name, description, category, icon_url, oauth_type')
        .eq('enabled', true)
        .neq('slug', 'builtin')
        .order('name'),
      supabase
        .from('user_integrations')
        .select('provider_id, status')
        .eq('user_id', session.user.id)
        .eq('status', 'connected'),
      // Also check legacy Cal.com connection in users table
      supabase
        .from('users')
        .select('cal_com_access_token')
        .eq('id', session.user.id)
        .single(),
    ]);

    if (providersResult.error) throw providersResult.error;

    const providers = providersResult.data || [];
    const connections = connectionsResult.data || [];
    const connectedProviderIds = new Set(connections.map(c => c.provider_id));

    // Check legacy Cal.com connection
    const hasLegacyCalCom = !!calComResult.data?.cal_com_access_token;

    // Categorize providers
    const connected = [];
    const available = [];

    for (const provider of providers) {
      const isConnected = connectedProviderIds.has(provider.id) ||
        (provider.slug === 'cal_com' && hasLegacyCalCom);

      if (isConnected) {
        connected.push(provider);
      } else {
        available.push(provider);
      }
    }

    // Render the section
    renderIntegrations(container, connected, available, session.access_token);

  } catch (error) {
    console.error('Failed to load integrations:', error);
    container.innerHTML = `
      <div class="integration-settings">
        <h2>Connected Apps</h2>
        <div class="integration-error">
          Failed to load integrations. <button class="btn btn-sm btn-secondary" onclick="location.reload()">Retry</button>
        </div>
      </div>
    `;
  }

  return {
    refresh: () => createIntegrationSettings(containerId),
  };
}

function renderIntegrations(container, connected, available, accessToken) {
  container.innerHTML = `
    <div class="integration-settings">
      <h2>Connected Apps</h2>
      <p class="text-muted" style="margin-bottom: 1.5rem;">
        Connect third-party services to extend your assistant's capabilities
      </p>

      ${connected.length > 0 ? `
        <div class="integration-section">
          <h3 class="integration-section-title">Connected</h3>
          <div class="integration-list" id="connected-integrations"></div>
        </div>
      ` : ''}

      ${available.length > 0 ? `
        <div class="integration-section">
          <h3 class="integration-section-title">Available</h3>
          <div class="integration-list" id="available-integrations"></div>
        </div>
      ` : ''}

      ${connected.length === 0 && available.length === 0 ? `
        <div class="integration-empty">
          No integrations available yet. Check back soon!
        </div>
      ` : ''}
    </div>
  `;

  const connectedList = container.querySelector('#connected-integrations');
  const availableList = container.querySelector('#available-integrations');

  // Create callbacks
  const handleConnect = async (slug) => {
    try {
      // Start OAuth flow
      const response = await fetch(`${SUPABASE_URL}/functions/v1/integration-oauth-start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ provider: slug }),
      });

      const result = await response.json();

      if (result.error) {
        alert(result.error);
        // Re-render to reset button state
        createIntegrationSettings(container.parentElement?.id || container.id);
        return;
      }

      if (result.url) {
        window.location.href = result.url;
      } else {
        alert('Unable to start connection. Please try again.');
        createIntegrationSettings(container.parentElement?.id || container.id);
      }
    } catch (error) {
      console.error('Connect error:', error);
      alert('Failed to connect. Please try again.');
      createIntegrationSettings(container.parentElement?.id || container.id);
    }
  };

  const handleDisconnect = async (slug) => {
    try {
      // Handle Cal.com specially since it uses existing disconnect endpoint
      if (slug === 'cal_com') {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/cal-com-disconnect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': SUPABASE_ANON_KEY,
          },
        });

        if (!response.ok) {
          throw new Error('Disconnect failed');
        }
      } else {
        // Generic disconnect - delete from user_integrations
        const { data: { session } } = await supabase.auth.getSession();
        const { data: provider } = await supabase
          .from('integration_providers')
          .select('id')
          .eq('slug', slug)
          .single();

        if (provider) {
          await supabase
            .from('user_integrations')
            .delete()
            .eq('user_id', session.user.id)
            .eq('provider_id', provider.id);
        }
      }

      // Refresh the list
      createIntegrationSettings(container.parentElement?.id || container.id);
    } catch (error) {
      console.error('Disconnect error:', error);
      alert('Failed to disconnect. Please try again.');
      createIntegrationSettings(container.parentElement?.id || container.id);
    }
  };

  // Render connected integrations
  if (connectedList) {
    for (const integration of connected) {
      const card = createIntegrationCard(integration, true, {
        onDisconnect: handleDisconnect,
      });
      connectedList.appendChild(card);
    }
  }

  // Render available integrations
  if (availableList) {
    for (const integration of available) {
      const card = createIntegrationCard(integration, false, {
        onConnect: handleConnect,
      });
      availableList.appendChild(card);
    }
  }
}

/**
 * Add styles for the integration settings section
 */
export function addIntegrationSettingsStyles() {
  if (document.getElementById('integration-settings-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'integration-settings-styles';
  styles.textContent = `
    .integration-settings {
      background: var(--bg-primary);
      border-radius: var(--radius-lg);
      padding: 1.5rem;
      border: 1px solid var(--border-color);
    }

    .integration-settings h2 {
      margin: 0 0 0.5rem 0;
      font-size: 1.25rem;
    }

    .integration-section {
      margin-bottom: 1.5rem;
    }

    .integration-section:last-child {
      margin-bottom: 0;
    }

    .integration-section-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 0.75rem 0;
    }

    .integration-list {
      display: flex;
      flex-direction: column;
    }

    .integration-loading {
      text-align: center;
      padding: 2rem;
      color: var(--text-secondary);
    }

    .integration-error {
      text-align: center;
      padding: 2rem;
      color: var(--error-color);
    }

    .integration-empty {
      text-align: center;
      padding: 2rem;
      color: var(--text-secondary);
      background: var(--bg-secondary);
      border-radius: var(--radius-md);
    }
  `;

  document.head.appendChild(styles);
}

export default {
  createIntegrationSettings,
  addIntegrationSettingsStyles,
};
