#!/bin/bash

# Query call_state_logs for debugging outbound calls
# Usage: ./query-call-state-logs.sh [room_name_or_call_id]

source .env

if [ -z "$1" ]; then
  echo "📊 Showing last 5 call state logs:"
  echo ""
  QUERY="SELECT created_at, state, component, details::text as details_text, error_message FROM call_state_logs ORDER BY created_at DESC LIMIT 5"
else
  echo "📊 Call state logs for: $1"
  echo ""
  # Check if it's a room name or call ID
  if [[ $1 == outbound-* ]]; then
    QUERY="SELECT created_at, state, component, details::text as details_text, error_message FROM call_state_logs WHERE room_name = '$1' ORDER BY created_at"
  else
    QUERY="SELECT created_at, state, component, details::text as details_text, error_message FROM call_state_logs WHERE call_id = '$1' ORDER BY created_at"
  fi
fi

# Use node to query database
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  '${SUPABASE_URL}',
  '${SUPABASE_SERVICE_ROLE_KEY}'
);

(async () => {
  // Direct query (skip exec_sql RPC)
  let query = supabase.from('call_state_logs').select('created_at, state, component, details, error_message');

  // Check if it's a room name or call ID query
  if ('$1') {
    if ('$1'.startsWith('outbound-')) {
      query = query.eq('room_name', '$1');
    } else {
      query = query.eq('call_id', '$1');
    }
  }

  query = query.order('created_at', { ascending: true }).limit(10);

  const { data: logs, error: err2 } = await query;

  if (err2) {
    console.error('Error:', err2);
    process.exit(1);
  }

  if (!logs || logs.length === 0) {
    console.log('❌ No logs found');
    console.log('');
    console.log('Either:');
    console.log('  1. No calls have been made yet');
    console.log('  2. The room name/call ID is incorrect');
    console.log('');
    console.log('💡 Make a test call first, then run:');
    console.log('   ./query-call-state-logs.sh outbound-USER_ID-TIMESTAMP');
    process.exit(0);
  }

  console.log('State progression:');
  console.log('==================');
  logs.forEach((log, i) => {
    const time = new Date(log.created_at).toISOString();
    console.log(\`\${i + 1}. [\${time}] \${log.component} → \${log.state}\`);
    if (log.error_message) {
      console.log(\`   ❌ ERROR: \${log.error_message}\`);
    }
    if (log.details && Object.keys(log.details).length > 0) {
      console.log(\`   Details: \${JSON.stringify(log.details)}\`);
    }
    console.log('');
  });

  // Summary
  console.log('Summary:');
  console.log('========');
  const states = logs.map(l => l.state);
  console.log(\`✅ States logged: \${states.join(' → ')}\`);

  const hasAgentEntrypoint = states.includes('agent_entrypoint_called');
  const hasAgentConnected = states.includes('agent_connected');
  const hasSipParticipant = states.includes('sip_participant_created');

  console.log('');
  console.log('Component Status:');
  console.log(\`  Edge Function: \${states.includes('initiated') ? '✅' : '❌'}\`);
  console.log(\`  Room Created: \${states.includes('room_created') ? '✅' : '❌'}\`);
  console.log(\`  SIP Participant: \${hasSipParticipant ? '✅' : '❌'}\`);
  console.log(\`  Agent Dispatched: \${states.includes('agent_dispatched') ? '✅' : '❌'}\`);
  console.log(\`  Agent Entrypoint: \${hasAgentEntrypoint ? '✅' : '❌'} \${!hasAgentEntrypoint ? '← DISPATCH BROKEN!' : ''}\`);
  console.log(\`  Agent Connected: \${hasAgentConnected ? '✅' : '❌'}\`);

  if (states.includes('error')) {
    console.log('');
    console.log('⚠️  Errors detected - check error_message field above');
  }
})();
"
