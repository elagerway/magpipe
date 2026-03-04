# Quickstart Guide: Admin Agent & Home Page Redesign

**Feature**: 003-admin-agent-home
**Purpose**: End-to-end validation of admin agent functionality
**Estimated Time**: 10-15 minutes

---

## Prerequisites

1. ✅ Supabase project running with migrations applied
2. ✅ Frontend running on localhost (Vite dev server)
3. ✅ Environment variables configured:
   - `OPENAI_API_KEY` - For GPT-4 and embeddings
   - `POSTMARK_API_KEY` - For SMS confirmations
   - `SUPABASE_URL` and `SUPABASE_ANON_KEY` - For database access
4. ✅ User account created and logged in
5. ✅ At least one service number configured for user

---

## Scenario 1: Text-Based Prompt Configuration (5 min)

**Validates**: FR-002, FR-006, FR-008, FR-009, FR-010

### Steps

1. **Navigate to Home Page**
   ```
   - Open browser to http://localhost:5173
   - Should see new chat interface with greeting message
   ```
   **Expected**:
   - Chat interface displays with message: "Hi! I'm your Pat AI assistant admin. I can help you configure your call and SMS agent, add knowledge sources, and manage settings. What would you like to do?"
   - Input field at bottom for typing messages
   - No voice toggle visible yet (will appear after first interaction)

2. **Send Configuration Request**
   ```
   - Type: "Make my agent more friendly and casual when answering calls"
   - Press Enter or click Send button
   ```
   **Expected**:
   - Message appears in chat as user message
   - Loading indicator shows (agent is thinking)
   - Agent responds within 1-2 seconds

3. **Review Preview**
   ```
   - Agent should display current system prompt
   - Agent should show proposed changes (highlighted or in diff format)
   - Agent should ask: "Should I apply these changes?"
   ```
   **Expected**:
   ```
   Agent: "I'll update your system prompt to be more friendly and casual. Here's what will change:

   Current prompt:
   [shows existing prompt]

   Updated prompt:
   [shows new prompt with friendly, casual tone]

   Would you like me to apply these changes?"
   ```

4. **Confirm Changes**
   ```
   - Type: "Yes, apply the changes"
   - Press Enter
   ```
   **Expected**:
   - Agent confirms: "Done! Your agent will now use this prompt for calls and texts."
   - Success message displayed in chat

5. **Verify in Database**
   ```sql
   SELECT system_prompt, updated_at
   FROM agent_configs
   WHERE user_id = '<user_id>'
   ORDER BY updated_at DESC
   LIMIT 1;
   ```
   **Expected**:
   - `system_prompt` contains updated text with friendly/casual tone
   - `updated_at` timestamp is recent (within last minute)

6. **Check Audit Log**
   ```sql
   SELECT action_type, description, new_value, created_at
   FROM admin_action_logs
   WHERE user_id = '<user_id>'
   AND action_type = 'update_system_prompt'
   ORDER BY created_at DESC
   LIMIT 1;
   ```
   **Expected**:
   - Log entry created with `source = 'web_chat'`
   - `new_value` contains new prompt text

---

## Scenario 2: Adding Knowledge from URL (5 min)

**Validates**: FR-007, FR-011, FR-012, FR-013

### Steps

1. **Request Knowledge Addition**
   ```
   - In same chat window, type: "Add knowledge from https://example.com/faq"
   - Press Enter
   ```
   **Expected**:
   - Agent responds: "I'll fetch that page and add it to your knowledge base. This may take a moment..."
   - Loading indicator appears

2. **Wait for Processing**
   ```
   - Wait 5-10 seconds for URL fetch, content extraction, chunking, embedding
   ```
   **Expected**:
   - Agent updates message: "Added knowledge from [Page Title] (X chunks). Your agent can now reference this information when answering calls."

3. **Verify Knowledge Source in Database**
   ```sql
   SELECT id, url, title, sync_status, chunk_count, created_at
   FROM knowledge_sources
   WHERE user_id = '<user_id>'
   ORDER BY created_at DESC
   LIMIT 1;
   ```
   **Expected**:
   - New record with URL 'https://example.com/faq'
   - `sync_status = 'completed'`
   - `chunk_count > 0`

4. **Verify Chunks and Embeddings**
   ```sql
   SELECT kc.id, kc.content, kc.chunk_index, kc.token_count,
          array_length(kc.embedding, 1) as embedding_dim
   FROM knowledge_chunks kc
   JOIN knowledge_sources ks ON kc.knowledge_source_id = ks.id
   WHERE ks.user_id = '<user_id>'
   AND ks.url = 'https://example.com/faq'
   ORDER BY kc.chunk_index
   LIMIT 5;
   ```
   **Expected**:
   - Multiple chunks (at least 1)
   - Each chunk has `embedding_dim = 1536` (OpenAI text-embedding-3-small)
   - `chunk_index` sequential (0, 1, 2, ...)
   - `content` contains extracted text from page

5. **Test Vector Search**
   ```sql
   -- Generate embedding for test query
   -- (In real implementation, this is done by Edge Function)
   SELECT kc.content, ks.title,
          1 - (kc.embedding <=> '[0.1, 0.2, ...]'::vector) AS similarity
   FROM knowledge_chunks kc
   JOIN knowledge_sources ks ON kc.knowledge_source_id = ks.id
   WHERE ks.user_id = '<user_id>'
   ORDER BY kc.embedding <=> '[test_embedding]'::vector
   LIMIT 3;
   ```
   **Expected**:
   - Top 3 most similar chunks returned
   - Similarity scores between 0.7-1.0 for relevant content

---

## Scenario 3: Voice Input Toggle (3 min)

**Validates**: FR-003, NFR-005 (mobile compatibility)

### Steps

1. **Locate Voice Toggle**
   ```
   - Look for microphone icon button near chat input
   ```
   **Expected**:
   - Button visible on both desktop and mobile
   - Icon shows microphone (muted state)

2. **Activate Voice Input**
   ```
   - Click/tap microphone button
   ```
   **Expected**:
   - Button changes state to "listening" (pulsing animation)
   - Browser may prompt for microphone permission (first time)
   - Status text shows "Listening..."

3. **Speak Request**
   ```
   - Say: "What knowledge sources do I have?"
   - Wait for transcription
   ```
   **Expected**:
   - After 1-2 seconds of silence, mic auto-stops
   - Transcribed text appears in input field
   - Message sent to agent automatically
   - Agent responds with list of knowledge sources

4. **Deactivate Voice**
   ```
   - Click/tap microphone button again while listening
   ```
   **Expected**:
   - Listening stops immediately
   - Button returns to muted state
   - Any partial transcription discarded

5. **Test on Mobile** (if available)
   ```
   - Open same page on mobile device (iOS Safari or Android Chrome)
   - Repeat steps 2-4
   ```
   **Expected**:
   - Voice toggle works identically on mobile
   - UI scales properly to mobile screen
   - Chat interface responsive and usable

---

## Scenario 4: Settings - Knowledge Base Management (2 min)

**Validates**: FR-013, FR-014, FR-015

### Steps

1. **Navigate to Settings**
   ```
   - Click/tap Settings in bottom navigation
   - Look for "Knowledge Base" section
   ```
   **Expected**:
   - New "Knowledge Base" card/section visible
   - Shows list of added knowledge sources (from Scenario 2)

2. **View Knowledge Source Details**
   ```
   - Click on a knowledge source in the list
   ```
   **Expected**:
   - Expanded view shows:
     - URL
     - Title
     - Description
     - Sync period dropdown (24h, 7d, 1mo, 3mo)
     - Last synced timestamp
     - Next sync timestamp
     - Chunk count
     - Delete button

3. **Change Sync Period**
   ```
   - Click sync period dropdown
   - Select "1mo" (1 month)
   - Click Save
   ```
   **Expected**:
   - Dropdown closes
   - Success message: "Sync period updated"
   - `next_sync_at` recalculated in database

4. **Delete Knowledge Source**
   ```
   - Click Delete button
   - Confirm deletion in modal
   ```
   **Expected**:
   - Confirmation modal: "Are you sure you want to remove [Title]? This will delete X chunks."
   - Click Confirm
   - Source removed from list
   - Database: `knowledge_sources` record deleted
   - Database: All related `knowledge_chunks` cascaded delete

---

## Scenario 5: Access Code Setup and SMS Confirmation (5 min)

**Validates**: FR-019, FR-021, FR-022, FR-023, FR-024

### Steps

1. **Navigate to Access Code Settings**
   ```
   - In Settings page, locate "Phone Admin Access" section
   ```
   **Expected**:
   - Section shows:
     - "Access Code: Not Set" (if first time)
     - "Click to view" button (if already set)
     - "Change Access Code" button

2. **Set New Access Code**
   ```
   - Click "Change Access Code" button
   - Enter new code (e.g., "1234")
   - Click Submit
   ```
   **Expected**:
   - Input field for new code (4-20 characters)
   - Validation message if too short/long
   - After submit: "Sending confirmation code to your phone..."

3. **Receive SMS**
   ```
   - Check phone for SMS from Postmark
   ```
   **Expected**:
   - SMS received within 5-10 seconds
   - Message: "Your Pat access code confirmation: [6-digit code]. Expires in 5 minutes."

4. **Enter Confirmation Code**
   ```
   - Input field appears: "Enter confirmation code from SMS"
   - Type the 6-digit code from SMS
   - Click Verify
   ```
   **Expected**:
   - Success message: "Access code updated successfully"
   - "Access Code: ••••" (hidden) with "Click to view" button

5. **View Access Code**
   ```
   - Click "Click to view" button
   ```
   **Expected**:
   - Access code revealed for 10 seconds: "1234"
   - Then auto-hides again

6. **Verify in Database**
   ```sql
   SELECT phone_admin_access_code, phone_admin_locked, phone_admin_locked_at
   FROM users
   WHERE id = '<user_id>';
   ```
   **Expected**:
   - `phone_admin_access_code` is hashed (bcrypt) - NOT plain text "1234"
   - `phone_admin_locked = FALSE`
   - `phone_admin_locked_at IS NULL`

7. **Check SMS Confirmation Log**
   ```sql
   SELECT code, verified, verified_at, expires_at
   FROM sms_confirmations
   WHERE user_id = '<user_id>'
   ORDER BY created_at DESC
   LIMIT 1;
   ```
   **Expected**:
   - `verified = TRUE`
   - `verified_at` is recent
   - `code` matches what was sent in SMS

---

## Scenario 6: Phone Admin Authentication (Optional - Requires Call Setup)

**Validates**: FR-015, FR-016, FR-017, FR-018, FR-020, FR-024

### Prerequisites
- LiveKit agent running
- Phone with registered caller ID (user's phone number)

### Steps

1. **Call Service Number**
   ```
   - From registered phone, call one of user's service numbers
   ```
   **Expected**:
   - Agent answers within 2-3 seconds

2. **Identity Verification**
   ```
   - Agent says: "Is this [Your Name]?"
   - Respond: "Yes"
   ```
   **Expected**:
   - Agent recognizes caller ID matches user's phone
   - Agent proceeds to access code verification

3. **Access Code Request**
   ```
   - Agent says: "Please say your access code"
   - Speak: "One two three four" (if code is 1234)
   ```
   **Expected**:
   - Agent transcribes voice to digits
   - Agent verifies hashed code matches

4. **Success - Admin Access Granted**
   ```
   - Agent says: "Access granted. How can I help you configure your assistant?"
   ```
   **Expected**:
   - User can now make configuration requests via voice
   - Example: "Make my greeting shorter"
   - Agent processes just like web chat interface

5. **Test Failed Attempt (Optional)**
   ```
   - Call again
   - Say wrong access code 3 times
   ```
   **Expected**:
   - After 3rd failed attempt:
     - Agent says: "Too many failed attempts. Please reset your access code via the web app."
     - Call ends
   - Database: `phone_admin_locked = TRUE` for user
   - Database: 3 records in `access_code_attempts` with `success = FALSE`

6. **Unlock via Web** (if locked)
   ```
   - Go to Settings > Phone Admin Access
   - Change access code (triggers unlock)
   ```
   **Expected**:
   - After successful SMS confirmation:
     - `phone_admin_locked` reset to `FALSE`
     - User can call again and authenticate

---

## Post-Validation Checks

### 1. Conversation History
```sql
SELECT c.id, c.status, COUNT(m.id) as message_count, c.started_at, c.last_message_at
FROM admin_conversations c
LEFT JOIN admin_messages m ON c.id = m.conversation_id
WHERE c.user_id = '<user_id>'
GROUP BY c.id
ORDER BY c.started_at DESC;
```
**Expected**:
- At least 1 conversation created during quickstart
- Message count > 4 (multiple exchanges)
- `status = 'active'` or `'completed'`

### 2. Action Logs
```sql
SELECT action_type, source, success, created_at
FROM admin_action_logs
WHERE user_id = '<user_id>'
ORDER BY created_at DESC;
```
**Expected**:
- Logs for: `update_system_prompt`, `add_knowledge_source`, `change_access_code`
- All `success = TRUE`
- Sources: `web_chat`, possibly `phone_call` if Scenario 6 completed

### 3. Performance Check
```sql
SELECT
  AVG(EXTRACT(EPOCH FROM (created_at - LAG(created_at) OVER (ORDER BY created_at)))) as avg_response_time_seconds
FROM admin_messages
WHERE conversation_id IN (
  SELECT id FROM admin_conversations WHERE user_id = '<user_id>'
)
AND role = 'assistant';
```
**Expected**:
- Average response time < 2 seconds (meets "lowest possible latency" requirement)

---

## Troubleshooting

### Issue: Agent not responding
- Check browser console for errors
- Verify OpenAI API key is valid and has credits
- Check Supabase Edge Function logs: `npx supabase functions logs admin-agent-chat`

### Issue: Voice toggle not appearing
- Check browser console: "SpeechRecognition not supported"
- Use Chrome/Safari (Firefox doesn't support Web Speech API)
- Check HTTPS (required for microphone access)

### Issue: Knowledge source stuck in "syncing"
- Check Edge Function logs: `npx supabase functions logs knowledge-source-add`
- Verify URL is accessible (not behind paywall/login)
- Check OpenAI API errors (rate limit, invalid key)

### Issue: SMS not received
- Verify Postmark API key is correct
- Check Postmark dashboard for delivery status
- Verify phone number is in E.164 format in database

### Issue: Phone admin fails to authenticate
- Check LiveKit agent logs: `journalctl -u livekit-agent -n 50`
- Verify caller ID matches user's phone number in database
- Check access code is hashed correctly (bcrypt)

---

## Success Criteria

✅ All 6 scenarios completed without errors
✅ Database state matches expected values
✅ Performance targets met (< 2s response time)
✅ Mobile responsiveness confirmed
✅ SMS delivery working
✅ Voice input functional (Chrome/Safari)
✅ Audit logs created for all actions
✅ No console errors or Edge Function failures

---

**Estimated Total Time**: 10-15 minutes (Scenarios 1-5), +5 minutes for optional phone admin testing

**Next Steps After Quickstart**:
1. Run automated test suite: `npm run test`
2. Run E2E tests: `npm run test:e2e`
3. Review constitution compliance checklist
4. Mark Phase 5 validation complete in plan.md
