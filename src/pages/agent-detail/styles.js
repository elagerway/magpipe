export const stylesMethods = {
  addStyles() {
    if (document.getElementById('agent-detail-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'agent-detail-styles';
    styles.textContent = `
      .agent-back-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1rem;
      }

      .mobile-toggle.agent-status-toggle {
        display: none;
      }

      .desktop-toggle.agent-detail-actions {
        display: block;
      }

      /* Small toggle for mobile */
      .toggle-switch-sm {
        position: relative;
        display: inline-block;
        width: 36px;
        height: 20px;
        flex-shrink: 0;
      }

      .toggle-switch-sm input {
        opacity: 0;
        width: 0;
        height: 0;
      }

      .toggle-slider-sm {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: var(--border-color);
        transition: 0.3s;
        border-radius: 20px;
      }

      .toggle-slider-sm:before {
        position: absolute;
        content: "";
        height: 14px;
        width: 14px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        transition: 0.3s;
        border-radius: 50%;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      }

      .toggle-switch-sm input:checked + .toggle-slider-sm {
        background-color: var(--primary-color);
      }

      .toggle-switch-sm input:checked + .toggle-slider-sm:before {
        transform: translateX(16px);
      }

      .mobile-toggle .status-label {
        font-size: 0.75rem;
      }

      .agent-detail-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 1.5rem;
        flex-wrap: wrap;
      }

      .back-btn {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        background: none;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        padding: 0.5rem;
        margin-left: -0.5rem;
        font-size: 0.9rem;
        transition: color 0.2s;
      }

      .back-btn:hover {
        color: var(--primary-color);
      }

      .agent-status-toggle {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .agent-status-toggle .status-label {
        font-size: 0.875rem;
        font-weight: 500;
      }

      .agent-status-toggle .status-label.active {
        color: var(--success-color, #22c55e);
      }

      .agent-status-toggle .status-label.inactive {
        color: var(--text-secondary);
      }

      .agent-detail-title {
        display: flex;
        align-items: center;
        gap: 1rem;
        flex: 1;
      }

      .agent-detail-avatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 600;
        font-size: 1rem;
        overflow: hidden;
        flex-shrink: 0;
      }

      .agent-detail-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .agent-name-input {
        font-size: 1.25rem;
        font-weight: 600;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        background: transparent;
        padding: 0.25rem 0.5rem;
        width: 100%;
        max-width: 300px;
        transition: border-color 0.2s, background-color 0.2s;
      }

      .agent-name-input:hover {
        background: var(--bg-secondary);
      }

      .agent-name-input:focus {
        outline: none;
        border-color: var(--primary-color);
        background: white;
      }

      .agent-detail-meta {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-top: 0.25rem;
      }

      .agent-id {
        font-size: 0.75rem;
        color: var(--text-tertiary);
        cursor: pointer;
      }

      .agent-id:hover {
        color: var(--primary-color);
      }

      .default-badge {
        background: var(--primary-color);
        color: white;
        font-size: 0.65rem;
        font-weight: 600;
        padding: 0.15rem 0.4rem;
        border-radius: var(--radius-sm);
        text-transform: uppercase;
      }

      .agent-tabs-container {
        position: relative;
        margin-bottom: 1.5rem;
      }

      .agent-tabs {
        display: flex;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }

      .agent-tabs::-webkit-scrollbar {
        display: none;
      }

      /* Mobile tab dropdown */
      .tab-select-wrapper {
        display: none;
        position: relative;
        margin-bottom: 0.75rem;
      }

      .tab-select {
        width: 100%;
        appearance: none;
        -webkit-appearance: none;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        padding: 0.625rem 2.5rem 0.625rem 0.875rem;
        font-size: 0.9375rem;
        font-weight: 500;
        color: var(--text-primary);
        cursor: pointer;
        outline: none;
      }

      .tab-select:focus {
        border-color: var(--primary-color);
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
      }

      .tab-select-chevron {
        position: absolute;
        right: 0.75rem;
        top: 50%;
        transform: translateY(-50%);
        pointer-events: none;
        color: var(--text-secondary);
      }

      @media (max-width: 768px) {
        .agent-tabs-container {
          display: none;
        }
        .tab-select-wrapper {
          display: block;
        }
      }

      .tabs-scroll-indicator {
        display: none;
        position: absolute;
        right: 0;
        top: 0;
        bottom: 0;
        width: 48px;
        background: linear-gradient(to right, transparent, white 60%);
        align-items: center;
        justify-content: flex-end;
        padding-right: 4px;
        color: var(--text-secondary);
        z-index: 5;
        cursor: pointer;
      }

      .tabs-scroll-indicator-left {
        right: auto;
        left: 0;
        background: linear-gradient(to left, transparent, white 60%);
        justify-content: flex-start;
        padding-right: 0;
        padding-left: 4px;
      }

      .tabs-scroll-indicator svg {
        pointer-events: none;
      }

      .tabs-scroll-indicator.visible {
        display: flex;
      }

      .agent-tab {
        flex: 1;
        padding: 0.75rem 0.25rem;
        border: none;
        background: none;
        color: var(--text-secondary);
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
        transition: all 0.2s;
        text-align: center;
      }

      .agent-tab:hover {
        color: var(--text-primary);
      }

      .agent-tab.active {
        color: var(--primary-color);
        border-bottom-color: var(--primary-color);
      }

      .tab-content {
        min-height: 400px;
      }

      .config-section {
        background: white;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        padding: 1.5rem;
        margin-bottom: 1rem;
      }

      .config-section h3 {
        margin: 0 0 0.25rem 0;
        font-size: 1rem;
      }

      .section-desc {
        color: var(--text-secondary);
        font-size: 0.875rem;
        margin: 0 0 1.25rem 0;
      }

      .variables-reference {
        background: linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(139, 92, 246, 0.05));
        border: 1px solid rgba(99, 102, 241, 0.2);
        border-radius: var(--radius-md);
        padding: 1rem;
        margin-bottom: 1.5rem;
      }

      .variables-reference h4 {
        margin: 0 0 0.5rem 0;
        font-size: 0.9rem;
        color: var(--primary-color);
      }

      .variables-reference p {
        font-size: 0.85rem;
        color: var(--text-secondary);
        margin: 0 0 0.75rem 0;
      }

      .variables-reference ul {
        list-style: none;
        padding: 0;
        margin: 0 0 0.75rem 0;
      }

      .variables-reference li {
        font-size: 0.85rem;
        padding: 0.25rem 0;
        color: var(--text-primary);
      }

      .variables-reference code {
        background: rgba(99, 102, 241, 0.1);
        color: var(--primary-color);
        padding: 0.15rem 0.4rem;
        border-radius: var(--radius-sm);
        font-family: 'SF Mono', Monaco, Consolas, monospace;
        font-size: 0.8rem;
      }

      .variables-reference .example {
        font-style: italic;
        font-size: 0.8rem;
        color: var(--text-tertiary);
        margin: 0;
      }

      /* Identity Summary in Prompt Tab */
      .identity-summary {
        background: linear-gradient(135deg, rgba(34, 197, 94, 0.05), rgba(16, 185, 129, 0.05));
        border: 1px solid rgba(34, 197, 94, 0.2);
        border-radius: var(--radius-md);
        padding: 1rem;
        margin-bottom: 1.5rem;
      }

      .identity-summary-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.75rem;
      }

      .identity-summary-header h4 {
        margin: 0;
        font-size: 0.9rem;
        color: #16a34a;
      }

      .identity-summary-header .btn {
        display: flex;
        align-items: center;
        gap: 0.35rem;
      }

      .identity-role {
        font-size: 0.9rem;
        color: var(--text-primary);
        margin: 0 0 0.75rem 0;
        padding: 0.75rem;
        background: white;
        border-radius: var(--radius-sm);
        border-left: 3px solid #22c55e;
      }

      .identity-details {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        font-size: 0.85rem;
        color: var(--text-secondary);
      }

      .identity-details span {
        white-space: nowrap;
      }

      .identity-details strong {
        color: var(--text-primary);
      }

      .identity-empty {
        background: var(--bg-secondary);
        border: 1px dashed var(--border-color);
        border-radius: var(--radius-md);
        padding: 1.5rem;
        text-align: center;
        margin-bottom: 1.5rem;
      }

      .identity-empty p {
        margin: 0;
        font-size: 0.9rem;
        color: var(--text-secondary);
      }

      .identity-empty-hint {
        margin-top: 0.5rem !important;
        font-size: 0.8rem !important;
        color: var(--text-tertiary) !important;
      }

      /* Full Prompt Preview */
      .prompt-preview-btn {
        margin-top: 0.5rem;
      }

      .full-prompt-preview {
        margin-top: 1rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        background: #1e293b;
        overflow: hidden;
      }

      .full-prompt-preview.hidden {
        display: none;
      }

      .full-prompt-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem 1rem;
        background: #334155;
        border-bottom: 1px solid #475569;
      }

      .full-prompt-header h4 {
        margin: 0;
        font-size: 0.85rem;
        color: #e2e8f0;
        font-weight: 500;
      }

      .full-prompt-header .btn-icon {
        background: none;
        border: none;
        color: #94a3b8;
        font-size: 1.25rem;
        cursor: pointer;
        padding: 0.25rem;
        line-height: 1;
      }

      .full-prompt-header .btn-icon:hover {
        color: #f1f5f9;
      }

      .full-prompt-content {
        padding: 1rem;
        margin: 0;
        font-size: 0.8rem;
        line-height: 1.6;
        color: #e2e8f0;
        white-space: pre-wrap;
        word-wrap: break-word;
        max-height: 400px;
        overflow-y: auto;
        font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
      }

      .agent-type-selector {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .type-option {
        display: flex;
        flex-direction: column;
        padding: 0.75rem 1rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: all 0.2s;
      }

      .type-option:hover {
        border-color: var(--primary-color);
      }

      .type-option.selected {
        border-color: var(--primary-color);
        background: rgba(99, 102, 241, 0.05);
      }

      .type-option input {
        display: none;
      }

      .type-label {
        font-weight: 600;
        font-size: 0.9rem;
      }

      .type-desc {
        font-size: 0.8rem;
        color: var(--text-secondary);
      }

      .voice-selector {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 1rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        background: var(--bg-secondary);
      }

      .voice-current {
        font-weight: 500;
      }

      /* Voice Cloning Styles */
      .voice-clone-section {
        margin-bottom: 1.25rem;
      }

      .voice-clone-toggle {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem;
        border: 2px solid transparent;
        background: linear-gradient(white, white) padding-box,
                    linear-gradient(135deg, #6366f1, #8b5cf6) border-box;
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: all 0.2s;
      }

      .voice-clone-toggle:hover {
        background: linear-gradient(var(--bg-secondary), var(--bg-secondary)) padding-box,
                    linear-gradient(135deg, #6366f1, #8b5cf6) border-box;
      }

      .voice-clone-icon {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .voice-clone-info {
        flex: 1;
        display: flex;
        flex-direction: column;
      }

      .voice-clone-title {
        font-weight: 500;
        font-size: 0.9rem;
      }

      .voice-clone-desc {
        font-size: 0.8rem;
        color: var(--text-secondary);
      }

      .voice-clone-chevron {
        color: var(--text-secondary);
        transition: transform 0.2s;
      }

      .voice-clone-panel {
        margin-top: 1rem;
        padding: 1rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        background: var(--bg-secondary);
      }

      .clone-method-tabs {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1rem;
      }

      .clone-tab {
        flex: 1;
        padding: 0.5rem 1rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        background: white;
        color: var(--text-secondary);
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }

      .clone-tab.active {
        background: var(--primary-color);
        border-color: var(--primary-color);
        color: white;
      }

      .recording-buttons {
        display: flex;
        gap: 0.75rem;
        margin-bottom: 1rem;
      }

      .btn-record {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        background: #eff6ff;
        color: #3b82f6;
        border: 2px solid #dbeafe;
      }

      .btn-record:hover {
        background: #dbeafe;
      }

      .btn-upload {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        width: 100%;
        padding: 0.75rem;
        background: #eff6ff;
        color: #3b82f6;
        border: 2px solid #dbeafe;
        border-radius: var(--radius-md);
        cursor: pointer;
        font-size: 0.875rem;
        font-weight: 500;
        margin-bottom: 0.5rem;
      }

      .btn-upload:hover {
        background: #dbeafe;
      }

      .recording-timer {
        text-align: center;
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--primary-color);
        margin-bottom: 1rem;
      }

      .file-name {
        text-align: center;
        font-size: 0.875rem;
        color: var(--text-secondary);
        margin-bottom: 1rem;
      }

      .audio-preview {
        margin-top: 1rem;
      }

      .preview-actions {
        display: flex;
        gap: 0.75rem;
      }

      .preview-actions .btn {
        flex: 1;
      }

      .range-labels {
        display: flex;
        justify-content: space-between;
        font-size: 0.75rem;
        color: var(--text-tertiary);
        margin-top: 0.25rem;
      }

      .value-display {
        float: right;
        font-weight: normal;
        color: var(--text-secondary);
      }

      .form-group {
        margin-bottom: 1.25rem;
      }

      .form-group:last-child {
        margin-bottom: 0;
      }

      .form-select,
      .form-input,
      .form-textarea {
        width: 100%;
        padding: 0.6rem 0.75rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        font-size: 0.9rem;
        background: white;
        font-family: inherit;
      }

      .form-textarea {
        resize: vertical;
        min-height: 100px;
      }

      .form-select:focus,
      .form-input:focus,
      .form-textarea:focus {
        outline: none;
        border-color: var(--primary-color);
      }

      input[type="range"] {
        width: 100%;
        margin: 0.25rem 0;
      }

      .form-help {
        font-size: 0.8rem;
        color: var(--text-secondary);
        margin-top: 0.35rem;
      }

      .form-help code {
        background: rgba(99, 102, 241, 0.1);
        color: var(--primary-color);
        padding: 0.1rem 0.3rem;
        border-radius: var(--radius-sm);
        font-family: 'SF Mono', Monaco, Consolas, monospace;
        font-size: 0.75rem;
      }

      .toggle-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .agent-toggle {
        position: relative;
        display: inline-block;
        width: 44px;
        height: 24px;
        flex-shrink: 0;
      }

      .agent-toggle input {
        opacity: 0;
        width: 0;
        height: 0;
      }

      .agent-toggle-slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: var(--border-color);
        transition: 0.3s;
        border-radius: 24px;
      }

      .agent-toggle-slider:before {
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        transition: 0.3s;
        border-radius: 50%;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      }

      .agent-toggle input:checked + .agent-toggle-slider {
        background-color: var(--primary-color);
      }

      .agent-toggle input:checked + .agent-toggle-slider:before {
        transform: translateX(20px);
      }

      .function-toggles {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .function-toggle {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 0.75rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: border-color 0.2s;
      }

      .function-toggle:hover {
        border-color: var(--primary-color);
      }

      .function-toggle.transfer-toggle-container:hover,
      .function-toggle.sms-toggle-container:hover,
      .function-toggle.booking-toggle-container:hover,
      .function-toggle.extract-toggle-container:hover {
        border-color: var(--border-color);
      }

      .configure-btn {
        padding: 10px;
        background: var(--bg-secondary, #f3f4f6);
        border: none;
        border-left: 1px solid var(--border-color);
        color: var(--text-secondary);
        font-size: 0.8rem;
        cursor: pointer;
        align-self: stretch;
        border-radius: 0 var(--radius-md) var(--radius-md) 0;
        transition: background 0.2s, color 0.2s;
      }

      .configure-btn:hover {
        background: var(--border-color, #e5e7eb);
        color: var(--text-primary);
      }

      .function-toggle input[type="checkbox"] {
        margin-top: 0.2rem;
      }

      .toggle-content {
        flex: 1;
      }

      .toggle-label {
        display: block;
        font-weight: 500;
        font-size: 0.9rem;
      }

      .toggle-desc {
        display: block;
        font-size: 0.8rem;
        color: var(--text-secondary);
      }

      .assigned-numbers {
        margin-bottom: 1rem;
      }

      .assigned-number {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 1rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        margin-top: 0.5rem;
      }

      .number-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .number-value {
        font-weight: 600;
        font-size: 0.95rem;
      }

      .number-name {
        font-size: 0.85rem;
        color: var(--text-secondary);
      }

      .no-numbers-message {
        padding: 1rem;
        text-align: center;
        color: var(--text-secondary);
        background: var(--bg-secondary);
        border-radius: var(--radius-md);
      }

      .no-numbers-available {
        text-align: center;
        padding: 1.5rem;
        background: var(--bg-secondary);
        border-radius: var(--radius-md);
        margin-top: 1rem;
      }

      .no-numbers-available p {
        margin: 0 0 1rem 0;
        color: var(--text-secondary);
      }

      /* Widget status dot */
      .widget-status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #9ca3af;
      }

      .widget-status-dot.active {
        background: #10b981;
      }

      .widget-status-dot.inactive {
        background: #ef4444;
      }

      .assign-number-row {
        display: flex;
        gap: 0.5rem;
      }

      .assign-number-row .form-select {
        flex: 1;
      }

      /* Agent Analytics */
      .agent-analytics .analytics-grid {
        display: grid;
        gap: 1rem;
      }

      .agent-analytics .analytics-grid-4 {
        grid-template-columns: repeat(4, 1fr);
      }

      .agent-analytics .analytics-grid-2 {
        grid-template-columns: repeat(2, 1fr);
      }

      .agent-analytics .analytics-card {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        padding: 1.25rem;
      }

      .agent-analytics .analytics-card-value {
        font-size: 1.75rem;
        font-weight: 700;
        color: var(--text-primary);
        line-height: 1.2;
      }

      .agent-analytics .analytics-card-label {
        font-size: 0.875rem;
        color: var(--text-secondary);
        margin-top: 0.25rem;
      }

      .agent-analytics .analytics-panel {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        padding: 1.25rem;
      }

      .agent-analytics .analytics-panel h3 {
        font-size: 1rem;
        font-weight: 600;
        margin-bottom: 1rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .agent-analytics .analytics-stats {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
      }

      .agent-analytics .analytics-stat {
        display: flex;
        flex-direction: column;
      }

      .agent-analytics .analytics-stat-value {
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--text-primary);
      }

      .agent-analytics .analytics-stat-label {
        font-size: 0.75rem;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .aa-chart-container {
        height: 200px;
        margin-top: 0.5rem;
      }

      .aa-breakdown-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .aa-breakdown-empty {
        text-align: center;
        padding: 1.5rem;
        color: var(--text-secondary);
        font-size: 0.875rem;
      }

      .aa-bar-row {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .aa-bar-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .aa-bar-label {
        font-size: 0.875rem;
        color: var(--text-primary);
      }

      .aa-bar-value {
        font-size: 0.8rem;
        color: var(--text-secondary);
      }

      .aa-bar-track {
        height: 6px;
        background: var(--bg-secondary);
        border-radius: 3px;
        overflow: hidden;
      }

      .aa-bar-fill {
        height: 100%;
        border-radius: 3px;
        transition: width 0.4s ease;
      }

      .aa-recent-calls-panel {
        padding: 1.25rem;
      }

      .aa-table-wrapper {
        overflow-x: auto;
        margin-top: 0.5rem;
      }

      .aa-calls-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.875rem;
      }

      .aa-calls-table th,
      .aa-calls-table td {
        padding: 0.625rem 0.75rem;
        text-align: left;
        white-space: nowrap;
      }

      .aa-calls-table th {
        font-weight: 600;
        color: var(--text-secondary);
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-bottom: 1px solid var(--border-color);
      }

      .aa-calls-table td {
        border-bottom: 1px solid var(--border-color);
      }

      .aa-calls-table tbody tr:hover {
        background: var(--bg-secondary);
      }

      .aa-calls-table tbody tr:last-child td {
        border-bottom: none;
      }

      .direction-badge {
        display: inline-block;
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 500;
      }

      .direction-badge.inbound {
        background: rgba(16, 185, 129, 0.1);
        color: var(--success-color);
      }

      .direction-badge.outbound {
        background: rgba(99, 102, 241, 0.1);
        color: var(--primary-color);
      }

      .sentiment-badge {
        display: inline-block;
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 500;
      }

      .sentiment-badge.positive {
        background: rgba(16, 185, 129, 0.1);
        color: var(--success-color);
      }

      .sentiment-badge.neutral {
        background: rgba(107, 114, 128, 0.1);
        color: var(--text-secondary);
      }

      .sentiment-badge.negative {
        background: rgba(239, 68, 68, 0.1);
        color: var(--error-color);
      }

      .type-badge {
        display: inline-block;
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 500;
      }

      .type-badge.phone {
        background: rgba(99, 102, 241, 0.1);
        color: var(--primary-color);
      }

      .type-badge.sms {
        background: rgba(16, 185, 129, 0.1);
        color: var(--success-color);
      }

      .placeholder-message {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        padding: 2rem;
        background: var(--bg-secondary);
        border-radius: var(--radius-md);
        color: var(--text-secondary);
        font-size: 0.9rem;
      }

      .save-indicator {
        position: fixed;
        bottom: 100px;
        right: 20px;
        background: var(--success-color);
        color: white;
        padding: 0.5rem 1rem;
        border-radius: var(--radius-md);
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.875rem;
        box-shadow: var(--shadow-md);
        transition: opacity 0.2s;
      }

      .save-indicator.hidden {
        opacity: 0;
        pointer-events: none;
      }

      /* Voice Modal */
      .voice-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        padding: 1rem;
      }

      .voice-modal {
        background: white;
        border-radius: var(--radius-lg);
        width: 100%;
        max-width: 500px;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .voice-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem 1.25rem;
        border-bottom: 1px solid var(--border-color);
      }

      .voice-modal-header h3 {
        margin: 0;
        font-size: 1.1rem;
      }

      .close-modal-btn {
        background: none;
        border: none;
        font-size: 1.5rem;
        color: var(--text-secondary);
        cursor: pointer;
        padding: 0;
        line-height: 1;
      }

      .voice-modal-content {
        padding: 1rem 1.25rem;
        overflow-y: auto;
      }

      .voice-section {
        margin-bottom: 1.5rem;
      }

      .voice-section:last-child {
        margin-bottom: 0;
      }

      .voice-section h4 {
        margin: 0 0 0.75rem 0;
        font-size: 0.9rem;
        color: var(--text-secondary);
      }

      .voice-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 0.5rem;
      }

      .voice-option {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        padding: 0.75rem;
        cursor: pointer;
        text-align: left;
        transition: all 0.2s;
      }

      .voice-option:hover {
        border-color: var(--primary-color);
      }

      .voice-option.selected {
        border-color: var(--primary-color);
        background: rgba(99, 102, 241, 0.1);
      }

      .voice-option .voice-name {
        display: block;
        font-weight: 600;
        font-size: 0.85rem;
      }

      .voice-option .voice-meta {
        display: block;
        font-size: 0.7rem;
        color: var(--text-secondary);
        margin-top: 0.25rem;
      }

      /* Memory Tab Styles */
      .memory-status-container {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem 1.25rem;
        border-radius: var(--radius-md);
        border: 1px solid var(--border-color);
        transition: all 0.2s;
      }

      .memory-status-container.enabled {
        background: linear-gradient(135deg, rgba(34, 197, 94, 0.08), rgba(34, 197, 94, 0.03));
        border-color: #86efac;
      }

      .memory-status-container.disabled {
        background: var(--bg-secondary, #f9fafb);
        border-color: var(--border-color);
      }

      .memory-status-content {
        display: flex;
        align-items: center;
        gap: 0.875rem;
      }

      .memory-status-icon {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .memory-status-container.enabled .memory-status-icon {
        background: #dcfce7;
        color: #16a34a;
      }

      .memory-status-container.disabled .memory-status-icon {
        background: #f3f4f6;
        color: #9ca3af;
      }

      .memory-status-text {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }

      .memory-status-title {
        font-weight: 600;
        font-size: 0.95rem;
        color: var(--text-primary);
      }

      .memory-status-desc {
        font-size: 0.8rem;
        color: var(--text-secondary);
      }

      .memory-toggle-btn {
        padding: 0.5rem 1.25rem;
        border-radius: var(--radius-md);
        font-size: 0.85rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
      }

      .memory-toggle-btn.btn-enable {
        background: var(--primary-color);
        color: white;
      }

      .memory-toggle-btn.btn-enable:hover {
        background: #4f46e5;
      }

      .memory-toggle-btn.btn-disable {
        background: white;
        color: #dc2626;
        border: 1px solid #fecaca;
      }

      .memory-toggle-btn.btn-disable:hover {
        background: #fef2f2;
        border-color: #dc2626;
      }

      .memory-context-options {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.75rem;
        background: var(--bg-secondary, #f9fafb);
        border-radius: var(--radius-md);
        border: 1px solid var(--border-color);
      }

      .memory-option-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        cursor: pointer;
        font-size: 0.9rem;
      }

      .memory-option-item input[type="checkbox"] {
        width: 16px;
        height: 16px;
        cursor: pointer;
      }

      .memory-section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
      }

      .memory-section-header h3 {
        margin: 0;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .memory-count-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 22px;
        height: 22px;
        padding: 0 7px;
        font-size: 0.75rem;
        font-weight: 600;
        background: var(--primary-color);
        color: white;
        border-radius: 11px;
      }

      .btn-text-danger {
        background: none;
        border: none;
        color: #dc2626;
        font-size: 0.85rem;
        cursor: pointer;
        padding: 0.4rem 0.75rem;
        border-radius: var(--radius-sm);
        transition: background 0.2s;
      }

      .btn-text-danger:hover {
        background: #fef2f2;
      }

      .memories-container {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .memory-loading {
        text-align: center;
        padding: 2rem;
        color: var(--text-secondary);
        font-size: 0.9rem;
      }

      .memory-card {
        padding: 1rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        background: white;
        transition: border-color 0.2s, box-shadow 0.2s;
      }

      .memory-card:hover {
        border-color: #d1d5db;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      }

      .memory-card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 0.75rem;
      }

      .memory-contact {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .memory-contact-avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        flex-shrink: 0;
      }

      .memory-contact-details {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
      }

      .memory-contact-phone {
        font-weight: 600;
        font-size: 0.9rem;
        color: var(--text-primary);
      }

      .memory-contact-name {
        font-size: 0.8rem;
        color: var(--text-secondary);
      }

      .memory-header-right {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        flex-shrink: 0;
      }

      .memory-direction-badge {
        font-size: 0.7rem;
        padding: 0.2rem 0.5rem;
        border-radius: 10px;
        font-weight: 500;
      }

      .memory-direction-inbound {
        color: #059669;
        background: #ecfdf5;
      }

      .memory-direction-outbound {
        color: #7c3aed;
        background: #f5f3ff;
      }

      .memory-semantic-badge {
        color: #d97706;
        background: #fffbeb;
      }

      .memory-semantic-match-badge {
        color: #fff;
        background: #6366f1;
        border: none;
        cursor: pointer;
        font-family: inherit;
        transition: background 0.15s;
      }

      .memory-semantic-match-badge:hover {
        background: #8b5cf6;
      }

      .memory-call-count {
        font-size: 0.75rem;
        color: var(--text-secondary);
        background: var(--bg-secondary, #f3f4f6);
        padding: 0.25rem 0.6rem;
        border-radius: 12px;
        font-weight: 500;
      }

      .memory-card-summary {
        font-size: 0.85rem;
        color: #4b5563;
        line-height: 1.5;
        margin: 0 0 0.75rem 0;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      .memory-card-topics {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin-bottom: 0.75rem;
      }

      .memory-topic-tag {
        font-size: 0.7rem;
        padding: 0.25rem 0.6rem;
        background: #eef2ff;
        color: #4f46e5;
        border-radius: 12px;
        font-weight: 500;
      }

      .memory-card-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding-top: 0.75rem;
        border-top: 1px solid var(--border-color);
      }

      .copy-memory-id-btn {
        margin-left: auto;
        font-family: monospace;
        font-size: 0.65rem;
        color: var(--text-secondary);
        cursor: pointer;
        opacity: 0.5;
        transition: opacity 0.2s;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 140px;
      }

      .copy-memory-id-btn:hover {
        opacity: 1;
      }

      .memory-action-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        background: none;
        border: 1px solid var(--border-color);
        color: var(--text-secondary);
        font-size: 0.8rem;
        cursor: pointer;
        padding: 0.4rem 0.75rem;
        border-radius: var(--radius-sm);
        transition: all 0.2s;
      }

      .memory-action-btn:hover {
        border-color: var(--primary-color);
        color: var(--primary-color);
        background: rgba(99, 102, 241, 0.05);
      }

      .memory-action-btn.memory-action-danger:hover {
        border-color: #dc2626;
        color: #dc2626;
        background: #fef2f2;
      }

      /* Shared memory picker */
      .shared-memory-agents {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .shared-memory-agent-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-md);
        cursor: pointer;
        transition: border-color 0.15s;
      }

      .shared-memory-agent-item:hover {
        border-color: var(--primary-color);
      }

      .shared-memory-agent-item input[type="checkbox"] {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        accent-color: var(--primary-color);
      }

      .shared-memory-agent-info {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
      }

      .shared-memory-agent-name {
        font-weight: 500;
        font-size: 0.9rem;
        color: var(--text-primary);
      }

      .shared-memory-agent-type {
        font-size: 0.75rem;
        color: var(--text-secondary);
        text-transform: capitalize;
      }

      .memory-empty-state {
        text-align: center;
        padding: 2.5rem 1rem;
        background: var(--bg-secondary, #f9fafb);
        border-radius: var(--radius-md);
        border: 1px dashed var(--border-color);
      }

      .memory-empty-icon {
        width: 56px;
        height: 56px;
        margin: 0 auto 1rem;
        border-radius: 50%;
        background: white;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-secondary);
        border: 1px solid var(--border-color);
      }

      .memory-empty-title {
        font-size: 0.95rem;
        font-weight: 500;
        color: var(--text-primary);
        margin: 0 0 0.35rem 0;
      }

      .memory-empty-desc {
        font-size: 0.85rem;
        color: var(--text-secondary);
        margin: 0;
      }

      .memory-error-state {
        text-align: center;
        padding: 1.5rem;
        color: #dc2626;
        background: #fef2f2;
        border-radius: var(--radius-md);
        border: 1px solid #fecaca;
      }

      /* Memory Detail Modal */
      #memory-detail-modal .modal-content.memory-detail-modal {
        max-width: 500px;
        max-height: 90vh;
        overflow-y: auto;
      }

      .memory-detail-phone {
        font-size: 0.9rem;
        color: var(--text-secondary);
        margin-bottom: 1rem;
      }

      .memory-detail-section {
        margin-bottom: 1.25rem;
      }

      .memory-detail-section:last-child {
        margin-bottom: 0;
      }

      .memory-topics-display {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
      }

      .memory-prefs-display {
        font-size: 0.8rem;
        background: var(--bg-secondary, #f3f4f6);
        padding: 0.75rem;
        border-radius: var(--radius-md);
        overflow-x: auto;
        margin: 0;
      }

      .call-history-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .call-history-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-size: 0.85rem;
        padding: 0.5rem;
        background: var(--bg-secondary, #f3f4f6);
        border-radius: var(--radius-sm);
      }

      .call-date {
        color: var(--text-secondary);
        flex-shrink: 0;
      }

      .call-duration {
        color: var(--text-secondary);
        flex-shrink: 0;
      }

      .call-summary-preview {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .text-muted {
        color: var(--text-secondary);
      }

      /* Semantic Memory Styles */
      .memory-section {
        margin-bottom: 1.5rem;
      }

      .memory-section:last-child {
        margin-bottom: 0;
      }

      .memory-section-title {
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--text-primary);
        margin: 0 0 0.75rem 0;
      }

      .memory-status-container.semantic.enabled {
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(59, 130, 246, 0.03));
        border-color: #93c5fd;
      }

      .memory-status-container.semantic.enabled .memory-status-icon {
        background: #dbeafe;
        color: #2563eb;
      }

      .semantic-config-options {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 1rem;
        padding: 1rem;
        background: var(--bg-secondary, #f9fafb);
        border-radius: var(--radius-md);
        border: 1px solid var(--border-color);
      }

      .semantic-config-item {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }

      .semantic-config-item label {
        font-size: 0.8rem;
        font-weight: 500;
        color: var(--text-secondary);
      }

      .semantic-config-item select {
        padding: 0.5rem 0.75rem;
        border-radius: var(--radius-sm);
        border: 1px solid var(--border-color);
        font-size: 0.85rem;
        background: white;
        cursor: pointer;
      }

      .semantic-config-item select:focus {
        outline: none;
        border-color: var(--primary-color);
      }

      .semantic-info-box {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 0.875rem 1rem;
        background: #eff6ff;
        border-radius: var(--radius-md);
        border: 1px solid #bfdbfe;
      }

      .semantic-info-icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
        color: #3b82f6;
        margin-top: 1px;
      }

      .semantic-info-text {
        font-size: 0.82rem;
        color: #1e40af;
        line-height: 1.45;
      }

      @media (max-width: 600px) {
        .mobile-toggle.agent-status-toggle {
          display: flex;
        }

        .desktop-toggle.agent-detail-actions {
          display: none;
        }

        .agent-detail-header {
          flex-direction: column;
          align-items: flex-start;
        }

        .agent-detail-actions {
          width: 100%;
        }

        .agent-detail-actions .btn {
          width: 100%;
        }

        .agent-tabs-container {
          margin-left: -1rem;
          margin-right: -1rem;
        }

        .agent-tabs {
          padding-left: 1rem;
          padding-right: 2rem;
        }

        .tabs-scroll-indicator {
          right: 0;
        }

        .agent-tab {
          flex: none;
          padding: 0.6rem 0.75rem;
          font-size: 0.8rem;
          text-align: left;
        }

        /* Memory Tab Mobile */
        .memory-status-container {
          flex-direction: column;
          align-items: stretch;
          gap: 1rem;
          padding: 1rem;
        }

        .memory-status-content {
          justify-content: flex-start;
        }

        .memory-toggle-btn {
          width: 100%;
          padding: 0.65rem;
        }

        .memory-section-header {
          flex-direction: column;
          align-items: flex-start;
          gap: 0.75rem;
        }

        .memory-card-header {
          flex-direction: column;
          gap: 0.5rem;
        }

        .memory-call-count {
          align-self: flex-start;
        }

        .memory-card-actions {
          flex-wrap: wrap;
        }

        .memory-action-btn {
          flex: 1;
          justify-content: center;
        }

        .config-section {
          padding: 1rem;
          margin-left: -0.5rem;
          margin-right: -0.5rem;
          border-radius: var(--radius-md);
        }

        .config-section h3 {
          font-size: 0.95rem;
        }

        .form-group {
          margin-bottom: 1rem;
        }

        .form-label {
          font-size: 0.85rem;
        }

        .form-help {
          font-size: 0.75rem;
        }

        .type-option {
          padding: 0.6rem 0.75rem;
        }

        .type-label {
          font-size: 0.85rem;
        }

        .type-desc {
          font-size: 0.75rem;
        }

        .voice-selector {
          padding: 0.6rem 0.75rem;
        }

        .agent-analytics .analytics-grid-4 {
          grid-template-columns: repeat(2, 1fr);
          gap: 0.75rem;
        }

        .agent-analytics .analytics-grid-2 {
          grid-template-columns: 1fr;
        }

        .agent-analytics .analytics-card {
          padding: 0.875rem;
        }

        .agent-analytics .analytics-card-value {
          font-size: 1.4rem;
        }

        .aa-calls-table th:nth-child(5),
        .aa-calls-table td:nth-child(5),
        .aa-calls-table th:nth-child(6),
        .aa-calls-table td:nth-child(6) {
          display: none;
        }

        .voice-modal {
          max-height: 90vh;
        }

        .voice-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      /* Schedule Status Banners */
      .schedule-status-banner {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.875rem 1rem;
        border-radius: var(--radius-md);
        margin-bottom: 1rem;
        font-size: 0.9rem;
      }

      .schedule-status-banner svg {
        flex-shrink: 0;
      }

      .schedule-status-24-7 {
        background: linear-gradient(135deg, rgba(34, 197, 94, 0.08), rgba(16, 185, 129, 0.08));
        border: 1px solid rgba(34, 197, 94, 0.25);
        color: #16a34a;
      }

      .schedule-status-24-7 span {
        color: var(--text-primary);
      }

      .schedule-status-24-7 strong {
        color: #16a34a;
      }

      .schedule-status-active {
        background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(139, 92, 246, 0.08));
        border: 1px solid rgba(99, 102, 241, 0.25);
        color: var(--primary-color);
      }

      .schedule-status-active span {
        color: var(--text-primary);
      }

      .schedule-status-active strong {
        color: var(--primary-color);
      }

      /* App Function Cards */
      .app-func-cards {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .app-func-card {
        border: 1px solid var(--border-color);
        border-radius: 0.75rem;
        padding: 1rem;
        background: var(--card-bg, var(--bg-secondary));
        transition: opacity 0.2s;
      }

      .app-func-card.app-func-disabled {
        opacity: 0.5;
      }

      .app-func-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.75rem;
      }

      .app-func-title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 600;
        font-size: 0.95rem;
      }

      .app-func-icon {
        display: flex;
        align-items: center;
      }

      .app-func-channels {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding-left: 0.25rem;
      }

      .app-func-channel {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
        font-size: 0.875rem;
        color: var(--text-secondary);
      }

      .app-func-channel input[type="checkbox"] {
        width: 16px;
        height: 16px;
        accent-color: var(--primary-color);
        cursor: pointer;
      }

      .app-func-channel input[type="checkbox"]:disabled {
        cursor: not-allowed;
      }
    `;

    document.head.appendChild(styles);
  }
};
