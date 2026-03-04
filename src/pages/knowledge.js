/**
 * Knowledge Base Page
 */

import { getCurrentUser } from '../lib/supabase.js';
import { renderBottomNav } from '../components/BottomNav.js';
import { createKnowledgeSourceManager, addKnowledgeSourceManagerStyles } from '../components/KnowledgeSourceManager.js';

export default class KnowledgePage {
  constructor() {
    this.knowledgeManager = null;
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    // Add styles
    addKnowledgeSourceManagerStyles();

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container with-bottom-nav" style="max-width: 900px; padding-top: 1.5rem;">
        <div class="card">
          <h1 style="margin-bottom: 0.5rem;">Knowledge Base</h1>
          <p class="text-muted" style="margin-bottom: 1.5rem;">
            Add documents, websites, and other sources to give your AI assistant context about your business.
          </p>
          <div id="knowledge-source-container"></div>
        </div>
      </div>
      ${renderBottomNav('/knowledge')}
    `;

    // Initialize the knowledge source manager
    const knowledgeContainer = document.getElementById('knowledge-source-container');
    if (knowledgeContainer) {
      this.knowledgeManager = createKnowledgeSourceManager(knowledgeContainer);
    }
  }
}
