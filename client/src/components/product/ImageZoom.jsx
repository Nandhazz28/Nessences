import { useState } from 'react';

// Click (or Enter/Space) toggles a 2x zoom; the zoomed image follows the pointer. Works as a plain image when JS pointer events are unavailable.
export function ImageZoom({ image }) {
  const [zoom, setZoom] = useState(false); const [pos, setPos] = useState('50% 50%');
  const move = (e) => { const r = e.currentTarget.getBoundingClientRect(); setPos(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`); };
  if (!image) return <div className="aspect-[4/5] bg-sand" />;
  return (
    <button type="button" onClick={() => setZoom((z) => !z)} onMouseMove={zoom ? move : undefined} onBlur={() => setZoom(false)} aria-pressed={zoom}
      aria-label={zoom ? 'Zoom out' : 'Zoom in on image'} className={`block w-full aspect-[4/5] bg-sand overflow-hidden ${zoom ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}>
      <img key={image.id} src={image.url} alt={image.alt} fetchpriority="high" className="w-full h-full object-cover transition-transform duration-[var(--duration-base)]" style={{ transform: zoom ? 'scale(2)' : 'none', transformOrigin: pos }} />
    </button>
  );
}
