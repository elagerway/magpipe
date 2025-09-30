-- Create a reusable function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers to all tables with updated_at column

-- Users table
CREATE TRIGGER set_updated_at_users
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Contacts table
CREATE TRIGGER set_updated_at_contacts
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Agent configs table
CREATE TRIGGER set_updated_at_agent_configs
  BEFORE UPDATE ON public.agent_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Conversation contexts table (update last_updated as well)
CREATE OR REPLACE FUNCTION public.handle_conversation_context_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.last_updated = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_conversation_contexts
  BEFORE UPDATE ON public.conversation_contexts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_conversation_context_update();

-- Comments
COMMENT ON FUNCTION public.handle_updated_at() IS 'Automatically updates updated_at timestamp on row modification';
COMMENT ON FUNCTION public.handle_conversation_context_update() IS 'Updates both updated_at and last_updated for conversation contexts';