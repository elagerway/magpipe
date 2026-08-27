const CURRENT_HASH = typeof __BUILD_HASH__ !== 'undefined' ? __BUILD_HASH__ : null;
const POLL_INTERVAL = 60_000; // 60 seconds

let intervalId = null;

export function startVersionCheck(isAuthenticated) {
  if (!CURRENT_HASH || intervalId) return;

  // Initial check after 5s delay
  setTimeout(() => {
    if (isAuthenticated()) checkVersion();
  }, 5000);

  intervalId = setInterval(() => {
    if (!isAuthenticated()) return;
    checkVersion();
  }, POLL_INTERVAL);
}

async function checkVersion() {
  try {
    const resp = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!resp.ok) return;
    const { hash } = await resp.json();
    if (hash && hash !== CURRENT_HASH) {
      clearInterval(intervalId);
      showReloadBanner();
    }
  } catch {
    // Network error — ignore, will retry next poll
  }
}

function showReloadBanner() {
  if (document.getElementById('version-reload-banner')) return;

  const overlay = document.createElement('div');
  overlay.id = 'version-reload-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.3);';

  const banner = document.createElement('div');
  banner.id = 'version-reload-banner';
  banner.style.cssText = [
    'position:fixed;top:0;left:0;right:0;z-index:2147483647',
    'display:flex;align-items:center;justify-content:center;gap:12px',
    'padding:14px 20px',
    'background:#4f46e5;color:#fff',
    'font-family:-apple-system,BlinkMacSystemFont,sans-serif',
    'font-size:14px;font-weight:500',
    'box-shadow:0 2px 8px rgba(0,0,0,0.2)',
  ].join(';');

  banner.innerHTML = `
    <span>A new version of Magpipe is available.</span>
    <button id="version-reload-btn" style="
      background:#fff;color:#4f46e5;border:none;border-radius:6px;
      padding:6px 16px;font-size:13px;font-weight:600;cursor:pointer;
    ">Reload</button>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(banner);

  document.getElementById('version-reload-btn').addEventListener('click', () => {
    window.location.reload();
  });
}
