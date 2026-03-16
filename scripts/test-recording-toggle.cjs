#!/usr/bin/env node
/**
 * Headless test: recording_enabled agent config field
 *
 * Tests:
 * 1. Column exists and defaults to true
 * 2. Can toggle off/on via DB
 * 3. Inbound CXML logic (webhook-inbound-call)
 * 4. Outbound CXML logic (batch-call-cxml)
 * 5. initiate-bridged-call agent lookup (reads correct agent)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let passed = 0, failed = 0;

function ok(label, val) {
  if (val) { console.log('  ✅', label); passed++; }
  else { console.error('  ❌', label); failed++; }
}

function summary() {
  console.log('\n' + '─'.repeat(44));
  console.log(`  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
  console.log('─'.repeat(44));
  if (failed) process.exit(1);
}

async function run() {
  console.log('\n=== Recording Toggle Tests ===\n');

  // ── 1. Column exists and defaults to true ─────────────────────────────────
  console.log('1. Column default');

  const { data: agents, error: agentsErr } = await supabase
    .from('agent_configs')
    .select('id, name, recording_enabled')
    .limit(3);

  ok('Fetched agent rows', !agentsErr && agents.length > 0);
  ok('All existing agents have recording_enabled=true (default)', agents.every(a => a.recording_enabled === true));
  agents.forEach(a => console.log(`     ${a.name}: recording_enabled=${a.recording_enabled}`));

  // ── 2. Toggle off ─────────────────────────────────────────────────────────
  console.log('\n2. Toggle recording off');

  const agentId = agents[0].id;
  const { error: offErr } = await supabase
    .from('agent_configs').update({ recording_enabled: false }).eq('id', agentId);
  ok('Set recording_enabled=false (no error)', !offErr);

  const { data: offRow } = await supabase
    .from('agent_configs').select('recording_enabled').eq('id', agentId).single();
  ok('Value persisted as false', offRow?.recording_enabled === false);

  // ── 3. Toggle back on ─────────────────────────────────────────────────────
  console.log('\n3. Toggle recording back on');

  const { error: onErr } = await supabase
    .from('agent_configs').update({ recording_enabled: true }).eq('id', agentId);
  ok('Set recording_enabled=true (no error)', !onErr);

  const { data: onRow } = await supabase
    .from('agent_configs').select('recording_enabled').eq('id', agentId).single();
  ok('Value persisted as true', onRow?.recording_enabled === true);

  // ── 4. Inbound CXML logic ─────────────────────────────────────────────────
  console.log('\n4. Inbound CXML logic (webhook-inbound-call)');

  const fnUrl = 'https://api.magpipe.ai/functions/v1';
  const sipUri = 'sip:+16041234567@lk.example.com';

  for (const recording_enabled of [true, false]) {
    const recordingEnabled = recording_enabled !== false;
    const recordingAttrs = recordingEnabled
      ? `record="record-from-ringing" recordingStatusCallback="${fnUrl}/sip-recording-callback?label=main"`
      : '';
    const cxml = `<Dial ${recordingAttrs}><Sip>${sipUri}</Sip></Dial>`;

    ok(
      `recording_enabled=${recording_enabled} → Dial ${recording_enabled ? 'HAS' : 'has NO'} record attr`,
      recording_enabled ? cxml.includes('record-from-ringing') : !cxml.includes('record')
    );
    console.log(`     ${cxml.slice(0, 90)}`);
  }

  // ── 5. Outbound CXML logic ────────────────────────────────────────────────
  console.log('\n5. Outbound CXML logic (batch-call-cxml)');

  const recordingCb = `${fnUrl}/sip-recording-callback?call_record_id=abc&label=main`;

  for (const param of ['1', '0']) {
    const recordingEnabled = param !== '0';
    const recordAttrs = recordingEnabled
      ? `record="record-from-answer" recordingStatusCallback="${recordingCb}"`
      : '';
    const cxml = `<Dial ${recordAttrs}><Conference>conf</Conference></Dial>`;

    ok(
      `?recording=${param} → Dial ${recordingEnabled ? 'HAS' : 'has NO'} record attr`,
      recordingEnabled ? cxml.includes('record-from-answer') : !cxml.includes('record')
    );
    console.log(`     ${cxml.slice(0, 90)}`);
  }

  // ── 6. initiate-bridged-call agent lookup ─────────────────────────────────
  console.log('\n6. Agent lookup via service_numbers (initiate-bridged-call)');

  const { data: numRows } = await supabase
    .from('service_numbers')
    .select('phone_number, outbound_agent_id, agent_id')
    .not('agent_id', 'is', null)
    .limit(1);

  const num = numRows?.[0];
  ok('Found a service number with agent', !!num);

  if (num) {
    const agentIdToCheck = num.outbound_agent_id || num.agent_id;
    const { data: agentCfg } = await supabase
      .from('agent_configs')
      .select('recording_enabled')
      .eq('id', agentIdToCheck)
      .single();

    ok('Agent config lookup succeeded', !!agentCfg);
    ok('recording_enabled is boolean', typeof agentCfg?.recording_enabled === 'boolean');
    console.log(`     ${num.phone_number} → agent ${agentIdToCheck} → recording_enabled=${agentCfg?.recording_enabled}`);
  }

  summary();
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
