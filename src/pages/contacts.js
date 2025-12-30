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
      <div class="container with-bottom-nav" style="padding-top: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
          <h1 style="margin: 0; font-size: 1.5rem;">Contacts</h1>
          <div style="display: flex; gap: 0.5rem; flex-shrink: 0;">
            <button id="import-contacts-btn" class="btn btn-secondary" style="display: flex; align-items: center; gap: 0.25rem; padding: 0.5rem 0.75rem; font-size: 0.875rem;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span class="btn-text">Import</span>
            </button>
            <button class="btn btn-primary" id="add-contact-btn" style="display: flex; align-items: center; gap: 0.25rem; padding: 0.5rem 0.75rem; font-size: 0.875rem;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span class="btn-text">Add</span>
            </button>
          </div>
        </div>

        <div style="margin-bottom: 0.5rem;">
          <input
            type="search"
            id="search-input"
            class="form-input"
            placeholder="Search contacts by name"
            style="width: 100%;"
          />
        </div>

        <div id="error-message" class="hidden" style="display: none;"></div>
        <div id="success-message" class="hidden" style="display: none;"></div>

        <div id="contacts-list">
          ${this.renderContactsList()}
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
          <div class="modal-content card" style="position: relative;">
            <!-- Mobile header with back button -->
            <div class="modal-mobile-header">
              <button type="button" class="back-btn" id="modal-back-btn">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 12H5"></path>
                  <path d="M12 19l-7-7 7-7"></path>
                </svg>
              </button>
              <h2 id="modal-title-mobile">Add Contact</h2>
            </div>
            <!-- Close X button (desktop only) -->
            <button type="button" id="close-modal-btn" style="
              position: absolute;
              top: 0.75rem;
              right: 0.75rem;
              background: none;
              border: none;
              cursor: pointer;
              color: var(--text-muted);
              padding: 0.25rem;
              line-height: 1;
              opacity: 0.6;
              transition: opacity 0.2s;
            " title="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <h2 id="modal-title" class="desktop-only">Add Contact</h2>
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
                <div style="display: flex; gap: 0.5rem;">
                  <input
                    type="tel"
                    id="contact-phone"
                    class="form-input"
                    placeholder="+14155551234"
                    required
                    style="flex: 1;"
                  />
                  <button type="button" id="lookup-contact-btn" class="btn btn-secondary" style="white-space: nowrap;" title="Look up contact info">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    Lookup
                  </button>
                </div>
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

              <div style="display: flex; gap: 0.5rem;">
                <div class="form-group" style="flex: 1;">
                  <label class="form-label" for="contact-company">Company</label>
                  <input
                    type="text"
                    id="contact-company"
                    class="form-input"
                    placeholder="Acme Inc."
                  />
                </div>
                <div class="form-group" style="flex: 1;">
                  <label class="form-label" for="contact-job-title">Job Title</label>
                  <input
                    type="text"
                    id="contact-job-title"
                    class="form-input"
                    placeholder="Software Engineer"
                  />
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Social Profiles</label>
                <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                  <input
                    type="url"
                    id="contact-linkedin"
                    class="form-input"
                    placeholder="LinkedIn URL"
                  />
                  <input
                    type="url"
                    id="contact-twitter"
                    class="form-input"
                    placeholder="Twitter/X URL"
                  />
                  <input
                    type="url"
                    id="contact-facebook"
                    class="form-input"
                    placeholder="Facebook URL"
                  />
                </div>
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

              <button type="submit" class="btn btn-primary btn-full" id="save-contact-btn">
                Save Contact
              </button>
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
          position: relative;
          display: flex;
          align-items: flex-start;
          padding: 0.75rem 0;
          border-bottom: 1px solid var(--border-color);
        ">

          <div style="display: flex; align-items: flex-start; gap: 1rem; flex: 1;">
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
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                <span style="font-weight: 600;">${displayName}</span>
                ${contact.is_whitelisted
                  ? '<span style="display: inline-block; padding: 0.125rem 0.5rem; background: var(--success-color); color: white; border-radius: 9999px; font-size: 0.75rem;">Whitelisted</span>'
                  : ''
                }
                <!-- Edit button (pencil icon) -->
                <button class="edit-contact-btn" data-id="${contact.id}" style="
                  background: none;
                  border: none;
                  cursor: pointer;
                  color: var(--text-muted);
                  padding: 0.25rem;
                  line-height: 1;
                  opacity: 0.6;
                  transition: opacity 0.2s;
                " title="Edit contact">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                </button>
              </div>
              <div class="text-sm text-muted">${this.formatPhoneNumber(contact.phone_number)}</div>
              ${contact.job_title || contact.company ? `
                <div class="text-sm text-muted" style="margin-top: 0.25rem;">
                  ${[contact.job_title, contact.company].filter(Boolean).join(' at ')}
                </div>
              ` : ''}
              ${contact.email ? `<div class="text-sm text-muted">${contact.email}</div>` : ''}
              ${contact.address ? `<div class="text-sm text-muted">${contact.address}</div>` : ''}
              ${contact.linkedin_url || contact.twitter_url || contact.facebook_url ? `
                <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                  ${contact.linkedin_url ? `
                    <a href="${contact.linkedin_url}" target="_blank" rel="noopener" style="color: #0077b5;" title="LinkedIn">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                      </svg>
                    </a>
                  ` : ''}
                  ${contact.twitter_url ? `
                    <a href="${contact.twitter_url}" target="_blank" rel="noopener" style="color: #1da1f2;" title="Twitter/X">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                      </svg>
                    </a>
                  ` : ''}
                  ${contact.facebook_url ? `
                    <a href="${contact.facebook_url}" target="_blank" rel="noopener" style="color: #1877f2;" title="Facebook">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                    </a>
                  ` : ''}
                </div>
              ` : ''}
              ${contact.notes ? `<div class="text-sm text-muted mt-1" style="font-style: italic;">${contact.notes}</div>` : ''}

              <!-- Call and Text action buttons -->
              <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem;">
                <button class="btn btn-primary btn-sm call-contact-btn" data-phone="${contact.phone_number}" style="display: flex; align-items: center; gap: 0.25rem;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                  </svg>
                  Call
                </button>
                <button class="btn btn-secondary btn-sm text-contact-btn" data-phone="${contact.phone_number}" style="display: flex; align-items: center; gap: 0.25rem;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                  Text
                </button>
              </div>
            </div>
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
    const closeModalBtn = document.getElementById('close-modal-btn');
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
      this.enrichedAvatarUrl = null;
      // Update both desktop and mobile titles
      document.getElementById('modal-title').textContent = 'Add Contact';
      document.getElementById('modal-title-mobile').textContent = 'Add Contact';
      contactForm.reset();
      document.getElementById('contact-whitelisted').checked = true;
      this.resetAvatarPreview();
      contactModal.classList.remove('hidden');
    });

    // Import contacts
    importContactsBtn.addEventListener('click', async () => {
      await this.importContacts(errorMessage, successMessage);
    });

    // Lookup contact
    const lookupBtn = document.getElementById('lookup-contact-btn');
    lookupBtn.addEventListener('click', async () => {
      await this.lookupContact(errorMessage, successMessage);
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

    // Close modal (X button)
    closeModalBtn.addEventListener('click', () => {
      contactModal.classList.add('hidden');
    });

    // Close modal (mobile back button)
    const modalBackBtn = document.getElementById('modal-back-btn');
    if (modalBackBtn) {
      modalBackBtn.addEventListener('click', () => {
        contactModal.classList.add('hidden');
      });
    }

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
        e.stopPropagation();
        const button = e.target.closest('.edit-contact-btn');
        const contactId = button?.dataset.id;
        const contact = this.contacts.find((c) => c.id === contactId);

        if (contact) {
          this.editingContactId = contactId;
          this.avatarFile = null;
          this.enrichedAvatarUrl = null;
          // Update both desktop and mobile titles
          document.getElementById('modal-title').textContent = 'Edit Contact';
          document.getElementById('modal-title-mobile').textContent = 'Edit Contact';
          document.getElementById('contact-first-name').value = contact.first_name || '';
          document.getElementById('contact-last-name').value = contact.last_name || '';
          document.getElementById('contact-phone').value = contact.phone_number;
          document.getElementById('contact-email').value = contact.email || '';
          document.getElementById('contact-address').value = contact.address || '';
          document.getElementById('contact-notes').value = contact.notes || '';
          document.getElementById('contact-whitelisted').checked = contact.is_whitelisted;

          // Set enrichment fields
          document.getElementById('contact-company').value = contact.company || '';
          document.getElementById('contact-job-title').value = contact.job_title || '';
          document.getElementById('contact-linkedin').value = contact.linkedin_url || '';
          document.getElementById('contact-twitter').value = contact.twitter_url || '';
          document.getElementById('contact-facebook').value = contact.facebook_url || '';

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
        e.stopPropagation();
        const button = e.target.closest('.delete-contact-btn');
        const contactId = button?.dataset.id;
        const contact = this.contacts.find((c) => c.id === contactId);

        const displayName = contact ? ([contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.name) : 'this contact';

        if (contact && confirm(`Delete contact "${displayName}"?`)) {
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

    // Call buttons - navigate to phone page with number
    document.querySelectorAll('.call-contact-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const phone = e.target.closest('.call-contact-btn').dataset.phone;
        // Navigate to phone page with pre-filled number
        window.navigateTo(`/phone?dial=${encodeURIComponent(phone)}`);
      });
    });

    // Text buttons - navigate to inbox with new SMS conversation
    document.querySelectorAll('.text-contact-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const phone = e.target.closest('.text-contact-btn').dataset.phone;
        // Navigate to inbox with selected contact
        window.navigateTo(`/inbox?contact=${encodeURIComponent(phone)}`);
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
      } else if (this.enrichedAvatarUrl) {
        // Use avatar URL from enrichment lookup
        avatarUrl = this.enrichedAvatarUrl;
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
        company: document.getElementById('contact-company').value || null,
        job_title: document.getElementById('contact-job-title').value || null,
        linkedin_url: document.getElementById('contact-linkedin').value || null,
        twitter_url: document.getElementById('contact-twitter').value || null,
        facebook_url: document.getElementById('contact-facebook').value || null,
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

  async lookupContact(errorMessage, successMessage) {
    errorMessage.classList.add('hidden');
    successMessage.classList.add('hidden');

    const phoneInput = document.getElementById('contact-phone');
    const phone = phoneInput.value.trim();

    if (!phone) {
      errorMessage.className = 'alert alert-error';
      errorMessage.textContent = 'Please enter a phone number first';
      return;
    }

    // Show loading state on button
    const lookupBtn = document.getElementById('lookup-contact-btn');
    const originalContent = lookupBtn.innerHTML;
    lookupBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
        <circle cx="12" cy="12" r="10" stroke-dasharray="31.4" stroke-dashoffset="10"></circle>
      </svg>
      Looking up...
    `;
    lookupBtn.disabled = true;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contact-lookup`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ phone }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Lookup failed');
      }

      if (data.notFound) {
        errorMessage.className = 'alert alert-warning';
        errorMessage.textContent = 'No data found for this phone number';
        return;
      }

      if (data.success && data.contact) {
        const contact = data.contact;

        // Populate form fields with found data
        if (contact.first_name) {
          document.getElementById('contact-first-name').value = contact.first_name;
        }
        if (contact.last_name) {
          document.getElementById('contact-last-name').value = contact.last_name;
        }
        if (contact.name && !contact.first_name) {
          // If we only have full name, try to split it
          const parts = contact.name.split(' ');
          document.getElementById('contact-first-name').value = parts[0] || '';
          document.getElementById('contact-last-name').value = parts.slice(1).join(' ') || '';
        }
        if (contact.email) {
          document.getElementById('contact-email').value = contact.email;
        }
        if (contact.address) {
          document.getElementById('contact-address').value = contact.address;
        }
        if (contact.company) {
          document.getElementById('contact-company').value = contact.company;
        }
        if (contact.job_title) {
          document.getElementById('contact-job-title').value = contact.job_title;
        }
        if (contact.linkedin_url) {
          document.getElementById('contact-linkedin').value = contact.linkedin_url;
        }
        if (contact.twitter_url) {
          document.getElementById('contact-twitter').value = contact.twitter_url;
        }
        if (contact.facebook_url) {
          document.getElementById('contact-facebook').value = contact.facebook_url;
        }

        // Set avatar if found
        if (contact.avatar_url) {
          const preview = document.getElementById('avatar-preview');
          const removeBtn = document.getElementById('remove-avatar-btn');
          preview.innerHTML = `<img src="${contact.avatar_url}" style="width: 100%; height: 100%; object-fit: cover;" />`;
          removeBtn.style.display = 'block';
          // Store the URL for saving (we'll use it if no new file is uploaded)
          this.enrichedAvatarUrl = contact.avatar_url;
        }

        successMessage.className = 'alert alert-success';
        successMessage.textContent = 'Contact info found and populated';
      }
    } catch (error) {
      console.error('Lookup error:', error);
      errorMessage.className = 'alert alert-error';
      errorMessage.textContent = error.message || 'Failed to look up contact';
    } finally {
      // Restore button state
      lookupBtn.innerHTML = originalContent;
      lookupBtn.disabled = false;
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