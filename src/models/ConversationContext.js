/**
 * ConversationContext Model
 * Handles conversation context and memory operations with vector embeddings
 */

import { supabase } from '../lib/supabase.js';

export class ConversationContext {
  /**
   * Create conversation context for a contact
   * @param {Object} contextData - Context data {contact_id, summary, key_topics, etc.}
   * @returns {Promise<{context: Object|null, error: Error|null}>}
   */
  static async create(contextData) {
    const { data, error } = await supabase
      .from('conversation_contexts')
      .insert(contextData)
      .select()
      .single();

    if (error) {
      return { context: null, error };
    }

    return { context: data, error: null };
  }

  /**
   * Get conversation context for a contact
   * @param {string} contactId - Contact's UUID
   * @returns {Promise<{context: Object|null, error: Error|null}>}
   */
  static async getByContactId(contactId) {
    const { data, error } = await supabase
      .from('conversation_contexts')
      .select('*, contacts(name, phone_number)')
      .eq('contact_id', contactId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return { context: null, error };
    }

    return { context: data, error: null };
  }

  /**
   * Update conversation context
   * @param {string} contactId - Contact's UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<{context: Object|null, error: Error|null}>}
   */
  static async update(contactId, updates) {
    const { data, error } = await supabase
      .from('conversation_contexts')
      .update(updates)
      .eq('contact_id', contactId)
      .select()
      .single();

    if (error) {
      return { context: null, error };
    }

    return { context: data, error: null };
  }

  /**
   * Update conversation summary
   * @param {string} contactId - Contact's UUID
   * @param {string} summary - New summary
   * @returns {Promise<{context: Object|null, error: Error|null}>}
   */
  static async updateSummary(contactId, summary) {
    return await this.update(contactId, { summary });
  }

  /**
   * Add key topics to conversation
   * @param {string} contactId - Contact's UUID
   * @param {Array} topics - Array of topic strings
   * @returns {Promise<{context: Object|null, error: Error|null}>}
   */
  static async addKeyTopics(contactId, topics) {
    // Get existing context to merge topics
    const { context } = await this.getByContactId(contactId);

    if (!context) {
      return { context: null, error: new Error('Context not found') };
    }

    const existingTopics = context.key_topics || [];
    const mergedTopics = [...new Set([...existingTopics, ...topics])]; // Remove duplicates

    return await this.update(contactId, { key_topics: mergedTopics });
  }

  /**
   * Update preferences (JSONB field)
   * @param {string} contactId - Contact's UUID
   * @param {Object} preferences - Preferences object
   * @returns {Promise<{context: Object|null, error: Error|null}>}
   */
  static async updatePreferences(contactId, preferences) {
    return await this.update(contactId, { preferences });
  }

  /**
   * Update relationship notes
   * @param {string} contactId - Contact's UUID
   * @param {string} notes - Relationship notes
   * @returns {Promise<{context: Object|null, error: Error|null}>}
   */
  static async updateRelationshipNotes(contactId, notes) {
    return await this.update(contactId, { relationship_notes: notes });
  }

  /**
   * Update embedding vector
   * @param {string} contactId - Contact's UUID
   * @param {Array} embedding - Embedding vector (1536 dimensions for ada-002)
   * @returns {Promise<{context: Object|null, error: Error|null}>}
   */
  static async updateEmbedding(contactId, embedding) {
    return await this.update(contactId, { embedding });
  }

  /**
   * Increment interaction count
   * @param {string} contactId - Contact's UUID
   * @returns {Promise<{context: Object|null, error: Error|null}>}
   */
  static async incrementInteractionCount(contactId) {
    // Get current count
    const { context } = await this.getByContactId(contactId);

    if (!context) {
      return { context: null, error: new Error('Context not found') };
    }

    const newCount = (context.interaction_count || 0) + 1;

    return await this.update(contactId, { interaction_count: newCount });
  }

  /**
   * Find similar conversations using vector similarity search
   * @param {Array} queryEmbedding - Query embedding vector (1536 dimensions)
   * @param {number} limit - Number of similar conversations to return
   * @param {number} threshold - Similarity threshold (0.0 to 1.0, higher is more similar)
   * @returns {Promise<{contexts: Array, error: Error|null}>}
   */
  static async findSimilar(queryEmbedding, limit = 5, threshold = 0.7) {
    // Use pgvector's cosine similarity
    // Note: This is a PostgreSQL function call via RPC
    const { data, error } = await supabase.rpc('match_conversation_contexts', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
    });

    if (error) {
      return { contexts: [], error };
    }

    return { contexts: data, error: null };
  }

  /**
   * Get or create conversation context (ensures context exists)
   * @param {string} contactId - Contact's UUID
   * @param {Object} initialData - Initial data if creating new context
   * @returns {Promise<{context: Object|null, error: Error|null}>}
   */
  static async getOrCreate(contactId, initialData = {}) {
    // Try to get existing context
    const { context, error } = await this.getByContactId(contactId);

    if (context) {
      return { context, error: null };
    }

    // If not found, create with initial data
    if (error && error.code === 'PGRST116') {
      return await this.create({
        contact_id: contactId,
        summary: initialData.summary || 'New contact - no conversation history yet.',
        key_topics: initialData.key_topics || [],
        preferences: initialData.preferences || {},
        interaction_count: 0,
      });
    }

    return { context: null, error };
  }

  /**
   * Delete conversation context
   * @param {string} contactId - Contact's UUID
   * @returns {Promise<{error: Error|null}>}
   */
  static async delete(contactId) {
    const { error } = await supabase
      .from('conversation_contexts')
      .delete()
      .eq('contact_id', contactId);

    return { error };
  }

  /**
   * Get all conversation contexts with high interaction counts
   * @param {number} minInteractions - Minimum interaction count
   * @returns {Promise<{contexts: Array, error: Error|null}>}
   */
  static async getFrequentContacts(minInteractions = 5) {
    const { data, error } = await supabase
      .from('conversation_contexts')
      .select('*, contacts(name, phone_number)')
      .gte('interaction_count', minInteractions)
      .order('interaction_count', { ascending: false });

    if (error) {
      return { contexts: [], error };
    }

    return { contexts: data, error: null };
  }

  /**
   * Search conversation contexts by key topics
   * @param {string} topic - Topic to search for
   * @returns {Promise<{contexts: Array, error: Error|null}>}
   */
  static async searchByTopic(topic) {
    const { data, error } = await supabase
      .from('conversation_contexts')
      .select('*, contacts(name, phone_number)')
      .contains('key_topics', [topic])
      .order('interaction_count', { ascending: false });

    if (error) {
      return { contexts: [], error };
    }

    return { contexts: data, error: null };
  }

  /**
   * Generate summary from recent interactions
   * @param {string} contactId - Contact's UUID
   * @param {Array} recentMessages - Recent call/SMS messages
   * @returns {Object} {summary: string, keyTopics: Array}
   */
  static generateSummaryFromInteractions(contactId, recentMessages) {
    // This is a client-side helper to prepare data for OpenAI API
    // In production, this would call OpenAI to generate the summary
    const messageTexts = recentMessages.map((msg) => msg.body || msg.transcript).filter(Boolean);

    const combinedText = messageTexts.join(' ');

    // Extract simple word frequency for key topics (naive approach)
    // In production, use OpenAI or NLP library
    const words = combinedText.toLowerCase().split(/\s+/);
    const wordFreq = {};

    words.forEach((word) => {
      if (word.length > 4) {
        // Only words longer than 4 chars
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });

    const keyTopics = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    return {
      summary: combinedText.slice(0, 200) + '...', // Simplified summary
      keyTopics,
    };
  }
}