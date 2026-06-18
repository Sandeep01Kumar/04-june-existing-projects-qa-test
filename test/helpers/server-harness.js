/**
 * Reusable black-box process harness for the `server.js` test suites.
 *
 * This module provides framework-agnostic utilities — built on Node.js core
 * modules only — for exercising the repository-root `server.js` as a real,
 * separately-spawned operating-system process. It is consumed primarily by
 * `test/server.lifecycle.test.js` (via `require('./helpers/server-harness')`)
 * to verify the server's startup/shutdown lifecycle and port behavior without
 * importing the server's source, which is immutable under constraint C-001 and
 * exposes no `module.exports`.
 *
 * The patterns implemented here are re-expressed, framework-agnostically, from
 * `docs/testing-strategy.md`:
 *   - §3.2  Spawn `node server.js` and detect readiness by parsing stdout for
 *           the startup log line (never a fixed `setTimeout` sleep).
 *   - §3.3  Issue HTTP requests over a fresh connection (`agent: false`) so each
 *           request is isolated and deterministic — the server never drains an
 *           unread request body, so keep-alive connection reuse is avoided
 *           defensively.
 *   - §3.4 / §3.5  Probe the loopback port over raw TCP to confirm the process
 *           has bound (startup) or released (shutdown / `EADDRINUSE`) port 3000.
 *
 * Design constraints honored:
 *   - Built-in modules ONLY (`node:child_process`, `node:http`, `node:net`); no
 *     third-party dependency is imported here, so the harness stays independent
 *     of the test runner (Jest) and the HTTP client (supertest).
 *   - All shared, server-derived values (host, port, readiness log, server path)
 *     come from the sibling `./constants` module — the single source of truth.
 *   - Readiness is event-driven (stdout parse); timeouts are failure guards only.
 *   - Every socket opened for probing is destroyed, and spawned children are
 *     terminated by `stopServer`, so no handles leak between tests.
 *
 * @module test/helpers/server-harness
 */

const { spawn } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');

const { HOST, PORT, READY_LOG, SERVER_PATH } = require('./constants');

/**
 * Maximum time (in milliseconds) to wait for the spawned server to emit its
 * readiness log before `startServer` rejects. This is purely a failure guard —
 * readiness is detected by parsing streamed stdout, not by waiting a fixed
 * interval.
 *
 * @constant {number}
 */
const START_TIMEOUT_MS = 5000;

/**
 * Spawn `server.js` as a child `node` process and resolve once it is ready.
 *
 * Readiness is determined by streaming the child's stdout and waiting for the
 * `READY_LOG` line emitted from the server's `listen` callback — never a fixed
 * sleep, which would be race-prone. The full stdout text is accumulated on the
 * returned child as `child.stdoutData` so callers can assert on it (for example,
 * that the readiness line was emitted exactly once via
 * `child.stdoutData.split(READY_LOG).length - 1`). The accumulator is
 * initialized BEFORE the `'data'` listener is attached so no early chunk is
 * missed.
 *
 * The promise rejects if the child emits an `'error'` event (e.g., the `node`
 * binary could not be spawned) or if `START_TIMEOUT_MS` elapses before the
 * readiness line appears; on timeout the child is killed to avoid leaking a
 * process. A `settled` guard ensures the promise neither resolves nor rejects
 * more than once and that the timeout timer is always cleared.
 *
 * @returns {Promise<import('node:child_process').ChildProcess>} Resolves with
 *   the spawned child process, augmented with a `stdoutData` string property.
 */
const startServer = () => new Promise((resolve, reject) => {
  const child = spawn('node', [SERVER_PATH], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdoutData = '';
  let settled = false;

  const timer = setTimeout(() => {
    if (!settled) {
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`server did not become ready within ${START_TIMEOUT_MS} ms`));
    }
  }, START_TIMEOUT_MS);

  child.stdout.on('data', (chunk) => {
    child.stdoutData += chunk.toString();
    if (!settled && child.stdoutData.includes(READY_LOG)) {
      settled = true;
      clearTimeout(timer);
      resolve(child);
    }
  });

  child.on('error', (err) => {
    if (!settled) {
      settled = true;
      clearTimeout(timer);
      reject(err);
    }
  });
});

/**
 * Terminate a spawned server child process and resolve once it has exited.
 *
 * Sends `SIGTERM` and resolves on the child's `'exit'` event, which guarantees
 * the OS has reclaimed the process and released port 3000 — important because
 * the suites call this in `finally` blocks to free the port between tests and
 * before the in-process contract suite binds it. The `'exit'` listener is
 * registered with `once` BEFORE `kill` to avoid a race where the process exits
 * before the listener is attached.
 *
 * If the child is falsy or has already exited (`exitCode` or `signalCode` is
 * set), the promise resolves immediately — otherwise it would hang forever
 * awaiting an `'exit'` event that will never fire again.
 *
 * @param {import('node:child_process').ChildProcess} child The process to stop.
 * @returns {Promise<void>} Resolves when the child has exited (or was already gone).
 */
const stopServer = (child) => new Promise((resolve) => {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    resolve();
    return;
  }
  child.once('exit', () => resolve());
  child.kill('SIGTERM');
});

/**
 * Wait until a TCP connection to `host:port` succeeds, or reject after a deadline.
 *
 * Repeatedly attempts a raw TCP connection (retrying every 100 ms) until one
 * succeeds — proving the server has bound the port and is accepting connections
 * — or until `timeoutMs` elapses, at which point the promise rejects. Each probe
 * socket is destroyed immediately after it connects or errors so no socket leaks.
 *
 * @param {number} port The TCP port to probe (e.g., 3000).
 * @param {string} host The host/interface to probe (e.g., '127.0.0.1').
 * @param {number} timeoutMs Maximum time, in milliseconds, to keep retrying
 *   before rejecting.
 * @returns {Promise<void>} Resolves once the port is connectable.
 */
const waitForPort = (port, host, timeoutMs) => new Promise((resolve, reject) => {
  const deadline = Date.now() + timeoutMs;
  const attempt = () => {
    const socket = net.connect(port, host);
    socket.once('connect', () => {
      socket.destroy();
      resolve();
    });
    socket.once('error', () => {
      socket.destroy();
      if (Date.now() >= deadline) {
        reject(new Error(`port ${host}:${port} not connectable within ${timeoutMs} ms`));
      } else {
        setTimeout(attempt, 100);
      }
    });
  };
  attempt();
});

/**
 * Probe whether a TCP port is free (nothing listening) and resolve a boolean.
 *
 * Makes a single connection attempt: if it connects, something is listening, so
 * the port is NOT free (`false`); if it errors (typically `ECONNREFUSED`),
 * nothing is listening, so the port IS free (`true`). This never rejects — it
 * always resolves a boolean — so it can be asserted directly (the lifecycle
 * suite checks `expect(free).toBe(true)` after SIGTERM to prove port release).
 * The probe socket is destroyed in both branches.
 *
 * @param {number} port The TCP port to probe.
 * @param {string} host The host/interface to probe.
 * @returns {Promise<boolean>} `true` if the port is free, `false` if occupied.
 */
const isPortFree = (port, host) => new Promise((resolve) => {
  const socket = net.connect(port, host);
  socket.once('connect', () => {
    socket.destroy();
    resolve(false);
  });
  socket.once('error', () => {
    socket.destroy();
    resolve(true);
  });
});

/**
 * Issue an HTTP request to the running server over a fresh connection.
 *
 * Uses `agent: false` so every request opens its own connection — this keeps
 * test cases isolated and deterministic and sidesteps keep-alive body-drain
 * coupling (the server never reads the request body, so reusing a keep-alive
 * socket would depend on runtime-specific draining behavior; see docs §3.3).
 * The response body is collected by concatenating its `'data'` chunks and the
 * promise resolves with the status code, headers (Node lowercases header keys,
 * so `headers['content-type']` works), and the decoded body string.
 *
 * A request body is written ONLY when one is provided (neither `undefined` nor
 * `null`); the request is always finalized with `req.end()`. The request
 * `'error'` event rejects the promise.
 *
 * @param {string} method The HTTP method (e.g., 'GET', 'POST').
 * @param {string} path The request path (e.g., '/', '/a/b?q=1').
 * @param {string|Buffer} [body] Optional request body; omitted when undefined/null.
 * @returns {Promise<{statusCode: number, headers: Object, body: string}>} Resolves
 *   with the response status code, headers, and decoded body.
 */
const httpRequest = (method, path, body) => new Promise((resolve, reject) => {
  const req = http.request({ host: HOST, port: PORT, method, path, agent: false }, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
    });
  });
  req.on('error', reject);
  if (body !== undefined && body !== null) {
    req.write(body);
  }
  req.end();
});

module.exports = {
  startServer,
  stopServer,
  waitForPort,
  isPortFree,
  httpRequest,
};
