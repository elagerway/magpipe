-- Migration 061: Add unique constraint to prevent duplicate phone numbers in deletion queue
-- A phone number should only appear once in numbers_to_delete per user

-- Add unique constraint on (user_id, phone_number)
-- This prevents the same number from being queued multiple times by the same user
ALTER TABLE numbers_to_delete
ADD CONSTRAINT unique_user_phone_in_deletion UNIQUE (user_id, phone_number);

-- Comment explaining the constraint
COMMENT ON CONSTRAINT unique_user_phone_in_deletion ON numbers_to_delete IS
  'Ensures each phone number can only appear once in deletion queue per user, preventing duplicates from double-clicks or retries';
