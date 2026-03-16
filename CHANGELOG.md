# Changelog

All notable changes to Magpipe are documented here.

## [2026-03-15] — WhatsApp findings doc

### Added
- `docs/whatsapp-findings.md` — comprehensive reference covering everything learned about WhatsApp Business API: account structure, token types, phone registration, template categories (UTILITY vs MARKETING silent-drop gotcha), variable format restrictions, component structure for sending, approved templates list, DB schema gotchas, and useful API calls

---

## [2026-03-15] — send-whatsapp-template docs: button component

### Changed
- `send-whatsapp-template` docs — added URL button component example with `sub_type` and `index` fields

---

## [2026-03-15] — send-whatsapp-template docs: template variables

### Changed
- `send-whatsapp-template` docs — `components` parameter now documents positional variable mapping (`{{1}}` → first parameter, etc.), body-only and header+body examples, and link to Meta's full component docs

---

## [2026-03-15] — send-whatsapp-template hardening + code review fixes

### Changed
- `send-whatsapp-template` — `template_name` is now required (no default); caller must supply their own approved Meta template name
- `send-whatsapp-template` — accepts optional `components` array passed through to Meta for variable substitution
- `send-whatsapp-template` docs — updated with `components` parameter, Meta guidelines link on all error responses
- Deploy tab — Assign button now hidden for non-phone agent types even when stale phone assignments are visible

### Fixed
- `send-whatsapp-template` — 405 Method Not Allowed response was missing CORS headers
- `create-call.mdx` — success response block now wrapped in `<ResponseExample>`

---

## [2026-03-15] — Mintlify API docs + WhatsApp template + Deploy tab fixes

### Fixed
- 4 Mintlify API endpoint docs (`send-sms`, `create-call`, `send-whatsapp-message`, `send-whatsapp-template`) were using `openapi:` + `<CodeGroup>` — breaking the "Try it" interactive playground. Fixed to `api:` + `<RequestExample>` + `<ResponseExample>`.
- `send-whatsapp-template` was passing `to` with leading `+` to Meta API — Meta accepted and returned a wamid but silently failed delivery. Fixed by stripping `+` before the Meta call.
- `send-whatsapp-template` default template changed from `site_report_opener` (MARKETING, silently dropped) to `site_report_start` (UTILITY, no opt-in required).
- Wrong `waba_id` stored for Site Super WhatsApp account (`2373552683145135` → `3026433170887493`) — template body fetch was returning empty, storing placeholder text in inbox.
- `+16043731833` incorrectly assigned to agent `d920763c` — unassigned from DB.
- Deploy tab `showPhone` computed before `assignedNumbers` — WhatsApp agents with stale phone assignments couldn't see or remove them. Fixed ordering so stale numbers are always visible.

---

## [2026-03-15] — WhatsApp template API + notification CORS fixes

### Added
- `send-whatsapp-template` edge function — API endpoint to send pre-approved WhatsApp template messages by agent_id
- Mint docs for `send-whatsapp-template` endpoint

### Fixed
- `send-notification-sms`, `send-notification-email`, `send-notification-push` — all responses missing CORS headers, causing "failure to fetch" on test notification buttons in the browser
- WhatsApp account assignment PATCH now shows error toast on failure instead of silently succeeding
- `assignWhatsAppAccount` now shows success/error toast and guards against silent PATCH failures

---

## [2026-03-15] — WhatsApp agent type + phone display fix

### Added
- WhatsApp as a selectable agent type in the Configure tab

### Fixed
- WhatsApp connected number displayed `++1 604-373-1965` (double `+`) — removed hardcoded `+` prefix since numbers are stored with `+` in DB
- "Insert template" button on WhatsApp agents now generates correct template copy instead of falling back to generic "handle communications"

---

## [2026-03-15]

### Added
- Call Whitelist feature: per-agent rules that blind-forward matching callers to a phone number, bypassing the AI entirely (still recorded and logged)
- Confirm modal before removing a whitelist entry
- `manage-call-whitelist` edge function: CRUD API for whitelist entries
- `whitelist-call-complete` edge function: SignalWire `<Dial action>` webhook that marks the call complete and dispatches notifications
- `call_whitelist` DB table with RLS (migration `20260314_call_whitelist.sql`)
- Skills tab UI: whitelist section with label / caller → forward-to / Remove row layout

### Fixed
- Whitelist callback URLs were broken on production (`api.magpipe.ai` domain) — call records would never be marked complete and notifications never fired
- `whitelist-call-complete`: UUID validation on `call_record_id` param prevents silent Postgres errors on malformed/missing values
- `webhook-inbound-call`: log and handle call record insert failure instead of passing `undefined` as `call_record_id`
- `manage-call-whitelist` DELETE: returns 404 when no row was matched instead of silently returning 200
- Fixed same broken `supabaseFunctionsUrl` regex on LiveKit recording path — `sip-recording-callback` was 404ing on production for all inbound calls
- `whitelist-call-complete`: log error if call record update fails instead of silently continuing
- Omit `call_record_id` param from recording/action callbacks when insert fails instead of passing empty string
- `manage-call-whitelist` POST validates `caller_number` and `forward_to` are E.164 format before inserting
- Validate `forward_to` from DB against E.164 before injecting into CXML to prevent CXML injection from pre-validation rows
- Warn log when inbound `from` number is not E.164 and no whitelist entry found (detects silent format-mismatch misroutes)
- `whitelist-call-complete`: fire notifications for 0-second answered calls (removed `durationSeconds > 0` guard)
- `call_whitelist.updated_at` now tracks actual updates via moddatetime trigger (migration `20260315_call_whitelist_updated_at.sql`)
- `manage-call-whitelist` GET validates `agent_id` is a UUID before hitting the DB; DELETE validates `id` is a UUID — prevents Postgres errors on malformed params
- `whitelist-call-complete` update scoped to `status='in-progress'` + `disposition='forwarding'` — prevents stomping unrelated call records if `call_record_id` is guessed or replayed
- Whitelist frontend: session null checks in `loadWhitelist`, `addWhitelistEntry`, `deleteWhitelistEntry` — shows error instead of crashing with a TypeError on expired sessions
- Whitelist frontend: client-side E.164 validation in `addWhitelistEntry` before sending to edge function
- `manage-call-whitelist` POST: UUID validation on `agent_id` from request body — returns 400 instead of leaking Postgres error detail on malformed input
- `whitelist-call-complete`: `formData()` wrapped in try/catch — logs error and returns `<Response/>` immediately if SignalWire sends non-form-encoded body, preventing call record from getting stuck in `in-progress`
- Deployed `manage-call-whitelist` edge function to production (was never deployed — all validation fixes were local only)
- Mint docs: `features/call-whitelist.mdx` feature page + 3 API endpoint docs (`list-whitelist-entries`, `add-whitelist-entry`, `delete-whitelist-entry`) added to `mint.json` navigation

## [2026-03-14] (31)

### Fixed
- Outbound calls now send email/SMS/push/Slack notifications on completion (previously `outbound-call-status` updated the DB record but never dispatched notifications)
- Recording URLs now appear in default `completed_call` email and SMS notification templates (previously only shown when a custom `content_config` was configured)
- `outbound-call-status` call record lookup changed to `.maybeSingle()` to handle initiated/ringing status callbacks gracefully when the call record hasn't been written yet
- Batch call recipients no longer trigger individual user notifications (previously every batch recipient completion would send an email/SMS)
- Email template no longer embeds unvalidated `recordingUrl` in `href` — URL must start with `https://`

## [2026-03-14] (30)

### Fixed
- Outbound calls now hang up correctly on `end_call`: agent CXML changed to `endConferenceOnExit=true` so deleting the LiveKit room cascades to hang up the PSTN callee

## [2026-03-14] (29)

### Fixed
- `end_call` for outbound calls now terminates PSTN leg before deleting LiveKit room; logs full SignalWire API response to diagnose failures

## [2026-03-14] (28)

### Fixed
- `end_call` now correctly terminates outbound calls: after deleting the LiveKit room, the PSTN leg is hung up via SignalWire API so the callee isn't left in a silent empty conference

## [2026-03-14] (27)

### Changed
- `update_agent` and `create_agent` MCP tools now support `max_tokens` parameter
- `update-agent` and `create-agent` edge functions now allow `max_tokens` field
- MCP server bumped to v0.2.1

## [2026-03-14] (26)

### Changed
- Agent search now matches on partial or full agent ID in addition to agent name

## [2026-03-13] (25)

### Fixed
- `get-call` API no longer exposes internal `_`-prefixed metadata keys (e.g. `_system_prompt_override`) in the response — these are stripped before returning to callers

## [2026-03-13] (24)

### Fixed
- Outbound call 3-5s greeting delay: TTS warmup `session.say(".")` now runs as a background task instead of blocking the PSTN poll loop — poll starts immediately so greeting fires the moment the callee answers
- PSTN poll interval reduced from 500ms to 200ms, cutting average detection latency from 250ms to 100ms
- `outbound_system_prompt` now reliably applied: stored in `call_records.metadata` as `_system_prompt_override` at call creation, read as fallback in agent.py fast path when room metadata is unavailable (race condition fix)

## [2026-03-13] (23)

### Fixed
- `activate-service-number` no longer deactivates all other numbers before activating the target — was a legacy single-number-per-user behaviour that silently killed all other active numbers for multi-number accounts

## [2026-03-13] (22)

### Fixed
- `assign-phone-number` now sets `is_active: true` on the number when assigning — previously assigning a number to an agent left it inactive if it was provisioned but not yet activated, causing calls to fail silently

## [2026-03-13] (21)

### Fixed
- Deployment tab now shows assigned numbers for agents assigned to a slot that doesn't match their agent type (e.g. an `inbound_voice` agent placed in the `outbound_agent_id` slot via the API) — `assignedNumbers` filter now checks all three slots instead of only the slot derived from agent type
- Detach button now clears the correct column regardless of agent type — passes the actual slot column via `data-column` attribute instead of re-deriving from agent type at click time

## [2026-03-13] (20)

### Fixed
- `outbound_agent_id` now included in both `service_numbers` SELECT queries (initial load + refresh) — outbound voice agents previously showed no assigned numbers and all numbers appeared available even if already assigned
- Active toggle guard now checks `outbound_agent_id` slot for `outbound_voice` agents (was always checking `agent_id`, so activating an outbound agent with a number assigned would incorrectly block with "no number" modal)

## [2026-03-13] (19)

### Added
- MCP server `assign_phone_number` tool — assign an existing number to an agent with optional channel override
- MCP server `initiate_call` tool now accepts `agent_id`, `outbound_system_prompt`, and `metadata` params

### Changed
- MCP server bumped to `0.2.0`

## [2026-03-13] (18)

### Added
- `POST /functions/v1/assign-phone-number` — API endpoint to assign an existing phone number to an agent; accepts `phone_number`, `agent_id`, optional `channel` ("inbound"/"outbound"/"sms"); auto-detects channel from agent type if omitted

## [2026-03-13] (17)

### Fixed
- "Buy a Number" provisioning now assigns to the correct column based on agent type — outbound voice agents get `outbound_agent_id`, text agents get `text_agent_id`; previously always wrote to `agent_id` (inbound)

## [2026-03-13] (16)

### Fixed
- Outbound voice agents can now be assigned phone numbers from the agent deployment tab — `outbound_voice` agent type now correctly writes to `outbound_agent_id` column instead of `agent_id` (inbound) in all 5 assignment paths (assign, detach, multi-assign, modal filter, render)

## [2026-03-13] (15)

### Added
- `initiate-bridged-call` now accepts `agent_id` in the request body — overrides the service_numbers dashboard assignment, enabling per-call agent selection without manual number-to-agent wiring
- `outbound_system_prompt` parameter in `initiate-bridged-call` — per-call system prompt override passed via LiveKit room metadata; agent.py uses it at highest priority for the call
- `metadata` parameter in `initiate-bridged-call` — stored on `call_records.metadata` JSONB for caller context
- `initiate-bridged-call` now pre-creates the LiveKit room with full metadata (user_id, agent_id, direction, contact_phone, service_number, system_prompt_override) so agent.py takes the fast path and picks up the correct agent immediately

### Fixed
- `initiate-bridged-call` returns `422 no_agent_assigned` when neither body `agent_id` nor service_numbers assignment resolves to a valid agent — previously the call would connect with no AI on the line
- `agent_id` stored on `call_records` at call creation time (was missing)

## [2026-03-13] (14)

### Fixed
- New agents now correctly default to `gpt-4.1-mini` — DB column default for `agent_configs.llm_model` was `'gpt-4.1'`, causing every new agent to be created with the full GPT-4.1 model instead of the recommended Mini

## [2026-03-13] (13)

### Fixed
- Notification poll loop no longer waits for `user_sentiment` (which is never written by agent.py) — break condition now requires only `call_summary` + recording URL (if recording enabled), so notifications send as soon as summary is ready rather than always waiting the full 60s

## [2026-03-13] (12)

### Added
- Agents page now has a search bar, type filter, status filter (Active/Inactive), and sort options (Name A–Z, Recently edited, Newest, etc.) — all client-side, default sort is Name A–Z

## [2026-03-13] (11)

### Fixed
- Recording URL now reliably included in SMS, email, and Slack notifications — extended poll window from 30s to 60s (12 × 5s attempts) and added fallback to check `recordings` JSONB array for a URL when `recording_url` column is not yet set (covers both LiveKit egress and SIP recording sync paths)

## [2026-03-13] (10)

### Added
- Content config ("Customize what's included") panel now shown for SMS/text agents on email, SMS, and Slack notification channels — previously only shown for voice agents
- Text agent content fields use context-appropriate labels: "Sender info", "Sender sentiment", "Message summary" (no "Recording URL" — not applicable to SMS conversations)

## [2026-03-13] (9)

### Fixed
- Outbound PSTN poll now uses `run_in_executor` to avoid blocking the LiveKit event loop during synchronous Supabase DB calls
- Poll now exits early when call status is `failed`/`busy`/`no-answer`/`canceled` — prevents 60s zombie sessions on unanswered outbound calls

## [2026-03-13] (8)

### Added
- `call_records.pstn_joined_at` timestamp — `batch-conf-status` stamps it when the PSTN callee answers (2 conference participants)
- Outbound voice agent now speaks greeting immediately when `pstn_joined_at` is detected (polls every 500ms) — eliminates 2-3s delay from waiting for callee speech + VAD + LLM response

## [2026-03-13] (7)

### Fixed
- `call_variables` substitution and `call_record_id_ref` now correctly populated on the fast path for outbound calls — fast path skipped the DB lookup where both were resolved, so `{{variable}}` placeholders were never substituted and custom function tools had no `session_id` during live calls

## [2026-03-13] (6)

### Fixed
- `NameError: call_record_id is not defined` in custom function tools — `create_custom_function_tool` now receives a `call_record_id_ref` mutable list (same pattern as `say_filler_ref`) so custom webhook calls correctly inject `session_id` into request params

## [2026-03-13] (5)

### Added
- `dynamic_variables` support in `initiate-bridged-call` — pass `{ key: value }` in the request body and `{{key}}` placeholders in the agent's system prompt are substituted at call time; values stored in new `call_records.call_variables` JSONB column

## [2026-03-13] (4)

### Fixed
- `webhook-call-status` notification polling now waits for `recording_url` even when `call_summary` and `user_sentiment` are already written — previously, fast agents that wrote summary/sentiment before the webhook fired would skip the polling loop entirely, causing `recording_url` to be missing from all notifications

## [2026-03-13] (3)

### Fixed
- Rachel voice ID (`21m00Tcm4TlvDq8ikWAM`) migrated to Sarah (`EXAVITQu4vr4xnSDxMaL`) for all 16 affected agents in DB — Rachel was removed from ElevenLabs, causing `voice_id_does_not_exist` errors that closed the TTS WebSocket
- `get_voice_config` in agent.py now explicitly detects deprecated voice IDs (Rachel) and falls back to Sarah, preventing silent failures if any stale ID slips through

## [2026-03-13] (2)

### Fixed
- Outbound calls: ElevenLabs TTS "connection closed" error on first response — `auto_mode=True` persistent WebSocket goes stale during ringing period; fixed by firing a `session.say(".")` warmup at session start (conference discards audio before PSTN callee joins)

## [2026-03-13]

### Added
- `list-voices` API endpoint now documented in API reference — returns all ElevenLabs and OpenAI voices plus cloned voices; supports `provider` and `include_builtin` filters
- `voice_id` param added to `create-agent` and `update-agent` API docs with full voice tables (9 ElevenLabs + 6 OpenAI)
- `gpt-4.1-mini` added to supported `llm_model` values in `update-agent` docs
- Recording URL field added to notification content config (`notification_preferences.content_config`)
- `recording_url` included in call notification payloads (SMS, email, push, Slack)

### Fixed
- Legacy Rachel voice (`21m00Tcm4TlvDq8ikWAM`) replaced with Sarah (`EXAVITQu4vr4xnSDxMaL`) as default — Rachel was a legacy ElevenLabs v1 voice that silently remapped to "kate" on accounts where it wasn't available
- Duplicate Sarah entry removed from `list-voices` built-in voice list
- Voice tables in API docs now match `list-voices` exactly (Elli, Arnold, Bill added; Brian, Daniel, Lily removed; `openai-fable` added)
- Matilda description corrected to "Warm" (was "Upbeat") to match list-voices

### Changed
- Turn detector switched from `EnglishModel` (v1.2.2-en) to `MultilingualModel` (v0.4.1-intl) — supports all languages, not just English

## [2026-03-12] (12)

### Fixed
- Duplicate call notifications (3× per call) — `webhook-call-status` was holding the SignalWire connection open for up to 30s while polling for summary/sentiment, causing SignalWire to retry the webhook. Notification work now runs via `EdgeRuntime.waitUntil()` so `200 OK` is returned to SignalWire immediately.

## [2026-03-12] (11)

### Fixed
- SMS/email/push notifications no longer missing summary and sentiment — `webhook-call-status` now polls up to 30s for `call_summary` and `user_sentiment` before sending, since agent.py writes them asynchronously after the call ends

## [2026-03-12] (10)

### Fixed
- ML turn detector (`EnglishModel`) now reliably loads on Render — root cause was `render.yaml` build command being ignored for existing services; build command must be set manually in Render dashboard
- Turn detector inference subprocess now finds model files — `HF_HOME=/opt/render/project/src/hf_cache` set both in Render dashboard env vars and via `os.environ.setdefault` in `agent.py` before any imports, so the subprocess inherits it
- Switched from `MultilingualModel` to `EnglishModel` (smaller, en-only) — multilingual ONNX file was too large to reliably download and load on Starter plan

### Changed
- Upgraded Render plan to Standard (2 GB RAM) — ONNX inference subprocess OOM'd on Starter (512 MB)
- `max_endpointing_delay` tightened further to 0.4s at full responsiveness (was 0.6s) — ML turn detector handles semantic pauses so silence fallback can be tighter
- Build command uses `snapshot_download('livekit/turn-detector', revision='v1.2.2-en')` — downloads entire revision including `onnx/` subdir reliably

## [2026-03-12] (5)

### Added
- Opening Line field restored to Prompt tab (`agent_configs.greeting`) — editable text the agent speaks when first picking up an inbound call
- Renaming the agent auto-updates the Opening Line if it contains the old name

## [2026-03-12] (4)

### Fixed
- ElevenLabs `VoiceSettings` (stability, similarity_boost, style, use_speaker_boost) were fetched from DB but never passed to the TTS constructor — voice personality settings now actually apply

### Changed
- ElevenLabs TTS `streaming_latency=3` — reduces time-to-first-audio chunk for lower perceived response delay

## [2026-03-12] (3)

### Changed
- Default LLM model changed from `gpt-4o-mini` to `gpt-4.1-mini` — better reasoning and lower latency for voice at ~2.7× the cost (still 3× cheaper than `gpt-4.1`)
- AI Model dropdown now shows `GPT-4.1 Mini (Recommended)` as the first option

## [2026-03-12] (2)

### Added
- ML turn detection via `livekit-plugins-turn-detector` (`MultilingualModel`) — agent now detects end-of-turn semantically rather than waiting for silence, significantly reducing response delay

### Changed
- `max_endpointing_delay` tightened from 3.0s–1.5s range to 1.2s–0.6s range — turn detector handles pause detection so the silence fallback no longer needs to be as wide

## [2026-03-12]

### Fixed
- Responsiveness and Interrupt Sensitivity sliders now actually affect the voice agent — both were saved to DB but previously ignored; they now drive endpointing delays and barge-in thresholds in real time
- Voice agent now introduces itself using the agent's configured name instead of the ElevenLabs voice name (Rachel, Josh, etc.) or the hardcoded fallback "Maggie"
- System agent detection now uses UUID only — name-based check (`"System - Not Assigned"`) removed to prevent false positives if a user named their agent that string
- Renaming an agent no longer wipes and replaces the system prompt — name changes now save silently; prompt only regenerates when "Regenerate Prompt" is clicked
- Outbound bridged calls no longer play greeting into an empty conference — agent now waits for customer to answer before speaking (SignalWire conferences don't buffer audio)

## [2026-03-11] (10)

### Fixed
- Admin status panel wider (300px) and no longer scrolls — all services visible at once

## [2026-03-11] (9)

### Fixed
- Anthropic missing from admin status panel — `admin-status` edge function now includes `checkAnthropic()` alongside OpenAI

## [2026-03-11] (8)

### Fixed
- Admin status modal now fetches fresh data on open — Anthropic and any new services appear immediately without waiting for the 5-minute background refresh
- Admin status modal no longer scrolls — removed `max-height` and `overflow` constraints so all services are visible at once

## [2026-03-11] (7)

### Added
- Anthropic added to status checks — visible in admin status modal and status.magpipe.ai
- Renamed "AI Engine" category to "OpenAI" for clarity

## [2026-03-11] (6)

### Fixed
- Vercel "Partial System Outage" (minor indicator) no longer marks status as degraded — only `critical` (down) or `major` (degraded) Vercel incidents are surfaced

## [2026-03-11] (5)

### Fixed
- Status modal no longer shows degraded/red for LiveKit regional node outages (e.g. Dubai node) — `public-status` now filters incidents that only affect `Node - *` components, which are edge nodes unrelated to core service availability

## [2026-03-11] (4)

### Fixed
- Contract tests now clean up `@example.com` auth users after each run via `afterAll` in `tests/setup.js` — prevents test user accumulation in production DB

## [2026-03-11] (3)

### Fixed
- Loading watchdog false alarms on `/admin` — `[class*="loading"]` selector was matching in-tab spinners (e.g. `support-loading`); now restricted to `.loading-screen` and `#loading-screen` only
- Excluded contract tests from default `npm test` run — they were creating real `@example.com` users in production auth on every test run without cleanup

## [2026-03-11] (2)

### Added
- Phone-based unsubscribe on status page — SMS subscribers can enter their phone number to unsubscribe directly without email

### Fixed
- Stuck outbound calls: `timeLimit=5400` (90 min) on both CXML legs prevents SignalWire 4-hour runaway
- `batch-conf-status` now closes `call_records` when conference empties (was a no-op before)
- Double billing race condition: UNIQUE INDEX on `credit_transactions(reference_id, transaction_type)` prevents duplicate deductions
- 57 pre-existing duplicate billing rows cleaned up, affected users refunded
- Status page flap dampening: requires 2 consecutive bad checks before notifying (prevents single-blip alerts)
- Status alert details deduplicated (e.g. "High latency; High latency" → "High latency")
- LiveKit latency measured with clean HEAD request (was inflated by incident feed fetch)
- Postmark errors silently swallowed in `status-subscribe` (now logged with HTTP status)

## [2026-03-11]

### Added
- `/support-reply` slash command — draft and send support ticket replies directly from Claude CLI via `support-tickets-api`
- `/update-docs-commit` slash command — update architecture.md and CHANGELOG.md with regression tests before committing
- Status page "Manage / unsubscribe" link — users can enter their email to receive an unsubscribe link
- `resend_unsubscribe` action in `status-subscribe` edge function
- `vocabulary` column on `agent_configs` table (was rendered in UI but missing from DB)
- Service role key bypass in `requireAdmin()` for internal/CLI calls to admin endpoints
- Configurable delivery content for notifications — users can choose which fields appear in SMS/email/Slack notifications (caller info, agent name, sentiment, session ID, summary) and add custom prepend text
- `content_config` JSONB column on `notification_preferences` table
- `build-notification-body.ts` shared helper for building notification bodies from `content_config`

### Fixed
- Vocabulary field not persisting (missing DB column)
- Null crash in `send-notification-sms` when skill execution runs with no user notification prefs
- Notification timestamps now use user's local timezone instead of UTC
- Scheduled skills now auto-create `scheduled_actions` rows on enable; counters fixed
- Skill execution credit deduction counter fixed

### Changed
- `webhook-call-status` now enriches notification data with `agentName`, `sessionId`, `summary`, and `sentiment`
- `send-notification-sms/email/slack` accept optional `content_config` per-request override
- `execute-skill` prepends `content_config.custom_text` to delivery messages per channel

## [2026-03-10]

### Added
- RLS enabled on `linkedin_oauth_state`, `linkedin_oauth_tokens`, `ip_geolocation` tables
- Dev process rules to prevent scope creep and silent regressions
- Error monitoring dashboard at `/admin?tab=error-monitoring`
- Loading screen watchdog for error monitoring

### Fixed
- Call durations showing 0 in inbox
- Inbox recordings missing (JSONB column dropped by column projection refactor)
- Cal.com skill booking flow
- Stale-cache chunk-load failures on deploy

### Changed
- Agent name no longer hardcoded to "Maggie" — uses actual configured agent name everywhere
