# Research: Pat AI Call & SMS Agent PWA

## Overview
Research findings for technical decisions and best practices for building a Progressive Web App that provides AI-powered call and SMS handling with minimal dependencies.

## 1. Telephony Integration

### Decision: Twilio for Call and SMS Infrastructure

**Rationale**:
- Industry-leading programmable voice and SMS APIs
- WebRTC-compatible voice SDK for browser-based calls
- Comprehensive webhook system for inbound call/SMS events
- Phone number provisioning and management
- Call recording and transcription services built-in
- Strong documentation and developer ecosystem

**Alternatives Considered**:
- **Vonage/Nexmo**: Similar capabilities but less robust WebRTC browser support
- **Plivo**: Lower cost but fewer features for AI integration
- **SignalWire**: Good technology but smaller ecosystem

**Implementation Approach**:
- Use Twilio Programmable Voice for inbound call handling
- Use Twilio SMS API for text message management
- Implement Twilio webhooks as Supabase Edge Functions
- Use Twilio Voice JavaScript SDK for browser-based agent configuration

## 2. AI Conversation Engine

### Decision: OpenAI Realtime API with GPT-4o for Voice

**Rationale**:
- Native speech-to-speech capabilities with <500ms latency
- Built-in conversation context management
- Function calling for actions (transfer call, lookup contact)
- Kate voice available (as specified in requirements)
- Streaming responses enable natural conversation flow

**Alternatives Considered**:
- **Assembly AI + GPT-4**: Two-step process adds latency
- **Google Dialogflow**: Less flexible for custom logic
- **Anthropic Claude + ElevenLabs**: Higher complexity, separate services

**Implementation Approach**:
- Use OpenAI Realtime API for voice conversations
- Use GPT-4 text API for SMS responses
- Implement function calling for contact lookup, call transfer
- Store conversation transcripts in Supabase

## 3. Authentication System

### Decision: Supabase Auth with OAuth Providers

**Rationale**:
- Built-in support for email/password and OAuth (Google, Github, Facebook, LinkedIn)
- Email confirmation flows included
- JWT token management
- Row-level security integration with database
- No additional auth library needed

**Alternatives Considered**:
- **Auth0**: More features but adds external dependency
- **Firebase Auth**: Vendor lock-in concerns
- **Custom implementation**: High complexity, security risks

**Implementation Approach**:
- Configure OAuth providers in Supabase dashboard
- Use Supabase JS client for auth flows
- Implement email confirmation with built-in templates
- Store user metadata in users table with RLS policies

## 4. Progressive Web App Architecture

### Decision: Vanilla JavaScript with ES Modules + Service Worker

**Rationale**:
- Aligns with minimal dependency requirement
- Modern browser support (ES6+) enables clean code
- Service Worker API provides offline capability
- No build step required for development (optional for production)
- Clear, debuggable code without framework abstractions

**Alternatives Considered**:
- **Svelte**: Minimal runtime but adds build complexity
- **Lit**: Web components standard but still a library
- **Alpine.js**: Lightweight but adds dependency

**Implementation Approach**:
- Use ES6 modules for code organization
- Implement custom router for SPA navigation
- Use Service Worker for offline history viewing and app caching
- Web Components for reusable UI elements (native custom elements)
- CSS Grid and Flexbox for responsive layouts

## 5. Testing Strategy

### Decision: Playwright for E2E, Vitest for Unit Tests

**Rationale**:
- **Playwright**: Best-in-class browser testing with mobile emulation
- **Vitest**: Fast, ESM-native, minimal config, compatible with vanilla JS
- Both tools have excellent TypeScript/JavaScript support
- Playwright can test PWA installation flows

**Alternatives Considered**:
- **Web Test Runner**: Good but less feature-rich than Vitest
- **Jest**: Slower, ESM support still evolving
- **Cypress**: Good but heavier than Playwright

**Implementation Approach**:
- Vitest for unit tests of models, utilities, validation
- Playwright for integration tests of complete user flows
- Playwright for contract tests of Supabase and Twilio APIs
- Mock service worker (MSW) for API mocking in tests

## 6. Contact Access Strategy

### Decision: Contact Picker API with Manual Entry Fallback

**Rationale**:
- Native browser API (Contact Picker) for privacy-preserving contact access
- No permissions popup required (user explicitly selects contacts)
- Works on Android Chrome, progressive enhancement for unsupported browsers
- Manual entry fallback ensures universal functionality

**Alternatives Considered**:
- **Direct phone contacts API**: Not available in web browsers
- **Manual entry only**: Poor UX for users with many contacts
- **Upload contacts file**: Privacy concerns, complex parsing

**Implementation Approach**:
- Use Contact Picker API where supported
- Provide manual contact entry form as fallback
- Store contacts in Supabase with user_id foreign key
- Implement contact sync/update flow

## 7. Phone Number Verification

### Decision: Twilio Verify API

**Rationale**:
- Purpose-built for phone verification flows
- Handles SMS delivery, retry logic, code expiration
- Rate limiting and fraud prevention built-in
- Integrates with Twilio telephony stack

**Alternatives Considered**:
- **Custom SMS**: Requires managing verification logic and security
- **Firebase Phone Auth**: Adds separate service dependency

**Implementation Approach**:
- Call Twilio Verify API from Supabase Edge Function
- Store verification status in users table
- Implement 10-minute code expiration
- Allow 3 retry attempts before cooldown

## 8. Real-Time Updates

### Decision: Supabase Realtime for Call/SMS Notifications

**Rationale**:
- Built into Supabase, no additional service needed
- PostgreSQL replication for real-time data changes
- WebSocket-based, efficient for battery and bandwidth
- Can notify app when new calls/SMS arrive

**Alternatives Considered**:
- **Polling**: Inefficient, poor UX
- **Pusher/Ably**: Adds external dependency and cost
- **WebSockets (custom)**: Complex infrastructure management

**Implementation Approach**:
- Subscribe to call_records and sms_messages tables
- Trigger UI updates when new records inserted
- Display notifications when app is in background
- Use Service Worker for background sync

## 9. Voice Recording and Storage

### Decision: Twilio Recording + Supabase Storage

**Rationale**:
- Twilio automatically records calls with single API parameter
- Supabase Storage provides S3-compatible object storage
- Download recording from Twilio, upload to Supabase for long-term storage
- Keeps data in one ecosystem (Supabase)

**Alternatives Considered**:
- **Store on Twilio**: Additional cost, harder to manage lifecycle
- **CloudFlare R2**: Adds another service
- **Direct S3**: Requires AWS setup

**Implementation Approach**:
- Enable recording on Twilio call configuration
- Webhook triggers when recording available
- Edge Function downloads from Twilio, uploads to Supabase Storage
- Store file URL in call_records table

## 10. Conversation Context & Memory

### Decision: Vector Embeddings in Supabase pgvector

**Rationale**:
- pgvector extension provides vector similarity search in PostgreSQL
- Store conversation summaries as embeddings
- Retrieve relevant context for current conversation via semantic search
- All data stays in Supabase (no external vector DB)

**Alternatives Considered**:
- **Pinecone/Weaviate**: External service, additional cost
- **Simple text search**: Less accurate context retrieval
- **Store all transcripts**: Token limit issues for AI

**Implementation Approach**:
- Generate embeddings of conversation summaries using OpenAI
- Store embeddings in conversation_context table with pgvector
- On inbound call, search for similar past conversations
- Provide context to OpenAI as system/user messages

## 11. Bundle Optimization

### Decision: esbuild for Production Builds

**Rationale**:
- Extremely fast bundler written in Go
- Minimal configuration for vanilla JS
- Tree-shaking and minification built-in
- Can hit <50MB constraint easily with code splitting

**Alternatives Considered**:
- **No bundler**: Works but no optimization
- **Rollup**: Slower than esbuild
- **Webpack**: Over-engineered for this use case

**Implementation Approach**:
- Use esbuild for production builds only
- Implement code splitting by route
- Minify CSS and HTML
- Compress with gzip/brotli

## 12. Error Tracking and Monitoring

### Decision: Sentry for Error Tracking

**Rationale**:
- Industry standard for JavaScript error tracking
- Browser SDK is lightweight (~20KB)
- Source map support for debugging minified code
- Integrates with Supabase and Twilio

**Alternatives Considered**:
- **LogRocket**: Heavier, session replay overkill
- **Custom logging**: Misses client-side errors
- **Rollbar**: Similar but smaller ecosystem

**Implementation Approach**:
- Initialize Sentry SDK in app entry point
- Capture unhandled errors and promise rejections
- Add custom error boundaries for UI
- Tag errors with user ID for tracking

## Implementation Roadmap Summary

1. **Core Infrastructure**: Supabase project setup, database schema, authentication
2. **Telephony Integration**: Twilio account, phone number, webhook endpoints
3. **PWA Foundation**: Service worker, manifest, offline support
4. **Authentication Flow**: Registration, email confirmation, SSO, login
5. **Phone Verification**: Number entry, SMS verification, number linking
6. **Agent Configuration**: Voice/text interface for Pat setup
7. **Call Handling**: Inbound webhook, OpenAI Realtime, screening logic
8. **SMS Handling**: Inbound webhook, GPT-4 responses, context retrieval
9. **History Views**: Call/SMS lists, playback, transcript display
10. **Testing & Validation**: Contract tests, integration tests, E2E tests

---

**Phase 0 Complete** - All technical decisions documented with rationale and alternatives.