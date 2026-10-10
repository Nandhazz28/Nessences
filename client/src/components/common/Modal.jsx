import { useEffect, useRef } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';

// Accessible dialog: focus is trapped inside (useFocusTrap), Escape and the backdrop close it.
export function Modal({ title, onClose, children, wide }) {
  const ref = useRef(null);
  useFocusTrap(ref, true);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', esc); const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-ink/40 grid place-items-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className={`bg-paper border border-stone w-full ${wide ? 'max-w-4xl' : 'max-w-xl'} max-h-[90vh] overflow-y-auto p-6 md:p-8 outline-none`}>
        <div className="flex justify-between items-start gap-6 mb-6"><h2 className="text-[length:var(--text-h3)]">{title}</h2><button className="eyebrow !text-ink py-1" onClick={onClose} aria-label="Close dialog">Close</button></div>
        {children}
      </div>
    </div>
  );
}
