#!/usr/bin/env node
/**
 * Headless test: multi-channel agent assignment (outbound_agent_id)
 *
 * Tests:
 * 1. DB column exists + FK works
 * 2. Can assign outbound_agent_id to a number
 * 3. Join query returns outbound_agent correctly
 * 4. Can clear outbound_agent_id (null)
 * 5. agent.py routing logic (simulated inline)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SYSTEM_AGENT_ID = '00000000-0000-0000-0000-000000000002';

let passed = 0;
let failed = 0;

function ok(label, value) {
  if (value) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}`);
    failed++;
  }
}

async function run() {
  console.log('\n=== Multi-Channel Agent Assignment Tests ===\n');

  // ── 1. Find a test number and a real agent ────────────────────────────────
  console.log('1. Setup: find test number + real agent');

  const { data: numbersArr } = await supabase
    .from('service_numbers')
    .select('id, phone_number, agent_id, user_id')
    .not('agent_id', 'is', null)
    .neq('agent_id', SYSTEM_AGENT_ID)
    .limit(1);
  const numbers = numbersArr?.[0] ?? null;

  ok('Found a provisioned number with real agent', !!numbers);
  if (!numbers) { summary(); return; }

  const numberId = numbers.id;
  const userId = numbers.user_id;
  const inboundAgentId = numbers.agent_id;
  console.log(`     Number: ${numbers.phone_number}, inbound agent: ${inboundAgentId}`);

  // Find a different agent for outbound
  const { data: agentsArr } = await supabase
    .from('agent_configs')
    .select('id, name')
    .eq('user_id', userId)
    .neq('id', inboundAgentId)
    .neq('id', SYSTEM_AGENT_ID)
    .limit(1);
  const agents = agentsArr?.[0] ?? null;

  ok('Found a second agent to use as outbound', !!agents);
  if (!agents) { summary(); return; }
  const outboundAgentId = agents.id;
  console.log(`     Outbound agent: ${agents.name} (${outboundAgentId})\n`);

  // ── 2. Assign outbound_agent_id ───────────────────────────────────────────
  console.log('2. Assign outbound_agent_id');

  const { error: assignErr } = await supabase
    .from('service_numbers')
    .update({ outbound_agent_id: outboundAgentId })
    .eq('id', numberId);

  ok('Update succeeded (no error)', !assignErr);
  if (assignErr) console.error('    ', assignErr.message);

  // ── 3. Join query (simulates what number-management.js runs) ──────────────
  console.log('\n3. Join query with outbound_agent FK');

  const { data: row, error: joinErr } = await supabase
    .from('service_numbers')
    .select(`
      id, phone_number, agent_id, outbound_agent_id, text_agent_id,
      agent:agent_configs!service_numbers_agent_id_fkey (id, name),
      outbound_agent:agent_configs!service_numbers_outbound_agent_id_fkey (id, name),
      text_agent:agent_configs!service_numbers_text_agent_id_fkey (id, name)
    `)
    .eq('id', numberId)
    .single();

  ok('Join query succeeded', !joinErr && !!row);
  if (joinErr) console.error('    ', joinErr.message);
  if (row) {
    ok('agent (inbound) joined correctly', row.agent?.id === inboundAgentId);
    ok('outbound_agent joined correctly', row.outbound_agent?.id === outboundAgentId);
    ok('text_agent is null (not assigned)', row.text_agent === null);
    console.log(`     agent: ${row.agent?.name}`);
    console.log(`     outbound_agent: ${row.outbound_agent?.name}`);
    console.log(`     text_agent: ${row.text_agent?.name ?? '(unassigned)'}`);
  }

  // ── 4. Simulate agent.py routing logic ────────────────────────────────────
  console.log('\n4. Simulate agent.py outbound routing logic');

  // Simulates what agent.py does at service_numbers lookup
  const { data: svcRow } = await supabase
    .from('service_numbers')
    .select('user_id, agent_id, outbound_agent_id')
    .eq('id', numberId)
    .eq('is_active', true)
    .limit(1)
    .single();

  const room_metadata = {};
  if (svcRow) {
    const agent_id = svcRow.agent_id;
    const outbound_agent_id_for_number = svcRow.outbound_agent_id;
    if (outbound_agent_id_for_number) room_metadata['outbound_agent_id'] = outbound_agent_id_for_number;
    if (agent_id) room_metadata['agent_id'] = agent_id;
  }

  ok('room_metadata.agent_id = inbound agent after lookup', room_metadata.agent_id === inboundAgentId);
  ok('room_metadata.outbound_agent_id set', room_metadata.outbound_agent_id === outboundAgentId);

  // Simulates the override block (after direction detected as outbound)
  const direction = 'outbound';
  if (direction === 'outbound') {
    const outbound_agent_override = room_metadata['outbound_agent_id'];
    if (outbound_agent_override) {
      room_metadata['agent_id'] = outbound_agent_override;
    }
  }

  ok('room_metadata.agent_id overridden to outbound agent for outbound call', room_metadata.agent_id === outboundAgentId);

  // Verify inbound calls are NOT overridden
  const room_metadata_inbound = { agent_id: inboundAgentId, outbound_agent_id: outboundAgentId };
  const direction_inbound = 'inbound';
  if (direction_inbound === 'outbound') {
    room_metadata_inbound['agent_id'] = room_metadata_inbound['outbound_agent_id'];
  }
  ok('Inbound calls keep original agent_id (no override)', room_metadata_inbound.agent_id === inboundAgentId);

  // ── 5. Clear outbound_agent_id (restore) ──────────────────────────────────
  console.log('\n5. Clear outbound_agent_id');

  const { error: clearErr } = await supabase
    .from('service_numbers')
    .update({ outbound_agent_id: null })
    .eq('id', numberId);

  ok('Can set outbound_agent_id back to null', !clearErr);

  const { data: cleared } = await supabase
    .from('service_numbers')
    .select('outbound_agent_id')
    .eq('id', numberId)
    .single();

  ok('outbound_agent_id is null after clear', cleared?.outbound_agent_id === null);

  // ── 6. FK violation rejected ───────────────────────────────────────────────
  console.log('\n6. FK constraint rejects invalid agent ID');

  const { error: fkErr } = await supabase
    .from('service_numbers')
    .update({ outbound_agent_id: '00000000-0000-0000-0000-000000000099' })
    .eq('id', numberId);

  ok('Invalid agent UUID rejected by FK', !!fkErr);
  if (fkErr) console.log(`     (Expected) error: ${fkErr.message}`);

  summary();
}

function summary() {
  console.log(`\n${'─'.repeat(44)}`);
  console.log(`  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
  console.log('─'.repeat(44));
  if (failed > 0) process.exit(1);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
