/**
 * Process Monthly Fees
 * Runs daily via cron. Charges monthly fees for:
 * - Phone numbers: $2/mo per active number
 * - Extra knowledge bases: $5/mo per KB beyond 20 included
 * - Extra concurrency slots: $5/mo per slot
 *
 * For each billable item where last_billed_at is NULL or >= 30 days ago,
 * deducts the fee from the user's credit balance.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PHONE_NUMBER_FEE = 2.00  // per number per month
const EXTRA_KB_FEE = 5.00      // per KB beyond 20 included
const CONCURRENCY_SLOT_FEE = 5.00  // per extra slot per month
const INCLUDED_KB_COUNT = 20   // free KBs included in plan

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    let totalProcessed = 0
    let totalFailed = 0
    const results: Array<{ type: string, userId: string, itemsCharged: number, totalAmount: number, error?: string }> = []

    // ==========================================
    // 1. PHONE NUMBER FEES ($2/mo per number)
    // ==========================================
    const { data: numbersToBill, error: queryError } = await supabase
      .from('service_numbers')
      .select('id, user_id, phone_number, last_billed_at, monthly_fee')
      .eq('is_active', true)
      .or(`last_billed_at.is.null,last_billed_at.lte.${thirtyDaysAgo.toISOString()}`)

    if (queryError) {
      console.error('Error querying service numbers:', queryError)
    }

    if (numbersToBill && numbersToBill.length > 0) {
      console.log(`Found ${numbersToBill.length} phone numbers due for billing`)

      const numbersByUser = new Map<string, typeof numbersToBill>()
      for (const num of numbersToBill) {
        if (!numbersByUser.has(num.user_id)) {
          numbersByUser.set(num.user_id, [])
        }
        numbersByUser.get(num.user_id)!.push(num)
      }

      for (const [userId, numbers] of numbersByUser.entries()) {
        try {
          let userTotal = 0
          let userCharged = 0

          for (const num of numbers) {
            const fee = num.monthly_fee || PHONE_NUMBER_FEE
            const billingPeriodStart = num.last_billed_at ? new Date(num.last_billed_at) : new Date(num.purchased_at || now)
            const billingPeriodEnd = now

            const { data: result, error: deductError } = await supabase.rpc('deduct_credits', {
              p_user_id: userId,
              p_amount: fee,
              p_description: `Monthly phone number fee: ${num.phone_number}`,
              p_reference_type: 'monthly_fee',
              p_reference_id: num.id,
              p_metadata: {
                type: 'monthly_fee',
                feeType: 'phone_number',
                phoneNumber: num.phone_number,
                rate: fee,
              }
            })

            if (deductError) {
              console.error(`Failed to charge phone number ${num.phone_number} for user ${userId}:`, deductError)
              totalFailed++
              continue
            }

            await supabase
              .from('service_numbers')
              .update({ last_billed_at: now.toISOString() })
              .eq('id', num.id)

            await supabase
              .from('monthly_billing_log')
              .insert({
                user_id: userId,
                fee_type: 'phone_number',
                reference_id: num.id,
                amount: fee,
                billing_period_start: billingPeriodStart.toISOString(),
                billing_period_end: billingPeriodEnd.toISOString(),
                transaction_id: result?.transaction_id || null,
              })

            userTotal += fee
            userCharged++
            totalProcessed++
          }

          results.push({ type: 'phone_number', userId, itemsCharged: userCharged, totalAmount: userTotal })
        } catch (err: any) {
          console.error(`Error processing phone number fees for user ${userId}:`, err)
          results.push({ type: 'phone_number', userId, itemsCharged: 0, totalAmount: 0, error: err.message })
          totalFailed++
        }
      }
    }

    // ==========================================
    // 2. EXTRA KNOWLEDGE BASE FEES ($5/mo each beyond 20)
    // ==========================================
    // Count KBs per user and check if they need billing
    const { data: kbCounts } = await supabase
      .from('knowledge_sources')
      .select('user_id')

    if (kbCounts && kbCounts.length > 0) {
      // Count KBs per user
      const kbByUser = new Map<string, number>()
      for (const kb of kbCounts) {
        kbByUser.set(kb.user_id, (kbByUser.get(kb.user_id) || 0) + 1)
      }

      // Check last billing for KB fees per user
      for (const [userId, kbCount] of kbByUser.entries()) {
        const extraKbs = kbCount - INCLUDED_KB_COUNT
        if (extraKbs <= 0) continue

        // Check if already billed in last 30 days
        const { data: recentBilling } = await supabase
          .from('monthly_billing_log')
          .select('created_at')
          .eq('user_id', userId)
          .eq('fee_type', 'extra_knowledge_base')
          .gte('created_at', thirtyDaysAgo.toISOString())
          .limit(1)

        if (recentBilling && recentBilling.length > 0) continue  // Already billed

        const fee = extraKbs * EXTRA_KB_FEE
        try {
          const { data: result, error: deductError } = await supabase.rpc('deduct_credits', {
            p_user_id: userId,
            p_amount: fee,
            p_description: `Monthly fee: ${extraKbs} extra knowledge base${extraKbs > 1 ? 's' : ''} (beyond ${INCLUDED_KB_COUNT} included)`,
            p_reference_type: 'monthly_fee',
            p_reference_id: userId,
            p_metadata: {
              type: 'monthly_fee',
              feeType: 'extra_knowledge_base',
              totalKbs: kbCount,
              extraKbs,
              rate: EXTRA_KB_FEE,
            }
          })

          if (deductError) {
            console.error(`Failed to charge KB fee for user ${userId}:`, deductError)
            totalFailed++
            continue
          }

          await supabase
            .from('monthly_billing_log')
            .insert({
              user_id: userId,
              fee_type: 'extra_knowledge_base',
              reference_id: userId,
              amount: fee,
              billing_period_start: thirtyDaysAgo.toISOString(),
              billing_period_end: now.toISOString(),
              transaction_id: result?.transaction_id || null,
            })

          totalProcessed++
          results.push({ type: 'extra_knowledge_base', userId, itemsCharged: extraKbs, totalAmount: fee })
          console.log(`Charged user ${userId} $${fee} for ${extraKbs} extra KBs`)
        } catch (err: any) {
          console.error(`Error processing KB fee for user ${userId}:`, err)
          results.push({ type: 'extra_knowledge_base', userId, itemsCharged: 0, totalAmount: 0, error: err.message })
          totalFailed++
        }
      }
    }

    // ==========================================
    // 3. EXTRA CONCURRENCY SLOT FEES ($5/mo each)
    // ==========================================
    const { data: usersWithSlots } = await supabase
      .from('users')
      .select('id, extra_concurrency_slots')
      .gt('extra_concurrency_slots', 0)

    if (usersWithSlots && usersWithSlots.length > 0) {
      for (const user of usersWithSlots) {
        const slots = user.extra_concurrency_slots

        // Check if already billed in last 30 days
        const { data: recentBilling } = await supabase
          .from('monthly_billing_log')
          .select('created_at')
          .eq('user_id', user.id)
          .eq('fee_type', 'concurrency_slot')
          .gte('created_at', thirtyDaysAgo.toISOString())
          .limit(1)

        if (recentBilling && recentBilling.length > 0) continue  // Already billed

        const fee = slots * CONCURRENCY_SLOT_FEE
        try {
          const { data: result, error: deductError } = await supabase.rpc('deduct_credits', {
            p_user_id: user.id,
            p_amount: fee,
            p_description: `Monthly fee: ${slots} extra concurrency slot${slots > 1 ? 's' : ''}`,
            p_reference_type: 'monthly_fee',
            p_reference_id: user.id,
            p_metadata: {
              type: 'monthly_fee',
              feeType: 'concurrency_slot',
              slots,
              rate: CONCURRENCY_SLOT_FEE,
            }
          })

          if (deductError) {
            console.error(`Failed to charge concurrency fee for user ${user.id}:`, deductError)
            totalFailed++
            continue
          }

          await supabase
            .from('monthly_billing_log')
            .insert({
              user_id: user.id,
              fee_type: 'concurrency_slot',
              reference_id: user.id,
              amount: fee,
              billing_period_start: thirtyDaysAgo.toISOString(),
              billing_period_end: now.toISOString(),
              transaction_id: result?.transaction_id || null,
            })

          totalProcessed++
          results.push({ type: 'concurrency_slot', userId: user.id, itemsCharged: slots, totalAmount: fee })
          console.log(`Charged user ${user.id} $${fee} for ${slots} concurrency slots`)
        } catch (err: any) {
          console.error(`Error processing concurrency fee for user ${user.id}:`, err)
          results.push({ type: 'concurrency_slot', userId: user.id, itemsCharged: 0, totalAmount: 0, error: err.message })
          totalFailed++
        }
      }
    }

    console.log(`Monthly fees processed: ${totalProcessed} items charged, ${totalFailed} failed`)

    return new Response(JSON.stringify({
      processed: totalProcessed,
      failed: totalFailed,
      results,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error('Error in process-monthly-fees:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
