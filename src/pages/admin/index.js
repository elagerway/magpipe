/**
 * Admin Portal Page
 * Manage users, phone numbers, and chat with agents
 */

import { getCurrentUser, getCurrentSession, supabase } from '../../lib/supabase.js';
import { showToast } from '../../lib/toast.js';
import { showConfirmModal } from '../../components/ConfirmModal.js';
import AdminHeader from '../../components/AdminHeader.js';

import { analyticsTabMethods } from './analytics-tab.js';
import { kpiTabMethods } from './kpi-tab.js';
import { usersTabMethods } from './users-tab.js';
import { globalAgentTabMethods } from './global-agent-tab.js';
import { supportTabMethods } from './support-tab.js';
import { notificationsTabMethods } from './notifications-tab.js';
import { chatTabMethods } from './chat-tab.js';
import { blogTabMethods } from './blog-tab.js';
import { directoriesTabMethods } from './directories-tab.js';
import { reviewsTabMethods } from './reviews-tab.js';
import { monitorTabMethods } from './monitor-tab.js';
import { marketingTabMethods } from './marketing-tab.js';
import { stylesMethods } from './styles.js';

class AdminPage {
  constructor() {
    this.users = [];
    this.selectedUser = null;
    this.pagination = { page: 1, limit: 20, total: 0, totalPages: 0 };
    this.filters = { search: '', status: 'all', role: 'all' };
    this.loading = false;
    this.activeTab = 'analytics';  // Default to analytics tab
    this.omniChat = null;
    this.analyticsData = null;
    this.chartJsLoaded = false;
    this.charts = {};
    this._tabsLoaded = {};
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    // Check if user has admin role
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || (profile.role !== 'admin' && profile.role !== 'support' && profile.role !== 'god')) {
      navigateTo('/inbox');
      return;
    }

    // Get session for API calls
    const { session } = await getCurrentSession();
    this.session = session;

    // Expose for retry buttons
    window.adminPage = this;

    // Hide the main app nav on admin page
    const persistentNav = document.getElementById('persistent-nav');
    if (persistentNav) persistentNav.style.display = 'none';

    this.adminHeader = new AdminHeader({
      title: 'Admin Portal',
      backPath: '/inbox',
      role: profile.role,
      tabs: [
        { id: 'support', label: 'Support', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg>' },
        { id: 'analytics', label: 'Analytics', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>' },
        { id: 'kpi', label: 'KPIs', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>' },
        { id: 'notifications', label: 'Notifications', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' },
        { id: 'marketing', label: 'Marketing', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>' },
        { id: 'batches', label: 'Batches', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>' },
      ],
      activeTab: 'support',
      onTabChange: (tabId) => this.switchTab(tabId),
      session: this.session,
    });

    const appElement = document.getElementById('app');
    appElement.innerHTML = `
      <div class="admin-container">
        ${this.adminHeader.render()}

        <!-- Admin Reminders -->
        <div id="admin-reminders"></div>

        <!-- Tab Content -->
        <div id="admin-tab-content" class="admin-tab-content">
          <div id="admin-pane-analytics" class="admin-tab-pane"></div>
          <div id="admin-pane-kpi" class="admin-tab-pane"></div>
          <div id="admin-pane-support" class="admin-tab-pane"></div>
          <div id="admin-pane-notifications" class="admin-tab-pane"></div>
          <div id="admin-pane-marketing" class="admin-tab-pane"></div>
        </div>
      </div>
    `;

    this.addStyles();
    this.renderAdminReminders();
    this.adminHeader.attachListeners();

    // Check URL params for tab auto-switch (e.g. post-OAuth redirect)
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    const validTabs = ['analytics', 'kpi', 'support', 'notifications', 'marketing', 'batches'];
    // Redirect old bookmarks (blog/directories/reviews/monitor → marketing subtab)
    // Redirect old bookmarks to their new parent tabs
    const legacyMarketingSubtabs = { blog: 'blog', directories: 'directories', reviews: 'reviews', monitor: 'monitor' };
    let initialTab;
    if (legacyMarketingSubtabs[tabParam]) {
      initialTab = 'marketing';
      urlParams.set('subtab', tabParam);
    } else if (tabParam === 'users' || tabParam === 'global-agent' || tabParam === 'chat') {
      initialTab = 'support';
      this.supportSubTab = tabParam;
    } else {
      initialTab = validTabs.includes(tabParam) ? tabParam : 'support';
    }

    const connectedIntegration = urlParams.get('integration_connected');
    if (connectedIntegration === 'google_email') {
      showToast('Gmail connected successfully!', 'success');
    } else if (connectedIntegration === 'slack') {
      showToast('Slack connected successfully!', 'success');
    }
    if (connectedIntegration) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('integration_connected');
      window.history.replaceState({}, '', cleanUrl.toString());
    }

    // Restore marketing sub-tab from URL before switchTab
    const subtabParam = urlParams.get('subtab');
    if (initialTab === 'marketing' && subtabParam) {
      this.activeMarketingSubtab = subtabParam;
    }

    if (initialTab !== 'analytics') {
      this.adminHeader.setActiveTab(initialTab);
    }
    await this.switchTab(initialTab);

    // Restore deep-link state (e.g. open ticket thread)
    const threadParam = urlParams.get('thread');
    if (initialTab === 'support' && threadParam) {
      this.openSupportThread(threadParam);
    }
  }

  renderAdminReminders() {
    const container = document.getElementById('admin-reminders');
    if (!container) return;

    const reminders = [
      {
        id: 'elevenlabs-cost-review',
        showAfter: '2026-04-09',
        title: 'ElevenLabs Cost Review',
        message: 'Review ElevenLabs TTS costs ($0.22/min vendor cost vs $0.07/min retail). Consider: switching default to OpenAI TTS ($0.015/min vendor), tiered voice pricing, or negotiating ElevenLabs Business plan.',
        type: 'warning',
      },
    ];

    const now = new Date();
    const dismissed = JSON.parse(localStorage.getItem('admin-dismissed-reminders') || '[]');

    const activeReminders = reminders.filter(r =>
      now >= new Date(r.showAfter) && !dismissed.includes(r.id)
    );

    if (activeReminders.length === 0) return;

    container.innerHTML = activeReminders.map(r => `
      <div class="admin-reminder admin-reminder-${r.type}" data-reminder-id="${r.id}">
        <div class="admin-reminder-content">
          <strong>${r.title}</strong>
          <span>${r.message}</span>
        </div>
        <button class="admin-reminder-dismiss" title="Dismiss">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    `).join('');

    container.querySelectorAll('.admin-reminder-dismiss').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.closest('.admin-reminder').dataset.reminderId;
        const list = JSON.parse(localStorage.getItem('admin-dismissed-reminders') || '[]');
        list.push(id);
        localStorage.setItem('admin-dismissed-reminders', JSON.stringify(list));
        btn.closest('.admin-reminder').remove();
      });
    });
  }

  updateUrl(params = {}) {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('tab', params.tab || this.activeTab);
    if (params.thread) url.searchParams.set('thread', params.thread);
    if (params.subtab) url.searchParams.set('subtab', params.subtab);
    window.history.replaceState({}, '', url.toString());
  }

  async switchTab(tabName) {
    // Batches tab navigates to its own page
    if (tabName === 'batches') {
      navigateTo('/admin/batches');
      return;
    }

    this.activeTab = tabName;
    // Marketing tab manages its own URL via switchMarketingSubtab
    if (tabName !== 'marketing') {
      this.updateUrl({ tab: tabName });
    }

    // Update tab button active states
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Destroy previous omniChat if switching away from support (chat lives inside support)
    if (tabName !== 'support' && this.omniChat) {
      this.omniChat.destroy();
      this.omniChat = null;
      // Mark chat subtab for re-init on return
      if (this._supportLazyLoaded) this._supportLazyLoaded['chat'] = false;
    }

    // Show active pane, hide all others
    document.querySelectorAll('.admin-tab-pane').forEach(pane => pane.classList.remove('active'));
    const activePane = document.getElementById(`admin-pane-${tabName}`);
    if (activePane) activePane.classList.add('active');

    // First visit: render into the pane via ID swap
    if (activePane && !this._tabsLoaded[tabName]) {
      // Temporarily give the pane the ID that render methods target
      const outer = document.getElementById('admin-tab-content');
      outer.id = '_admin-tab-content-stash';
      activePane.id = 'admin-tab-content';

      try {
        if (tabName === 'analytics') await this.renderAnalyticsTab();
        else if (tabName === 'kpi') await this.renderKpiTab();
        else if (tabName === 'support') await this.renderSupportTab();
        else if (tabName === 'notifications') await this.renderNotificationsTab();
        else if (tabName === 'marketing') await this.renderMarketingTab();
      } finally {
        // Always restore IDs, even if render threw
        const inner = document.getElementById('admin-tab-content');
        if (inner) inner.id = `admin-pane-${tabName}`;
        const stash = document.getElementById('_admin-tab-content-stash');
        if (stash) stash.id = 'admin-tab-content';
      }

      this._tabsLoaded[tabName] = true;
    } else if (tabName === 'support' && this.supportSubTab === 'chat' && !this.omniChat) {
      // Re-init chat if returning to support with chat subtab active
      const chatPane = document.getElementById('support-subtab-chat');
      if (chatPane) chatPane.innerHTML = '<div class="loading-spinner">Loading...</div>';
      await this._loadSupportSubtab('chat');
    }
  }
}

Object.assign(AdminPage.prototype,
  analyticsTabMethods,
  kpiTabMethods,
  usersTabMethods,
  globalAgentTabMethods,
  supportTabMethods,
  notificationsTabMethods,
  chatTabMethods,
  blogTabMethods,
  directoriesTabMethods,
  reviewsTabMethods,
  monitorTabMethods,
  marketingTabMethods,
  stylesMethods,
);

export default AdminPage;
