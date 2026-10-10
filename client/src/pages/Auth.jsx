import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { authApi } from '../services/auth.js';
import { useSeo } from '../hooks/useSeo.js';
import { AuthShell, Field, fieldErrors } from '../components/auth/AuthShell.jsx';

const Banner = ({ tone = 'error', children }) => children ? (
  <p role={tone === 'error' ? 'alert' : 'status'} className={`mb-5 p-3 text-small border ${tone === 'error' ? 'border-oxblood text-oxblood' : 'border-ink'}`}>{children}</p>
) : null;

function useForm(submit) {
  const [state, setState] = useState({ busy: false, error: null, fields: {} });
  const onSubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setState({ busy: true, error: null, fields: {} });
    try { await submit(data); setState((s) => ({ ...s, busy: false })); }
    catch (err) { setState({ busy: false, error: err, fields: fieldErrors(err) }); }
  };
  return { ...state, onSubmit };
}
const errText = (e) => (e && !e.details?.length ? e.message : e?.details?.length ? 'Please fix the highlighted fields.' : null);

export function Login() {
  useSeo({ title: 'Sign in', noindex: true });
  const { login } = useAuth(); const nav = useNavigate(); const loc = useLocation();
  const [unverified, setUnverified] = useState(null); const [note, setNote] = useState('');
  const f = useForm(async (d) => {
    setUnverified(null); setNote('');
    try { await login(d); nav(loc.state?.from ?? '/', { replace: true }); }
    catch (e) { if (e.code === 'EMAIL_NOT_VERIFIED') setUnverified(d.email); throw e; }
  });
  return (
    <AuthShell title="Welcome back." intro="Sign in to see your orders, wishlist and saved addresses.">
      <form onSubmit={f.onSubmit} noValidate>
        <Banner>{errText(f.error)}</Banner><Banner tone="ok">{note}</Banner>
        <Field label="Email" name="email" type="email" autoComplete="email" required error={f.fields.email} />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required error={f.fields.password} />
        <button className="btn btn-solid w-full" disabled={f.busy}>{f.busy ? 'Signing in…' : 'Sign in'}</button>
        {unverified && <button type="button" className="mt-4 text-small link-u" onClick={async () => { await authApi.resend(unverified); setNote('If that account is unverified, a new link is on its way.'); }}>Resend verification email</button>}
        <p className="mt-6 text-small flex justify-between"><Link to="/forgot-password" className="link-u">Forgot password?</Link><Link to="/register" className="link-u">Create account</Link></p>
      </form>
    </AuthShell>
  );
}

export function Register() {
  useSeo({ title: 'Create account', noindex: true });
  const [done, setDone] = useState(null);
  const f = useForm(async (d) => { if (!d.phone) delete d.phone; setDone(await authApi.register(d)); });
  if (done) return (
    <AuthShell title="Check your inbox." intro="">
      <p>{done.verificationRequired ? <>We sent a verification link to <strong>{done.user.email}</strong>. It expires in 24 hours.</> : 'Your account is ready.'}</p>
      {done.verificationRequired && !done.emailAccepted && <p className="mt-3 text-small text-muted">We couldn’t send the verification email just now, so no message is on its way. Try signing in to request a new link, or contact support.</p>}
      <Link to="/login" className="btn btn-solid mt-8">Go to sign in</Link>
    </AuthShell>
  );
  return (
    <AuthShell title="Join Nessence." intro="Faster checkout, order tracking and a wishlist that remembers.">
      <form onSubmit={f.onSubmit} noValidate>
        <Banner>{errText(f.error)}</Banner>
        <Field label="Full name" name="name" autoComplete="name" required error={f.fields.name} />
        <Field label="Email" name="email" type="email" autoComplete="email" required error={f.fields.email} />
        <Field label="Phone (optional)" name="phone" type="tel" autoComplete="tel" error={f.fields.phone} />
        <Field label="Password" name="password" type="password" autoComplete="new-password" required error={f.fields.password} />
        <p className="-mt-3 mb-5 text-small text-muted">At least 8 characters, with a letter and a number.</p>
        <button className="btn btn-solid w-full" disabled={f.busy}>{f.busy ? 'Creating…' : 'Create account'}</button>
        <p className="mt-6 text-small">Already registered? <Link to="/login" className="link-u">Sign in</Link></p>
      </form>
    </AuthShell>
  );
}

export function VerifyEmail() {
  useSeo({ title: 'Verify email', noindex: true });
  const token = useSearchParams()[0].get('token');
  const [st, setSt] = useState(token ? 'working' : 'bad'); const [msg, setMsg] = useState('');
  const started = useRef(false);
  useEffect(() => {
    if (!token || started.current) return; started.current = true; // single-use token: never send it twice (StrictMode re-runs effects in dev)
    authApi.verifyEmail(token).then(() => setSt('ok'), (e) => { setMsg(e.message); setSt('bad'); });
  }, [token]);
  return (
    <AuthShell title={st === 'ok' ? 'Email verified.' : st === 'working' ? 'Verifying…' : 'Link not valid.'}>
      {st === 'ok' && <><p>Your account is ready to use.</p><Link to="/login" className="btn btn-solid mt-8">Sign in</Link></>}
      {st === 'bad' && <><p className="text-muted">{msg || 'This link is missing or has expired.'}</p><Link to="/login" className="btn btn-line mt-8">Back to sign in</Link></>}
    </AuthShell>
  );
}

export function ForgotPassword() {
  useSeo({ title: 'Reset password', noindex: true });
  const [msg, setMsg] = useState('');
  const f = useForm(async (d) => setMsg((await authApi.forgot(d.email)).message));
  return (
    <AuthShell title="Reset your password." intro="Enter your email and we’ll send a link that expires in one hour.">
      <form onSubmit={f.onSubmit} noValidate>
        <Banner>{errText(f.error)}</Banner><Banner tone="ok">{msg}</Banner>
        <Field label="Email" name="email" type="email" autoComplete="email" required error={f.fields.email} />
        <button className="btn btn-solid w-full" disabled={f.busy}>{f.busy ? 'Sending…' : 'Send reset link'}</button>
        <p className="mt-6 text-small"><Link to="/login" className="link-u">Back to sign in</Link></p>
      </form>
    </AuthShell>
  );
}

export function ResetPassword() {
  useSeo({ title: 'Choose a new password', noindex: true });
  const token = useSearchParams()[0].get('token'); const nav = useNavigate();
  const f = useForm(async (d) => { await authApi.reset(token, d.password); nav('/login', { replace: true }); });
  if (!token) return <AuthShell title="Link not valid."><Link to="/forgot-password" className="btn btn-line">Request a new link</Link></AuthShell>;
  return (
    <AuthShell title="Choose a new password.">
      <form onSubmit={f.onSubmit} noValidate>
        <Banner>{errText(f.error)}</Banner>
        <Field label="New password" name="password" type="password" autoComplete="new-password" required error={f.fields.password} />
        <button className="btn btn-solid w-full" disabled={f.busy}>{f.busy ? 'Saving…' : 'Update password'}</button>
      </form>
    </AuthShell>
  );
}
