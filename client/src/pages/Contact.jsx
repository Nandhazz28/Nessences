import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeo } from '../hooks/useSeo.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { contactApi } from '../services/engage.js';

const CATEGORIES = [['order', 'An order'], ['product', 'A product or sizing'], ['returns', 'A return or refund'], ['press', 'Press'], ['other', 'Something else']];

export default function Contact() {
  useSeo({ title: 'Contact', description: 'Get in touch with Nessence customer care about an order, a product, a return or anything else.' });
  const { user } = useAuth(); const { settings } = useSettings(); const uid = useId();
  const [state, setState] = useState({ status: 'idle', message: '', reference: null });
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.name || '';

  const submit = async (e) => {
    e.preventDefault(); const form = e.currentTarget; const f = Object.fromEntries(new FormData(form));
    setState({ status: 'loading', message: '', reference: null });
    try {
      const r = await contactApi.submit({ name: f.name, email: f.email, category: f.category, subject: f.subject, message: f.message, orderNumber: f.orderNumber || undefined, website: f.website || undefined });
      setState({ status: 'done', message: '', reference: r.reference ?? null }); form.reset();
    } catch (err) { setState({ status: 'error', message: err.details?.[0]?.message ?? err.message, reference: null }); }
  };

  if (state.status === 'done') return (
    <div className="wrap py-20 max-w-2xl">
      <p className="eyebrow">Contact</p>
      <h1 className="text-[length:var(--text-h1)] mt-3">Thank you — we have your message</h1>
      <p role="status" className="mt-4 text-muted">A member of the team will reply by email{state.reference ? <> and can find your message under reference <strong className="text-ink">{state.reference}</strong></> : ''}.</p>
      <div className="mt-10 flex gap-3 flex-wrap"><Link to="/" className="btn btn-solid">Continue shopping</Link><button className="btn btn-line" onClick={() => setState({ status: 'idle', message: '', reference: null })}>Send another message</button></div>
    </div>
  );

  return (
    <div className="wrap py-14 md:py-20 grid gap-16 lg:grid-cols-[1fr_1.4fr]">
      <div>
        <p className="eyebrow">Customer care</p>
        <h1 className="text-[length:var(--text-h1)] mt-3">Contact us</h1>
        <p className="mt-4 text-muted max-w-sm">Questions about an order, a fit or a return? Write to us and we will reply by email.</p>
        <ul className="mt-10 space-y-3 text-small">
          {settings.supportEmail && <li><span className="eyebrow block">Email</span><a className="link-u" href={`mailto:${settings.supportEmail}`}>{settings.supportEmail}</a></li>}
          {settings.supportPhone && <li><span className="eyebrow block">Phone</span><a className="link-u" href={`tel:${settings.supportPhone.replace(/\s/g, '')}`}>{settings.supportPhone}</a></li>}
          <li><span className="eyebrow block">Looking for an order?</span><Link className="link-u" to="/track-order">Track your order</Link></li>
          <li><span className="eyebrow block">Quick answers</span><Link className="link-u" to="/faq">Read the FAQ</Link></li>
        </ul>
      </div>
      <form onSubmit={submit} className="space-y-5" aria-label="Contact form">
        <div className="grid gap-5 sm:grid-cols-2">
          <div><label htmlFor={`${uid}n`} className="eyebrow block mb-2">Name</label><input id={`${uid}n`} name="name" className="field" required minLength={2} maxLength={80} autoComplete="name" defaultValue={fullName} /></div>
          <div><label htmlFor={`${uid}e`} className="eyebrow block mb-2">Email</label><input id={`${uid}e`} name="email" type="email" className="field" required autoComplete="email" defaultValue={user?.email ?? ''} /></div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div><label htmlFor={`${uid}c`} className="eyebrow block mb-2">Topic</label><select id={`${uid}c`} name="category" className="field" defaultValue="other">{CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          <div><label htmlFor={`${uid}o`} className="eyebrow block mb-2">Order number <span className="normal-case tracking-normal">(optional)</span></label><input id={`${uid}o`} name="orderNumber" className="field uppercase" placeholder="NS-2610-A1B2C3" maxLength={20} /></div>
        </div>
        <div><label htmlFor={`${uid}s`} className="eyebrow block mb-2">Subject</label><input id={`${uid}s`} name="subject" className="field" required minLength={3} maxLength={120} /></div>
        <div><label htmlFor={`${uid}m`} className="eyebrow block mb-2">Message</label><textarea id={`${uid}m`} name="message" className="field !h-44 py-3" required minLength={10} maxLength={3000} /></div>
        {/* Honeypot: hidden from people and assistive tech; bots fill it and the server discards the message. */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
        {state.status === 'error' && <p role="alert" className="p-4 border border-oxblood text-oxblood text-small">{state.message}</p>}
        <button className="btn btn-solid" disabled={state.status === 'loading'}>{state.status === 'loading' ? 'Sending…' : 'Send message'}</button>
      </form>
    </div>
  );
}
