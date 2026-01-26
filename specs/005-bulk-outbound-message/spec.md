# Bulk Outbound Message Feature Specification

## Overview

Enhance the inbox new message functionality to support multiple message types including bulk messaging. When clicking the "+" new message button in the inbox, display a dropdown menu with messaging options.

## User Story

As a Pat user, I want to send bulk SMS messages to multiple contacts at once, so that I can efficiently communicate with groups of people without sending individual messages.

## Feature Components

### 1. Message Menu

When clicking the "+" button in the inbox header, show a dropdown menu with 4 options:

| Option | Description | Status |
|--------|-------------|--------|
| **Message** | Standard 1:1 SMS conversation | ✅ Complete |
| **Agent Message** | AI-assisted message composition | 🔨 Phase 2 (Current) |
| **Bulk Message** | Send same message to multiple contacts | Future |
| **Bulk Agent Message** | AI generates personalized messages for bulk send | Future |

### 2. UI/UX Design

#### Dropdown Menu

```
┌─────────────────────────────┐
│  Inbox                  [+] │  ← Click triggers dropdown
├─────────────────────────────┤
│  ┌───────────────────────┐  │
│  │ 💬 Message            │  │  ← Standard SMS ✅
│  ├───────────────────────┤  │
│  │ 🤖 Agent Message      │  │  ← AI-assisted (Phase 2)
│  ├───────────────────────┤  │
│  │ 👥 Bulk Message       │  │  ← Multi-recipient (Future)
│  ├───────────────────────┤  │
│  │ 👥 Bulk Agent Msg     │  │  ← AI + bulk (Future)
│  └───────────────────────┘  │
│                             │
│  [Conversation List...]     │
└─────────────────────────────┘
```

#### Dropdown Styling
- Position: Absolute, below the + button
- Background: var(--bg-primary)
- Border: 1px solid var(--border-color)
- Border-radius: var(--radius-md) or 8px
- Box-shadow: var(--shadow-lg)
- Z-index: 100 (above other content)
- Max-width: 220px

#### Menu Item Styling
- Padding: 0.75rem 1rem
- Hover: background var(--bg-secondary)
- Icon + Text layout with gap
- Disabled items: opacity 0.5, cursor not-allowed
- Coming soon badge for disabled items

### 3. Behavior

#### Dropdown Open/Close
- **Open**: Click on + button
- **Close**:
  - Click outside dropdown
  - Click on a menu item
  - Press Escape key

#### Menu Item Actions

| Item | Action |
|------|--------|
| New Message | Show phone number input modal (existing flow) |
| New Agent Message | (Future) Show agent message composer |
| Bulk Message | (Future) Show bulk message interface |
| Bulk Agent Message | (Future) Show bulk agent interface |

### 4. New Message Flow (Existing - Enhanced)

When "New Message" is selected:
1. Show a modal/inline input for recipient phone number
2. User enters phone number or selects from contacts
3. Open conversation thread for that number
4. Focus message input

### 5. Agent Message (Phase 2 - Current)

#### Overview
The Agent Message feature allows users to compose SMS messages with AI assistance. Users provide a prompt describing the intent/tone of the message, select a recipient, and the AI generates a draft message that can be edited before sending.

#### User Flow
1. User clicks "+" → selects "Agent Message" from dropdown
2. Agent Message interface appears with:
   - **To:** field (contact search + direct number entry)
   - **From:** field (service number selector)
   - **Prompt:** textarea for describing the message intent
   - **Generate** button
3. User enters recipient and prompt (e.g., "Follow up on our meeting, friendly tone")
4. User clicks "Generate" → AI creates draft message
5. Draft appears in editable message area
6. User can:
   - Edit the draft
   - Regenerate with same/different prompt
   - Send the message
   - Cancel

#### UI Design

```
┌─────────────────────────────────────────────────────────┐
│  To:    [Search contacts or enter number          ]     │
│  From:  [🇨🇦 +1 (604) 555-1234 ▾]                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Agent Prompt                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Describe what you want to say...                │   │
│  │                                                 │   │
│  │ Examples:                                       │   │
│  │ • "Follow up on yesterday's meeting"           │   │
│  │ • "Remind about appointment tomorrow at 2pm"   │   │
│  │ • "Thank them for their business, friendly"    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│                              [Generate Message]         │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  Generated Message                                      │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Hi! Just wanted to follow up on our meeting    │   │
│  │ yesterday. Let me know if you have any         │   │
│  │ questions or need anything else from me.       │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [↻ Regenerate]                           [Send ➤]     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

#### Prompt Field Features
- Placeholder with example prompts
- Support for context like:
  - Tone: friendly, professional, casual, urgent
  - Purpose: follow-up, reminder, thank you, inquiry
  - Personalization hints: mention specific topics
- Character limit guidance (SMS is 160 chars per segment)

#### AI Generation
- Use OpenAI API (GPT-4 or similar)
- System prompt includes:
  - User's agent configuration (if available)
  - Contact context (name, company, previous conversation summary)
  - SMS best practices (concise, clear, actionable)
- Generate message appropriate for SMS length
- Include option to see longer version if needed

#### Generated Message Area
- Editable textarea pre-filled with AI draft
- Character count with SMS segment indicator
- Edit freely before sending
- Regenerate button to get new version

#### Technical Implementation

**New Method: `showAgentMessageInterface()`**
```javascript
async showAgentMessageInterface() {
  // Similar to showMessageInterface() but with:
  // - Prompt textarea instead of direct message input
  // - Generate button that calls AI API
  // - Generated message display area
  // - Regenerate and Send buttons
}
```

**Edge Function: `generate-agent-message`**
```typescript
// Input
{
  prompt: string,           // User's intent description
  recipient_phone: string,  // For context lookup
  recipient_name?: string,  // Contact name if known
  conversation_history?: string[], // Recent messages for context
  user_id: string
}

// Output
{
  message: string,          // Generated SMS text
  character_count: number,
  segment_count: number
}
```

#### Success Criteria - Phase 2
- [ ] Agent Message option enabled in dropdown
- [ ] Agent Message interface with To/From/Prompt fields
- [ ] Contact search works in To field
- [ ] Generate button calls AI and displays draft
- [ ] Draft is editable
- [ ] Regenerate creates new draft
- [ ] Send delivers message via existing SMS infrastructure
- [ ] Character count and segment indicator shown

### 6. Future Features

#### Bulk Message
- Select multiple recipients (contacts or phone numbers)
- Compose single message
- Preview before sending
- Send to all recipients
- Track delivery status per recipient

#### Bulk Agent Message
- Select multiple recipients
- Provide context/intent
- AI generates personalized message for each recipient
- Review/approve before sending
- Bulk send with personalization

## Technical Implementation

### Phase 1: Dropdown Menu

#### Files to Modify
- `src/pages/inbox.js` - Add dropdown menu and event handlers

#### HTML Structure
```html
<!-- New Message Dropdown -->
<div id="new-message-dropdown" class="dropdown-menu" style="display: none;">
  <button class="dropdown-item" data-action="new-message">
    <svg>...</svg>
    <span>New Message</span>
  </button>
  <button class="dropdown-item disabled" data-action="new-agent-message">
    <svg>...</svg>
    <span>New Agent Message</span>
    <span class="badge">Soon</span>
  </button>
  <button class="dropdown-item disabled" data-action="bulk-message">
    <svg>...</svg>
    <span>Bulk Message</span>
    <span class="badge">Soon</span>
  </button>
  <button class="dropdown-item disabled" data-action="bulk-agent-message">
    <svg>...</svg>
    <span>Bulk Agent Message</span>
    <span class="badge">Soon</span>
  </button>
</div>
```

#### Event Handling
```javascript
// Toggle dropdown
newConvBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
});

// Close on outside click
document.addEventListener('click', () => {
  dropdown.style.display = 'none';
});

// Handle menu item clicks
dropdown.querySelectorAll('.dropdown-item:not(.disabled)').forEach(item => {
  item.addEventListener('click', (e) => {
    const action = e.target.dataset.action;
    handleNewMessageAction(action);
    dropdown.style.display = 'none';
  });
});
```

### Database Schema (Future - Bulk Messages)

```sql
-- Bulk message campaigns
CREATE TABLE bulk_message_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  name TEXT,
  message_template TEXT NOT NULL,
  is_agent_generated BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'draft', -- draft, sending, completed, failed
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Bulk message recipients
CREATE TABLE bulk_message_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES bulk_message_campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id),
  phone_number TEXT NOT NULL,
  personalized_message TEXT, -- For agent-generated messages
  status TEXT DEFAULT 'pending', -- pending, sent, delivered, failed
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Success Criteria

### Phase 1
- [ ] + button shows dropdown menu on click
- [ ] "New Message" option works (existing flow)
- [ ] Other options shown but disabled with "Soon" badge
- [ ] Dropdown closes on outside click
- [ ] Dropdown closes on Escape key
- [ ] Mobile-friendly dropdown positioning

### Future Phases
- [ ] Bulk message recipient selection
- [ ] Bulk message composition and preview
- [ ] Bulk send with progress tracking
- [ ] Agent message generation
- [ ] Bulk agent message with personalization

## Dependencies

- Existing contact list functionality
- SMS sending infrastructure (SignalWire)
- (Future) OpenAI API for agent messages

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| SMS rate limiting | Implement queued sending with delays |
| Carrier spam detection | Rate limit bulk sends, require opt-in |
| Cost control | Show estimated cost before bulk send |
| Delivery failures | Track per-recipient status, retry logic |

## Timeline

- **Phase 1**: Dropdown menu with Message ✅ Complete
- **Phase 2**: Agent Message (Current) 🔨
- **Phase 3**: Bulk Message
- **Phase 4**: Bulk Agent Message with personalization
