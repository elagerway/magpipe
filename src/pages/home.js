/**
 * Home/Landing Page
 */

// Store the install prompt for later use
let deferredPrompt = null;

// Listen for the beforeinstallprompt event (Chrome/Android)
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Show install button if it exists
  const installBtn = document.getElementById('install-app-btn');
  if (installBtn) {
    installBtn.style.display = 'inline-flex';
  }
});

export default class HomePage {
  async render() {
    const appElement = document.getElementById('app');

    // Check if running as installed PWA
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;

    appElement.innerHTML = `
      <div class="container" style="padding-top: 4rem;">
        <div style="max-width: 800px; margin: 0 auto; text-align: center;">
          <h1 style="font-size: 3rem; margin-bottom: 1rem;">
            Solo Mobile
          </h1>
          <p style="font-size: 1.25rem; color: var(--text-secondary); margin-bottom: 2rem;">
            Your personal AI assistant for calls and SMS messages
          </p>

          <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; margin-bottom: 2rem;">
            <button id="get-started-btn" class="btn btn-primary" style="padding: 0.875rem 2rem; font-size: 1rem;">
              Get Started
            </button>
            <button id="sign-in-btn" class="btn btn-secondary" style="padding: 0.875rem 2rem; font-size: 1rem;">
              Sign In
            </button>
          </div>

          <!-- Install App Button - hidden if already installed -->
          ${!isStandalone ? `
          <div id="install-section" style="margin-bottom: 4rem;">
            <button id="install-app-btn" class="btn" style="
              padding: 0.75rem 1.5rem;
              font-size: 0.9rem;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              border: none;
              display: ${deferredPrompt ? 'inline-flex' : 'inline-flex'};
              align-items: center;
              gap: 0.5rem;
            ">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Install Mobile App
            </button>
          </div>
          ` : ''}

          <!-- iOS Install Instructions Modal -->
          <div id="ios-install-modal" style="
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 9999;
            align-items: center;
            justify-content: center;
            padding: 1rem;
          ">
            <div style="
              background: white;
              border-radius: 16px;
              padding: 2rem;
              max-width: 340px;
              text-align: center;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            ">
              <h3 style="margin-bottom: 1rem; font-size: 1.25rem;">Install Solo Mobile</h3>
              <p style="color: var(--text-secondary); margin-bottom: 1.5rem; font-size: 0.9rem;">
                To install this app on your iPhone:
              </p>
              <ol style="text-align: left; padding-left: 1.25rem; margin-bottom: 1.5rem; font-size: 0.9rem; line-height: 1.8;">
                <li>Tap the <strong>Share</strong> button <span style="display: inline-block; background: #007AFF; color: white; width: 24px; height: 24px; border-radius: 4px; text-align: center; line-height: 24px; font-size: 16px;">↑</span></li>
                <li>Scroll and tap <strong>"Add to Home Screen"</strong></li>
                <li>Tap <strong>"Add"</strong> in the top right</li>
              </ol>
              <button id="close-ios-modal" class="btn btn-primary" style="width: 100%;">Got it</button>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 2rem; margin-top: 4rem;">
            <div class="card">
              <h3>📞 Smart Call Handling</h3>
              <p class="text-muted">
                Answers calls, screens unknown callers, and maintains conversation context.
              </p>
            </div>

            <div class="card">
              <h3>💬 SMS Responses</h3>
              <p class="text-muted">
                Automatically respond to text messages with context-aware AI assistance.
              </p>
            </div>

            <div class="card">
              <h3>🎯 Contact Management</h3>
              <p class="text-muted">
                Whitelist trusted contacts and configure custom vetting strategies.
              </p>
            </div>

            <div class="card">
              <h3>🔒 Privacy First</h3>
              <p class="text-muted">
                Your data is encrypted and secure. You have full control over your information.
              </p>
            </div>
          </div>
        </div>
      </div>
    `;

    // Attach event listeners
    this.attachEventListeners();
  }

  attachEventListeners() {
    const getStartedBtn = document.getElementById('get-started-btn');
    const signInBtn = document.getElementById('sign-in-btn');
    const installBtn = document.getElementById('install-app-btn');
    const iosModal = document.getElementById('ios-install-modal');
    const closeModalBtn = document.getElementById('close-ios-modal');

    getStartedBtn.addEventListener('click', () => {
      if (window.router) {
        window.router.navigate('/signup');
      }
    });

    signInBtn.addEventListener('click', () => {
      if (window.router) {
        window.router.navigate('/login');
      }
    });

    // Install button click handler
    if (installBtn) {
      installBtn.addEventListener('click', async () => {
        // Check if we have a deferred prompt (Chrome/Android)
        if (deferredPrompt) {
          deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          console.log('Install prompt outcome:', outcome);
          deferredPrompt = null;
          if (outcome === 'accepted') {
            installBtn.style.display = 'none';
          }
        } else {
          // Check if iOS
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
          if (isIOS && iosModal) {
            iosModal.style.display = 'flex';
          } else {
            // Desktop or other - show generic instructions
            alert('To install: Open this site in Chrome or Safari, then use your browser\'s "Add to Home Screen" or "Install App" option.');
          }
        }
      });
    }

    // Close iOS modal
    if (closeModalBtn && iosModal) {
      closeModalBtn.addEventListener('click', () => {
        iosModal.style.display = 'none';
      });

      // Close on backdrop click
      iosModal.addEventListener('click', (e) => {
        if (e.target === iosModal) {
          iosModal.style.display = 'none';
        }
      });
    }
  }
}