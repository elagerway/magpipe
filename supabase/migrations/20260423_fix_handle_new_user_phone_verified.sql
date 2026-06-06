-- Fix handle_new_user to explicitly insert phone_verified = false.
--
-- Why: public.users.phone_verified has a column default of `true`, but the
-- prevent_self_phone_verify trigger (migrations 20260318*) blocks any INSERT
-- where NEW.phone_verified = true unless the JWT claim role is 'service_role'.
-- When auth.admin.createUser() fires the on_auth_user_created trigger, the DB
-- session has no JWT claim set, so the insert falls through to the default,
-- trips the guard, and fails with "phone_verified cannot be set directly".
--
-- This broke admin-portal → Create User. It also would have broken any other
-- admin.createUser() code path that relies on the column default. Setting it
-- explicitly to false matches the actual signup semantics — every real user
-- must still verify their phone via OTP — so there is no functional change
-- for end users.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.users (id, email, name, credits_balance, received_signup_bonus, phone_verified)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    0,
    false,
    false
  );
  RETURN NEW;
END;
$function$;
