/**
 * Admin Marketing Tab
 * Container with sub-tabs: Blog, Directories, Reviews, Monitor
 * Uses show/hide pattern (like Support tab) — each sub-tab only loads once.
 */

const MARKETING_SUBTABS = [
  { id: 'blog', label: 'Blog' },
  { id: 'directories', label: 'Directories' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'monitor', label: 'Monitor' },
];

export const marketingTabMethods = {

  async renderMarketingTab() {
    const container = document.getElementById('admin-tab-content');
    if (!container) return;

    const subtab = this.activeMarketingSubtab || 'blog';
    this._marketingLoaded = {};

    container.innerHTML = `
      <div class="support-subtabs" id="marketing-subtab-bar">
        ${MARKETING_SUBTABS.map(st => `
          <button class="support-subtab ${st.id === subtab ? 'active' : ''}" data-subtab="${st.id}">
            ${st.label}
          </button>
        `).join('')}
      </div>
      ${MARKETING_SUBTABS.map(st => `
        <div id="marketing-pane-${st.id}" class="marketing-pane" style="display:none;"></div>
      `).join('')}
    `;

    // Attach sub-tab click listeners
    container.querySelectorAll('.support-subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchMarketingSubtab(btn.dataset.subtab);
      });
    });

    await this.switchMarketingSubtab(subtab);
  },

  async switchMarketingSubtab(subtab) {
    this.activeMarketingSubtab = subtab;
    this.updateUrl({ tab: 'marketing', subtab });

    // Update active button
    document.querySelectorAll('#marketing-subtab-bar .support-subtab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.subtab === subtab);
    });

    // Hide all panes, show active
    document.querySelectorAll('.marketing-pane').forEach(pane => {
      pane.style.display = 'none';
    });
    const activePane = document.getElementById(`marketing-pane-${subtab}`);
    if (activePane) activePane.style.display = 'block';

    // Only load content on first visit
    if (!this._marketingLoaded[subtab]) {
      this._marketingLoaded[subtab] = true;

      // Temporarily swap ID so the render method writes into the pane
      const outer = document.getElementById('admin-tab-content');
      outer.id = '_admin-tab-content-outer';
      activePane.id = 'admin-tab-content';

      try {
        if (subtab === 'blog') {
          await this.renderBlogTab();
        } else if (subtab === 'directories') {
          await this.renderDirectoriesTab();
        } else if (subtab === 'reviews') {
          await this.renderReviewsTab();
        } else if (subtab === 'monitor') {
          await this.renderMonitorTab();
        }
      } finally {
        // Restore IDs
        const inner = document.getElementById('admin-tab-content');
        if (inner) inner.id = `marketing-pane-${subtab}`;
        const outerEl = document.getElementById('_admin-tab-content-outer');
        if (outerEl) outerEl.id = 'admin-tab-content';
      }
    }
  },
};
