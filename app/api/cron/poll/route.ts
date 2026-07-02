import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/utils'
import { markPollStarted } from '@/modules/contact-form-reply-catcher/lib/db'
import { pollMailbox } from '@/modules/contact-form-reply-catcher/lib/poll'

// Vercel appends `Authorization: Bearer $CRON_SECRET` to its own cron requests
// automatically when CRON_SECRET is set - no separate secret scheme needed.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return errorResponse('CRON_SECRET is not configured', 503)

  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) return errorResponse('Unauthorized', 401)

  await markPollStarted()
  const result = await pollMailbox()

  if (!result.ok) return errorResponse(result.error ?? 'Poll failed', 500)
  return NextResponse.json(result)
}
