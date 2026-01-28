/**
 * Knowledge Source Manager Component
 * Manage knowledge sources for AI assistant
 */

import { addSource, listSources, deleteSource } from '../services/knowledgeService.js';

/**
 * Create knowledge source manager
 * @param {HTMLElement} container - Container element
 * @returns {object} Component API
 */
export function createKnowledgeSourceManager(container) {
  // Component state
  let sources = [];
  let isLoading = false;
  let expandedSourceId = null;

  // Create elements
  const managerContainer = document.createElement('div');
  managerContainer.className = 'knowledge-source-manager';

  // Header
  const header = document.createElement('div');
  header.className = 'manager-header';

  const title = document.createElement('h2');
  title.textContent = 'Knowledge Sources';
  header.appendChild(title);

  const addButton = document.createElement('button');
  addButton.className = 'btn-add-source';
  addButton.textContent = '+ Add Source';
  addButton.addEventListener('click', showAddModal);
  header.appendChild(addButton);

  managerContainer.appendChild(header);

  // Source list
  const sourceList = document.createElement('div');
  sourceList.className = 'source-list';
  managerContainer.appendChild(sourceList);

  // Append to container
  container.appendChild(managerContainer);

  // Load sources on mount
  loadSources();

  /**
   * Load sources from server
   */
  async function loadSources() {
    setLoading(true);

    try {
      sources = await listSources();
      renderSources();
    } catch (error) {
      console.error('Load sources error:', error);
      showError(error.message || 'Failed to load knowledge sources');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Render source list
   */
  function renderSources() {
    sourceList.innerHTML = '';

    if (sources.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'source-list-empty';
      empty.textContent = 'No knowledge sources yet. Add one to get started!';
      sourceList.appendChild(empty);
      return;
    }

    sources.forEach(source => {
      const card = createSourceCard(source);
      sourceList.appendChild(card);
    });
  }

  /**
   * Create source card element
   */
  function createSourceCard(source) {
    const card = document.createElement('div');
    card.className = 'source-card';

    // Header (always visible)
    const cardHeader = document.createElement('div');
    cardHeader.className = 'source-card-header';
    cardHeader.addEventListener('click', () => toggleExpand(source.id));

    const titleContainer = document.createElement('div');
    titleContainer.className = 'source-title-container';

    const sourceTitle = document.createElement('div');
    sourceTitle.className = 'source-title';
    sourceTitle.textContent = source.title || 'Untitled';

    const sourceUrl = document.createElement('div');
    sourceUrl.className = 'source-url';
    sourceUrl.textContent = source.url;

    titleContainer.appendChild(sourceTitle);
    titleContainer.appendChild(sourceUrl);

    const statusBadge = document.createElement('span');
    statusBadge.className = `status-badge status-${source.sync_status || 'pending'}`;
    statusBadge.textContent = source.sync_status || 'pending';

    cardHeader.appendChild(titleContainer);
    cardHeader.appendChild(statusBadge);

    card.appendChild(cardHeader);

    // Details (expandable)
    const details = document.createElement('div');
    details.className = 'source-details';
    details.style.display = expandedSourceId === source.id ? 'block' : 'none';

    const detailsList = document.createElement('dl');

    // Chunk count
    const chunkLabel = document.createElement('dt');
    chunkLabel.textContent = 'Chunks:';
    const chunkValue = document.createElement('dd');
    chunkValue.textContent = source.chunk_count || 0;
    detailsList.appendChild(chunkLabel);
    detailsList.appendChild(chunkValue);

    // Last synced
    if (source.last_synced_at) {
      const syncLabel = document.createElement('dt');
      syncLabel.textContent = 'Last Synced:';
      const syncValue = document.createElement('dd');
      syncValue.textContent = formatDate(source.last_synced_at);
      detailsList.appendChild(syncLabel);
      detailsList.appendChild(syncValue);
    }

    // Next sync
    if (source.next_sync_at) {
      const nextLabel = document.createElement('dt');
      nextLabel.textContent = 'Next Sync:';
      const nextValue = document.createElement('dd');
      nextValue.textContent = formatDate(source.next_sync_at);
      detailsList.appendChild(nextLabel);
      detailsList.appendChild(nextValue);
    }

    // Sync period
    const periodLabel = document.createElement('dt');
    periodLabel.textContent = 'Sync Period:';
    const periodValue = document.createElement('dd');
    periodValue.textContent = formatSyncPeriod(source.sync_period);
    detailsList.appendChild(periodLabel);
    detailsList.appendChild(periodValue);

    details.appendChild(detailsList);

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete-source';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDelete(source);
    });
    details.appendChild(deleteBtn);

    card.appendChild(details);

    return card;
  }

  /**
   * Toggle card expansion
   */
  function toggleExpand(sourceId) {
    if (expandedSourceId === sourceId) {
      expandedSourceId = null;
    } else {
      expandedSourceId = sourceId;
    }
    renderSources();
  }

  /**
   * Show add source modal
   */
  function showAddModal() {
    const modal = createModal();

    const form = document.createElement('form');
    form.className = 'add-source-form';

    const formTitle = document.createElement('h3');
    formTitle.textContent = 'Add Knowledge Source';
    form.appendChild(formTitle);

    // URL input
    const urlLabel = document.createElement('label');
    urlLabel.textContent = 'URL:';
    const urlInput = document.createElement('input');
    urlInput.type = 'url';
    urlInput.name = 'url';
    urlInput.placeholder = 'https://example.com/documentation';
    urlInput.required = true;
    urlLabel.appendChild(urlInput);
    form.appendChild(urlLabel);

    // Sync period dropdown
    const periodLabel = document.createElement('label');
    periodLabel.textContent = 'Sync Period:';
    const periodSelect = document.createElement('select');
    periodSelect.name = 'sync_period';

    const periods = [
      { value: '24h', label: 'Every 24 hours' },
      { value: '7d', label: 'Every 7 days' },
      { value: '1mo', label: 'Every month' },
      { value: '3mo', label: 'Every 3 months' },
    ];

    periods.forEach(period => {
      const option = document.createElement('option');
      option.value = period.value;
      option.textContent = period.label;
      if (period.value === '7d') {
        option.selected = true;
      }
      periodSelect.appendChild(option);
    });

    periodLabel.appendChild(periodSelect);
    form.appendChild(periodLabel);

    // Buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'modal-buttons';

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'btn-submit';
    submitBtn.textContent = 'Add Source';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => modal.remove());

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(submitBtn);
    form.appendChild(buttonContainer);

    // Form submit handler
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const url = urlInput.value.trim();
      const syncPeriod = periodSelect.value;

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Adding...';

        await addSource(url, syncPeriod);

        modal.remove();
        await loadSources();
        showSuccess('Knowledge source added successfully');

      } catch (error) {
        console.error('Add source error:', error);
        showError(error.message || 'Failed to add knowledge source');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Source';
      }
    });

    modal.appendChild(form);
    document.body.appendChild(modal);

    // Focus URL input
    urlInput.focus();
  }

  /**
   * Confirm delete
   */
  function confirmDelete(source) {
    const modal = createModal();

    const confirmContainer = document.createElement('div');
    confirmContainer.className = 'confirm-delete';

    const title = document.createElement('h3');
    title.textContent = 'Delete Knowledge Source?';
    confirmContainer.appendChild(title);

    const message = document.createElement('p');
    message.textContent = `Are you sure you want to delete "${source.title}"? This will remove ${source.chunk_count || 0} chunks from your knowledge base.`;
    confirmContainer.appendChild(message);

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'modal-buttons';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
      try {
        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Deleting...';

        await deleteSource(source.id);

        modal.remove();
        await loadSources();
        showSuccess('Knowledge source deleted');

      } catch (error) {
        console.error('Delete source error:', error);
        showError(error.message || 'Failed to delete knowledge source');
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Delete';
      }
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => modal.remove());

    buttonContainer.appendChild(cancelBtn);
    buttonContainer.appendChild(deleteBtn);
    confirmContainer.appendChild(buttonContainer);

    modal.appendChild(confirmContainer);
    document.body.appendChild(modal);
  }

  /**
   * Create modal backdrop
   */
  function createModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
    return modal;
  }

  /**
   * Set loading state
   */
  function setLoading(loading) {
    isLoading = loading;

    if (loading) {
      sourceList.innerHTML = '<div class="loading-spinner">Loading...</div>';
      addButton.disabled = true;
    } else {
      addButton.disabled = false;
    }
  }

  /**
   * Show error message
   */
  function showError(message) {
    const toast = createToast(message, 'error');
    document.body.appendChild(toast);
  }

  /**
   * Show success message
   */
  function showSuccess(message) {
    const toast = createToast(message, 'success');
    document.body.appendChild(toast);
  }

  /**
   * Create toast notification
   */
  function createToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 3000);

    return toast;
  }

  /**
   * Format date
   */
  function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }

  /**
   * Format sync period
   */
  function formatSyncPeriod(period) {
    const periodMap = {
      '24h': 'Every 24 hours',
      '7d': 'Every 7 days',
      '1mo': 'Every month',
      '3mo': 'Every 3 months',
    };
    return periodMap[period] || period;
  }

  // Public API
  return {
    destroy: () => {
      managerContainer.remove();
    },
    refresh: () => {
      loadSources();
    },
  };
}

/**
 * Add CSS styles for knowledge source manager
 */
export function addKnowledgeSourceManagerStyles() {
  if (document.getElementById('knowledge-manager-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'knowledge-manager-styles';
  style.textContent = `
    .knowledge-source-manager {
      padding: 20px;
    }

    .manager-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }

    .manager-header h2 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }

    .btn-add-source {
      padding: 10px 20px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-add-source:hover:not(:disabled) {
      background: #2563eb;
    }

    .btn-add-source:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .source-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .source-list-empty {
      text-align: center;
      color: #6b7280;
      padding: 40px;
    }

    .source-card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      overflow: hidden;
      transition: box-shadow 0.2s;
    }

    .source-card:hover {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .source-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      cursor: pointer;
      user-select: none;
    }

    .source-title-container {
      flex: 1;
      min-width: 0;
    }

    .source-title {
      font-weight: 600;
      font-size: 16px;
      margin-bottom: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .source-url {
      color: #6b7280;
      font-size: 14px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .status-badge {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
      text-transform: capitalize;
    }

    .status-badge.status-pending {
      background: #fef3c7;
      color: #92400e;
    }

    .status-badge.status-syncing {
      background: #dbeafe;
      color: #1e40af;
    }

    .status-badge.status-completed {
      background: #d1fae5;
      color: #065f46;
    }

    .status-badge.status-failed {
      background: #fee2e2;
      color: #991b1b;
    }

    .source-details {
      padding: 0 16px 16px;
      border-top: 1px solid #e5e7eb;
    }

    .source-details dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 8px 16px;
      margin: 16px 0;
    }

    .source-details dt {
      font-weight: 600;
      color: #374151;
    }

    .source-details dd {
      color: #6b7280;
      margin: 0;
    }

    .btn-delete-source {
      padding: 8px 16px;
      background: #ef4444;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-delete-source:hover {
      background: #dc2626;
    }

    .loading-spinner {
      text-align: center;
      padding: 40px;
      color: #6b7280;
    }

    /* Modal styles */
    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fade-in 0.2s ease;
    }

    .add-source-form,
    .confirm-delete {
      background: white;
      padding: 24px;
      border-radius: 12px;
      max-width: 500px;
      width: 90%;
    }

    .add-source-form h3,
    .confirm-delete h3 {
      margin: 0 0 20px 0;
      font-size: 20px;
    }

    .add-source-form label {
      display: block;
      margin-bottom: 16px;
      font-weight: 500;
    }

    .add-source-form input,
    .add-source-form select {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      margin-top: 4px;
      font-size: 14px;
    }

    .modal-buttons {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 20px;
    }

    .modal-buttons button {
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-submit {
      background: #3b82f6;
      color: white;
    }

    .btn-submit:hover:not(:disabled) {
      background: #2563eb;
    }

    .btn-delete {
      background: #ef4444;
      color: white;
    }

    .btn-delete:hover:not(:disabled) {
      background: #dc2626;
    }

    .btn-cancel {
      background: #e5e7eb;
      color: #374151;
    }

    .btn-cancel:hover {
      background: #d1d5db;
    }

    .modal-buttons button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .confirm-delete p {
      color: #6b7280;
      margin-bottom: 20px;
    }

    /* Mobile responsive */
    @media (max-width: 768px) {
      .knowledge-source-manager {
        padding: 12px;
      }

      .manager-header {
        flex-direction: column;
        align-items: stretch;
        gap: 12px;
      }

      .source-card-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
      }

      .source-title-container {
        width: 100%;
      }

      .add-source-form,
      .confirm-delete {
        width: 95%;
      }
    }

    @keyframes fade-in {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    .fade-out {
      animation: fade-out 0.3s ease;
      opacity: 0;
    }

    @keyframes fade-out {
      from {
        opacity: 1;
      }
      to {
        opacity: 0;
      }
    }
  `;

  document.head.appendChild(style);
}
