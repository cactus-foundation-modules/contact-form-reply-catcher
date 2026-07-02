import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasPermission } from '@/lib/permissions/check'
import { errorResponse } from '@/lib/utils'
import { getSiteUrlOrNull } from '@/lib/config/env'
import { decryptSecret } from '@/lib/crypto/secrets'
import { getMailboxConfig } from '@/modules/contact-form-reply-catcher/lib/db'
import { buildMicrosoftAuthUrl } from '@/modules/contact-form-reply-catcher/lib/oauth-microsoft'

export async function GET() {
  const user = await getSessionFromCookie()
  if (!user) return errorResponse('Not authenticated', 401)
  if (!await hasPermission(user, 'replycatcher.manage')) return errorResponse('Forbidden', 403)

  const siteUrl = getSiteUrlOrNull()
  if (!siteUrl) return errorResponse('SITE_URL is not configured', 503)

  const config = await getMailboxConfig()
  if (config?.provider !== 'outlook_oauth' || !config.oauthClientIdEncrypted) {
    return errorResponse('Save your Azure app client ID and secret on the settings page first.', 400)
  }

  const clientId = decryptSecret(config.oauthClientIdEncrypted)
  const state = randomBytes(32).toString('hex')
  const redirectUri = `${siteUrl.replace(/\/$/, '')}/api/m/contact-form-reply-catcher/admin/oauth/microsoft/callback`

  const res = NextResponse.json({
    authorizeUrl: buildMicrosoftAuthUrl({ clientId, redirectUri, state }),
  })

  const isProduction = process.env.NODE_ENV === 'production'
  res.cookies.set('cactus_rc_oauth_state', state, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })

  return res
}
