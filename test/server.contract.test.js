/**
 * In-process HTTP contract & edge-case suite for the repository-root `server.js`.
 *
 * WHY IN-PROCESS
 * --------------
 * `server.js` is immutable (constraint C-001) and declares NO `module.exports`,
 * so the only way to drive coverage of it from Jest is to `require()` it. That
 * require has an intentional side effect: `server.js` synchronously calls
 * `server.listen(3000, '127.0.0.1', cb)`, which (a) starts a live server this
 * suite then exercises over real HTTP via supertest, and (b) fires the listen
 * callback that logs the readiness line. Consequently BOTH the request handler
 * (server.js lines 6-10) and the listen callback (lines 12-14) are instrumented,
 * yielding 100% statement/function/line coverage of `server.js`.
 *
 * There is NO exported handle to close the subject server; cleanup of the
 * still-open listener relies on `forceExit: true` in the root `jest.config.js`.
 * This file therefore never calls `.close()` on the subject server and never
 * imports or mutates the server object — it only `require`s the module for its
 * side effect and then talks to it over the loopback socket.
 *
 * ORDERING
 * --------
 * `test/testSequencer.js` guarantees `server.lifecycle.test.js` runs BEFORE this
 * suite, so port 3000 is free when the require below binds it. This suite then
 * holds the port for its entire duration.
 *
 * Conventions mirror the repository (AAP 0.10): CommonJS `require`, two-space
 * indentation, single-quoted strings, `const`, and arrow-function callbacks.
 *
 * @see server.js                  subject under test (immutable, no exports)
 * @see test/helpers/constants.js  shared behavioral-contract constants
 * @see docs/testing-strategy.md   risk-ranked scenarios this suite implements
 */

const request = require('supertest');
const http = require('node:http');
const {
  HOST,
  PORT,
  EXPECTED_BODY,
  EXPECTED_BYTES,
  CONTENT_TYPE,
  READY_LOG,
} = require('./helpers/constants');
// The bare node:http client from the shared black-box harness (agent: false, a
// fresh connection per request). supertest/superagent cannot express
// non-standard HTTP method tokens (extension methods such as M-SEARCH, or
// unsupported tokens such as BREW), so the arbitrary-method coverage added below
// issues those requests through this helper — putting the same raw method token
// on the wire that a client like curl would send.
const { httpRequest } = require('./helpers/server-harness');

// Spy on console.log BEFORE requiring server.js so its startup log is captured.
// jest.spyOn calls through to the real console.log by default (output still
// appears) while recording every call, serving both the startup-log assertion
// and the deterministic readiness wait in beforeAll.
const logSpy = jest.spyOn(console, 'log');

// Requiring the module immediately starts the server listening on 127.0.0.1:3000.
// There is no export to capture (constraint C-001) — the require is for its side
// effect only.
require('../server.js');

// supertest issues requests against the already-listening server using a string
// base URL; server.js exports nothing, so it must NOT be passed to request(...).
const baseURL = `http://${HOST}:${PORT}`;

describe('server.js HTTP contract (in-process)', () => {
  // Deterministic readiness: server.listen is asynchronous, so the first request
  // could otherwise race ahead of the bind and hit ECONNREFUSED. Poll the
  // captured log for the readiness line instead of sleeping a fixed interval.
  beforeAll(async () => {
    await new Promise((resolve) => {
      const check = () => {
        const ready = logSpy.mock.calls.some((args) => args[0] === READY_LOG);
        if (ready) {
          resolve();
        } else {
          setImmediate(check);
        }
      };
      check();
    });
  });

  afterAll(() => {
    logSpy.mockRestore();
  });

  // P0 — Happy-path contract: GET / returns the full behavioral contract.
  test('GET / returns 200, text/plain, body Hello, World!\\n (14 bytes)', async () => {
    const res = await request(baseURL).get('/');
    expect(res.status).toBe(200);
    // Exactly 'text/plain' — server.js sets the header with an explicit value and
    // Node does NOT append a charset.
    expect(res.headers['content-type']).toBe(CONTENT_TYPE);
    expect(res.text).toBe(EXPECTED_BODY);
    expect(Buffer.byteLength(res.text)).toBe(EXPECTED_BYTES);
  });

  // P0 — Header coverage: standard auto-generated headers (AAP 0.1.1). Beyond the
  // explicit Content-Type, Node auto-generates a Date header and a Connection token
  // on every response. Assert their presence and FORMAT non-brittly — never pin the
  // volatile Date value or a single Connection token.
  test('GET / includes well-formed standard auto-generated headers (Date, Connection)', async () => {
    const res = await request(baseURL).get('/');
    // Date: present and parseable to a valid calendar date; the value itself is
    // volatile (changes every second), so only its parseability is asserted.
    expect(res.headers.date).toBeDefined();
    expect(Number.isNaN(Date.parse(res.headers.date))).toBe(false);
    // Connection: present with a valid HTTP connection token. supertest's default
    // agent negotiates 'close'; assert the connection semantics rather than a brittle
    // fixed value so the test survives client/runtime keep-alive differences.
    expect(res.headers.connection).toBeDefined();
    expect(['close', 'keep-alive']).toContain(res.headers.connection);
  });

  // P2 — Startup-log assertion: the listen callback logs the readiness line
  // exactly once. Deterministic thanks to the beforeAll readiness wait.
  test('emits the readiness log line exactly once on startup', () => {
    const readyCalls = logSpy.mock.calls.filter((args) => args[0] === READY_LOG);
    expect(readyCalls).toHaveLength(1);
  });

  // P0 — Edge case: determinism across HTTP verbs that carry a response body.
  // The handler is branchless and never reads req, so every verb is identical.
  const verbsWithResponseBody = ['post', 'put', 'delete', 'patch', 'options'];
  describe.each(verbsWithResponseBody)('%s / matches the GET contract', (method) => {
    test('returns identical 200 / text-plain / body', async () => {
      const res = await request(baseURL)[method]('/');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe(CONTENT_TYPE);
      expect(res.text).toBe(EXPECTED_BODY);
      expect(Buffer.byteLength(res.text)).toBe(EXPECTED_BYTES);
    });
  });

  // HEAD is handled separately: an HTTP HEAD response carries headers but NO
  // body, so the response body is intentionally not asserted.
  test('HEAD / returns 200 and text/plain with no body', async () => {
    const res = await request(baseURL).head('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe(CONTENT_TYPE);
  });

  // P0/P1 — Edge case: ARBITRARY / EXTENSION HTTP METHODS that reach the handler.
  // ---------------------------------------------------------------------------
  // The AAP contract is that 'every request, regardless of method or path, yields
  // exactly 200' and that edge cases 'verify deterministic behavior across
  // arbitrary HTTP methods' (AAP 0.1.1). server.js is branchless and never reads
  // req.method (server.js lines 6-10), so EVERY method token that Node's HTTP
  // parser recognizes and routes to the handler must produce the identical
  // contract. These extension/WebDAV/UPnP/CalDAV methods are recognized by Node's
  // llhttp parser (verified on this runtime) and therefore exercise the handler
  // exactly like the standard verbs above, extending the method-determinism
  // guarantee well beyond GET/POST/PUT/DELETE/PATCH/OPTIONS. supertest cannot
  // express these non-standard tokens, so they are issued over the harness's bare
  // node:http client (agent: false) — the same raw token a client like curl sends.
  const extensionMethods = [
    'M-SEARCH', 'PROPFIND', 'MKCOL', 'REPORT', 'PURGE', 'NOTIFY', 'SEARCH', 'MKCALENDAR',
  ];
  describe.each(extensionMethods)('%s / matches the GET contract', (method) => {
    test('returns identical 200 / text-plain / body', async () => {
      const res = await httpRequest(method, '/');
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe(CONTENT_TYPE);
      expect(res.body).toBe(EXPECTED_BODY);
      expect(Buffer.byteLength(res.body)).toBe(EXPECTED_BYTES);
    });
  });

  // P1 — Edge case / documented boundary: UNSUPPORTED CUSTOM METHOD TOKENS.
  // ---------------------------------------------------------------------------
  // Tokens that are NOT in Node's HTTP-parser (llhttp) recognized-method set —
  // e.g. BREW (RFC 2324), FOO, CUSTOM — are rejected by the parser with a
  // protocol-level 400 Bad Request BEFORE server.js's request handler ever runs.
  // This is deterministic Node RUNTIME behavior in the C/llhttp layer beneath the
  // JavaScript handler, NOT a defect in server.js: the handler cannot observe or
  // override a rejection that occurs before it is invoked, so no Content-Type or
  // body is set. Forcing such tokens to return 200 would require changing
  // server.js, which is immutable under constraint C-001 (AAP 0.8.2). These tests
  // therefore PIN the real, deterministic boundary of the 'arbitrary method'
  // contract: it holds for every token that reaches the handler (above) and yields
  // a parser-level 400 for tokens that do not. They mirror the QA reproduction
  // (curl -X BREW http://127.0.0.1:3000/custom) exactly.
  const unsupportedMethods = ['BREW', 'FOO', 'CUSTOM'];
  describe.each(unsupportedMethods)('%s is rejected by the Node HTTP parser', (method) => {
    test('returns a protocol-level 400 with no body before the handler runs', async () => {
      const res = await httpRequest(method, '/custom');
      expect(res.statusCode).toBe(400);
      // The handler never executed, so it set no Content-Type and no body.
      expect(res.headers['content-type']).toBeUndefined();
      expect(res.body).toBe('');
    });
  });

  // P0 — Edge case: arbitrary / encoded / deep paths and query strings all map to
  // the same response because the handler ignores the request URL.
  const paths = ['/deep/nested/path', '/%20', '/?q=1&x=2'];
  describe.each(paths)('GET %s matches the contract', (requestPath) => {
    test('returns identical 200 / text-plain / body', async () => {
      const res = await request(baseURL).get(requestPath);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe(CONTENT_TYPE);
      expect(res.text).toBe(EXPECTED_BODY);
      expect(Buffer.byteLength(res.text)).toBe(EXPECTED_BYTES);
    });
  });

  // P0 — Edge case: request bodies are ignored. The handler never reads req, so
  // empty, large, and JSON bodies must all yield the identical response.
  test('ignores an empty request body', async () => {
    const res = await request(baseURL).post('/').send('');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe(CONTENT_TYPE);
    expect(res.text).toBe(EXPECTED_BODY);
    expect(Buffer.byteLength(res.text)).toBe(EXPECTED_BYTES);
  });

  test('ignores a large (~1MB) request body', async () => {
    const largeBody = 'x'.repeat(1024 * 1024);
    // Connection: close forces a fresh connection so the never-drained request
    // body cannot affect socket reuse (docs/testing-strategy.md 3.3).
    const res = await request(baseURL)
      .post('/')
      .set('Content-Type', 'text/plain')
      .set('Connection', 'close')
      .send(largeBody);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe(CONTENT_TYPE);
    expect(res.text).toBe(EXPECTED_BODY);
    expect(Buffer.byteLength(res.text)).toBe(EXPECTED_BYTES);
  });

  test('ignores a JSON request body', async () => {
    // supertest sets Content-Type: application/json; the server ignores it.
    const res = await request(baseURL).post('/').send({ ignored: true });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe(CONTENT_TYPE);
    expect(res.text).toBe(EXPECTED_BODY);
    expect(Buffer.byteLength(res.text)).toBe(EXPECTED_BYTES);
  });

  // P0 — Edge case: statelessness across sequential and concurrent requests.
  test('returns identical responses across N sequential requests', async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await request(baseURL).get('/');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe(CONTENT_TYPE);
      expect(res.text).toBe(EXPECTED_BODY);
      expect(Buffer.byteLength(res.text)).toBe(EXPECTED_BYTES);
    }
  });

  test('returns identical responses across concurrent requests', async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => request(baseURL).get('/')),
    );
    responses.forEach((res) => {
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe(CONTENT_TYPE);
      expect(res.text).toBe(EXPECTED_BODY);
      expect(Buffer.byteLength(res.text)).toBe(EXPECTED_BYTES);
    });
  });

  // P1 — Error case: in-process EADDRINUSE. While this process holds port 3000
  // (server.js is listening), a second listener on the same host/port must fail.
  test('a second listener on the occupied port fails with EADDRINUSE', async () => {
    const second = http.createServer();
    const err = await new Promise((resolve, reject) => {
      second.on('error', resolve);
      second.listen(PORT, HOST, () => {
        reject(new Error('unexpected successful bind on occupied port'));
      });
    });
    expect(err.code).toBe('EADDRINUSE');
    await new Promise((resolve) => {
      second.close(resolve);
    });
  });
});
