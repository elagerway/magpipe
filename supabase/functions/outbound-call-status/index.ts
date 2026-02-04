import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    // Parse form data from SignalWire StatusCallback
    const formData = await req.formData();
    const callSid = formData.get("CallSid") as string;
    const callStatus = formData.get("CallStatus") as string;
    const duration = formData.get("CallDuration") as string;

    console.log("Outbound call status update:", {
      callSid,
      callStatus,
      duration,
    });

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
    };

    const dbStatus = statusMap[callStatus] || callStatus;

    // Update call record in database
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const updateData: Record<string, any> = {
      status: dbStatus,
    };

    // If call is completed, add duration
    if (callStatus === "completed" && duration) {
      updateData.duration_seconds = parseInt(duration, 10);

      // Set disposition based on duration
      if (parseInt(duration, 10) > 0) {
        updateData.disposition = "outbound_completed";
      } else {
        updateData.disposition = "outbound_no_answer";
      }
    } else if (callStatus === "busy") {
      updateData.disposition = "outbound_busy";
    } else if (callStatus === "failed" || callStatus === "no-answer") {
      updateData.disposition = "outbound_failed";
    }

    // First get the call record to know user_id
    const { data: callRecord } = await supabaseClient
      .from("call_records")
      .select("id, user_id")
      .eq("vendor_call_id", callSid)
      .single();

    const { error } = await supabaseClient
      .from("call_records")
      .update(updateData)
      .eq("vendor_call_id", callSid);

    if (error) {
      console.error("Error updating call record:", error);
    } else {
      console.log("Call record updated successfully:", updateData);

      // Deduct credits for completed calls with duration
      const durationSeconds = updateData.duration_seconds;
      if (callRecord && callStatus === "completed" && durationSeconds > 0) {
        deductCallCredits(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
          callRecord.user_id,
          durationSeconds,
          callRecord.id
        ).catch(err => console.error("Failed to deduct credits:", err));
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in outbound-call-status:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
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
    // Get user's agent config to determine voice and LLM rates
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: agentConfig } = await supabase
      .from("agent_configs")
      .select("voice_id, ai_model")
      .eq("user_id", userId)
      .single();

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
        referenceType: "call",
        referenceId: callRecordId,
      }),
    });

    const result = await response.json();
    if (result.success) {
      console.log(
        `Deducted $${result.cost} for ${durationSeconds}s call, balance: $${result.balanceAfter}`
      );
    } else {
      console.error("Failed to deduct credits:", result.error);
    }
  } catch (error) {
    console.error("Error deducting call credits:", error);
  }
}
