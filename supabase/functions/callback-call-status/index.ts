import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/**
 * Callback Call Status Handler
 *
 * Handles status updates for callback-style calls:
 * - Updates call record when call ends
 * - Records duration and disposition
 * - Handles both legs (user's phone and destination)
 */
Deno.serve(async (req) => {
  try {
    // Parse URL to get call_record_id
    const url = new URL(req.url);
    const callRecordId = url.searchParams.get("call_record_id");

    // Parse form data from SignalWire
    const formData = await req.formData();
    const params = Object.fromEntries(formData.entries());

    console.log("Callback call status update:", {
      callRecordId,
      params,
    });

    const {
      CallSid,
      CallStatus,
      CallDuration,
      DialCallStatus, // Status of the dialed leg (destination)
      DialCallDuration,
    } = params;

    // Use DialCallStatus if available (from <Dial> action), otherwise use CallStatus
    const status = (DialCallStatus || CallStatus) as string;
    const duration = parseInt((DialCallDuration || CallDuration || "0") as string, 10);

    console.log(`Call status: ${status}, duration: ${duration}s`);

    if (!callRecordId) {
      console.log("No call record ID provided, returning OK");
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        {
          headers: { "Content-Type": "text/xml" },
        }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Map SignalWire statuses to our database statuses
    const statusMap: Record<string, string> = {
      initiated: "initiated",
      ringing: "ringing",
      "in-progress": "in_progress",
      answered: "in_progress",
      completed: "completed",
      busy: "busy",
      failed: "failed",
      "no-answer": "no_answer",
      canceled: "canceled",
    };

    const dbStatus = statusMap[status?.toLowerCase()] || status;

    // Update for both terminal and intermediate states
    const terminalStates = ["completed", "busy", "failed", "no-answer", "canceled"];
    const isTerminal = terminalStates.includes(status?.toLowerCase());

    const updateData: Record<string, unknown> = {
      status: dbStatus,
    };

    if (isTerminal) {
      updateData.ended_at = new Date().toISOString();

      if (duration > 0) {
        updateData.duration_seconds = duration;
        updateData.duration = duration;
      }

      // Set disposition based on status
      if (status?.toLowerCase() === "completed" && duration > 0) {
        updateData.disposition = "outbound_completed";
      } else if (status?.toLowerCase() === "busy") {
        updateData.disposition = "outbound_busy";
      } else if (status?.toLowerCase() === "no-answer") {
        updateData.disposition = "outbound_no_answer";
      } else if (status?.toLowerCase() === "canceled") {
        updateData.disposition = "outbound_canceled";
      } else {
        updateData.disposition = "outbound_failed";
      }

      console.log(`Terminal state reached. Updating call record ${callRecordId}:`, updateData);
    } else {
      console.log(`Intermediate state ${status}. Updating call record ${callRecordId}:`, updateData);
    }

    // Get the call record to know user_id for credit deduction
    const { data: callRecord } = await supabase
      .from("call_records")
      .select("user_id")
      .eq("id", callRecordId)
      .single();

    const { error } = await supabase
      .from("call_records")
      .update(updateData)
      .eq("id", callRecordId);

    if (error) {
      console.error("Error updating call record:", error);
    } else {
      console.log(`✅ Updated call record ${callRecordId}`);

      // Deduct credits for completed calls with duration
      if (callRecord && isTerminal && status?.toLowerCase() === "completed" && duration > 0) {
        deductCallCredits(
          supabaseUrl,
          supabaseKey,
          callRecord.user_id,
          duration,
          callRecordId
        ).catch(err => console.error("Failed to deduct credits:", err));
      }
    }

    // Return empty response for non-terminal states
    // Return hangup for terminal states (ends the call properly)
    if (isTerminal) {
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
        {
          headers: { "Content-Type": "text/xml" },
        }
      );
    }

    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        headers: { "Content-Type": "text/xml" },
      }
    );
  } catch (error) {
    console.error("Error in callback-call-status:", error);

    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        headers: { "Content-Type": "text/xml" },
      }
    );
  }
});

/**
 * Deduct credits for a completed call
 */
async function deductCallCredits(
  supabaseUrl: string,
  supabaseKey: string,
  userId: string,
  durationSeconds: number,
  callRecordId: string
) {
  try {
    // Get user's agent config to determine voice, LLM, and add-on rates
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: agentConfig } = await supabase
      .from("agent_configs")
      .select("voice_id, ai_model, memory_enabled, semantic_memory_enabled, knowledge_source_ids, pii_storage")
      .eq("user_id", userId)
      .single();

    // Determine active add-ons
    const addons: string[] = [];
    const kbIds = agentConfig?.knowledge_source_ids || [];
    if (kbIds.length > 0) addons.push("knowledge_base");
    if (agentConfig?.memory_enabled) addons.push("memory");
    if (agentConfig?.semantic_memory_enabled) addons.push("semantic_memory");
    if (agentConfig?.pii_storage === "redacted") addons.push("pii_removal");

    // Call deduct-credits function
    const response = await fetch(`${supabaseUrl}/functions/v1/deduct-credits`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        userId,
        type: "voice",
        durationSeconds,
        voiceId: agentConfig?.voice_id,
        aiModel: agentConfig?.ai_model,
        addons: addons.length > 0 ? addons : undefined,
        referenceType: "call",
        referenceId: callRecordId,
      }),
    });

    const result = await response.json();
    if (result.success) {
      console.log(
        `Deducted $${result.cost} for ${durationSeconds}s call (addons: ${addons.join(",") || "none"}), balance: $${result.balanceAfter}`
      );
    } else {
      console.error("Failed to deduct credits:", result.error);
    }
  } catch (error) {
    console.error("Error deducting call credits:", error);
  }
}
