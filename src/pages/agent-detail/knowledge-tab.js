import { addSource, addManualSource, deleteSource, listSources } from '../../services/knowledgeService.js';
import { showToast } from '../../lib/toast.js';

export const knowledgeTabMethods = {
  renderKnowledgeTab() {
    // Ensure knowledge_source_ids is an array
    const selectedIds = this.agent.knowledge_source_ids || [];

    return `
      <div class="config-section">
        <h3>Knowledge Bases</h3>
        <p class="section-desc">Connect knowledge sources for your agent to reference when answering questions.</p>

        <div class="form-group">
          <label class="form-label">Select Knowledge Bases</label>
          <div class="kb-selector-container">
            <button type="button" class="kb-selector-button" id="kb-selector-button">
              ${this.renderKBSelectorButtonContent()}
              <svg class="kb-selector-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>

            <!-- KB Selection Modal -->
            <div class="kb-selector-modal" id="kb-selector-modal">
              <div class="kb-modal-section">
                <div class="kb-modal-section-title">Select Knowledge Bases</div>
                ${this.knowledgeSources.length === 0 ? `
                <div class="kb-modal-empty">
                  <p>No knowledge bases available</p>
                </div>
                ` : this.knowledgeSources.map(kb => `
                <button class="kb-modal-item ${selectedIds.includes(kb.id) ? 'selected' : ''}" data-kb-id="${kb.id}">
                  <div class="kb-modal-item-checkbox">
                    ${selectedIds.includes(kb.id) ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
                  </div>
                  <div class="kb-modal-item-content">
                    <span class="kb-modal-item-title">${kb.title || 'Untitled'}</span>
                    <span class="kb-modal-item-desc">${kb.chunk_count ? `${kb.chunk_count} chunks` : ''}${kb.crawl_mode && kb.crawl_mode !== 'single' ? ` · ${kb.crawl_mode}` : ''}</span>
                  </div>
                </button>
                `).join('')}
              </div>

              <div class="kb-modal-divider"></div>

              <button class="kb-modal-item kb-modal-action" id="kb-modal-create">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
                </svg>
                <span>Create New Knowledge Base</span>
              </button>
              <button class="kb-modal-item kb-modal-action" id="kb-modal-manage">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                <span>Manage Knowledge Bases</span>
              </button>
            </div>
          </div>
          <p class="form-help">Your agent will search these knowledge bases to provide informed responses.</p>
        </div>

        ${this.renderSelectedKBs()}
      </div>
    `;
  },

  renderKBSelectorButtonContent() {
    const selectedIds = this.agent.knowledge_source_ids || [];
    const selectedKBs = this.knowledgeSources.filter(kb => selectedIds.includes(kb.id));

    if (selectedKBs.length === 0) {
      return `
        <div class="kb-selector-icon">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
          </svg>
        </div>
        <div class="kb-selector-text">
          <span class="kb-selector-title">None selected</span>
          <span class="kb-selector-subtitle">Click to connect knowledge bases</span>
        </div>
      `;
    }

    const totalChunks = selectedKBs.reduce((sum, kb) => sum + (kb.chunk_count || 0), 0);

    return `
      <div class="kb-selector-icon kb-selector-icon-connected">
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      </div>
      <div class="kb-selector-text">
        <span class="kb-selector-title">${selectedKBs.length} knowledge base${selectedKBs.length > 1 ? 's' : ''} connected</span>
        <span class="kb-selector-subtitle">${totalChunks} total chunks</span>
      </div>
    `;
  },

  renderSelectedKBs() {
    const selectedIds = this.agent.knowledge_source_ids || [];
    const selectedKBs = this.knowledgeSources.filter(kb => selectedIds.includes(kb.id));

    if (selectedKBs.length === 0) return '';

    return `
      <div class="kb-selected-list">
        ${selectedKBs.map(kb => `
        <div class="kb-selected-item">
          <div class="kb-selected-item-icon">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <div class="kb-selected-item-content">
            <span class="kb-selected-item-title">${kb.title || 'Untitled'}</span>
            <span class="kb-selected-item-meta">${kb.chunk_count ? `${kb.chunk_count} chunks` : ''}${kb.crawl_mode && kb.crawl_mode !== 'single' ? ` · ${kb.crawl_mode}` : ''}</span>
          </div>
          <button type="button" class="kb-selected-item-remove" data-kb-id="${kb.id}" title="Remove">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        `).join('')}
      </div>
    `;
  },

  attachKnowledgeTabListeners() {
    // Ensure knowledge_source_ids is initialized
    if (!this.agent.knowledge_source_ids) {
      this.agent.knowledge_source_ids = [];
    }

    // Knowledge base modal selector
    const kbSelectorBtn = document.getElementById('kb-selector-button');
    const kbModal = document.getElementById('kb-selector-modal');

    if (kbSelectorBtn && kbModal) {
      // Toggle modal on button click
      kbSelectorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        kbModal.classList.toggle('open');
        kbSelectorBtn.classList.toggle('open');
      });

      // Close modal when clicking outside
      document.addEventListener('click', (e) => {
        if (!kbModal.contains(e.target) && !kbSelectorBtn.contains(e.target)) {
          kbModal.classList.remove('open');
          kbSelectorBtn.classList.remove('open');
        }
      });

      // Handle KB checkbox selection (toggle)
      const kbItems = kbModal.querySelectorAll('.kb-modal-item[data-kb-id]');
      kbItems.forEach(item => {
        item.addEventListener('click', () => {
          const kbId = item.dataset.kbId;
          if (!kbId) return;

          const selectedIds = this.agent.knowledge_source_ids || [];
          const isSelected = selectedIds.includes(kbId);

          if (isSelected) {
            // Remove from selection
            this.agent.knowledge_source_ids = selectedIds.filter(id => id !== kbId);
          } else {
            // Add to selection
            this.agent.knowledge_source_ids = [...selectedIds, kbId];
          }

          this.scheduleAutoSave({ knowledge_source_ids: this.agent.knowledge_source_ids });

          // Update checkbox state in modal
          const checkbox = item.querySelector('.kb-modal-item-checkbox');
          if (isSelected) {
            item.classList.remove('selected');
            checkbox.innerHTML = '';
          } else {
            item.classList.add('selected');
            checkbox.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
          }

          // Update button content
          this.updateKBSelectorButton();

          // Update the selected KBs list
          this.updateSelectedKBsList();
        });
      });

      // Create KB button - open inline modal
      const createKbBtn = document.getElementById('kb-modal-create');
      if (createKbBtn) {
        createKbBtn.addEventListener('click', () => {
          kbModal.classList.remove('open');
          kbSelectorBtn.classList.remove('open');
          this.openCreateKBModal();
        });
      }

      // Manage KB button - open inline modal
      const manageKbBtn = document.getElementById('kb-modal-manage');
      if (manageKbBtn) {
        manageKbBtn.addEventListener('click', () => {
          kbModal.classList.remove('open');
          kbSelectorBtn.classList.remove('open');
          this.openManageKBModal();
        });
      }
    }

    // Attach remove button listeners for selected KBs
    this.attachKBRemoveListeners();
  },

  updateKBSelectorButton() {
    const kbSelectorBtn = document.getElementById('kb-selector-button');
    if (kbSelectorBtn) {
      kbSelectorBtn.innerHTML = this.renderKBSelectorButtonContent() + `
        <svg class="kb-selector-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      `;
    }
  },

  updateSelectedKBsList() {
    const existingList = document.querySelector('.kb-selected-list');
    if (existingList) existingList.remove();

    const kbsHtml = this.renderSelectedKBs();
    if (kbsHtml) {
      const formGroup = document.querySelector('.kb-selector-container')?.closest('.form-group');
      if (formGroup) {
        formGroup.insertAdjacentHTML('afterend', kbsHtml);
        this.attachKBRemoveListeners();
      }
    }
  },

  attachKBRemoveListeners() {
    const removeButtons = document.querySelectorAll('.kb-selected-item-remove');
    removeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const kbId = btn.dataset.kbId;
        const kb = this.knowledgeSources.find(k => k.id === kbId);
        const kbName = kb?.title || 'this knowledge base';

        this.showKBRemoveConfirmModal(kbId, kbName);
      });
    });
  },

  showKBRemoveConfirmModal(kbId, kbName) {
    // Create modal overlay
    const modalHtml = `
      <div class="modal-overlay kb-remove-modal-overlay" id="kb-remove-modal">
        <div class="modal-content" style="max-width: 400px;">
          <div class="modal-header">
            <h3>Remove Knowledge Base</h3>
            <button class="modal-close-btn" id="kb-remove-modal-close">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="modal-body" style="padding: 1.5rem;">
            <p>Are you sure you want to remove <strong>${kbName}</strong> from this agent?</p>
            <p style="color: var(--text-secondary); font-size: 0.875rem; margin-top: 0.5rem;">The knowledge base will not be deleted, only disconnected from this agent.</p>
          </div>
          <div class="modal-footer" style="display: flex; gap: 0.75rem; justify-content: flex-end; padding: 1rem 1.5rem; border-top: 1px solid var(--border-color);">
            <button class="btn btn-secondary" id="kb-remove-modal-cancel">Cancel</button>
            <button class="btn btn-danger" id="kb-remove-modal-confirm">Remove</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const modal = document.getElementById('kb-remove-modal');
    const closeBtn = document.getElementById('kb-remove-modal-close');
    const cancelBtn = document.getElementById('kb-remove-modal-cancel');
    const confirmBtn = document.getElementById('kb-remove-modal-confirm');

    const closeModal = () => modal.remove();

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    confirmBtn.addEventListener('click', () => {
      // Remove KB from selection
      this.agent.knowledge_source_ids = (this.agent.knowledge_source_ids || []).filter(id => id !== kbId);
      this.scheduleAutoSave({ knowledge_source_ids: this.agent.knowledge_source_ids });

      // Update the modal checkbox state
      const modalItem = document.querySelector(`.kb-modal-item[data-kb-id="${kbId}"]`);
      if (modalItem) {
        modalItem.classList.remove('selected');
        const checkbox = modalItem.querySelector('.kb-modal-item-checkbox');
        if (checkbox) checkbox.innerHTML = '';
      }

      // Update UI
      this.updateKBSelectorButton();
      this.updateSelectedKBsList();

      closeModal();
    });
  },

  // ─── Inline Create Modal ────────────────────────────────────────────────────

  openCreateKBModal() {
    const overlay = document.createElement('div');
    overlay.className = 'contact-modal-overlay';
    overlay.id = 'kb-create-modal-overlay';
    overlay.innerHTML = `
      <div class="contact-modal" style="max-width: 540px;" onclick="event.stopPropagation()">
        <div class="contact-modal-header">
          <h3>Create Knowledge Base</h3>
          <button class="contact-modal-close" id="kb-create-close">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div class="contact-modal-body scrollable">
          <!-- Tabs -->
          <div class="kb-create-tabs">
            <button class="kb-create-tab active" data-tab="url">Website URL</button>
            <button class="kb-create-tab" data-tab="paste">Paste Content</button>
            <button class="kb-create-tab" data-tab="file">Upload File</button>
          </div>

          <!-- URL Tab -->
          <div class="kb-create-tab-panel" id="kb-tab-url">
            <div class="form-group" style="margin-top: 1rem;">
              <label class="form-label">Website URL</label>
              <input type="url" class="form-input" id="kb-url-input" placeholder="https://example.com" autocomplete="off"/>
            </div>
            <div class="form-group">
              <label class="form-label">Crawl Mode</label>
              <select class="form-select" id="kb-crawl-mode">
                <option value="single">Single page</option>
                <option value="sitemap">Sitemap (crawl all pages in sitemap)</option>
                <option value="recursive">Recursive (follow links)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Sync Period</label>
              <select class="form-select" id="kb-sync-period">
                <option value="7d" selected>Weekly</option>
                <option value="24h">Daily</option>
                <option value="1mo">Monthly</option>
                <option value="3mo">Every 3 months</option>
              </select>
            </div>
            <div id="kb-crawl-advanced" style="display:none;">
              <div class="form-group">
                <label class="form-label">Max Pages <span style="color:var(--text-secondary);font-weight:400;">(1–500)</span></label>
                <input type="number" class="form-input" id="kb-max-pages" value="100" min="1" max="500"/>
              </div>
              <div class="form-group" id="kb-depth-group">
                <label class="form-label">Crawl Depth <span style="color:var(--text-secondary);font-weight:400;">(1–5)</span></label>
                <input type="number" class="form-input" id="kb-crawl-depth" value="2" min="1" max="5"/>
              </div>
            </div>
          </div>

          <!-- Paste Tab -->
          <div class="kb-create-tab-panel" id="kb-tab-paste" style="display:none;">
            <div class="form-group" style="margin-top: 1rem;">
              <label class="form-label">Title</label>
              <input type="text" class="form-input" id="kb-paste-title" placeholder="e.g. Product FAQ" autocomplete="off"/>
            </div>
            <div class="form-group">
              <label class="form-label">Content</label>
              <textarea class="form-textarea" id="kb-paste-content" rows="8" placeholder="Paste your content here..."></textarea>
            </div>
          </div>

          <!-- File Tab -->
          <div class="kb-create-tab-panel" id="kb-tab-file" style="display:none;">
            <div class="form-group" style="margin-top: 1rem;">
              <label class="form-label">Title</label>
              <input type="text" class="form-input" id="kb-file-title" placeholder="e.g. Company Handbook" autocomplete="off"/>
            </div>
            <div class="form-group">
              <label class="form-label">File <span style="color:var(--text-secondary);font-weight:400;">(.pdf or .txt)</span></label>
              <input type="file" class="form-input" id="kb-file-input" accept=".pdf,.txt" style="padding: 0.5rem;"/>
            </div>
          </div>

          <div id="kb-create-error" style="display:none; color:var(--error-color,#ef4444); font-size:0.875rem; margin-top:0.5rem;"></div>
        </div>

        <div class="contact-modal-footer">
          <button class="btn btn-secondary" id="kb-create-cancel">Cancel</button>
          <button class="btn btn-primary" id="kb-create-submit">Create Knowledge Base</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Close handlers
    const close = () => overlay.remove();
    overlay.addEventListener('click', close);
    document.getElementById('kb-create-close').addEventListener('click', close);
    document.getElementById('kb-create-cancel').addEventListener('click', close);

    // Tab switching
    let activeTab = 'url';
    overlay.querySelectorAll('.kb-create-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        activeTab = tab.dataset.tab;
        overlay.querySelectorAll('.kb-create-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        overlay.querySelectorAll('.kb-create-tab-panel').forEach(p => p.style.display = 'none');
        document.getElementById(`kb-tab-${activeTab}`).style.display = '';
        // Clear any error on tab switch
        errorDiv.style.display = 'none';
        errorDiv.textContent = '';
      });
    });

    // Show/hide advanced crawl options based on mode
    const crawlModeSelect = document.getElementById('kb-crawl-mode');
    const advancedDiv = document.getElementById('kb-crawl-advanced');
    const depthGroup = document.getElementById('kb-depth-group');
    crawlModeSelect.addEventListener('change', () => {
      const mode = crawlModeSelect.value;
      advancedDiv.style.display = mode === 'single' ? 'none' : '';
      depthGroup.style.display = mode === 'recursive' ? '' : 'none';
    });

    // Submit
    const submitBtn = document.getElementById('kb-create-submit');
    const errorDiv = document.getElementById('kb-create-error');

    submitBtn.addEventListener('click', async () => {
      errorDiv.style.display = 'none';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating...';

      try {
        let result;

        if (activeTab === 'url') {
          const url = document.getElementById('kb-url-input').value.trim();
          if (!url) throw new Error('Please enter a URL.');

          const crawlMode = crawlModeSelect.value;
          const syncPeriod = document.getElementById('kb-sync-period').value;
          const crawlOptions = { crawlMode };

          if (crawlMode !== 'single') {
            crawlOptions.maxPages = parseInt(document.getElementById('kb-max-pages').value) || 100;
            if (crawlMode === 'recursive') {
              crawlOptions.crawlDepth = parseInt(document.getElementById('kb-crawl-depth').value) || 2;
            }
          }

          result = await addSource(url, syncPeriod, null, crawlOptions);

        } else if (activeTab === 'paste') {
          const title = document.getElementById('kb-paste-title').value.trim();
          const content = document.getElementById('kb-paste-content').value.trim();
          if (!title) throw new Error('Please enter a title.');
          if (!content) throw new Error('Please enter some content.');
          result = await addManualSource(title, { content });

        } else if (activeTab === 'file') {
          const title = document.getElementById('kb-file-title').value.trim();
          const fileInput = document.getElementById('kb-file-input');
          if (!title) throw new Error('Please enter a title.');
          if (!fileInput.files || !fileInput.files[0]) throw new Error('Please select a file.');

          const file = fileInput.files[0];
          const ext = file.name.split('.').pop().toLowerCase();
          const fileType = ext === 'pdf' ? 'pdf' : 'text';

          const fileData = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result.split(',')[1]);
            reader.onerror = () => reject(new Error('Failed to read file.'));
            reader.readAsDataURL(file);
          });

          result = await addManualSource(title, { fileData, fileType, fileName: file.name });
        }

        // Add to local list and auto-select on the agent
        this.knowledgeSources.push({
          id: result.id,
          title: result.title,
          url: result.url || null,
          chunk_count: result.chunkCount ?? result.chunk_count ?? 0,
          crawl_mode: result.crawlMode || 'single',
          status: result.status,
        });

        this.agent.knowledge_source_ids = [...(this.agent.knowledge_source_ids || []), result.id];
        this.scheduleAutoSave({ knowledge_source_ids: this.agent.knowledge_source_ids });
        this._refreshKBDropdown();

        close();
        showToast('Knowledge base created and connected to agent.', 'success');

      } catch (err) {
        errorDiv.textContent = err.message || 'Something went wrong. Please try again.';
        errorDiv.style.display = '';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Knowledge Base';
      }
    });
  },

  // ─── Inline Manage Modal ────────────────────────────────────────────────────

  async openManageKBModal() {
    const overlay = document.createElement('div');
    overlay.className = 'contact-modal-overlay';
    overlay.id = 'kb-manage-modal-overlay';
    overlay.innerHTML = `
      <div class="contact-modal" style="max-width: 540px;" onclick="event.stopPropagation()">
        <div class="contact-modal-header">
          <h3>Manage Knowledge Bases</h3>
          <button class="contact-modal-close" id="kb-manage-close">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="contact-modal-body scrollable" id="kb-manage-body">
          <div style="text-align:center; padding: 2rem; color: var(--text-secondary);">
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin-bottom:0.5rem; opacity:0.5;">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            <p>Loading...</p>
          </div>
        </div>
        <div class="contact-modal-footer" style="justify-content: flex-end;">
          <button class="btn btn-secondary" id="kb-manage-done">Done</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener('click', close);
    document.getElementById('kb-manage-close').addEventListener('click', close);
    document.getElementById('kb-manage-done').addEventListener('click', close);

    // Load fresh list
    try {
      const sources = await listSources();
      this.knowledgeSources = sources;
      this._renderManageList(sources, overlay);
    } catch {
      document.getElementById('kb-manage-body').innerHTML = `
        <div style="text-align:center; padding: 2rem; color: var(--error-color, #ef4444);">
          Failed to load knowledge bases. Please try again.
        </div>
      `;
    }
  },

  _renderManageList(sources, overlay) {
    const body = overlay.querySelector('#kb-manage-body');

    if (!sources || sources.length === 0) {
      body.innerHTML = `
        <div style="text-align:center; padding: 2rem; color: var(--text-secondary);">
          <p>No knowledge bases yet.</p>
          <p style="font-size:0.875rem; margin-top:0.25rem;">Use "Create New Knowledge Base" to add one.</p>
        </div>
      `;
      return;
    }

    body.innerHTML = sources.map(kb => `
      <div class="kb-manage-item" data-kb-id="${kb.id}">
        <div class="kb-manage-item-icon">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
          </svg>
        </div>
        <div class="kb-manage-item-content">
          <span class="kb-manage-item-title">${kb.title || 'Untitled'}</span>
          <span class="kb-manage-item-meta">
            ${kb.chunk_count ? `${kb.chunk_count} chunks` : 'Processing...'}${kb.crawl_mode && kb.crawl_mode !== 'single' ? ` · ${kb.crawl_mode}` : ''}
          </span>
        </div>
        <button class="btn btn-danger btn-sm kb-manage-delete" data-kb-id="${kb.id}" style="flex-shrink:0;">Delete</button>
      </div>
    `).join('');

    // Attach delete handlers
    body.querySelectorAll('.kb-manage-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const kbId = btn.dataset.kbId;
        const kb = this.knowledgeSources.find(k => k.id === kbId);
        const kbName = kb?.title || 'this knowledge base';

        if (!confirm(`Delete "${kbName}"? This will permanently remove all its content and cannot be undone.`)) return;

        btn.disabled = true;
        btn.textContent = 'Deleting...';

        try {
          await deleteSource(kbId);

          // Remove from local list
          this.knowledgeSources = this.knowledgeSources.filter(k => k.id !== kbId);

          // Remove from agent selection if it was selected
          if ((this.agent.knowledge_source_ids || []).includes(kbId)) {
            this.agent.knowledge_source_ids = this.agent.knowledge_source_ids.filter(id => id !== kbId);
            this.scheduleAutoSave({ knowledge_source_ids: this.agent.knowledge_source_ids });
          }

          // Remove row from modal
          const row = overlay.querySelector(`.kb-manage-item[data-kb-id="${kbId}"]`);
          if (row) row.remove();

          // Show empty state if nothing left
          if (overlay.querySelectorAll('.kb-manage-item').length === 0) {
            this._renderManageList([], overlay);
          }

          // Refresh the dropdown
          this._refreshKBDropdown();
          showToast(`"${kbName}" deleted.`, 'success');

        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Delete';
          showToast(err.message || 'Failed to delete knowledge base.', 'error');
        }
      });
    });
  },

  // ─── Dropdown Refresh ───────────────────────────────────────────────────────

  _refreshKBDropdown() {
    const kbModal = document.getElementById('kb-selector-modal');
    if (!kbModal) return;

    const selectedIds = this.agent.knowledge_source_ids || [];

    // Replace the section content (items + empty state)
    const section = kbModal.querySelector('.kb-modal-section');
    if (section) {
      section.innerHTML = `
        <div class="kb-modal-section-title">Select Knowledge Bases</div>
        ${this.knowledgeSources.length === 0 ? `
        <div class="kb-modal-empty">
          <p>No knowledge bases available</p>
        </div>
        ` : this.knowledgeSources.map(kb => `
        <button class="kb-modal-item ${selectedIds.includes(kb.id) ? 'selected' : ''}" data-kb-id="${kb.id}">
          <div class="kb-modal-item-checkbox">
            ${selectedIds.includes(kb.id) ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
          </div>
          <div class="kb-modal-item-content">
            <span class="kb-modal-item-title">${kb.title || 'Untitled'}</span>
            <span class="kb-modal-item-desc">${kb.chunk_count ? `${kb.chunk_count} chunks` : ''}${kb.crawl_mode && kb.crawl_mode !== 'single' ? ` · ${kb.crawl_mode}` : ''}</span>
          </div>
        </button>
        `).join('')}
      `;

      // Re-attach item click listeners
      section.querySelectorAll('.kb-modal-item[data-kb-id]').forEach(item => {
        item.addEventListener('click', () => {
          const kbId = item.dataset.kbId;
          if (!kbId) return;

          const currentSelected = this.agent.knowledge_source_ids || [];
          const isSelected = currentSelected.includes(kbId);

          if (isSelected) {
            this.agent.knowledge_source_ids = currentSelected.filter(id => id !== kbId);
          } else {
            this.agent.knowledge_source_ids = [...currentSelected, kbId];
          }

          this.scheduleAutoSave({ knowledge_source_ids: this.agent.knowledge_source_ids });

          const checkbox = item.querySelector('.kb-modal-item-checkbox');
          if (isSelected) {
            item.classList.remove('selected');
            checkbox.innerHTML = '';
          } else {
            item.classList.add('selected');
            checkbox.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
          }

          this.updateKBSelectorButton();
          this.updateSelectedKBsList();
        });
      });
    }

    this.updateKBSelectorButton();
    this.updateSelectedKBsList();
  },
};
