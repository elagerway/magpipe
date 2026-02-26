/**
 * AgentConfig Model
 * Handles all AI agent configuration database operations
 */

import { supabase } from '../lib/supabase.js';

export class AgentConfig {
  /**
   * Create agent configuration for a user
   * @param {Object} configData - Config data {user_id, system_prompt, voice_id, etc.}
   * @returns {Promise<{config: Object|null, error: Error|null}>}
   */
  static async create(configData) {
    const { data, error } = await supabase
      .from('agent_configs')
      .insert(configData)
      .select()
      .single();

    if (error) {
      return { config: null, error };
    }

    return { config: data, error: null };
  }

  /**
   * Get default agent configuration for a user (legacy single-agent support)
   * @param {string} userId - User's UUID
   * @returns {Promise<{config: Object|null, error: Error|null}>}
   */
  static async getByUserId(userId) {
    // First try to get the default agent
    const { data: defaultAgent, error: defaultError } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('user_id', userId)
      .eq('is_default', true)
      .single();

    if (defaultAgent) {
      return { config: defaultAgent, error: null };
    }

    // If no default, get the first agent (for backwards compatibility)
    const { data, error } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      return { config: null, error };
    }

    return { config: data, error: null };
  }

  /**
   * Get all agent configurations for a user
   * @param {string} userId - User's UUID
   * @returns {Promise<{configs: Object[]|null, error: Error|null}>}
   */
  static async getAllByUserId(userId) {
    const { data, error } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      return { configs: null, error };
    }

    return { configs: data || [], error: null };
  }

  /**
   * Get agent configuration by ID
   * @param {string} agentId - Agent config's UUID (the id column)
   * @returns {Promise<{config: Object|null, error: Error|null}>}
   */
  static async getById(agentId) {
    const { data, error } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('id', agentId)
      .single();

    if (error) {
      return { config: null, error };
    }

    return { config: data, error: null };
  }


  /**
   * Update agent configuration by user ID (legacy, updates default agent)
   * @param {string} userId - User's UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<{config: Object|null, error: Error|null}>}
   */
  static async update(userId, updates) {
    // First get the default agent for this user
    const { config: defaultAgent } = await this.getByUserId(userId);
    if (!defaultAgent) {
      return { config: null, error: new Error('No agent found for user') };
    }

    return await this.updateById(defaultAgent.id, updates);
  }

  /**
   * Update agent configuration by ID
   * @param {string} agentId - Agent config's UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<{config: Object|null, error: Error|null}>}
   */
  static async updateById(agentId, updates) {
    const { data, error } = await supabase
      .from('agent_configs')
      .update(updates)
      .eq('id', agentId)
      .select()
      .single();

    if (error) {
      return { config: null, error };
    }

    return { config: data, error: null };
  }

  /**
   * Create a new agent for a user
   * @param {string} userId - User's UUID
   * @param {Object} agentData - Agent data (name, voice_id, system_prompt, etc.)
   * @returns {Promise<{config: Object|null, error: Error|null}>}
   */
  static async createAgent(userId, agentData) {
    const firstName = await this.getUserFirstName(userId);

    // Check if user has any existing agents
    const { configs: existingAgents } = await this.getAllByUserId(userId);
    const isFirstAgent = !existingAgents || existingAgents.length === 0;

    const agentName = agentData.name || 'My Agent';
    const agentType = agentData.agent_type || 'inbound_voice';

    // Generate type-specific default prompt
    const defaultPrompt = this.getDefaultPromptForType(agentType, firstName, agentName);

    const newAgentData = {
      user_id: userId,
      name: agentName,
      agent_type: agentType,
      is_default: isFirstAgent, // First agent is always default
      voice_id: agentData.voice_id || '21m00Tcm4TlvDq8ikWAM',
      system_prompt: agentData.system_prompt || defaultPrompt,
      ...agentData,
    };

    return await this.create(newAgentData);
  }

  /**
   * Delete an agent by ID
   * @param {string} agentId - Agent config's UUID
   * @returns {Promise<{error: Error|null}>}
   */
  static async deleteAgent(agentId) {
    // Get the agent first to check if it's default
    const { config: agent } = await this.getById(agentId);
    if (!agent) {
      return { error: new Error('Agent not found') };
    }

    const { error } = await supabase
      .from('agent_configs')
      .delete()
      .eq('id', agentId);

    if (error) {
      return { error };
    }

    // If we deleted the default agent, set another one as default
    if (agent.is_default) {
      const { configs: remainingAgents } = await this.getAllByUserId(agent.user_id);
      if (remainingAgents && remainingAgents.length > 0) {
        await this.setDefault(remainingAgents[0].id);
      }
    }

    return { error: null };
  }

  /**
   * Set an agent as the default for a user
   * @param {string} agentId - Agent config's UUID to set as default
   * @returns {Promise<{config: Object|null, error: Error|null}>}
   */
  static async setDefault(agentId) {
    // Get the agent to find the user_id
    const { config: agent } = await this.getById(agentId);
    if (!agent) {
      return { config: null, error: new Error('Agent not found') };
    }

    // Unset default on all other agents for this user
    await supabase
      .from('agent_configs')
      .update({ is_default: false })
      .eq('user_id', agent.user_id)
      .neq('id', agentId);

    // Set this agent as default
    return await this.updateById(agentId, { is_default: true });
  }

  /**
   * Update system prompt
   * @param {string} userId - User's UUID
   * @param {string} systemPrompt - New system prompt
   * @returns {Promise<{config: Object|null, error: Error|null}>}
   */
  static async updateSystemPrompt(userId, systemPrompt) {
    return await this.update(userId, { system_prompt: systemPrompt });
  }

  /**
   * Update voice settings
   * @param {string} userId - User's UUID
   * @param {string} voiceId - Voice ID (kate, alloy, nova, etc.)
   * @returns {Promise<{config: Object|null, error: Error|null}>}
   */
  static async updateVoice(userId, voiceId) {
    return await this.update(userId, { voice_id: voiceId });
  }

  /**
   * Update vetting strategy
   * @param {string} userId - User's UUID
   * @param {string} strategy - Vetting strategy (name-and-purpose, strict, lenient)
   * @returns {Promise<{config: Object|null, error: Error|null}>}
   */
  static async updateVettingStrategy(userId, strategy) {
    return await this.update(userId, { vetting_strategy: strategy });
  }

  /**
   * Update response style
   * @param {string} userId - User's UUID
   * @param {string} style - Response style (professional, friendly, casual, formal)
   * @returns {Promise<{config: Object|null, error: Error|null}>}
   */
  static async updateResponseStyle(userId, style) {
    return await this.update(userId, { response_style: style });
  }

  /**
   * Toggle transfer unknown callers setting
   * @param {string} userId - User's UUID
   * @param {boolean} shouldTransfer - Whether to transfer unknown callers
   * @returns {Promise<{config: Object|null, error: Error|null}>}
   */
  static async setTransferUnknownCallers(userId, shouldTransfer) {
    return await this.update(userId, { transfer_unknown_callers: shouldTransfer });
  }

  /**
   * Update AI model parameters
   * @param {string} userId - User's UUID
   * @param {Object} params - Model parameters {temperature, max_tokens}
   * @returns {Promise<{config: Object|null, error: Error|null}>}
   */
  static async updateModelParams(userId, params) {
    return await this.update(userId, params);
  }

  /**
   * Update custom instructions (JSONB field)
   * @param {string} userId - User's UUID
   * @param {Object} customInstructions - Custom instructions object
   * @returns {Promise<{config: Object|null, error: Error|null}>}
   */
  static async updateCustomInstructions(userId, customInstructions) {
    return await this.update(userId, { custom_instructions: customInstructions });
  }

  /**
   * Delete agent configuration
   * @param {string} userId - User's UUID
   * @returns {Promise<{error: Error|null}>}
   */
  static async delete(userId) {
    const { error } = await supabase.from('agent_configs').delete().eq('user_id', userId);

    return { error };
  }

  /**
   * Get user's first name from profile
   * @param {string} userId - User's UUID
   * @returns {Promise<string>} First name
   */
  static async getUserFirstName(userId) {
    const { data } = await supabase
      .from('users')
      .select('name')
      .eq('id', userId)
      .single();

    // Extract first name from full name (name is required on signup)
    return data?.name?.split(' ')[0] || data?.name;
  }

  /**
   * Get default prompt for a given agent type
   * @param {string} agentType - Agent type
   * @param {string} firstName - User's first name
   * @param {string} agentName - Agent's display name
   * @returns {string} Default prompt for the type
   */
  static getDefaultPromptForType(agentType, firstName, agentName = null) {
    switch (agentType) {
      case 'outbound_voice':
        return this.getDefaultOutboundVoicePrompt(firstName, agentName);
      case 'text':
        return this.getDefaultTextPrompt(firstName);
      case 'email':
        return this.getDefaultEmailPrompt(firstName);
      case 'chat_widget':
        return this.getDefaultChatWidgetPrompt(firstName);
      case 'inbound_voice':
      default:
        return this.getDefaultInboundVoicePrompt(firstName);
    }
  }

  /**
   * Generate default inbound voice system prompt
   * @param {string} firstName - User's first name
   * @returns {string} Default inbound voice prompt
   */
  static getDefaultInboundVoicePrompt(firstName) {
    return `You are Maggie, ${firstName}'s personal AI assistant. Your job is to professionally handle incoming calls.

When someone calls:
1. Greet them warmly and introduce yourself as ${firstName}'s assistant
2. Ask for their name and the purpose of their call
3. Determine if this is someone ${firstName} would want to speak with

Only transfer calls or take messages for legitimate contacts. Politely decline spam, sales calls, or suspicious inquiries. Be helpful but protective of ${firstName}'s time.

If the caller is a known contact or has a legitimate reason, offer to:
- Transfer them directly to ${firstName}
- Take a detailed message
- Schedule a callback

Always be professional, friendly, and efficient.`;
  }

  /**
   * Generate default outbound voice system prompt
   * @param {string} firstName - User's first name
   * @param {string} agentName - Agent's display name
   * @returns {string} Default outbound voice prompt
   */
  static getDefaultOutboundVoicePrompt(firstName, agentName = null) {
    const name = agentName || 'your assistant';
    return `You are ${name}, making a call on behalf of ${firstName}.

When calling someone:
1. Introduce yourself: "Hi, this is ${name} calling on behalf of ${firstName}"
2. Clearly state the purpose of the call
3. Be professional and respectful of the recipient's time

If you reach voicemail, leave a clear message with:
- Who you are (${name}, calling for ${firstName})
- The reason for the call
- How they can reach ${firstName} back

Stay focused on the call objective and represent ${firstName} professionally.`;
  }

  /**
   * Generate default text/SMS agent prompt
   * @param {string} firstName - User's first name
   * @returns {string} Default text prompt
   */
  static getDefaultTextPrompt(firstName) {
    return `You are ${firstName}'s AI text messaging assistant. You handle SMS conversations on ${firstName}'s behalf.

Guidelines:
- Keep responses concise and mobile-friendly (1-3 sentences when possible)
- Use a warm, conversational tone appropriate for text messaging
- Ask for the contact's name if unknown
- Offer to take a message or connect them with ${firstName}
- Respond promptly to questions about availability, services, or general inquiries
- Never send sensitive information via text

If you can't help with something, let them know you'll pass the message to ${firstName}.`;
  }

  /**
   * Generate default email agent prompt
   * @param {string} firstName - User's first name
   * @returns {string} Default email prompt
   */
  static getDefaultEmailPrompt(firstName) {
    return `You are ${firstName}'s AI email assistant. You draft and respond to emails on ${firstName}'s behalf.

Guidelines:
- Use proper email formatting with greeting, body, and sign-off
- Match the formality level of the incoming email
- Be thorough but concise in responses
- Include relevant details and next steps when appropriate
- Sign emails as "${firstName}'s Assistant" unless instructed otherwise
- Flag urgent matters for ${firstName}'s personal attention

For new inquiries, gather key information: name, purpose, and any relevant details before promising a follow-up.`;
  }

  /**
   * Generate default chat widget agent prompt
   * @param {string} firstName - User's first name
   * @returns {string} Default chat widget prompt
   */
  static getDefaultChatWidgetPrompt(firstName) {
    return `You are a helpful chat assistant for ${firstName}'s website. You help visitors with questions and guide them to the right resources.

Guidelines:
- Respond quickly and concisely — visitors expect fast answers
- Be friendly and helpful, but professional
- Share relevant links when available
- Collect visitor name and email for follow-up when appropriate
- Offer to connect visitors with ${firstName} for complex inquiries
- If you don't know the answer, say so and offer to take a message

Focus on converting visitors into contacts by being genuinely helpful.`;
  }

  // Legacy aliases for backward compatibility
  static getDefaultInboundPrompt(firstName) {
    return this.getDefaultInboundVoicePrompt(firstName);
  }

  static getDefaultOutboundPrompt(orgName, agentName = null) {
    return this.getDefaultOutboundVoicePrompt(orgName, agentName);
  }

  /**
   * Reset to default configuration
   * @param {string} userId - User's UUID
   * @returns {Promise<{config: Object|null, error: Error|null}>}
   */
  static async resetToDefaults(userId) {
    const firstName = await this.getUserFirstName(userId);

    const defaultConfig = {
      system_prompt: this.getDefaultInboundPrompt(firstName),
      outbound_system_prompt: this.getDefaultOutboundPrompt(firstName),
      voice_id: 'kate',
      transfer_unknown_callers: false,
      vetting_strategy: 'name-and-purpose',
      response_style: 'professional',
      temperature: 0.7,
      max_tokens: 150,
      custom_instructions: {},
    };

    return await this.update(userId, defaultConfig);
  }

  /**
   * Get or create agent configuration (ensures config exists)
   * @param {string} userId - User's UUID
   * @returns {Promise<{config: Object|null, error: Error|null}>}
   */
  static async getOrCreate(userId) {
    // Try to get existing config
    const { config, error } = await this.getByUserId(userId);

    if (config) {
      return { config, error: null };
    }

    // If not found, create with personalized defaults
    if (error && error.code === 'PGRST116') {
      const firstName = await this.getUserFirstName(userId);

      return await this.create({
        user_id: userId,
        system_prompt: this.getDefaultInboundPrompt(firstName),
        outbound_system_prompt: this.getDefaultOutboundPrompt(firstName),
        voice_id: 'kate',
      });
    }

    return { config: null, error };
  }

  /**
   * Validate configuration before saving
   * @param {Object} config - Configuration object to validate
   * @returns {Object} {valid: boolean, errors: Array}
   */
  static validate(config) {
    const errors = [];

    // Validate system_prompt
    if (!config.system_prompt || config.system_prompt.trim().length === 0) {
      errors.push('System prompt cannot be empty');
    }

    // Validate voice_id - accept both old format (kate) and new format (11labs-Kate, openai-alloy)
    const validVoicePatterns = [
      /^11labs-/,  // ElevenLabs voices
      /^openai-/,  // OpenAI voices
      /^(kate|alloy|nova|shimmer|echo|fable)$/  // Legacy format
    ];
    if (config.voice_id && !validVoicePatterns.some(pattern => pattern.test(config.voice_id))) {
      errors.push('Invalid voice_id format');
    }

    // Validate vetting_strategy
    const validStrategies = ['name-and-purpose', 'strict', 'lenient'];
    if (config.vetting_strategy && !validStrategies.includes(config.vetting_strategy)) {
      errors.push(`Invalid vetting_strategy. Must be one of: ${validStrategies.join(', ')}`);
    }

    // Validate response_style
    const validStyles = ['professional', 'friendly', 'casual', 'formal'];
    if (config.response_style && !validStyles.includes(config.response_style)) {
      errors.push(`Invalid response_style. Must be one of: ${validStyles.join(', ')}`);
    }

    // Validate temperature
    if (config.temperature !== undefined) {
      if (config.temperature < 0.0 || config.temperature > 1.0) {
        errors.push('Temperature must be between 0.0 and 1.0');
      }
    }

    // Validate max_tokens
    if (config.max_tokens !== undefined) {
      if (config.max_tokens <= 0) {
        errors.push('max_tokens must be greater than 0');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}