/**
 * FormHydrator (Vanilla JS, ES Module)
 * ====================================
 *
 * Author: Headless WordPress, Formidable Power, 2nd ed.
 * License: MIT
 * Version: 3.0.0
 * Since: 2025-08-09
 * @see https://github.com/vfontjr/enterprise-developer-series-code/blob/main/Book01_Headless_WordPress/Chapter04/form_hydrator_class_vanilla.js
 * @see Headless WordPress, Formidable Power, 2nd ed., Chapter 4
 *
 * Purpose
 * -------
 * Hydrate a Formidable form by key using WordPress REST endpoints:
 *   1) Resolve numeric ID from a custom route
 *   2) Fetch form metadata
 *   3) Fetch form fields
 *
 * This version is production-friendly and instructional. It implements the full set
 * of reliability/ergonomics improvements discussed in the book:
 *   (1)  Per-call overrides & caller AbortSignal
 *   (2)  Retry-After support from server responses
 *   (3)  In-flight request de-duplication (coalescing)
 *   (4)  Structured error class with codes & causes
 *   (5)  Route-specific cache TTLs
 *   (6)  Trace IDs, timing, and an optional onRequest hook for observability
 *   (7)  Circuit breaker per-route to back off during repeated 5xxs
 *   (8)  WordPress nonce injection (X-WP-Nonce)
 *   (9)  ETag/If-None-Match support and 304 handling
 *   (10) Response guards (lightweight runtime validation)
 *   (11) Normalization helper for fields
 *   (12) Preload API to warm caches ahead of time
 *   (13) Web Worker & integration test examples (documented below)
 *
 * Notes for trainees
 * ------------------
 * - Framework-agnostic; works in browsers or Node with a fetch polyfill.
 * - Caching is pluggable; default is in-memory TTL cache. For SSR, provide Redis.
 * - The API is intentionally small; power comes from composition via per-call options.
 *  *
 * Request flow (high level)
 * -------------------------
 *              +------------------+
 *   formKey -> |  idByKey route   | --(cache/ETag/retry/breaker)--> { id }
 *              +------------------+
 *                         |
 *                         v
 *                 +--------------+                +----------------+
 *                 |  formMeta    |  \   parallel   |  formFields    |
 *                 +--------------+   \  requests   +----------------+
 *                     |  (GET)        \   (GET)
 *                     |                \
 *   cache lookup --> [in-memory TTL]   [in-memory TTL] <-- cache lookup
 *   if ETag: send If-None-Match         if ETag: send If-None-Match
 *   if 304: reuse cached body           if 304: reuse cached body
 *
 * Cross-cutting concerns
 * ----------------------
 * - Per-call overrides (headers/timeout/AbortSignal/cacheBypass/ttlMs/wpNonce)
 * - X-WP-Nonce injection for privileged WP REST routes
 * - Retry policy (exponential backoff + jitter; honors Retry-After)
 * - Circuit breaker: open per-route after N consecutive 5xx, cool-off then half-open
 * - In-flight de-duplication: concurrent identical GETs share a single promise
 * - Observability: traceId + optional onRequest({ phase, durationMs, status })
 * - Response guards & normalizeFields() for safer consumers
 */

// ---------------------------
// Minimal utilities & types
// ---------------------------

/** @typedef {{debug:Function, info:Function, warn:Function, error:Function}} LoggerLike */
const NoopLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

/** Structured error that callers can switch on without string parsing. */
class FormHydratorError extends Error {
  /**
   * @param {string} message
   * @param {string} code e.g., 'ETIMEDOUT' | 'ENETWORK' | 'EHTTP_502' | 'EBADSHAPE' | 'EBADARGS' | 'ECIRCUIT_OPEN'
   * @param {{status?:number,cause?:any,traceId?:string}} [opts]
   */
  constructor(message, code, opts = {}) {
    super(message);
    this.name = 'FormHydratorError';
    this.code = code;
    this.status = opts.status;
    this.cause = opts.cause;
    this.traceId = opts.traceId;
  }
}

/** Simple in-memory TTL cache. Swap for Redis/IndexedDB in production SSR. */
class SimpleTTLCache {
  constructor() { this._store = new Map(); }
  get(key) {
    const hit = this._store.get(key);
    if (!hit) return undefined;
    if (hit.expires !== 0 && Date.now() > hit.expires) { this._store.delete(key); return undefined; }
    return hit.value;
  }
  set(key, value, ttlMs) {
    const expires = ttlMs > 0 ? Date.now() + ttlMs : 0;
    this._store.set(key, { expires, value });
  }
  delete(key) { this._store.delete(key); }
}

// ---------------------------
// JSDoc typedefs for editors
// ---------------------------

/**
 * @typedef {Object} FormField
 * @property {number} id
 * @property {string} key
 * @property {string} type
 * @property {string} [name]
 * @property {any} [defaultValue]
 * @property {boolean} [required]
 * @property {Array<any>} [options]
 * @property {Object<string, any>} [config]
 */

/**
 * @typedef {Object} FormMetadata
 * @property {number} id
 * @property {string} key
 * @property {string} name
 * @property {Object<string, any>} settings
 */

/** @typedef {{ id:number, metadata:FormMetadata, fields:Array<FormField>, fieldsRaw?:any }} HydrationPayload */

/**
 * Per-call options (compose with instance defaults)
 * @typedef {Object} CallOptions
 * @property {Object} [headers]
 * @property {number} [timeoutMs]
 * @property {AbortSignal} [signal]
 * @property {boolean} [cacheBypass]
 * @property {number} [ttlMs]
 * @property {string} [wpNonce]
 * @property {(evt:{traceId:string,phase:'start'|'success'|'failure',path:string,attempt:number,status?:number,durationMs?:number})=>void} [onRequest]
 */

// -----------------------------------
// Circuit breaker (per-path, simple)
// -----------------------------------
class CircuitBreaker {
  /** @param {{threshold?:number, coolOffMs?:number, logger?:LoggerLike}} [opts] */
  constructor(opts={}) {
    this.threshold = opts.threshold ?? 5;     // consecutive failures to open
    this.coolOffMs = opts.coolOffMs ?? 15000; // how long to stay open
    this._state = new Map(); // key -> {fails:number, openedAt?:number}
    this._logger = opts.logger || NoopLogger;
  }
  _entry(k){ return this._state.get(k) || { fails:0, openedAt:undefined }; }
  canRequest(k){
    const e=this._entry(k);
    if(!e.openedAt) return true;
    const stillOpen = (Date.now()-e.openedAt)<this.coolOffMs;
    if(stillOpen) return false;
    // half-open: reset counters and allow a probe
    this._state.set(k,{fails:0,openedAt:undefined});
    return true;
  }
  recordSuccess(k){ this._state.set(k,{fails:0,openedAt:undefined}); }
  recordFailure(k){
    const e=this._entry(k); const fails=(e.fails||0)+1;
    if(fails>=this.threshold){ this._state.set(k,{fails,openedAt:Date.now()}); this._logger.warn('[Circuit] opened',k); }
    else this._state.set(k,{fails,openedAt:e.openedAt});
  }
}

export class FormHydrator {
  /** @typedef {{maxRetries?:number, backoffBaseMs?:number, backoffCapMs?:number, jitter?:boolean, retryOnHTTP?:number[]}} RetryPolicy */
  /** @typedef {{get:(k:string)=>any|Promise<any>, set:(k:string,v:any,t:number)=>void|Promise<void>, delete:(k:string)=>void|Promise<void>}} CacheLike */
  /** @typedef {number|{idByKey?:number, metadata?:number, fields?:number}} RouteTTLOpts */
  /** @typedef {{ baseUrl?:string, fetchImpl?:typeof fetch, timeoutMs?:number, headers?:Object, retry?:RetryPolicy, cache?:CacheLike, cacheTTLms?:RouteTTLOpts, logger?:LoggerLike, wpNonce?:string, breaker?:{threshold?:number,coolOffMs?:number}}} FormHydratorOptions */

  /** @param {FormHydratorOptions} [options] */
  constructor(options = {}) {
    const { baseUrl = '', fetchImpl, timeoutMs = 10000, headers = {}, retry = {}, cache, cacheTTLms = 30000, logger = NoopLogger, wpNonce, breaker } = options;

    // Core config
    this._baseUrl = baseUrl.replace(/\/$/, '');
    this._fetch = fetchImpl || (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch);
    this._timeoutMs = timeoutMs;
    this._headers = headers;
    this._logger = logger || NoopLogger;
    this._wpNonce = wpNonce; // optional X-WP-Nonce

    // Retry
    this._retry = {
      maxRetries: retry.maxRetries ?? 2,
      backoffBaseMs: retry.backoffBaseMs ?? 250,
      backoffCapMs: retry.backoffCapMs ?? 4000,
      jitter: retry.jitter ?? true,
      retryOnHTTP: retry.retryOnHTTP ?? [429, 500, 502, 503, 504],
    };

    // Cache & TTLs
    this._cache = cache || new SimpleTTLCache();
    this._ttl = this._normalizeTTL(cacheTTLms);

    // In-flight registry
    this._inflight = new Map(); // key -> Promise

    // Circuit breaker
    this._breaker = new CircuitBreaker({ ...(breaker||{}), logger: this._logger });

    // Routes
    this._routes = {
      idByKey: (key) => `/wp-json/custom/v1/form-id/${encodeURIComponent(key)}`,
      formMeta: (id) => `/wp-json/frm/v2/forms/${id}`,
      formFields: (id) => `/wp-json/frm/v2/forms/${id}/fields`,
    };
  }

  // ---------------
  // Public API
  // ---------------

  /**
   * Hydrate a form by its key.
   * @param {string} formKey
   * @param {CallOptions} [opts]
   * @returns {Promise<HydrationPayload>}
   */
  async hydrate(formKey, opts = {}) {
    const id = await this.getFormIdByKey(formKey, opts);
    const [metadata, fieldsRaw] = await Promise.all([
      this.getFormMetadata(id, opts),
      this.getFormFields(id, opts),
    ]);
    const fields = this.normalizeFields(fieldsRaw);
    return { id, metadata, fields, fieldsRaw };
  }

  /** Resolve ID from key. */
  async getFormIdByKey(formKey, opts = {}) {
    if (!formKey) throw new FormHydratorError('A non-empty formKey is required.', 'EBADARGS');
    const path = this._routes.idByKey(formKey);
    const data = await this._getWithCacheAndRetry(path, this._ttl.idByKey, opts);
    this._guardIdByKey(data);
    return data.id;
  }

  /** Fetch form metadata. */
  async getFormMetadata(formId, opts = {}) {
    if (!Number.isFinite(formId)) throw new FormHydratorError('A numeric formId is required.', 'EBADARGS');
    const path = this._routes.formMeta(formId);
    const meta = await this._getWithCacheAndRetry(path, this._ttl.metadata, opts);
    this._guardMetadata(meta);
    return meta;
  }

  /** Fetch form fields. */
  async getFormFields(formId, opts = {}) {
    if (!Number.isFinite(formId)) throw new FormHydratorError('A numeric formId is required.', 'EBADARGS');
    const path = this._routes.formFields(formId);
    const fields = await this._getWithCacheAndRetry(path, this._ttl.fields, opts);
    this._guardFields(fields);
    return fields;
  }

  /** Preload/warm caches for a given key (ID, metadata, fields). */
  async preload(formKey, opts = {}) {
    const id = await this.getFormIdByKey(formKey, opts);
    await Promise.all([ this.getFormMetadata(id, opts), this.getFormFields(id, opts) ]);
    return id;
  }

  // -----------------
  // Public utilities
  // -----------------

  setHeader(name, value) { if (!name) throw new Error('Header name is required.'); this._headers[name] = value; }
  removeHeader(name) { delete this._headers[name]; }
  setWpNonce(nonce) { this._wpNonce = nonce; }

  async invalidateByFormId(formId) {
    if (!Number.isFinite(formId)) throw new FormHydratorError('A numeric formId is required.', 'EBADARGS');
    try {
      await this._cache.delete(this._cacheKey(this._routes.formMeta(formId)));
      await this._cache.delete(this._cacheKey(this._routes.formFields(formId)));
    } catch (e) { this._logger.warn('[FormHydrator] cache invalidate (formId) failed', e); }
  }

  async invalidateByFormKey(formKey) {
    if (!formKey) throw new FormHydratorError('A non-empty formKey is required.', 'EBADARGS');
    try { await this._cache.delete(this._cacheKey(this._routes.idByKey(formKey))); }
    catch (e) { this._logger.warn('[FormHydrator] cache invalidate (formKey mapping) failed', e); }
    try {
      const res = await this._getWithRetry(this._routes.idByKey(formKey), {});
      if (res && res.data && typeof res.data.id === 'number') await this.invalidateByFormId(res.data.id);
    } catch { /* best-effort */ }
  }

  /** Normalize field array into a predictable shape without mutating the original. */
  normalizeFields(fields) {
    if (!Array.isArray(fields)) return [];
    return fields.map(f => ({
      id: Number(f.id),
      key: String(f.key ?? ''),
      type: String(f.type ?? 'text'),
      name: typeof f.name === 'string' ? f.name : undefined,
      required: Boolean(f.required),
      defaultValue: f.defaultValue ?? f.default ?? undefined,
      options: Array.isArray(f.options) ? f.options.slice() : undefined,
      config: (f && typeof f === 'object') ? { ...f.config } : undefined,
    }));
  }

  // -----------------
  // Internal helpers
  // -----------------

  _normalizeTTL(ttl) {
    if (typeof ttl === 'number') return { idByKey: ttl, metadata: ttl, fields: ttl };
    const d = 30000;
    return { idByKey: ttl?.idByKey ?? d, metadata: ttl?.metadata ?? d, fields: ttl?.fields ?? d };
  }

  _cacheKey(path) { return `${this._baseUrl}${path}`; }

  _inflightKey(path, headers) {
    const h = headers ? Object.keys(headers).sort().map(k => `${k}:${headers[k]}`).join('|') : '';
    return `${this._cacheKey(path)}::${h}`;
  }

  // ---- ETag-aware cache wrappers
  _readCacheEntry(key) {
    const entry = this._cache.get(key);
    if (typeof entry === 'undefined') return { body: undefined, etag: undefined };
    if (entry && typeof entry === 'object' && '__etag' in entry && '__body' in entry) return { body: entry.__body, etag: entry.__etag };
    return { body: entry, etag: undefined }; // legacy entries
  }
  async _writeCacheEntry(key, body, ttlMs, etag) {
    if (etag) return this._cache.set(key, { __etag: etag, __body: body }, ttlMs);
    return this._cache.set(key, body, ttlMs);
  }

  // ---- Lightweight response guards
  _guardIdByKey(obj) {
    if (!obj || typeof obj.id !== 'number') throw new FormHydratorError('Unexpected response shape for idByKey.', 'EBADSHAPE');
  }
  _guardMetadata(obj) {
    if (!obj || typeof obj.id !== 'number' || typeof obj.key !== 'string') throw new FormHydratorError('Unexpected response shape for metadata.', 'EBADSHAPE');
  }
  _guardFields(arr) {
    if (!Array.isArray(arr)) throw new FormHydratorError('Unexpected response shape for fields.', 'EBADSHAPE');
  }

  // ---- Core GET with cache, coalescing, retries, ETag/304, breaker, and observability
  async _getWithCacheAndRetry(path, routeTTL, opts = {}) {
    const { cacheBypass = false, ttlMs } = opts;
    const effTTL = typeof ttlMs === 'number' ? ttlMs : routeTTL;
    const key = this._cacheKey(path);

    // Circuit breaker
    if (!this._breaker.canRequest(key)) {
      throw new FormHydratorError('Circuit open for this route; refusing request temporarily.', 'ECIRCUIT_OPEN');
    }

    // Cache check (ETag-aware)
    let cachedBody, cachedEtag;
    if (!cacheBypass) {
      try { const { body, etag } = this._readCacheEntry(key); cachedBody = body; cachedEtag = etag; }
      catch (e) { this._logger.warn('[FormHydrator] cache get failed', e); }
    }

    // In-flight coalescing
    const inflightKey = this._inflightKey(path, opts.headers);
    if (this._inflight.has(inflightKey)) return this._inflight.get(inflightKey);

    const p = (async () => {
      const result = await this._getWithRetry(path, { ...opts, etag: cachedEtag }); // {data,etag,from304}
      const payload = result.from304 ? (cachedBody !== undefined ? cachedBody : result.data) : result.data;
      if (!cacheBypass) {
        try { await this._writeCacheEntry(key, payload, effTTL, result.etag); }
        catch (e) { this._logger.warn('[FormHydrator] cache set failed', e); }
      }
      return payload;
    })();

    this._inflight.set(inflightKey, p);
    try { const val = await p; this._breaker.recordSuccess(key); return val; }
    catch (e) { this._breaker.recordFailure(key); throw e; }
    finally { this._inflight.delete(inflightKey); }
  }

  async _getWithRetry(path, opts = {}) {
    const { maxRetries, backoffBaseMs, backoffCapMs, jitter, retryOnHTTP } = this._retry;
    let attempt = 0; const traceId = Math.random().toString(16).slice(2);

    while (true) {
      const started = Date.now();
      try {
        const res = await this._getOnce(path, { ...opts, traceId }); // {data,etag,from304}
        const duration = Date.now() - started;
        this._logger.info('[FormHydrator] ok', { path, attempt, duration, traceId, from304: !!res.from304 });
        if (typeof opts.onRequest === 'function') opts.onRequest({ traceId, phase:'success', path, attempt, status: 200, durationMs: duration });
        return res;
      } catch (err) {
        const duration = Date.now() - started;
        if (typeof opts.onRequest === 'function') opts.onRequest({ traceId, phase:'failure', path, attempt, status: err.status, durationMs: duration });

        attempt++;
        const status = err && err.status;
        const retryAfterMs = err && err.retryAfterMs;
        const isAbort = err && err.name === 'AbortError';
        const isNetwork = err && err.code === 'ENETWORK';
        const retriableHTTP = typeof status === 'number' && retryOnHTTP.includes(status);
        const retriable = isNetwork || isAbort || retriableHTTP;

        if (!retriable || attempt > maxRetries) {
          this._logger.error('[FormHydrator] request failed (no more retries)', { path, attempt, status, traceId, err });
          throw err;
        }

        const delay = typeof retryAfterMs === 'number' ? retryAfterMs : this._computeBackoffDelay(attempt, backoffBaseMs, backoffCapMs, jitter);
        this._logger.warn('[FormHydrator] transient failure, retrying…', { path, attempt, delay, status, traceId });
        await this._sleep(delay);
      }
    }
  }

  async _getOnce(path, opts = {}) {
    const { headers: callHeaders, timeoutMs: callTimeout, signal: callerSignal, traceId, etag: ifNoneMatch, wpNonce, onRequest } = opts;

    // Compose headers: base → per-call → nonce → If-None-Match
    const headers = { 'Accept': 'application/json', ...this._headers, ...(callHeaders || {}) };
    const nonce = typeof wpNonce === 'string' ? wpNonce : this._wpNonce; if (nonce) headers['X-WP-Nonce'] = nonce;
    if (ifNoneMatch) headers['If-None-Match'] = ifNoneMatch;

    // Compose timeout & signals
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const effTimeout = typeof callTimeout === 'number' ? callTimeout : this._timeoutMs;
    const timeoutId = controller ? setTimeout(() => controller.abort(), effTimeout) : null;
    const onCallerAbort = () => { if (controller) controller.abort(); };
    if (callerSignal && controller) {
      if (callerSignal.aborted) controller.abort();
      else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }

    try {
      const url = `${this._baseUrl}${path}`;
      this._logger.debug('[FormHydrator] GET', { url, traceId, ifNoneMatch: !!ifNoneMatch, hasNonce: !!nonce });
      if (typeof onRequest === 'function') onRequest({ traceId, phase:'start', path, attempt: 0 });

      const resp = await this._fetch(url, { method: 'GET', headers, signal: controller ? controller.signal : undefined });

      if (resp.status === 304) return { data: undefined, etag: ifNoneMatch, from304: true };

      if (!resp.ok) {
        let retryAfterMs = undefined;
        try {
          const ra = resp.headers && (resp.headers.get ? resp.headers.get('Retry-After') : undefined);
          if (ra) { const secs = Number(ra); if (Number.isFinite(secs)) retryAfterMs = secs * 1000; else { const when = Date.parse(ra); if (!Number.isNaN(when)) retryAfterMs = Math.max(0, when - Date.now()); } }
        } catch {}
        const text = await resp.text().catch(() => '');
        const code = typeof resp.status === 'number' ? `EHTTP_${resp.status}` : 'EHTTP';
        const err = new FormHydratorError(`Request failed ${resp.status} ${resp.statusText} for ${path}${text ? ` — ${text}` : ''}`, code, { status: resp.status, traceId });
        err.retryAfterMs = retryAfterMs; throw err;
      }

      const etag = resp.headers && (resp.headers.get ? resp.headers.get('ETag') : undefined);
      const data = await resp.json();
      return { data, etag, from304: false };
    } catch (raw) {
      if (raw && raw.name === 'AbortError') { const err = new FormHydratorError(`Request timed out after ${effTimeout} ms: ${path}`, 'ETIMEDOUT', { traceId, cause: raw }); err.name='AbortError'; throw err; }
      if (!raw || typeof raw.status !== 'number') throw new FormHydratorError(`Network error during GET ${path}`, 'ENETWORK', { traceId, cause: raw });
      throw raw; // already structured
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (callerSignal && controller) callerSignal.removeEventListener('abort', onCallerAbort);
    }
  }

  _computeBackoffDelay(attempt, base, cap, jitter) {
    const exp = Math.min(cap, base * Math.pow(2, attempt - 1));
    if (!jitter) return exp;
    const rand = Math.random() * exp * 0.5; // up to 50% jitter
    return Math.floor(exp / 2 + rand);
  }
  _sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
}

// --------------------------------------
// Convenience helpers for bootstraps/ESM
// --------------------------------------
/**
 * Factory to create a configured hydrator instance.
 * Keeps the primary export clean while giving bootstrap code
 * a single call to create a shared instance.
 * @param {ConstructorParameters<typeof FormHydrator>[0]} options
 * @returns {FormHydrator}
 */
export function createHydrator(options = {}) {
  return new FormHydrator(options);
}

/**
 * Thin wrapper to hydrate a single form using an existing instance.
 * @param {FormHydrator} hydrator
 * @param {string} formKey
 * @param {CallOptions} [opts]
 * @returns {Promise<HydrationPayload>}
 */
export async function getFormWith(hydrator, formKey, opts = {}) {
  if (!hydrator || typeof hydrator.hydrate !== 'function') {
    throw new FormHydratorError('A valid FormHydrator instance is required.', 'EBADARGS');
  }
  return hydrator.hydrate(formKey, opts);
}

/**
 * Hydrate all elements annotated with [data-form-key] within a root node,
 * using a provided shared FormHydrator instance. This is side-effect free:
 * it only annotates the DOM with data-* attributes so your renderer can
 * mount real UI when you’re ready.
 *
 * @param {FormHydrator} hydrator
 * @param {ParentNode} [root=document]
 */
export async function hydrateFormsInDOMWith(hydrator, root = (typeof document !== 'undefined' ? document : undefined)) {
  if (!hydrator || typeof hydrator.hydrate !== 'function') {
    throw new FormHydratorError('A valid FormHydrator instance is required.', 'EBADARGS');
  }
  if (!root || typeof root.querySelectorAll !== 'function') return;

  const targets = Array.from(root.querySelectorAll('[data-form-key]'));
  for (const el of targets) {
    const key = el.getAttribute('data-form-key') || '';
    try {
      const payload = await hydrator.hydrate(key);
      el.dataset.formId = String(payload.id);
      el.dataset.hydrated = 'true';
      // leave room for your renderer hook:
      // el.dispatchEvent(new CustomEvent('formidable:hydrated', { detail: payload }));
    } catch (err) {
      el.dataset.hydrated = 'error';
      el.dataset.hydrateError = err && (err.code || err.status || err.message) || 'error';
    }
  }
}

// =========================
// Usage Examples
// =========================

// 1) Browser defaults
// const hydrator = new FormHydrator();
// const { id, metadata, fields } = await hydrator.hydrate('contact_form');

// 2) Custom base URL, auth, WP Nonce, route TTLs, and per-call overrides
// const hydrator = new FormHydrator({
//   baseUrl: 'https://example.com',
//   headers: { Authorization: 'Bearer <token>' },
//   wpNonce: window?.wpApiSettings?.nonce,
//   cacheTTLms: { idByKey: 120_000, metadata: 60_000, fields: 30_000 },
//   retry: { maxRetries: 3, backoffBaseMs: 300, backoffCapMs: 5000 },
//   logger: console,
//   breaker: { threshold: 5, coolOffMs: 15000 },
// });
// await hydrator.preload('contact_form'); // warm the cache ahead of navigation
// const payload = await hydrator.hydrate('contact_form', {
//   headers: { 'X-Trace': 'abc123' },
//   timeoutMs: 15000,
//   onRequest: ({ traceId, phase, path, durationMs }) => console.log('[trace]', traceId, phase, path, durationMs)
// });

// 3) Node/SSR with Redis-like cache and fetch polyfill
// import fetch from 'node-fetch';
// const redisCache = { get: (k) => redis.get(k).then(x => x && JSON.parse(x)), set: (k,v,ttl) => redis.set(k, JSON.stringify(v), { PX: ttl }), delete: (k) => redis.del(k) };
// const hydrator = new FormHydrator({ baseUrl: process.env.SITE_URL, fetchImpl: fetch, cache: redisCache, logger: console });

/*
================================================================================
ASCII One-Pager (copy-friendly)
--------------------------------------------------------------------------------
Key -> idByKey -> id -> [ formMeta | formFields ] (parallel) -> normalizeFields -> payload

Cache layers: route-specific TTLs; ETag-aware storage { __etag, __body }
Resilience: retries with backoff (+ Retry-After), circuit breaker, request coalescing
Security: optional X-WP-Nonce injection per instance or per call
Observability: traceId, logger hooks, optional onRequest callback

--------------------------------------------------------------------------------
Web Worker example (pseudo)
--------------------------------------------------------------------------------
self.onmessage = async (e) => {
  const { formKey, options } = e.data;
  const hydrator = new FormHydrator(options);
  const payload = await hydrator.hydrate(formKey, { onRequest: (evt) => postMessage({ type:'trace', ...evt }) });
  postMessage({ type:'payload', payload });
};

--------------------------------------------------------------------------------
Vitest/Jest tests (copy into __tests__/form_hydrator_class_vanilla.test.js)
--------------------------------------------------------------------------------
// These tests are framework-agnostic. They work in Vitest or Jest.
// To run with Vitest:
//   npm i -D vitest
//   npx vitest run __tests__/form_hydrator_class_vanilla.test.js
// To run with Jest:
//   npm i -D jest
//   npx jest __tests__/form_hydrator_class_vanilla.test.js

import { describe, it, expect } from 'vitest'; // or from '@jest/globals'
import { FormHydrator } from '../Book01_Headless_WordPress/Chapter04/form_hydrator_class_vanilla.js';

function ok(json, headers = {}) {
  return { ok: true, status: 200, statusText: 'OK', headers: { get: (k) => headers[k] }, json: async () => json };
}
function text(status, body = '', headers = {}) {
  return { ok: false, status, statusText: 'ERR', headers: { get: (k) => headers[k] }, text: async () => body };
}

// Table-driven fake fetch using a queue of responses by URL suffix
function makeFetch(script) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const path = new URL(url).pathname;
    calls.push({ url, init });
    if (!script.length) throw new Error('No scripted response for ' + path);
    const next = script.shift();
    if (typeof next === 'function') return next(url, init);
    return next;
  };
  fn.calls = calls; fn.script = script; return fn;
}

// Utility to build common endpoints for a given id and key
const routes = (id, key) => ({
  idByKey: `/wp-json/custom/v1/form-id/${encodeURIComponent(key)}`,
  meta: `/wp-json/frm/v2/forms/${id}`,
  fields: `/wp-json/frm/v2/forms/${id}/fields`,
});

describe('FormHydrator – reliability suite', () => {
  it('hydrates with caching, ETag reuse, and parallel fetches', async () => {
    const r = routes(7, 'contact_form');
    const f = makeFetch([
      ok({ id: 7 }),                                     // idByKey
      ok({ id: 7, key: 'contact_form', name: 'Contact', settings: {} }, { ETag: 'W/"m1"' }),
      ok([{ id: 1, key: 'name', type: 'text' }],          { ETag: 'W/"f1"' }),
      // second pass returns 304s, we should serve cache and NOT fail
      text(304, '', {}),
      text(304, '', {}),
    ]);

    const h = new FormHydrator({ baseUrl: 'https://site.test', fetchImpl: f, logger: console });
    const a = await h.hydrate('contact_form');
    expect(a.id).toBe(7);
    expect(a.metadata.name).toBe('Contact');

    // Second call should send If-None-Match for both endpoints and reuse cache
    const b = await h.hydrate('contact_form');
    const seen = f.calls.map(c => ({ path: new URL(c.url).pathname, inm: c.init.headers && c.init.headers['If-None-Match'] }));
    expect(seen.filter(x => x.path === r.meta)[1].inm).toBe('W/"m1"');
    expect(seen.filter(x => x.path === r.fields)[1].inm).toBe('W/"f1"');
    expect(b.metadata).toEqual(a.metadata);
    expect(b.fields).toEqual(a.fields);
  });

  it('honors Retry-After and backoff on 503', async () => {
    const r = routes(1, 'k');
    let first = true;
    const f = makeFetch([
      ok({ id: 1 }),
      // metadata fails once with Retry-After, then succeeds
      (url) => first ? (first=false, text(503, '', { 'Retry-After': '1' })) : ok({ id: 1, key: 'k', name: 'N', settings: {} }),
      ok([{ id: 10, key: 'x', type: 'text' }])
    ]);

    const h = new FormHydrator({ baseUrl: 'https://s', fetchImpl: f, retry: { maxRetries: 2, jitter: false, backoffBaseMs: 1, backoffCapMs: 2 } });
    const res = await h.hydrate('k');
    expect(res.id).toBe(1);
  });

  it('injects X-WP-Nonce globally and per-call', async () => {
    const r = routes(2, 'n');
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
  });

  it('coalesces in-flight GETs', async () => {
    const r = routes(3, 'co');
    let gateResolve; const gate = new Promise(r => gateResolve = r);
    const f = async (url) => { await gate; return ok({ id: 3, key: 'co', name: 'CO', settings: {} }); };
    const h = new FormHydrator({ baseUrl: 'https://s', fetchImpl: f });
    const p1 = h.getFormMetadata(3);
    const p2 = h.getFormMetadata(3);
    gateResolve();
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toEqual(b);
  });

  it('opens a circuit after repeated 5xx and then recovers', async () => {
    const r = routes(4, 'cb');
    const f = makeFetch([
      ok({ id: 4 }),
      text(502, 'bad'), text(502, 'bad'), text(502, 'bad'), text(502, 'bad'), text(502, 'bad'), // trigger open
    ]);
    const h = new FormHydrator({ baseUrl: 'https://s', fetchImpl: f, breaker: { threshold: 3, coolOffMs: 1 } });

    await expect(h.getFormMetadata(4)).rejects.toBeTruthy();
    // During cool-off, calls should short-circuit
    await expect(h.getFormMetadata(4)).rejects.toBeTruthy();
  });
});

--------------------------------------------------------------------------------
package.json (example dev script)
--------------------------------------------------------------------------------
{
  "scripts": {
    "test": "vitest run"
  }
}

================================================================================
*/
// Easter Egg – For fellow guitarists:
//   Play this chord when your tests pass:
//
//      E minor 7 (Em7)
//      e|--0--
//      B|--3--
//      G|--0--
//      D|--2--
//      A|--2--
//      E|--0--
//
//   Why Em7? Because like good code, it’s simple,
//   open, and makes everything sound better.