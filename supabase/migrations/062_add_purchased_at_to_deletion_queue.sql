-- Migration 062: Add purchased_at field to numbers_to_delete
-- This allows us to preserve the original purchase date when cancelling deletion

ALTER TABLE numbers_to_delete
ADD COLUMN purchased_at TIMESTAMPTZ;

COMMENT ON COLUMN numbers_to_delete.purchased_at IS 'Original purchase date of the number (preserved from service_numbers for accurate 30-day hold calculation)';
