export type MailboxProvider = 'imap' | 'outlook_oauth'

export type MailboxConfig = {
  provider: MailboxProvider | null
  imapHost: string | null
  imapPort: number
  imapUsername: string | null
  imapPasswordEncrypted: string | null
  oauthClientIdEncrypted: string | null
  oauthClientSecretEncrypted: string | null
  oauthAccessTokenEncrypted: string | null
  oauthRefreshTokenEncrypted: string | null
  oauthTokenExpiresAt: Date | null
  inboxFolder: string | null
  sentFolder: string | null
  lastPollAt: Date | null
  lastPollStatus: 'ok' | 'error' | null
  lastPollError: string | null
}

export type PollResult = {
  ok: boolean
  scanned: number
  matched: number
  unmatched: number
  error?: string
}
