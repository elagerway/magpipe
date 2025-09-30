-- Create phone number pool table for pre-provisioned US numbers
CREATE TABLE IF NOT EXISTS phone_number_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT UNIQUE NOT NULL,
  phone_sid TEXT UNIQUE NOT NULL,
  area_code TEXT NOT NULL,
  city TEXT,
  status TEXT NOT NULL CHECK (status IN ('provisioning', 'ready', 'assigned', 'failed')),
  campaign_id TEXT,
  assigned_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX idx_phone_pool_status ON phone_number_pool(status);
CREATE INDEX idx_phone_pool_area_code ON phone_number_pool(area_code);
CREATE INDEX idx_phone_pool_assigned_user ON phone_number_pool(assigned_to_user_id);

-- Function to get available number from pool
CREATE OR REPLACE FUNCTION get_available_pool_number(preferred_area_code TEXT DEFAULT NULL)
RETURNS TABLE (
  phone_number TEXT,
  phone_sid TEXT,
  area_code TEXT
) AS $$
BEGIN
  -- Try to get a number with preferred area code first
  IF preferred_area_code IS NOT NULL THEN
    RETURN QUERY
    SELECT p.phone_number, p.phone_sid, p.area_code
    FROM phone_number_pool p
    WHERE p.status = 'ready'
      AND p.area_code = preferred_area_code
      AND p.assigned_to_user_id IS NULL
    ORDER BY p.created_at ASC
    LIMIT 1;

    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  -- Fall back to any available number
  RETURN QUERY
  SELECT p.phone_number, p.phone_sid, p.area_code
  FROM phone_number_pool p
  WHERE p.status = 'ready'
    AND p.assigned_to_user_id IS NULL
  ORDER BY p.created_at ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE phone_number_pool IS 'Pre-provisioned US phone numbers ready for campaign assignment';
COMMENT ON COLUMN phone_number_pool.status IS 'provisioning: just purchased, waiting 1hr | ready: added to campaign, available for assignment | assigned: given to user | failed: campaign assignment failed';
