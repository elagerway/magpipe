-- Per-number webhook scoping. Multiple distinct businesses can live under one
-- Magpipe account (each with their own API key + webhook_url), but webhook
-- dispatch was per-account: every key with a webhook_url received every
-- inbound/outbound SMS for ALL of the account's numbers — cross-customer leakage.
--
-- This table lets a key opt into specific numbers. Semantics (enforced in
-- _shared/webhook-dispatcher.ts):
--   • a key with >=1 row here receives number-scoped events ONLY for its numbers
--   • a key with no rows receives all of the account's events (backward-compatible)
-- So adding rows tightens a key; existing keys are unaffected until associated.
create table if not exists public.api_key_numbers (
  api_key_id     uuid        not null references public.api_keys(id) on delete cascade,
  service_number text        not null,  -- E.164, matched against the event's data.service_number
  created_at     timestamptz not null default now(),
  primary key (api_key_id, service_number)
);

create index if not exists idx_api_key_numbers_number on public.api_key_numbers (service_number);
