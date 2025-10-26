/**
 * Contacts Management Page
 */

import { Contact } from '../models/Contact.js';
import { getCurrentUser, supabase } from '../lib/supabase.js';
import { renderBottomNav } from '../components/BottomNav.js';

export default class ContactsPage {
  constructor() {
    this.contacts = [];
    this.filteredContacts = [];
    this.editingContact = null;
    this.avatarFile = null;
  }

  async render() {
    const { user } = await getCurrentUser();

    if (!user) {
      navigateTo('/login');
      return;
    }

    this.userId = user.id;

    // Fetch contacts
    const { contacts } = await Contact.list(user.id, { orderBy: 'first_name', ascending: true });
    this.contacts = contacts;
    this.filteredContacts = contacts;

    const appElement = document.getElementById('app');

    appElement.innerHTML = `
      <div class="container with-bottom-nav" style="padding-top: 0;">
        <div class="card" style="margin-bottom: 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h1 style="margin: 0; font-size: 1.5rem;">Contacts</h1>
            <div style="display: flex; gap: 0.5rem;">
              <button id="import-contacts-btn" class="btn btn-secondary" style="display: flex; align-items: center; gap: 0.5rem;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Import
              </button>
              <button class="btn btn-primary" id="add-contact-btn" style="display: flex; align-items: center; gap: 0.5rem;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Add
              </button>
            </div>
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

        <!-- Import CSV Modal -->
        <div id="import-modal" class="modal hidden">
          <div class="modal-backdrop"></div>
          <div class="modal-content card">
            <h2>Import Contacts from CSV</h2>
            <p style="margin-bottom: 1rem; color: var(--text-secondary);">
              Upload a CSV file with the following columns:
            </p>
            <ul style="margin-bottom: 1rem; padding-left: 1.5rem; color: var(--text-secondary);">
              <li><strong>First Name</strong> (required)</li>
              <li><strong>Last Name</strong> (optional)</li>
              <li><strong>Phone</strong> (required) - E.164 format (e.g., +14155551234)</li>
              <li><strong>Email</strong> (optional)</li>
              <li><strong>Address</strong> (optional)</li>
            </ul>
            <p style="margin-bottom: 1.5rem; font-size: 0.875rem; color: var(--text-muted);">
              <strong>Example CSV format:</strong><br>
              <code style="display: block; background: var(--bg-secondary); padding: 0.5rem; border-radius: 4px; margin-top: 0.5rem;">
First Name,Last Name,Phone,Email,Address<br>
John,Doe,+14155551234,john@example.com,"123 Main St, City, State"
              </code>
            </p>
            <div style="display: flex; gap: 0.5rem;">
              <button type="button" class="btn btn-primary btn-full" id="choose-csv-btn">
                Choose CSV File
              </button>
              <button type="button" class="btn btn-secondary btn-full" id="cancel-import-btn">
                Cancel
              </button>
            </div>
          </div>
        </div>

        <!-- Add/Edit Contact Modal -->
        <div id="contact-modal" class="modal hidden">
          <div class="modal-backdrop"></div>
          <div class="modal-content card">
            <h2 id="modal-title">Add Contact</h2>
            <form id="contact-form">
              <!-- Avatar Upload -->
              <div class="form-group">
                <label class="form-label">Avatar</label>
                <div style="display: flex; align-items: center; gap: 1rem;">
                  <div id="avatar-preview" style="
                    width: 80px;
                    height: 80px;
                    border-radius: 50%;
                    background: var(--border-color);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                    flex-shrink: 0;
                  ">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                  </div>
                  <div style="flex: 1;">
                    <input
                      type="file"
                      id="contact-avatar"
                      accept="image/*"
                      style="display: none;"
                    />
                    <button type="button" id="upload-avatar-btn" class="btn btn-secondary" style="margin-bottom: 0.5rem;">
                      Choose Photo
                    </button>
                    <button type="button" id="remove-avatar-btn" class="btn btn-secondary" style="display: none; margin-bottom: 0.5rem;">
                      Remove
                    </button>
                    <p class="form-help" style="margin: 0;">JPG, PNG, or GIF (max 2MB)</p>
                  </div>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="contact-first-name">First Name</label>
                <input
                  type="text"
                  id="contact-first-name"
                  class="form-input"
                  placeholder="John"
                  required
                />
              </div>

              <div class="form-group">
                <label class="form-label" for="contact-last-name">Last Name</label>
                <input
                  type="text"
                  id="contact-last-name"
                  class="form-input"
                  placeholder="Doe"
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
                <label class="form-label" for="contact-email">Email</label>
                <input
                  type="email"
                  id="contact-email"
                  class="form-input"
                  placeholder="john.doe@example.com"
                />
              </div>

              <div class="form-group">
                <label class="form-label" for="contact-address">Address</label>
                <textarea
                  id="contact-address"
                  class="form-textarea"
                  placeholder="123 Main St, City, State ZIP"
                  rows="2"
                ></textarea>
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
      ${renderBottomNav('/contacts')}
    `;

    this.attachEventListeners();
  }

  renderContactsList() {
    if (this.filteredContacts.length === 0) {
      return '<p class="text-muted text-center">No contacts found. Add your first contact to get started.</p>';
    }

    return this.filteredContacts
      .map(
        (contact) => {
          const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
          const displayName = fullName || contact.name || 'Unnamed Contact';

          return `
        <div class="contact-item" data-id="${contact.id}" style="
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          border-bottom: 1px solid var(--border-color);
        ">
          <div style="display: flex; align-items: center; gap: 1rem; flex: 1;">
            <div style="
              width: 50px;
              height: 50px;
              border-radius: 50%;
              background: var(--border-color);
              display: flex;
              align-items: center;
              justify-content: center;
              overflow: hidden;
              flex-shrink: 0;
            ">
              ${contact.avatar_url
                ? `<img src="${contact.avatar_url}" alt="${displayName}" style="width: 100%; height: 100%; object-fit: cover;" />`
                : `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>`
              }
            </div>
            <div style="flex: 1; min-width: 0;">
              <div style="font-weight: 600; margin-bottom: 0.25rem;">
                ${displayName}
                ${contact.is_whitelisted
                  ? '<span style="display: inline-block; padding: 0.125rem 0.5rem; background: var(--success-color); color: white; border-radius: 9999px; font-size: 0.75rem; margin-left: 0.5rem;">Whitelisted</span>'
                  : ''
                }
              </div>
              <div class="text-sm text-muted">${this.formatPhoneNumber(contact.phone_number)}</div>
              ${contact.email ? `<div class="text-sm text-muted">${contact.email}</div>` : ''}
              ${contact.notes ? `<div class="text-sm text-muted mt-1">${contact.notes}</div>` : ''}
            </div>
          </div>
          <div style="display: flex; gap: 0.5rem; flex-shrink: 0;">
            <button class="btn btn-secondary btn-sm edit-contact-btn" data-id="${contact.id}">
              Edit
            </button>
            <button class="btn btn-danger btn-sm delete-contact-btn" data-id="${contact.id}">
              Delete
            </button>
          </div>
        </div>
      `;
        }
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
    const importContactsBtn = document.getElementById('import-contacts-btn');
    const contactModal = document.getElementById('contact-modal');
    const contactForm = document.getElementById('contact-form');
    const cancelModalBtn = document.getElementById('cancel-modal-btn');
    const searchInput = document.getElementById('search-input');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');
    const uploadAvatarBtn = document.getElementById('upload-avatar-btn');
    const removeAvatarBtn = document.getElementById('remove-avatar-btn');
    const avatarInput = document.getElementById('contact-avatar');

    // Search
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      this.filteredContacts = this.contacts.filter(
        (contact) => {
          const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ').toLowerCase();
          const name = (contact.name || '').toLowerCase();
          return fullName.includes(query) ||
                 name.includes(query) ||
                 contact.phone_number.includes(query) ||
                 (contact.email && contact.email.toLowerCase().includes(query));
        }
      );
      document.getElementById('contacts-list').innerHTML = this.renderContactsList();
      this.attachContactListeners();
    });

    // Add contact
    addContactBtn.addEventListener('click', () => {
      this.editingContactId = null;
      this.avatarFile = null;
      document.getElementById('modal-title').textContent = 'Add Contact';
      contactForm.reset();
      document.getElementById('contact-whitelisted').checked = true;
      this.resetAvatarPreview();
      contactModal.classList.remove('hidden');
    });

    // Import contacts
    importContactsBtn.addEventListener('click', async () => {
      await this.importContacts(errorMessage, successMessage);
    });

    // Avatar upload
    uploadAvatarBtn.addEventListener('click', () => {
      avatarInput.click();
    });

    avatarInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        // Check file size (max 2MB)
        if (file.size > 2 * 1024 * 1024) {
          errorMessage.className = 'alert alert-error';
          errorMessage.textContent = 'Image must be less than 2MB';
          return;
        }

        this.avatarFile = file;

        // Preview the image
        const reader = new FileReader();
        reader.onload = (e) => {
          const preview = document.getElementById('avatar-preview');
          preview.innerHTML = `<img src="${e.target.result}" style="width: 100%; height: 100%; object-fit: cover;" />`;
          removeAvatarBtn.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });

    removeAvatarBtn.addEventListener('click', () => {
      this.avatarFile = null;
      avatarInput.value = '';
      this.resetAvatarPreview();
    });

    // Cancel modal
    cancelModalBtn.addEventListener('click', () => {
      contactModal.classList.add('hidden');
    });

    // Close modal when clicking backdrop
    contactModal.addEventListener('click', (e) => {
      if (e.target === contactModal || e.target.classList.contains('modal-backdrop')) {
        contactModal.classList.add('hidden');
      }
    });

    // Save contact
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveContact(errorMessage, successMessage, contactModal);
      this.attachContactListeners();
    });

    this.attachContactListeners();
  }

  resetAvatarPreview() {
    const preview = document.getElementById('avatar-preview');
    const removeBtn = document.getElementById('remove-avatar-btn');
    preview.innerHTML = `
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>
    `;
    removeBtn.style.display = 'none';
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
          this.avatarFile = null;
          document.getElementById('modal-title').textContent = 'Edit Contact';
          document.getElementById('contact-first-name').value = contact.first_name || '';
          document.getElementById('contact-last-name').value = contact.last_name || '';
          document.getElementById('contact-phone').value = contact.phone_number;
          document.getElementById('contact-email').value = contact.email || '';
          document.getElementById('contact-address').value = contact.address || '';
          document.getElementById('contact-notes').value = contact.notes || '';
          document.getElementById('contact-whitelisted').checked = contact.is_whitelisted;

          // Set avatar preview
          const preview = document.getElementById('avatar-preview');
          const removeBtn = document.getElementById('remove-avatar-btn');
          if (contact.avatar_url) {
            const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
            preview.innerHTML = `<img src="${contact.avatar_url}" alt="${fullName}" style="width: 100%; height: 100%; object-fit: cover;" />`;
            removeBtn.style.display = 'block';
          } else {
            this.resetAvatarPreview();
          }

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
    errorMessage.classList.add('hidden');
    successMessage.classList.add('hidden');

    try {
      const { user } = await getCurrentUser();

      // Upload avatar if a new file was selected
      let avatarUrl = null;
      if (this.avatarFile) {
        const fileExt = this.avatarFile.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, this.avatarFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('avatars')
          .getPublicUrl(fileName);

        avatarUrl = publicUrl;
      } else if (this.editingContactId) {
        // Keep existing avatar URL if editing and no new file
        const existingContact = this.contacts.find(c => c.id === this.editingContactId);
        avatarUrl = existingContact?.avatar_url || null;
      }

      const contactData = {
        first_name: document.getElementById('contact-first-name').value,
        last_name: document.getElementById('contact-last-name').value || null,
        phone_number: document.getElementById('contact-phone').value,
        email: document.getElementById('contact-email').value || null,
        address: document.getElementById('contact-address').value || null,
        notes: document.getElementById('contact-notes').value || null,
        is_whitelisted: document.getElementById('contact-whitelisted').checked,
        avatar_url: avatarUrl
      };

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
      const { contacts } = await Contact.list(user.id, { orderBy: 'first_name', ascending: true });
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

  async importContacts(errorMessage, successMessage) {
    errorMessage.classList.add('hidden');
    successMessage.classList.add('hidden');

    // Check if we're on mobile (Contact Picker API) or desktop (CSV upload)
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
      // Mobile: Use Contact Picker API
      if (!('contacts' in navigator)) {
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = 'Contact import is not supported on this device/browser';
        return;
      }

      try {
        const props = ['name', 'tel'];
        const opts = { multiple: true };

        const contacts = await navigator.contacts.select(props, opts);

        if (!contacts || contacts.length === 0) {
          return; // User cancelled
        }

        const { user } = await getCurrentUser();
        let imported = 0;
        let failed = 0;

        for (const contact of contacts) {
          try {
            // Get first phone number
            const phoneNumber = contact.tel && contact.tel.length > 0 ? contact.tel[0] : null;

            if (!phoneNumber) {
              failed++;
              continue;
            }

            // Parse name
            const nameParts = (contact.name && contact.name.length > 0)
              ? contact.name[0].split(' ')
              : ['Unknown'];

            const firstName = nameParts[0] || 'Unknown';
            const lastName = nameParts.slice(1).join(' ') || null;

            const contactData = {
              first_name: firstName,
              last_name: lastName,
              phone_number: phoneNumber,
              is_whitelisted: true // Auto-whitelist imported contacts
            };

            const { error } = await Contact.create(user.id, contactData);
            if (error) {
              failed++;
            } else {
              imported++;
            }
          } catch (err) {
            console.error('Error importing contact:', err);
            failed++;
          }
        }

        // Refresh list
        const { contacts: updatedContacts } = await Contact.list(user.id, { orderBy: 'first_name', ascending: true });
        this.contacts = updatedContacts;
        this.filteredContacts = updatedContacts;
        document.getElementById('contacts-list').innerHTML = this.renderContactsList();
        this.attachContactListeners();

        successMessage.className = 'alert alert-success';
        successMessage.textContent = `Imported ${imported} contact(s)${failed > 0 ? `. ${failed} failed.` : ''}`;
      } catch (error) {
        console.error('Import contacts error:', error);
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = 'Failed to import contacts: ' + error.message;
      }
    } else {
      // Desktop: Use CSV file upload
      this.showCSVImportDialog(errorMessage, successMessage);
    }
  }

  showCSVImportDialog(errorMessage, successMessage) {
    // Show the import modal
    const importModal = document.getElementById('import-modal');
    importModal.classList.remove('hidden');

    // Set up the CSV file input handler
    const chooseCsvBtn = document.getElementById('choose-csv-btn');
    const cancelImportBtn = document.getElementById('cancel-import-btn');

    // Create a file input for CSV
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv';
    fileInput.style.display = 'none';

    const handleFileSelect = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Hide the import modal
      importModal.classList.add('hidden');

      try {
        const text = await file.text();
        await this.parseAndImportCSV(text, errorMessage, successMessage);
      } catch (error) {
        console.error('CSV import error:', error);
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = 'Failed to read CSV file: ' + error.message;
      }

      // Clean up
      document.body.removeChild(fileInput);
      chooseCsvBtn.removeEventListener('click', handleChooseCsv);
      cancelImportBtn.removeEventListener('click', handleCancel);
      importModal.removeEventListener('click', handleBackdropClick);
    };

    const handleChooseCsv = () => {
      document.body.appendChild(fileInput);
      fileInput.addEventListener('change', handleFileSelect, { once: true });
      fileInput.click();
    };

    const handleCancel = () => {
      importModal.classList.add('hidden');
      chooseCsvBtn.removeEventListener('click', handleChooseCsv);
      cancelImportBtn.removeEventListener('click', handleCancel);
      importModal.removeEventListener('click', handleBackdropClick);
    };

    const handleBackdropClick = (e) => {
      if (e.target === importModal || e.target.classList.contains('modal-backdrop')) {
        handleCancel();
      }
    };

    chooseCsvBtn.addEventListener('click', handleChooseCsv);
    cancelImportBtn.addEventListener('click', handleCancel);
    importModal.addEventListener('click', handleBackdropClick);
  }

  parseCSVRow(row) {
    // Parse CSV row handling quoted values with commas
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      const nextChar = row[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // End of field
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    // Add last field
    values.push(current.trim());

    return values;
  }

  async parseAndImportCSV(csvText, errorMessage, successMessage) {
    const { user } = await getCurrentUser();
    let imported = 0;
    let failed = 0;

    try {
      // Split into lines
      const lines = csvText.split('\n').filter(line => line.trim());

      if (lines.length === 0) {
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = 'CSV file is empty';
        return;
      }

      // Parse header row
      const headers = this.parseCSVRow(lines[0]).map(h => h.trim().toLowerCase());

      // Find column indices
      const firstNameIdx = headers.findIndex(h => h.includes('first') && h.includes('name'));
      const lastNameIdx = headers.findIndex(h => h.includes('last') && h.includes('name'));
      const phoneIdx = headers.findIndex(h => h.includes('phone') || h.includes('mobile') || h.includes('cell'));
      const emailIdx = headers.findIndex(h => h.includes('email'));
      const addressIdx = headers.findIndex(h => h.includes('address'));

      if (phoneIdx === -1) {
        errorMessage.className = 'alert alert-error';
        errorMessage.textContent = 'CSV must contain a phone number column';
        return;
      }

      // Process each row (skip header)
      for (let i = 1; i < lines.length; i++) {
        try {
          // Parse CSV row handling quoted values with commas
          const values = this.parseCSVRow(lines[i]);

          const phoneNumber = values[phoneIdx];
          if (!phoneNumber) {
            failed++;
            continue;
          }

          const contactData = {
            first_name: firstNameIdx !== -1 ? values[firstNameIdx] : 'Unknown',
            last_name: lastNameIdx !== -1 ? values[lastNameIdx] || null : null,
            phone_number: phoneNumber,
            email: emailIdx !== -1 ? values[emailIdx] || null : null,
            address: addressIdx !== -1 ? values[addressIdx] || null : null,
            is_whitelisted: true // Auto-whitelist imported contacts
          };

          const { error } = await Contact.create(user.id, contactData);
          if (error) {
            console.error('Failed to import contact:', error);
            failed++;
          } else {
            imported++;
          }
        } catch (err) {
          console.error('Error parsing CSV row:', err);
          failed++;
        }
      }

      // Refresh list
      const { contacts: updatedContacts } = await Contact.list(user.id, { orderBy: 'first_name', ascending: true });
      this.contacts = updatedContacts;
      this.filteredContacts = updatedContacts;
      document.getElementById('contacts-list').innerHTML = this.renderContactsList();
      this.attachContactListeners();

      successMessage.className = 'alert alert-success';
      successMessage.textContent = `Imported ${imported} contact(s) from CSV${failed > 0 ? `. ${failed} failed.` : ''}`;
    } catch (error) {
      console.error('CSV parsing error:', error);
      errorMessage.className = 'alert alert-error';
      errorMessage.textContent = 'Failed to parse CSV: ' + error.message;
    }
  }
}