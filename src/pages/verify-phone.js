/**
 * Phone Verification Page
 */

import { User } from '../models/User.js';
import { getCurrentUser, supabase } from '../lib/supabase.js';

export default class VerifyPhonePage {
  constructor() {
    this.codeSent = false;
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container" style="max-width: 400px; margin-top: 4rem;">
        <div class="card">
          <h1 class="text-center">Verify Your Phone</h1>
          <p class="text-center text-muted">
            We'll send a verification code to your phone number
          </p>

          <div id="error-message" class="hidden"></div>
          <div id="success-message" class="hidden"></div>

          <div id="phone-entry-form">
            <div class="form-group">
              <label class="form-label" for="phone">Phone Number (USA/Canada)</label>
              <div style="display: flex; gap: 0.5rem; align-items: center;">
                <span style="padding: 0.5rem 0.75rem; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 0.375rem; font-weight: 500; color: #6b7280;">+1</span>
                <input
                  type="tel"
                  id="phone"
                  class="form-input"
                  placeholder="555-123-4567"
                  required
                  autocomplete="tel"
                  maxlength="12"
                  style="flex: 1;"
                />
              </div>
              <p class="form-help">Enter your 10-digit phone number (currently available for USA and Canada only)</p>
            </div>

            <button class="btn btn-primary btn-full" id="send-code-btn">
              Send Verification Code
            </button>
          </div>

          <div id="code-verification-form" class="hidden">
            <div class="form-group">
              <label class="form-label" for="verification-code">Verification Code</label>
              <input
                type="text"
                id="verification-code"
                class="form-input"
                placeholder="Enter 6-digit code"
                maxlength="6"
                pattern="[0-9]{6}"
                autocomplete="one-time-code"
              />
            </div>

            <button class="btn btn-primary btn-full" id="verify-code-btn">
              Verify Phone Number
            </button>

            <p class="text-center text-sm mt-3" style="display: flex; justify-content: center; gap: 1rem;">
              <a href="#" id="resend-code-link">Resend code</a>
              <span style="color: #d1d5db;">|</span>
              <a href="#" id="change-number-link">Change number</a>
            </p>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
    this.setupPhoneFormatting();
  }

  setupPhoneFormatting() {
    const phoneInput = document.getElementById('phone');
    if (!phoneInput) return;

    phoneInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\D/g, ''); // Remove non-digits

      // Remove leading '1' if present (from +1 in autocomplete)
      if (value.startsWith('1') && value.length === 11) {
        value = value.slice(1);
      }

      // Limit to 10 digits
      if (value.length > 10) {
        value = value.slice(0, 10);
      }

      // Format as XXX-XXX-XXXX
      if (value.length > 6) {
        value = `${value.slice(0, 3)}-${value.slice(3, 6)}-${value.slice(6)}`;
      } else if (value.length > 3) {
        value = `${value.slice(0, 3)}-${value.slice(3)}`;
      }

      e.target.value = value;
    });
  }

  attachEventListeners() {
    const sendCodeBtn = document.getElementById('send-code-btn');
    const verifyCodeBtn = document.getElementById('verify-code-btn');
    const resendCodeLink = document.getElementById('resend-code-link');
    const changeNumberLink = document.getElementById('change-number-link');
    const phoneEntryForm = document.getElementById('phone-entry-form');
    const codeVerificationForm = document.getElementById('code-verification-form');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');

    sendCodeBtn.addEventListener('click', async () => {
      const phoneInput = document.getElementById('phone');
      const phoneNumber = this.sanitizePhoneNumber(phoneInput.value);

      if (!this.isValidNorthAmericanNumber(phoneNumber)) {
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = 'Please enter a valid 10-digit phone number';
        return;
      }

      sendCodeBtn.disabled = true;
      sendCodeBtn.textContent = 'Sending code...';
      errorMessage.classList.add('hidden');

      try {
        // In production, this would call a Supabase Edge Function to send SMS via SignalWire
        // For now, we'll simulate the API call
        await this.sendVerificationCode(phoneNumber);

        // Show code verification form
        phoneEntryForm.classList.add('hidden');
        codeVerificationForm.classList.remove('hidden');

        successMessage.className = 'alert alert-success';
        successMessage.textContent = `Verification code sent to ${phoneNumber}`;

        this.codeSent = true;
        this.phoneNumber = phoneNumber;
      } catch (error) {
        console.error('Send code error:', error);
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = error.message || 'Failed to send verification code. Please try again.';

        sendCodeBtn.disabled = false;
        sendCodeBtn.textContent = 'Send Verification Code';
      }
    });

    verifyCodeBtn.addEventListener('click', async () => {
      const codeInput = document.getElementById('verification-code');
      const code = codeInput.value;

      if (!code || code.length !== 6) {
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = 'Please enter a valid 6-digit code';
        return;
      }

      verifyCodeBtn.disabled = true;
      verifyCodeBtn.textContent = 'Verifying...';
      errorMessage.classList.add('hidden');
      successMessage.classList.add('hidden');

      try {
        // In production, verify code with backend
        // For now, simulate verification
        const isValid = await this.verifyCode(this.phoneNumber, code);

        if (!isValid) {
          throw new Error('Invalid verification code');
        }

        // Update user profile with verified phone
        const { user } = await getCurrentUser();
        await User.verifyPhone(user.id, this.phoneNumber);

        // Create agent with default prompt
        successMessage.className = 'alert alert-success';
        successMessage.textContent = 'Phone verified! Setting up your AI assistant...';

        try {
          await this.createDefaultAgent();
          successMessage.textContent = 'All set! Redirecting...';
        } catch (error) {
          console.error('Agent creation error:', error);
          // Continue anyway - agent can be created later
        }

        setTimeout(() => {
          navigateTo('/select-number');
        }, 1500);
      } catch (error) {
        console.error('Verify code error:', error);
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = error.message || 'Invalid verification code. Please try again.';

        verifyCodeBtn.disabled = false;
        verifyCodeBtn.textContent = 'Verify Phone Number';
      }
    });

    resendCodeLink.addEventListener('click', async (e) => {
      e.preventDefault();

      if (!this.phoneNumber) return;

      resendCodeLink.textContent = 'Sending...';
      errorMessage.classList.add('hidden');
      successMessage.classList.add('hidden');

      try {
        await this.sendVerificationCode(this.phoneNumber);

        successMessage.className = 'alert alert-success';
        successMessage.textContent = 'Verification code resent';
        resendCodeLink.textContent = 'Resend code';
      } catch (error) {
        console.error('Resend error:', error);
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = 'Failed to resend code. Please try again.';
        resendCodeLink.textContent = 'Resend code';
      }
    });

    changeNumberLink.addEventListener('click', (e) => {
      e.preventDefault();
      this.resetToPhoneEntry();
    });
  }

  resetToPhoneEntry() {
    const phoneEntryForm = document.getElementById('phone-entry-form');
    const codeVerificationForm = document.getElementById('code-verification-form');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');
    const phoneInput = document.getElementById('phone');
    const verificationCode = document.getElementById('verification-code');
    const sendCodeBtn = document.getElementById('send-code-btn');

    // Clear stored phone number and cancel verification process
    this.phoneNumber = null;
    this.codeSent = false;

    // Clear all input fields
    if (phoneInput) phoneInput.value = '';
    if (verificationCode) verificationCode.value = '';

    // Hide messages
    errorMessage.classList.add('hidden');
    successMessage.classList.add('hidden');

    // Show phone entry form, hide verification form
    phoneEntryForm.classList.remove('hidden');
    codeVerificationForm.classList.add('hidden');

    // Reset button state
    sendCodeBtn.disabled = false;
    sendCodeBtn.textContent = 'Send Verification Code';

    // Focus on input
    if (phoneInput) phoneInput.focus();
  }

  sanitizePhoneNumber(phone) {
    // Remove all non-digit characters except leading +
    let cleaned = phone.replace(/[^\d+]/g, '');

    // Ensure E.164 format
    if (!cleaned.startsWith('+')) {
      cleaned = '+1' + cleaned; // Assume US/Canada
    }

    return cleaned;
  }

  isValidNorthAmericanNumber(phone) {
    // North American format: +1 followed by 10 digits
    return /^\+1\d{10}$/.test(phone);
  }

  async sendVerificationCode(phoneNumber) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      throw new Error('You must be logged in to verify your phone');
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/verify-phone-send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ phoneNumber }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send verification code');
    }

    return await response.json();
  }

  async verifyCode(phoneNumber, code) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      throw new Error('You must be logged in to verify your phone');
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/verify-phone-check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ phoneNumber, code }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Invalid verification code');
    }

    const result = await response.json();
    return result.success;
  }

  async createDefaultAgent() {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      throw new Error('You must be logged in');
    }

    const defaultPrompt = `Personal AI Agent Prompt (Casual Style)

You're Erik's personal AI assistant. Answer calls and texts in a friendly, natural way.

Calls:

Pick up with a casual greeting like: "Hey, this is Erik's assistant, he can't grab the phone right now."

Ask who's calling and what it's about.

If it's family or friends → take a quick message and let them know Erik will see it.

If it's unknown → ask their name and reason. If it feels spammy, politely end the call.

Always keep it short, warm, and polite.

SMS:

Reply casually and friendly.

Let friends/family know Erik's busy but will see their message.

If important, say you'll pass it on.

If spammy, ignore or politely decline.

Always sound approachable, keep things simple, and update Erik with a quick summary after each interaction.

Example Call:

"Hi, this is Erik's assistant. He's busy right now — who's calling?"

Example SMS Reply:

"Hey! Erik's tied up at the moment but I'll make sure he sees your message."`;

    const response = await fetch(`${supabaseUrl}/functions/v1/create-retell-agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        agentConfig: {
          name: 'Pat AI Assistant',
          voice_id: '11labs-Kate',
          prompt: defaultPrompt,
        }
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create agent');
    }

    return await response.json();
  }
}