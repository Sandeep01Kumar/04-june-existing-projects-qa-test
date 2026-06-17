/**
 * Black-box process-lifecycle suite for the repository-root `server.js`.
 *
 * WHY BLACK-BOX (SPAWN)
 * ---------------------
 * `server.js` is immutable (constraint C-001) and declares NO `module.exports`,
 * so its real startup/shutdown behavior cannot be observed by importing it. This
 * suite therefore exercises it as a genuine, separately-spawned operating-system
 * process — `node server.js` (the path comes from `SERVER_PATH` inside the
 * harness) — and asserts the externally observable lifecycle facts:
 *   1. it binds `127.0.0.1:3000`, serves HTTP, and logs its readiness line once;
 *   2. `SIGTERM` terminates the process and releases port 3000 (re-bindable); and
 *   3. a second listener on the already-occupied port fails with `EADDRINUSE`
 *      (the only failure mode of an error-handler-free server, docs §3.5).
 *
 * ORDERING & PORT DISCIPLINE
 * --------------------------
 * `test/testSequencer.js` guarantees THIS suite runs BEFORE
 * `server.contract.test.js`, which `require()`s `server.js` and then holds port
 * 3000 for its entire duration. Consequently every test here MUST fully release
 * port 3000 before it finishes — each spawned child is therefore terminated via
 * `stopServer(child)` inside a `finally` block (which awaits the child's `exit`,
 * guaranteeing the OS has reclaimed the port). Leaking a child would make the
 * in-process contract suite fail to bind.
 *
 * DETERMINISM
 * -----------
 * Readiness is detected by parsing the child's stdout for the readiness log
 * (`startServer` resolves on it) and by probing the loopback port
 * (`waitForPort`) — never a fixed `setTimeout` sleep, which would be race-prone.
 *
 * Conventions mirror the repository (AAP 0.10): CommonJS `require`, two-space
 * indentation, single-quoted strings, `const`, and arrow-function callbacks.
 *
 * @see server.js                       subject under test (immutable, no exports)
 * @see test/helpers/server-harness.js  spawn / probe / HTTP utilities
 * @see test/helpers/constants.js       shared behavioral-contract constants
 * @see docs/testing-strategy.md        §3.4 (bind + readiness) and §3.5 (EADDRINUSE)
 */

const http = require('node:http');
const {
  startServer,
  stopServer,
  waitForPort,
  isPortFree,
  httpRequest,
} = require('./helpers/server-harness');
const {
  HOST,
  PORT,
  READY_LOG,
  EXPECTED_BODY,
  EXPECTED_BYTES,
  CONTENT_TYPE,
} = require('./helpers/constants');

// Spawning a Node process and waiting for the readiness log can take a couple of
// seconds; give every lifecycle test generous headroom over the harness's own
// 5000 ms start guard so a slow spawn fails inside the harness, not the runner.
jest.setTimeout(15000);

describe('server.js lifecycle (black-box spawn)', () => {
  // P1 — Startup: the spawned process binds 127.0.0.1:3000, answers a real HTTP
  // request with the full behavioral contract, and emits its readiness log line
  // exactly once. This protects the process lifecycle and the observable
  // readiness signal that any orchestration depends on (docs §3.4).
  test('spawned server binds 127.0.0.1:3000, serves HTTP, and logs readiness once', async () => {
    const child = await startServer(); // resolves after READY_LOG seen on stdout
    try {
      // The port is actually connectable (proves the bind, not just the log).
      await waitForPort(PORT, HOST, 5000);

      // End-to-end HTTP over a fresh connection returns the exact contract.
      const res = await httpRequest('GET', '/');
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe(CONTENT_TYPE);
      expect(res.body).toBe(EXPECTED_BODY);
      expect(Buffer.byteLength(res.body)).toBe(EXPECTED_BYTES);

      // Readiness log emitted exactly once: count its occurrences in the stdout
      // the harness accumulated on `child.stdoutData` from spawn time.
      const occurrences = child.stdoutData.split(READY_LOG).length - 1;
      expect(occurrences).toBe(1);
    } finally {
      // Always release port 3000 for the next test and the contract suite.
      await stopServer(child);
    }
  });

  // P1 — Shutdown: SIGTERM terminates the process and frees port 3000. Proven
  // two ways: `isPortFree` reports the port is no longer connectable, and a
  // brand-new instance can subsequently bind the same port.
  test('SIGTERM terminates the process and releases port 3000', async () => {
    const child = await startServer();
    let child2;
    try {
      await waitForPort(PORT, HOST, 5000); // confirm it was bound first
      await stopServer(child); // SIGTERM + await exit (frees the port)

      const free = await isPortFree(PORT, HOST);
      expect(free).toBe(true); // port released

      // Stronger proof the port is reusable: a fresh instance binds afterward.
      child2 = await startServer();
      await waitForPort(PORT, HOST, 5000);
    } finally {
      // `stopServer` is idempotent — re-stopping the already-exited first child
      // resolves immediately, and stopping an undefined `child2` is a no-op — so
      // both children are guaranteed terminated even if an assertion above threw.
      await stopServer(child);
      await stopServer(child2);
    }
  });

  // P1 — Error: server.js registers no `error` handler, so an already-occupied
  // port is its single failure mode. While the spawned child holds 127.0.0.1:3000,
  // a second listener targeting the same host/port must emit EADDRINUSE (docs §3.5).
  test('a second listener on the occupied port fails with EADDRINUSE', async () => {
    const child = await startServer(); // server.js now holds 127.0.0.1:3000
    const second = http.createServer();
    try {
      const err = await new Promise((resolve, reject) => {
        second.on('error', resolve);
        second.listen(PORT, HOST, () => {
          reject(new Error('unexpected successful bind on occupied port'));
        });
      });
      expect(err.code).toBe('EADDRINUSE');
    } finally {
      // Close the throwaway listener only if it ever bound (on the EADDRINUSE
      // path it never did), then terminate the spawned server so port 3000 is
      // released for the in-process contract suite that runs next.
      if (second.listening) {
        await new Promise((resolve) => second.close(resolve));
      }
      await stopServer(child);
    }
  });
});
