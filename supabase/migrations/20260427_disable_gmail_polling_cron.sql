-- Disable the every-5-min Gmail polling cron jobs.
-- Replaced by the Composio Gmail trigger (composio-trigger-webhook), which
-- fires within ~110s of an inbound email landing in the connected mailbox.
-- Verified end-to-end on 2026-04-27 with cron disabled — webhook path alone
-- creates the support_tickets row and sends the AI reply via Composio's
-- GMAIL_REPLY_TO_THREAD action.
--
-- Re-enable (if the trigger ever needs a fallback):
--   select cron.alter_job(job_id := <jobid>, active := true);
-- Both jobs are kept (not unscheduled) so the schedule + command survive
-- in cron.job for easy reactivation.

do $$
declare
  poll_tickets_job int;
  poll_inbox_job int;
begin
  select jobid into poll_tickets_job from cron.job
    where command ilike '%poll-gmail-tickets%' limit 1;
  select jobid into poll_inbox_job from cron.job
    where command ilike '%poll-gmail-inbox%' limit 1;

  if poll_tickets_job is not null then
    perform cron.alter_job(job_id := poll_tickets_job, active := false);
    raise notice 'Disabled cron job % (poll-gmail-tickets)', poll_tickets_job;
  end if;
  if poll_inbox_job is not null then
    perform cron.alter_job(job_id := poll_inbox_job, active := false);
    raise notice 'Disabled cron job % (poll-gmail-inbox)', poll_inbox_job;
  end if;
end
$$;
