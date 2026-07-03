export function CaughtRepliesButton({ adminPath }: { adminPath: string }) {
  return (
    <a href={`/${adminPath}/m/contact-form-reply-catcher/inbox`} className="btn btn-secondary btn-sm">
      Caught Replies
    </a>
  )
}
