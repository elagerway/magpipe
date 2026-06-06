-- Add moddatetime trigger so updated_at tracks actual row updates on call_whitelist.
-- The original migration set updated_at with DEFAULT NOW() only, which never changes on UPDATE.

CREATE TRIGGER set_call_whitelist_updated_at
  BEFORE UPDATE ON call_whitelist
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);
