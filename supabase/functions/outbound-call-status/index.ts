import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

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

    // First get the call record to know user_id and phone info
    const { data: callRecord } = await supabaseClient
      .from("call_records")
      .select("id, user_id, agent_id, caller_number, contact_phone, call_summary, user_sentiment, recording_url")
      .eq("vendor_call_id", callSid)
      .maybeSingle();

    const { error } = await supabaseClient
      .from("call_records")
      .update(updateData)
      .eq("vendor_call_id", callSid);

    if (error) {
      console.error("Error updating call record:", error);
    } else {
      console.log("Call record updated successfully:", updateData);

      // Update batch_call_recipients if this call is part of a batch
      let batchRecipient: { id: string; batch_id: string } | null = null;
      if (callRecord) {
        const { data: br } = await supabaseClient
          .from("batch_call_recipients")
          .select("id, batch_id")
          .eq("call_record_id", callRecord.id)
          .maybeSingle();
        batchRecipient = br ?? null;

        if (batchRecipient) {
          const recipientUpdate: Record<string, any> = { status: dbStatus };
          if (["completed", "busy", "failed", "no-answer"].includes(callStatus)) {
            recipientUpdate.completed_at = new Date().toISOString();
            if (callStatus === "completed") {
              // Increment batch completed count
              const { data: batch } = await supabaseClient
                .from("batch_calls")
                .select("completed_count")
                .eq("id", batchRecipient.batch_id)
                .single();
              await supabaseClient
                .from("batch_calls")
                .update({ completed_count: (batch?.completed_count || 0) + 1, updated_at: new Date().toISOString() })
                .eq("id", batchRecipient.batch_id);
            } else {
              // Increment batch failed count
              const { data: batch } = await supabaseClient
                .from("batch_calls")
                .select("failed_count")
                .eq("id", batchRecipient.batch_id)
                .single();
              await supabaseClient
                .from("batch_calls")
                .update({ failed_count: (batch?.failed_count || 0) + 1, updated_at: new Date().toISOString() })
                .eq("id", batchRecipient.batch_id);
              recipientUpdate.error_message = callStatus === "busy" ? "Line busy" : callStatus === "no-answer" ? "No answer" : "Call failed";
            }
          }
          await supabaseClient
            .from("batch_call_recipients")
            .update(recipientUpdate)
            .eq("id", batchRecipient.id);
          console.log(`Batch recipient ${batchRecipient.id} updated to ${recipientUpdate.status}`);

          // Check if batch is complete (no more pending or active recipients)
          if (["completed", "busy", "failed", "no-answer"].includes(callStatus)) {
            const { count: remaining } = await supabaseClient
              .from("batch_call_recipients")
              .select("*", { count: "exact", head: true })
              .eq("batch_id", batchRecipient.batch_id)
              .in("status", ["pending", "calling", "initiated", "ringing", "in_progress"]);

            if ((remaining || 0) === 0) {
              // Get the batch to check if it's a child of a recurring parent
              const { data: completedBatch } = await supabaseClient
                .from("batch_calls")
                .select("id, parent_batch_id")
                .eq("id", batchRecipient.batch_id)
                .single();

              await supabaseClient
                .from("batch_calls")
                .update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                .eq("id", batchRecipient.batch_id)
                .eq("status", "running");
              console.log(`Batch ${batchRecipient.batch_id} marked completed`);

              // If child of a recurring parent, trigger process_due to spawn next run
              if (completedBatch?.parent_batch_id) {
                const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
                const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
                fetch(`${supabaseUrl}/functions/v1/process-batch-calls`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
                  body: JSON.stringify({ action: "process_due" })
                }).catch(err => console.error("Failed to trigger recurring check:", err));
                console.log(`Triggered recurring check for parent ${completedBatch.parent_batch_id}`);
              }
            }
          }
        }
      }

      // Trigger test-log-collector for test runs
      if (callRecord && ["completed", "busy", "failed", "no-answer"].includes(callStatus)) {
        const { data: testRun } = await supabaseClient
          .from("test_runs")
          .select("id")
          .eq("call_record_id", callRecord.id)
          .maybeSingle();
        if (testRun) {
          const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
          const collectPromise = fetch(`${supabaseUrl}/functions/v1/test-log-collector`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}` },
            body: JSON.stringify({ test_run_id: testRun.id }),
          }).catch(err => console.error("Failed to trigger test-log-collector:", err));
          // deno-lint-ignore no-explicit-any
          (globalThis as any).EdgeRuntime?.waitUntil(collectPromise);
          console.log(`Triggered test-log-collector for run ${testRun.id}`);
        }
      }

      // Deduct credits for completed calls with duration
      const durationSeconds = updateData.duration_seconds;
      if (callRecord && callStatus === "completed" && durationSeconds > 0) {
        deductCallCredits(
          supabaseUrl,
          supabaseKey,
          callRecord.user_id,
          durationSeconds,
          callRecord.id
        ).catch(err => console.error("Failed to deduct credits:", err));
      }

      // Send notifications for terminal outbound calls (skip batch calls — they have their own accounting)
      const terminalStatuses = ["completed", "busy", "failed", "no-answer"];
      if (callRecord && terminalStatuses.includes(callStatus) && !batchRecipient) {
        const isMissed = callStatus !== "completed";
        const durationSecs = updateData.duration_seconds || 0;

        const backgroundWork = async () => {
          let agentName: string | null = null;
          let agentRecordingEnabled = true;
          if (callRecord.agent_id) {
            const { data: agentCfg } = await supabaseClient
              .from("agent_configs")
              .select("name, recording_enabled")
              .eq("id", callRecord.agent_id)
              .maybeSingle();
            agentName = agentCfg?.name || null;
            agentRecordingEnabled = agentCfg?.recording_enabled !== false;
          }

          let enrichedSummary: string | null = callRecord.call_summary || null;
          let enrichedSentiment: string | null = callRecord.user_sentiment || null;
          let enrichedRecordingUrl: string | null = callRecord.recording_url || null;

          const shouldWaitForRecording = !isMissed && agentRecordingEnabled && !enrichedRecordingUrl;
          if (!isMissed && (!enrichedSummary || shouldWaitForRecording)) {
            for (let attempt = 0; attempt < 12; attempt++) {
              await new Promise(resolve => setTimeout(resolve, 5000));
              const { data: freshRecord } = await supabaseClient
                .from("call_records")
                .select("call_summary, user_sentiment, recording_url, recordings")
                .eq("id", callRecord.id)
                .single();
              enrichedSummary = freshRecord?.call_summary || null;
              enrichedSentiment = freshRecord?.user_sentiment || null;
              const recordingsArr: any[] = freshRecord?.recordings || [];
              const firstRecordingUrl = recordingsArr.find((r: any) => r.url)?.url || null;
              enrichedRecordingUrl = freshRecord?.recording_url || firstRecordingUrl || enrichedRecordingUrl;
              const hasSummary = !!enrichedSummary;
              const hasRecording = !agentRecordingEnabled || !!enrichedRecordingUrl;
              if (hasSummary && hasRecording) {
                console.log(`✅ Got summary${agentRecordingEnabled ? "+recording" : ""} after ${(attempt + 1) * 5}s`);
                break;
              }
              console.log(`⏳ Waiting for summary/recording... attempt ${attempt + 1}/12`);
            }
          }

          const phoneNumber = callRecord.contact_phone || callRecord.caller_number;
          const notificationData = {
            userId: callRecord.user_id,
            agentId: callRecord.agent_id,
            type: isMissed ? "missed_call" : "completed_call",
            data: {
              callerNumber: phoneNumber,
              timestamp: new Date().toISOString(),
              duration: durationSecs,
              successful: callStatus === "completed",
              agentName,
              sessionId: callRecord.id,
              summary: enrichedSummary,
              sentiment: enrichedSentiment,
              recordingUrl: enrichedRecordingUrl,
            }
          };

          await Promise.allSettled([
            fetch(`${supabaseUrl}/functions/v1/send-notification-email`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
              body: JSON.stringify(notificationData),
            }),
            fetch(`${supabaseUrl}/functions/v1/send-notification-sms`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
              body: JSON.stringify(notificationData),
            }),
            fetch(`${supabaseUrl}/functions/v1/send-notification-push`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
              body: JSON.stringify(notificationData),
            }),
            fetch(`${supabaseUrl}/functions/v1/send-notification-slack`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
              body: JSON.stringify(notificationData),
            }),
          ]);
        };

        // @ts-ignore — EdgeRuntime is available in Supabase edge function environment
        if (typeof EdgeRuntime !== "undefined") {
          EdgeRuntime.waitUntil(backgroundWork());
        } else {
          backgroundWork().catch(err => console.error("Background notification error:", err));
        }
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
