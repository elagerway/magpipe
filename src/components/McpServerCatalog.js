/**
 * McpServerCatalog Component
 * Main MCP Servers section for Settings page
 * Shows catalog, connected servers, and option to add custom servers
 */

import { supabase } from '../lib/supabase.js';
import { createMcpServerCard, addMcpServerCardStyles } from './McpServerCard.js';
import { showAddCustomMcpServerModal } from './AddCustomMcpServer.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Create the MCP Servers settings section
 * @param {string} containerId - DOM element ID to render into
 * @returns {object} - Controller with refresh method
 */
export async function createMcpServerCatalog(containerId) {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error('MCP Catalog container not found:', containerId);
    return null;
  }

  // Add styles
  addMcpServerCardStyles();
  addMcpCatalogStyles();

  // Show loading state
  container.innerHTML = `
    <div class="mcp-catalog">
      <div class="mcp-catalog-header">
        <div>
          <h2>MCP Servers</h2>
          <p class="text-muted">Connect MCP servers to give your agent new capabilities</p>
        </div>
        <button class="btn btn-primary btn-sm" id="add-custom-server-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Custom
        </button>
      </div>
      <div class="mcp-catalog-loading">Loading MCP servers...</div>
    </div>
  `;

  // Attach Add Custom handler early
  const addCustomBtn = container.querySelector('#add-custom-server-btn');
  if (addCustomBtn) {
    addCustomBtn.addEventListener('click', () => {
      showAddCustomMcpServerModal({
        onSuccess: () => createMcpServerCatalog(containerId),
      });
    });
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    // Fetch catalog, custom servers, and connections in parallel
    const [catalogResult, customServersResult, connectionsResult] = await Promise.all([
      supabase
        .from('mcp_server_catalog')
        .select('*')
        .eq('enabled', true)
        .order('featured', { ascending: false })
        .order('name'),
      supabase
        .from('user_mcp_servers')
        .select('*')
        .eq('user_id', session.user.id)
        .order('name'),
      supabase
        .from('user_mcp_connections')
        .select(`
          *,
          catalog:mcp_server_catalog(id, name, slug, description, icon_url, category, auth_type, verified)
        `)
        .eq('user_id', session.user.id),
    ]);

    const catalog = catalogResult.data || [];
    const customServers = customServersResult.data || [];
    const connections = connectionsResult.data || [];

    // Create sets of connected catalog server IDs
    const connectedCatalogIds = new Set(connections.map(c => c.catalog_server_id));

    // Render the section
    renderCatalog(
      container,
      catalog,
      customServers,
      connections,
      connectedCatalogIds,
      session.access_token,
      containerId
    );

  } catch (error) {
    console.error('Failed to load MCP servers:', error);
    container.innerHTML = `
      <div class="mcp-catalog">
        <h2>MCP Servers</h2>
        <div class="mcp-catalog-error">
          Failed to load MCP servers. <button class="btn btn-sm btn-secondary" onclick="location.reload()">Retry</button>
        </div>
      </div>
    `;
  }

  return {
    refresh: () => createMcpServerCatalog(containerId),
  };
}

function renderCatalog(container, catalog, customServers, connections, connectedCatalogIds, accessToken, containerId) {
  // Separate catalog into featured, connected, and available
  const featured = catalog.filter(s => s.featured && !connectedCatalogIds.has(s.id));
  const connectedCatalog = catalog.filter(s => connectedCatalogIds.has(s.id));
  const available = catalog.filter(s => !s.featured && !connectedCatalogIds.has(s.id));

  // Get connection data for connected catalog servers
  const connectionByServerId = {};
  for (const conn of connections) {
    connectionByServerId[conn.catalog_server_id] = conn;
  }

  container.innerHTML = `
    <div class="mcp-catalog">
      <div class="mcp-catalog-header">
        <div>
          <h2>MCP Servers</h2>
          <p class="text-muted">Connect MCP servers to give your agent new capabilities</p>
        </div>
        <button class="btn btn-primary btn-sm" id="add-custom-server-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Custom
        </button>
      </div>

      <!-- Tabs -->
      <div class="mcp-tabs">
        <button class="mcp-tab active" data-tab="connected">Connected (${customServers.length + connectedCatalog.length})</button>
        <button class="mcp-tab" data-tab="catalog">Browse Catalog</button>
        <div class="mcp-search-wrapper">
          <svg class="mcp-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input type="text" class="mcp-search-input" id="mcp-catalog-search" placeholder="Search servers..." />
        </div>
      </div>

      <!-- Connected Tab -->
      <div class="mcp-tab-content" id="tab-connected">
        ${customServers.length === 0 && connectedCatalog.length === 0 ? `
          <div class="mcp-empty-state">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
              <line x1="6" y1="6" x2="6.01" y2="6"/>
              <line x1="6" y1="18" x2="6.01" y2="18"/>
            </svg>
            <h4>No servers connected</h4>
            <p>Browse the catalog or add a custom server to get started.</p>
          </div>
        ` : `
          ${customServers.length > 0 ? `
            <div class="mcp-section">
              <h3 class="mcp-section-title">Custom Servers</h3>
              <div class="mcp-server-list" id="custom-servers-list"></div>
            </div>
          ` : ''}
          ${connectedCatalog.length > 0 ? `
            <div class="mcp-section">
              <h3 class="mcp-section-title">From Catalog</h3>
              <div class="mcp-server-list" id="connected-catalog-list"></div>
            </div>
          ` : ''}
        `}
      </div>

      <!-- Catalog Tab -->
      <div class="mcp-tab-content" id="tab-catalog" style="display: none;">
        ${featured.length > 0 ? `
          <div class="mcp-section">
            <h3 class="mcp-section-title">Featured</h3>
            <div class="mcp-server-list" id="featured-servers-list"></div>
          </div>
        ` : ''}
        ${available.length > 0 ? `
          <div class="mcp-section">
            <h3 class="mcp-section-title">All Servers</h3>
            <div class="mcp-server-list" id="available-servers-list"></div>
          </div>
        ` : ''}
        ${featured.length === 0 && available.length === 0 ? `
          <div class="mcp-empty-state">
            <p>All catalog servers are already connected!</p>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  // Tab switching
  const tabs = container.querySelectorAll('.mcp-tab');
  const tabContents = container.querySelectorAll('.mcp-tab-content');
  const searchInput = container.querySelector('#mcp-catalog-search');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const tabId = tab.dataset.tab;
      tabContents.forEach(content => {
        content.style.display = content.id === `tab-${tabId}` ? 'block' : 'none';
      });

      // Show/hide search based on tab
      const searchWrapper = container.querySelector('.mcp-search-wrapper');
      if (searchWrapper) {
        searchWrapper.style.display = tabId === 'catalog' ? 'flex' : 'none';
      }
    });
  });

  // Search functionality
  if (searchInput) {
    // Hide search initially (Connected tab is active)
    const searchWrapper = container.querySelector('.mcp-search-wrapper');
    if (searchWrapper) searchWrapper.style.display = 'none';

    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      filterCatalogServers(container, query, featured, available, handleConnect);
    });
  }

  // Attach Add Custom handler
  const addCustomBtn = container.querySelector('#add-custom-server-btn');
  if (addCustomBtn) {
    addCustomBtn.addEventListener('click', () => {
      showAddCustomMcpServerModal({
        onSuccess: () => createMcpServerCatalog(containerId),
      });
    });
  }

  // Create callbacks
  const handleConnect = async (server) => {
    try {
      // Show API key modal if auth required
      if (server.auth_type && server.auth_type !== 'none') {
        const apiKey = prompt(`Enter your API key for ${server.name}:`);
        if (!apiKey) {
          createMcpServerCatalog(containerId);
          return;
        }

        const response = await fetch(`${SUPABASE_URL}/functions/v1/mcp-server-validate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            action: 'connect_catalog',
            catalog_server_id: server.id,
            api_key: apiKey,
          }),
        });

        const result = await response.json();
        if (result.error) {
          alert(result.error);
        }
      } else {
        // No auth required, just connect
        const response = await fetch(`${SUPABASE_URL}/functions/v1/mcp-server-validate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'apikey': SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            action: 'connect_catalog',
            catalog_server_id: server.id,
          }),
        });

        const result = await response.json();
        if (result.error) {
          alert(result.error);
        }
      }

      createMcpServerCatalog(containerId);
    } catch (error) {
      console.error('Connect error:', error);
      alert('Failed to connect. Please try again.');
      createMcpServerCatalog(containerId);
    }
  };

  const handleDisconnect = async (server) => {
    try {
      const serverType = server.type || (server.catalog_server_id ? 'catalog' : 'custom');
      const serverId = server.connection_id || server.id;

      const response = await fetch(`${SUPABASE_URL}/functions/v1/mcp-server-validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          action: 'disconnect',
          server_id: serverId,
          server_type: serverType,
        }),
      });

      const result = await response.json();
      if (result.error) {
        alert(result.error);
      }

      createMcpServerCatalog(containerId);
    } catch (error) {
      console.error('Disconnect error:', error);
      alert('Failed to disconnect. Please try again.');
      createMcpServerCatalog(containerId);
    }
  };

  const handleRefresh = async (server) => {
    try {
      const serverType = server.type || (server.catalog_server_id ? 'catalog' : 'custom');
      const serverId = server.connection_id || server.id;

      const response = await fetch(`${SUPABASE_URL}/functions/v1/mcp-server-validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          action: 'refresh_tools',
          server_id: serverId,
          server_type: serverType,
        }),
      });

      const result = await response.json();
      if (result.error) {
        alert(result.error);
      } else {
        // Show toast or update card
        alert(`Refreshed! Found ${result.tools_count} tools.`);
      }

      createMcpServerCatalog(containerId);
    } catch (error) {
      console.error('Refresh error:', error);
      alert('Failed to refresh. Please try again.');
      createMcpServerCatalog(containerId);
    }
  };

  // Render custom servers
  const customServersList = container.querySelector('#custom-servers-list');
  if (customServersList) {
    for (const server of customServers) {
      const card = createMcpServerCard(
        { ...server, type: 'custom' },
        true,
        { onDisconnect: handleDisconnect, onRefresh: handleRefresh }
      );
      customServersList.appendChild(card);
    }
  }

  // Render connected catalog servers
  const connectedCatalogList = container.querySelector('#connected-catalog-list');
  if (connectedCatalogList) {
    for (const catalogServer of connectedCatalog) {
      const connection = connectionByServerId[catalogServer.id];
      const serverData = {
        ...catalogServer,
        type: 'catalog',
        connection_id: connection?.id,
        status: connection?.status,
        tools_cache: connection?.tools_cache,
        last_error: connection?.last_error,
      };
      const card = createMcpServerCard(
        serverData,
        true,
        { onDisconnect: handleDisconnect, onRefresh: handleRefresh }
      );
      connectedCatalogList.appendChild(card);
    }
  }

  // Render featured servers
  const featuredList = container.querySelector('#featured-servers-list');
  if (featuredList) {
    for (const server of featured) {
      const card = createMcpServerCard(
        { ...server, type: 'catalog' },
        false,
        { onConnect: handleConnect }
      );
      featuredList.appendChild(card);
    }
  }

  // Render available servers
  const availableList = container.querySelector('#available-servers-list');
  if (availableList) {
    for (const server of available) {
      const card = createMcpServerCard(
        { ...server, type: 'catalog' },
        false,
        { onConnect: handleConnect }
      );
      availableList.appendChild(card);
    }
  }
}

/**
 * Filter and re-render catalog servers based on search query
 */
function filterCatalogServers(container, query, featured, available, handleConnect) {
  const featuredList = container.querySelector('#featured-servers-list');
  const availableList = container.querySelector('#available-servers-list');
  const featuredSection = featuredList?.closest('.mcp-section');
  const availableSection = availableList?.closest('.mcp-section');

  // Filter function
  const matchesQuery = (server) => {
    if (!query) return true;
    const name = (server.name || '').toLowerCase();
    const description = (server.description || '').toLowerCase();
    const category = (server.category || '').toLowerCase();
    return name.includes(query) || description.includes(query) || category.includes(query);
  };

  // Filter servers
  const filteredFeatured = featured.filter(matchesQuery);
  const filteredAvailable = available.filter(matchesQuery);

  // Re-render featured
  if (featuredList) {
    featuredList.innerHTML = '';
    for (const server of filteredFeatured) {
      const card = createMcpServerCard(
        { ...server, type: 'catalog' },
        false,
        { onConnect: handleConnect }
      );
      featuredList.appendChild(card);
    }
    if (featuredSection) {
      featuredSection.style.display = filteredFeatured.length > 0 ? 'block' : 'none';
    }
  }

  // Re-render available
  if (availableList) {
    availableList.innerHTML = '';
    for (const server of filteredAvailable) {
      const card = createMcpServerCard(
        { ...server, type: 'catalog' },
        false,
        { onConnect: handleConnect }
      );
      availableList.appendChild(card);
    }
    if (availableSection) {
      availableSection.style.display = filteredAvailable.length > 0 ? 'block' : 'none';
    }
  }

  // Show empty state if no results
  const tabCatalog = container.querySelector('#tab-catalog');
  let emptyState = tabCatalog?.querySelector('.mcp-search-empty');

  if (filteredFeatured.length === 0 && filteredAvailable.length === 0 && query) {
    if (!emptyState) {
      emptyState = document.createElement('div');
      emptyState.className = 'mcp-search-empty mcp-empty-state';
      emptyState.innerHTML = `
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <h4>No servers found</h4>
        <p>Try a different search term or add a custom server.</p>
      `;
      tabCatalog?.appendChild(emptyState);
    }
    emptyState.style.display = 'block';
  } else if (emptyState) {
    emptyState.style.display = 'none';
  }
}

/**
 * Add styles for the MCP Catalog section
 */
export function addMcpCatalogStyles() {
  if (document.getElementById('mcp-catalog-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'mcp-catalog-styles';
  styles.textContent = `
    .mcp-catalog {
      background: var(--bg-primary);
      border-radius: var(--radius-lg);
      padding: 1.5rem;
      border: 1px solid var(--border-color);
    }

    .mcp-catalog-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .mcp-catalog-header h2 {
      margin: 0 0 0.25rem 0;
      font-size: 1.25rem;
    }

    .mcp-catalog-header p {
      margin: 0;
    }

    .mcp-catalog-header .btn svg {
      margin-right: 0.25rem;
    }

    .mcp-tabs {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 0.5rem;
    }

    .mcp-tab {
      padding: 0.5rem 1rem;
      background: none;
      border: none;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--text-secondary);
      cursor: pointer;
      border-radius: var(--radius-md);
      transition: all 0.2s;
    }

    .mcp-tab:hover {
      color: var(--text-primary);
      background: var(--bg-secondary);
    }

    .mcp-tab.active {
      color: var(--primary-color);
      background: rgba(99, 102, 241, 0.1);
    }

    .mcp-search-wrapper {
      display: flex;
      align-items: center;
      margin-left: auto;
      position: relative;
    }

    .mcp-search-icon {
      position: absolute;
      left: 0.75rem;
      color: var(--text-tertiary);
      pointer-events: none;
    }

    .mcp-search-input {
      padding: 0.5rem 0.75rem 0.5rem 2.25rem;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      font-size: 0.875rem;
      background: var(--bg-primary);
      color: var(--text-primary);
      width: 200px;
      transition: all 0.2s;
    }

    .mcp-search-input:focus {
      outline: none;
      border-color: var(--primary-color);
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }

    .mcp-search-input::placeholder {
      color: var(--text-tertiary);
    }

    .mcp-search-empty {
      margin-top: 1rem;
    }

    .mcp-section {
      margin-bottom: 1.5rem;
    }

    .mcp-section:last-child {
      margin-bottom: 0;
    }

    .mcp-section-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 0.75rem 0;
    }

    .mcp-server-list {
      display: flex;
      flex-direction: column;
    }

    .mcp-catalog-loading {
      text-align: center;
      padding: 2rem;
      color: var(--text-secondary);
    }

    .mcp-catalog-error {
      text-align: center;
      padding: 2rem;
      color: var(--error-color);
    }

    .mcp-empty-state {
      text-align: center;
      padding: 3rem 2rem;
      color: var(--text-secondary);
    }

    .mcp-empty-state svg {
      margin-bottom: 1rem;
      color: var(--text-tertiary);
    }

    .mcp-empty-state h4 {
      margin: 0 0 0.5rem 0;
      color: var(--text-primary);
    }

    .mcp-empty-state p {
      margin: 0;
    }

    @media (max-width: 600px) {
      .mcp-catalog-header {
        flex-direction: column;
      }

      .mcp-catalog-header .btn {
        align-self: flex-start;
      }

      .mcp-tabs {
        flex-wrap: wrap;
      }

      .mcp-search-wrapper {
        width: 100%;
        margin-left: 0;
        margin-top: 0.5rem;
        order: 3;
      }

      .mcp-search-input {
        width: 100%;
      }
    }
  `;

  document.head.appendChild(styles);
}

export default {
  createMcpServerCatalog,
  addMcpCatalogStyles,
};
