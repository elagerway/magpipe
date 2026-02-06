/**
 * Knowledge Source Manager Component
 * Manage knowledge sources for AI assistant
 */

import { addSource, addManualSource, listSources, deleteSource, getCrawlStatus, getCrawledUrls } from '../services/knowledgeService.js';

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
  let crawlStatusPolling = null;  // Interval for polling crawl status

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

      // Check if any sources are actively crawling and start polling
      const hasCrawling = sources.some(s =>
        s.sync_status === 'syncing' && s.crawl_mode && s.crawl_mode !== 'single'
      );
      if (hasCrawling) {
        startCrawlPolling();
      }
    } catch (error) {
      console.error('Load sources error:', error);
      showError(error.message || 'Failed to load knowledge sources');
      sources = []; // Reset to empty on error
    } finally {
      setLoading(false);
      renderSources(); // Always render after loading completes
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

    // Crawl mode (if not single)
    if (source.crawl_mode && source.crawl_mode !== 'single') {
      const modeLabel = document.createElement('dt');
      modeLabel.textContent = 'Crawl Mode:';
      const modeValue = document.createElement('dd');
      modeValue.textContent = formatCrawlMode(source.crawl_mode);
      detailsList.appendChild(modeLabel);
      detailsList.appendChild(modeValue);
    }

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

    // Crawl progress (shown when syncing with sitemap/recursive mode)
    if (source.sync_status === 'syncing' && source.crawl_mode && source.crawl_mode !== 'single') {
      const progressContainer = document.createElement('div');
      progressContainer.className = 'crawl-progress';
      progressContainer.id = `crawl-progress-${source.id}`;
      progressContainer.innerHTML = '<div class="progress-loading">Loading crawl status...</div>';
      details.appendChild(progressContainer);

      // Fetch and display crawl status
      loadCrawlStatus(source.id, progressContainer);
    }

    // Action buttons container
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'source-actions';

    // View URLs button (only for multi-page sources)
    if (source.crawl_mode && source.crawl_mode !== 'single' && source.chunk_count > 0) {
      const viewUrlsBtn = document.createElement('button');
      viewUrlsBtn.className = 'btn-view-urls';
      viewUrlsBtn.textContent = 'View Parsed URLs';
      viewUrlsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showParsedUrls(source);
      });
      actionsContainer.appendChild(viewUrlsBtn);
    }

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete-source';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmDelete(source);
    });
    actionsContainer.appendChild(deleteBtn);

    details.appendChild(actionsContainer);
    card.appendChild(details);

    return card;
  }

  /**
   * Show parsed URLs modal
   */
  async function showParsedUrls(source) {
    const modal = createModal();

    const container = document.createElement('div');
    container.className = 'parsed-urls-modal';

    const title = document.createElement('h3');
    title.textContent = 'Parsed URLs';
    container.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.className = 'modal-subtitle';
    subtitle.textContent = `URLs crawled from "${source.title}"`;
    container.appendChild(subtitle);

    // Loading state
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'urls-loading';
    loadingDiv.textContent = 'Loading URLs...';
    container.appendChild(loadingDiv);

    // URL list container
    const urlList = document.createElement('div');
    urlList.className = 'parsed-urls-list';
    urlList.style.display = 'none';
    container.appendChild(urlList);

    // Close button
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'modal-buttons';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-cancel';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => modal.remove());
    buttonContainer.appendChild(closeBtn);
    container.appendChild(buttonContainer);

    modal.appendChild(container);
    document.body.appendChild(modal);

    // Load URLs
    try {
      const urls = await getCrawledUrls(source.id);

      loadingDiv.style.display = 'none';
      urlList.style.display = 'block';

      if (urls.length === 0) {
        urlList.innerHTML = '<div class="no-urls">No URLs found</div>';
        return;
      }

      // Summary
      const summary = document.createElement('div');
      summary.className = 'urls-summary';
      summary.textContent = `${urls.length} page${urls.length !== 1 ? 's' : ''} crawled`;
      urlList.appendChild(summary);

      // URL items
      urls.forEach(item => {
        const urlItem = document.createElement('div');
        urlItem.className = 'url-item';

        const urlTitle = document.createElement('div');
        urlTitle.className = 'url-item-title';
        urlTitle.textContent = item.title || 'Untitled';
        urlItem.appendChild(urlTitle);

        const urlLink = document.createElement('a');
        urlLink.className = 'url-item-link';
        urlLink.href = item.url;
        urlLink.target = '_blank';
        urlLink.rel = 'noopener noreferrer';
        urlLink.textContent = item.url;
        urlItem.appendChild(urlLink);

        const urlChunks = document.createElement('div');
        urlChunks.className = 'url-item-chunks';
        urlChunks.textContent = `${item.chunkCount} chunk${item.chunkCount !== 1 ? 's' : ''}`;
        urlItem.appendChild(urlChunks);

        urlList.appendChild(urlItem);
      });

    } catch (error) {
      console.error('Error loading URLs:', error);
      loadingDiv.textContent = 'Failed to load URLs';
      loadingDiv.classList.add('error');
    }
  }

  /**
   * Load and display crawl status for a source
   */
  async function loadCrawlStatus(sourceId, container) {
    try {
      const status = await getCrawlStatus(sourceId);
      if (!status) {
        container.innerHTML = '';
        return;
      }

      const progress = status.pagesDiscovered > 0
        ? Math.round((status.pagesCrawled / status.pagesDiscovered) * 100)
        : 0;

      container.innerHTML = `
        <div class="progress-header">
          <span>Crawling pages...</span>
          <span>${status.pagesCrawled} / ${status.pagesDiscovered}</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
        ${status.currentUrl ? `<div class="progress-current">Current: ${truncateUrl(status.currentUrl)}</div>` : ''}
        ${status.pagesFailed > 0 ? `<div class="progress-failed">${status.pagesFailed} pages failed</div>` : ''}
      `;
    } catch (error) {
      console.error('Error loading crawl status:', error);
      container.innerHTML = '<div class="progress-error">Could not load crawl status</div>';
    }
  }

  /**
   * Start polling for crawl status updates
   */
  function startCrawlPolling() {
    if (crawlStatusPolling) return;

    crawlStatusPolling = setInterval(async () => {
      // Check if any sources are still syncing
      const syncingSources = sources.filter(s =>
        s.sync_status === 'syncing' && s.crawl_mode && s.crawl_mode !== 'single'
      );

      if (syncingSources.length === 0) {
        stopCrawlPolling();
        return;
      }

      // Update status for each syncing source
      for (const source of syncingSources) {
        const container = document.getElementById(`crawl-progress-${source.id}`);
        if (container) {
          await loadCrawlStatus(source.id, container);
        }
      }

      // Refresh sources to check for completion
      const newSources = await listSources();
      const wasComplete = !sources.some(s => s.sync_status === 'syncing');
      const isNowComplete = !newSources.some(s => s.sync_status === 'syncing');

      if (!wasComplete && isNowComplete) {
        // Crawl just completed, refresh the list
        sources = newSources;
        renderSources();
        showSuccess('Crawl completed successfully');
      }
    }, 5000);  // Poll every 5 seconds
  }

  /**
   * Stop crawl status polling
   */
  function stopCrawlPolling() {
    if (crawlStatusPolling) {
      clearInterval(crawlStatusPolling);
      crawlStatusPolling = null;
    }
  }

  /**
   * Truncate URL for display
   */
  function truncateUrl(url) {
    if (url.length > 60) {
      return url.substring(0, 57) + '...';
    }
    return url;
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

    // Source type selector
    const sourceTypeLabel = document.createElement('label');
    sourceTypeLabel.textContent = 'Source Type:';
    const sourceTypeSelect = document.createElement('select');
    sourceTypeSelect.name = 'source_type';
    sourceTypeSelect.innerHTML = `
      <option value="url">Website URL</option>
      <option value="paste">Paste Content</option>
      <option value="file">Upload File (PDF/Text)</option>
    `;
    sourceTypeLabel.appendChild(sourceTypeSelect);
    form.appendChild(sourceTypeLabel);

    // URL section
    const urlSection = document.createElement('div');
    urlSection.className = 'url-section';

    const urlLabel = document.createElement('label');
    urlLabel.textContent = 'URL:';
    const urlInput = document.createElement('input');
    urlInput.type = 'url';
    urlInput.name = 'url';
    urlInput.placeholder = 'https://example.com/documentation';
    urlInput.required = true;
    urlLabel.appendChild(urlInput);
    urlSection.appendChild(urlLabel);
    form.appendChild(urlSection);

    // Paste content section (hidden by default)
    const pasteSection = document.createElement('div');
    pasteSection.className = 'paste-section';
    pasteSection.style.display = 'none';

    const titleLabel = document.createElement('label');
    titleLabel.textContent = 'Title:';
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.name = 'title';
    titleInput.placeholder = 'My Knowledge Base';
    titleLabel.appendChild(titleInput);
    pasteSection.appendChild(titleLabel);

    const contentLabel = document.createElement('label');
    contentLabel.textContent = 'Content:';
    const contentInput = document.createElement('textarea');
    contentInput.name = 'content';
    contentInput.placeholder = 'Paste your content here...';
    contentInput.style.cssText = 'min-height: 200px; resize: vertical;';
    contentLabel.appendChild(contentInput);
    pasteSection.appendChild(contentLabel);
    form.appendChild(pasteSection);

    // File upload section (hidden by default)
    const fileSection = document.createElement('div');
    fileSection.className = 'file-section';
    fileSection.style.display = 'none';

    const fileTitleLabel = document.createElement('label');
    fileTitleLabel.textContent = 'Title:';
    const fileTitleInput = document.createElement('input');
    fileTitleInput.type = 'text';
    fileTitleInput.name = 'file_title';
    fileTitleInput.placeholder = 'Document title';
    fileTitleLabel.appendChild(fileTitleInput);
    fileSection.appendChild(fileTitleLabel);

    const fileLabel = document.createElement('label');
    fileLabel.textContent = 'File (PDF or Text):';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.name = 'file';
    fileInput.accept = '.pdf,.txt,.md,.text';
    fileLabel.appendChild(fileInput);
    fileSection.appendChild(fileLabel);

    const fileInfo = document.createElement('p');
    fileInfo.style.cssText = 'color: #6b7280; font-size: 12px; margin: 6px 0 0 0;';
    fileInfo.textContent = 'Supported: PDF, TXT, MD files (max 500KB)';
    fileSection.appendChild(fileInfo);
    form.appendChild(fileSection);

    // URL options container (sync period, crawl mode, etc.)
    const urlOptionsSection = document.createElement('div');
    urlOptionsSection.className = 'url-options-section';

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
    urlOptionsSection.appendChild(periodLabel);

    // Crawl mode section
    const crawlModeLabel = document.createElement('label');
    crawlModeLabel.textContent = 'Crawl Mode:';
    const crawlModeSelect = document.createElement('select');
    crawlModeSelect.name = 'crawl_mode';

    const crawlModes = [
      { value: 'single', label: 'Single Page', description: 'Only crawl this URL' },
      { value: 'sitemap', label: 'Sitemap', description: 'Parse sitemap.xml and crawl all URLs' },
      { value: 'recursive', label: 'Recursive', description: 'Follow links on pages' },
    ];

    crawlModes.forEach(mode => {
      const option = document.createElement('option');
      option.value = mode.value;
      option.textContent = mode.label;
      if (mode.value === 'single') {
        option.selected = true;
      }
      crawlModeSelect.appendChild(option);
    });

    crawlModeLabel.appendChild(crawlModeSelect);
    urlOptionsSection.appendChild(crawlModeLabel);

    // Advanced crawl options container (hidden by default)
    const advancedOptions = document.createElement('div');
    advancedOptions.className = 'advanced-crawl-options';
    advancedOptions.style.cssText = 'display: none; margin-bottom: 16px; padding: 16px; background: #f3f4f6; border-radius: 8px;';

    // Max pages input
    const maxPagesLabel = document.createElement('label');
    maxPagesLabel.textContent = 'Max Pages:';
    maxPagesLabel.style.cssText = 'display: block; margin-bottom: 4px; font-weight: 500;';

    const maxPagesInput = document.createElement('input');
    maxPagesInput.type = 'number';
    maxPagesInput.name = 'max_pages';
    maxPagesInput.value = '100';
    maxPagesInput.min = '1';
    maxPagesInput.max = '500';
    maxPagesInput.style.cssText = 'width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; margin-bottom: 12px;';

    const maxPagesHelp = document.createElement('p');
    maxPagesHelp.style.cssText = 'color: #6b7280; font-size: 12px; margin: 0 0 16px 0;';
    maxPagesHelp.textContent = 'Maximum number of pages to crawl (1-500)';

    advancedOptions.appendChild(maxPagesLabel);
    advancedOptions.appendChild(maxPagesInput);
    advancedOptions.appendChild(maxPagesHelp);

    // Crawl depth input (only for recursive)
    const depthContainer = document.createElement('div');
    depthContainer.className = 'depth-container';
    depthContainer.style.display = 'none';

    const depthLabel = document.createElement('label');
    depthLabel.textContent = 'Crawl Depth:';
    depthLabel.style.cssText = 'display: block; margin-bottom: 4px; font-weight: 500;';

    const depthInput = document.createElement('input');
    depthInput.type = 'number';
    depthInput.name = 'crawl_depth';
    depthInput.value = '2';
    depthInput.min = '1';
    depthInput.max = '5';
    depthInput.style.cssText = 'width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; margin-bottom: 12px;';

    const depthHelp = document.createElement('p');
    depthHelp.style.cssText = 'color: #6b7280; font-size: 12px; margin: 0 0 16px 0;';
    depthHelp.textContent = 'How many levels of links to follow (1-5)';

    depthContainer.appendChild(depthLabel);
    depthContainer.appendChild(depthInput);
    depthContainer.appendChild(depthHelp);
    advancedOptions.appendChild(depthContainer);

    // Respect robots.txt checkbox
    const robotsLabel = document.createElement('label');
    robotsLabel.style.cssText = 'display: flex; align-items: center; gap: 8px; cursor: pointer;';

    const robotsCheckbox = document.createElement('input');
    robotsCheckbox.type = 'checkbox';
    robotsCheckbox.name = 'respect_robots_txt';
    robotsCheckbox.checked = true;
    robotsCheckbox.style.cssText = 'width: auto; margin: 0;';

    const robotsText = document.createElement('span');
    robotsText.textContent = 'Respect robots.txt';
    robotsText.style.fontWeight = '500';

    robotsLabel.appendChild(robotsCheckbox);
    robotsLabel.appendChild(robotsText);
    advancedOptions.appendChild(robotsLabel);

    urlOptionsSection.appendChild(advancedOptions);

    // Toggle advanced options based on crawl mode
    crawlModeSelect.addEventListener('change', () => {
      const mode = crawlModeSelect.value;
      if (mode === 'single') {
        advancedOptions.style.display = 'none';
      } else {
        advancedOptions.style.display = 'block';
        depthContainer.style.display = mode === 'recursive' ? 'block' : 'none';
      }
    });

    // Auth section for protected pages
    const authContainer = document.createElement('div');
    authContainer.className = 'auth-section';
    authContainer.style.cssText = 'margin-bottom: 16px;';

    const authCheckboxLabel = document.createElement('label');
    authCheckboxLabel.style.cssText = 'display: flex; align-items: center; gap: 8px; cursor: pointer;';

    const authCheckbox = document.createElement('input');
    authCheckbox.type = 'checkbox';
    authCheckbox.name = 'use_auth';
    authCheckbox.id = 'use_auth';
    authCheckbox.style.cssText = 'width: auto; margin: 0;';

    const authLabelText = document.createElement('span');
    authLabelText.textContent = 'Requires authentication';
    authLabelText.style.fontWeight = '500';

    authCheckboxLabel.appendChild(authCheckbox);
    authCheckboxLabel.appendChild(authLabelText);
    authContainer.appendChild(authCheckboxLabel);

    // Auth input fields (hidden by default)
    const authFields = document.createElement('div');
    authFields.className = 'auth-fields';
    authFields.style.cssText = 'display: none; margin-top: 12px; padding: 12px; background: #f9fafb; border-radius: 6px;';

    // Auth type selector
    const authTypeLabel = document.createElement('label');
    authTypeLabel.textContent = 'Auth Type:';
    authTypeLabel.style.cssText = 'display: block; margin-bottom: 4px; font-weight: 500;';

    const authTypeSelect = document.createElement('select');
    authTypeSelect.name = 'auth_type';
    authTypeSelect.style.cssText = 'width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; margin-bottom: 12px;';
    authTypeSelect.innerHTML = `
      <option value="bearer">Bearer Token / API Key</option>
      <option value="basic">Basic Auth (Username & Password)</option>
    `;

    authFields.appendChild(authTypeLabel);
    authFields.appendChild(authTypeSelect);

    // Bearer token fields
    const bearerFields = document.createElement('div');
    bearerFields.className = 'bearer-fields';

    const authHeaderLabel = document.createElement('label');
    authHeaderLabel.textContent = 'Authorization Header:';
    authHeaderLabel.style.cssText = 'display: block; margin-bottom: 4px; font-weight: 500;';

    const authHeaderInput = document.createElement('input');
    authHeaderInput.type = 'text';
    authHeaderInput.name = 'auth_header';
    authHeaderInput.placeholder = 'Bearer your-api-token-here';
    authHeaderInput.style.cssText = 'width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; font-family: monospace;';

    const authHeaderHelp = document.createElement('p');
    authHeaderHelp.style.cssText = 'color: #6b7280; font-size: 12px; margin: 6px 0 0 0;';
    authHeaderHelp.textContent = 'Enter your API key or bearer token';

    bearerFields.appendChild(authHeaderLabel);
    bearerFields.appendChild(authHeaderInput);
    bearerFields.appendChild(authHeaderHelp);
    authFields.appendChild(bearerFields);

    // Basic auth fields (hidden by default)
    const basicFields = document.createElement('div');
    basicFields.className = 'basic-fields';
    basicFields.style.display = 'none';

    const usernameLabel = document.createElement('label');
    usernameLabel.textContent = 'Username:';
    usernameLabel.style.cssText = 'display: block; margin-bottom: 4px; font-weight: 500;';

    const usernameInput = document.createElement('input');
    usernameInput.type = 'text';
    usernameInput.name = 'username';
    usernameInput.placeholder = 'username';
    usernameInput.style.cssText = 'width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; margin-bottom: 12px;';

    const passwordLabel = document.createElement('label');
    passwordLabel.textContent = 'Password:';
    passwordLabel.style.cssText = 'display: block; margin-bottom: 4px; font-weight: 500;';

    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.name = 'password';
    passwordInput.placeholder = 'password';
    passwordInput.style.cssText = 'width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px;';

    basicFields.appendChild(usernameLabel);
    basicFields.appendChild(usernameInput);
    basicFields.appendChild(passwordLabel);
    basicFields.appendChild(passwordInput);
    authFields.appendChild(basicFields);

    // Toggle between auth types
    authTypeSelect.addEventListener('change', () => {
      if (authTypeSelect.value === 'bearer') {
        bearerFields.style.display = 'block';
        basicFields.style.display = 'none';
      } else {
        bearerFields.style.display = 'none';
        basicFields.style.display = 'block';
      }
    });

    authContainer.appendChild(authFields);

    // Toggle auth fields visibility
    authCheckbox.addEventListener('change', () => {
      authFields.style.display = authCheckbox.checked ? 'block' : 'none';
      if (authCheckbox.checked) {
        authHeaderInput.focus();
      }
    });

    urlOptionsSection.appendChild(authContainer);

    // Add URL options section to form
    form.appendChild(urlOptionsSection);

    // Toggle sections based on source type
    sourceTypeSelect.addEventListener('change', () => {
      const type = sourceTypeSelect.value;
      urlSection.style.display = type === 'url' ? 'block' : 'none';
      urlOptionsSection.style.display = type === 'url' ? 'block' : 'none';
      pasteSection.style.display = type === 'paste' ? 'block' : 'none';
      fileSection.style.display = type === 'file' ? 'block' : 'none';

      // Update required fields
      urlInput.required = type === 'url';
      titleInput.required = type === 'paste';
      contentInput.required = type === 'paste';
      fileTitleInput.required = type === 'file';
      fileInput.required = type === 'file';
    });

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

    // Inline error message container (shows errors directly in modal)
    const errorContainer = document.createElement('div');
    errorContainer.className = 'modal-error-message';
    errorContainer.style.cssText = 'display: none; margin-top: 12px; padding: 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #dc2626; font-size: 14px;';
    form.appendChild(errorContainer);

    // Form submit handler
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const sourceType = sourceTypeSelect.value;

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Adding...';

        let result;

        if (sourceType === 'url') {
          // URL-based source
          const url = urlInput.value.trim();
          const syncPeriod = periodSelect.value;
          const crawlMode = crawlModeSelect.value;
          const useAuth = authCheckbox.checked;
          const authType = authTypeSelect.value;
          const authHeaderValue = authHeaderInput.value.trim();
          const username = usernameInput.value.trim();
          const password = passwordInput.value;

          submitBtn.textContent = crawlMode === 'single' ? 'Adding...' : 'Starting crawl...';

          // Build auth headers based on auth type
          let authHeaders = null;
          if (useAuth) {
            if (authType === 'bearer' && authHeaderValue) {
              authHeaders = { 'Authorization': authHeaderValue };
            } else if (authType === 'basic' && username && password) {
              const credentials = btoa(`${username}:${password}`);
              authHeaders = { 'Authorization': `Basic ${credentials}` };
            }
          }

          // Build crawl options
          const crawlOptions = { crawlMode };
          if (crawlMode !== 'single') {
            crawlOptions.maxPages = parseInt(maxPagesInput.value, 10) || 100;
            crawlOptions.respectRobotsTxt = robotsCheckbox.checked;
            if (crawlMode === 'recursive') {
              crawlOptions.crawlDepth = parseInt(depthInput.value, 10) || 2;
            }
          }

          result = await addSource(url, syncPeriod, authHeaders, crawlOptions);

          modal.remove();
          await loadSources();

          if (crawlMode === 'single') {
            showSuccess('Knowledge source added successfully');
          } else {
            showSuccess(`Crawl started! Found ${result.pagesDiscovered || 0} pages to process.`);
            startCrawlPolling();
          }

        } else if (sourceType === 'paste') {
          // Paste content
          const title = titleInput.value.trim();
          const content = contentInput.value.trim();

          if (!title) {
            throw new Error('Title is required');
          }
          if (!content || content.length < 50) {
            throw new Error('Content must be at least 50 characters');
          }

          submitBtn.textContent = 'Processing content...';
          result = await addManualSource(title, { content });

          modal.remove();
          await loadSources();
          showSuccess(`Knowledge source "${title}" added with ${result.chunkCount} chunks`);

        } else if (sourceType === 'file') {
          // File upload
          const title = fileTitleInput.value.trim();
          const file = fileInput.files[0];

          if (!title) {
            throw new Error('Title is required');
          }
          if (!file) {
            throw new Error('Please select a file');
          }
          if (file.size > 500 * 1024) {
            throw new Error('File too large (max 500KB)');
          }

          submitBtn.textContent = 'Reading file...';

          // Read file as base64
          const fileData = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
          });

          // Determine file type
          let fileType;
          if (file.name.endsWith('.pdf')) {
            fileType = 'pdf';
          } else if (file.name.endsWith('.txt') || file.name.endsWith('.md') || file.name.endsWith('.text')) {
            fileType = 'text';
          } else {
            throw new Error('Unsupported file type. Use PDF or text files.');
          }

          submitBtn.textContent = 'Processing file...';
          result = await addManualSource(title, {
            fileData,
            fileType,
            fileName: file.name
          });

          modal.remove();
          await loadSources();
          showSuccess(`File "${file.name}" added with ${result.chunkCount} chunks`);
        }

      } catch (error) {
        console.error('Add source error:', error);
        // Show error inline in modal
        errorContainer.textContent = error.message || 'Failed to add knowledge source';
        errorContainer.style.display = 'block';
        // Also show toast
        showError(error.message || 'Failed to add knowledge source');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Source';
      }
    });

    modal.appendChild(form);
    document.body.appendChild(modal);

    // Focus based on source type
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

  /**
   * Format crawl mode
   */
  function formatCrawlMode(mode) {
    const modeMap = {
      'single': 'Single Page',
      'sitemap': 'Sitemap',
      'recursive': 'Recursive',
    };
    return modeMap[mode] || mode;
  }

  // Public API
  return {
    destroy: () => {
      stopCrawlPolling();
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
      transition: border-color 0.2s;
    }

    .source-card:hover {
      border-color: #d1d5db;
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

    .status-badge.status-crawling {
      background: #e0e7ff;
      color: #3730a3;
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

    /* Source actions container */
    .source-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .btn-view-urls {
      padding: 8px 16px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-view-urls:hover {
      background: #2563eb;
    }

    /* Parsed URLs modal */
    .parsed-urls-modal {
      background: white;
      padding: 24px;
      border-radius: 12px;
      max-width: 600px;
      width: 90%;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
    }

    .parsed-urls-modal h3 {
      margin: 0 0 8px 0;
      font-size: 20px;
    }

    .modal-subtitle {
      color: #6b7280;
      margin: 0 0 16px 0;
      font-size: 14px;
    }

    .urls-loading {
      padding: 20px;
      text-align: center;
      color: #6b7280;
    }

    .urls-loading.error {
      color: #dc2626;
    }

    .parsed-urls-list {
      flex: 1;
      overflow-y: auto;
      max-height: 400px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .urls-summary {
      padding: 12px 16px;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
      font-weight: 500;
      color: #374151;
      position: sticky;
      top: 0;
    }

    .no-urls {
      padding: 40px;
      text-align: center;
      color: #6b7280;
    }

    .url-item {
      padding: 12px 16px;
      border-bottom: 1px solid #e5e7eb;
    }

    .url-item:last-child {
      border-bottom: none;
    }

    .url-item:hover {
      background: #f9fafb;
    }

    .url-item-title {
      font-weight: 500;
      color: #111827;
      margin-bottom: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .url-item-link {
      display: block;
      color: #3b82f6;
      font-size: 13px;
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-bottom: 4px;
    }

    .url-item-link:hover {
      text-decoration: underline;
    }

    .url-item-chunks {
      font-size: 12px;
      color: #6b7280;
    }

    /* Crawl progress styles */
    .crawl-progress {
      margin-top: 16px;
      padding: 12px;
      background: #f0f9ff;
      border-radius: 8px;
      border: 1px solid #bae6fd;
    }

    .progress-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 14px;
      color: #0369a1;
    }

    .progress-bar {
      height: 8px;
      background: #e0f2fe;
      border-radius: 4px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: #0ea5e9;
      border-radius: 4px;
      transition: width 0.3s ease;
    }

    .progress-current {
      margin-top: 8px;
      font-size: 12px;
      color: #6b7280;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .progress-failed {
      margin-top: 4px;
      font-size: 12px;
      color: #dc2626;
    }

    .progress-loading,
    .progress-error {
      font-size: 14px;
      color: #6b7280;
    }

    .progress-error {
      color: #dc2626;
    }

    /* Advanced options styles */
    .advanced-crawl-options {
      border: 1px solid #e5e7eb;
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

    /* Toast notification styles */
    .toast {
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      z-index: 10001;
      animation: slide-up 0.3s ease;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .toast-error {
      background: #fef2f2;
      color: #dc2626;
      border: 1px solid #fecaca;
    }

    .toast-success {
      background: #f0fdf4;
      color: #16a34a;
      border: 1px solid #bbf7d0;
    }

    @keyframes slide-up {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
  `;

  document.head.appendChild(style);
}
