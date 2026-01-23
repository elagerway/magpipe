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
   * Get agent configuration for a user
   * @param {string} userId - User's UUID
   * @returns {Promise<{config: Object|null, error: Error|null}>}
   */
  static async getByUserId(userId) {
    const { data, error } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return { config: null, error };
    }

    return { config: data, error: null };
  }

  /**
   * Update agent configuration
   * @param {string} userId - User's UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<{config: Object|null, error: Error|null}>}
   */
  static async update(userId, updates) {
    const { data, error } = await supabase
      .from('agent_configs')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      return { config: null, error };
    }

    return { config: data, error: null };
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
   * @returns {Promise<string>} First name or 'your boss'
   */
  static async getUserFirstName(userId) {
    try {
      const { data } = await supabase
        .from('users')
        .select('name')
        .eq('id', userId)
        .single();

      if (data?.name) {
        // Extract first name from full name
        return data.name.split(' ')[0];
      }
    } catch (e) {
      // Ignore errors, use fallback
    }
    return 'your boss';
  }

  /**
   * Generate default inbound system prompt
   * @param {string} firstName - User's first name
   * @returns {string} Default inbound prompt
   */
  static getDefaultInboundPrompt(firstName) {
    return `You are Pat, ${firstName}'s personal AI assistant. Your job is to professionally handle incoming calls and messages.

When someone reaches out:
1. Greet them warmly and introduce yourself as ${firstName}'s assistant
2. Ask for their name and the purpose of their call/message
3. Determine if this is someone ${firstName} would want to speak with

Only transfer calls or take messages for legitimate contacts. Politely decline spam, sales calls, or suspicious inquiries. Be helpful but protective of ${firstName}'s time.

If the caller is a known contact or has a legitimate reason, offer to:
- Transfer them directly to ${firstName}
- Take a detailed message
- Schedule a callback

Always be professional, friendly, and efficient.`;
  }

  /**
   * Generate default outbound system prompt
   * @param {string} firstName - User's first name
   * @returns {string} Default outbound prompt
   */
  static getDefaultOutboundPrompt(firstName) {
    return `You are Pat, ${firstName}'s personal AI assistant, making a call on their behalf.

When calling someone:
1. Introduce yourself: "Hi, this is Pat calling on behalf of ${firstName}"
2. Clearly state the purpose of the call
3. Be professional and respectful of the recipient's time

If you reach voicemail, leave a clear message with:
- Who you are (Pat, ${firstName}'s assistant)
- The reason for the call
- How they can reach ${firstName} back

Stay focused on the call objective and represent ${firstName} professionally.`;
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