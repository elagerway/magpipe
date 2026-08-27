/**
 * Sentry error monitoring (frontend).
 *
 * Additive to the existing log-error → system_error_logs → SMS/Slack paging
 * pipeline: Sentry is the developer-facing aggregation/triage layer, the custom
 * pipeline stays the customer-impact pager. Both can fire for the same error.
 *
 * No-op when VITE_SENTRY_DSN is unset, so dev and preview builds (and prod
 * before the DSN is configured) run untouched.
 */

import * as Sentry from '@sentry/browser';

const DSN = import.meta.env.VITE_SENTRY_DSN;
let initialized = false;

export function initSentry() {
  if (initialized || !DSN) return;
  initialized = true;

  Sentry.init({
    dsn: DSN,
    // __BUILD_HASH__ is injected by vite.config.js (also written to version.json).
    // Matches uploaded source maps when SENTRY_AUTH_TOKEN is configured at build.
    release: typeof __BUILD_HASH__ !== 'undefined' ? __BUILD_HASH__ : undefined,
    environment: import.meta.env.MODE === 'production' ? 'production' : 'development',
    // Don't ship IPs / request bodies by default — this is a comms platform with
    // phone numbers and message content in flight. We attach only a user id below.
    sendDefaultPii: false,
    // Error monitoring only for now; no perf tracing (avoids overhead + sampling cost).
    tracesSampleRate: 0,
    // Filter noise that isn't actionable.
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications.',
      'Non-Error promise rejection captured',
      'Load failed',
      'NetworkError when attempting to fetch resource.',
      'Failed to fetch',
    ],
    beforeSend(event) {
      // Drop events from browser extensions (frames pointing at chrome-extension:// etc.)
      const frames = event.exception?.values?.[0]?.stacktrace?.frames || [];
      if (frames.some((f) => /^(chrome-extension|moz-extension|safari-web-extension):\/\//.test(f.filename || ''))) {
        return null;
      }
      return event;
    },
  });
}

/** Attach the signed-in user (id only — no email/phone) for triage. */
export function setSentryUser(user) {
  if (!DSN) return;
  Sentry.setUser(user?.id ? { id: user.id } : null);
}

/** Manually capture a handled error with optional context. */
export function captureException(error, context) {
  if (!DSN) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
