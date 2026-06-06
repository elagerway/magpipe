-- Automate per-number webhook scoping. api_key_numbers (added earlier) gates
-- which webhook key hears about which service number, but it was maintained by
-- hand. Instead, derive it from agent assignments: tag each agent with the
-- integration (api_key) that owns it, and let a trigger keep api_key_numbers in
-- sync whenever a number is assigned to / unassigned from an agent — through
-- ANY path (dashboard, API, admin).

-- 1. Which integration's webhook owns this agent's numbers' events.
alter table public.agent_configs
  add column if not exists api_key_id uuid references public.api_keys(id) on delete set null;

-- 2. Recompute a service number's webhook associations from its assigned agents.
create or replace function public.sync_api_key_numbers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := coalesce(NEW.user_id, OLD.user_id);
begin
  -- Clear associations for both the old and new number (covers a phone_number
  -- rename — else the OLD number keeps a stale association). NEW/OLD are NULL on
  -- DELETE/INSERT respectively; NULLs simply don't match in the IN list.
  delete from public.api_key_numbers akn
   where akn.service_number in (NEW.phone_number, OLD.phone_number)
     and akn.api_key_id in (select id from public.api_keys where user_id = uid);

  -- …then re-add one row per distinct owning key among the number's agents.
  if TG_OP <> 'DELETE' then
    insert into public.api_key_numbers (api_key_id, service_number)
    select distinct ac.api_key_id, NEW.phone_number
      from public.agent_configs ac
     where ac.api_key_id is not null
       and ac.id in (NEW.agent_id, NEW.text_agent_id, NEW.outbound_agent_id)
    on conflict do nothing;
  end if;

  return null; -- AFTER trigger
end;
$$;

drop trigger if exists trg_sync_api_key_numbers on public.service_numbers;
create trigger trg_sync_api_key_numbers
  after insert or delete or
        update of agent_id, text_agent_id, outbound_agent_id, phone_number
  on public.service_numbers
  for each row execute function public.sync_api_key_numbers();
