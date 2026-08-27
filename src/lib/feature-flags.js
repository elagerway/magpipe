/**
 * Feature flags — simple toggles for features that may be temporarily disabled.
 * Flip the value and redeploy to re-enable.
 */

/**
 * Require phone number verification before accessing the app.
 *
 * RE-ENABLE CHECKLIST:
 * 1. Set this flag to `true` and redeploy frontend.
 * 2. **CRITICAL — restore the DB gate.** is_phone_verified() is currently hardcoded
 *    to `SELECT true` (20260703_phone_verified_honest_meaning.sql), so the RLS
 *    policies that call it pass for everyone. Until you restore its real body the
 *    frontend redirect is the ONLY gate and unverified users keep full API/MCP data
 *    access. Restore:
 *      CREATE OR REPLACE FUNCTION public.is_phone_verified() RETURNS boolean
 *        LANGUAGE sql STABLE SECURITY DEFINER AS $$
 *          SELECT COALESCE((SELECT phone_verified FROM public.users WHERE id = auth.uid()), false)
 *        $$;
 * 3. Column default + gate trigger were already restored by that same migration
 *    (default false; prevent_self_phone_verify_trigger re-created), so no change
 *    needed there. handle_new_user() omits phone_verified from its INSERT (follows
 *    the column default), so it needs no change either.
 * 4. Decide on a phone_verified backfill: after step 2, every user currently
 *    phone_verified=false (most of them) is gated out until they verify.
 */
export const REQUIRE_PHONE_VERIFICATION = false;

/**
 * Route Gmail "Connect" through Composio (managed OAuth + token vault) instead
 * of our own Google OAuth client. Set to `true` to off-load CASA Tier 2 review
 * to Composio; users see "Composio" on Google's consent screen.
 *
 * Existing user_integrations rows created via the direct flow keep their
 * stored tokens and continue to work via the legacy send paths. New connects
 * write a row with `config.composio_managed = true` and tokens NULL — the
 * Composio-aware send paths look up the connection_id and call Composio's
 * tools/execute API.
 *
 * REVERT CHECKLIST: flip to `false`, redeploy frontend. Existing Composio
 * connections continue to work; new connects go back through the direct flow.
 */
export const USE_COMPOSIO_FOR_GMAIL = true;
