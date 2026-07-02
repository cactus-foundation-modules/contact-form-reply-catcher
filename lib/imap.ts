import { ImapFlow } from 'imapflow'
import { encryptSecret, decryptSecret } from '@/lib/crypto/secrets'
import { getMailboxConfig, storeOAuthTokens } from './db'
import { refreshMicrosoftToken } from './oauth-microsoft'
import type { MailboxConfig } from './types'

const SENT_FOLDER_FALLBACKS = ['Sent', 'Sent Items', 'Sent Mail', 'INBOX.Sent']

// Refreshes the Outlook access token if it's missing or expiring within 5 minutes,
// persisting the new token pair back to rc_mailbox_config.
async function resolveOutlookAccessToken(config: MailboxConfig): Promise<string> {
  const clientId = config.oauthClientIdEncrypted ? decryptSecret(config.oauthClientIdEncrypted) : null
  const clientSecret = config.oauthClientSecretEncrypted ? decryptSecret(config.oauthClientSecretEncrypted) : null
  const refreshToken = config.oauthRefreshTokenEncrypted ? decryptSecret(config.oauthRefreshTokenEncrypted) : null
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Outlook OAuth is not fully connected. Reconnect it from the Reply Catcher settings page.')
  }

  const expiringSoon = !config.oauthTokenExpiresAt || config.oauthTokenExpiresAt.getTime() - Date.now() < 5 * 60_000
  if (!expiringSoon && config.oauthAccessTokenEncrypted) {
    return decryptSecret(config.oauthAccessTokenEncrypted)
  }

  const tokens = await refreshMicrosoftToken({ clientId, clientSecret, refreshToken })
  await storeOAuthTokens({
    accessTokenEncrypted: encryptSecret(tokens.accessToken),
    refreshTokenEncrypted: encryptSecret(tokens.refreshToken),
    expiresAt: tokens.expiresAt,
  })
  return tokens.accessToken
}

export async function connectMailbox(): Promise<ImapFlow> {
  const config = await getMailboxConfig()
  if (!config || !config.provider) {
    throw new Error('No mailbox is configured yet. Set one up on the Reply Catcher settings page.')
  }

  if (config.provider === 'imap') {
    if (!config.imapHost || !config.imapUsername || !config.imapPasswordEncrypted) {
      throw new Error('IMAP mailbox is not fully configured.')
    }
    const client = new ImapFlow({
      host: config.imapHost,
      port: config.imapPort,
      secure: true,
      auth: { user: config.imapUsername, pass: decryptSecret(config.imapPasswordEncrypted) },
      logger: false,
    })
    await client.connect()
    return client
  }

  // outlook_oauth
  if (!config.imapUsername) {
    throw new Error('Outlook mailbox has no username on file. Reconnect it from the Reply Catcher settings page.')
  }
  const accessToken = await resolveOutlookAccessToken(config)
  const client = new ImapFlow({
    host: 'outlook.office365.com',
    port: 993,
    secure: true,
    auth: { user: config.imapUsername, accessToken },
    logger: false,
  })
  await client.connect()
  return client
}

export async function resolveFolders(
  client: ImapFlow,
  configured: { inboxFolder: string | null; sentFolder: string | null }
): Promise<{ inbox: string; sent: string | null }> {
  if (configured.inboxFolder && configured.sentFolder) {
    return { inbox: configured.inboxFolder, sent: configured.sentFolder }
  }

  const list = await client.list()
  const inbox = configured.inboxFolder ?? list.find((m) => m.path.toUpperCase() === 'INBOX')?.path ?? 'INBOX'

  if (configured.sentFolder) {
    return { inbox, sent: configured.sentFolder }
  }

  const bySpecialUse = list.find((m) => m.specialUse === '\\Sent')
  if (bySpecialUse) return { inbox, sent: bySpecialUse.path }

  const byName = list.find((m) => SENT_FOLDER_FALLBACKS.includes(m.name))
  return { inbox, sent: byName?.path ?? null }
}
