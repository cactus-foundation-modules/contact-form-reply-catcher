import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { getMailboxConfig, markPollStarted } from '@/modules/contact-form-reply-catcher/lib/db'
import { pollMailbox } from '@/modules/contact-form-reply-catcher/lib/poll'

const COOLDOWN_MS = 60_000

export async function POST() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'replycatcher.manage')) return errorResponse('Forbidden', 403)

  const config = await getMailboxConfig()
  if (!config?.provider) return errorResponse('No mailbox is configured yet.', 400)

  if (config.lastPollAt && Date.now() - config.lastPollAt.getTime() < COOLDOWN_MS) {
    const retryInSec = Math.ceil((COOLDOWN_MS - (Date.now() - config.lastPollAt.getTime())) / 1000)
    return errorResponse(`A check just ran - please wait ${retryInSec}s before trying again.`, 429)
  }

  await markPollStarted()
  const result = await pollMailbox()

  if (!result.ok) return errorResponse(result.error ?? 'Poll failed', 500)
  return NextResponse.json(result)
}
