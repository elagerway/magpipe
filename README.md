# Magpipe - A Conversational Platform

Magpipe is a conversational platform that manages SMS/Text messages, WhatsApp, Phone Calls, Email, and Web Chat — with an AI agent on every channel and a signed webhook API for piping conversations into your own systems. Built with vanilla JavaScript, Supabase, CPaaS (SignalWire + Meta WhatsApp Cloud API), and LiveKit.

## Features

- **Smart Call Handling** — AI answers calls, screens unknown callers, takes messages, and transfers important calls to you
- **Intelligent SMS/MMS** — Context-aware text responses that understand conversation history and respond appropriately, including inbound picture messages (MMS)
- **WhatsApp Business** — Full two-way WhatsApp via the Meta Cloud API: AI replies to inbound text, voice notes, and images; outbound messages and pre-approved message templates; one-click number onboarding through Meta Embedded Signup; and automatic number health monitoring with self-healing
- **Email AI** — Automatically respond to emails with context-aware AI replies, drafts for review, or fully autonomous mode
- **24/7 Availability** — Your assistant never sleeps. Handle calls and messages around the clock
- **Contact Management** — Whitelist VIPs, block spam, and set custom rules for different callers
- **Knowledge Base** — Train your assistant with custom information to answer questions accurately
- **Privacy First** — Your data is encrypted and secure. Full control over what information is shared
- **Analytics & Insights** — Real-time dashboards with call volume, sentiment analysis, and conversation trends
- **Real-Time Translation** — Automatic translation across 30+ languages during live calls
- **Conversation Memory** — Your agent remembers past interactions, caller preferences, and context across every conversation
- **Integrations** — Connect with HubSpot, Google Workspace, Zapier, and more. Sync contacts, log calls, and automate workflows
- **Warm Transfer** — Seamlessly hand off live calls to you or your team when the AI detects a conversation needs a human touch
- **Social Listening** — Automated monitoring of Reddit, HackerNews, and Google for keyword mentions. Email digests, admin dashboard with favorites, search, and status tracking
- **Developer API & Webhooks** — Issue API keys and receive HMAC-signed events (`sms.received`, `sms.sent`, `call.completed`, `chat.session.completed`, `whatsapp.received`) at your own endpoint, with automatic retries and a dead-letter queue. Per-number scoping keeps multi-tenant accounts isolated so one business never receives another's events
- **Skills & Automations** — Reusable agent skills (post-call follow-up, appointment reminders, review requests, daily news digests, auto-CRM-update, competitor/social monitoring) plus Composio-powered tool integrations the AI can call mid-conversation
- **Inbound Media Capture** — Images, voice notes, and documents sent over WhatsApp and SMS/MMS are re-hosted to private storage with signed URLs, delivered to your webhooks, and shown inline in the inbox
- **Agent Custom Functions** — Let the AI call your own HTTP endpoints (with custom auth headers) during a conversation to fetch data or submit structured records

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3, Vite
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Edge Functions — TypeScript/Deno)
- **Telephony**: SignalWire (PSTN calls, SMS/MMS, conference bridging)
- **WhatsApp**: Meta WhatsApp Cloud API (inbound/outbound messages, message templates, Embedded Signup onboarding, media)
- **Voice AI**: LiveKit (real-time audio), OpenAI (LLM), Deepgram (STT), ElevenLabs (TTS)
- **Payments**: Stripe (credits, subscriptions)
- **Email**: Postmark (transactional), Gmail API (support tickets, inbox email send/receive)
- **Enrichment**: Apollo.io (contact data)
- **Skills / Tools**: Composio (Gmail and other third-party tool integrations the agent can call)
- **Developer API**: API keys with HMAC-signed webhooks, per-number scoping, retry + dead-letter delivery
- **Social Listening**: Serper.dev (Google SERP + Reddit), HN Algolia API
- **Vector DB**: pgvector (conversation context embeddings)

## Project Structure

```
pat/
├── agents/
│   └── livekit-voice-agent/      # Python LiveKit agent (deployed on Render)
│       ├── agent.py              # Main agent logic (~3,400 lines)
│       ├── requirements.txt
│       └── render.yaml           # Render deployment config
├── public/                       # Static assets
│   ├── index.html
│   ├── manifest.json             # PWA manifest
│   ├── sw.js                     # Service worker
│   └── styles/
├── src/
│   ├── components/               # Reusable UI components
│   │   ├── AdminChatInterface.js # Admin AI chat
│   │   ├── AdminHeader.js        # Admin portal header with status dropdown
│   │   ├── BottomNav.js          # Mobile bottom nav / desktop sidebar
│   │   ├── ConfirmModal.js       # Custom confirm dialog
│   │   ├── ImpersonationBanner.js
│   │   ├── LowBalanceBanner.js   # Low credit balance warning
│   │   └── ...
│   ├── lib/                      # Utilities
│   │   └── supabase.js           # Supabase client
│   ├── models/                   # Data models (User, Contact, AgentConfig, etc.)
│   ├── pages/                    # UI pages (large pages split into subdirectories)
│   │   ├── admin/                # Admin portal (split from admin.js)
│   │   │   ├── index.js          # Entry point
│   │   │   ├── support-tab.js    # Support tickets, Gmail, AI settings
│   │   │   ├── users-tab.js      # User management
│   │   │   ├── analytics-tab.js
│   │   │   ├── kpi-tab.js
│   │   │   ├── notifications-tab.js
│   │   │   ├── chat-tab.js
│   │   │   ├── global-agent-tab.js
│   │   │   └── styles.js
│   │   ├── agent-detail/         # Agent config (split from agent-detail.js)
│   │   │   ├── index.js
│   │   │   ├── configure-tab.js
│   │   │   ├── prompt-tab.js
│   │   │   ├── functions-tab.js
│   │   │   ├── knowledge-tab.js
│   │   │   ├── memory-tab.js
│   │   │   ├── deployment-tab.js # Phone number assignment + inline buy-number modal
│   │   │   └── ...
│   │   ├── inbox/                # Inbox (split from inbox.js)
│   │   │   ├── index.js
│   │   │   ├── call-interface.js
│   │   │   ├── listeners.js
│   │   │   ├── messaging.js
│   │   │   └── views.js
│   │   ├── phone/                # Phone (split from phone.js)
│   │   │   ├── index.js
│   │   │   ├── call-handler.js
│   │   │   ├── dialpad.js
│   │   │   └── number-management.js
│   │   ├── batch-calls.js          # Batch outbound calls (CSV upload, scheduling)
│   │   ├── contacts.js
│   │   ├── settings.js
│   │   └── ...
│   ├── services/                 # Business logic services
│   │   ├── unreadService.js
│   │   ├── pushNotifications.js
│   │   ├── mcpClient.js
│   │   └── ...
│   ├── main.js                   # App entry point
│   └── router.js                 # Client-side SPA routing
├── supabase/
│   ├── functions/                # ~220 Edge Functions (TypeScript/Deno)
│   │   ├── _shared/             # Shared utilities (cors, auth, webhook-dispatcher, inbound-media)
│   │   ├── admin-status/
│   │   ├── contact-lookup/       # Apollo.io enrichment
│   │   ├── batch-calls/            # Batch call CRUD (create, list, get, start, cancel)
│   │   ├── process-batch-calls/    # Batch call worker (initiates calls per recipient)
│   │   ├── initiate-bridged-call/
│   │   ├── gmail-push-webhook/   # Gmail Pub/Sub push notifications + support ticket mirroring
│   │   ├── gmail-watch-renew/    # Daily Gmail watch renewal
│   │   ├── poll-gmail-inbox/     # Fallback email polling (30m)
│   │   ├── poll-gmail-tickets/
│   │   ├── support-tickets-api/
│   │   ├── webhook-inbound-call/
│   │   ├── webhook-inbound-sms/        # SMS/MMS inbound (async media re-host)
│   │   ├── webhook-inbound-whatsapp/   # WhatsApp inbound (text/audio/image, AI reply)
│   │   ├── send-whatsapp-message/      # Outbound WhatsApp message
│   │   ├── send-whatsapp-template/     # Outbound WhatsApp template
│   │   ├── whatsapp-connect/           # Meta Embedded Signup + number registration
│   │   ├── whatsapp-health-check/      # Detect + auto-heal dropped numbers
│   │   ├── sign-inbox-media/           # Re-sign stored media URLs on demand
│   │   ├── webhook-retry-worker/       # Retries failed webhook deliveries
│   │   ├── replay-webhook-delivery/    # Manually replay a delivery
│   │   ├── execute-skill/              # Run an agent skill / Composio tool
│   │   └── ...
│   └── migrations/               # Database migrations
├── packages/
│   └── mcp-server/               # MCP server for AI coding tools (Claude Code, Cursor)
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase account & CLI
- SignalWire account (SIP endpoint, phone numbers)
- LiveKit Cloud account
- OpenAI API key
- Deepgram API key
- ElevenLabs API key
- (Optional) Meta WhatsApp Business / Cloud API app — for the WhatsApp channel

### Installation

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd pat
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your credentials:
   ```
   # Supabase
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

   # SignalWire
   SIGNALWIRE_PROJECT_ID=your_project_id
   SIGNALWIRE_API_TOKEN=your_api_token
   SIGNALWIRE_SPACE_URL=your_space.signalwire.com

   # LiveKit
   LIVEKIT_URL=wss://your-project.livekit.cloud
   LIVEKIT_API_KEY=your_api_key
   LIVEKIT_API_SECRET=your_api_secret

   # AI Services
   OPENAI_API_KEY=your_openai_key
   DEEPGRAM_API_KEY=your_deepgram_key
   ELEVENLABS_API_KEY=your_elevenlabs_key

   # WhatsApp (Meta Cloud API) — optional
   META_ACCESS_TOKEN=your_meta_system_user_token
   META_APP_SECRET=your_meta_app_secret
   VITE_FB_APP_ID=your_facebook_app_id
   VITE_WHATSAPP_SIGNUP_CONFIG_ID=your_embedded_signup_config_id
   ```

4. **Run database migrations**
   ```bash
   npx supabase db push
   ```

5. **Deploy Edge Functions**
   ```bash
   export SUPABASE_ACCESS_TOKEN=your_token
   npx supabase functions deploy --no-verify-jwt
   ```

6. **Start development server**
   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3000`

## Architecture

### Smart Call Handling
Inbound calls hit a SignalWire number, which triggers a LiveKit room. The AI agent joins, screens the caller, and decides whether to transfer, take a message, or handle the conversation. All calls are recorded with transcripts stored automatically.

### Intelligent SMS
Inbound SMS triggers a webhook that retrieves conversation context (with vector embeddings), generates a context-aware AI response, and sends it via SignalWire. Full conversation history is maintained per contact.

Only `agent_type = 'text'` agents handle SMS. Voice agents are never routed inbound SMS. Agent selection priority: explicit `text_agent_id` on the service number → user's default text agent → any text agent belonging to the user. If no text agent is found, a one-time auto-reply is sent to the sender and subsequent messages from that number are silently ignored.

Loop detection prevents runaway back-and-forth: if the same message body arrives more than twice in a conversation thread, the AI reply is skipped silently. Normal replies resume as soon as the sender sends a different message.

### WhatsApp Business
WhatsApp numbers are onboarded through Meta's Embedded Signup flow (`whatsapp-connect`), which registers the number on the WhatsApp Cloud API and stores the business account. Inbound messages hit `webhook-inbound-whatsapp`, which handles text, voice notes, and images, generates a context-aware AI reply, and sends it back via the Cloud API. Outbound is `send-whatsapp-message` (free-form, inside the 24-hour window) and `send-whatsapp-template` (pre-approved templates, to open a conversation). A scheduled `whatsapp-health-check` detects numbers that have silently dropped off the Cloud API and re-registers them automatically, and `webhook-meta-deauth` handles app de-authorization. Each WhatsApp message can carry a `metadata` object that is echoed back on the inbound reply for attribution.

### Inbound Media
Carrier media (WhatsApp via Meta Bearer auth, SMS/MMS via SignalWire Basic auth) can't be fetched without the platform's own credentials, so raw URLs are useless to downstream consumers. Inbound images, voice notes, and documents are re-hosted to a private storage bucket and exposed as signed URLs (`_shared/inbound-media.ts`). The durable storage path is kept on the message (`sms_messages.metadata.media`) so the inbox can re-sign a URL on demand (`sign-inbox-media`) after it expires, and media is delivered to webhooks and rendered inline in the inbox.

### Developer API & Webhooks
Customers create API keys and register a webhook URL to receive events (`sms.received`, `sms.sent`, `call.completed`, `chat.session.completed`, `whatsapp.received`). Deliveries are HMAC-signed as `x-magpipe-signature` (when a `webhook_secret` is set), tracked in `webhook_deliveries`, and retried by `webhook-retry-worker` with a dead-letter fallback; any delivery can be replayed via `replay-webhook-delivery`. When several businesses share one account, **per-number scoping** (`api_key_numbers`) ensures a key only receives events for its own numbers — an unassociated key on a multi-key account fails closed rather than leaking everything. Separately, **agent custom functions** let the AI call a customer's own HTTP endpoint (with custom auth headers) mid-conversation to fetch data or submit structured records (e.g. a report), with channel/session/sender context and any captured media auto-injected.

### Skills & Automations
Agents can run reusable **skills** (`execute-skill` / `manage-skills`) such as post-call follow-up, appointment reminders, review requests, daily news digests, auto-CRM-update, and competitor/social monitoring. **Composio** integration (`composio-*`) connects third-party tools (e.g. Gmail) that the agent can invoke as tools during a conversation.

### Email AI
Gmail integration via OAuth and Pub/Sub push notifications. The agent can operate in draft mode (generates replies for review) or auto mode (sends replies autonomously). Emails are threaded and visible in the unified inbox.

### Warm Transfer
During a live call, the AI can seamlessly hand off to a human. SignalWire bridges the caller to your phone while the agent briefs you, then drops off the line.

### Knowledge Base
Upload documents or URLs to train your agent. Content is crawled (via Firecrawl), chunked, and embedded with OpenAI into pgvector for RAG-powered retrieval during calls and messages.

### Conversation Memory
Every interaction is summarized and stored with vector embeddings. The agent retrieves relevant past context at the start of each new conversation for continuity across calls, SMS, and email.

### Real-Time Translation
The voice agent supports automatic translation across 30+ languages during live calls, allowing callers and agents to speak in different languages.

### Analytics & Insights
Real-time dashboards display call volume, sentiment analysis, and conversation trends. Organization-wide analytics are available for teams.

### Integrations
HubSpot (CRM), Google Workspace (Calendar, Gmail), Cal.com (booking), Apollo.io (contact enrichment), and Slack (notifications). Native tool execution via the agent chat interface.

### Contact Management
Contacts can be whitelisted for priority handling, blocked, or given custom call rules. CSV import, Apollo.io enrichment, and automatic contact creation from calls/SMS.

### Privacy & Security
All data is encrypted in transit and at rest via Supabase. Access codes, phone verification, and role-based permissions control who can access what.

### 24/7 Availability
The LiveKit voice agent runs on Render and connects to LiveKit Cloud, handling calls and messages around the clock without downtime.

## Database Schema

### Core Tables

- `users` - User profiles, SIP credentials, preferences, credit balance
- `organizations` - Multi-user org management
- `contacts` - Contact information with enrichment fields
- `agent_configs` - AI agent configuration (5 types: inbound_voice, outbound_voice, text, email, chat_widget; single system_prompt with type-specific defaults; shared_memory_agent_ids for cross-agent memory sharing; voice settings, functions)
- `call_records` - Call history with purpose, goal, transcripts
- `sms_messages` - SMS/MMS/WhatsApp message history (`metadata` JSONB, incl. `metadata.media[]` of `{url, path, mime_type, caption}` re-hosted attachments)
- `whatsapp_accounts` - Connected WhatsApp numbers (WABA id, phone_number_id, optional raw-forward `webhook_url`)
- `email_messages` - Email threads for inbox (id, user_id, agent_id, contact_id, thread_id, gmail_message_id, from/to/cc/bcc, subject, body_text, body_html, direction, status, is_ai_generated, is_read, sent_at, `attachments` JSONB for image metadata)
- `agent_email_configs` - Per-agent email channel config (gmail_address, agent_mode: off/draft/auto, watch_expiration, last_history_id)
- `conversation_contexts` - Conversation memory with embeddings
- `service_numbers` - User's phone numbers from SignalWire (`agent_id` for voice, `text_agent_id` for SMS — independent routing)
- `support_tickets` - Support ticket threads (Gmail integration, contact form feedback, `ticket_ref` TKT-XXXXXX, `attachments` JSONB for image metadata)
- `support_ticket_notes` - Internal notes on support threads
- `support_email_config` - Gmail connection, AI agent settings, ticket creation toggle
- `support-attachments` (storage bucket) - Image attachments uploaded from Gmail or admin UI
- `credit_transactions` - Billing and credit history
- `knowledge_sources` / `knowledge_chunks` - RAG knowledge base (pgvector)
- `chat_widgets` / `chat_sessions` / `chat_messages` - Embeddable chat widget
- `batch_calls` - Batch outbound call jobs (status, scheduling, concurrency settings)
- `batch_call_recipients` - Per-recipient tracking for batch calls (status, call_record_id)
- `referral_rewards` - Referral tracking and bonus payouts
- `social_listening_keywords` - Tracked keywords for social monitoring
- `social_listening_results` - Reddit/HackerNews/Google mention results
- `api_keys` - Developer API keys (`webhook_url`, `webhook_secret` for HMAC signing)
- `api_key_numbers` - Per-number scoping of webhook delivery (key ↔ service_number)
- `webhook_deliveries` - Outbound webhook delivery log (status, attempts, dead-letter)
- `skill_definitions` / `agent_skills` / `skill_executions` - Agent skills framework
- `whatsapp-media` (storage bucket) - Re-hosted inbound WhatsApp/SMS media (images, voice notes, documents)

## Deployment

### Frontend (Vite)
```bash
npm run build
# Deploy dist/ folder to Netlify, Vercel, or similar
```

### Edge Functions (Supabase)
```bash
export SUPABASE_ACCESS_TOKEN=your_token
npx supabase functions deploy --no-verify-jwt
```

### LiveKit Agent (Render)
The agent auto-deploys from the `main` branch:
```bash
git push origin main
```

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Lint code

## License

MIT

## Support

For issues and questions, please open a GitHub issue.
