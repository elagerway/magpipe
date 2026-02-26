/**
 * Batch Calls Page - Create and manage batch outbound calls
 * Two-panel layout: form on left, recipient preview on right
 */

import { getCurrentUser, supabase } from '../lib/supabase.js';
import { renderBottomNav } from '../components/BottomNav.js';
import { showToast } from '../lib/toast.js';
import { showConfirmModal } from '../components/ConfirmModal.js';

export default class BatchCallsPage {
  constructor() {
    this.userId = null;
    this.agents = [];
    this.serviceNumbers = [];
    this.recipients = [];
    this.batches = [];
    this.currentView = 'history'; // 'create' | 'history'
    this.sendNow = true;
    this.reservedConcurrency = 5;
    this.windowDays = [1, 2, 3, 4, 5]; // Mon-Fri default
    this.editingBatchId = null;
    this.subscription = null;
    this.recipientSubscription = null;
    this.pollInterval = null;
    // Recurrence state
    this.recurrenceType = 'none';
    this.recurrenceInterval = 1;
    this.recurrenceEndCondition = 'never'; // 'never' | 'after_runs' | 'on_date'
    this.recurrenceMaxRuns = 10;
    this.recurrenceEndDate = '';
  }

  async render() {
    const { user } = await getCurrentUser();
    if (!user) {
      window.navigateTo('/login');
      return;
    }
    this.userId = user.id;

    const appElement = document.getElementById('app');
    appElement.innerHTML = `
      <style>
        .batch-page { padding: 1.5rem; flex: 1; min-width: 0; box-sizing: border-box; }
        .batch-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.75rem; }
        .batch-header h1 { margin: 0; font-size: 1.5rem; font-weight: 600; color: var(--text-primary); }
        .batch-header-right { display: flex; align-items: center; gap: 0.75rem; }
        .batch-cost-badge { font-size: 0.8rem; color: var(--text-secondary); background: var(--bg-secondary); padding: 0.25rem 0.75rem; border-radius: 20px; display: flex; align-items: center; gap: 0.35rem; }
        .batch-cost-badge svg { width: 14px; height: 14px; }
        .batch-tabs { display: flex; gap: 0.5rem; }
        .batch-tab { padding: 0.5rem 1rem; border: 1px solid rgba(128,128,128,0.2); border-radius: 8px; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 0.875rem; transition: all 0.15s; }
        .batch-tab.active { background: var(--primary-color, #6366f1); color: white; border-color: var(--primary-color, #6366f1); }
        .batch-grid { display: grid; grid-template-columns: minmax(0, 480px) minmax(0, 1fr); gap: 1.5rem; }
        .batch-card { background: var(--bg-primary, white); border: 1px solid rgba(128,128,128,0.15); border-radius: 12px; overflow: hidden; }
        .batch-form-section { padding: 1.25rem 1.5rem; border-bottom: 1px solid rgba(128,128,128,0.1); }
        .batch-form-section:last-child { border-bottom: none; }
        .batch-label { display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.5rem; }
        .batch-input { width: 100%; padding: 0.625rem 0.75rem; border: 1px solid rgba(128,128,128,0.25); border-radius: 8px; background: var(--bg-primary, white); color: var(--text-primary); font-size: 0.9rem; outline: none; transition: border-color 0.15s; box-sizing: border-box; }
        .batch-input:focus { border-color: var(--primary-color, #6366f1); }
        .batch-select { width: 100%; padding: 0.625rem 0.75rem; border: 1px solid rgba(128,128,128,0.25); border-radius: 8px; background: var(--bg-primary, white); color: var(--text-primary); font-size: 0.9rem; cursor: pointer; outline: none; }

        /* CSV drop zone */
        .csv-upload-section { margin-top: 0.5rem; }
        .csv-template-link { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; color: var(--text-secondary); text-decoration: none; margin-bottom: 0.75rem; cursor: pointer; }
        .csv-template-link:hover { color: var(--primary-color, #6366f1); }
        .csv-drop-zone { border: 2px dashed rgba(128,128,128,0.3); border-radius: 10px; padding: 1.5rem; text-align: center; cursor: pointer; transition: all 0.15s; background: var(--bg-secondary, #f8f9fa); }
        .csv-drop-zone:hover, .csv-drop-zone.drag-over { border-color: var(--primary-color, #6366f1); background: rgba(99, 102, 241, 0.04); }
        .csv-drop-zone .upload-icon { color: var(--text-secondary); margin-bottom: 0.5rem; }
        .csv-drop-zone .upload-text { font-size: 0.85rem; color: var(--text-secondary); }
        .csv-drop-zone .upload-hint { font-size: 0.75rem; color: rgba(128,128,128,0.6); margin-top: 0.25rem; }
        .csv-file-input { display: none; }

        /* Manual recipients */
        .manual-recipients-toggle { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; color: var(--text-secondary); cursor: pointer; margin-top: 0.75rem; }
        .manual-recipients-toggle:hover { color: var(--primary-color, #6366f1); }
        .manual-recipients-rows { margin-top: 0.5rem; }
        .manual-recipient-row { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; align-items: center; }
        .manual-recipient-row input { flex: 1; padding: 0.5rem 0.65rem; border: 1px solid rgba(128,128,128,0.25); border-radius: 8px; background: var(--bg-primary, white); color: var(--text-primary); font-size: 0.85rem; outline: none; box-sizing: border-box; }
        .manual-recipient-row input:focus { border-color: var(--primary-color, #6366f1); }
        .manual-remove-btn { width: 28px; height: 28px; border: none; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; border-radius: 6px; flex-shrink: 0; }
        .manual-remove-btn:hover { background: rgba(239,68,68,0.1); color: #ef4444; }
        .manual-add-btn { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; color: var(--primary-color, #6366f1); cursor: pointer; border: none; background: none; padding: 0.25rem 0; font-weight: 500; }
        .manual-add-btn:hover { opacity: 0.8; }

        /* Send timing */
        .send-toggle { display: flex; gap: 0; border: 1px solid rgba(128,128,128,0.25); border-radius: 8px; overflow: hidden; }
        .send-toggle-btn { flex: 1; padding: 0.5rem; text-align: center; font-size: 0.85rem; cursor: pointer; border: none; background: transparent; color: var(--text-secondary); transition: all 0.15s; }
        .send-toggle-btn.active { background: var(--primary-color, #6366f1); color: white; }

        /* Call window */
        .window-times { display: flex; align-items: center; gap: 0.5rem; }
        .window-times input[type="time"] { padding: 0.4rem 0.5rem; border: 1px solid rgba(128,128,128,0.25); border-radius: 6px; background: var(--bg-primary, white); color: var(--text-primary); font-size: 0.85rem; }
        .window-days { display: flex; gap: 0.35rem; margin-top: 0.5rem; }
        .day-chip { width: 36px; height: 32px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(128,128,128,0.25); border-radius: 6px; font-size: 0.75rem; cursor: pointer; background: transparent; color: var(--text-secondary); transition: all 0.15s; }
        .day-chip.active { background: var(--primary-color, #6366f1); color: white; border-color: var(--primary-color, #6366f1); }

        /* Concurrency stepper */
        .concurrency-stepper { display: flex; align-items: center; border: 1px solid rgba(128,128,128,0.25); border-radius: 8px; overflow: hidden; }
        .concurrency-btn { width: 36px; height: 36px; border: none; background: var(--bg-secondary); color: var(--text-primary); cursor: pointer; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; transition: background 0.15s; }
        .concurrency-btn:hover { background: rgba(128,128,128,0.2); }
        .concurrency-value { flex: 1; text-align: center; font-size: 0.95rem; font-weight: 500; color: var(--text-primary); }
        .concurrency-info { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem; padding: 0.5rem 0.75rem; background: rgba(59, 130, 246, 0.08); border-radius: 8px; font-size: 0.8rem; color: #3b82f6; }
        .concurrency-info svg { flex-shrink: 0; }

        /* Footer buttons */
        .batch-footer { display: flex; align-items: center; justify-content: center; gap: 0.75rem; padding: 1.25rem 1.5rem; border-top: 1px solid rgba(128,128,128,0.1); }
        .btn-draft { padding: 0.6rem 1.25rem; border: 1px solid rgba(128,128,128,0.25); border-radius: 8px; background: transparent; color: var(--text-primary); font-size: 0.875rem; cursor: pointer; font-weight: 500; }
        .btn-send { padding: 0.6rem 1.75rem; border: none; border-radius: 8px; background: var(--primary-color, #6366f1); color: white; font-size: 0.875rem; cursor: pointer; font-weight: 500; opacity: 0.5; pointer-events: none; }
        .btn-send.enabled { opacity: 1; pointer-events: auto; }

        /* Recipients panel */
        .recipients-header { padding: 1rem 1.25rem; border-bottom: 1px solid rgba(128,128,128,0.1); font-weight: 600; font-size: 0.95rem; color: var(--text-primary); }
        .recipients-empty { display: flex; align-items: center; justify-content: center; min-height: 300px; color: var(--text-secondary); font-size: 0.9rem; }
        .recipients-list { max-height: 600px; overflow-y: auto; }
        .recipient-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 1.25rem; border-bottom: 1px solid rgba(128,128,128,0.06); font-size: 0.85rem; }
        .recipient-row:last-child { border-bottom: none; }
        .recipient-name { font-weight: 500; color: var(--text-primary); }
        .recipient-phone { color: var(--text-secondary); }
        .recipient-index { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: var(--bg-secondary); border-radius: 50%; font-size: 0.75rem; color: var(--text-secondary); flex-shrink: 0; }

        /* History view */
        .batch-history-list { padding: 0; }
        .batch-history-row { display: grid; grid-template-columns: 1fr auto auto auto; gap: 1rem; align-items: center; padding: 0.85rem 1.25rem; border-bottom: 1px solid rgba(128,128,128,0.08); cursor: pointer; transition: background 0.1s; }
        .batch-history-row:hover { background: rgba(128,128,128,0.04); }
        .batch-history-name { font-weight: 500; color: var(--text-primary); font-size: 0.9rem; }
        .batch-history-date { font-size: 0.8rem; color: var(--text-secondary); }
        .batch-status-badge { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.75rem; font-weight: 500; }
        .batch-status-draft { background: rgba(128,128,128,0.1); color: var(--text-secondary); }
        .batch-status-scheduled { background: rgba(59,130,246,0.1); color: #3b82f6; }
        .batch-status-running { background: rgba(245,158,11,0.1); color: #f59e0b; }
        .batch-status-completed { background: rgba(16,185,129,0.1); color: #10b981; }
        .batch-status-cancelled, .batch-status-failed { background: rgba(239,68,68,0.1); color: #ef4444; }
        .batch-status-paused { background: rgba(168,85,247,0.1); color: #a855f7; }
        .batch-status-recurring { background: rgba(99,102,241,0.1); color: #6366f1; }
        .batch-history-counts { font-size: 0.8rem; color: var(--text-secondary); white-space: nowrap; }

        /* Terms line */
        .batch-terms { font-size: 0.75rem; color: var(--text-secondary); text-align: center; padding: 0 1.5rem 1rem; }
        .batch-terms a { color: var(--primary-color, #6366f1); text-decoration: none; }

        /* Schedule picker */
        .schedule-picker { margin-top: 0.5rem; display: none; }
        .schedule-picker.visible { display: block; }

        /* Recurrence */
        .recurrence-section { margin-top: 0.5rem; }
        .recurrence-row { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem; }
        .recurrence-row select, .recurrence-row input { padding: 0.4rem 0.5rem; border: 1px solid rgba(128,128,128,0.25); border-radius: 6px; background: var(--bg-primary, white); color: var(--text-primary); font-size: 0.85rem; }
        .recurrence-row input[type="number"] { width: 60px; text-align: center; }
        .recurrence-end-section { margin-top: 0.5rem; }
        .recurrence-end-row { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.35rem; }
        .recurrence-badge { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.7rem; padding: 0.15rem 0.5rem; border-radius: 10px; background: rgba(99,102,241,0.1); color: #6366f1; font-weight: 500; }
        .runs-list { margin-top: 0.75rem; }
        .run-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0; border-bottom: 1px solid rgba(128,128,128,0.08); font-size: 0.85rem; cursor: pointer; }
        .run-row:hover { background: rgba(128,128,128,0.04); }
        .run-number { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; background: var(--bg-secondary); border-radius: 50%; font-size: 0.7rem; color: var(--text-secondary); flex-shrink: 0; }
        .run-info { flex: 1; min-width: 0; }
        .run-date { font-size: 0.75rem; color: var(--text-secondary); }

        @media (max-width: 768px) {
          .batch-grid { grid-template-columns: 1fr; }
          .batch-page { padding: 1rem; }
          .window-days { flex-wrap: wrap; }
        }
      </style>

      <div class="batch-page container with-bottom-nav">
        <!-- Header -->
        <div class="batch-header">
          <div style="display: flex; align-items: center; gap: 1rem;">
            <h1>Batch Calls</h1>
            <span class="batch-cost-badge">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
              Batch call cost $0.005 per dial
            </span>
          </div>
          <div class="batch-header-right">
            <div class="batch-tabs">
              <button class="batch-tab ${this.currentView === 'create' ? 'active' : ''}" data-view="create">Create</button>
              <button class="batch-tab ${this.currentView === 'history' ? 'active' : ''}" data-view="history">History</button>
            </div>
          </div>
        </div>

        <!-- Create View -->
        <div id="batch-create-view" style="display: ${this.currentView === 'create' ? 'block' : 'none'};">
          <div class="batch-grid">
            <!-- Left Panel: Form -->
            <div>
              <div class="batch-card">
                <!-- Batch Call Name -->
                <div class="batch-form-section">
                  <label class="batch-label">Batch Call Name</label>
                  <input type="text" id="batch-name" class="batch-input" placeholder="Enter">
                </div>

                <!-- Agent -->
                <div class="batch-form-section">
                  <label class="batch-label">Agent</label>
                  <select id="batch-agent-id" class="batch-select">
                    <option value="">Loading agents...</option>
                  </select>
                </div>

                <!-- From Number -->
                <div class="batch-form-section">
                  <label class="batch-label">From number</label>
                  <select id="batch-caller-id" class="batch-select">
                    <option value="">Select an agent first</option>
                  </select>
                </div>

                <!-- Upload Recipients -->
                <div class="batch-form-section">
                  <label class="batch-label">Upload Recipients</label>
                  <div class="csv-upload-section">
                    <a class="csv-template-link" id="download-template">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Download the template
                    </a>
                    <div class="csv-drop-zone" id="csv-drop-zone">
                      <div class="upload-icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      </div>
                      <div class="upload-text">Choose a csv or drag & drop it here.</div>
                      <div class="upload-hint">Up to 50 MB &middot; max 500 recipients</div>
                    </div>
                    <input type="file" class="csv-file-input" id="csv-file-input" accept=".csv">
                  </div>
                  <div class="manual-recipients-toggle" id="manual-toggle">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Add numbers manually
                  </div>
                  <div id="manual-recipients-section" style="display: none;">
                    <div class="manual-recipients-rows" id="manual-rows">
                      <div class="manual-recipient-row">
                        <input type="text" placeholder="Name" class="manual-name">
                        <input type="tel" placeholder="Phone (+1...)" class="manual-phone">
                        <button class="manual-remove-btn" title="Remove">&times;</button>
                      </div>
                    </div>
                    <button class="manual-add-btn" id="manual-add-row">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Add another
                    </button>
                  </div>
                </div>

                <!-- When to Send -->
                <div class="batch-form-section">
                  <label class="batch-label">When to send the calls</label>
                  <div class="send-toggle">
                    <button class="send-toggle-btn ${this.sendNow ? 'active' : ''}" data-send="now">
                      Send Now
                      <span style="margin-left: 6px; display: inline-flex; width: 16px; height: 16px; border-radius: 50%; border: 2px solid ${this.sendNow ? 'white' : 'rgba(128,128,128,0.4)'}; align-items: center; justify-content: center;">
                        ${this.sendNow ? '<span style="width: 8px; height: 8px; border-radius: 50%; background: white;"></span>' : ''}
                      </span>
                    </button>
                    <button class="send-toggle-btn ${!this.sendNow ? 'active' : ''}" data-send="schedule">
                      Schedule
                      <span style="margin-left: 6px; display: inline-flex; width: 16px; height: 16px; border-radius: 50%; border: 2px solid ${!this.sendNow ? 'white' : 'rgba(128,128,128,0.4)'}; align-items: center; justify-content: center;">
                        ${!this.sendNow ? '<span style="width: 8px; height: 8px; border-radius: 50%; background: white;"></span>' : ''}
                      </span>
                    </button>
                  </div>
                  <div class="schedule-picker ${!this.sendNow ? 'visible' : ''}" id="schedule-picker">
                    <input type="datetime-local" class="batch-input" id="batch-schedule-time" style="margin-top: 0.5rem;">
                  </div>
                </div>

                <!-- Repeat -->
                <div class="batch-form-section">
                  <label class="batch-label">Repeat</label>
                  <div class="recurrence-section">
                    <div class="recurrence-row">
                      <select id="recurrence-type" class="batch-select" style="width: auto; min-width: 120px;">
                        <option value="none" ${this.recurrenceType === 'none' ? 'selected' : ''}>None</option>
                        <option value="hourly" ${this.recurrenceType === 'hourly' ? 'selected' : ''}>Hourly</option>
                        <option value="daily" ${this.recurrenceType === 'daily' ? 'selected' : ''}>Daily</option>
                        <option value="weekly" ${this.recurrenceType === 'weekly' ? 'selected' : ''}>Weekly</option>
                        <option value="monthly" ${this.recurrenceType === 'monthly' ? 'selected' : ''}>Monthly</option>
                      </select>
                    </div>
                    <div id="recurrence-options" style="display: ${this.recurrenceType !== 'none' ? 'block' : 'none'};">
                      <div class="recurrence-row">
                        <span style="font-size: 0.85rem; color: var(--text-secondary);">Every</span>
                        <input type="number" id="recurrence-interval" min="1" max="99" value="${this.recurrenceInterval}">
                        <span id="recurrence-unit-label" style="font-size: 0.85rem; color: var(--text-secondary);">${this.recurrenceType === 'hourly' ? 'hour(s)' : this.recurrenceType === 'daily' ? 'day(s)' : this.recurrenceType === 'weekly' ? 'week(s)' : 'month(s)'}</span>
                      </div>
                      <div class="recurrence-end-section">
                        <label class="batch-label" style="font-size: 0.75rem; margin-top: 0.5rem;">Ends</label>
                        <div class="recurrence-end-row">
                          <select id="recurrence-end-condition" style="padding: 0.4rem 0.5rem; border: 1px solid rgba(128,128,128,0.25); border-radius: 6px; background: var(--bg-primary, white); color: var(--text-primary); font-size: 0.85rem;">
                            <option value="never" ${this.recurrenceEndCondition === 'never' ? 'selected' : ''}>Never</option>
                            <option value="after_runs" ${this.recurrenceEndCondition === 'after_runs' ? 'selected' : ''}>After N runs</option>
                            <option value="on_date" ${this.recurrenceEndCondition === 'on_date' ? 'selected' : ''}>On date</option>
                          </select>
                        </div>
                        <div id="recurrence-end-details" style="margin-top: 0.35rem;"></div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- When Calls Can Run -->
                <div class="batch-form-section">
                  <label class="batch-label" style="display: flex; align-items: center; justify-content: space-between;">
                    When Calls Can Run
                    <span style="font-weight: 400; font-size: 0.8rem; color: var(--text-secondary); cursor: pointer;" id="window-toggle">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      <span id="window-summary">00:00-23:59, Mon-Sun</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -1px;"><polyline points="9 18 15 12 9 6"/></svg>
                    </span>
                  </label>
                  <div id="window-details" style="display: none; margin-top: 0.5rem;">
                    <div class="window-times">
                      <input type="time" id="window-start" value="00:00">
                      <span style="color: var(--text-secondary);">to</span>
                      <input type="time" id="window-end" value="23:59">
                    </div>
                    <div class="window-days">
                      ${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day, i) => `
                        <button class="day-chip ${this.windowDays.includes(i) ? 'active' : ''}" data-day="${i}">${day}</button>
                      `).join('')}
                    </div>
                  </div>
                </div>

                <!-- Reserved Concurrency -->
                <div class="batch-form-section">
                  <label class="batch-label">Reserved Concurrency for Other Calls</label>
                  <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Number of concurrency reserved for all other calls, such as inbound calls.</div>
                  <div class="concurrency-stepper">
                    <button class="concurrency-btn" id="concurrency-minus">&minus;</button>
                    <span class="concurrency-value" id="concurrency-value">${this.reservedConcurrency}</span>
                    <button class="concurrency-btn" id="concurrency-plus">+</button>
                  </div>
                  <div class="concurrency-info">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                    <span>Concurrency allocated to batch calling: <strong id="batch-concurrency-value">5</strong> <span style="font-weight: 400; font-size: 0.75rem;">(max 5)</span></span>
                  </div>
                </div>

                <!-- Footer -->
                <div class="batch-terms">
                  You've read and agree with the <a href="/terms" target="_blank">Terms of service</a>.
                </div>
                <div class="batch-footer">
                  <button class="btn-draft" id="btn-save-draft">Save as draft</button>
                  <button class="btn-send" id="btn-send">Send</button>
                </div>
              </div>
            </div>

            <!-- Right Panel: Recipients -->
            <div>
              <div class="batch-card">
                <div class="recipients-header">
                  Recipients <span id="recipient-count" style="font-weight: 400; color: var(--text-secondary);"></span>
                </div>
                <div id="recipients-content">
                  <div class="recipients-empty">Please upload recipients first</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- History View -->
        <div id="batch-history-view" style="display: ${this.currentView === 'history' ? 'block' : 'none'};">
          <div style="display: flex; justify-content: flex-end; margin-bottom: 0.75rem;"></div>
          <div class="batch-card">
            <div id="batch-history-content">
              <div class="recipients-empty">Loading batches...</div>
            </div>
          </div>
        </div>
      </div>
      ${renderBottomNav('/batch-calls')}
    `;

    this.attachEventListeners();
    await this.loadAgents();
    await this.loadBatches();
    this.subscribeToUpdates();
    this.startPolling();
  }

  attachEventListeners() {
    // Tab switching
    document.querySelectorAll('.batch-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchToView(tab.dataset.view);
      });
    });

    // CSV template download
    const downloadTemplate = document.getElementById('download-template');
    if (downloadTemplate) {
      downloadTemplate.addEventListener('click', (e) => {
        e.preventDefault();
        const csv = 'name,phone_number\nJohn Doe,+14155551234\nJane Smith,+12125559876\n';
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'batch-calls-template.csv';
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    // CSV drop zone
    const dropZone = document.getElementById('csv-drop-zone');
    const fileInput = document.getElementById('csv-file-input');
    if (dropZone && fileInput) {
      dropZone.addEventListener('click', () => fileInput.click());
      dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file && file.name.endsWith('.csv')) this.handleCSVFile(file);
        else showToast('Please upload a .csv file', 'warning');
      });
      fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) this.handleCSVFile(fileInput.files[0]);
      });
    }

    // Send Now / Schedule toggle
    document.querySelectorAll('.send-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.sendNow = btn.dataset.send === 'now';
        document.querySelectorAll('.send-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const picker = document.getElementById('schedule-picker');
        if (picker) picker.classList.toggle('visible', !this.sendNow);
        // Update radio indicators
        this.updateSendToggleRadios();
      });
    });

    // Recurrence controls
    const recurrenceType = document.getElementById('recurrence-type');
    if (recurrenceType) {
      recurrenceType.addEventListener('change', () => {
        this.recurrenceType = recurrenceType.value;
        const options = document.getElementById('recurrence-options');
        if (options) options.style.display = this.recurrenceType !== 'none' ? 'block' : 'none';
        this.updateRecurrenceUnitLabel();
        this.updateRecurrenceEndDetails();
      });
    }

    const recurrenceInterval = document.getElementById('recurrence-interval');
    if (recurrenceInterval) {
      recurrenceInterval.addEventListener('change', () => {
        this.recurrenceInterval = Math.max(1, parseInt(recurrenceInterval.value) || 1);
        recurrenceInterval.value = this.recurrenceInterval;
      });
    }

    const recurrenceEndCondition = document.getElementById('recurrence-end-condition');
    if (recurrenceEndCondition) {
      recurrenceEndCondition.addEventListener('change', () => {
        this.recurrenceEndCondition = recurrenceEndCondition.value;
        this.updateRecurrenceEndDetails();
      });
    }

    // Call window toggle
    const windowToggle = document.getElementById('window-toggle');
    const windowDetails = document.getElementById('window-details');
    if (windowToggle && windowDetails) {
      windowToggle.addEventListener('click', () => {
        windowDetails.style.display = windowDetails.style.display === 'none' ? 'block' : 'none';
      });
    }

    // Day chips
    document.querySelectorAll('.day-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const day = parseInt(chip.dataset.day);
        if (this.windowDays.includes(day)) {
          this.windowDays = this.windowDays.filter(d => d !== day);
          chip.classList.remove('active');
        } else {
          this.windowDays.push(day);
          chip.classList.add('active');
        }
        this.updateWindowSummary();
      });
    });

    // Window time changes
    const windowStart = document.getElementById('window-start');
    const windowEnd = document.getElementById('window-end');
    if (windowStart) windowStart.addEventListener('change', () => this.updateWindowSummary());
    if (windowEnd) windowEnd.addEventListener('change', () => this.updateWindowSummary());

    // Concurrency stepper
    const minusBtn = document.getElementById('concurrency-minus');
    const plusBtn = document.getElementById('concurrency-plus');
    if (minusBtn) minusBtn.addEventListener('click', () => this.adjustConcurrency(-1));
    if (plusBtn) plusBtn.addEventListener('click', () => this.adjustConcurrency(1));

    // Save Draft
    const saveDraftBtn = document.getElementById('btn-save-draft');
    if (saveDraftBtn) saveDraftBtn.addEventListener('click', () => this.saveBatch('draft'));

    // Manual recipients toggle
    const manualToggle = document.getElementById('manual-toggle');
    const manualSection = document.getElementById('manual-recipients-section');
    if (manualToggle && manualSection) {
      manualToggle.addEventListener('click', () => {
        const showing = manualSection.style.display !== 'none';
        manualSection.style.display = showing ? 'none' : 'block';
        manualToggle.innerHTML = showing
          ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add numbers manually'
          : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Hide manual entry';
      });
    }

    // Manual add row
    const addRowBtn = document.getElementById('manual-add-row');
    if (addRowBtn) {
      addRowBtn.addEventListener('click', () => this.addManualRow());
    }

    // Manual remove buttons (delegate)
    const manualRows = document.getElementById('manual-rows');
    if (manualRows) {
      manualRows.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.manual-remove-btn');
        if (removeBtn) {
          const row = removeBtn.closest('.manual-recipient-row');
          const allRows = manualRows.querySelectorAll('.manual-recipient-row');
          if (allRows.length > 1) {
            row.remove();
          } else {
            // Clear the last row instead of removing it
            row.querySelector('.manual-name').value = '';
            row.querySelector('.manual-phone').value = '';
          }
          this.applyManualRecipients();
        }
      });

      // Live update recipients on input
      manualRows.addEventListener('input', () => this.applyManualRecipients());
    }

    // Agent selection → load numbers for that agent
    const agentSelect = document.getElementById('batch-agent-id');
    if (agentSelect) {
      agentSelect.addEventListener('change', () => {
        const agentId = agentSelect.value;
        if (agentId) {
          this.loadAgentNumbers(agentId);
        } else {
          const callerSelect = document.getElementById('batch-caller-id');
          if (callerSelect) callerSelect.innerHTML = '<option value="">Select an agent first</option>';
        }
      });
    }

    // Send
    const sendBtn = document.getElementById('btn-send');
    if (sendBtn) sendBtn.addEventListener('click', () => this.confirmAndSend());
  }

  updateSendToggleRadios() {
    document.querySelectorAll('.send-toggle-btn').forEach(btn => {
      const isActive = btn.classList.contains('active');
      const radioSpan = btn.querySelector('span');
      if (radioSpan) {
        radioSpan.style.borderColor = isActive ? 'white' : 'rgba(128,128,128,0.4)';
        radioSpan.innerHTML = isActive ? '<span style="width: 8px; height: 8px; border-radius: 50%; background: white;"></span>' : '';
      }
    });
  }

  updateWindowSummary() {
    const start = document.getElementById('window-start')?.value || '00:00';
    const end = document.getElementById('window-end')?.value || '23:59';
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const sorted = [...this.windowDays].sort();
    let dayStr;
    if (sorted.length === 7) dayStr = 'Mon-Sun';
    else if (sorted.length === 5 && sorted.join(',') === '1,2,3,4,5') dayStr = 'Mon-Fri';
    else dayStr = sorted.map(d => dayNames[d]).join(', ');
    const summaryEl = document.getElementById('window-summary');
    if (summaryEl) summaryEl.textContent = `${start}-${end}, ${dayStr}`;
  }

  updateRecurrenceUnitLabel() {
    const label = document.getElementById('recurrence-unit-label');
    if (!label) return;
    const units = { hourly: 'hour(s)', daily: 'day(s)', weekly: 'week(s)', monthly: 'month(s)' };
    label.textContent = units[this.recurrenceType] || '';
  }

  updateRecurrenceEndDetails() {
    const container = document.getElementById('recurrence-end-details');
    if (!container) return;

    if (this.recurrenceEndCondition === 'after_runs') {
      container.innerHTML = `
        <div class="recurrence-row">
          <span style="font-size: 0.85rem; color: var(--text-secondary);">After</span>
          <input type="number" id="recurrence-max-runs" min="1" max="999" value="${this.recurrenceMaxRuns}" style="width: 70px; padding: 0.4rem 0.5rem; border: 1px solid rgba(128,128,128,0.25); border-radius: 6px; background: var(--bg-primary, white); color: var(--text-primary); font-size: 0.85rem; text-align: center;">
          <span style="font-size: 0.85rem; color: var(--text-secondary);">runs</span>
        </div>
      `;
      const input = document.getElementById('recurrence-max-runs');
      if (input) input.addEventListener('change', () => {
        this.recurrenceMaxRuns = Math.max(1, parseInt(input.value) || 10);
        input.value = this.recurrenceMaxRuns;
      });
    } else if (this.recurrenceEndCondition === 'on_date') {
      container.innerHTML = `
        <input type="date" id="recurrence-end-date" class="batch-input" value="${this.recurrenceEndDate}" style="max-width: 200px; margin-top: 0.25rem;">
      `;
      const input = document.getElementById('recurrence-end-date');
      if (input) input.addEventListener('change', () => {
        this.recurrenceEndDate = input.value;
      });
    } else {
      container.innerHTML = '';
    }
  }

  adjustConcurrency(delta) {
    this.reservedConcurrency = Math.max(0, Math.min(20, this.reservedConcurrency + delta));
    const valueEl = document.getElementById('concurrency-value');
    if (valueEl) valueEl.textContent = this.reservedConcurrency;
    const batchConcurrency = Math.min(5, Math.max(0, 20 - this.reservedConcurrency));
    const batchValue = document.getElementById('batch-concurrency-value');
    if (batchValue) batchValue.textContent = batchConcurrency;
  }

  async loadAgents() {
    const select = document.getElementById('batch-agent-id');
    if (!select) return;

    const { data: agents, error } = await supabase
      .from('agent_configs')
      .select('id, name')
      .eq('user_id', this.userId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error || !agents?.length) {
      select.innerHTML = '<option value="">No agents available</option>';
      return;
    }

    this.agents = agents;
    select.innerHTML = '<option value="">Select an agent</option>' +
      agents.map(a => `<option value="${a.id}">${this.escapeHtml(a.name)}</option>`).join('');
  }

  async loadAgentNumbers(agentId) {
    const select = document.getElementById('batch-caller-id');
    if (!select) return;

    select.innerHTML = '<option value="">Loading numbers...</option>';

    const { data: numbers, error } = await supabase
      .from('service_numbers')
      .select('phone_number')
      .eq('user_id', this.userId)
      .eq('agent_id', agentId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error || !numbers?.length) {
      select.innerHTML = '<option value="">No numbers for this agent</option>';
      return;
    }

    this.serviceNumbers = numbers;
    select.innerHTML = numbers.map(n =>
      `<option value="${n.phone_number}">${n.phone_number}</option>`
    ).join('');
  }

  addManualRow() {
    const container = document.getElementById('manual-rows');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'manual-recipient-row';
    row.innerHTML = `
      <input type="text" placeholder="Name" class="manual-name">
      <input type="tel" placeholder="Phone (+1...)" class="manual-phone">
      <button class="manual-remove-btn" title="Remove">&times;</button>
    `;
    container.appendChild(row);
    row.querySelector('.manual-name').focus();
  }

  applyManualRecipients() {
    const container = document.getElementById('manual-rows');
    if (!container) return;

    const manualRecipients = [];
    container.querySelectorAll('.manual-recipient-row').forEach((row, i) => {
      const name = row.querySelector('.manual-name')?.value?.trim();
      const phone = row.querySelector('.manual-phone')?.value?.trim();
      if (phone) {
        manualRecipients.push({
          name: name || phone,
          phone_number: phone,
          sort_order: i
        });
      }
    });

    // Merge: CSV recipients first, then manual ones
    const csvRecipients = this.recipients.filter(r => r._source !== 'manual');
    const combined = [...csvRecipients, ...manualRecipients.map(r => ({ ...r, _source: 'manual', sort_order: csvRecipients.length + r.sort_order }))];
    this.recipients = combined;
    this.renderRecipients();
    this.updateSendButton();
  }

  // CSV parsing
  parseCSVRow(row) {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      if (char === '"') {
        if (inQuotes && row[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
      else current += char;
    }
    values.push(current.trim());
    return values;
  }

  async handleCSVFile(file) {
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) { showToast('CSV must have a header row and at least one data row', 'warning'); return; }

      const headers = this.parseCSVRow(lines[0]).map(h => h.trim().toLowerCase());
      const nameIdx = headers.findIndex(h => h === 'name' || (h.includes('first') && h.includes('name')));
      const lastNameIdx = headers.findIndex(h => h.includes('last') && h.includes('name'));
      const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('mobile') || h.includes('cell'));

      if (phoneIdx === -1) { showToast('CSV must contain a phone number column (phone, phone_number, mobile, cell)', 'error'); return; }

      const recipients = [];
      let skipped = 0;
      for (let i = 1; i < lines.length; i++) {
        const values = this.parseCSVRow(lines[i]);
        const phone = (values[phoneIdx] || '').replace(/[^+\d]/g, '');
        if (!phone) { skipped++; continue; }

        let name = nameIdx !== -1 ? values[nameIdx] || '' : '';
        if (lastNameIdx !== -1 && values[lastNameIdx]) name = name ? `${name} ${values[lastNameIdx]}` : values[lastNameIdx];
        if (!name) name = phone;

        recipients.push({ name, phone_number: phone, sort_order: i - 1, _source: 'csv' });
      }

      // Check recipient limit
      if (recipients.length > 500) {
        showToast(`CSV has ${recipients.length} recipients — maximum is 500`, 'error');
        return;
      }

      // Merge with any manual recipients
      const manualRecipients = this.recipients.filter(r => r._source === 'manual');
      this.recipients = [...recipients, ...manualRecipients.map((r, i) => ({ ...r, sort_order: recipients.length + i }))];
      this.renderRecipients();
      this.updateSendButton();

      // Update drop zone to show file name
      const dropZone = document.getElementById('csv-drop-zone');
      if (dropZone) {
        dropZone.innerHTML = `
          <div style="color: var(--primary-color, #6366f1); font-weight: 500;">${file.name}</div>
          <div class="upload-hint">${recipients.length} recipients loaded${skipped ? `, ${skipped} skipped` : ''}</div>
          <div class="upload-hint" style="margin-top: 0.25rem; cursor: pointer; color: var(--primary-color, #6366f1);">Click to replace</div>
        `;
      }

      showToast(`Loaded ${recipients.length} recipients from CSV`, 'success');
    } catch (err) {
      console.error('CSV parse error:', err);
      showToast('Failed to parse CSV file', 'error');
    }
  }

  renderRecipients() {
    const content = document.getElementById('recipients-content');
    const countEl = document.getElementById('recipient-count');
    if (!content) return;

    if (this.recipients.length === 0) {
      content.innerHTML = '<div class="recipients-empty">Please upload recipients first</div>';
      if (countEl) countEl.textContent = '';
      return;
    }

    if (countEl) countEl.textContent = `(${this.recipients.length})`;
    content.innerHTML = `
      <div class="recipients-list">
        ${this.recipients.map((r, i) => `
          <div class="recipient-row">
            <span class="recipient-index">${i + 1}</span>
            <span class="recipient-name">${this.escapeHtml(r.name)}</span>
            <span class="recipient-phone">${r.phone_number}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  updateSendButton() {
    const btn = document.getElementById('btn-send');
    if (btn) {
      const hasRecipients = this.recipients.length > 0;
      btn.classList.toggle('enabled', hasRecipients);
    }
  }

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  recipientStatusLabel(status) {
    const labels = {
      pending: 'Pending',
      calling: 'Initiating',
      initiated: 'Initiating',
      ringing: 'Ringing',
      in_progress: 'Connected',
      'in-progress': 'Connected',
      answered: 'Connected',
      completed: 'Hungup',
      failed: 'Failed',
      skipped: 'Skipped',
      no_answer: 'No Answer',
      'no-answer': 'No Answer',
      busy: 'Busy',
      canceled: 'Cancelled'
    };
    return labels[status] || status;
  }

  recipientBadgeStyle(status) {
    const styles = {
      pending: 'background: rgba(156,163,175,0.1); color: #9ca3af;',
      calling: 'background: rgba(245,158,11,0.1); color: #f59e0b;',
      initiated: 'background: rgba(245,158,11,0.1); color: #f59e0b;',
      ringing: 'background: rgba(59,130,246,0.1); color: #3b82f6;',
      in_progress: 'background: rgba(16,185,129,0.1); color: #10b981;',
      'in-progress': 'background: rgba(16,185,129,0.1); color: #10b981;',
      answered: 'background: rgba(16,185,129,0.1); color: #10b981;',
      completed: 'background: rgba(16,185,129,0.1); color: #10b981;',
      failed: 'background: rgba(239,68,68,0.1); color: #ef4444;',
      skipped: 'background: rgba(107,114,128,0.1); color: #6b7280;',
      no_answer: 'background: rgba(249,115,22,0.1); color: #f97316;',
      'no-answer': 'background: rgba(249,115,22,0.1); color: #f97316;',
      busy: 'background: rgba(249,115,22,0.1); color: #f97316;',
      canceled: 'background: rgba(107,114,128,0.1); color: #6b7280;'
    };
    return `display: inline-block; padding: 0.15rem 0.5rem; border-radius: 10px; font-size: 0.7rem; font-weight: 500; white-space: nowrap; ${styles[status] || styles.pending}`;
  }

  getFormData() {
    const name = document.getElementById('batch-name')?.value?.trim() || '';
    const callerId = document.getElementById('batch-caller-id')?.value || '';
    const agentId = document.getElementById('batch-agent-id')?.value || null;
    const scheduledAt = !this.sendNow ? document.getElementById('batch-schedule-time')?.value : null;
    const windowStart = document.getElementById('window-start')?.value || '00:00';
    const windowEnd = document.getElementById('window-end')?.value || '23:59';

    const batchConcurrency = Math.min(5, Math.max(1, 20 - this.reservedConcurrency));
    const formData = {
      name,
      caller_id: callerId,
      agent_id: agentId,
      send_now: this.sendNow,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      window_start_time: windowStart,
      window_end_time: windowEnd,
      window_days: this.windowDays,
      reserved_concurrency: this.reservedConcurrency,
      max_concurrency: batchConcurrency,
      recipients: this.recipients.map(({ _source, ...r }) => r)
    };

    // Add recurrence fields if set
    if (this.recurrenceType !== 'none') {
      formData.recurrence_type = this.recurrenceType;
      formData.recurrence_interval = this.recurrenceInterval;
      if (this.recurrenceEndCondition === 'after_runs') {
        formData.recurrence_max_runs = this.recurrenceMaxRuns;
      } else if (this.recurrenceEndCondition === 'on_date' && this.recurrenceEndDate) {
        formData.recurrence_end_date = new Date(this.recurrenceEndDate + 'T23:59:59').toISOString();
      }
    }

    return formData;
  }

  validateForm(data) {
    if (!data.name) { showToast('Please enter a batch call name', 'warning'); return false; }
    if (!data.agent_id) { showToast('Please select an agent', 'warning'); return false; }
    if (!data.caller_id) { showToast('Please select a from number', 'warning'); return false; }
    if (data.recipients.length === 0) { showToast('Please upload recipients', 'warning'); return false; }
    if (data.recipients.length > 500) { showToast('Maximum 500 recipients per batch', 'error'); return false; }
    if (!data.send_now && !data.scheduled_at) { showToast('Please select a schedule time', 'warning'); return false; }
    return true;
  }

  async saveBatch(status = 'draft') {
    const data = this.getFormData();
    if (status !== 'draft' && !this.validateForm(data)) return;
    if (status === 'draft' && !data.name) { showToast('Please enter a batch call name', 'warning'); return; }

    const isRecurring = data.recurrence_type && data.recurrence_type !== 'none';

    // Recurring batches use the edge function for parent-child creation
    if (isRecurring && status !== 'draft' && !this.editingBatchId) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/batch-calls`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            action: 'create',
            ...data,
            status: data.send_now ? 'running' : 'scheduled'
          })
        });
        const result = await resp.json();
        if (!resp.ok) throw new Error(result.error || 'Failed to create recurring batch');
        showToast(`Recurring batch created — first run started`, 'success');
        this.editingBatchId = null;
        this.resetForm();
        this.switchToView('history');
        return;
      } catch (err) {
        console.error('Save recurring batch error:', err);
        showToast('Failed to create recurring batch: ' + err.message, 'error');
        return;
      }
    }

    const batchPayload = {
      user_id: this.userId,
      name: data.name,
      caller_id: data.caller_id,
      agent_id: data.agent_id || null,
      status,
      send_now: data.send_now,
      scheduled_at: data.scheduled_at,
      window_start_time: data.window_start_time,
      window_end_time: data.window_end_time,
      window_days: data.window_days,
      reserved_concurrency: data.reserved_concurrency,
      max_concurrency: data.max_concurrency,
      total_recipients: data.recipients.length
    };

    try {
      let batchId;

      if (this.editingBatchId) {
        // Update existing batch
        const { error } = await supabase
          .from('batch_calls')
          .update(batchPayload)
          .eq('id', this.editingBatchId);
        if (error) throw error;
        batchId = this.editingBatchId;

        // Replace recipients: delete old, insert new
        const { error: delErr } = await supabase
          .from('batch_call_recipients')
          .delete()
          .eq('batch_id', batchId);
        if (delErr) throw delErr;
      } else {
        // Create new batch
        const { data: batch, error } = await supabase
          .from('batch_calls')
          .insert(batchPayload)
          .select()
          .single();
        if (error) throw error;
        batchId = batch.id;
      }

      // Insert recipients
      if (data.recipients.length > 0) {
        const recipientRows = data.recipients.map((r, i) => ({
          batch_id: batchId,
          phone_number: r.phone_number,
          name: r.name,
          sort_order: i
        }));

        const { error: recipErr } = await supabase
          .from('batch_call_recipients')
          .insert(recipientRows);

        if (recipErr) throw recipErr;
      }

      const action = this.editingBatchId ? 'updated' : (status === 'draft' ? 'saved as draft' : `created with ${data.recipients.length} recipients`);
      showToast(`Batch ${action}`, 'success');

      // Reset form state then switch to history view
      this.editingBatchId = null;
      this.resetForm();
      this.switchToView('history');

    } catch (err) {
      console.error('Save batch error:', err);
      showToast('Failed to save batch: ' + err.message, 'error');
    }
  }

  async confirmAndSend() {
    const data = this.getFormData();
    if (!this.validateForm(data)) return;

    const isRecurring = this.recurrenceType !== 'none';
    let message = `This will call ${data.recipients.length} recipients from ${data.caller_id}.`;
    if (isRecurring) {
      message += ` This batch will repeat ${this.recurrenceType} (every ${this.recurrenceInterval}).`;
    }
    message += this.sendNow ? ' Calls will start immediately.' : ` Calls scheduled for ${new Date(data.scheduled_at).toLocaleString()}.`;

    const confirmed = await showConfirmModal({
      title: isRecurring ? 'Start Recurring Batch Calls' : 'Start Batch Calls',
      message,
      confirmText: 'Send',
      confirmStyle: 'primary'
    });
    if (confirmed) this.saveBatch(this.sendNow ? 'running' : 'scheduled');
  }

  async loadBatches() {
    const content = document.getElementById('batch-history-content');
    if (!content) return;

    const { data: batches, error } = await supabase
      .from('batch_calls')
      .select('*')
      .eq('user_id', this.userId)
      .is('parent_batch_id', null) // Hide children from top-level list
      .order('created_at', { ascending: false });

    if (error) {
      content.innerHTML = '<div class="recipients-empty">Error loading batches</div>';
      return;
    }

    this.batches = batches || [];

    if (this.batches.length === 0) {
      content.innerHTML = '<div class="recipients-empty">No batch calls yet. Create your first one!</div>';
      return;
    }

    // Fetch live recipient statuses for active batches
    const activeBatchIds = this.batches.filter(b => b.status === 'running').map(b => b.id);
    const recipientStatusMap = {};
    if (activeBatchIds.length > 0) {
      const { data: recipients } = await supabase
        .from('batch_call_recipients')
        .select('batch_id, status')
        .in('batch_id', activeBatchIds);
      if (recipients) {
        for (const r of recipients) {
          if (!recipientStatusMap[r.batch_id]) recipientStatusMap[r.batch_id] = {};
          recipientStatusMap[r.batch_id][r.status] = (recipientStatusMap[r.batch_id][r.status] || 0) + 1;
        }
      }
    }

    content.innerHTML = `
      <div class="batch-history-list">
        ${this.batches.map(b => {
          const statuses = recipientStatusMap[b.id];
          let liveStatus = '';
          if (statuses) {
            const parts = [];
            if (statuses.calling || statuses.initiated) parts.push(`<span style="color: #f59e0b;">${(statuses.calling || 0) + (statuses.initiated || 0)} initiating</span>`);
            if (statuses.ringing) parts.push(`<span style="color: #3b82f6;">${statuses.ringing} ringing</span>`);
            if (statuses['in-progress'] || statuses.in_progress || statuses.answered) parts.push(`<span style="color: #10b981;">${(statuses['in-progress'] || 0) + (statuses.in_progress || 0) + (statuses.answered || 0)} connected</span>`);
            if (statuses.completed) parts.push(`<span style="color: #10b981;">${statuses.completed} hungup</span>`);
            if (statuses.failed) parts.push(`<span style="color: #ef4444;">${statuses.failed} failed</span>`);
            if (parts.length) liveStatus = parts.join(' &middot; ');
          }
          const isRecurring = b.recurrence_type && b.recurrence_type !== 'none';
          const recurrenceBadge = isRecurring ? `<span class="recurrence-badge">${b.recurrence_type} &middot; ${b.recurrence_run_count || 0} runs</span>` : '';
          return `
          <div class="batch-history-row" data-batch-id="${b.id}">
            <div>
              <div class="batch-history-name">${this.escapeHtml(b.name)} ${recurrenceBadge}</div>
              <div class="batch-history-date">${new Date(b.created_at).toLocaleDateString()} ${new Date(b.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            <span class="batch-status-badge batch-status-${b.status}">${b.status}</span>
            <span class="batch-history-counts">${liveStatus || `${b.completed_count || 0}/${b.total_recipients} completed`}</span>
            <span class="batch-history-counts">${b.failed_count || 0} failed</span>
          </div>`;
        }).join('')}
      </div>
    `;

    // Click handlers for batch rows
    content.querySelectorAll('.batch-history-row').forEach(row => {
      row.addEventListener('click', () => {
        this.viewBatchDetails(row.dataset.batchId);
      });
    });
  }

  async viewBatchDetails(batchId) {
    const batch = this.batches.find(b => b.id === batchId);
    if (!batch) return;

    const isRecurringParent = batch.recurrence_type && batch.recurrence_type !== 'none';

    // For recurring parents, show the runs view instead of recipients
    if (isRecurringParent) {
      return this.viewRecurringBatchDetails(batch);
    }

    // Fetch recipients
    const { data: recipients } = await supabase
      .from('batch_call_recipients')
      .select('*')
      .eq('batch_id', batchId)
      .order('sort_order');

    const modalHtml = `
      <div class="contact-modal-overlay" id="batch-detail-modal" style="display: flex;"
           onclick="if(event.target===this)this.style.display='none'">
        <div class="contact-modal" onclick="event.stopPropagation()" style="max-width: 650px;">
          <div class="contact-modal-header">
            <h3>${this.escapeHtml(batch.name)}</h3>
            <button class="close-modal-btn" onclick="document.getElementById('batch-detail-modal').style.display='none'">&times;</button>
          </div>
          <div class="contact-modal-body scrollable">
            <div style="display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; align-items: center;">
              <span class="batch-status-badge batch-status-${batch.status}" style="font-size: 0.85rem;">${batch.status}</span>
              <span style="font-size: 0.85rem; color: var(--text-secondary);">From: ${batch.caller_id}</span>
              <span style="font-size: 0.85rem; color: var(--text-secondary);">${batch.total_recipients} recipients</span>
            </div>
            ${(recipients || []).map((r, i) => `
              <div data-recipient-id="${r.id}" style="display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0; border-bottom: 1px solid rgba(128,128,128,0.08);">
                <span class="recipient-index">${i + 1}</span>
                <div style="flex: 1; min-width: 0;">
                  <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span style="font-weight: 500;">${this.escapeHtml(r.name || r.phone_number)}</span>
                    <span style="color: var(--text-secondary); font-size: 0.85rem;">${r.phone_number}</span>
                  </div>
                  ${r.error_message ? `<div class="recipient-error" style="font-size: 0.75rem; color: #ef4444; margin-top: 0.2rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(r.error_message)}</div>` : ''}
                </div>
                <span class="recipient-status-badge" style="${this.recipientBadgeStyle(r.status)}">${this.recipientStatusLabel(r.status)}</span>
                ${batch.status !== 'running' && batch.status !== 'draft' ? `<button class="retry-recipient-btn" data-recipient-id="${r.id}" data-phone="${r.phone_number}" style="border: none; background: none; color: var(--primary-color, #6366f1); cursor: pointer; font-size: 0.75rem; font-weight: 500; padding: 0.2rem 0.4rem; border-radius: 6px; white-space: nowrap;" title="Retry this call">Retry</button>` : ''}
              </div>
            `).join('')}
          </div>
          <div class="contact-modal-footer">
            ${batch.status === 'draft' ? `<button class="btn btn-primary" id="send-batch-btn">Send Calls</button>` : ''}
            ${['cancelled', 'failed', 'completed'].includes(batch.status) ? `<button class="btn btn-primary" id="rerun-batch-btn">Re-run All</button>` : ''}
            ${batch.status === 'draft' ? `<button class="btn btn-secondary" id="edit-batch-btn">Edit</button>` : ''}
            ${batch.status === 'running' ? `<button class="btn btn-secondary" id="cancel-batch-btn">Cancel Batch</button>` : ''}
            <button class="btn btn-secondary" onclick="document.getElementById('batch-detail-modal').style.display='none'">Close</button>
          </div>
        </div>
      </div>
    `;

    // Remove existing modal if any
    const existing = document.getElementById('batch-detail-modal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Subscribe to live recipient updates for running batches
    if (batch.status === 'running' || batch.status === 'calling') {
      this.subscribeToRecipientUpdates(batchId);
    }

    // Unsubscribe on modal close
    const modalEl = document.getElementById('batch-detail-modal');
    if (modalEl) {
      const origOnClick = modalEl.getAttribute('onclick') || '';
      modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) {
          if (this.recipientSubscription) { this.recipientSubscription.unsubscribe(); this.recipientSubscription = null; }
        }
      });
      const closeBtn = modalEl.querySelector('.close-modal-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          if (this.recipientSubscription) { this.recipientSubscription.unsubscribe(); this.recipientSubscription = null; }
        });
      }
    }

    // Cancel batch handler
    const cancelBtn = document.getElementById('cancel-batch-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', async () => {
        const confirmed = await showConfirmModal({
          title: 'Cancel Batch',
          message: `Cancel "${batch.name}"? Pending recipients will be skipped.`,
          confirmText: 'Cancel Batch',
          confirmStyle: 'danger'
        });
        if (!confirmed) return;
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/batch-calls`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ action: 'cancel', batch_id: batchId })
          });
          const result = await resp.json();
          if (!resp.ok) throw new Error(result.error || 'Failed to cancel');
          document.getElementById('batch-detail-modal').style.display = 'none';
          if (this.recipientSubscription) { this.recipientSubscription.unsubscribe(); this.recipientSubscription = null; }
          showToast('Batch cancelled', 'info');
          await this.loadBatches();
        } catch (err) {
          showToast('Failed to cancel batch: ' + err.message, 'error');
        }
      });
    }

    // Send batch handler
    const sendBatchBtn = document.getElementById('send-batch-btn');
    if (sendBatchBtn) {
      sendBatchBtn.addEventListener('click', async () => {
        // Hide detail modal so confirm modal is visible above it
        document.getElementById('batch-detail-modal').style.display = 'none';
        if (this.recipientSubscription) { this.recipientSubscription.unsubscribe(); this.recipientSubscription = null; }

        const confirmed = await showConfirmModal({
          title: 'Send Batch Calls',
          message: `Start calling ${batch.total_recipients} recipients from ${batch.caller_id} now?`,
          confirmText: 'Send',
          confirmStyle: 'primary'
        });

        if (confirmed) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/batch-calls`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
              },
              body: JSON.stringify({ action: 'start', batch_id: batchId })
            });
            const result = await resp.json();
            if (!resp.ok) throw new Error(result.error || 'Failed to start batch');
            showToast('Batch calls started', 'success');
            await this.loadBatches();
          } catch (err) {
            showToast('Failed to start batch: ' + err.message, 'error');
          }
        } else {
          // Re-show the detail modal if user cancelled
          document.getElementById('batch-detail-modal').style.display = 'flex';
        }
      });
    }

    // Re-run batch handler
    const rerunBtn = document.getElementById('rerun-batch-btn');
    if (rerunBtn) {
      rerunBtn.addEventListener('click', async () => {
        document.getElementById('batch-detail-modal').style.display = 'none';
        if (this.recipientSubscription) { this.recipientSubscription.unsubscribe(); this.recipientSubscription = null; }

        const confirmed = await showConfirmModal({
          title: 'Re-run Batch',
          message: `Re-run ${batch.total_recipients} recipients from ${batch.caller_id}? Skipped and failed recipients will be retried.`,
          confirmText: 'Re-run',
          confirmStyle: 'primary'
        });

        if (confirmed) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/batch-calls`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
              },
              body: JSON.stringify({ action: 'start', batch_id: batchId })
            });
            const result = await resp.json();
            if (!resp.ok) throw new Error(result.error || 'Failed to re-run batch');
            showToast('Batch re-started', 'success');
            await this.loadBatches();
          } catch (err) {
            showToast('Failed to re-run batch: ' + err.message, 'error');
          }
        } else {
          document.getElementById('batch-detail-modal').style.display = 'flex';
        }
      });
    }

    // Edit batch handler
    const editBtn = document.getElementById('edit-batch-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        document.getElementById('batch-detail-modal').style.display = 'none';
        if (this.recipientSubscription) { this.recipientSubscription.unsubscribe(); this.recipientSubscription = null; }
        this.editBatch(batch, recipients || []);
      });
    }

    // Individual retry handlers
    const modal = document.getElementById('batch-detail-modal');
    if (modal) {
      modal.querySelectorAll('.retry-recipient-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const recipientId = btn.dataset.recipientId;
          btn.textContent = 'Calling...';
          btn.disabled = true;

          try {
            // Reset recipient to pending
            await supabase
              .from('batch_call_recipients')
              .update({ status: 'pending', error_message: null, call_record_id: null, attempted_at: null, completed_at: null })
              .eq('id', recipientId);

            // Ensure batch is running so process-batch-calls will pick it up
            await supabase
              .from('batch_calls')
              .update({ status: 'running', updated_at: new Date().toISOString() })
              .eq('id', batchId);

            // Trigger processing
            const { data: { session } } = await supabase.auth.getSession();
            await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/batch-calls`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
              body: JSON.stringify({ action: 'start', batch_id: batchId })
            });

            // Update UI
            const badge = btn.closest('[data-recipient-id]')?.querySelector('.recipient-status-badge');
            if (badge) { badge.textContent = 'Initiating'; badge.setAttribute('style', this.recipientBadgeStyle('calling')); }
            const errorEl = btn.closest('[data-recipient-id]')?.querySelector('.recipient-error');
            if (errorEl) errorEl.remove();
            btn.textContent = 'Retried';
          } catch (err) {
            btn.textContent = 'Failed';
            showToast('Retry failed: ' + err.message, 'error');
          }
        });
      });
    }
  }

  async viewRecurringBatchDetails(batch) {
    // Fetch child runs
    const { data: runs } = await supabase
      .from('batch_calls')
      .select('id, occurrence_number, status, started_at, completed_at, completed_count, failed_count, total_recipients')
      .eq('parent_batch_id', batch.id)
      .order('occurrence_number', { ascending: false })
      .limit(50);

    const recurrenceLabel = `${batch.recurrence_type}, every ${batch.recurrence_interval || 1}`;
    const endLabel = batch.recurrence_max_runs
      ? `After ${batch.recurrence_max_runs} runs`
      : batch.recurrence_end_date
        ? `Until ${new Date(batch.recurrence_end_date).toLocaleDateString()}`
        : 'Never';

    const modalHtml = `
      <div class="contact-modal-overlay" id="batch-detail-modal" style="display: flex;"
           onclick="if(event.target===this)this.style.display='none'">
        <div class="contact-modal" onclick="event.stopPropagation()" style="max-width: 650px;">
          <div class="contact-modal-header">
            <h3>${this.escapeHtml(batch.name)}</h3>
            <button class="close-modal-btn" onclick="document.getElementById('batch-detail-modal').style.display='none'">&times;</button>
          </div>
          <div class="contact-modal-body scrollable">
            <div style="display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; align-items: center;">
              <span class="batch-status-badge batch-status-${batch.status}" style="font-size: 0.85rem;">${batch.status}</span>
              <span class="recurrence-badge">${this.escapeHtml(recurrenceLabel)}</span>
              <span style="font-size: 0.85rem; color: var(--text-secondary);">From: ${batch.caller_id}</span>
              <span style="font-size: 0.85rem; color: var(--text-secondary);">${batch.total_recipients} recipients</span>
            </div>
            <div style="display: flex; gap: 1rem; margin-bottom: 1rem; font-size: 0.8rem; color: var(--text-secondary);">
              <span>Runs completed: <strong>${batch.recurrence_run_count || 0}</strong>${batch.recurrence_max_runs ? ` / ${batch.recurrence_max_runs}` : ''}</span>
              <span>Ends: ${endLabel}</span>
            </div>

            <div style="font-weight: 600; font-size: 0.9rem; margin-bottom: 0.5rem; color: var(--text-primary);">Runs</div>
            ${(runs || []).length === 0 ? '<div style="color: var(--text-secondary); font-size: 0.85rem; padding: 1rem 0;">No runs yet</div>' : ''}
            <div class="runs-list">
              ${(runs || []).map(r => `
                <div class="run-row" data-run-id="${r.id}">
                  <span class="run-number">#${r.occurrence_number}</span>
                  <div class="run-info">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                      <span class="batch-status-badge batch-status-${r.status}" style="font-size: 0.7rem; padding: 0.1rem 0.4rem;">${r.status}</span>
                      <span class="run-date">${r.started_at ? new Date(r.started_at).toLocaleString() : 'Not started'}</span>
                    </div>
                  </div>
                  <span style="font-size: 0.8rem; color: var(--text-secondary);">${r.completed_count || 0}/${r.total_recipients} completed</span>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="contact-modal-footer">
            ${batch.status === 'recurring' ? `<button class="btn btn-secondary" id="pause-series-btn">Pause Series</button>` : ''}
            ${batch.status === 'paused' ? `<button class="btn btn-primary" id="resume-series-btn">Resume Series</button>` : ''}
            ${['recurring', 'paused'].includes(batch.status) ? `<button class="btn btn-secondary" id="cancel-series-btn" style="color: #ef4444;">Cancel Series</button>` : ''}
            <button class="btn btn-secondary" onclick="document.getElementById('batch-detail-modal').style.display='none'">Close</button>
          </div>
        </div>
      </div>
    `;

    const existing = document.getElementById('batch-detail-modal');
    if (existing) existing.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Click handler for individual runs → show that child's detail
    const modal = document.getElementById('batch-detail-modal');
    if (modal) {
      modal.querySelectorAll('.run-row').forEach(row => {
        row.addEventListener('click', async () => {
          modal.style.display = 'none';
          // Load the child batch as a regular batch detail
          const runId = row.dataset.runId;
          const { data: childBatch } = await supabase
            .from('batch_calls')
            .select('*')
            .eq('id', runId)
            .single();
          if (childBatch) {
            // Temporarily add to batches array for viewBatchDetails
            const existingIdx = this.batches.findIndex(b => b.id === runId);
            if (existingIdx === -1) this.batches.push(childBatch);
            else this.batches[existingIdx] = childBatch;
            await this.viewBatchDetails(runId);
          }
        });
      });
    }

    // Pause Series handler
    const pauseBtn = document.getElementById('pause-series-btn');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/batch-calls`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ action: 'pause_series', batch_id: batch.id })
          });
          const result = await resp.json();
          if (!resp.ok) throw new Error(result.error || 'Failed to pause');
          showToast('Series paused', 'info');
          document.getElementById('batch-detail-modal').style.display = 'none';
          await this.loadBatches();
        } catch (err) {
          showToast('Failed to pause series: ' + err.message, 'error');
        }
      });
    }

    // Resume Series handler
    const resumeBtn = document.getElementById('resume-series-btn');
    if (resumeBtn) {
      resumeBtn.addEventListener('click', async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/batch-calls`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ action: 'resume_series', batch_id: batch.id })
          });
          const result = await resp.json();
          if (!resp.ok) throw new Error(result.error || 'Failed to resume');
          showToast('Series resumed', 'success');
          document.getElementById('batch-detail-modal').style.display = 'none';
          await this.loadBatches();
        } catch (err) {
          showToast('Failed to resume series: ' + err.message, 'error');
        }
      });
    }

    // Cancel Series handler
    const cancelSeriesBtn = document.getElementById('cancel-series-btn');
    if (cancelSeriesBtn) {
      cancelSeriesBtn.addEventListener('click', async () => {
        document.getElementById('batch-detail-modal').style.display = 'none';
        const confirmed = await showConfirmModal({
          title: 'Cancel Recurring Series',
          message: `Cancel "${batch.name}"? This will stop all future runs and cancel any scheduled/running children.`,
          confirmText: 'Cancel Series',
          confirmStyle: 'danger'
        });
        if (confirmed) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/batch-calls`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
              body: JSON.stringify({ action: 'cancel', batch_id: batch.id })
            });
            const result = await resp.json();
            if (!resp.ok) throw new Error(result.error || 'Failed to cancel');
            showToast('Series cancelled', 'info');
            await this.loadBatches();
          } catch (err) {
            showToast('Failed to cancel series: ' + err.message, 'error');
          }
        } else {
          document.getElementById('batch-detail-modal').style.display = 'flex';
        }
      });
    }
  }

  async editBatch(batch, recipients) {
    // Switch to create view without resetting
    this.currentView = 'create';
    this.editingBatchId = batch.id;
    document.querySelectorAll('.batch-tab').forEach(t => t.classList.toggle('active', t.dataset.view === 'create'));
    document.getElementById('batch-create-view').style.display = 'block';
    document.getElementById('batch-history-view').style.display = 'none';
    this.unsubscribeAll();

    // Pre-fill name
    const nameInput = document.getElementById('batch-name');
    if (nameInput) nameInput.value = batch.name || '';

    // Pre-fill agent dropdown and load its numbers
    const agentSelect = document.getElementById('batch-agent-id');
    if (agentSelect && batch.agent_id) {
      agentSelect.value = batch.agent_id;
      await this.loadAgentNumbers(batch.agent_id);
      // Now select the caller number
      const callerSelect = document.getElementById('batch-caller-id');
      if (callerSelect && batch.caller_id) callerSelect.value = batch.caller_id;
    }

    // Pre-fill recipients
    this.recipients = recipients.map((r, i) => ({
      name: r.name || r.phone_number,
      phone_number: r.phone_number,
      sort_order: i,
      _source: 'csv'
    }));
    this.renderRecipients();
    this.updateSendButton();

    // Pre-fill scheduling
    this.sendNow = batch.send_now !== false;
    document.querySelectorAll('.send-toggle-btn').forEach(btn => {
      btn.classList.toggle('active', (btn.dataset.send === 'now') === this.sendNow);
    });
    this.updateSendToggleRadios();
    const picker = document.getElementById('schedule-picker');
    if (picker) picker.classList.toggle('visible', !this.sendNow);
    if (!this.sendNow && batch.scheduled_at) {
      const scheduleInput = document.getElementById('batch-schedule-time');
      if (scheduleInput) scheduleInput.value = new Date(batch.scheduled_at).toISOString().slice(0, 16);
    }

    // Pre-fill call window
    if (batch.window_start_time) {
      const ws = document.getElementById('window-start');
      if (ws) ws.value = batch.window_start_time;
    }
    if (batch.window_end_time) {
      const we = document.getElementById('window-end');
      if (we) we.value = batch.window_end_time;
    }
    if (batch.window_days) {
      this.windowDays = batch.window_days;
      document.querySelectorAll('.day-chip').forEach(chip => {
        chip.classList.toggle('active', this.windowDays.includes(parseInt(chip.dataset.day)));
      });
    }
    this.updateWindowSummary();

    // Pre-fill concurrency
    if (batch.reserved_concurrency != null) {
      this.reservedConcurrency = batch.reserved_concurrency;
      const valueEl = document.getElementById('concurrency-value');
      if (valueEl) valueEl.textContent = this.reservedConcurrency;
      const batchValue = document.getElementById('batch-concurrency-value');
      if (batchValue) batchValue.textContent = Math.min(5, Math.max(0, 20 - this.reservedConcurrency));
    }
  }

  switchToView(view) {
    this.currentView = view;
    document.querySelectorAll('.batch-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
    document.getElementById('batch-create-view').style.display = view === 'create' ? 'block' : 'none';
    document.getElementById('batch-history-view').style.display = view === 'history' ? 'block' : 'none';

    if (view === 'history') {
      this.loadBatches();
      this.subscribeToUpdates();
      this.startPolling();
    } else {
      this.resetForm();
      this.unsubscribeAll();
    }
  }

  resetForm() {
    // Reset instance state
    this.editingBatchId = null;
    this.recipients = [];
    this.sendNow = true;
    this.reservedConcurrency = 5;
    this.windowDays = [1, 2, 3, 4, 5];
    this.recurrenceType = 'none';
    this.recurrenceInterval = 1;
    this.recurrenceEndCondition = 'never';
    this.recurrenceMaxRuns = 10;
    this.recurrenceEndDate = '';

    // Reset DOM
    const nameInput = document.getElementById('batch-name');
    if (nameInput) nameInput.value = '';

    const fileInput = document.getElementById('csv-file-input');
    if (fileInput) fileInput.value = '';

    const dropZone = document.getElementById('csv-drop-zone');
    if (dropZone) {
      dropZone.innerHTML = `
        <div class="upload-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </div>
        <div class="upload-text">Choose a csv or drag & drop it here.</div>
        <div class="upload-hint">Up to 50 MB</div>
      `;
    }

    // Reset Send Now toggle
    document.querySelectorAll('.send-toggle-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.send === 'now');
    });
    this.updateSendToggleRadios();
    const picker = document.getElementById('schedule-picker');
    if (picker) picker.classList.remove('visible');
    const scheduleInput = document.getElementById('batch-schedule-time');
    if (scheduleInput) scheduleInput.value = '';

    // Reset recurrence
    const recurrenceType = document.getElementById('recurrence-type');
    if (recurrenceType) recurrenceType.value = 'none';
    const recurrenceOptions = document.getElementById('recurrence-options');
    if (recurrenceOptions) recurrenceOptions.style.display = 'none';
    const recurrenceInterval = document.getElementById('recurrence-interval');
    if (recurrenceInterval) recurrenceInterval.value = '1';
    const recurrenceEndCondition = document.getElementById('recurrence-end-condition');
    if (recurrenceEndCondition) recurrenceEndCondition.value = 'never';
    const recurrenceEndDetails = document.getElementById('recurrence-end-details');
    if (recurrenceEndDetails) recurrenceEndDetails.innerHTML = '';

    // Reset call window
    const windowStart = document.getElementById('window-start');
    const windowEnd = document.getElementById('window-end');
    if (windowStart) windowStart.value = '00:00';
    if (windowEnd) windowEnd.value = '23:59';
    document.querySelectorAll('.day-chip').forEach(chip => {
      const day = parseInt(chip.dataset.day);
      chip.classList.toggle('active', this.windowDays.includes(day));
    });
    const windowDetails = document.getElementById('window-details');
    if (windowDetails) windowDetails.style.display = 'none';
    this.updateWindowSummary();

    // Reset concurrency
    const valueEl = document.getElementById('concurrency-value');
    if (valueEl) valueEl.textContent = this.reservedConcurrency;
    const batchValue = document.getElementById('batch-concurrency-value');
    if (batchValue) batchValue.textContent = Math.min(5, Math.max(0, 20 - this.reservedConcurrency));

    // Reset recipients panel + send button
    this.renderRecipients();
    this.updateSendButton();
  }

  subscribeToUpdates() {
    // Unsubscribe previous if any
    if (this.subscription) { this.subscription.unsubscribe(); this.subscription = null; }

    this.subscription = supabase
      .channel(`batch-updates-${this.userId}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'batch_calls',
        filter: `user_id=eq.${this.userId}`
      }, () => this.loadBatches())
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setTimeout(() => { if (this.currentView === 'history') this.subscribeToUpdates(); }, 5000);
        }
      });
  }

  subscribeToRecipientUpdates(batchId) {
    if (this.recipientSubscription) { this.recipientSubscription.unsubscribe(); this.recipientSubscription = null; }

    this.recipientSubscription = supabase
      .channel(`batch-recipients-${batchId}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'batch_call_recipients',
        filter: `batch_id=eq.${batchId}`
      }, (payload) => {
        const modal = document.getElementById('batch-detail-modal');
        if (!modal || modal.style.display === 'none') return;
        const row = payload.new;
        if (!row) return;

        const el = modal.querySelector(`[data-recipient-id="${row.id}"]`);
        if (!el) return;

        // Update status badge
        const badge = el.querySelector('.recipient-status-badge');
        if (badge) {
          badge.textContent = this.recipientStatusLabel(row.status);
          badge.setAttribute('style', this.recipientBadgeStyle(row.status));
        }

        // Show/update error message
        let errorEl = el.querySelector('.recipient-error');
        if (row.error_message) {
          if (!errorEl) {
            errorEl = document.createElement('div');
            errorEl.className = 'recipient-error';
            errorEl.style.cssText = 'font-size: 0.75rem; color: #ef4444; margin-top: 0.2rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
            el.querySelector('div')?.appendChild(errorEl);
          }
          errorEl.textContent = row.error_message;
        } else if (errorEl) {
          errorEl.remove();
        }
      })
      .subscribe();
  }

  startPolling() {
    this.stopPolling();
    this.pollInterval = setInterval(() => {
      if (this.currentView !== 'history') { this.stopPolling(); return; }
      const hasActive = this.batches.some(b => b.status === 'running' || b.status === 'scheduled' || b.status === 'recurring');
      if (hasActive) this.loadBatches();
    }, 5000);
  }

  stopPolling() {
    if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
  }

  unsubscribeAll() {
    if (this.subscription) { this.subscription.unsubscribe(); this.subscription = null; }
    if (this.recipientSubscription) { this.recipientSubscription.unsubscribe(); this.recipientSubscription = null; }
    this.stopPolling();
  }

  cleanup() {
    const modal = document.getElementById('batch-detail-modal');
    if (modal) modal.remove();
    this.unsubscribeAll();
  }
}
