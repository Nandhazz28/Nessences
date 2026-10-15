import { useEffect, useRef, useState } from "react";

export function Reveal({ as: Tag = "div", className = "", children, ...rest }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(
    typeof IntersectionObserver === "undefined",
  );
  useEffect(() => {
    if (shown || !ref.current) return undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [shown]);
  return (
    <Tag
      ref={ref}
      className={`reveal ${shown ? "is-in" : ""} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}
