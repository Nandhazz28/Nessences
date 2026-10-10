export function Stars({ value, label }) {
  const full = Math.round(value);
  return <span role="img" aria-label={label ?? `${value} out of 5`} className="tracking-[0.15em]"><span aria-hidden="true">{'★'.repeat(full)}<span className="text-stone">{'★'.repeat(5 - full)}</span></span></span>;
}
