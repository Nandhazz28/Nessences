import { useId, useState } from 'react';
import { newsletterApi } from '../../services/engage.js';

// compact: used inside a section that already has its own heading and intro, so only the form is drawn.
export function NewsletterForm({ source = 'footer', compact = false }) {
  const id = useId(); const [state, setState] = useState({ status: 'idle', message: '' });
  const submit = async (e) => {
    e.preventDefault(); const form = e.currentTarget; const email = new FormData(form).get('email').toString().trim();
    if (!email) return;
    setState({ status: 'loading', message: '' });
    try { const r = await newsletterApi.subscribe(email, source); setState({ status: 'done', message: r.message }); form.reset(); }
    catch (err) { setState({ status: 'error', message: err.details?.[0]?.message ?? err.message }); }
  };
  return (
    <form onSubmit={submit} noValidate {...(compact ? { 'aria-label': 'Subscribe to release news' } : { 'aria-labelledby': `${id}t` })}>
      {!compact && <><h2 id={`${id}t`} className="eyebrow font-sans !font-semibold">Join the mailing list</h2>
      <p className="mt-3 text-small text-muted max-w-xs">New arrivals and restocks. We’ll email a link to confirm — unsubscribe any time.</p></>}
      <div className="mt-4 flex max-w-sm">
        <label htmlFor={`${id}e`} className="sr-only">Email address</label>
        <input id={`${id}e`} name="email" type="email" autoComplete="email" required placeholder="Email address" className="field" aria-invalid={state.status === 'error'} aria-describedby={`${id}m`} />
        <button className="btn btn-solid" disabled={state.status === 'loading'}>{state.status === 'loading' ? 'Sending…' : 'Sign up'}</button>
      </div>
      <p id={`${id}m`} role={state.status === 'error' ? 'alert' : 'status'} className={`mt-2 text-small min-h-5 ${state.status === 'error' ? 'text-oxblood' : 'text-muted'}`}>{state.message}</p>
    </form>
  );
}
