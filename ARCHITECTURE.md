# Magpipe — Complete Technical Reference

## Stack Overview

| Layer | Technology | Hosting |
|-------|-----------|---------|
| Frontend | Vanilla JS ES6+, Vite, CSS3 | Vercel (auto-deploy master) |
| Backend | TypeScript (Supabase Edge Functions) | Supabase Cloud |
| Voice Agent | Python 3.11 (LiveKit agent) | Render (auto-deploy master) |
| Database | PostgreSQL + pgvector | Supabase Cloud |
| Telephony | SignalWire (PSTN + SMS) | SignalWire Cloud |
| Voice AI | LiveKit Cloud + ElevenLabs TTS + Deepgram STT | LiveKit Cloud |
| Email | Postmark | Postmark Cloud |
| Payments | Stripe | Stripe Cloud |
| MCP Server | TypeScript (`@modelcontextprotocol/sdk`) | npm (stdio) |

---

## Packages

| Package | Path | Purpose |
|---------|------|---------|
| `magpipe-mcp-server` | `packages/mcp-server/` | MCP server — exposes Magpipe API as tools for AI coding assistants (Claude Code, Cursor, etc.) |

---

## Frontend Pages

### Public (no auth)

| Route | File | Purpose | Edge Functions Called |
|-------|------|---------|---------------------|
| `/` | `home.js` | Landing page with hero | None |
| `/login` | `login.js` | OAuth (Google/Apple/MS) + email/password | None |
| `/signup` | `signup.js` | Registration + team invite handling | `notify-signup` |
| `/pricing` | `pricing.js` | Interactive pricing calculator | None |
| `/custom-plan` | `custom-plan.js` | Enterprise inquiry form | `send-custom-plan-inquiry` |
| `/forgot-password` | `forgot-password.js` | Password reset request | `send-password-reset` |
| `/reset-password` | `reset-password.js` | Set new password | None |
| `/verify-email` | `verify-email.js` | Email OTP verification | None |
| `/impersonate` | `impersonate.js` | Admin impersonation entry | `admin-consume-impersonation` |
| `/privacy` | `privacy.js` | Privacy policy (static) | None |
| `/terms` | `terms.js` | Terms of service (static) | None |
| `/blog` | `blog/BlogListPage.js` | Blog post listing (card grid) | `blog_posts` (published) |
| `/blog/:slug` | `blog/BlogPage.js` | Single blog post (article) | `blog_posts` (published) |
| `/compare/:slug` | `compare/ComparePage.js` | Competitor comparison page | None (static data) |
| `/best/:slug` | `best/BestPage.js` | "Best AI for X" listicle page | None (static data) |
| `/industries/:slug` | `landing/LandingPage.js` | Industry landing page | None (static data) |
| `/use-cases/:slug` | `landing/LandingPage.js` | Use case landing page | None (static data) |

### Protected (auth required)

| Route | File | Purpose | DB Tables | Edge Functions |
|-------|------|---------|-----------|----------------|
| Route | File | Purpose | DB Tables | Edge Functions |
|-------|------|---------|-----------|----------------|
| `/inbox` | `inbox/index.js` | Main messaging UI — SMS, calls, chat, email. Email filter pill, email threads grouped by thread_id, email thread view with reply, compose with WYSIWYG toolbar, Email/Agent Email options in new message dropdown. Real-time subscriptions. Split into `call-interface.js`, `listeners.js`, `messaging.js`, `views.js`, `voice-loader.js` | `sms_messages`, `call_records`, `chat_sessions`, `contacts`, `service_numbers`, `agent_configs`, `email_messages` | `send-email` (real-time subs) |
| `/agent` | `agent.js` | Admin chat interface for AI agent | `sms_messages` | None |
| `/agents` | `agents.js` | Multi-agent list with type-selection creation modal (5 types: inbound_voice, outbound_voice, text, email, chat_widget) | `agent_configs`, `service_numbers` | None |
| `/agents/:id` | `agent-detail/index.js` | Agent config detail. Split into `configure-tab.js`, `prompt-tab.js`, `functions-tab.js`, `knowledge-tab.js`, `memory-tab.js`, `notifications-tab.js`, `analytics-tab.js`, `deployment-tab.js`, `schedule-tab.js`, `modals.js`, `styles.js` | `agent_configs`, `service_numbers`, `knowledge_sources`, `dynamic_variables`, `custom_functions`, `transfer_numbers`, `notification_preferences` | `preview-voice`, `clone-voice`, `fetch-agent-avatar` |
| `/phone` | `phone/index.js` | Phone number management. Split into `call-handler.js`, `dialpad.js`, `number-management.js` | `service_numbers`, `external_sip_numbers`, `agent_configs` | `cancel-number-deletion`, `submit-cnam-request`, `fix-number-capabilities`, `sync-external-capabilities` |
| `/contacts` | `contacts.js` | Contact list with CSV import | `contacts` | `contact-lookup` |
| `/calls` | `calls.js` | Call history | `call_records` | None |
| `/messages` | `messages.js` | SMS history | `sms_messages` | None |
| `/knowledge` | `knowledge.js` | Knowledge base management | `knowledge_sources`, `knowledge_chunks` | `knowledge-source-add`, `knowledge-source-delete`, `knowledge-source-sync`, `knowledge-source-manual` |
| `/apps` | `apps.js` | Integrations & MCP servers | `user_integrations`, `mcp_servers`, `user_mcp_configs` | `integration-oauth-start`, `mcp-catalog-refresh`, `mcp-test-connection` |
| `/analytics` | `analytics.js` | Org-wide analytics dashboard | None directly | `org-analytics` |
| `/settings` | `settings.js` | Profile, Billing, Branding, API | `users`, `service_numbers`, `organizations`, `user_integrations` | Stripe functions, Cal.com functions, `integration-oauth-start` |
| `/team` | `team.js` | Team member management | `organization_members`, `organizations` | `send-team-invitation` |
| `/select-number` | `select-number.js` | Phone number purchase | `service_numbers` | `search-phone-numbers`, `provision-phone-number` |
| `/manage-numbers` | `manage-numbers.js` | Number management (mobile) | `service_numbers`, `numbers_to_delete`, `agent_configs` | `queue-number-deletion`, `cancel-number-deletion`, `configure-signalwire-number`, `fix-number-capabilities` |
| `/bulk-calling` | `bulk-calling.js` | Outbound bulk calling (legacy) | `service_numbers`, `contacts` | None (legacy) |
| `/batch-calls` | `batch-calls.js` | Batch outbound calls — CSV upload, scheduling, concurrency, real-time status via Supabase Realtime, conference bridge calling, recurring batches (hourly/daily/weekly/monthly with parent-child model) | `batch_calls`, `batch_call_recipients`, `service_numbers`, `agent_configs` | `batch-calls`, `process-batch-calls`, `batch-call-cxml` |
| `/verify-phone` | `verify-phone.js` | Phone verification OTP | `users`, `service_numbers` | `verify-phone-send`, `verify-phone-check` |
| `/agent-config` | `agent-config.js` | Legacy global agent config | `agent_configs`, `outbound_templates` | `fetch-agent-avatar`, `preview-voice`, `clone-voice` |
| `/chat-widget/:id` | `chat-widget-settings.js` | Chat widget config | `chat_widgets` | None |

### Admin (requires admin/support/god role)

| Route | File | Purpose |
|-------|------|---------|
| `/admin` | `admin/index.js` | Admin portal — split into tab modules. Tabs: Support (default), Analytics, KPIs, Notifications, Marketing |

Admin tab modules in `src/pages/admin/`:
- `support-tab.js` — Support tickets (real-time thread updates via Supabase subscriptions), Users, Global Agent, Chat, Settings (sub-tabs)
- `analytics-tab.js` — Usage analytics dashboard
- `kpi-tab.js` — KPI/metrics display
- `notifications-tab.js` — Notification channel settings (SMS, email, Slack)
- `marketing-tab.js` — Blog, Directories, Reviews, Monitor (sub-tabs)
- `blog-tab.js` — Blog post CRUD with Quill.js WYSIWYG editor
- `directories-tab.js` — Directory submission tracking
- `reviews-tab.js` — Review collection automation (G2, Capterra, Product Hunt)
- `monitor-tab.js` — Social listening: keyword monitoring across Reddit, HackerNews, Google (via Serper.dev). Favorites, search, pagination, status tracking
- `users-tab.js` — User management, impersonation, number assignment
- `global-agent-tab.js` — Global agent configuration
- `chat-tab.js` — Admin omni-chat interface
- `styles.js` — Centralized admin CSS

Admin calls many edge functions: `admin-list-users`, `admin-get-user`, `admin-update-user`, `admin-impersonate`, `admin-manage-numbers`, `admin-analytics`, `admin-status`, `admin-agent-chat`, `admin-notifications-api`, `admin-blog-api`, `support-tickets-api`, etc.

---

## Components

| File | Purpose | DB/API Dependency |
|------|---------|-------------------|
| `BottomNav.js` | Mobile bottom nav with unread badges | `sms_messages`, `call_records` |
| `AdminChatInterface.js` | Admin AI chat (agent page) | Multiple tables + edge functions |
| `OmniChatInterface.js` | Omni-channel chat | Multiple tables + edge functions |
| `AdminHeader.js` | Admin portal header | None |
| `AgentCard.js` | Agent card in grid (type-specific color badges for 5 agent types) | None |
| `PublicHeader.js` | Public page header | None |
| `PublicFooter.js` | Public page footer | None |
| `ConfirmModal.js` | Custom confirm dialog | None |
| `ImpersonationBanner.js` | Admin impersonation banner | None |
| `LowBalanceBanner.js` | Low balance warning banner (at $1) | `users` |
| `VoiceToggle.js` | Voice mode toggle | None |
| `KnowledgeSourceManager.js` | KB source CRUD | `knowledge_sources` + edge functions |
| `AccessCodeSettings.js` | Access code config | `access_codes` |
| `ExternalTrunkSettings.js` | External SIP trunk config | `external_sip_numbers` + edge functions |
| `IntegrationSettings.js` | OAuth integration config | `user_integrations` + `integration-oauth-start` |
| `McpServerCatalog.js` | MCP server browser | `mcp_servers`, `user_mcp_configs` |
| `AddCustomMcpServer.js` | Custom MCP server form | `user_mcp_configs` + `mcp-test-connection` |
| `OutboundTemplateModal.js` | Outbound call template editor | `outbound_templates` |

---

## Models (`src/models/`)

| Model | Table(s) | Key Methods |
|-------|----------|-------------|
| `User.js` | `users`, `organizations` | getProfile, updateProfile, setServiceNumber, updatePassword |
| `AgentConfig.js` | `agent_configs` | getAllByUserId, getById, createAgent, updateById, deleteAgent, getDefaultPromptForType (5 type-specific prompt generators) |
| `CallRecord.js` | `call_records` | getAll, getById, create, update, delete |
| `Contact.js` | `contacts` | getAll, getById, create, update, delete, bulkCreate |
| `SmsMessage.js` | `sms_messages` | getConversations, getThread, create, update |
| `ChatSession.js` | `chat_sessions` | create, getById, update |
| `ChatWidget.js` | `chat_widgets` | getByUserId, create, update, getPortalWidget, getGlobalPortalWidget |
| `Organization.js` | `organizations`, `organization_members` | getForUser, create, update, addMember |
| `OrganizationMember.js` | `organization_members` | getByToken, create, update, delete |
| `OutboundTemplate.js` | `outbound_templates` | getAllByUserId, create, update, delete |
| `CustomFunction.js` | `custom_functions` | CRUD |
| `ConversationContext.js` | `conversation_contexts` | CRUD |
| `SemanticMatchAction.js` | `semantic_match_actions` | CRUD |

---

## Services (`src/services/`)

| Service | Purpose | External Dependencies |
|---------|---------|----------------------|
| `pushNotifications.js` | PWA push notifications | `push-subscribe`, `push-send-notification` edge functions |
| `mcpClient.js` | MCP tool execution | `mcp-execute`, `mcp-list-tools`, `mcp-test-connection` |
| `planService.js` | Plan limit checks | `users` table |
| `accessCodeService.js` | Access code validation | `access_codes` table |
| `ttsService.js` | Client-side TTS | Browser SpeechSynthesis |
| `unreadService.js` | Unread message counts | `sms_messages`, `call_records` (real-time subs) |
| `knowledgeService.js` | KB operations | `knowledge_sources` + edge functions |
| `adminAgentService.js` | Admin agent interaction | Multiple tables + edge functions |
| `realtimeOmniService.js` | Real-time omni-channel | Supabase real-time subscriptions |
| `realtimeAdminService.js` | Real-time admin updates | Supabase real-time subscriptions |
| `memoryService.js` | Conversation memory mgmt | `conversation_memories` |

---

## Libraries (`src/lib/`)

| File | Purpose |
|------|---------|
| `supabase.js` | Supabase client init, `getCurrentUser()`, `getCurrentSession()`, `signOut()` |
| `sipClient.js` | JsSIP WebRTC client for SignalWire SIP (legacy, not used for outbound) |
| `livekitClient.js` | LiveKit SDK client for AI voice rooms |
| `voiceRecognition.js` | Web Speech API wrapper |
| `toast.js` | Toast notification utility |
| `twilioClient.js` | Legacy Twilio client (deprecated) |

---

## Edge Functions (~160 functions in `supabase/functions/`)

### Auth & User Management

| Function | Auth | Tables | External APIs | Called By |
|----------|------|--------|---------------|----------|
| `verify-phone-send` | JWT | `sms_confirmations`, `users` | SignalWire (SMS) | verify-phone page |
| `verify-phone-check` | JWT | `sms_confirmations`, `users` | None | verify-phone page |
| `send-password-reset` | No JWT | None | Supabase Auth | forgot-password page |
| `notify-signup` | Service role | `users` | Postmark, Slack | signup (fire & forget) |
| `send-team-invitation` | JWT | `users` | Postmark | team page |
| `send-contact-email` | JWT | None | Postmark | contact form (sends to help@magpipe.ai) |
| `send-custom-plan-inquiry` | No JWT | None | Postmark | custom-plan page |
| `manage-api-keys` | JWT | `api_keys`, `webhook_deliveries` | None | settings page (generate/list/revoke/update with webhook URLs) |
| `create-user-sip-endpoint` | JWT | `users`, `user_sip_endpoints` | SignalWire | SIP config |
| `save-push-subscription` | JWT | `push_subscriptions` | None | notification setup |
| `delete-push-subscription` | JWT | `push_subscriptions` | None | settings |
| `send-notification-email` | Service role | `notification_preferences` | Postmark | webhooks (fire & forget). Per-agent prefs with user-level fallback |
| `send-notification-sms` | Service role | `notification_preferences`, `service_numbers` | SignalWire | webhooks (fire & forget). Per-agent prefs with user-level fallback |
| `send-notification-push` | Service role | `notification_preferences`, `push_subscriptions` | Web Push (VAPID) | webhooks (fire & forget). Per-agent prefs with user-level fallback |
| `send-notification-slack` | Service role / JWT / API key | `notification_preferences`, `user_integrations` | Slack API | webhooks (fire & forget). Per-agent prefs with user-level fallback |
| `access-code-update` | JWT/API key | `users`, `sms_confirmations` | Postmark | phone admin |

### Call Management

| Function | Auth | Tables | External APIs | Called By |
|----------|------|--------|---------------|----------|
| `initiate-bridged-call` | JWT/API key | `call_records`, `service_numbers` | SignalWire, LiveKit | phone page, admin chat |
| `webhook-inbound-call` | **No JWT** | `call_records`, `service_numbers`, `agent_configs`, `contacts` | SignalWire, LiveKit | SignalWire webhook |
| `bridge-outbound-call` | Varies | `call_records` | SignalWire, LiveKit | call interfaces |
| `callback-call-handler` | **No JWT** | `call_records`, `service_numbers`, `agent_configs` | SignalWire | SignalWire webhook |
| `callback-call-status` | **No JWT** | `call_records` | None | SignalWire webhook |
| `outbound-call-swml` | **No JWT** | `call_records` | None | SignalWire webhook |
| `outbound-call-status` | **No JWT** | `call_records` | None | SignalWire webhook |
| `outbound-dial-status` | **No JWT** | `call_records` | None | SignalWire webhook |
| `livekit-outbound-call` | JWT/API key | `call_records`, `service_numbers` | SignalWire, LiveKit | call interfaces |
| `warm-transfer` | JWT | `call_records` | LiveKit, SignalWire | agent call controls |
| `warm-transfer-callback` | **No JWT** | `call_records` | None | SignalWire webhook |
| `warm-transfer-status` | **No JWT** | `call_records` | None | SignalWire webhook |
| `warm-transfer-twiml` | **No JWT** | `call_records` | SignalWire | SignalWire webhook |
| `terminate-call` | JWT / API key | `call_records` | LiveKit | agent controls, API |
| `batch-calls` | JWT / API key | `batch_calls`, `batch_call_recipients`, `service_numbers` | None | batch-calls page, API. Actions: create, list, list_runs, get, update, start, cancel, pause_series, resume_series. Supports recurring parent-child model. |
| `process-batch-calls` | **No JWT** (service role) | `batch_calls`, `batch_call_recipients`, `call_records` | SignalWire (conference bridge) | `batch-calls` function, cron. Also handles recurring batch spawning via `spawnDueRecurringChildren()`. |
| `batch-call-cxml` | **No JWT** | None | None | SignalWire webhook (CXML for conference legs) |
| `webhook-call-status` | **No JWT** | `call_records` | None | SignalWire webhook |
| `sip-call-handler` | **No JWT** | `call_records` | SignalWire | SignalWire webhook |
| `sip-call-status` | **No JWT** | `call_records` | None | SignalWire webhook |
| `sip-transfer-call` | JWT | `call_records` | SignalWire | call transfer UI |
| `conference-twiml` | **No JWT** | `call_records` | SignalWire | SignalWire webhook |
| `conference-transfer` | JWT | `call_records` | SignalWire | conference UI |
| `livekit-token` | JWT | `agent_configs`, `service_numbers` | LiveKit | voice client |
| `livekit-create-room` | JWT | `call_records` | LiveKit | call initiation |
| `realtime-omni-token` | JWT | None | LiveKit | omni chat |
| `realtime-admin-token` | JWT | None | LiveKit | admin chat |

### Recording

| Function | Auth | Tables | External APIs | Called By |
|----------|------|--------|---------------|----------|
| `fetch-call-recordings` | JWT | `call_records` | SignalWire | call history |
| `fetch-livekit-recording` | JWT | `call_records` | LiveKit Egress | call history |
| `get-signed-recording-url` | JWT / API key | `call_records` | None | call playback, API |
| `sip-recording-callback` | **No JWT** | `call_records` | None | SignalWire webhook |
| `reconcile-recordings` | JWT/cron | `call_records` | SignalWire, LiveKit | admin tools |
| `sync-recording` | JWT | `call_records` | SignalWire | call list |
| `webhook-livekit-egress` | **No JWT** | `call_records` | None | LiveKit webhook |

### SMS & Messaging

| Function | Auth | Tables | External APIs | Called By |
|----------|------|--------|---------------|----------|
| `webhook-inbound-sms` | **No JWT** | `sms_messages`, `service_numbers`, `agent_configs`, `contacts`, `conversation_contexts`, `knowledge_chunks`, `sms_opt_outs` | OpenAI (GPT-4o-mini), SignalWire, Slack | SignalWire webhook. Routes via `text_agent_id` first, falls back to `agent_id` |
| `send-user-sms` | JWT | `sms_messages`, `service_numbers` | SignalWire | messages UI |
| `webhook-sms-status` | **No JWT** | `sms_messages` | None | SignalWire webhook |
| `schedule-sms` | JWT | `scheduled_actions` | None | scheduling UI |
| `webhook-chat-message` | **No JWT** | `chat_sessions`, `chat_messages`, `agent_configs`, `service_numbers` | OpenAI | chat widget webhook |
| `omni-chat` | JWT | `chat_sessions`, `chat_messages`, `agent_configs`, `knowledge_chunks`, `conversation_contexts` | OpenAI, LiveKit | omni chat UI |

### Agent & Voice

| Function | Auth | Tables | External APIs | Called By |
|----------|------|--------|---------------|----------|
| `get-agent` | JWT / API key | `agent_configs`, `dynamic_variables` | None | agent-detail page, API |
| `list-agents` | JWT / API key | `agent_configs`, `dynamic_variables` | None | agents page, API |
| `create-agent` | JWT / API key | `agent_configs`, `dynamic_variables` | None | API |
| `update-agent` | JWT / API key | `agent_configs`, `dynamic_variables` | None | agent-detail page, API |
| `delete-agent` | JWT | `agent_configs`, `service_numbers` | None | agent list |
| `custom-functions` | JWT / API key | `custom_functions` | None | functions tab, API |
| `manage-dynamic-variables` | JWT / API key | `dynamic_variables` | None | API |
| `list-voices` | JWT | None | ElevenLabs | voice selection |
| `clone-voice` | JWT / API key | `cloned_voices` | ElevenLabs | voice cloning, API |
| `delete-voice` | JWT | `cloned_voices` | ElevenLabs | voice management |
| `get-cloned-voices` | JWT | `cloned_voices` | None | voice selection |
| `preview-voice` | JWT | None | ElevenLabs TTS | voice preview |
| `generate-voice-preview` | JWT | None | ElevenLabs TTS | voice selection |
| `list-models` | JWT | None | OpenAI | model selection |
| `text-to-speech` | JWT | None | ElevenLabs TTS | testing |
| `translate-text` | JWT | None | OpenAI | translation |
| `fetch-agent-avatar` | JWT | None | None | agent config |
| `save-voice-conversation` | JWT | `voice_conversations`, `call_records` | None | call end |

### Knowledge Base

| Function | Auth | Tables | External APIs | Called By |
|----------|------|--------|---------------|----------|
| `knowledge-source-add` | JWT | `knowledge_sources`, `agent_configs` | Firecrawl | knowledge tab |
| `knowledge-source-list` | JWT | `knowledge_sources`, `knowledge_chunks` | None | knowledge tab |
| `knowledge-source-delete` | JWT | `knowledge_sources`, `knowledge_chunks`, `agent_configs` | None | knowledge tab |
| `knowledge-source-sync` | JWT | `knowledge_sources`, `knowledge_chunks` | Firecrawl | knowledge tab |
| `knowledge-source-manual` | JWT | `knowledge_sources`, `knowledge_chunks`, `agent_configs` | OpenAI (embeddings) | knowledge tab |
| `knowledge-crawl-process` | Service role | `knowledge_sources`, `knowledge_chunks` | Firecrawl, OpenAI | background job |
| `semantic-memory-search` | JWT | `conversation_contexts` | OpenAI (embeddings) | debug |

### Phone Number Management

| Function | Auth | Tables | External APIs | Called By |
|----------|------|--------|---------------|----------|
| `search-phone-numbers` | JWT / API key | None | SignalWire | select-number page, API |
| `provision-phone-number` | JWT / API key | `service_numbers`, `users`, `monthly_billing_log` | SignalWire | select-number page, API |
| `release-phone-number` | JWT / API key | `service_numbers`, `numbers_to_delete` | None | number management, API |
| `queue-number-deletion` | JWT | `numbers_to_delete` | None | number release |
| `cancel-number-deletion` | JWT | `numbers_to_delete` | None | deletion management |
| `process-scheduled-deletions` | Cron | `numbers_to_delete`, `service_numbers` | SignalWire | cron job |
| `configure-signalwire-number` | JWT | `service_numbers` | SignalWire | number config |
| `fix-number-capabilities` | JWT | `service_numbers` | SignalWire | admin tools |
| `lookup-phone-number` | JWT / API key | None | SignalWire Lookup | API, webhooks |
| `submit-cnam-request` | JWT | `cnam_requests`, `service_numbers` | None | CNAM management |

### Credits & Billing

| Function | Auth | Tables | External APIs | Called By |
|----------|------|--------|---------------|----------|
| `deduct-credits` | Service role | `users`, `credit_transactions` | None | voice agent, SMS handler |
| `stripe-webhook` | **No JWT** (Stripe sig) | `users`, `credit_transactions` | Stripe | Stripe webhook |
| `stripe-create-checkout` | JWT | `users` | Stripe | credit purchase |
| `stripe-add-credits` | JWT / API key | `users`, `credit_transactions` | Stripe | credit purchase, API |
| `stripe-setup-payment` | JWT | `users` | Stripe | payment setup |
| `stripe-create-portal` | JWT | `users` | Stripe | billing settings |
| `process-monthly-fees` | Cron | `users`, `service_numbers`, `knowledge_sources`, `monthly_billing_log`, `credit_transactions` | None | cron job |
| `process-scheduled-actions` | Cron | `scheduled_actions`, `sms_messages` | SignalWire | cron job |

### Integrations

| Function | Auth | Tables | External APIs | Called By |
|----------|------|--------|---------------|----------|
| `integration-oauth-start` | JWT | `integration_providers`, `user_integrations` | None | apps page |
| `integration-oauth-callback` | **No JWT** | `integration_providers`, `user_integrations` | OAuth token exchange | OAuth redirect |
| `cal-com-oauth-start` | JWT | None | Cal.com | settings |
| `cal-com-oauth-callback` | **No JWT** | None | Cal.com | OAuth redirect |
| `cal-com-get-slots` | JWT / API key | None | Cal.com | availability check, API |
| `cal-com-create-booking` | JWT / API key | None | Cal.com | booking, API |
| `cal-com-cancel-booking` | JWT / API key | None | Cal.com | cancel booking, API |
| `mcp-execute` | JWT/Service role | Many tables | OpenAI, various MCP servers | admin chat, agent |
| `mcp-proxy` | JWT | None | MCP servers | MCP client |
| `mcp-tools` | JWT | None | None | MCP client |
| `contact-lookup` | JWT | None | Apollo.io | contacts page |

### Admin

| Function | Auth | Tables | External APIs | Called By |
|----------|------|--------|---------------|----------|
| `admin-list-users` | JWT (admin) | `users` | None | admin page |
| `admin-get-user` | JWT (admin) | `users`, `service_numbers`, `agent_configs`, `call_records`, `sms_messages`, `contacts` | None | admin page |
| `admin-update-user` | JWT (admin) | `users`, `admin_action_logs` | None | admin page |
| `admin-impersonate` | JWT (admin) | `users`, `admin_impersonation_tokens`, `admin_action_logs` | None | admin page |
| `admin-consume-impersonation` | No JWT | `admin_impersonation_tokens`, `users` | Supabase Admin API | impersonate page |
| `admin-manage-numbers` | JWT (admin) | `service_numbers`, `users`, `numbers_to_delete` | SignalWire | admin page |
| `admin-analytics` | JWT (admin) | `users`, `call_records`, `sms_messages`, `credit_transactions`, `chat_sessions` | OpenStreetMap | admin page |
| `admin-status` | JWT (admin) | `users`, `user_integrations` | All vendor status pages | admin page |
| `admin-agent-chat` | JWT (admin) | `admin_conversations`, `admin_messages`, `contacts`, `agent_configs` | OpenAI, Google Places, Slack | admin page |
| `admin-notifications-api` | JWT (admin) | `admin_notification_config`, `service_numbers` | SignalWire, Postmark, Slack | admin page |
| `admin-send-notification` | Service role | `admin_notification_config` | SignalWire, Postmark, Slack | internal |
| `admin-list-agents` | JWT (admin) | `agent_configs`, `users` | None | admin page |
| `admin-blog-api` | JWT (admin) | `blog_posts` | None | admin page |
| `admin-social-listening-api` | JWT (admin) | `social_listening_results`, `social_listening_keywords` | None | admin page |
| `process-social-listening` | **No JWT** (cron) | `social_listening_results`, `social_listening_keywords`, `admin_notification_config` | Serper.dev (Google+Reddit), HN Algolia, Postmark | cron (6h) / admin |
| `blog-rss` | Public (no JWT) | `blog_posts` | None | RSS readers |

### Email

| Function | Auth | Tables | External APIs | Called By |
|----------|------|--------|---------------|----------|
| `send-email` | JWT | `email_messages`, `user_integrations` | Gmail API (OAuth) | inbox page |
| `poll-gmail-inbox` | Cron (30m) | `agent_email_configs`, `email_messages`, `user_integrations`, `contacts`, `support-attachments` (storage) | Gmail API (messages + attachments), OpenAI | cron job (fallback) |
| `gmail-push-webhook` | Pub/Sub secret | `agent_email_configs`, `email_messages`, `user_integrations`, `contacts`, `support_tickets`, `support_email_config`, `support-attachments` (storage) | Gmail API (messages + attachments), OpenAI | Google Cloud Pub/Sub |
| `gmail-watch-renew` | Service role | `agent_email_configs`, `user_integrations` | Gmail API (watch) | cron job (daily) |

### Support & Ticketing

| Function | Auth | Tables | External APIs | Called By |
|----------|------|--------|---------------|----------|
| `support-tickets-api` | JWT | `support_tickets`, `support_email_config`, `support-attachments` (storage) | Gmail API, Postmark, GitHub API | admin page |
| `poll-gmail-tickets` | Cron (5m) | `support_tickets`, `support_email_config`, `user_integrations`, `support-attachments` (storage) | Gmail API (messages + attachments), OpenAI, Postmark | cron job |

### Referrals & Balance

| Function | Auth | Tables | External APIs | Called By |
|----------|------|--------|---------------|----------|
| `process-referral` | JWT | `users`, `referral_rewards` | None | signup page |
| `_shared/balance-check.ts` | — | `users` | — | Shared helper used by call/SMS functions |

---

## Database Tables (grouped)

### Core
`users`, `organizations`, `organization_members`, `service_numbers` (agent_id for voice, text_agent_id for SMS — independent routing), `agent_configs` (5 types: inbound_voice, outbound_voice, text, email, chat_widget; single system_prompt; shared_memory_agent_ids UUID[])

### Communication
`call_records`, `sms_messages`, `email_messages`, `chat_sessions`, `chat_messages`, `contacts`, `conversation_contexts`

### Knowledge & AI
`knowledge_sources`, `knowledge_chunks` (pgvector), `dynamic_variables`, `semantic_match_actions`, `custom_functions`

### Billing
`credit_transactions`, `monthly_billing_log`, `plan_limits`, `usage_history`

### Phone Management
`numbers_to_delete`, `external_sip_trunks`, `external_sip_numbers`, `phone_number_pool`, `area_codes`, `campaign_registrations`, `cnam_requests`

### Integrations
`integration_providers`, `user_integrations`, `integration_tool_logs`, `mcp_server_catalog`, `user_mcp_servers`, `user_mcp_connections`

### Chat Widget
`chat_widgets`, `chat_sessions`, `chat_messages`

### Admin
`admin_conversations`, `admin_messages`, `admin_impersonation_tokens`, `admin_audit_log`, `admin_action_logs`, `admin_notification_config`

### Support
`support_tickets` (includes `attachments` JSONB column), `support_ticket_notes`, `support_email_config`

### Storage Buckets
`support-attachments` — public read, 5MB limit, image MIME types (jpeg, png, gif, webp, svg)

### Referrals
`referral_rewards`

### Security
`phone_verifications`, `sms_opt_outs`, `access_code_attempts`, `sms_confirmations`, `oauth_states`, `api_keys`, `webhook_deliveries`, `twitter_oauth_tokens`, `twitter_oauth_state`

### Row Level Security (RLS)
- **All public tables have RLS enabled** — no exceptions
- **Edge functions** use `SUPABASE_SERVICE_ROLE_KEY` which bypasses RLS entirely
- **API key (`mgp_`) endpoints** resolve to service role client via `resolveUser()` — also bypasses RLS
- **Frontend** uses anon key + user JWT — subject to RLS policies scoped by `user_id = auth.uid()` or `has_org_access()`
- **System-only tables** (no user policies, service role access only): `twitter_oauth_tokens`, `twitter_oauth_state`, `phone_number_pool`, `admin_notification_config`, `support_email_config`, `support_tickets`, `support_ticket_notes`, `campaign_registrations`, `directory_submissions`, `temp_state`, `sms_opt_outs`, `monthly_billing_log`

### Social Listening
`social_listening_keywords`, `social_listening_results`

### Content
`blog_posts`

### Batch Calling
`batch_calls` (includes recurrence columns: `recurrence_type`, `recurrence_interval`, `recurrence_end_date`, `recurrence_max_runs`, `recurrence_run_count`, `parent_batch_id`, `occurrence_number`), `batch_call_recipients`

### Other
`notification_preferences` (per-agent: `UNIQUE(user_id, agent_id)`, fallback row where `agent_id IS NULL`), `push_subscriptions`, `webhook_logs`, `scheduled_actions`, `sms_templates`, `voices`, `temp_state`, `call_state_logs`, `collected_call_data`, `transfer_numbers`, `outbound_call_templates`, `cloned_voices`

---

## LiveKit Voice Agent (`agents/livekit-voice-agent/agent.py`)

**3,442 lines** — Python 3.11 on Render

### External Services
- **OpenAI**: LLM (GPT-4o/4o-mini/Claude), embeddings (ada-002), data extraction
- **ElevenLabs**: TTS (Flash v2.5) with custom voices, voice cloning
- **Deepgram**: STT (Nova 2 Phonecall)
- **LiveKit Cloud**: Room management, SIP trunking, recording (egress)
- **Supabase**: Database (service role key), edge functions

### Tables Accessed

**Reads**: `agent_configs`, `users`, `contacts`, `conversation_contexts`, `service_numbers`, `external_sip_numbers`, `transfer_numbers`, `dynamic_variables`, `voices`, `custom_functions`, `sms_templates`, `call_records`, `call_state_logs`

**Writes**: `call_records`, `conversation_contexts`, `contacts`, `sms_messages`, `collected_call_data`, `access_code_attempts`, `call_state_logs`, `voices`

**RPCs**: `match_similar_memories`, `increment_semantic_match_count`

**Edge Function Calls**: `deduct-credits`, `execute-semantic-action`

### Agent Lifecycle
1. Inbound call → SignalWire webhook → `webhook-inbound-call` → Creates LiveKit room → Agent dispatched
2. Agent connects → Fetches config → Loads caller memory + semantic context + shared agent memories → Builds single system prompt
3. During call → Function tools: transfer, warm transfer, SMS, calendar, data collection, custom webhooks
4. Call ends → Summary → Update memory → Deduct credits → Check semantic actions → Delete room

### Type-Specific Architecture
- 5 agent types: `inbound_voice`, `outbound_voice`, `text`, `email`, `chat_widget`
- Single `system_prompt` per agent (consolidated from separate inbound/outbound prompts)
- Type-specific default prompt generators in AgentConfig model
- Shared memory: agents can share conversation memory via `shared_memory_agent_ids` — memories from linked agents are injected into the system prompt for the same contact
- Non-voice types (text, email, chat_widget) hide voice-specific settings in the Configure tab

### Function Tools Available to Agent
- Blind transfer / warm transfer to configured numbers
- Send SMS during call
- Collect structured data (dynamic variables)
- Check Cal.com availability / book appointment
- End call gracefully
- Voice clone submission
- Custom webhook functions (user-defined)

---

## External API Dependencies

| Vendor | Used For | Functions That Call It |
|--------|----------|----------------------|
| **SignalWire** | PSTN calls, SMS, number provisioning | `webhook-inbound-call`, `webhook-inbound-sms`, `initiate-bridged-call`, `send-user-sms`, `provision-phone-number`, `search-phone-numbers`, warm-transfer functions, recording functions |
| **LiveKit** | Voice AI rooms, SIP, recording | `initiate-bridged-call`, `livekit-token`, `livekit-create-room`, `terminate-call`, `warm-transfer`, agent.py |
| **OpenAI** | LLM, embeddings, data extraction | `webhook-inbound-sms`, `omni-chat`, `admin-agent-chat`, `mcp-execute`, `knowledge-source-manual`, agent.py |
| **ElevenLabs** | TTS, voice cloning | `preview-voice`, `clone-voice`, `list-voices`, `text-to-speech`, agent.py |
| **Deepgram** | STT | agent.py only |
| **Stripe** | Payments, subscriptions | `stripe-webhook`, `stripe-create-checkout`, `stripe-add-credits`, `stripe-setup-payment`, `stripe-create-portal` |
| **Postmark** | Transactional email | `notify-signup`, `send-team-invitation`, `send-contact-email`, `send-password-reset`, `admin-send-notification` |
| **Gmail API** | Email inbox send/receive (OAuth), Pub/Sub watch | `send-email`, `poll-gmail-inbox`, `gmail-push-webhook`, `gmail-watch-renew`, `poll-gmail-tickets`, `support-tickets-api` |
| **Google Cloud Pub/Sub** | Gmail push notifications | `gmail-push-webhook` (receiver) |
| **Firecrawl** | Web scraping for KB | `knowledge-source-add`, `knowledge-source-sync`, `knowledge-crawl-process` |
| **Slack** | Notifications, integration | `admin-agent-chat`, `admin-send-notification`, `send-notification-slack`, `webhook-inbound-sms` (mirror), `webhook-call-status`, `sip-call-status`, `signalwire-status-webhook` |
| **Cal.com** | Calendar booking | `cal-com-*` functions, agent.py tools |
| **Apollo.io** | Contact enrichment | `contact-lookup` |
| **HubSpot** | CRM | `mcp-execute` (native tools) |
| **Google Places** | Business search | `admin-agent-chat`, `mcp-execute` |

---

## Service Worker (`public/sw.js`)

- Cache name: `magpipe-v1`
- Caches: `/`, `/index.html`, `/manifest.json`, `/styles/main.css`, `/src/main.js`, `/src/router.js`
- CSS: Network-first, fallback to cache
- Other assets: Cache-first with background update
- Supabase API: **Never cached** (always network)
- Push notifications: Shows notification, opens app on click
- Offline: Falls back to cached `/index.html`

---

## Deployment

| Component | Platform | Trigger | URL |
|-----------|----------|---------|-----|
| Frontend | Vercel | Push to `master` | https://magpipe.ai |
| Edge Functions | Supabase Cloud | `npx supabase functions deploy <name>` | `{SUPABASE_URL}/functions/v1/<name>` |
| Voice Agent | Render | Push to `master` | Auto-connects to LiveKit Cloud |
| Database | Supabase Cloud | SQL via Management API | `{SUPABASE_URL}/rest/v1/` |
