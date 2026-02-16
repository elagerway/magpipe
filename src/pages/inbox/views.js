import { supabase } from '../../lib/supabase.js';
import { setPhoneNavActive } from '../../components/BottomNav.js';
import { User, ChatSession } from '../../models/index.js';
import { isVoiceSupported } from './voice-loader.js';

// Image lightbox for attachment thumbnails
window.openImageLightbox = function(url, filename) {
  // Remove existing lightbox if any
  const existing = document.getElementById('image-lightbox-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'image-lightbox-overlay';
  overlay.className = 'contact-modal-overlay';
  overlay.style.display = 'flex';
  overlay.onclick = () => overlay.remove();
  overlay.innerHTML = `
    <div class="image-lightbox" onclick="event.stopPropagation()">
      <div class="image-lightbox-header">
        <span class="image-lightbox-filename">${filename}</span>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <a href="${url}" target="_blank" rel="noopener" class="image-lightbox-open" title="Open in new tab">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
          <button class="close-modal-btn" onclick="document.getElementById('image-lightbox-overlay').remove()">&times;</button>
        </div>
      </div>
      <div class="image-lightbox-body">
        <img src="${url}" alt="${filename}">
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
};

export const viewsMethods = {
  renderConversationList() {
    // Filter out hidden conversations
    let visibleConversations = this.conversations.filter(conv => {
      const convKey = this.getConversationKey(conv);
      return !this.hiddenConversations.has(convKey);
    });

    // Apply type filter (calls/texts/chat)
    if (this.typeFilter !== 'all') {
      visibleConversations = visibleConversations.filter(conv => {
        if (this.typeFilter === 'calls') return conv.type === 'call';
        if (this.typeFilter === 'texts') return conv.type === 'sms';
        if (this.typeFilter === 'chat') return conv.type === 'chat';
        if (this.typeFilter === 'email') return conv.type === 'email';
        return true;
      });
    }

    // Apply direction filter (in/out) - based on how the conversation started
    // Note: Chat doesn't have direction, so it's always included when filter is active
    if (this.directionFilter !== 'all') {
      visibleConversations = visibleConversations.filter(conv => {
        if (conv.type === 'chat') {
          // Chat is always considered "inbound" since visitors initiate
          return this.directionFilter === 'inbound';
        } else if (conv.type === 'email') {
          // For email, check direction of first message
          const firstMsg = conv.messages?.[0];
          return firstMsg?.direction === this.directionFilter;
        } else if (conv.type === 'call') {
          return conv.call?.direction === this.directionFilter;
        } else {
          // For SMS, check direction of first message (how conversation started)
          const firstMessage = conv.messages?.[0];
          return firstMessage?.direction === this.directionFilter;
        }
      });
    }

    // Apply missed filter (only for calls)
    if (this.missedFilter) {
      visibleConversations = visibleConversations.filter(conv => {
        return conv.type === 'call' && (conv.call?.status === 'missed' || conv.call?.status === 'no-answer');
      });
    }

    // Apply unread filter
    if (this.unreadFilter) {
      visibleConversations = visibleConversations.filter(conv => {
        return (conv.unreadCount || 0) > 0;
      });
    }

    // Apply sentiment filter
    if (this.sentimentFilter !== 'all') {
      visibleConversations = visibleConversations.filter(conv => {
        const sentiment = this.getConversationSentiment(conv);
        return sentiment === this.sentimentFilter;
      });
    }

    // Apply search filter
    if (this.searchQuery && this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase().trim();
      visibleConversations = visibleConversations.filter(conv => {
        // Search by phone number
        if (conv.phone?.toLowerCase().includes(query)) return true;

        // Search by contact name
        const contact = this.contactsMap?.[conv.phone];
        const contactName = contact ? [contact.first_name, contact.last_name, contact.name].filter(Boolean).join(' ').toLowerCase() : '';
        if (contactName.includes(query)) return true;

        // Search by message content (SMS)
        if (conv.type === 'sms' && conv.messages?.some(m => m.content?.toLowerCase().includes(query))) return true;

        // Search by transcript (calls)
        if (conv.type === 'call' && conv.call?.transcript?.toLowerCase().includes(query)) return true;

        // Search by email address, subject, or message content
        if (conv.type === 'email') {
          if (conv.email?.toLowerCase().includes(query)) return true;
          if (conv.subject?.toLowerCase().includes(query)) return true;
          if (conv.fromName?.toLowerCase().includes(query)) return true;
          if (conv.messages?.some(m => m.body_text?.toLowerCase().includes(query))) return true;
        }

        return false;
      });
    }

    // Apply date filter
    if (this.dateFilter !== 'all') {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let cutoffDate;

      switch (this.dateFilter) {
        case 'today':
          cutoffDate = startOfToday;
          break;
        case 'yesterday':
          cutoffDate = new Date(startOfToday);
          cutoffDate.setDate(cutoffDate.getDate() - 1);
          break;
        case 'week':
          cutoffDate = new Date(startOfToday);
          cutoffDate.setDate(cutoffDate.getDate() - 7);
          break;
        case 'month':
          cutoffDate = new Date(startOfToday);
          cutoffDate.setDate(cutoffDate.getDate() - 30);
          break;
      }

      if (cutoffDate) {
        visibleConversations = visibleConversations.filter(conv => {
          return conv.lastActivity >= cutoffDate;
        });
      }
    }

    if (visibleConversations.length === 0) {
      return `
        <div style="padding: 2rem; text-align: center; color: var(--text-secondary);">
          <p style="font-size: 1rem; margin-bottom: 0.5rem;">No messages yet</p>
          <p style="font-size: 0.875rem;">When your assistant receives calls or messages, they'll appear here.</p>
        </div>
      `;
    }

    // Render-window pagination: only render up to displayLimit
    const totalVisible = visibleConversations.length;
    const displayedConversations = visibleConversations.slice(0, this.displayLimit);

    const listHtml = displayedConversations.map(conv => {
      const isSelected = (conv.type === 'sms' && this.selectedContact === conv.phone && this.selectedServiceNumber === conv.serviceNumber && !this.selectedCallId && !this.selectedChatSessionId && !this.selectedEmailThreadId) ||
                        (conv.type === 'call' && this.selectedCallId === conv.callId) ||
                        (conv.type === 'chat' && this.selectedChatSessionId === conv.chatSessionId) ||
                        (conv.type === 'email' && this.selectedEmailThreadId === conv.emailThreadId);

      // Shared avatar style: 40px circle with border, initial letter
      const avatarStyle = 'flex-shrink: 0; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 1rem; border: 2px solid var(--border-color, #e5e7eb); background: var(--bg-secondary, #f9fafb); color: var(--text-primary, #374151);';

      // Type indicator icons (small, shown next to timestamp)
      const typeIcons = {
        sms: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
        call: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`,
        email: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`,
        chat: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`,
      };

      if (conv.type === 'chat') {
        const displayName = conv.visitorName || 'Visitor';
        const initial = displayName[0].toUpperCase();

        return `
          <div class="swipe-container" data-conv-key="chat_${conv.chatSessionId}">
            <div class="swipe-delete-btn" data-conv-key="chat_${conv.chatSessionId}">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>Delete</span>
            </div>
            <div class="conversation-item swipe-content ${isSelected ? 'selected' : ''} ${conv.unreadCount > 0 ? 'unread' : ''}" data-chat-session-id="${conv.chatSessionId}" data-type="chat" style="display: flex !important; flex-direction: row !important; gap: 0.75rem;">
              ${this.selectMode ? `
              <label class="select-checkbox" style="display: flex; align-items: center; flex-shrink: 0; cursor: pointer;">
                <input type="checkbox" data-conv-key="chat_${conv.chatSessionId}" ${this.selectedForDeletion.has(`chat_${conv.chatSessionId}`) ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--primary-color);">
              </label>
              ` : ''}
              <div style="${avatarStyle}">${initial}</div>
              <div class="conversation-content" style="flex: 1 !important; min-width: 0;">
                <div class="conversation-header" style="display: flex !important; justify-content: space-between !important; align-items: baseline; width: 100%;">
                  <span class="conversation-name">${conv.visitorName}${conv.aiPaused ? ' <span style="font-size: 0.65rem; background: #fef3c7; color: #92400e; padding: 0.125rem 0.375rem; border-radius: 0.25rem; margin-left: 0.25rem;">Human</span>' : ''}</span>
                  <div style="display: flex; align-items: center; gap: 0.375rem; margin-left: 0.5rem;">
                    ${conv.unreadCount > 0 ? `<span class="conversation-unread-badge">${conv.unreadCount > 99 ? '99+' : conv.unreadCount}</span>` : ''}
                    ${typeIcons.chat}
                    <span class="conversation-time" style="white-space: nowrap;">${this.formatTimestamp(conv.lastActivity)}</span>
                  </div>
                </div>
                <div style="font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 2px;">${conv.widgetName}</div>
                <div class="conversation-preview" style="display: flex; align-items: center;">
                  <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${conv.lastMessage}</span>
                </div>
              </div>
            </div>
          </div>
        `;
      } else if (conv.type === 'email') {
        // Look up contact by email address
        const emailContact = this.contactsEmailMap?.[conv.email?.toLowerCase()];
        const emailContactName = emailContact ? [emailContact.first_name, emailContact.last_name].filter(Boolean).join(' ') || emailContact.name : null;
        const displayName = emailContactName || conv.fromName || conv.email;
        const hasName = !!(emailContactName || conv.fromName);
        const previewText = conv.lastMessage;
        const initial = (displayName || '?')[0].toUpperCase();

        return `
          <div class="swipe-container" data-conv-key="email_${conv.emailThreadId}">
            <div class="swipe-delete-btn" data-conv-key="email_${conv.emailThreadId}">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>Delete</span>
            </div>
            <div class="conversation-item swipe-content ${isSelected ? 'selected' : ''} ${conv.unreadCount > 0 ? 'unread' : ''}" data-email-thread-id="${conv.emailThreadId}" data-type="email" style="display: flex !important; flex-direction: row !important; gap: 0.75rem;">
              ${this.selectMode ? `
              <label class="select-checkbox" style="display: flex; align-items: center; flex-shrink: 0; cursor: pointer;">
                <input type="checkbox" data-conv-key="email_${conv.emailThreadId}" ${this.selectedForDeletion.has(`email_${conv.emailThreadId}`) ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--primary-color);">
              </label>
              ` : ''}
              ${emailContact?.avatar_url
                ? `<img src="${emailContact.avatar_url}" style="${avatarStyle} object-fit: cover;" onerror="this.outerHTML='<div style=\\'${avatarStyle}\\'>${initial}</div>';" />`
                : `<div style="${avatarStyle}">${initial}</div>`
              }
              <div class="conversation-content" style="flex: 1 !important; min-width: 0;">
                <div class="conversation-header" style="display: flex !important; justify-content: space-between !important; align-items: baseline; width: 100%;">
                  <span class="conversation-name">${displayName}</span>
                  <div style="display: flex; align-items: center; gap: 0.375rem; margin-left: 0.5rem;">
                    ${conv.unreadCount > 0 ? `<span class="conversation-unread-badge">${conv.unreadCount > 99 ? '99+' : conv.unreadCount}</span>` : ''}
                    ${typeIcons.email}
                    <span class="conversation-time" style="white-space: nowrap;">${this.formatTimestamp(conv.lastActivity)}</span>
                  </div>
                </div>
                <div style="font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${hasName ? conv.email : (conv.subject || 'No subject')}</div>
                <div class="conversation-preview" style="display: flex; align-items: center;">
                  <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${hasName ? (conv.subject || previewText) : previewText}</span>
                  ${this.formatSentimentLabel(this.getConversationSentiment(conv))}
                </div>
              </div>
            </div>
          </div>
        `;

      } else if (conv.type === 'call') {
        const primaryNumber = conv.phone;
        const contact = this.contactsMap?.[primaryNumber];
        const contactName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.name : null;
        const initial = contactName ? contactName[0].toUpperCase() : '?';

        return `
          <div class="swipe-container" data-conv-key="call_${conv.callId}">
            <div class="swipe-delete-btn" data-conv-key="call_${conv.callId}">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>Delete</span>
            </div>
            <div class="conversation-item swipe-content ${isSelected ? 'selected' : ''} ${conv.unreadCount > 0 ? 'unread' : ''}" data-call-id="${conv.callId}" data-type="call" style="display: flex !important; flex-direction: row !important; gap: 0.75rem;">
              ${this.selectMode ? `
              <label class="select-checkbox" style="display: flex; align-items: center; flex-shrink: 0; cursor: pointer;">
                <input type="checkbox" data-conv-key="call_${conv.callId}" ${this.selectedForDeletion.has(`call_${conv.callId}`) ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--primary-color);">
              </label>
              ` : ''}
              ${contact?.avatar_url
                ? `<img src="${contact.avatar_url}" style="${avatarStyle} object-fit: cover;" onerror="this.outerHTML='<div style=\\'${avatarStyle}\\'>${initial}</div>';" />`
                : `<div style="${avatarStyle}">${initial}</div>`
              }
              <div class="conversation-content" style="flex: 1 !important; min-width: 0;">
                <div class="conversation-header" style="display: flex !important; justify-content: space-between !important; align-items: baseline; width: 100%;">
                  <span class="conversation-name">${contactName || this.formatPhoneNumber(primaryNumber)}</span>
                  <div style="display: flex; align-items: center; gap: 0.375rem; margin-left: 0.5rem;">
                    ${typeIcons.call}
                    <span class="conversation-time" style="white-space: nowrap;">${this.formatTimestamp(conv.lastActivity)}</span>
                  </div>
                </div>
                ${contactName ? `<div style="font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 2px;">${this.formatPhoneNumber(primaryNumber)}</div>` : ''}
                <div class="conversation-preview" style="display: flex; align-items: center;">
                  <span class="call-status-indicator ${conv.statusInfo.class}" style="color: ${conv.statusInfo.color}; margin-right: 0.25rem;">${conv.statusInfo.icon}</span>
                  <span style="flex: 1;">${conv.lastMessage}</span>
                  ${this.callHasPendingRecordings(conv.call) ? this.renderSyncingBadge() : this.formatSentimentLabel(this.getConversationSentiment(conv))}
                </div>
              </div>
            </div>
          </div>
        `;
      } else {
        // SMS
        const contact = this.contactsMap?.[conv.phone];
        const contactName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.name : null;
        const initial = contactName ? contactName[0].toUpperCase() : '?';

        return `
          <div class="swipe-container" data-conv-key="sms_${conv.phone}_${conv.serviceNumber}">
            <div class="swipe-delete-btn" data-conv-key="sms_${conv.phone}_${conv.serviceNumber}">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
              <span>Delete</span>
            </div>
            <div class="conversation-item swipe-content ${isSelected ? 'selected' : ''} ${conv.unreadCount > 0 ? 'unread' : ''}" data-phone="${conv.phone}" data-service-number="${conv.serviceNumber}" data-type="sms" style="display: flex !important; flex-direction: row !important; gap: 0.75rem;">
              ${this.selectMode ? `
              <label class="select-checkbox" style="display: flex; align-items: center; flex-shrink: 0; cursor: pointer;">
                <input type="checkbox" data-conv-key="sms_${conv.phone}_${conv.serviceNumber}" ${this.selectedForDeletion.has(`sms_${conv.phone}_${conv.serviceNumber}`) ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--primary-color);">
              </label>
              ` : ''}
              ${contact?.avatar_url
                ? `<img src="${contact.avatar_url}" style="${avatarStyle} object-fit: cover;" onerror="this.outerHTML='<div style=\\'${avatarStyle}\\'>${initial}</div>';" />`
                : `<div style="${avatarStyle}">${initial}</div>`
              }
              <div class="conversation-content" style="flex: 1 !important; min-width: 0;">
                <div class="conversation-header" style="display: flex !important; justify-content: space-between !important; align-items: baseline; width: 100%;">
                  <span class="conversation-name">${contactName || this.formatPhoneNumber(conv.phone)}</span>
                  <div style="display: flex; align-items: center; gap: 0.375rem; margin-left: 0.5rem;">
                    ${conv.unreadCount > 0 ? `<span class="conversation-unread-badge">${conv.unreadCount > 99 ? '99+' : conv.unreadCount}</span>` : ''}
                    ${typeIcons.sms}
                    <span class="conversation-time" style="white-space: nowrap;">${this.formatTimestamp(conv.lastActivity)}</span>
                  </div>
                </div>
                ${contactName ? `<div style="font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 2px;">${this.formatPhoneNumber(conv.phone)}</div>` : ''}
                <div class="conversation-preview" style="display: flex; align-items: center;">
                  <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${conv.lastMessage}</span>
                  ${this.formatSentimentLabel(this.getConversationSentiment(conv))}
                </div>
              </div>
            </div>
          </div>
        `;
      }
    }).join('');

    // Show sentinel with count if more items remain
    if (displayedConversations.length < totalVisible) {
      return listHtml + `<div class="inbox-load-more-sentinel" style="padding: 12px; text-align: center; color: var(--text-secondary); font-size: 0.8rem;">Showing ${displayedConversations.length} of ${totalVisible}</div>`;
    }
    return listHtml;
  },

  renderMessageThread() {
    // Deactivate phone nav when showing message thread
    setPhoneNavActive(false);

    // Reactivate inbox button
    const inboxBtn = document.querySelector('.bottom-nav-item[onclick*="inbox"]');
    if (inboxBtn) {
      inboxBtn.classList.add('active');
    }
    // Check if we're viewing a call or SMS conversation
    if (this.selectedCallId) {
      const conv = this.conversations.find(c => c.type === 'call' && c.callId === this.selectedCallId);
      if (!conv) return this.renderEmptyState();
      return this.renderCallDetailView(conv.call);
    }

    // Check if we're viewing a chat conversation
    if (this.selectedChatSessionId) {
      const conv = this.conversations.find(c => c.type === 'chat' && c.chatSessionId === this.selectedChatSessionId);
      if (!conv) return this.renderEmptyState();
      return this.renderChatThreadView(conv);
    }

    // Check if we're viewing an email thread
    if (this.selectedEmailThreadId) {
      const conv = this.conversations.find(c => c.type === 'email' && c.emailThreadId === this.selectedEmailThreadId);
      if (!conv) return this.renderEmptyState();
      return this.renderEmailThreadView(conv);
    }

    const conv = this.conversations.find(c => c.type === 'sms' && c.phone === this.selectedContact && c.serviceNumber === this.selectedServiceNumber);
    if (!conv) return this.renderEmptyState();

    // Get contact info if available
    const contact = this.contactsMap?.[conv.phone];
    const contactName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.name : null;
    const serviceNumberDisplay = this.formatPhoneNumber(conv.serviceNumber);
    const smsSentiment = this.getConversationSentiment(conv);

    return `
      <div class="thread-header" style="display: flex; align-items: flex-start; gap: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border-color);">
        <button class="back-button" id="back-button" style="
          display: none;
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0;
          margin: 0;
          color: var(--primary-color);
          line-height: 1;
        ">←</button>
        ${contact?.avatar_url ? `
          <img src="${contact.avatar_url}" alt="${contactName}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 2px solid var(--border-color, #e5e7eb);" onerror="this.outerHTML='<div style=\\'width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:600;font-size:1rem;border:2px solid var(--border-color,#e5e7eb);background:var(--bg-secondary,#f9fafb);color:var(--text-primary,#374151)\\'>${(contactName || '?')[0].toUpperCase()}</div>';" />
        ` : `
          <div style="width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-weight: 600; font-size: 1rem; border: 2px solid var(--border-color, #e5e7eb); background: var(--bg-secondary, #f9fafb); color: var(--text-primary, #374151);">${contactName ? contactName[0].toUpperCase() : '?'}</div>
        `}
        <div style="flex: 1; display: flex; flex-direction: column; gap: 0.25rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem; justify-content: space-between;">
            <h2 style="margin: 0; font-size: calc(1.125rem - 5px); font-weight: 600; line-height: 1;">
              ${contactName ? contactName : `<span class="clickable-phone" data-phone="${conv.phone}" style="cursor: pointer;">${this.formatPhoneNumber(conv.phone)}</span>`}
            </h2>
            <div style="display: flex; align-items: center; gap: 0.5rem; padding-bottom: 5px;">
              <a href="#" id="call-action-btn" data-phone="${conv.phone}" style="
                padding: 0.2rem 0.5rem;
                color: var(--primary-color, #6366f1);
                text-decoration: none;
                border: 1px solid var(--border-color, #e5e7eb);
                border-radius: 9999px;
                font-size: 0.7rem;
                transition: background-color 0.15s ease;
              " onmouseenter="this.style.backgroundColor='var(--bg-tertiary, #f3f4f6)'" onmouseleave="this.style.backgroundColor=''">Call</a>
              ${contact?.company || contact?.job_title || contact?.linkedin_url || contact?.twitter_url ? `
                <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--text-secondary);">
                  ${contact?.company || contact?.job_title ? `
                    <span>${[contact.job_title, contact.company].filter(Boolean).join(' at ')}</span>
                  ` : ''}
                  ${contact?.linkedin_url ? `
                    <a href="${contact.linkedin_url}" target="_blank" rel="noopener" style="color: #0077b5; display: flex;" title="LinkedIn">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                      </svg>
                    </a>
                  ` : ''}
                  ${contact?.twitter_url ? `
                    <a href="${contact.twitter_url}" target="_blank" rel="noopener" style="color: #1da1f2; display: flex;" title="Twitter/X">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                      </svg>
                    </a>
                  ` : ''}
                </div>
              ` : ''}
                          </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: -5px;">
            ${contactName ? `<span class="clickable-phone" data-phone="${conv.phone}" style="font-size: 0.8rem; color: var(--text-secondary); cursor: pointer;">${this.formatPhoneNumber(conv.phone)}</span>` : ''}
            <span style="font-size: 0.75rem; color: var(--text-secondary); opacity: 0.7;">Messaged: <span class="clickable-phone" data-phone="${conv.serviceNumber}" style="cursor: pointer;">${serviceNumberDisplay}</span></span>
          </div>
        </div>
      </div>
      ${this.shouldShowTranslate(conv.serviceNumber) && conv.messages.some(m => !m.translation) ? `
        <div style="display: flex; justify-content: center; padding: 0.5rem 0;">
          <a href="#" class="translate-all-link" style="display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.3rem 0.75rem; font-size: 0.75rem; color: var(--primary-color); border: 1px solid var(--primary-color); border-radius: 999px; text-decoration: none; opacity: 0.9;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>
            Translate all
          </a>
        </div>
      ` : ''}
      <div class="thread-messages" id="thread-messages">
        ${conv.messages.map(msg => this.renderSmsMessage(msg)).join('')}
      </div>
      <div class="message-input-container">
        <textarea
          id="message-input"
          class="message-input"
          placeholder=""
          rows="1"
        ></textarea>
        <button id="agent-reply-btn" class="agent-reply-button" title="Generate AI response">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"></path>
            <circle cx="7.5" cy="14.5" r="1.5"></circle>
            <circle cx="16.5" cy="14.5" r="1.5"></circle>
          </svg>
        </button>
        <button id="send-button" class="send-button">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>

      <!-- Agent Reply Modal -->
      <div id="agent-reply-modal" class="modal hidden">
        <div class="modal-backdrop"></div>
        <div class="modal-content" style="max-width: 500px;">
          <h2 style="margin: 0 0 1rem 0; display: flex; align-items: center; gap: 0.5rem;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"></path>
              <circle cx="7.5" cy="14.5" r="1.5"></circle>
              <circle cx="16.5" cy="14.5" r="1.5"></circle>
            </svg>
            AI Response
          </h2>
          <p style="color: var(--text-secondary); margin: 0 0 1rem 0; font-size: 0.875rem;">
            Describe what you want to say and AI will generate and send the message.
          </p>
          <textarea
            id="agent-reply-prompt"
            placeholder="e.g., Thank them for their patience, confirm appointment tomorrow at 2pm"
            style="
              width: 100%;
              min-height: 100px;
              padding: 0.75rem;
              border: 1px solid var(--border-color);
              border-radius: 8px;
              font-size: 0.875rem;
              resize: vertical;
              font-family: inherit;
              background: var(--bg-primary);
              color: var(--text-primary);
            "
          ></textarea>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              ${isVoiceSupported() ? `
              <button id="voice-reply-btn" title="Speak your prompt" style="
                display: flex;
                align-items: center;
                justify-content: center;
                width: 40px;
                height: 40px;
                background: var(--bg-secondary);
                border: 1px solid var(--border-color);
                border-radius: 50%;
                cursor: pointer;
                transition: all 0.2s;
              " onmouseover="this.style.background='var(--bg-tertiary)'" onmouseout="if(!this.classList.contains('recording')){this.style.background='var(--bg-secondary)'}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
              </button>
              <span id="voice-reply-status" style="font-size: 0.75rem; color: var(--text-secondary); display: none;"></span>
              ` : ''}
            </div>
            <div style="display: flex; gap: 0.75rem;">
              <button id="cancel-agent-reply" class="btn btn-secondary">Cancel</button>
              <button id="send-agent-reply" class="btn btn-primary" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
                Generate & Send
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderSmsMessage(msg) {
    const isInbound = msg.direction === 'inbound';
    const isAI = msg.is_ai_generated === true;
    const isHuman = !isInbound && !isAI;
    const timestamp = new Date(msg.sent_at || msg.created_at);

    // Get delivery status indicator for outbound messages
    const deliveryStatus = this.getDeliveryStatusIcon(msg);

    // Translation display
    let translationHtml = '';
    if (this.shouldShowTranslate(this.selectedServiceNumber)) {
      if (msg.translation) {
        translationHtml = `
          <div style="margin-top: 0.375rem; padding: 0.375rem 0.5rem; background: var(--bg-secondary); border-radius: var(--radius-md); border-left: 2px solid var(--primary-color); font-size: 0.85rem; color: var(--text-secondary);">
            ${this.linkifyPhoneNumbers(msg.translation)}
          </div>`;
      } else {
        translationHtml = `
          <div style="margin-top: 0.25rem;">
            <a href="#" class="translate-msg-link" data-translate-msg-id="${msg.id}" style="font-size: 0.75rem; color: var(--primary-color); text-decoration: none; opacity: 0.8;">Translate</a>
          </div>`;
      }
    }

    return `
      <div class="message-bubble ${isInbound ? 'inbound' : 'outbound'} ${isAI ? 'ai-message' : ''} ${isHuman ? 'human-message' : ''}" data-message-id="${msg.id}">
        <div class="message-content">${this.linkifyPhoneNumbers(msg.content)}</div>
        ${translationHtml}
        <div class="message-time">
          ${this.formatTime(timestamp)}
          ${deliveryStatus}
        </div>
      </div>
    `;
  },

  getDeliveryStatusIcon(msg) {
    // Only show delivery status for outbound messages
    if (msg.direction === 'inbound') return '';

    const status = msg.status || 'sent';

    switch (status) {
      case 'delivered':
        // Double checkmark for delivered
        return `<span class="delivery-status delivered" title="Delivered">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1 12 5 16 11 6"></polyline>
            <polyline points="9 12 13 16 22 6"></polyline>
          </svg>
        </span>`;
      case 'sent':
      case 'pending':
        // Single checkmark for sent/pending
        return `<span class="delivery-status sent" title="${status === 'pending' ? 'Sending...' : 'Sent'}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 12 9 17 20 6"></polyline>
          </svg>
        </span>`;
      case 'failed':
      case 'undelivered':
        // X icon for failed
        return `<span class="delivery-status failed" title="Not delivered">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </span>`;
      default:
        return '';
    }
  },

  renderCallDetailView(call) {
    const duration = this.calculateTotalDuration(call);
    const durationText = duration > 0
      ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`
      : '0:00';
    const statusInfo = this.getCallStatusInfo(call.status);
    const messages = this.parseTranscript(call.transcript);

    // Look up contact for this call
    const contact = this.contactsMap?.[call.contact_phone];
    let contactName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.name : null;

    // Check if we should try to extract a name from the transcript
    const isUnknownContact = !contactName || contactName.toLowerCase() === 'unknown';
    // Search main transcript and all recording transcripts for a name
    let suggestedName = null;
    if (isUnknownContact) {
      // Try main transcript first
      suggestedName = this.extractCallerNameFromTranscript(call.transcript);
      // If not found, try recording transcripts (prioritize main/conversation recordings)
      if (!suggestedName && call.recordings?.length > 0) {
        // Sort recordings to check main/conversation first
        const sortedRecordings = [...call.recordings].sort((a, b) => {
          const priority = ['main', 'conversation', 'reconnect_conversation'];
          const aIdx = priority.indexOf(a.label) >= 0 ? priority.indexOf(a.label) : 99;
          const bIdx = priority.indexOf(b.label) >= 0 ? priority.indexOf(b.label) : 99;
          return aIdx - bIdx;
        });
        for (const rec of sortedRecordings) {
          if (rec.transcript) {
            suggestedName = this.extractCallerNameFromTranscript(rec.transcript);
            if (suggestedName) break;
          }
        }
      }
    }

    return `
      <div class="thread-header" style="display: flex; align-items: flex-start; gap: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border-color);">
        <button class="back-button" id="back-button" style="
          display: none;
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0;
          margin: 0;
          color: var(--primary-color);
          line-height: 1;
        ">←</button>
        ${contact?.avatar_url ? `
          <img src="${contact.avatar_url}" alt="${contactName}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 2px solid var(--border-color, #e5e7eb);" onerror="this.outerHTML='<div style=\\'width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:600;font-size:1rem;border:2px solid var(--border-color,#e5e7eb);background:var(--bg-secondary,#f9fafb);color:var(--text-primary,#374151)\\'>${(contactName || '?')[0].toUpperCase()}</div>';" />
        ` : `
          <div style="width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-weight: 600; font-size: 1rem; border: 2px solid var(--border-color, #e5e7eb); background: var(--bg-secondary, #f9fafb); color: var(--text-primary, #374151);">${contactName && !isUnknownContact ? contactName[0].toUpperCase() : '?'}</div>
        `}
        <div style="flex: 1; display: flex; flex-direction: column; gap: 0.25rem;">
        <div style="display: flex; align-items: center; gap: 0.75rem; justify-content: space-between;">
            <h2 style="margin: 0; font-size: calc(1.125rem - 5px); font-weight: 600; line-height: 1;">
              ${contactName && !isUnknownContact
                ? contactName
                : suggestedName
                  ? `Unknown <span style="font-weight: 400; font-size: 0.85em;">(could be <a href="#" class="add-contact-link" data-name="${suggestedName}" data-phone="${call.contact_phone}" style="color: var(--primary-color); text-decoration: underline; cursor: pointer;">${suggestedName}</a>)</span>`
                  : 'Unknown'}
            </h2>
          <div style="display: flex; align-items: center; gap: 0.5rem; padding-bottom: 5px;">
              <a href="#" id="call-action-btn" data-phone="${call.contact_phone}" style="
                padding: 0.2rem 0.5rem;
                color: var(--primary-color, #6366f1);
                text-decoration: none;
                border: 1px solid var(--border-color, #e5e7eb);
                border-radius: 9999px;
                font-size: 0.7rem;
                transition: background-color 0.15s ease;
              " onmouseenter="this.style.backgroundColor='var(--bg-tertiary, #f3f4f6)'" onmouseleave="this.style.backgroundColor=''">Call</a>
              <a href="#" id="message-action-btn" data-phone="${call.contact_phone}" style="
                padding: 0.2rem 0.5rem;
                color: var(--primary-color, #6366f1);
                text-decoration: none;
                border: 1px solid var(--border-color, #e5e7eb);
                border-radius: 9999px;
                font-size: 0.7rem;
                transition: background-color 0.15s ease;
              " onmouseenter="this.style.backgroundColor='var(--bg-tertiary, #f3f4f6)'" onmouseleave="this.style.backgroundColor=''">Message</a>
            ${contact?.company || contact?.job_title || contact?.linkedin_url || contact?.twitter_url ? `
              <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--text-secondary);">
                ${contact?.company || contact?.job_title ? `
                  <span>${[contact.job_title, contact.company].filter(Boolean).join(' at ')}</span>
                ` : ''}
                ${contact?.linkedin_url ? `
                  <a href="${contact.linkedin_url}" target="_blank" rel="noopener" style="color: #0077b5; display: flex;" title="LinkedIn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                  </a>
                ` : ''}
                ${contact?.twitter_url ? `
                  <a href="${contact.twitter_url}" target="_blank" rel="noopener" style="color: #1da1f2; display: flex;" title="Twitter/X">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                  </a>
                ` : ''}
              </div>
            ` : ''}
          </div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: -5px;">
          <span class="clickable-phone" data-phone="${call.contact_phone}" style="font-size: 0.8rem; color: var(--text-secondary); cursor: pointer;">${this.formatPhoneNumber(call.contact_phone)}</span>
          <span style="font-size: 0.75rem; color: var(--text-secondary); opacity: 0.7;">Called: <span class="clickable-phone" data-phone="${call.service_number || (call.direction === 'inbound' ? call.callee_number : call.caller_number) || ''}" style="cursor: pointer;">${this.formatPhoneNumber(call.service_number || (call.direction === 'inbound' ? call.callee_number : call.caller_number) || '')}</span></span>
        </div>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 1rem; background: var(--bg-tertiary); border-bottom: 1px solid var(--border-color); font-size: 0.75rem; color: var(--text-secondary);">
        <span>${call.created_at ? new Date(call.created_at).toLocaleString() : ''}</span>
        <span class="copy-call-id-btn" data-call-id="${call.id}" title="Click to copy" style="font-family: monospace; cursor: pointer; position: relative;">${call.id || ''}</span>
      </div>

      <div class="thread-messages" id="thread-messages">
        ${this.renderRecordings(call, messages)}
      </div>
    `;
  },

  formatRecordingLabel(label) {
    const labels = {
      'conversation': 'Conversation',
      'reconnect_conversation': 'Reconnect Conversation',
      'main': 'Main Call',
      'transfer_conference': 'Transferred Call',
      'transferee_consult': 'Transfer Consultation',
      'reconnect_after_decline': 'Reconnect After Decline',
      'reconnect_to_agent': 'Reconnect',
      'back_to_agent': 'Back to Agent',
    };
    return labels[label] || label.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  },

  /**
   * Split a transcript text into segments by detecting speaker changes.
   * Detects speaker changes at:
   * - Question marks (Q&A pattern)
   * - After prompts like "say you're busy" followed by a short response
   * - Before phrases like "I'll let [name] know" (bot responding to input)
   */
  splitTranscriptBySpeaker(text, startsAsAgent) {
    const segments = [];
    let isAgent = startsAsAgent;

    // First, try to detect the transfer consultation pattern:
    // "...or say you're busy. [short response]. I'll let [name] know..."
    const consultMatch = text.match(/^(.+(?:say you're busy|or say busy)[^.]*\.)\s*([^.]{1,30}\.)\s*(I'll let .+)$/i);
    if (consultMatch) {
      segments.push({ text: consultMatch[1].trim(), isAgent });
      segments.push({ text: consultMatch[2].trim(), isAgent: !isAgent });
      segments.push({ text: consultMatch[3].trim(), isAgent });
      return segments;
    }

    // Split on question marks followed by a space and capital letter
    const parts = text.split(/(\?)\s+(?=[A-Z])/);

    let currentSegment = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === '?') {
        currentSegment += '?';
        if (currentSegment.trim()) {
          segments.push({ text: currentSegment.trim(), isAgent });
        }
        currentSegment = '';
        isAgent = !isAgent; // Switch speaker after question
      } else {
        currentSegment += part;
      }
    }

    // Add remaining text
    if (currentSegment.trim()) {
      segments.push({ text: currentSegment.trim(), isAgent });
    }

    return segments.length > 0 ? segments : [{ text, isAgent: startsAsAgent }];
  },

  formatDurationShort(seconds) {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  },

  /**
   * Calculate total duration from all recordings in a call
   */
  calculateTotalDuration(call) {
    const recordings = call.recordings || [];
    if (recordings.length > 0) {
      return recordings.reduce((sum, rec) => sum + (parseInt(rec.duration) || 0), 0);
    }
    return call.duration_seconds || 0;
  },

  /**
   * Trigger on-demand sync for pending recordings
   */
  async syncPendingRecordings(callId) {
    if (!this._syncingCallIds) this._syncingCallIds = new Set();
    if (this._syncingCallIds.has(callId)) {
      console.log('⏳ Already syncing recordings for', callId);
      return;
    }

    console.log('📥 Triggering sync for pending recordings:', callId);
    this._syncingCallIds.add(callId);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/sync-recording`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`
        },
        body: JSON.stringify({ call_record_id: callId })
      });

      const result = await response.json();
      console.log('📥 Sync result:', result);

      if (result.success && result.synced > 0) {
        // Refresh the call data from the database
        await this.refreshCallRecordings(callId);
      }
    } catch (err) {
      console.error('Error syncing recordings:', err);
    } finally {
      this._syncingCallIds.delete(callId);
    }
  },

  /**
   * Refresh call recordings from the database and re-render if updated
   */
  async refreshCallRecordings(callId) {
    if (!this._recordingRefreshTimers) this._recordingRefreshTimers = new Map();
    if (!this._recordingRetryCount) this._recordingRetryCount = new Map();

    const retryCount = this._recordingRetryCount.get(callId) || 0;
    const maxRetries = 12; // ~2 minutes at 10s intervals

    console.log(`📥 Refreshing recordings for call: ${callId} (attempt ${retryCount + 1}/${maxRetries})`);

    try {
      // Fetch latest call record from database
      const { data: updatedCall, error } = await supabase
        .from('call_records')
        .select('*')
        .eq('id', callId)
        .single();

      if (error || !updatedCall) {
        console.error('Failed to refresh call:', error);
        return;
      }

      // Update the call in our conversations array
      const convIndex = this.conversations.findIndex(c => c.type === 'call' && c.callId === callId);
      if (convIndex !== -1) {
        this.conversations[convIndex].call = updatedCall;

        // Check if recordings are now complete
        const recordings = updatedCall.recordings || [];
        const stillPending = recordings.some(rec => {
          // Pending if: status is pending_sync, OR no valid URL, OR no transcript
          if (rec.status === 'pending_sync') return true;
          const hasValidUrl = rec.url && rec.url.includes('supabase.co');
          if (!hasValidUrl) return true;
          // Complete if: has transcript (even empty string means Deepgram checked), OR duration too short
          const recDuration = parseInt(rec.duration) || 0;
          if (recDuration < 3) return false;
          if (rec.transcript !== undefined && rec.transcript !== null) return false;
          return true;
        });

        // Re-render if this call is currently selected
        if (this.selectedCallId === callId) {
          const threadMessages = document.getElementById('thread-messages');
          if (threadMessages) {
            threadMessages.innerHTML = this.renderRecordings(updatedCall, []);
          }
        }

        // If still pending and under retry limit, schedule another refresh
        if (stillPending && recordings.length > 0 && retryCount < maxRetries) {
          this._recordingRetryCount.set(callId, retryCount + 1);
          console.log('📥 Recordings still syncing, will retry in 10s...');
          const timer = setTimeout(() => {
            this._recordingRefreshTimers.delete(callId);
            this.syncPendingRecordings(callId);
          }, 10000);
          this._recordingRefreshTimers.set(callId, timer);
        } else {
          // Done - clean up tracking
          this._recordingRetryCount.delete(callId);
          this._recordingRefreshTimers.delete(callId);
          if (stillPending) {
            console.log('⚠️ Recordings still pending after max retries for', callId);
          } else {
            console.log('✅ Recordings fully synced for', callId);
          }
        }
      }
    } catch (err) {
      console.error('Error refreshing recordings:', err);
    }
  },

  renderRecordings(call, messages = []) {
    // Build recordings array from recordings field or fallback to recording_url
    const recordings = call.recordings || [];
    if (recordings.length === 0 && call.recording_url) {
      recordings.push({ url: call.recording_url, label: 'main', duration: call.duration_seconds });
    }

    // Check if any recordings need syncing (pending_sync status or no Supabase URL)
    const hasPendingRecordings = recordings.some(rec => {
      if (rec.status === 'pending_sync') return true;
      const hasValidUrl = rec.url && rec.url.includes('supabase.co');
      if (!hasValidUrl) return true;
      // Duration too short for speech = complete (no transcription needed)
      const recDuration = parseInt(rec.duration) || 0;
      if (recDuration < 3) return false;
      // transcript: undefined/null = not yet attempted, "" = attempted but no speech (complete)
      if (rec.transcript !== undefined && rec.transcript !== null) return false;
      return true;
    });

    // If recordings are pending, trigger on-demand sync
    if (hasPendingRecordings && recordings.length > 0) {
      if (!this._recordingRefreshTimers) this._recordingRefreshTimers = new Map();

      // Trigger sync (will only run once per call, debounced internally)
      this.syncPendingRecordings(call.id);

      // Also set up refresh timer to update UI after sync completes
      if (!this._recordingRefreshTimers.has(call.id)) {
        console.log('📥 Recordings pending sync, will refresh in 5s...');
        const timer = setTimeout(() => {
          this._recordingRefreshTimers.delete(call.id);
          this.refreshCallRecordings(call.id);
        }, 5000);
        this._recordingRefreshTimers.set(call.id, timer);
      }
    }

    // If no recordings, just show transcript if available
    if (recordings.length === 0) {
      if (call.transcript) {
        const lines = call.transcript.split('\n').filter(l => l.trim());
        if (lines.length > 0 && lines[0].includes(':')) {
          const bubbles = [];
          let lastIsAgent = true;
          for (const line of lines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0 && colonIndex < 20) {
              const speaker = line.substring(0, colonIndex).trim().toLowerCase();
              let text = line.substring(colonIndex + 1).trim();
              // Caller/User are always the caller; any other name is the agent (supports custom agent names)
              const isAgent = !['caller', 'user'].includes(speaker);
              lastIsAgent = isAgent;

              // Split text into segments by detecting speaker changes
              const segments = this.splitTranscriptBySpeaker(text, isAgent);
              for (const seg of segments) {
                bubbles.push(`<div class="message-bubble ${seg.isAgent ? 'outbound' : 'inbound'}">
                  <div class="message-content">${this.linkifyPhoneNumbers(seg.text)}</div>
                </div>`);
              }
            } else {
              const trimmed = line.trim();
              if (trimmed === '...' || trimmed === '…') continue;
              bubbles.push(`<div class="message-bubble ${lastIsAgent ? 'outbound' : 'inbound'}">
                <div class="message-content">${this.linkifyPhoneNumbers(trimmed)}</div>
              </div>`);
            }
          }
          return `<div style="display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem;">${bubbles.join('')}${this.renderTranscriptTranslation(call)}</div>`;
        }
        return `<div style="font-size: 0.9rem; color: var(--text-secondary); white-space: pre-wrap; padding: 0.5rem;">${this.linkifyPhoneNumbers(call.transcript)}${this.renderTranscriptTranslation(call)}</div>`;
      }
      return `<div style="padding: 3rem 1.5rem; text-align: center; color: var(--text-secondary);"><p>No transcript available for this call.</p></div>`;
    }

    // Sort recordings: "conversation" first (LiveKit initial), then "main", then by timestamp
    const sortedRecordings = [...recordings].sort((a, b) => {
      // conversation (LiveKit) comes first - it's the initial agent conversation
      if (a.label === 'conversation' && b.label !== 'conversation') return -1;
      if (b.label === 'conversation' && a.label !== 'conversation') return 1;
      // main comes next
      if (a.label === 'main') return -1;
      if (b.label === 'main') return 1;
      return new Date(a.timestamp || a.created_at || 0) - new Date(b.timestamp || b.created_at || 0);
    });

    // Find the first conversation recording to attach the call transcript
    const firstConversationIdx = sortedRecordings.findIndex(r => r.label === 'conversation');

    return sortedRecordings.map((rec, idx) => {
      // Show transcript under the recording
      // Prefer call.transcript (from LiveKit) over rec.transcript (from SignalWire)
      // because SignalWire's transcription often swaps speaker labels
      let transcriptHtml = '';
      let recTranscript = null;

      // Use call.transcript for the first conversation/main recording (has correct speaker labels)
      const isFirstMainRecording = (rec.label === 'conversation' && idx === firstConversationIdx) ||
        (rec.label === 'main' && firstConversationIdx === -1 && idx === sortedRecordings.findIndex(r => r.label === 'main'));
      if (isFirstMainRecording && call.transcript) {
        recTranscript = call.transcript;
      } else {
        recTranscript = rec.transcript;
      }

      if (recTranscript) {
        // Parse speaker-labeled transcript into SMS-style chat bubbles
        const lines = recTranscript.split('\n').filter(l => l.trim());
        if (lines.length > 0 && lines[0].includes(':')) {
          const bubbles = [];
          let lastIsAgent = true; // Track last speaker for continuation lines
          for (const line of lines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0 && colonIndex < 20) {
              const speaker = line.substring(0, colonIndex).trim().toLowerCase();
              let text = line.substring(colonIndex + 1).trim();
              // Caller/User are always the caller; any other name is the agent (supports custom agent names)
              const isAgent = !['caller', 'user'].includes(speaker);
              lastIsAgent = isAgent;

              // Split text into segments by detecting speaker changes at question marks
              const segments = this.splitTranscriptBySpeaker(text, isAgent);
              for (const seg of segments) {
                bubbles.push(`<div class="message-bubble ${seg.isAgent ? 'outbound' : 'inbound'}">
                  <div class="message-content">${this.linkifyPhoneNumbers(seg.text)}</div>
                </div>`);
              }
            } else {
              // Continuation of previous speaker (no label) — skip filler like "..."
              const trimmed = line.trim();
              if (trimmed === '...' || trimmed === '…') continue;
              bubbles.push(`<div class="message-bubble ${lastIsAgent ? 'outbound' : 'inbound'}">
                <div class="message-content">${this.linkifyPhoneNumbers(trimmed)}</div>
              </div>`);
            }
          }
          // Wrap in flex container for proper bubble alignment
          transcriptHtml = `<div style="display: flex; flex-direction: column; gap: 0.5rem;">${bubbles.join('')}</div>`;
        } else {
          // No speaker labels - show as plain text
          transcriptHtml = `<div style="font-size: 0.85rem; color: var(--text-secondary); white-space: pre-wrap;">${this.linkifyPhoneNumbers(recTranscript)}</div>`;
        }
      }

      // Check if this recording is still syncing
      // A recording needs sync if: status is pending_sync, OR no valid URL, OR no transcript
      const hasValidUrl = rec.url && (
        rec.url.includes('supabase.co') ||
        rec.url.includes('signalwire.com') ||
        rec.note === 'fallback_signalwire_url'
      );
      const isSyncing = rec.status === 'pending_sync' || !hasValidUrl;
      // transcript: undefined/null = not yet attempted, "" = no speech detected (complete)
      const needsTranscript = (rec.transcript === undefined || rec.transcript === null) && hasValidUrl;

      const syncingIndicator = (isSyncing || needsTranscript) ? `
        <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: var(--bg-secondary); border-radius: 6px; margin-top: 0.5rem;">
          <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary-color)" stroke-width="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
          </svg>
          <span style="font-size: 0.8rem; color: var(--text-secondary);">${isSyncing ? 'Syncing recording...' : 'Generating transcript...'}</span>
        </div>
      ` : '';

      // Hide audio player if URL is not ready
      const audioHtml = rec.url ? `<audio controls src="${rec.url}" style="width: 100%; height: 36px;"></audio>` : '';

      return `
        <div style="width: 100%; margin-bottom: 0.75rem; padding: 0.75rem; background: var(--bg-tertiary); border-radius: 8px;">
          <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem; display: flex; justify-content: space-between; align-items: center;">
            <span>
              <span style="font-weight: 500;">${this.formatRecordingLabel(rec.label)}</span>
              ${rec.recording_sid ? `<span class="clickable-id" data-id="${rec.recording_sid}" style="font-family: monospace; font-size: 0.6rem; opacity: 0.5; margin-left: 0.5rem; cursor: pointer;">${rec.recording_sid}</span>` : ''}
            </span>
            ${rec.duration || rec.duration_seconds ? `<span>${this.formatDurationShort(rec.duration || rec.duration_seconds)}</span>` : ''}
          </div>
          ${audioHtml}
          ${syncingIndicator}
          ${transcriptHtml ? `<div style="margin-top: 0.5rem;">${transcriptHtml}${isFirstMainRecording ? this.renderTranscriptTranslation(call) : ''}</div>` : ''}
        </div>
      `;
    }).join('');
  },

  renderTranscriptTranslation(call) {
    const callServiceNumber = call.service_number || (call.direction === 'inbound' ? call.callee_number : call.caller_number);
    if (!this.shouldShowTranslate(callServiceNumber) || !call.transcript) return '';
    if (call.translated_transcript) {
      return `
        <div style="margin-top: 0.75rem; padding: 0.5rem 0.75rem; background: var(--bg-secondary); border-radius: var(--radius-md); border-left: 2px solid var(--primary-color); font-size: 0.85rem; color: var(--text-secondary); white-space: pre-wrap;">
          ${this.linkifyPhoneNumbers(call.translated_transcript)}
        </div>`;
    }
    return `
      <div style="margin-top: 0.5rem; text-align: center;">
        <a href="#" class="translate-transcript-link" data-translate-call-id="${call.id}" style="display: inline-block; padding: 0.375rem 0.75rem; font-size: 0.8rem; color: var(--primary-color); border: 1px solid var(--primary-color); border-radius: 999px; text-decoration: none; opacity: 0.9;">Translate transcript</a>
      </div>`;
  },

  async translateMessage(msgId, linkEl) {
    if (!this.translateTo) return;
    const targetLang = this.translateTo.split('-').pop() || 'en';

    // Find the message in current SMS conversation
    const conv = this.conversations.find(c =>
      c.type === 'sms' && c.phone === this.selectedContact && c.serviceNumber === this.selectedServiceNumber
    );
    const msg = conv?.messages?.find(m => m.id === msgId);
    if (!msg) return;

    // Show loading state
    linkEl.textContent = 'Translating...';
    linkEl.style.pointerEvents = 'none';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate-text`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          texts: [msg.content],
          targetLang,
          cacheType: 'sms',
          cacheIds: [msgId],
        }),
      });

      const result = await resp.json();
      if (result.translations && result.translations[0]) {
        // Update the local message object
        msg.translation = result.translations[0];
        // Replace the link with the translation div
        const container = linkEl.closest('div');
        container.outerHTML = `
          <div style="margin-top: 0.375rem; padding: 0.375rem 0.5rem; background: var(--bg-secondary); border-radius: var(--radius-md); border-left: 2px solid var(--primary-color); font-size: 0.85rem; color: var(--text-secondary);">
            ${this.linkifyPhoneNumbers(result.translations[0])}
          </div>`;
      } else {
        linkEl.textContent = 'Translation failed';
      }
    } catch (err) {
      console.error('Translation error:', err);
      linkEl.textContent = 'Translation failed';
    }
  },

  async translateTranscript(callId, linkEl) {
    if (!this.translateTo) return;
    const targetLang = this.translateTo.split('-').pop() || 'en';

    // Find the call in conversations
    const conv = this.conversations.find(c => c.type === 'call' && c.callId === callId);
    const call = conv?.call;
    if (!call || !call.transcript) return;

    // Show loading state
    linkEl.textContent = 'Translating...';
    linkEl.style.pointerEvents = 'none';

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate-text`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          texts: [call.transcript],
          targetLang,
          cacheType: 'transcript',
          cacheIds: [callId],
        }),
      });

      const result = await resp.json();
      if (result.translations && result.translations[0]) {
        // Update the local call object
        call.translated_transcript = result.translations[0];
        // Replace the link with the translation panel
        const container = linkEl.closest('div');
        container.outerHTML = `
          <div style="margin-top: 0.75rem; padding: 0.5rem 0.75rem; background: var(--bg-secondary); border-radius: var(--radius-md); border-left: 2px solid var(--primary-color); font-size: 0.85rem; color: var(--text-secondary); white-space: pre-wrap;">
            ${this.linkifyPhoneNumbers(result.translations[0])}
          </div>`;
      } else {
        linkEl.textContent = 'Translation failed';
      }
    } catch (err) {
      console.error('Transcript translation error:', err);
      linkEl.textContent = 'Translation failed';
    }
  },

  async translateAllMessages(linkEl) {
    if (!this.translateTo) return;
    const targetLang = this.translateTo.split('-').pop() || 'en';

    const conv = this.conversations.find(c =>
      c.type === 'sms' && c.phone === this.selectedContact && c.serviceNumber === this.selectedServiceNumber
    );
    if (!conv) return;

    // Collect untranslated messages
    const untranslated = conv.messages.filter(m => !m.translation);
    if (untranslated.length === 0) return;

    // Show loading state
    linkEl.innerHTML = `
      <svg class="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>
      Translating ${untranslated.length} messages...`;
    linkEl.style.pointerEvents = 'none';

    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Batch in groups of 20 to avoid token limits
      const batchSize = 20;
      for (let i = 0; i < untranslated.length; i += batchSize) {
        const batch = untranslated.slice(i, i + batchSize);
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate-text`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            texts: batch.map(m => m.content),
            targetLang,
            cacheType: 'sms',
            cacheIds: batch.map(m => m.id),
          }),
        });

        const result = await resp.json();
        if (result.translations) {
          batch.forEach((msg, idx) => {
            if (result.translations[idx]) {
              msg.translation = result.translations[idx];
            }
          });
        }
      }

      // Re-render the thread to show all translations
      const threadElement = document.getElementById('message-thread');
      if (threadElement) {
        threadElement.innerHTML = this.renderMessageThread();
        this.attachMessageInputListeners();
      }
    } catch (err) {
      console.error('Translate all error:', err);
      linkEl.textContent = 'Translation failed';
      linkEl.style.pointerEvents = '';
    }
  },

  getCallStatusInfo(status) {
    // SVG icons for consistent cross-platform rendering (no emoji backgrounds)
    const checkIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    const xIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    const circleXIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    const spinIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>';
    const arrowIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>';
    const blockedIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>';
    const voicemailIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="11.5" r="4.5"></circle><circle cx="18.5" cy="11.5" r="4.5"></circle><line x1="5.5" y1="16" x2="18.5" y2="16"></line></svg>';
    const dotIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"></circle></svg>';

    const statusMap = {
      'completed': {
        icon: checkIcon,
        text: 'Completed',
        class: 'status-completed',
        color: '#10b981'
      },
      'in-progress': {
        icon: spinIcon,
        text: 'In Progress',
        class: 'status-progress',
        color: '#6366f1'
      },
      'no-answer': {
        icon: circleXIcon,
        text: 'No Answer',
        class: 'status-missed',
        color: '#ef4444'
      },
      'failed': {
        icon: xIcon,
        text: 'Failed',
        class: 'status-failed',
        color: '#ef4444'
      },
      'busy': {
        icon: circleXIcon,
        text: 'Busy',
        class: 'status-busy',
        color: '#f59e0b'
      },
      'answered_by_pat': {
        icon: checkIcon,
        text: 'Answered by AI',
        class: 'status-completed',
        color: '#10b981'
      },
      'transferred_to_user': {
        icon: arrowIcon,
        text: 'Transferred',
        class: 'status-transferred',
        color: '#6366f1'
      },
      'screened_out': {
        icon: blockedIcon,
        text: 'Screened Out',
        class: 'status-screened',
        color: '#9ca3af'
      },
      'voicemail': {
        icon: voicemailIcon,
        text: 'Voicemail',
        class: 'status-voicemail',
        color: '#8b5cf6'
      },
      'Caller Hungup': {
        icon: circleXIcon,
        text: 'Hung Up',
        class: 'status-hungup',
        color: '#f59e0b'
      },
      'outbound_completed': {
        icon: checkIcon,
        text: 'Completed',
        class: 'status-completed',
        color: '#10b981'
      },
      'outbound_no_answer': {
        icon: circleXIcon,
        text: 'No Answer',
        class: 'status-missed',
        color: '#ef4444'
      },
      'outbound_busy': {
        icon: circleXIcon,
        text: 'Busy',
        class: 'status-busy',
        color: '#f59e0b'
      },
      'outbound_failed': {
        icon: xIcon,
        text: 'Failed',
        class: 'status-failed',
        color: '#ef4444'
      }
    };

    return statusMap[status] || {
      icon: dotIcon,
      text: status || 'Unknown',
      class: 'status-unknown',
      color: '#9ca3af'
    };
  },

  truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  },

  renderEmptyState() {
    return `
      <div class="empty-thread">
        <div style="font-size: 3rem; margin-bottom: 1rem;">💬</div>
        <h3 style="margin: 0 0 0.5rem 0; font-weight: 600;">Select a conversation</h3>
        <p style="margin: 0; color: var(--text-secondary); font-size: 0.875rem;">
          Choose a conversation from the list to view messages
        </p>
      </div>
    `;
  },

  /**
   * Render chat thread view for web chat conversations
   */
  renderEmailThreadView(conv) {
    setPhoneNavActive(false);
    const inboxBtn = document.querySelector('.bottom-nav-item[onclick*="inbox"]');
    if (inboxBtn) inboxBtn.classList.add('active');

    // Look up contact by email
    const emailContact = this.contactsEmailMap?.[conv.email?.toLowerCase()];
    const contactName = emailContact ? [emailContact.first_name, emailContact.last_name].filter(Boolean).join(' ') || emailContact.name : null;
    const displayName = contactName || conv.fromName || conv.email;

    return `
      <div class="thread-header" style="display: flex; align-items: flex-start; gap: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border-color);">
        <button class="back-button" id="back-button" style="
          display: none;
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0;
          margin: 0;
          color: var(--primary-color);
          line-height: 1;
        ">←</button>
        ${emailContact?.avatar_url ? `
          <img src="${emailContact.avatar_url}" alt="${contactName}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 2px solid var(--border-color, #e5e7eb);" onerror="this.outerHTML='<div style=\\'width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-weight:600;font-size:1rem;border:2px solid var(--border-color,#e5e7eb);background:var(--bg-secondary,#f9fafb);color:var(--text-primary,#374151)\\'>${(displayName || '?')[0].toUpperCase()}</div>';" />
        ` : `
          <div style="width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-weight: 600; font-size: 1rem; border: 2px solid var(--border-color, #e5e7eb); background: var(--bg-secondary, #f9fafb); color: var(--text-primary, #374151);">${(displayName || '?')[0].toUpperCase()}</div>
        `}
        <div style="flex: 1; display: flex; flex-direction: column; gap: 0.25rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem; justify-content: space-between;">
            <h2 style="margin: 0; font-size: calc(1.125rem - 5px); font-weight: 600; line-height: 1;">
              ${displayName}
            </h2>
            <div style="display: flex; align-items: center; gap: 0.5rem; padding-bottom: 5px;">
              ${emailContact?.phone_number ? `
                <a href="#" id="call-action-btn" data-phone="${emailContact.phone_number}" style="
                  padding: 0.2rem 0.5rem;
                  color: var(--primary-color, #6366f1);
                  text-decoration: none;
                  border: 1px solid var(--border-color, #e5e7eb);
                  border-radius: 9999px;
                  font-size: 0.7rem;
                  transition: background-color 0.15s ease;
                " onmouseenter="this.style.backgroundColor='var(--bg-tertiary, #f3f4f6)'" onmouseleave="this.style.backgroundColor=''">Call</a>
                <a href="#" id="message-action-btn" data-phone="${emailContact.phone_number}" style="
                  padding: 0.2rem 0.5rem;
                  color: var(--primary-color, #6366f1);
                  text-decoration: none;
                  border: 1px solid var(--border-color, #e5e7eb);
                  border-radius: 9999px;
                  font-size: 0.7rem;
                  transition: background-color 0.15s ease;
                " onmouseenter="this.style.backgroundColor='var(--bg-tertiary, #f3f4f6)'" onmouseleave="this.style.backgroundColor=''">Message</a>
              ` : ''}
              <a href="mailto:${conv.email}" style="
                padding: 0.2rem 0.5rem;
                color: var(--primary-color, #6366f1);
                text-decoration: none;
                border: 1px solid var(--border-color, #e5e7eb);
                border-radius: 9999px;
                font-size: 0.7rem;
                transition: background-color 0.15s ease;
              " onmouseenter="this.style.backgroundColor='var(--bg-tertiary, #f3f4f6)'" onmouseleave="this.style.backgroundColor=''">Email</a>
              ${emailContact?.company || emailContact?.job_title || emailContact?.linkedin_url || emailContact?.twitter_url ? `
                <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--text-secondary);">
                  ${emailContact?.company || emailContact?.job_title ? `
                    <span>${[emailContact.job_title, emailContact.company].filter(Boolean).join(' at ')}</span>
                  ` : ''}
                  ${emailContact?.linkedin_url ? `
                    <a href="${emailContact.linkedin_url}" target="_blank" rel="noopener" style="color: #0077b5; display: flex;" title="LinkedIn">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                      </svg>
                    </a>
                  ` : ''}
                  ${emailContact?.twitter_url ? `
                    <a href="${emailContact.twitter_url}" target="_blank" rel="noopener" style="color: #1da1f2; display: flex;" title="Twitter/X">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                      </svg>
                    </a>
                  ` : ''}
                </div>
              ` : ''}
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: -5px;">
            <span style="font-size: 0.8rem; color: var(--text-secondary);">${conv.email}</span>
            <span style="font-size: 0.75rem; color: var(--text-secondary); opacity: 0.7;">${conv.subject || 'No subject'}</span>
          </div>
        </div>
      </div>

      <div class="thread-messages" id="thread-messages">
        ${conv.messages.map(msg => this.renderEmailMessage(msg, conv)).join('')}
      </div>

      <div class="email-reply-bar" style="
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: 0.75rem 1rem;
        border-top: 1px solid var(--border-color);
        background: var(--bg-primary);
      ">
        <button class="btn btn-primary" id="email-reply-btn" style="
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1.5rem;
          border-radius: 8px;
        ">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 17 4 12 9 7"></polyline>
            <path d="M20 18v-2a4 4 0 0 0-4-4H4"></path>
          </svg>
          Reply
        </button>
      </div>
    `;
  },

  stripEmailQuotedText(text) {
    if (!text) return '';
    const lines = text.split('\n');
    const cleanLines = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      // Stop at "On ... wrote:" pattern (Gmail quote header)
      if (/^On .+ wrote:$/.test(trimmed)) break;
      // Stop at lines starting with ">" (quoted text)
      if (trimmed.startsWith('>')) break;
      // Stop at signature delimiter
      if (trimmed === '--') break;
      // Stop at common email signature patterns (after blank line)
      if (cleanLines.length > 0 && cleanLines[cleanLines.length - 1].trim() === '') {
        // Signature-like: starts with URL, phone, "Sent from", "Get Outlook", company-like patterns
        if (/^(https?:\/\/|www\.|Sent from|Get Outlook|\*[A-Z])/.test(trimmed)) break;
        if (/^\+?\d[\d\s\-.()]{7,}/.test(trimmed)) break;
      }
      cleanLines.push(line);
    }
    return cleanLines.join('\n').trim();
  },

  renderEmailMessage(msg, conv) {
    const isInbound = msg.direction === 'inbound';
    const isAI = msg.is_ai_generated === true;
    const isHuman = !isInbound && !isAI;
    const timestamp = new Date(msg.sent_at || msg.created_at);
    const deliveryStatus = this.getDeliveryStatusIcon(msg);

    // Strip quoted replies and signatures from email body
    const rawText = msg.body_text || '';
    const cleanedText = this.stripEmailQuotedText(rawText);
    const content = cleanedText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return `
      <div class="message-bubble ${isInbound ? 'inbound' : 'outbound'} ${isAI ? 'ai-message' : ''} ${isHuman ? 'human-message' : ''}" data-message-id="${msg.id}">
        <div class="message-content">${content}</div>
        ${msg.attachments && msg.attachments.length > 0 ? `
          <div class="tv-msg-attachments">
            ${msg.attachments.map(a => `
              <div class="tv-attachment-thumb" onclick="window.openImageLightbox('${a.url.replace(/'/g, "\\'")}', '${(a.filename || 'image').replace(/'/g, "\\'")}')">
                <img src="${a.url}" loading="lazy" alt="${a.filename || 'attachment'}">
                <span>${a.filename || 'image'}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
        <div class="message-time">
          ${this.formatTime(timestamp)}
          ${deliveryStatus}
        </div>
      </div>
    `;
  },

  renderChatThreadView(conv) {
    // Deactivate phone nav when showing chat thread
    setPhoneNavActive(false);

    // Reactivate inbox button
    const inboxBtn = document.querySelector('.bottom-nav-item[onclick*="inbox"]');
    if (inboxBtn) {
      inboxBtn.classList.add('active');
    }

    const aiPaused = conv.session?.ai_paused_until && new Date(conv.session.ai_paused_until) > new Date();

    return `
      <div class="thread-header" style="display: flex; align-items: flex-start; gap: 0.75rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border-color);">
        <button class="back-button" id="back-button" style="
          display: none;
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0;
          margin: 0;
          color: var(--primary-color);
          line-height: 1;
        ">←</button>
        <div style="width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-weight: 600; font-size: 1rem; border: 2px solid var(--border-color, #e5e7eb); background: var(--bg-secondary, #f9fafb); color: var(--text-primary, #374151);">
          ${conv.visitorName ? conv.visitorName[0].toUpperCase() : '?'}
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; gap: 0.25rem;">
          <div style="display: flex; align-items: center; gap: 0.75rem; justify-content: space-between;">
            <h2 style="margin: 0; font-size: calc(1.125rem - 5px); font-weight: 600; line-height: 1;">
              ${conv.visitorName}
            </h2>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              ${aiPaused ? `
                <span style="font-size: 0.7rem; background: #fef3c7; color: #92400e; padding: 0.25rem 0.5rem; border-radius: 0.25rem;">
                  AI Paused
                </span>
                <button id="resume-ai-btn" class="btn btn-sm btn-secondary" style="font-size: 0.7rem; padding: 0.25rem 0.5rem;">Resume AI</button>
              ` : ''}
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: var(--text-secondary);">
            <span>${conv.widgetName}</span>
            ${conv.visitorEmail ? `<span>• ${conv.visitorEmail}</span>` : ''}
          </div>
        </div>
      </div>

      <div class="thread-messages" id="thread-messages">
        <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
          Loading messages...
        </div>
      </div>

      <div class="message-input-container">
        <textarea
          id="message-input"
          class="message-input"
          placeholder="Type a reply... (will pause AI for 5 min)"
          rows="1"
          style="resize: none;"
        ></textarea>
        <button class="send-button" id="send-chat-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>
    `;
  },

  getInitials(phone) {
    // Use last 2 digits of phone as "initials"
    return phone.slice(-2);
  },

  hasActiveFilters() {
    return this.typeFilter !== 'all' ||
           this.directionFilter !== 'all' ||
           this.missedFilter ||
           this.unreadFilter ||
           this.sentimentFilter !== 'all';
  },

  formatPhoneNumber(phone) {
    if (!phone) return 'Unknown';
    const cleaned = phone.replace(/\D/g, '');
    const match = cleaned.match(/^1?(\d{3})(\d{3})(\d{4})$/);
    if (match) {
      return `+1 (${match[1]}) ${match[2]}-${match[3]}`;
    }
    return phone;
  },

  /**
   * Extract potential caller name from transcript using common patterns
   * Returns the first name found or null
   */
  extractCallerNameFromTranscript(transcript) {
    if (!transcript) return null;

    // Search the entire transcript - speaker labels can be inconsistent
    // (caller speech is sometimes mislabeled with agent name)
    const textToSearch = transcript;
    if (!textToSearch) return null;

    // Common patterns for name introduction (allow optional punctuation between words)
    // Handle both regular apostrophe (') and fancy apostrophe (')
    const patterns = [
      /(?:my name is|i[''']m|i am|this is|it[''']s|its)[,.\s]+([A-Za-z]+)/i,
      /(?:call me|they call me)[,.\s]+([A-Za-z]+)/i,
      /^([A-Z][a-z]+)\s+(?:here|speaking|calling)/i,
    ];

    for (const pattern of patterns) {
      const match = textToSearch.match(pattern);
      if (match && match[1]) {
        const name = match[1];
        // Filter out common false positives
        const excluded = ['yes', 'no', 'hi', 'hello', 'hey', 'well', 'sure', 'okay', 'fine', 'good', 'great', 'thanks', 'thank', 'sorry', 'please', 'just', 'actually', 'really', 'maybe', 'probably', 'can', 'could', 'would', 'will', 'need', 'want', 'like', 'know', 'think', 'see', 'get', 'got', 'have', 'had', 'been', 'was', 'were', 'are', 'being', 'able', 'going', 'gonna', 'about', 'here', 'there', 'very', 'that', 'this', 'these', 'those', 'what', 'when', 'where', 'which', 'who', 'how', 'why', 'hold', 'moment', 'transfer', 'busy', 'available', 'ready', 'done', 'back', 'away', 'out', 'not', 'now', 'late', 'early', 'free', 'home', 'work', 'calling'];
        if (!excluded.includes(name.toLowerCase())) {
          return name;
        }
      }
    }

    return null;
  },

  formatTimestamp(date) {
    try {
      // Handle invalid dates
      if (!date) return '';

      // Convert string to Date if needed
      let dateObj;
      if (date instanceof Date) {
        dateObj = date;
      } else {
        dateObj = new Date(date);
      }

      // Check if valid date - multiple safety checks
      if (!dateObj || typeof dateObj.getTime !== 'function') return '';
      if (isNaN(dateObj.getTime())) return '';

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const dateDay = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());

      const timeStr = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

      // Today: just show time
      if (dateDay.getTime() === today.getTime()) {
        return timeStr;
      }

      // Yesterday: show "Yesterday" + time
      if (dateDay.getTime() === yesterday.getTime()) {
        return `Yesterday ${timeStr}`;
      }

      // Older: show full date + time
      if (typeof dateObj.toLocaleDateString !== 'function') return '';
      const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${dateStr} ${timeStr}`;
    } catch (err) {
      console.error('formatTimestamp error:', err, 'date:', date);
      return '';
    }
  },

  formatTime(date) {
    try {
      if (!date) return '';
      const dateObj = date instanceof Date ? date : new Date(date);
      if (!dateObj || typeof dateObj.getTime !== 'function') return '';
      if (isNaN(dateObj.getTime())) return '';
      if (typeof dateObj.toLocaleTimeString !== 'function') return '';
      return dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch (err) {
      console.error('formatTime error:', err);
      return '';
    }
  },

  /**
   * Format sentiment for display as an inline label
   * @param {string|null} sentiment - 'positive', 'neutral', 'negative', or null
   * @returns {string} HTML for sentiment label
   */
  formatSentimentLabel(sentiment) {
    if (!sentiment) return '';

    const config = {
      positive: { label: 'Positive', color: '#22c55e', bg: '#dcfce7' },
      neutral: { label: 'Neutral', color: '#6b7280', bg: '#f3f4f6' },
      negative: { label: 'Negative', color: '#ef4444', bg: '#fee2e2' }
    };

    const cfg = config[sentiment];
    if (!cfg) return '';

    return `<span class="sentiment-label sentiment-${sentiment}" style="
      font-size: 0.65rem;
      padding: 0.125rem 0.375rem;
      border-radius: 0.25rem;
      background: ${cfg.bg};
      color: ${cfg.color};
      font-weight: 500;
      margin-left: 0.5rem;
    ">${cfg.label}</span>`;
  },

  /**
   * Check if a call has recordings still pending sync (only for recent calls)
   */
  callHasPendingRecordings(call) {
    if (!call || call.status !== 'completed') return false;
    const recordings = call.recordings || [];
    if (recordings.length === 0) return false;
    // Only show syncing indicator for calls from the last 24 hours
    const callDate = new Date(call.started_at || call.created_at);
    if (Date.now() - callDate.getTime() > 24 * 60 * 60 * 1000) return false;
    return recordings.some(rec => {
      if (rec.status === 'pending_sync') return true;
      const hasValidUrl = rec.url && rec.url.includes('supabase.co');
      if (!hasValidUrl) return true;
      // Complete if: has transcript (even empty string means Deepgram checked), OR duration too short for speech
      const recDuration = parseInt(rec.duration) || 0;
      if (recDuration < 3) return false;
      // transcript is undefined/null = not yet attempted, empty string = attempted but no speech
      if (rec.transcript !== undefined && rec.transcript !== null) return false;
      return true;
    });
  },

  /**
   * Render a small syncing spinner badge (same size/position as sentiment label)
   */
  renderSyncingBadge() {
    return `<span style="
      font-size: 0.65rem;
      padding: 0.125rem 0.375rem;
      border-radius: 0.25rem;
      background: var(--bg-tertiary, #f3f4f6);
      color: var(--text-secondary, #6b7280);
      font-weight: 500;
      margin-left: 0.5rem;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    "><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>Syncing</span>`;
  },

  /**
   * Get sentiment for a conversation
   * For calls: use user_sentiment from call record
   * For SMS: use sentiment from most recent inbound message
   */
  getConversationSentiment(conv) {
    if (conv.type === 'call') {
      return conv.call?.user_sentiment || null;
    } else if (conv.type === 'sms') {
      // Find most recent inbound message with sentiment
      const inboundWithSentiment = conv.messages
        ?.filter(m => m.direction === 'inbound' && m.sentiment)
        ?.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
      return inboundWithSentiment?.[0]?.sentiment || null;
    } else if (conv.type === 'email') {
      // Find most recent message with sentiment (all directions analyzed)
      const withSentiment = conv.messages
        ?.filter(m => m.sentiment)
        ?.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
      return withSentiment?.[0]?.sentiment || null;
    }
    return null;
  },

};
