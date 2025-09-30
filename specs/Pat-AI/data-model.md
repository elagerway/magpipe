# Data Model: Pat AI Call & SMS Agent PWA

## Entity Relationship Diagram

```
┌─────────────────┐
│     users       │
├─────────────────┤
│ id (PK)         │
│ email           │──┐
│ name            │  │
│ phone_verified  │  │
│ phone_number    │  │
│ created_at      │  │
└─────────────────┘  │
                     │
        ┌────────────┴────────────┬─────────────────┬──────────────────┐
        │                         │                 │                  │
        ▼                         ▼                 ▼                  ▼
┌─────────────────┐    ┌──────────────────┐ ┌──────────────┐  ┌──────────────────┐
│    contacts     │    │  agent_configs   │ │ call_records │  │  sms_messages    │
├─────────────────┤    ├──────────────────┤ ├──────────────┤  ├──────────────────┤
│ id (PK)         │    │ id (PK)          │ │ id (PK)      │  │ id (PK)          │
│ user_id (FK)    │───┐│ user_id (FK)     │ │ user_id (FK) │  │ user_id (FK)     │
│ name            │   ││ voice            │ │ contact_id   │  │ contact_id (FK)  │
│ phone_number    │   ││ greeting         │ │ direction    │  │ direction        │
│ is_whitelisted  │   ││ vetting_criteria │ │ duration     │  │ content          │
│ notes           │   ││ transfer_prefs   │ │ disposition  │  │ sent_at          │
│ created_at      │   │└──────────────────┘ │ recording_url│  │ status           │
└─────────────────┘   │                     │ transcript   │  └──────────────────┘
                      │                     │ started_at   │
                      │                     │ ended_at     │
                      │                     └──────────────┘
                      │                              │
                      └──────────────────────────────┘
                                     │
                                     ▼
                         ┌────────────────────────┐
                         │ conversation_contexts  │
                         ├────────────────────────┤
                         │ id (PK)                │
                         │ contact_id (FK)        │
                         │ summary                │
                         │ key_topics             │
                         │ preferences            │
                         │ embedding (vector)     │
                         │ last_updated           │
                         └────────────────────────┘
```

## Entities

### users
Stores registered user accounts with authentication and phone information.

**Fields**:
- `id` (uuid, PK): Unique user identifier (Supabase auth.users.id)
- `email` (text, unique, not null): User's email address
- `name` (text, not null): User's display name
- `phone_verified` (boolean, default false): Whether phone number is verified
- `phone_number` (text, unique, nullable): User's verified phone number (E.164 format)
- `twilio_number` (text, unique, nullable): Assigned Twilio number for this user
- `created_at` (timestamptz, default now()): Account creation timestamp
- `updated_at` (timestamptz, default now()): Last update timestamp

**Validation Rules**:
- Email must be valid format (handled by Supabase Auth)
- Phone number must be E.164 format (e.g., +14155552671)
- Phone number unique constraint enforced only when not null

**Relationships**:
- One-to-many with contacts
- One-to-one with agent_configs
- One-to-many with call_records
- One-to-many with sms_messages

### contacts
Stores whitelisted contacts from user's phone contacts or manually added.

**Fields**:
- `id` (uuid, PK): Unique contact identifier
- `user_id` (uuid, FK, not null): References users(id)
- `name` (text, not null): Contact's name
- `phone_number` (text, not null): Contact's phone number (E.164 format)
- `is_whitelisted` (boolean, default true): Whether to bypass screening
- `notes` (text, nullable): User's notes about this contact
- `created_at` (timestamptz, default now()): When contact was added
- `updated_at` (timestamptz, default now()): Last update timestamp

**Validation Rules**:
- Phone number must be E.164 format
- Unique constraint on (user_id, phone_number) - no duplicate contacts per user
- Name must be non-empty string

**Relationships**:
- Many-to-one with users
- One-to-many with call_records
- One-to-many with sms_messages
- One-to-one with conversation_contexts

**Indexes**:
- Index on (user_id, phone_number) for fast contact lookup during inbound calls

### agent_configs
Stores user's customization of Pat's behavior. One config per user.

**Fields**:
- `id` (uuid, PK): Unique config identifier
- `user_id` (uuid, FK, unique, not null): References users(id)
- `voice` (text, default 'kate'): Voice identifier for TTS
- `greeting_template` (text, default 'Welcome {name}, my name is Pat...'): Customizable greeting
- `vetting_criteria` (jsonb, not null): Criteria for screening unknown callers
  ```json
  {
    "allow_emergencies": true,
    "require_name": true,
    "require_reason": true,
    "auto_transfer_keywords": ["urgent", "emergency"],
    "auto_reject_keywords": ["spam", "sales"]
  }
  ```
- `transfer_preferences` (jsonb, not null): When/how to transfer calls
  ```json
  {
    "always_transfer_whitelist": true,
    "transfer_on_request": true,
    "business_hours_only": false,
    "quiet_hours": {"start": "22:00", "end": "08:00"}
  }
  ```
- `response_style` (text, default 'professional'): Tone for responses (professional, casual, friendly)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

**Validation Rules**:
- Voice must be one of supported voices
- vetting_criteria must be valid JSON matching schema
- transfer_preferences must be valid JSON matching schema
- response_style must be one of: professional, casual, friendly

**Relationships**:
- One-to-one with users

### call_records
Stores all inbound phone call interactions.

**Fields**:
- `id` (uuid, PK): Unique call record identifier
- `user_id` (uuid, FK, not null): References users(id)
- `contact_id` (uuid, FK, nullable): References contacts(id) if caller recognized
- `caller_number` (text, not null): Caller's phone number (E.164)
- `direction` (text, default 'inbound'): Call direction (inbound/outbound)
- `duration` (integer, nullable): Call duration in seconds
- `disposition` (text, not null): Call outcome
  - 'answered_by_pat': Pat handled the call
  - 'transferred_to_user': Call transferred to user
  - 'screened_out': Unknown caller didn't pass screening
  - 'voicemail': Sent to voicemail
  - 'failed': Technical failure
- `recording_url` (text, nullable): URL to call recording in Supabase Storage
- `transcript` (text, nullable): Full call transcript
- `screening_notes` (text, nullable): Notes from screening process
- `started_at` (timestamptz, not null): When call started
- `ended_at` (timestamptz, nullable): When call ended
- `created_at` (timestamptz, default now())

**Validation Rules**:
- Caller number must be E.164 format
- Direction must be 'inbound' or 'outbound'
- Disposition must be one of allowed values
- Duration must be non-negative
- started_at must be before ended_at

**Relationships**:
- Many-to-one with users
- Many-to-one with contacts (nullable)

**Indexes**:
- Index on (user_id, started_at DESC) for history pagination
- Index on (contact_id) for contact call history

### sms_messages
Stores all SMS message exchanges.

**Fields**:
- `id` (uuid, PK): Unique message identifier
- `user_id` (uuid, FK, not null): References users(id)
- `contact_id` (uuid, FK, nullable): References contacts(id) if sender recognized
- `sender_number` (text, not null): Sender's phone number (E.164)
- `recipient_number` (text, not null): Recipient's phone number (E.164)
- `direction` (text, not null): 'inbound' or 'outbound'
- `content` (text, not null): Message content
- `status` (text, default 'sent'): Message status
  - 'sent': Successfully sent
  - 'delivered': Confirmed delivery
  - 'failed': Failed to send
  - 'pending': Awaiting send
- `sent_at` (timestamptz, not null): When message was sent
- `created_at` (timestamptz, default now())

**Validation Rules**:
- Sender and recipient must be E.164 format
- Direction must be 'inbound' or 'outbound'
- Status must be one of allowed values
- Content must be non-empty, max 1600 characters (SMS limit)

**Relationships**:
- Many-to-one with users
- Many-to-one with contacts (nullable)

**Indexes**:
- Index on (user_id, sent_at DESC) for history pagination
- Index on (contact_id, sent_at DESC) for conversation threads

### conversation_contexts
Stores accumulated knowledge about interactions with specific contacts for context retrieval.

**Fields**:
- `id` (uuid, PK): Unique context identifier
- `contact_id` (uuid, FK, unique, not null): References contacts(id)
- `summary` (text, not null): High-level summary of relationship and past interactions
- `key_topics` (text[], default []): Array of main discussion topics
- `preferences` (jsonb, default {}): Contact's preferences or important notes
  ```json
  {
    "preferred_contact_method": "sms",
    "time_zone": "America/Los_Angeles",
    "important_dates": ["2025-06-15"],
    "custom_notes": "Prefers brief responses"
  }
  ```
- `relationship_notes` (text, nullable): Notes about relationship (colleague, family, friend, etc.)
- `embedding` (vector(1536), nullable): Vector embedding of summary for semantic search (OpenAI ada-002)
- `interaction_count` (integer, default 0): Total number of calls + SMS
- `last_updated` (timestamptz, default now()): When context was last updated
- `created_at` (timestamptz, default now())

**Validation Rules**:
- Summary must be non-empty
- Embedding dimension must be 1536 (OpenAI ada-002 standard)
- interaction_count must be non-negative

**Relationships**:
- One-to-one with contacts

**Indexes**:
- Vector index on embedding for similarity search (IVFFlat or HNSW)
- Index on contact_id for fast lookup

## State Transitions

### User Account States
```
[Unregistered] → [Email Verification Pending] → [Email Verified] → [Phone Verification Pending] → [Fully Verified]
                                ↓                         ↓                         ↓                      ↓
                          [Registration]            [Login Enabled]         [Number Entry]        [Pat Configured]
```

### Call Record States
```
[Incoming Call] → [Pat Answers] → [Screening] → [Screened Out]
                        ↓              ↓
                  [Whitelisted]   [Passed Screen]
                        ↓              ↓
                  [Conversation]  [Transfer to User]
                        ↓              ↓
                  [Call Ended]   [Call Ended]
```

### SMS Message States
```
[Received] → [Contact Lookup] → [Generate Response] → [Sent] → [Delivered]
                    ↓                                      ↓
              [Context Retrieved]                    [Failed]
```

## Database Migrations

### Migration 001: Initial Schema
- Create users table (linked to Supabase auth.users)
- Create contacts table with phone number index
- Create agent_configs table
- Enable Row Level Security (RLS) on all tables

### Migration 002: Communication Tables
- Create call_records table
- Create sms_messages table
- Create indexes for pagination and filtering
- Add RLS policies for user data isolation

### Migration 003: Conversation Context
- Enable pgvector extension
- Create conversation_contexts table
- Create vector index on embedding column
- Add trigger to update interaction_count

### Migration 004: Optimizations
- Add composite indexes for common queries
- Add updated_at triggers for all tables
- Add check constraints for enums and validations

## Row Level Security Policies

All tables implement RLS to ensure users can only access their own data:

```sql
-- Users can only read/update their own record
CREATE POLICY users_policy ON users
  FOR ALL USING (auth.uid() = id);

-- Users can only access their own contacts
CREATE POLICY contacts_policy ON contacts
  FOR ALL USING (auth.uid() = user_id);

-- Users can only access their own call records
CREATE POLICY call_records_policy ON call_records
  FOR ALL USING (auth.uid() = user_id);

-- Users can only access their own SMS messages
CREATE POLICY sms_messages_policy ON sms_messages
  FOR ALL USING (auth.uid() = user_id);

-- Users can only access conversation contexts for their contacts
CREATE POLICY contexts_policy ON conversation_contexts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.id = conversation_contexts.contact_id
      AND contacts.user_id = auth.uid()
    )
  );
```

---

**Phase 1.1 Complete** - Data model defined with entities, relationships, validation, and security.