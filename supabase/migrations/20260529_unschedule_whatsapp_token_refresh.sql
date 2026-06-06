-- Remove the monthly WhatsApp token-refresh cron.
--
-- It belonged to the old user-token model where access tokens expired ~60 days
-- and had to be renewed via fb_exchange_token. We now use a never-expiring
-- System User token, so there is nothing to refresh — and running the exchange
-- against a system token risks downgrading it to an expiring one. Token death
-- is now caught by whatsapp-health-check (every 30 min) instead.
select cron.unschedule('refresh-whatsapp-tokens')
where exists (select 1 from cron.job where jobname = 'refresh-whatsapp-tokens');
