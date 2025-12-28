# Bulk Outbound Message Feature Specification

## Overview

Enhance the inbox new message functionality to support multiple message types including bulk messaging. When clicking the "+" new message button in the inbox, display a dropdown menu with messaging options.

## User Story

As a Pat user, I want to send bulk SMS messages to multiple contacts at once, so that I can efficiently communicate with groups of people without sending individual messages.

## Feature Components

### 1. New Message Menu (Phase 1 - Current)

When clicking the "+" button in the inbox header, show a dropdown menu with 4 options:

| Option | Description | Status |
|--------|-------------|--------|
| **New Message** | Standard 1:1 SMS conversation (existing behavior) | Implement Now |
| **New Agent Message** | AI-assisted message composition | Future |
| **Bulk Message** | Send same message to multiple contacts | Future |
| **Bulk Agent Message** | AI generates personalized messages for bulk send | Future |

### 2. UI/UX Design

#### Dropdown Menu

```
┌─────────────────────────────┐
│  Inbox                  [+] │  ← Click triggers dropdown
├─────────────────────────────┤
│  ┌───────────────────────┐  │
│  │ 💬 New Message        │  │  ← Standard SMS
│  ├───────────────────────┤  │
│  │ 🤖 New Agent Message  │  │  ← AI-assisted (disabled)
│  ├───────────────────────┤  │
│  │ 📢 Bulk Message       │  │  ← Multi-recipient (disabled)
│  ├───────────────────────┤  │
│  │ 🤖📢 Bulk Agent Msg   │  │  ← AI + bulk (disabled)
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

### 5. Future Features (Not in Phase 1)

#### New Agent Message
- AI composes message based on context
- User can edit before sending
- Suggested responses based on conversation history

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

- **Phase 1**: Dropdown menu with New Message (Current sprint)
- **Phase 2**: Bulk Message basic functionality
- **Phase 3**: Agent Message integration
- **Phase 4**: Bulk Agent Message with personalization
