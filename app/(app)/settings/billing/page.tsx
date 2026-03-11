import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { stripe } from '@/lib/stripe'

async function createPortalSession() {
  'use server'
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (!profile?.stripe_customer_id) {
    redirect('/settings/billing?error=no_customer')
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
  })

  redirect(session.url)
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('subscription_status, examples_generated_this_month, stripe_customer_id, billing_period_start')
    .eq('id', user.id)
    .single()

  const sp = await searchParams
  const isActive = profile?.subscription_status === 'active'

  return (
    <div className="p-8 max-w-xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Billing</h1>

      {sp?.error === 'no_customer' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 mb-6">
          No billing account found. Subscribe first to manage your plan.
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
        {/* Subscription status */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-700">Plan</div>
            <div className="text-lg font-semibold text-gray-900 mt-0.5">
              {isActive ? 'Eval Dataset Builder Pro' : 'No active plan'}
            </div>
          </div>
          <StatusBadge status={profile?.subscription_status ?? 'inactive'} />
        </div>

        {/* Usage */}
        <div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-gray-600">Examples this month</span>
            <span className="font-medium text-gray-900">
              {profile?.examples_generated_this_month ?? 0} / 1,000
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-gray-900 h-2 rounded-full"
              style={{ width: `${Math.min(100, ((profile?.examples_generated_this_month ?? 0) / 1000) * 100)}%` }}
            />
          </div>
          {profile?.billing_period_start && (
            <p className="text-xs text-gray-400 mt-1">
              Resets {new Date(new Date(profile.billing_period_start).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Actions */}
        {isActive ? (
          <form action={createPortalSession}>
            <button
              type="submit"
              className="w-full border border-gray-300 text-gray-700 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Manage subscription
            </button>
          </form>
        ) : (
          <Link
            href="/api/checkout"
            className="block w-full text-center bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            Subscribe — $49/mo
          </Link>
        )}
      </div>

      <p className="mt-4 text-xs text-gray-400 text-center">
        Payments are processed securely by Stripe.
      </p>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-green-50 text-green-700',
    canceled: 'bg-gray-100 text-gray-500',
    trialing: 'bg-blue-50 text-blue-700',
    past_due: 'bg-red-50 text-red-700',
    inactive: 'bg-gray-100 text-gray-500',
  }
  return (
    <span className={`text-xs px-3 py-1 rounded-full font-medium capitalize ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}
