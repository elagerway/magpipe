# Agent Assistant Actions - Implementation Tasks

## Phase 1: Call Contact via Agent

### Task 1.1: Add call_contact function definition
- [ ] Add function schema to `admin-agent-chat/index.ts`
- [ ] Include contact_identifier and optional caller_id params
- File: `supabase/functions/admin-agent-chat/index.ts`

### Task 1.2: Create agent-call-contact Edge Function
- [ ] Create new Edge Function
- [ ] Implement contact search by name/phone
- [ ] Handle multiple matches (return list for clarification)
- [ ] Integrate with initiate-bridged-call
- [ ] Return call status
- File: `supabase/functions/agent-call-contact/index.ts`

### Task 1.3: Update AdminChatInterface for call confirmations
- [ ] Add CALL_CONTACT to confirmation types
- [ ] Render call confirmation dialog
- [ ] Execute call on confirm (navigate to phone page or direct API)
- File: `src/components/AdminChatInterface.js`

### Task 1.4: Test call flow
- [ ] Test "Call John" with existing contact
- [ ] Test with phone number directly
- [ ] Test with multiple matches
- [ ] Test with no matches

---

## Phase 2: Send SMS via Agent

### Task 2.1: Add send_sms function definition
- [ ] Add function schema to admin-agent-chat
- [ ] Include recipient, message, optional sender_number
- File: `supabase/functions/admin-agent-chat/index.ts`

### Task 2.2: Create agent-send-sms Edge Function
- [ ] Create new Edge Function
- [ ] Resolve recipient to phone number
- [ ] Check opt-out compliance
- [ ] Call existing send-user-sms
- [ ] Return delivery status
- File: `supabase/functions/agent-send-sms/index.ts`

### Task 2.3: Update AdminChatInterface for SMS confirmations
- [ ] Add SEND_SMS to confirmation types
- [ ] Render SMS confirmation with message preview
- [ ] Execute send on confirm
- File: `src/components/AdminChatInterface.js`

### Task 2.4: Test SMS flow
- [ ] Test "Text Sarah: hello"
- [ ] Test with phone number
- [ ] Test opt-out handling
- [ ] Test long messages

---

## Phase 3: List/Search Contacts

### Task 3.1: Add list_contacts function definition
- [ ] Add function schema with optional search_term
- File: `supabase/functions/admin-agent-chat/index.ts`

### Task 3.2: Implement contact search in admin-agent-chat
- [ ] Query contacts table with search
- [ ] Return formatted list (top 10)
- [ ] Handle no results
- File: `supabase/functions/admin-agent-chat/index.ts`

### Task 3.3: Test contact search
- [ ] Test "Who are my contacts?"
- [ ] Test "Find contacts named John"
- [ ] Test empty results

---

## Phase 4: Add Contact via Agent

### Task 4.1: Add add_contact function definition
- [ ] Add function schema with name, phone_number, notes
- File: `supabase/functions/admin-agent-chat/index.ts`

### Task 4.2: Implement contact creation in admin-agent-chat
- [ ] Normalize phone number to E.164
- [ ] Insert into contacts table
- [ ] Handle duplicate phone numbers
- File: `supabase/functions/admin-agent-chat/index.ts`

### Task 4.3: Update AdminChatInterface for add contact confirmations
- [ ] Add ADD_CONTACT to confirmation types
- [ ] Render add contact confirmation
- [ ] Execute add on confirm
- File: `src/components/AdminChatInterface.js`

### Task 4.4: Test add contact flow
- [ ] Test "Add John 604-555-1234 to contacts"
- [ ] Test duplicate prevention
- [ ] Test various phone formats

---

## Phase 5: Business Search (Web Integration)

### Task 5.1: Set up Google Places API
- [ ] Create Google Cloud project (if needed)
- [ ] Enable Places API
- [ ] Get API key
- [ ] Add to Supabase secrets: `GOOGLE_PLACES_API_KEY`

### Task 5.2: Add search_business function definition
- [ ] Add function schema with business_name, location
- File: `supabase/functions/admin-agent-chat/index.ts`

### Task 5.3: Create agent-search-business Edge Function
- [ ] Create new Edge Function
- [ ] Call Google Places API
- [ ] Parse results (name, phone, address)
- [ ] Return top matches
- File: `supabase/functions/agent-search-business/index.ts`

### Task 5.4: Implement context management
- [ ] Store lastSearchResult in conversation context
- [ ] Enable "call them" / "add to contacts" follow-ups
- File: `supabase/functions/admin-agent-chat/index.ts`

### Task 5.5: Test business search flow
- [ ] Test "Find Pizza Hut in Vancouver"
- [ ] Test "Call them" after search
- [ ] Test "Add to contacts" after search

---

## Phase 6: Voice Mode Support

### Task 6.1: Add function definitions to Realtime API
- [ ] Update RealtimeAdminService session config
- [ ] Add same function definitions as text mode
- File: `src/services/realtimeAdminService.js`

### Task 6.2: Handle function calls in voice mode
- [ ] Parse function_call events from Realtime API
- [ ] Show confirmation (pause voice, show UI)
- [ ] Resume on confirm/cancel
- File: `src/components/AdminChatInterface.js`

### Task 6.3: Test voice commands
- [ ] Test "Call John" via voice
- [ ] Test "Text Sarah hello" via voice
- [ ] Test confirmation flow in voice mode

---

## Optional Enhancements

### Task E.1: Default caller ID selection
- [ ] Auto-select user's primary service number
- [ ] Allow override via command

### Task E.2: Call/SMS history queries
- [ ] "When did I last call John?"
- [ ] "Show recent messages with Sarah"

### Task E.3: Scheduled actions
- [ ] "Remind me to call John tomorrow"
- [ ] Store in new scheduled_actions table

---

## Dependencies

| Task | Depends On |
|------|------------|
| 1.2 | 1.1 |
| 1.3 | 1.2 |
| 1.4 | 1.3 |
| 2.2 | 2.1 |
| 2.3 | 2.2 |
| 2.4 | 2.3 |
| 5.3 | 5.1, 5.2 |
| 5.4 | 5.3 |
| 5.5 | 5.4 |
| 6.1 | 1.x, 2.x complete |
| 6.2 | 6.1 |

---

## Priority Order

1. **Phase 1** - Call contact (most valuable)
2. **Phase 2** - Send SMS
3. **Phase 3** - List contacts (quick win)
4. **Phase 4** - Add contact
5. **Phase 5** - Business search
6. **Phase 6** - Voice mode
