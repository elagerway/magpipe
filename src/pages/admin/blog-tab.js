/**
 * Admin Blog Tab
 * Post list + create/edit form with Quill WYSIWYG editor
 */

import { showToast } from '../../lib/toast.js';
import { showConfirmModal } from '../../components/ConfirmModal.js';

// Quill CDN URLs
const QUILL_CSS = 'https://cdn.jsdelivr.net/npm/quill@2/dist/quill.snow.css';
const QUILL_JS = 'https://cdn.jsdelivr.net/npm/quill@2/dist/quill.min.js';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function loadCSS(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

async function loadQuill() {
  if (window.Quill) return;
  loadCSS(QUILL_CSS);
  await loadScript(QUILL_JS);
}

/**
 * Add click-to-resize handles on images inside the Quill editor.
 * Pure DOM — no extra libraries needed.
 */
function enableImageResize(quill) {
  const editor = quill.root;
  let activeImg = null;
  let overlay = null;
  let startX, startW;

  function removeOverlay() {
    if (overlay) { overlay.remove(); overlay = null; }
    activeImg = null;
  }

  editor.addEventListener('click', (e) => {
    if (e.target.tagName === 'IMG') {
      removeOverlay();
      activeImg = e.target;

      overlay = document.createElement('div');
      overlay.className = 'ql-img-overlay';
      overlay.innerHTML = `
        <div class="ql-img-resize-actions">
          <button type="button" data-size="25" title="25%">25%</button>
          <button type="button" data-size="50" title="50%">50%</button>
          <button type="button" data-size="75" title="75%">75%</button>
          <button type="button" data-size="100" title="100%">100%</button>
          <button type="button" data-float="left" title="Float left">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="8"/><path d="M14 3h7M14 7h7M3 14h18M3 18h18"/></svg>
          </button>
          <button type="button" data-float="none" title="No float">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="3" width="14" height="8"/><path d="M3 14h18M3 18h18"/></svg>
          </button>
          <button type="button" data-float="right" title="Float right">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="13" y="3" width="8" height="8"/><path d="M3 3h7M3 7h7M3 14h18M3 18h18"/></svg>
          </button>
        </div>
        <div class="ql-img-resize-handle ql-img-handle-se"></div>
      `;
      editor.appendChild(overlay);

      function positionOverlay() {
        if (!activeImg || !overlay) return;
        const rect = activeImg.getBoundingClientRect();
        const editorRect = editor.getBoundingClientRect();
        overlay.style.left = (rect.left - editorRect.left + editor.scrollLeft) + 'px';
        overlay.style.top = (rect.top - editorRect.top + editor.scrollTop) + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';
      }
      positionOverlay();

      // Size buttons
      overlay.querySelectorAll('[data-size]').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const pct = btn.dataset.size;
          activeImg.style.width = pct + '%';
          activeImg.style.height = 'auto';
          activeImg.setAttribute('width', pct + '%');
          setTimeout(positionOverlay, 50);
          quill.update();
        });
      });

      // Float buttons
      overlay.querySelectorAll('[data-float]').forEach(btn => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const dir = btn.dataset.float;
          activeImg.style.float = dir === 'none' ? '' : dir;
          activeImg.style.margin = dir === 'left' ? '0 1rem 1rem 0'
            : dir === 'right' ? '0 0 1rem 1rem' : '';
          setTimeout(positionOverlay, 50);
          quill.update();
        });
      });

      // Drag handle for free resize
      const handle = overlay.querySelector('.ql-img-handle-se');
      handle.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        startX = ev.clientX;
        startW = activeImg.getBoundingClientRect().width;

        function onMove(e2) {
          const newW = Math.max(50, startW + e2.clientX - startX);
          activeImg.style.width = newW + 'px';
          activeImg.style.height = 'auto';
          activeImg.setAttribute('width', Math.round(newW) + 'px');
          positionOverlay();
        }
        function onUp() {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          quill.update();
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    } else {
      removeOverlay();
    }
  });

  // Remove overlay on text changes / scroll
  quill.on('text-change', removeOverlay);
  editor.addEventListener('scroll', () => { if (overlay && activeImg) {
    const rect = activeImg.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    overlay.style.left = (rect.left - editorRect.left + editor.scrollLeft) + 'px';
    overlay.style.top = (rect.top - editorRect.top + editor.scrollTop) + 'px';
  }});
}

export const blogTabMethods = {
  async renderBlogTab() {
    this.blogPosts = [];
    this.blogEditingPost = null;

    const content = document.getElementById('admin-tab-content');
    content.innerHTML = `
      <div class="support-tab blog-tab">
        <div class="loading-spinner">Loading blog posts...</div>
      </div>
    `;

    try {
      await this.blogLoadPosts();
      this.blogRenderList();
    } catch (error) {
      console.error('Error loading blog posts:', error);
      const container = document.querySelector('.blog-tab');
      if (container) {
        container.innerHTML = `
          <div class="detail-placeholder">
            <p style="color: var(--error-color);">Failed to load blog posts: ${error.message}</p>
            <button class="btn btn-primary" onclick="window.adminPage.renderBlogTab()">Retry</button>
          </div>
        `;
      }
    }
  },

  async blogApiCall(action, data = {}) {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-blog-api`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, ...data }),
      }
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `API error: ${response.status}`);
    }
    return response.json();
  },

  async blogLoadPosts() {
    const data = await this.blogApiCall('list_posts');
    this.blogPosts = data.posts || [];
  },

  blogRenderList() {
    const container = document.querySelector('.blog-tab');
    if (!container) return;

    const rows = this.blogPosts.map(post => {
      const statusClass = post.status === 'published' ? 'badge-success' : 'badge-warning';
      const statusLabel = post.status === 'published' ? 'Published' : 'Draft';
      const date = post.published_at
        ? new Date(post.published_at).toLocaleDateString()
        : new Date(post.updated_at).toLocaleDateString();
      const tags = (post.tags || []).join(', ');

      return `
        <tr>
          <td>
            <div class="blog-post-title-cell">
              <strong>${this.blogEscape(post.title)}</strong>
              ${tags ? `<span class="blog-tags-preview">${this.blogEscape(tags)}</span>` : ''}
            </div>
          </td>
          <td><span class="admin-badge ${statusClass}">${statusLabel}</span></td>
          <td>${date}</td>
          <td>
            <div class="blog-actions">
              <button class="btn btn-secondary btn-sm" onclick="window.adminPage.blogEditPost('${post.id}')">Edit</button>
              <button class="btn btn-danger btn-sm" onclick="window.adminPage.blogDeletePost('${post.id}', '${this.blogEscape(post.title).replace(/'/g, "\\'")}')">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="support-section">
        <div class="blog-list-header">
          <h3>Blog Posts</h3>
          <button class="btn btn-primary" onclick="window.adminPage.blogShowEditor()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
            New Post
          </button>
        </div>
        ${this.blogPosts.length === 0 ? `
          <div class="detail-placeholder">
            <p style="color: var(--text-secondary);">No blog posts yet. Create your first post!</p>
          </div>
        ` : `
          <div class="admin-table-wrapper">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        `}
      </div>
    `;
  },

  async blogEditPost(id) {
    try {
      const data = await this.blogApiCall('get_post', { id });
      this.blogEditingPost = data.post;
      await this.blogShowEditor(data.post);
    } catch (error) {
      showToast('Failed to load post: ' + error.message, 'error');
    }
  },

  async blogShowEditor(post = null) {
    const container = document.querySelector('.blog-tab');
    if (!container) return;

    const isEdit = !!post;
    const title = post?.title || '';
    const slug = post?.slug || '';
    const metaDesc = post?.meta_description || '';
    const excerpt = post?.excerpt || '';
    const authorName = post?.author_name || 'Magpipe Team';
    const tags = (post?.tags || []).join(', ');
    const status = post?.status || 'draft';
    const featuredImage = post?.featured_image_url || '';

    container.innerHTML = `
      <div class="support-section blog-editor-section">
        <div class="blog-list-header">
          <h3>${isEdit ? 'Edit Post' : 'New Post'}</h3>
          <button class="btn btn-secondary" onclick="window.adminPage.blogBackToList()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            Back to List
          </button>
        </div>

        <form id="blog-editor-form" class="blog-editor-form">
          <div class="blog-editor-grid">
            <div class="blog-editor-main">
              <div class="form-group">
                <label for="blog-title">Title</label>
                <input type="text" id="blog-title" class="form-input" placeholder="Post title..." value="${this.blogEscape(title)}" required>
              </div>

              <div class="form-group">
                <label for="blog-slug">Slug</label>
                <input type="text" id="blog-slug" class="form-input" placeholder="auto-generated-from-title" value="${this.blogEscape(slug)}">
              </div>

              <div class="form-group">
                <label>Content</label>
                <div id="blog-quill-toolbar"></div>
                <div id="blog-quill-editor"></div>
              </div>
            </div>

            <div class="blog-editor-sidebar">
              <div class="form-group">
                <label>Status</label>
                <div class="blog-status-toggle">
                  <button type="button" class="blog-status-btn ${status === 'draft' ? 'active' : ''}" data-status="draft">Draft</button>
                  <button type="button" class="blog-status-btn ${status === 'published' ? 'active' : ''}" data-status="published">Published</button>
                </div>
                <input type="hidden" id="blog-status" value="${status}">
              </div>

              <div class="form-group">
                <label for="blog-meta-desc">Meta Description</label>
                <textarea id="blog-meta-desc" class="form-input" rows="3" maxlength="300" placeholder="SEO description (max 300 chars)">${this.blogEscape(metaDesc)}</textarea>
                <span class="form-hint"><span id="meta-char-count">${metaDesc.length}</span>/300</span>
              </div>

              <div class="form-group">
                <label for="blog-excerpt">Excerpt</label>
                <textarea id="blog-excerpt" class="form-input" rows="3" placeholder="Short summary for list page">${this.blogEscape(excerpt)}</textarea>
              </div>

              <div class="form-group">
                <label for="blog-author">Author</label>
                <input type="text" id="blog-author" class="form-input" value="${this.blogEscape(authorName)}">
              </div>

              <div class="form-group">
                <label for="blog-tags">Tags</label>
                <input type="text" id="blog-tags" class="form-input" placeholder="tag1, tag2, tag3" value="${this.blogEscape(tags)}">
                <span class="form-hint">Comma-separated</span>
              </div>

              <div class="form-group">
                <label for="blog-featured-image">Featured Image URL</label>
                <input type="url" id="blog-featured-image" class="form-input" placeholder="https://..." value="${this.blogEscape(featuredImage)}">
              </div>

              <div class="blog-editor-actions">
                <button type="submit" class="btn btn-primary btn-block">
                  ${isEdit ? 'Update Post' : 'Create Post'}
                </button>
                ${isEdit ? `
                  <button type="button" class="btn btn-danger btn-block" onclick="window.adminPage.blogDeletePost('${post.id}', '${this.blogEscape(post.title).replace(/'/g, "\\'")}')">
                    Delete Post
                  </button>
                ` : ''}
              </div>
            </div>
          </div>
        </form>
      </div>
    `;

    // Auto-generate slug from title
    const titleInput = document.getElementById('blog-title');
    const slugInput = document.getElementById('blog-slug');
    if (!isEdit) {
      titleInput.addEventListener('input', () => {
        slugInput.value = titleInput.value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
      });
    }

    // Meta description character counter
    const metaTextarea = document.getElementById('blog-meta-desc');
    const metaCount = document.getElementById('meta-char-count');
    metaTextarea.addEventListener('input', () => {
      metaCount.textContent = metaTextarea.value.length;
    });

    // Status toggle
    document.querySelectorAll('.blog-status-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.blog-status-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('blog-status').value = btn.dataset.status;
      });
    });

    // Load Quill editor
    try {
      await loadQuill();
      this.blogQuill = new window.Quill('#blog-quill-editor', {
        theme: 'snow',
        placeholder: 'Write your blog post...',
        modules: {
          toolbar: {
            container: [
              [{ 'header': [1, 2, 3, 4, false] }],
              [{ 'size': ['small', false, 'large', 'huge'] }],
              ['bold', 'italic', 'underline', 'strike'],
              [{ 'color': [] }, { 'background': [] }],
              [{ 'align': [] }],
              [{ 'list': 'ordered' }, { 'list': 'bullet' }],
              [{ 'indent': '-1' }, { 'indent': '+1' }],
              ['blockquote', 'code-block'],
              ['link', 'image', 'video'],
              [{ 'script': 'sub' }, { 'script': 'super' }],
              ['clean'],
            ],
            handlers: {
              image: function() {
                const url = prompt('Enter image URL:');
                if (url) {
                  const range = this.quill.getSelection(true);
                  this.quill.insertEmbed(range.index, 'image', url);
                }
              },
            },
          },
        },
      });

      // Enable image resize (click image → size buttons + drag handle)
      enableImageResize(this.blogQuill);

      // Set existing content
      if (post?.content) {
        this.blogQuill.root.innerHTML = post.content;
      }
    } catch (error) {
      console.error('Failed to load Quill:', error);
      // Fallback to textarea
      const editorDiv = document.getElementById('blog-quill-editor');
      editorDiv.innerHTML = `<textarea id="blog-content-fallback" class="form-input" rows="20" placeholder="Write your blog post (HTML supported)...">${post?.content || ''}</textarea>`;
    }

    // Form submit
    document.getElementById('blog-editor-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.blogSavePost(isEdit ? post.id : null);
    });
  },

  async blogSavePost(id) {
    const title = document.getElementById('blog-title').value.trim();
    const slug = document.getElementById('blog-slug').value.trim();
    const metaDesc = document.getElementById('blog-meta-desc').value.trim();
    const excerpt = document.getElementById('blog-excerpt').value.trim();
    const authorName = document.getElementById('blog-author').value.trim();
    const tagsStr = document.getElementById('blog-tags').value.trim();
    const status = document.getElementById('blog-status').value;
    const featuredImage = document.getElementById('blog-featured-image').value.trim();

    // Get content from Quill or fallback textarea
    const content = this.blogQuill
      ? this.blogQuill.root.innerHTML
      : (document.getElementById('blog-content-fallback')?.value || '');

    if (!title) {
      showToast('Title is required', 'error');
      return;
    }
    if (!content || content === '<p><br></p>') {
      showToast('Content is required', 'error');
      return;
    }

    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];

    const postData = {
      title,
      slug: slug || undefined,
      content,
      meta_description: metaDesc || null,
      excerpt: excerpt || null,
      author_name: authorName || 'Magpipe Team',
      status,
      tags,
      featured_image_url: featuredImage || null,
    };

    try {
      const submitBtn = document.querySelector('#blog-editor-form button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';

      if (id) {
        await this.blogApiCall('update_post', { id, ...postData });
        showToast('Post updated', 'success');
      } else {
        await this.blogApiCall('create_post', postData);
        showToast('Post created', 'success');
      }

      await this.blogLoadPosts();
      this.blogRenderList();
    } catch (error) {
      showToast('Failed to save: ' + error.message, 'error');
      const submitBtn = document.querySelector('#blog-editor-form button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = id ? 'Update Post' : 'Create Post';
      }
    }
  },

  async blogDeletePost(id, title) {
    showConfirmModal(
      'Delete Post',
      `Are you sure you want to delete "${title}"? This cannot be undone.`,
      {
        confirmText: 'Delete',
        confirmClass: 'btn-danger',
        onConfirm: async () => {
          try {
            await this.blogApiCall('delete_post', { id });
            showToast('Post deleted', 'success');
            await this.blogLoadPosts();
            this.blogRenderList();
          } catch (error) {
            showToast('Failed to delete: ' + error.message, 'error');
          }
        },
      }
    );
  },

  blogBackToList() {
    this.blogEditingPost = null;
    this.blogQuill = null;
    this.blogRenderList();
  },

  blogEscape(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },
};
