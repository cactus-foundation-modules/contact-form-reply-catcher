import { markdownToHtml } from '@/lib/sanitize'
import { listCaughtRepliesBySubmission } from '@/modules/contact-form-reply-catcher/lib/db'

export async function CaughtRepliesPanel({ submissionId }: { submissionId: string }) {
  const replies = await listCaughtRepliesBySubmission(submissionId)
  if (replies.length === 0) return null

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        Caught replies
        <span style={{
          fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
          padding: '0.0625rem 0.375rem', borderRadius: '999px',
          background: 'var(--color-bg)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)',
        }}>
          Reply Catcher
        </span>
      </h2>
      <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
        Picked up automatically from the real mailbox - not sent via Cactus.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {replies.map((reply) => (
          <div
            key={reply.id}
            className="card"
            style={{ borderLeft: '3px solid var(--color-border-strong)', background: 'var(--color-bg-subtle)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                {reply.senderType === 'admin' ? 'You (caught from your mailbox)' : (reply.externalEmail ?? 'Submitter')}
              </span>
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                {reply.createdAt.toLocaleString('en-GB')}
              </span>
            </div>
            <div
              className="prose"
              style={{ fontSize: '0.9375rem' }}
              dangerouslySetInnerHTML={{ __html: markdownToHtml(reply.body, { breaks: true }) }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
