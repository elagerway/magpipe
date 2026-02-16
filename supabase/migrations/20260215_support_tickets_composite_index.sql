-- Composite index to speed up the most common ticket list query pattern:
-- filter by status, sort by received_at DESC
CREATE INDEX IF NOT EXISTS idx_support_tickets_status_received
ON support_tickets(status, received_at DESC);
