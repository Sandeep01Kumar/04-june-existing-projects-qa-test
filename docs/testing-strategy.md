# Risk-Prioritized Testing Strategy

> **Project:** `hao-backprop-test` (npm package `hello_world`, v`1.0.0`)
> **Subject under test:** `server.js` — a single built-in `http` server bound to `127.0.0.1:3000` whose branchless handler always returns the 14-byte body `Hello, World!\n`.
> **Current testing posture:** **0% automated coverage** — no test runner, no test files, and the `package.json` `test` script (`package.json:L7`) is the npm-default placeholder `echo "Error: no test specified" && exit 1`.
> **Document type:** Recommendations deliverable. This strategy is **analysis-only and additive**; it creates **no** test files and edits **no** source.

This document fulfills the user-specified rule **"Add Testing Rule IW"** — *"Analyze the codebase and create a testing strategy. Generate: Unit test recommendations, Integration test recommendations, API test scenarios, Edge case validations, Coverage improvement opportunities. Prioritize tests based on business impact and risk."* Every recommendation below is **ranked by business impact × failure likelihood** (P0 highest → P2 lowest), **never enumerated arbitrarily**, and each is **annotated with its constraint interaction**.

It is a companion to [`./dead-code-analysis.md`](./dead-code-analysis.md), which covers the dead/unused code analysis for the same project. The two reports share a governing constraint and cross-reference one another (see Section 6).

> **Immutability note (constraint C-001).** `README.md` carries the governance directive `test project for backprop integration. Do not touch!`. The four baseline files (`server.js`, `package.json`, `package-lock.json`, `README.md`) must remain byte-identical. This strategy therefore **recommends** tests without authoring them and without editing any source file; every recommendation that *would* require a source change (or a new file, or a dependency) is explicitly flagged with its constraint interaction. Authoring this document changes none of the four baseline files.

---

## 1. Overview

The `hao-backprop-test` repository is a deliberately minimal, zero-dependency Node.js HTTP server fixture. Its sole runtime module, `server.js`, binds `127.0.0.1:3000` and responds to **every** request — regardless of method, path, headers, or body — with HTTP `200`, `Content-Type: text/plain`, and the 14-byte body `Hello, World!\n`. The request handler is **branchless** (no `if`/`else`/`switch`/ternary), so its output is fully deterministic. The module declares **no `module.exports`**, so nothing inside it can be imported in isolation.

| Aspect | Current state | Implication for testing |
|--------|---------------|-------------------------|
| Automated coverage | **0%** — no runner, no test files | Everything below is greenfield; start from the highest-value checks |
| `test` script (`package.json:L7`) | npm-default placeholder, exits `1` | A real script is *recommended* but **not edited** here (see Section 5) |
| Dependencies | **Zero** runtime and dev (`package-lock.json` has only the root `""` entry) | Tests must stay dependency-free to honor C-005 / C-006 |
| Module surface | `server.js` has **no `module.exports`** | The handler cannot be unit-tested in isolation without a source refactor (blocked by C-001) |
| Behavioral contract | `200`, `text/plain`, 14-byte `Hello, World!\n`; binds `127.0.0.1:3000` | This is exactly what tests should assert — and must never alter |

**Guiding principle.** Because testing effort is finite, recommendations are ordered so that the **highest business-impact, highest-likelihood** failures are covered first. The result is a small, fast, dependency-free suite that protects the fixture's externally observable contract before spending effort on low-marginal-value checks.

---

## 2. Risk Model

### 2.1 Risk = business impact × failure likelihood

Each recommendation is scored on two axes and ranked by their product:

- **Business impact** — what breaks for the consumer if this behavior regresses. For this fixture the single most important consumer is the **external backprop integration**, which depends on the exact HTTP response contract. A regression in that contract has the highest impact; a regression in an internal nicety has the lowest.
- **Failure likelihood** — how plausible a regression is, given the code. Because `server.js` is immutable under C-001, *runtime* likelihood is currently near-zero; the model therefore treats likelihood as the risk that *future* changes (were the immutability lifted) or *environmental* conditions (e.g., a busy port) would break the behavior.

The product yields three priority bands:

| Priority | Meaning | Selection rule |
|----------|---------|----------------|
| **P0** | Highest risk — protects the externally observable contract | Cover first; cheapest, fastest, highest value |
| **P1** | Moderate risk — process lifecycle and the one real failure mode | Cover next; still zero-dependency |
| **P2** | Lowest marginal value or blocked by a constraint | Cover last, or defer/flag as blocked |

### 2.2 The test pyramid (adapted to a 14-line server)

The classic **test pyramid** prescribes many cheap, fast checks at the base (unit), fewer mid-cost checks in the middle (integration), and the fewest, most expensive checks at the top (end-to-end). For a 14-line, export-less, branchless server the pyramid is **deliberately inverted in practice**: the cheapest *meaningful* check is a black-box HTTP request against a spawned process (an API/integration test), while a true unit test of the handler is **blocked** because there is no `module.exports` to import. The strategy therefore concentrates value at the API/integration layer and treats the unit layer as a flagged, blocked recommendation rather than the base of the pyramid.

### 2.3 How the bands map to this project

- **P0** captures the **API contract** and **determinism** — the two properties the external consumer actually relies on.
- **P1** captures **process lifecycle** (binding + readiness log) and the **single real failure mode** (`EADDRINUSE`).
- **P2** captures the **isolated unit test** (blocked by C-001) and **coverage measurement** (feasible only via Node's built-in flag).

### 2.4 Preferred implementation path — Node's built-in `node:test`

All recommendations below are designed to run on **Node's built-in test runner, `node:test`**, together with `node:assert` and the global `fetch` / `node:http` client. `node:test` has been a **stable, dependency-free** part of the Node.js runtime **since Node v20** and is present in the project's modern-Node baseline (Node v22); `node:assert`, the global `fetch`, and the `--experimental-test-coverage` flag are likewise built in. These capabilities were verified available in the Node runtime used to author this strategy.

This built-in path is the **only** option that keeps the project runnable **without `npm install`**, directly honoring the zero-dependency constraints **C-005 / C-006**. No third-party runner, assertion library, HTTP client, or coverage tool (Jest, Mocha, Vitest, `supertest`, `c8`, `nyc`) is adopted anywhere in this strategy.

---

## 3. Risk-Ranked Recommendations (P0 → P2)

The recommendations are presented **strictly in priority order**. Each carries its **class**, a concrete **description**, the **business-impact / risk rationale**, and an explicit **constraint-interaction** annotation. The summary table comes first; detailed subsections follow in the same order.

### 3.1 Summary table

| Priority | Class | Recommendation | Business-impact / risk rationale | Constraint interaction |
|----------|-------|----------------|----------------------------------|------------------------|
| **P0** | API scenario | `GET /` returns HTTP `200`, `Content-Type: text/plain`, and body **exactly** `Hello, World!\n` (14 bytes) [`server.js:L7-L9`] | This is the fixture's **core contract**, the precise response the external backprop consumer relies on — highest business impact | **Zero-dependency feasible** — `node:test` + `fetch` (or `node:http`) against a spawned server |
| **P0** | Edge case (determinism) | Any HTTP method (`POST`/`PUT`/`DELETE`/`OPTIONS`) and arbitrary paths/bodies yield an **identical** response | Verifies the **branchless determinism invariant**: the handler ignores all request details [`server.js:L6-L10`] | **Zero-dependency feasible** |
| **P1** | Integration | The server **binds `127.0.0.1:3000`** and **emits the startup log** `Server running at http://127.0.0.1:3000/` [`server.js:L12-L13`] | Confirms process lifecycle and the observable readiness signal | **Zero-dependency feasible** — spawn the process, probe loopback, read stdout |
| **P1** | Edge case (failure mode) | Startup **fails with `EADDRINUSE`** when port `3000` is already occupied (assumption A-002) | Documents the **only failure mode** of an error-handler-free server | **Zero-dependency feasible** |
| **P2** | Unit | Exercise the request handler **in isolation** | Highest granularity but **lowest marginal value** for a branchless handler | **BLOCKED by C-001** — `server.js` has **no `module.exports`**; isolating the handler needs a source refactor |
| **P2** | Coverage | Establish a **baseline (currently 0% automated)** and measure it over time | Quantifies test adequacy as the suite grows | Zero-dependency via `--experimental-test-coverage`; **`c8` / `nyc` / Jest coverage excluded by C-005** |

> **Illustrative snippets are *recommended, not implemented*.** Where a code example appears below it is for guidance only — **no test file is created by this engagement** (see Section 5). All snippets mirror the repository's conventions: CommonJS `require`, two-space indentation, single quotes, `const`, and arrow callbacks, asserting only the real invariants `127.0.0.1`, `3000`, and `Hello, World!\n`.

### 3.2 P0 — API scenario: the `GET /` response contract

- **Class:** API test scenario.
- **Description:** Issue `GET /` against a running instance and assert the full response contract — status `200`, header `Content-Type: text/plain`, body **exactly** `Hello, World!\n`, and a byte length of **14** [`server.js:L7-L9`].
- **Business-impact / risk rationale:** This response *is* the product. The external backprop integration consumes this exact contract, so any deviation (a changed status, a different content type, an altered or differently-sized body) is the **highest-impact** regression possible for this fixture. Covering it first yields the greatest protection per unit of effort.
- **Constraint interaction:** **Zero-dependency feasible.** Spawn `node server.js` as a child process and probe it over loopback with the built-in `node:http` client (or the global `fetch`); assert with `node:assert`. No third-party tooling, no `npm install`.

A minimal `node:test` illustration (recommended, not implemented):

```js
// RECOMMENDED — NOT IMPLEMENTED. Illustrative only; this engagement creates no test file.
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const http = require('node:http');

let child;

before(async () => {
  child = spawn('node', ['server.js'], { stdio: ['ignore', 'pipe', 'pipe'] });
  // Wait for the readiness signal on stdout before probing.
  await new Promise((resolve) => {
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('Server running at http://127.0.0.1:3000/')) {
        resolve();
      }
    });
  });
});

after(() => {
  child.kill();
});

const get = (url) => new Promise((resolve, reject) => {
  http.get(url, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
  }).on('error', reject);
});

test('GET / honors the 200 / text-plain / 14-byte contract', async () => {
  const { statusCode, headers, body } = await get('http://127.0.0.1:3000/');
  assert.strictEqual(statusCode, 200);
  assert.strictEqual(headers['content-type'], 'text/plain');
  assert.strictEqual(body, 'Hello, World!\n');
  assert.strictEqual(Buffer.byteLength(body), 14);
});
```

### 3.3 P0 — Edge case: determinism across methods, paths, and bodies

- **Class:** Edge case validation.
- **Description:** Drive the server with several methods (`POST`, `PUT`, `DELETE`, `OPTIONS`) against arbitrary paths — and, subject to the testing note below, arbitrary request bodies — and assert that **every** response is identical to the `GET /` contract: `200`, `text/plain`, `Hello, World!\n`.
- **Business-impact / risk rationale:** The handler is **branchless** [`server.js:L6-L10`]; it reads nothing from the request and therefore must answer every caller identically. This determinism is a load-bearing assumption for the backprop consumer (it can issue any request and rely on the same answer). A regression here — e.g., a future branch that special-cases a method — would silently break that assumption, so it ranks alongside the contract test at **P0**.
- **Constraint interaction:** **Zero-dependency feasible** — the same spawned-server harness from Section 3.2, parameterized over method and path.

A compact, table-driven illustration (recommended, not implemented; reuses the spawned-server harness shown in Section 3.2). It varies **method and path**, which the branchless handler ignores, and sends no request body so the assertion is deterministic (see the testing note):

```js
// RECOMMENDED — NOT IMPLEMENTED.
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

// Vary method AND path; the branchless handler ignores both.
const request = (method, reqPath) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: 3000, method, path: reqPath }, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => resolve({ statusCode: res.statusCode, body }));
  });
  req.on('error', reject);
  req.end();
});

const cases = [
  ['POST', '/anything'],
  ['PUT', '/a/b/c'],
  ['DELETE', '/?q=1'],
  ['OPTIONS', '/'],
];

for (const [method, reqPath] of cases) {
  test(`${method} ${reqPath} returns the identical response`, async () => {
    const { statusCode, body } = await request(method, reqPath);
    assert.strictEqual(statusCode, 200);
    assert.strictEqual(body, 'Hello, World!\n');
  });
}
```

> **Testing note — request-body draining (avoid a flaky test).** `server.js` calls `res.end()` without ever reading the request stream (`req`). Because the response completes with `Connection: close` while the request body is left **undrained**, a client that *sends a body* can intermittently observe a transport-level `ECONNRESET` once the socket is torn down — **even though the application-layer response is unchanged** (`200` / `Hello, World!\n`). The reliable determinism signal is therefore **method and path variation**, as shown above. A test that *also* wants to vary the **body** should either omit the body or explicitly tolerate this connection-reset race; it must not treat the reset as a contract failure, because the server's *response* is still deterministic. (This behavior was confirmed empirically while validating this strategy.)

### 3.4 P1 — Integration: binding and the startup readiness signal

- **Class:** Integration test recommendation.
- **Description:** Start the server as a child process and confirm two integration facts: (1) it **binds `127.0.0.1:3000`** and accepts a loopback connection, and (2) it **emits the startup log line** `Server running at http://127.0.0.1:3000/` on stdout from the `server.listen` callback [`server.js:L12-L13`].
- **Business-impact / risk rationale:** This verifies the **process lifecycle** and the **observable readiness signal** that any orchestration (or the P0 tests' own `before` hook) depends on to know the server is ready. Its impact is one tier below the response contract — it protects *how the server comes up* rather than *what it returns* — so it sits at **P1**.
- **Constraint interaction:** **Zero-dependency feasible** — spawn the process, read stdout for the readiness line, then probe loopback; assert with `node:assert`. The startup-log assertion is exactly the `child.stdout` check already shown in the Section 3.2 `before` hook, promoted to an explicit assertion.

### 3.5 P1 — Edge case: the `EADDRINUSE` startup failure mode

- **Class:** Edge case validation.
- **Description:** Assert that starting the server when port `3000` is already occupied fails with the error code `EADDRINUSE` (assumption A-002).
- **Business-impact / risk rationale:** `server.js` registers **no `error` handler** on the server, so an in-use port is the **only failure mode** the process exhibits — it will throw and exit rather than degrade. Documenting and pinning this behavior is valuable (it is the one place the server can fail to start), but it is lower-impact than the success-path contract, so it ranks **P1**.
- **Constraint interaction:** **Zero-dependency feasible** — occupy the port with a throwaway `node:http` listener, then assert the second `listen` emits an `error` whose `code` is `EADDRINUSE`.

A focused illustration of the failure mode (recommended, not implemented):

```js
// RECOMMENDED — NOT IMPLEMENTED.
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

test('a second listener on 127.0.0.1:3000 fails with EADDRINUSE', async () => {
  const blocker = http.createServer();
  await new Promise((resolve) => blocker.listen(3000, '127.0.0.1', resolve));
  const second = http.createServer();
  const err = await new Promise((resolve) => {
    second.on('error', resolve);
    second.listen(3000, '127.0.0.1');
  });
  assert.strictEqual(err.code, 'EADDRINUSE');
  blocker.close();
});
```

### 3.6 P2 — Unit: the request handler in isolation (BLOCKED by C-001)

- **Class:** Unit test recommendation.
- **Description:** Import the request handler `(req, res) => { ... }` directly and invoke it against mocked `req`/`res` objects, asserting it sets `statusCode = 200`, the `Content-Type` header, and ends with `Hello, World!\n` — all **without** starting a real server.
- **Business-impact / risk rationale:** A unit test is the highest-granularity, fastest check in principle, but for a **branchless** handler its **marginal value is the lowest**: there are no conditional paths to isolate, and the P0 API/determinism tests already exercise the exact same output through a real HTTP round-trip. It therefore ranks **P2**.
- **Constraint interaction:** **BLOCKED by C-001.** `server.js` declares **no `module.exports`**, so the handler **cannot be imported in isolation**. Making it importable would require editing `server.js` (e.g., adding `module.exports = server;` or exporting the handler) — a mutation of a protected baseline file, which is **forbidden by C-001**. This recommendation is therefore **gated/blocked, not actionable now**: it would become available only if the immutability directive were lifted *and* the owners explicitly approved a source refactor. Until then, the API-layer P0 tests are the correct substitute.

### 3.7 P2 — Coverage: establish and measure a baseline

- **Class:** Coverage improvement opportunity.
- **Description:** Establish the current coverage **baseline — 0% automated** — and measure coverage over time as the recommended P0/P1 tests are introduced, using Node's **built-in** coverage facility.
- **Business-impact / risk rationale:** Coverage is a *meta*-signal: it quantifies how much of `server.js` the suite actually exercises and guards against silent erosion as the project evolves. It does not by itself protect the contract (the P0 tests do that), so it ranks **P2** — valuable for long-term adequacy, lower immediate impact.
- **Constraint interaction:** **Zero-dependency feasible via the built-in flag only.** Node's `--experimental-test-coverage` reports coverage with no install:

```
node --test --experimental-test-coverage
```

  Third-party coverage tools (`c8`, `nyc`, Jest's `--coverage`) are **excluded by C-005 / C-006** because they require `npm install`. With the P0 API and determinism tests in place, the branchless handler body [`server.js:L7-L9`] is fully exercised, so a small built-in-coverage run is sufficient to move the baseline from 0% to near-complete line coverage of the reachable code.

---

## 4. Five-Class Coverage Cross-Check

The user-specified rule mandates five recommendation classes. Each is explicitly addressed by one or more of the prioritized items above; the table confirms full coverage of the rule and where to find each class.

| Rule-mandated class | Addressed by | Priority | Constraint interaction |
|---------------------|--------------|----------|------------------------|
| **Unit test recommendations** | §3.6 — request handler in isolation | P2 | **BLOCKED by C-001** (no `module.exports`) |
| **Integration test recommendations** | §3.4 — binding `127.0.0.1:3000` + startup readiness log | P1 | Zero-dependency feasible |
| **API test scenarios** | §3.2 — `GET /` response contract (`200` / `text/plain` / 14-byte body) | P0 | Zero-dependency feasible |
| **Edge case validations** | §3.3 — determinism across methods/paths/bodies; §3.5 — `EADDRINUSE` startup failure | P0 / P1 | Zero-dependency feasible |
| **Coverage improvement opportunities** | §3.7 — 0% baseline + `--experimental-test-coverage` | P2 | Built-in flag feasible; `c8`/`nyc`/Jest excluded by C-005 |

All five classes are present and labeled. The ordering throughout Section 3 is by **business impact × failure likelihood** (P0 → P1 → P2), never arbitrary.

---

## 5. Constraint-Compatibility Note

This section separates the recommendations that can be implemented **today with zero dependencies** from those that are **blocked or forbidden** by the governing constraints, and states precisely what this engagement does and does not change.

### 5.1 Zero-dependency-feasible (the preferred path)

The following are achievable now using **only** Node's built-in `node:test` + `node:assert` + `fetch` / `node:http`, with **no `npm install`** — fully compatible with **C-005 / C-006**:

- **P0 — API contract** (§3.2)
- **P0 — Determinism** (§3.3)
- **P1 — Integration: bind + startup log** (§3.4)
- **P1 — `EADDRINUSE` failure mode** (§3.5)
- **P2 — Coverage via `--experimental-test-coverage`** (§3.7)

### 5.2 Blocked or forbidden

| Item | Status | Governing constraint |
|------|--------|----------------------|
| Unit-testing the handler in isolation (§3.6) | **Blocked** — requires adding `module.exports` to `server.js` (a source edit) | **C-001** (source immutability) |
| Adopting `c8` / `nyc` / Jest / Mocha / Vitest / `supertest` | **Forbidden** — all require `npm install` | **C-005 / C-006** (zero dependencies / no install) |
| Editing the `package.json` `test` script to wire a runner | **Gated** — edits a protected baseline file | **C-001** (plus needs explicit user confirmation) |

### 5.3 What this engagement does **not** do

- **No test files are implemented.** This document is a recommendations deliverable only; it authors **zero** `*.test.js` / `*.spec.js` files and adds no test directory.
- **The `package.json` `test` script is NOT edited.** It remains the npm-default placeholder at `package.json:L7`: `echo "Error: no test specified" && exit 1`. Wiring a real script (for example, `"test": "node --test"`) would modify a protected baseline file and is therefore **gated by C-001 / C-005 / C-006 and requires explicit user confirmation** before it could be applied.
- **No baseline file is touched.** `server.js`, `package.json`, `package-lock.json`, and `README.md` remain **byte-identical**; this document is purely additive under `docs/`.

### 5.4 Behavioral invariants any future test must preserve

Should the recommendations ever be implemented, the tests must **assert** these invariants without **altering** them (constraints C-002 / C-003 / C-004):

- **Host:** `127.0.0.1` [`server.js:L3`]
- **Port:** `3000` [`server.js:L4`]
- **Response body:** `Hello, World!\n` — **exactly 14 bytes** [`server.js:L9`]
- **Status & content type:** `200` and `text/plain` [`server.js:L7-L8`]

Tests observe these values; they never change the source that produces them.

---

## 6. Cross-Reference & Closing

This strategy is the companion to the dead/unused code report, [`./dead-code-analysis.md`](./dead-code-analysis.md). That report's headline conclusion is **zero removable dead code**: every function, variable, import, and file in the repository is live, and no statement is unreachable. The direct consequence for testing is that **no dead code blocks test authoring** — every recommendation above targets **real, reachable behavior**, and a future suite would never be exercising code slated for removal.

Both documents are governed by the same highest-precedence constraint, **C-001 — source immutability**, sourced from the `README.md` directive `test project for backprop integration. Do not touch!`. Accordingly, both are **analysis-only and additive**: they describe and recommend, but they never modify `server.js`, `package.json`, `package-lock.json`, or `README.md`. Authoring this testing strategy leaves all four baseline files **byte-identical**.

**Bottom line.** Start with the two **P0** checks — the `GET /` contract and cross-method determinism — because they protect exactly what the external backprop consumer relies on, at the lowest cost and with zero dependencies. Add the **P1** integration and `EADDRINUSE` checks next. Treat the **P2** isolated unit test as **blocked** under C-001 and the **P2** coverage measurement as a built-in, zero-dependency follow-on. No third-party tooling is required, and no baseline file is changed.

