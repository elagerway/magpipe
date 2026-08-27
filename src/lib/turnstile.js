/**
 * Cloudflare Turnstile CAPTCHA helper
 * Loads the script on demand and renders the widget into a container.
 */

// trim(): a trailing newline in the env var (e.g. pasted into Vercel) makes
// turnstile.render() reject the sitekey and silently kills all signups
const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || '').trim() || undefined;
let scriptLoaded = false;

/** Load the Turnstile script once */
function loadScript() {
  if (scriptLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => { scriptLoaded = true; resolve(); };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

/**
 * Render a Turnstile widget into a container element.
 * @param {string} containerId - DOM id of the container div
 * @returns {Promise<string>} widgetId for later use
 */
export async function renderTurnstile(containerId) {
  if (!SITE_KEY) {
    console.warn('Turnstile site key not configured');
    return null;
  }
  await loadScript();
  return window.turnstile.render(`#${containerId}`, {
    sitekey: SITE_KEY,
    theme: 'light',
  });
}

/**
 * Get the current Turnstile token from a widget.
 * @param {string} widgetId - widget ID returned by renderTurnstile
 * @returns {string|null} token or null
 */
export function getTurnstileToken(widgetId) {
  if (widgetId != null && window.turnstile) {
    return window.turnstile.getResponse(widgetId) || null;
  }
  return null;
}

/**
 * Reset the Turnstile widget (e.g. after a failed submission).
 * @param {string} widgetId
 */
export function resetTurnstile(widgetId) {
  if (widgetId != null && window.turnstile) {
    window.turnstile.reset(widgetId);
  }
}
