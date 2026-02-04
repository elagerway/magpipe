import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.10.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    // Initialize Stripe
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeKey) {
      throw new Error('Stripe secret key not configured')
    }
    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient()
    })

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get the raw body for signature verification
    const body = await req.text()
    const signature = req.headers.get('stripe-signature')

    // Verify webhook signature (if webhook secret is configured)
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
    let event: Stripe.Event

    if (webhookSecret && signature) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
      } catch (err) {
        console.error('Webhook signature verification failed:', err.message)
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    } else {
      // In development, parse without verification
      event = JSON.parse(body)
      console.warn('Webhook signature not verified (no secret configured)')
    }

    console.log('Stripe webhook event:', event.type)

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.supabase_user_id
        const transactionType = session.metadata?.transaction_type
        const subscriptionId = session.subscription as string

        // Handle credit purchase (one-time payment)
        if (userId && transactionType === 'credit_purchase') {
          const creditAmount = parseFloat(session.metadata?.credit_amount || '0')
          const paymentIntentId = session.payment_intent as string

          if (creditAmount > 0) {
            // Use the add_credits function to add credits and record transaction
            const { data: result, error: addError } = await supabase.rpc('add_credits', {
              p_user_id: userId,
              p_amount: creditAmount,
              p_transaction_type: 'purchase',
              p_description: `Added $${creditAmount} credits via Stripe`,
              p_reference_type: 'stripe_payment',
              p_reference_id: paymentIntentId,
              p_metadata: {
                checkout_session_id: session.id,
                amount_paid: session.amount_total ? session.amount_total / 100 : creditAmount
              }
            })

            if (addError) {
              console.error(`Failed to add credits for user ${userId}:`, addError)
            } else {
              console.log(`User ${userId} added $${creditAmount} credits, new balance: $${result?.balance_after}`)
            }
          }
          break
        }

        // Handle subscription checkout (legacy - keep for backwards compatibility)
        if (userId && subscriptionId) {
          // Fetch the subscription details
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)

          await supabase
            .from('users')
            .update({
              plan: 'pro',
              stripe_subscription_id: subscriptionId,
              stripe_subscription_status: subscription.status,
              stripe_current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
            })
            .eq('id', userId)

          console.log(`User ${userId} upgraded to Pro via checkout`)
        }
        break
      }

      case 'setup_intent.succeeded': {
        // Payment method saved successfully
        const setupIntent = event.data.object as Stripe.SetupIntent
        const customerId = setupIntent.customer as string

        if (customerId) {
          // Find user by customer ID
          const { data: user } = await supabase
            .from('users')
            .select('id, received_signup_bonus')
            .eq('stripe_customer_id', customerId)
            .single()

          if (user) {
            // Mark user as having a payment method
            await supabase
              .from('users')
              .update({ has_payment_method: true })
              .eq('id', user.id)

            console.log(`User ${user.id} saved payment method`)

            // Grant signup bonus if not already received
            if (!user.received_signup_bonus) {
              const { data: bonusResult, error: bonusError } = await supabase.rpc('grant_signup_bonus', {
                p_user_id: user.id
              })

              if (bonusError) {
                console.error(`Failed to grant signup bonus for user ${user.id}:`, bonusError)
              } else if (bonusResult?.success) {
                console.log(`User ${user.id} received $20 signup bonus, new balance: $${bonusResult.balance_after}`)
              } else {
                console.log(`User ${user.id} signup bonus: ${bonusResult?.error || 'already received'}`)
              }
            }
          }
        }
        break
      }

      case 'payment_method.detached': {
        // Payment method removed - check if user still has payment methods
        const paymentMethod = event.data.object as Stripe.PaymentMethod
        const customerId = paymentMethod.customer as string

        if (customerId) {
          // Find user by customer ID
          const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .single()

          if (user) {
            // Check if customer still has payment methods
            const paymentMethods = await stripe.paymentMethods.list({
              customer: customerId,
              type: 'card'
            })

            if (paymentMethods.data.length === 0) {
              // No more payment methods, update user
              await supabase
                .from('users')
                .update({
                  has_payment_method: false,
                  auto_recharge_enabled: false // Disable auto-recharge if no payment method
                })
                .eq('id', user.id)

              console.log(`User ${user.id} has no more payment methods, disabled auto-recharge`)
            }
          }
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const userId = subscription.metadata?.supabase_user_id

        if (userId) {
          const plan = subscription.status === 'active' ? 'pro' : 'free'

          await supabase
            .from('users')
            .update({
              plan,
              stripe_subscription_status: subscription.status,
              stripe_current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
            })
            .eq('id', userId)

          console.log(`User ${userId} subscription updated to ${subscription.status}`)
        } else {
          // Try to find user by customer ID
          const customerId = subscription.customer as string
          const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .single()

          if (user) {
            const plan = subscription.status === 'active' ? 'pro' : 'free'

            await supabase
              .from('users')
              .update({
                plan,
                stripe_subscription_id: subscription.id,
                stripe_subscription_status: subscription.status,
                stripe_current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
              })
              .eq('id', user.id)

            console.log(`User ${user.id} subscription updated to ${subscription.status}`)
          }
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId = subscription.customer as string

        // Find user by customer ID
        const { data: user } = await supabase
          .from('users')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (user) {
          await supabase
            .from('users')
            .update({
              plan: 'free',
              stripe_subscription_status: 'canceled',
              stripe_subscription_id: null
            })
            .eq('id', user.id)

          console.log(`User ${user.id} subscription canceled, downgraded to free`)
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        // Find user by customer ID
        const { data: user } = await supabase
          .from('users')
          .select('id, email')
          .eq('stripe_customer_id', customerId)
          .single()

        if (user) {
          await supabase
            .from('users')
            .update({
              stripe_subscription_status: 'past_due'
            })
            .eq('id', user.id)

          console.log(`User ${user.id} payment failed, marked as past_due`)
          // TODO: Send notification email about failed payment
        }
        break
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string
        const subscriptionId = invoice.subscription as string

        if (subscriptionId) {
          const { data: user } = await supabase
            .from('users')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .single()

          if (user) {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId)

            await supabase
              .from('users')
              .update({
                plan: 'pro',
                stripe_subscription_status: subscription.status,
                stripe_current_period_end: new Date(subscription.current_period_end * 1000).toISOString()
              })
              .eq('id', user.id)

            console.log(`User ${user.id} invoice paid, subscription renewed`)
          }
        }
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(JSON.stringify({ error: error.message || 'Webhook handler failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
