/**
 * Dashboard Page
 */

import { getCurrentUser } from '../lib/supabase.js';
import { User, CallRecord, SmsMessage } from '../models/index.js';
import { renderBottomNav, attachBottomNav } from '../components/BottomNav.js';

export default class DashboardPage {
  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    // Fetch user profile and stats
    const { profile } = await User.getProfile(user.id);
    const { stats: callStats } = await CallRecord.getStats(user.id);
    const { stats: smsStats } = await SmsMessage.getStats(user.id);
    const { callRecords: recentCalls } = await CallRecord.getRecent(user.id, 5);
    const { messages: recentMessages } = await SmsMessage.getRecent(user.id, 5);

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container with-bottom-nav" style="padding-top: 2rem;">
        ${this.renderHeader(profile)}
        ${this.renderStats(callStats, smsStats)}
        ${this.renderRecentActivity(recentCalls, recentMessages)}
      </div>
      ${renderBottomNav('/dashboard')}
    `;

    this.attachEventListeners();
  }

  renderHeader(profile) {
    return `
      <div style="margin-bottom: 2rem;">
        <h1>Welcome back, ${profile?.name || 'User'}!</h1>
        <p class="text-muted">Here's what's happening with Pat</p>
      </div>
    `;
  }

  renderStats(callStats, smsStats) {
    return `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
        <div class="card">
          <div class="text-muted text-sm">Total Calls</div>
          <div style="font-size: 2rem; font-weight: 700;">${callStats?.total || 0}</div>
        </div>
        <div class="card">
          <div class="text-muted text-sm">Completed Calls</div>
          <div style="font-size: 2rem; font-weight: 700;">${callStats?.completed || 0}</div>
        </div>
        <div class="card">
          <div class="text-muted text-sm">Total Messages</div>
          <div style="font-size: 2rem; font-weight: 700;">${smsStats?.total || 0}</div>
        </div>
        <div class="card">
          <div class="text-muted text-sm">Messages Sent</div>
          <div style="font-size: 2rem; font-weight: 700;">${smsStats?.sent || 0}</div>
        </div>
      </div>
    `;
  }

  renderRecentActivity(recentCalls, recentMessages) {
    return `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem;">
        <div>
          <h2>Recent Calls</h2>
          <div class="card">
            ${recentCalls.length === 0
              ? '<p class="text-muted">No recent calls</p>'
              : this.renderCallList(recentCalls)
            }
            <button class="btn btn-secondary btn-full mt-3" onclick="navigateTo('/calls')">
              View All Calls
            </button>
          </div>
        </div>

        <div>
          <h2>Recent Messages</h2>
          <div class="card">
            ${recentMessages.length === 0
              ? '<p class="text-muted">No recent messages</p>'
              : this.renderMessageList(recentMessages)
            }
            <button class="btn btn-secondary btn-full mt-3" onclick="navigateTo('/messages')">
              View All Messages
            </button>
          </div>
        </div>
      </div>
    `;
  }

  renderCallList(calls) {
    return calls
      .map(
        (call) => `
      <div style="padding: 0.75rem 0; border-bottom: 1px solid var(--border-color);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 500;">${call.contacts?.name || 'Unknown'}</div>
            <div class="text-sm text-muted">${call.direction} • ${call.status}</div>
          </div>
          <div class="text-sm text-muted">
            ${new Date(call.started_at).toLocaleDateString()}
          </div>
        </div>
      </div>
    `
      )
      .join('');
  }

  renderMessageList(messages) {
    return messages
      .map(
        (message) => `
      <div style="padding: 0.75rem 0; border-bottom: 1px solid var(--border-color);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="flex: 1;">
            <div style="font-weight: 500;">${message.contacts?.name || 'Unknown'}</div>
            <div class="text-sm text-muted" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${(message.content || message.body || '').substring(0, 50)}${(message.content || message.body || '').length > 50 ? '...' : ''}
            </div>
          </div>
          <div class="text-sm text-muted">
            ${new Date(message.sent_at || message.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>
    `
      )
      .join('');
  }

  attachEventListeners() {
    // Add any interactive functionality here
  }
}