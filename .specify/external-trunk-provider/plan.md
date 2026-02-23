# Implementation Plan: External Trunk Provider Dropdown

**Branch**: `master` | **Date**: 2026-02-16 | **Status**: COMPLETED

## Summary
Replace the free-text "Provider" field in External Trunk Settings with a dropdown so users select their provider (Twilio, SignalWire, or Generic SIP) and see the right credential fields. Auto-fill SIP defaults per provider.

## Technical Context
**Language/Version**: JavaScript ES6+ (frontend), TypeScript (edge functions), SQL (migrations)
**Primary Dependencies**: Supabase Edge Functions, LiveKit SIP SDK
**Storage**: PostgreSQL (Supabase) — `external_sip_trunks` table
**Testing**: Playwright (8 browser tests)
**Target Platform**: Web (desktop + mobile PWA)
**Project Type**: Web application (frontend + backend)

## Files Modified

| File | Change |
|------|--------|
| `src/components/ExternalTrunkSettings.js` | Provider dropdown, dynamic fields, contact-modal-* pattern, showConfirmModal() |
| `supabase/functions/manage-external-trunk/index.ts` | Accept `provider_space_url`, validate provider enum |
| `supabase/migrations/20260216_external_trunk_provider_fields.sql` | Add columns, constrain provider |
| `tests/test-external-trunk-provider.spec.cjs` | 8 Playwright tests |

## Database Changes

**Migration**: `20260216_external_trunk_provider_fields.sql`

New columns on `external_sip_trunks`:
- `api_account_sid` TEXT — Twilio Account SID or SignalWire Project ID
- `api_auth_token_encrypted` TEXT — Twilio Auth Token or SignalWire API Token
- `provider_space_url` TEXT — SignalWire space URL

Provider constraint:
- Normalized existing values to `'other'`
- `provider NOT NULL DEFAULT 'other'`
- `CHECK (provider IN ('twilio', 'signalwire', 'other'))`

## Frontend Design

### Provider Dropdown
`<select>` with three options:
- **Twilio** — shows: Account SID, Auth Token
- **SignalWire** — shows: Space URL, Project ID, API Token
- **Other / Generic SIP** — shows: auth type toggle (IP/Registration), outbound server

### Auto-fill SIP Defaults

| Provider | Outbound Server | Transport |
|----------|----------------|-----------|
| Twilio | `us1.pstn.twilio.com` | TLS |
| SignalWire | `{space}.signalwire.com` | TLS |
| Other | User-entered | User-selected |

### Save Logic
- Twilio: `auth_username` = Account SID, `auth_password` = Auth Token
- SignalWire: `auth_username` = Project ID, `auth_password` = API Token, `outbound_address` = space URL
- Both: also store in `api_account_sid` / `api_auth_token` for future API use
- Other: existing logic unchanged

### Modal Pattern
- Migrated from `.add-trunk-modal*` to `contact-modal-overlay` / `contact-modal` / `contact-modal-header` / `contact-modal-body scrollable` / `contact-modal-footer`
- Replaced native `confirm()` with `showConfirmModal()` (delete trunk, remove number)

### Trunk Card Display
- `twilio` → "Twilio"
- `signalwire` → "SignalWire"
- `other` → "Generic SIP"

## Edge Function Changes

- Added `provider_space_url` to `CreateTrunkRequest` and `UpdateTrunkRequest` interfaces
- Typed `provider` as `'twilio' | 'signalwire' | 'other'`
- Server-side validation: rejects unknown provider values
- Included `provider_space_url` in DB insert/update

## Testing

8 Playwright tests (`tests/test-external-trunk-provider.spec.cjs`):
1. Phone page loads External SIP Trunks section
2. Add Trunk modal opens with provider dropdown (3 options)
3. Twilio shows Account SID + Auth Token fields
4. SignalWire shows Space URL + Project ID + API Token fields
5. Other shows auth type toggle + outbound server
6. Modal footer stays fixed with action buttons
7. Close modal via X button
8. Switching providers updates fields dynamically

**All 8 passing.**

## Progress Tracking

- [x] Phase 0: Research complete
- [x] Phase 1: Design complete
- [x] Phase 2: Implementation complete
- [x] Phase 3: Testing complete (8/8 Playwright tests passing)
- [x] Phase 4: Deployed (migration applied, edge function deployed, committed to master)

## Commit
`3da59f1` — Add provider dropdown for external trunk settings (Twilio, SignalWire, Generic SIP)
