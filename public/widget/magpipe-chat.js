/**
 * Magpipe Chat Widget
 * Embeddable chat widget for websites
 *
 * Usage:
 * <script>
 *   (function(w,d,s,o,f,js,fjs){
 *     w['MagpipeWidget']=o;w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
 *     js=d.createElement(s);fjs=d.getElementsByTagName(s)[0];
 *     js.id=o;js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
 *   }(window,document,'script','MagpipeChat','https://magpipe.ai/widget/magpipe-chat.js'));
 *   MagpipeChat('init', { widgetKey: 'YOUR_WIDGET_KEY' });
 * </script>
 */

(function() {
  'use strict';

  // Configuration
  const API_URL = 'https://api.magpipe.ai/functions/v1/webhook-chat-message';
  const SUPABASE_URL = 'https://api.magpipe.ai';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10eGJpeWlsdmd3aGJkcHR5c2V4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxNzE2OTksImV4cCI6MjA3NDc0NzY5OX0.VpOfuXl7S_ZdSpRjD8DGkSbbT4Y5g4rsezYNYGdtNPs';

  // State
  let config = null;
  let visitorId = null;
  let sessionId = null;
  let isOpen = false;
  let messages = [];
  let realtimeChannel = null;
  let supabaseClient = null;

  // Get or generate visitor ID
  function getVisitorId() {
    let id = localStorage.getItem('magpipe_chat_visitor_id');
    if (!id) {
      id = 'v_' + crypto.randomUUID();
      localStorage.setItem('magpipe_chat_visitor_id', id);
    }
    return id;
  }

  // Load Supabase client for realtime
  async function loadSupabase() {
    if (supabaseClient) return supabaseClient;

    // Dynamically load Supabase from CDN
    return new Promise((resolve, reject) => {
      // Check if supabase module is available (has createClient)
      if (window.supabase?.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        resolve(supabaseClient);
        return;
      }

      // Check if supabase client instance already exists (from main app)
      // It will have 'from' and 'auth' methods instead of 'createClient'
      if (window.supabase?.from && window.supabase?.channel) {
        supabaseClient = window.supabase;
        resolve(supabaseClient);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      script.onload = () => {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        resolve(supabaseClient);
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Subscribe to realtime messages
  async function subscribeToMessages() {
    if (!sessionId) return;

    try {
      const sb = await loadSupabase();

      // Unsubscribe from previous channel if exists
      if (realtimeChannel) {
        sb.removeChannel(realtimeChannel);
      }

      realtimeChannel = sb.channel(`chat-${sessionId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `session_id=eq.${sessionId}`
        }, (payload) => {
          const newMessage = payload.new;
          // Only add if it's an agent message (to avoid duplicates for visitor messages)
          if (newMessage.role === 'agent') {
            // Check if we already have this message (from API response)
            const exists = messages.some(m => m.id === newMessage.id);
            if (!exists) {
              messages.push(newMessage);
              renderMessages();
              scrollToBottom();
            }
          }
        })
        .subscribe();
    } catch (err) {
      console.error('Magpipe Chat: Failed to subscribe to realtime:', err);
    }
  }

  // Create widget elements
  function createWidget() {
    const primaryColor = config.primaryColor || '#6366f1';
    const position = config.position || 'bottom-right';
    const offsetX = config.offsetX || 20;
    const offsetY = config.offsetY || 20;
    const isPortal = config.isPortal || false;

    // Calculate position styles
    const isBottom = position.includes('bottom');
    const isRight = position.includes('right');

    const bubblePosition = `
      ${isBottom ? `bottom: ${offsetY}px` : `top: ${offsetY}px`};
      ${isRight ? `right: ${offsetX}px` : `left: ${offsetX}px`};
    `;

    const modalPosition = `
      ${isBottom ? `bottom: ${offsetY + 70}px` : `top: ${offsetY + 70}px`};
      ${isRight ? `right: ${offsetX}px` : `left: ${offsetX}px`};
    `;

    // Create container
    const container = document.createElement('div');
    container.id = 'magpipe-chat-container';

    // Styles
    const styles = document.createElement('style');
    styles.textContent = `
      .magpipe-chat-bubble {
        position: fixed;
        ${bubblePosition}
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: ${primaryColor};
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .magpipe-chat-bubble:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 16px rgba(0,0,0,0.2);
      }
      .magpipe-chat-bubble svg {
        width: 28px;
        height: 28px;
        fill: white;
      }
      .magpipe-chat-modal {
        position: fixed;
        ${modalPosition}
        width: 380px;
        max-width: calc(100vw - 40px);
        height: 520px;
        max-height: calc(100vh - 120px);
        background: white;
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.15);
        z-index: 99998;
        display: none;
        flex-direction: column;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .magpipe-chat-modal.open {
        display: flex;
      }
      .magpipe-chat-header {
        background: ${primaryColor};
        color: white;
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .magpipe-chat-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }
      .magpipe-chat-close {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        padding: 4px;
        display: flex;
        opacity: 0.8;
      }
      .magpipe-chat-close:hover {
        opacity: 1;
      }
      .magpipe-chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .magpipe-chat-message {
        max-width: 85%;
        padding: 10px 14px;
        border-radius: 16px;
        font-size: 14px;
        line-height: 1.4;
        word-wrap: break-word;
      }
      .magpipe-chat-message.visitor {
        background: ${primaryColor};
        color: white;
        align-self: flex-end;
        border-bottom-right-radius: 4px;
      }
      .magpipe-chat-message.agent {
        background: #f3f4f6;
        color: #1f2937;
        align-self: flex-start;
        border-bottom-left-radius: 4px;
      }
      .magpipe-chat-message.system {
        background: #fef3c7;
        color: #92400e;
        align-self: center;
        font-size: 12px;
        text-align: center;
      }
      .magpipe-chat-typing {
        align-self: flex-start;
        background: #f3f4f6;
        padding: 10px 14px;
        border-radius: 16px;
        border-bottom-left-radius: 4px;
        display: none;
        margin: 0 16px 12px 16px;
      }
      .magpipe-chat-typing.show {
        display: flex;
      }
      .magpipe-chat-typing span {
        width: 8px;
        height: 8px;
        background: #9ca3af;
        border-radius: 50%;
        margin: 0 2px;
        animation: magpipe-chat-bounce 1.4s infinite ease-in-out both;
      }
      .magpipe-chat-typing span:nth-child(1) { animation-delay: -0.32s; }
      .magpipe-chat-typing span:nth-child(2) { animation-delay: -0.16s; }
      @keyframes magpipe-chat-bounce {
        0%, 80%, 100% { transform: scale(0); }
        40% { transform: scale(1); }
      }
      .magpipe-chat-input-container {
        padding: 12px 16px;
        border-top: 1px solid #e5e7eb;
        display: flex;
        gap: 8px;
      }
      .magpipe-chat-input {
        flex: 1;
        border: 1px solid #e5e7eb;
        border-radius: 24px;
        padding: 10px 16px;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
      }
      .magpipe-chat-input:focus {
        border-color: ${primaryColor};
      }
      .magpipe-chat-send {
        background: ${primaryColor};
        border: none;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: opacity 0.2s;
      }
      .magpipe-chat-send:hover {
        opacity: 0.9;
      }
      .magpipe-chat-send:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .magpipe-chat-send svg {
        width: 18px;
        height: 18px;
        fill: white;
      }
      .magpipe-chat-empty {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #6b7280;
        text-align: center;
        padding: 20px;
      }
      .magpipe-chat-empty svg {
        width: 48px;
        height: 48px;
        fill: #d1d5db;
        margin-bottom: 12px;
      }
      @media (max-width: 480px) {
        ${isPortal ? `
        /* Hide widget on mobile when on portal */
        .magpipe-chat-bubble,
        .magpipe-chat-modal {
          display: none !important;
        }
        ` : `
        .magpipe-chat-modal {
          top: 0;
          bottom: 0;
          right: 0;
          left: 0;
          width: 100%;
          max-width: 100%;
          height: 100%;
          max-height: 100%;
          border-radius: 0;
        }
        .magpipe-chat-bubble {
          ${isBottom ? `bottom: ${Math.max(16, offsetY)}px; top: auto;` : `top: ${Math.max(16, offsetY)}px; bottom: auto;`}
          ${isRight ? `right: ${Math.max(16, offsetX)}px; left: auto;` : `left: ${Math.max(16, offsetX)}px; right: auto;`}
        }
        `}
      }
    `;
    container.appendChild(styles);

    // Chat bubble
    const bubble = document.createElement('div');
    bubble.className = 'magpipe-chat-bubble';
    bubble.innerHTML = `
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C6.48 2 2 6.48 2 12c0 1.82.49 3.53 1.34 5L2 22l5-1.34C8.47 21.51 10.18 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.61 0-3.12-.46-4.39-1.25l-.31-.19-3.22.84.85-3.12-.2-.32C4.46 15.12 4 13.61 4 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z"/>
      </svg>
    `;
    bubble.addEventListener('click', toggleChat);
    container.appendChild(bubble);

    // Chat modal
    const modal = document.createElement('div');
    modal.className = 'magpipe-chat-modal';
    modal.id = 'magpipe-chat-modal';
    modal.innerHTML = `
      <div class="magpipe-chat-header">
        <h3>${config.name || 'Chat with us'}</h3>
        <button class="magpipe-chat-close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="magpipe-chat-messages" id="magpipe-chat-messages">
        <div class="magpipe-chat-empty">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12c0 1.82.49 3.53 1.34 5L2 22l5-1.34C8.47 21.51 10.18 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.61 0-3.12-.46-4.39-1.25l-.31-.19-3.22.84.85-3.12-.2-.32C4.46 15.12 4 13.61 4 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z"/>
          </svg>
          <p>${getWelcomeMessage()}</p>
        </div>
      </div>
      <div class="magpipe-chat-typing" id="magpipe-chat-typing">
        <span></span><span></span><span></span>
      </div>
      <div class="magpipe-chat-input-container">
        <input type="text" class="magpipe-chat-input" id="magpipe-chat-input" placeholder="Type a message..." />
        <button class="magpipe-chat-send" id="magpipe-chat-send">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </button>
      </div>
    `;
    container.appendChild(modal);

    // Append container to body
    document.body.appendChild(container);

    // Event listeners
    modal.querySelector('.magpipe-chat-close').addEventListener('click', toggleChat);

    const input = document.getElementById('magpipe-chat-input');
    const sendBtn = document.getElementById('magpipe-chat-send');

    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    sendBtn.addEventListener('click', sendMessage);

    // Close chat when clicking outside
    document.addEventListener('click', (e) => {
      if (!isOpen) return;
      const clickedInModal = modal.contains(e.target);
      const clickedOnBubble = bubble.contains(e.target);
      if (!clickedInModal && !clickedOnBubble) {
        toggleChat();
      }
    });
  }

  // Toggle chat open/closed
  function toggleChat() {
    isOpen = !isOpen;
    const modal = document.getElementById('magpipe-chat-modal');
    if (modal) {
      modal.classList.toggle('open', isOpen);
      if (isOpen) {
        document.getElementById('magpipe-chat-input').focus();
        // Load history on first open
        if (messages.length === 0) {
          loadHistory();
        }
      }
    }
  }

  // Fetch AI-generated greeting
  async function fetchAiGreeting() {
    if (!config.useAiGreeting) return;

    setTyping(true);
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          widgetKey: config.widgetKey,
          visitorId: visitorId,
          visitorName: config.visitorName || null,
          visitorEmail: config.visitorEmail || null,
          requestGreeting: true,
          pageUrl: window.location.href,
        })
      });

      const data = await response.json();
      if (data.success && data.aiResponse) {
        sessionId = data.sessionId;
        const greetingId = data.aiMessageId || 'greeting_' + Date.now();
        const exists = messages.some(m => m.id === greetingId);
        if (!exists) {
          messages.push({
            id: greetingId,
            role: 'agent',
            content: data.aiResponse,
            created_at: new Date().toISOString()
          });
        }
        saveHistory();
        renderMessages();
        subscribeToMessages();
      }
    } catch (error) {
      console.error('Magpipe Chat: Failed to fetch AI greeting:', error);
    } finally {
      setTyping(false);
    }
  }

  // Load chat history from localStorage
  function loadHistory() {
    const saved = localStorage.getItem(`magpipe_chat_history_${config.widgetKey}`);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        sessionId = data.sessionId;
        messages = data.messages || [];
        renderMessages();
        // Subscribe to realtime updates
        subscribeToMessages();
      } catch (e) {
        console.error('Magpipe Chat: Failed to load history', e);
      }
    } else if (config.useAiGreeting) {
      // No history - fetch AI greeting
      fetchAiGreeting();
    }
  }

  // Save chat history to localStorage
  function saveHistory() {
    localStorage.setItem(`magpipe_chat_history_${config.widgetKey}`, JSON.stringify({
      sessionId,
      messages
    }));
  }

  // Get personalized welcome message
  function getWelcomeMessage() {
    const defaultWelcome = config.visitorName
      ? `Hi ${config.visitorName}! How can I help you today?`
      : 'Hi! How can I help you today?';
    if (config.welcomeMessage) {
      return config.visitorName
        ? config.welcomeMessage.replace(/^Hi!?/i, `Hi ${config.visitorName}!`)
        : config.welcomeMessage;
    }
    return defaultWelcome;
  }

  // Render messages
  function renderMessages() {
    const container = document.getElementById('magpipe-chat-messages');
    if (!container) return;

    if (messages.length === 0) {
      container.innerHTML = `
        <div class="magpipe-chat-empty">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12c0 1.82.49 3.53 1.34 5L2 22l5-1.34C8.47 21.51 10.18 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.61 0-3.12-.46-4.39-1.25l-.31-.19-3.22.84.85-3.12-.2-.32C4.46 15.12 4 13.61 4 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z"/>
          </svg>
          <p>${getWelcomeMessage()}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = messages.map(m => `
      <div class="magpipe-chat-message ${m.role}">
        ${escapeHtml(m.content)}
      </div>
    `).join('');
  }

  // Escape HTML to prevent XSS
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Scroll messages to bottom
  function scrollToBottom() {
    const container = document.getElementById('magpipe-chat-messages');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  // Show/hide typing indicator
  function setTyping(show) {
    const typing = document.getElementById('magpipe-chat-typing');
    if (typing) {
      typing.classList.toggle('show', show);
    }
    if (show) scrollToBottom();
  }

  // Send message
  async function sendMessage() {
    const input = document.getElementById('magpipe-chat-input');
    const sendBtn = document.getElementById('magpipe-chat-send');
    const message = input.value.trim();

    if (!message) return;

    // Disable input while sending
    input.disabled = true;
    sendBtn.disabled = true;

    // Add visitor message to UI immediately
    const visitorMsg = {
      id: 'temp_' + Date.now(),
      role: 'visitor',
      content: message,
      created_at: new Date().toISOString()
    };
    messages.push(visitorMsg);
    renderMessages();
    scrollToBottom();

    // Clear input
    input.value = '';

    // Show typing indicator
    setTyping(true);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          widgetKey: config.widgetKey,
          visitorId: visitorId,
          visitorName: config.visitorName || null,
          visitorEmail: config.visitorEmail || null,
          message: message,
          pageUrl: window.location.href,
          browserInfo: {
            userAgent: navigator.userAgent,
            language: navigator.language,
          }
        })
      });

      const data = await response.json();

      if (data.error) {
        console.error('Magpipe Chat: API error:', data.error, data.details);
        // Show error message
        messages.push({
          id: 'error_' + Date.now(),
          role: 'system',
          content: 'Sorry, something went wrong. Please try again.',
          created_at: new Date().toISOString()
        });
      } else {
        // Update session ID
        if (data.sessionId && data.sessionId !== sessionId) {
          sessionId = data.sessionId;
          // Subscribe to realtime for this session
          subscribeToMessages();
        }

        // Update visitor message ID with real one
        visitorMsg.id = data.messageId;

        // Add AI response if present (check for duplicates from realtime)
        if (data.aiResponse) {
          const aiMsgId = data.aiMessageId || 'ai_' + Date.now();
          const exists = messages.some(m => m.id === aiMsgId);
          if (!exists) {
            messages.push({
              id: aiMsgId,
              role: 'agent',
              content: data.aiResponse,
              created_at: new Date().toISOString()
            });
          }
        }
      }

      saveHistory();
      renderMessages();
      scrollToBottom();
    } catch (error) {
      console.error('Magpipe Chat: Request failed:', error);
      messages.push({
        id: 'error_' + Date.now(),
        role: 'system',
        content: 'Unable to connect. Please check your internet connection.',
        created_at: new Date().toISOString()
      });
      renderMessages();
      scrollToBottom();
    } finally {
      // Re-enable input
      input.disabled = false;
      sendBtn.disabled = false;
      input.focus();
      setTyping(false);
    }
  }

  // Initialize
  function init(options) {
    if (!options || !options.widgetKey) {
      console.error('Magpipe Chat: widgetKey is required');
      return;
    }

    config = {
      widgetKey: options.widgetKey,
      primaryColor: options.primaryColor || '#6366f1',
      position: options.position || 'bottom-right',
      offsetX: options.offsetX || 20,
      offsetY: options.offsetY || 20,
      name: options.name || 'Chat with us',
      welcomeMessage: options.welcomeMessage || 'Hi! How can I help you today?',
      isPortal: options.isPortal || false,
      visitorName: options.visitorName || null,
      visitorEmail: options.visitorEmail || null,
      useAiGreeting: options.useAiGreeting ?? true,
    };

    visitorId = getVisitorId();

    // Wait for DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createWidget);
    } else {
      createWidget();
    }
  }

  // Process queue and expose API
  window.MagpipeChat = function(action, options) {
    if (action === 'init') {
      init(options);
    } else if (action === 'open') {
      if (!isOpen) toggleChat();
    } else if (action === 'close') {
      if (isOpen) toggleChat();
    } else if (action === 'clearHistory') {
      messages = [];
      sessionId = null;
      localStorage.removeItem(`magpipe_chat_history_${config?.widgetKey}`);
      renderMessages();
    }
  };

  // Process queued commands
  if (window.MagpipeChat && window.MagpipeChat.q) {
    window.MagpipeChat.q.forEach(args => window.MagpipeChat.apply(null, args));
  }
})();
