/**
 * Comparison Page Styles
 * Reuses landing page visual patterns with comparison-specific components
 */

import { getPublicHeaderStyles } from '../../components/PublicHeader.js';
import { getPublicFooterStyles } from '../../components/PublicFooter.js';

export function getCompareStyles() {
  return `
    ${getPublicHeaderStyles()}
    ${getPublicFooterStyles()}

    .compare-page {
      min-height: 100vh;
      background: var(--bg-primary);
    }

    /* ========== Hero Section (reuses landing patterns) ========== */
    .cp-hero {
      position: relative;
      min-height: 60vh;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 10rem 1.5rem 6rem;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
      overflow: hidden;
    }

    .cp-hero .hero-decoration {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .cp-hero .hero-gradient-orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(140px);
      opacity: 0.5;
    }

    .cp-hero .hero-orb-1 {
      width: 900px;
      height: 900px;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);
      top: -350px;
      left: -250px;
      animation: cpFloat1 20s ease-in-out infinite;
    }

    .cp-hero .hero-orb-2 {
      width: 800px;
      height: 800px;
      background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #6366f1 100%);
      bottom: -300px;
      right: -200px;
      animation: cpFloat2 25s ease-in-out infinite;
    }

    .cp-hero .hero-orb-3 {
      width: 600px;
      height: 600px;
      background: linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #3b82f6 100%);
      top: 15%;
      right: 0%;
      opacity: 0.6;
      animation: cpFloat3 18s ease-in-out infinite;
    }

    @keyframes cpFloat1 {
      0%, 100% { transform: translate(0, 0); }
      25% { transform: translate(300px, 200px); }
      50% { transform: translate(500px, 400px); }
      75% { transform: translate(250px, 200px); }
    }

    @keyframes cpFloat2 {
      0%, 100% { transform: translate(0, 0); }
      25% { transform: translate(-300px, -200px); }
      50% { transform: translate(-500px, -350px); }
      75% { transform: translate(-250px, -150px); }
    }

    @keyframes cpFloat3 {
      0%, 100% { transform: translate(0, 0); }
      25% { transform: translate(-200px, -150px); }
      50% { transform: translate(-350px, 100px); }
      75% { transform: translate(-150px, 200px); }
    }

    .cp-hero .hero-grid {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
      background-size: 60px 60px;
    }

    .cp-hero-content {
      position: relative;
      z-index: 1;
      max-width: 800px;
    }

    .cp-hero-badge {
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

    .cp-hero h1 {
      font-size: 3.5rem;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.15;
      margin-bottom: 1.5rem;
      letter-spacing: -0.03em;
    }

    .cp-hero-subtitle {
      font-size: 1.25rem;
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 2.5rem;
      line-height: 1.6;
    }

    .cp-hero-cta {
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

    /* ========== Section Headers ========== */
    .cp-section-header {
      text-align: center;
      margin-bottom: 3rem;
    }

    .cp-section-header h2 {
      font-size: 2.25rem;
      font-weight: 700;
      margin-bottom: 1rem;
      color: var(--text-primary);
    }

    .cp-section-header p {
      font-size: 1.15rem;
      color: var(--text-secondary);
      max-width: 650px;
      margin: 0 auto;
    }

    /* ========== Verdict Section ========== */
    .cp-verdict-section {
      padding: 4rem 1.5rem;
      max-width: 800px;
      margin: 0 auto;
    }

    .cp-verdict-card {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(16, 185, 129, 0.05) 100%);
      border: 1px solid rgba(99, 102, 241, 0.2);
      border-radius: 1rem;
      padding: 2.5rem;
      text-align: center;
    }

    .cp-verdict-icon {
      width: 56px;
      height: 56px;
      margin: 0 auto 1.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .cp-verdict-icon svg {
      width: 48px;
      height: 48px;
      color: var(--primary-color);
    }

    .cp-verdict-card h2 {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 1rem;
      color: var(--text-primary);
    }

    .cp-verdict-card p {
      font-size: 1.05rem;
      color: var(--text-secondary);
      line-height: 1.7;
      margin: 0;
    }

    /* ========== Feature Comparison Table ========== */
    .cp-features-section {
      padding: 4rem 1.5rem 6rem;
      max-width: 900px;
      margin: 0 auto;
    }

    .cp-table-wrapper {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      border-radius: 1rem;
      border: 1px solid var(--border-color);
    }

    .cp-comparison-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 580px;
    }

    .cp-comparison-table thead {
      background: var(--bg-secondary);
    }

    .cp-comparison-table th {
      padding: 1rem 1.25rem;
      text-align: center;
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text-primary);
      border-bottom: 2px solid var(--border-color);
    }

    .cp-comparison-table th.cp-feature-col {
      text-align: left;
      width: 45%;
    }

    .cp-comparison-table th.cp-magpipe-col {
      background: rgba(99, 102, 241, 0.08);
      width: 27.5%;
    }

    .cp-comparison-table th.cp-competitor-col {
      width: 27.5%;
    }

    .cp-comparison-table td {
      padding: 0.875rem 1.25rem;
      text-align: center;
      border-bottom: 1px solid var(--border-color);
      font-size: 0.9rem;
      color: var(--text-primary);
    }

    .cp-comparison-table td.cp-feature-name {
      text-align: left;
      font-weight: 500;
    }

    .cp-comparison-table td.cp-magpipe-col {
      background: rgba(99, 102, 241, 0.04);
    }

    .cp-comparison-table tr:last-child td {
      border-bottom: none;
    }

    .cp-comparison-table tr:hover {
      background: rgba(0, 0, 0, 0.02);
    }

    .cp-comparison-table tr:hover td.cp-magpipe-col {
      background: rgba(99, 102, 241, 0.08);
    }

    .cp-feature-note {
      display: block;
      font-size: 0.8rem;
      color: var(--text-secondary);
      font-weight: 400;
      margin-top: 0.2rem;
    }

    .cp-check svg {
      width: 22px;
      height: 22px;
      color: #10b981;
    }

    .cp-cross svg {
      width: 22px;
      height: 22px;
      color: #ef4444;
    }

    .cp-text-value {
      font-size: 0.85rem;
      color: var(--text-secondary);
    }

    /* ========== Pricing Comparison ========== */
    .cp-pricing-section {
      padding: 6rem 1.5rem;
      background: var(--bg-secondary);
    }

    .cp-pricing-cards {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2rem;
      max-width: 900px;
      margin: 0 auto;
    }

    .cp-pricing-card {
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 1rem;
      padding: 2.5rem 2rem;
      text-align: center;
      position: relative;
    }

    .cp-pricing-highlighted {
      border-color: var(--primary-color);
      box-shadow: 0 4px 24px rgba(99, 102, 241, 0.15);
    }

    .cp-pricing-badge {
      position: absolute;
      top: -12px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--primary-color);
      color: white;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.25rem 1rem;
      border-radius: 9999px;
      letter-spacing: 0.05em;
    }

    .cp-pricing-card-header h3 {
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 0.25rem;
      color: var(--text-primary);
    }

    .cp-pricing-model {
      font-size: 0.875rem;
      color: var(--text-secondary);
    }

    .cp-pricing-highlight {
      font-size: 2.5rem;
      font-weight: 700;
      color: var(--primary-color);
      margin: 1.5rem 0;
    }

    .cp-pricing-card:not(.cp-pricing-highlighted) .cp-pricing-highlight {
      color: var(--text-primary);
    }

    .cp-pricing-details {
      list-style: none;
      padding: 0;
      margin: 0 0 2rem;
      text-align: left;
    }

    .cp-pricing-details li {
      padding: 0.5rem 0;
      font-size: 0.9rem;
      color: var(--text-secondary);
      border-bottom: 1px solid var(--border-color);
    }

    .cp-pricing-details li:last-child {
      border-bottom: none;
    }

    .cp-pricing-card .btn {
      width: 100%;
    }

    /* ========== Differentiators ========== */
    .cp-differentiators-section {
      padding: 6rem 1.5rem;
      max-width: 1000px;
      margin: 0 auto;
    }

    .cp-diff-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 2rem;
    }

    .cp-diff-card {
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 1rem;
      padding: 2rem;
      transition: box-shadow 0.2s, transform 0.2s;
    }

    .cp-diff-card:hover {
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
      transform: translateY(-4px);
    }

    .cp-diff-number {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #4f7df3 0%, #6f8ef5 50%, #8b9ff7 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      font-weight: 700;
      color: white;
      margin-bottom: 1rem;
    }

    .cp-diff-card h3 {
      font-size: 1.2rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      color: var(--text-primary);
    }

    .cp-diff-card p {
      font-size: 0.95rem;
      color: var(--text-secondary);
      line-height: 1.6;
      margin: 0;
    }

    /* ========== FAQ (reuses landing page pattern) ========== */
    .cp-faq-section {
      padding: 6rem 1.5rem;
      max-width: 800px;
      margin: 0 auto;
    }

    .cp-faq-list {
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
    .cp-final-cta {
      position: relative;
      text-align: center;
      padding: 6rem 1.5rem;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
      overflow: hidden;
    }

    .cp-final-cta .cta-decoration {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .cp-final-cta .cta-orb-1 {
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

    .cp-final-cta .cta-orb-2 {
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

    .cp-final-cta .cta-grid {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
      background-size: 60px 60px;
    }

    .cp-cta-content {
      position: relative;
      z-index: 1;
    }

    .cp-final-cta h2 {
      font-size: 2.5rem;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 1rem;
    }

    .cp-final-cta p {
      font-size: 1.2rem;
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 2rem;
    }

    .cp-cta-buttons {
      display: flex;
      gap: 1rem;
      justify-content: center;
      flex-wrap: wrap;
    }

    /* ========== Mobile Responsive ========== */
    @media (max-width: 768px) {
      .cp-hero {
        min-height: auto;
        padding: 7rem 1.5rem 4rem;
      }

      .cp-hero h1 {
        font-size: 2.25rem;
      }

      .cp-hero-subtitle {
        font-size: 1.05rem;
      }

      .cp-hero .hero-orb-1 {
        width: 500px;
        height: 500px;
        top: -200px;
        left: -200px;
      }

      .cp-hero .hero-orb-2 {
        width: 450px;
        height: 450px;
        bottom: -200px;
        right: -150px;
      }

      .cp-hero .hero-orb-3 {
        width: 350px;
        height: 350px;
        opacity: 0.4;
      }

      .cp-section-header h2,
      .cp-final-cta h2 {
        font-size: 1.75rem;
      }

      .cp-verdict-section,
      .cp-features-section {
        padding: 3rem 1.5rem;
      }

      .cp-pricing-cards {
        grid-template-columns: 1fr;
      }

      .cp-diff-grid {
        grid-template-columns: 1fr;
      }

      .cp-differentiators-section,
      .cp-pricing-section,
      .cp-faq-section {
        padding: 4rem 1.5rem;
      }

      .cp-pricing-highlight {
        font-size: 2rem;
      }
    }

    @media (max-width: 480px) {
      .cp-hero {
        padding: 5rem 1rem 3rem;
      }

      .cp-hero h1 {
        font-size: 1.75rem;
      }

      .cp-hero-subtitle {
        font-size: 1rem;
      }

      .cp-hero-cta {
        flex-direction: column;
        width: 100%;
      }

      .cp-hero-cta .btn {
        width: 100%;
      }

      .cp-section-header h2,
      .cp-final-cta h2 {
        font-size: 1.5rem;
      }

      .cp-verdict-card {
        padding: 1.5rem;
      }

      .cp-verdict-section,
      .cp-features-section,
      .cp-differentiators-section,
      .cp-pricing-section,
      .cp-faq-section,
      .cp-final-cta {
        padding: 3rem 1rem;
      }

      .cp-pricing-highlight {
        font-size: 1.75rem;
      }

      .cp-comparison-table th,
      .cp-comparison-table td {
        padding: 0.75rem 0.75rem;
        font-size: 0.85rem;
      }
    }
  `;
}
