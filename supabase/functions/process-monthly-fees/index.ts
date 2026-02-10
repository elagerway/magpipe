/**
 * Process Monthly Fees
 * Runs daily via cron. Charges monthly fees for:
 * - Phone numbers: $2/mo per active number
 *
 * For each active service number where last_billed_at is NULL or >= 30 days ago,
 * deducts the fee from the user's credit balance.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PHONE_NUMBER_FEE = 2.00  // per number per month

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

    // Find active phone numbers that need billing
    // last_billed_at is NULL (never billed) or older than 30 days
    const { data: numbersToBill, error: queryError } = await supabase
      .from('service_numbers')
      .select('id, user_id, phone_number, last_billed_at, monthly_fee')
      .eq('is_active', true)
      .or(`last_billed_at.is.null,last_billed_at.lte.${thirtyDaysAgo.toISOString()}`)

    if (queryError) {
      console.error('Error querying service numbers:', queryError)
      return new Response(JSON.stringify({ error: queryError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!numbersToBill || numbersToBill.length === 0) {
      return new Response(JSON.stringify({ message: 'No numbers due for billing', processed: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log(`Found ${numbersToBill.length} phone numbers due for billing`)

    // Group numbers by user for efficiency
    const numbersByUser = new Map<string, typeof numbersToBill>()
    for (const num of numbersToBill) {
      if (!numbersByUser.has(num.user_id)) {
        numbersByUser.set(num.user_id, [])
      }
      numbersByUser.get(num.user_id)!.push(num)
    }

    let totalProcessed = 0
    let totalFailed = 0
    const results: Array<{ userId: string, numbersCharged: number, totalAmount: number, error?: string }> = []

    for (const [userId, numbers] of numbersByUser.entries()) {
      try {
        // Charge each number individually so we can track per-number billing
        let userTotal = 0
        let userCharged = 0

        for (const num of numbers) {
          const fee = num.monthly_fee || PHONE_NUMBER_FEE
          const billingPeriodStart = num.last_billed_at ? new Date(num.last_billed_at) : new Date(num.purchased_at || now)
          const billingPeriodEnd = now

          // Deduct credits
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

          // Update last_billed_at
          await supabase
            .from('service_numbers')
            .update({ last_billed_at: now.toISOString() })
            .eq('id', num.id)

          // Log to monthly_billing_log
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

        results.push({ userId, numbersCharged: userCharged, totalAmount: userTotal })

      } catch (err: any) {
        console.error(`Error processing monthly fees for user ${userId}:`, err)
        results.push({ userId, numbersCharged: 0, totalAmount: 0, error: err.message })
        totalFailed++
      }
    }

    console.log(`Monthly fees processed: ${totalProcessed} numbers charged, ${totalFailed} failed`)

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
