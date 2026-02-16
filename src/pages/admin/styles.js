import AdminHeader from '../../components/AdminHeader.js';

export const stylesMethods = {
  addStyles() {
    if (document.getElementById('admin-styles')) return;

    const style = document.createElement('style');
    style.id = 'admin-styles';
    style.textContent = `
      ${AdminHeader.getStyles()}

      .admin-container {
        display: flex;
        flex-direction: column;
        height: 100vh;
        background: var(--bg-secondary);
      }

      /* Admin Reminders */
      .admin-reminder {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1.5rem;
        font-size: 0.85rem;
        border-bottom: 1px solid var(--border-color);
      }
      .admin-reminder-warning {
        background: #fef3c7;
        color: #92400e;
        border-bottom-color: #f59e0b;
      }
      .admin-reminder-content {
        flex: 1;
        display: flex;
        gap: 0.5rem;
        align-items: baseline;
        flex-wrap: wrap;
      }
      .admin-reminder-content strong {
        white-space: nowrap;
      }
      .admin-reminder-dismiss {
        background: none;
        border: none;
        cursor: pointer;
        color: inherit;
        opacity: 0.6;
        padding: 4px;
        flex-shrink: 0;
      }
      .admin-reminder-dismiss:hover { opacity: 1; }

      /* Global Agent Tab */
      .admin-global-agent {
        flex: 1;
        overflow-y: auto;
        padding: 2rem;
        max-width: 800px;
      }

      .global-agent-header {
        margin-bottom: 2rem;
      }

      .global-agent-header h2 {
        margin: 0 0 0.5rem 0;
        font-size: 1.5rem;
      }

      .global-agent-form {
        background: var(--bg-primary);
        border-radius: 12px;
        padding: 1.5rem;
        border: 1px solid var(--border-color);
      }

      .config-form .form-group {
        margin-bottom: 1.5rem;
      }

      .config-form label {
        display: block;
        font-weight: 500;
        margin-bottom: 0.5rem;
        color: var(--text-primary);
      }

      .config-form .form-textarea {
        resize: vertical;
        min-height: 200px;
        font-family: monospace;
        font-size: 0.9rem;
        line-height: 1.5;
      }

      .config-form .form-actions {
        display: flex;
        gap: 1rem;
        margin-top: 2rem;
        padding-top: 1.5rem;
        border-top: 1px solid var(--border-color);
      }

      .config-form .form-actions .btn {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .form-status {
        margin-top: 1rem;
        padding: 0.75rem 1rem;
        border-radius: 8px;
        font-size: 0.9rem;
      }

      .form-status.success {
        background: #dcfce7;
        color: #166534;
        border: 1px solid #bbf7d0;
      }

      .form-status.error {
        background: #fee;
        color: #c00;
        border: 1px solid #fcc;
      }

      /* Global Agent Permissions List */
      .global-agent-users-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .global-agent-user-item {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        transition: background 0.15s;
      }

      .global-agent-user-item:hover {
        background: var(--bg-secondary);
      }

      .global-agent-user-label {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.75rem 1rem;
        cursor: pointer;
        margin: 0;
      }

      .global-agent-user-label input[type="checkbox"] {
        width: 18px;
        height: 18px;
        cursor: pointer;
        flex-shrink: 0;
      }

      .global-agent-user-label input[type="checkbox"]:disabled {
        cursor: not-allowed;
        opacity: 0.7;
      }

      .global-agent-user-info {
        flex: 1;
        min-width: 0;
      }

      .global-agent-user-name {
        display: block;
        font-weight: 500;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .global-agent-user-email {
        display: block;
        font-size: 0.85rem;
        color: var(--text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .global-agent-always-access {
        font-size: 0.75rem;
        color: var(--text-secondary);
        font-style: italic;
        white-space: nowrap;
      }

      /* Chat Tab */
      .admin-chat-tab {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .omni-chat-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: var(--bg-primary);
      }

      .admin-content {
        display: flex;
        flex: 1;
        overflow: hidden;
      }

      .admin-list-panel {
        width: 400px;
        display: flex;
        flex-direction: column;
        background: var(--bg-primary);
        border-right: 1px solid var(--border-color);
      }

      .admin-filters {
        padding: 1rem;
        border-bottom: 1px solid var(--border-color);
      }

      .search-box {
        position: relative;
        margin-bottom: 0.75rem;
      }

      .search-box svg {
        position: absolute;
        left: 0.75rem;
        top: 50%;
        transform: translateY(-50%);
        color: var(--text-muted);
      }

      .search-box input {
        padding-left: 2.5rem;
      }

      .filter-row {
        display: flex;
        gap: 0.5rem;
      }

      .filter-row select {
        flex: 1;
        font-size: 0.875rem;
      }

      .user-list {
        flex: 1;
        overflow-y: auto;
      }

      .user-item {
        display: flex;
        align-items: center;
        padding: 1rem;
        border-bottom: 1px solid var(--border-color);
        cursor: pointer;
        transition: background 0.2s;
      }

      .user-item:hover {
        background: var(--bg-secondary);
      }

      .user-item.selected {
        background: var(--primary-color-light);
        border-left: 3px solid var(--primary-color);
      }

      .user-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--bg-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 1rem;
        font-weight: 600;
        color: var(--primary-color);
      }

      .user-info {
        flex: 1;
        min-width: 0;
      }

      .user-name {
        font-weight: 600;
        margin-bottom: 0.25rem;
      }

      .user-email {
        font-size: 0.875rem;
        color: var(--text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .user-badges {
        display: flex;
        gap: 0.25rem;
        flex-wrap: wrap;
      }

      .badge {
        padding: 0.125rem 0.5rem;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 500;
      }

      .badge-active { background: #d1fae5; color: #059669; }
      .badge-suspended { background: #fef3c7; color: #d97706; }
      .badge-banned { background: #fee2e2; color: #dc2626; }
      .badge-admin { background: #ede9fe; color: #7c3aed; }
      .badge-support { background: #fce7f3; color: #db2777; }
      .badge-user { background: #e5e7eb; color: #374151; }
      .badge-viewer { background: #e0f2fe; color: #0284c7; }
      .badge-editor { background: #dcfce7; color: #16a34a; }
      .badge-god { background: #fef3c7; color: #b45309; }

      .pagination {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 0.5rem;
        padding: 1rem;
        border-top: 1px solid var(--border-color);
      }

      .pagination button {
        padding: 0.5rem 1rem;
      }

      .pagination-info {
        color: var(--text-muted);
        font-size: 0.875rem;
      }

      .admin-detail-panel {
        flex: 1;
        overflow-y: auto;
        padding: 1.5rem;
      }

      .detail-placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: var(--text-muted);
      }

      .detail-placeholder svg {
        margin-bottom: 1rem;
        opacity: 0.5;
      }

      .detail-header {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.5rem;
        padding-bottom: 1.5rem;
        border-bottom: 1px solid var(--border-color);
      }

      .detail-avatar {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: var(--bg-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem;
        font-weight: 600;
        color: var(--primary-color);
      }

      .detail-name {
        font-size: 1.25rem;
        font-weight: 600;
        margin-bottom: 0.25rem;
      }

      .detail-section {
        background: var(--bg-primary);
        border-radius: var(--radius-lg);
        padding: 1.25rem;
        margin-bottom: 1rem;
        box-shadow: var(--shadow-sm);
      }

      .detail-section h3 {
        margin: 0 0 1rem 0;
        font-size: 1rem;
        color: var(--text-primary);
      }

      .detail-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem 0;
        border-bottom: 1px solid var(--border-color);
      }

      .detail-row:last-child {
        border-bottom: none;
      }

      .detail-label {
        color: var(--text-muted);
        font-size: 0.875rem;
      }

      .detail-value {
        font-weight: 500;
      }

      .detail-actions {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }

      .action-group {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        padding: 0.75rem 0;
        border-bottom: 1px solid var(--border-color);
      }

      .action-group:last-child {
        border-bottom: none;
      }

      .action-group label {
        min-width: 100px;
        font-size: 0.875rem;
        color: var(--text-muted);
      }

      .btn-impersonate {
        background: var(--primary-color);
        color: white;
      }

      .btn-suspend {
        background: #f59e0b;
        color: white;
      }

      .btn-ban {
        background: #dc2626;
        color: white;
      }

      .btn-reactivate {
        background: #059669;
        color: white;
      }

      .loading-spinner {
        display: flex;
        justify-content: center;
        padding: 2rem;
        color: var(--text-muted);
      }

      .phone-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .phone-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem;
        background: var(--bg-secondary);
        border-radius: var(--radius-sm);
      }

      .stats-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
      }

      .stat-item {
        text-align: center;
        padding: 1rem;
        background: var(--bg-secondary);
        border-radius: var(--radius-sm);
      }

      .stat-value {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--primary-color);
      }

      .stat-label {
        font-size: 0.75rem;
        color: var(--text-muted);
        text-transform: uppercase;
      }

      /* Mobile Responsive */
      @media (max-width: 768px) {
        .admin-content {
          flex-direction: column;
        }

        .admin-list-panel {
          width: 100%;
          height: 50vh;
          border-right: none;
          border-bottom: 1px solid var(--border-color);
        }

        .admin-detail-panel {
          height: 50vh;
        }

        .filter-row {
          flex-wrap: wrap;
        }

        .filter-row select {
          min-width: calc(50% - 0.25rem);
        }
      }

      /* Analytics Tab Styles */
      .admin-analytics {
        flex: 1;
        overflow-y: auto;
        padding: 1.5rem;
        background: var(--bg-secondary);
      }

      .analytics-loading,
      .analytics-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        gap: 1rem;
        color: var(--text-muted);
      }

      .analytics-section {
        margin-bottom: 2rem;
      }

      .analytics-section h2 {
        margin: 0 0 1rem 0;
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--text-primary);
      }

      .analytics-grid {
        display: grid;
        gap: 1rem;
      }

      .analytics-grid-2 {
        grid-template-columns: repeat(2, 1fr);
      }

      .analytics-grid-3 {
        grid-template-columns: repeat(3, 1fr);
      }

      .analytics-grid-4 {
        grid-template-columns: repeat(4, 1fr);
      }

      .analytics-card {
        background: var(--bg-primary);
        border-radius: 12px;
        padding: 1.25rem;
        text-align: center;
        border: 1px solid var(--border-color);
      }

      .analytics-card-value {
        font-size: 2rem;
        font-weight: 700;
        color: var(--primary-color);
        line-height: 1.2;
      }

      .analytics-card-label {
        font-size: 0.875rem;
        color: var(--text-muted);
        margin-top: 0.25rem;
      }

      .analytics-card-sub {
        font-size: 0.75rem;
        color: var(--text-muted);
        margin-top: 0.25rem;
        opacity: 0.7;
      }

      .analytics-card-header {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
      }

      .sparkline {
        width: 60px;
        height: 28px;
        flex-shrink: 0;
      }

      .sparkline svg {
        display: block;
      }

      .sparkline-panel {
        width: 100px;
        height: 32px;
      }

      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1rem;
      }

      .analytics-panel .panel-header h3 {
        margin: 0;
      }

      .analytics-panel {
        background: var(--bg-primary);
        border-radius: 12px;
        padding: 1.25rem;
        border: 1px solid var(--border-color);
      }

      .analytics-panel h3 {
        margin: 0 0 1rem 0;
        font-size: 1rem;
        font-weight: 600;
        color: var(--text-primary);
      }

      .analytics-stats {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
        margin-bottom: 1rem;
      }

      .analytics-stat {
        text-align: center;
        padding: 0.75rem;
        background: var(--bg-secondary);
        border-radius: 8px;
      }

      .analytics-stat-value {
        display: block;
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--primary-color);
      }

      .analytics-stat-label {
        display: block;
        font-size: 0.75rem;
        color: var(--text-muted);
        margin-top: 0.125rem;
      }

      .analytics-breakdown {
        display: flex;
        gap: 1rem;
        padding-top: 1rem;
        border-top: 1px solid var(--border-color);
      }

      .breakdown-item {
        flex: 1;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.5rem 0.75rem;
        background: var(--bg-secondary);
        border-radius: 6px;
      }

      .breakdown-label {
        font-size: 0.875rem;
        color: var(--text-muted);
      }

      .breakdown-value {
        font-weight: 600;
        color: var(--text-primary);
      }

      .chart-container {
        height: 200px;
        position: relative;
      }

      /* Leaderboard Styles */
      .leaderboard {
        min-height: 300px;
      }

      .leaderboard-empty {
        color: var(--text-muted);
        text-align: center;
        padding: 2rem;
      }

      .leaderboard-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }

      .leaderboard-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem;
        border-bottom: 1px solid var(--border-color);
      }

      .leaderboard-item:last-child {
        border-bottom: none;
      }

      .leaderboard-rank {
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bg-secondary);
        border-radius: 50%;
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-muted);
      }

      .leaderboard-item:nth-child(1) .leaderboard-rank {
        background: #fef3c7;
        color: #b45309;
      }

      .leaderboard-item:nth-child(2) .leaderboard-rank {
        background: #e5e7eb;
        color: #374151;
      }

      .leaderboard-item:nth-child(3) .leaderboard-rank {
        background: #fed7aa;
        color: #c2410c;
      }

      .leaderboard-user {
        flex: 1;
        min-width: 0;
      }

      .leaderboard-name {
        display: block;
        font-weight: 500;
        font-size: 0.875rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .leaderboard-email {
        display: block;
        font-size: 0.75rem;
        color: var(--text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .leaderboard-value {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--primary-color);
        white-space: nowrap;
      }

      /* Clickable users */
      .clickable-user {
        cursor: pointer;
        transition: background-color 0.15s;
      }

      .clickable-user:hover {
        background-color: var(--bg-secondary);
      }

      .leaderboard-item.clickable-user:hover {
        background-color: var(--bg-secondary);
        border-radius: 8px;
      }

      tr.clickable-user:hover td {
        background-color: var(--bg-secondary);
      }

      /* Chart Modal */
      .chart-modal {
        display: none;
        position: fixed;
        inset: 0;
        z-index: 1000;
      }

      .chart-modal.open {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .chart-modal-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
      }

      .chart-modal-content {
        position: relative;
        background: var(--bg-primary);
        border-radius: 16px;
        width: 90%;
        max-width: 800px;
        max-height: 90vh;
        overflow: hidden;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      }

      .chart-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1.25rem 1.5rem;
        border-bottom: 1px solid var(--border-color);
      }

      .chart-modal-header h3 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
      }

      .chart-modal-close {
        background: none;
        border: none;
        padding: 0.5rem;
        cursor: pointer;
        color: var(--text-muted);
        border-radius: 8px;
        transition: all 0.15s;
      }

      .chart-modal-close:hover {
        background: var(--bg-secondary);
        color: var(--text-primary);
      }

      .chart-modal-body {
        padding: 1.5rem;
        height: 350px;
      }

      .chart-modal-body canvas {
        width: 100% !important;
        height: 100% !important;
      }

      .chart-modal-stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 1rem;
        padding: 1rem 1.5rem 1.5rem;
        border-top: 1px solid var(--border-color);
        background: var(--bg-secondary);
      }

      .modal-stat {
        text-align: center;
      }

      .modal-stat-value {
        display: block;
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--primary-color);
      }

      .modal-stat-label {
        display: block;
        font-size: 0.75rem;
        color: var(--text-muted);
        margin-top: 0.25rem;
      }

      /* Sparkline clickable */
      .sparkline {
        cursor: pointer;
        transition: transform 0.15s;
      }

      .sparkline:hover {
        transform: scale(1.1);
      }

      /* Signup Map */
      .signup-map {
        height: 500px;
        border-radius: 8px;
        overflow: hidden;
        background: var(--bg-secondary);
      }

      .map-no-data {
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: var(--text-muted);
        text-align: center;
      }

      .map-no-data p {
        margin: 0.25rem 0;
      }

      .map-legend {
        display: flex;
        gap: 1rem;
        margin-top: 0.5rem;
        flex-wrap: wrap;
      }

      .map-legend-item {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.75rem;
        color: var(--text-muted);
      }

      .map-legend-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        display: inline-block;
      }

      .map-popup {
        font-size: 0.875rem;
      }

      .map-popup strong {
        display: block;
        margin-bottom: 0.25rem;
      }

      .map-popup-users {
        margin: 0.5rem 0 0 0;
        padding-left: 1rem;
        font-size: 0.75rem;
        color: var(--text-muted);
      }

      .map-popup-users li {
        margin: 0.125rem 0;
      }

      /* Recent Signups Table */
      .signups-panel {
        padding: 0;
        overflow: hidden;
      }

      .signups-table-wrapper {
        overflow-x: auto;
      }

      .signups-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.875rem;
      }

      .signups-table th,
      .signups-table td {
        padding: 0.75rem 1rem;
        text-align: left;
        border-bottom: 1px solid var(--border-color);
      }

      .signups-table th {
        background: var(--bg-secondary);
        font-weight: 600;
        font-size: 0.75rem;
        text-transform: uppercase;
        color: var(--text-muted);
      }

      .signups-table tbody tr:hover {
        background: var(--bg-secondary);
      }

      .signup-user {
        display: flex;
        flex-direction: column;
      }

      .signup-name {
        font-weight: 500;
      }

      .signup-email {
        font-size: 0.75rem;
        color: var(--text-muted);
      }

      .signup-location {
        font-size: 0.875rem;
      }

      .signup-city {
        color: var(--text-primary);
      }

      .signup-ip {
        font-family: monospace;
        font-size: 0.75rem;
        color: var(--text-muted);
      }

      .signup-no-location {
        color: var(--text-muted);
        font-style: italic;
      }

      .signup-date {
        font-size: 0.875rem;
        color: var(--text-muted);
      }

      .signups-empty {
        padding: 2rem;
        text-align: center;
        color: var(--text-muted);
      }

      .signups-pagination {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem 1rem;
        border-bottom: 1px solid var(--border-color);
        font-size: 0.8rem;
      }

      .signups-table-wrapper + .signups-pagination {
        border-bottom: none;
        border-top: 1px solid var(--border-color);
      }

      .signups-pagination-info {
        color: var(--text-muted);
      }

      .signups-pagination-controls {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .signups-per-page {
        padding: 0.25rem 0.5rem;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: 0.8rem;
        cursor: pointer;
      }

      .signups-page-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        background: var(--bg-primary);
        color: var(--text-primary);
        cursor: pointer;
      }

      .signups-page-btn:hover:not(:disabled) {
        background: var(--bg-secondary);
      }

      .signups-page-btn:disabled {
        opacity: 0.3;
        cursor: default;
      }

      .signups-page-num {
        font-size: 0.8rem;
        color: var(--text-muted);
        min-width: 3rem;
        text-align: center;
      }

      /* KPI Filter Bar */
      .kpi-filter-bar {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 1.5rem;
      }

      .kpi-filter-label {
        font-size: 0.875rem;
        color: var(--text-muted);
        font-weight: 500;
      }

      .kpi-filter-buttons {
        display: flex;
        gap: 0.25rem;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 0.25rem;
      }

      .kpi-filter-btn {
        padding: 0.375rem 0.75rem;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--text-muted);
        font-size: 0.8rem;
        cursor: pointer;
        transition: all 0.15s;
      }

      .kpi-filter-btn:hover {
        color: var(--text-primary);
        background: var(--bg-secondary);
      }

      .kpi-filter-btn.active {
        background: var(--primary-color);
        color: white;
      }

      .kpi-date-input {
        padding: 0.375rem 0.5rem;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--text-muted);
        font-size: 0.8rem;
        cursor: pointer;
        transition: all 0.15s;
        font-family: inherit;
      }

      .kpi-date-input:hover {
        color: var(--text-primary);
        background: var(--bg-secondary);
      }

      .kpi-date-input.active {
        background: var(--primary-color);
        color: white;
      }

      /* KPI Table Styles */
      .kpi-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.875rem;
      }

      .kpi-table th {
        text-align: left;
        padding: 0.75rem;
        border-bottom: 2px solid var(--border-color);
        color: var(--text-muted);
        font-weight: 600;
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .kpi-table td {
        padding: 0.75rem;
        border-bottom: 1px solid var(--border-color);
        color: var(--text-primary);
      }

      .kpi-table tr:last-child td {
        border-bottom: none;
      }

      .kpi-table tr:hover td {
        background: var(--bg-secondary);
      }

      .kpi-cost {
        color: #ef4444;
      }

      .kpi-bundled {
        color: var(--text-muted);
        font-style: italic;
        font-size: 0.8rem;
      }

      .kpi-margin-good {
        color: #10b981;
        font-weight: 600;
      }

      .kpi-margin-ok {
        color: #f59e0b;
        font-weight: 600;
      }

      .kpi-margin-bad {
        color: #ef4444;
        font-weight: 600;
      }

      .kpi-pl-table td:not(:first-child),
      .kpi-pl-table th:not(:first-child) {
        text-align: right;
        min-width: 90px;
      }
      .kpi-pl-sub {
        display: block;
        font-size: 0.75rem;
        color: var(--text-muted);
        font-weight: 400;
        margin-top: 2px;
      }
      .kpi-pl-subtotal td {
        border-top: 2px solid var(--border-color);
        font-style: italic;
      }
      .kpi-pl-total td {
        border-top: 3px double var(--border-color);
        font-size: 1.05em;
      }
      .kpi-pl-note {
        margin-top: 0.75rem;
        padding: 0.625rem 1rem;
        background: #fef3c7;
        color: #92400e;
        border-radius: 0.5rem;
        font-size: 0.85rem;
      }

      /* KPI Chart Layouts */
      .kpi-chart-row {
        display: flex;
        gap: 1.5rem;
        align-items: flex-start;
      }
      .kpi-chart-row .analytics-panel {
        flex: 1;
        min-width: 0;
      }
      .kpi-chart-row .kpi-donut-container {
        flex: 0 0 280px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .kpi-donut-wrap {
        position: relative;
        width: 260px;
        height: 260px;
      }
      .kpi-donut-center {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
      }
      .kpi-donut-total {
        font-size: 1.25rem;
        font-weight: 700;
        color: var(--text-primary);
      }
      .kpi-donut-total-label {
        font-size: 0.7rem;
        color: var(--text-muted);
      }
      .kpi-waterfall-container {
        height: 200px;
        margin-top: 1rem;
      }

      /* Analytics Mobile Responsive */
      @media (max-width: 1200px) {
        .analytics-grid-4 {
          grid-template-columns: repeat(2, 1fr);
        }

        .analytics-grid-3 {
          grid-template-columns: repeat(2, 1fr);
        }
      }

      @media (max-width: 768px) {
        .admin-analytics {
          padding: 1rem;
        }

        .kpi-chart-row {
          flex-direction: column;
        }
        .kpi-chart-row .kpi-donut-container {
          flex: none;
          width: 100%;
        }
        .kpi-waterfall-container {
          height: 160px;
        }

        .analytics-grid-4,
        .analytics-grid-3,
        .analytics-grid-2 {
          grid-template-columns: 1fr;
        }

        .analytics-card-value {
          font-size: 1.5rem;
        }

        .analytics-card-header {
          flex-direction: column;
          gap: 0.5rem;
        }

        .sparkline {
          width: 80px;
          height: 24px;
        }

        .sparkline-panel {
          width: 80px;
          height: 28px;
        }

        .panel-header {
          flex-direction: column;
          align-items: flex-start;
          gap: 0.5rem;
        }

        .chart-container {
          height: 180px;
        }

        .chart-modal-content {
          width: 95%;
          max-height: 95vh;
          border-radius: 12px;
        }

        .chart-modal-header {
          padding: 1rem;
        }

        .chart-modal-header h3 {
          font-size: 1rem;
        }

        .chart-modal-body {
          padding: 1rem;
          height: 250px;
        }

        .chart-modal-stats {
          grid-template-columns: repeat(2, 1fr);
          padding: 1rem;
        }

        .modal-stat-value {
          font-size: 1.25rem;
        }

        .kpi-table {
          font-size: 0.75rem;
        }

        .kpi-table th,
        .kpi-table td {
          padding: 0.5rem 0.375rem;
        }
      }

      /* ── Support Tab ── */
      .support-tab {
        flex: 1;
        overflow-y: auto;
        padding: 1.5rem 2rem;
        max-width: 900px;
      }

      .support-subtabs {
        display: flex;
        gap: 0;
        margin-bottom: 1.5rem;
      }

      .support-subtab {
        padding: 0.625rem 1.25rem;
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        color: var(--text-muted);
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }

      .support-subtab:hover {
        color: var(--text-primary);
      }

      .support-subtab.active {
        color: var(--primary-color);
        border-bottom-color: var(--primary-color);
      }

      .support-section {
        margin-bottom: 1.5rem;
      }

      .support-section h3 {
        margin: 0 0 0.75rem 0;
        font-size: 1.1rem;
      }

      .support-card {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        padding: 1.25rem;
      }

      .support-filter-bar {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
      }

      /* ── Ticket List (tl-) ── */
      .tl-toolbar {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 1rem;
        flex-wrap: wrap;
      }

      .tl-filter-group {
        display: flex;
        gap: 0;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 0.2rem;
      }

      .tl-filter-selects {
        display: flex;
        gap: 0.375rem;
        margin-left: 0.25rem;
      }

      .tl-filter-select {
        max-width: 140px;
        font-size: 0.8rem !important;
        padding: 0.3rem 0.5rem !important;
      }

      .tl-toolbar .btn {
        margin-left: auto;
      }

      .tl-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 3rem 1rem;
        color: var(--text-muted);
        gap: 0.75rem;
      }

      .tl-empty p {
        margin: 0;
        font-size: 0.9rem;
      }

      .tl-list {
        display: flex;
        flex-direction: column;
        border: 1px solid var(--border-color);
        border-radius: 10px;
        overflow: hidden;
        background: var(--bg-primary);
      }

      .tl-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        cursor: pointer;
        transition: background 0.15s;
        border-bottom: 1px solid var(--border-color);
      }

      .tl-item:last-child {
        border-bottom: none;
      }

      .tl-item:hover {
        background: var(--bg-secondary);
      }

      .tl-item-left {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.375rem;
        width: 72px;
      }

      .tl-item-ref {
        font-family: monospace;
        font-size: 0.7rem;
        color: var(--text-muted);
        font-weight: 500;
        white-space: nowrap;
      }

      .tl-item-main {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .tl-item-new {
        border-left: 3px solid var(--primary-color);
      }

      .tl-new-badge {
        display: inline-block;
        background: var(--primary-color);
        color: white;
        font-size: 0.6rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        padding: 0.15rem 0.4rem;
        border-radius: 4px;
        flex-shrink: 0;
      }

      .tl-item-subject {
        font-weight: 500;
        font-size: 0.9rem;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .tl-item-bottom {
        display: flex;
        align-items: center;
        gap: 0.625rem;
        font-size: 0.8rem;
        color: var(--text-muted);
        flex-wrap: wrap;
      }

      .tl-item-from {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 200px;
      }

      .tl-item-detail {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        white-space: nowrap;
        font-size: 0.8rem;
      }

      .tl-item-right {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.375rem;
      }

      .tl-item-time {
        font-size: 0.75rem;
        color: var(--text-muted);
        white-space: nowrap;
      }

      .tl-item-badges {
        display: flex;
        align-items: center;
        gap: 0.375rem;
      }

      .support-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.875rem;
      }

      .support-table th {
        text-align: left;
        padding: 0.625rem 0.75rem;
        border-bottom: 2px solid var(--border-color);
        color: var(--text-muted);
        font-weight: 600;
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }

      .support-table td {
        padding: 0.625rem 0.75rem;
        border-bottom: 1px solid var(--border-color);
      }

      .ticket-row {
        cursor: pointer;
        transition: background 0.15s;
      }

      .ticket-row:hover {
        background: var(--bg-secondary);
      }

      .ticket-status-badge {
        display: inline-block;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 500;
      }

      .ticket-status-open {
        background: #dbeafe;
        color: #1e40af;
      }

      .ticket-status-closed {
        background: #f3f4f6;
        color: #6b7280;
      }

      .ticket-status-archived {
        background: #fef3c7;
        color: #92400e;
      }

      .ai-draft-indicator {
        display: inline-block;
        padding: 0.1rem 0.4rem;
        border-radius: 4px;
        font-size: 0.7rem;
        font-weight: 600;
      }
      .ai-draft-pending {
        background: #ede9fe;
        color: #7c3aed;
      }
      .ai-draft-sent {
        background: #d1fae5;
        color: #065f46;
      }

      /* GitHub Badges */
      .gh-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 4px;
        cursor: pointer;
        border: none;
        padding: 0;
        text-decoration: none;
      }
      .gh-badge-linked {
        background: #dbeafe;
        color: #1d4ed8;
      }
      .gh-badge-create {
        background: #f3f4f6;
        color: #9ca3af;
      }
      .gh-badge-create:hover {
        background: #e5e7eb;
        color: #6b7280;
      }

      /* GitHub Pills (thread topbar) */
      .gh-pill {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.3rem 0.75rem;
        border-radius: 999px;
        font-size: 0.78rem;
        font-weight: 500;
        border: none;
        cursor: pointer;
        text-decoration: none;
        white-space: nowrap;
        line-height: 1.2;
      }
      .gh-pill-create {
        background: #f3f4f6;
        color: #374151;
        border: 1px solid #d1d5db;
      }
      .gh-pill-create:hover {
        background: #e5e7eb;
        border-color: #9ca3af;
      }
      .gh-pill-linked {
        background: #dbeafe;
        color: #1d4ed8;
        border: 1px solid #bfdbfe;
      }
      .gh-pill-linked:hover {
        background: #bfdbfe;
      }

      /* GitHub pills inside ticket list badges row — slightly smaller */
      .tl-item-badges .gh-pill {
        font-size: 0.7rem;
        padding: 0.15rem 0.5rem;
      }

      /* Priority Badges */
      .priority-badge {
        display: inline-block;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 500;
        text-transform: capitalize;
      }
      .priority-low { background: #f3f4f6; color: #6b7280; }
      .priority-medium { background: #dbeafe; color: #1e40af; }
      .priority-high { background: #ffedd5; color: #c2410c; }
      .priority-urgent { background: #fee2e2; color: #dc2626; }

      /* Tag Pills */
      .tag-pill {
        display: inline-block;
        padding: 0.1rem 0.5rem;
        border-radius: 999px;
        font-size: 0.7rem;
        font-weight: 500;
        background: #e0e7ff;
        color: #4338ca;
      }

      /* New Ticket Form */
      .new-ticket-form {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        padding: 1.25rem;
        margin-bottom: 1rem;
      }

      .behalf-suggestions {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        z-index: 100;
        max-height: 200px;
        overflow-y: auto;
        margin-top: 2px;
      }

      .behalf-suggestion-item {
        padding: 0.5rem 0.75rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.85rem;
        border-bottom: 1px solid var(--border-color);
      }

      .behalf-suggestion-item:last-child {
        border-bottom: none;
      }

      .behalf-suggestion-item:hover {
        background: var(--bg-secondary);
      }

      .behalf-suggestion-item strong {
        color: var(--text-primary);
      }

      .behalf-suggestion-item span {
        color: var(--text-muted);
        font-size: 0.8rem;
      }

      /* ── Thread View (tv-) ── */
      .thread-view {
        flex: 1;
        overflow-y: auto;
        padding: 1.5rem 2rem;
        max-width: 900px;
      }

      .thread-back-btn {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        flex-shrink: 0;
      }

      .tv-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1rem;
      }

      .tv-topbar-right {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .tv-subject-row {
        display: flex;
        align-items: baseline;
        gap: 0.625rem;
        margin-bottom: 0.75rem;
      }

      .tv-ref-badge {
        font-family: monospace;
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--primary-color);
        background: var(--primary-color-light, #eef2ff);
        padding: 0.2rem 0.5rem;
        border-radius: 6px;
        white-space: nowrap;
        flex-shrink: 0;
      }

      .tv-subject {
        font-size: 1.25rem;
        font-weight: 700;
        margin: 0;
        color: var(--text-primary);
        line-height: 1.3;
      }

      .tv-meta {
        display: flex;
        gap: 1.25rem;
        flex-wrap: wrap;
        margin-bottom: 1rem;
        font-size: 0.85rem;
        color: var(--text-muted);
      }

      .tv-meta-item {
        display: flex;
        align-items: center;
        gap: 0.375rem;
      }

      .tv-meta-item strong {
        color: var(--text-primary);
        font-weight: 500;
      }

      /* Sidebar fields card */
      .tv-sidebar-fields {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 0.75rem;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        padding: 1rem;
        margin-bottom: 1.5rem;
      }

      .tv-field-group {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .tv-field-group label {
        font-size: 0.7rem;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .tv-field-group .form-input {
        font-size: 0.85rem;
        padding: 0.35rem 0.5rem;
      }

      .tv-tags-list {
        display: flex;
        gap: 0.25rem;
        flex-wrap: wrap;
        margin-top: 0.375rem;
      }

      /* Section labels */
      .tv-section-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin-bottom: 0.75rem;
        padding-bottom: 0.5rem;
        border-bottom: 1px solid var(--border-color);
      }

      /* Messages */
      .tv-messages {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        margin-bottom: 1.5rem;
      }

      .tv-msg {
        display: flex;
        gap: 0.75rem;
        align-items: flex-start;
      }

      .tv-msg-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.8rem;
        font-weight: 600;
        flex-shrink: 0;
        background: var(--bg-secondary);
        color: var(--text-muted);
        border: 1px solid var(--border-color);
      }

      .tv-msg-inbound .tv-msg-avatar {
        background: #dbeafe;
        color: #2563eb;
        border-color: #93c5fd;
      }

      .tv-msg-outbound .tv-msg-avatar {
        background: #ede9fe;
        color: #7c3aed;
        border-color: #c4b5fd;
      }

      .tv-msg-content {
        flex: 1;
        min-width: 0;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        padding: 0.875rem;
      }

      .tv-msg-outbound .tv-msg-content {
        background: #eef2ff;
        border-color: #c7d2fe;
      }

      .tv-msg-ai .tv-msg-content {
        background: #faf5ff;
        border-color: #e9d5ff;
      }

      .tv-msg-ai .tv-msg-avatar {
        background: #ede9fe;
        color: #7c3aed;
        font-size: 0.65rem;
        font-weight: 700;
      }

      .tv-ai-tag {
        display: inline-block;
        background: #ede9fe;
        color: #7c3aed;
        font-size: 0.6rem;
        font-weight: 700;
        padding: 0.1rem 0.35rem;
        border-radius: 4px;
        margin-left: 0.35rem;
        vertical-align: middle;
      }

      .tv-msg-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 0.375rem;
        font-size: 0.85rem;
      }

      .tv-msg-header strong {
        color: var(--text-primary);
      }

      .tv-msg-header span {
        color: var(--text-muted);
        font-size: 0.75rem;
        flex-shrink: 0;
        margin-left: 0.75rem;
      }

      .tv-msg-body {
        font-size: 0.875rem;
        line-height: 1.6;
        color: var(--text-primary);
        white-space: pre-wrap;
        word-break: break-word;
      }

      /* Attachment thumbnails in thread messages */
      .tv-msg-attachments {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 0.5rem;
      }

      .tv-attachment-thumb {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.25rem;
        padding: 0.35rem;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        background: var(--bg-primary);
        text-decoration: none;
        color: var(--text-muted);
        max-width: 150px;
        transition: border-color 0.15s, box-shadow 0.15s;
      }

      .tv-attachment-thumb:hover {
        border-color: var(--primary-color);
        box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
      }

      .tv-attachment-thumb img {
        max-width: 140px;
        max-height: 100px;
        object-fit: cover;
        border-radius: 4px;
      }

      .tv-attachment-thumb span {
        font-size: 0.7rem;
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 140px;
      }

      /* New ticket image upload */
      .new-ticket-images-area {
        margin-bottom: 0.75rem;
      }

      .new-ticket-images-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        font-size: 0.8rem;
        padding: 0.35rem 0.75rem;
        border: 1px dashed var(--border-color);
        border-radius: 6px;
        background: transparent;
        color: var(--text-muted);
        cursor: pointer;
        transition: border-color 0.15s, color 0.15s;
      }

      .new-ticket-images-btn:hover {
        border-color: var(--primary-color);
        color: var(--primary-color);
      }

      .new-ticket-image-previews {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 0.5rem;
      }

      .new-ticket-image-preview {
        position: relative;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        overflow: hidden;
      }

      .new-ticket-image-preview img {
        width: 80px;
        height: 60px;
        object-fit: cover;
        display: block;
      }

      .new-ticket-image-remove {
        position: absolute;
        top: 2px;
        right: 2px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        border: none;
        background: rgba(0,0,0,0.6);
        color: white;
        font-size: 12px;
        line-height: 1;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }

      /* AI Draft */
      .tv-draft {
        background: #faf5ff;
        border: 2px solid #c4b5fd;
        border-radius: 10px;
        padding: 1rem;
        margin-bottom: 1.5rem;
      }

      .tv-draft-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 600;
        font-size: 0.85rem;
        color: #7c3aed;
        margin-bottom: 0.75rem;
      }

      .tv-draft-body {
        font-size: 0.875rem;
        line-height: 1.6;
        margin-bottom: 0.75rem;
        padding: 0.75rem;
        background: white;
        border-radius: 8px;
        border: 1px solid #e9d5ff;
      }

      .tv-draft-actions {
        display: flex;
        gap: 0.5rem;
      }

      /* Reply */
      .tv-reply {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        padding: 1rem;
        margin-bottom: 1.5rem;
      }

      .tv-reply textarea {
        resize: vertical;
        min-height: 70px;
        border: none;
        padding: 0;
        font-size: 0.875rem;
        background: transparent;
      }

      .tv-reply textarea:focus {
        outline: none;
        box-shadow: none;
      }

      .tv-reply-footer {
        display: flex;
        justify-content: flex-end;
        padding-top: 0.75rem;
        border-top: 1px solid var(--border-color);
        margin-top: 0.5rem;
      }

      /* Notes */
      .tv-notes {
        margin-bottom: 1.5rem;
      }

      .tv-note {
        background: #fefce8;
        border: 1px solid #fde68a;
        border-radius: 8px;
        padding: 0.75rem;
        margin-bottom: 0.5rem;
      }

      .tv-note-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 0.25rem;
        font-size: 0.8rem;
      }

      .tv-note-header strong {
        color: var(--text-primary);
      }

      .tv-note-header span {
        color: var(--text-muted);
        font-size: 0.75rem;
      }

      .tv-note-body {
        font-size: 0.85rem;
        line-height: 1.4;
        color: var(--text-primary);
      }

      .tv-notes-empty {
        color: var(--text-muted);
        font-size: 0.85rem;
        margin: 0 0 0.75rem 0;
      }

      .tv-note-input {
        display: flex;
        gap: 0.5rem;
        align-items: flex-end;
        margin-top: 0.75rem;
      }

      .tv-note-input textarea {
        flex: 1;
        resize: vertical;
        min-height: 44px;
        font-size: 0.85rem;
      }

      .tv-note-input .btn {
        flex-shrink: 0;
        font-size: 0.8rem;
        padding: 0.4rem 0.75rem;
      }

      /* ── Notifications Tab ── */
      .notif-section-desc {
        color: var(--text-muted);
        font-size: 0.875rem;
        margin: -0.25rem 0 1rem 0;
      }

      .notif-channels-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1rem;
      }

      .notif-channel-card {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        overflow: hidden;
        transition: border-color 0.2s;
      }

      .notif-channel-card:focus-within {
        border-color: var(--primary-color);
      }

      .notif-channel-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem 1rem 0.75rem;
      }

      .notif-channel-icon {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .notif-channel-icon-sms {
        background: #dcfce7;
        color: #16a34a;
      }

      .notif-channel-icon-email {
        background: #dbeafe;
        color: #2563eb;
      }

      .notif-channel-icon-slack {
        background: #fef3c7;
        color: #d97706;
      }

      .notif-channel-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
      }

      .notif-channel-name {
        font-weight: 600;
        font-size: 0.9rem;
        color: var(--text-primary);
      }

      .notif-channel-status {
        font-size: 0.75rem;
        font-weight: 500;
      }

      .notif-status-active {
        color: #16a34a;
      }

      .notif-status-inactive {
        color: var(--text-muted);
      }

      .notif-status-disconnected {
        color: #dc2626;
      }

      .notif-channel-body {
        padding: 0 1rem 1rem;
      }

      .notif-channel-body .form-input {
        font-size: 0.85rem;
      }

      .notif-test-btn {
        font-size: 0.75rem !important;
        padding: 0.3rem 0.6rem !important;
        flex-shrink: 0;
      }

      /* Alert Matrix Table */
      .notif-matrix {
        width: 100%;
        border-collapse: collapse;
      }

      .notif-matrix thead th {
        padding: 0.75rem 1rem;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--text-muted);
        border-bottom: 1px solid var(--border-color);
        background: var(--bg-secondary);
      }

      .notif-matrix tbody tr {
        transition: background 0.15s;
      }

      .notif-matrix tbody tr:hover {
        background: var(--bg-secondary);
      }

      .notif-matrix tbody tr:not(:last-child) td {
        border-bottom: 1px solid var(--border-color);
      }

      .notif-matrix td {
        padding: 0.875rem 1rem;
      }

      .notif-matrix-event {
        text-align: left;
      }

      .notif-matrix-channel {
        text-align: center;
        width: 80px;
      }

      .notif-event-name {
        font-weight: 500;
        font-size: 0.9rem;
        color: var(--text-primary);
      }

      .notif-event-desc {
        font-size: 0.8rem;
        color: var(--text-muted);
        margin-top: 0.125rem;
      }

      /* Toggle Switch */
      .notif-toggle {
        position: relative;
        display: inline-block;
        width: 36px;
        height: 20px;
        cursor: pointer;
      }

      .notif-toggle input {
        opacity: 0;
        width: 0;
        height: 0;
      }

      .notif-toggle-slider {
        position: absolute;
        inset: 0;
        background: #d1d5db;
        border-radius: 20px;
        transition: background 0.2s;
      }

      .notif-toggle-slider::before {
        content: '';
        position: absolute;
        width: 16px;
        height: 16px;
        left: 2px;
        bottom: 2px;
        background: white;
        border-radius: 50%;
        transition: transform 0.2s;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
      }

      .notif-toggle input:checked + .notif-toggle-slider {
        background: var(--primary-color);
      }

      .notif-toggle input:checked + .notif-toggle-slider::before {
        transform: translateX(16px);
      }

      .notif-toggle input:focus-visible + .notif-toggle-slider {
        outline: 2px solid var(--primary-color);
        outline-offset: 2px;
      }

      @media (max-width: 768px) {
        .notif-channels-grid {
          grid-template-columns: 1fr;
        }

        .notif-matrix-channel {
          width: 60px;
        }

        .notif-matrix td {
          padding: 0.75rem 0.5rem;
        }

        .notif-matrix thead th {
          padding: 0.625rem 0.5rem;
          font-size: 0.7rem;
        }

        .notif-event-name {
          font-size: 0.85rem;
        }

        .notif-event-desc {
          font-size: 0.75rem;
        }
      }

      @media (max-width: 768px) {
        .support-tab,
        .thread-view {
          padding: 1rem;
        }

        .support-table {
          font-size: 0.8rem;
        }

        .support-table th,
        .support-table td {
          padding: 0.5rem;
        }

        .support-filter-bar {
          flex-wrap: wrap;
        }

        .tl-toolbar {
          gap: 0.375rem;
        }

        .tl-filter-selects {
          width: 100%;
          order: 10;
        }

        .tl-filter-select {
          flex: 1;
        }

        .tl-item-left {
          width: 56px;
        }

        .tl-item-from {
          max-width: 120px;
        }

        .tv-sidebar-fields {
          grid-template-columns: 1fr 1fr;
        }

        .tv-msg-avatar {
          display: none;
        }

        .tv-subject {
          font-size: 1.1rem;
        }

        .tv-note-input {
          flex-direction: column;
        }

        .tv-note-input .btn {
          align-self: flex-end;
        }
      }

      /* ── Blog Badges ── */
      .admin-badge {
        display: inline-block;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 500;
      }
      .badge-success {
        background: #dcfce7;
        color: #16a34a;
      }
      .badge-warning {
        background: #fef3c7;
        color: #d97706;
      }
      .badge-info {
        background: #dbeafe;
        color: #2563eb;
      }

      /* ── Blog Tab ── */
      .blog-tab {
        max-width: 1100px;
      }

      /* Blog Admin Table */
      .admin-table-wrapper {
        overflow-x: auto;
      }

      .admin-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.875rem;
      }

      .admin-table th {
        text-align: left;
        padding: 0.625rem 0.75rem;
        font-weight: 600;
        font-size: 0.75rem;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        border-bottom: 2px solid var(--border-color);
      }

      .admin-table td {
        padding: 0.625rem 0.75rem;
        border-bottom: 1px solid var(--border-color);
        vertical-align: middle;
      }

      .admin-table tbody tr:hover {
        background: var(--bg-secondary, #f8fafc);
      }

      .admin-badge {
        display: inline-block;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        font-size: 0.7rem;
        font-weight: 600;
      }

      .badge-success {
        background: #dcfce7;
        color: #166534;
      }

      .badge-warning {
        background: #fef9c3;
        color: #854d0e;
      }

      .badge-info {
        background: #dbeafe;
        color: #1e40af;
      }

      .blog-list-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1rem;
      }

      .blog-list-header h3 {
        margin: 0;
      }

      .blog-list-header .btn svg {
        margin-right: 0.25rem;
        vertical-align: -2px;
      }

      .blog-post-title-cell strong {
        display: block;
        font-size: 0.9rem;
      }

      .blog-tags-preview {
        font-size: 0.75rem;
        color: var(--text-muted);
      }

      .blog-actions {
        display: flex;
        gap: 0.375rem;
      }

      .blog-editor-form {
        margin-top: 1rem;
      }

      .blog-editor-grid {
        display: grid;
        grid-template-columns: 1fr 320px;
        gap: 1.5rem;
        align-items: start;
      }

      .blog-editor-main .form-group,
      .blog-editor-sidebar .form-group {
        margin-bottom: 1rem;
      }

      .blog-editor-main label,
      .blog-editor-sidebar label {
        display: block;
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin-bottom: 0.375rem;
      }

      #blog-quill-editor {
        min-height: 400px;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-top: none;
        border-radius: 0 0 8px 8px;
        font-size: 0.95rem;
      }

      #blog-quill-editor .ql-editor {
        min-height: 400px;
      }

      .blog-status-toggle {
        display: flex;
        gap: 0;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 0.25rem;
      }

      .blog-status-btn {
        flex: 1;
        padding: 0.5rem 0.75rem;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: var(--text-muted);
        font-size: 0.85rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
      }

      .blog-status-btn:hover {
        color: var(--text-primary);
      }

      .blog-status-btn.active {
        background: var(--primary-color);
        color: white;
      }

      .form-hint {
        display: block;
        font-size: 0.75rem;
        color: var(--text-muted);
        margin-top: 0.25rem;
      }

      .blog-editor-sidebar {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        padding: 1.25rem;
        position: sticky;
        top: 1rem;
      }

      .blog-schedule-group {
        padding: 0.75rem;
        background: #eef2ff;
        border: 1px solid #c7d2fe;
        border-radius: 8px;
      }

      .blog-schedule-group label {
        color: #4338ca !important;
      }

      .blog-editor-actions {
        margin-top: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .btn-block {
        display: block;
        width: 100%;
      }

      /* Quill image resize overlay */
      .ql-img-overlay {
        position: absolute;
        border: 2px solid var(--primary-color, #4f46e5);
        pointer-events: none;
        z-index: 10;
      }

      .ql-img-resize-actions {
        pointer-events: all;
        position: absolute;
        top: -36px;
        left: 0;
        display: flex;
        gap: 2px;
        background: var(--bg-primary, #fff);
        border: 1px solid var(--border-color, #e2e8f0);
        border-radius: 6px;
        padding: 3px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.12);
        white-space: nowrap;
      }

      .ql-img-resize-actions button {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 4px 8px;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: var(--text-primary, #1e293b);
        font-size: 0.7rem;
        font-weight: 600;
        cursor: pointer;
        min-width: 28px;
        height: 26px;
        transition: background 0.15s;
      }

      .ql-img-resize-actions button:hover {
        background: var(--bg-secondary, #f1f5f9);
      }

      .ql-img-handle-se {
        pointer-events: all;
        position: absolute;
        right: -5px;
        bottom: -5px;
        width: 10px;
        height: 10px;
        background: var(--primary-color, #4f46e5);
        border: 2px solid white;
        border-radius: 2px;
        cursor: se-resize;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      }

      /* Quill editor images should be resizable */
      #blog-quill-editor .ql-editor img {
        cursor: pointer;
        max-width: 100%;
        height: auto;
      }

      /* Wider toolbar for more controls */
      .blog-editor-main .ql-toolbar {
        border-radius: 8px 8px 0 0;
        background: var(--bg-secondary, #f8fafc);
        flex-wrap: wrap;
      }

      .blog-editor-main .ql-container {
        border-radius: 0 0 8px 8px;
      }

      /* Twitter/X Button & Badge */
      .btn-twitter {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        background: #000;
        color: #fff;
        border: none;
        padding: 0.5rem 0.875rem;
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s;
      }

      .btn-twitter:hover {
        background: #333;
      }

      .btn-twitter:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .btn-twitter-disconnect {
        background: #dc2626;
      }

      .btn-twitter-disconnect:hover {
        background: #b91c1c;
      }

      .btn-twitter svg {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
      }

      .badge-twitter-posted {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.1rem 0.4rem;
        border-radius: 4px;
        font-size: 0.65rem;
        font-weight: 600;
        background: #e7e7e7;
        color: #333;
        vertical-align: middle;
        margin-left: 0.375rem;
      }

      .badge-twitter-posted svg {
        width: 10px;
        height: 10px;
      }

      .blog-twitter-section {
        margin-top: 1rem;
        padding-top: 1rem;
        border-top: 1px solid var(--border-color);
      }

      .blog-twitter-section label {
        margin-bottom: 0.5rem;
      }

      .blog-twitter-info {
        font-size: 0.75rem;
        color: var(--text-muted);
        margin-top: 0.375rem;
      }

      .twitter-connect-section {
        padding: 1rem;
        background: #f8f8f8;
        border: 1px dashed var(--border-color);
        border-radius: 8px;
        text-align: center;
      }

      .twitter-connect-section p {
        margin: 0 0 0.75rem 0;
        font-size: 0.85rem;
        color: var(--text-muted);
      }

      @media (max-width: 900px) {
        .blog-editor-grid {
          grid-template-columns: 1fr;
        }

        .blog-editor-sidebar {
          position: static;
        }

        #blog-quill-editor {
          min-height: 300px;
        }

        #blog-quill-editor .ql-editor {
          min-height: 300px;
        }
      }

      /* ── Directories Tab ── */
      .directories-tab {
        max-width: 1100px;
      }

      .dir-kit-section {
        margin-bottom: 1.5rem;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        overflow: hidden;
      }

      .dir-kit-toggle {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
        padding: 0.875rem 1rem;
        background: none;
        border: none;
        cursor: pointer;
        font-size: 0.9rem;
        font-weight: 500;
        color: var(--text-primary);
        text-align: left;
      }

      .dir-kit-toggle:hover {
        background: var(--bg-secondary);
      }

      .dir-kit-toggle svg {
        transition: transform 0.2s;
        flex-shrink: 0;
        color: var(--text-muted);
      }

      .dir-kit-toggle.open svg {
        transform: rotate(90deg);
      }

      .dir-kit-content {
        padding: 0 1rem 1rem;
        border-top: 1px solid var(--border-color);
      }

      .dir-kit-grid {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding-top: 1rem;
      }

      .dir-kit-item {
        background: var(--bg-secondary);
        border-radius: 8px;
        padding: 0.875rem;
      }

      .dir-kit-item-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.5rem;
      }

      .dir-kit-item-header strong {
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--text-muted);
      }

      .dir-copy-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.25rem 0.5rem !important;
        font-size: 0.7rem !important;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        cursor: pointer;
        color: var(--text-muted);
        transition: all 0.15s;
      }

      .dir-copy-btn:hover {
        color: var(--primary-color);
        border-color: var(--primary-color);
      }

      .dir-kit-text {
        margin: 0;
        font-size: 0.875rem;
        line-height: 1.5;
        color: var(--text-primary);
      }

      .dir-kit-long {
        max-height: 200px;
        overflow-y: auto;
      }

      .dir-kit-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 1rem;
      }

      .dir-kit-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.375rem;
      }

      .dir-kit-tag {
        display: inline-block;
        padding: 0.2rem 0.5rem;
        background: #e0e7ff;
        color: #4338ca;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 500;
      }

      .dir-kit-features {
        margin: 0;
        padding-left: 1.25rem;
        font-size: 0.85rem;
        line-height: 1.7;
        color: var(--text-primary);
      }

      /* Directory Table */
      .dir-table td {
        vertical-align: middle;
      }

      .dir-name-link {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        font-weight: 500;
        color: var(--text-primary);
        text-decoration: none;
      }

      .dir-name-link:hover {
        color: var(--primary-color);
      }

      .dir-name-link svg {
        opacity: 0;
        transition: opacity 0.15s;
      }

      .dir-name-link:hover svg {
        opacity: 1;
      }

      .dir-status-select {
        padding: 0.3rem 0.5rem;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 500;
        cursor: pointer;
        background: var(--bg-primary);
        min-width: 100px;
      }

      .dir-status-pending { color: #d97706; border-color: #fde68a; background: #fefce8; }
      .dir-status-submitted { color: #2563eb; border-color: #93c5fd; background: #eff6ff; }
      .dir-status-approved { color: #16a34a; border-color: #86efac; background: #f0fdf4; }
      .dir-status-rejected { color: #dc2626; border-color: #fca5a5; background: #fef2f2; }
      .dir-status-live { color: #059669; border-color: #6ee7b7; background: #ecfdf5; }

      .dir-priority-badge {
        display: inline-block;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 500;
        text-transform: capitalize;
      }

      .dir-priority-critical { background: #fee2e2; color: #dc2626; }
      .dir-priority-high { background: #ffedd5; color: #c2410c; }
      .dir-priority-medium { background: #dbeafe; color: #1e40af; }
      .dir-priority-low { background: #f3f4f6; color: #6b7280; }

      .dir-cost-paid {
        color: #dc2626;
        font-weight: 500;
      }

      .dir-listing-link {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.8rem;
        color: #16a34a;
        text-decoration: none;
        font-weight: 500;
      }

      .dir-listing-link:hover {
        text-decoration: underline;
      }

      .dir-notes-cell {
        max-width: 180px;
      }

      .dir-notes-text {
        font-size: 0.8rem;
        color: var(--text-muted);
      }

      .btn-outline {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        padding: 0.3rem 0.6rem;
        border-radius: 6px;
        font-size: 0.8rem;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        transition: all 0.15s;
        cursor: pointer;
      }

      .btn-outline:hover {
        border-color: var(--primary-color);
        color: var(--primary-color);
      }

      .btn-ghost {
        background: none;
        border: none;
        padding: 0.375rem;
        cursor: pointer;
        color: var(--text-muted);
        border-radius: 6px;
        transition: all 0.15s;
      }

      .btn-ghost:hover {
        background: var(--bg-secondary);
        color: var(--text-primary);
      }

      .btn-danger {
        background: #dc2626;
        color: white;
        border: none;
      }

      .btn-danger:hover {
        background: #b91c1c;
      }

      .badge-live {
        background: #ecfdf5;
        color: #059669;
      }

      .badge-danger {
        background: #fef2f2;
        color: #dc2626;
      }

      .text-muted {
        color: var(--text-muted);
        font-size: 0.8rem;
      }

      /* Review Stats */
      .review-stats-grid {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 1rem;
        margin-bottom: 1.5rem;
      }

      .review-stat-card {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        padding: 1rem;
        text-align: center;
      }

      .review-stat-value {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--text-primary);
      }

      .review-stat-label {
        font-size: 0.8rem;
        color: var(--text-muted);
        margin-top: 0.25rem;
      }

      @media (max-width: 768px) {
        .review-stats-grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }

      @media (max-width: 768px) {
        .dir-table {
          font-size: 0.8rem;
        }

        .dir-table th,
        .dir-table td {
          padding: 0.5rem 0.375rem;
        }

        .dir-notes-cell {
          display: none;
        }

        .dir-kit-row {
          grid-template-columns: 1fr;
        }
      }

      /* Monitor / Social Listening Tab */
      .monitor-platform-badge {
        display: inline-block;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 600;
        white-space: nowrap;
      }

      .monitor-filters {
        padding: 0 0.25rem;
      }

      .monitor-toggle-label {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        cursor: pointer;
      }

      .monitor-toggle-label input[type="checkbox"] {
        width: 16px;
        height: 16px;
        cursor: pointer;
      }

      @media (max-width: 768px) {
        .monitor-tab .review-stats-grid {
          grid-template-columns: repeat(3, 1fr) !important;
        }
      }
    `;
    document.head.appendChild(style);
  }
};
