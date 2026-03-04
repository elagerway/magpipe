import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveUser } from '../_shared/api-auth.ts'
import Stripe from 'npm:stripe@14.10.0'
import { corsHeaders, handleCors } from '../_shared/cors.ts'

// Predefined credit amounts (in USD)
const CREDIT_AMOUNTS = {
  small: 20,
  medium: 50,
  large: 100
}

Deno.serve(async (req) => {
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

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Verify user authentication
    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    })
    const user = await resolveUser(req, supabaseClient)

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id, email, name, stripe_customer_id, credits_balance')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: 'User profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Parse request body
    const body = await req.json().catch(() => ({}))
    const { amount, amountType, successUrl, cancelUrl } = body

    // Determine the credit amount
    let creditAmount: number
    if (amountType && CREDIT_AMOUNTS[amountType as keyof typeof CREDIT_AMOUNTS]) {
      creditAmount = CREDIT_AMOUNTS[amountType as keyof typeof CREDIT_AMOUNTS]
    } else if (amount && typeof amount === 'number' && amount >= 10 && amount <= 1000) {
      // Custom amount (min $10, max $1000)
      creditAmount = Math.round(amount * 100) / 100 // Round to cents
    } else {
      return new Response(JSON.stringify({
        error: 'Invalid amount. Use amountType (small, medium, large) or custom amount between $10-$1000'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Get or create Stripe customer
    let customerId = profile.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email,
        name: profile.name || undefined,
        metadata: {
          supabase_user_id: user.id
        }
      })
      customerId = customer.id

      // Save customer ID to database
      await supabase
        .from('users')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id)
    }

    // Create checkout session for one-time payment (not subscription)
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(creditAmount * 100), // Stripe uses cents
            product_data: {
              name: `Add $${creditAmount} Credits`,
              description: `Add $${creditAmount} to your account balance for voice calls and SMS`
            }
          },
          quantity: 1
        }
      ],
      success_url: successUrl || 'http://localhost:3000/settings?credits=success',
      cancel_url: cancelUrl || 'http://localhost:3000/settings?credits=canceled',
      metadata: {
        supabase_user_id: user.id,
        credit_amount: creditAmount.toString(),
        transaction_type: 'credit_purchase'
      },
      payment_intent_data: {
        metadata: {
          supabase_user_id: user.id,
          credit_amount: creditAmount.toString(),
          transaction_type: 'credit_purchase'
        }
      }
    })

    return new Response(JSON.stringify({
      sessionId: session.id,
      url: session.url,
      amount: creditAmount
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error creating credit purchase session:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
