/**
 * Memory Service
 * Handles agent memory (conversation contexts) management
 */

import { supabase } from '../lib/supabase.js';

/**
 * Get all memory entries for an agent
 * @param {string} agentId - The agent ID
 * @returns {Promise<Array<{id: string, contact: object, summary: string, key_topics: string[], interaction_count: number, last_updated: string}>>}
 */
export async function getAgentMemories(agentId) {
  if (!agentId) {
    throw new Error('Agent ID is required');
  }

  try {
    const { data, error } = await supabase
      .from('conversation_contexts')
      .select(`
        id,
        summary,
        key_topics,
        preferences,
        relationship_notes,
        interaction_count,
        sms_interaction_count,
        semantic_match_count,
        last_updated,
        last_call_ids,
        direction,
        service_number,
        contact_phone,
        contacts (
          id,
          name,
          phone_number,
          avatar_url
        )
      `)
      .eq('agent_id', agentId)
      .order('last_updated', { ascending: false });

    if (error) { throw error; }

    // Check which memories have embeddings (lightweight query)
    const { data: embeddingRows } = await supabase
      .from('conversation_contexts')
      .select('id')
      .eq('agent_id', agentId)
      .not('embedding', 'is', null);

    const embeddingIds = new Set((embeddingRows || []).map(r => r.id));

    return (data || []).map(entry => ({
      id: entry.id,
      contact: entry.contacts,
      summary: entry.summary,
      keyTopics: entry.key_topics || [],
      preferences: entry.preferences || {},
      relationshipNotes: entry.relationship_notes,
      interactionCount: entry.interaction_count || 0,
      smsInteractionCount: entry.sms_interaction_count || 0,
      semanticMatchCount: entry.semantic_match_count || 0,
      lastUpdated: entry.last_updated,
      lastCallIds: entry.last_call_ids || [],
      direction: entry.direction,
      serviceNumber: entry.service_number,
      contactPhone: entry.contact_phone,
      hasEmbedding: embeddingIds.has(entry.id),
    }));

  } catch (error) {
    console.error('Get agent memories error:', error);
    throw new Error('Failed to load agent memories');
  }
}

/**
 * Get a single memory entry by ID
 * @param {string} memoryId - The conversation context ID
 * @returns {Promise<object>}
 */
export async function getMemory(memoryId) {
  if (!memoryId) {
    throw new Error('Memory ID is required');
  }

  try {
    const { data, error } = await supabase
      .from('conversation_contexts')
      .select(`
        id,
        summary,
        key_topics,
        preferences,
        relationship_notes,
        interaction_count,
        sms_interaction_count,
        last_updated,
        last_call_ids,
        created_at,
        contacts (
          id,
          name,
          phone_number,
          avatar_url
        )
      `)
      .eq('id', memoryId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Memory not found');
      }
      throw error;
    }

    // Get call history for this memory
    let callHistory = [];
    if (data.last_call_ids && data.last_call_ids.length > 0) {
      const { data: calls, error: callsError } = await supabase
        .from('call_records')
        .select('id, started_at, duration_seconds, call_summary, direction')
        .in('id', data.last_call_ids)
        .order('started_at', { ascending: false });

      if (!callsError && calls) {
        callHistory = calls;
      }
    }

    return {
      id: data.id,
      contact: data.contacts,
      summary: data.summary,
      keyTopics: data.key_topics || [],
      preferences: data.preferences || {},
      relationshipNotes: data.relationship_notes,
      interactionCount: data.interaction_count || 0,
      smsInteractionCount: data.sms_interaction_count || 0,
      lastUpdated: data.last_updated,
      createdAt: data.created_at,
      callHistory,
    };

  } catch (error) {
    console.error('Get memory error:', error);
    throw error;
  }
}

/**
 * Update a memory entry
 * @param {string} memoryId - The conversation context ID
 * @param {object} updates - Fields to update (summary, key_topics, preferences, relationship_notes)
 * @returns {Promise<object>}
 */
export async function updateMemory(memoryId, updates) {
  if (!memoryId) {
    throw new Error('Memory ID is required');
  }

  try {
    const updateData = {
      last_updated: new Date().toISOString(),
    };

    if (updates.summary !== undefined) {
      updateData.summary = updates.summary;
    }
    if (updates.keyTopics !== undefined) {
      updateData.key_topics = updates.keyTopics;
    }
    if (updates.preferences !== undefined) {
      updateData.preferences = updates.preferences;
    }
    if (updates.relationshipNotes !== undefined) {
      updateData.relationship_notes = updates.relationshipNotes;
    }

    const { data, error } = await supabase
      .from('conversation_contexts')
      .update(updateData)
      .eq('id', memoryId)
      .select()
      .single();

    if (error) { throw error; }

    return data;

  } catch (error) {
    console.error('Update memory error:', error);
    throw new Error('Failed to update memory');
  }
}

/**
 * Clear/delete a memory entry
 * @param {string} memoryId - The conversation context ID
 * @returns {Promise<{success: boolean}>}
 */
export async function clearMemory(memoryId) {
  if (!memoryId) {
    throw new Error('Memory ID is required');
  }

  try {
    const { error } = await supabase
      .from('conversation_contexts')
      .delete()
      .eq('id', memoryId);

    if (error) { throw error; }

    return { success: true };

  } catch (error) {
    console.error('Clear memory error:', error);
    throw new Error('Failed to clear memory');
  }
}

/**
 * Get memory count for an agent
 * @param {string} agentId - The agent ID
 * @returns {Promise<number>}
 */
export async function getMemoryCount(agentId) {
  if (!agentId) {
    return 0;
  }

  try {
    const { count, error } = await supabase
      .from('conversation_contexts')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', agentId);

    if (error) { throw error; }

    return count || 0;

  } catch (error) {
    console.error('Get memory count error:', error);
    return 0;
  }
}

/**
 * Search for similar memories using semantic search
 * @param {object} params - Search parameters
 * @param {string} params.agentId - The agent ID
 * @param {string} [params.query] - Text query to search for
 * @param {string} [params.memoryId] - Memory ID to find similar to
 * @param {string} [params.excludeContactId] - Contact ID to exclude from results
 * @returns {Promise<Array<{id: string, contact_name: string, contact_phone: string, summary: string, key_topics: string[], similarity: number}>>}
 */
export async function searchSimilarMemories({ agentId, query, memoryId, excludeContactId }) {
  if (!agentId || (!query && !memoryId)) {
    return [];
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/semantic-memory-search`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ agentId, query, memoryId, excludeContactId }),
      }
    );

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('Search similar memories error:', error);
    return [];
  }
}

/**
 * Clear all memories for an agent
 * @param {string} agentId - The agent ID
 * @returns {Promise<{success: boolean, deleted: number}>}
 */
export async function clearAllAgentMemories(agentId) {
  if (!agentId) {
    throw new Error('Agent ID is required');
  }

  try {
    // Get count first
    const count = await getMemoryCount(agentId);

    const { error } = await supabase
      .from('conversation_contexts')
      .delete()
      .eq('agent_id', agentId);

    if (error) { throw error; }

    return { success: true, deleted: count };

  } catch (error) {
    console.error('Clear all memories error:', error);
    throw new Error('Failed to clear all memories');
  }
}
