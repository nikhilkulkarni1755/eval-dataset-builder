import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription') break

        const customerId = session.customer as string
        const subscriptionId = session.subscription as string

        // Check idempotency
        const { data: existing } = await getSupabaseAdmin()
          .from('users')
          .select('id')
          .eq('stripe_subscription_id', subscriptionId)
          .single()

        if (!existing) {
          await getSupabaseAdmin()
            .from('users')
            .update({
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              subscription_status: 'active',
              billing_period_start: new Date().toISOString(),
            })
            .eq('stripe_customer_id', customerId)
        }
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        await getSupabaseAdmin()
          .from('users')
          .update({ subscription_status: sub.status })
          .eq('stripe_subscription_id', sub.id)
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await getSupabaseAdmin()
          .from('users')
          .update({ subscription_status: 'canceled' })
          .eq('stripe_subscription_id', sub.id)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        // parent.subscription_id is the field in newer Stripe API versions
        const subscriptionId = (invoice as unknown as { subscription?: string }).subscription
          ?? invoice.parent?.subscription_details?.subscription
        if (subscriptionId) {
          await getSupabaseAdmin()
            .from('users')
            .update({ subscription_status: 'past_due' })
            .eq('stripe_subscription_id', subscriptionId)
        }
        break
      }

      default:
        // Unhandled event — return 200 anyway
        break
    }
  } catch (err) {
    console.error('Webhook handler error:', err)
    // Still return 200 to Stripe
  }

  return NextResponse.json({ received: true })
}
