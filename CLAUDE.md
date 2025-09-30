# pat Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-09-29

## Active Technologies
- JavaScript ES6+, HTML5, CSS3 (vanilla, minimal framework usage per user requirement) + Supabase JS Client (auth, database, realtime), Service Worker API (PWA), Web Audio API (voice), WebRTC (real-time voice communication), Signalwire (custom telephony integration for calls/SMS - to be researched), Retellai.com (AI agent) (Pat-AI)

## Project Structure
```
src/
tests/
```

## Commands
npm test [ONLY COMMANDS FOR ACTIVE TECHNOLOGIES][ONLY COMMANDS FOR ACTIVE TECHNOLOGIES] npm run lint

## Code Style
JavaScript ES6+, HTML5, CSS3 (vanilla, minimal framework usage per user requirement): Follow standard conventions

## Recent Changes
- Pat-AI: Added JavaScript ES6+, HTML5, CSS3 (vanilla, minimal framework usage per user requirement) + Supabase JS Client (auth, database, realtime), Service Worker API (PWA), Web Audio API (voice), WebRTC (real-time voice communication), Signalwire (custom telephony integration for calls/SMS - to be researched), Retellai.com (AI agent)

<!-- MANUAL ADDITIONS START -->
## User Interface Guidelines
- **Never expose vendor names in user-facing messages**: Do not mention third-party service names like "Retell", "SignalWire", "OpenAI", etc. in error messages, success messages, or any UI text visible to end users
- Use product-centric language: "Pat AI assistant", "your number", "activate", "deactivate"
- Keep technical implementation details in backend logs only

## Database Management
- **Always handle database migrations and deployments**: When migrations are created or modified, automatically deploy them using `export SUPABASE_ACCESS_TOKEN=sbp_17bff30d68c60e941858872853988d63169b2649 && npx supabase db push` or `npx supabase db reset --linked` (with 'y' confirmation)
- Never ask the user to run database commands - execute them directly
<!-- MANUAL ADDITIONS END -->