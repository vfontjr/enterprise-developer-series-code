// Reusable ESM bootstrap for all pages
// - Discovers forms by [data-form-key]
// - Safe to run before WordPress exists
// - Adds minimal diagnostics without spamming the console

import { FormHydrator } from '/assets/js/form_hydrator_class_vanilla.js?v=3003';

// ---- Site-wide config (adjust as you deploy) ----
const CONFIG = {
  baseUrl: 'https://masterminds-enterprise-developer-series.com',
  // When WP is installed, expose window.wpApiSettings.nonce (or inject server-side).
  wpNonce: globalThis?.wpApiSettings?.nonce,
  // Form keys to preload on specific pages (optional)
  preloadKeys: [], // e.g., ['newsletter_form', 'contact_form']
  // Set to true to see timing + status logs
  debug: false,
};

// Tiny logger that you can safely leave on in production
const log = (level, ...args) => CONFIG.debug && console[level]('[Hydrator]', ...args);

// One shared instance for the whole site
const hydrator = new FormHydrator({
  baseUrl: CONFIG.baseUrl,
  wpNonce: CONFIG.wpNonce,
  logger: CONFIG.debug ? console : { debug(){}, info(){}, warn(){}, error(){} },
  // Conservative retries; you can tune these later
  retry: { maxRetries: 2, backoffBaseMs: 250, backoffCapMs: 4000 },
  cacheTTLms: { idByKey: 120_000, metadata: 60_000, fields: 30_000 },
});

// Optional preload to warm caches (safe even pre-WP; will simply warn on 404)
(async () => {
  for (const key of CONFIG.preloadKeys) {
    try {
      await hydrator.preload(key, {
        onRequest: e => log('debug', 'preload', e.path, e.phase, e.status ?? '—'),
      });
      log('info', 'preloaded', key);
    } catch (err) {
      log('warn', 'preload failed', key, err?.code || err?.status || err?.message);
    }
  }
})();

// Hydrate any element with [data-form-key], e.g. the contact page CTA
// <div id="contact-cta" data-form-key="contact_form"></div>
export async function hydrateFormsInDOM(root = document) {
  const targets = [...root.querySelectorAll('[data-form-key]')];
  if (!targets.length) return;

  for (const el of targets) {
    const key = el.getAttribute('data-form-key');
    try {
      const payload = await hydrator.hydrate(key, {
        onRequest: e => log('debug', 'hydrate', key, e.phase, e.path, e.status ?? '—'),
      });
      // At this point you have payload: { id, metadata, fields, fieldsRaw }
      // Render your form UI however you like. For now, show a simple proof.
      el.dataset.formId = String(payload.id);
      el.dataset.hydrated = 'true';
      log('info', `hydrated ${key} → id=${payload.id}`);
      // TODO: call your real renderer here.
      // renderForm(el, payload);
    } catch (err) {
      log('warn', `hydrate failed for ${key}`, {
        code: err?.code, status: err?.status, message: err?.message
      });
      // Non-fatal: leave a marker for monitoring/UX fallback
      el.dataset.hydrated = 'error';
    }
  }
}

// Auto-run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => hydrateFormsInDOM());
} else {
  hydrateFormsInDOM();
}

// Export instance for other modules/pages that want direct access
export { hydrator };