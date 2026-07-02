-- Reply Catcher Module — Initial Migration
-- Table prefix: rc_
-- Applied once by the Cactus module migration runner during build.
-- Hard-depends on the contact-form module (cf_ tables) being installed first.

-- ---------------------------------------------------------------------------
-- Mailbox config (singleton row)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "rc_mailbox_config" (
    "id"                            TEXT         NOT NULL DEFAULT 'singleton',
    "created_at"                    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"                    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 'imap' | 'outlook_oauth'
    "provider"                      TEXT,

    -- Plain IMAP + app-password
    "imap_host"                     TEXT,
    "imap_port"                     INTEGER      NOT NULL DEFAULT 993,
    "imap_username"                 TEXT,
    "imap_password_encrypted"       TEXT,

    -- Outlook OAuth (site owner registers their own Azure app — no CASA-style gate)
    "oauth_client_id_encrypted"     TEXT,
    "oauth_client_secret_encrypted" TEXT,
    "oauth_access_token_encrypted"  TEXT,
    "oauth_refresh_token_encrypted" TEXT,
    "oauth_token_expires_at"        TIMESTAMP(3),

    -- Folder names; null = auto-detect via SPECIAL-USE / common-name fallback
    "inbox_folder"                  TEXT,
    "sent_folder"                   TEXT,

    "last_poll_at"                  TIMESTAMP(3),
    -- 'ok' | 'error' | null (never polled)
    "last_poll_status"              TEXT,
    "last_poll_error"               TEXT,

    CONSTRAINT "rc_mailbox_config_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "rc_mailbox_config"
        ADD CONSTRAINT "rc_mailbox_config_provider_check"
        CHECK ("provider" IS NULL OR "provider" IN ('imap', 'outlook_oauth'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Processed-message dedupe ledger. The mailbox itself is never mutated (no
-- mark-read/move/delete) — this table is the only record of what's been seen.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "rc_processed_messages" (
    "id"                    TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
    "imap_uid"               INTEGER      NOT NULL,
    "imap_folder"            TEXT         NOT NULL,
    "message_id_header"      TEXT,
    "matched_submission_id"  TEXT,
    "processed_at"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rc_processed_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "rc_processed_messages_folder_uid_key"
    ON "rc_processed_messages" ("imap_folder", "imap_uid");
CREATE INDEX IF NOT EXISTS "rc_processed_messages_message_id_idx"
    ON "rc_processed_messages" ("message_id_header");

-- ---------------------------------------------------------------------------
-- Caught replies. Entirely owned by this module - the contact-form module's
-- own tables are never altered, so sites running contact-form without Reply
-- Catcher installed carry zero extra columns/tables for this. Read-only
-- cross-module reads against cf_contact_submissions are fine (hard dependency,
-- same pattern contact-form itself uses for its own untyped tables); this FK
-- is a one-way pointer added from our side, so it doesn't touch their schema.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "rc_caught_replies" (
    "id"             TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
    "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submission_id"  TEXT         NOT NULL,
    "body"           TEXT         NOT NULL,
    -- 'submitter' (caught from the Inbox) | 'admin' (caught from the Sent folder)
    "sender_type"    TEXT         NOT NULL,
    "external_email" TEXT,

    CONSTRAINT "rc_caught_replies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rc_caught_replies_submission_fk"
        FOREIGN KEY ("submission_id") REFERENCES "cf_contact_submissions" ("id") ON DELETE CASCADE
);

DO $$ BEGIN
    ALTER TABLE "rc_caught_replies"
        ADD CONSTRAINT "rc_caught_replies_sender_type_check"
        CHECK ("sender_type" IN ('admin', 'submitter'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "rc_caught_replies_submission_idx" ON "rc_caught_replies" ("submission_id");
