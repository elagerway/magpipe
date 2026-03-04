# Research: Admin Agent & Home Page Redesign

**Feature**: 003-admin-agent-home
**Date**: 2025-11-05
**Status**: Complete

---

## Research Questions

Based on Technical Context analysis, the following areas required investigation:

1. **OpenAI Function Calling for Admin Agent**: How to structure function definitions for agent configuration actions
2. **Supabase pgvector Integration**: Best practices for vector embeddings storage and retrieval
3. **Web Speech API**: Browser compatibility and implementation patterns for voice toggle
4. **Knowledge Base URL Scraping**: Techniques for fetching and processing web content
5. **SMS Confirmation Flow**: Integration with existing Postmark infrastructure for access code verification
6. **Phone Admin Authentication**: Integration with existing LiveKit/Retell call flow

---

## 1. OpenAI Function Calling for Admin Agent

### Decision
Use OpenAI's **Function Calling** feature with GPT-4 to enable the admin agent to execute configuration actions.

### Implementation Approach
- Define functions for: `update_system_prompt`, `add_knowledge_source`, `remove_knowledge_source`, `preview_changes`
- Each function returns structured data that the agent uses to confirm actions with user
- User confirmation required before executing database changes (per FR-008, FR-009)
- Stream responses for low latency (per NFR-002)

### Function Definition Pattern
```typescript
const functions = [
  {
    name: "update_system_prompt",
    description: "Update the system prompt for the call/SMS handling agent",
    parameters: {
      type: "object",
      properties: {
        new_prompt: { type: "string", description: "The updated system prompt text" },
        modification_type: { type: "string", enum: ["append", "replace", "modify"] }
      },
      required: ["new_prompt", "modification_type"]
    }
  }
];
```

### Rationale
- **Mature API**: OpenAI function calling is production-ready and well-documented
- **Natural language → structured actions**: Converts conversational requests to database operations
- **User confirmation flow**: Function returns preview, waits for user approval before execution
- **Error handling**: Can return validation errors to user in natural language

### Alternatives Considered
1. **LangChain ReAct agent**: More complex setup, unnecessary for this use case
2. **Custom prompt engineering only**: Less reliable extraction of intent and parameters
3. **Direct SQL from natural language**: Too risky, hard to preview changes safely

---

## 2. Supabase pgvector Integration

### Decision
Use **Supabase pgvector extension** with OpenAI `text-embedding-3-small` model for knowledge base vector storage.

### Implementation Approach
- Enable pgvector extension in migration: `CREATE EXTENSION IF NOT EXISTS vector;`
- Store embeddings in `knowledge_chunks` table with `embedding vector(1536)` column
- Use cosine similarity search: `ORDER BY embedding <=> query_embedding LIMIT 5`
- Index for performance: `CREATE INDEX ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops);`

### Schema Pattern
```sql
CREATE TABLE knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_source_id UUID REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  chunk_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX knowledge_chunks_embedding_idx ON knowledge_chunks
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### Performance Characteristics
- **Embedding generation**: ~50-100ms per chunk via OpenAI API
- **Vector search**: <10ms for cosine similarity with index on ~10k chunks
- **Chunk size**: 500-1000 tokens per chunk (balance between context and granularity)

### Rationale
- **Native Supabase support**: pgvector is first-class extension in Supabase
- **Cost-effective**: OpenAI embeddings are $0.00002/1k tokens (very cheap)
- **Fast retrieval**: Indexed vector search is sub-10ms even at scale
- **Simple integration**: Direct SQL queries, no external vector database needed

### Alternatives Considered
1. **Pinecone/Weaviate**: External service adds complexity and cost
2. **Full-text search only**: Less semantic understanding, keyword-dependent
3. **No chunking**: Would exceed context limits for large documents

---

## 3. Web Speech API for Voice Toggle

### Decision
Use **Web Speech API** (SpeechRecognition) for voice input on homepage, with graceful fallback for unsupported browsers.

### Browser Compatibility
- ✅ Chrome/Edge: Full support (prefixed as `webkitSpeechRecognition`)
- ✅ Safari iOS/macOS: Full support (prefixed)
- ❌ Firefox: No support (fallback to text-only)
- ❌ Firefox Android: No support (fallback to text-only)

**Coverage**: ~85% of mobile users (Chrome on Android, Safari on iOS)

### Implementation Pattern
```javascript
// Feature detection
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SpeechRecognition) {
  // Hide voice toggle, show message: "Voice input not supported on this browser"
}

// Usage
const recognition = new SpeechRecognition();
recognition.continuous = false; // Stop after user stops speaking
recognition.interimResults = false; // Only final results
recognition.lang = 'en-US';

recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript;
  // Send to admin agent
};
```

### Toggle UI Pattern
- Button states: "Inactive" → "Listening" → "Processing" → "Inactive"
- Visual feedback: Pulsing mic icon when listening
- Auto-stop after 3 seconds of silence
- Click again to cancel listening

### Rationale
- **Zero cost**: Built into browsers, no external API needed
- **Low latency**: No network round-trip for transcription
- **Privacy**: Audio never leaves user's device
- **Simple UX**: Single button toggle matches requirement (FR-003)

### Alternatives Considered
1. **Deepgram/AssemblyAI API**: Adds cost, latency, privacy concerns
2. **WebRTC + external STT**: Over-engineered for this use case
3. **LiveKit agent for web**: Requires room creation, complex setup

---

## 4. Knowledge Base URL Scraping

### Decision
Use **Mozilla Readability** + **Cheerio** in Deno Edge Function for content extraction, with fallback to raw HTML parsing.

### Implementation Approach
1. Fetch URL with `fetch()` (native in Deno)
2. Parse HTML with Cheerio (jQuery-like DOM manipulation)
3. Extract main content with Readability algorithm (removes nav, ads, footers)
4. Chunk text into 500-1000 token segments
5. Generate embeddings for each chunk via OpenAI API
6. Store chunks + embeddings in database

### Content Processing Pipeline
```
URL → fetch() → HTML → Cheerio → Readability → Plain Text
  → Tokenize → Chunk (500 tokens) → OpenAI Embeddings → Database
```

### Error Handling
- **404/500 errors**: Return user-friendly message "Could not access that URL"
- **Paywall/login required**: Detect and inform user "Content requires authentication"
- **Malformed HTML**: Fall back to raw text extraction
- **Too large (>1MB)**: Warn user "Content too large, first 100 pages only"

### Rationale
- **Readability**: Industry standard (used by Firefox Reader Mode)
- **Cheerio**: Lightweight, familiar jQuery API
- **Deno native fetch**: No external HTTP library needed
- **Chunking**: Prevents context overflow, improves retrieval relevance

### Alternatives Considered
1. **Puppeteer/Playwright**: Too heavy for Edge Functions, slow
2. **External scraping service (Apify)**: Adds cost and dependency
3. **No content extraction**: User must provide plain text (bad UX)

---

## 5. SMS Confirmation for Access Code

### Decision
Use existing **Postmark** integration (already configured for password reset) to send SMS confirmation codes via Postmark's SMS service.

### Implementation Pattern
```typescript
// Generate 6-digit code
const confirmationCode = Math.floor(100000 + Math.random() * 900000).toString();

// Store with expiration (5 minutes)
await supabase.from('sms_confirmations').insert({
  user_id,
  phone_number,
  code: confirmationCode,
  expires_at: new Date(Date.now() + 5 * 60 * 1000)
});

// Send via Postmark
await postmarkClient.sendSms({
  to: phone_number,
  message: `Your Pat access code confirmation: ${confirmationCode}. Expires in 5 minutes.`
});
```

### Verification Flow
1. User clicks "Change Access Code" in settings
2. User enters new access code
3. System sends SMS with 6-digit confirmation code
4. User enters confirmation code
5. If match + not expired: Update access code in database
6. If mismatch or expired: Show error, allow retry (3 max)

### Rationale
- **Existing infrastructure**: Postmark already integrated (see POSTMARK_SETUP.md)
- **Cost-effective**: Postmark SMS pricing is reasonable
- **Secure**: Time-limited codes prevent replay attacks
- **Familiar UX**: Matches common 2FA patterns

### Alternatives Considered
1. **Twilio SMS**: Would require new integration, additional cost
2. **Email verification only**: Less secure (email can be compromised)
3. **No verification**: Too risky for access code changes

---

## 6. Phone Admin Authentication

### Decision
Integrate phone admin authentication into **existing LiveKit agent** (agent.py) using caller ID verification + access code voice input.

### Authentication Flow
```python
# In LiveKit agent entrypoint
@agent.on("track_subscribed")
async def on_track_subscribed(track):
    # 1. Get caller ID from SIP metadata
    caller_id = get_caller_id_from_sip()

    # 2. Query database for user with this phone number
    user = supabase.from('users').select('*').eq('phone', caller_id).single()

    if not user:
        await session.say("This number is not registered. Please call from your registered number.")
        return

    # 3. Verify identity
    await session.say(f"Is this {user['full_name']}?")
    response = await session.get_user_input()

    if "yes" not in response.lower():
        await session.say("Authentication cancelled.")
        return

    # 4. Request access code
    await session.say("Please say your access code.")
    code_response = await session.get_user_input()

    # 5. Verify access code
    if verify_access_code(user['id'], code_response):
        # Grant admin privileges for this session
        session.context['is_admin'] = True
        session.context['user_id'] = user['id']
        await session.say("Access granted. How can I help you configure your assistant?")
    else:
        # Log failed attempt
        log_failed_auth_attempt(user['id'])
        attempts = get_failed_attempts(user['id'])

        if attempts >= 3:
            # Lock account
            lock_phone_admin(user['id'])
            await session.say("Too many failed attempts. Please reset your access code via the web app.")
        else:
            await session.say(f"Incorrect access code. {3 - attempts} attempts remaining.")
```

### Access Code Verification
- **Storage**: `users` table, column `phone_admin_access_code` (hashed with bcrypt)
- **Voice recognition tolerance**: Accept variations (e.g., "one two three" → "123")
- **Failed attempts tracking**: `access_code_attempts` table with timestamp, user_id, success boolean
- **Lockout**: Set `phone_admin_locked` flag in `users` table

### Rationale
- **Existing infrastructure**: Reuses LiveKit agent.py, no new call handling needed
- **Security**: Two-factor (caller ID + access code), rate limiting, lockout
- **Low latency**: No additional API calls beyond database queries
- **Familiar UX**: Similar to banking phone authentication

### Alternatives Considered
1. **Separate Retell agent for admin**: Would require new agent configuration, complexity
2. **WebRTC from browser**: Doesn't match "phone-based" requirement
3. **SMS-only admin**: Wouldn't support voice configuration (FR-021 requirement)

---

## Technology Stack Summary

| Component | Technology | Justification |
|-----------|-----------|---------------|
| Admin Agent | OpenAI GPT-4 Function Calling | Mature, reliable natural language → actions |
| Vector DB | Supabase pgvector | Native integration, fast, cost-effective |
| Embeddings | OpenAI text-embedding-3-small | Cheap ($0.00002/1k tokens), 1536 dimensions |
| Voice Input (Web) | Web Speech API | Free, low latency, privacy-preserving |
| Voice Input (Phone) | Existing LiveKit agent | Reuses infrastructure |
| URL Scraping | Readability + Cheerio | Lightweight, production-proven |
| SMS | Postmark (existing) | Already integrated |
| Frontend | Vite + Vanilla JS | Matches existing architecture |
| Backend | Supabase Edge Functions (Deno) | Serverless, auto-scaling |

---

## Dependencies Added

### NPM Packages (Frontend)
- None (Web Speech API is native)

### Deno Dependencies (Edge Functions)
- `npm:@mozilla/readability@^0.5.0` - Content extraction
- `npm:cheerio@^1.0.0-rc.12` - HTML parsing
- `npm:openai@^4.20.0` - GPT-4 + embeddings

### Supabase Extensions
- `vector` - pgvector for embeddings (enable via migration)

### External APIs
- OpenAI API (GPT-4 + embeddings) - Usage-based pricing
- Postmark SMS (existing account) - Per-SMS pricing

---

## Performance Estimates

| Operation | Estimated Latency | Notes |
|-----------|------------------|-------|
| Admin agent response | 500-1500ms | Streaming reduces perceived latency |
| Knowledge URL fetch | 1-3 seconds | Depends on source site speed |
| Embedding generation | 100-500ms | Batched for multiple chunks |
| Vector search | <10ms | With pgvector index |
| Voice transcription (web) | 0ms | Local browser processing |
| SMS delivery | 1-5 seconds | Postmark typical delivery time |

---

## Security Considerations

1. **Access Code Storage**: Hash with bcrypt before storing in database
2. **Rate Limiting**: Max 3 failed phone auth attempts per user
3. **SMS Code Expiration**: 5 minutes validity for confirmation codes
4. **Knowledge Source Validation**: Check URL scheme (only http/https), max size limits
5. **Admin Action Logging**: All configuration changes logged to audit trail
6. **RLS Policies**: Users can only access their own admin conversations, knowledge sources, access codes

---

## Next Steps

With research complete, proceed to **Phase 1: Design & Contracts** to:
1. Define data model (entities, relationships, migrations)
2. Create API contracts for Edge Functions
3. Generate contract tests
4. Extract integration test scenarios from user stories
5. Create quickstart guide

---

**Status**: ✅ All research questions resolved, no NEEDS CLARIFICATION remaining.
