-- Admin notification configuration (singleton row)
-- Centralizes notification preferences for tickets, signups, and vendor status alerts

CREATE TABLE IF NOT EXISTS admin_notification_config (
  id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000100'::uuid,

  -- Delivery channels (shared across categories)
  sms_phone TEXT,
  email_address TEXT,
  slack_channel TEXT,           -- e.g. "#admin-alerts"

  -- Ticket alerts
  tickets_sms BOOLEAN DEFAULT false,
  tickets_email BOOLEAN DEFAULT false,
  tickets_slack BOOLEAN DEFAULT false,

  -- New user signup alerts
  signups_sms BOOLEAN DEFAULT false,
  signups_email BOOLEAN DEFAULT false,
  signups_slack BOOLEAN DEFAULT false,

  -- Vendor status change alerts
  vendor_status_sms BOOLEAN DEFAULT false,
  vendor_status_email BOOLEAN DEFAULT false,
  vendor_status_slack BOOLEAN DEFAULT false,

  -- Last known vendor status (JSON: {"SignalWire":"operational", ...})
  vendor_status_cache JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed empty row
INSERT INTO admin_notification_config (id) VALUES ('00000000-0000-0000-0000-000000000100')
ON CONFLICT (id) DO NOTHING;

-- Migrate existing ticket SMS settings from support_email_config
UPDATE admin_notification_config SET
  sms_phone = sec.sms_alert_phone,
  tickets_sms = sec.sms_alert_enabled
FROM support_email_config sec
WHERE sec.id = '00000000-0000-0000-0000-000000000001'::uuid
  AND admin_notification_config.id = '00000000-0000-0000-0000-000000000100'::uuid;
