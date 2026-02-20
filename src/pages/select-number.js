/**
 * Service Number Selection Page
 * Phone number search with country, area code, and city filters
 */

import { User } from '../models/User.js';
import { getCurrentUser, supabase } from '../lib/supabase.js';
import { canAddPhoneNumber } from '../services/planService.js';
import { renderBottomNav } from '../components/BottomNav.js';
import { showToast } from '../lib/toast.js';

export default class SelectNumberPage {
  constructor() {
    this.availableNumbers = [];
    this.selectedNumber = null;
    this.numberType = 'local';
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    const phoneCheck = await canAddPhoneNumber(user.id);
    const appElement = document.getElementById('app');

    if (!phoneCheck.canAdd) {
      appElement.innerHTML = `
        <div class="container with-bottom-nav" style="max-width: 600px; padding-top: 1.5rem;">
          <button onclick="navigateTo(window.innerWidth > 768 ? '/phone' : '/manage-numbers')" style="
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            padding: 0.5rem 0.5rem 0.5rem 0;
            display: flex;
            align-items: center;
            gap: 0.25rem;
            font-size: 0.875rem;
            transition: color 0.2s;
            margin-bottom: 1rem;
          " onmouseover="this.style.color='var(--primary-color)'" onmouseout="this.style.color='var(--text-secondary)'">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
            Back
          </button>

          <div class="card" style="text-align: center;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto; color: var(--warning-color);">
                <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <h2 style="margin-bottom: 0.5rem;">Phone Number Limit Reached</h2>
            <p class="text-muted" style="margin-bottom: 1.5rem;">
              Your Free plan includes ${phoneCheck.limit} phone number${phoneCheck.limit > 1 ? 's' : ''}.
              You currently have ${phoneCheck.current} number${phoneCheck.current > 1 ? 's' : ''}.
            </p>
            <div style="background: var(--bg-secondary); border-radius: var(--radius-md); padding: 1rem; margin-bottom: 1.5rem;">
              <h3 style="margin: 0 0 0.5rem 0; font-size: 1rem;">Upgrade to Pro for:</h3>
              <ul style="text-align: left; margin: 0; padding-left: 1.25rem; color: var(--text-secondary);">
                <li>Unlimited phone numbers</li>
                <li>Voice cloning</li>
                <li>Unlimited calls, minutes, and SMS</li>
                <li>Priority support</li>
              </ul>
            </div>
            <button class="btn btn-primary btn-full" onclick="navigateTo('/settings')">
              Upgrade to Pro - $9.99/month
            </button>
          </div>
        </div>
        ${renderBottomNav('/phone')}
      `;
      return;
    }

    appElement.innerHTML = `
      <div class="container with-bottom-nav" style="max-width: 850px; padding-top: 1.5rem;">
        <button onclick="navigateTo(window.innerWidth > 768 ? '/phone' : '/manage-numbers')" class="mobile-only" style="
          background: none;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          padding: 0.5rem 0.5rem 0.5rem 0;
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.875rem;
          transition: color 0.2s;
          margin-bottom: 1rem;
        " onmouseover="this.style.color='var(--primary-color)'" onmouseout="this.style.color='var(--text-secondary)'">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
          Back
        </button>

        <div class="card" style="padding: 1.5rem;">
          <!-- Header -->
          <h2 style="margin: 0 0 1.5rem 0; font-size: 1.25rem; font-weight: 600;">Choose your phone number</h2>

          <!-- Search controls -->
          <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1.5rem; align-items: flex-start;">
            <!-- Area code search + Local/Toll Free toggle -->
            <div style="flex: 0 0 auto;">
              <div style="display: flex; gap: 0.5rem; align-items: center;">
                <div style="position: relative;">
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="position: absolute; left: 0.625rem; top: 50%; transform: translateY(-50%); color: var(--text-secondary); pointer-events: none;">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                  </svg>
                  <input type="text" id="area-code-input" class="form-input" placeholder="Area code"
                    style="width: 130px; padding-left: 2rem;" maxlength="3" />
                </div>
                <button class="btn btn-primary" id="area-code-search-btn" style="white-space: nowrap;">Search</button>
              </div>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem;">
                <span style="font-size: 0.8rem; color: var(--text-secondary);">Local</span>
                <label class="toggle-switch" style="vertical-align: middle;">
                  <input type="checkbox" id="number-type-toggle" />
                  <span class="toggle-slider"></span>
                </label>
                <span style="font-size: 0.8rem; color: var(--text-secondary);">Toll Free</span>
              </div>
            </div>

            <!-- City search -->
            <div style="flex: 0 1 auto;">
              <div style="display: flex; gap: 0.5rem; align-items: center;">
                <div style="position: relative;">
                  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="position: absolute; left: 0.625rem; top: 50%; transform: translateY(-50%); color: var(--text-secondary); pointer-events: none;">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                  </svg>
                  <input type="text" id="city-input" class="form-input" placeholder="City"
                    style="width: 150px; padding-left: 2rem;" />
                </div>
                <button class="btn btn-primary" id="city-search-btn" style="white-space: nowrap;">Search</button>
              </div>
            </div>
          </div>

          <!-- Results table -->
          <div id="results-section" style="display: none; border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden;">
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: var(--bg-secondary);">
                  <th style="text-align: left; padding: 0.75rem 1rem; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.05em;">Phone Number</th>
                  <th style="text-align: left; padding: 0.75rem 1rem; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.05em;">Capabilities</th>
                  <th style="text-align: right; padding: 0.75rem 1rem; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.05em;">Price</th>
                </tr>
              </thead>
              <tbody id="numbers-list"></tbody>
            </table>
          </div>

          <!-- Empty state -->
          <div id="empty-state" style="text-align: center; padding: 3rem 1rem; color: var(--text-secondary);">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin: 0 auto 1rem; opacity: 0.4;">
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
            </svg>
            <p style="margin: 0;">Search for available phone numbers using the controls above</p>
          </div>

          <!-- Loading state -->
          <div id="loading-state" style="display: none; text-align: center; padding: 3rem 1rem;">
            <div class="spinner"></div>
            <p style="color: var(--text-secondary); margin-top: 1rem;">Searching available numbers...</p>
          </div>

          <!-- Footer with Cancel / Next -->
          <div style="display: flex; justify-content: flex-end; gap: 0.75rem; padding-top: 1rem; margin-top: 1.5rem; border-top: 1px solid var(--border-color);">
            <button class="btn btn-secondary" onclick="navigateTo(window.innerWidth > 768 ? '/phone' : '/manage-numbers')">Cancel</button>
            <button class="btn btn-primary" id="next-btn" disabled>Next</button>
          </div>
        </div>
      </div>
      ${renderBottomNav('/phone')}
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    // Number type toggle
    const toggle = document.getElementById('number-type-toggle');
    toggle.addEventListener('change', () => {
      this.numberType = toggle.checked ? 'tollFree' : 'local';
    });

    // Area code search
    const areaCodeBtn = document.getElementById('area-code-search-btn');
    const areaCodeInput = document.getElementById('area-code-input');

    areaCodeBtn.addEventListener('click', () => {
      const areaCode = areaCodeInput.value.trim();
      if (!areaCode) {
        showToast('Please enter an area code', 'error');
        return;
      }
      this.performSearch({ areaCode, numberType: this.numberType });
    });

    areaCodeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') areaCodeBtn.click();
    });

    // City search
    const cityBtn = document.getElementById('city-search-btn');
    const cityInput = document.getElementById('city-input');

    cityBtn.addEventListener('click', () => {
      const city = cityInput.value.trim();
      if (!city) {
        showToast('Please enter a city name', 'error');
        return;
      }
      this.performSearch({ city, numberType: this.numberType });
    });

    cityInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') cityBtn.click();
    });

    // Next button
    const nextBtn = document.getElementById('next-btn');
    nextBtn.addEventListener('click', async () => {
      if (!this.selectedNumber) return;

      nextBtn.disabled = true;
      nextBtn.textContent = 'Provisioning...';

      try {
        await this.provisionNumber(this.selectedNumber);

        const { user } = await getCurrentUser();
        await User.setServiceNumber(user.id, this.selectedNumber);

        showToast('Number added successfully! Redirecting...', 'success');

        setTimeout(() => {
          const destination = window.innerWidth > 768 ? '/phone' : '/manage-numbers';
          navigateTo(destination);
        }, 1500);
      } catch (error) {
        console.error('Provision error:', error);
        showToast(error.message || 'Failed to provision number. Please try again.', 'error');

        nextBtn.disabled = false;
        nextBtn.textContent = 'Next';
      }
    });
  }

  async performSearch(params) {
    const resultsSection = document.getElementById('results-section');
    const emptyState = document.getElementById('empty-state');
    const loadingState = document.getElementById('loading-state');

    // Show loading
    resultsSection.style.display = 'none';
    emptyState.style.display = 'none';
    loadingState.style.display = 'block';

    // Disable all search buttons
    const searchBtns = document.querySelectorAll('#area-code-search-btn, #city-search-btn');
    searchBtns.forEach(btn => { btn.disabled = true; });

    try {
      const result = await this.searchNumbers(params);
      this.availableNumbers = result.numbers || [];
      this.selectedNumber = null;

      // Update Next button state
      document.getElementById('next-btn').disabled = true;

      if (this.availableNumbers.length === 0) {
        showToast('No numbers found. Try a different search.', 'warning');
        loadingState.style.display = 'none';
        emptyState.style.display = 'block';
      } else {
        if (result.usedFallback) {
          showToast('Showing available numbers from nearby area codes in the same region.', 'info');
        }
        this.renderNumbersList();
        loadingState.style.display = 'none';
        resultsSection.style.display = 'block';
      }
    } catch (error) {
      console.error('Search error:', error);
      showToast('Failed to search for numbers. Please try again.', 'error');
      loadingState.style.display = 'none';
      emptyState.style.display = 'block';
    } finally {
      searchBtns.forEach(btn => { btn.disabled = false; });
    }
  }

  renderNumbersList() {
    const numbersList = document.getElementById('numbers-list');

    numbersList.innerHTML = this.availableNumbers
      .map((number) => {
        const caps = [];
        if (number.capabilities?.voice) caps.push('voice');
        if (number.capabilities?.sms) caps.push('sms');
        if (number.capabilities?.mms) caps.push('mms');
        if (number.capabilities?.fax) caps.push('fax');
        const capsText = caps.length > 0 ? caps.join(', ') : 'none';

        return `
          <tr class="sn-number-row" data-number="${number.phone_number}" style="cursor: pointer; border-bottom: 1px solid var(--border-color); transition: background-color 0.15s;">
            <td style="padding: 0.75rem 1rem;">
              <div style="font-weight: 600; font-size: 0.95rem;">${this.formatPhoneNumber(number.phone_number)}</div>
              <div style="font-size: 0.75rem; color: var(--text-secondary); text-transform: uppercase;">${number.locality || 'Unknown'}${number.region ? ', ' + number.region : ''}</div>
            </td>
            <td style="padding: 0.75rem 1rem; color: var(--text-secondary); font-size: 0.875rem;">${capsText}</td>
            <td style="padding: 0.75rem 1rem; text-align: right; color: var(--text-secondary); font-size: 0.875rem;">US $0</td>
          </tr>
        `;
      })
      .join('');

    // Row click handlers
    document.querySelectorAll('.sn-number-row').forEach(row => {
      row.addEventListener('click', () => {
        // Deselect all
        document.querySelectorAll('.sn-number-row').forEach(r => {
          r.style.backgroundColor = '';
        });

        // Select this row
        row.style.backgroundColor = 'rgba(99, 102, 241, 0.08)';
        this.selectedNumber = row.dataset.number;

        // Enable Next button
        document.getElementById('next-btn').disabled = false;
      });

      // Hover effect
      row.addEventListener('mouseenter', () => {
        if (row.dataset.number !== this.selectedNumber) {
          row.style.backgroundColor = 'rgba(99, 102, 241, 0.04)';
        }
      });
      row.addEventListener('mouseleave', () => {
        if (row.dataset.number !== this.selectedNumber) {
          row.style.backgroundColor = '';
        }
      });
    });
  }

  formatPhoneNumber(phoneNumber) {
    const cleaned = phoneNumber.replace(/\D/g, '');
    const match = cleaned.match(/^1?(\d{3})(\d{3})(\d{4})$/);
    if (match) {
      return `+1 ${match[1]}-${match[2]}-${match[3]}`;
    }
    return phoneNumber;
  }

  async searchNumbers(params) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      throw new Error('You must be logged in to search for phone numbers');
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/search-phone-numbers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to search phone numbers');
    }

    const result = await response.json();
    return {
      numbers: result.numbers || [],
      usedFallback: result.usedFallback || false,
      searchedQuery: result.searchedQuery
    };
  }

  async provisionNumber(phoneNumber) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      throw new Error('You must be logged in to provision a phone number');
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/provision-phone-number`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ phoneNumber }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to provision phone number');
    }

    return await response.json();
  }
}
