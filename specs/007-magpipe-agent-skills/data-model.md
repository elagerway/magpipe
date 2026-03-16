# Data Model: Magpipe Agent Skills Framework

**Date**: 2026-03-04 | **Branch**: `007-magpipe-agent-skills`

## Entity Relationship Diagram

```
skill_definitions (catalog)
  │
  │ 1:N
  ▼
agent_skills (per-agent config)
  │
  │ 1:N
  ▼
skill_executions (execution log)
```

Additional relationships:
- `agent_skills.agent_id` → `agent_configs.id`
- `agent_skills.user_id` → `auth.users.id`
- `skill_executions.call_record_id` → `call_records.id` (optional, for event-triggered skills)

---

## Table: `skill_definitions`

The skill catalog. Seeded with 7 built-in skills. New skills added by inserting rows.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | Unique identifier |
| `slug` | TEXT | UNIQUE, NOT NULL | Machine-readable identifier (e.g., `post_call_followup`) |
| `name` | TEXT | NOT NULL | Display name (e.g., "Post-Call Follow-Up") |
| `description` | TEXT | NOT NULL | Human-readable description shown in catalog |
| `category` | TEXT | NOT NULL, CHECK IN ('sales', 'support', 'operations', 'marketing', 'research') | Skill category for filtering |
| `icon` | TEXT | | Icon name or emoji for display |
| `supported_triggers` | JSONB | NOT NULL, DEFAULT '[]' | Array of trigger types: `["event", "schedule", "on_demand"]` |
| `supported_events` | JSONB | DEFAULT '[]' | Event types this skill responds to: `["call_ends", "call_missed", "message_received", "chat_session_ends"]` |
| `supported_channels` | JSONB | NOT NULL, DEFAULT '[]' | Delivery channels: `["sms", "email", "slack", "push", "webhook", "voice_call"]` |
| `required_integrations` | JSONB | DEFAULT '[]' | Integrations needed: `["slack", "hubspot", "cal_com"]` |
| `config_schema` | JSONB | NOT NULL | JSON Schema defining skill-specific configuration fields |
| `handler_id` | TEXT | NOT NULL | Identifier mapping to handler module (e.g., `post_call_followup`) |
| `agent_type_filter` | JSONB | DEFAULT '[]' | Which agent types can use this skill: `["inbound_voice", "outbound_voice", "text"]`. Empty = all. |
| `is_active` | BOOLEAN | DEFAULT true | Whether skill is available in catalog |
| `sort_order` | INTEGER | DEFAULT 0 | Display order within category |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | |

### Seed Data (7 Built-in Skills)

| slug | name | category | triggers | events | channels |
|------|------|----------|----------|--------|----------|
| `post_call_followup` | Post-Call Follow-Up | sales | event | call_ends | sms, email |
| `appointment_reminder` | Appointment Reminder | operations | schedule | — | voice_call, sms |
| `competitor_monitoring` | Competitor Monitoring | research | schedule | — | slack, email |
| `daily_news_digest` | Daily News Digest | research | schedule | — | slack, email |
| `auto_crm_update` | Auto-CRM Update | sales | event | call_ends | — (writes to CRM) |
| `social_media_monitoring` | Social Media Monitoring | marketing | schedule | — | slack, email |
| `review_request` | Review Request Campaign | marketing | schedule | — | sms, email |

### Config Schema Examples

**Post-Call Follow-Up** `config_schema`:
```json
{
  "type": "object",
  "properties": {
    "delay_minutes": { "type": "number", "default": 30, "title": "Delay after call (minutes)" },
    "message_template": { "type": "string", "title": "Message template", "default": "Hi {{caller_name}}, thank you for calling {{organization_name}}. {{custom_message}}" },
    "min_call_duration_seconds": { "type": "number", "default": 10, "title": "Minimum call duration (seconds)" },
    "consent_confirmed": { "type": "boolean", "default": false, "title": "I confirm contacts have consented to follow-up messages" }
  },
  "required": ["message_template", "consent_confirmed"]
}
```

**Competitor Monitoring** `config_schema`:
```json
{
  "type": "object",
  "properties": {
    "urls": { "type": "array", "items": { "type": "string" }, "title": "URLs to monitor", "maxItems": 10 },
    "check_for": { "type": "string", "enum": ["any_changes", "pricing_changes", "new_content", "all"], "default": "all", "title": "What to check for" },
    "digest_format": { "type": "string", "enum": ["summary", "detailed"], "default": "summary", "title": "Digest format" }
  },
  "required": ["urls"]
}
```

---

## Table: `agent_skills`

Per-agent skill configuration. Created when a user enables a skill for an agent.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | Unique identifier |
| `user_id` | UUID | FK → auth.users, NOT NULL | Owner |
| `agent_id` | UUID | FK → agent_configs(id) ON DELETE CASCADE, NOT NULL | Agent this skill is enabled on |
| `skill_definition_id` | UUID | FK → skill_definitions(id), NOT NULL | Which skill |
| `is_enabled` | BOOLEAN | DEFAULT true | Toggle on/off without losing config |
| `config` | JSONB | DEFAULT '{}' | Skill-specific config values (validated against `config_schema`) |
| `trigger_type` | TEXT | CHECK IN ('event', 'schedule', 'on_demand') | How this skill is triggered |
| `schedule_config` | JSONB | DEFAULT '{}' | For schedule triggers: `{ "interval": "daily", "time": "09:00", "timezone": "America/Vancouver", "days": ["mon","wed","fri"] }` |
| `event_config` | JSONB | DEFAULT '{}' | For event triggers: `{ "event_type": "call_ends", "delay_minutes": 30, "min_duration_seconds": 10 }` |
| `delivery_channels` | JSONB | DEFAULT '[]' | Array: `[{ "channel": "sms", "to": "contact" }, { "channel": "slack", "channel_name": "#sales" }]` |
| `last_executed_at` | TIMESTAMPTZ | | Timestamp of last successful execution |
| `execution_count` | INTEGER | DEFAULT 0 | Total successful executions |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | DEFAULT now() | |

**Unique constraint**: `UNIQUE(agent_id, skill_definition_id)` — one skill per agent.

### Schedule Config Examples

```json
// Every day at 9am Pacific
{ "interval": "daily", "time": "09:00", "timezone": "America/Vancouver" }

// Every Monday and Thursday at 8am
{ "interval": "weekly", "time": "08:00", "timezone": "America/Vancouver", "days": ["mon", "thu"] }

// Every 6 hours
{ "interval": "hours", "every": 6 }

// First of every month at 10am
{ "interval": "monthly", "day": 1, "time": "10:00", "timezone": "America/Vancouver" }
```

---

## Table: `skill_executions`

Execution log. One row per skill run, with embedded delivery results.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | Unique identifier |
| `user_id` | UUID | FK → auth.users, NOT NULL | Owner |
| `agent_id` | UUID | FK → agent_configs(id) ON DELETE CASCADE, NOT NULL | Agent that ran the skill |
| `agent_skill_id` | UUID | FK → agent_skills(id) ON DELETE CASCADE, NOT NULL | Specific skill config |
| `skill_definition_id` | UUID | FK → skill_definitions(id), NOT NULL | Denormalized for querying |
| `trigger_type` | TEXT | NOT NULL | 'event', 'schedule', 'on_demand', 'dry_run' |
| `trigger_context` | JSONB | DEFAULT '{}' | Event metadata: call_record_id, caller_phone, message_id, etc. |
| `status` | TEXT | NOT NULL, DEFAULT 'pending', CHECK IN ('pending', 'running', 'completed', 'failed', 'cancelled') | Execution status |
| `result` | JSONB | DEFAULT '{}' | Skill output (summary text, scraped data, CRM update result, etc.) |
| `deliveries` | JSONB | DEFAULT '[]' | Array of delivery attempts: `[{ "channel": "sms", "status": "sent", "to": "+1...", "sent_at": "..." }, { "channel": "slack", "status": "failed", "error": "..." }]` |
| `error_message` | TEXT | | Error details if status = 'failed' |
| `retry_count` | INTEGER | DEFAULT 0 | Number of retries attempted |
| `started_at` | TIMESTAMPTZ | | When execution began |
| `completed_at` | TIMESTAMPTZ | | When execution finished |
| `execution_time_ms` | INTEGER | | Duration in milliseconds |
| `created_at` | TIMESTAMPTZ | DEFAULT now() | |

### State Transitions

```
pending → running → completed
                  → failed (retry_count < 3 → pending again)
                  → failed (retry_count >= 3 → terminal)
pending → cancelled (user cancellation)
```

### Indexes

- `idx_skill_executions_agent_status` ON (agent_id, status) — for execution history queries
- `idx_skill_executions_agent_skill` ON (agent_skill_id, created_at DESC) — for per-skill history
- `idx_skill_executions_pending` ON (status) WHERE status = 'pending' — for retry processing

---

## RLS Policies

All three tables follow the same pattern:

**skill_definitions**: Read-only for authenticated users (catalog is global). Service role can INSERT/UPDATE for admin.

**agent_skills**: Users can CRUD only for agents they own (`agent_id IN (SELECT id FROM agent_configs WHERE user_id = auth.uid())`). Service role full access.

**skill_executions**: Users can SELECT/UPDATE (cancel) only for agents they own. INSERT by service role only (edge functions create executions). Service role full access.

---

## Extension to Existing Tables

### `scheduled_actions`

Add `'execute_skill'` to the `action_type` CHECK constraint:

```sql
ALTER TABLE scheduled_actions DROP CONSTRAINT scheduled_actions_action_type_check;
ALTER TABLE scheduled_actions ADD CONSTRAINT scheduled_actions_action_type_check
  CHECK (action_type IN ('send_sms', 'call_contact', 'execute_skill'));
```

When `action_type = 'execute_skill'`, the `parameters` JSONB contains:
```json
{
  "agent_skill_id": "uuid",
  "skill_definition_id": "uuid",
  "handler_id": "post_call_followup",
  "config": { ... },
  "trigger_context": { ... }
}
```

### No changes to:
- `agent_configs` — skills reference agents, not the other way around
- `notification_preferences` — skill delivery is configured in `agent_skills.delivery_channels`, not global prefs
- `call_records` — referenced by `skill_executions.trigger_context.call_record_id` but not modified
