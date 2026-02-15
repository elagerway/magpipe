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
        { id: 'users', label: 'Users', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' },
        { id: 'analytics', label: 'Analytics', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>' },
        { id: 'kpi', label: 'KPIs', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>' },
        { id: 'global-agent', label: 'Global Agent', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>' },
        { id: 'chat', label: 'Chat', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' },
        { id: 'notifications', label: 'Notifications', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' },
        { id: 'blog', label: 'Blog', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>' },
        { id: 'directories', label: 'Directories', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' },
        { id: 'reviews', label: 'Reviews', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' },
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
          <!-- Content rendered by switchTab() -->
        </div>
      </div>
    `;

    this.addStyles();
    this.renderAdminReminders();
    this.adminHeader.attachListeners();

    // Check URL params for tab auto-switch (e.g. post-OAuth redirect)
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    const validTabs = ['analytics', 'users', 'global-agent', 'kpi', 'chat', 'support', 'notifications', 'blog', 'directories', 'reviews'];
    const initialTab = validTabs.includes(tabParam) ? tabParam : 'support';

    if (urlParams.get('integration_connected') === 'google_email') {
      showToast('Gmail connected successfully!', 'success');
      // Clean URL but preserve tab param
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('integration_connected');
      window.history.replaceState({}, '', cleanUrl.toString());
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
    this.activeTab = tabName;
    this.updateUrl({ tab: tabName });

    // Update tab button active states
    document.querySelectorAll('.admin-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Destroy previous omniChat if switching away
    if (tabName !== 'chat' && this.omniChat) {
      this.omniChat.destroy();
      this.omniChat = null;
    }

    // Render appropriate content
    if (tabName === 'analytics') {
      await this.renderAnalyticsTab();
    } else if (tabName === 'users') {
      await this.renderUsersTab();
    } else if (tabName === 'global-agent') {
      await this.renderGlobalAgentTab();
    } else if (tabName === 'kpi') {
      await this.renderKpiTab();
    } else if (tabName === 'chat') {
      await this.renderChatTab();
    } else if (tabName === 'support') {
      await this.renderSupportTab();
    } else if (tabName === 'notifications') {
      await this.renderNotificationsTab();
    } else if (tabName === 'blog') {
      await this.renderBlogTab();
    } else if (tabName === 'directories') {
      await this.renderDirectoriesTab();
    } else if (tabName === 'reviews') {
      await this.renderReviewsTab();
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
  stylesMethods,
);

export default AdminPage;
