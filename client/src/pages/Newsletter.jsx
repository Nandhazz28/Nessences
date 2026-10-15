import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSeo } from "../hooks/useSeo.js";
import { newsletterApi } from "../services/engage.js";

const Shell = ({ title, children }) => (
  <div className="wrap py-24 max-w-xl text-center">
    <p className="eyebrow">Newsletter</p>
    <h1 className="text-[length:var(--text-h2)] mt-3">{title}</h1>
    <div className="mt-4 text-muted">{children}</div>
  </div>
);

export function NewsletterConfirm() {
  useSeo({ title: "Confirm subscription", noindex: true });
  const token = useSearchParams()[0].get("token");
  const started = useRef(false);
  const [st, setSt] = useState(token ? "working" : "bad");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!token || started.current) return;
    started.current = true; // the token is single-use: never send it twice (StrictMode re-runs effects in dev)
    newsletterApi.confirm(token).then(
      () => setSt("ok"),
      (e) => {
        setMsg(e.message);
        setSt("bad");
      },
    );
  }, [token]);
  return st === "working" ? (
    <Shell title="Confirming…">
      <p role="status">One moment.</p>
    </Shell>
  ) : st === "ok" ? (
    <Shell title="You’re subscribed.">
      <p>
        Thanks for confirming. We’ll be in touch when something new arrives.
      </p>
      <Link to="/new-arrivals" className="btn btn-solid mt-8">
        Shop new arrivals
      </Link>
    </Shell>
  ) : (
    <Shell title="Link not valid.">
      <p role="alert">
        {msg || "This confirmation link is missing or has already been used."}
      </p>
      <Link to="/" className="btn btn-line mt-8">
        Back to home
      </Link>
    </Shell>
  );
}

export function NewsletterUnsubscribe() {
  useSeo({ title: "Unsubscribe", noindex: true });
  const token = useSearchParams()[0].get("token");
  const [st, setSt] = useState(token ? "ready" : "bad");
  const [msg, setMsg] = useState("");
  const go = async () => {
    setSt("working");
    try {
      await newsletterApi.unsubscribe(token);
      setSt("ok");
    } catch (e) {
      setMsg(e.message);
      setSt("bad");
    }
  };
  return st === "ok" ? (
    <Shell title="You’ve been unsubscribed.">
      <p>
        You won’t receive any more marketing emails. Order updates are
        unaffected.
      </p>
      <Link to="/" className="btn btn-line mt-8">
        Back to home
      </Link>
    </Shell>
  ) : st === "bad" ? (
    <Shell title="Link not valid.">
      <p role="alert">
        {msg || "This unsubscribe link is missing or not valid."}
      </p>
    </Shell>
  ) : (
    <Shell title="Unsubscribe from the newsletter?">
      <p>You’ll stop receiving new-arrival and restock emails.</p>
      <button
        className="btn btn-solid mt-8"
        disabled={st === "working"}
        onClick={go}
      >
        {st === "working" ? "Working…" : "Unsubscribe"}
      </button>
    </Shell>
  );
}
