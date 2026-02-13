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

      // Manage KB button - navigate to knowledge page
      const manageKbBtn = document.getElementById('kb-modal-manage');
      if (manageKbBtn) {
        manageKbBtn.addEventListener('click', () => {
          window.location.href = '/knowledge';
        });
      }

      // Create KB button - navigate to knowledge page
      const createKbBtn = document.getElementById('kb-modal-create');
      if (createKbBtn) {
        createKbBtn.addEventListener('click', () => {
          window.location.href = '/knowledge';
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
  }
};
