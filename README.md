# hao-backprop-test

A minimal Node.js + [Express](https://www.npmjs.com/package/express) tutorial HTTP server. It exposes two plain-text endpoints and listens on `http://127.0.0.1:3000/`.

## Prerequisites

- **Node.js** — a current LTS release. This project does not pin a version (no `engines` field, no `.nvmrc`).
- **npm** — bundled with Node.js.

## Install

This project now depends on Express, so installing dependencies is **required** before the server can start:

```bash
npm install
```

> **Posture change:** this used to be a zero-install project (runnable directly with `node server.js`). Because Express is the project's first dependency, it now has an install-required posture — run `npm install` once before starting the server.

## Run

Start the server with the `start` script:

```bash
npm start
```

This is equivalent to running Node directly:

```bash
node server.js
```

On startup the server logs:

```text
Server running at http://127.0.0.1:3000/
```

## Endpoints

The server listens on `http://127.0.0.1:3000/` and exposes two `GET` routes:

| Method | Path             | Status | Content-Type | Response body   |
| ------ | ---------------- | ------ | ------------ | --------------- |
| GET    | `/`              | 200    | `text/plain` | `Hello, World!` |
| GET    | `/good-evening`  | 200    | `text/plain` | `Good evening`  |

- `GET /` returns `Hello, World!` — the response bytes include a trailing newline.
- `GET /good-evening` returns `Good evening`.

You can exercise both endpoints with `curl` while the server is running:

```bash
curl http://127.0.0.1:3000/
curl http://127.0.0.1:3000/good-evening
```

## Note on project posture

This repository previously carried a "Do not touch!", zero-dependency fixture note. That directive is intentionally relaxed here per the user's explicit request to add Express and a second endpoint. The shift — from a zero-dependency, zero-install fixture to an install-required Express tutorial — is documented above so the change is transparent.
