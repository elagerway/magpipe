-- Follow-up to 20260703_phone_verification_fully_disabled.sql.
--
-- That migration backfilled phone_verified=true for everyone to get past the
-- RLS gate, which made the flag lie for users with no phone number (Settings
-- showed "Tap to add ✓ Verified"). The correct split of concerns:
--
--   * is_phone_verified() = the platform ACCESS GATE. Returns true while
--     REQUIRE_PHONE_VERIFICATION=false, so all the RLS policies that call it
--     (20260318_require_phone_verified_rls.sql) pass without faking user rows.
--   * users.phone_verified = "this user proved ownership of phone_number via
--     SMS" (verify-phone-send/check). Stays meaningful for profile numbers,
--     default false, protected by prevent_self_phone_verify_trigger (only the
--     service role — i.e. verify-phone-check — can set it true).
--
-- RE-ENABLE the gate: flip REQUIRE_PHONE_VERIFICATION in feature-flags.js and
-- restore the original is_phone_verified() body (in the comment below).

CREATE OR REPLACE FUNCTION public.is_phone_verified()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  -- Phone-verification GATE disabled 2026-07-03 (REQUIRE_PHONE_VERIFICATION=false).
  -- users.phone_verified keeps its honest meaning ("verified a number via SMS");
  -- this gate just no longer blocks access. Original body (for re-enable):
  --   SELECT COALESCE((SELECT phone_verified FROM public.users WHERE id = auth.uid()), false)
  SELECT true
$function$;

UPDATE public.users SET phone_verified = false WHERE phone_number IS NULL OR phone_number = '';
ALTER TABLE public.users ALTER COLUMN phone_verified SET DEFAULT false;

CREATE TRIGGER prevent_self_phone_verify_trigger
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION prevent_self_phone_verify();
