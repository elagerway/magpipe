export const chatTabMethods = {
  async renderChatTab() {
    const content = document.getElementById('admin-tab-content');
    content.innerHTML = `
      <div class="admin-chat-tab">
        <div id="omni-chat-container" class="omni-chat-container">
          <div class="loading-spinner">Loading chat interface...</div>
        </div>
      </div>
    `;

    try {
      const { createOmniChatInterface, addOmniChatStyles } = await import('../../components/OmniChatInterface.js');
      addOmniChatStyles();

      const container = document.getElementById('omni-chat-container');
      container.innerHTML = '';
      this.omniChat = createOmniChatInterface(container, this.session);
    } catch (error) {
      console.error('Failed to load OmniChatInterface:', error);
      const container = document.getElementById('omni-chat-container');
      container.innerHTML = `
        <div class="detail-placeholder">
          <p style="color: var(--error-color);">Failed to load chat interface: ${error.message}</p>
        </div>
      `;
    }
  },
};
