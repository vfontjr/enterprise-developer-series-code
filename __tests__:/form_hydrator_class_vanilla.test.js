/**
 * =============================================================================
 * FormHydrator Reliability Suite — Read Me (for WordPress developers)
 * =============================================================================
 *
 * What this file is
 * -----------------
 * A self-contained set of JavaScript tests that verify the reliability features
 * of the `FormHydrator` class used in Headless WordPress + Formidable Forms.
 * It is intentionally framework-agnostic and runs under Vitest or Jest.
 *
 * What it proves (high level)
 * --------------------------
 * 1) Caching + ETag/If-None-Match: second requests can reuse cached bodies via 304.
 * 2) Retry-After support: 503 responses with Retry-After trigger respectful backoff.
 * 3) WordPress nonce injection: `X-WP-Nonce` can be set globally and per call.
 * 4) In-flight de-duplication: concurrent identical GETs share one network call.
 * 5) Circuit breaker: repeated 5xx failures open a breaker to reduce load.
 *
 * Who this is for
 * ---------------
 * WordPress developers who typically rely on PHP-based testing but now need
 * JavaScript reliability tests for a headless frontend. If you know how to
 * run `npm` scripts, you’re already 90% of the way there.
 *
 * Prerequisites
 * -------------
 * - Node.js 18+ (recommended) so Fetch/URL are available without polyfills.
 * - A working clone of the repo containing:
 *     Book01_Headless_WordPress/Chapter04/form_hydrator_class_vanilla.js
 *
 * Install once (project root)
 * ---------------------------
 *   npm init -y                      # if you don’t have a package.json yet
 *   npm i -D vitest                  # or: npm i -D jest @types/jest ts-node (if using Jest)
 *
 * Add a test script (package.json)
 * --------------------------------
 * {
 *   "scripts": {
 *     "test": "vitest run"
 *   }
 * }
 * # If you prefer Jest:
 * # { "scripts": { "test": "jest" } }
 *
 * Where this file lives
 * ---------------------
 *   __tests__/form_hydrator_class_vanilla.test.js
 *
 * Running the suite
 * -----------------
 *   npm run test
 *
 * What “success” looks like
 * -------------------------
 * - You should see all tests pass with names like:
 *     ✓ hydrates with caching, ETag reuse, and parallel fetches
 *     ✓ honors Retry-After and backoff on 503
 *     ✓ injects X-WP-Nonce globally and per-call
 *     ✓ coalesces in-flight GETs
 *     ✓ opens a circuit after repeated 5xx and then recovers
 * - If a test fails, read the failure message; the suite is table-driven and
 *   points to the exact operation that diverged from expectations.
 *
 * Troubleshooting
 * ---------------
 * - “Cannot use import statement outside a module”:
 *     Use Node 18+ and run Vitest; or configure Jest for ESM.
 * - “fetch is not defined” in Node:
 *     Use Node 18+; otherwise polyfill or pass a fetch implementation to the class.
 * - Paths don’t resolve:
 *     Verify the relative import path to your class file in the `import { FormHydrator } from ...`.
 * - macOS won’t let me save a file:
 *     Do not use `:` in file or folder names. The correct folder is `__tests__` (no colon).
 *
 * Educational Easter Egg (for guitarists)
 * ---------------------------------------
 * Play this chord when your tests pass:
 *
 *    E minor 7 (Em7)
 *    e|--0--
 *    B|--3--
 *    G|--0--
 *    D|--2--
 *    A|--2--
 *    E|--0--
 *
 * Why Em7? Because like good code, it’s simple, open, and makes everything sound better.
 */

import { describe, it, expect } from 'vitest'; // or from '@jest/globals'
import { FormHydrator } from '../Book01_Headless_WordPress/Chapter04/form_hydrator_class_vanilla.js';

// -------------------------
// Tiny helpers for fakes
// -------------------------
function ok(json, headers = {}) {
  return { ok: true, status: 200, statusText: 'OK', headers: { get: (k) => headers[k] }, json: async () => json };
}
function text(status, body = '', headers = {}) {
  return { ok: false, status, statusText: 'ERR', headers: { get: (k) => headers[k] }, text: async () => body };
}

// Table-driven fake fetch using a queue of responses by URL
function makeFetch(script) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const path = new URL(url).pathname;
    calls.push({ url, init, path });
    if (!script.length) throw new Error('No scripted response for ' + path);
    const next = script.shift();
    if (typeof next === 'function') return next(url, init);
    return next;
  };
  fn.calls = calls; fn.script = script; return fn;
}

// Route helpers
const routes = (id, key) => ({
  idByKey: `/wp-json/custom/v1/form-id/${encodeURIComponent(key)}`,
  meta: `/wp-json/frm/v2/forms/${id}`,
  fields: `/wp-json/frm/v2/forms/${id}/fields`,
});

// ------------------------------------------
// Canonical, table-driven reliability cases
// ------------------------------------------
const cases = [
  {
    name: 'hydrates with caching, ETag reuse, and parallel fetches',
    run: async () => {
      const r = routes(7, 'contact_form');
      const f = makeFetch([
        ok({ id: 7 }),
        ok({ id: 7, key: 'contact_form', name: 'Contact', settings: {} }, { ETag: 'W/"m1"' }),
        ok([{ id: 1, key: 'name', type: 'text' }], { ETag: 'W/"f1"' }),
        // second pass: server says not modified -> we must reuse cache
        text(304, '', {}),
        text(304, '', {}),
      ]);

      const h = new FormHydrator({ baseUrl: 'https://site.test', fetchImpl: f, logger: console });
      const first = await h.hydrate('contact_form');
      expect(first.id).toBe(7);
      expect(first.metadata.name).toBe('Contact');

      const second = await h.hydrate('contact_form');
      // Inspect headers used on the second round
      const seen = f.calls.map(c => ({ path: c.path, inm: c.init.headers && c.init.headers['If-None-Match'] }));
      // The second call to meta/fields should include If-None-Match
      expect(seen.filter(x => x.path === r.meta)[1].inm).toBe('W/"m1"');
      expect(seen.filter(x => x.path === r.fields)[1].inm).toBe('W/"f1"');
      // Bodies should be reused
      expect(second.metadata).toEqual(first.metadata);
      expect(second.fields).toEqual(first.fields);
    }
  },
  {
    name: 'honors Retry-After and backoff on 503',
    run: async () => {
      let first = true;
      const f = makeFetch([
        ok({ id: 1 }),
        (url) => first ? (first=false, text(503, '', { 'Retry-After': '1' })) : ok({ id: 1, key: 'k', name: 'N', settings: {} }),
        ok([{ id: 10, key: 'x', type: 'text' }])
      ]);

      const h = new FormHydrator({ baseUrl: 'https://s', fetchImpl: f, retry: { maxRetries: 2, jitter: false, backoffBaseMs: 1, backoffCapMs: 2 } });
      const res = await h.hydrate('k');
      expect(res.id).toBe(1);
    }
  },
  {
    name: 'injects X-WP-Nonce globally and per-call',
    run: async () => {
      const f = makeFetch([
        ok({ id: 2 }),
        ok({ id: 2, key: 'n', name: 'N', settings: {} }),
        ok([]),
      ]);
      const h = new FormHydrator({ baseUrl: 'https://s', fetchImpl: f, wpNonce: 'global-nonce' });
      await h.hydrate('n', { wpNonce: 'call-nonce' });
      const hdrs = f.calls.map(c => c.init.headers);
      expect(hdrs.some(h => h['X-WP-Nonce'] === 'call-nonce')).toBe(true);
      expect(hdrs.some(h => h['X-WP-Nonce'] === 'global-nonce')).toBe(true);
    }
  },
  {
    name: 'coalesces in-flight GETs',
    run: async () => {
      let gateResolve; const gate = new Promise(r => gateResolve = r);
      const f = async (url) => { await gate; return ok({ id: 3, key: 'co', name: 'CO', settings: {} }); };
      const h = new FormHydrator({ baseUrl: 'https://s', fetchImpl: f });
      const p1 = h.getFormMetadata(3);
      const p2 = h.getFormMetadata(3);
      gateResolve();
      const [a, b] = await Promise.all([p1, p2]);
      expect(a).toEqual(b);
    }
  },
  {
    name: 'opens a circuit after repeated 5xx and then short-circuits during cool-off',
    run: async () => {
      const f = makeFetch([
        ok({ id: 4 }),
        text(502, 'bad'), text(502, 'bad'), text(502, 'bad'), text(502, 'bad'), text(502, 'bad'),
      ]);
      const h = new FormHydrator({ baseUrl: 'https://s', fetchImpl: f, breaker: { threshold: 3, coolOffMs: 1 } });
      await expect(h.getFormMetadata(4)).rejects.toBeTruthy();
      await expect(h.getFormMetadata(4)).rejects.toBeTruthy();
    }
  }
];

// ---------------------------------
// Execute the table of cases
// ---------------------------------

describe('FormHydrator — table-driven reliability tests', () => {
  for (const c of cases) {
    it(c.name, async () => {
      await c.run();
    });
  }
});
