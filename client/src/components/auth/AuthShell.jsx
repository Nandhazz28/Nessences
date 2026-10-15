import { useId } from 'react';

export function AuthShell({ title, intro, children }) {
  return (
    <div className="wrap py-16 md:py-24 grid md:grid-cols-[1fr_28rem] gap-12 items-start">
      <div className="hidden md:block pt-4"><h1 className="text-[length:var(--text-h1)]">{title}</h1>{intro && <p className="mt-4 text-muted max-w-sm">{intro}</p>}</div>
      <div><h1 className="md:hidden text-[length:var(--text-h2)] mb-6">{title}</h1>{children}</div>
    </div>
  );
}

export function Field({ label, error, ...props }) {
  const id = useId();
  return (
    <div className="mb-5">
      <label htmlFor={id} className="eyebrow !text-ink font-semibold block mb-2">{label}</label>
      <input id={id} className="field" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-e` : undefined} {...props} />
      {error && <p id={`${id}-e`} role="alert" className="mt-1.5 text-small text-oxblood">{error}</p>}
    </div>
  );
}

export const fieldErrors = (err) => Object.fromEntries((err?.details ?? []).map((d) => [d.field, d.message]));
