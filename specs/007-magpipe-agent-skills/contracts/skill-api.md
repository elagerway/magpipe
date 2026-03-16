# API Contracts: Agent Skills Framework

**Date**: 2026-03-04 | **Branch**: `007-magpipe-agent-skills`

## Overview

Skills use a mix of direct Supabase client queries (for CRUD) and edge function calls (for execution). This follows the existing pattern where simple data operations go through the Supabase JS client and complex business logic goes through edge functions.

---

## 1. Skill Definitions (Read-Only via Supabase Client)

### List Available Skills
```
GET /rest/v1/skill_definitions?is_active=eq.true&order=category,sort_order
Authorization: Bearer <user_jwt>
```

**Response**: Array of skill definitions with full config_schema.

**Frontend call**:
```javascript
const { data: skills } = await supabase
  .from('skill_definitions')
  .select('*')
  .eq('is_active', true)
  .order('category')
  .order('sort_order')
```

---

## 2. Agent Skills (CRUD via Supabase Client)

### List Skills for Agent
```
GET /rest/v1/agent_skills?agent_id=eq.<agent_id>&select=*,skill_definitions(*)
Authorization: Bearer <user_jwt>
```

**Frontend call**:
```javascript
const { data: agentSkills } = await supabase
  .from('agent_skills')
  .select('*, skill_definitions(*)')
  .eq('agent_id', agentId)
```

### Enable Skill for Agent
```
POST /rest/v1/agent_skills
Authorization: Bearer <user_jwt>
Content-Type: application/json

{
  "agent_id": "uuid",
  "skill_definition_id": "uuid",
  "is_enabled": true,
  "trigger_type": "event",
  "config": {},
  "event_config": {},
  "schedule_config": {},
  "delivery_channels": []
}
```

### Update Skill Configuration
```
PATCH /rest/v1/agent_skills?id=eq.<id>
Authorization: Bearer <user_jwt>
Content-Type: application/json

{
  "config": { "delay_minutes": 15, "message_template": "..." },
  "delivery_channels": [{ "channel": "sms", "to": "contact" }],
  "is_enabled": true
}
```

### Disable/Delete Skill
```
PATCH /rest/v1/agent_skills?id=eq.<id>
{ "is_enabled": false }
```
or
```
DELETE /rest/v1/agent_skills?id=eq.<id>
```

---

## 3. Skill Execution (Edge Functions)

### Execute Skill (Primary Endpoint)

**Path**: `POST /functions/v1/execute-skill`
**Auth**: Service role (called by cron, voice agent, SMS webhooks — NOT by frontend directly)
**Deploy**: `--no-verify-jwt` (uses service role key in Authorization header)

**Request**:
```json
{
  "agent_skill_id": "uuid",
  "trigger_type": "event|schedule|on_demand|dry_run",
  "trigger_context": {
    "call_record_id": "uuid",
    "caller_phone": "+16045628647",
    "caller_name": "Erik",
    "call_duration_seconds": 245,
    "call_summary": "Customer inquired about pricing...",
    "extracted_data": { "budget": "$5000", "timeline": "Q2" },
    "transcript": "..."
  }
}
```

**Response (success)**:
```json
{
  "success": true,
  "execution_id": "uuid",
  "status": "completed",
  "result": {
    "summary": "Follow-up SMS sent to +16045628647",
    "actions_taken": ["sms_sent"]
  },
  "deliveries": [
    { "channel": "sms", "status": "sent", "to": "+16045628647" }
  ]
}
```

**Response (failure)**:
```json
{
  "success": false,
  "execution_id": "uuid",
  "status": "failed",
  "error": "Slack channel #sales not found"
}
```

**Response (dry_run)**:
```json
{
  "success": true,
  "execution_id": "uuid",
  "status": "completed",
  "dry_run": true,
  "result": {
    "preview": "Would send SMS to {{caller_phone}}: Hi {{caller_name}}, thank you for calling...",
    "channels": ["sms"],
    "template_resolved": "Hi Erik, thank you for calling Acme Corp..."
  }
}
```

### Execution Flow Inside Edge Function

```
1. Load agent_skill + skill_definition (join query)
2. Validate: is_enabled, trigger_type matches, conditions met
3. Create skill_executions row (status: 'pending')
4. Update status → 'running'
5. Import handler module by handler_id
6. Call handler.execute(context) → result
7. If dry_run: return preview without delivery
8. For each delivery_channel:
   - Call existing send-notification-* function
   - Record delivery status in executions.deliveries
9. Update status → 'completed' or 'failed'
10. Update agent_skills.last_executed_at and execution_count
```

---

## 4. Skill Execution History (Supabase Client)

### List Executions for Agent Skill
```javascript
const { data: executions } = await supabase
  .from('skill_executions')
  .select('*')
  .eq('agent_skill_id', agentSkillId)
  .order('created_at', { ascending: false })
  .limit(50)
```

### List All Executions for Agent
```javascript
const { data: executions } = await supabase
  .from('skill_executions')
  .select('*, skill_definitions(name, icon)')
  .eq('agent_id', agentId)
  .order('created_at', { ascending: false })
  .limit(100)
```

### Cancel Pending Execution
```javascript
await supabase
  .from('skill_executions')
  .update({ status: 'cancelled' })
  .eq('id', executionId)
  .eq('status', 'pending')
```

---

## 5. Dry Run / Test Skill (Frontend → Edge Function)

**Path**: `POST /functions/v1/execute-skill`
**Auth**: User JWT (allowed for dry_run only)

```javascript
const { data } = await supabase.functions.invoke('execute-skill', {
  body: {
    agent_skill_id: skillId,
    trigger_type: 'dry_run',
    trigger_context: {
      // Sample data for preview
      caller_phone: '+10005551234',
      caller_name: 'Test Contact',
      call_duration_seconds: 120
    }
  }
})
```

---

## 6. Process Scheduled Skills (Extension to Existing Cron)

The existing `process-scheduled-actions` edge function handles the new `execute_skill` action type:

```typescript
// In process-scheduled-actions/index.ts
if (action.action_type === 'execute_skill') {
  const response = await fetch(`${supabaseUrl}/functions/v1/execute-skill`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`
    },
    body: JSON.stringify({
      agent_skill_id: action.parameters.agent_skill_id,
      trigger_type: 'schedule',
      trigger_context: action.parameters.trigger_context || {}
    })
  })
}
```

### Schedule Registration

When a user enables a schedule-triggered skill, the frontend (or a database trigger) creates a `scheduled_actions` row:

```sql
INSERT INTO scheduled_actions (user_id, action_type, scheduled_at, parameters, created_via)
VALUES (
  user_id,
  'execute_skill',
  next_scheduled_time,
  '{ "agent_skill_id": "...", "handler_id": "competitor_monitoring" }',
  'ui'
);
```

After each successful schedule execution, the system creates the NEXT scheduled_actions row based on the interval config.

---

## 7. Voice Agent Event Dispatch (Python → Edge Function)

In `agent.py`, after call ends:

```python
async def trigger_event_skills(call_context: dict):
    """Trigger event-based skills for this agent after a call ends."""
    response = await http_client.post(
        f"{SUPABASE_URL}/functions/v1/execute-skill",
        headers={"Authorization": f"Bearer {SERVICE_ROLE_KEY}"},
        json={
            "event_type": "call_ends",
            "agent_id": call_context["agent_id"],
            "trigger_context": {
                "call_record_id": call_context["call_record_id"],
                "caller_phone": call_context["caller_phone"],
                "caller_name": call_context.get("caller_name"),
                "call_duration_seconds": call_context["duration"],
                "call_summary": call_context.get("summary"),
                "extracted_data": call_context.get("extracted_data", {}),
            }
        }
    )
```

The `execute-skill` edge function, when receiving `event_type` instead of `agent_skill_id`, queries for all enabled skills on that agent with matching event triggers and executes each one.
