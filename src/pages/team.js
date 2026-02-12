/**
 * Team Management Page
 * Allows organization owners to invite and manage team members
 */

import { Organization, OrganizationMember } from '../models/index.js';
import { getCurrentUser, supabase } from '../lib/supabase.js';
import { renderBottomNav } from '../components/BottomNav.js';
import { showToast } from '../lib/toast.js';

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

        <!-- Tabs -->
        <div class="team-tabs" style="display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;">
          <button class="team-tab ${this.currentTab === 'all' ? 'active' : ''}" data-tab="all">
            All (${this.counts.all || 0})
          </button>
          <button class="team-tab ${this.currentTab === 'pending' ? 'active' : ''}" data-tab="pending">
            Pending (${this.counts.pending})
          </button>
          <button class="team-tab ${this.currentTab === 'approved' ? 'active' : ''}" data-tab="approved">
            Accepted (${this.counts.approved})
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

      <!-- Member Edit Modal -->
      <div id="edit-member-modal" class="modal-overlay hidden">
        <div class="modal-content">
          <div class="modal-header">
            <h2 style="margin: 0;" id="edit-modal-title">Edit Member</h2>
            <button class="modal-close-btn" id="close-edit-modal-btn">
              <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div id="edit-modal-body"></div>
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
          grid-template-columns: repeat(auto-fill, minmax(280px, 360px));
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
        .edit-modal-profile {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        .edit-modal-profile .member-avatar {
          width: 48px;
          height: 48px;
          font-size: 1rem;
          flex-shrink: 0;
        }
        .edit-modal-profile-info {
          min-width: 0;
        }
        .edit-modal-profile-info .member-name {
          font-size: 1rem;
          margin: 0;
        }
        .edit-modal-profile-info .member-email {
          font-size: 0.8rem;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .edit-modal-section {
          margin-bottom: 1.25rem;
        }
        .edit-modal-section label {
          display: block;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-secondary);
          margin-bottom: 0.5rem;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        .edit-modal-actions {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .edit-modal-actions .btn {
          flex: 1;
          min-width: 120px;
        }
        .edit-modal-meta {
          font-size: 0.8rem;
          color: var(--text-tertiary);
          line-height: 1.6;
        }
        .edit-modal-view-only {
          font-size: 0.85rem;
          color: var(--text-secondary);
          padding: 0.75rem;
          background: var(--bg-secondary);
          border-radius: var(--radius-md);
          text-align: center;
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

    let meta = '';
    const isExpired = member.status === 'pending' && OrganizationMember.isExpired(member);

    switch (member.status) {
      case 'pending':
        meta = `Invited ${invitedDate}${isExpired ? ' — Expired' : ''}`;
        break;
      case 'approved':
        meta = `Accepted ${approvedDate}`;
        break;
      case 'suspended':
        meta = `Suspended ${suspendedDate}`;
        break;
      case 'removed':
        meta = member.approved_at ? `Removed ${removedDate}` : `Cancelled ${removedDate}`;
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
      <div class="member-card ${isRemoved ? 'member-removed' : ''}" onclick="window.teamPage.openEditModal('${member.id}')" style="cursor: pointer;">
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
    const tabLabels = { all: 'All', pending: 'Pending', approved: 'Accepted', suspended: 'Suspended', cancelled: 'Cancelled', removed: 'Removed' };
    document.querySelectorAll('.team-tab').forEach(tab => {
      const tabName = tab.dataset.tab;
      tab.textContent = `${tabLabels[tabName] || tabName} (${this.counts[tabName] || 0})`;
      tab.classList.toggle('active', tabName === this.currentTab);
    });

    // Update list
    document.getElementById('members-list').innerHTML = this.renderMembersList();
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

  openEditModal(memberId) {
    const member = this.allMembers.find(m => m.id === memberId);
    if (!member) return;

    this.editingMember = member;

    const name = member.full_name || 'Unnamed';
    const initials = name.trim().split(' ').length > 1
      ? (name.trim().split(' ')[0][0] + name.trim().split(' ').slice(-1)[0][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();

    const roleColors = {
      owner: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
      editor: 'linear-gradient(135deg, #3b82f6, #60a5fa)',
      support: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
    };
    const bg = roleColors[member.role] || roleColors.editor;

    const isOwner = member.role === 'owner';
    const isRemoved = member.status === 'removed';
    const isCancelled = isRemoved && !member.approved_at;
    const wasRemoved = isRemoved && member.approved_at;
    const isExpired = member.status === 'pending' && OrganizationMember.isExpired(member);

    // Build role section
    let roleSection = '';
    if (isOwner) {
      roleSection = `
        <div class="edit-modal-section">
          <label>Role</label>
          <div class="edit-modal-view-only">Owner — cannot be changed</div>
        </div>`;
    } else {
      roleSection = `
        <div class="edit-modal-section">
          <label>Role</label>
          <select class="form-input" id="edit-role-select">
            <option value="editor" ${member.role === 'editor' ? 'selected' : ''}>Editor</option>
            <option value="support" ${member.role === 'support' ? 'selected' : ''}>Support</option>
          </select>
          <p class="text-muted" style="margin-top: 0.5rem; font-size: 0.75rem;">
            <strong>Editor:</strong> Full access except billing and team management<br>
            <strong>Support:</strong> View and edit access, cannot delete items
          </p>
        </div>`;
    }

    // Build status actions
    let actionsSection = '';
    if (!isOwner) {
      let buttons = '';
      switch (member.status) {
        case 'approved':
          buttons = `
            <button class="btn btn-secondary" onclick="window.teamPage.suspendMemberFromModal('${member.id}')">Suspend</button>
            <button class="btn btn-danger" onclick="window.teamPage.removeMemberFromModal('${member.id}')">Remove</button>`;
          break;
        case 'pending':
          buttons = `
            <button class="btn btn-secondary" onclick="window.teamPage.resendInvite('${member.id}')">Resend Invite</button>
            <button class="btn btn-danger" onclick="window.teamPage.cancelInviteFromModal('${member.id}')">Cancel Invite</button>`;
          break;
        case 'suspended':
          buttons = `
            <button class="btn btn-primary" onclick="window.teamPage.reactivateMemberFromModal('${member.id}')">Reactivate</button>
            <button class="btn btn-danger" onclick="window.teamPage.removeMemberFromModal('${member.id}')">Remove</button>`;
          break;
        case 'removed':
          buttons = `
            <button class="btn btn-secondary" onclick="window.teamPage.reinviteFromModal('${member.id}', '${member.email}', '${(member.full_name || '').replace(/'/g, "\\'")}')">Re-invite</button>`;
          break;
      }
      actionsSection = `
        <div class="edit-modal-section">
          <label>Actions</label>
          <div class="edit-modal-actions">${buttons}</div>
        </div>`;
    }

    // Build meta info
    const metaLines = [];
    if (member.invited_at) metaLines.push(`Invited: ${new Date(member.invited_at).toLocaleDateString()}`);
    if (member.approved_at) metaLines.push(`Accepted: ${new Date(member.approved_at).toLocaleDateString()}`);
    if (member.suspended_at && member.status === 'suspended') metaLines.push(`Suspended: ${new Date(member.suspended_at).toLocaleDateString()}`);
    if (member.removed_at && member.status === 'removed') metaLines.push(`${isCancelled ? 'Cancelled' : 'Removed'}: ${new Date(member.removed_at).toLocaleDateString()}`);
    if (isExpired) metaLines.push('Status: Invite expired');

    const metaSection = metaLines.length > 0 ? `
      <div class="edit-modal-section">
        <label>Info</label>
        <div class="edit-modal-meta">${metaLines.join('<br>')}</div>
      </div>` : '';

    document.getElementById('edit-modal-title').textContent = isOwner ? 'Owner' : 'Edit Member';
    document.getElementById('edit-modal-body').innerHTML = `
      <div class="edit-modal-profile">
        <div class="member-avatar" style="background: ${bg};">
          <span>${initials}</span>
        </div>
        <div class="edit-modal-profile-info">
          <h3 class="member-name">${name}</h3>
          <div class="member-email">${member.email}</div>
        </div>
      </div>
      ${roleSection}
      ${actionsSection}
      ${metaSection}
    `;

    document.getElementById('edit-member-modal').classList.remove('hidden');

    // Attach role change listener
    const roleSelect = document.getElementById('edit-role-select');
    if (roleSelect) {
      roleSelect.addEventListener('change', () => {
        this.changeRole(member.id, roleSelect.value);
      });
    }
  }

  closeEditModal() {
    document.getElementById('edit-member-modal').classList.add('hidden');
    this.editingMember = null;
  }

  async suspendMemberFromModal(memberId) {
    this.closeEditModal();
    await this.suspendMember(memberId);
  }

  async removeMemberFromModal(memberId) {
    this.closeEditModal();
    await this.removeMember(memberId);
  }

  async cancelInviteFromModal(memberId) {
    this.closeEditModal();
    await this.cancelInvite(memberId);
  }

  async reactivateMemberFromModal(memberId) {
    this.closeEditModal();
    await this.approveMember(memberId);
  }

  async reinviteFromModal(memberId, email, name) {
    this.closeEditModal();
    await this.reinvite(memberId, email, name);
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

    // Edit modal open/close
    document.getElementById('close-edit-modal-btn')?.addEventListener('click', () => this.closeEditModal());

    // Click outside modal to close
    document.getElementById('invite-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'invite-modal') this.closeInviteModal();
    });
    document.getElementById('edit-member-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'edit-member-modal') this.closeEditModal();
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
      showToast('Invitation sent successfully', 'success');
      await this.refreshList();
    } catch (error) {
      console.error('Failed to invite:', error);
      showToast(error.message || 'Failed to send invitation', 'error');
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

      showToast('Invitation resent successfully', 'success');
    } catch (error) {
      showToast('Failed to resend invitation', 'error');
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
          showToast('Failed to cancel invitation', 'error');
          return;
        }
        showToast('Invitation cancelled', 'success');
        await this.refreshList();
      }
    });
  }

  async changeRole(memberId, newRole) {
    const { error } = await OrganizationMember.updateRole(memberId, newRole);
    if (error) {
      showToast('Failed to update role', 'error');
      await this.refreshList();
      return;
    }

    showToast('Role updated successfully', 'success');
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
          showToast('Failed to suspend member', 'error');
          return;
        }
        showToast('Member suspended', 'success');
        await this.refreshList();
      }
    });
  }

  async approveMember(memberId) {
    const { error } = await OrganizationMember.approve(memberId);
    if (error) {
      showToast('Failed to reactivate member', 'error');
      return;
    }

    showToast('Member reactivated', 'success');
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
          showToast('Failed to remove member', 'error');
          return;
        }
        showToast('Member removed', 'success');
        await this.refreshList();
      }
    });
  }

  async reinvite(memberId, email, name) {
    // Update existing record back to pending instead of creating new one
    const { member, error } = await OrganizationMember.reinvite(memberId, this.currentUser.id);

    if (error) {
      showToast(error.message || 'Failed to re-invite member', 'error');
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

    showToast('Invitation sent', 'success');
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
