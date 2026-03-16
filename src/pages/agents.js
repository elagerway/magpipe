/**
 * Agents Page
 * List and manage multiple AI agents
 */

import { getCurrentUser, supabase } from '../lib/supabase.js';
import { renderBottomNav, attachBottomNav } from '../components/BottomNav.js';
import { createAgentCard, addAgentCardStyles } from '../components/AgentCard.js';
import { AgentConfig } from '../models/AgentConfig.js';
import { User } from '../models/index.js';
import { showToast } from '../lib/toast.js';

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

    /* Search / sort / filter toolbar */
    .agents-toolbar {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.25rem;
      flex-wrap: wrap;
    }

    .agents-search-wrap {
      position: relative;
      flex: 1;
      min-width: 180px;
    }

    .agents-search-icon {
      position: absolute;
      left: 0.65rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-secondary);
      pointer-events: none;
    }

    .agents-search {
      width: 100%;
      padding: 0.5rem 0.75rem 0.5rem 2.1rem;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md, 8px);
      font-size: 0.875rem;
      background: white;
      color: var(--text-primary);
      outline: none;
      box-sizing: border-box;
    }

    .agents-search:focus {
      border-color: var(--primary-color);
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }

    .agents-toolbar-right {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .agents-select {
      padding: 0.5rem 0.65rem;
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md, 8px);
      font-size: 0.875rem;
      background: white;
      color: var(--text-primary);
      cursor: pointer;
      outline: none;
    }

    .agents-select:focus {
      border-color: var(--primary-color);
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }

    @media (max-width: 600px) {
      .agents-toolbar {
        flex-direction: column;
        align-items: stretch;
      }
      .agents-toolbar-right {
        justify-content: stretch;
      }
      .agents-select {
        flex: 1;
      }
    }

    /* Modal styles */
    .voice-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      padding: 1rem;
    }

    .voice-modal {
      background: white;
      border-radius: var(--radius-lg);
      width: 100%;
      max-width: 500px;
      max-height: 80vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .voice-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--border-color);
    }

    .voice-modal-header h3 {
      margin: 0;
      font-size: 1.1rem;
    }

    .close-modal-btn {
      background: none;
      border: none;
      font-size: 1.5rem;
      color: var(--text-secondary);
      cursor: pointer;
      padding: 0;
      line-height: 1;
    }

    .voice-modal-content {
      padding: 1rem 1.25rem;
      overflow-y: auto;
    }

    /* Agent type selection grid */
    .agent-type-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }

    @media (max-width: 480px) {
      .agent-type-grid {
        grid-template-columns: 1fr;
      }
    }

    .agent-type-card {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem;
      background: white;
      border: 1.5px solid var(--border-color);
      border-radius: var(--radius-lg);
      cursor: pointer;
      transition: all 0.15s ease;
      text-align: left;
      width: 100%;
    }

    .agent-type-card:hover {
      border-color: var(--primary-color);
      box-shadow: var(--shadow-sm);
      transform: translateY(-1px);
    }

    .agent-type-card-icon {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .agent-type-card-info {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    .agent-type-card-title {
      font-weight: 600;
      font-size: 0.9rem;
      color: var(--text-primary);
    }

    .agent-type-card-desc {
      font-size: 0.8rem;
      color: var(--text-secondary);
    }
  `;

  document.head.appendChild(styles);
}

export default class AgentsPage {
  constructor() {
    this.agents = [];
    this.serviceNumbers = [];
    this.userId = null;
    this._searchQuery = '';
    this._sortBy = 'name_asc';
    this._filterType = 'all';
    this._filterStatus = 'all';
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    this.userId = user.id;

    // Add component styles
    addAgentCardStyles();
    addAgentsPageStyles();

    // Load profile, agents, and service numbers in parallel
    const [{ profile }, agentsResult, numbersResult] = await Promise.all([
      User.getProfile(user.id),
      AgentConfig.getAllByUserId(user.id),
      supabase.from('service_numbers').select('id, phone_number, agent_id, text_agent_id').eq('user_id', user.id).eq('is_active', true)
    ]);
    this.agents = agentsResult.configs || [];
    this.serviceNumbers = numbersResult.data || [];

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

        ${this.agents.length > 0 ? `
        <div class="agents-toolbar">
          <div class="agents-search-wrap">
            <svg class="agents-search-icon" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35"/>
            </svg>
            <input id="agents-search" class="agents-search" type="search" placeholder="Search agents…" value="" autocomplete="off" />
          </div>
          <div class="agents-toolbar-right">
            <select id="agents-filter-type" class="agents-select">
              <option value="all">All types</option>
              <option value="inbound_voice">Inbound Voice</option>
              <option value="outbound_voice">Outbound Voice</option>
              <option value="text">Text / SMS</option>
              <option value="chat_widget">Chat Widget</option>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
            <select id="agents-filter-status" class="agents-select">
              <option value="all">Any status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select id="agents-sort" class="agents-select">
              <option value="name_asc">Name A–Z</option>
              <option value="updated_desc">Recently edited</option>
              <option value="updated_asc">Least recently edited</option>
              <option value="name_desc">Name Z–A</option>
              <option value="created_desc">Newest</option>
              <option value="created_asc">Oldest</option>
            </select>
          </div>
        </div>
        ` : ''}

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

  getFilteredSortedAgents() {
    let list = [...this.agents];

    // Search
    const q = this._searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(a => (a.name || '').toLowerCase().includes(q) || (a.id || '').toLowerCase().includes(q));
    }

    // Filter by type
    if (this._filterType !== 'all') {
      list = list.filter(a => a.agent_type === this._filterType);
    }

    // Filter by status
    if (this._filterStatus === 'active') {
      list = list.filter(a => a.is_active !== false);
    } else if (this._filterStatus === 'inactive') {
      list = list.filter(a => a.is_active === false);
    }

    // Sort
    list.sort((a, b) => {
      switch (this._sortBy) {
        case 'name_asc':  return (a.name || '').localeCompare(b.name || '');
        case 'name_desc': return (b.name || '').localeCompare(a.name || '');
        case 'created_asc':  return new Date(a.created_at) - new Date(b.created_at);
        case 'created_desc': return new Date(b.created_at) - new Date(a.created_at);
        case 'updated_asc':  return new Date(a.updated_at) - new Date(b.updated_at);
        case 'updated_desc':
        default:             return new Date(b.updated_at) - new Date(a.updated_at);
      }
    });

    return list;
  }

  renderAgentCards() {
    const grid = document.getElementById('agents-grid');
    if (!grid) return;

    const visible = this.getFilteredSortedAgents();

    grid.innerHTML = '';

    if (visible.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--text-secondary);">
          No agents match your search.
        </div>`;
      return;
    }

    visible.forEach(agent => {
      const card = createAgentCard(agent, {
        onOpen: (agentId) => this.openAgent(agentId),
        onDelete: (agentId) => this.deleteAgent(agentId),
        onToggleActive: (agentId, isActive) => this.toggleAgentActive(agentId, isActive),
      });
      grid.appendChild(card);
    });
  }

  attachEventListeners() {
    // Create agent button (header)
    const createBtn = document.getElementById('create-agent-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => this.showCreateAgentModal());
    }

    // Create first agent button (empty state)
    const createFirstBtn = document.getElementById('create-first-agent-btn');
    if (createFirstBtn) {
      createFirstBtn.addEventListener('click', () => this.showCreateAgentModal());
    }

    // Search
    const searchInput = document.getElementById('agents-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this._searchQuery = e.target.value;
        this.renderAgentCards();
      });
    }

    // Filter: type
    const filterType = document.getElementById('agents-filter-type');
    if (filterType) {
      filterType.addEventListener('change', (e) => {
        this._filterType = e.target.value;
        this.renderAgentCards();
      });
    }

    // Filter: status
    const filterStatus = document.getElementById('agents-filter-status');
    if (filterStatus) {
      filterStatus.addEventListener('change', (e) => {
        this._filterStatus = e.target.value;
        this.renderAgentCards();
      });
    }

    // Sort
    const sortSelect = document.getElementById('agents-sort');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this._sortBy = e.target.value;
        this.renderAgentCards();
      });
    }
  }

  openAgent(agentId) {
    navigateTo(`/agents/${agentId}`);
  }

  showCreateAgentModal() {
    const AGENT_TYPE_OPTIONS = [
      {
        type: 'inbound_voice',
        title: 'Inbound Voice',
        description: 'Answer incoming phone calls',
        icon: '<svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/><polyline points="15 3 15 8 20 8" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
        color: '#0369a1',
        bg: '#e0f2fe',
      },
      {
        type: 'outbound_voice',
        title: 'Outbound Voice',
        description: 'Make calls on your behalf',
        icon: '<svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 3l4 4-4 4"/></svg>',
        color: '#b45309',
        bg: '#fef3c7',
      },
      {
        type: 'text',
        title: 'Text / SMS',
        description: 'Handle text message conversations',
        icon: '<svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>',
        color: '#15803d',
        bg: '#dcfce7',
      },
      {
        type: 'email',
        title: 'Email',
        description: 'Draft and respond to emails',
        icon: '<svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>',
        color: '#9d174d',
        bg: '#fce7f3',
      },
      {
        type: 'chat_widget',
        title: 'Chat Widget',
        description: 'Live chat on your website',
        icon: '<svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a2 2 0 01-2-2v-1M13 6V4a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l4-4h2a2 2 0 002-2V6z"/></svg>',
        color: '#4338ca',
        bg: '#e0e7ff',
      },
      {
        type: 'whatsapp',
        title: 'WhatsApp',
        description: 'Handle WhatsApp conversations',
        icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>',
        color: '#15803d',
        bg: '#dcfce7',
      },
    ];

    // Build and insert modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'contact-modal-overlay';
    overlay.id = 'create-agent-modal-overlay';
    overlay.style.display = 'flex';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = 'none'; };

    overlay.innerHTML = `
      <div class="contact-modal" style="max-width: 600px;" onclick="event.stopPropagation()">
        <div class="contact-modal-header">
          <h3>Create New Agent</h3>
          <button class="close-modal-btn" id="close-create-agent-modal">&times;</button>
        </div>
        <div class="contact-modal-body">
          <p style="margin: 0 0 1rem; color: var(--text-secondary); font-size: 0.9rem;">Choose the type of agent you want to create.</p>
          <div class="agent-type-grid">
            ${AGENT_TYPE_OPTIONS.map(opt => `
              <button class="agent-type-card" data-agent-type="${opt.type}">
                <div class="agent-type-card-icon" style="background: ${opt.bg}; color: ${opt.color};">
                  ${opt.icon}
                </div>
                <div class="agent-type-card-info">
                  <span class="agent-type-card-title">${opt.title}</span>
                  <span class="agent-type-card-desc">${opt.description}</span>
                </div>
              </button>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Close button
    overlay.querySelector('#close-create-agent-modal').addEventListener('click', () => {
      overlay.style.display = 'none';
      overlay.remove();
    });

    // Type card click handlers
    overlay.querySelectorAll('.agent-type-card').forEach(card => {
      card.addEventListener('click', async () => {
        const type = card.dataset.agentType;
        overlay.style.display = 'none';
        overlay.remove();
        await this.createAgentWithType(type);
      });
    });
  }

  async createAgentWithType(agentType) {
    try {
      const { config: newAgent, error } = await AgentConfig.createAgent(this.userId, {
        name: `Agent ${this.agents.length + 1}`,
        agent_type: agentType,
      });

      if (error) {
        console.error('Error creating agent:', error);
        showToast('Failed to create agent. Please try again.', 'error');
        return;
      }

      // Navigate to the new agent's detail page
      navigateTo(`/agents/${newAgent.id}`);
    } catch (err) {
      console.error('Error creating agent:', err);
      showToast('Failed to create agent. Please try again.', 'error');
    }
  }

  async deleteAgent(agentId) {
    try {
      const { error } = await AgentConfig.deleteAgent(agentId);

      if (error) {
        console.error('Error deleting agent:', error);
        showToast('Failed to delete agent. Please try again.', 'error');
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
      showToast('Failed to delete agent. Please try again.', 'error');
    }
  }

  async toggleAgentActive(agentId, isActive) {
    try {
      // Check if trying to activate without a deployed number
      if (isActive) {
        const agent = this.agents.find(a => a.id === agentId);
        const isTextAgent = agent?.agent_type === 'text';
        const hasNumber = isTextAgent
          ? this.serviceNumbers.some(n => n.text_agent_id === agentId)
          : this.serviceNumbers.some(n => n.agent_id === agentId);
        if (!hasNumber) {
          this.showNoNumberModal(agentId);
          // Revert the toggle in UI
          this.renderAgentCards();
          return;
        }
      }

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

  showNoNumberModal(agentId) {
    const modal = document.createElement('div');
    modal.className = 'voice-modal-overlay';
    modal.innerHTML = `
      <div class="voice-modal" style="max-width: 400px;">
        <div class="voice-modal-header">
          <h3>Phone Number Required</h3>
          <button class="close-modal-btn">&times;</button>
        </div>
        <div class="voice-modal-content" style="padding: 1.5rem;">
          <p style="margin: 0 0 1.5rem; color: var(--text-secondary);">
            Your agent can't go live without a phone number. Please deploy a number first.
          </p>
          <button class="go-to-agent-btn" style="
            width: 100%;
            padding: 0.75rem 1rem;
            background: var(--primary-color);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: 500;
            cursor: pointer;
          ">Go to Deploy</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Close button
    modal.querySelector('.close-modal-btn').addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    // Click outside to close
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });

    // Go to agent button
    modal.querySelector('.go-to-agent-btn').addEventListener('click', () => {
      document.body.removeChild(modal);
      window.navigateTo(`/agents/${agentId}?tab=deployment`);
    });
  }

  cleanup() {
    this.agents = [];
    this.userId = null;
  }
}
