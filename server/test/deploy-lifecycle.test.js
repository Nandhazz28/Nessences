import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { SKIP, TEST_URI, SECRETS } from "./helpers/integration.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const freePort = () =>
  new Promise((res) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(extra = {}) {
  const port = await freePort();
  const db = new URL(TEST_URI ?? "mongodb://127.0.0.1:27017");
  db.pathname = `/nessence_lifecycle_${process.pid}_${port}`;
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "test",
      LOG_LEVEL: "info",
      PORT: String(port),
      HOST: "127.0.0.1",
      MONGODB_URI: db.toString(),
      JWT_ACCESS_SECRET: SECRETS.access,
      JWT_REFRESH_SECRET: SECRETS.refresh,
      ...extra,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const out = [];
  child.stdout.on("data", (d) => out.push(String(d)));
  child.stderr.on("data", (d) => out.push(String(d)));
  const exited = new Promise((res) =>
    child.on("exit", (code, signal) => res({ code, signal })),
  );
  const get = async (p) => {
    const r = await fetch(`http://127.0.0.1:${port}${p}`);
    return {
      status: r.status,
      body: await r.json().catch(() => null),
      headers: r.headers,
    };
  };
  const waitFor = async (p, status, ms = 15000) => {
    const t0 = Date.now();
    for (;;) {
      try {
        const r = await get(p);
        if (r.status === status) return r;
      } catch {
        /* not listening yet */
      }
      if (Date.now() - t0 > ms)
        throw new Error(
          `timeout waiting for ${p} = ${status}\n${out.join("")}`,
        );
      await sleep(100);
    }
  };
  return {
    child,
    port,
    out,
    exited,
    get,
    waitFor,
    kill: () => child.kill("SIGKILL"),
  };
}

test(
  "boots, becomes healthy only after MongoDB is connected, and exposes nothing sensitive",
  { skip: SKIP },
  async () => {
    const s = await launch();
    try {
      const h = await s.waitFor("/health", 200);
      assert.deepEqual(h.body, { status: "ok" });
      assert.equal(h.headers.get("cache-control"), "no-store");
      assert.deepEqual((await s.get("/ready")).body, { status: "ready" });
      assert.ok(
        h.headers.get("x-request-id"),
        "every response carries a request id",
      );
      const blob =
        JSON.stringify([h.body, (await s.get("/ready")).body]) + s.out.join("");
      assert.ok(
        !blob.includes(SECRETS.access) && !blob.includes(SECRETS.refresh),
        "secrets never appear in output",
      );
      assert.ok(!/mongodb:\/\/[^\s"]*@/.test(blob));
      const unknown = await s.get("/nope");
      assert.equal(unknown.status, 404);
    } finally {
      s.kill();
      await s.exited;
    }
  },
);

test(
  "SIGTERM: stops accepting new connections, lets an in-flight request finish, closes cleanly, exits 0",
  { skip: SKIP },
  async () => {
    const s = await launch();
    await s.waitFor("/health", 200);
    const body = JSON.stringify({
      email: "a@b.test",
      password: "x".repeat(40),
    });
    const sock = net.connect(s.port, "127.0.0.1");
    await new Promise((r) => sock.once("connect", r));
    let resp = "";
    sock.on("data", (d) => {
      resp += d;
    });
    sock.write(
      `POST /api/auth/login HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\n\r\n${body.slice(0, 10)}`,
    );
    await sleep(150);
    s.child.kill("SIGTERM");
    await sleep(300);
    await assert.rejects(
      () => fetch(`http://127.0.0.1:${s.port}/health`),
      "no new connections once shutting down",
    );
    sock.write(body.slice(10));
    await sleep(500);
    assert.match(
      resp,
      /^HTTP\/1\.1 403/,
      "the in-flight request was still answered",
    );
    assert.match(resp, /connection: close/i);
    const { code } = await s.exited;
    assert.equal(code, 0, s.out.join(""));
    assert.match(s.out.join(""), /shutdown complete/);
    sock.destroy();
  },
);

test("SIGINT shuts down the same way", { skip: SKIP }, async () => {
  const s = await launch();
  await s.waitFor("/ready", 200);
  s.child.kill("SIGINT");
  assert.equal((await s.exited).code, 0);
});

test(
  'MongoDB never reachable: reports "starting" (never healthy), then exits non-zero so the platform fails the deploy',
  { skip: SKIP },
  async () => {
    const s = await launch({
      MONGODB_URI: "mongodb://127.0.0.1:1/nessence",
      DB_STARTUP_TIMEOUT_SECONDS: "2",
    });
    const first = await s.waitFor("/health", 503, 5000);
    assert.deepEqual(first.body, { status: "starting" });
    const r = await s.get("/ready");
    assert.equal(r.status, 503);
    assert.equal(r.body.reason, "database");
    const { code } = await s.exited;
    assert.equal(code, 1);
    assert.match(s.out.join(""), /MongoDB is unreachable/);
    assert.ok(
      !/mongodb:\/\/[^\s"]*@/.test(s.out.join("")),
      "connection strings with credentials are never logged",
    );
  },
);

test("connectDbWithRetry: retries a failed first connection with backoff, then succeeds; gives up at the deadline; stops when asked", async () => {
  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = "mongodb://127.0.0.1:1/x";
  process.env.JWT_ACCESS_SECRET = SECRETS.access;
  process.env.JWT_REFRESH_SECRET = SECRETS.refresh;
  process.env.LOG_LEVEL = "silent";
  const { connectDbWithRetry } = await import("../src/config/db.js");
  const { mock } = await import("node:test");
  let calls = 0;
  const m = mock.method(mongoose, "connect", async () => {
    calls += 1;
    if (calls < 3)
      throw new Error("connect ECONNREFUSED mongodb://user:secret@host/db");
  });
  await connectDbWithRetry({ initialDelayMs: 5, maxDelayMs: 10 });
  assert.equal(calls, 3);
  m.mock.restore();
  calls = 0;
  const m2 = mock.method(mongoose, "connect", async () => {
    calls += 1;
    throw new Error("down");
  });
  await assert.rejects(
    () =>
      connectDbWithRetry({ timeoutMs: 50, initialDelayMs: 20, maxDelayMs: 20 }),
    /down/,
  );
  assert.ok(calls >= 2 && calls <= 4, `calls=${calls}`);
  calls = 0;
  await assert.rejects(
    () => connectDbWithRetry({ initialDelayMs: 5, isStopping: () => true }),
    /down/,
  );
  assert.equal(calls, 1);
  m2.mock.restore();
});
