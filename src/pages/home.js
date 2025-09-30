/**
 * Home/Landing Page
 */

export default class HomePage {
  async render() {
    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container" style="padding-top: 4rem;">
        <div style="max-width: 800px; margin: 0 auto; text-align: center;">
          <h1 style="font-size: 3rem; margin-bottom: 1rem;">
            Meet Pat
          </h1>
          <p style="font-size: 1.25rem; color: var(--text-secondary); margin-bottom: 2rem;">
            Your personal AI assistant for calls and SMS messages
          </p>

          <div style="display: flex; gap: 1rem; justify-content: center; margin-bottom: 4rem;">
            <button id="get-started-btn" class="btn btn-primary" style="padding: 0.875rem 2rem; font-size: 1rem;">
              Get Started
            </button>
            <button id="sign-in-btn" class="btn btn-secondary" style="padding: 0.875rem 2rem; font-size: 1rem;">
              Sign In
            </button>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 2rem; margin-top: 4rem;">
            <div class="card">
              <h3>📞 Smart Call Handling</h3>
              <p class="text-muted">
                Pat answers calls, screens unknown callers, and maintains conversation context.
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
  }
}