import { showToast } from '../../lib/toast.js';
import { reportError } from '../../lib/error-reporter.js';
import { supabase } from '../../lib/supabase.js';
import {
  listSkillDefinitions,
  listAgentSkills,
  enableSkill,
  updateSkillConfig,
  disableSkill,
  testSkill,
  listExecutions,
  cancelExecution,
  createScheduledAction,
  fetchAgentDynamicVariables,
  fetchCrmFields,
  fetchCalEventTypes,
} from '../../lib/skills.js';

// Display names for integration slugs
const INTEGRATION_DISPLAY_NAMES = {
  cal_com: 'Cal.com',
  hubspot: 'HubSpot',
  slack: 'Slack',
  google_email: 'Gmail',
};

const CATEGORY_LABELS = {
  sales: 'Sales',
  support: 'Support',
  operations: 'Operations',
  marketing: 'Marketing',
  research: 'Research',
};

const CATEGORY_COLORS = {
  sales: '#3b82f6',
  support: '#10b981',
  operations: '#f59e0b',
  marketing: '#8b5cf6',
  research: '#06b6d4',
};

const STATUS_BADGES = {
  completed: { color: '#10b981', label: 'Completed' },
  running: { color: '#f59e0b', label: 'Running' },
  pending: { color: '#f59e0b', label: 'Pending' },
  failed: { color: '#ef4444', label: 'Failed' },
  cancelled: { color: '#6b7280', label: 'Cancelled' },
};

export const skillsTabMethods = {
  renderSkillsTab() {
    return `
      <!-- Call Whitelist -->
      <div class="config-section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
          <h3 style="margin: 0;">Call Whitelist</h3>
          <button class="btn btn-sm btn-primary" id="whitelist-add-btn">+ Add Number</button>
        </div>
        <p class="section-desc">Auto-forward calls from specific numbers directly to a phone number — bypasses the AI agent entirely. The call is still recorded and logged.</p>
        <div id="whitelist-list">
          <div style="color: var(--text-secondary); font-size: 0.875rem;">Loading...</div>
        </div>
      </div>

      <!-- Add Whitelist Entry Modal -->
      <div class="contact-modal-overlay" id="whitelist-modal-overlay" style="display: none;"
           onclick="document.getElementById('whitelist-modal-overlay').style.display='none'">
        <div class="contact-modal" onclick="event.stopPropagation()" style="max-width: 480px;">
          <div class="contact-modal-header">
            <h3>Add Whitelist Entry</h3>
            <button class="close-modal-btn" onclick="document.getElementById('whitelist-modal-overlay').style.display='none'">&times;</button>
          </div>
          <form id="whitelist-add-form">
            <div class="contact-modal-body">
              <div class="form-group">
                <label class="form-label">Label <span style="color: var(--text-secondary); font-weight: normal;">(optional)</span></label>
                <input type="text" id="whitelist-label" class="form-input" placeholder="e.g. Kyler's son">
              </div>
              <div class="form-group">
                <label class="form-label">Caller Number <span style="color: var(--danger);">*</span></label>
                <input type="tel" id="whitelist-caller" class="form-input" placeholder="+16045551234" required>
                <span class="form-hint">E.164 format — include country code</span>
              </div>
              <div class="form-group">
                <label class="form-label">Forward To <span style="color: var(--danger);">*</span></label>
                <input type="tel" id="whitelist-forward" class="form-input" placeholder="+16045559876" required>
                <span class="form-hint">Number to ring when this caller calls in</span>
              </div>
            </div>
            <div class="contact-modal-footer">
              <button type="button" class="btn btn-secondary" onclick="document.getElementById('whitelist-modal-overlay').style.display='none'">Cancel</button>
              <button type="submit" class="btn btn-primary" id="whitelist-save-btn">Add</button>
            </div>
          </form>
        </div>
      </div>

      <div class="config-section" style="margin-top: 1.5rem;">
        <h3 style="margin: 0 0 0.25rem;">Agent Skills</h3>
        <p class="section-desc">Enable autonomous skills that run in the background — follow up after calls, monitor competitors, send appointment reminders, and more.</p>

        <div class="skills-category-filters" style="display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;">
          <button class="btn btn-sm skill-filter-btn active" data-category="all">All</button>
          ${Object.entries(CATEGORY_LABELS).map(([key, label]) => `
            <button class="btn btn-sm skill-filter-btn" data-category="${key}">${label}</button>
          `).join('')}
        </div>

        <div id="skills-catalog" class="skills-catalog" style="display: grid; gap: 0.75rem;">
          <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Loading skills...</div>
        </div>
      </div>

      <div class="config-section" style="margin-top: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
          <h3 style="margin: 0;">Execution History</h3>
          <select id="execution-status-filter" class="form-select" style="width: auto; min-width: 130px;">
            <option value="">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
            <option value="running">Running</option>
          </select>
        </div>
        <div id="execution-history" class="aa-table-wrapper">
          <div class="aa-breakdown-empty">Loading...</div>
        </div>
      </div>

      <!-- Skill Config Modal -->
      <div class="contact-modal-overlay" id="skill-config-modal-overlay" style="display: none;"
           onclick="document.getElementById('skill-config-modal-overlay').style.display='none'">
        <div class="contact-modal" onclick="event.stopPropagation()" style="max-width: 560px; max-height: 90vh; display: flex; flex-direction: column;">
          <div class="contact-modal-header">
            <h3 id="skill-config-modal-title">Configure Skill</h3>
            <button class="close-modal-btn" onclick="document.getElementById('skill-config-modal-overlay').style.display='none'">&times;</button>
          </div>
          <div class="contact-modal-body" id="skill-config-modal-body" style="overflow-y: auto; flex: 1;">
          </div>
          <div class="contact-modal-footer">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('skill-config-modal-overlay').style.display='none'">Cancel</button>
            <button type="button" class="btn btn-secondary" id="skill-test-btn">Test</button>
            <button type="button" class="btn btn-primary" id="skill-save-btn">Save</button>
          </div>
        </div>
      </div>
    `;
  },

  async attachSkillsListeners() {
    // Load data
    await this.loadWhitelist();
    await this.loadSkillsCatalog();
    await this.loadExecutionHistory();

    // Handle OAuth return with connect_skill param
    await this.handleSkillConnectReturn();

    // Category filter buttons
    document.querySelectorAll('.skill-filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.skill-filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this.filterSkillsByCategory(e.target.dataset.category);
      });
    });

    // Execution status filter
    const statusFilter = document.getElementById('execution-status-filter');
    if (statusFilter) {
      statusFilter.addEventListener('change', () => this.loadExecutionHistory(statusFilter.value));
    }
  },

  // ── Call Whitelist ──────────────────────────────────────────────────────

  async loadWhitelist() {
    const container = document.getElementById('whitelist-list');
    if (!container) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { container.innerHTML = `<div style="color: var(--danger); font-size: 0.875rem;">Session expired — please refresh.</div>`; return; }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-call-whitelist?agent_id=${this.agent.id}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      const entries = json.entries || [];

      if (entries.length === 0) {
        container.innerHTML = `<div style="color: var(--text-secondary); font-size: 0.875rem; padding: 0.5rem 0;">No whitelist entries yet. Add a number to get started.</div>`;
      } else {
        container.innerHTML = `
          <div style="margin-top: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem;">
            ${entries.map(e => `
              <div style="display: grid; grid-template-columns: repeat(5, 1fr); align-items: center; padding: 0.6rem 0.75rem; background: var(--bg-secondary, #f9fafb); border-radius: 8px; font-size: 0.875rem;">
                <span style="color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${e.label ? this._esc(e.label) : '<span style="color:var(--text-tertiary)">—</span>'}</span>
                <span style="text-align: center; font-family: monospace;">${this._esc(e.caller_number)}</span>
                <span style="display: flex; align-items: center; justify-content: center;"><span style="display: inline-flex; align-items: center; justify-content: center; background: #dcfce7; color: #16a34a; font-size: 0.75rem; font-weight: 700; padding: 0.2rem 0.5rem; border-radius: 4px;">→</span></span>
                <span style="text-align: center; font-family: monospace;">${this._esc(e.forward_to)}</span>
                <span style="display: flex; justify-content: flex-end;"><button class="btn btn-sm whitelist-delete-btn" data-id="${e.id}" onmouseenter="this.style.background='#fee2e2';this.style.color='#dc2626';this.style.borderColor='#fca5a5'" onmouseleave="this.style.background='';this.style.color='';this.style.borderColor=''">Remove</button></span>
              </div>
            `).join('')}
          </div>`;

        container.querySelectorAll('.whitelist-delete-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            this.showConfirmModal({
              title: 'Remove Whitelist Entry',
              message: 'Remove this whitelist entry? Calls from this number will no longer be forwarded automatically.',
              confirmText: 'Remove',
              onConfirm: () => this.deleteWhitelistEntry(btn.dataset.id),
            });
          });
        });
      }

      // Attach add button listener (only once)
      const addBtn = document.getElementById('whitelist-add-btn');
      if (addBtn && !addBtn._whitelistBound) {
        addBtn._whitelistBound = true;
        addBtn.addEventListener('click', () => {
          document.getElementById('whitelist-modal-overlay').style.display = 'flex';
        });
      }

      // Attach form submit
      const form = document.getElementById('whitelist-add-form');
      if (form && !form._whitelistBound) {
        form._whitelistBound = true;
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          await this.addWhitelistEntry();
        });
      }
    } catch (err) {
      console.error('loadWhitelist error:', err);
      container.innerHTML = `<div style="color: var(--danger); font-size: 0.875rem;">Failed to load whitelist.</div>`;
    }
  },

  async addWhitelistEntry() {
    const callerNumber = document.getElementById('whitelist-caller').value.trim();
    const forwardTo = document.getElementById('whitelist-forward').value.trim();
    const label = document.getElementById('whitelist-label').value.trim();
    const saveBtn = document.getElementById('whitelist-save-btn');

    if (!callerNumber || !forwardTo) return;

    const E164_RE = /^\+[1-9]\d{7,14}$/;
    if (!E164_RE.test(callerNumber) || !E164_RE.test(forwardTo)) {
      showToast('Phone numbers must be in E.164 format, e.g. +16045551234', 'error');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Adding...';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { showToast('Session expired — please refresh', 'error'); return; }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-call-whitelist`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: this.agent.id, caller_number: callerNumber, forward_to: forwardTo, label: label || null }),
      });
      const json = await res.json();

      if (!res.ok) {
        showToast(json.error?.message || 'Failed to add entry', 'error');
      } else {
        document.getElementById('whitelist-modal-overlay').style.display = 'none';
        document.getElementById('whitelist-add-form').reset();
        showToast('Whitelist entry added', 'success');
        await this.loadWhitelist();
      }
    } catch (err) {
      showToast('Failed to add entry', 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Add';
    }
  },

  async deleteWhitelistEntry(id) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { showToast('Session expired — please refresh', 'error'); return; }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-call-whitelist?id=${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        showToast('Failed to remove entry', 'error');
        return;
      }
      showToast('Whitelist entry removed', 'success');
      await this.loadWhitelist();
    } catch (err) {
      showToast('Failed to remove entry', 'error');
    }
  },

  _esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  // ── Agent Skills ────────────────────────────────────────────────────────

  async loadSkillsCatalog() {
    try {
      const [allSkills, agentSkills, integrationsResult] = await Promise.all([
        listSkillDefinitions(),
        listAgentSkills(this.agent.id),
        supabase.from('user_integrations')
          .select('provider_id, status, external_user_id, config, integration_providers(slug, name)')
          .eq('user_id', this.userId)
          .eq('status', 'connected'),
      ]);

      this._skillDefinitions = allSkills;
      this._agentSkills = agentSkills;
      this._agentSkillMap = {};
      for (const as of agentSkills) {
        this._agentSkillMap[as.skill_definition_id] = as;
      }
      this._userIntegrations = integrationsResult.data || [];

      this.renderSkillCards();
    } catch (err) {
      console.error('Error loading skills:', err);
      reportError('frontend_js_error', err, 'skills-tab:loadSkillsCatalog');
      const catalog = document.getElementById('skills-catalog');
      if (catalog) catalog.innerHTML = '<div style="color: var(--error); padding: 1rem;">Failed to load skills.</div>';
    }
  },

  renderSkillCards() {
    const catalog = document.getElementById('skills-catalog');
    if (!catalog) return;

    const agentType = this.agent.agent_type;
    const skills = (this._skillDefinitions || []).filter(skill => {
      const typeFilter = skill.agent_type_filter || [];
      return typeFilter.length === 0 || typeFilter.includes(agentType);
    });

    if (skills.length === 0) {
      catalog.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">No skills available for this agent type.</div>';
      return;
    }

    catalog.innerHTML = skills.map(skill => {
      const agentSkill = this._agentSkillMap[skill.id];
      const isEnabled = agentSkill?.is_enabled || false;
      const categoryColor = CATEGORY_COLORS[skill.category] || '#6b7280';

      let statusLine = 'Disabled';
      if (isEnabled && agentSkill) {
        if (agentSkill.trigger_type === 'schedule' && agentSkill.schedule_config?.interval) {
          const sc = agentSkill.schedule_config;
          statusLine = `Enabled — ${sc.interval === 'daily' ? `Daily at ${sc.time || '09:00'}` : sc.interval === 'weekly' ? `Weekly at ${sc.time || '09:00'}` : sc.interval === 'hours' ? `Every ${sc.every || 6} hours` : 'Scheduled'}`;
        } else if (agentSkill.trigger_type === 'event') {
          statusLine = 'Enabled — Triggers on events';
        } else {
          statusLine = 'Enabled';
        }
      }

      // Check required integrations
      const missingIntegrations = (skill.required_integrations || []).filter(
        slug => !this._userIntegrations?.some(ui => ui.integration_providers?.slug === slug && ui.status === 'connected')
      );

      return `
        <div class="skill-card" data-skill-id="${skill.id}" data-category="${skill.category}"
             style="border: 1px solid var(--border); border-radius: 8px; padding: 1rem; display: flex; align-items: flex-start; gap: 0.75rem;">
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
              <span style="font-weight: 600; font-size: 0.95rem;">${skill.name}</span>
              <span style="font-size: 0.7rem; padding: 0.15rem 0.5rem; border-radius: 99px; background: ${categoryColor}15; color: ${categoryColor}; font-weight: 500;">${CATEGORY_LABELS[skill.category] || skill.category}</span>
              ${missingIntegrations.length > 0 ? `<span style="font-size: 0.7rem; padding: 0.15rem 0.5rem; border-radius: 99px; background: #f59e0b15; color: #f59e0b;">Requires ${missingIntegrations.map(s => INTEGRATION_DISPLAY_NAMES[s] || s).join(', ')}</span>` : ''}
            </div>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin: 0 0 0.5rem 0; line-height: 1.4;">${skill.description}</p>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <span style="font-size: 0.8rem; color: ${isEnabled ? 'var(--success, #10b981)' : 'var(--text-tertiary, #999)'};">${statusLine}</span>
              ${isEnabled ? `<button class="btn btn-sm skill-configure-btn" data-skill-id="${skill.id}" style="font-size: 0.8rem;">Configure</button>` : ''}
            </div>
          </div>
          <label class="toggle-switch" style="flex-shrink: 0; margin-top: 0.25rem;">
            <input type="checkbox" class="skill-toggle" data-skill-id="${skill.id}" ${isEnabled ? 'checked' : ''} ${missingIntegrations.length > 0 ? `data-missing-provider="${missingIntegrations[0]}"` : ''} />
            <span class="toggle-slider"></span>
          </label>
        </div>
      `;
    }).join('');

    // Attach card listeners
    catalog.querySelectorAll('.skill-toggle').forEach(toggle => {
      toggle.addEventListener('change', (e) => this.handleSkillToggle(e));
    });
    catalog.querySelectorAll('.skill-configure-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleSkillConfigure(e.target.dataset.skillId));
    });
  },

  filterSkillsByCategory(category) {
    const cards = document.querySelectorAll('.skill-card');
    cards.forEach(card => {
      if (category === 'all' || card.dataset.category === category) {
        card.style.display = '';
      } else {
        card.style.display = 'none';
      }
    });
  },

  async handleSkillToggle(e) {
    const skillId = e.target.dataset.skillId;
    const isEnabled = e.target.checked;
    const missingProvider = e.target.dataset.missingProvider;

    // If toggling on and integration is missing, start OAuth instead
    if (isEnabled && missingProvider) {
      this.startSkillIntegrationOAuth(missingProvider, skillId);
      return;
    }

    try {
      if (isEnabled) {
        const skill = this._skillDefinitions.find(s => s.id === skillId);
        const defaultTrigger = (skill.supported_triggers || [])[0] || 'on_demand';
        // Create/update the row but keep is_enabled false until user saves config
        await enableSkill(this.agent.id, skillId, {
          trigger_type: defaultTrigger,
        });
        await this.loadSkillsCatalog();
        // Open config modal — skill fully enables on save
        this.handleSkillConfigure(skillId);
      } else {
        const agentSkill = this._agentSkillMap[skillId];
        if (agentSkill) {
          await disableSkill(agentSkill.id);
          showToast('Skill disabled', 'success');
        }
        await this.loadSkillsCatalog();
      }
    } catch (err) {
      console.error('Error toggling skill:', err);
      reportError('frontend_js_error', err, 'skills-tab:handleSkillToggle');
      showToast('Failed to update skill', 'error');
      e.target.checked = !isEnabled;
    }
  },

  async handleSkillConfigure(skillDefId) {
    const skill = this._skillDefinitions.find(s => s.id === skillDefId);
    const agentSkill = this._agentSkillMap[skillDefId];
    if (!skill || !agentSkill) return;

    document.getElementById('skill-config-modal-title').textContent = `Configure: ${skill.name}`;

    const schema = skill.config_schema || {};
    const properties = schema.properties || {};
    const currentConfig = agentSkill.config || {};
    const currentTrigger = agentSkill.trigger_type || (skill.supported_triggers || [])[0] || 'on_demand';
    const currentSchedule = agentSkill.schedule_config || {};
    const currentEvent = agentSkill.event_config || {};
    const currentChannels = agentSkill.delivery_channels || [];

    // Detect if this skill has a field_mapping property (CRM mapping)
    const hasFieldMapping = !!properties.field_mapping;

    // Build config fields from schema (skip field_mapping — rendered separately)
    const configFields = Object.entries(properties)
      .filter(([key]) => key !== 'field_mapping')
      .map(([key, prop]) => {
        const value = currentConfig[key] !== undefined ? currentConfig[key] : prop.default;
        const title = prop.title || key;

        if (prop.type === 'boolean') {
          return `
            <label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
              <input type="checkbox" class="skill-config-field" data-key="${key}" ${value ? 'checked' : ''} />
              <span>${title}</span>
            </label>`;
        }
        if (prop.type === 'string' && prop.enum) {
          return `
            <div style="margin-bottom: 0.75rem;">
              <label class="form-label">${title}</label>
              <select class="form-control skill-config-field" data-key="${key}">
                ${prop.enum.map(opt => `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`).join('')}
              </select>
            </div>`;
        }
        if (prop.type === 'number') {
          return `
            <div style="margin-bottom: 0.75rem;">
              <label class="form-label">${title}</label>
              <input type="number" class="form-control skill-config-field" data-key="${key}" value="${value || ''}" />
            </div>`;
        }
        if (prop.type === 'array' && prop.items?.enum) {
          // Array with enum items — render as checkboxes
          const selectedValues = Array.isArray(value) ? value : (prop.default || []);
          const PLATFORM_NAMES = { hackernews: 'Hacker News', x: 'X (Twitter)', linkedin: 'LinkedIn', reddit: 'Reddit', google: 'Google' };
          return `
            <div style="margin-bottom: 0.75rem;">
              <label class="form-label">${title}</label>
              ${prop.items.enum.map(opt => {
                const displayName = PLATFORM_NAMES[opt] || opt.charAt(0).toUpperCase() + opt.slice(1);
                return `
                <label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;">
                  <input type="checkbox" class="skill-enum-array-cb" data-key="${key}" value="${opt}" ${selectedValues.includes(opt) ? 'checked' : ''} />
                  <span>${displayName}</span>
                </label>`;
              }).join('')}
            </div>`;
        }
        if (prop.type === 'array') {
          const arrValue = Array.isArray(value) ? value.join('\n') : '';
          return `
            <div style="margin-bottom: 0.75rem;">
              <label class="form-label">${title} (one per line)</label>
              <textarea class="form-control skill-config-field" data-key="${key}" data-type="array" rows="3" style="resize: vertical;">${arrValue}</textarea>
            </div>`;
        }
        if (prop.type === 'object') {
          const jsonValue = (value && typeof value === 'object') ? JSON.stringify(value, null, 2) : '{}';
          return `
            <div style="margin-bottom: 0.75rem;">
              <label class="form-label">${title}</label>
              <textarea class="form-control skill-config-field" data-key="${key}" data-type="object" rows="4" style="resize: vertical; font-family: monospace; font-size: 0.85rem;">${jsonValue}</textarea>
            </div>`;
        }
        // Default: text/string
        const isLong = key.includes('template') || key.includes('message');
        return `
          <div style="margin-bottom: 0.75rem;">
            <label class="form-label">${title}</label>
            ${isLong
              ? `<textarea class="form-control skill-config-field" data-key="${key}" rows="3" style="resize: vertical;">${value || ''}</textarea>`
              : `<input type="text" class="form-control skill-config-field" data-key="${key}" value="${value || ''}" />`
            }
          </div>`;
      }).join('');

    // Field mapping section (CRM skills only)
    const fieldMappingSection = hasFieldMapping ? `
      <div style="margin-bottom: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <label class="form-label" style="margin: 0;">Field Mapping</label>
          <button type="button" class="btn btn-sm" id="add-field-mapping-btn" style="font-size: 0.8rem;">+ Add Mapping</button>
        </div>
        <div id="field-mapping-rows" style="display: grid; gap: 0.5rem;">
          <div style="text-align: center; padding: 1rem; color: var(--text-secondary); font-size: 0.85rem;" id="field-mapping-empty">
            Loading variables and CRM fields...
          </div>
        </div>
      </div>
    ` : '';

    // Trigger config
    const supportedTriggers = skill.supported_triggers || [];
    const isSingleTrigger = supportedTriggers.length <= 1;
    const isSchedule = currentTrigger === 'schedule';
    const isEvent = currentTrigger === 'event';

    // Show schedule picker for schedule skills (even single-trigger), hide trigger dropdown if single
    const scheduleFields = `
      <div id="schedule-config" style="display: ${isSchedule ? '' : 'none'};">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
          <div>
            <label class="form-label">Interval</label>
            <select class="form-control" id="skill-schedule-interval">
              <option value="daily" ${currentSchedule.interval === 'daily' || !currentSchedule.interval ? 'selected' : ''}>Daily</option>
              <option value="hours" ${currentSchedule.interval === 'hours' ? 'selected' : ''}>Every N hours</option>
              <option value="weekly" ${currentSchedule.interval === 'weekly' ? 'selected' : ''}>Weekly</option>
              <option value="monthly" ${currentSchedule.interval === 'monthly' ? 'selected' : ''}>Monthly</option>
            </select>
          </div>
          <div>
            <label class="form-label">Time</label>
            <input type="time" class="form-control" id="skill-schedule-time" value="${currentSchedule.time || '09:00'}" />
          </div>
        </div>
      </div>`;

    const eventFields = `
      <div id="event-config" style="display: ${isEvent ? '' : 'none'};">
        <div style="margin-bottom: 0.5rem;">
          <label class="form-label">Delay (minutes)</label>
          <input type="number" class="form-control" id="skill-event-delay" value="${currentEvent.delay_minutes || 0}" min="0" />
        </div>
      </div>`;

    let triggerSection;
    if (isSingleTrigger && isEvent) {
      // Single event trigger — hide entirely (e.g. appointment reminder, post-call followup)
      triggerSection = `<input type="hidden" id="skill-trigger-type" value="${currentTrigger}" />`;
    } else if (isSingleTrigger && isSchedule) {
      // Single schedule trigger — show schedule config without trigger dropdown
      triggerSection = `
        <div style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border);">
          <h4 style="margin: 0 0 0.5rem 0; font-size: 0.9rem;">Schedule</h4>
          <input type="hidden" id="skill-trigger-type" value="schedule" />
          ${scheduleFields}
        </div>`;
    } else {
      // Multiple triggers — show full picker
      triggerSection = `
        <div style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border);">
          <h4 style="margin: 0 0 0.5rem 0; font-size: 0.9rem;">Trigger</h4>
          <select class="form-control" id="skill-trigger-type" style="margin-bottom: 0.5rem;">
            ${supportedTriggers.map(t => `<option value="${t}" ${currentTrigger === t ? 'selected' : ''}>${t === 'event' ? 'Event-based' : t === 'schedule' ? 'Scheduled' : 'On-demand'}</option>`).join('')}
          </select>
          ${scheduleFields}
          ${eventFields}
        </div>`;
    }

    // Delivery channels
    const supportedChannels = skill.supported_channels || [];
    const deliverySection = supportedChannels.length > 0 ? `
      <div style="margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border);">
        <h4 style="margin: 0 0 0.5rem 0; font-size: 0.9rem;">Delivery Channels</h4>
        ${supportedChannels.map(ch => {
          const channelConfig = currentChannels.find(c => c.channel === ch) || {};
          const isActive = !!channelConfig.channel;
          const channelLabel = ch === 'sms' ? 'SMS' : ch === 'email' ? 'Email' : ch === 'slack' ? 'Slack' : ch === 'push' ? 'Push Notification' : ch === 'voice_call' ? 'Voice Call' : ch;
          const existingContentConfig = channelConfig.content_config || {};

          let extraFields = '';
          if (ch === 'slack') {
            extraFields = `
              <div class="skill-delivery-extra" data-for="slack" style="margin-left: 1.5rem; margin-bottom: 0.5rem; display: ${isActive ? '' : 'none'};">
                <select class="form-control skill-slack-channel" style="font-size: 0.85rem; margin-top: 0.35rem;">
                  <option value="">Loading channels...</option>
                </select>
              </div>`;
          } else if (ch === 'email') {
            extraFields = `
              <div class="skill-delivery-extra" data-for="email" style="margin-left: 1.5rem; margin-bottom: 0.5rem; display: ${isActive ? '' : 'none'};">
                <input type="email" class="form-control skill-email-to" placeholder="Email address (optional — defaults to account email)" value="${channelConfig.to_email || ''}" style="font-size: 0.85rem; margin-top: 0.35rem;" />
              </div>`;
          }

          const contentConfigHtml = `
            <div class="skill-delivery-content-config" data-for="${ch}" style="margin-left: 1.5rem; display: ${isActive ? '' : 'none'};">
              <details style="margin-top: 0.25rem;">
                <summary style="font-size: 0.78rem; cursor: pointer; color: var(--text-secondary); user-select: none; list-style: none; display: flex; align-items: center; gap: 0.3rem;">
                  <span>▶</span> Customize message
                </summary>
                <div style="padding: 0.35rem 0 0 0.25rem;">
                  <label style="font-size: 0.78rem; color: var(--text-secondary); display: block; margin-bottom: 0.2rem;">Prepend custom text</label>
                  <textarea class="form-control skill-content-custom-text" data-channel="${ch}" rows="2" style="font-size: 0.78rem; resize: vertical;" placeholder="e.g. Daily briefing:">${existingContentConfig.custom_text || ''}</textarea>
                </div>
              </details>
            </div>`;

          return `
            <label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
              <input type="checkbox" class="skill-delivery-channel" data-channel="${ch}" ${isActive ? 'checked' : ''} />
              <span>${channelLabel}</span>
            </label>
            ${extraFields}
            ${contentConfigHtml}`;
        }).join('')}
      </div>
    ` : '';

    // Connected integrations info
    const connectedIntegrations = (skill.required_integrations || [])
      .map(slug => {
        const ui = this._userIntegrations?.find(u => u.integration_providers?.slug === slug && u.status === 'connected');
        if (!ui) return null;
        const name = INTEGRATION_DISPLAY_NAMES[slug] || slug;
        const cfg = ui.config || {};
        const account = cfg.user_name || cfg.hub_domain || cfg.user_email || cfg.gmail_address || ui.external_user_id || '';
        return `<div style="display: flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.6rem; background: var(--success-bg, #10b98115); border-radius: 6px; margin-bottom: 0.25rem;">
          <span style="width: 6px; height: 6px; border-radius: 50%; background: var(--success, #10b981); flex-shrink: 0;"></span>
          <span style="font-size: 0.8rem;">${name} connected${account ? ` — ${account}` : ''}</span>
        </div>`;
      })
      .filter(Boolean)
      .join('');
    const integrationSection = connectedIntegrations ? `
      <div style="margin-bottom: 0.5rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border);">
        ${connectedIntegrations}
      </div>
    ` : '';

    // Event type picker + upcoming appointments (for appointment_reminder skills)
    const selectedEventTypes = currentConfig.event_type_ids || [];
    const appointmentsSection = skill.slug === 'appointment_reminder' ? `
      <div style="margin-bottom: 1rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border);">
        <h4 style="margin: 0 0 0.5rem 0; font-size: 0.9rem;">Event Types</h4>
        <div id="cal-event-types" style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.75rem;">Loading event types...</div>
        <h4 style="margin: 0 0 0.5rem 0; font-size: 0.9rem;">Upcoming Appointments</h4>
        <div id="upcoming-appointments" style="font-size: 0.85rem; color: var(--text-secondary);">Loading from Cal.com...</div>
      </div>
    ` : '';

    document.getElementById('skill-config-modal-body').innerHTML = integrationSection + appointmentsSection + triggerSection + deliverySection + `
      <h4 style="margin: 0 0 0.5rem 0; font-size: 0.9rem;">Parameters</h4>
      ${configFields}
      ${fieldMappingSection}
    `;

    // Show modal
    document.getElementById('skill-config-modal-overlay').style.display = 'flex';

    // Load event types and upcoming appointments preview
    if (skill.slug === 'appointment_reminder' && agentSkill) {
      this.loadCalEventTypes(currentConfig.event_type_ids || [], skill.id);
      this.loadUpcomingAppointments(agentSkill.id);
    }

    // Initialize field mapping UI if present
    if (hasFieldMapping) {
      this.initFieldMappingUI(currentConfig.field_mapping || {});
    }

    // Trigger type change
    document.getElementById('skill-trigger-type')?.addEventListener('change', (e) => {
      document.getElementById('schedule-config').style.display = e.target.value === 'schedule' ? '' : 'none';
      document.getElementById('event-config').style.display = e.target.value === 'event' ? '' : 'none';
    });

    // Toggle delivery channel extra fields + content config + load Slack channels
    document.querySelectorAll('.skill-delivery-channel').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const channel = e.target.dataset.channel;
        const extra = document.querySelector(`.skill-delivery-extra[data-for="${channel}"]`);
        if (extra) extra.style.display = e.target.checked ? '' : 'none';
        const contentConfigDiv = document.querySelector(`.skill-delivery-content-config[data-for="${channel}"]`);
        if (contentConfigDiv) contentConfigDiv.style.display = e.target.checked ? '' : 'none';
      });
    });
    if (supportedChannels.includes('slack')) {
      this.loadSkillSlackChannels(currentChannels.find(c => c.channel === 'slack')?.channel_name || '');
    }

    // Save button
    const saveBtn = document.getElementById('skill-save-btn');
    saveBtn.onclick = async () => {
      try {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        // Collect config values
        const config = {};
        document.querySelectorAll('.skill-config-field').forEach(field => {
          const key = field.dataset.key;
          if (field.type === 'checkbox') {
            config[key] = field.checked;
          } else if (field.dataset.type === 'array') {
            config[key] = field.value.split('\n').map(s => s.trim()).filter(Boolean);
          } else if (field.dataset.type === 'object') {
            try { config[key] = JSON.parse(field.value); } catch { config[key] = {}; }
          } else if (field.type === 'number') {
            config[key] = field.value ? Number(field.value) : null;
          } else {
            config[key] = field.value;
          }
        });

        // Collect field mapping rows
        if (hasFieldMapping) {
          const fieldMapping = {};
          const usedVars = new Set();
          let hasDuplicate = false;
          document.querySelectorAll('.field-mapping-row').forEach(row => {
            const varName = row.querySelector('.fm-variable')?.value;
            const crmField = row.querySelector('.fm-crm-field')?.value;
            if (varName && crmField) {
              if (usedVars.has(varName)) {
                hasDuplicate = true;
              }
              usedVars.add(varName);
              fieldMapping[varName] = crmField;
            }
          });
          if (hasDuplicate) {
            showToast('Duplicate variable mapping found. Each variable can only be mapped once.', 'error');
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
            return;
          }
          config.field_mapping = fieldMapping;
        }

        // Collect enum array checkboxes (e.g. platforms)
        const enumArrayKeys = new Set();
        document.querySelectorAll('.skill-enum-array-cb').forEach(cb => enumArrayKeys.add(cb.dataset.key));
        for (const key of enumArrayKeys) {
          const checked = document.querySelectorAll(`.skill-enum-array-cb[data-key="${key}"]:checked`);
          config[key] = Array.from(checked).map(cb => cb.value);
        }

        // Collect selected Cal.com event types
        const eventTypeCbs = document.querySelectorAll('.cal-event-type-cb:checked');
        if (document.querySelectorAll('.cal-event-type-cb').length > 0) {
          const selectedIds = [];
          eventTypeCbs.forEach(cb => selectedIds.push(Number(cb.dataset.eventId)));
          config.event_type_ids = selectedIds; // empty array = all types
        }

        // Collect trigger config
        const triggerType = document.getElementById('skill-trigger-type').value;
        const scheduleConfig = triggerType === 'schedule' ? {
          interval: document.getElementById('skill-schedule-interval').value,
          time: document.getElementById('skill-schedule-time').value,
        } : {};
        const eventConfig = triggerType === 'event' ? {
          delay_minutes: Number(document.getElementById('skill-event-delay')?.value) || 0,
        } : {};

        // Collect delivery channels
        const deliveryChannels = [];
        document.querySelectorAll('.skill-delivery-channel:checked').forEach(ch => {
          const channel = ch.dataset.channel;
          const entry = { channel, to: 'contact' };
          if (channel === 'slack') {
            const slackSelect = document.querySelector('.skill-slack-channel');
            if (slackSelect?.value) entry.channel_name = slackSelect.value;
          } else if (channel === 'email') {
            const emailInput = document.querySelector('.skill-email-to');
            if (emailInput?.value) entry.to_email = emailInput.value;
          }
          // Collect content_config for this channel
          const customTextEl = document.querySelector(`.skill-content-custom-text[data-channel="${channel}"]`);
          const customText = customTextEl?.value?.trim() || '';
          if (customText) {
            entry.content_config = { custom_text: customText };
          }
          deliveryChannels.push(entry);
        });

        await updateSkillConfig(agentSkill.id, {
          is_enabled: true,
          config,
          trigger_type: triggerType,
          schedule_config: scheduleConfig,
          event_config: eventConfig,
          delivery_channels: deliveryChannels,
        });

        // If schedule trigger, create scheduled action
        if (triggerType === 'schedule' && scheduleConfig.interval) {
          try {
            await createScheduledAction(agentSkill.id, scheduleConfig);
          } catch (schedErr) {
            console.warn('Could not create scheduled action:', schedErr);
          }
        }

        document.getElementById('skill-config-modal-overlay').style.display = 'none';
        showToast('Skill configured successfully', 'success');
        await this.loadSkillsCatalog();
      } catch (err) {
        console.error('Error saving skill config:', err);
        reportError('frontend_js_error', err, 'skills-tab:saveSkillConfig');
        showToast('Failed to save configuration', 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    };

    // Test button
    const testBtn = document.getElementById('skill-test-btn');
    testBtn.onclick = async () => {
      try {
        testBtn.disabled = true;
        testBtn.textContent = 'Testing...';
        const result = await testSkill(agentSkill.id);
        if (result?.result?.preview) {
          showToast('Preview: ' + result.result.preview.substring(0, 200), 'success');
        } else {
          showToast(result?.result?.summary || 'Test completed', 'success');
        }
      } catch (err) {
        console.error('Test error:', err);
        reportError('frontend_js_error', err, 'skills-tab:testSkill');
        showToast('Test failed: ' + (err.message || 'Unknown error'), 'error');
      } finally {
        testBtn.disabled = false;
        testBtn.textContent = 'Test';
      }
    };
  },

  async startSkillIntegrationOAuth(provider, skillDefId) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        showToast('Please log in again', 'error');
        return;
      }

      const redirectPath = `/agents/${this.agent.id}?tab=skills&connect_skill=${skillDefId}`;
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/integration-oauth-start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          provider,
          redirect_path: redirectPath,
        }),
      });

      const result = await response.json();
      if (result.url) {
        window.location.href = result.url;
      } else {
        showToast(result.error || 'Failed to start integration connection', 'error');
      }
    } catch (err) {
      console.error('Error starting integration OAuth:', err);
      reportError('frontend_js_error', err, 'skills-tab:startSkillIntegrationOAuth');
      showToast('Failed to connect integration. Please try again.', 'error');
    }
  },

  async handleSkillConnectReturn() {
    const urlParams = new URLSearchParams(window.location.search);
    const connectSkillId = urlParams.get('connect_skill');

    if (!connectSkillId) return;

    // Clean the URL
    const url = new URL(window.location);
    url.searchParams.delete('connect_skill');
    url.searchParams.delete('integration_connected');
    url.searchParams.delete('cal_connected');
    window.history.replaceState({}, '', url);

    // Check if the skill's integration is now connected
    const skill = this._skillDefinitions?.find(s => s.id === connectSkillId);
    if (!skill) return;

    const missingIntegrations = (skill.required_integrations || []).filter(
      slug => !this._userIntegrations?.some(ui => ui.integration_providers?.slug === slug && ui.status === 'connected')
    );

    if (missingIntegrations.length > 0) {
      // OAuth didn't complete — still missing
      showToast(`Please connect ${missingIntegrations.map(s => INTEGRATION_DISPLAY_NAMES[s] || s).join(', ')} to enable this skill`, 'error');
      return;
    }

    // Integration connected — auto-enable the skill
    try {
      const defaultTrigger = (skill.supported_triggers || [])[0] || 'on_demand';
      await enableSkill(this.agent.id, connectSkillId, { trigger_type: defaultTrigger });
      showToast(`${skill.name} enabled`, 'success');
      await this.loadSkillsCatalog();

      // Open config modal
      setTimeout(() => this.handleSkillConfigure(connectSkillId), 300);
    } catch (err) {
      console.error('Error auto-enabling skill:', err);
      showToast('Integration connected, but could not auto-enable skill', 'error');
    }
  },

  async loadExecutionHistory(statusFilter) {
    const container = document.getElementById('execution-history');
    if (!container) return;

    try {
      const executions = await listExecutions(this.agent.id, {
        status: statusFilter || undefined,
        limit: 50,
      });

      if (executions.length === 0) {
        container.innerHTML = `
          <div class="memory-empty-state">
            <div class="memory-empty-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
              </svg>
            </div>
            <p class="memory-empty-title">No executions yet</p>
            <p class="memory-empty-desc">Enable a skill and it will run automatically. Results will appear here.</p>
          </div>`;
        return;
      }

      container.innerHTML = `
        <table class="aa-calls-table">
          <thead>
            <tr>
              <th>Skill</th>
              <th>Trigger</th>
              <th>Status</th>
              <th>Time</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${executions.map(exec => this.renderExecutionHistoryRow(exec)).join('')}
          </tbody>
        </table>
      `;

      // Store executions for detail modal lookup
      this._executionsCache = executions;

      // Cancel buttons
      container.querySelectorAll('.cancel-execution-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await cancelExecution(e.target.dataset.executionId);
            showToast('Execution cancelled', 'success');
            await this.loadExecutionHistory(statusFilter);
          } catch (err) {
            showToast('Failed to cancel', 'error');
          }
        });
      });

      // Row click → detail modal
      container.querySelectorAll('.execution-row').forEach(row => {
        row.addEventListener('click', () => {
          const execId = row.dataset.executionId;
          const exec = this._executionsCache?.find(e => e.id === execId);
          if (exec) this.showExecutionDetailModal(exec);
        });
      });
    } catch (err) {
      console.error('Error loading executions:', err);
      container.innerHTML = '<div style="color: var(--error);">Failed to load execution history.</div>';
    }
  },

  async loadSkillSlackChannels(selectedChannel) {
    const select = document.querySelector('.skill-slack-channel');
    if (!select) return;

    try {
      // Reuse cache from functions tab if available
      if (!this._slackChannelsCache) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-notification-slack`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: 'list_channels' }),
        });
        const result = await resp.json();
        this._slackChannelsCache = result.channels || [];
      }

      const channels = this._slackChannelsCache;
      select.innerHTML = `
        <option value="">Select channel...</option>
        ${channels.map(ch => `<option value="#${ch.name}" ${selectedChannel === '#' + ch.name ? 'selected' : ''}>#${ch.name}</option>`).join('')}
      `;
    } catch (err) {
      console.error('Error loading Slack channels:', err);
      select.innerHTML = '<option value="">Could not load channels</option>';
    }
  },

  async loadCalEventTypes(selectedIds, skillId) {
    const container = document.getElementById('cal-event-types');
    if (!container) return;

    try {
      const eventTypes = await fetchCalEventTypes();
      if (eventTypes.length === 0) {
        container.innerHTML = '<span style="color: var(--text-tertiary);">No event types found on this Cal.com account.</span>';
        return;
      }

      const allSelected = selectedIds.length === 0; // empty = all types
      container.innerHTML = `
        <p style="margin: 0 0 0.5rem; color: var(--text-secondary); font-size: 0.8rem;">Select which event types trigger reminders. Leave all unchecked to remind for all types.</p>
        ${eventTypes.map(et => {
          const checked = allSelected ? '' : (selectedIds.includes(et.id) ? 'checked' : '');
          return `<label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem;">
            <input type="checkbox" class="cal-event-type-cb" data-event-id="${et.id}" ${checked} />
            <span>${et.title} <span style="color: var(--text-tertiary);">(${et.length} min)</span></span>
          </label>`;
        }).join('')}
      `;
    } catch (err) {
      console.error('Error loading Cal.com event types:', err);
      const isExpired = err.message && (err.message.includes('expired') || err.message.includes('reconnect'));
      if (isExpired) {
        container.innerHTML = `
          <span style="color: var(--text-tertiary); display: block; margin-bottom: 0.5rem;">Cal.com session expired.</span>
          <button id="cal-reconnect-btn" class="btn btn-secondary" style="font-size: 0.8rem;">Reconnect Cal.com</button>
        `;
        document.getElementById('cal-reconnect-btn')?.addEventListener('click', () => {
          this.startSkillIntegrationOAuth('cal_com', skillId);
        });
      } else {
        container.innerHTML = '<span style="color: var(--text-tertiary);">Could not load event types.</span>';
      }
    }
  },

  async loadUpcomingAppointments(agentSkillId) {
    const container = document.getElementById('upcoming-appointments');
    if (!container) return;

    try {
      const result = await testSkill(agentSkillId);
      const preview = result?.result?.preview;
      const reminders = result?.result?.data?.reminders || [];

      if (reminders.length > 0) {
        container.innerHTML = reminders.map(r => `
          <div style="padding: 0.5rem 0.75rem; background: var(--bg-secondary, #f8f9fa); border-radius: 6px; margin-bottom: 0.4rem;">
            <div style="font-weight: 500; color: var(--text-primary);">${r.contact || r.contact_name || 'Unknown'}</div>
            <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.15rem;">${r.message || ''}</div>
          </div>
        `).join('');
      } else if (preview) {
        container.textContent = preview;
      } else {
        const summary = result?.result?.summary || 'No upcoming appointments in the reminder window.';
        container.innerHTML = `<span style="color: var(--text-tertiary);">${summary}</span>`;
      }
    } catch (err) {
      console.error('Error loading upcoming appointments:', err);
      container.innerHTML = '<span style="color: var(--text-tertiary);">Could not load appointments.</span>';
    }
  },

  async initFieldMappingUI(currentMapping) {
    const container = document.getElementById('field-mapping-rows');
    const emptyState = document.getElementById('field-mapping-empty');
    const addBtn = document.getElementById('add-field-mapping-btn');
    if (!container) return;

    // Load dynamic variables and CRM fields in parallel
    let dynamicVars = [];
    let crmFields = [];

    try {
      const [vars, fields] = await Promise.all([
        fetchAgentDynamicVariables(this.agent.id),
        fetchCrmFields().catch(() => []),
      ]);
      dynamicVars = vars;
      crmFields = fields;
    } catch (err) {
      console.error('Error loading field mapping data:', err);
    }

    // Store for row rendering
    this._fieldMappingVars = dynamicVars;
    this._fieldMappingCrmFields = crmFields;

    // Default CRM fields (used when HubSpot properties can't be fetched)
    if (crmFields.length === 0) {
      this._fieldMappingCrmFields = [
        { name: 'firstname', label: 'First Name' },
        { name: 'lastname', label: 'Last Name' },
        { name: 'email', label: 'Email' },
        { name: 'phone', label: 'Phone Number' },
        { name: 'company', label: 'Company Name' },
        { name: 'jobtitle', label: 'Job Title' },
        { name: 'address', label: 'Street Address' },
        { name: 'city', label: 'City' },
        { name: 'state', label: 'State/Region' },
        { name: 'zip', label: 'Postal Code' },
        { name: 'country', label: 'Country' },
        { name: 'website', label: 'Website URL' },
        { name: 'notes', label: 'Notes' },
      ];
    }

    // Render existing mappings
    const mappingEntries = Object.entries(currentMapping);
    if (mappingEntries.length === 0) {
      if (emptyState) {
        emptyState.textContent = dynamicVars.length === 0
          ? 'No extracted variables configured. Add variables in the Functions tab first.'
          : 'Map your extracted variables to CRM fields. Click "+ Add Mapping" to start.';
      }
    } else {
      if (emptyState) emptyState.remove();
      mappingEntries.forEach(([varName, crmField]) => {
        this.addFieldMappingRow(varName, crmField);
      });
    }

    // Add mapping button
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        if (this._fieldMappingVars.length === 0) {
          showToast('No extracted variables configured. Add variables in the Functions tab first.', 'error');
          return;
        }
        const emptyEl = document.getElementById('field-mapping-empty');
        if (emptyEl) emptyEl.remove();
        this.addFieldMappingRow('', '');
      });
    }
  },

  addFieldMappingRow(selectedVar, selectedCrmField) {
    const container = document.getElementById('field-mapping-rows');
    if (!container) return;

    const vars = this._fieldMappingVars || [];
    const crmFields = this._fieldMappingCrmFields || [];

    const row = document.createElement('div');
    row.className = 'field-mapping-row';
    row.style.cssText = 'display: grid; grid-template-columns: 1fr auto 1fr auto; gap: 0.5rem; align-items: center;';

    row.innerHTML = `
      <select class="form-control fm-variable" style="font-size: 0.85rem;">
        <option value="">Select variable...</option>
        ${vars.map(v => `<option value="${v.name}" ${v.name === selectedVar ? 'selected' : ''}>${v.name}${v.description ? ` — ${v.description}` : ''}</option>`).join('')}
      </select>
      <span style="color: var(--text-secondary); font-size: 0.85rem;">→</span>
      <select class="form-control fm-crm-field" style="font-size: 0.85rem;">
        <option value="">Select CRM field...</option>
        ${crmFields.map(f => `<option value="${f.name}" ${f.name === selectedCrmField ? 'selected' : ''}>${f.label} (${f.name})</option>`).join('')}
      </select>
      <button type="button" class="btn btn-sm fm-remove-btn" style="padding: 0.25rem 0.5rem; color: var(--error, #ef4444); font-size: 1rem; line-height: 1;" title="Remove mapping">&times;</button>
    `;

    container.appendChild(row);

    row.querySelector('.fm-remove-btn').addEventListener('click', () => {
      row.remove();
      // Show empty state if no rows left
      const remaining = container.querySelectorAll('.field-mapping-row');
      if (remaining.length === 0) {
        const empty = document.createElement('div');
        empty.id = 'field-mapping-empty';
        empty.style.cssText = 'text-align: center; padding: 1rem; color: var(--text-secondary); font-size: 0.85rem;';
        empty.textContent = 'Map your extracted variables to CRM fields. Click "+ Add Mapping" to start.';
        container.appendChild(empty);
      }
    });
  },

  showExecutionDetailModal(exec) {
    const badge = STATUS_BADGES[exec.status] || { color: '#6b7280', label: exec.status };
    const skillName = exec.skill_definitions?.name || 'Unknown Skill';
    const time = new Date(exec.created_at).toLocaleString();
    const duration = exec.execution_time_ms ? `${(exec.execution_time_ms / 1000).toFixed(1)}s` : '—';
    const result = exec.result || {};
    const summary = result.summary || '—';
    const deliveries = exec.deliveries || [];

    // Format result data (exclude snapshots which are huge)
    const resultData = result.data ? { ...result.data } : null;
    if (resultData?.snapshots) {
      resultData.snapshots = `[${Object.keys(resultData.snapshots).length} URL snapshot(s)]`;
    }

    const escapeHtml = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // Convert markdown-like summary to rich HTML
    const formatSummary = (text) => {
      return escapeHtml(text)
        // --- dividers → <hr>
        .replace(/\n---\n/g, '<hr style="border: none; border-top: 1px solid var(--border, #e5e7eb); margin: 1rem 0;">')
        // **bold** → <strong>
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // *bold* → <strong> (single asterisk)
        .replace(/\*(.+?)\*/g, '<strong>$1</strong>')
        // URLs → clickable links
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color: var(--primary, #6366f1); text-decoration: none; word-break: break-all;">$1</a>')
        // • bullet lines → styled list items
        .replace(/^• (.+)$/gm, '<div style="display: flex; gap: 0.4rem; padding: 0.15rem 0;"><span style="flex-shrink: 0;">•</span><span>$1</span></div>')
        // - bullet lines → styled list items
        .replace(/^- (.+)$/gm, '<div style="display: flex; gap: 0.4rem; padding: 0.15rem 0;"><span style="flex-shrink: 0;">•</span><span>$1</span></div>')
        // Platform headers with emoji → styled headers
        .replace(/^(📡|📋|📰|🔴|🟡|🟢|⚠️) (.+)$/gm, '<div style="font-weight: 600; margin-top: 0.75rem; margin-bottom: 0.25rem;">$1 $2</div>')
        // Remaining newlines → <br>
        .replace(/\n/g, '<br>');
    };

    // Remove existing modal if any
    document.getElementById('execution-detail-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'execution-detail-overlay';
    overlay.className = 'contact-modal-overlay';
    overlay.style.display = 'flex';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML = `
      <div class="contact-modal" onclick="event.stopPropagation()" style="max-width: 600px;">
        <div class="contact-modal-header">
          <h3>${escapeHtml(skillName)} — Execution</h3>
          <button class="close-modal-btn" onclick="document.getElementById('execution-detail-overlay').remove()">&times;</button>
        </div>
        <div class="contact-modal-body" style="max-height: 70vh; overflow-y: auto;">
          <div style="display: grid; grid-template-columns: auto 1fr; gap: 0.5rem 1rem; margin-bottom: 1rem;">
            <span style="color: var(--text-secondary); font-size: 0.85rem;">Status</span>
            <span style="display: inline-flex; align-items: center; gap: 0.35rem;">
              <span style="width: 7px; height: 7px; border-radius: 50%; background: ${badge.color};"></span>
              ${badge.label}
            </span>
            <span style="color: var(--text-secondary); font-size: 0.85rem;">Trigger</span>
            <span>${exec.trigger_type}</span>
            <span style="color: var(--text-secondary); font-size: 0.85rem;">Time</span>
            <span>${time}</span>
            <span style="color: var(--text-secondary); font-size: 0.85rem;">Duration</span>
            <span>${duration}</span>
          </div>

          ${exec.error_message ? `
            <div style="background: var(--error-bg, #fef2f2); border: 1px solid var(--error-border, #fecaca); border-radius: 8px; padding: 0.75rem; margin-bottom: 1rem;">
              <div style="font-weight: 600; font-size: 0.85rem; color: var(--error-color, #ef4444); margin-bottom: 0.25rem;">Error</div>
              <div style="font-size: 0.85rem; white-space: pre-wrap;">${escapeHtml(exec.error_message)}</div>
            </div>
          ` : ''}

          <div style="margin-bottom: 1rem;">
            <div style="font-weight: 600; font-size: 0.85rem; margin-bottom: 0.5rem;">Summary</div>
            <div style="font-size: 0.85rem; background: var(--bg-secondary, #f9fafb); border-radius: 8px; padding: 0.75rem; line-height: 1.6;">${formatSummary(summary)}</div>
          </div>

          ${deliveries.length > 0 ? `
            <div style="margin-bottom: 1rem;">
              <div style="font-weight: 600; font-size: 0.85rem; margin-bottom: 0.5rem;">Deliveries</div>
              ${deliveries.map(d => `
                <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; padding: 0.35rem 0;">
                  <span style="width: 7px; height: 7px; border-radius: 50%; background: ${d.status === 'sent' ? '#22c55e' : d.status === 'failed' ? '#ef4444' : '#f59e0b'};"></span>
                  <span>${d.channel}${d.to ? ` → ${escapeHtml(d.to)}` : ''}</span>
                  <span style="color: var(--text-secondary);">${d.status}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}

          ${resultData ? `
            <div>
              <div style="font-weight: 600; font-size: 0.85rem; margin-bottom: 0.5rem;">Data</div>
              <pre style="font-size: 0.8rem; background: var(--bg-secondary, #f9fafb); border-radius: 8px; padding: 0.75rem; overflow-x: auto; white-space: pre-wrap; word-break: break-word; max-height: 300px; overflow-y: auto;">${escapeHtml(JSON.stringify(resultData, null, 2))}</pre>
            </div>
          ` : ''}
        </div>
        <div class="contact-modal-footer">
          <button type="button" class="btn btn-secondary" onclick="document.getElementById('execution-detail-overlay').remove()">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
  },

  renderExecutionHistoryRow(exec) {
    const badge = STATUS_BADGES[exec.status] || { color: '#6b7280', label: exec.status };
    const skillName = exec.skill_definitions?.name || 'Unknown Skill';
    const time = new Date(exec.created_at).toLocaleString();
    const duration = exec.execution_time_ms ? `${(exec.execution_time_ms / 1000).toFixed(1)}s` : '';

    return `
      <tr class="execution-row" data-execution-id="${exec.id}" style="cursor: pointer;">
        <td>${skillName}</td>
        <td><span class="direction-badge ${exec.trigger_type === 'event' ? 'inbound' : 'outbound'}">${exec.trigger_type}</span></td>
        <td>
          <span style="display: inline-flex; align-items: center; gap: 0.35rem;">
            <span style="width: 7px; height: 7px; border-radius: 50%; background: ${badge.color}; flex-shrink: 0;"></span>
            ${badge.label}
          </span>
          ${exec.error_message ? `<div style="font-size: 0.75rem; color: var(--error-color, #ef4444); margin-top: 0.15rem; white-space: normal;">${exec.error_message}</div>` : ''}
        </td>
        <td>
          ${time}${duration ? ` <span style="color: var(--text-secondary); font-size: 0.75rem;">(${duration})</span>` : ''}
        </td>
        <td style="text-align: right;">
          ${exec.status === 'pending' ? `<button class="btn btn-sm cancel-execution-btn" data-execution-id="${exec.id}">Cancel</button>` : ''}
        </td>
      </tr>
    `;
  },
};
