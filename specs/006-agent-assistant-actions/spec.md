# Agent Assistant Actions - Design Spec

## Overview
Enhance the admin agent (dashboard) to perform actions on behalf of the user:
- Call contacts via voice/text commands
- Send SMS messages to contacts
- Search the internet for business phone numbers
- Call searched numbers
- Add new contacts from search results

## User Stories

1. **"Call John"** - Agent looks up John in contacts, initiates call
2. **"Text Sarah: I'm running late"** - Agent sends SMS to Sarah
3. **"Find the phone number for Pizza Hut in Vancouver"** - Agent searches web, returns number
4. **"Call that number"** - Agent calls the number from previous search
5. **"Add them to my contacts as Pizza Hut Vancouver"** - Agent creates contact

---

## Architecture

### Current State
- Admin chat interface exists with text and voice modes
- OpenAI function calling already implemented for `update_system_prompt` and `add_knowledge_source`
- Confirmation workflow exists (user must approve before action executes)
- Call initiation via `initiate-bridged-call` Edge Function
- SMS sending via `send-user-sms` Edge Function
- Contact CRUD via `Contact` model

### Proposed Changes

#### New OpenAI Functions (add to `admin-agent-chat/index.ts`)

```typescript
const agentFunctions = [
  // Existing functions...

  {
    name: 'call_contact',
    description: 'Initiate a phone call to a contact. Searches contacts by name or phone number.',
    parameters: {
      type: 'object',
      properties: {
        contact_identifier: {
          type: 'string',
          description: 'Contact name or phone number to call'
        },
        caller_id: {
          type: 'string',
          description: 'Optional: phone number to call from (must be user\'s number)'
        }
      },
      required: ['contact_identifier']
    }
  },

  {
    name: 'send_sms',
    description: 'Send an SMS text message to a contact',
    parameters: {
      type: 'object',
      properties: {
        recipient: {
          type: 'string',
          description: 'Contact name or phone number'
        },
        message: {
          type: 'string',
          description: 'The message content to send'
        },
        sender_number: {
          type: 'string',
          description: 'Optional: phone number to send from'
        }
      },
      required: ['recipient', 'message']
    }
  },

  {
    name: 'search_business',
    description: 'Search the internet for a business phone number',
    parameters: {
      type: 'object',
      properties: {
        business_name: {
          type: 'string',
          description: 'Name of the business'
        },
        location: {
          type: 'string',
          description: 'City, state, or address for the business'
        }
      },
      required: ['business_name']
    }
  },

  {
    name: 'add_contact',
    description: 'Add a new contact to the user\'s contact list',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Contact name'
        },
        phone_number: {
          type: 'string',
          description: 'Phone number in any format'
        },
        notes: {
          type: 'string',
          description: 'Optional notes about the contact'
        }
      },
      required: ['name', 'phone_number']
    }
  },

  {
    name: 'list_contacts',
    description: 'Search or list user\'s contacts',
    parameters: {
      type: 'object',
      properties: {
        search_term: {
          type: 'string',
          description: 'Optional: filter contacts by name or phone'
        }
      }
    }
  }
];
```

---

## Implementation Plan

### Phase 1: Contact Lookup & Calling

**Files to modify:**
- `supabase/functions/admin-agent-chat/index.ts` - Add function definitions
- `src/components/AdminChatInterface.js` - Handle new function calls

**New Edge Function:** `supabase/functions/agent-call-contact/index.ts`
```typescript
// Input: { contact_identifier, caller_id?, user_id }
// Process:
// 1. Search contacts table for match
// 2. If multiple matches, return list for clarification
// 3. If single match, get user's default service number
// 4. Call initiate-bridged-call with params
// 5. Return call status
```

**Flow:**
1. User: "Call John"
2. Agent calls `call_contact({ contact_identifier: "John" })`
3. Backend searches contacts, finds "John Smith +16045551234"
4. Returns confirmation: "Call John Smith at +1 (604) 555-1234?"
5. User confirms
6. Call initiated via existing bridged call system

### Phase 2: SMS Messaging

**New Edge Function:** `supabase/functions/agent-send-sms/index.ts`
```typescript
// Input: { recipient, message, sender_number?, user_id }
// Process:
// 1. Resolve recipient to phone number
// 2. Check opt-out list
// 3. Get user's default service number if not specified
// 4. Call send-user-sms
// 5. Return delivery status
```

**Flow:**
1. User: "Text Sarah: Running 10 minutes late"
2. Agent calls `send_sms({ recipient: "Sarah", message: "Running 10 minutes late" })`
3. Backend resolves Sarah → +16045559876
4. Returns confirmation: "Send to Sarah (+1 604-555-9876): 'Running 10 minutes late'?"
5. User confirms
6. SMS sent via existing send-user-sms

### Phase 3: Web Search Integration

**New Edge Function:** `supabase/functions/agent-search-business/index.ts`

**Option A: Google Places API (Recommended)**
```typescript
// Best for business lookups - returns phone, address, hours
const placesUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(businessName + ' ' + location)}&inputtype=textquery&fields=name,formatted_phone_number,formatted_address&key=${GOOGLE_API_KEY}`;
```

**Option B: Tavily Search API**
```typescript
// AI-optimized search, good for general queries
const response = await fetch('https://api.tavily.com/search', {
  method: 'POST',
  body: JSON.stringify({
    api_key: TAVILY_API_KEY,
    query: `${businessName} phone number ${location}`,
    search_depth: 'basic',
    max_results: 3
  })
});
```

**Flow:**
1. User: "Find Pizza Hut in Vancouver BC"
2. Agent calls `search_business({ business_name: "Pizza Hut", location: "Vancouver BC" })`
3. Backend searches Google Places or web
4. Returns: "Found Pizza Hut - Robson Street: +1 (604) 555-7890. Want me to call them?"
5. User: "Yes" → initiates call
6. User: "Add to contacts" → creates contact

### Phase 4: Contact Management

**Modify:** `supabase/functions/admin-agent-chat/index.ts`
- Add direct Supabase insert for contacts (simpler than new Edge Function)

```typescript
case 'add_contact':
  const { name, phone_number, notes } = args;
  const normalized = normalizePhoneNumber(phone_number);

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      user_id: userId,
      name,
      phone_number: normalized,
      notes: notes || null
    })
    .select()
    .single();

  return { success: true, contact: data };
```

---

## Context Management

The agent needs to remember recent search results for follow-up commands.

**Session Context (stored in conversation):**
```typescript
interface AgentContext {
  lastSearchResult?: {
    type: 'contact' | 'business',
    name: string,
    phone: string,
    address?: string
  };
  lastCalledNumber?: string;
  lastMessagedContact?: string;
}
```

**Example conversation:**
```
User: "Find Domino's Pizza downtown"
Agent: [searches, stores result in context]
       "Found Domino's Pizza at 123 Main St. Phone: +1-604-555-1234"

User: "Call them"
Agent: [reads lastSearchResult from context]
       "Calling Domino's Pizza at +1-604-555-1234..."

User: "Add them to contacts"
Agent: [reads lastSearchResult]
       "Added Domino's Pizza (+1-604-555-1234) to your contacts"
```

---

## UI Changes

### AdminChatInterface.js Updates

1. **New confirmation types:**
```javascript
const CONFIRMATION_TYPES = {
  UPDATE_PROMPT: 'update_system_prompt',
  ADD_KNOWLEDGE: 'add_knowledge_source',
  CALL_CONTACT: 'call_contact',      // NEW
  SEND_SMS: 'send_sms',              // NEW
  ADD_CONTACT: 'add_contact'         // NEW
};
```

2. **Confirmation dialog content:**
```javascript
renderConfirmation(action) {
  switch(action.type) {
    case 'call_contact':
      return `Call ${action.name} at ${action.phone}?`;
    case 'send_sms':
      return `Send to ${action.recipient}: "${action.message}"?`;
    case 'add_contact':
      return `Add ${action.name} (${action.phone}) to contacts?`;
  }
}
```

3. **Action execution:**
```javascript
async executeAction(action) {
  switch(action.type) {
    case 'call_contact':
      // Navigate to phone page with dial param
      window.navigateTo(`/phone?dial=${encodeURIComponent(action.phone)}`);
      break;
    case 'send_sms':
      await this.sendSmsViaAgent(action);
      break;
    case 'add_contact':
      await this.addContactViaAgent(action);
      break;
  }
}
```

---

## API Keys Required

| Service | Purpose | Env Variable |
|---------|---------|--------------|
| Google Places | Business phone lookup | `GOOGLE_PLACES_API_KEY` |
| Tavily (alternative) | Web search | `TAVILY_API_KEY` |

---

## Security Considerations

1. **Caller ID validation** - Only allow user's own service_numbers
2. **Rate limiting** - Max 10 calls/SMS per minute via agent
3. **SMS compliance** - Check opt-out list before sending
4. **Phone format validation** - Normalize all numbers to E.164
5. **Confirmation required** - All actions require explicit user approval
6. **Audit logging** - Log all agent-initiated actions

---

## Database Changes

None required - uses existing tables:
- `contacts` - for contact management
- `call_records` - for call tracking
- `sms_messages` - for SMS tracking
- `admin_messages` - for conversation history

---

## Testing Plan

1. **Unit tests:**
   - Contact search/resolution
   - Phone number normalization
   - SMS compliance check

2. **Integration tests:**
   - "Call John" → finds contact → initiates call
   - "Text Sarah hello" → sends SMS
   - "Find Pizza Hut" → returns business info
   - "Add to contacts" → creates contact

3. **Voice mode tests:**
   - Same commands via voice input
   - Confirmation via voice ("yes"/"no")

---

## Implementation Order

1. **call_contact** function (highest value, reuses existing call system)
2. **send_sms** function (reuses existing SMS system)
3. **list_contacts** function (simple read operation)
4. **add_contact** function (simple write operation)
5. **search_business** function (requires new API integration)

---

## Estimated Effort

| Task | Complexity | Files |
|------|------------|-------|
| Add function definitions | Low | 1 |
| call_contact handler | Medium | 2 |
| send_sms handler | Medium | 2 |
| Confirmation UI updates | Low | 1 |
| search_business integration | Medium | 2 |
| add_contact handler | Low | 1 |
| Context management | Medium | 2 |
| Testing | Medium | - |

---

## Future Enhancements

- Voice confirmation ("Should I call them?" → "Yes")
- Scheduled calls/messages ("Call John tomorrow at 9am")
- Contact enrichment from search results
- Call history queries ("When did I last call John?")
- Voicemail transcription queries
