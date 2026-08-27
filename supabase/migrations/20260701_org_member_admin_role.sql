-- Allow the 'admin' org role (issue #116). organization_members.role had a CHECK
-- constraint limited to owner/editor/support, so inviting/assigning 'admin' failed
-- with "violates check constraint organization_members_role_check". Add 'admin'.
-- Applied live 2026-07-01 (schema history frozen — this file is the record).

ALTER TABLE public.organization_members DROP CONSTRAINT IF EXISTS organization_members_role_check;
ALTER TABLE public.organization_members ADD CONSTRAINT organization_members_role_check
  CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'support'::text]));
