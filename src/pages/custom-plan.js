/**
 * Custom Plan Contact Form Page
 */

import { supabase } from '../lib/supabase.js';
import { renderPublicFooter, getPublicFooterStyles } from '../components/PublicFooter.js';

export default class CustomPlanPage {
  constructor() {
    this.isSubmitting = false;
  }

  async render() {
    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="custom-plan-page">
        <!-- Header Navigation -->
        <header class="pricing-header">
          <div class="pricing-header-content">
            <a href="/" class="pricing-logo" onclick="event.preventDefault(); navigateTo('/');">
              Solo Mobile
            </a>
            <nav class="pricing-nav">
              <a href="/pricing" class="nav-link" onclick="event.preventDefault(); navigateTo('/pricing');">Pricing</a>
              <a href="/custom-plan" class="nav-link nav-link-active" onclick="event.preventDefault(); navigateTo('/custom-plan');">Enterprise</a>
              <a href="https://docs.solomobile.ai" class="nav-link" target="_blank" rel="noopener">Docs</a>
              <a href="/login" class="btn btn-ghost" onclick="event.preventDefault(); navigateTo('/login');">Sign In</a>
              <a href="/signup" class="btn btn-primary" onclick="event.preventDefault(); navigateTo('/signup');">Get Started</a>
            </nav>
          </div>
        </header>

        <!-- Hero Header -->
        <section class="custom-plan-hero">
          <div class="hero-decoration">
            <div class="hero-gradient-orb hero-orb-1"></div>
            <div class="hero-gradient-orb hero-orb-2"></div>
            <div class="hero-grid"></div>
          </div>
          <div class="hero-content">
            <a href="/pricing" class="back-link" onclick="event.preventDefault(); navigateTo('/pricing');">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
              Back to Pricing
            </a>
            <h1>Contact Sales</h1>
            <p>Tell us about your needs and we'll create a custom plan for your business.</p>
          </div>
        </section>

        <!-- Main Content -->
        <main class="custom-plan-main">
          <div class="custom-plan-container">

            <form id="custom-plan-form" class="custom-plan-form">
              <div id="form-error" class="form-error-banner hidden"></div>
              <div id="form-success" class="form-success-banner hidden"></div>

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label" for="first-name">First Name *</label>
                  <input
                    type="text"
                    id="first-name"
                    name="firstName"
                    class="form-input"
                    placeholder="John"
                    required
                  />
                </div>

                <div class="form-group">
                  <label class="form-label" for="last-name">Last Name *</label>
                  <input
                    type="text"
                    id="last-name"
                    name="lastName"
                    class="form-input"
                    placeholder="Doe"
                    required
                  />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="email">Email Address *</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  class="form-input"
                  placeholder="john@company.com"
                  required
                />
              </div>

              <div class="form-group">
                <label class="form-label" for="company-name">Company Name</label>
                <input
                  type="text"
                  id="company-name"
                  name="companyName"
                  class="form-input"
                  placeholder="Acme Inc."
                />
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label" for="company-size">Company Size</label>
                  <select id="company-size" name="companySize" class="form-select">
                    <option value="">Select...</option>
                    <option value="1-10">1-10 employees</option>
                    <option value="11-50">11-50 employees</option>
                    <option value="51-200">51-200 employees</option>
                    <option value="201-500">201-500 employees</option>
                    <option value="500+">500+ employees</option>
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label" for="monthly-volume">Expected Monthly Call Volume</label>
                  <select id="monthly-volume" name="monthlyVolume" class="form-select">
                    <option value="">Select...</option>
                    <option value="<1000">Less than 1,000 minutes</option>
                    <option value="1000-5000">1,000-5,000 minutes</option>
                    <option value="5000-10000">5,000-10,000 minutes</option>
                    <option value="10000+">10,000+ minutes</option>
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="concurrent-calls">Expected Concurrent Calls</label>
                <select id="concurrent-calls" name="concurrentCalls" class="form-select">
                  <option value="">Select...</option>
                  <option value="50-100">50-100 concurrent</option>
                  <option value="100-250">100-250 concurrent</option>
                  <option value="250-500">250-500 concurrent</option>
                  <option value="500+">500+ concurrent</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label" for="use-case">Tell us about your use case</label>
                <textarea
                  id="use-case"
                  name="useCase"
                  class="form-textarea"
                  rows="4"
                  placeholder="Describe how you plan to use the platform, any specific requirements, integrations needed, etc."
                ></textarea>
              </div>

              <div class="form-group">
                <label class="form-label" for="hear-about">How did you hear about us?</label>
                <select id="hear-about" name="hearAbout" class="form-select">
                  <option value="">Select...</option>
                  <option value="search">Search Engine (Google, Bing, etc.)</option>
                  <option value="social">Social Media</option>
                  <option value="referral">Referral from a friend/colleague</option>
                  <option value="review">Review site</option>
                  <option value="event">Event or conference</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <button type="submit" class="btn btn-primary btn-full btn-lg" id="submit-btn">
                Submit Inquiry
              </button>

              <p class="form-disclaimer">
                By submitting this form, you agree to be contacted by our sales team.
                We typically respond within 1 business day.
              </p>
            </form>
          </div>
        </main>

        <!-- Footer -->
        ${renderPublicFooter()}
      </div>

      <style>
        .custom-plan-page {
          min-height: 100vh;
          background: var(--bg-secondary);
          display: flex;
          flex-direction: column;
        }

        /* Reuse pricing header styles */
        .pricing-header {
          position: sticky;
          top: 0;
          background: var(--bg-primary);
          border-bottom: 1px solid var(--border-color);
          z-index: 100;
          padding: 1rem 0;
        }

        .pricing-header-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 1.5rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .pricing-logo {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-primary);
          text-decoration: none;
        }

        .pricing-nav {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .nav-link {
          color: var(--text-secondary);
          text-decoration: none;
          font-weight: 500;
          padding: 0.5rem 1rem;
          transition: color 0.15s;
        }

        .nav-link:hover {
          color: var(--primary-color);
        }

        .nav-link-active {
          color: var(--primary-color);
        }

        .btn-ghost {
          background: transparent;
          color: var(--text-primary);
          border: none;
        }

        .btn-ghost:hover {
          background: var(--bg-secondary);
        }

        /* Hero Header */
        .custom-plan-hero {
          position: relative;
          text-align: center;
          padding: 4rem 1.5rem 3rem;
          margin-bottom: 20px;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
          overflow: hidden;
        }

        .hero-decoration {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .hero-gradient-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.5;
        }

        .hero-orb-1 {
          width: 300px;
          height: 300px;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          top: -100px;
          left: -50px;
        }

        .hero-orb-2 {
          width: 200px;
          height: 200px;
          background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%);
          bottom: -50px;
          right: -30px;
        }

        .hero-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 60px 60px;
        }

        .hero-content {
          position: relative;
          z-index: 1;
        }

        .back-link {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          color: rgba(255, 255, 255, 0.7);
          text-decoration: none;
          font-size: 0.875rem;
          margin-bottom: 1.5rem;
          transition: color 0.15s;
        }

        .back-link:hover {
          color: #ffffff;
        }

        .back-link svg {
          width: 18px;
          height: 18px;
        }

        .custom-plan-hero h1 {
          font-size: 2.5rem;
          font-weight: 700;
          margin-bottom: 0.75rem;
          color: #ffffff;
          letter-spacing: -0.02em;
        }

        .custom-plan-hero p {
          color: rgba(255, 255, 255, 0.7);
          font-size: 1.1rem;
          max-width: 500px;
          margin: 0 auto;
        }

        /* Main content */
        .custom-plan-main {
          flex: 1;
          padding: 2rem 1.5rem;
          margin-top: -1.5rem;
          position: relative;
          z-index: 1;
        }

        .custom-plan-container {
          max-width: 600px;
          margin: 0 auto;
        }

        /* Form */
        .custom-plan-form {
          background: var(--bg-primary);
          border-radius: 1rem;
          padding: 2rem;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .form-group {
          margin-bottom: 1.25rem;
        }

        .form-label {
          display: block;
          font-weight: 500;
          font-size: 0.875rem;
          margin-bottom: 0.5rem;
          color: var(--text-primary);
        }

        .form-input,
        .form-select,
        .form-textarea {
          width: 100%;
          padding: 0.75rem 1rem;
          font-size: 1rem;
          border: 1px solid var(--border-color);
          border-radius: 0.5rem;
          background: var(--bg-primary);
          color: var(--text-primary);
          transition: border-color 0.15s, box-shadow 0.15s;
        }

        .form-input:focus,
        .form-select:focus,
        .form-textarea:focus {
          outline: none;
          border-color: var(--primary-color);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }

        .form-textarea {
          resize: vertical;
          min-height: 100px;
        }

        .form-select {
          cursor: pointer;
        }

        .btn-lg {
          padding: 0.875rem 2rem;
          font-size: 1rem;
        }

        .form-disclaimer {
          font-size: 0.75rem;
          color: var(--text-secondary);
          text-align: center;
          margin-top: 1rem;
          margin-bottom: 0;
        }

        .form-error-banner {
          background: #fee2e2;
          border: 1px solid #ef4444;
          color: #991b1b;
          padding: 0.75rem 1rem;
          border-radius: 0.5rem;
          margin-bottom: 1rem;
          font-size: 0.875rem;
        }

        .form-success-banner {
          background: #d1fae5;
          border: 1px solid #10b981;
          color: #065f46;
          padding: 1rem;
          border-radius: 0.5rem;
          margin-bottom: 1rem;
          text-align: center;
        }

        .form-success-banner h3 {
          margin: 0 0 0.5rem;
          font-size: 1.1rem;
        }

        .form-success-banner p {
          margin: 0;
          color: #065f46;
        }

        .hidden {
          display: none !important;
        }

        /* Footer */
        .pricing-footer {
          text-align: center;
          padding: 2rem 1.5rem;
          border-top: 1px solid var(--border-color);
          background: var(--bg-primary);
        }

        /* Footer */
        ${getPublicFooterStyles()}

        /* Mobile responsive */
        @media (max-width: 600px) {
          .form-row {
            grid-template-columns: 1fr;
          }

          .custom-plan-form {
            padding: 1.5rem;
          }

          .custom-plan-hero {
            padding: 3rem 1.5rem 2rem;
          }

          .custom-plan-hero h1 {
            font-size: 1.75rem;
          }

          .custom-plan-hero p {
            font-size: 1rem;
          }

          .hero-orb-1 {
            width: 200px;
            height: 200px;
          }

          .hero-orb-2 {
            width: 150px;
            height: 150px;
          }
        }
      </style>
    `;

    this.attachEventListeners();
  }

  async submitForm(formData) {
    try {
      const response = await supabase.functions.invoke('send-custom-plan-inquiry', {
        body: formData
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to submit inquiry');
      }

      return { success: true };
    } catch (error) {
      console.error('Error submitting form:', error);
      throw error;
    }
  }

  attachEventListeners() {
    const form = document.getElementById('custom-plan-form');
    const submitBtn = document.getElementById('submit-btn');
    const errorBanner = document.getElementById('form-error');
    const successBanner = document.getElementById('form-success');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (this.isSubmitting) return;

      // Hide any previous messages
      errorBanner.classList.add('hidden');
      successBanner.classList.add('hidden');

      // Collect form data
      const formData = {
        firstName: document.getElementById('first-name').value.trim(),
        lastName: document.getElementById('last-name').value.trim(),
        email: document.getElementById('email').value.trim(),
        companyName: document.getElementById('company-name').value.trim(),
        companySize: document.getElementById('company-size').value,
        monthlyVolume: document.getElementById('monthly-volume').value,
        concurrentCalls: document.getElementById('concurrent-calls').value,
        useCase: document.getElementById('use-case').value.trim(),
        hearAbout: document.getElementById('hear-about').value
      };

      // Basic validation
      if (!formData.firstName || !formData.lastName || !formData.email) {
        errorBanner.textContent = 'Please fill in all required fields.';
        errorBanner.classList.remove('hidden');
        return;
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        errorBanner.textContent = 'Please enter a valid email address.';
        errorBanner.classList.remove('hidden');
        return;
      }

      // Submit form
      this.isSubmitting = true;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      try {
        await this.submitForm(formData);

        // Show success message
        successBanner.innerHTML = `
          <h3>Thank you for your inquiry!</h3>
          <p>Our sales team will reach out to you within 1 business day.</p>
        `;
        successBanner.classList.remove('hidden');

        // Hide the form
        form.innerHTML = successBanner.outerHTML;

      } catch (error) {
        errorBanner.textContent = error.message || 'Something went wrong. Please try again.';
        errorBanner.classList.remove('hidden');

        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Inquiry';
      } finally {
        this.isSubmitting = false;
      }
    });
  }
}
