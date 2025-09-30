/**
 * Calls History Page
 */

import { CallRecord } from '../models/CallRecord.js';
import { getCurrentUser } from '../lib/supabase.js';

export default class CallsPage {
  constructor() {
    this.calls = [];
    this.currentFilter = 'all';
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    // Fetch all calls
    const { callRecords } = await CallRecord.list(user.id, {
      orderBy: 'started_at',
      ascending: false,
    });
    this.calls = callRecords;

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container" style="padding-top: 2rem;">
        <h1>Call History</h1>

        <div class="card" style="margin-bottom: 1rem;">
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <button class="btn btn-secondary filter-btn active" data-filter="all">
              All Calls
            </button>
            <button class="btn btn-secondary filter-btn" data-filter="inbound">
              Inbound
            </button>
            <button class="btn btn-secondary filter-btn" data-filter="outbound">
              Outbound
            </button>
            <button class="btn btn-secondary filter-btn" data-filter="completed">
              Completed
            </button>
            <button class="btn btn-secondary filter-btn" data-filter="missed">
              Missed
            </button>
          </div>
        </div>

        <div class="card">
          <div id="calls-list">
            ${this.renderCallsList()}
          </div>
        </div>

        <!-- Call Details Modal -->
        <div id="call-modal" class="modal hidden">
          <div class="modal-content card" style="max-width: 600px; margin: 2rem auto;">
            <div id="call-details"></div>
            <button class="btn btn-secondary btn-full mt-3" id="close-modal-btn">
              Close
            </button>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  renderCallsList() {
    let filteredCalls = this.calls;

    // Apply filters
    switch (this.currentFilter) {
      case 'inbound':
        filteredCalls = this.calls.filter((call) => call.direction === 'inbound');
        break;
      case 'outbound':
        filteredCalls = this.calls.filter((call) => call.direction === 'outbound');
        break;
      case 'completed':
        filteredCalls = this.calls.filter((call) => call.status === 'completed');
        break;
      case 'missed':
        filteredCalls = this.calls.filter((call) =>
          ['no-answer', 'failed'].includes(call.status)
        );
        break;
    }

    if (filteredCalls.length === 0) {
      return '<p class="text-muted text-center">No calls found</p>';
    }

    return filteredCalls
      .map(
        (call) => `
        <div class="call-item" data-id="${call.id}" style="
          padding: 1rem;
          border-bottom: 1px solid var(--border-color);
          cursor: pointer;
          transition: background-color 0.2s;
        " onmouseover="this.style.backgroundColor='var(--bg-secondary)'"
           onmouseout="this.style.backgroundColor='transparent'">
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <div style="flex: 1;">
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                <span style="font-size: 1.5rem;">
                  ${call.direction === 'inbound' ? '📞' : '📱'}
                </span>
                <div>
                  <div style="font-weight: 600;">
                    ${call.contacts?.name || call.contacts?.phone_number || 'Unknown'}
                  </div>
                  <div class="text-sm text-muted">
                    ${call.direction} • ${call.status}
                    ${call.duration_seconds ? ` • ${this.formatDuration(call.duration_seconds)}` : ''}
                  </div>
                </div>
              </div>
              ${call.transcript ? `
                <div class="text-sm text-muted" style="margin-top: 0.5rem; font-style: italic;">
                  "${call.transcript.substring(0, 100)}${call.transcript.length > 100 ? '...' : ''}"
                </div>
              ` : ''}
            </div>
            <div class="text-sm text-muted" style="text-align: right;">
              ${this.formatDateTime(call.started_at)}
            </div>
          </div>
        </div>
      `
      )
      .join('');
  }

  formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  formatDateTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins} min ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  attachEventListeners() {
    const callModal = document.getElementById('call-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        // Update active state
        document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
        e.target.classList.add('active');

        // Apply filter
        this.currentFilter = e.target.dataset.filter;
        document.getElementById('calls-list').innerHTML = this.renderCallsList();
        this.attachCallItemListeners();
      });
    });

    // Close modal
    closeModalBtn.addEventListener('click', () => {
      callModal.classList.add('hidden');
    });

    this.attachCallItemListeners();
  }

  attachCallItemListeners() {
    document.querySelectorAll('.call-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        const callId = e.currentTarget.dataset.id;
        this.showCallDetails(callId);
      });
    });
  }

  async showCallDetails(callId) {
    const { callRecord } = await CallRecord.getById(callId);

    if (!callRecord) return;

    const callModal = document.getElementById('call-modal');
    const callDetails = document.getElementById('call-details');

    callDetails.innerHTML = `
      <h2>Call Details</h2>

      <div style="margin-top: 1rem;">
        <div class="form-group">
          <strong>Contact:</strong> ${callRecord.contacts?.name || 'Unknown'}
        </div>

        <div class="form-group">
          <strong>Phone:</strong> ${callRecord.contacts?.phone_number || 'N/A'}
        </div>

        <div class="form-group">
          <strong>Direction:</strong>
          <span style="text-transform: capitalize;">${callRecord.direction}</span>
        </div>

        <div class="form-group">
          <strong>Status:</strong>
          <span style="text-transform: capitalize;">${callRecord.status}</span>
        </div>

        <div class="form-group">
          <strong>Started:</strong> ${new Date(callRecord.started_at).toLocaleString()}
        </div>

        ${callRecord.duration_seconds ? `
          <div class="form-group">
            <strong>Duration:</strong> ${this.formatDuration(callRecord.duration_seconds)}
          </div>
        ` : ''}

        ${callRecord.recording_url ? `
          <div class="form-group">
            <strong>Recording:</strong><br>
            <audio controls style="width: 100%; margin-top: 0.5rem;">
              <source src="${callRecord.recording_url}" type="audio/mpeg">
              Your browser does not support audio playback.
            </audio>
          </div>
        ` : ''}

        ${callRecord.transcript ? `
          <div class="form-group">
            <strong>Transcript:</strong>
            <div class="card" style="margin-top: 0.5rem; background: var(--bg-secondary); white-space: pre-wrap;">
              ${callRecord.transcript}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    callModal.classList.remove('hidden');
  }
}