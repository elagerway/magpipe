/**
 * Maintenance Page
 * Shown when Supabase is unreachable. Fully self-contained — no external CSS or DB deps.
 * Matches the homepage dark hero aesthetic with gradient orbs and Magpipe bird mascot.
 */

export default class MaintenancePage {
  constructor() {
    this.retryInterval = null;
    this.abortController = null;
  }

  cleanup() {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  async render() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');

        .maint-root {
          position: fixed;
          inset: 0;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          color: #fff;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          z-index: 99999;
        }

        /* Gradient orbs */
        .maint-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(140px);
          pointer-events: none;
        }
        .maint-orb-1 {
          width: 900px;
          height: 900px;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);
          top: -350px;
          left: -250px;
          opacity: 0.5;
          animation: maint-float1 20s ease-in-out infinite;
        }
        .maint-orb-2 {
          width: 800px;
          height: 800px;
          background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #6366f1 100%);
          bottom: -300px;
          right: -200px;
          opacity: 0.5;
          animation: maint-float2 25s ease-in-out infinite;
        }
        .maint-orb-3 {
          width: 600px;
          height: 600px;
          background: linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #3b82f6 100%);
          top: 15%;
          right: 0%;
          opacity: 0.6;
          animation: maint-float3 18s ease-in-out infinite;
        }

        @keyframes maint-float1 {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(300px, 200px); }
          50% { transform: translate(500px, 400px); }
          75% { transform: translate(250px, 200px); }
        }
        @keyframes maint-float2 {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(-300px, -200px); }
          50% { transform: translate(-500px, -350px); }
          75% { transform: translate(-250px, -150px); }
        }
        @keyframes maint-float3 {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(-200px, -150px); }
          50% { transform: translate(-350px, 100px); }
          75% { transform: translate(-150px, 200px); }
        }

        /* Grid overlay */
        .maint-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 60px 60px;
          pointer-events: none;
        }

        /* Content */
        .maint-content {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 2rem;
          max-width: 560px;
        }

        .maint-bird {
          width: 120px;
          height: auto;
          animation: maint-bird-float 3s ease-in-out infinite;
          margin-bottom: 1.5rem;
        }
        @keyframes maint-bird-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }

        .maint-wordmark {
          font-size: 1.5rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          color: #fff;
          margin-bottom: 2rem;
        }

        .maint-heading {
          font-size: 2.5rem;
          font-weight: 700;
          color: #fff;
          margin: 0 0 1rem;
          line-height: 1.2;
        }

        .maint-subtitle {
          font-size: 1.1rem;
          color: rgba(255,255,255,0.7);
          max-width: 500px;
          line-height: 1.6;
          margin: 0 0 2.5rem;
        }

        /* Status indicator */
        .maint-status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.9rem;
          color: rgba(255,255,255,0.6);
        }
        .maint-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #f59e0b;
          animation: maint-pulse 2s ease-in-out infinite;
        }
        .maint-dot.connected {
          background: #10b981;
          animation: none;
        }
        @keyframes maint-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        .maint-status-link {
          display: inline-block;
          margin-top: 1.5rem;
          font-size: 0.85rem;
          color: rgba(255,255,255,0.4);
          text-decoration: none;
          transition: color 0.2s;
        }
        .maint-status-link:hover {
          color: rgba(255,255,255,0.7);
        }

        .maint-footer {
          position: absolute;
          bottom: 1.5rem;
          font-size: 0.8rem;
          color: rgba(255,255,255,0.3);
          z-index: 1;
        }

        @media (max-width: 600px) {
          .maint-heading { font-size: 1.8rem; }
          .maint-subtitle { font-size: 1rem; }
          .maint-bird { width: 90px; }
        }
      </style>

      <div class="maint-root">
        <div class="maint-orb maint-orb-1"></div>
        <div class="maint-orb maint-orb-2"></div>
        <div class="maint-orb maint-orb-3"></div>
        <div class="maint-grid"></div>

        <div class="maint-content">
          <img src="/magpipe-bird.png" alt="Magpipe" class="maint-bird" />
          <div class="maint-wordmark">MAGPIPE</div>
          <h1 class="maint-heading">We'll be right back</h1>
          <p class="maint-subtitle">
            We're experiencing a brief service interruption. Our systems are being
            restored &mdash; please check back in a few minutes.
          </p>
          <div class="maint-status">
            <span class="maint-dot" id="maint-dot"></span>
            <span id="maint-status-text">Connection issues identified. Check back for updates.</span>
          </div>
          <a
            href="https://status.supabase.com"
            target="_blank"
            rel="noopener noreferrer"
            class="maint-status-link"
          >
            Check system status &rarr;
          </a>
        </div>

        <div class="maint-footer">&copy; ${new Date().getFullYear()} Magpipe</div>
      </div>
    `;

    this.startHealthCheck();
  }

  startHealthCheck() {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const check = async () => {
      try {
        this.abortController = new AbortController();
        const res = await fetch(`${supabaseUrl}/rest/v1/`, {
          headers: { apikey: supabaseKey },
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          this.onRestored();
        }
      } catch {
        // Still down — keep waiting
      }
    };

    // First check after 30s, then every 30s
    this.retryInterval = setInterval(check, 30000);
  }

  onRestored() {
    this.cleanup();
    const dot = document.getElementById('maint-dot');
    const text = document.getElementById('maint-status-text');
    if (dot) dot.classList.add('connected');
    if (text) {
      text.textContent = 'Connection restored! Redirecting...';
      text.style.color = '#10b981';
    }
    setTimeout(() => {
      window.location.href = '/';
    }, 1500);
  }
}
