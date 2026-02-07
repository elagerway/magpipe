-- Rename custom_instructions to functions and consolidate function configs
-- This migration:
-- 1. Renames custom_instructions column to functions
-- 2. Migrates end_call_enabled/end_call_description into the functions JSON
-- 3. Drops the separate end_call columns

-- Step 1: Rename the column
ALTER TABLE agent_configs RENAME COLUMN custom_instructions TO functions;

-- Step 2: Migrate end_call settings into functions JSON
UPDATE agent_configs
SET functions = COALESCE(functions, '{}'::jsonb) || jsonb_build_object(
  'end_call', jsonb_build_object(
    'enabled', COALESCE(end_call_enabled, true),
    'description', end_call_description
  )
)
WHERE end_call_enabled IS NOT NULL OR end_call_description IS NOT NULL;

-- Step 3: Drop the separate columns (they're now in functions.end_call)
ALTER TABLE agent_configs DROP COLUMN IF EXISTS end_call_enabled;
ALTER TABLE agent_configs DROP COLUMN IF EXISTS end_call_description;

-- Add comment documenting the functions structure
COMMENT ON COLUMN agent_configs.functions IS 'Agent function configurations: {
  end_call: { enabled: bool, description: string },
  transfer: { enabled: bool, numbers: [{number, label, description}], description: string },
  sms: { enabled: bool, description: string, templates: [] },
  extract_data: { enabled: bool, schema: {}, description: string },
  booking: { enabled: bool, calendar_id: string, description: string, get_availability: { enabled: bool, description: string } }
}';
