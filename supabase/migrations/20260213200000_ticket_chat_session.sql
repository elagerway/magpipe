-- Link support tickets to chat sessions so replies can be posted back into the widget
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS chat_session_id UUID;

-- Human-readable ticket reference numbers (TKT-001001, TKT-001002, ...)
CREATE SEQUENCE IF NOT EXISTS support_ticket_ref_seq START WITH 1001;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS ticket_ref TEXT;

CREATE OR REPLACE FUNCTION nextval_ticket_ref() RETURNS bigint LANGUAGE sql AS $$
  SELECT nextval('support_ticket_ref_seq')
$$;
