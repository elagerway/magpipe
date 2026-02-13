import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveUser } from "../_shared/api-auth.ts";
import { corsHeaders, handleCors } from '../_shared/cors.ts'

interface ManualSourceRequest {
  title: string;
  content?: string;
  url?: string;
  file_data?: string; // Base64 encoded file
  file_type?: 'pdf' | 'text';
  file_name?: string;
}

/**
 * Extract text from PDF using pdf.js-extract via external API
 * Since Deno doesn't support pdf-parse well, we use OpenAI's vision API to extract PDF text
 */
async function extractPdfText(base64Data: string, openaiApiKey: string): Promise<string> {
  try {
    // Use OpenAI GPT-4 vision to extract text from PDF
    // First convert PDF pages to images would be complex, so let's use a simpler approach
    // We'll use the pdf-parse library approach but for Deno

    // For now, use a simple regex-based extraction for text-based PDFs
    // This won't work for scanned PDFs but will work for text-based ones
    const base64Content = base64Data.replace(/^data:[^;]+;base64,/, '');
    const binaryStr = atob(base64Content);

    // Extract text streams from PDF (simple approach)
    const textMatches = binaryStr.match(/\(([^)]+)\)/g) || [];
    let extractedText = textMatches
      .map(m => m.slice(1, -1))
      .filter(t => t.length > 2 && !/^[\\\/\d\s]+$/.test(t))
      .join(' ');

    // Also try to find text between BT and ET markers
    const btEtMatches = binaryStr.match(/BT[\s\S]*?ET/g) || [];
    for (const block of btEtMatches) {
      const tjMatches = block.match(/\(([^)]+)\)\s*Tj/g) || [];
      const blockText = tjMatches.map(m => {
        const match = m.match(/\(([^)]+)\)/);
        return match ? match[1] : '';
      }).join(' ');
      if (blockText) extractedText += ' ' + blockText;
    }

    // Clean up the text
    extractedText = extractedText
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '')
      .replace(/\\t/g, ' ')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\s+/g, ' ')
      .trim();

    if (extractedText.length < 50) {
      throw new Error('Could not extract enough text from PDF. The PDF may be scanned/image-based.');
    }

    return extractedText;
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error('Failed to parse PDF file. Please try pasting the content manually.');
  }
}

/**
 * Extract text from base64 text file
 */
function extractTextFile(base64Data: string): string {
  const base64Content = base64Data.replace(/^data:[^;]+;base64,/, '');
  return atob(base64Content);
}

// Simple text chunking (500-1000 tokens ~= 2000-4000 characters)
function chunkText(text: string, maxChunkSize = 3000): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split('\n\n');
  let currentChunk = '';

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = para;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    // Create Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    const user = await resolveUser(req, supabaseClient);
    if (!user) {
      return new Response(
        JSON.stringify({ error: { code: "unauthorized", message: "Unauthorized" } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request
    const body: ManualSourceRequest = await req.json();

    // Validate title
    if (!body.title || typeof body.title !== 'string' || body.title.trim().length < 1) {
      return new Response(
        JSON.stringify({ error: 'Title is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get OpenAI API key (needed for PDF extraction and embeddings)
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Extract content from file or use provided content
    let content: string;

    if (body.file_data && body.file_type) {
      // Handle file upload
      console.log(`Processing ${body.file_type} file: ${body.file_name || 'unnamed'}`);

      if (body.file_type === 'pdf') {
        content = await extractPdfText(body.file_data, openaiApiKey);
      } else if (body.file_type === 'text') {
        content = extractTextFile(body.file_data);
      } else {
        return new Response(
          JSON.stringify({ error: 'Unsupported file type. Use PDF or text files.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else if (body.content) {
      content = body.content;
    } else {
      return new Response(
        JSON.stringify({ error: 'Either content or file_data is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate content
    if (!content || content.trim().length < 50) {
      return new Response(
        JSON.stringify({ error: 'Content must be at least 50 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (content.length > 500000) {
      return new Response(
        JSON.stringify({ error: 'Content too large (max 500KB)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check user's knowledge source count (max 50)
    const { count } = await supabase
      .from('knowledge_sources')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (count && count >= 50) {
      return new Response(
        JSON.stringify({ error: 'Maximum 50 knowledge sources allowed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const title = body.title.trim();
    content = content.trim();

    // Generate URL based on source type
    let url: string;
    let sourceType = 'manual';
    if (body.file_type === 'pdf') {
      url = `file://pdf/${body.file_name || title.toLowerCase().replace(/\s+/g, '-')}.pdf`;
      sourceType = 'pdf';
    } else if (body.file_type === 'text') {
      url = `file://text/${body.file_name || title.toLowerCase().replace(/\s+/g, '-')}.txt`;
      sourceType = 'text';
    } else {
      url = body.url?.trim() || `manual://${title.toLowerCase().replace(/\s+/g, '-')}`;
    }

    // Chunk the content
    const chunks = chunkText(content);

    if (chunks.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No content to process' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create knowledge source record
    const { data: source, error: sourceError } = await supabase
      .from('knowledge_sources')
      .insert({
        user_id: user.id,
        url,
        title,
        description: content.substring(0, 200),
        sync_period: null, // Manual/file sources don't sync
        sync_status: 'syncing',
        crawl_mode: sourceType,
      })
      .select()
      .single();

    if (sourceError) throw sourceError;

    const chunkRecords = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: chunk,
        }),
      });

      if (!embeddingResponse.ok) {
        console.error('OpenAI embedding error:', await embeddingResponse.text());
        throw new Error('Failed to generate embeddings');
      }

      const embeddingData = await embeddingResponse.json();
      const embedding = embeddingData.data[0].embedding;

      chunkRecords.push({
        knowledge_source_id: source.id,
        content: chunk,
        embedding,
        chunk_index: i,
        token_count: Math.ceil(chunk.length / 4),
        metadata: { source_url: url, page_title: title, manual: true },
      });
    }

    // Insert all chunks
    const { error: chunksError } = await supabase
      .from('knowledge_chunks')
      .insert(chunkRecords);

    if (chunksError) throw chunksError;

    // Update source with completed status
    const { data: updatedSource } = await supabase
      .from('knowledge_sources')
      .update({
        sync_status: 'completed',
        chunk_count: chunks.length,
        last_synced_at: new Date().toISOString(),
      })
      .eq('id', source.id)
      .select()
      .single();

    // Log action
    await supabase.from('admin_action_logs').insert({
      user_id: user.id,
      action_type: 'add_knowledge_source',
      description: `Added ${sourceType} knowledge source: ${title}`,
      new_value: { title, chunk_count: chunks.length, crawl_mode: sourceType, file_name: body.file_name },
      source: 'web_chat',
      success: true,
    });

    return new Response(
      JSON.stringify({
        id: updatedSource.id,
        url: updatedSource.url,
        title: updatedSource.title,
        description: updatedSource.description,
        status: updatedSource.sync_status,
        chunk_count: updatedSource.chunk_count,
        crawl_mode: sourceType,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in knowledge-source-manual:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
