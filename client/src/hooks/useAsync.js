import { useEffect, useState } from "react";

export function useAsync(fn, deps) {
  const [state, setState] = useState({
    data: null,
    error: null,
    loading: true,
  });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    fn(ctrl.signal).then(
      (data) => setState({ data, error: null, loading: false }),
      (error) => {
        if (error.name !== "AbortError")
          setState({ data: null, error, loading: false });
      },
    );
    return () => ctrl.abort();
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}
