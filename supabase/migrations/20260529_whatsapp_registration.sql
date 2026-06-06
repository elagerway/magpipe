-- WhatsApp Cloud API registration tracking.
-- whatsapp-connect now registers the number (POST /{phone_number_id}/register)
-- with a 6-digit 2-step-verification PIN. We store the PIN so the number can be
-- re-registered after a deregistration (error 133010), and track whether the
-- number is currently registered on the Cloud API.
alter table public.whatsapp_accounts
  add column if not exists two_step_pin text,
  add column if not exists registered boolean not null default false;

comment on column public.whatsapp_accounts.two_step_pin is
  'The 6-digit 2-step verification PIN we set during registration, used to re-register the number on the Cloud API.';
comment on column public.whatsapp_accounts.registered is
  'Whether the number is currently registered on the WhatsApp Cloud API. Set false on a 133010 "Account not registered" send failure.';
