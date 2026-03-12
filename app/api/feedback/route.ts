import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { type, message } = await req.json() as { type: string; message: string }

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY!)

  await resend.emails.send({
    from: 'Eval Dataset Builder <feedback@nsk1755server.com>',
    to: process.env.FEEDBACK_EMAIL!,
    subject: `[${type}] Feedback from ${user.email}`,
    text: `From: ${user.email}\nType: ${type}\n\n${message}`,
  })

  return NextResponse.json({ success: true })
}
