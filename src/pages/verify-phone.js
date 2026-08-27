/**
 * Phone Verification Page
 */

import { User } from '../models/User.js';
import { getCurrentUser, supabase } from '../lib/supabase.js';
import { isPushSupported, subscribeToPush } from '../services/pushNotifications.js';
import { showToast } from '../lib/toast.js';

// COUNTRY_CODES lives in the shared PhoneInput component now; re-exported
// here for existing importers (admin users-tab).
import { COUNTRY_CODES } from '../components/PhoneInput.js';
import { isValidE164 } from '../lib/phone-e164.js';

export default class VerifyPhonePage {
  constructor() {
    this.codeSent = false;
    this.selectedCountryCode = '+1';
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    // Check if phone is already verified (force fresh data)
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('phone_verified, phone_number')
      .eq('id', user.id)
      .single();

    console.log('Phone verification check:', {
      phone_verified: profile?.phone_verified,
      phone_number: profile?.phone_number
    });

    if (profile?.phone_verified) {
      // Already verified, redirect to settings
      console.log('Phone already verified, redirecting to settings');
      navigateTo('/settings');
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

          <div id="phone-entry-form">
            <div class="form-group">
              <label class="form-label" for="phone">Phone Number</label>
              <div style="display: flex; gap: 0.5rem; align-items: center;">
                <div style="position: relative; flex-shrink: 0;">
                  <select id="country-code" style="position: absolute; inset: 0; opacity: 0; cursor: pointer; font-size: 1rem;">
                    ${COUNTRY_CODES.map((c, i) =>
                      `<option value="${c.code}" data-index="${i}"${i === 0 ? ' selected' : ''}>${c.flag} ${c.name} (${c.code})</option>`
                    ).join('')}
                  </select>
                  <span id="country-code-display" style="display: inline-flex; align-items: center; padding: 0.5rem 0.75rem; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 0.375rem; font-weight: 500; color: #374151; font-size: 0.95rem; white-space: nowrap; pointer-events: none;">${COUNTRY_CODES[0].flag} ${COUNTRY_CODES[0].code} ▾</span>
                </div>
                <input
                  type="tel"
                  id="phone"
                  class="form-input"
                  placeholder="555-123-4567"
                  required
                  autocomplete="tel"
                  maxlength="15"
                  style="flex: 1;"
                />
              </div>
              <p class="form-help" id="phone-help">Enter your phone number to receive a verification code via SMS</p>
            </div>

            <button class="btn btn-primary btn-full" id="send-code-btn">
              Send Verification Code
            </button>

            <p class="text-center text-sm mt-3">
              <a href="#" id="voice-code-link">Can't receive texts? Get a phone call instead</a>
            </p>
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

            <p class="text-center text-sm mt-3" style="display: flex; justify-content: center; gap: 1rem; flex-wrap: wrap;">
              <a href="#" id="resend-code-link">Resend code</a>
              <span style="color: #d1d5db;">|</span>
              <a href="#" id="call-code-link">Call me instead</a>
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
    const countryCodeSelect = document.getElementById('country-code');
    if (!phoneInput || !countryCodeSelect) return;

    const displaySpan = document.getElementById('country-code-display');

    // Track selected country code
    countryCodeSelect.addEventListener('change', (e) => {
      const country = COUNTRY_CODES[e.target.selectedIndex];
      this.selectedCountryCode = country.code;
      const isNorthAmerican = this.selectedCountryCode === '+1';

      // Update the visible display
      if (displaySpan) {
        displaySpan.textContent = `${country.flag} ${country.code} ▾`;
      }

      // Update placeholder and maxlength based on country
      phoneInput.placeholder = isNorthAmerican ? '555-123-4567' : 'Phone number';
      phoneInput.maxLength = isNorthAmerican ? 12 : 15;

      // Re-format existing input when switching countries
      phoneInput.value = '';
      phoneInput.focus();
    });

    phoneInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\D/g, ''); // Remove non-digits

      if (this.selectedCountryCode === '+1') {
        // North American formatting: XXX-XXX-XXXX
        // Remove leading '1' if present (from autocomplete)
        if (value.startsWith('1') && value.length === 11) {
          value = value.slice(1);
        }
        if (value.length > 10) {
          value = value.slice(0, 10);
        }
        if (value.length > 6) {
          value = `${value.slice(0, 3)}-${value.slice(3, 6)}-${value.slice(6)}`;
        } else if (value.length > 3) {
          value = `${value.slice(0, 3)}-${value.slice(3)}`;
        }
      } else {
        // International: just digits, limit to 15 total (E.164 max)
        const maxDigits = 15 - this.selectedCountryCode.replace('+', '').length;
        if (value.length > maxDigits) {
          value = value.slice(0, maxDigits);
        }
      }

      e.target.value = value;
    });
  }

  attachEventListeners() {
    const sendCodeBtn = document.getElementById('send-code-btn');
    const verifyCodeBtn = document.getElementById('verify-code-btn');
    const resendCodeLink = document.getElementById('resend-code-link');
    const voiceCodeLink = document.getElementById('voice-code-link');
    const callCodeLink = document.getElementById('call-code-link');
    const changeNumberLink = document.getElementById('change-number-link');
    const phoneEntryForm = document.getElementById('phone-entry-form');
    const codeVerificationForm = document.getElementById('code-verification-form');

    sendCodeBtn.addEventListener('click', async () => {
      const phoneInput = document.getElementById('phone');
      const phoneNumber = this.sanitizePhoneNumber(phoneInput.value);

      if (!this.isValidPhoneNumber(phoneNumber)) {
        showToast('Please enter a valid phone number', 'error');
        return;
      }

      sendCodeBtn.disabled = true;
      sendCodeBtn.textContent = 'Sending code...';

      try {
        // In production, this would call a Supabase Edge Function to send SMS via SignalWire
        // For now, we'll simulate the API call
        await this.sendVerificationCode(phoneNumber);

        // Show code verification form
        phoneEntryForm.classList.add('hidden');
        codeVerificationForm.classList.remove('hidden');

        showToast(`Verification code sent to ${phoneNumber}`, 'success');

        this.codeSent = true;
        this.phoneNumber = phoneNumber;
      } catch (error) {
        console.error('Send code error:', error);
        showToast(error.message || 'Failed to send verification code. Please try again.', 'error');

        sendCodeBtn.disabled = false;
        sendCodeBtn.textContent = 'Send Verification Code';
      }
    });

    verifyCodeBtn.addEventListener('click', async () => {
      const codeInput = document.getElementById('verification-code');
      const code = codeInput.value;

      if (!code || code.length !== 6) {
        showToast('Please enter a valid 6-digit code', 'error');
        return;
      }

      verifyCodeBtn.disabled = true;
      verifyCodeBtn.textContent = 'Verifying...';

      try {
        // Verify code with backend (backend also updates phone_verified = true)
        const isValid = await this.verifyCode(this.phoneNumber, code);

        if (!isValid) {
          throw new Error('Invalid verification code');
        }

        const { user } = await getCurrentUser();

        // Check if user already has service numbers
        const { data: serviceNumbers } = await supabase
          .from('service_numbers')
          .select('id')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .limit(1);

        showToast('Phone verified successfully!', 'success');

        // Request push notification permission (mobile only — desktop doesn't benefit)
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        let pushEnabled = false;
        if (isMobile && isPushSupported()) {
          try {
            const pushResult = await subscribeToPush();
            if (pushResult.success) {
              pushEnabled = true;
              // Save preference if they accepted
              await supabase
                .from('notification_preferences')
                .upsert({
                  user_id: user.id,
                  push_enabled: true,
                  push_inbound_calls: true,
                  push_inbound_messages: true,
                }, { onConflict: 'user_id' });
            }
          } catch (e) {
            console.log('Push notification setup skipped:', e.message);
          }

          // If push was declined on mobile, show explanation modal
          if (!pushEnabled) {
            const destination = (serviceNumbers && serviceNumbers.length > 0)
              ? '/settings'
              : '/select-number';

            await this.showPushDeclinedModal(user.id, destination, serviceNumbers?.length > 0);
            return; // Modal handles redirect
          }
        }

        // Wait a moment to ensure database update propagates
        await new Promise(resolve => setTimeout(resolve, 500));

        if (serviceNumbers && serviceNumbers.length > 0) {
          // User already has service number(s), go to settings
          showToast('Phone verified! Redirecting to settings...', 'success');

          setTimeout(() => {
            window.location.href = '/settings'; // Use href to force page reload
          }, 1000);
        } else {
          // New user, set up agent and select number
          showToast('Setting up your AI assistant...', 'info');

          try {
            await this.createDefaultAgent();
            showToast('All set! Redirecting...', 'success');
          } catch (error) {
            console.error('Agent creation error:', error);
            // Continue anyway - agent can be created later
          }

          setTimeout(() => {
            navigateTo('/select-number');
          }, 1500);
        }
      } catch (error) {
        console.error('Verify code error:', error);
        showToast(error.message || 'Invalid verification code. Please try again.', 'error');

        verifyCodeBtn.disabled = false;
        verifyCodeBtn.textContent = 'Verify Phone Number';
      }
    });

    resendCodeLink.addEventListener('click', async (e) => {
      e.preventDefault();

      if (!this.phoneNumber) return;

      resendCodeLink.textContent = 'Sending...';

      try {
        await this.sendVerificationCode(this.phoneNumber);

        showToast('Verification code resent', 'success');
        resendCodeLink.textContent = 'Resend code';
      } catch (error) {
        console.error('Resend error:', error);
        showToast('Failed to resend code. Please try again.', 'error');
        resendCodeLink.textContent = 'Resend code';
      }
    });

    // Voice fallback from the phone-entry step (landlines / VoIP can't get SMS)
    voiceCodeLink.addEventListener('click', async (e) => {
      e.preventDefault();

      const phoneInput = document.getElementById('phone');
      const phoneNumber = this.sanitizePhoneNumber(phoneInput.value);

      if (!this.isValidPhoneNumber(phoneNumber)) {
        showToast('Please enter a valid phone number', 'error');
        return;
      }

      voiceCodeLink.textContent = 'Calling...';

      try {
        await this.sendVerificationCode(phoneNumber, 'voice');

        phoneEntryForm.classList.add('hidden');
        codeVerificationForm.classList.remove('hidden');

        showToast(`Calling ${phoneNumber} with your code now`, 'success');

        this.codeSent = true;
        this.phoneNumber = phoneNumber;
      } catch (error) {
        console.error('Voice code error:', error);
        showToast(error.message || 'Failed to start verification call. Please try again.', 'error');
      } finally {
        voiceCodeLink.textContent = "Can't receive texts? Get a phone call instead";
      }
    });

    // Voice fallback from the code-entry step (same code stays valid — resending
    // upserts a fresh one, so the call reads whatever is current)
    callCodeLink.addEventListener('click', async (e) => {
      e.preventDefault();

      if (!this.phoneNumber) return;

      callCodeLink.textContent = 'Calling...';

      try {
        await this.sendVerificationCode(this.phoneNumber, 'voice');

        showToast(`Calling ${this.phoneNumber} with your code now`, 'success');
      } catch (error) {
        console.error('Voice code error:', error);
        showToast(error.message || 'Failed to start verification call. Please try again.', 'error');
      } finally {
        callCodeLink.textContent = 'Call me instead';
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
    const phoneInput = document.getElementById('phone');
    const verificationCode = document.getElementById('verification-code');
    const sendCodeBtn = document.getElementById('send-code-btn');

    // Clear stored phone number and cancel verification process
    this.phoneNumber = null;
    this.codeSent = false;

    // Clear all input fields
    if (phoneInput) phoneInput.value = '';
    if (verificationCode) verificationCode.value = '';

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
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');

    // Prepend selected country code
    return this.selectedCountryCode + digits;
  }

  isValidPhoneNumber(phone) {
    // NANP (+1) requires exactly 10 national digits; the generic E.164 length rule
    // alone would accept a too-short number like +15551234. Shares the validator
    // with lib/phone-e164.js so all surfaces agree.
    if (phone.startsWith('+1')) return /^\+1\d{10}$/.test(phone);
    return isValidE164(phone);
  }

  async sendVerificationCode(phoneNumber, channel = 'sms') {
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
      body: JSON.stringify({ phoneNumber, channel }),
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

    // Create agent config directly in database
    const { data: newConfig, error: createError } = await supabase
      .from('agent_configs')
      .insert({
        user_id: session.user.id,
        name: 'AI Assistant',
        voice_id: '11labs-EXAVITQu4vr4xnSDxMaL',
        system_prompt: defaultPrompt,
        active_voice_stack: 'livekit',
        is_default: true,
      })
      .select()
      .single();

    if (createError) {
      throw new Error(createError.message || 'Failed to create agent');
    }

    return newConfig;
  }

  /**
   * Show modal when user declines push notifications
   */
  async showPushDeclinedModal(userId, destination, isExistingUser) {
    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container" style="max-width: 400px; margin-top: 4rem;">
        <div class="card" style="text-align: center;">
          <div style="width: 64px; height: 64px; background: rgba(239, 68, 68, 0.1); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem;">
            <svg width="32" height="32" fill="none" stroke="rgb(239, 68, 68)" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
              <line x1="4" y1="4" x2="20" y2="20" stroke="rgb(239, 68, 68)" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>

          <h2 style="margin: 0 0 1rem;">Notifications Disabled</h2>

          <p style="color: var(--text-secondary); margin-bottom: 1.5rem; line-height: 1.6;">
            You won't receive any notifications for incoming calls, SMS messages, or chat conversations.
          </p>

          <button class="btn btn-primary btn-full" id="enable-push-btn" style="margin-bottom: 1rem;">
            Enable Notifications
          </button>

          <a href="#" id="continue-without-btn" style="color: var(--text-secondary); font-size: 0.875rem; text-decoration: none;">
            Continue without notifications
          </a>
        </div>
      </div>
    `;

    const enableBtn = document.getElementById('enable-push-btn');
    const continueBtn = document.getElementById('continue-without-btn');

    enableBtn.addEventListener('click', async () => {
      enableBtn.disabled = true;
      enableBtn.textContent = 'Enabling...';

      try {
        const pushResult = await subscribeToPush();

        if (pushResult.success) {
          // Save preference
          await supabase
            .from('notification_preferences')
            .upsert({
              user_id: userId,
              push_enabled: true,
              push_inbound_calls: true,
              push_inbound_messages: true,
            }, { onConflict: 'user_id' });

          enableBtn.textContent = 'Enabled!';
          enableBtn.style.background = 'rgb(34, 197, 94)';

          setTimeout(() => {
            if (isExistingUser) {
              window.location.href = destination;
            } else {
              navigateTo(destination);
            }
          }, 1000);
        } else {
          // Still failed - maybe blocked at OS level
          enableBtn.textContent = 'Enable Notifications';
          enableBtn.disabled = false;

          const errorMsg = document.createElement('p');
          errorMsg.style.cssText = 'color: var(--error-color); font-size: 0.875rem; margin-top: 1rem;';
          errorMsg.textContent = 'Notifications are blocked. Please enable them in your device settings.';
          enableBtn.parentNode.insertBefore(errorMsg, continueBtn);
        }
      } catch (e) {
        console.error('Enable push error:', e);
        enableBtn.textContent = 'Enable Notifications';
        enableBtn.disabled = false;
      }
    });

    continueBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (isExistingUser) {
        window.location.href = destination;
      } else {
        navigateTo(destination);
      }
    });
  }
}