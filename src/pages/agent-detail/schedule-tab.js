export const scheduleTabMethods = {
  renderScheduleTab() {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const dayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    // Default when no schedule saved = always available (all days unchecked)
    // User enables specific days to RESTRICT availability
    const defaultSchedule = {
      monday: { enabled: false, start: '09:00', end: '17:00' },
      tuesday: { enabled: false, start: '09:00', end: '17:00' },
      wednesday: { enabled: false, start: '09:00', end: '17:00' },
      thursday: { enabled: false, start: '09:00', end: '17:00' },
      friday: { enabled: false, start: '09:00', end: '17:00' },
      saturday: { enabled: false, start: '09:00', end: '17:00' },
      sunday: { enabled: false, start: '09:00', end: '17:00' },
    };

    const callsSchedule = this.agent.calls_schedule || null;
    const textsSchedule = this.agent.texts_schedule || null;
    const timezone = this.agent.schedule_timezone || 'America/Los_Angeles';

    const renderDayRow = (day, label, schedule, prefix) => {
      const daySchedule = schedule ? schedule[day] : defaultSchedule[day];
      const enabled = daySchedule?.enabled ?? defaultSchedule[day].enabled;
      const start = daySchedule?.start || defaultSchedule[day].start;
      const end = daySchedule?.end || defaultSchedule[day].end;

      return `
        <div class="schedule-day-row ${!enabled ? 'disabled' : ''}">
          <label class="schedule-day-toggle">
            <input type="checkbox" id="${prefix}-${day}-enabled" ${enabled ? 'checked' : ''} />
            <span class="schedule-day-name">${label}</span>
          </label>
          <div class="schedule-time-inputs">
            <input type="time" id="${prefix}-${day}-start" class="schedule-time-input" value="${start}" ${!enabled ? 'disabled' : ''} />
            <span class="schedule-time-separator">to</span>
            <input type="time" id="${prefix}-${day}-end" class="schedule-time-input" value="${end}" ${!enabled ? 'disabled' : ''} />
            <button type="button" class="btn-apply-time" data-prefix="${prefix}" data-day="${day}" title="Apply this time to all days">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    };

    const timezones = [
      { value: 'America/Los_Angeles', label: 'Pacific Time (Los Angeles)' },
      { value: 'America/Denver', label: 'Mountain Time (Denver)' },
      { value: 'America/Chicago', label: 'Central Time (Chicago)' },
      { value: 'America/New_York', label: 'Eastern Time (New York)' },
      { value: 'America/Anchorage', label: 'Alaska Time (Anchorage)' },
      { value: 'Pacific/Honolulu', label: 'Hawaii Time (Honolulu)' },
      { value: 'America/Phoenix', label: 'Arizona Time (Phoenix)' },
      { value: 'America/Toronto', label: 'Eastern Time (Toronto)' },
      { value: 'America/Vancouver', label: 'Pacific Time (Vancouver)' },
      { value: 'Europe/London', label: 'GMT (London)' },
      { value: 'Europe/Paris', label: 'CET (Paris)' },
      { value: 'Asia/Tokyo', label: 'JST (Tokyo)' },
      { value: 'Australia/Sydney', label: 'AEST (Sydney)' },
    ];

    return `
      <div class="config-section">
        <h3>Schedule Settings</h3>
        <p class="section-desc">Set when your agent handles calls and texts. Leave empty to always be available.</p>

        <div class="form-group">
          <label class="form-label">Timezone</label>
          <select id="schedule-timezone" class="form-select">
            ${timezones.map(tz => `
              <option value="${tz.value}" ${timezone === tz.value ? 'selected' : ''}>${tz.label}</option>
            `).join('')}
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" for="after-hours-call-forwarding">After-Hours Call Forwarding</label>
          <input type="tel" id="after-hours-call-forwarding" class="form-input"
            placeholder="+1 (555) 123-4567"
            value="${this.agent.after_hours_call_forwarding || ''}" />
          <p class="form-help">Forward calls to this number outside scheduled hours. Leave empty to take a message instead.</p>
        </div>

        <div class="form-group">
          <label class="form-label" for="after-hours-sms-forwarding">After-Hours SMS Forwarding</label>
          <input type="tel" id="after-hours-sms-forwarding" class="form-input"
            placeholder="+1 (555) 123-4567"
            value="${this.agent.after_hours_sms_forwarding || ''}" />
          <p class="form-help">Forward texts to this number outside scheduled hours. Leave empty to auto-reply.</p>
        </div>
      </div>

      <div class="config-section">
        <div class="schedule-section-header">
          <h3>Calls Schedule</h3>
          <button type="button" class="btn btn-sm btn-secondary" id="apply-calls-to-all">Apply to All Days</button>
        </div>
        <p class="section-desc">When your agent will answer phone calls.</p>

        ${!callsSchedule ? `
        <div class="schedule-status-banner schedule-status-24-7">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span><strong>Always Available</strong> - No schedule restrictions. Toggle days below to set specific hours.</span>
        </div>
        ` : `
        <div class="schedule-status-banner schedule-status-active">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <span><strong>Schedule Active</strong> - Calls outside these hours will be handled by your agent.</span>
        </div>
        `}

        <div class="schedule-grid" id="calls-schedule-grid">
          ${days.map((day, i) => renderDayRow(day, dayLabels[i], callsSchedule, 'calls')).join('')}
        </div>

        <div class="schedule-clear-row">
          <button type="button" class="btn btn-sm btn-secondary" id="clear-calls-schedule">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Clear Schedule (Always Available)
          </button>
        </div>
      </div>

      <div class="config-section">
        <div class="schedule-section-header">
          <h3>Texts Schedule</h3>
          <button type="button" class="btn btn-sm btn-secondary" id="apply-texts-to-all">Apply to All Days</button>
        </div>
        <p class="section-desc">When your agent will respond to text messages.</p>

        ${!textsSchedule ? `
        <div class="schedule-status-banner schedule-status-24-7">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <span><strong>Always Available</strong> - No schedule restrictions. Toggle days below to set specific hours.</span>
        </div>
        ` : `
        <div class="schedule-status-banner schedule-status-active">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          <span><strong>Schedule Active</strong> - Texts outside these hours will be handled by your agent.</span>
        </div>
        `}

        <div class="schedule-grid" id="texts-schedule-grid">
          ${days.map((day, i) => renderDayRow(day, dayLabels[i], textsSchedule, 'texts')).join('')}
        </div>

        <div class="schedule-clear-row">
          <button type="button" class="btn btn-sm btn-secondary" id="clear-texts-schedule">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Clear Schedule (Always Available)
          </button>
        </div>
      </div>
    `;
  },

  formatPhoneNumber(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  },

  attachScheduleTabListeners() {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    // Timezone dropdown
    const timezoneSelect = document.getElementById('schedule-timezone');
    if (timezoneSelect) {
      timezoneSelect.addEventListener('change', () => {
        this.scheduleAutoSave({ schedule_timezone: timezoneSelect.value });
      });
    }

    // Helper to build schedule object from form
    const buildSchedule = (prefix) => {
      const schedule = {};
      days.forEach(day => {
        const enabledCheckbox = document.getElementById(`${prefix}-${day}-enabled`);
        const startInput = document.getElementById(`${prefix}-${day}-start`);
        const endInput = document.getElementById(`${prefix}-${day}-end`);
        schedule[day] = {
          enabled: enabledCheckbox?.checked ?? false,
          start: startInput?.value || '09:00',
          end: endInput?.value || '17:00',
        };
      });
      return schedule;
    };

    // Helper to save schedule - if no days enabled, save null (always available)
    const saveCallsSchedule = () => {
      const schedule = buildSchedule('calls');
      const hasEnabledDays = Object.values(schedule).some(day => day.enabled);
      const scheduleToSave = hasEnabledDays ? schedule : null;
      this.agent.calls_schedule = scheduleToSave;
      this.scheduleAutoSave({ calls_schedule: scheduleToSave });
    };

    const saveTextsSchedule = () => {
      const schedule = buildSchedule('texts');
      const hasEnabledDays = Object.values(schedule).some(day => day.enabled);
      const scheduleToSave = hasEnabledDays ? schedule : null;
      this.agent.texts_schedule = scheduleToSave;
      this.scheduleAutoSave({ texts_schedule: scheduleToSave });
    };

    // Attach listeners for calls schedule
    days.forEach(day => {
      const enabledCheckbox = document.getElementById(`calls-${day}-enabled`);
      const startInput = document.getElementById(`calls-${day}-start`);
      const endInput = document.getElementById(`calls-${day}-end`);
      const row = enabledCheckbox?.closest('.schedule-day-row');

      if (enabledCheckbox) {
        enabledCheckbox.addEventListener('change', () => {
          const enabled = enabledCheckbox.checked;
          if (startInput) startInput.disabled = !enabled;
          if (endInput) endInput.disabled = !enabled;
          if (row) row.classList.toggle('disabled', !enabled);
          saveCallsSchedule();
        });
      }
      if (startInput) startInput.addEventListener('change', saveCallsSchedule);
      if (endInput) endInput.addEventListener('change', saveCallsSchedule);
    });

    // Attach listeners for texts schedule
    days.forEach(day => {
      const enabledCheckbox = document.getElementById(`texts-${day}-enabled`);
      const startInput = document.getElementById(`texts-${day}-start`);
      const endInput = document.getElementById(`texts-${day}-end`);
      const row = enabledCheckbox?.closest('.schedule-day-row');

      if (enabledCheckbox) {
        enabledCheckbox.addEventListener('change', () => {
          const enabled = enabledCheckbox.checked;
          if (startInput) startInput.disabled = !enabled;
          if (endInput) endInput.disabled = !enabled;
          if (row) row.classList.toggle('disabled', !enabled);
          saveTextsSchedule();
        });
      }
      if (startInput) startInput.addEventListener('change', saveTextsSchedule);
      if (endInput) endInput.addEventListener('change', saveTextsSchedule);
    });

    // Apply to all days buttons
    const applyCallsBtn = document.getElementById('apply-calls-to-all');
    if (applyCallsBtn) {
      applyCallsBtn.addEventListener('click', () => {
        // Get values from the first day (Monday)
        const mondayEnabled = document.getElementById('calls-monday-enabled')?.checked ?? true;
        const mondayStart = document.getElementById('calls-monday-start')?.value || '09:00';
        const mondayEnd = document.getElementById('calls-monday-end')?.value || '17:00';

        days.forEach(day => {
          const enabledCheckbox = document.getElementById(`calls-${day}-enabled`);
          const startInput = document.getElementById(`calls-${day}-start`);
          const endInput = document.getElementById(`calls-${day}-end`);
          const row = enabledCheckbox?.closest('.schedule-day-row');

          if (enabledCheckbox) enabledCheckbox.checked = mondayEnabled;
          if (startInput) {
            startInput.value = mondayStart;
            startInput.disabled = !mondayEnabled;
          }
          if (endInput) {
            endInput.value = mondayEnd;
            endInput.disabled = !mondayEnabled;
          }
          if (row) row.classList.toggle('disabled', !mondayEnabled);
        });

        saveCallsSchedule();
      });
    }

    const applyTextsBtn = document.getElementById('apply-texts-to-all');
    if (applyTextsBtn) {
      applyTextsBtn.addEventListener('click', () => {
        // Get values from the first day (Monday)
        const mondayEnabled = document.getElementById('texts-monday-enabled')?.checked ?? true;
        const mondayStart = document.getElementById('texts-monday-start')?.value || '09:00';
        const mondayEnd = document.getElementById('texts-monday-end')?.value || '17:00';

        days.forEach(day => {
          const enabledCheckbox = document.getElementById(`texts-${day}-enabled`);
          const startInput = document.getElementById(`texts-${day}-start`);
          const endInput = document.getElementById(`texts-${day}-end`);
          const row = enabledCheckbox?.closest('.schedule-day-row');

          if (enabledCheckbox) enabledCheckbox.checked = mondayEnabled;
          if (startInput) {
            startInput.value = mondayStart;
            startInput.disabled = !mondayEnabled;
          }
          if (endInput) {
            endInput.value = mondayEnd;
            endInput.disabled = !mondayEnabled;
          }
          if (row) row.classList.toggle('disabled', !mondayEnabled);
        });

        saveTextsSchedule();
      });
    }

    // Clear schedule buttons
    const clearCallsBtn = document.getElementById('clear-calls-schedule');
    if (clearCallsBtn) {
      clearCallsBtn.addEventListener('click', () => {
        this.agent.calls_schedule = null;
        this.scheduleAutoSave({ calls_schedule: null });
        // Re-render to show default state
        this.switchTab('schedule');
      });
    }

    const clearTextsBtn = document.getElementById('clear-texts-schedule');
    if (clearTextsBtn) {
      clearTextsBtn.addEventListener('click', () => {
        this.agent.texts_schedule = null;
        this.scheduleAutoSave({ texts_schedule: null });
        // Re-render to show default state
        this.switchTab('schedule');
      });
    }

    // Apply time to all buttons (per-row)
    document.querySelectorAll('.btn-apply-time').forEach(btn => {
      btn.addEventListener('click', () => {
        const prefix = btn.dataset.prefix; // 'calls' or 'texts'
        const sourceDay = btn.dataset.day;
        const dayLabel = sourceDay.charAt(0).toUpperCase() + sourceDay.slice(1);

        // Get the source row's times
        const sourceStart = document.getElementById(`${prefix}-${sourceDay}-start`)?.value;
        const sourceEnd = document.getElementById(`${prefix}-${sourceDay}-end`)?.value;

        if (!sourceStart || !sourceEnd) return;

        // Format times for display
        const formatTime = (t) => {
          const [h, m] = t.split(':');
          const hour = parseInt(h);
          const ampm = hour >= 12 ? 'PM' : 'AM';
          const hour12 = hour % 12 || 12;
          return `${hour12}:${m} ${ampm}`;
        };

        const scheduleType = prefix === 'calls' ? 'Calls' : 'Texts';

        // Show custom confirmation modal
        this.showConfirmModal({
          title: 'Apply to All Days',
          message: `Apply <strong>${dayLabel}'s</strong> hours <strong>(${formatTime(sourceStart)} - ${formatTime(sourceEnd)})</strong> to all enabled days for <strong>${scheduleType}</strong>?`,
          confirmText: 'Apply',
          onConfirm: () => {
            // Apply to all days
            days.forEach(day => {
              const startInput = document.getElementById(`${prefix}-${day}-start`);
              const endInput = document.getElementById(`${prefix}-${day}-end`);

              if (startInput && !startInput.disabled) startInput.value = sourceStart;
              if (endInput && !endInput.disabled) endInput.value = sourceEnd;
            });

            // Save the schedule
            if (prefix === 'calls') {
              saveCallsSchedule();
            } else {
              saveTextsSchedule();
            }
          }
        });
      });
    });

    // After-hours forwarding number inputs
    const callForwardingInput = document.getElementById('after-hours-call-forwarding');
    if (callForwardingInput) {
      callForwardingInput.addEventListener('change', () => {
        const value = callForwardingInput.value.trim() || null;
        this.updateAgentField('after_hours_call_forwarding', value);
      });
    }

    const smsForwardingInput = document.getElementById('after-hours-sms-forwarding');
    if (smsForwardingInput) {
      smsForwardingInput.addEventListener('change', () => {
        const value = smsForwardingInput.value.trim() || null;
        this.updateAgentField('after_hours_sms_forwarding', value);
      });
    }
  }
};
