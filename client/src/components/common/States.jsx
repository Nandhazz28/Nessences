export function Spinner({ label = "Loading" }) {
  return (
    <div role="status" aria-live="polite" className="py-24 text-center eyebrow">
      {label}…
    </div>
  );
}

const AUTH_CODES = new Set([
  "SESSION_EXPIRED",
  "UNAUTHORIZED",
  "TOKEN_EXPIRED",
  "INVALID_TOKEN",
  "NO_REFRESH_TOKEN",
]);
export function describeError(error) {
  if (error?.isNetwork)
    return {
      title: "You appear to be offline",
      body: "Check your connection and try again.",
    };
  if (error?.status === 401 || AUTH_CODES.has(error?.code))
    return {
      title: "Your session has ended",
      body: "Please sign in again to continue.",
      signIn: true,
    };
  if (error?.status >= 500 || error?.status === 429)
    return {
      title: "Nessence is having a moment",
      body: "This is on our side, not yours. Please try again in a few moments.",
    };
  return { title: "We could not load this", body: error?.message };
}
export function ErrorState({ error, onRetry }) {
  const d = describeError(error);
  return (
    <div role="alert" className="py-20 text-center">
      <h2 className="text-[length:var(--text-h3)]">{d.title}</h2>
      <p className="mt-3 text-muted max-w-md mx-auto">{d.body}</p>
      {d.signIn && (
        <a href="/login" className="btn btn-solid mt-8">
          Sign in
        </a>
      )}
      {onRetry && !d.signIn && (
        <button className="btn btn-line mt-8" onClick={onRetry}>
          Try again
        </button>
      )}
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
    <div
      aria-hidden="true"
      className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-10"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <div className="aspect-[4/5] bg-sand animate-pulse" />
          <div className="mt-3 h-3 w-2/3 bg-sand animate-pulse" />
        </div>
      ))}
    </div>
  );
}
