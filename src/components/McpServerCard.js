/**
 * McpServerCard Component
 * Displays a single MCP server with its status, tools, and action buttons
 */

// Default icon for MCP servers
const DEFAULT_MCP_ICON = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
  <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
  <line x1="6" y1="6" x2="6.01" y2="6"/>
  <line x1="6" y1="18" x2="6.01" y2="18"/>
</svg>`;

// Category icons (subset of common categories)
const CATEGORY_ICONS = {
  search: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  development: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  productivity: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  database: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`,
  communication: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  utility: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  automation: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 2a10 10 0 0 1 10 10"/><circle cx="12" cy="12" r="6"/></svg>`,
};

const STATUS_COLORS = {
  active: '#22c55e',
  connected: '#22c55e',
  pending: '#f59e0b',
  error: '#ef4444',
  disabled: '#6b7280',
};

/**
 * Create an MCP server card element
 * @param {object} server - Server data
 * @param {boolean} isConnected - Whether the server is connected
 * @param {object} callbacks - Event callbacks
 * @returns {HTMLElement}
 */
export function createMcpServerCard(server, isConnected, { onConnect, onDisconnect, onRefresh, onSettings }) {
  const card = document.createElement('div');
  card.className = 'mcp-server-card';
  card.dataset.serverId = server.id;
  card.dataset.serverType = server.type || 'catalog';

  const category = server.category || 'utility';
  const icon = server.icon_url
    ? `<img src="${server.icon_url}" alt="${server.name}" />`
    : (CATEGORY_ICONS[category] || DEFAULT_MCP_ICON);

  const status = server.status || (isConnected ? 'connected' : 'pending');
  const statusColor = STATUS_COLORS[status] || STATUS_COLORS.pending;
  const toolsCount = server.tools_count || (server.tools_cache?.length || 0);

  const authRequired = server.auth_type && server.auth_type !== 'none';

  card.innerHTML = `
    <div class="mcp-server-card-inner">
      <div class="mcp-server-icon">
        ${icon}
      </div>
      <div class="mcp-server-info">
        <div class="mcp-server-header">
          <span class="mcp-server-name">${server.name}</span>
          ${server.verified ? '<span class="mcp-server-verified" title="Verified">✓</span>' : ''}
          ${isConnected ? `<span class="mcp-server-status" style="background: ${statusColor};"></span>` : ''}
        </div>
        <div class="mcp-server-description">${server.description || ''}</div>
        <div class="mcp-server-meta">
          ${server.category ? `<span class="mcp-server-category">${server.category}</span>` : ''}
          ${toolsCount > 0 ? `<span class="mcp-server-tools">${toolsCount} tool${toolsCount !== 1 ? 's' : ''}</span>` : ''}
          ${authRequired && !isConnected ? '<span class="mcp-server-auth">API key required</span>' : ''}
        </div>
        ${server.last_error ? `<div class="mcp-server-error">${server.last_error}</div>` : ''}
      </div>
      <div class="mcp-server-actions">
        ${isConnected ? `
          <button class="btn btn-sm btn-icon mcp-refresh-btn" title="Refresh tools">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </button>
          <button class="btn btn-sm btn-secondary mcp-disconnect-btn">Disconnect</button>
        ` : `
          <button class="btn btn-sm btn-primary mcp-connect-btn">Connect</button>
        `}
      </div>
    </div>
  `;

  // Attach event listeners
  const connectBtn = card.querySelector('.mcp-connect-btn');
  const disconnectBtn = card.querySelector('.mcp-disconnect-btn');
  const refreshBtn = card.querySelector('.mcp-refresh-btn');

  if (connectBtn && onConnect) {
    connectBtn.addEventListener('click', () => {
      connectBtn.disabled = true;
      connectBtn.textContent = 'Connecting...';
      onConnect(server);
    });
  }

  if (disconnectBtn && onDisconnect) {
    disconnectBtn.addEventListener('click', () => {
      if (confirm(`Disconnect ${server.name}? The agent will no longer be able to use its tools.`)) {
        disconnectBtn.disabled = true;
        disconnectBtn.textContent = 'Disconnecting...';
        onDisconnect(server);
      }
    });
  }

  if (refreshBtn && onRefresh) {
    refreshBtn.addEventListener('click', () => {
      refreshBtn.disabled = true;
      refreshBtn.classList.add('refreshing');
      onRefresh(server);
    });
  }

  return card;
}

/**
 * Add styles for MCP server cards
 */
export function addMcpServerCardStyles() {
  if (document.getElementById('mcp-server-card-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'mcp-server-card-styles';
  styles.textContent = `
    .mcp-server-card {
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      margin-bottom: 0.75rem;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .mcp-server-card:hover {
      border-color: var(--primary-color);
    }

    .mcp-server-card-inner {
      display: flex;
      align-items: flex-start;
      gap: 1rem;
      padding: 1rem;
    }

    .mcp-server-icon {
      width: 48px;
      height: 48px;
      border-radius: 10px;
      background: var(--bg-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .mcp-server-icon img {
      width: 32px;
      height: 32px;
      object-fit: contain;
    }

    .mcp-server-icon svg {
      width: 24px;
      height: 24px;
      color: var(--text-secondary);
    }

    .mcp-server-info {
      flex: 1;
      min-width: 0;
    }

    .mcp-server-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .mcp-server-name {
      font-weight: 600;
      font-size: 1rem;
      color: var(--text-primary);
    }

    .mcp-server-verified {
      font-size: 0.75rem;
      color: #22c55e;
      background: rgba(34, 197, 94, 0.1);
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
    }

    .mcp-server-status {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
    }

    .mcp-server-description {
      font-size: 0.875rem;
      color: var(--text-secondary);
      margin-top: 0.25rem;
      line-height: 1.4;
    }

    .mcp-server-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }

    .mcp-server-category,
    .mcp-server-tools,
    .mcp-server-auth {
      font-size: 0.75rem;
      padding: 0.125rem 0.5rem;
      border-radius: var(--radius-sm);
    }

    .mcp-server-category {
      color: var(--text-tertiary);
      background: var(--bg-secondary);
      text-transform: capitalize;
    }

    .mcp-server-tools {
      color: var(--primary-color);
      background: rgba(99, 102, 241, 0.1);
    }

    .mcp-server-auth {
      color: var(--warning-color, #f59e0b);
      background: rgba(245, 158, 11, 0.1);
    }

    .mcp-server-error {
      font-size: 0.75rem;
      color: var(--error-color);
      margin-top: 0.5rem;
      padding: 0.25rem 0.5rem;
      background: rgba(239, 68, 68, 0.1);
      border-radius: var(--radius-sm);
    }

    .mcp-server-actions {
      display: flex;
      gap: 0.5rem;
      flex-shrink: 0;
      align-items: center;
    }

    .mcp-server-actions .btn-icon {
      padding: 0.5rem;
      min-width: unset;
    }

    .mcp-server-actions .btn-icon svg {
      width: 16px;
      height: 16px;
    }

    .mcp-refresh-btn.refreshing svg {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @media (max-width: 600px) {
      .mcp-server-card-inner {
        flex-wrap: wrap;
      }

      .mcp-server-info {
        flex-basis: calc(100% - 64px);
      }

      .mcp-server-actions {
        flex-basis: 100%;
        margin-top: 0.75rem;
        justify-content: flex-end;
      }
    }
  `;

  document.head.appendChild(styles);
}

export default {
  createMcpServerCard,
  addMcpServerCardStyles,
};
