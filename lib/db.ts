import { prisma } from '@/lib/db/prisma'
import type { MailboxConfig } from './types'

// ---------------------------------------------------------------------------
// Mailbox config (singleton row)
// ---------------------------------------------------------------------------

function mapConfigRow(r: Record<string, unknown>): MailboxConfig {
  return {
    provider: (r.provider as MailboxConfig['provider']) ?? null,
    imapHost: (r.imap_host as string | null) ?? null,
    imapPort: (r.imap_port as number) ?? 993,
    imapUsername: (r.imap_username as string | null) ?? null,
    imapPasswordEncrypted: (r.imap_password_encrypted as string | null) ?? null,
    oauthClientIdEncrypted: (r.oauth_client_id_encrypted as string | null) ?? null,
    oauthClientSecretEncrypted: (r.oauth_client_secret_encrypted as string | null) ?? null,
    oauthAccessTokenEncrypted: (r.oauth_access_token_encrypted as string | null) ?? null,
    oauthRefreshTokenEncrypted: (r.oauth_refresh_token_encrypted as string | null) ?? null,
    oauthTokenExpiresAt: (r.oauth_token_expires_at as Date | null) ?? null,
    inboxFolder: (r.inbox_folder as string | null) ?? null,
    sentFolder: (r.sent_folder as string | null) ?? null,
    lastPollAt: (r.last_poll_at as Date | null) ?? null,
    lastPollStatus: (r.last_poll_status as MailboxConfig['lastPollStatus']) ?? null,
    lastPollError: (r.last_poll_error as string | null) ?? null,
  }
}

export async function getMailboxConfig(): Promise<MailboxConfig | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM "rc_mailbox_config" WHERE "id" = 'singleton' LIMIT 1
  `
  const row = rows[0]
  return row ? mapConfigRow(row) : null
}

export type UpsertMailboxConfigData = {
  provider: MailboxConfig['provider']
  // Undefined = leave unchanged. Empty string on the folder fields clears the
  // override back to auto-detect.
  imapHost?: string
  imapPort?: number
  imapUsername?: string
  imapPasswordEncrypted?: string
  oauthClientIdEncrypted?: string
  oauthClientSecretEncrypted?: string
  inboxFolder?: string
  sentFolder?: string
}

export async function upsertMailboxConfig(data: UpsertMailboxConfigData): Promise<void> {
  const existing = await getMailboxConfig()

  const imapHost = data.imapHost !== undefined ? data.imapHost : existing?.imapHost ?? null
  const imapPort = data.imapPort !== undefined ? data.imapPort : existing?.imapPort ?? 993
  const imapUsername = data.imapUsername !== undefined ? data.imapUsername : existing?.imapUsername ?? null
  const imapPasswordEncrypted = data.imapPasswordEncrypted !== undefined
    ? data.imapPasswordEncrypted : existing?.imapPasswordEncrypted ?? null
  const oauthClientIdEncrypted = data.oauthClientIdEncrypted !== undefined
    ? data.oauthClientIdEncrypted : existing?.oauthClientIdEncrypted ?? null
  const oauthClientSecretEncrypted = data.oauthClientSecretEncrypted !== undefined
    ? data.oauthClientSecretEncrypted : existing?.oauthClientSecretEncrypted ?? null
  const inboxFolder = data.inboxFolder !== undefined ? (data.inboxFolder || null) : existing?.inboxFolder ?? null
  const sentFolder = data.sentFolder !== undefined ? (data.sentFolder || null) : existing?.sentFolder ?? null

  await prisma.$executeRaw`
    INSERT INTO "rc_mailbox_config"
      ("id", "provider", "imap_host", "imap_port", "imap_username", "imap_password_encrypted",
       "oauth_client_id_encrypted", "oauth_client_secret_encrypted", "inbox_folder", "sent_folder")
    VALUES
      ('singleton', ${data.provider}, ${imapHost}, ${imapPort}, ${imapUsername}, ${imapPasswordEncrypted},
       ${oauthClientIdEncrypted}, ${oauthClientSecretEncrypted}, ${inboxFolder}, ${sentFolder})
    ON CONFLICT ("id") DO UPDATE SET
      "provider" = ${data.provider},
      "imap_host" = ${imapHost},
      "imap_port" = ${imapPort},
      "imap_username" = ${imapUsername},
      "imap_password_encrypted" = ${imapPasswordEncrypted},
      "oauth_client_id_encrypted" = ${oauthClientIdEncrypted},
      "oauth_client_secret_encrypted" = ${oauthClientSecretEncrypted},
      "inbox_folder" = ${inboxFolder},
      "sent_folder" = ${sentFolder},
      "updated_at" = CURRENT_TIMESTAMP
  `
}

export async function storeOAuthTokens(opts: {
  accessTokenEncrypted: string
  refreshTokenEncrypted: string
  expiresAt: Date
}): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "rc_mailbox_config" SET
      "oauth_access_token_encrypted" = ${opts.accessTokenEncrypted},
      "oauth_refresh_token_encrypted" = ${opts.refreshTokenEncrypted},
      "oauth_token_expires_at" = ${opts.expiresAt},
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = 'singleton'
  `
}

// Written synchronously before a poll starts, so a concurrent second "Check now"
// click sees a fresh lastPollAt and gets rejected by the cooldown check - without
// waiting for the poll itself (which can take a while) to finish.
export async function markPollStarted(): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "rc_mailbox_config" SET "last_poll_at" = CURRENT_TIMESTAMP WHERE "id" = 'singleton'
  `
}

export async function recordPollResult(opts: {
  status: 'ok' | 'error'
  error?: string | null
}): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "rc_mailbox_config" SET
      "last_poll_at" = CURRENT_TIMESTAMP,
      "last_poll_status" = ${opts.status},
      "last_poll_error" = ${opts.error ?? null}
    WHERE "id" = 'singleton'
  `
}

// ---------------------------------------------------------------------------
// Processed-message dedupe ledger
// ---------------------------------------------------------------------------

export async function getMaxProcessedUid(folder: string): Promise<number | null> {
  const rows = await prisma.$queryRaw<[{ max: number | null }]>`
    SELECT MAX("imap_uid") as max FROM "rc_processed_messages" WHERE "imap_folder" = ${folder}
  `
  return rows[0]?.max ?? null
}

export async function markMessageProcessed(opts: {
  uid: number
  folder: string
  messageIdHeader: string | null
  matchedSubmissionId: string | null
}): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "rc_processed_messages"
      ("id", "imap_uid", "imap_folder", "message_id_header", "matched_submission_id")
    VALUES
      (gen_random_uuid()::text, ${opts.uid}, ${opts.folder}, ${opts.messageIdHeader}, ${opts.matchedSubmissionId})
    ON CONFLICT ("imap_folder", "imap_uid") DO NOTHING
  `
}

// ---------------------------------------------------------------------------
// Cross-module reads against contact-form's cf_ tables. Read-only, and safe
// because this module hard-depends on contact-form (requiresModules in the
// manifest) - same raw-SQL pattern contact-form itself uses for its own
// untyped tables. Contact-form's schema is never altered by this module: all
// caught-reply data lives in this module's own rc_caught_replies table below,
// so installs running contact-form without Reply Catcher carry none of this.
// ---------------------------------------------------------------------------

export type SubmissionCandidate = { id: string; subject: string | null }

// Most recent submissions from a given email address, newest first. Matching
// is a best-effort heuristic (recency + optional subject-line overlap) rather
// than strict header threading - see findBestSubmissionMatch.
export async function findRecentSubmissionsByEmail(email: string, limit = 5): Promise<SubmissionCandidate[]> {
  const rows = await prisma.$queryRaw<SubmissionCandidate[]>`
    SELECT "id", "subject" FROM "cf_contact_submissions"
    WHERE "email" = ${email}
    ORDER BY "created_at" DESC
    LIMIT ${limit}
  `
  return rows
}

export async function markSubmissionUnread(submissionId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "cf_contact_submissions"
    SET "status" = 'unread', "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${submissionId}
  `
}

// ---------------------------------------------------------------------------
// Caught replies (this module's own table)
// ---------------------------------------------------------------------------

export type CaughtReply = {
  id: string
  createdAt: Date
  submissionId: string
  body: string
  senderType: 'admin' | 'submitter'
  externalEmail: string | null
}

export async function insertCaughtReply(opts: {
  submissionId: string
  body: string
  senderType: 'admin' | 'submitter'
  externalEmail: string | null
}): Promise<string> {
  const rows = await prisma.$queryRaw<[{ id: string }]>`
    INSERT INTO "rc_caught_replies"
      ("id", "submission_id", "body", "sender_type", "external_email")
    VALUES
      (gen_random_uuid()::text, ${opts.submissionId}, ${opts.body}, ${opts.senderType}, ${opts.externalEmail})
    RETURNING "id"
  `
  return rows[0].id
}

export async function listCaughtRepliesBySubmission(submissionId: string): Promise<CaughtReply[]> {
  const rows = await prisma.$queryRaw<Array<{
    id: string; created_at: Date; submission_id: string; body: string;
    sender_type: 'admin' | 'submitter'; external_email: string | null;
  }>>`
    SELECT * FROM "rc_caught_replies" WHERE "submission_id" = ${submissionId} ORDER BY "created_at" ASC
  `
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    submissionId: r.submission_id,
    body: r.body,
    senderType: r.sender_type,
    externalEmail: r.external_email,
  }))
}

// Submissions that have at least one caught reply, newest catch first - drives
// this module's own "Caught Replies" inbox list.
export async function listSubmissionsWithCaughtReplies(): Promise<Array<{
  submissionId: string; name: string; email: string; subject: string | null; lastCaughtAt: Date
}>> {
  const rows = await prisma.$queryRaw<Array<{
    submission_id: string; name: string; email: string; subject: string | null; last_caught_at: Date
  }>>`
    SELECT s."id" as submission_id, s."name", s."email", s."subject", MAX(r."created_at") as last_caught_at
    FROM "rc_caught_replies" r
    JOIN "cf_contact_submissions" s ON s."id" = r."submission_id"
    GROUP BY s."id", s."name", s."email", s."subject"
    ORDER BY last_caught_at DESC
  `
  return rows.map((r) => ({
    submissionId: r.submission_id,
    name: r.name,
    email: r.email,
    subject: r.subject,
    lastCaughtAt: r.last_caught_at,
  }))
}
