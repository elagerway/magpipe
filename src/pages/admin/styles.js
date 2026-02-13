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
        border-bottom: 1px solid var(--border-color);
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
        background: #ede9fe;
        color: #7c3aed;
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

      /* Ticket Meta Bar (Submitted By / Ref) */
      .ticket-meta-bar {
        display: flex;
        gap: 1.5rem;
        flex-wrap: wrap;
        padding: 0.5rem 0;
        margin-bottom: 0.75rem;
        font-size: 0.85rem;
        color: var(--text-muted);
      }

      .ticket-meta-item strong {
        color: var(--text-primary);
        font-weight: 500;
      }

      /* Ticket Detail Fields */
      .ticket-detail-fields {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        padding: 1rem;
        margin-bottom: 1.5rem;
      }
      .ticket-detail-row {
        display: flex;
        gap: 0.75rem;
        align-items: flex-end;
        flex-wrap: wrap;
      }
      .ticket-detail-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 120px;
        flex: 1;
      }
      .ticket-detail-field label {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .ticket-detail-field .form-input {
        font-size: 0.85rem;
        padding: 0.35rem 0.5rem;
      }

      /* Internal Notes */
      .ticket-notes-section {
        margin-bottom: 1.5rem;
        padding-top: 1rem;
        border-top: 1px solid var(--border-color);
      }
      .ticket-note {
        background: #fefce8;
        border: 1px solid #fde68a;
        border-radius: 8px;
        padding: 0.75rem;
        margin-bottom: 0.5rem;
      }
      .ticket-note-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 0.25rem;
        font-size: 0.8rem;
      }
      .ticket-note-header span {
        color: var(--text-muted);
        font-size: 0.75rem;
      }
      .ticket-note-body {
        font-size: 0.85rem;
        line-height: 1.4;
      }
      .ticket-note-input {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-top: 0.75rem;
      }
      .ticket-note-input textarea {
        resize: vertical;
        min-height: 50px;
        font-size: 0.85rem;
      }

      /* New Ticket Form */
      .new-ticket-form {
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        border-radius: 10px;
        padding: 1.25rem;
        margin-bottom: 1rem;
      }

      /* Thread View */
      .thread-view {
        flex: 1;
        overflow-y: auto;
        padding: 1.5rem 2rem;
        max-width: 900px;
      }

      .thread-header {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.5rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid var(--border-color);
      }

      .thread-back-btn {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        flex-shrink: 0;
      }

      .thread-messages {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin-bottom: 1.5rem;
      }

      .thread-message {
        padding: 1rem;
        border-radius: 10px;
        border: 1px solid var(--border-color);
      }

      .thread-message-inbound {
        background: var(--bg-secondary);
      }

      .thread-message-outbound {
        background: #f5f3ff;
        border-color: #c4b5fd;
      }

      .thread-message-header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        margin-bottom: 0.5rem;
      }

      .thread-message-body {
        font-size: 0.9rem;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
      }

      /* AI Draft Card */
      .ai-draft-card {
        background: #faf5ff;
        border: 2px solid #c4b5fd;
        border-radius: 10px;
        padding: 1.25rem;
        margin-bottom: 1.5rem;
      }

      .ai-draft-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 600;
        color: #7c3aed;
        margin-bottom: 0.75rem;
      }

      .ai-draft-body {
        font-size: 0.9rem;
        line-height: 1.5;
        margin-bottom: 1rem;
        padding: 0.75rem;
        background: white;
        border-radius: 6px;
        border: 1px solid #e9d5ff;
      }

      .ai-draft-actions {
        display: flex;
        gap: 0.5rem;
      }

      /* Reply Area */
      .reply-area {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      .reply-area textarea {
        resize: vertical;
        min-height: 80px;
      }

      .reply-area .btn {
        align-self: flex-end;
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

        .thread-header {
          flex-wrap: wrap;
        }

        .support-filter-bar {
          flex-wrap: wrap;
        }

        .ticket-detail-row {
          flex-direction: column;
        }

        .ticket-detail-field {
          min-width: 100%;
        }
      }
    `;
    document.head.appendChild(style);
  }
};
