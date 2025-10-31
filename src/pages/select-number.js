/**
 * Service Number Selection Page
 */

import { User } from '../models/User.js';
import { getCurrentUser, supabase } from '../lib/supabase.js';

export default class SelectNumberPage {
  constructor() {
    this.availableNumbers = [];
    this.selectedNumber = null;
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container" style="max-width: 600px; margin-top: 4rem;">
        <button onclick="navigateTo('/manage-numbers')" style="
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

        <div class="card">
          <h1 class="text-center">Select Your Service Number</h1>
          <p class="text-center text-muted">
            Choose a phone number that callers will use to reach Pat
          </p>

          <div id="error-message" class="hidden"></div>
          <div id="success-message" class="hidden"></div>

          <div id="search-form">
            <div class="form-group">
              <label class="form-label" for="search-query">Search by Area Code or Location</label>
              <input
                type="text"
                id="search-query"
                class="form-input"
                placeholder="e.g., 415 or San Francisco, CA"
              />
              <p class="form-help">Enter an area code (e.g., 415) or city and state</p>
            </div>

            <button class="btn btn-primary btn-full" id="search-btn">
              Search Available Numbers
            </button>
          </div>

          <div id="results-section" class="hidden" style="margin-top: 2rem;">
            <h3>Available Numbers</h3>
            <div id="numbers-list"></div>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    const searchBtn = document.getElementById('search-btn');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');
    const resultsSection = document.getElementById('results-section');

    searchBtn.addEventListener('click', async () => {
      const searchQuery = document.getElementById('search-query').value;

      if (!searchQuery.trim()) {
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = 'Please enter an area code or location';
        return;
      }

      searchBtn.disabled = true;
      searchBtn.textContent = 'Searching...';
      errorMessage.classList.add('hidden');
      successMessage.classList.add('hidden');

      try {
        // In production, call Supabase Edge Function to search SignalWire
        const result = await this.searchNumbers(searchQuery);
        this.availableNumbers = result.numbers || [];

        if (this.availableNumbers.length === 0) {
          errorMessage.className = 'alert alert-warning';
          errorMessage.textContent = 'No numbers found for this search. Try a different area code or location.';
          resultsSection.classList.add('hidden');
        } else {
          // Show info message if fallback area codes were used
          if (result.usedFallback) {
            successMessage.className = 'alert alert-info';
            successMessage.textContent = `No numbers found for ${searchQuery}. Showing available numbers from nearby area codes in the same region.`;
          }

          this.renderNumbersList();
          resultsSection.classList.remove('hidden');
        }

        searchBtn.disabled = false;
        searchBtn.textContent = 'Search Available Numbers';
      } catch (error) {
        console.error('Search error:', error);
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = 'Failed to search for numbers. Please try again.';

        searchBtn.disabled = false;
        searchBtn.textContent = 'Search Available Numbers';
      }
    });
  }

  renderNumbersList() {
    const numbersList = document.getElementById('numbers-list');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');

    numbersList.innerHTML = this.availableNumbers
      .map(
        (number) => `
        <div class="number-option" data-number="${number.phone_number}" style="
          padding: 1rem;
          border: 2px solid var(--border-color);
          border-radius: var(--radius-md);
          margin-bottom: 0.75rem;
          cursor: pointer;
          transition: all 0.2s ease;
        ">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 1.125rem; font-weight: 600;">${this.formatPhoneNumber(number.phone_number)}</div>
              <div class="text-sm text-muted">${number.locality}, ${number.region}</div>
              <div style="margin-top: 0.25rem; display: flex; gap: 0.5rem;">
                ${number.capabilities?.voice ? '<span style="display: inline-block; padding: 0.125rem 0.5rem; background: rgba(34, 197, 94, 0.1); color: rgb(34, 197, 94); border-radius: 0.25rem; font-size: 0.75rem; font-weight: 500;">Voice</span>' : '<span style="display: inline-block; padding: 0.125rem 0.5rem; background: rgba(156, 163, 175, 0.1); color: rgb(107, 114, 128); border-radius: 0.25rem; font-size: 0.75rem; font-weight: 500;">No Voice</span>'}
                ${number.capabilities?.sms ? '<span style="display: inline-block; padding: 0.125rem 0.5rem; background: rgba(59, 130, 246, 0.1); color: rgb(59, 130, 246); border-radius: 0.25rem; font-size: 0.75rem; font-weight: 500;">SMS</span>' : '<span style="display: inline-block; padding: 0.125rem 0.5rem; background: rgba(156, 163, 175, 0.1); color: rgb(107, 114, 128); border-radius: 0.25rem; font-size: 0.75rem; font-weight: 500;">No SMS</span>'}
              </div>
            </div>
            <button class="purchase-btn" style="
              background: var(--primary-color);
              color: white;
              border: none;
              padding: 0.5rem 1rem;
              border-radius: var(--radius-sm);
              font-size: 0.875rem;
              cursor: pointer;
              transition: all 0.2s ease;
              display: none;
            ">
              Purchase
            </button>
            <div class="select-text" style="color: var(--primary-color); font-size: 0.875rem;">
              Select
            </div>
          </div>
        </div>
      `
      )
      .join('');

    // Add click handlers to number options
    document.querySelectorAll('.number-option').forEach((option) => {
      const purchaseBtn = option.querySelector('.purchase-btn');
      const selectText = option.querySelector('.select-text');

      option.addEventListener('click', (e) => {
        // Don't trigger if clicking the purchase button
        if (e.target.classList.contains('purchase-btn')) return;

        // Remove selection from all options
        document.querySelectorAll('.number-option').forEach((opt) => {
          opt.style.borderColor = 'var(--border-color)';
          opt.style.backgroundColor = 'var(--bg-primary)';
          opt.querySelector('.purchase-btn').style.display = 'none';
          opt.querySelector('.select-text').style.display = 'block';
        });

        // Highlight selected option and show purchase button
        option.style.borderColor = 'var(--primary-color)';
        option.style.backgroundColor = 'rgba(99, 102, 241, 0.05)';
        purchaseBtn.style.display = 'block';
        selectText.style.display = 'none';

        // Store selection
        this.selectedNumber = option.dataset.number;
      });

      // Handle purchase button click
      purchaseBtn.addEventListener('click', async (e) => {
        e.stopPropagation();

        if (!this.selectedNumber) return;

        purchaseBtn.disabled = true;
        purchaseBtn.textContent = 'Purchasing...';
        errorMessage.classList.add('hidden');
        successMessage.classList.add('hidden');

        try {
          // Provision number via SignalWire
          const result = await this.provisionNumber(this.selectedNumber);

          // Update user profile with service number
          const { user } = await getCurrentUser();
          await User.setServiceNumber(user.id, this.selectedNumber);

          successMessage.className = 'alert alert-success';
          successMessage.textContent = 'Service number purchased successfully! Redirecting...';

          setTimeout(() => {
            navigateTo('/manage-numbers');
          }, 1500);
        } catch (error) {
          console.error('Provision error:', error);
          errorMessage.className = 'alert alert-error';
          errorMessage.textContent = error.message || 'Failed to provision number. Please try again.';

          purchaseBtn.disabled = false;
          purchaseBtn.textContent = 'Purchase';
        }
      });
    });
  }

  formatPhoneNumber(phoneNumber) {
    // Format E.164 number as (XXX) XXX-XXXX
    const cleaned = phoneNumber.replace(/\D/g, '');
    const match = cleaned.match(/^1?(\d{3})(\d{3})(\d{4})$/);

    if (match) {
      return `(${match[1]}) ${match[2]}-${match[3]}`;
    }

    return phoneNumber;
  }

  async searchNumbers(query) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const response = await fetch(`${supabaseUrl}/functions/v1/search-phone-numbers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ query }),
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