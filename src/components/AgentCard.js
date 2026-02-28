/**
 * AgentCard Component
 * Displays a single agent card with avatar, name, type, and actions
 */

import { showToast } from '../lib/toast.js';

// Agent type badge colors
const TYPE_COLORS = {
  inbound_voice:  { bg: '#e0f2fe', text: '#0369a1', label: 'Inbound Voice' },
  outbound_voice: { bg: '#fef3c7', text: '#b45309', label: 'Outbound Voice' },
  text:           { bg: '#dcfce7', text: '#15803d', label: 'Text' },
  email:          { bg: '#fce7f3', text: '#9d174d', label: 'Email' },
  chat_widget:    { bg: '#e0e7ff', text: '#4338ca', label: 'Chat Widget' },
  // Legacy types (backward compat)
  inbound:  { bg: '#e0f2fe', text: '#0369a1', label: 'Inbound Voice' },
  outbound: { bg: '#fef3c7', text: '#b45309', label: 'Outbound Voice' },
  both:     { bg: '#e0e7ff', text: '#4338ca', label: 'Inbound & Outbound' },
};

/**
 * Get initials from agent name
 */
function getAgentInitials(name) {
  if (!name) return 'AI';
  const parts = name.trim().split(' ');
  if (parts.length > 1) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

/**
 * Format relative time for "last edited" display
 */
function formatRelativeTime(date) {
  if (!date) return '';
  const now = new Date();
  const updated = new Date(date);
  const diffMs = now - updated;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return updated.toLocaleDateString();
}

/**
 * Create an agent card element
 * @param {object} agent - Agent config data
 * @param {function} onOpen - Callback when Open button clicked
 * @param {function} onDelete - Callback when Delete button clicked
 * @param {function} onToggleActive - Callback when active toggle changed
 * @returns {HTMLElement}
 */
export function createAgentCard(agent, { onOpen, onDelete, onToggleActive }) {
  const card = document.createElement('div');
  card.className = 'agent-card';
  card.dataset.agentId = agent.id;

  const typeColors = TYPE_COLORS[agent.agent_type] || TYPE_COLORS.inbound;
  const initials = getAgentInitials(agent.name);
  const lastEdited = formatRelativeTime(agent.updated_at);
  const isActive = agent.is_active !== false;

  card.innerHTML = `
    <div class="agent-card-header">
      <div class="agent-avatar" style="background: linear-gradient(135deg, #6366f1, #8b5cf6);">
        ${agent.avatar_url
          ? `<img src="${agent.avatar_url}" alt="${agent.name}" />`
          : `<span>${initials}</span>`
        }
      </div>
      <div class="agent-card-toggle">
        <span class="agent-card-status ${isActive ? 'active' : 'inactive'}">${isActive ? 'Active' : 'Inactive'}</span>
        <label class="agent-card-switch">
          <input type="checkbox" class="agent-active-checkbox" ${isActive ? 'checked' : ''} />
          <span class="agent-card-slider"></span>
        </label>
      </div>
    </div>
    <div class="agent-card-body">
      <h3 class="agent-name">${agent.name || 'Unnamed Agent'}</h3>
      <span class="agent-type-badge" style="background: ${typeColors.bg}; color: ${typeColors.text};">
        ${typeColors.label}
      </span>
      ${lastEdited ? `<p class="agent-last-edited">Edited ${lastEdited}</p>` : ''}
    </div>
    <div class="agent-card-actions">
      <button class="btn btn-primary agent-open-btn">Open</button>
      <button class="btn btn-secondary agent-delete-btn" title="Delete agent">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  `;

  // Attach event listeners
  const openBtn = card.querySelector('.agent-open-btn');
  const deleteBtn = card.querySelector('.agent-delete-btn');
  const activeCheckbox = card.querySelector('.agent-active-checkbox');

  if (openBtn && onOpen) {
    openBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onOpen(agent.id);
    });
  }

  if (deleteBtn && onDelete) {
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (agent.is_default) {
        showToast('Cannot delete the default agent. Set another agent as default first.', 'error');
        return;
      }
      if (confirm(`Are you sure you want to delete "${agent.name}"? This cannot be undone.`)) {
        deleteBtn.disabled = true;
        onDelete(agent.id);
      }
    });
  }

  if (activeCheckbox) {
    activeCheckbox.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    activeCheckbox.addEventListener('change', (e) => {
      e.stopPropagation();
      const newIsActive = e.target.checked;
      const statusLabel = card.querySelector('.agent-card-status');
      if (statusLabel) {
        statusLabel.textContent = newIsActive ? 'Active' : 'Inactive';
        statusLabel.classList.toggle('active', newIsActive);
        statusLabel.classList.toggle('inactive', !newIsActive);
      }
      if (onToggleActive) {
        onToggleActive(agent.id, newIsActive);
      }
    });
  }

  // Click on card also opens the agent
  card.addEventListener('click', () => {
    if (onOpen) onOpen(agent.id);
  });

  return card;
}

/**
 * Add styles for agent cards
 */
export function addAgentCardStyles() {
  if (document.getElementById('agent-card-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'agent-card-styles';
  styles.textContent = `
    .agents-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1.25rem;
    }

    .agent-card {
      background: white;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 1.25rem;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
    }

    .agent-card:hover {
      border-color: var(--primary-color);
      box-shadow: var(--shadow-md);
      transform: translateY(-2px);
    }

    .agent-card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .agent-avatar {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: 600;
      font-size: 1.25rem;
      overflow: hidden;
    }

    .agent-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .agent-card-toggle {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .agent-card-status {
      font-size: 0.7rem;
      font-weight: 500;
    }

    .agent-card-status.active {
      color: var(--success-color, #22c55e);
    }

    .agent-card-status.inactive {
      color: var(--text-tertiary);
    }

    .agent-card-switch {
      position: relative;
      display: inline-block;
      width: 32px;
      height: 18px;
      flex-shrink: 0;
    }

    .agent-card-switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .agent-card-slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: var(--border-color);
      transition: 0.3s;
      border-radius: 18px;
    }

    .agent-card-slider:before {
      position: absolute;
      content: "";
      height: 12px;
      width: 12px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: 0.3s;
      border-radius: 50%;
      box-shadow: 0 1px 2px rgba(0,0,0,0.2);
    }

    .agent-card-switch input:checked + .agent-card-slider {
      background-color: var(--primary-color);
    }

    .agent-card-switch input:checked + .agent-card-slider:before {
      transform: translateX(14px);
    }

    .agent-card-body {
      flex: 1;
      margin-bottom: 1rem;
    }

    .agent-name {
      font-size: 1.125rem;
      font-weight: 600;
      margin: 0 0 0.5rem 0;
      color: var(--text-primary);
    }

    .agent-type-badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 500;
      padding: 0.25rem 0.625rem;
      border-radius: var(--radius-sm);
    }

    .agent-last-edited {
      font-size: 0.8rem;
      color: var(--text-tertiary);
      margin: 0.75rem 0 0 0;
    }

    .agent-card-actions {
      display: flex;
      gap: 0.5rem;
    }

    .agent-card-actions .btn {
      flex: 1;
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
    }

    .agent-card-actions .agent-delete-btn {
      flex: 0;
      padding: 0.5rem 0.75rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .agent-card-actions .agent-delete-btn:hover {
      background: #fee2e2;
      border-color: #fecaca;
      color: #dc2626;
    }

    /* Create new agent card */
    .agent-card-new {
      border: 2px dashed var(--border-color);
      background: var(--bg-secondary);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 200px;
      gap: 0.75rem;
    }

    .agent-card-new:hover {
      border-color: var(--primary-color);
      background: white;
    }

    .agent-card-new-icon {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: var(--primary-color);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      font-weight: 300;
    }

    .agent-card-new-text {
      font-weight: 500;
      color: var(--text-secondary);
    }

    @media (max-width: 600px) {
      .agents-grid {
        grid-template-columns: 1fr;
        gap: 0.625rem;
      }

      /* Switch card to a 3-column grid: [avatar] [info] [controls] */
      .agent-card {
        display: grid;
        grid-template-columns: 40px 1fr auto;
        grid-template-rows: auto auto;
        column-gap: 0.75rem;
        row-gap: 0;
        padding: 0.875rem;
        align-items: start;
      }

      /* Dissolve the header so avatar + toggle become direct grid children */
      .agent-card-header {
        display: contents;
      }

      .agent-avatar {
        grid-column: 1;
        grid-row: 1 / 3;
        width: 40px;
        height: 40px;
        font-size: 1rem;
        align-self: center;
      }

      /* Toggle moves to top-right */
      .agent-card-toggle {
        grid-column: 3;
        grid-row: 1;
        flex-direction: column-reverse;
        align-items: flex-end;
        gap: 0.125rem;
      }

      .agent-card-status {
        font-size: 0.65rem;
      }

      /* Body takes the middle column */
      .agent-card-body {
        grid-column: 2;
        grid-row: 1 / 3;
        margin-bottom: 0;
        align-self: center;
      }

      .agent-name {
        font-size: 0.9375rem;
        margin-bottom: 0.25rem;
      }

      .agent-last-edited {
        display: none;
      }

      /* Actions goes to bottom-right */
      .agent-card-actions {
        grid-column: 3;
        grid-row: 2;
        flex: none;
        justify-content: flex-end;
        margin-top: 0.25rem;
      }

      .agent-card-actions .agent-open-btn {
        display: none;
      }

      .agent-card-actions .agent-delete-btn {
        flex: 0;
        padding: 0.375rem 0.5rem;
      }
    }
  `;

  document.head.appendChild(styles);
}

export default {
  createAgentCard,
  addAgentCardStyles,
};
