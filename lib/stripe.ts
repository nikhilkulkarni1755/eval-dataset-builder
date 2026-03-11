import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  }
  return _stripe
}

// Proxy so callers can do `stripe.xxx` without change
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string, unknown>)[prop as string]
  },
})

export async function getOrCreateCustomer(userId: string, email: string): Promise<string> {
  const { createServiceClient } = await import('./supabase/server')
  const supabase = await createServiceClient()

  const { data: user } = await supabase
    .from('users')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single()

  if (user?.stripe_customer_id) {
    return user.stripe_customer_id
  }

  const customer = await getStripe().customers.create({
    email,
    metadata: { supabase_user_id: userId },
  })

  await supabase
    .from('users')
    .update({ stripe_customer_id: customer.id })
    .eq('id', userId)

  return customer.id
}
