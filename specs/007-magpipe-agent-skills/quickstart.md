# Quickstart: Agent Skills Framework

**Date**: 2026-03-04 | **Branch**: `007-magpipe-agent-skills`

This guide validates the skills framework end-to-end. Each step should work independently.

---

## Step 1: Verify Skill Catalog Loads

1. Navigate to any agent detail page: `https://magpipe.ai/agents/<agent-id>`
2. Click the **Skills** tab
3. **Expected**: See 7 skill cards organized by category, each with name, description, and enable toggle
4. **Expected**: Skills that require unconnected integrations show a "Requires [Integration]" badge

## Step 2: Enable and Configure Post-Call Follow-Up

1. On the Skills tab, toggle **Post-Call Follow-Up** to ON
2. Click **Configure**
3. **Expected**: Modal opens with sections:
   - **Trigger**: Event type = "Call ends", Delay = 30 minutes, Min duration = 10 seconds
   - **Delivery**: SMS to contact (toggle), Email to contact (toggle)
   - **Parameters**: Message template with `{{caller_name}}`, `{{organization_name}}` variables
   - **Consent**: Checkbox "I confirm contacts have consented"
4. Set delay to 15 minutes, customize the message template, enable SMS delivery
5. Click **Save**
6. **Expected**: Toast notification "Skill configured successfully"

## Step 3: Test Skill (Dry Run)

1. On the configured Post-Call Follow-Up skill card, click **Test**
2. **Expected**: Preview appears showing:
   - Resolved template with sample data ("Hi Test Contact, thank you for calling...")
   - Delivery channel: SMS
   - Note: "This is a preview — no messages will be sent"
3. **Expected**: No actual SMS is sent

## Step 4: Trigger Skill via Call

1. Place a test call to the agent (duration > 10 seconds)
2. Wait 15 minutes (configured delay)
3. **Expected**: Follow-up SMS is sent to the caller's phone number
4. Navigate to Skills tab → **Execution History**
5. **Expected**: See execution entry with:
   - Status: Completed (green)
   - Trigger: Event (call_ends)
   - Delivery: SMS sent
   - Timestamp

## Step 5: Enable Schedule-Based Skill

1. Toggle **Competitor Monitoring** to ON
2. Click Configure
3. Add 2-3 competitor URLs
4. Set schedule: Daily at 9:00 AM
5. Select Slack delivery → choose channel
6. Save
7. **Expected**: Skill appears as "Enabled — Daily at 9:00 AM" on the card

## Step 6: View Execution History

1. On Skills tab, scroll to **Execution History** section
2. **Expected**: See all recent executions across all skills for this agent
3. Filter by status (completed/failed/pending)
4. **Expected**: Each entry shows skill name, trigger type, status badge, timestamp
5. Click an entry to expand delivery details

## Step 7: Disable Skill

1. Toggle Post-Call Follow-Up to OFF
2. Place another test call
3. **Expected**: No follow-up SMS is sent after the call
4. **Expected**: No new execution entry appears in history

## Step 8: Cancel Pending Execution

1. Enable a skill and trigger it (but with a long delay, e.g., 60 minutes)
2. In Execution History, find the pending execution
3. Click **Cancel**
4. **Expected**: Status changes to "Cancelled"
5. **Expected**: No delivery occurs

---

## Validation Checklist

- [ ] Skill catalog renders all 7 skills with correct categories
- [ ] Skills can be enabled/disabled per agent independently
- [ ] Configuration modal saves and persists settings
- [ ] Dry run shows preview without sending real messages
- [ ] Event-triggered skill fires after call ends (with configured delay)
- [ ] Schedule-triggered skill fires at configured time
- [ ] Execution history shows all runs with correct status
- [ ] Failed executions show error messages
- [ ] Pending executions can be cancelled
- [ ] Multiple agents can have the same skill with different configs
- [ ] Skills requiring unconnected integrations show appropriate warnings
- [ ] Consent toggle is present on outbound skills
