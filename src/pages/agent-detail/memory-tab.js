import { getAgentMemories, getMemory, updateMemory, clearMemory, searchSimilarMemories } from '../../services/memoryService.js';

export const memoryTabMethods = {
  renderMemoryTab() {
    const memoryEnabled = this.agent.memory_enabled || false;
    const memoryConfig = this.agent.memory_config || {
      max_history_calls: 5,
      include_summaries: true,
      include_key_topics: true,
      include_preferences: true
    };
    const semanticEnabled = this.agent.semantic_memory_enabled || false;
    const semanticConfig = this.agent.semantic_memory_config || {
      max_results: 3,
      similarity_threshold: 0.75,
      include_other_callers: true
    };

    return `
      <div class="config-section">
        <h3>Memory Settings</h3>
        <p class="section-desc">Enable your agent to remember past conversations with callers.</p>

        <div class="memory-status-container ${memoryEnabled ? 'enabled' : 'disabled'}">
          <div class="memory-status-content">
            <div class="memory-status-icon">
              ${memoryEnabled ? `
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              ` : `
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              `}
            </div>
            <div class="memory-status-text">
              <span class="memory-status-title">${memoryEnabled ? 'Memory Enabled' : 'Memory Disabled'}</span>
              <span class="memory-status-desc">${memoryEnabled ? 'Agent remembers past conversations with callers' : 'Agent treats each call as a new conversation'}</span>
            </div>
          </div>
          <button type="button" id="memory-toggle-btn" class="memory-toggle-btn ${memoryEnabled ? 'btn-disable' : 'btn-enable'}">
            ${memoryEnabled ? 'Disable' : 'Enable'}
          </button>
        </div>

        <div id="memory-config-section" class="${memoryEnabled ? '' : 'hidden'}" style="margin-top: 1rem;">
          <div class="form-group">
            <label class="form-label">Max History Calls</label>
            <select id="memory-max-calls" class="form-select">
              <option value="3" ${memoryConfig.max_history_calls === 3 ? 'selected' : ''}>Last 3 calls</option>
              <option value="5" ${memoryConfig.max_history_calls === 5 ? 'selected' : ''}>Last 5 calls</option>
              <option value="10" ${memoryConfig.max_history_calls === 10 ? 'selected' : ''}>Last 10 calls</option>
            </select>
            <p class="form-help">How many recent calls to consider for context.</p>
          </div>

          <div class="form-group">
            <label class="form-label">Include in Context</label>
            <div class="memory-context-options">
              <label class="memory-option-item">
                <input type="checkbox" id="memory-summaries" ${memoryConfig.include_summaries !== false ? 'checked' : ''} />
                <span>Conversation summaries</span>
              </label>
              <label class="memory-option-item">
                <input type="checkbox" id="memory-topics" ${memoryConfig.include_key_topics !== false ? 'checked' : ''} />
                <span>Key topics discussed</span>
              </label>
              <label class="memory-option-item">
                <input type="checkbox" id="memory-preferences" ${memoryConfig.include_preferences !== false ? 'checked' : ''} />
                <span>Caller preferences</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div class="config-section">
        <h3>Semantic Memory</h3>
        <p class="section-desc">Find patterns across conversations using AI-powered similarity search.</p>

        <div class="memory-status-container semantic ${semanticEnabled ? 'enabled' : 'disabled'}">
          <div class="memory-status-content">
            <div class="memory-status-icon semantic-icon">
              ${semanticEnabled ? `
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
              ` : `
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
              `}
            </div>
            <div class="memory-status-text">
              <span class="memory-status-title">${semanticEnabled ? 'Semantic Memory Enabled' : 'Semantic Memory Disabled'}</span>
              <span class="memory-status-desc">${semanticEnabled ? 'Agent finds similar past conversations to identify patterns' : 'Agent only uses individual caller history'}</span>
            </div>
          </div>
          <button type="button" id="semantic-toggle-btn" class="memory-toggle-btn ${semanticEnabled ? 'btn-disable' : 'btn-enable'}">
            ${semanticEnabled ? 'Disable' : 'Enable'}
          </button>
        </div>

        <div id="semantic-config-section" class="${semanticEnabled ? '' : 'hidden'}" style="margin-top: 1rem;">
          <div class="form-group">
            <label class="form-label">Similar Conversations to Show</label>
            <select id="semantic-max-results" class="form-select">
              <option value="2" ${semanticConfig.max_results === 2 ? 'selected' : ''}>2 similar conversations</option>
              <option value="3" ${semanticConfig.max_results === 3 ? 'selected' : ''}>3 similar conversations</option>
              <option value="5" ${semanticConfig.max_results === 5 ? 'selected' : ''}>5 similar conversations</option>
            </select>
            <p class="form-help">Maximum number of similar past conversations to include.</p>
          </div>

          <div class="form-group">
            <label class="form-label">Similarity Threshold</label>
            <select id="semantic-threshold" class="form-select">
              <option value="0.6" ${semanticConfig.similarity_threshold === 0.6 ? 'selected' : ''}>Low (60%) - More results, less accurate</option>
              <option value="0.75" ${semanticConfig.similarity_threshold === 0.75 ? 'selected' : ''}>Medium (75%) - Balanced</option>
              <option value="0.85" ${semanticConfig.similarity_threshold === 0.85 ? 'selected' : ''}>High (85%) - Fewer results, more accurate</option>
            </select>
            <p class="form-help">How similar conversations must be to be included.</p>
          </div>

          <div class="form-group">
            <label class="form-label">Semantic Match Threshold</label>
            <select id="semantic-match-threshold" class="form-select">
              <option value="2" ${semanticConfig.semantic_match_threshold === 2 ? 'selected' : ''}>2 matches</option>
              <option value="3" ${(semanticConfig.semantic_match_threshold || 3) === 3 ? 'selected' : ''}>3 matches (Default)</option>
              <option value="5" ${semanticConfig.semantic_match_threshold === 5 ? 'selected' : ''}>5 matches</option>
              <option value="10" ${semanticConfig.semantic_match_threshold === 10 ? 'selected' : ''}>10 matches</option>
            </select>
            <p class="form-help">How many times a memory must be matched before it's labeled as a semantic pattern.</p>
          </div>
        </div>

        <div class="semantic-info-box">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span>Semantic memory helps identify common issues across callers. For example, if multiple customers report the same problem, your agent will recognize the pattern.</span>
        </div>

      </div>

      <div class="config-section" id="memory-list-section">
        <div class="memory-section-header">
          <h3>Agent Memory <span id="memory-count-badge" class="memory-count-badge">${this.memoryCount}</span></h3>
          ${this.memoryCount > 0 ? `
            <button type="button" id="clear-all-memories-btn" class="btn-text-danger">Clear All</button>
          ` : ''}
        </div>
        ${semanticEnabled ? `
          <div style="display: flex; gap: 0.5rem; margin-bottom: 0.75rem;">
            <input type="text" id="semantic-search-input" class="form-input" placeholder="Search memories..." style="flex: 1;" />
            <button type="button" id="semantic-search-btn" class="btn btn-secondary" style="white-space: nowrap;">Search</button>
          </div>
          <div id="semantic-search-results"></div>
        ` : ''}
        <div id="memories-container" class="memories-container">
          <div class="memory-loading">Loading memories...</div>
        </div>
      </div>
    `;
  },

  renderMemoryList() {
    if (this.memories.length === 0) {
      return `
        <div class="memory-empty-state">
          <div class="memory-empty-icon">
            <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
            </svg>
          </div>
          <p class="memory-empty-title">No caller memories yet</p>
          <p class="memory-empty-desc">Memories will appear here after conversations when memory is enabled.</p>
        </div>
      `;
    }

    return this.memories.map(mem => `
      <div class="memory-card" data-memory-id="${mem.id}">
        <div class="memory-card-header">
          <div class="memory-contact">
            <div class="memory-contact-avatar" ${mem.contact?.avatar_url ? 'style="padding: 0; background: none;"' : ''}>
              ${mem.contact?.avatar_url
                ? `<img src="${mem.contact.avatar_url}" alt="${mem.contact.name || ''}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" />`
                : `<svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                  </svg>`
              }
            </div>
            <div class="memory-contact-details">
              <span class="memory-contact-phone">${mem.contact?.phone_number || 'Unknown'}</span>
              ${mem.contact?.name ? `<span class="memory-contact-name">${mem.contact.name}</span>` : ''}
            </div>
          </div>
          <div class="memory-header-right">
            ${mem.direction ? `<span class="memory-direction-badge memory-direction-${mem.direction}">${mem.direction === 'inbound' ? 'Inbound' : 'Outbound'}</span>` : ''}
            ${mem.hasEmbedding ? (() => {
              const matchThreshold = this.agent?.semantic_memory_config?.semantic_match_threshold || 3;
              if (mem.semanticMatchCount >= matchThreshold) {
                return `<button type="button" class="memory-direction-badge memory-semantic-match-badge semantic-match-pill" data-memory-id="${mem.id}" data-match-count="${mem.semanticMatchCount}">${mem.semanticMatchCount} Semantic Match${mem.semanticMatchCount !== 1 ? 'es' : ''}</button>`;
              }
              return `<span class="memory-direction-badge memory-semantic-badge">Indexed${mem.semanticMatchCount > 0 ? ` · ${mem.semanticMatchCount} match${mem.semanticMatchCount !== 1 ? 'es' : ''}` : ''}</span>`;
            })() : ''}
            <span class="memory-call-count">${(() => {
              const calls = mem.interactionCount || 0;
              const texts = mem.smsInteractionCount || 0;
              const parts = [];
              if (calls > 0) parts.push(`${calls} call${calls !== 1 ? 's' : ''}`);
              if (texts > 0) parts.push(`${texts} text${texts !== 1 ? 's' : ''}`);
              return parts.length > 0 ? parts.join(', ') : '0 interactions';
            })()}</span>
          </div>
        </div>
        <p class="memory-card-summary">${mem.summary || 'No summary available'}</p>
        ${mem.keyTopics && mem.keyTopics.length > 0 ? `
          <div class="memory-card-topics">
            ${mem.keyTopics.slice(0, 4).map(t => `<span class="memory-topic-tag">${t}</span>`).join('')}
          </div>
        ` : ''}
        <div class="memory-card-actions">
          <button type="button" class="memory-action-btn view-memory-btn" data-memory-id="${mem.id}">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
            View
          </button>
          <button type="button" class="memory-action-btn memory-action-danger clear-memory-btn" data-memory-id="${mem.id}">
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
            Clear
          </button>
          <span class="copy-memory-id-btn" data-memory-id="${mem.id}" title="Click to copy">${mem.id}</span>
        </div>
      </div>
    `).join('');
  },

  async loadMemories() {
    try {
      this.memories = await getAgentMemories(this.agentId);
      this.memoryCount = this.memories.length;

      const container = document.getElementById('memories-container');
      if (container) {
        container.innerHTML = this.renderMemoryList();
        this.attachMemoryListListeners();
      }

      // Update count badge
      const badge = document.getElementById('memory-count-badge');
      if (badge) {
        badge.textContent = this.memoryCount;
      }

      // Show/hide clear all button
      const clearAllBtn = document.getElementById('clear-all-memories-btn');
      if (clearAllBtn) {
        clearAllBtn.style.display = this.memoryCount > 0 ? 'inline-flex' : 'none';
      }
    } catch (error) {
      console.error('Failed to load memories:', error);
      const container = document.getElementById('memories-container');
      if (container) {
        container.innerHTML = `<div class="memory-error-state">Failed to load memories. Please try again.</div>`;
      }
    }
  },

  attachMemoryTabListeners() {
    // Memory toggle button
    const memoryToggleBtn = document.getElementById('memory-toggle-btn');
    const memoryConfigSection = document.getElementById('memory-config-section');
    const memoryStatusContainer = document.querySelector('.memory-status-container');

    if (memoryToggleBtn) {
      memoryToggleBtn.addEventListener('click', async () => {
        const currentlyEnabled = this.agent.memory_enabled || false;
        const newEnabled = !currentlyEnabled;

        // Update local state
        this.agent.memory_enabled = newEnabled;

        // Update UI immediately
        if (memoryConfigSection) {
          memoryConfigSection.classList.toggle('hidden', !newEnabled);
        }

        // Update the status container appearance
        if (memoryStatusContainer) {
          memoryStatusContainer.classList.toggle('enabled', newEnabled);
          memoryStatusContainer.classList.toggle('disabled', !newEnabled);

          // Update icon
          const iconContainer = memoryStatusContainer.querySelector('.memory-status-icon');
          if (iconContainer) {
            iconContainer.innerHTML = newEnabled ? `
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            ` : `
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            `;
          }

          // Update text
          const titleEl = memoryStatusContainer.querySelector('.memory-status-title');
          const descEl = memoryStatusContainer.querySelector('.memory-status-desc');
          if (titleEl) titleEl.textContent = newEnabled ? 'Memory Enabled' : 'Memory Disabled';
          if (descEl) descEl.textContent = newEnabled ? 'Agent remembers past conversations with callers' : 'Agent treats each call as a new conversation';
        }

        // Update button
        memoryToggleBtn.textContent = newEnabled ? 'Disable' : 'Enable';
        memoryToggleBtn.classList.toggle('btn-disable', newEnabled);
        memoryToggleBtn.classList.toggle('btn-enable', !newEnabled);

        await this.updateAgentField('memory_enabled', newEnabled);
      });
    }

    // Memory config options
    const maxCallsSelect = document.getElementById('memory-max-calls');
    const summariesCheck = document.getElementById('memory-summaries');
    const topicsCheck = document.getElementById('memory-topics');
    const preferencesCheck = document.getElementById('memory-preferences');

    const updateMemoryConfig = async () => {
      const config = {
        max_history_calls: parseInt(maxCallsSelect?.value || '5'),
        include_summaries: summariesCheck?.checked ?? true,
        include_key_topics: topicsCheck?.checked ?? true,
        include_preferences: preferencesCheck?.checked ?? true,
      };
      await this.updateAgentField('memory_config', config);
    };

    maxCallsSelect?.addEventListener('change', updateMemoryConfig);
    summariesCheck?.addEventListener('change', updateMemoryConfig);
    topicsCheck?.addEventListener('change', updateMemoryConfig);
    preferencesCheck?.addEventListener('change', updateMemoryConfig);

    // Clear all memories button
    const clearAllBtn = document.getElementById('clear-all-memories-btn');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        this.showConfirmModal(
          'Clear All Memories',
          'Are you sure you want to clear all caller memories for this agent? This cannot be undone.',
          async () => {
            try {
              const { clearAllAgentMemories } = await import('../../services/memoryService.js');
              await clearAllAgentMemories(this.agentId);
              await this.loadMemories();
            } catch (error) {
              console.error('Failed to clear memories:', error);
            }
          }
        );
      });
    }

    // Semantic Memory toggle
    const semanticToggleBtn = document.getElementById('semantic-toggle-btn');
    const semanticConfigSection = document.getElementById('semantic-config-section');
    if (semanticToggleBtn) {
      semanticToggleBtn.addEventListener('click', async () => {
        const newEnabled = !this.agent.semantic_memory_enabled;

        // Show/hide config section
        if (semanticConfigSection) {
          semanticConfigSection.classList.toggle('hidden', !newEnabled);
        }

        // Update UI immediately
        const semanticStatusContainer = document.querySelector('.memory-status-container.semantic');
        if (semanticStatusContainer) {
          semanticStatusContainer.classList.toggle('enabled', newEnabled);
          semanticStatusContainer.classList.toggle('disabled', !newEnabled);

          // Update icon
          const iconEl = semanticStatusContainer.querySelector('.memory-status-icon');
          if (iconEl) {
            iconEl.innerHTML = newEnabled ? `
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
            ` : `
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            `;
          }

          // Update text
          const titleEl = semanticStatusContainer.querySelector('.memory-status-title');
          const descEl = semanticStatusContainer.querySelector('.memory-status-desc');
          if (titleEl) titleEl.textContent = newEnabled ? 'Semantic Memory Enabled' : 'Semantic Memory Disabled';
          if (descEl) descEl.textContent = newEnabled ? 'Agent finds patterns across all callers' : 'Agent only uses individual caller memory';
        }

        // Update button
        semanticToggleBtn.textContent = newEnabled ? 'Disable' : 'Enable';
        semanticToggleBtn.classList.toggle('btn-disable', newEnabled);
        semanticToggleBtn.classList.toggle('btn-enable', !newEnabled);

        // Update local state
        this.agent.semantic_memory_enabled = newEnabled;

        await this.updateAgentField('semantic_memory_enabled', newEnabled);
      });
    }

    // Semantic Memory config options
    const semanticMaxResults = document.getElementById('semantic-max-results');
    const semanticThreshold = document.getElementById('semantic-threshold');
    const semanticMatchThreshold = document.getElementById('semantic-match-threshold');

    const updateSemanticConfig = async () => {
      const config = {
        max_results: parseInt(semanticMaxResults?.value || '3'),
        similarity_threshold: parseFloat(semanticThreshold?.value || '0.75'),
        semantic_match_threshold: parseInt(semanticMatchThreshold?.value || '3'),
        include_other_callers: true,
      };
      this.agent.semantic_memory_config = config;
      await this.updateAgentField('semantic_memory_config', config);
    };

    semanticMaxResults?.addEventListener('change', updateSemanticConfig);
    semanticThreshold?.addEventListener('change', updateSemanticConfig);
    semanticMatchThreshold?.addEventListener('change', updateSemanticConfig);

    // Semantic search tool
    const searchBtn = document.getElementById('semantic-search-btn');
    const searchInput = document.getElementById('semantic-search-input');
    const searchResults = document.getElementById('semantic-search-results');

    if (searchBtn && searchInput) {
      const doSearch = async () => {
        const query = searchInput.value.trim();
        if (!query) return;

        searchBtn.disabled = true;
        searchBtn.textContent = 'Searching...';
        if (searchResults) searchResults.innerHTML = '<div class="text-muted" style="font-size: 0.85rem;">Searching...</div>';

        try {
          const results = await searchSimilarMemories({ agentId: this.agentId, query });

          if (!searchResults) return;
          if (results.length === 0) {
            searchResults.innerHTML = '<div class="text-muted" style="font-size: 0.85rem;">No matching memories found.</div>';
            return;
          }

          searchResults.innerHTML = results.map(r => {
            const pct = Math.round((r.similarity || 0) * 100);
            return `
              <div style="padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 0.5rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                  <span style="font-weight: 500; font-size: 0.85rem;">${r.contact_name || r.contact_phone || 'Unknown'}</span>
                  <span class="memory-direction-badge memory-semantic-badge">${pct}%</span>
                </div>
                <div style="font-size: 0.8rem; color: var(--text-secondary);">${r.summary || 'No summary'}</div>
                ${r.key_topics && r.key_topics.length > 0 ? `
                  <div style="display: flex; gap: 0.25rem; flex-wrap: wrap; margin-top: 0.25rem;">
                    ${r.key_topics.slice(0, 4).map(t => `<span class="memory-topic-tag">${t}</span>`).join('')}
                  </div>
                ` : ''}
              </div>
            `;
          }).join('');
        } catch (err) {
          console.error('Semantic search failed:', err);
          if (searchResults) searchResults.innerHTML = '<div class="text-muted" style="font-size: 0.85rem;">Search failed. Please try again.</div>';
        } finally {
          searchBtn.disabled = false;
          searchBtn.textContent = 'Search';
        }
      };

      searchBtn.addEventListener('click', doSearch);
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSearch();
      });
    }

  },

  attachMemoryListListeners() {
    // View memory buttons
    document.querySelectorAll('.view-memory-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const memoryId = btn.dataset.memoryId;
        await this.showMemoryDetailModal(memoryId);
      });
    });

    // Copy memory ID buttons
    document.querySelectorAll('.copy-memory-id-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const memoryId = btn.dataset.memoryId;
        if (memoryId) {
          navigator.clipboard.writeText(memoryId).then(() => {
            const tooltip = document.createElement('span');
            tooltip.textContent = 'Copied';
            tooltip.style.cssText = `position: fixed; top: ${e.clientY - 30}px; left: ${e.clientX}px; transform: translateX(-50%); background: var(--bg-primary); color: var(--text-primary); padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 10000; pointer-events: none;`;
            document.body.appendChild(tooltip);
            setTimeout(() => tooltip.remove(), 3000);
          });
        }
      });
    });

    // Semantic match pill buttons
    document.querySelectorAll('.semantic-match-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const memoryId = btn.dataset.memoryId;
        this.showSemanticMatchModal(memoryId);
      });
    });

    // Clear memory buttons
    document.querySelectorAll('.clear-memory-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const memoryId = btn.dataset.memoryId;
        const mem = this.memories.find(m => m.id === memoryId);
        const contactName = mem?.contact?.name || mem?.contact?.phone_number || 'this caller';

        this.showConfirmModal(
          'Clear Memory',
          `Are you sure you want to clear the memory for ${contactName}? This cannot be undone.`,
          async () => {
            try {
              await clearMemory(memoryId);
              await this.loadMemories();
            } catch (error) {
              console.error('Failed to clear memory:', error);
            }
          }
        );
      });
    });
  },

  async showMemoryDetailModal(memoryId) {
    try {
      const memory = await getMemory(memoryId);

      // Remove existing modal
      document.getElementById('memory-detail-modal')?.remove();

      const modal = document.createElement('div');
      modal.id = 'memory-detail-modal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-content memory-detail-modal">
          <div class="modal-mobile-header">
            <button type="button" class="back-btn" id="memory-modal-back">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <span>Agent Memory</span>
          </div>

          <div class="desktop-only" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h3 style="margin: 0;">Agent Memory: ${memory.contact?.name || memory.contact?.phone_number || 'Unknown'}</h3>
            <button type="button" id="close-memory-modal" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-secondary);">&times;</button>
          </div>

          <div class="memory-detail-phone">${memory.contact?.phone_number || ''}</div>

          <div class="memory-detail-section">
            <label class="form-label">Summary</label>
            <textarea id="memory-summary-edit" class="form-textarea" rows="3">${memory.summary || ''}</textarea>
          </div>

          <div class="memory-detail-section">
            <label class="form-label">Key Topics</label>
            <div class="memory-topics-display">
              ${(memory.keyTopics || []).map(t => `<span class="topic-tag">${t}</span>`).join('') || '<span class="text-muted">No topics</span>'}
            </div>
          </div>

          ${memory.preferences && Object.keys(memory.preferences).length > 0 ? `
            <div class="memory-detail-section">
              <label class="form-label">Preferences</label>
              <pre class="memory-prefs-display">${JSON.stringify(memory.preferences, null, 2)}</pre>
            </div>
          ` : ''}

          <div class="memory-detail-section">
            <label class="form-label">Call History (${memory.callHistory?.length || 0} calls)</label>
            <div class="call-history-list">
              ${memory.callHistory && memory.callHistory.length > 0 ? memory.callHistory.map(call => `
                <div class="call-history-item">
                  <span class="call-date">${new Date(call.started_at).toLocaleDateString()}</span>
                  <span class="call-duration">${Math.floor((call.duration_seconds || 0) / 60)} min</span>
                  <span class="call-summary-preview">${call.call_summary || 'No summary'}</span>
                </div>
              `).join('') : '<div class="text-muted">No call history available</div>'}
            </div>
          </div>

          <div class="memory-detail-section">
            <label class="form-label">Similar Memories</label>
            <div id="similar-memories-container">
              <div class="text-muted" style="font-size: 0.85rem;">Loading...</div>
            </div>
          </div>

          <div style="display: flex; gap: 0.75rem; margin-top: 1.5rem;">
            <button type="button" class="btn btn-secondary" id="close-memory-detail" style="flex: 1;">Close</button>
            <button type="button" class="btn btn-primary" id="save-memory-changes" style="flex: 1;">Save Changes</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const closeModal = () => modal.remove();

      modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);
      document.getElementById('close-memory-modal')?.addEventListener('click', closeModal);
      document.getElementById('memory-modal-back')?.addEventListener('click', closeModal);
      document.getElementById('close-memory-detail')?.addEventListener('click', closeModal);

      modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
      });

      // Save changes handler
      document.getElementById('save-memory-changes')?.addEventListener('click', async () => {
        const newSummary = document.getElementById('memory-summary-edit')?.value;
        try {
          await updateMemory(memoryId, { summary: newSummary });
          closeModal();
          await this.loadMemories();
        } catch (error) {
          console.error('Failed to save memory:', error);
        }
      });

      // Load similar memories
      const memFromList = this.memories.find(m => m.id === memoryId);
      const similarContainer = document.getElementById('similar-memories-container');
      if (memFromList?.hasEmbedding && this.agent.semantic_memory_enabled) {
        const excludeContactId = memory.contact?.id || null;
        searchSimilarMemories({ agentId: this.agentId, memoryId, excludeContactId })
          .then(results => {
            if (!similarContainer) return;
            if (results.length === 0) {
              similarContainer.innerHTML = '<div class="text-muted" style="font-size: 0.85rem;">No similar memories found.</div>';
              return;
            }
            similarContainer.innerHTML = results.map(r => {
              const pct = Math.round((r.similarity || 0) * 100);
              return `
                <div style="padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 0.5rem;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                    <span style="font-weight: 500; font-size: 0.85rem;">${r.contact_name || r.contact_phone || 'Unknown'}</span>
                    <span class="memory-direction-badge memory-semantic-badge">${pct}% similar</span>
                  </div>
                  <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.25rem;">${r.summary || 'No summary'}</div>
                  ${r.key_topics && r.key_topics.length > 0 ? `
                    <div style="display: flex; gap: 0.25rem; flex-wrap: wrap;">
                      ${r.key_topics.slice(0, 4).map(t => `<span class="memory-topic-tag">${t}</span>`).join('')}
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('');
          })
          .catch(() => {
            if (similarContainer) {
              similarContainer.innerHTML = '<div class="text-muted" style="font-size: 0.85rem;">Failed to load similar memories.</div>';
            }
          });
      } else if (similarContainer) {
        similarContainer.innerHTML = '<div class="text-muted" style="font-size: 0.85rem;">Enable semantic memory to find similar conversations.</div>';
      }

    } catch (error) {
      console.error('Failed to load memory detail:', error);
    }
  },

  async showSemanticMatchModal(memoryId) {
    const mem = this.memories.find(m => m.id === memoryId);
    if (!mem) return;

    const contactName = mem.contact?.name || mem.contact?.phone_number || 'Unknown';
    const matchCount = mem.semanticMatchCount || 0;

    document.getElementById('semantic-match-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'semantic-match-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content" style="max-width: 480px;">
        <div class="modal-mobile-header">
          <button type="button" class="back-btn" id="semantic-modal-back">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <span>Semantic Pattern</span>
        </div>

        <div class="desktop-only" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <h3 style="margin: 0;">Semantic Pattern</h3>
          <button type="button" id="close-semantic-modal" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--text-secondary);">&times;</button>
        </div>

        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem; padding: 0.75rem; background: var(--bg-secondary, #f9fafb); border-radius: 10px;">
          <div style="width: 40px; height: 40px; border-radius: 50%; background: #fef3c7; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <svg width="20" height="20" fill="none" stroke="#d97706" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
          </div>
          <div>
            <div style="font-weight: 600; font-size: 0.95rem;">${matchCount} Semantic Match${matchCount !== 1 ? 'es' : ''}</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">This memory was surfaced ${matchCount} time${matchCount !== 1 ? 's' : ''} during other conversations</div>
          </div>
        </div>

        <div style="margin-bottom: 1rem;">
          <label class="form-label" style="font-size: 0.8rem; margin-bottom: 0.25rem;">Contact</label>
          <div style="font-size: 0.9rem; font-weight: 500;">${contactName}</div>
          ${mem.contact?.phone_number && mem.contact?.name ? `<div style="font-size: 0.8rem; color: var(--text-secondary);">${mem.contact.phone_number}</div>` : ''}
        </div>

        <div style="margin-bottom: 1rem;">
          <label class="form-label" style="font-size: 0.8rem; margin-bottom: 0.25rem;">Summary</label>
          <div style="font-size: 0.85rem; line-height: 1.5; color: var(--text-primary);">${mem.summary || 'No summary available'}</div>
        </div>

        ${mem.keyTopics && mem.keyTopics.length > 0 ? `
          <div style="margin-bottom: 1rem;">
            <label class="form-label" style="font-size: 0.8rem; margin-bottom: 0.25rem;">Topics</label>
            <div style="display: flex; gap: 0.3rem; flex-wrap: wrap;">
              ${mem.keyTopics.map(t => `<span class="memory-topic-tag">${t}</span>`).join('')}
            </div>
          </div>
        ` : ''}

        <div style="padding: 0.75rem; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; margin-bottom: 1.25rem;">
          <div style="font-size: 0.8rem; color: #92400e; line-height: 1.5;">
            This pattern is appearing across multiple callers. Consider whether this represents a recurring issue that needs attention.
          </div>
        </div>

        <div style="display: flex; gap: 0.5rem;">
          <button type="button" class="btn btn-secondary" id="close-semantic-detail" style="flex: 1;">Close</button>
          <button type="button" class="btn btn-primary" id="create-semantic-alert-btn" style="flex: 1;">Create Alert</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);
    document.getElementById('close-semantic-modal')?.addEventListener('click', closeModal);
    document.getElementById('close-semantic-detail')?.addEventListener('click', closeModal);
    document.getElementById('semantic-modal-back')?.addEventListener('click', closeModal);

    // Create Alert button: navigate to Functions tab and open config modal
    document.getElementById('create-semantic-alert-btn')?.addEventListener('click', () => {
      const topics = mem.keyTopics || [];
      closeModal();
      // Switch to Functions tab
      const functionsTab = document.querySelector('[data-tab="functions"]');
      if (functionsTab) functionsTab.click();
      // Open semantic match config modal, then immediately open add-alert with pre-filled topics
      setTimeout(() => this.showSemanticMatchConfigModal(false, topics), 200);
    });
  },
};
