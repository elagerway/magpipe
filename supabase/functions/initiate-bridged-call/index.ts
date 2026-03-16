import { createClient } from "npm:@supabase/supabase-js@2";
import { RoomServiceClient } from 'npm:livekit-server-sdk@2.14.0'
import { resolveUser } from "../_shared/api-auth.ts";
import { checkBalance } from "../_shared/balance-check.ts";
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { reportError } from '../_shared/error-reporter.ts'

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return handleCors()
  }

  try {
    // Get authenticated user
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const body = await req.json();
    const {
      phone_number,
      caller_id,
      purpose,
      goal,
      template_id,
      user_id: bodyUserId,
      dynamic_variables,
      agent_id: bodyAgentId,
      outbound_system_prompt,
      metadata: bodyMetadata,
    } = body;

    // Resolve user: standard auth OR internal service-to-service call with user_id in body
    let user = await resolveUser(req, supabaseClient);
    if (!user && bodyUserId) {
      // Internal call from process-batch-calls using service role key
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "");
      if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
        user = { id: bodyUserId, authMethod: "jwt" as const };
      }
    }
    if (!user) {
      return new Response(
        JSON.stringify({ error: { code: "unauthorized", message: "Unauthorized" } }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!phone_number || !caller_id) {
      return new Response(
        JSON.stringify({
          error: "Missing required parameters: phone_number, caller_id",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get SignalWire credentials
    const signalwireProjectId = Deno.env.get("SIGNALWIRE_PROJECT_ID");
    const signalwireToken = Deno.env.get("SIGNALWIRE_API_TOKEN");
    const signalwireSpaceUrl = Deno.env.get("SIGNALWIRE_SPACE_URL");

    if (!signalwireProjectId || !signalwireToken || !signalwireSpaceUrl) {
      return new Response(
        JSON.stringify({ error: "SignalWire configuration missing" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const signalwireAuth = btoa(`${signalwireProjectId}:${signalwireToken}`);

    // Create service role client for database operations
    const serviceRoleClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Check balance before allowing the call
    const { allowed, balance } = await checkBalance(serviceRoleClient, user.id);
    if (!allowed) {
      console.log(`Blocking outbound call for user ${user.id}: insufficient credits ($${balance})`);
      return new Response(
        JSON.stringify({ error: { code: "insufficient_credits", message: `Insufficient credits. Your balance is $${balance.toFixed(2)}. Please add credits to make calls.` } }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve effective agent: body agent_id takes priority over service_numbers assignment
    let effectiveAgentId: string | null = null;
    let recordingEnabled = true;

    if (bodyAgentId) {
      // Validate the agent exists and belongs to this user
      const { data: agentCheck } = await serviceRoleClient
        .from("agent_configs")
        .select("id, recording_enabled")
        .eq("id", bodyAgentId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (agentCheck) {
        effectiveAgentId = agentCheck.id;
        recordingEnabled = agentCheck.recording_enabled !== false;
      }
    }

    if (!effectiveAgentId) {
      // Fall back to service_numbers assignment
      const { data: svcNum } = await serviceRoleClient
        .from("service_numbers")
        .select("agent_id, outbound_agent_id")
        .eq("phone_number", caller_id)
        .maybeSingle();
      const assignedAgentId = svcNum?.outbound_agent_id || svcNum?.agent_id || null;
      if (assignedAgentId) {
        effectiveAgentId = assignedAgentId;
        const { data: agentCfg } = await serviceRoleClient
          .from("agent_configs")
          .select("recording_enabled")
          .eq("id", assignedAgentId)
          .single();
        if (agentCfg) recordingEnabled = agentCfg.recording_enabled !== false;
      }
    }

    if (!effectiveAgentId) {
      return new Response(
        JSON.stringify({ error: { code: "no_agent_assigned", message: "Associate a number in agent deployment to use this agent" } }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Initiating bridged call:", {
      callerNumber: caller_id,
      pstnDestination: phone_number,
      userId: user.id,
      agentId: effectiveAgentId,
      hasSystemPromptOverride: !!outbound_system_prompt,
    });

    // CRITICAL: Create call record FIRST so agent can find direction when it joins
    // This avoids race condition where agent joins before call_record exists
    const { data: callRecord, error: insertError } = await serviceRoleClient
      .from("call_records")
      .insert({
        user_id: user.id,
        caller_number: phone_number, // The person being called (contact)
        contact_phone: phone_number,
        service_number: caller_id,
        direction: "outbound",
        disposition: "outbound_completed", // Optimistic default - updated by status callback if call fails
        status: "in-progress", // Must be in-progress for agent to find and update
        started_at: new Date().toISOString(), // Required: NOT NULL constraint
        duration_seconds: 0,
        duration: 0, // Legacy column
        voice_platform: "livekit", // Track which AI platform
        telephony_vendor: "signalwire", // Track which vendor
        // Outbound call context from template
        call_purpose: purpose || null,
        call_goal: goal || null,
        template_id: template_id || null,
        // Per-call variable substitutions for {{variable}} placeholders in system prompt
        call_variables: dynamic_variables && Object.keys(dynamic_variables).length > 0 ? dynamic_variables : null,
        // Agent and metadata from request body
        agent_id: effectiveAgentId,
        // Merge outbound_system_prompt into metadata so agent.py can read it as a fallback
        // (in case LiveKit room metadata isn't visible when agent connects)
        metadata: outbound_system_prompt
          ? { ...(bodyMetadata || {}), _system_prompt_override: outbound_system_prompt }
          : bodyMetadata || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating call record:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create call record", details: insertError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Call record created FIRST:", callRecord.id);

    // Conference bridge: fire agent SIP + PSTN legs simultaneously
    // Both join the same named conference — no <Dial><Number> bridging needed
    const livekitSipDomain = Deno.env.get("LIVEKIT_SIP_DOMAIN");
    if (!livekitSipDomain) {
      console.error('LIVEKIT_SIP_DOMAIN not configured');
      return new Response(
        JSON.stringify({ error: 'LiveKit SIP domain not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const confName = `outbound-${callRecord.id}`;
    const livekitSipUri = `sip:${caller_id}@${livekitSipDomain};transport=tls`;
    const swCallUrl = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/Calls.json`;
    const swHeaders = { Authorization: `Basic ${signalwireAuth}`, "Content-Type": "application/x-www-form-urlencoded" };

    // Create LiveKit room with metadata so agent.py fast path works correctly.
    // Without this, agent.py resolves the agent via service_numbers lookup (slow path),
    // which ignores the body agent_id and outbound_system_prompt entirely.
    try {
      const livekitUrl = Deno.env.get("LIVEKIT_URL");
      const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY");
      const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET");
      if (livekitUrl && livekitApiKey && livekitApiSecret) {
        const roomClient = new RoomServiceClient(livekitUrl, livekitApiKey, livekitApiSecret);
        const roomMeta: Record<string, string> = {
          user_id: user.id,
          agent_id: effectiveAgentId,
          direction: "outbound",
          contact_phone: phone_number,
          service_number: caller_id,
        };
        if (outbound_system_prompt) roomMeta.system_prompt_override = outbound_system_prompt;
        await roomClient.createRoom({
          name: confName,
          emptyTimeout: 600,
          maxParticipants: 10,
          metadata: JSON.stringify(roomMeta),
        });
        console.log("✅ LiveKit room created with metadata:", confName);
      }
    } catch (roomErr) {
      // If caller supplied body agent_id or outbound_system_prompt, room creation is required —
      // the slow path would ignore both. Return 500 so the caller knows the override didn't take.
      // For plain service_numbers calls (no overrides), the slow path is an acceptable fallback.
      if (bodyAgentId || outbound_system_prompt) {
        console.error("❌ Room pre-creation failed and body overrides are in use:", roomErr);
        await serviceRoleClient.from("call_records").update({
          status: "completed", disposition: "failed", ended_at: new Date().toISOString(),
        }).eq("id", callRecord.id);
        return new Response(
          JSON.stringify({ error: "Failed to configure call agent", details: String(roomErr) }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.warn("⚠️ Failed to pre-create LiveKit room (agent will use slow path):", roomErr);
    }

    console.log('LiveKit SIP URI:', livekitSipUri);
    console.log('PSTN destination:', phone_number);
    console.log('Conference name:', confName);

    // Leg 1: Agent SIP → LiveKit (joins conference)
    const agentCxmlUrl = `${supabaseUrl}/functions/v1/batch-call-cxml?leg=agent&conf=${encodeURIComponent(confName)}`;
    const agentFormBody = [
      `To=${encodeURIComponent(livekitSipUri)}`,
      `From=${encodeURIComponent(caller_id)}`,
      `Url=${encodeURIComponent(agentCxmlUrl)}`,
      `Method=POST`,
    ].join("&");

    // Leg 2: PSTN destination (joins same conference, ends it on hangup)
    const pstnCxmlUrl = `${supabaseUrl}/functions/v1/batch-call-cxml?leg=pstn&conf=${encodeURIComponent(confName)}&call_record_id=${callRecord.id}&recording=${recordingEnabled ? '1' : '0'}`;
    const pstnFormBody = [
      `To=${encodeURIComponent(phone_number)}`,
      `From=${encodeURIComponent(caller_id)}`,
      `Url=${encodeURIComponent(pstnCxmlUrl)}`,
      `Method=POST`,
      `StatusCallback=${encodeURIComponent(`${supabaseUrl}/functions/v1/outbound-call-status`)}`,
      `StatusCallbackEvent=initiated`,
      `StatusCallbackEvent=ringing`,
      `StatusCallbackEvent=answered`,
      `StatusCallbackEvent=completed`,
      `StatusCallbackMethod=POST`,
    ].join("&");

    // Fire LiveKit leg first so agent is connecting while PSTN rings
    console.log("Firing agent SIP leg first...");
    const agentCallResp = await fetch(swCallUrl, { method: "POST", headers: swHeaders, body: agentFormBody });
    const agentCallData = await agentCallResp.json();

    if (!agentCallResp.ok || !agentCallData.sid) {
      console.error("Agent SIP leg failed:", agentCallData);
      await serviceRoleClient.from("call_records").update({
        status: "completed", disposition: "failed", ended_at: new Date().toISOString(),
      }).eq("id", callRecord.id);
      return new Response(
        JSON.stringify({ error: "Failed to start agent SIP leg", details: agentCallData.message || agentCallData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log("Agent SIP leg started:", agentCallData.sid, "— now firing PSTN leg");

    console.log("Firing PSTN leg...");
    const pstnCallResp = await fetch(swCallUrl, { method: "POST", headers: swHeaders, body: pstnFormBody });
    const pstnCallData = await pstnCallResp.json();

    if (!pstnCallResp.ok || !pstnCallData.sid) {
      console.error("PSTN leg failed:", pstnCallData);
      await serviceRoleClient.from("call_records").update({
        status: "completed", disposition: "failed", ended_at: new Date().toISOString(),
      }).eq("id", callRecord.id);
      return new Response(
        JSON.stringify({ error: "Failed to start PSTN leg", details: pstnCallData.message || pstnCallData }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log("PSTN leg started:", pstnCallData.sid);

    // Update call record with PSTN call SID
    const { error: updateError } = await serviceRoleClient
      .from("call_records")
      .update({
        vendor_call_id: pstnCallData.sid,
        call_sid: pstnCallData.sid,
      })
      .eq("id", callRecord.id);

    if (updateError) {
      console.error("Error updating call record with SID:", updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        call_sid: pstnCallData.sid,
        agent_call_sid: agentCallData.sid,
        call_record_id: callRecord?.id,
        status: pstnCallData.status,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in initiate-bridged-call:", error);
    const _sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
    await reportError(_sb, { error_type: 'edge_function_error', error_message: String(error.message || error), error_code: 'initiate-bridged-call:outer', source: 'supabase' })
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
