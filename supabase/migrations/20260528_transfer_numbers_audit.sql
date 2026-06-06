-- Audit trail for transfer_numbers edits.
--
-- Context: on 2026-05-28 the "Erik" transfer target was rewritten several
-- times within an hour (+15555550101 → +15555550102 → +15555550100) with
-- no trace — UI/app edits don't bump updated_at and there was no history
-- table, so the source was untraceable. This logs every insert/update/
-- delete with the old→new phone number and the request identity (Postgres
-- role + PostgREST JWT claims) so any future change can be attributed.

create table if not exists public.transfer_numbers_audit (
  id                 bigint generated always as identity primary key,
  transfer_number_id uuid,
  user_id            uuid,
  label              text,
  operation          text not null,            -- INSERT | UPDATE | DELETE
  old_phone_number   text,
  new_phone_number   text,
  changed_by_role    text,                     -- current_user: authenticated / service_role / postgres
  changed_by_jwt     jsonb,                    -- request.jwt.claims (sub/email/role) when via the API
  changed_at         timestamptz not null default now()
);

create index if not exists transfer_numbers_audit_tn_id_idx
  on public.transfer_numbers_audit (transfer_number_id, changed_at desc);

-- Lock the audit table down: enable RLS with no policies so it's reachable
-- only by service_role / admin (which bypass RLS), never via the public API.
alter table public.transfer_numbers_audit enable row level security;

create or replace function public.log_transfer_number_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claims jsonb;
begin
  -- request.jwt.claims is set by PostgREST on API calls; absent for direct SQL.
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    v_claims := null;
  end;

  if (tg_op = 'DELETE') then
    insert into public.transfer_numbers_audit
      (transfer_number_id, user_id, label, operation, old_phone_number, new_phone_number, changed_by_role, changed_by_jwt)
    values (old.id, old.user_id, old.label, tg_op, old.phone_number, null, current_user, v_claims);
    return old;
  elsif (tg_op = 'UPDATE') then
    if (new.phone_number is distinct from old.phone_number)
       or (new.label is distinct from old.label) then
      insert into public.transfer_numbers_audit
        (transfer_number_id, user_id, label, operation, old_phone_number, new_phone_number, changed_by_role, changed_by_jwt)
      values (new.id, new.user_id, new.label, tg_op, old.phone_number, new.phone_number, current_user, v_claims);
    end if;
    return new;
  else -- INSERT
    insert into public.transfer_numbers_audit
      (transfer_number_id, user_id, label, operation, old_phone_number, new_phone_number, changed_by_role, changed_by_jwt)
    values (new.id, new.user_id, new.label, tg_op, null, new.phone_number, current_user, v_claims);
    return new;
  end if;
end;
$$;

drop trigger if exists trg_transfer_numbers_audit on public.transfer_numbers;
create trigger trg_transfer_numbers_audit
  after insert or update or delete on public.transfer_numbers
  for each row execute function public.log_transfer_number_change();
