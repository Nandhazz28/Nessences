import { useEffect } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// While active: focus moves into the container, Tab and Shift+Tab wrap inside it, and focus returns to the opener when it closes.
export function useFocusTrap(ref, active) {
  useEffect(() => {
    const el = ref.current; if (!active || !el) return undefined;
    const opener = document.activeElement; const items = () => [...el.querySelectorAll(FOCUSABLE)];
    (items()[0] ?? el).focus();
    const key = (e) => {
      if (e.key !== 'Tab') return; const f = items(); if (!f.length) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1]; const inside = el.contains(document.activeElement);
      if (!inside) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); opener?.focus?.(); };
  }, [ref, active]);
}
