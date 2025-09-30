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

            <button class="btn btn-primary btn-full mt-3" id="confirm-btn" disabled>
              Confirm Selection
            </button>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    const searchBtn = document.getElementById('search-btn');
    const confirmBtn = document.getElementById('confirm-btn');
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

    confirmBtn.addEventListener('click', async () => {
      if (!this.selectedNumber) return;

      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Provisioning number...';
      errorMessage.classList.add('hidden');
      successMessage.classList.add('hidden');

      try {
        // In production, call Supabase Edge Function to provision number via SignalWire
        const result = await this.provisionNumber(this.selectedNumber);

        // Update user profile with service number
        const { user } = await getCurrentUser();
        await User.setServiceNumber(user.id, this.selectedNumber);

        successMessage.className = 'alert alert-success';
        successMessage.textContent = 'Service number purchased successfully! Redirecting...';

        setTimeout(() => {
          navigateTo('/dashboard');
        }, 1500);
      } catch (error) {
        console.error('Provision error:', error);
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = error.message || 'Failed to provision number. Please try again.';

        // Log full error details for debugging
        console.error('Full error details:', error);

        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirm Selection';
      }
    });
  }

  renderNumbersList() {
    const numbersList = document.getElementById('numbers-list');
    const confirmBtn = document.getElementById('confirm-btn');

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
            </div>
            <div class="text-sm" style="color: var(--primary-color);">
              Select
            </div>
          </div>
        </div>
      `
      )
      .join('');

    // Add click handlers to number options
    document.querySelectorAll('.number-option').forEach((option) => {
      option.addEventListener('click', () => {
        // Remove selection from all options
        document.querySelectorAll('.number-option').forEach((opt) => {
          opt.style.borderColor = 'var(--border-color)';
          opt.style.backgroundColor = 'var(--bg-primary)';
        });

        // Highlight selected option
        option.style.borderColor = 'var(--primary-color)';
        option.style.backgroundColor = 'rgba(99, 102, 241, 0.05)';

        // Store selection
        this.selectedNumber = option.dataset.number;

        // Enable confirm button
        confirmBtn.disabled = false;
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