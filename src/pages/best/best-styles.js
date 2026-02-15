/**
 * Best AI for X Listicle Page Styles
 * Reuses landing/compare page visual patterns with listicle-specific components
 */

import { getPublicHeaderStyles } from '../../components/PublicHeader.js';
import { getPublicFooterStyles } from '../../components/PublicFooter.js';

export function getBestStyles() {
  return `
    ${getPublicHeaderStyles()}
    ${getPublicFooterStyles()}

    .best-page {
      min-height: 100vh;
      background: var(--bg-primary);
    }

    /* ========== Hero Section ========== */
    .bp-hero {
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

    .bp-hero .hero-decoration {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .bp-hero .hero-gradient-orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(140px);
      opacity: 0.5;
    }

    .bp-hero .hero-orb-1 {
      width: 900px;
      height: 900px;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);
      top: -350px;
      left: -250px;
      animation: bpFloat1 20s ease-in-out infinite;
    }

    .bp-hero .hero-orb-2 {
      width: 800px;
      height: 800px;
      background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 50%, #6366f1 100%);
      bottom: -300px;
      right: -200px;
      animation: bpFloat2 25s ease-in-out infinite;
    }

    .bp-hero .hero-orb-3 {
      width: 600px;
      height: 600px;
      background: linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #3b82f6 100%);
      top: 15%;
      right: 0%;
      opacity: 0.6;
      animation: bpFloat3 18s ease-in-out infinite;
    }

    @keyframes bpFloat1 {
      0%, 100% { transform: translate(0, 0); }
      25% { transform: translate(300px, 200px); }
      50% { transform: translate(500px, 400px); }
      75% { transform: translate(250px, 200px); }
    }

    @keyframes bpFloat2 {
      0%, 100% { transform: translate(0, 0); }
      25% { transform: translate(-300px, -200px); }
      50% { transform: translate(-500px, -350px); }
      75% { transform: translate(-250px, -150px); }
    }

    @keyframes bpFloat3 {
      0%, 100% { transform: translate(0, 0); }
      25% { transform: translate(-200px, -150px); }
      50% { transform: translate(-350px, 100px); }
      75% { transform: translate(-150px, 200px); }
    }

    .bp-hero .hero-grid {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
      background-size: 60px 60px;
    }

    .bp-hero-content {
      position: relative;
      z-index: 1;
      max-width: 850px;
    }

    .bp-hero-badge {
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

    .bp-hero h1 {
      font-size: 3.2rem;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.15;
      margin-bottom: 1.5rem;
      letter-spacing: -0.03em;
    }

    .bp-hero-subtitle {
      font-size: 1.2rem;
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 1.5rem;
      line-height: 1.6;
      max-width: 700px;
      margin-left: auto;
      margin-right: auto;
    }

    .bp-hero-description {
      font-size: 1rem;
      color: rgba(255, 255, 255, 0.55);
      margin-bottom: 2.5rem;
      line-height: 1.6;
      max-width: 650px;
      margin-left: auto;
      margin-right: auto;
    }

    .bp-hero-cta {
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
    .bp-section-header {
      text-align: center;
      margin-bottom: 3rem;
    }

    .bp-section-header h2 {
      font-size: 2.25rem;
      font-weight: 700;
      margin-bottom: 1rem;
      color: var(--text-primary);
    }

    .bp-section-header p {
      font-size: 1.15rem;
      color: var(--text-secondary);
      max-width: 650px;
      margin: 0 auto;
    }

    /* ========== Tool Cards Section ========== */
    .bp-tools-section {
      padding: 4rem 1.5rem 2rem;
      max-width: 900px;
      margin: 0 auto;
    }

    .bp-tool-card {
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 1rem;
      padding: 2.5rem;
      margin-bottom: 2rem;
      position: relative;
      transition: box-shadow 0.2s, transform 0.2s;
    }

    .bp-tool-card:hover {
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
      transform: translateY(-2px);
    }

    .bp-tool-card.bp-tool-highlighted {
      border-color: var(--primary-color);
      box-shadow: 0 4px 24px rgba(99, 102, 241, 0.12);
    }

    .bp-tool-header {
      display: flex;
      align-items: flex-start;
      gap: 1.25rem;
      margin-bottom: 1.25rem;
    }

    .bp-tool-rank {
      width: 44px;
      height: 44px;
      min-width: 44px;
      background: linear-gradient(135deg, #4f7df3 0%, #6f8ef5 50%, #8b9ff7 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2rem;
      font-weight: 700;
      color: white;
    }

    .bp-tool-card.bp-tool-highlighted .bp-tool-rank {
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      width: 48px;
      height: 48px;
      min-width: 48px;
      font-size: 1.3rem;
    }

    .bp-tool-title-area {
      flex: 1;
    }

    .bp-tool-name-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
      margin-bottom: 0.25rem;
    }

    .bp-tool-name {
      font-size: 1.4rem;
      font-weight: 700;
      color: var(--text-primary);
      margin: 0;
    }

    .bp-badge {
      display: inline-block;
      font-size: 0.7rem;
      font-weight: 700;
      padding: 0.2rem 0.7rem;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .bp-badge-primary {
      background: rgba(99, 102, 241, 0.12);
      color: #6366f1;
      border: 1px solid rgba(99, 102, 241, 0.25);
    }

    .bp-badge-secondary {
      background: rgba(16, 185, 129, 0.1);
      color: #059669;
      border: 1px solid rgba(16, 185, 129, 0.2);
    }

    .bp-tool-url {
      font-size: 0.85rem;
      color: var(--text-secondary);
    }

    .bp-tool-url a {
      color: var(--primary-color);
      text-decoration: none;
    }

    .bp-tool-url a:hover {
      text-decoration: underline;
    }

    .bp-tool-description {
      font-size: 1rem;
      color: var(--text-secondary);
      line-height: 1.7;
      margin-bottom: 1.5rem;
    }

    .bp-pros-cons {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      margin-bottom: 1.5rem;
    }

    .bp-pros h4,
    .bp-cons h4 {
      font-size: 0.85rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.75rem;
    }

    .bp-pros h4 {
      color: #10b981;
    }

    .bp-cons h4 {
      color: #ef4444;
    }

    .bp-pros ul,
    .bp-cons ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .bp-pros li,
    .bp-cons li {
      font-size: 0.9rem;
      color: var(--text-secondary);
      padding: 0.35rem 0;
      padding-left: 1.4rem;
      position: relative;
      line-height: 1.5;
    }

    .bp-pros li::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0.6rem;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
    }

    .bp-cons li::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0.6rem;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ef4444;
    }

    .bp-tool-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 1.25rem;
      border-top: 1px solid var(--border-color);
      flex-wrap: wrap;
      gap: 1rem;
    }

    .bp-tool-pricing {
      font-size: 0.9rem;
      color: var(--text-secondary);
    }

    .bp-tool-pricing strong {
      color: var(--text-primary);
    }

    .bp-tool-best-for {
      font-size: 0.85rem;
      color: var(--text-secondary);
      font-style: italic;
      max-width: 400px;
    }

    /* ========== Quick Comparison Table ========== */
    .bp-table-section {
      padding: 4rem 1.5rem 6rem;
      max-width: 1100px;
      margin: 0 auto;
    }

    .bp-table-wrapper {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      border-radius: 1rem;
      border: 1px solid var(--border-color);
    }

    .bp-quick-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 800px;
    }

    .bp-quick-table thead {
      background: var(--bg-secondary);
    }

    .bp-quick-table th {
      padding: 1rem 0.75rem;
      text-align: center;
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--text-primary);
      border-bottom: 2px solid var(--border-color);
      white-space: nowrap;
    }

    .bp-quick-table th:first-child {
      text-align: left;
      padding-left: 1.25rem;
      min-width: 160px;
    }

    .bp-quick-table th.bp-col-magpipe {
      background: rgba(99, 102, 241, 0.08);
    }

    .bp-quick-table td {
      padding: 0.75rem 0.75rem;
      text-align: center;
      border-bottom: 1px solid var(--border-color);
      font-size: 0.85rem;
      color: var(--text-primary);
    }

    .bp-quick-table td:first-child {
      text-align: left;
      font-weight: 500;
      padding-left: 1.25rem;
    }

    .bp-quick-table td.bp-col-magpipe {
      background: rgba(99, 102, 241, 0.04);
    }

    .bp-quick-table tr:last-child td {
      border-bottom: none;
    }

    .bp-quick-table tr:hover {
      background: rgba(0, 0, 0, 0.02);
    }

    .bp-quick-table tr:hover td.bp-col-magpipe {
      background: rgba(99, 102, 241, 0.08);
    }

    .bp-check svg {
      width: 20px;
      height: 20px;
      color: #10b981;
    }

    .bp-cross svg {
      width: 20px;
      height: 20px;
      color: #ef4444;
    }

    .bp-text-value {
      font-size: 0.8rem;
      color: var(--text-secondary);
    }

    /* ========== Buying Guide ========== */
    .bp-guide-section {
      padding: 6rem 1.5rem;
      background: var(--bg-secondary);
    }

    .bp-guide-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 2rem;
      max-width: 1000px;
      margin: 0 auto;
    }

    .bp-guide-card {
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 1rem;
      padding: 2rem;
      transition: box-shadow 0.2s, transform 0.2s;
    }

    .bp-guide-card:hover {
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
      transform: translateY(-4px);
    }

    .bp-guide-number {
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

    .bp-guide-card h3 {
      font-size: 1.2rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      color: var(--text-primary);
    }

    .bp-guide-card p {
      font-size: 0.95rem;
      color: var(--text-secondary);
      line-height: 1.6;
      margin: 0;
    }

    /* ========== FAQ (reuses landing page pattern) ========== */
    .bp-faq-section {
      padding: 6rem 1.5rem;
      max-width: 800px;
      margin: 0 auto;
    }

    .bp-faq-list {
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
    .bp-final-cta {
      position: relative;
      text-align: center;
      padding: 6rem 1.5rem;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
      overflow: hidden;
    }

    .bp-final-cta .cta-decoration {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .bp-final-cta .cta-orb-1 {
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

    .bp-final-cta .cta-orb-2 {
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

    .bp-final-cta .cta-grid {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
      background-size: 60px 60px;
    }

    .bp-cta-content {
      position: relative;
      z-index: 1;
    }

    .bp-final-cta h2 {
      font-size: 2.5rem;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 1rem;
    }

    .bp-final-cta p {
      font-size: 1.2rem;
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 2rem;
    }

    .bp-cta-buttons {
      display: flex;
      gap: 1rem;
      justify-content: center;
      flex-wrap: wrap;
    }

    /* ========== Mobile Responsive ========== */
    @media (max-width: 768px) {
      .bp-hero {
        min-height: auto;
        padding: 7rem 1.5rem 4rem;
      }

      .bp-hero h1 {
        font-size: 2.15rem;
      }

      .bp-hero-subtitle {
        font-size: 1.05rem;
      }

      .bp-hero .hero-orb-1 {
        width: 500px;
        height: 500px;
        top: -200px;
        left: -200px;
      }

      .bp-hero .hero-orb-2 {
        width: 450px;
        height: 450px;
        bottom: -200px;
        right: -150px;
      }

      .bp-hero .hero-orb-3 {
        width: 350px;
        height: 350px;
        opacity: 0.4;
      }

      .bp-section-header h2,
      .bp-final-cta h2 {
        font-size: 1.75rem;
      }

      .bp-tools-section,
      .bp-table-section {
        padding: 3rem 1.5rem;
      }

      .bp-tool-card {
        padding: 1.75rem;
      }

      .bp-pros-cons {
        grid-template-columns: 1fr;
        gap: 1rem;
      }

      .bp-tool-footer {
        flex-direction: column;
        align-items: flex-start;
      }

      .bp-guide-grid {
        grid-template-columns: 1fr;
      }

      .bp-guide-section,
      .bp-faq-section {
        padding: 4rem 1.5rem;
      }
    }

    @media (max-width: 480px) {
      .bp-hero {
        padding: 5rem 1rem 3rem;
      }

      .bp-hero h1 {
        font-size: 1.65rem;
      }

      .bp-hero-subtitle {
        font-size: 1rem;
      }

      .bp-hero-cta {
        flex-direction: column;
        width: 100%;
      }

      .bp-hero-cta .btn {
        width: 100%;
      }

      .bp-section-header h2,
      .bp-final-cta h2 {
        font-size: 1.5rem;
      }

      .bp-tool-card {
        padding: 1.25rem;
      }

      .bp-tool-header {
        flex-direction: column;
        gap: 0.75rem;
      }

      .bp-tool-name {
        font-size: 1.2rem;
      }

      .bp-tools-section,
      .bp-table-section,
      .bp-guide-section,
      .bp-faq-section,
      .bp-final-cta {
        padding: 3rem 1rem;
      }
    }
  `;
}
