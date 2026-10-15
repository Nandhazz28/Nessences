import { useEffect } from "react";

export function useJsonLd(id, data) {
  const json = data ? JSON.stringify(data).replace(/</g, "\\u003c") : null;
  useEffect(() => {
    if (!json) return undefined;
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.id = id;
    s.text = json;
    document.head.appendChild(s);
    return () => s.remove();
  }, [id, json]);
}
