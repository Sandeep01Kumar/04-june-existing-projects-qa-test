# Dead / Unused Code Analysis Report

> **Project:** `hao-backprop-test` (npm package `hello_world`, v`1.0.0`)
> **Analysis surface:** Whole-repository static analysis — exactly **4 root files, 39 lines total, no subdirectories**.
> **Headline conclusion:** **Zero removable dead code.**
> **Report type:** Analysis-only and **additive**. This document modifies **no** source file.

This report fulfills the request to *"analyze the codebase and identify dead or unused code... find unused functions, classes, variables, imports, files, and unreachable code. Verify all references before marking code as unused, and provide a report with file paths, evidence, confidence levels, and recommended cleanup actions."*

It is a companion to [`./testing-strategy.md`](./testing-strategy.md), which covers the risk-prioritized testing strategy for the same project.

> **Immutability note (constraint C-001).** `README.md` carries the governance directive `test project for backprop integration. Do not touch!`. The four baseline files (`server.js`, `package.json`, `package-lock.json`, `README.md`) must remain byte-identical. This report therefore analyzes those files **without modifying them**; every "recommended cleanup action" below is **advisory / report-only**, and any action that would mutate a baseline file is explicitly flagged as precluded by C-001.

---

## 1. Overview

The `hao-backprop-test` repository is a deliberately minimal, zero-dependency Node.js HTTP server fixture. Its sole runtime module, `server.js`, binds `127.0.0.1:3000` and responds to every request with HTTP `200`, `Content-Type: text/plain`, and the 14-byte body `Hello, World!\n`. Its entire analysis surface is four files at the repository root, with no `src/`, `lib/`, `test/`, or other subdirectories:

| File | Role | Relevance to dead-code analysis |
|------|------|---------------------------------|
| `server.js` | Sole runtime executable — a built-in `http` server | Primary dead-code target (functions, variables, imports, unreachable code) |
| `package.json` | npm manifest | Source of the dangling `main` reference and the placeholder `test` script |
| `package-lock.json` | Lockfile (v3) | Confirms an empty dependency tree — no unused-dependency findings possible |
| `README.md` | Title plus governance directive | Source of the C-001 "Do not touch!" immutability constraint |

After verifying every symbol reference across all four files (Section 2), the analysis concludes that **the repository contains zero removable dead code**. Only two observations surface, and neither is removable: an idiomatic, intentionally-present function parameter (`req`) recommended for retention, and a metadata-consistency note (the `main` field) recorded as report-only because correcting it is barred by C-001.

---

## 2. Methodology

### 2.1 Primary technique — manual symbol-level reference verification

The analysis uses **manual symbol-level reference verification**: every declared symbol (imports, `const` bindings, function expressions) and every structural element (files, statements) is traced from its **declaration** to each of its **usages** across all four files before any verdict is assigned. A symbol is marked *used* only when at least one concrete usage site is found, and marked *unused* only when an exhaustive search across the whole repository finds no read.

This technique is **appropriate and sufficient** for this codebase because:

- **No exports.** `server.js` declares **no `module.exports`** (and no ES-module `export`), so nothing in it can be consumed by an external module. There is no "used elsewhere" surface to chase — usage must be local, and locality makes verification exhaustive.
- **No dynamic dispatch or string-based references.** There is no `eval`, no computed property access (`obj[name]`), no reflection, and no string-keyed lookups. Every reference is lexical and statically visible.
- **Small and branchless.** `server.js` is only 14 lines, and its request handler is **branchless** (no `if`/`else`/`switch`/ternary/`&&`/`||`). There are no conditional paths that could render a statement unreachable.

Together these properties mean a careful read of the four files yields a complete, auditable reference map — reproduced as the matrix in Section 4.

### 2.2 Automated scanners — optional corroboration, NOT run

Automated dead-code scanners were considered as optional corroboration but were **deliberately not installed or run**, because adding any third-party tool would violate the project's zero-dependency / no-install constraints (C-005 / C-006). For completeness, the relevant tools and what each would check are:

| Tool | What it detects | Applicability here |
|------|-----------------|--------------------|
| ESLint `no-unused-vars` | Unused variables and imports | Applicable in principle; not run (would require install) |
| ESLint `no-unreachable` | Unreachable statements | Applicable in principle; not run |
| `depcheck` | Unused / missing dependencies | Moot — the dependency tree is empty |
| `knip` | Unused files, exports, and dependencies | Applicable in principle; not run |
| `ts-prune` | Unused TypeScript exports | **Not applicable** — this is plain JavaScript, not TypeScript |
| `node --check` | Syntax validity only (not dead code) | Available built-in; checks syntax, not usage |

### 2.3 ESLint nuance behind the `req` recommendation

A precise detail informs the recommendation on the `req` parameter (Section 5). ESLint's `no-unused-vars` rule defaults to `args: "after-used"`, which **only flags an unused argument when it appears *after* the last used argument**. In `server.js:L6` the handler signature is `(req, res)` and `res` **is** used (`server.js:L7`–`L9`); because `req` precedes the used `res`, the default `args: "after-used"` setting **would not flag `req`**. Only the stricter `args: "all"` setting would flag it. This is the technical basis for the **KEEP** recommendation: under standard linting configuration, `req` is not even reported as unused.

---

## 3. Confidence Taxonomy

Each verdict carries one of three confidence levels:

| Level | Definition |
|-------|------------|
| **High** | Reference status verified across all files, with no plausible dynamic or string-based reference that could change the verdict. |
| **Medium** | Strong evidence, but with a residual edge case (e.g., a possible dynamic reference) that cannot be fully excluded. |
| **Low** | Heuristic only — the verdict relies on inference rather than exhaustive verification. |

Because this codebase is a 14-line, export-less, branchless module with no dynamic dispatch, **every finding in this report resolves to High confidence**. There are no Medium or Low verdicts.

---

## 4. Findings

### 4.1 Findings table (by prompt category)

The table below uses the four report fields mandated by the prompt — **File Path**, **Evidence**, **Confidence**, and **Recommended Cleanup Action** — and covers all six requested categories, followed by the two real observations.

| File Path | Evidence | Confidence | Recommended Cleanup Action |
|-----------|----------|------------|----------------------------|
| `server.js` (unused **functions**) | Both arrow-function callbacks are passed to live APIs: the request handler to `http.createServer` (`server.js:L6`) and the listen callback to `server.listen` (`server.js:L12`). No function is declared-but-unreferenced. | High | **None** — no unused functions. |
| *(entire repository)* (unused **classes**) | No `class` is declared anywhere in any of the four files. | High | **None** — no classes exist. |
| `server.js` (unused **variables**) | All four `const` declarations — `http` (`L1`), `hostname` (`L3`), `port` (`L4`), `server` (`L6`) — are referenced (see Section 4.2). | High | **None** — no unused variables. |
| `server.js:L1` (unused **imports**) | The single import `http` is used by `http.createServer` (`server.js:L6`). | High | **None** — the import is live. |
| *(all 4 files)* (unused / orphan **files**) | Every file has an active role: `server.js` (runtime), `package.json` (manifest), `package-lock.json` (lockfile), `README.md` (governance). None is orphaned. | High | **None** — no orphan files. |
| `server.js` (**unreachable** code) | All 14 lines execute on startup; the request handler is branchless (no conditional/early-return paths), so no statement is unreachable. | High | **None** — no unreachable code. |
| `server.js:L6` (observation: `req` parameter) | `req` is never read; the handler body (`L7`–`L9`) touches only `res`. It is the idiomatic first positional parameter of an `(req, res)` HTTP handler. | High | **KEEP** (advisory). Idiomatic placeholder; removal harms clarity and is also barred by C-001. See Section 5. |
| `package.json:L5` (observation: `main` field) | `"main": "index.js"` references a file that does not exist; the real entry point is `node server.js`. | High | **Report-only** (no change). Correcting it would edit `package.json`, which is barred by C-001. See Section 6. |

### 4.2 Reference-verification matrix (auditable evidence)

Every declared symbol and structural element, with its declaration site, the usage site(s) that justify its verdict, and the resulting confidence. This is the auditable evidence behind Section 4.1.

| Element | Location | Reference Check | Verdict | Confidence |
|---------|----------|-----------------|---------|------------|
| `http` import | `server.js:L1` | Used by `http.createServer` (`server.js:L6`) | Used | High |
| `hostname` const | `server.js:L3` | Used by `server.listen` (`L12`) and the log template (`L13`) | Used | High |
| `port` const | `server.js:L4` | Used by `server.listen` (`L12`) and the log template (`L13`) | Used | High |
| `server` const | `server.js:L6` | Used by `server.listen` (`L12`) | Used | High |
| `res` handler param | `server.js:L6` | Used by `res.statusCode` / `res.setHeader` / `res.end` (`L7`–`L9`) | Used | High |
| `req` handler param | `server.js:L6` | No read anywhere; handler is branchless | Unused (idiomatic) | High |
| Request-handler arrow fn | `server.js:L6`–`L10` | Passed to `http.createServer` | Used | High |
| Listen-callback arrow fn | `server.js:L12`–`L14` | Passed to `server.listen` | Used | High |
| `"main": "index.js"` | `package.json:L5` | No `index.js` file exists; real entry is `node server.js` | Dangling reference | High |

---

## 5. Detailed Finding 1 — Unused `req` Parameter (KEEP)

- **Location:** `server.js:L6` — `const server = http.createServer((req, res) => {`.
- **Category:** Function parameter (a sub-case of "unused variables").
- **Evidence:** The parameter `req` is never read anywhere in the handler body. Lines `server.js:L7`–`L9` reference only `res` (`res.statusCode`, `res.setHeader`, `res.end`). The handler is branchless, so there is no conditional path in which `req` might be read. Verdict: **unused, but idiomatic**.
- **Confidence:** High.
- **Recommended action: KEEP.**

**Rationale.** `req` is the **idiomatic Node.js callback placeholder** — the first positional parameter of the canonical `(req, res)` HTTP request-handler signature. Three points support retaining it:

1. **Readability and signature clarity.** The `(req, res)` shape is the universally recognized HTTP handler signature. Removing `req` would obscure that the second parameter is the response object and would diverge from the convention every Node.js developer expects.
2. **No linter would flag it under standard configuration.** As explained in Section 2.3, ESLint's default `no-unused-vars` setting `args: "after-used"` does **not** flag `req`, because the later parameter `res` is used. Only the stricter `args: "all"` would report it.
3. **Out of scope and barred by C-001.** Editing `server.js` to drop the parameter is a destructive change to a protected baseline file and is therefore precluded by the immutability constraint.

The marginal benefit of removal (one fewer unread identifier) is negligible against these costs. **Keep `req` as-is.**

---

## 6. Detailed Finding 2 — Dangling `main` Reference (report-only)

- **Location:** `package.json:L5` — `"main": "index.js"`.
- **Category:** Metadata consistency (a dangling reference, not removable dead code).
- **Evidence:** The manifest's `main` field points to `index.js`, but **no `index.js` file exists** anywhere in the repository. The application is actually launched via `node server.js`. The `main` field is therefore a **dangling reference** to a non-existent entry point.
- **Confidence:** High.
- **Recommended action: Report-only (no change).**

**Rationale.** Correcting this inconsistency — for example, repointing `main` to `server.js` or removing the field — would require editing `package.json`, which is **forbidden by C-001** (and precluded by the corresponding assumption that the inconsistency cannot be corrected under the README directive). This is best classified as a **metadata-consistency observation**, not as removable dead code: there is no code to delete, only a manifest field that disagrees with the on-disk layout. It is recorded here for completeness and surfaced for the maintainers' awareness, with **no action taken**.

---

## 7. Summary & Conclusion

**Headline: the repository contains zero removable dead code.** Reference verification across all four files (Section 4.2) confirms that every function, variable, import, and file is live, and that no statement is unreachable:

- **Unused functions — none.** Both arrow-function callbacks are passed to live APIs.
- **Unused classes — none.** No class is declared anywhere.
- **Unused variables — none.** All four `const` bindings are referenced.
- **Unused imports — none.** The single `http` import is used.
- **Unused / orphan files — none.** All four files have an active role.
- **Unreachable code — none.** All 14 lines run on startup; the handler is branchless.

The only two observations are non-removable: the idiomatic `req` parameter (`server.js:L6`) is recommended for **retention**, and the dangling `main` reference (`package.json:L5`) is recorded as **report-only** because correcting it is barred by C-001.

**Testing-infrastructure context.** The project currently has **no test infrastructure**: the `package.json` `test` script (`package.json:L7`) is the npm-default placeholder `echo "Error: no test specified" && exit 1`, and no test files, runner, or coverage tooling exist. Note that **no dead code blocks test authoring** — every symbol is live, so prospective tests would exercise real, reachable behavior. The risk-prioritized plan for introducing tests is documented in the companion report [`./testing-strategy.md`](./testing-strategy.md).

**Immutability reaffirmed.** All conclusions in this report are **advisory**. Authoring this document changes none of the four baseline files — `server.js`, `package.json`, `package-lock.json`, and `README.md` remain byte-identical, honoring the C-001 "Do not touch!" directive in `README.md`.
