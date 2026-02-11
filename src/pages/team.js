/**
 * Team Management Page
 * Allows organization owners to invite and manage team members
 */

import { Organization, OrganizationMember } from '../models/index.js';
import { getCurrentUser, supabase } from '../lib/supabase.js';
import { renderBottomNav } from '../components/BottomNav.js';

export default class TeamPage {
  constructor() {
    this.currentTab = 'all';
    this.organization = null;
    this.userRole = null;
    this.members = [];
    this.counts = {};
    // Make page accessible globally for onclick handlers
    window.teamPage = this;
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    // Get current organization
    const { organization, error: orgError } = await Organization.getForUser(user.id);
    if (orgError || !organization) {
      console.error('Error loading organization:', orgError);
      navigateTo('/inbox');
      return;
    }

    this.organization = organization;
    this.currentUser = user;

    // Get user's role from membership
    const { members: allMembers } = await OrganizationMember.getByOrganization(organization.id);
    const currentMembership = allMembers?.find(m => m.user_id === user.id);
    this.userRole = currentMembership?.role || 'member';

    // Only owners can access team management
    if (this.userRole !== 'owner') {
      navigateTo('/inbox');
      return;
    }

    // Calculate counts
    // Distinguish cancelled invites (never approved) from removed members (were approved)
    this.counts = {
      all: allMembers?.length || 0,
      pending: allMembers?.filter(m => m.status === 'pending').length || 0,
      approved: allMembers?.filter(m => m.status === 'approved').length || 0,
      suspended: allMembers?.filter(m => m.status === 'suspended').length || 0,
      cancelled: allMembers?.filter(m => m.status === 'removed' && !m.approved_at).length || 0,
      removed: allMembers?.filter(m => m.status === 'removed' && m.approved_at).length || 0,
    };

    // Get members for current tab
    this.allMembers = allMembers || [];
    this.filterMembers();

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container with-bottom-nav" style="max-width: 900px; padding: 2rem 1rem 4rem 1rem;">
        <!-- Header with Invite Button -->
        <div class="page-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
          <div style="display: flex; align-items: center;">
            <button class="back-btn mobile-only" onclick="navigateTo('/settings')" style="
              background: none;
              border: none;
              padding: 0.5rem;
              margin: -0.5rem;
              margin-right: 0.5rem;
              cursor: pointer;
              display: inline-flex;
              align-items: center;
            ">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <div>
              <h1 style="margin: 0;">Team Members</h1>
              <p class="text-muted" style="margin: 0.25rem 0 0 0;">Manage your team and their roles</p>
            </div>
          </div>
          <button class="btn btn-primary" id="open-invite-modal-btn" style="white-space: nowrap;">
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="margin-right: 0.5rem;">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            Invite team member
          </button>
        </div>

        <div id="error-message" class="hidden"></div>
        <div id="success-message" class="hidden"></div>

        <!-- Tabs -->
        <div class="team-tabs" style="display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;">
          <button class="team-tab ${this.currentTab === 'all' ? 'active' : ''}" data-tab="all">
            All (${this.counts.all || 0})
          </button>
          <button class="team-tab ${this.currentTab === 'pending' ? 'active' : ''}" data-tab="pending">
            Pending (${this.counts.pending})
          </button>
          <button class="team-tab ${this.currentTab === 'approved' ? 'active' : ''}" data-tab="approved">
            Approved (${this.counts.approved})
          </button>
          <button class="team-tab ${this.currentTab === 'suspended' ? 'active' : ''}" data-tab="suspended">
            Suspended (${this.counts.suspended})
          </button>
          <button class="team-tab ${this.currentTab === 'cancelled' ? 'active' : ''}" data-tab="cancelled">
            Cancelled (${this.counts.cancelled})
          </button>
          <button class="team-tab ${this.currentTab === 'removed' ? 'active' : ''}" data-tab="removed">
            Removed (${this.counts.removed})
          </button>
        </div>

        <!-- Members List -->
        <div id="members-list" class="members-grid" style="margin-bottom: 2rem;">
          ${this.renderMembersList()}
        </div>
      </div>
      ${renderBottomNav('/team')}

      <!-- Invite Modal -->
      <div id="invite-modal" class="modal-overlay hidden">
        <div class="modal-content">
          <div class="modal-header">
            <h2 style="margin: 0;">Invite Team Member</h2>
            <button class="modal-close-btn" id="close-invite-modal-btn">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <form id="invite-form">
            <div class="form-group">
              <label class="form-label" for="invite-email">Email</label>
              <input
                type="email"
                id="invite-email"
                class="form-input"
                placeholder="colleague@example.com"
                required
              />
            </div>
            <div class="form-group">
              <label class="form-label" for="invite-name">Full Name</label>
              <input
                type="text"
                id="invite-name"
                class="form-input"
                placeholder="John Doe"
                required
              />
            </div>
            <div class="form-group">
              <label class="form-label" for="invite-role">Role</label>
              <select id="invite-role" class="form-input">
                <option value="editor">Editor</option>
                <option value="support">Support</option>
              </select>
              <p class="text-muted" style="margin-top: 0.5rem; font-size: 0.75rem;">
                <strong>Editor:</strong> Full access except billing and team management<br>
                <strong>Support:</strong> View and edit access, cannot delete items
              </p>
            </div>
            <div style="display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.5rem;">
              <button type="button" class="btn btn-secondary" id="cancel-invite-btn">Cancel</button>
              <button type="submit" class="btn btn-primary" id="invite-btn">Send Invitation</button>
            </div>
          </form>
        </div>
      </div>

      <style>
        .team-tab {
          padding: 0.5rem 1rem;
          border: 1px solid var(--border-color);
          background: var(--bg-primary);
          border-radius: var(--radius-md);
          cursor: pointer;
          font-size: 0.875rem;
          transition: all 0.2s;
        }
        .team-tab:hover {
          background: var(--bg-secondary);
        }
        .team-tab.active {
          background: var(--primary-color);
          color: white;
          border-color: var(--primary-color);
        }
        .members-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1.25rem;
        }
        .member-card {
          background: white;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 1.25rem;
          transition: all 0.2s ease;
          display: flex;
          flex-direction: column;
        }
        .member-card:hover {
          border-color: var(--primary-color);
          box-shadow: var(--shadow-md);
          transform: translateY(-2px);
        }
        .member-card-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 1rem;
        }
        .member-avatar {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 600;
          font-size: 1.25rem;
          overflow: hidden;
        }
        .member-card-body {
          flex: 1;
          margin-bottom: 1rem;
        }
        .member-name {
          font-size: 1.125rem;
          font-weight: 600;
          margin: 0 0 0.25rem 0;
          color: var(--text-primary);
        }
        .member-email {
          color: var(--text-secondary);
          font-size: 0.875rem;
          margin-bottom: 0.25rem;
        }
        .member-role {
          display: inline-block;
          padding: 0.25rem 0.625rem;
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          font-weight: 500;
          text-transform: capitalize;
        }
        .member-role.owner {
          background: #e0e7ff;
          color: #4338ca;
        }
        .member-role.editor {
          background: #dbeafe;
          color: #1d4ed8;
        }
        .member-role.support {
          background: #ede9fe;
          color: #6d28d9;
        }
        .member-meta {
          color: var(--text-tertiary);
          font-size: 0.8rem;
          margin-top: 0.5rem;
        }
        .member-actions {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .member-actions .btn {
          flex: 1;
          font-size: 0.875rem;
          padding: 0.5rem 0.75rem;
        }
        .member-card.member-removed {
          opacity: 0.6;
          background: var(--bg-secondary);
        }
        .member-card.member-removed:hover {
          transform: none;
          box-shadow: none;
        }
        .member-status {
          padding: 0.25rem 0.5rem;
          border-radius: var(--radius-sm);
          font-size: 0.7rem;
          font-weight: 500;
        }
        .member-status.active {
          background: #dcfce7;
          color: #15803d;
        }
        .member-status.pending {
          background: #fef3c7;
          color: #92400e;
        }
        .member-status.suspended {
          background: #fee2e2;
          color: #991b1b;
        }
        .member-status.cancelled {
          background: var(--error-color);
          color: white;
        }
        .member-status.removed {
          background: #6b7280;
          color: white;
        }
        @media (max-width: 600px) {
          .members-grid {
            grid-template-columns: 1fr;
          }
        }

        /* Modal Styles */
        .modal-overlay {
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
          padding: 1rem;
        }
        .modal-overlay.hidden {
          display: none;
        }
        .modal-content {
          background: var(--bg-primary);
          border-radius: var(--radius-lg);
          padding: 1.5rem;
          max-width: 450px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }
        .modal-close-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 0.25rem;
          color: var(--text-secondary);
          border-radius: var(--radius-sm);
          transition: all 0.2s;
        }
        .modal-close-btn:hover {
          background: var(--bg-secondary);
          color: var(--text-primary);
        }
      </style>
    `;

    this.attachEventListeners();
  }

  filterMembers() {
    if (this.currentTab === 'all') {
      this.members = this.allMembers; // Show all including removed/cancelled
    } else if (this.currentTab === 'cancelled') {
      // Cancelled = removed status but never approved
      this.members = this.allMembers.filter(m => m.status === 'removed' && !m.approved_at);
    } else if (this.currentTab === 'removed') {
      // Removed = removed status and was previously approved
      this.members = this.allMembers.filter(m => m.status === 'removed' && m.approved_at);
    } else {
      this.members = this.allMembers.filter(m => m.status === this.currentTab);
    }
  }

  renderMembersList() {
    if (this.members.length === 0) {
      const messages = {
        all: 'No team members yet',
        pending: 'No pending invitations',
        approved: 'No approved team members',
        suspended: 'No suspended members',
        cancelled: 'No cancelled invites',
        removed: 'No removed members'
      };
      return `<p class="text-muted text-center" style="padding: 2rem;">${messages[this.currentTab]}</p>`;
    }

    return this.members.map(member => this.renderMemberCard(member)).join('');
  }

  renderMemberCard(member) {
    const invitedDate = member.invited_at ? new Date(member.invited_at).toLocaleDateString() : '';
    const approvedDate = member.approved_at ? new Date(member.approved_at).toLocaleDateString() : '';
    const suspendedDate = member.suspended_at ? new Date(member.suspended_at).toLocaleDateString() : '';
    const removedDate = member.removed_at ? new Date(member.removed_at).toLocaleDateString() : '';

    let actions = '';
    let meta = '';

    const isExpired = member.status === 'pending' && OrganizationMember.isExpired(member);

    switch (member.status) {
      case 'pending':
        meta = `Invited ${invitedDate}${isExpired ? ' — Expired' : ''}`;
        actions = `
          <button class="btn btn-sm btn-secondary" onclick="window.teamPage.resendInvite('${member.id}')">Resend</button>
          <button class="btn btn-sm btn-secondary" onclick="window.teamPage.cancelInvite('${member.id}')">Cancel</button>
        `;
        break;
      case 'approved':
        meta = `Approved ${approvedDate}`;
        if (member.role !== 'owner') {
          actions = `
            <select class="form-input" style="width: auto; padding: 0.375rem 0.5rem; font-size: 0.875rem;" onchange="window.teamPage.changeRole('${member.id}', this.value)">
              <option value="editor" ${member.role === 'editor' ? 'selected' : ''}>Editor</option>
              <option value="support" ${member.role === 'support' ? 'selected' : ''}>Support</option>
            </select>
            <button class="btn btn-sm btn-secondary" onclick="window.teamPage.suspendMember('${member.id}')">Suspend</button>
            <button class="btn btn-sm btn-danger" onclick="window.teamPage.removeMember('${member.id}')">Remove</button>
          `;
        }
        break;
      case 'suspended':
        meta = `Suspended ${suspendedDate}`;
        actions = `
          <button class="btn btn-sm btn-primary" onclick="window.teamPage.approveMember('${member.id}')">Reactivate</button>
          <button class="btn btn-sm btn-danger" onclick="window.teamPage.removeMember('${member.id}')">Remove</button>
        `;
        break;
      case 'removed':
        meta = member.approved_at ? `Removed ${removedDate}` : `Cancelled ${removedDate}`;
        actions = `
          <button class="btn btn-sm btn-secondary" onclick="window.teamPage.reinvite('${member.id}', '${member.email}', '${member.full_name || ''}')">Re-invite</button>
        `;
        break;
    }

    const isRemoved = member.status === 'removed';
    const isCancelled = isRemoved && !member.approved_at;
    const wasRemoved = isRemoved && member.approved_at;

    const name = member.full_name || 'Unnamed';
    const initials = name.trim().split(' ').length > 1
      ? (name.trim().split(' ')[0][0] + name.trim().split(' ').slice(-1)[0][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();

    const roleColors = {
      owner: { bg: 'linear-gradient(135deg, #6366f1, #8b5cf6)', badge: 'var(--primary-color)' },
      editor: { bg: 'linear-gradient(135deg, #3b82f6, #60a5fa)', badge: '#3b82f6' },
      support: { bg: 'linear-gradient(135deg, #8b5cf6, #a78bfa)', badge: '#8b5cf6' },
    };
    const colors = roleColors[member.role] || roleColors.editor;

    const statusBadge = isCancelled
      ? '<span class="member-status cancelled">Cancelled</span>'
      : wasRemoved
        ? '<span class="member-status removed">Removed</span>'
        : member.status === 'pending'
          ? `<span class="member-status pending">${isExpired ? 'Expired' : 'Pending'}</span>`
          : member.status === 'suspended'
            ? '<span class="member-status suspended">Suspended</span>'
            : '<span class="member-status active">Active</span>';

    return `
      <div class="member-card ${isRemoved ? 'member-removed' : ''}">
        <div class="member-card-header">
          <div class="member-avatar" style="background: ${colors.bg};">
            <span>${initials}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            ${statusBadge}
            <span class="member-role ${member.role}">${member.role}</span>
          </div>
        </div>
        <div class="member-card-body">
          <h3 class="member-name">${name}</h3>
          <div class="member-email">${member.email}</div>
          <div class="member-meta">${meta}</div>
        </div>
        <div class="member-actions">
          ${actions}
        </div>
      </div>
    `;
  }

  async refreshList() {
    const { members: allMembers } = await OrganizationMember.getByOrganization(this.organization.id);
    this.allMembers = allMembers || [];

    // Distinguish cancelled invites (never approved) from removed members (were approved)
    this.counts = {
      all: this.allMembers.length,
      pending: this.allMembers.filter(m => m.status === 'pending').length,
      approved: this.allMembers.filter(m => m.status === 'approved').length,
      suspended: this.allMembers.filter(m => m.status === 'suspended').length,
      cancelled: this.allMembers.filter(m => m.status === 'removed' && !m.approved_at).length,
      removed: this.allMembers.filter(m => m.status === 'removed' && m.approved_at).length,
    };

    this.filterMembers();

    // Update tabs
    const tabLabels = { all: 'All', pending: 'Pending', approved: 'Approved', suspended: 'Suspended', cancelled: 'Cancelled', removed: 'Removed' };
    document.querySelectorAll('.team-tab').forEach(tab => {
      const tabName = tab.dataset.tab;
      tab.textContent = `${tabLabels[tabName] || tabName} (${this.counts[tabName] || 0})`;
      tab.classList.toggle('active', tabName === this.currentTab);
    });

    // Update list
    document.getElementById('members-list').innerHTML = this.renderMembersList();
  }

  showMessage(type, message) {
    const el = document.getElementById(type === 'error' ? 'error-message' : 'success-message');
    el.className = `alert alert-${type === 'error' ? 'error' : 'success'}`;
    el.textContent = message;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
  }

  openInviteModal() {
    document.getElementById('invite-modal').classList.remove('hidden');
    document.getElementById('invite-email').focus();
  }

  closeInviteModal() {
    document.getElementById('invite-modal').classList.add('hidden');
    document.getElementById('invite-email').value = '';
    document.getElementById('invite-name').value = '';
    document.getElementById('invite-role').value = 'editor';
  }

  attachEventListeners() {
    // Tab switching
    document.querySelectorAll('.team-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.currentTab = tab.dataset.tab;
        this.filterMembers();
        document.querySelectorAll('.team-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('members-list').innerHTML = this.renderMembersList();
      });
    });

    // Modal open/close
    document.getElementById('open-invite-modal-btn')?.addEventListener('click', () => this.openInviteModal());
    document.getElementById('close-invite-modal-btn')?.addEventListener('click', () => this.closeInviteModal());
    document.getElementById('cancel-invite-btn')?.addEventListener('click', () => this.closeInviteModal());

    // Click outside modal to close
    document.getElementById('invite-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'invite-modal') this.closeInviteModal();
    });

    // Invite form
    document.getElementById('invite-form')?.addEventListener('submit', (e) => this.handleInvite(e));
  }

  async handleInvite(e) {
    e.preventDefault();

    const email = document.getElementById('invite-email').value.trim();
    const name = document.getElementById('invite-name').value.trim();
    const role = document.getElementById('invite-role').value;
    const btn = document.getElementById('invite-btn');

    if (!email || !name) return;

    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
      const { member, error } = await OrganizationMember.invite(
        this.organization.id,
        email,
        name,
        role,
        this.currentUser.id
      );

      if (error) throw error;

      // Send email
      await supabase.functions.invoke('send-team-invitation', {
        body: {
          memberId: member.id,
          email,
          name,
          organizationName: this.organization.name,
          inviterName: this.currentUser.email,
        },
      });

      this.closeInviteModal();
      this.showMessage('success', 'Invitation sent successfully');
      await this.refreshList();
    } catch (error) {
      console.error('Failed to invite:', error);
      this.showMessage('error', error.message || 'Failed to send invitation');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Send Invitation';
    }
  }

  async resendInvite(memberId) {
    try {
      const member = this.allMembers.find(m => m.id === memberId);
      if (!member) return;

      await supabase.functions.invoke('send-team-invitation', {
        body: {
          memberId: member.id,
          email: member.email,
          name: member.full_name,
          organizationName: this.organization.name,
          inviterName: this.currentUser.email,
        },
      });

      this.showMessage('success', 'Invitation resent successfully');
    } catch (error) {
      this.showMessage('error', 'Failed to resend invitation');
    }
  }

  async cancelInvite(memberId) {
    this.showConfirmModal({
      title: 'Cancel Invitation',
      message: 'Are you sure you want to cancel this invitation?',
      confirmText: 'Cancel Invitation',
      confirmDanger: true,
      onConfirm: async () => {
        const { error } = await OrganizationMember.remove(memberId);
        if (error) {
          this.showMessage('error', 'Failed to cancel invitation');
          return;
        }
        this.showMessage('success', 'Invitation cancelled');
        await this.refreshList();
      }
    });
  }

  async changeRole(memberId, newRole) {
    const { error } = await OrganizationMember.updateRole(memberId, newRole);
    if (error) {
      this.showMessage('error', 'Failed to update role');
      await this.refreshList();
      return;
    }

    this.showMessage('success', 'Role updated successfully');
  }

  async suspendMember(memberId) {
    this.showConfirmModal({
      title: 'Suspend Member',
      message: 'Suspend this member? They will lose access until reactivated.',
      confirmText: 'Suspend',
      confirmDanger: true,
      onConfirm: async () => {
        const { error } = await OrganizationMember.suspend(memberId);
        if (error) {
          this.showMessage('error', 'Failed to suspend member');
          return;
        }
        this.showMessage('success', 'Member suspended');
        await this.refreshList();
      }
    });
  }

  async approveMember(memberId) {
    const { error } = await OrganizationMember.approve(memberId);
    if (error) {
      this.showMessage('error', 'Failed to reactivate member');
      return;
    }

    this.showMessage('success', 'Member reactivated');
    await this.refreshList();
  }

  async removeMember(memberId) {
    this.showConfirmModal({
      title: 'Remove Member',
      message: 'Are you sure you want to remove this member from the team?',
      confirmText: 'Remove',
      confirmDanger: true,
      onConfirm: async () => {
        const { error } = await OrganizationMember.remove(memberId);
        if (error) {
          this.showMessage('error', 'Failed to remove member');
          return;
        }
        this.showMessage('success', 'Member removed');
        await this.refreshList();
      }
    });
  }

  async reinvite(memberId, email, name) {
    // Update existing record back to pending instead of creating new one
    const { member, error } = await OrganizationMember.reinvite(memberId, this.currentUser.id);

    if (error) {
      this.showMessage('error', error.message || 'Failed to re-invite member');
      return;
    }

    await supabase.functions.invoke('send-team-invitation', {
      body: {
        memberId: member.id,
        email,
        name,
        organizationName: this.organization.name,
        inviterName: this.currentUser.email,
      },
    });

    this.showMessage('success', 'Invitation sent');
    await this.refreshList();
  }

  showConfirmModal({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', confirmDanger = false, onConfirm }) {
    // Remove existing modal if any
    document.getElementById('confirm-modal-overlay')?.remove();

    const modal = document.createElement('div');
    modal.id = 'confirm-modal-overlay';
    modal.innerHTML = `
      <div class="confirm-modal-backdrop"></div>
      <div class="confirm-modal">
        <h3 class="confirm-modal-title">${title}</h3>
        <p class="confirm-modal-message">${message}</p>
        <div class="confirm-modal-actions">
          <button class="btn btn-secondary" id="confirm-modal-cancel">${cancelText}</button>
          <button class="btn ${confirmDanger ? 'btn-danger' : 'btn-primary'}" id="confirm-modal-confirm">${confirmText}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();

    document.getElementById('confirm-modal-cancel').addEventListener('click', closeModal);
    modal.querySelector('.confirm-modal-backdrop').addEventListener('click', closeModal);

    document.getElementById('confirm-modal-confirm').addEventListener('click', () => {
      closeModal();
      if (onConfirm) onConfirm();
    });
  }
}
