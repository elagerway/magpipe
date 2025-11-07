/**
 * Knowledge Source Service
 * Handles management of knowledge sources for the AI agent
 */

import { supabase } from '../lib/supabase.js';

/**
 * Add a new knowledge source from URL
 * @param {string} url - The URL to fetch knowledge from
 * @param {string} syncPeriod - How often to sync: '24h', '7d', '1mo', '3mo'
 * @returns {Promise<{id: string, url: string, title: string, status: string, chunk_count: number}>}
 */
export async function addSource(url, syncPeriod = '7d') {
  if (!url || typeof url !== 'string') {
    throw new Error('URL is required');
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    throw new Error('Invalid URL format');
  }

  if (url.length > 2048) {
    throw new Error('URL too long (max 2048 characters)');
  }

  const validPeriods = ['24h', '7d', '1mo', '3mo'];
  if (!validPeriods.includes(syncPeriod)) {
    throw new Error('Invalid sync period. Must be one of: 24h, 7d, 1mo, 3mo');
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      throw new Error('Not authenticated');
    }

    // Call Edge Function
    const { data, error } = await supabase.functions.invoke('knowledge-source-add', {
      body: {
        url,
        sync_period: syncPeriod,
      },
    });

    if (error) {
      // Parse user-friendly error messages
      const errorMsg = error.message || '';

      if (errorMsg.includes('401')) {
        throw new Error('Authentication required. Please log in again.');
      } else if (errorMsg.includes('Maximum 50')) {
        throw new Error('You have reached the maximum of 50 knowledge sources.');
      } else if (errorMsg.includes('Could not access')) {
        throw new Error('Unable to access that URL. Please check the link and try again.');
      } else if (errorMsg.includes('Content too large')) {
        throw new Error('The page content is too large (max 1MB).');
      } else if (errorMsg.includes('No content extracted')) {
        throw new Error('No readable content found at that URL.');
      } else {
        throw new Error('Failed to add knowledge source. Please try again.');
      }
    }

    return {
      id: data.id,
      url: data.url,
      title: data.title,
      description: data.description,
      status: data.status,
      chunkCount: data.chunk_count,
      syncPeriod: data.sync_period,
    };

  } catch (error) {
    console.error('Add knowledge source error:', error);

    if (error.message.includes('Not authenticated')) {
      window.location.href = '/login';
    }

    throw error;
  }
}

/**
 * List all knowledge sources for current user
 * @returns {Promise<Array<{id: string, url: string, title: string, status: string, chunk_count: number, created_at: string}>>}
 */
export async function listSources() {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      throw new Error('Not authenticated');
    }

    // Call Edge Function
    const { data, error } = await supabase.functions.invoke('knowledge-source-list');

    if (error) {
      if (error.message?.includes('401')) {
        throw new Error('Authentication required. Please log in again.');
      } else {
        throw new Error('Failed to load knowledge sources.');
      }
    }

    return data.sources || [];

  } catch (error) {
    console.error('List knowledge sources error:', error);

    if (error.message.includes('Not authenticated')) {
      window.location.href = '/login';
    }

    throw error;
  }
}

/**
 * Delete a knowledge source
 * @param {string} id - The knowledge source ID
 * @returns {Promise<{success: boolean, deleted_chunks: number}>}
 */
export async function deleteSource(id) {
  if (!id) {
    throw new Error('Knowledge source ID is required');
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    throw new Error('Invalid knowledge source ID');
  }

  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      throw new Error('Not authenticated');
    }

    // Call Edge Function
    const { data, error } = await supabase.functions.invoke('knowledge-source-delete', {
      body: { id },
    });

    if (error) {
      const errorMsg = error.message || '';

      if (errorMsg.includes('401')) {
        throw new Error('Authentication required. Please log in again.');
      } else if (errorMsg.includes('404') || errorMsg.includes('not found')) {
        throw new Error('Knowledge source not found or you do not have permission to delete it.');
      } else {
        throw new Error('Failed to delete knowledge source.');
      }
    }

    return {
      success: data.success,
      deletedChunks: data.deleted_chunks,
    };

  } catch (error) {
    console.error('Delete knowledge source error:', error);

    if (error.message.includes('Not authenticated')) {
      window.location.href = '/login';
    }

    throw error;
  }
}

/**
 * Get knowledge source details
 * @param {string} id - The knowledge source ID
 * @returns {Promise<object>}
 */
export async function getSourceDetails(id) {
  if (!id) {
    throw new Error('Knowledge source ID is required');
  }

  try {
    const { data, error } = await supabase
      .from('knowledge_sources')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Knowledge source not found');
      }
      throw error;
    }

    return data;

  } catch (error) {
    console.error('Get source details error:', error);
    throw new Error('Failed to load knowledge source details');
  }
}
