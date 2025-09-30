# Pat - AI Call & SMS Assistant

Pat is a Progressive Web App (PWA) that acts as your personal AI assistant for managing phone calls and SMS messages. Built with vanilla JavaScript, Supabase, SignalWire, and Retell.ai.

## Features

- 📞 **Smart Call Handling**: AI-powered call screening and conversation
- 💬 **SMS Management**: Automated SMS responses with context awareness
- 🎯 **Contact Management**: Whitelist trusted contacts, screen unknown callers
- 🤖 **Customizable AI Agent**: Configure voice, personality, and behavior
- 🔒 **Privacy First**: End-to-end encryption, secure data storage
- 📱 **Progressive Web App**: Installable, offline-capable, native-like experience

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Edge Functions)
- **Telephony**: SignalWire (calls & SMS)
- **AI**: Retell.ai (conversational AI), OpenAI (embeddings & chat)
- **Vector DB**: pgvector (conversation context)

## Project Structure

```
pat/
├── public/                 # Static assets
│   ├── index.html         # Main HTML
│   ├── manifest.json      # PWA manifest
│   ├── sw.js              # Service worker
│   └── styles/            # CSS files
├── src/
│   ├── lib/               # Utilities
│   │   └── supabase.js   # Supabase client
│   ├── models/            # Data models
│   │   ├── User.js
│   │   ├── Contact.js
│   │   ├── CallRecord.js
│   │   ├── SmsMessage.js
│   │   ├── AgentConfig.js
│   │   └── ConversationContext.js
│   ├── pages/             # UI pages
│   │   ├── home.js
│   │   ├── login.js
│   │   ├── signup.js
│   │   ├── dashboard.js
│   │   └── ...
│   ├── main.js            # App entry point
│   └── router.js          # Client-side routing
├── supabase/
│   └── migrations/        # Database migrations
├── tests/
│   ├── contract/          # API contract tests
│   └── integration/       # Integration tests
└── specs/                 # Design documents
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase account
- SignalWire account (for production)
- Retell.ai account (for production)

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

   Edit `.env` and add your credentials:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Run database migrations**
   ```bash
   # Using Supabase CLI
   supabase db push

   # Or manually run SQL files in supabase/migrations/
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3000`

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:ui` - Open Vitest UI
- `npm run lint` - Lint code
- `npm run format` - Format code with Prettier

### Testing

```bash
# Run all tests
npm test

# Run contract tests
npm test tests/contract

# Run integration tests
npm test tests/integration

# Watch mode
npm run test:watch
```

## Database Schema

### Core Tables

- `users` - User profiles and authentication
- `contacts` - Contact information with whitelist
- `agent_configs` - AI agent configuration per user
- `call_records` - Call history with transcripts
- `sms_messages` - SMS message history
- `conversation_contexts` - Conversation memory with embeddings

See `supabase/migrations/` for detailed schema.

## Architecture

### Authentication Flow

1. User signs up with email/password
2. Email verification with OTP
3. Phone number verification via SMS
4. Service number selection from available pool
5. Agent configuration

### Call Flow

1. Inbound call → SignalWire webhook
2. Lookup contact, check whitelist
3. If whitelisted: transfer or AI handles
4. If unknown: AI vets caller (name, purpose)
5. Call recording & transcript stored
6. Conversation context updated with embeddings

### SMS Flow

1. Inbound SMS → SignalWire webhook
2. Lookup contact, retrieve conversation context
3. Generate AI response using OpenAI + context
4. Send SMS via SignalWire
5. Update conversation context

## Deployment

### Frontend (Netlify/Vercel)

```bash
npm run build
# Deploy dist/ folder
```

### Backend (Supabase)

1. Create Supabase project
2. Run migrations
3. Deploy Edge Functions
4. Configure webhooks

### Environment Variables

Required for production:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SIGNALWIRE_PROJECT_ID`
- `SIGNALWIRE_API_TOKEN`
- `RETELL_API_KEY`
- `OPENAI_API_KEY`

## Contributing

1. Follow TDD principles (tests first!)
2. Use ESLint and Prettier
3. Write clear commit messages
4. Update tests and documentation

## License

MIT

## Support

For issues and questions, please open a GitHub issue.