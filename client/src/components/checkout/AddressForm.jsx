import { useState } from 'react';
import { Field, fieldErrors } from '../auth/AuthShell.jsx';
import { addressApi } from '../../services/checkout.js';

export function AddressForm({ onSaved, onCancel, defaultName = '', initial }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const d = Object.fromEntries(new FormData(e.currentTarget)); if (!d.line2 && !initial) delete d.line2;
    const body = { ...d, isDefault: d.isDefault === 'on' };
    try { onSaved(await (initial ? addressApi.update(initial.id, body) : addressApi.create(body))); }
    catch (x) { setErr(x); } finally { setBusy(false); }
  };
  const fe = fieldErrors(err);
  return (
    <form onSubmit={submit} noValidate className="border border-stone p-5 mt-4">
      {err && !err.details?.length && <p role="alert" className="mb-4 text-small text-oxblood">{err.message}</p>}
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="Full name" name="fullName" defaultValue={initial?.fullName ?? defaultName} autoComplete="name" required error={fe.fullName} />
        <Field label="Phone" name="phone" defaultValue={initial?.phone} type="tel" autoComplete="tel" required error={fe.phone} />
      </div>
      <Field label="Address line 1" name="line1" defaultValue={initial?.line1} autoComplete="address-line1" required error={fe.line1} />
      <Field label="Address line 2 (optional)" name="line2" defaultValue={initial?.line2} autoComplete="address-line2" error={fe.line2} />
      <div className="grid sm:grid-cols-3 gap-x-4">
        <Field label="City" name="city" defaultValue={initial?.city} autoComplete="address-level2" required error={fe.city} />
        <Field label="State" name="state" defaultValue={initial?.state} autoComplete="address-level1" required error={fe.state} />
        <Field label="PIN code" name="pincode" defaultValue={initial?.pincode} inputMode="numeric" maxLength={6} autoComplete="postal-code" required error={fe.pincode} />
      </div>
      <fieldset className="mb-5"><legend className="eyebrow !text-ink font-semibold mb-2">Label</legend>
        {['Home', 'Work', 'Other'].map((l, i) => <label key={l} className="mr-5 text-small"><input type="radio" name="label" value={l} defaultChecked={(initial?.label ?? 'Home') === l} className="mr-1.5" />{l}</label>)}
      </fieldset>
      <label className="block mb-5 text-small"><input type="checkbox" name="isDefault" defaultChecked={initial?.isDefault} className="mr-2" />Make this my default address</label>
      <div className="flex gap-3"><button className="btn btn-solid" disabled={busy}>{busy ? 'Saving…' : initial ? 'Update address' : 'Save address'}</button>{onCancel && <button type="button" className="btn btn-line" onClick={onCancel}>Cancel</button>}</div>
    </form>
  );
}
