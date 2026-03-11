import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateCustomer, stripe } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { projectId } = await req.json()
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!

  const customerId = await getOrCreateCustomer(user.id, user.email!)

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: process.env.STRIPE_PRICE_MONTHLY!, quantity: 1 }],
    success_url: `${baseUrl}/projects/${projectId}/generate?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/projects/${projectId}`,
    metadata: { projectId, userId: user.id },
  })

  return NextResponse.json({ url: session.url })
}

export async function GET() {
  // Redirect GET requests (from billing page link) to checkout POST via a form
  return NextResponse.redirect(new URL('/settings/billing', process.env.NEXT_PUBLIC_APP_URL!))
}
