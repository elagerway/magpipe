/**
 * Contacts Management Page
 */

import { Contact } from '../models/Contact.js';
import { getCurrentUser } from '../lib/supabase.js';

export default class ContactsPage {
  constructor() {
    this.contacts = [];
    this.filteredContacts = [];
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    // Fetch contacts
    const { contacts } = await Contact.list(user.id, { orderBy: 'name', ascending: true });
    this.contacts = contacts;
    this.filteredContacts = contacts;

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container" style="padding-top: 2rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
          <h1>Contacts</h1>
          <button class="btn btn-primary" id="add-contact-btn">
            + Add Contact
          </button>
        </div>

        <div class="card" style="margin-bottom: 2rem;">
          <input
            type="search"
            id="search-input"
            class="form-input"
            placeholder="Search contacts by name or phone number..."
          />
        </div>

        <div id="error-message" class="hidden"></div>
        <div id="success-message" class="hidden"></div>

        <div class="card">
          <div id="contacts-list">
            ${this.renderContactsList()}
          </div>
        </div>

        <!-- Add/Edit Contact Modal -->
        <div id="contact-modal" class="modal hidden">
          <div class="modal-content card" style="max-width: 500px; margin: 2rem auto;">
            <h2 id="modal-title">Add Contact</h2>
            <form id="contact-form">
              <div class="form-group">
                <label class="form-label" for="contact-name">Name</label>
                <input
                  type="text"
                  id="contact-name"
                  class="form-input"
                  placeholder="John Doe"
                  required
                />
              </div>

              <div class="form-group">
                <label class="form-label" for="contact-phone">Phone Number</label>
                <input
                  type="tel"
                  id="contact-phone"
                  class="form-input"
                  placeholder="+14155551234"
                  required
                />
                <p class="form-help">E.164 format (e.g., +14155551234)</p>
              </div>

              <div class="form-group">
                <label class="form-label" for="contact-notes">Notes (Optional)</label>
                <textarea
                  id="contact-notes"
                  class="form-textarea"
                  placeholder="Additional notes about this contact..."
                  rows="3"
                ></textarea>
              </div>

              <div class="form-group">
                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                  <input type="checkbox" id="contact-whitelisted" checked />
                  <span>Whitelist this contact</span>
                </label>
                <p class="form-help">Whitelisted contacts bypass vetting</p>
              </div>

              <div style="display: flex; gap: 0.5rem;">
                <button type="submit" class="btn btn-primary btn-full" id="save-contact-btn">
                  Save Contact
                </button>
                <button type="button" class="btn btn-secondary btn-full" id="cancel-modal-btn">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  renderContactsList() {
    if (this.filteredContacts.length === 0) {
      return '<p class="text-muted text-center">No contacts found. Add your first contact to get started.</p>';
    }

    return this.filteredContacts
      .map(
        (contact) => `
        <div class="contact-item" data-id="${contact.id}" style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          border-bottom: 1px solid var(--border-color);
        ">
          <div style="flex: 1;">
            <div style="font-weight: 600; margin-bottom: 0.25rem;">
              ${contact.name}
              ${contact.is_whitelisted
                ? '<span style="display: inline-block; padding: 0.125rem 0.5rem; background: var(--success-color); color: white; border-radius: 9999px; font-size: 0.75rem; margin-left: 0.5rem;">Whitelisted</span>'
                : ''
              }
            </div>
            <div class="text-sm text-muted">${this.formatPhoneNumber(contact.phone_number)}</div>
            ${contact.notes ? `<div class="text-sm text-muted mt-1">${contact.notes}</div>` : ''}
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn btn-secondary btn-sm edit-contact-btn" data-id="${contact.id}">
              Edit
            </button>
            <button class="btn btn-danger btn-sm delete-contact-btn" data-id="${contact.id}">
              Delete
            </button>
          </div>
        </div>
      `
      )
      .join('');
  }

  formatPhoneNumber(phoneNumber) {
    const cleaned = phoneNumber.replace(/\D/g, '');
    const match = cleaned.match(/^1?(\d{3})(\d{3})(\d{4})$/);

    if (match) {
      return `(${match[1]}) ${match[2]}-${match[3]}`;
    }

    return phoneNumber;
  }

  attachEventListeners() {
    const addContactBtn = document.getElementById('add-contact-btn');
    const contactModal = document.getElementById('contact-modal');
    const contactForm = document.getElementById('contact-form');
    const cancelModalBtn = document.getElementById('cancel-modal-btn');
    const searchInput = document.getElementById('search-input');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');

    // Search
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      this.filteredContacts = this.contacts.filter(
        (contact) =>
          contact.name.toLowerCase().includes(query) ||
          contact.phone_number.includes(query)
      );
      document.getElementById('contacts-list').innerHTML = this.renderContactsList();
      this.attachContactListeners();
    });

    // Add contact
    addContactBtn.addEventListener('click', () => {
      this.editingContactId = null;
      document.getElementById('modal-title').textContent = 'Add Contact';
      contactForm.reset();
      document.getElementById('contact-whitelisted').checked = true;
      contactModal.classList.remove('hidden');
    });

    // Cancel modal
    cancelModalBtn.addEventListener('click', () => {
      contactModal.classList.add('hidden');
    });

    // Save contact
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveContact(errorMessage, successMessage, contactModal);
      this.attachContactListeners();
    });

    this.attachContactListeners();
  }

  attachContactListeners() {
    const contactModal = document.getElementById('contact-modal');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');

    // Edit buttons
    document.querySelectorAll('.edit-contact-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const contactId = e.target.dataset.id;
        const contact = this.contacts.find((c) => c.id === contactId);

        if (contact) {
          this.editingContactId = contactId;
          document.getElementById('modal-title').textContent = 'Edit Contact';
          document.getElementById('contact-name').value = contact.name;
          document.getElementById('contact-phone').value = contact.phone_number;
          document.getElementById('contact-notes').value = contact.notes || '';
          document.getElementById('contact-whitelisted').checked = contact.is_whitelisted;
          contactModal.classList.remove('hidden');
        }
      });
    });

    // Delete buttons
    document.querySelectorAll('.delete-contact-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const contactId = e.target.dataset.id;
        const contact = this.contacts.find((c) => c.id === contactId);

        if (contact && confirm(`Delete contact "${contact.name}"?`)) {
          const { error } = await Contact.delete(contactId);

          if (error) {
            errorMessage.className = 'alert alert-error';
            errorMessage.textContent = 'Failed to delete contact';
          } else {
            successMessage.className = 'alert alert-success';
            successMessage.textContent = 'Contact deleted successfully';

            // Refresh list
            const { user } = await getCurrentUser();
            const { contacts } = await Contact.list(user.id, { orderBy: 'name', ascending: true });
            this.contacts = contacts;
            this.filteredContacts = contacts;
            document.getElementById('contacts-list').innerHTML = this.renderContactsList();
            this.attachContactListeners();
          }
        }
      });
    });
  }

  async saveContact(errorMessage, successMessage, contactModal) {
    const contactData = {
      name: document.getElementById('contact-name').value,
      phone_number: document.getElementById('contact-phone').value,
      notes: document.getElementById('contact-notes').value || null,
      is_whitelisted: document.getElementById('contact-whitelisted').checked,
    };

    errorMessage.classList.add('hidden');
    successMessage.classList.add('hidden');

    try {
      const { user } = await getCurrentUser();

      if (this.editingContactId) {
        // Update existing contact
        const { error } = await Contact.update(this.editingContactId, contactData);
        if (error) throw error;

        successMessage.className = 'alert alert-success';
        successMessage.textContent = 'Contact updated successfully';
      } else {
        // Create new contact
        const { error } = await Contact.create(user.id, contactData);
        if (error) throw error;

        successMessage.className = 'alert alert-success';
        successMessage.textContent = 'Contact added successfully';
      }

      // Refresh list
      const { contacts } = await Contact.list(user.id, { orderBy: 'name', ascending: true });
      this.contacts = contacts;
      this.filteredContacts = contacts;
      document.getElementById('contacts-list').innerHTML = this.renderContactsList();

      // Close modal
      contactModal.classList.add('hidden');
    } catch (error) {
      console.error('Save contact error:', error);
      errorMessage.className = 'alert alert-error';
      errorMessage.textContent = error.message || 'Failed to save contact';
    }
  }
}