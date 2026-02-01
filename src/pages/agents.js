/**
 * Agents Page
 * List and manage multiple AI agents
 */

import { getCurrentUser } from '../lib/supabase.js';
import { renderBottomNav, attachBottomNav } from '../components/BottomNav.js';
import { createAgentCard, addAgentCardStyles } from '../components/AgentCard.js';
import { AgentConfig } from '../models/AgentConfig.js';
import { User } from '../models/index.js';

/**
 * Add styles for agents page
 */
function addAgentsPageStyles() {
  if (document.getElementById('agents-page-styles')) return;

  const styles = document.createElement('style');
  styles.id = 'agents-page-styles';
  styles.textContent = `
    .agents-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1.5rem;
      gap: 1rem;
    }

    @media (max-width: 480px) {
      .agents-header {
        flex-direction: column;
        align-items: stretch;
      }

      .agents-header .btn {
        width: 100%;
        justify-content: center;
      }
    }
  `;

  document.head.appendChild(styles);
}

export default class AgentsPage {
  constructor() {
    this.agents = [];
    this.userId = null;
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    this.userId = user.id;

    // Fetch user profile
    const { profile } = await User.getProfile(user.id);

    // Add component styles
    addAgentCardStyles();
    addAgentsPageStyles();

    // Load agents
    const { configs: agents, error } = await AgentConfig.getAllByUserId(user.id);
    this.agents = agents || [];

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container with-bottom-nav" style="max-width: 1000px; padding: 2rem 1rem;">
        <div class="agents-header">
          <div>
            <h1 style="margin: 0 0 0.25rem 0;">Agents</h1>
            <p style="margin: 0; color: var(--text-secondary); font-size: 0.9rem;">
              Create and manage your AI agents
            </p>
          </div>
          <button id="create-agent-btn" class="btn btn-primary" style="display: flex; align-items: center; gap: 0.5rem;">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            New Agent
          </button>
        </div>

        <div id="agents-container">
          ${this.agents.length === 0
            ? this.renderEmptyState()
            : `<div id="agents-grid" class="agents-grid"></div>`
          }
        </div>
      </div>
      ${renderBottomNav('/agents')}
    `;

    attachBottomNav();
    this.renderAgentCards();
    this.attachEventListeners();
  }

  renderEmptyState() {
    return `
      <div class="empty-state" style="text-align: center; padding: 4rem 2rem;">
        <div style="
          width: 80px;
          height: 80px;
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1.5rem;
        ">
          <svg width="40" height="40" fill="none" stroke="white" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
          </svg>
        </div>
        <h2 style="margin: 0 0 0.5rem 0; font-size: 1.25rem;">No agents yet</h2>
        <p style="margin: 0 0 1.5rem 0; color: var(--text-secondary); max-width: 400px; margin-left: auto; margin-right: auto;">
          Create your first AI agent to handle phone calls and messages on your behalf.
        </p>
        <button id="create-first-agent-btn" class="btn btn-primary" style="padding: 0.75rem 1.5rem;">
          Create Your First Agent
        </button>
      </div>
    `;
  }

  renderAgentCards() {
    const grid = document.getElementById('agents-grid');
    if (!grid) return;

    grid.innerHTML = '';

    // Add existing agent cards
    this.agents.forEach(agent => {
      const card = createAgentCard(agent, {
        onOpen: (agentId) => this.openAgent(agentId),
        onDelete: (agentId) => this.deleteAgent(agentId),
        onToggleActive: (agentId, isActive) => this.toggleAgentActive(agentId, isActive),
      });
      grid.appendChild(card);
    });

    // Note: "Create New Agent" tile removed - use "+ New Agent" button in header instead
    // Empty state already shows "Create Your First Agent" when no agents exist
  }

  attachEventListeners() {
    // Create agent button (header)
    const createBtn = document.getElementById('create-agent-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => this.createNewAgent());
    }

    // Create first agent button (empty state)
    const createFirstBtn = document.getElementById('create-first-agent-btn');
    if (createFirstBtn) {
      createFirstBtn.addEventListener('click', () => this.createNewAgent());
    }
  }

  openAgent(agentId) {
    navigateTo(`/agents/${agentId}`);
  }

  async createNewAgent() {
    try {
      const { config: newAgent, error } = await AgentConfig.createAgent(this.userId, {
        name: `Agent ${this.agents.length + 1}`,
        agent_type: 'inbound',
      });

      if (error) {
        console.error('Error creating agent:', error);
        alert('Failed to create agent. Please try again.');
        return;
      }

      // Navigate to the new agent's detail page
      navigateTo(`/agents/${newAgent.id}`);
    } catch (err) {
      console.error('Error creating agent:', err);
      alert('Failed to create agent. Please try again.');
    }
  }

  async deleteAgent(agentId) {
    try {
      const { error } = await AgentConfig.deleteAgent(agentId);

      if (error) {
        console.error('Error deleting agent:', error);
        alert('Failed to delete agent. Please try again.');
        return;
      }

      // Remove from local list and re-render
      this.agents = this.agents.filter(a => a.id !== agentId);

      if (this.agents.length === 0) {
        // Show empty state
        document.getElementById('agents-container').innerHTML = this.renderEmptyState();
        this.attachEventListeners();
      } else {
        this.renderAgentCards();
      }
    } catch (err) {
      console.error('Error deleting agent:', err);
      alert('Failed to delete agent. Please try again.');
    }
  }

  async toggleAgentActive(agentId, isActive) {
    try {
      const { error } = await AgentConfig.updateById(agentId, { is_active: isActive });

      if (error) {
        console.error('Error updating agent:', error);
        // Revert the toggle in UI
        this.renderAgentCards();
        return;
      }

      // Update local state
      const agent = this.agents.find(a => a.id === agentId);
      if (agent) {
        agent.is_active = isActive;
      }
    } catch (err) {
      console.error('Error updating agent:', err);
      // Revert the toggle in UI
      this.renderAgentCards();
    }
  }

  cleanup() {
    this.agents = [];
    this.userId = null;
  }
}
