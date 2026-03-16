# Feature Specification: Magpipe Agent Skills Framework

**Feature Branch**: `007-magpipe-agent-skills`
**Created**: 2026-03-04
**Status**: Draft
**Input**: User description: "A system that allows AI agents to select, configure, and execute autonomous skills/jobs. Skills are reusable task templates that agents can activate on schedules or event triggers, with results delivered via Slack, email, SMS, push, CRM updates, webhooks, or voice calls."

---

## User Scenarios & Testing

### Primary User Story

A Magpipe user has one or more AI agents handling calls, texts, or web chats. They want those agents to do more than just talk — they want agents to autonomously perform background jobs like following up after calls, monitoring competitors, sending appointment reminders, and updating their CRM. The user browses a catalog of available skills, enables the ones they want per agent, configures each skill's settings (schedule, delivery channels, templates), and the system executes those skills automatically — returning results to the user via their preferred channels.

### Secondary User Stories

**The receptionist agent owner**: "After every call my agent handles, I want it to automatically send a follow-up SMS to the caller with a thank-you message and next steps. I want to customize the message template and choose how long after the call the SMS goes out."

**The sales team lead**: "I want my agent to monitor 5 competitor websites daily and send me a Slack digest every morning with any changes to their pricing, features, or blog posts."

**The clinic manager**: "I want my agent to call patients 24 hours before their appointments to confirm, and if they don't answer, fall back to an SMS reminder."

**The agency owner with multiple agents**: "I want to enable the same skill across 3 agents but with different configurations — different templates, different schedules, different delivery channels."

### Acceptance Scenarios

1. **Given** a user is on the agent detail page, **When** they navigate to the Skills tab, **Then** they see a catalog of available skills with descriptions, categories, and enable/disable toggles.

2. **Given** a user enables a skill for an agent, **When** they click configure, **Then** they see skill-specific settings (schedule, template, delivery channels, conditions) and can save them.

3. **Given** a skill is enabled and configured with a schedule trigger, **When** the scheduled time arrives, **Then** the system executes the skill, performs the defined actions, and delivers results to the configured channels.

4. **Given** a skill is enabled with an event trigger (e.g., "call ends"), **When** that event occurs for the agent, **Then** the skill executes automatically within the configured delay.

5. **Given** a skill has executed, **When** the user views the skill's execution history, **Then** they see a log of all runs with status (success/failed/pending), timestamps, and delivery receipts.

6. **Given** a skill execution fails, **When** the system retries, **Then** it attempts up to the configured retry limit and marks the execution as failed with an error message if all retries exhaust.

7. **Given** a user disables a skill, **When** the next trigger occurs, **Then** the skill does NOT execute and no pending executions are created.

8. **Given** a user has multiple agents, **When** they enable the same skill on two agents, **Then** each agent has independent configuration and execution history.

### Edge Cases

- What happens when a skill is triggered but the delivery channel is disconnected (e.g., Slack integration revoked)? The execution should be marked as failed with a descriptive error; user should be notified via a fallback channel if available.
- What happens when a scheduled skill overlaps with a previous execution still running? The new execution should queue and wait; never run duplicate concurrent executions of the same skill for the same agent.
- What happens when a user deletes an agent that has active skills? All associated skill configurations and pending executions should be cancelled and cleaned up.
- What happens when an event-triggered skill fires during a very short call (< 10 seconds, likely a hang-up)? Skills should support minimum duration/conditions to avoid false triggers.
- What happens when the skill's configured template references dynamic variables that weren't extracted during the call? The system should gracefully handle missing variables (use fallback text or skip the variable placeholder).

---

## Requirements

### Functional Requirements — Skill Registry

- **FR-001**: System MUST provide a catalog of built-in skills that users can browse, organized by category (Sales, Support, Operations, Marketing, Research).
- **FR-002**: Each skill in the catalog MUST display a name, description, category, supported triggers (schedule/event/on-demand), supported delivery channels, and required integrations.
- **FR-003**: System MUST clearly indicate when a skill requires an integration the user hasn't connected (e.g., "Requires Slack" with a connect link).
- **FR-004**: The initial catalog MUST include at minimum these built-in skills:
  - Post-Call Follow-Up (SMS/email after a call ends)
  - Appointment Reminder (outbound call/SMS before a calendar event)
  - Competitor Monitoring (scheduled web monitoring with digest delivery)
  - Daily News Digest (scheduled industry news summary)
  - Auto-CRM Update (push extracted call data to CRM after calls)
  - Social Media Monitoring (scheduled brand/keyword monitoring)
  - Review Request Campaign (scheduled outreach asking for reviews)

### Functional Requirements — Skill Configuration

- **FR-010**: Users MUST be able to enable or disable any skill per agent independently.
- **FR-011**: Each enabled skill MUST have agent-specific configuration that includes:
  - Trigger settings (schedule with cron-like options OR event type selection)
  - Delivery channel selection (one or more of: Slack, email, SMS, push, webhook, voice call)
  - Skill-specific parameters (varies by skill — templates, URLs to monitor, delays, conditions)
- **FR-012**: Schedule-triggered skills MUST support these intervals: every N hours, daily at a specific time, weekly on specific days, monthly on a specific date.
- **FR-013**: Event-triggered skills MUST support these events: call ends, call missed, message received, chat session ends, appointment created, appointment cancelled.
- **FR-014**: Event-triggered skills MUST support a configurable delay (e.g., "send follow-up 30 minutes after call ends").
- **FR-015**: Skills that use message templates MUST support dynamic variable interpolation from the agent's extracted data (dynamic variables), caller/contact info, and call/chat metadata.
- **FR-016**: Users MUST be able to test a skill manually (dry-run) to preview what it would do without sending anything to real recipients.
- **FR-017**: Skills that send outbound messages to contacts (SMS, email, voice call) MUST include a consent toggle in their configuration. The business owner is responsible for ensuring compliance with applicable regulations (TCPA, CASL, GDPR). Magpipe does not enforce or verify consent.

### Functional Requirements — Skill Execution

- **FR-020**: The system MUST execute skills automatically based on their configured triggers without user intervention.
- **FR-021**: Each skill execution MUST be logged with: execution ID, agent ID, skill type, trigger type, start time, end time, status (pending/running/completed/failed/cancelled), delivery results per channel, and error messages if failed.
- **FR-022**: Failed executions MUST be retried up to 3 times with exponential backoff.
- **FR-023**: Users MUST be able to view execution history for each skill, filterable by status and date range.
- **FR-024**: Users MUST be able to cancel pending executions.
- **FR-025**: The system MUST prevent duplicate concurrent executions of the same skill for the same agent and same triggering event.
- **FR-026**: Skill executions MUST respect the agent's active schedule (if the agent is off-hours, event-triggered skills should either queue for business hours or execute immediately based on skill configuration).

### Functional Requirements — Delivery

- **FR-030**: Skills MUST be able to deliver results to any combination of: Slack (specific channel), email (user's address or contact's address), SMS (to contact or to user), push notification, webhook (custom URL), outbound voice call.
- **FR-031**: Delivery to each channel MUST be logged with status (sent/delivered/failed) and timestamp.
- **FR-032**: If a delivery channel fails, the system MUST NOT block other channels from receiving their deliveries.
- **FR-033**: Slack deliveries MUST support rich formatting (bold, links, sections) appropriate to the skill's output.
- **FR-034**: Email deliveries MUST use branded templates consistent with existing Magpipe notification emails.

### Functional Requirements — UI

- **FR-040**: A new "Skills" tab MUST appear on the agent detail page, positioned between the existing "Functions" and "Notifications" tabs.
- **FR-041**: The Skills tab MUST show all available skills as cards with: skill name, category badge, brief description, enabled/disabled toggle, and a "Configure" button (when enabled).
- **FR-042**: Clicking "Configure" MUST open a modal with skill-specific settings organized into sections: Trigger, Delivery, and Parameters.
- **FR-043**: The Skills tab MUST include an "Execution History" section (or sub-tab) showing recent executions with status indicators.
- **FR-044**: Execution status MUST use clear visual indicators: green for completed, yellow for pending/running, red for failed.
- **FR-045**: Users MUST be able to access a combined execution log across all agents from a central location (e.g., the Analytics page or a new top-level "Skills" page).

### Key Entities

- **Skill Definition**: A reusable template stored as a database record describing what a skill does, its category, supported triggers, required integrations, configurable parameter schema, and execution logic reference. New skills can be added by inserting a record without redeploying the application.
- **Agent Skill**: A specific instance of a skill enabled on a particular agent, with that agent's configuration (schedule, channels, templates, conditions). Think of it as the "installation."
- **Skill Execution**: A single run of an agent skill — created when triggered, tracks progress through pending, running, completed, or failed. Stores delivery receipts and errors.
- **Execution Delivery**: A per-channel delivery attempt within an execution — tracks whether the Slack message was sent, the SMS was delivered, etc.

---

## Non-Functional Requirements

- **NFR-001**: Skill executions MUST complete within 60 seconds for simple skills (follow-up SMS, CRM update) and within 5 minutes for complex skills (competitor monitoring, research digests).
- **NFR-002**: The system MUST support at least 100 concurrent skill executions across all agents without degradation.
- **NFR-003**: Execution history MUST be retained for at least 90 days.
- **NFR-004**: The Skills tab MUST load within 2 seconds, even for agents with many enabled skills.
- **NFR-005**: Adding new built-in skills in the future MUST NOT require changes to the framework's core execution engine — skills should be self-describing and pluggable.

---

## Clarifications

### Session 2026-03-04
- Q: Are skills available to all users, or gated by subscription plan? → A: All users get all skills (no plan gating).
- Q: Should skill definitions be hardcoded in the application, or stored as data records? → A: Stored as data records in the database — new skills can be added by inserting a row.
- Q: How should contact consent be handled for outbound skills? → A: User responsibility — Magpipe provides a consent toggle per skill but the business owner is responsible for compliance.

---

## Constraints & Assumptions

- All skills are available to all users regardless of subscription plan — no plan-based gating or execution limits.
- Skills operate within the existing notification channel infrastructure — no new delivery channels are introduced.
- Skills that require third-party integrations (Slack, HubSpot, Cal.com) will only be available to users who have connected those integrations.
- The initial release focuses on built-in skills only. A custom skill builder (user-defined skills) and a skill marketplace are future phases.
- Voice-triggered skills (event: call ends) apply only to voice agents; message-triggered skills apply only to text/chat agents.
- Skills do not modify agent behavior during live conversations — they perform actions before or after interactions, not during them. (Mid-conversation actions remain the domain of Custom Functions.)

---

## Out of Scope (Future Phases)

- Custom skill builder (users define their own skills from scratch)
- Skill marketplace (sharing/selling skills between users)
- Multi-agent skill chains (one agent's skill output triggers another agent's skill)
- Conditional branching within skills (if/then logic within a single execution)
- Skill analytics dashboards with ROI tracking
- Agent-to-agent task delegation

---

## Dependencies & Assumptions

- Existing scheduled actions queue and cron infrastructure will be extended (not replaced).
- Existing notification services (email, SMS, Slack, push) will be reused for delivery.
- OAuth integrations (Slack, Cal.com, HubSpot, Gmail) are already functional and will be leveraged by skills that need them.
- The voice agent will need to emit events that trigger skills (e.g., "call ended" event with call metadata).

---

## Review & Acceptance Checklist

### Content Quality
- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

### Requirement Completeness
- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

---

## Execution Status

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked and resolved
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [x] Review checklist passed

---
