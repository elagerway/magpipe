/**
 * Custom Plan Contact Form Page
 */

import { supabase } from '../lib/supabase.js';
import { renderPublicFooter, getPublicFooterStyles } from '../components/PublicFooter.js';
import { renderPublicHeader, getPublicHeaderStyles } from '../components/PublicHeader.js';

export default class CustomPlanPage {
  constructor() {
    this.isSubmitting = false;
  }

  async render() {
    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="custom-plan-page">
        ${renderPublicHeader({ activePage: 'enterprise' })}

        <!-- Main Content -->
        <main class="custom-plan-main">
          <div class="custom-plan-layout">
            <!-- Testimonial Side -->
            <div class="testimonial-side">
              <!-- Page Header -->
              <div class="custom-plan-header">
                <h1>Contact Sales</h1>
                <p class="header-subtitle">We can show you how to deploy voice AI and text agents at scale.</p>
                <p class="header-support">Need support? Email <a href="mailto:support@magpipe.ai">support@magpipe.ai</a></p>
              </div>
              <div class="testimonial-bg"></div>
              <div class="testimonial-content">
                <div class="testimonial-bubble">
                  <div class="quote-mark">"</div>
                  <p class="testimonial-text">
                    We deployed MAGPIPE to improve how we talk to patients after hours. Traditionally we would ask them to leave a voice mail. Problem with that is, one, many people these days don't want to leave a voice mail. So they hang up.
                  </p>
                  <p class="testimonial-text">
                    The platform and the technology work really well. I've listened to a lot of our calls and MAGPIPE does an incredible job of helping the caller thru the call…and getting the information we require.
                  </p>
                  <p class="testimonial-text">
                    The result: Many more people are completing calls after hours - instead of abandoning. And we are extracting the info we need to take the right actions the next morning. We couldn't be more pleased.
                  </p>
                  <div class="testimonial-author">
                    <span class="author-name">Larry Lisser</span>
                    <span class="author-title">CEO - HelloMD</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Form Side -->
            <div class="form-side">
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

        /* Header */
        ${getPublicHeaderStyles()}

        /* Main content */
        .custom-plan-main {
          flex: 1;
          position: relative;
          z-index: 1;
          padding: 60px 20px 60px;
        }

        /* Page Header */
        .custom-plan-header {
          position: relative;
          z-index: 1;
          margin-bottom: 2rem;
        }

        .custom-plan-header h1 {
          font-size: 1.75rem;
          font-weight: 700;
          color: #ffffff;
          margin-bottom: 0.5rem;
        }

        .header-subtitle {
          font-size: 1rem;
          color: rgba(255, 255, 255, 0.85);
          margin-bottom: 0.5rem;
        }

        .header-support {
          font-size: 0.875rem;
          color: rgba(255, 255, 255, 0.7);
        }

        .header-support a {
          color: #ffffff;
          text-decoration: underline;
        }

        .header-support a:hover {
          color: rgba(255, 255, 255, 0.9);
        }

        .custom-plan-layout {
          display: flex;
          min-height: 600px;
          border-radius: 1rem 1rem 1rem 1rem;
          overflow: hidden;
          max-width: 1200px;
          margin: 0 auto;
        }

        /* Testimonial Side */
        .testimonial-side {
          flex: 1;
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          padding: 3rem;
          overflow: hidden;
        }

        .testimonial-bg {
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 40%, #a855f7 70%, #d946ef 100%);
        }

        .testimonial-bg::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image:
            radial-gradient(circle at 20% 80%, rgba(255,255,255,0.15) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(255,255,255,0.1) 0%, transparent 40%),
            radial-gradient(circle at 40% 40%, rgba(0,0,0,0.1) 0%, transparent 30%);
        }

        .testimonial-bg::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
        }

        .testimonial-content {
          position: relative;
          z-index: 1;
          max-width: 500px;
        }

        .testimonial-bubble {
          background: rgba(255, 255, 255, 0.15);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 1.5rem;
          padding: 2.5rem;
          position: relative;
        }

        .quote-mark {
          font-size: 4rem;
          font-family: Georgia, serif;
          color: rgba(255, 255, 255, 0.3);
          line-height: 1;
          position: absolute;
          top: 1rem;
          left: 1.5rem;
        }

        .testimonial-text {
          color: #ffffff;
          font-size: 1rem;
          line-height: 1.7;
          margin: 0 0 1rem;
          position: relative;
        }

        .testimonial-text:first-of-type {
          padding-top: 1.5rem;
        }

        .testimonial-text:last-of-type {
          margin-bottom: 1.5rem;
        }

        .testimonial-author {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          padding-top: 1rem;
          border-top: 1px solid rgba(255, 255, 255, 0.2);
        }

        .author-name {
          color: #ffffff;
          font-weight: 600;
          font-size: 1rem;
        }

        .author-title {
          color: rgba(255, 255, 255, 0.7);
          font-size: 0.875rem;
        }

        /* Form Side */
        .form-side {
          flex: 1;
          padding: 3rem;
          background: var(--bg-secondary);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          border: 1px solid var(--border-color);
          border-left: none;
          border-radius: 0 1rem 1rem 0;
        }

        /* Form */
        .custom-plan-form {
          background: var(--bg-primary);
          border-radius: 1rem;
          padding: 2rem;
          width: 100%;
          max-width: 500px;
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
        @media (max-width: 1024px) {
          .custom-plan-main {
            padding: 40px 16px;
          }

          .custom-plan-layout {
            flex-direction: column;
          }

          .testimonial-side {
            padding: 2rem 1.5rem;
            min-height: auto;
          }

          .form-side {
            border-left: none;
            border-top: 1px solid var(--border-color);
            border-radius: 0 0 1rem 1rem;
          }

          .testimonial-bubble {
            padding: 2rem;
          }

          .testimonial-text {
            font-size: 0.9375rem;
          }

          .form-side {
            padding: 2rem 1.5rem;
          }

          .custom-plan-form {
            max-width: 100%;
          }
        }

        @media (max-width: 600px) {
          .custom-plan-main {
            padding: 24px 12px 40px;
          }

          .custom-plan-header h1 {
            font-size: 1.5rem;
          }

          .header-subtitle {
            font-size: 0.9rem;
          }

          .form-row {
            grid-template-columns: 1fr;
          }

          .custom-plan-form {
            padding: 1.5rem;
          }

          .testimonial-side {
            padding: 1.5rem;
          }

          .testimonial-bubble {
            padding: 1.5rem;
          }

          .quote-mark {
            font-size: 3rem;
            top: 0.5rem;
            left: 1rem;
          }

          .testimonial-text {
            font-size: 0.875rem;
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
