/**
 * Omni Chat Interface Component
 * Voice/text chat interface for admin/support to talk to any agent
 */

import { supabase } from '../lib/supabase.js';
import { RealtimeOmniService } from '../services/realtimeOmniService.js';

/**
 * Create Omni Chat interface
 * @param {HTMLElement} container - Container element
 * @param {Object} session - Auth session
 * @returns {object} Component API
 */
export function createOmniChatInterface(container, _session) {
  // Component state
  let agents = [];
  let selectedAgentId = null;
  let selectedAgent = null;
  let messages = [];
  let isLoading = false;
  let voiceModeEnabled = false;
  let realtimeService = null;
  let analyser = null;
  let animationId = null;

  // Timestamp-based message tracking for proper ordering
  let pendingMessages = [];
  let currentUserTimestamp = null;
  let currentAssistantTimestamp = null;
  let currentUserMessage = '';
  let currentAssistantMessage = '';

  // Create main container
  const chatContainer = document.createElement('div');
  chatContainer.className = 'omni-chat-interface';

  // Agent selector header
  const headerSection = document.createElement('div');
  headerSection.className = 'omni-chat-header';

  const agentLabel = document.createElement('label');
  agentLabel.className = 'omni-agent-label';
  agentLabel.textContent = 'Agent:';

  const agentSelect = document.createElement('select');
  agentSelect.className = 'omni-agent-select form-input form-select';
  agentSelect.innerHTML = '<option value="">Loading agents...</option>';
  agentSelect.addEventListener('change', (e) => handleAgentChange(e.target.value));

  headerSection.appendChild(agentLabel);
  headerSection.appendChild(agentSelect);
  chatContainer.appendChild(headerSection);

  // Chat area
  const chatArea = document.createElement('div');
  chatArea.className = 'omni-chat-area';

  // Message history
  const messageHistory = document.createElement('div');
  messageHistory.className = 'omni-messages';
  chatArea.appendChild(messageHistory);

  // Input container
  const inputContainer = document.createElement('div');
  inputContainer.className = 'omni-input-container';

  // Text input
  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.className = 'omni-input';
  textInput.placeholder = 'Type a message...';
  textInput.disabled = true;
  textInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Voice mode toggle button
  const voiceModeToggle = document.createElement('button');
  voiceModeToggle.type = 'button';
  voiceModeToggle.className = 'omni-voice-toggle';
  voiceModeToggle.disabled = true;
  voiceModeToggle.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="8" width="2" height="8" rx="1" fill="currentColor" class="wave-bar bar-1"/>
      <rect x="8" y="5" width="2" height="14" rx="1" fill="currentColor" class="wave-bar bar-2"/>
      <rect x="12" y="3" width="2" height="18" rx="1" fill="currentColor" class="wave-bar bar-3"/>
      <rect x="16" y="7" width="2" height="10" rx="1" fill="currentColor" class="wave-bar bar-4"/>
      <rect x="20" y="9" width="2" height="6" rx="1" fill="currentColor" class="wave-bar bar-5"/>
    </svg>
  `;
  voiceModeToggle.title = 'Start voice conversation';
  voiceModeToggle.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleVoiceMode();
  });

  inputContainer.appendChild(textInput);
  inputContainer.appendChild(voiceModeToggle);
  chatArea.appendChild(inputContainer);
  chatContainer.appendChild(chatArea);

  // Append to container
  container.appendChild(chatContainer);

  // Load agents
  loadAgents();

  /**
   * Load all agents
   */
  async function loadAgents() {
    try {
      // Use service role via edge function to get all agents
      const { data: { session: currentSession } } = await supabase.auth.getSession();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-list-agents`,
        {
          headers: {
            'Authorization': `Bearer ${currentSession.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        // Fallback to direct query (admin/support can see all via RLS)
        const { data, error } = await supabase
          .from('agent_configs')
          .select('id, name, user_id, voice_id, system_prompt')
          .order('created_at', { ascending: false });

        if (error) throw error;
        agents = data || [];
      } else {
        const data = await response.json();
        agents = data.agents || [];
      }

      renderAgentSelect();
    } catch (error) {
      console.error('[OmniChat] Failed to load agents:', error);
      agentSelect.innerHTML = '<option value="">Failed to load agents</option>';
    }
  }

  /**
   * Render agent selector options
   */
  function renderAgentSelect() {
    if (agents.length === 0) {
      agentSelect.innerHTML = '<option value="">No agents found</option>';
      return;
    }

    // Find global agent to auto-select
    const globalAgent = agents.find(a => a.is_global);

    agentSelect.innerHTML = '<option value="">Select an agent...</option>' +
      agents.map(agent => {
        const ownerLabel = agent.is_global ? '' : ` (${agent.owner_name || 'Unknown'})`;
        return `<option value="${agent.id}">${agent.name || 'Unnamed Agent'}${ownerLabel}</option>`;
      }).join('');

    // Auto-select global agent if exists
    if (globalAgent) {
      agentSelect.value = globalAgent.id;
      handleAgentChange(globalAgent.id);
    }
  }

  /**
   * Handle agent selection change
   */
  async function handleAgentChange(agentId) {
    if (!agentId) {
      selectedAgentId = null;
      selectedAgent = null;
      textInput.disabled = true;
      voiceModeToggle.disabled = true;

      // Disconnect existing realtime service
      if (realtimeService) {
        realtimeService.disconnect();
        realtimeService = null;
      }

      messageHistory.innerHTML = `
        <div class="omni-placeholder">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <p>Select an agent to start chatting</p>
        </div>
      `;
      return;
    }

    // If switching agents mid-conversation, confirm
    if (selectedAgentId && selectedAgentId !== agentId && messages.length > 0) {
      if (!confirm('Switching agents will clear the current conversation. Continue?')) {
        agentSelect.value = selectedAgentId;
        return;
      }
    }

    // Close voice mode if active
    if (voiceModeEnabled) {
      closeVoiceOverlay();
    }

    // Disconnect existing realtime service
    if (realtimeService) {
      realtimeService.disconnect();
      realtimeService = null;
    }

    selectedAgentId = agentId;
    selectedAgent = agents.find(a => a.id === agentId);
    messages = [];
    pendingMessages = [];
    currentUserMessage = '';
    currentAssistantMessage = '';

    // Enable text input immediately (text mode doesn't need realtime connection)
    messageHistory.innerHTML = '';
    textInput.disabled = false;
    voiceModeToggle.disabled = false;

    // Show welcome message
    addMessage('assistant', `Connected to ${selectedAgent?.name || 'agent'}. Type a message or click the voice button to talk.`);
  }

  /**
   * Handle transcript updates (for voice mode)
   */
  function handleTranscriptUpdate(transcript, role, timestamp) {
    // Update voice overlay transcript if visible
    const transcriptArea = document.getElementById('omni-voice-transcript-content');
    if (transcriptArea) {
      let msgEl = transcriptArea.querySelector(`.omni-voice-transcript-msg.${role}:last-child`);
      if (!msgEl || (role === 'user' && msgEl.dataset.finalized === 'true')) {
        msgEl = document.createElement('div');
        msgEl.className = `omni-voice-transcript-msg ${role}`;
        transcriptArea.appendChild(msgEl);
      }

      if (role === 'user') {
        const currentText = msgEl.textContent || '';
        const newText = currentText && !transcript.startsWith(currentText)
          ? currentText + ' ' + transcript
          : transcript;
        msgEl.textContent = newText;
        msgEl.dataset.finalized = 'true';
      } else {
        msgEl.textContent = (msgEl.textContent || '') + transcript;
      }

      const scrollArea = document.getElementById('omni-voice-transcript-area');
      if (scrollArea) {
        scrollArea.scrollTop = scrollArea.scrollHeight;
      }
    }

    // Update main message history
    if (role === 'user') {
      if (!currentUserTimestamp) {
        currentUserTimestamp = timestamp || Date.now();
      }
      currentUserMessage = transcript;

      let userMsg = pendingMessages.find(m => m.role === 'user' && m.timestamp === currentUserTimestamp);
      if (!userMsg) {
        userMsg = { role: 'user', content: currentUserMessage, timestamp: currentUserTimestamp, element: null };
        pendingMessages.push(userMsg);
      } else {
        userMsg.content = currentUserMessage;
      }
      renderMessagesInOrder();

      // Finalize after short delay
      setTimeout(() => {
        if (currentUserMessage.trim()) {
          messages.push({ role: 'user', content: currentUserMessage.trim() });
          currentUserMessage = '';
          currentUserTimestamp = null;
        }
      }, 1000);

    } else if (role === 'assistant') {
      if (!currentAssistantTimestamp) {
        currentAssistantTimestamp = timestamp || Date.now();
      }
      currentAssistantMessage += transcript;

      let assistantMsg = pendingMessages.find(m => m.role === 'assistant' && m.timestamp === currentAssistantTimestamp);
      if (!assistantMsg) {
        assistantMsg = { role: 'assistant', content: currentAssistantMessage, timestamp: currentAssistantTimestamp, element: null };
        pendingMessages.push(assistantMsg);
      } else {
        assistantMsg.content = currentAssistantMessage;
      }
      renderMessagesInOrder();
    }
  }

  // Track pending action for confirmation
  let pendingAction = null;

  /**
   * Handle send message (text mode - turn-based)
   */
  async function handleSend() {
    const message = textInput.value.trim();

    if (!message || isLoading || !selectedAgentId) {
      return;
    }

    textInput.value = '';
    addMessage('user', message);
    setLoading(true);

    try {
      // Get current session
      const { data: { session: currentSession } } = await supabase.auth.getSession();

      // Build conversation history for context (exclude welcome message)
      const conversationHistory = messages.slice(1, -1).map(m => ({
        role: m.role,
        content: m.content
      }));

      // Call text-based chat endpoint
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/omni-chat`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${currentSession.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            agent_id: selectedAgentId,
            message,
            conversation_history: conversationHistory,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send message');
      }

      const data = await response.json();

      // Add assistant response
      addMessage('assistant', data.response);

      // Handle pending action (show confirmation UI)
      if (data.pending_action) {
        pendingAction = data.pending_action;
        showPendingAction(data.pending_action);
      }

      // Handle business info
      if (data.business_info) {
        showBusinessInfo(data.business_info);
      }

    } catch (error) {
      console.error('[OmniChat] Send error:', error);
      showError(error.message || 'Failed to send message');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Show pending action confirmation UI
   */
  function showPendingAction(action) {
    const actionEl = document.createElement('div');
    actionEl.className = 'omni-pending-action';

    actionEl.innerHTML = `
      <div class="omni-action-preview">${escapeHtml(action.preview)}</div>
      <div class="omni-action-buttons">
        <button class="omni-action-btn omni-action-confirm" data-action="confirm">
          ✓ Confirm
        </button>
        <button class="omni-action-btn omni-action-cancel" data-action="cancel">
          ✗ Cancel
        </button>
      </div>
    `;

    // Add click handlers
    actionEl.querySelector('[data-action="confirm"]').addEventListener('click', () => {
      executeAction(action);
      actionEl.remove();
    });

    actionEl.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      addMessage('assistant', 'Action cancelled.');
      pendingAction = null;
      actionEl.remove();
    });

    messageHistory.appendChild(actionEl);
    scrollToBottom();
  }

  /**
   * Show business info card
   */
  function showBusinessInfo(info) {
    const infoEl = document.createElement('div');
    infoEl.className = 'omni-business-info';

    infoEl.innerHTML = `
      <div class="omni-business-name">${escapeHtml(info.name)}</div>
      ${info.address ? `<div class="omni-business-address">📍 ${escapeHtml(info.address)}</div>` : ''}
      <div class="omni-business-phone">📞 ${escapeHtml(info.phone)}</div>
      <div class="omni-business-actions">
        <button class="omni-action-btn omni-action-call" data-phone="${escapeHtml(info.phone_number)}">
          Call
        </button>
        <button class="omni-action-btn omni-action-add" data-name="${escapeHtml(info.name)}" data-phone="${escapeHtml(info.phone_number)}">
          Add to Contacts
        </button>
      </div>
    `;

    // Add click handlers
    infoEl.querySelector('.omni-action-call').addEventListener('click', (e) => {
      const phone = e.target.dataset.phone;
      executeAction({
        type: 'call_contact',
        parameters: { phone_number: phone, name: info.name }
      });
    });

    infoEl.querySelector('.omni-action-add').addEventListener('click', (e) => {
      const name = e.target.dataset.name;
      const phone = e.target.dataset.phone;
      executeAction({
        type: 'add_contact',
        parameters: { name, phone_number: phone, user_id: selectedAgent?.user_id }
      });
    });

    messageHistory.appendChild(infoEl);
    scrollToBottom();
  }

  /**
   * Execute a confirmed action
   */
  async function executeAction(action) {
    setLoading(true);

    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();

      // Call the appropriate execution endpoint based on action type
      let endpoint = '';
      let body = {};

      switch (action.type) {
        case 'call_contact':
          endpoint = 'initiate-bridged-call';
          body = {
            destinationNumber: action.parameters.phone_number,
            purpose: action.parameters.purpose,
            goal: action.parameters.goal,
          };
          break;

        case 'send_sms':
          endpoint = 'send-sms';
          body = {
            to: action.parameters.phone_number,
            message: action.parameters.message,
          };
          break;

        case 'add_contact':
          // Direct database insert for contacts
          const { error: contactError } = await supabase
            .from('contacts')
            .insert({
              user_id: action.parameters.user_id || selectedAgent?.user_id,
              name: action.parameters.name,
              phone_number: action.parameters.phone_number,
              notes: action.parameters.notes,
            });

          if (contactError) throw contactError;
          addMessage('assistant', `✓ Added ${action.parameters.name} to contacts.`);
          pendingAction = null;
          return;

        case 'update_agent_config':
          // Update agent config
          const updateField = action.parameters.field;
          const updateValue = action.parameters.value;

          const { error: updateError } = await supabase
            .from('agent_configs')
            .update({ [updateField]: updateValue })
            .eq('id', action.parameters.agent_id);

          if (updateError) throw updateError;
          addMessage('assistant', `✓ Updated agent's ${updateField}.`);
          pendingAction = null;
          return;

        default:
          addMessage('assistant', `Action type "${action.type}" not yet implemented.`);
          pendingAction = null;
          return;
      }

      // Call edge function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${currentSession.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Action failed');
      }

      const result = await response.json();
      addMessage('assistant', `✓ ${action.type === 'call_contact' ? 'Call initiated' : 'Message sent'} successfully.`);
      pendingAction = null;

    } catch (error) {
      console.error('[OmniChat] Action error:', error);
      showError(error.message || 'Failed to execute action');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Add message to history
   */
  function addMessage(role, content) {
    messages.push({ role, content });

    const messageEl = document.createElement('div');
    messageEl.className = `omni-message omni-message-${role}`;

    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'omni-bubble';
    bubbleEl.textContent = content;

    messageEl.appendChild(bubbleEl);
    messageHistory.appendChild(messageEl);

    scrollToBottom();
  }

  /**
   * Set loading state
   */
  function setLoading(loading) {
    isLoading = loading;
    textInput.disabled = loading || !selectedAgentId;
    textInput.placeholder = loading ? 'Sending...' : 'Type a message...';
  }

  /**
   * Show error message
   */
  function showError(message) {
    const errorEl = document.createElement('div');
    errorEl.className = 'omni-error';
    errorEl.textContent = message;
    messageHistory.appendChild(errorEl);
    scrollToBottom();

    setTimeout(() => {
      errorEl.classList.add('fade-out');
      setTimeout(() => errorEl.remove(), 300);
    }, 5000);
  }

  /**
   * Scroll to bottom
   */
  function scrollToBottom() {
    requestAnimationFrame(() => {
      messageHistory.scrollTop = messageHistory.scrollHeight;
    });
  }

  /**
   * Toggle voice mode
   */
  function toggleVoiceMode() {
    if (voiceModeEnabled) {
      closeVoiceOverlay();
    } else {
      openVoiceOverlay();
    }
  }

  /**
   * Open voice conversation overlay
   */
  async function openVoiceOverlay() {
    if (!selectedAgentId) {
      showError('Please select an agent first');
      return;
    }

    voiceModeEnabled = true;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'omni-voice-overlay';
    overlay.id = 'omni-voice-overlay';

    overlay.innerHTML = `
      <div class="omni-voice-overlay-close" id="omni-voice-overlay-close">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <line x1="18" y1="6" x2="6" y2="18" stroke-width="2" stroke-linecap="round"/>
          <line x1="6" y1="6" x2="18" y2="18" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>

      <div class="omni-voice-overlay-content">
        <div class="omni-voice-agent-name">${selectedAgent?.name || 'Agent'}</div>
        <div class="omni-voice-waveform-container">
          <canvas id="omni-voice-waveform-canvas" width="200" height="200"></canvas>
          <div class="omni-voice-connecting" id="omni-voice-connecting">
            <div class="omni-connecting-spinner"></div>
            <div class="omni-connecting-text">Connecting...</div>
          </div>
        </div>
        <div class="omni-voice-transcript-area" id="omni-voice-transcript-area">
          <div class="omni-voice-transcript-content" id="omni-voice-transcript-content"></div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Attach close handler
    const closeBtn = document.getElementById('omni-voice-overlay-close');
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeVoiceOverlay();
    }, true);

    // Animate in
    requestAnimationFrame(() => {
      overlay.classList.add('active');
    });

    // Setup audio visualization
    animationId = null;
    analyser = null;

    const canvas = document.getElementById('omni-voice-waveform-canvas');
    const ctx = canvas.getContext('2d');

    function drawWaveform() {
      if (!voiceModeEnabled) {
        if (animationId) cancelAnimationFrame(animationId);
        return;
      }

      let dataArray, bufferLength, intensity;

      if (analyser && (analyser.input || analyser.output)) {
        const inputData = analyser.input ? new Uint8Array(analyser.input.frequencyBinCount) : null;
        const outputData = analyser.output ? new Uint8Array(analyser.output.frequencyBinCount) : null;

        if (inputData) analyser.input.getByteFrequencyData(inputData);
        if (outputData) analyser.output.getByteFrequencyData(outputData);

        const inputAvg = inputData ? inputData.reduce((sum, value) => sum + value, 0) / inputData.length : 0;
        const outputAvg = outputData ? outputData.reduce((sum, value) => sum + value, 0) / outputData.length : 0;

        if (outputAvg > inputAvg && outputData) {
          dataArray = outputData;
          bufferLength = outputData.length;
          intensity = outputAvg / 255;
        } else if (inputData) {
          dataArray = inputData;
          bufferLength = inputData.length;
          intensity = inputAvg / 255;
        } else {
          bufferLength = 128;
          dataArray = new Uint8Array(bufferLength);
          const breathe = Math.sin(Date.now() * 0.002) * 0.5 + 0.5;
          intensity = breathe * 0.3;
          for (let i = 0; i < bufferLength; i++) {
            dataArray[i] = Math.sin(i * 0.1 + Date.now() * 0.001) * 50 + 50;
          }
        }
      } else {
        bufferLength = 128;
        dataArray = new Uint8Array(bufferLength);
        const breathe = Math.sin(Date.now() * 0.002) * 0.5 + 0.5;
        intensity = breathe * 0.3;
        for (let i = 0; i < bufferLength; i++) {
          dataArray[i] = Math.sin(i * 0.1 + Date.now() * 0.001) * 50 + 50;
        }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const baseRadius = 80;
      const points = 60;

      ctx.save();
      ctx.beginPath();

      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * Math.PI * 2;
        const dataIndex = Math.floor((i / points) * bufferLength);
        const amplitude = dataArray[dataIndex] || 0;
        const noise = Math.sin(angle * 3 + Date.now() * 0.001) * 10;
        const radius = baseRadius + (amplitude / 255) * 60 + noise;
        const x = centerX + Math.cos(angle) * radius;
        const y = centerY + Math.sin(angle) * radius;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          const prevAngle = ((i - 1) / points) * Math.PI * 2;
          const prevDataIndex = Math.floor(((i - 1) / points) * bufferLength);
          const prevAmplitude = dataArray[prevDataIndex] || 0;
          const prevNoise = Math.sin(prevAngle * 3 + Date.now() * 0.001) * 10;
          const prevRadius = baseRadius + (prevAmplitude / 255) * 60 + prevNoise;
          const prevX = centerX + Math.cos(prevAngle) * prevRadius;
          const prevY = centerY + Math.sin(prevAngle) * prevRadius;
          const cpX = (prevX + x) / 2;
          const cpY = (prevY + y) / 2;
          ctx.quadraticCurveTo(prevX, prevY, cpX, cpY);
        }
      }
      ctx.closePath();

      const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius + 60);
      gradient.addColorStop(0, `rgba(255, 0, 128, ${0.3 + intensity * 0.4})`);
      gradient.addColorStop(0.5, `rgba(121, 40, 202, ${0.2 + intensity * 0.3})`);
      gradient.addColorStop(1, `rgba(0, 212, 255, ${0.1 + intensity * 0.2})`);

      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 + intensity * 0.4})`;
      ctx.lineWidth = 2 + intensity * 3;
      ctx.shadowBlur = 20 + intensity * 30;
      ctx.shadowColor = `rgba(255, 0, 128, ${0.8 + intensity * 0.2})`;
      ctx.stroke();

      ctx.restore();

      animationId = requestAnimationFrame(drawWaveform);
    }

    drawWaveform();

    // Connect to realtime API for voice mode
    try {
      console.log('[OmniChat] Connecting to Realtime API for voice mode...');

      realtimeService = new RealtimeOmniService();

      realtimeService.onConnected = () => {
        console.log('[OmniChat] Realtime API connected');

        const connectingEl = document.getElementById('omni-voice-connecting');
        if (connectingEl) {
          connectingEl.style.display = 'none';
        }

        // Set up analyser for visualization
        analyser = {
          input: realtimeService.analyser,
          output: realtimeService.outputAnalyser,
        };
      };

      realtimeService.onDisconnected = () => {
        console.log('[OmniChat] Realtime API disconnected');
        if (voiceModeEnabled) {
          closeVoiceOverlay();
        }
      };

      realtimeService.onError = (error) => {
        console.error('[OmniChat] Realtime API error:', error);
        showError(error);
      };

      realtimeService.onTranscriptUpdate = (transcript, role, timestamp) => {
        handleTranscriptUpdate(transcript, role, timestamp);
      };

      realtimeService.onResponseEnd = () => {
        // Finalize assistant message
        if (currentAssistantMessage.trim()) {
          messages.push({ role: 'assistant', content: currentAssistantMessage.trim() });
          currentAssistantMessage = '';
          currentAssistantTimestamp = null;
        }
      };

      // Connect with selected agent
      await realtimeService.connect(selectedAgentId);

    } catch (error) {
      console.error('[OmniChat] Failed to connect:', error);
      showError('Failed to connect: ' + error.message);
      closeVoiceOverlay();
    }
  }

  /**
   * Render messages in timestamp order
   */
  function renderMessagesInOrder() {
    const sortedMessages = [...pendingMessages].sort((a, b) => a.timestamp - b.timestamp);

    pendingMessages.forEach(msg => {
      if (msg.element && msg.element.parentNode) {
        msg.element.remove();
      }
    });

    sortedMessages.forEach(msg => {
      if (!msg.element) {
        msg.element = document.createElement('div');
        msg.element.className = `omni-message omni-message-${msg.role}`;
        msg.element.innerHTML = `<div class="omni-bubble">${escapeHtml(msg.content)}</div>`;
      } else {
        msg.element.querySelector('.omni-bubble').textContent = msg.content;
      }
      messageHistory.appendChild(msg.element);
    });

    messageHistory.scrollTop = messageHistory.scrollHeight;
  }

  /**
   * Escape HTML for safe display
   */
  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Close voice overlay
   */
  function closeVoiceOverlay() {
    voiceModeEnabled = false;

    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }

    if (realtimeService) {
      realtimeService.disconnect();
      realtimeService = null;
    }

    const overlay = document.getElementById('omni-voice-overlay');
    if (overlay) {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 300);
    }
  }

  // Show initial placeholder
  messageHistory.innerHTML = `
    <div class="omni-placeholder">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <p>Select an agent to start chatting</p>
    </div>
  `;

  // Public API
  return {
    destroy: () => {
      if (realtimeService) {
        realtimeService.disconnect();
      }
      chatContainer.remove();
    },
    getSelectedAgent: () => selectedAgent,
  };
}

/**
 * Add CSS styles for Omni Chat interface
 */
export function addOmniChatStyles() {
  if (document.getElementById('omni-chat-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'omni-chat-styles';
  style.textContent = `
    .omni-chat-interface {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: white;
      overflow: hidden;
    }

    .omni-chat-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      background: var(--bg-secondary, #f9fafb);
      border-bottom: 1px solid var(--border-color, #e5e7eb);
    }

    .omni-agent-label {
      font-weight: 500;
      color: var(--text-primary, #374151);
    }

    .omni-agent-select {
      flex: 1;
      max-width: 400px;
    }

    .omni-chat-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .omni-messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .omni-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: var(--text-muted, #9ca3af);
      text-align: center;
    }

    .omni-placeholder svg {
      margin-bottom: 12px;
      opacity: 0.5;
    }

    .omni-message {
      display: flex;
      margin-bottom: 8px;
    }

    .omni-message-user {
      justify-content: flex-end;
    }

    .omni-message-assistant {
      justify-content: flex-start;
    }

    .omni-bubble {
      max-width: 70%;
      padding: 12px 16px;
      border-radius: 18px;
      word-wrap: break-word;
      white-space: pre-wrap;
    }

    .omni-message-user .omni-bubble {
      background: #3b82f6;
      color: white;
      border-bottom-right-radius: 4px;
    }

    .omni-message-assistant .omni-bubble {
      background: #f3f4f6;
      color: #1f2937;
      border-bottom-left-radius: 4px;
    }

    .omni-error {
      background: #fee;
      color: #c00;
      padding: 12px;
      border-radius: 8px;
      border-left: 4px solid #c00;
    }

    .omni-error.fade-out {
      opacity: 0;
      transition: opacity 0.3s;
    }

    .omni-input-container {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 16px;
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
    }

    .omni-input {
      flex: 1;
      padding: 12px 16px;
      border: 1px solid #d1d5db;
      border-radius: 24px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }

    .omni-input:focus {
      border-color: #3b82f6;
    }

    .omni-input:disabled {
      background: #f3f4f6;
      cursor: not-allowed;
    }

    .omni-voice-toggle {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: none;
      background: #f3f4f6;
      color: #6b7280;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      -webkit-appearance: none;
      appearance: none;
      padding: 0;
    }

    .omni-voice-toggle:hover:not(:disabled) {
      background: #e5e7eb;
      color: #374151;
      transform: scale(1.05);
    }

    .omni-voice-toggle:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    @keyframes omni-wave-pulse {
      0%, 100% { transform: scaleY(1); }
      50% { transform: scaleY(1.5); }
    }

    .omni-voice-toggle:hover:not(:disabled) .wave-bar {
      animation: omni-wave-pulse 1s ease-in-out infinite;
    }

    .omni-voice-toggle:hover:not(:disabled) .bar-1 { animation-delay: 0s; }
    .omni-voice-toggle:hover:not(:disabled) .bar-2 { animation-delay: 0.1s; }
    .omni-voice-toggle:hover:not(:disabled) .bar-3 { animation-delay: 0.2s; }
    .omni-voice-toggle:hover:not(:disabled) .bar-4 { animation-delay: 0.3s; }
    .omni-voice-toggle:hover:not(:disabled) .bar-5 { animation-delay: 0.4s; }

    /* Voice Overlay */
    .omni-voice-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      z-index: 10000;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    }

    .omni-voice-overlay.active {
      opacity: 1;
    }

    .omni-voice-overlay-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      position: relative;
      width: 100%;
      max-width: 600px;
      padding: 20px;
      height: 100%;
    }

    .omni-voice-overlay-close {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.35);
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      z-index: 10001;
      border: 2px solid rgba(255, 255, 255, 0.5);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }

    .omni-voice-overlay-close:hover {
      background: rgba(255, 255, 255, 0.5);
      transform: scale(1.08);
    }

    .omni-voice-overlay-close svg {
      pointer-events: none;
      width: 28px;
      height: 28px;
      stroke-width: 2.5;
    }

    .omni-voice-agent-name {
      color: white;
      font-size: 18px;
      font-weight: 600;
      margin-top: 60px;
      text-align: center;
    }

    .omni-voice-waveform-container {
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 150px;
      position: relative;
      flex-shrink: 0;
    }

    #omni-voice-waveform-canvas {
      max-width: 200px;
      height: 150px;
    }

    .omni-voice-transcript-area {
      flex: 1;
      width: 100%;
      overflow-y: auto;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 16px;
      max-height: calc(100% - 280px);
      margin-bottom: env(safe-area-inset-bottom, 16px);
    }

    .omni-voice-transcript-content {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .omni-voice-transcript-msg {
      padding: 8px 12px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.4;
      max-width: 85%;
      word-wrap: break-word;
    }

    .omni-voice-transcript-msg.user {
      background: rgba(255, 255, 255, 0.9);
      color: #333;
      align-self: flex-end;
      border-bottom-right-radius: 4px;
    }

    .omni-voice-transcript-msg.assistant {
      background: rgba(255, 255, 255, 0.2);
      color: white;
      align-self: flex-start;
      border-bottom-left-radius: 4px;
    }

    .omni-voice-connecting {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }

    .omni-connecting-spinner {
      width: 48px;
      height: 48px;
      border: 3px solid rgba(255, 255, 255, 0.2);
      border-top-color: rgba(255, 0, 128, 0.8);
      border-radius: 50%;
      animation: omni-spin 1s linear infinite;
    }

    @keyframes omni-spin {
      to { transform: rotate(360deg); }
    }

    .omni-connecting-text {
      color: rgba(255, 255, 255, 0.9);
      font-size: 16px;
      font-weight: 500;
    }

    /* Pending Action Confirmation */
    .omni-pending-action {
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      border-radius: 12px;
      padding: 16px;
      margin: 8px 0;
    }

    .omni-action-preview {
      font-size: 14px;
      color: #0c4a6e;
      white-space: pre-wrap;
      margin-bottom: 12px;
      line-height: 1.5;
    }

    .omni-action-buttons {
      display: flex;
      gap: 8px;
    }

    .omni-action-btn {
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }

    .omni-action-confirm {
      background: #10b981;
      color: white;
    }

    .omni-action-confirm:hover {
      background: #059669;
    }

    .omni-action-cancel {
      background: #f3f4f6;
      color: #6b7280;
    }

    .omni-action-cancel:hover {
      background: #e5e7eb;
    }

    /* Business Info Card */
    .omni-business-info {
      background: #fefce8;
      border: 1px solid #fde047;
      border-radius: 12px;
      padding: 16px;
      margin: 8px 0;
    }

    .omni-business-name {
      font-weight: 600;
      font-size: 16px;
      color: #854d0e;
      margin-bottom: 8px;
    }

    .omni-business-address,
    .omni-business-phone {
      font-size: 14px;
      color: #713f12;
      margin-bottom: 4px;
    }

    .omni-business-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }

    .omni-action-call {
      background: #3b82f6;
      color: white;
    }

    .omni-action-call:hover {
      background: #2563eb;
    }

    .omni-action-add {
      background: #8b5cf6;
      color: white;
    }

    .omni-action-add:hover {
      background: #7c3aed;
    }

    /* Mobile responsive */
    @media (max-width: 768px) {
      .omni-chat-header {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
      }

      .omni-agent-select {
        max-width: 100%;
      }

      .omni-bubble {
        max-width: 85%;
      }

      .omni-input-container {
        padding: 12px;
      }

      .omni-voice-toggle {
        width: 44px !important;
        height: 44px !important;
        min-width: 44px !important;
        flex-shrink: 0 !important;
      }
    }
  `;

  document.head.appendChild(style);
}
