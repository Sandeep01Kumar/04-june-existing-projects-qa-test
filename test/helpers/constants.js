/**
 * Shared behavioral-contract constants for the `server.js` test suites.
 *
 * Single source of truth for the values and process coordinates asserted by the
 * Jest suites and the spawn/HTTP harness. Every value here is mirrored verbatim
 * from the repository-root `server.js`, which is immutable (constraint C-001);
 * centralizing them means a single edit propagates to all consumers.
 *
 * server.js provenance (do not paraphrase; mirror exactly):
 *   - HOST           server.js line 3:  `const hostname = '127.0.0.1';`
 *   - PORT           server.js line 4:  `const port = 3000;` (numeric)
 *   - CONTENT_TYPE   server.js line 8:  `res.setHeader('Content-Type', 'text/plain');` (no charset)
 *   - EXPECTED_BODY  server.js line 9:  `res.end('Hello, World!\n');` (trailing newline)
 *   - EXPECTED_BYTES Buffer.byteLength('Hello, World!\n') === 14 (13 chars + 1 newline)
 *   - READY_LOG      server.js line 13: resolved readiness log (note the trailing slash)
 *   - SERVER_PATH    absolute path to the root server.js (two levels up from test/helpers/)
 *
 * Consumers (each destructures the exact export names defined below):
 *   - test/server.contract.test.js    require('./helpers/constants')
 *   - test/server.lifecycle.test.js   require('./helpers/constants')
 *   - test/helpers/server-harness.js  require('./constants')
 *
 * No third-party dependencies: only Node's built-in `path` module is used, and
 * the module is free of side effects beyond the `path.join` that builds
 * SERVER_PATH (a string path; server.js is never required/executed here).
 *
 * @module test/helpers/constants
 */

const path = require('path');

module.exports = {
  HOST: '127.0.0.1',
  PORT: 3000,
  EXPECTED_BODY: 'Hello, World!\n',
  EXPECTED_BYTES: 14,
  CONTENT_TYPE: 'text/plain',
  READY_LOG: 'Server running at http://127.0.0.1:3000/',
  SERVER_PATH: path.join(__dirname, '..', '..', 'server.js'),
};
