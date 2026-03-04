/**
 * Landing Page Shared Styles
 * Adapted from home.js patterns for industry/use-case landing pages
 */

import { getPublicHeaderStyles } from '../../components/PublicHeader.js';
import { getPublicFooterStyles } from '../../components/PublicFooter.js';

export function getLandingStyles() {
  return `
    ${getPublicHeaderStyles()}
    ${getPublicFooterStyles()}

    .landing-page {
      min-height: 100vh;
      background: var(--bg-primary);
    }

    /* ========== Hero Section ========== */
    .lp-hero {
      position: relative;
      min-height: 70vh;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 10rem 1.5rem 6rem;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
      overflow: hidden;
    }

    .lp-hero .hero-decoration {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .lp-hero .hero-gradient-orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(140px);
      opacity: 0.5;
    }

    .lp-hero .hero-orb-1 {
      width: 900px;
      height: 900px;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);
      top: -350px;
      left: -250px;
      animation: lpFloat1 20s ease-in-out infinite;
    }

    .lp-hero .hero-orb-2 {
      width: 800px;
      height: 800px;
      background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #6366f1 100%);
      bottom: -300px;
      right: -200px;
      animation: lpFloat2 25s ease-in-out infinite;
    }

    .lp-hero .hero-orb-3 {
      width: 600px;
      height: 600px;
      background: linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #3b82f6 100%);
      top: 15%;
      right: 0%;
      opacity: 0.6;
      animation: lpFloat3 18s ease-in-out infinite;
    }

    @keyframes lpFloat1 {
      0%, 100% { transform: translate(0, 0); }
      25% { transform: translate(300px, 200px); }
      50% { transform: translate(500px, 400px); }
      75% { transform: translate(250px, 200px); }
    }

    @keyframes lpFloat2 {
      0%, 100% { transform: translate(0, 0); }
      25% { transform: translate(-300px, -200px); }
      50% { transform: translate(-500px, -350px); }
      75% { transform: translate(-250px, -150px); }
    }

    @keyframes lpFloat3 {
      0%, 100% { transform: translate(0, 0); }
      25% { transform: translate(-200px, -150px); }
      50% { transform: translate(-350px, 100px); }
      75% { transform: translate(-150px, 200px); }
    }

    .lp-hero .hero-grid {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
      background-size: 60px 60px;
    }

    .lp-hero-content {
      position: relative;
      z-index: 1;
      max-width: 800px;
    }

    .lp-hero-badge {
      display: inline-block;
      font-size: 0.8rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.9);
      background: rgba(99, 102, 241, 0.3);
      border: 1px solid rgba(99, 102, 241, 0.4);
      border-radius: 9999px;
      padding: 0.4rem 1.2rem;
      margin-bottom: 1.5rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .lp-hero h1 {
      font-size: 3.5rem;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.15;
      margin-bottom: 1.5rem;
      letter-spacing: -0.03em;
    }

    .lp-hero-subtitle {
      font-size: 1.25rem;
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 2.5rem;
      line-height: 1.6;
    }

    .lp-hero-cta {
      display: flex;
      gap: 1rem;
      justify-content: center;
      flex-wrap: wrap;
    }

    .btn-cta-primary {
      background: #ffffff;
      color: #0f172a;
      font-weight: 600;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn-cta-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(255, 255, 255, 0.25);
    }

    .btn-cta-secondary {
      background: transparent;
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.3);
      transition: border-color 0.2s, background 0.2s;
    }
    .btn-cta-secondary:hover {
      border-color: rgba(255, 255, 255, 0.6);
      background: rgba(255, 255, 255, 0.1);
    }

    .btn-lg {
      padding: 1rem 2rem;
      font-size: 1rem;
    }

    /* ========== Benefits Section ========== */
    .lp-benefits {
      padding: 6rem 1.5rem;
      max-width: 1200px;
      margin: 0 auto;
    }

    .lp-section-header {
      text-align: center;
      margin-bottom: 3.5rem;
    }

    .lp-section-header h2 {
      font-size: 2.25rem;
      font-weight: 700;
      margin-bottom: 1rem;
      color: var(--text-primary);
    }

    .lp-section-header p {
      font-size: 1.15rem;
      color: var(--text-secondary);
      max-width: 650px;
      margin: 0 auto;
    }

    .lp-benefits-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 2rem;
    }

    .lp-benefit-card {
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 1rem;
      padding: 2rem;
      transition: box-shadow 0.2s, transform 0.2s;
    }

    .lp-benefit-card:hover {
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
      transform: translateY(-4px);
    }

    .lp-benefit-icon {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 1.25rem;
    }

    .lp-benefit-icon svg {
      width: 24px;
      height: 24px;
      color: var(--primary-color);
    }

    .lp-benefit-card h3 {
      font-size: 1.2rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      color: var(--text-primary);
    }

    .lp-benefit-card p {
      font-size: 0.95rem;
      color: var(--text-secondary);
      line-height: 1.6;
      margin: 0;
    }

    /* ========== How It Works ========== */
    .lp-how-it-works {
      padding: 6rem 1.5rem;
      background: var(--bg-secondary);
    }

    .lp-how-steps {
      display: flex;
      align-items: flex-start;
      justify-content: center;
      gap: 1rem;
      max-width: 900px;
      margin: 0 auto;
      flex-wrap: wrap;
    }

    .lp-how-step {
      text-align: center;
      flex: 1;
      min-width: 200px;
      max-width: 280px;
    }

    .lp-step-number {
      width: 56px;
      height: 56px;
      background: linear-gradient(135deg, #4f7df3 0%, #6f8ef5 50%, #8b9ff7 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      font-weight: 700;
      color: white;
      margin: 0 auto 1.25rem;
    }

    .lp-how-step h3 {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
    }

    .lp-how-step p {
      font-size: 0.95rem;
      color: var(--text-secondary);
      margin: 0;
    }

    .lp-step-connector {
      width: 60px;
      height: 2px;
      background: var(--border-color);
      margin-top: 28px;
    }

    /* ========== Features Section ========== */
    .lp-features {
      padding: 6rem 1.5rem;
      max-width: 1200px;
      margin: 0 auto;
    }

    .lp-features-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 2rem;
    }

    .lp-feature-card {
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 1rem;
      padding: 2rem;
      transition: box-shadow 0.2s, transform 0.2s;
    }

    .lp-feature-card:hover {
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
      transform: translateY(-4px);
    }

    .lp-feature-icon {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 1.25rem;
    }

    .lp-feature-icon svg {
      width: 24px;
      height: 24px;
      color: var(--primary-color);
    }

    .lp-feature-card h3 {
      font-size: 1.2rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      color: var(--text-primary);
    }

    .lp-feature-card p {
      font-size: 0.95rem;
      color: var(--text-secondary);
      line-height: 1.6;
      margin: 0;
    }

    /* ========== Pricing Preview ========== */
    .lp-pricing {
      padding: 6rem 1.5rem;
      text-align: center;
      background: var(--bg-secondary);
    }

    .lp-pricing-content {
      max-width: 800px;
      margin: 0 auto;
    }

    .lp-pricing-content h2 {
      font-size: 2.25rem;
      font-weight: 700;
      margin-bottom: 1rem;
    }

    .lp-pricing-content > p {
      font-size: 1.15rem;
      color: var(--text-secondary);
      margin-bottom: 3rem;
    }

    .lp-pricing-highlights {
      display: flex;
      justify-content: center;
      gap: 3rem;
      margin-bottom: 2.5rem;
      flex-wrap: wrap;
    }

    .lp-pricing-item {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .lp-pricing-amount {
      font-size: 2.5rem;
      font-weight: 700;
      color: var(--primary-color);
    }

    .lp-pricing-label {
      font-size: 0.9rem;
      color: var(--text-secondary);
      margin-top: 0.25rem;
    }

    /* ========== FAQ Section ========== */
    .lp-faq {
      padding: 6rem 1.5rem;
      max-width: 800px;
      margin: 0 auto;
    }

    .lp-faq-list {
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    .lp-faq-item {
      border-bottom: 1px solid var(--border-color);
    }

    .lp-faq-item:first-child {
      border-top: 1px solid var(--border-color);
    }

    .lp-faq-question {
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.25rem 0;
      background: none;
      border: none;
      cursor: pointer;
      text-align: left;
      font-size: 1.05rem;
      font-weight: 600;
      color: var(--text-primary);
      gap: 1rem;
    }

    .lp-faq-question:hover {
      color: var(--primary-color);
    }

    .lp-faq-chevron {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
      transition: transform 0.2s;
      color: var(--text-secondary);
    }

    .lp-faq-item.open .lp-faq-chevron {
      transform: rotate(180deg);
    }

    .lp-faq-answer {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease, padding 0.3s ease;
    }

    .lp-faq-item.open .lp-faq-answer {
      max-height: 500px;
      padding-bottom: 1.25rem;
    }

    .lp-faq-answer p {
      font-size: 0.95rem;
      color: var(--text-secondary);
      line-height: 1.7;
      margin: 0;
    }

    /* ========== Final CTA Section ========== */
    .lp-final-cta {
      position: relative;
      text-align: center;
      padding: 6rem 1.5rem;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
      overflow: hidden;
    }

    .lp-final-cta .cta-decoration {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .lp-final-cta .cta-orb-1 {
      position: absolute;
      width: 350px;
      height: 350px;
      border-radius: 50%;
      filter: blur(80px);
      opacity: 0.4;
      background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%);
      top: -150px;
      right: 10%;
    }

    .lp-final-cta .cta-orb-2 {
      position: absolute;
      width: 250px;
      height: 250px;
      border-radius: 50%;
      filter: blur(80px);
      opacity: 0.4;
      background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%);
      bottom: -100px;
      left: 15%;
    }

    .lp-final-cta .cta-grid {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
      background-size: 60px 60px;
    }

    .lp-cta-content {
      position: relative;
      z-index: 1;
    }

    .lp-final-cta h2 {
      font-size: 2.5rem;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 1rem;
    }

    .lp-final-cta p {
      font-size: 1.2rem;
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 2rem;
    }

    .lp-cta-buttons {
      display: flex;
      gap: 1rem;
      justify-content: center;
      flex-wrap: wrap;
    }

    /* ========== Mobile Responsive ========== */
    @media (max-width: 768px) {
      .lp-hero {
        min-height: auto;
        padding: 7rem 1.5rem 4rem;
      }

      .lp-hero h1 {
        font-size: 2.25rem;
      }

      .lp-hero-subtitle {
        font-size: 1.05rem;
      }

      .lp-hero .hero-orb-1 {
        width: 500px;
        height: 500px;
        top: -200px;
        left: -200px;
      }

      .lp-hero .hero-orb-2 {
        width: 450px;
        height: 450px;
        bottom: -200px;
        right: -150px;
      }

      .lp-hero .hero-orb-3 {
        width: 350px;
        height: 350px;
        opacity: 0.4;
      }

      .lp-section-header h2,
      .lp-pricing-content h2,
      .lp-final-cta h2 {
        font-size: 1.75rem;
      }

      .lp-benefits-grid,
      .lp-features-grid {
        grid-template-columns: 1fr;
      }

      .lp-step-connector {
        display: none;
      }

      .lp-how-steps {
        flex-direction: column;
        align-items: center;
      }

      .lp-pricing-highlights {
        gap: 2rem;
      }

      .lp-pricing-amount {
        font-size: 2rem;
      }

      .lp-benefits,
      .lp-features,
      .lp-faq {
        padding: 4rem 1.5rem;
      }

      .lp-how-it-works,
      .lp-pricing {
        padding: 4rem 1.5rem;
      }
    }

    @media (max-width: 480px) {
      .lp-hero {
        padding: 5rem 1rem 3rem;
      }

      .lp-hero h1 {
        font-size: 1.75rem;
      }

      .lp-hero-subtitle {
        font-size: 1rem;
      }

      .lp-hero-cta {
        flex-direction: column;
        width: 100%;
      }

      .lp-hero-cta .btn {
        width: 100%;
      }

      .lp-section-header h2,
      .lp-pricing-content h2,
      .lp-final-cta h2 {
        font-size: 1.5rem;
      }

      .lp-benefits,
      .lp-features,
      .lp-faq,
      .lp-how-it-works,
      .lp-pricing,
      .lp-final-cta {
        padding: 3rem 1rem;
      }

      .lp-pricing-highlights {
        flex-direction: column;
        gap: 1.5rem;
      }

      .lp-pricing-amount {
        font-size: 1.75rem;
      }
    }
  `;
}
