/**
 * Custom Jest test sequencer for the hello_world project.
 *
 * WHY THIS EXISTS
 * ---------------
 * `server.js` binds the hardcoded host/port `127.0.0.1:3000`. The two suites
 * that exercise it therefore cannot run in parallel and, more subtly, must run
 * in a specific ORDER:
 *
 *   1. `test/server.lifecycle.test.js` (black-box): spawns `node server.js` as
 *      a child process and kills it per test, so it ACQUIRES and RELEASES
 *      port 3000 within each test. It must run FIRST, while the port is free.
 *   2. `test/server.contract.test.js` (in-process): `require()`s `server.js`,
 *      which immediately starts listening and HOLDS port 3000 for the entire
 *      duration of the file. It must run SECOND, after the lifecycle suite has
 *      fully released the port.
 *
 * Running the contract suite first would leave port 3000 occupied for the rest
 * of the run, causing the lifecycle suite's spawned servers to fail with
 * `EADDRINUSE`. This sequencer guarantees the lifecycle-before-contract order.
 *
 * It is registered by the root `jest.config.js` via
 * `testSequencer: './test/testSequencer.js'`. Jest imports the module's
 * default (CommonJS) export, expects it to be a CLASS, and instantiates it
 * once per run. Only `sort` is overridden here; `shard`, `cacheResults`, and
 * `allFailedTests` are inherited unchanged from the base sequencer so test
 * sharding and the failure-first run cache keep working.
 *
 * @see https://jestjs.io/docs/configuration#testsequencer-string
 */

// The base sequencer ships bundled with Jest as the default export of
// `@jest/test-sequencer` (a transitive dependency of `jest`); it is not a
// separate `package.json` entry.
const Sequencer = require('@jest/test-sequencer').default;

// Desired execution order, expressed as test-file basenames. Index 0 runs
// first. Any test file not listed here sorts AFTER every listed file (see
// `rank` below), so adding new suites later never breaks this ordering.
const order = ['server.lifecycle.test.js', 'server.contract.test.js'];

/**
 * Compute the ascending sort rank of a test from its file path.
 *
 * Lower ranks run earlier. A listed file receives its index in `order`
 * (lifecycle -> 0, contract -> 1); any unrecognized file receives
 * `order.length` (2), placing unknown or future suites last.
 *
 * @param {{ path: string }} test - A Jest test whose `path` is absolute.
 * @returns {number} The sort rank used to order the suites.
 */
const rank = (test) => {
  const index = order.findIndex((name) => test.path.endsWith(name));
  return index === -1 ? order.length : index;
};

/**
 * Orders the hello_world suites so the port-3000 lifecycle suite always runs
 * before the in-process contract suite.
 */
class CustomSequencer extends Sequencer {
  /**
   * Return a NEW array of tests sorted by `rank` (ascending), breaking ties
   * deterministically by absolute path so the order is stable across runs and
   * platforms. The input array is copied first and never mutated in place.
   *
   * @param {Array<{ path: string }>} tests - The tests Jest intends to run.
   * @returns {Array<{ path: string }>} The same tests in deterministic order.
   */
  sort(tests) {
    const copy = Array.from(tests);
    return copy.sort((a, b) => {
      const rankDiff = rank(a) - rank(b);
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return a.path < b.path ? -1 : 1;
    });
  }
}

module.exports = CustomSequencer;
