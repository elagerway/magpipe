# Magpipe - A Conversational Platform

Magpipe is a a conversational platform that manages SMS/Text messsges, Phone Calls, Email, and Web Chat. Built with vanilla JavaScript, Supabase, CPaaS, and LiveKit.

## Features

### Inbound Call Handling
- **AI-Powered Call Screening**: AI agent answers, vets callers, and determines intent
- **Smart Transfer**: Transfer calls to configured numbers with optional passcodes
- **Contact Recognition**: Whitelist trusted contacts for priority handling
- **Call Recording**: Automatic recording with transcripts

### Outbound Calling
- **AI-Assisted Outbound**: Agent makes calls on your behalf with configurable prompts
- **Callback Mode**: Server calls your phone first, then bridges to destination
- **Call Templates**: Reusable templates with purpose and goal for consistent outbound calls
- **Call Recording**: All calls recorded via SignalWire conference bridge

### SMS Management
- **Automated Responses**: AI-powered contextual SMS replies
- **Conversation History**: Full message thread tracking per contact
- **Scheduled Messages**: Schedule SMS to be sent at specific times

### Agent Chat Interface
- **Conversational Admin**: Natural language interface to manage your assistant
- **Voice Mode**: Speak to your agent using browser microphone
- **Action Execution**: Agent can make calls, send SMS, add contacts on your behalf

### Customization
- **Custom Prompts**: Separate inbound and outbound system prompts
- **Voice Selection**: Choose from ElevenLabs or OpenAI voices
- **Transfer Numbers**: Configure multiple transfer destinations with passcodes
- **Outbound Templates**: Create reusable call purpose/goal templates

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3, Vite
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Edge Functions — TypeScript/Deno)
- **Telephony**: SignalWire (PSTN calls, SMS, conference bridging)
- **Voice AI**: LiveKit (real-time audio), OpenAI (LLM), Deepgram (STT), ElevenLabs (TTS)
- **Payments**: Stripe (credits, subscriptions)
- **Email**: Postmark (transactional), Gmail API (support tickets, inbox email send/receive)
- **Enrichment**: Apollo.io (contact data)
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
│   ├── functions/                # ~160 Edge Functions (TypeScript/Deno)
│   │   ├── _shared/             # Shared utilities (cors, auth, balance-check)
│   │   ├── admin-status/
│   │   ├── contact-lookup/       # Apollo.io enrichment
│   │   ├── initiate-bridged-call/
│   │   ├── gmail-push-webhook/   # Gmail Pub/Sub push notifications
│   │   ├── gmail-watch-renew/    # Daily Gmail watch renewal
│   │   ├── poll-gmail-inbox/     # Fallback email polling (30m)
│   │   ├── poll-gmail-tickets/
│   │   ├── support-tickets-api/
│   │   ├── webhook-inbound-call/
│   │   ├── webhook-inbound-sms/
│   │   └── ...
│   └── migrations/               # Database migrations
├── tests/                        # Playwright & contract tests
└── specs/                        # Feature specifications
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

### Inbound Call Flow

1. Inbound call hits SignalWire phone number
2. SignalWire webhook triggers LiveKit room creation
3. LiveKit agent joins room, answers call
4. Agent vets caller (name, purpose) based on system prompt
5. Decision: transfer, take message, or handle conversation
6. Call recorded, transcript stored, context updated

### Outbound Call Flow

1. User initiates call from Phone page or Agent chat
2. Template modal captures purpose/goal (or uses saved template)
3. Edge Function creates call record with context
4. **With Agent**: SignalWire creates bridged conference, LiveKit agent joins
5. **Without Agent**: SignalWire calls user's phone, then bridges to destination
6. Agent uses purpose/goal from template in conversation
7. Call recorded via SignalWire conference

### Agent Chat Flow

1. User sends message or speaks to Agent
2. OpenAI processes with function calling
3. Agent can execute: make calls, send SMS, add contacts, search
4. Actions require user confirmation before execution
5. Results displayed in chat interface

### SMS Flow

1. Inbound SMS triggers webhook
2. Conversation context retrieved (with embeddings)
3. AI generates contextual response
4. SMS sent via SignalWire
5. Context updated with new messages

## Database Schema

### Core Tables

- `users` - User profiles, SIP credentials, preferences, credit balance
- `organizations` - Multi-user org management
- `contacts` - Contact information with enrichment fields
- `agent_configs` - AI agent configuration (prompts, voice, settings, functions)
- `call_records` - Call history with purpose, goal, transcripts
- `sms_messages` - SMS message history
- `email_messages` - Email threads for inbox (id, user_id, agent_id, contact_id, thread_id, gmail_message_id, from/to/cc/bcc, subject, body_text, body_html, direction, status, is_ai_generated, is_read, sent_at)
- `agent_email_configs` - Per-agent email channel config (gmail_address, agent_mode: off/draft/auto, watch_expiration, last_history_id)
- `conversation_contexts` - Conversation memory with embeddings
- `service_numbers` - User's phone numbers from SignalWire
- `support_tickets` - Support ticket threads (Gmail integration)
- `support_email_config` - Gmail connection, AI agent settings, ticket creation toggle
- `credit_transactions` - Billing and credit history
- `knowledge_sources` / `knowledge_chunks` - RAG knowledge base (pgvector)
- `chat_widgets` / `chat_sessions` / `chat_messages` - Embeddable chat widget
- `referral_rewards` - Referral tracking and bonus payouts

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
The agent auto-deploys from the `master` branch:
```bash
git push origin master
```

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm test` - Run Playwright tests
- `npm run lint` - Lint code

### Testing

```bash
# Run all Playwright tests
npx playwright test

# Run specific test
npx playwright test tests/test-outbound-call.spec.js

# Run with UI
npx playwright test --ui
```

## License

MIT

## Support

For issues and questions, please open a GitHub issue.
