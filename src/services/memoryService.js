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
        last_updated,
        last_call_ids,
        contacts (
          id,
          name,
          phone_number
        )
      `)
      .eq('agent_id', agentId)
      .order('last_updated', { ascending: false });

    if (error) { throw error; }

    return (data || []).map(entry => ({
      id: entry.id,
      contact: entry.contacts,
      summary: entry.summary,
      keyTopics: entry.key_topics || [],
      preferences: entry.preferences || {},
      relationshipNotes: entry.relationship_notes,
      interactionCount: entry.interaction_count || 0,
      lastUpdated: entry.last_updated,
      lastCallIds: entry.last_call_ids || [],
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
        last_updated,
        last_call_ids,
        created_at,
        contacts (
          id,
          name,
          phone_number
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
