/**
 * Admin Directories Tab
 * Submission kit with copyable marketing copy + directory tracker table
 */

import { showToast } from '../../lib/toast.js';
import { showConfirmModal } from '../../components/ConfirmModal.js';

const SUBMISSION_KIT = {
  tagline: 'Every Conversation Handled — AI Voice, Email & SMS for Business',
  shortDescription: 'Magpipe is an AI-powered communication platform that handles inbound and outbound phone calls, emails, and SMS for businesses. Each agent is fully customizable with its own voice, personality, knowledge base, and tool integrations.',
  mediumDescription: 'Magpipe replaces fragmented call centers, email support, and SMS tools with a single AI platform. Businesses get a dedicated AI agent that answers calls with a natural voice, responds to emails, and sends SMS — all while integrating with CRMs, calendars, and internal systems. Magpipe handles lead qualification, appointment scheduling, customer support, and outbound campaigns across voice, email, and text channels.',
  longDescription: `Magpipe is an AI communication platform that handles voice calls, email, and SMS for businesses across healthcare, financial services, insurance, logistics, home services, retail, travel, and debt collection.

Each business gets a customizable AI agent with its own phone number, voice (powered by ElevenLabs), personality, and knowledge base. Agents can answer inbound calls, make outbound calls, respond to emails, and send SMS — all from one dashboard.

Key capabilities:
- Natural voice conversations with real-time transcription
- Warm transfer to human agents when needed
- CRM integration (HubSpot, custom webhooks)
- Appointment scheduling and lead qualification
- Custom knowledge base per agent
- Call recording and analytics
- Multi-channel: voice + email + SMS in one platform

Magpipe is built for businesses that need to handle high call volumes without hiring more staff, want 24/7 availability, or need to scale customer communications across multiple channels.`,
  categories: [
    'AI Phone Agent',
    'AI Voice Assistant',
    'Virtual Receptionist',
    'AI Customer Support',
    'Business Communication',
    'Call Center Automation',
    'AI SMS',
    'Conversational AI',
  ],
  keyFeatures: [
    'AI Voice Calls (inbound & outbound)',
    'AI Email Response',
    'AI SMS / Text Messaging',
    'Custom Voice & Personality per Agent',
    'Knowledge Base per Agent',
    'CRM Integration (HubSpot)',
    'Warm Transfer to Humans',
    'Call Recording & Transcription',
    'Multi-industry Templates',
    'Real-time Analytics Dashboard',
  ],
  pricing: 'Pay As You Go — $0 to start, $20 free credits on signup. Voice: $0.07/min, SMS: $0.01/msg, Email AI: $0.01/email. No monthly minimums. Custom enterprise pricing available for 50+ concurrent calls.',
  website: 'https://magpipe.ai',
  founded: '2025',
  headquarters: 'Vancouver, BC, Canada',
};

function copyToClipboard(text, label) {
  navigator.clipboard.writeText(text).then(() => {
    showToast(`${label} copied!`, 'success');
  }).catch(() => {
    showToast('Failed to copy', 'error');
  });
}

export const directoriesTabMethods = {
  async renderDirectoriesTab() {
    const container = document.getElementById('admin-tab-content');
    container.innerHTML = `
      <div class="support-tab directories-tab">
        <div class="blog-list-header">
          <h2 style="margin:0;">Directory Submissions</h2>
          <button class="btn btn-primary btn-sm" id="dir-add-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            Add Directory
          </button>
        </div>

        <!-- Submission Kit (collapsible) -->
        <div class="dir-kit-section">
          <button class="dir-kit-toggle" id="dir-kit-toggle">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg>
            <span>Submission Kit — Ready-to-paste copy for directory forms</span>
          </button>
          <div class="dir-kit-content" id="dir-kit-content" style="display:none;">
            ${this.renderSubmissionKit()}
          </div>
        </div>

        <!-- Tracker Table -->
        <div id="dir-table-container">
          <div class="loading-spinner">Loading directories...</div>
        </div>
      </div>
    `;

    // Toggle submission kit
    document.getElementById('dir-kit-toggle').addEventListener('click', () => {
      const content = document.getElementById('dir-kit-content');
      const toggle = document.getElementById('dir-kit-toggle');
      const isOpen = content.style.display !== 'none';
      content.style.display = isOpen ? 'none' : 'block';
      toggle.classList.toggle('open', !isOpen);
    });

    // Copy buttons
    container.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.copy;
        let text = '';
        if (key === 'categories') text = SUBMISSION_KIT.categories.join(', ');
        else if (key === 'keyFeatures') text = SUBMISSION_KIT.keyFeatures.join('\n');
        else text = SUBMISSION_KIT[key];
        copyToClipboard(text, btn.dataset.label || key);
      });
    });

    // Add directory button
    document.getElementById('dir-add-btn').addEventListener('click', () => {
      this.showDirectoryModal();
    });

    await this.loadDirectories();
  },

  renderSubmissionKit() {
    const kit = SUBMISSION_KIT;
    const copyBtn = (key, label) =>
      `<button class="btn btn-sm dir-copy-btn" data-copy="${key}" data-label="${label}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        Copy
      </button>`;

    return `
      <div class="dir-kit-grid">
        <div class="dir-kit-item">
          <div class="dir-kit-item-header">
            <strong>Tagline</strong>${copyBtn('tagline', 'Tagline')}
          </div>
          <p class="dir-kit-text">${kit.tagline}</p>
        </div>

        <div class="dir-kit-item">
          <div class="dir-kit-item-header">
            <strong>Short Description</strong>${copyBtn('shortDescription', 'Short description')}
          </div>
          <p class="dir-kit-text">${kit.shortDescription}</p>
        </div>

        <div class="dir-kit-item">
          <div class="dir-kit-item-header">
            <strong>Medium Description</strong>${copyBtn('mediumDescription', 'Medium description')}
          </div>
          <p class="dir-kit-text">${kit.mediumDescription}</p>
        </div>

        <div class="dir-kit-item">
          <div class="dir-kit-item-header">
            <strong>Long Description</strong>${copyBtn('longDescription', 'Long description')}
          </div>
          <p class="dir-kit-text dir-kit-long">${kit.longDescription.replace(/\n/g, '<br>')}</p>
        </div>

        <div class="dir-kit-row">
          <div class="dir-kit-item">
            <div class="dir-kit-item-header">
              <strong>Categories</strong>${copyBtn('categories', 'Categories')}
            </div>
            <div class="dir-kit-tags">${kit.categories.map(c => `<span class="dir-kit-tag">${c}</span>`).join('')}</div>
          </div>
          <div class="dir-kit-item">
            <div class="dir-kit-item-header">
              <strong>Key Features</strong>${copyBtn('keyFeatures', 'Key features')}
            </div>
            <ul class="dir-kit-features">${kit.keyFeatures.map(f => `<li>${f}</li>`).join('')}</ul>
          </div>
        </div>

        <div class="dir-kit-row">
          <div class="dir-kit-item">
            <div class="dir-kit-item-header">
              <strong>Pricing</strong>${copyBtn('pricing', 'Pricing')}
            </div>
            <p class="dir-kit-text">${kit.pricing}</p>
          </div>
          <div class="dir-kit-item">
            <div class="dir-kit-item-header">
              <strong>Website</strong>${copyBtn('website', 'Website URL')}
            </div>
            <p class="dir-kit-text">${kit.website}</p>
          </div>
          <div class="dir-kit-item">
            <div class="dir-kit-item-header">
              <strong>Founded</strong>${copyBtn('founded', 'Founded year')}
            </div>
            <p class="dir-kit-text">${kit.founded}</p>
          </div>
          <div class="dir-kit-item">
            <div class="dir-kit-item-header">
              <strong>HQ</strong>${copyBtn('headquarters', 'HQ location')}
            </div>
            <p class="dir-kit-text">${kit.headquarters}</p>
          </div>
        </div>
      </div>
    `;
  },

  async dirApiCall(action, data = {}) {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-directories-api`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, ...data }),
      }
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'API error');
    return result;
  },

  async loadDirectories() {
    try {
      const result = await this.dirApiCall('list_directories');
      this.directories = result.directories || [];
      this.renderDirectoriesTable();
    } catch (err) {
      document.getElementById('dir-table-container').innerHTML = `
        <div class="analytics-error">
          <p>Failed to load directories: ${err.message}</p>
          <button class="btn btn-primary btn-sm" onclick="window.adminPage.loadDirectories()">Retry</button>
        </div>
      `;
    }
  },

  renderDirectoriesTable() {
    const container = document.getElementById('dir-table-container');
    if (!this.directories || this.directories.length === 0) {
      container.innerHTML = `<div class="tl-empty"><p>No directories added yet.</p></div>`;
      return;
    }

    // Sort: critical first, then high, medium, low
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const sorted = [...this.directories].sort((a, b) =>
      (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9)
    );

    container.innerHTML = `
      <div class="admin-table-wrapper">
        <table class="admin-table dir-table">
          <thead>
            <tr>
              <th>Directory</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Cost</th>
              <th>Submit</th>
              <th>Listing</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map(d => this.renderDirectoryRow(d)).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Attach status dropdown listeners
    container.querySelectorAll('.dir-status-select').forEach(select => {
      select.addEventListener('change', async (e) => {
        const id = e.target.dataset.id;
        const status = e.target.value;
        try {
          await this.dirApiCall('update_directory', { id, status });
          // Update local data
          const dir = this.directories.find(d => d.id === id);
          if (dir) dir.status = status;
          showToast(`Status updated to ${status}`, 'success');
        } catch (err) {
          showToast('Failed to update status: ' + err.message, 'error');
          await this.loadDirectories(); // reload to reset
        }
      });
    });

    // Edit buttons
    container.querySelectorAll('.dir-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dir = this.directories.find(d => d.id === btn.dataset.id);
        if (dir) this.showDirectoryModal(dir);
      });
    });

    // Delete buttons
    container.querySelectorAll('.dir-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dir = this.directories.find(d => d.id === btn.dataset.id);
        if (dir) this.deleteDirectory(dir);
      });
    });
  },

  renderDirectoryRow(d) {
    const statusOptions = ['pending', 'submitted', 'approved', 'rejected', 'live'];
    const statusColors = {
      pending: 'badge-warning',
      submitted: 'badge-info',
      approved: 'badge-success',
      rejected: 'badge-danger',
      live: 'badge-live',
    };
    const priorityColors = {
      critical: 'dir-priority-critical',
      high: 'dir-priority-high',
      medium: 'dir-priority-medium',
      low: 'dir-priority-low',
    };

    return `
      <tr>
        <td>
          <a href="${d.directory_url}" target="_blank" rel="noopener" class="dir-name-link">
            ${d.directory_name}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
          </a>
        </td>
        <td>
          <select class="dir-status-select dir-status-${d.status}" data-id="${d.id}">
            ${statusOptions.map(s => `<option value="${s}" ${s === d.status ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
          </select>
        </td>
        <td><span class="dir-priority-badge ${priorityColors[d.priority] || ''}">${d.priority}</span></td>
        <td class="${d.cost !== 'Free' ? 'dir-cost-paid' : ''}">${d.cost || 'Free'}</td>
        <td>
          ${d.submit_url
            ? `<a href="${d.submit_url}" target="_blank" rel="noopener" class="btn btn-sm btn-outline">Submit <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg></a>`
            : '<span class="text-muted">—</span>'}
        </td>
        <td>
          ${d.listing_url
            ? `<a href="${d.listing_url}" target="_blank" rel="noopener" class="dir-listing-link">View <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg></a>`
            : '<span class="text-muted">—</span>'}
        </td>
        <td class="dir-notes-cell">${d.notes ? `<span class="dir-notes-text" title="${d.notes.replace(/"/g, '&quot;')}">${d.notes.length > 40 ? d.notes.slice(0, 40) + '...' : d.notes}</span>` : '<span class="text-muted">—</span>'}</td>
        <td>
          <div class="blog-actions">
            <button class="btn btn-sm btn-ghost dir-edit-btn" data-id="${d.id}" title="Edit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn btn-sm btn-ghost dir-delete-btn" data-id="${d.id}" title="Delete" style="color:#dc2626;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  },

  showDirectoryModal(existing = null) {
    const isEdit = !!existing;
    const title = isEdit ? 'Edit Directory' : 'Add Directory';

    // Remove any existing modal
    const old = document.getElementById('dir-modal-overlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.className = 'contact-modal-overlay';
    overlay.id = 'dir-modal-overlay';
    overlay.style.display = 'flex';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = 'none'; };

    overlay.innerHTML = `
      <div class="contact-modal" onclick="event.stopPropagation()" style="max-width:550px;">
        <div class="contact-modal-header">
          <h3>${title}</h3>
          <button class="close-modal-btn" id="dir-modal-close">&times;</button>
        </div>
        <form id="dir-modal-form">
          <div class="contact-modal-body">
            <div class="form-group">
              <label>Directory Name *</label>
              <input type="text" class="form-input" name="directory_name" required value="${existing?.directory_name || ''}" placeholder="e.g. Product Hunt">
            </div>
            <div class="form-group">
              <label>Directory URL *</label>
              <input type="url" class="form-input" name="directory_url" required value="${existing?.directory_url || ''}" placeholder="https://producthunt.com">
            </div>
            <div class="form-group">
              <label>Submit URL</label>
              <input type="url" class="form-input" name="submit_url" value="${existing?.submit_url || ''}" placeholder="https://producthunt.com/launch">
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
              <div class="form-group">
                <label>Cost</label>
                <input type="text" class="form-input" name="cost" value="${existing?.cost || 'Free'}" placeholder="Free">
              </div>
              <div class="form-group">
                <label>Priority</label>
                <select class="form-input" name="priority">
                  <option value="critical" ${existing?.priority === 'critical' ? 'selected' : ''}>Critical</option>
                  <option value="high" ${existing?.priority === 'high' ? 'selected' : ''}>High</option>
                  <option value="medium" ${(!existing || existing?.priority === 'medium') ? 'selected' : ''}>Medium</option>
                  <option value="low" ${existing?.priority === 'low' ? 'selected' : ''}>Low</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>Listing URL (once live)</label>
              <input type="url" class="form-input" name="listing_url" value="${existing?.listing_url || ''}" placeholder="https://producthunt.com/products/magpipe">
            </div>
            <div class="form-group">
              <label>Notes</label>
              <textarea class="form-input" name="notes" rows="3" placeholder="Any notes about the submission...">${existing?.notes || ''}</textarea>
            </div>
          </div>
          <div class="contact-modal-footer">
            <button type="button" class="btn btn-secondary" id="dir-modal-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Add Directory'}</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    // Close handlers
    document.getElementById('dir-modal-close').onclick = () => overlay.remove();
    document.getElementById('dir-modal-cancel').onclick = () => overlay.remove();

    // Submit handler
    document.getElementById('dir-modal-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const data = {
        directory_name: form.directory_name.value.trim(),
        directory_url: form.directory_url.value.trim(),
        submit_url: form.submit_url.value.trim() || null,
        cost: form.cost.value.trim() || 'Free',
        priority: form.priority.value,
        listing_url: form.listing_url.value.trim() || null,
        notes: form.notes.value.trim() || null,
      };

      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = isEdit ? 'Saving...' : 'Adding...';

      try {
        if (isEdit) {
          await this.dirApiCall('update_directory', { id: existing.id, ...data });
          showToast('Directory updated', 'success');
        } else {
          await this.dirApiCall('create_directory', data);
          showToast('Directory added', 'success');
        }
        overlay.remove();
        await this.loadDirectories();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = isEdit ? 'Save Changes' : 'Add Directory';
      }
    });
  },

  async deleteDirectory(dir) {
    showConfirmModal(
      'Delete Directory',
      `Are you sure you want to delete "${dir.directory_name}"?`,
      {
        confirmText: 'Delete',
        confirmClass: 'btn-danger',
        onConfirm: async () => {
          try {
            await this.dirApiCall('delete_directory', { id: dir.id });
            showToast('Directory deleted', 'success');
            await this.loadDirectories();
          } catch (err) {
            showToast('Failed to delete: ' + err.message, 'error');
          }
        },
      }
    );
  },
};
