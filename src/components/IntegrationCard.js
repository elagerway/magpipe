/**
 * IntegrationCard Component
 * Displays a single integration with its status and action button
 */

// Icon definitions for integrations
const INTEGRATION_ICONS = {
  cal_com: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="24" height="24" rx="4" fill="#292929"/>
    <path d="M7 10h2v2H7v-2zm0 4h2v2H7v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2z" fill="#fff"/>
  </svg>`,
  slack: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.124 2.521a2.528 2.528 0 0 1 2.52-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.52V8.834zm-1.271 0a2.528 2.528 0 0 1-2.521 2.521 2.528 2.528 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 15.166 0a2.528 2.528 0 0 1 2.521 2.522v6.312zm-2.521 10.124a2.528 2.528 0 0 1 2.521 2.52A2.528 2.528 0 0 1 15.166 24a2.528 2.528 0 0 1-2.521-2.522v-2.52h2.521zm0-1.271a2.528 2.528 0 0 1-2.521-2.521 2.528 2.528 0 0 1 2.521-2.521h6.313A2.528 2.528 0 0 1 24 15.166a2.528 2.528 0 0 1-2.522 2.521h-6.312z" fill="#E01E5A"/>
  </svg>`,
  hubspot: `<svg width="24" height="24" viewBox="0 0 24 24" fill="#FF7A59" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.164 7.93V5.396a2.092 2.092 0 0 0 1.218-1.897c0-1.157-.94-2.095-2.097-2.095-1.157 0-2.097.938-2.097 2.095 0 .859.52 1.598 1.26 1.922v2.509a5.5 5.5 0 0 0-2.635 1.298l-6.92-5.374a2.17 2.17 0 0 0 .077-.549A2.167 2.167 0 0 0 4.804 1.14a2.167 2.167 0 0 0-2.166 2.166 2.167 2.167 0 0 0 2.166 2.165c.424 0 .82-.124 1.155-.335l6.812 5.289a5.505 5.505 0 0 0-.549 2.4c0 .867.201 1.687.558 2.418l-2.263 2.263a1.792 1.792 0 0 0-.55-.088 1.804 1.804 0 0 0-1.803 1.803 1.804 1.804 0 0 0 1.803 1.804 1.804 1.804 0 0 0 1.803-1.804c0-.198-.034-.388-.092-.566l2.235-2.235a5.526 5.526 0 0 0 3.373 1.145 5.527 5.527 0 0 0 5.528-5.527c0-2.593-1.792-4.768-4.2-5.367zm-3.882 8.586a3.219 3.219 0 0 1-3.215-3.215 3.219 3.219 0 0 1 3.215-3.215 3.219 3.219 0 0 1 3.215 3.215 3.219 3.219 0 0 1-3.215 3.215z"/>
  </svg>`,
  teams: `<svg width="24" height="24" viewBox="0 0 24 24" fill="#6264A7" xmlns="http://www.w3.org/2000/svg">
    <path d="M20.625 6h-2.25a.375.375 0 0 0-.375.375v2.25c0 .207.168.375.375.375h2.25A.375.375 0 0 0 21 8.625v-2.25A.375.375 0 0 0 20.625 6zM18 10.5a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm-3.75 0h-4.5A2.25 2.25 0 0 0 7.5 12.75v6a.75.75 0 0 0 .75.75h7.5a.75.75 0 0 0 .75-.75v-6a2.25 2.25 0 0 0-2.25-2.25zm-3 9.75v-3.75h3v3.75h-3zm-1.5 0H8.25v-4.5c0-.414.336-.75.75-.75h1.5v5.25zm4.5 0v-5.25h1.5c.414 0 .75.336.75.75v4.5h-2.25z"/>
    <path d="M12 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z"/>
  </svg>`,
  default: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
  </svg>`,
};

const CATEGORY_LABELS = {
  calendar: 'Calendar',
  communication: 'Communication',
  crm: 'CRM',
  productivity: 'Productivity',
};

/**
 * Create an integration card element
 * @param {object} integration - Integration data
 * @param {boolean} isConnected - Whether the integration is connected
 * @param {function} onConnect - Callback when Connect button clicked
 * @param {function} onDisconnect - Callback when Disconnect button clicked
 * @param {function} onSettings - Callback when Settings button clicked (optional)
 * @returns {HTMLElement}
 */
export function createIntegrationCard(integration, isConnected, { onConnect, onDisconnect, onSettings }) {
  const card = document.createElement('div');
  card.className = 'integration-card';
  card.dataset.integrationSlug = integration.slug;

  const icon = INTEGRATION_ICONS[integration.slug] || INTEGRATION_ICONS.default;
  const iconBg = isConnected ? 'var(--bg-secondary)' : '#f0f0f0';

  card.innerHTML = `
    <div class="integration-card-inner">
      <div class="integration-icon" style="background: ${iconBg};">
        ${integration.icon_url ? `<img src="${integration.icon_url}" alt="${integration.name}" />` : icon}
      </div>
      <div class="integration-info">
        <div class="integration-name">${integration.name}</div>
        <div class="integration-description">${integration.description || ''}</div>
        ${integration.category ? `<span class="integration-category">${CATEGORY_LABELS[integration.category] || integration.category}</span>` : ''}
      </div>
      <div class="integration-actions">
        ${isConnected ? `
          ${onSettings ? `<button class="btn btn-sm btn-secondary integration-settings-btn">Settings</button>` : ''}
          <button class="btn btn-sm btn-secondary integration-disconnect-btn">Disconnect</button>
        ` : `
          <button class="btn btn-sm btn-primary integration-connect-btn">Connect</button>
        `}
      </div>
    </div>
  `;

  // Attach event listeners
  const connectBtn = card.querySelector('.integration-connect-btn');
  const disconnectBtn = card.querySelector('.integration-disconnect-btn');
  const settingsBtn = card.querySelector('.integration-settings-btn');

  if (connectBtn && onConnect) {
    connectBtn.addEventListener('click', () => {
      connectBtn.disabled = true;
      connectBtn.textContent = 'Connecting...';
      onConnect(integration.slug);
    });
  }

  if (disconnectBtn && onDisconnect) {
    disconnectBtn.addEventListener('click', () => {
      if (confirm(`Are you sure you want to disconnect ${integration.name}?`)) {
        disconnectBtn.disabled = true;
        disconnectBtn.textContent = 'Disconnecting...';
        onDisconnect(integration.slug);
      }
    });
  }

  if (settingsBtn && onSettings) {
    settingsBtn.addEventListener('click', () => onSettings(integration.slug));
  }

  return card;
}

/**
 * Add styles for integration cards
 */
export function addIntegrationCardStyles() {
  if (document.getElementById('integration-card-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'integration-card-styles';
  styles.textContent = `
    .integration-card {
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      margin-bottom: 0.75rem;
      transition: border-color 0.2s;
    }

    .integration-card:hover {
      border-color: var(--primary-color);
    }

    .integration-card-inner {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
    }

    .integration-icon {
      width: 48px;
      height: 48px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .integration-icon img {
      width: 32px;
      height: 32px;
      object-fit: contain;
    }

    .integration-icon svg {
      width: 28px;
      height: 28px;
    }

    .integration-info {
      flex: 1;
      min-width: 0;
    }

    .integration-name {
      font-weight: 600;
      font-size: 1rem;
      color: var(--text-primary);
    }

    .integration-description {
      font-size: 0.875rem;
      color: var(--text-secondary);
      margin-top: 0.25rem;
      line-height: 1.4;
    }

    .integration-category {
      display: inline-block;
      font-size: 0.75rem;
      color: var(--text-tertiary);
      background: var(--bg-secondary);
      padding: 0.125rem 0.5rem;
      border-radius: var(--radius-sm);
      margin-top: 0.5rem;
    }

    .integration-actions {
      display: flex;
      gap: 0.5rem;
      flex-shrink: 0;
    }

    .integration-actions .btn-sm {
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
    }

    @media (max-width: 600px) {
      .integration-card-inner {
        flex-wrap: wrap;
      }

      .integration-info {
        flex-basis: calc(100% - 64px);
      }

      .integration-actions {
        flex-basis: 100%;
        margin-top: 0.5rem;
        justify-content: flex-end;
      }
    }
  `;

  document.head.appendChild(styles);
}

export default {
  createIntegrationCard,
  addIntegrationCardStyles,
};
