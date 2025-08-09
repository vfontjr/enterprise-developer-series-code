/**
 * FormHydrator (Vanilla JS, ES Module)
 * ====================================
 *
 * @author Headless WordPress, Formidable Power, 2nd ed.
 * @license MIT
 * @version 2.0.0
 * @since 2025-08-09
 * @see {@link https://github.com/enterprise-developer-series/enterprise-developer-series-code/blob/main/Book01_Headless_WordPress/Chapter04/form_hydrator_class_vanilla.js}
 * @see Headless WordPress, Formidable Power, 2nd ed., Chapter 4
 *
 * Purpose
 * -------
 * Hydrate a Formidable form by key using WordPress REST endpoints:
 *   1) Resolve numeric ID from a custom route
 *   2) Fetch form metadata
 *   3) Fetch form fields
 *
 * This version is production-friendly and instructional. It demonstrates:
 *   • Dependency injection (custom fetch impl, base URL, headers)
 *   • Structured error handling with timeouts
 *   • Retries with exponential backoff and jitter for transient faults
 *   • Pluggable caching with a default in-memory TTL cache
 *   • Pluggable logger API (debug/info/warn/error)
 *
 * Notes for trainees
 * ------------------
 * 1) The hydrator is intentionally framework-agnostic. You can drop it into
 *    vanilla JS, React, or any headless front end.
 * 2) The cache interface is minimal (get/set/delete). Swap in LocalStorage,
 *    IndexedDB, or Redis (server-side) by implementing the same three methods.
 * 3) Retries only target "likely transient" failures (e.g., 429, 502). Avoid
 *    retrying 4xx client errors that stem from bad requests.
 * 4) All methods validate inputs up front to fail fast and fail clearly.
 */

/**
 * Lightweight no-op logger used by default. Replace with your own (e.g.,
 * pino/winston) by passing a compatible object via options.logger.
 * @type {{debug:Function, info:Function, warn:Function, error:Function}}
 */
const NoopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Simple in-memory TTL cache suitable for browsers and small apps.
 * For scale or persistence, provide your own cache via the options.
 */

class SimpleTTLCache {
  constructor() {
    /** @type {Map<string, {expires:number, value:any}>} */
    this._store = new Map();
  }

  /**
   * @param {string} key
   * @returns {any | undefined}
   */
  get(key) {
    const hit = this._store.get(key);
    if (!hit) return undefined;
    if (hit.expires !== 0 && Date.now() > hit.expires) {
      this._store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  /**
   * @param {string} key
   * @param {any} value
   * @param {number} ttlMs Use 0 for no expiration.
   */
  set(key, value, ttlMs) {
    const expires = ttlMs > 0 ? Date.now() + ttlMs : 0;
    this._store.set(key, { expires, value });
  }

  /**
   * @param {string} key
   */
  delete(key) {
    this._store.delete(key);
  }
}

/**
 * @typedef {Object} FormField
 * @property {number} id Numeric field ID
 * @property {string} key Formidable field key (human-stable identifier)
 * @property {string} type Field type (e.g., 'text', 'email', 'select', 'html', etc.)
 * @property {string} [name] Field label
 * @property {any}    [defaultValue]
 * @property {boolean} [required]
 * @property {Array<any>} [options] For selects/radios/checkboxes
 * @property {Object<string, any>} [config] Vendor-specific extras
 */

/**
 * @typedef {Object} FormMetadata
 * @property {number} id Numeric form ID
 * @property {string} key Formidable form key
 * @property {string} name Human-readable name
 * @property {Object<string, any>} settings Raw settings object returned by the API
 */

/**
 * @typedef {Object} HydrationPayload
 * @property {number} id
 * @property {FormMetadata} metadata
 * @property {Array<FormField>} fields
 */

export class FormHydrator {
  /**
   * @typedef {Object} RetryPolicy
   * @property {number} [maxRetries] Max attempts excluding the initial try. Default 2 (total 3 tries).
   * @property {number} [backoffBaseMs] Initial backoff delay (exponential). Default 250ms.
   * @property {number} [backoffCapMs] Maximum backoff delay cap. Default 4000ms.
   * @property {boolean} [jitter] Add random jitter to reduce thundering herds. Default true.
   * @property {number[]} [retryOnHTTP] HTTP status codes to retry. Default [429, 500, 502, 503, 504].
   */

  /**
   * @typedef {Object} CacheLike
   * @property {(key:string)=>any|Promise<any>} get
   * @property {(key:string, value:any, ttlMs:number)=>void|Promise<void>} set
   * @property {(key:string)=>void|Promise<void>} delete
   */

  /**
   * @typedef {Object} LoggerLike
   * @property {(msg?:any, ...args:any[])=>void} debug
   * @property {(msg?:any, ...args:any[])=>void} info
   * @property {(msg?:any, ...args:any[])=>void} warn
   * @property {(msg?:any, ...args:any[])=>void} error
   */

  /**
   * @typedef {Object} FormHydratorOptions
   * @property {string} [baseUrl] Optional base URL (e.g., "https://example.com"). Defaults to '' (same-origin).
   * @property {typeof fetch} [fetchImpl] Optional fetch implementation to use. Defaults to `window.fetch` or global `fetch`.
   * @property {number} [timeoutMs] Request timeout. Default 10000ms.
   * @property {Object} [headers] Extra headers to include on all requests.
   * @property {RetryPolicy} [retry] Retry configuration.
   * @property {CacheLike} [cache] Pluggable cache. Defaults to an in-memory TTL cache.
   * @property {number} [cacheTTLms] Default TTL for cache entries. Default 30000ms.
   * @property {LoggerLike} [logger] Logger for diagnostics. Defaults to NoopLogger.
   */

  /**
   * @param {FormHydratorOptions} [options]
   */
  constructor(options = {}) {
    const {
      baseUrl = '',
      fetchImpl,
      timeoutMs = 10000,
      headers = {},
      retry = {},
      cache,
      cacheTTLms = 30000,
      logger = NoopLogger,
    } = options;

    /** @private */ this._baseUrl = baseUrl.replace(/\/$/, '');
    /** @private */ this._fetch = fetchImpl || (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch);
    /** @private */ this._timeoutMs = timeoutMs;
    /** @private */ this._headers = headers;
    /** @private */ this._logger = logger || NoopLogger;

    /** @private */ this._retry = {
      maxRetries: retry.maxRetries ?? 2,
      backoffBaseMs: retry.backoffBaseMs ?? 250,
      backoffCapMs: retry.backoffCapMs ?? 4000,
      jitter: retry.jitter ?? true,
      retryOnHTTP: retry.retryOnHTTP ?? [429, 500, 502, 503, 504],
    };

    /** @private */ this._cache = cache || new SimpleTTLCache();
    /** @private */ this._cacheTTLms = cacheTTLms;

    // Centralized route templates for easy overrides
    /** @private */ this._routes = {
      idByKey: (key) => `/wp-json/custom/v1/form-id/${encodeURIComponent(key)}`,
      formMeta: (id) => `/wp-json/frm/v2/forms/${id}`,
      formFields: (id) => `/wp-json/frm/v2/forms/${id}/fields`,
    };
  }

  // =========================
  // Public API (High-Level)
  // =========================

  /**
   * Hydrate a form by its key. Fetches ID, metadata, and fields.
   * Runs metadata and fields requests in parallel for efficiency.
   *
   * @example
   * const hydrator = new FormHydrator();
   * const { id, metadata, fields } = await hydrator.hydrate('contact_form');
   *
   * @param {string} formKey
   * @returns {Promise<HydrationPayload>} Hydration payload
   */
  async hydrate(formKey) {
    const id = await this.getFormIdByKey(formKey);
    const [metadata, fields] = await Promise.all([
      this.getFormMetadata(id),
      this.getFormFields(id),
    ]);
    return { id, metadata, fields };
  }

  /**
   * Fetch the form ID by key using the custom REST route.
   * @param {string} formKey
   * @returns {Promise<number>}
   */
  async getFormIdByKey(formKey) {
    if (!formKey) throw new Error('A non-empty formKey is required.');
    const path = this._routes.idByKey(formKey);
    const data = await this._getWithCacheAndRetry(path);
    if (!data || typeof data.id !== 'number') {
      throw new Error(`Form key "${formKey}" did not return a numeric id.`);
    }
    return data.id;
  }

  /**
   * Fetch form metadata using the Formidable Forms REST API.
   * @param {number} formId
   * @returns {Promise<object>}
   */
  async getFormMetadata(formId) {
    if (!Number.isFinite(formId)) throw new Error('A numeric formId is required.');
    const path = this._routes.formMeta(formId);
    return this._getWithCacheAndRetry(path);
  }

  /**
   * Fetch form fields for the given form ID.
   * @param {number} formId
   * @returns {Promise<Array<object>>}
   */
  async getFormFields(formId) {
    if (!Number.isFinite(formId)) throw new Error('A numeric formId is required.');
    const path = this._routes.formFields(formId);
    return this._getWithCacheAndRetry(path);
  }

  // =========================
  // Public Utilities
  // =========================

  /**
   * Set or overwrite a default header for subsequent requests.
   * Useful for runtime auth token refresh.
   * @param {string} name
   * @param {string} value
   */
  setHeader(name, value) {
    if (!name) throw new Error('Header name is required.');
    this._headers[name] = value;
  }

  /**
   * Remove a default header set on the hydrator instance.
   * @param {string} name
   */
  removeHeader(name) {
    delete this._headers[name];
  }

  /**
   * Invalidate cache entries associated with a specific form ID.
   * Safe to call even if entries do not exist. No-op if cache doesn't support delete failures.
   * @param {number} formId
   */
  async invalidateByFormId(formId) {
    if (!Number.isFinite(formId)) throw new Error('A numeric formId is required.');
    try {
      await this._cache.delete(this._cacheKey(this._routes.formMeta(formId)));
      await this._cache.delete(this._cacheKey(this._routes.formFields(formId)));
    } catch (e) {
      this._logger.warn('[FormHydrator] cache invalidate (formId) failed', e);
    }
  }

  /**
   * Invalidate cache entries associated with a specific form key.
   * This removes the idByKey entry and, if resolvable, the derived ID entries as well.
   * @param {string} formKey
   */
  async invalidateByFormKey(formKey) {
    if (!formKey) throw new Error('A non-empty formKey is required.');
    try {
      // Remove the key->id mapping first
      await this._cache.delete(this._cacheKey(this._routes.idByKey(formKey)));
    } catch (e) {
      this._logger.warn('[FormHydrator] cache invalidate (formKey mapping) failed', e);
    }

    // Optionally remove derived entries if we can still resolve the ID
    try {
      const idData = await this._getWithRetry(this._routes.idByKey(formKey));
      if (idData && typeof idData.id === 'number') {
        await this.invalidateByFormId(idData.id);
      }
    } catch {
      // If we cannot resolve the id right now, best-effort invalidation already occurred.
    }
  }

  // =========================
  // Internal Helpers
  // =========================

  /**
   * Compute a cache key from the baseUrl and path.
   * @param {string} path
   * @returns {string}
   * @private
   */
  _cacheKey(path) {
    return `${this._baseUrl}${path}`;
  }

  /**
   * Get JSON with caching and retry logic layered on top of a single GET.
   * @param {string} path
   * @returns {Promise<any>}
   * @private
   */
  async _getWithCacheAndRetry(path) {
    const key = this._cacheKey(path);

    // 1) Cache check (fast path)
    try {
      const cached = await this._cache.get(key);
      if (typeof cached !== 'undefined') {
        this._logger.debug('[FormHydrator] cache hit', key);
        return cached;
      }
      this._logger.debug('[FormHydrator] cache miss', key);
    } catch (e) {
      this._logger.warn('[FormHydrator] cache get failed', e);
    }

    // 2) Fetch with retries
    const data = await this._getWithRetry(path);

    // 3) Store in cache
    try {
      await this._cache.set(key, data, this._cacheTTLms);
    } catch (e) {
      this._logger.warn('[FormHydrator] cache set failed', e);
    }

    return data;
  }

  /**
   * Perform a GET with timeout and structured retries.
   * @param {string} path
   * @returns {Promise<any>}
   * @private
   */
  async _getWithRetry(path) {
    const {
      maxRetries,
      backoffBaseMs,
      backoffCapMs,
      jitter,
      retryOnHTTP,
    } = this._retry;

    let attempt = 0;
    /* Initial try + N retries */
    while (true) {
      try {
        return await this._getOnce(path);
      } catch (err) {
        attempt++;
        const isAbort = err && err.name === 'AbortError';
        const isNetwork = err && !('status' in err); // no HTTP status on network errors
        const status = err && err.status;

        const retriableHTTP = typeof status === 'number' && retryOnHTTP.includes(status);
        const retriable = isNetwork || isAbort || retriableHTTP;

        if (!retriable || attempt > maxRetries) {
          this._logger.error('[FormHydrator] request failed (no more retries)', { path, attempt, err });
          throw err;
        }

        const delay = this._computeBackoffDelay(attempt, backoffBaseMs, backoffCapMs, jitter);
        this._logger.warn('[FormHydrator] transient failure, retrying…', { path, attempt, delay, status });
        await this._sleep(delay);
      }
    }
  }

  /**
   * Execute a single GET request with timeout. Throws an Error enriched with `status` when HTTP fails.
   * @param {string} path
   * @returns {Promise<any>}
   * @private
   */
  async _getOnce(path) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const id = controller ? setTimeout(() => controller.abort(), this._timeoutMs) : null;

    try {
      const url = `${this._baseUrl}${path}`;
      this._logger.debug('[FormHydrator] GET', url);
      const resp = await this._fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json', ...this._headers },
        signal: controller ? controller.signal : undefined,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        const error = new Error(`Request failed ${resp.status} ${resp.statusText} for ${path}${text ? ` — ${text}` : ''}`);
        // Attach status to error so retry logic can inspect it
        error.status = resp.status;
        throw error;
      }

      return resp.json();
    } catch (err) {
      if (err && err.name === 'AbortError') {
        const abortError = new Error(`Request timed out after ${this._timeoutMs} ms: ${path}`);
        abortError.name = 'AbortError';
        throw abortError;
      }
      throw err;
    } finally {
      if (id) clearTimeout(id);
    }
  }

  /**
   * Compute exponential backoff with optional jitter.
   * @param {number} attempt 1-based attempt number
   * @param {number} base Base ms
   * @param {number} cap Maximum ms
   * @param {boolean} jitter Add random jitter
   * @returns {number}
   * @private
   */
  _computeBackoffDelay(attempt, base, cap, jitter) {
    const exp = Math.min(cap, base * Math.pow(2, attempt - 1));
    if (!jitter) return exp;
    const rand = Math.random() * exp * 0.5; // up to 50% jitter
    return Math.floor(exp / 2 + rand);
  }

  /**
   * Sleep helper for backoff
   * @param {number} ms
   * @returns {Promise<void>}
   * @private
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =========================
// Usage Examples
// =========================

// 1) Same-origin, browser, defaults
// const hydrator = new FormHydrator();
// const result = await hydrator.hydrate('contact_form');
// console.log('Hydrated Form:', result);

// 2) Custom base URL with auth header and extended TTL
// const hydrator = new FormHydrator({
//   baseUrl: 'https://example.com',
//   headers: { Authorization: 'Bearer <token>' },
//   cacheTTLms: 60_000, // 60s cache
//   retry: { maxRetries: 3, backoffBaseMs: 300, backoffCapMs: 5000 },
//   logger: console, // minimal compatible logger
// });
// const { id, metadata, fields } = await hydrator.hydrate('contact_form');

// 3) Server-side/Node with a custom fetch and a Redis-backed cache
// import fetch from 'node-fetch';
// const redisCache = {
//   async get(key) { return await redis.get(key).then(JSON.parse); },
//   async set(key, value, ttlMs) { await redis.set(key, JSON.stringify(value), { PX: ttlMs }); },
//   async delete(key) { await redis.del(key); },
// };
// const hydrator = new FormHydrator({ baseUrl: process.env.SITE_URL, fetchImpl: fetch, cache: redisCache });
// const payload = await hydrator.hydrate('contact_form');

/*
================================================================================
TypeScript Editor Hints (Optional)
--------------------------------------------------------------------------------
This file uses JSDoc to describe types. Most editors (VS Code) will infer types
from these typedefs. If you want even stronger tooling in TS projects without
converting this file, add the following in a sibling `.d.ts` file (example):

  // form_hydrator_class_vanilla.d.ts
  export type FormField = import('./form_hydrator_class_vanilla.js').FormField;
  export type FormMetadata = import('./form_hydrator_class_vanilla.js').FormMetadata;
  export type HydrationPayload = import('./form_hydrator_class_vanilla.js').HydrationPayload;
  export class FormHydrator {
    constructor(options?: any);
    hydrate(formKey: string): Promise<HydrationPayload>;
    getFormIdByKey(formKey: string): Promise<number>;
    getFormMetadata(formId: number): Promise<FormMetadata>;
    getFormFields(formId: number): Promise<FormField[]>;
    setHeader(name: string, value: string): void;
    removeHeader(name: string): void;
    invalidateByFormId(formId: number): Promise<void>;
    invalidateByFormKey(formKey: string): Promise<void>;
  }

--------------------------------------------------------------------------------
Minimal Unit-Test Scaffold (Jest/Vitest-style, Pseudocode)
--------------------------------------------------------------------------------
import { FormHydrator } from './form_hydrator_class_vanilla.js';

describe('FormHydrator', () => {
  test('hydrates via key with caching', async () => {
    const calls: string[] = [];
    const fakeFetch = async (url: string) => {
      calls.push(url);
      if (url.endsWith('/form-id/contact_form'))
        return ok({ id: 123 });
      if (url.endsWith('/forms/123'))
        return ok({ id: 123, key: 'contact_form', name: 'Contact', settings: {} });
      if (url.endsWith('/forms/123/fields'))
        return ok([{ id: 1, key: 'name', type: 'text' }]);
      throw new Error('Unexpected URL ' + url);
    };

    const cache = new Map();
    const cacheLike = {
      get: (k) => cache.get(k),
      set: (k, v) => cache.set(k, v),
      delete: (k) => cache.delete(k),
    };

    const hydrator = new FormHydrator({ fetchImpl: fakeFetch, baseUrl: 'https://site.test', cache: cacheLike });
    const first = await hydrator.hydrate('contact_form');
    const second = await hydrator.hydrate('contact_form');

    expect(first.id).toBe(123);
    expect(second.id).toBe(123);
    // Only 3 network calls total (id, meta, fields) thanks to cache
    expect(calls.length).toBe(3);
  });

  test('retries on 502 and eventually succeeds', async () => {
    let tries = 0;
    const fakeFetch = async (url: string) => {
      if (url.endsWith('/form-id/contact_form')) return ok({ id: 5 });
      if (url.endsWith('/forms/5')) {
        tries++;
        if (tries < 3) return fail(502);
        return ok({ id: 5, key: 'contact_form', name: 'C', settings: {} });
      }
      if (url.endsWith('/forms/5/fields')) return ok([]);
      throw new Error('Unexpected URL ' + url);
    };

    const hydrator = new FormHydrator({ fetchImpl: fakeFetch, baseUrl: 'https://site.test', retry: { maxRetries: 3, backoffBaseMs: 1, backoffCapMs: 2, jitter: false } });
    const res = await hydrator.hydrate('contact_form');
    expect(res.id).toBe(5);
    expect(tries).toBe(3); // 2 failures + 1 success
  });
});

// Helpers to emulate fetch API responses in tests
function ok(json: any) { return { ok: true, status: 200, statusText: 'OK', json: async () => json }; }
function fail(status: number) { return { ok: false, status, statusText: 'ERR', text: async () => '' }; }

================================================================================
*/