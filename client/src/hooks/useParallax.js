import { useEffect } from "react";

export function useParallax(ref, factor = 0.08) {
  useEffect(() => {
    const el = ref.current;
    if (
      !el ||
      typeof window.matchMedia !== "function" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return undefined;
    let raf = 0;
    const tick = () => {
      raf = 0;
      el.style.transform = `translate3d(0, ${Math.min(window.scrollY, 900) * factor}px, 0)`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    tick();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      el.style.transform = "";
    };
  }, [ref, factor]);
}
