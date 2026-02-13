import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors()
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Migration SQLs
    const migrations = [
      {
        name: '060_pending_deletion_approvals',
        sql: `
CREATE TABLE IF NOT EXISTS pending_deletion_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deletion_record_id UUID REFERENCES numbers_to_delete(id) ON DELETE CASCADE,
  phone_numbers TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_phone TEXT NOT NULL,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'expired')),
  approval_sms_sid TEXT,
  approval_sms_sent_at TIMESTAMPTZ,
  response_received_at TIMESTAMPTZ,
  response_text TEXT,
  response_sms_sid TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS idx_pending_approvals_status ON pending_deletion_approvals(approval_status);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_admin_phone ON pending_deletion_approvals(admin_phone);
CREATE INDEX IF NOT EXISTS idx_pending_approvals_expires ON pending_deletion_approvals(expires_at);

ALTER TABLE pending_deletion_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON pending_deletion_approvals;
CREATE POLICY "Service role full access" ON pending_deletion_approvals
  FOR ALL USING (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS update_pending_deletion_approvals_updated_at ON pending_deletion_approvals;
CREATE TRIGGER update_pending_deletion_approvals_updated_at
  BEFORE UPDATE ON pending_deletion_approvals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
        `
      },
      {
        name: '061_unique_phone_in_deletion_queue',
        sql: `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_user_phone_in_deletion'
  ) THEN
    ALTER TABLE numbers_to_delete
    ADD CONSTRAINT unique_user_phone_in_deletion UNIQUE (user_id, phone_number);
  END IF;
END$$;
        `
      },
      {
        name: '062_add_purchased_at_to_deletion_queue',
        sql: `
ALTER TABLE numbers_to_delete
ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMPTZ;
        `
      },
      {
        name: '20251031120000_add_sip_credentials',
        sql: `
ALTER TABLE service_numbers
ADD COLUMN IF NOT EXISTS sip_username VARCHAR(255),
ADD COLUMN IF NOT EXISTS sip_password VARCHAR(255),
ADD COLUMN IF NOT EXISTS sip_domain VARCHAR(255) DEFAULT 'erik.signalwire.com',
ADD COLUMN IF NOT EXISTS sip_ws_server VARCHAR(255) DEFAULT 'wss://erik.signalwire.com:7443';
        `
      }
    ]

    const results = []

    for (const migration of migrations) {
      console.log(`Running migration: ${migration.name}`)

      try {
        const { data, error } = await supabaseClient.rpc('exec_sql', {
          sql_query: migration.sql
        })

        if (error) {
          // If exec_sql doesn't exist, we can't run migrations this way
          console.error(`Error in ${migration.name}:`, error)
          results.push({ migration: migration.name, status: 'error', error: error.message })
        } else {
          console.log(`✅ ${migration.name} completed`)
          results.push({ migration: migration.name, status: 'success' })
        }
      } catch (err) {
        console.error(`Exception in ${migration.name}:`, err)
        results.push({ migration: migration.name, status: 'error', error: String(err) })
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
