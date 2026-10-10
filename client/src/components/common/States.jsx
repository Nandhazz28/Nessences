export function Spinner({ label = 'Loading' }) {
  return <div role="status" aria-live="polite" className="py-24 text-center eyebrow">{label}…</div>;
}

export function ErrorState({ error, onRetry }) {
  return (
    <div role="alert" className="py-20 text-center">
      <h2 className="text-[length:var(--text-h3)]">{error?.isNetwork ? 'You appear to be offline' : 'We could not load this'}</h2>
      <p className="mt-3 text-muted max-w-md mx-auto">{error?.message}</p>
      {onRetry && <button className="btn btn-line mt-8" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function EmptyState({ title, body, action }) {
  return (
    <div className="py-20 text-center">
      <h2 className="text-[length:var(--text-h3)]">{title}</h2>
      {body && <p className="mt-3 text-muted max-w-md mx-auto">{body}</p>}
      {action && <div className="mt-8">{action}</div>}
    </div>
  );
}

export function GridSkeleton({ count = 8 }) {
  return (
    <div aria-hidden="true" className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-10">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}><div className="aspect-[4/5] bg-sand animate-pulse" /><div className="mt-3 h-3 w-2/3 bg-sand animate-pulse" /></div>
      ))}
    </div>
  );
}
