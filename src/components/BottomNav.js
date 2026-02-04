/**
 * Mobile Bottom Navigation Component
 * Self-contained component that fetches its own user data
 */

import { supabase, getCurrentUser } from '../lib/supabase.js';
import { AgentConfig } from '../models/AgentConfig.js';
import {
  initUnreadTracking as initUnreadService,
  recalculateUnreads,
  setUnreadCount,
  markAsRead,
  markAllAsRead as markAllReadService,
  getUnreadCount,
  onUnreadChange
} from '../services/unreadService.js';

// Pricing rates (from /pricing page)
const VOICE_RATES = {
  elevenlabs: 0.07,  // 11labs-* voices
  openai: 0.08,      // openai-* voices
  default: 0.07      // legacy voices default to ElevenLabs rate
};

const LLM_RATES = {
  'gpt-4o': 0.05,
  'gpt-4o-mini': 0.006,
  'gpt-4.1': 0.045,
  'gpt-4.1-mini': 0.016,
  'gpt-5': 0.04,
  'gpt-5-mini': 0.012,
  'gpt-5-nano': 0.003,
  'claude-3.5-sonnet': 0.05,
  'claude-3-haiku': 0.006,
  'default': 0.006  // Default to GPT 4o mini rate
};

const TELEPHONY_RATE = 0.015;  // MAGPIPE telephony
const MESSAGE_RATE = 0.001;    // Per SMS message

// Cached user data for nav (avoids refetching on every page)
let cachedUserData = null;
let userDataFetchPromise = null;

// Initialize unread message tracking - delegates to unified service
export async function initUnreadTracking() {
  await initUnreadService();
}

export function clearUnreadBadge() {
  // Mark inbox as viewed by storing current timestamp
  localStorage.setItem('inbox_last_viewed', new Date().toISOString());
  setUnreadCount(0);
}

// Set unread count directly (called from inbox.js with actual conversation counts)
export function setUnreadBadgeCount(count) {
  setUnreadCount(count);
}

// Reset the inbox managed flag - no longer needed with unified service
export function resetInboxManagedCount() {
  // No-op - unified service handles this automatically
}

// Re-export for inbox.js to use directly
export { markAsRead, recalculateUnreads }

// Clear cached user data (call after profile updates)
export function clearNavUserCache() {
  cachedUserData = null;
  userDataFetchPromise = null;
}

// Fetch user data for nav (with caching)
async function fetchNavUserData() {
  // Return cached data if available
  if (cachedUserData) {
    return cachedUserData;
  }

  // If already fetching, wait for that promise
  if (userDataFetchPromise) {
    return userDataFetchPromise;
  }

  // Start new fetch
  userDataFetchPromise = (async () => {
    try {
      const { user } = await getCurrentUser();
      if (!user) return null;

      const { data: profile } = await supabase
        .from('users')
        .select('name, avatar_url, logo_url, favicon_url, favicon_white_bg, plan, stripe_current_period_end, created_at')
        .eq('id', user.id)
        .single();

      // Calculate billing period start based on user's anniversary date
      let periodStart;
      if (profile?.stripe_current_period_end) {
        // Use Stripe billing period
        periodStart = new Date(new Date(profile.stripe_current_period_end).getTime() - 30 * 24 * 60 * 60 * 1000);
      } else {
        // Use account creation date to determine monthly anniversary
        const createdAt = profile?.created_at ? new Date(profile.created_at) : new Date();
        const anniversaryDay = createdAt.getDate();
        const now = new Date();

        // Calculate the most recent anniversary date
        periodStart = new Date(now.getFullYear(), now.getMonth(), anniversaryDay);

        // If anniversary hasn't happened this month yet, use last month's
        if (periodStart > now) {
          periodStart.setMonth(periodStart.getMonth() - 1);
        }
      }

      // Get minutes used this billing period
      let minutesUsed = 0;
      const { data: calls } = await supabase
        .from('call_records')
        .select('duration_seconds')
        .eq('user_id', user.id)
        .gte('started_at', periodStart.toISOString());

      if (calls) {
        const totalSeconds = calls.reduce((sum, call) => sum + (call.duration_seconds || 0), 0);
        minutesUsed = Math.round(totalSeconds / 60);
      }

      // Get messages sent this billing period
      let messagesUsed = 0;
      const { data: messages, count: messageCount } = await supabase
        .from('sms_messages')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('direction', 'outbound')
        .gte('created_at', periodStart.toISOString());

      messagesUsed = messageCount || 0;

      // Get user's default agent config for rate calculation
      let voiceRate = VOICE_RATES.default;
      let llmRate = LLM_RATES.default;

      const { config: agentConfig } = await AgentConfig.getByUserId(user.id);
      if (agentConfig) {
        // Determine voice rate based on voice_id
        if (agentConfig.voice_id?.startsWith('openai-')) {
          voiceRate = VOICE_RATES.openai;
        } else {
          voiceRate = VOICE_RATES.elevenlabs;
        }

        // Determine LLM rate based on ai_model
        if (agentConfig.ai_model && LLM_RATES[agentConfig.ai_model]) {
          llmRate = LLM_RATES[agentConfig.ai_model];
        }
      }

      // Calculate per-minute rate (Voice + LLM + Telephony)
      const perMinuteRate = voiceRate + llmRate + TELEPHONY_RATE;

      // Calculate costs
      const voiceCost = minutesUsed * perMinuteRate;
      const messageCost = messagesUsed * MESSAGE_RATE;
      const totalCost = voiceCost + messageCost;

      cachedUserData = {
        name: profile?.name || null,
        email: user.email,
        avatar_url: profile?.avatar_url || null,
        logo_url: profile?.logo_url || null,
        favicon_url: profile?.favicon_url || null,
        favicon_white_bg: profile?.favicon_white_bg || false,
        plan: profile?.plan || 'free',
        minutesUsed,
        messagesUsed,
        perMinuteRate,
        voiceCost,
        messageCost,
        totalCost
      };

      return cachedUserData;
    } catch (error) {
      console.error('Error fetching nav user data:', error);
      return null;
    }
  })();

  return userDataFetchPromise;
}

// Get user initials for avatar
function getInitials(name, email) {
  if (name) {
    const parts = name.split(' ');
    return parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();
  }
  return email ? email.substring(0, 2).toUpperCase() : 'U';
}

// Update the favicon in the document head
function setFaviconHref(url) {
  let link = document.querySelector("link[rel~='icon']");
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = url || '/favicon.ico';
}

// Apply favicon with optional white background
function applyFavicon(url, withWhiteBg = false) {
  if (!url) {
    setFaviconHref(null);
    return;
  }

  if (!withWhiteBg) {
    setFaviconHref(url);
    return;
  }

  // Create a canvas to add white background with rounded corners
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const size = 32;
    const radius = 6;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Draw rounded rectangle path
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(size - radius, 0);
    ctx.quadraticCurveTo(size, 0, size, radius);
    ctx.lineTo(size, size - radius);
    ctx.quadraticCurveTo(size, size, size - radius, size);
    ctx.lineTo(radius, size);
    ctx.quadraticCurveTo(0, size, 0, size - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();

    // Fill with white background
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Clip to rounded rectangle for the image
    ctx.clip();

    // Draw the favicon centered
    const scale = Math.min(size / img.width, size / img.height);
    const x = (size - img.width * scale) / 2;
    const y = (size - img.height * scale) / 2;
    ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

    // Convert to data URL and set as favicon
    const dataUrl = canvas.toDataURL('image/png');
    setFaviconHref(dataUrl);
  };
  img.onerror = () => {
    // Fallback to original if processing fails
    setFaviconHref(url);
  };
  img.src = url;
}

// Update the logo section in the DOM
function updateNavLogoSection(userData) {
  const logoSection = document.getElementById('nav-logo-section');
  if (!logoSection) return;

  const logoUrl = userData?.logo_url || '/magpipe-logo.png';
  logoSection.innerHTML = `
    <div class="nav-logo">
      <img src="${logoUrl}" alt="Logo" />
    </div>
  `;
  logoSection.style.display = 'block';

  // Also update favicon if custom one is set
  if (userData?.favicon_url) {
    applyFavicon(userData.favicon_url, userData.favicon_white_bg);
  }
}

// Update the plan summary section in the DOM
function updateNavPlanSection(userData) {
  const planSection = document.getElementById('nav-plan-section');
  if (!planSection || !userData) return;

  const maxBudget = 2000; // $2000 max for progress bar
  const hasUsage = (userData.minutesUsed > 0 || userData.messagesUsed > 0);
  let percentage = ((userData.totalCost || 0) / maxBudget) * 100;
  // Ensure minimum visible width when there's any usage
  if (hasUsage && percentage < 3) {
    percentage = 3;
  }
  percentage = Math.min(100, percentage);

  // Determine usage level label based on spend
  let usageLevel, usageLevelClass;
  if (percentage <= 30) {
    usageLevel = 'Low';
    usageLevelClass = 'usage-low';
  } else if (percentage <= 60) {
    usageLevel = 'Medium';
    usageLevelClass = 'usage-medium';
  } else if (percentage <= 90) {
    usageLevel = 'High';
    usageLevelClass = 'usage-high';
  } else {
    usageLevel = 'Very High';
    usageLevelClass = 'usage-very-high';
  }

  planSection.innerHTML = `
    <div class="nav-plan-card">
      <div class="nav-plan-header">
        <span class="nav-plan-title">Monthly Consumption</span>
        <span class="nav-plan-usage-level ${usageLevelClass}">${usageLevel}</span>
      </div>
      <div class="nav-plan-usage-line">
        <span>Minutes: ${userData.minutesUsed.toLocaleString()}</span>
        <span>Messages: ${userData.messagesUsed.toLocaleString()}</span>
      </div>
      <div class="nav-plan-progress">
        <div class="nav-plan-progress-bar" style="width: ${percentage}%"></div>
      </div>
      <button class="nav-plan-upgrade-btn" onclick="openUpgradeModal()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
        Upgrade
      </button>
    </div>
  `;
}

// Update the user section in the DOM after data is fetched
function updateNavUserSection(userData) {
  const userSection = document.getElementById('nav-user-section');
  if (!userSection || !userData) return;

  const userInitials = getInitials(userData.name, userData.email);
  const userName = userData.name || 'User';
  const userEmail = userData.email || '';

  userSection.innerHTML = `
    <button class="nav-user-button" id="nav-user-button" onclick="toggleUserModal(event)">
      <div class="nav-user-avatar">${userData.avatar_url
        ? `<img src="${userData.avatar_url}" alt="" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />`
        : userInitials
      }</div>
      <div class="nav-user-info">
        <span class="nav-user-name">${userName}</span>
        <span class="nav-user-email">${userEmail}</span>
      </div>
      <svg class="nav-user-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </button>
  `;
}

// Update the active state of nav items without re-rendering
export function updateNavActiveState(currentPath) {
  // Update main nav items
  const navItems = document.querySelectorAll('.bottom-nav-item');
  navItems.forEach(item => {
    const itemPath = item.getAttribute('onclick')?.match(/navigateTo\('([^']+)'\)/)?.[1];
    if (itemPath) {
      if (itemPath === currentPath) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    }
  });

  // Update modal items (Team, Settings)
  const modalItems = document.querySelectorAll('.nav-modal-item[data-path]');
  modalItems.forEach(item => {
    const itemPath = item.getAttribute('data-path');
    if (itemPath) {
      if (itemPath === currentPath) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    }
  });
}

// Nav items configuration
const NAV_ITEMS = [
  {
    path: '/agent',
    icon: `<svg fill="currentColor" viewBox="0 0 90 90" style="width: 21.6px; height: 21.6px;"><path d="M27.965 40.691c-1.618 0-3.234-0.379-4.756-1.134-0.99-0.491-1.394-1.69-0.903-2.68 0.491-0.99 1.689-1.395 2.68-0.903 1.74 0.863 3.671 0.946 5.439 0.23 1.971-0.796 3.495-2.466 4.291-4.7 0.371-1.04 1.513-1.583 2.555-1.212 1.041 0.371 1.583 1.515 1.212 2.555-1.185 3.326-3.515 5.835-6.56 7.066C30.639 40.433 29.302 40.691 27.965 40.691zM21.166 28.948c-0.652 0-1.292-0.318-1.675-0.905-2.546-3.89-2.97-8.148-1.261-12.657 0.391-1.033 1.546-1.554 2.579-1.162 1.033 0.391 1.553 1.546 1.162 2.579-1.265 3.337-0.989 6.213 0.868 9.05 0.605 0.924 0.346 2.164-0.578 2.769C21.921 28.842 21.541 28.948 21.166 28.948zM27.086 28.887c-0.922 0-1.751-0.641-1.953-1.579-0.233-1.08 0.454-2.144 1.533-2.377 3.422-0.738 7.141-2.593 5.504-10.45-0.225-1.081 0.469-2.141 1.55-2.366 1.08-0.225 2.141 0.469 2.366 1.55 2.195 10.54-3.452 14.07-8.577 15.176C27.368 28.872 27.226 28.887 27.086 28.887zM34.069 50.104c-0.276 0-0.553-0.008-0.831-0.023-1.103-0.064-1.945-1.011-1.881-2.113 0.063-1.103 1.021-1.946 2.112-1.881 2.692 0.155 5.261-0.734 7.071-2.442C42.15 42.126 43 40.121 43 37.846c0-1.104 0.896-2 2-2 1.105 0 2 0.896 2 2 0 3.355-1.318 6.448-3.714 8.708C40.87 48.834 37.549 50.104 34.069 50.104zM24.921 65.499c-0.193 0-0.389-0.028-0.583-0.088-1.057-0.322-1.652-1.439-1.33-2.496 1.694-5.56 0.053-8.832-5.319-10.611-1.048-0.347-1.617-1.479-1.27-2.527 0.347-1.049 1.477-1.618 2.527-1.27 7.507 2.485 10.234 7.871 7.888 15.574C26.571 64.943 25.778 65.499 24.921 65.499zM23.703 55.668c-0.714 0-1.405-0.383-1.766-1.057-1.783-3.335-1.876-6.726-0.277-10.078 0.476-0.996 1.668-1.419 2.667-0.944 0.997 0.476 1.419 1.669 0.944 2.667-1.036 2.171-0.972 4.287 0.194 6.469 0.521 0.975 0.153 2.187-0.821 2.707C24.344 55.592 24.021 55.668 23.703 55.668zM39.537 75.33c-0.328 0-0.66-0.08-0.966-0.25-6.966-3.854-8.794-9.66-5.287-16.787 0.487-0.991 1.686-1.4 2.677-0.912 0.991 0.488 1.399 1.687 0.912 2.678-2.543 5.17-1.422 8.723 3.635 11.521 0.967 0.535 1.316 1.752 0.782 2.719C40.923 74.958 40.241 75.33 39.537 75.33zM33.683 79.286c-0.396 0-0.796-0.117-1.145-0.361-0.905-0.634-1.125-1.881-0.492-2.785 1.352-1.932 1.615-4.026 0.805-6.402-0.356-1.046 0.202-2.182 1.248-2.538 1.044-0.358 2.182 0.201 2.539 1.247 1.233 3.618 0.792 6.979-1.314 9.986C34.935 78.989 34.314 79.286 33.683 79.286zM16.509 65.353c-1.642 0-3.583-0.563-5.65-2.313-0.843-0.714-0.948-1.976-0.234-2.818 0.714-0.844 1.977-0.947 2.818-0.234 2.028 1.715 3.439 1.463 4.324 1.122 1.031-0.397 2.188 0.117 2.585 1.147 0.396 1.031-0.118 2.188-1.148 2.585C18.452 65.131 17.54 65.353 16.509 65.353zM13 40.717c-0.613 0-1.219-0.281-1.611-0.813-0.655-0.889-0.466-2.141 0.423-2.797 1.313-0.968 2.663-1.659 4.013-2.053 1.06-0.31 2.171 0.3 2.48 1.359 0.31 1.061-0.299 2.171-1.359 2.48-0.898 0.262-1.826 0.744-2.76 1.433C13.828 40.59 13.413 40.717 13 40.717zM37.472 55.794c-0.852 0-1.641-0.548-1.908-1.403-1.147-3.668 0.239-7.74 3.225-9.473 0.955-0.554 2.179-0.229 2.734 0.726 0.554 0.955 0.229 2.18-0.726 2.733-1.341 0.778-1.989 2.985-1.416 4.818 0.33 1.055-0.257 2.177-1.312 2.507C37.871 55.764 37.669 55.794 37.472 55.794zM34.245 22.77c-0.346 0-0.697-0.09-1.017-0.279-0.951-0.563-1.265-1.789-0.703-2.74 0.598-1.011 2.419-4.088 5.983-4.351 1.101-0.068 2.061 0.746 2.142 1.848s-0.746 2.06-1.848 2.142c-0.689 0.051-1.634 0.37-2.834 2.399C35.594 22.418 34.928 22.77 34.245 22.77zM45 80.512c-1.104 0-2-0.896-2-2V9.513c0-1.104 0.896-2 2-2 1.105 0 2 0.896 2 2v68.999C47 79.616 46.105 80.512 45 80.512zM24.572 83.518c-8.446 0-15.317-7.493-15.317-16.703 0-1.628 0.215-3.229 0.64-4.778C7.184 58.94 5.65 54.804 5.65 50.498c0-4.677 1.738-9.022 4.818-12.169-1.27-2.478-1.935-5.255-1.935-8.128 0-6.984 4.077-13.283 10.026-15.675 2.482-5.974 7.861-9.783 13.942-9.783 1.915 0 3.802 0.394 5.611 1.171 1.015 0.436 1.484 1.612 1.048 2.627-0.436 1.015-1.614 1.484-2.627 1.048-1.307-0.562-2.664-0.846-4.032-0.846-4.664 0-8.792 3.147-10.518 8.019l-0.33 0.931-0.94 0.304c-4.816 1.559-8.181 6.578-8.181 12.204 0 2.686 0.742 5.255 2.145 7.432l0.963 1.494-1.371 1.132c-2.894 2.39-4.622 6.218-4.622 10.239 0 3.672 1.421 7.165 3.898 9.584l0.911 0.89-0.421 1.202c-0.52 1.484-0.784 3.046-0.784 4.641 0 7.005 5.077 12.703 11.317 12.703 0.875 0 1.755-0.116 2.616-0.346 1.066-0.282 2.163 0.35 2.447 1.418 0.284 1.067-0.351 2.163-1.418 2.447C27.021 83.355 25.794 83.518 24.572 83.518zM45 11.513c-1.104 0-2-0.896-2-2C43 6.473 40.845 4 38.196 4c-1.959 0-3.706 1.347-4.449 3.432-0.371 1.04-1.515 1.583-2.556 1.211-1.04-0.372-1.583-1.516-1.211-2.556C31.299 2.39 34.524 0 38.196 0c4.855 0 8.805 4.268 8.805 9.513C47 10.617 46.105 11.513 45 11.513zM36.407 90c-5.841 0-10.593-5.153-10.593-11.488 0-1.104 0.896-2 2-2s2 0.896 2 2c0 4.129 2.958 7.488 6.593 7.488S43 82.641 43 78.512c0-1.104 0.896-2 2-2 1.105 0 2 0.896 2 2C47 84.847 42.248 90 36.407 90zM59.08 37.736c-1.337 0-2.674-0.258-3.959-0.778-3.045-1.23-5.375-3.74-6.561-7.066-0.371-1.041 0.172-2.185 1.212-2.555 1.044-0.373 2.185 0.171 2.556 1.212 0.797 2.234 2.32 3.904 4.291 4.7 1.771 0.716 3.701 0.633 5.439-0.231 0.99-0.49 2.189-0.086 2.681 0.903 0.49 0.99 0.086 2.189-0.903 2.681C62.314 37.357 60.697 37.736 59.08 37.736zM70.527 25.104c-0.151 0-0.304-0.017-0.457-0.053-1.075-0.251-1.744-1.327-1.492-2.403 0.428-1.832 0.249-3.744-0.547-5.846-0.392-1.033 0.129-2.188 1.162-2.579 1.034-0.389 2.188 0.129 2.578 1.163 1.071 2.83 1.308 5.579 0.701 8.172C72.258 24.481 71.436 25.104 70.527 25.104zM61.357 30.478c-0.363 0-0.731-0.1-1.063-0.307-4.438-2.791-8.54-8.039-2.873-17.194 0.581-0.939 1.813-1.23 2.753-0.648 0.939 0.582 1.229 1.814 0.647 2.753-4.224 6.824-1.362 9.838 1.602 11.702 0.936 0.588 1.217 1.823 0.629 2.758C62.673 30.146 62.022 30.478 61.357 30.478zM45 78.447c-1.104 0-2-0.896-2-2 0-3.355 1.319-6.448 3.714-8.708 2.608-2.461 6.27-3.74 10.048-3.527 1.103 0.064 1.944 1.011 1.881 2.113-0.064 1.103-0.995 1.943-2.113 1.881-2.673-0.151-5.259 0.734-7.07 2.442C47.85 72.167 47 74.172 47 76.447C47 77.552 46.104 78.447 45 78.447zM61.021 71.179c-0.698 0-1.377-0.366-1.744-1.018-0.542-0.963-0.202-2.183 0.76-2.725 4.932-2.779 5.912-6.307 3.182-11.438-0.519-0.975-0.149-2.187 0.826-2.705 0.975-0.52 2.187-0.147 2.705 0.826 3.783 7.108 2.141 12.918-4.748 16.801C61.691 71.096 61.354 71.179 61.021 71.179zM67.037 75.106c-0.612 0-1.216-0.279-1.608-0.809-2.213-2.981-2.773-6.327-1.665-9.942 0.324-1.057 1.445-1.646 2.498-1.326 1.056 0.323 1.65 1.442 1.326 2.498-0.725 2.366-0.38 4.455 1.054 6.388 0.658 0.887 0.473 2.14-0.415 2.798C67.869 74.979 67.451 75.106 67.037 75.106zM51.277 51.893c-0.478 0-0.958-0.171-1.34-0.517-0.819-0.74-0.884-2.005-0.143-2.824 5.326-5.893 11.396-6.34 17.553-1.289 0.854 0.7 0.979 1.96 0.277 2.814-0.698 0.854-1.96 0.979-2.814 0.277-4.467-3.663-8.184-3.395-12.049 0.879C52.367 51.671 51.823 51.893 51.277 51.893zM60.367 47.92c-1.059 0-1.942-0.831-1.995-1.9-0.056-1.103 0.794-2.042 1.897-2.097 2.508-0.125 4.356-1.144 5.652-3.114 0.606-0.922 1.85-1.178 2.77-0.572 0.923 0.607 1.18 1.847 0.572 2.77-2.018 3.067-4.977 4.72-8.795 4.91C60.435 47.919 60.401 47.92 60.367 47.92zM73.491 65.353c-1.031 0-1.943-0.222-2.695-0.512-1.03-0.396-1.545-1.554-1.147-2.585 0.396-1.03 1.556-1.542 2.585-1.147 0.882 0.341 2.295 0.595 4.323-1.122 0.844-0.714 2.105-0.608 2.818 0.234 0.714 0.843 0.608 2.104-0.234 2.818C77.073 64.789 75.132 65.353 73.491 65.353zM76.999 40.717c-0.412 0-0.828-0.127-1.186-0.391-0.933-0.688-1.86-1.17-2.759-1.432-1.061-0.31-1.669-1.42-1.359-2.48 0.31-1.06 1.419-1.669 2.48-1.359 1.352 0.395 2.701 1.085 4.013 2.053 0.889 0.656 1.077 1.908 0.422 2.797C78.218 40.436 77.612 40.717 76.999 40.717zM50.209 69.646c-0.689 0-1.36-0.356-1.731-0.996-0.555-0.955-0.23-2.179 0.726-2.733 1.342-0.779 1.99-2.985 1.417-4.818-0.33-1.055 0.257-2.177 1.311-2.506 1.056-0.328 2.177 0.256 2.506 1.311 1.148 3.666-0.238 7.738-3.226 9.473C50.896 69.56 50.55 69.646 50.209 69.646zM56.721 22.282c-0.943 0-1.783-0.67-1.964-1.631-0.436-2.318-1.215-2.94-1.845-3.224-1.008-0.453-1.457-1.637-1.004-2.645 0.454-1.008 1.638-1.457 2.645-1.003 3.259 1.465 3.919 4.979 4.136 6.133 0.204 1.085-0.511 2.131-1.597 2.335C56.967 22.271 56.843 22.282 56.721 22.282zM65.428 83.518c-1.222 0-2.448-0.162-3.646-0.48-1.067-0.284-1.702-1.38-1.418-2.447 0.284-1.066 1.375-1.703 2.447-1.418 0.861 0.229 1.742 0.346 2.616 0.346 6.24 0 11.317-5.698 11.317-12.703 0-1.596-0.264-3.157-0.784-4.64l-0.421-1.202 0.911-0.891c2.478-2.42 3.898-5.913 3.898-9.584 0-4.021-1.728-7.849-4.622-10.239l-1.371-1.132 0.964-1.494c1.403-2.175 2.146-4.745 2.146-7.431 0-5.626-3.364-10.645-8.181-12.204l-0.939-0.304-0.329-0.931c-1.727-4.871-5.855-8.019-10.519-8.019-1.368 0-2.725 0.285-4.032 0.846-1.013 0.435-2.192-0.034-2.627-1.048-0.436-1.015 0.033-2.191 1.049-2.627 1.809-0.777 3.696-1.171 5.61-1.171 6.08 0 11.459 3.809 13.942 9.783 5.949 2.392 10.025 8.691 10.025 15.675 0 2.873-0.665 5.651-1.935 8.128 3.08 3.147 4.818 7.492 4.818 12.169 0 4.306-1.533 8.441-4.244 11.537 0.425 1.549 0.64 3.15 0.64 4.779C80.745 76.024 73.874 83.518 65.428 83.518zM45 11.513c-1.104 0-2-0.896-2-2C43 4.268 46.949 0 51.804 0c3.672 0 6.897 2.389 8.218 6.087 0.371 1.04-0.171 2.185-1.211 2.556-1.04 0.372-2.185-0.169-2.557-1.211C55.51 5.347 53.763 4 51.804 4c-2.649 0-4.805 2.473-4.805 5.513C46.999 10.617 46.104 11.513 45 11.513zM53.593 90C47.752 90 43 84.847 43 78.512c0-1.104 0.896-2 2-2 1.105 0 2 0.896 2 2C47 82.641 49.957 86 53.593 86s6.594-3.359 6.594-7.488c0-1.104 0.896-2 2-2s2 0.896 2 2C64.187 84.847 59.435 90 53.593 90z"/></svg>`,
    label: 'Assistant'
  },
  {
    path: '/agents',
    icon: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="12" rx="2" stroke-width="2"/><circle cx="9" cy="10" r="1.5" fill="currentColor"/><circle cx="15" cy="10" r="1.5" fill="currentColor"/><path stroke-linecap="round" stroke-width="2" d="M9 14h6"/><path stroke-linecap="round" stroke-width="2" d="M12 16v3"/><path stroke-linecap="round" stroke-width="2" d="M8 19h8"/><path stroke-linecap="round" stroke-width="2" d="M2 8h2M20 8h2M12 2v2"/></svg>`,
    label: 'Agents'
  },
  {
    path: '/inbox',
    icon: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>`,
    label: 'Inbox',
    badge: true
  },
  {
    path: '/phone',
    icon: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>`,
    label: 'Phone',
    isPhone: true,
    desktopOnly: true
  },
  {
    path: '/contacts',
    icon: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>`,
    label: 'Contacts'
  },
  {
    path: '/settings',
    icon: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`,
    label: 'Settings',
    mobileOnly: true
  },
  {
    path: '/apps',
    icon: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>`,
    label: 'Apps',
    desktopOnly: true
  },
  {
    path: '/knowledge',
    icon: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>`,
    label: 'Knowledge',
    desktopOnly: true
  }
];

// Generate the nav HTML (extracted for reuse)
function generateNavHtml(currentPath) {
  return `
    <nav class="bottom-nav">
      <!-- Logo Section (Desktop Only) - populated async -->
      <div class="nav-logo-section desktop-only" id="nav-logo-section" style="display: none;"></div>

      <div class="nav-items-container">
        ${NAV_ITEMS.map(item => `
          <button
            id="${item.isPhone ? 'phone-nav-btn' : ''}"
            class="bottom-nav-item ${currentPath === item.path ? 'active' : ''}${item.desktopOnly ? ' desktop-only' : ''}${item.mobileOnly ? ' mobile-only' : ''}"
            onclick="navigateTo('${item.path}')"
          >
            <span class="nav-icon-wrapper">
              ${item.icon}
              ${item.badge ? `<span id="inbox-badge" class="nav-badge" style="display: none;">0</span>` : ''}
            </span>
            <span>${item.label}</span>
          </button>
        `).join('')}
      </div>

      <!-- Plan Summary Section (Desktop Only) - populated async -->
      <div class="nav-plan-section desktop-only" id="nav-plan-section">
        <div class="nav-plan-card" style="opacity: 0.5;">
          <div class="nav-plan-header">
            <span class="nav-plan-usage">Loading...</span>
          </div>
        </div>
      </div>

      <!-- User Profile Section (Desktop Only) - populated async -->
      <div class="nav-user-section" id="nav-user-section">
        <div class="nav-user-button" style="opacity: 0.5;">
          <div class="nav-user-avatar" style="background: var(--bg-secondary);"></div>
          <div class="nav-user-info">
            <span class="nav-user-name" style="background: var(--bg-secondary); width: 80px; height: 14px; border-radius: 4px;"></span>
            <span class="nav-user-email" style="background: var(--bg-secondary); width: 120px; height: 12px; border-radius: 4px; margin-top: 4px;"></span>
          </div>
        </div>
      </div>

      <!-- User Modal -->
      <div class="nav-user-modal" id="nav-user-modal">
        <div class="nav-modal-section">
          <div class="nav-modal-section-title">Documentation</div>
          <button class="nav-modal-item" onclick="window.open('https://docs.magpipe.ai', '_blank'); closeUserModal();">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            <span>All Documentation</span>
          </button>
        </div>

        <div class="nav-modal-section">
          <div class="nav-modal-section-title">Help</div>
          <button class="nav-modal-item" onclick="openContactModal()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="4" width="20" height="16" rx="2"></rect>
              <path d="M22 6l-10 7L2 6"></path>
            </svg>
            <span>Contact Us</span>
          </button>
          <button class="nav-modal-item" onclick="window.open('https://magpipe.ai/chat', '_blank'); closeUserModal();">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>Chat with us</span>
          </button>
        </div>

        <div class="nav-modal-divider"></div>

        <button class="nav-modal-item${currentPath === '/team' ? ' active' : ''}" data-path="/team" onclick="navigateTo('/team'); closeUserModal();">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          <span>Team</span>
        </button>
        <button class="nav-modal-item${currentPath === '/settings' ? ' active' : ''}" data-path="/settings" onclick="navigateTo('/settings'); closeUserModal();">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
          <span>Settings</span>
        </button>
        <button class="nav-modal-item nav-modal-logout" onclick="handleLogout()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          <span>Log out</span>
        </button>
      </div>

      <!-- Contact Modal -->
      <div class="contact-modal-overlay" id="contact-modal-overlay" style="display: none;" onclick="handleContactOverlayClick(event)">
        <div class="contact-modal" onclick="event.stopPropagation()">
          <div class="contact-modal-header">
            <h3>Contact Us</h3>
            <button class="close-modal-btn" onclick="closeContactModal()">&times;</button>
          </div>
          <form id="contact-form" onsubmit="submitContactForm(event)">
            <div class="contact-modal-body">
              <div class="form-group">
                <label for="contact-subject">Subject</label>
                <input type="text" id="contact-subject" name="subject" required placeholder="What can we help you with?">
              </div>
              <div class="form-group">
                <label for="contact-message">Message</label>
                <textarea id="contact-message" name="message" required rows="5" placeholder="Tell us more..."></textarea>
              </div>
            </div>
            <div class="contact-modal-footer">
              <button type="button" class="btn btn-secondary" onclick="closeContactModal()">Cancel</button>
              <button type="submit" class="btn btn-primary" id="contact-submit-btn">Send Message</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Upgrade Modal -->
      <div class="contact-modal-overlay" id="upgrade-modal-overlay" style="display: none;" onclick="handleUpgradeOverlayClick(event)">
        <div class="contact-modal" onclick="event.stopPropagation()">
          <div class="contact-modal-header">
            <h3>Request Custom Plan</h3>
            <button class="close-modal-btn" onclick="closeUpgradeModal()">&times;</button>
          </div>
          <form id="upgrade-form" onsubmit="submitUpgradeForm(event)">
            <div class="contact-modal-body">
              <div class="form-row">
                <div class="form-group">
                  <label for="upgrade-name">Name</label>
                  <input type="text" id="upgrade-name" name="name" readonly class="readonly-input">
                </div>
                <div class="form-group">
                  <label for="upgrade-email">Email</label>
                  <input type="email" id="upgrade-email" name="email" readonly class="readonly-input">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="upgrade-company">Company / Organization</label>
                  <input type="text" id="upgrade-company" name="company" placeholder="Your company name">
                </div>
                <div class="form-group">
                  <label for="upgrade-company-size">Company Size</label>
                  <select id="upgrade-company-size" name="company_size" class="form-input">
                    <option value="">Select...</option>
                    <option value="1-10">1-10 employees</option>
                    <option value="11-50">11-50 employees</option>
                    <option value="51-200">51-200 employees</option>
                    <option value="201-500">201-500 employees</option>
                    <option value="500+">500+ employees</option>
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="upgrade-call-volume">Expected Monthly Call Volume</label>
                  <select id="upgrade-call-volume" name="call_volume" class="form-input">
                    <option value="">Select...</option>
                    <option value="< 100">Less than 100 calls</option>
                    <option value="100-500">100-500 calls</option>
                    <option value="500-2000">500-2,000 calls</option>
                    <option value="2000-10000">2,000-10,000 calls</option>
                    <option value="10000+">10,000+ calls</option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="upgrade-concurrent">Expected Concurrent Calls</label>
                  <select id="upgrade-concurrent" name="concurrent_calls" class="form-input">
                    <option value="">Select...</option>
                    <option value="1-5">1-5 simultaneous</option>
                    <option value="6-20">6-20 simultaneous</option>
                    <option value="21-50">21-50 simultaneous</option>
                    <option value="50+">50+ simultaneous</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label>Current Usage</label>
                <div class="upgrade-usage-stats" id="upgrade-usage-stats">
                  <span>Loading...</span>
                </div>
              </div>
              <div class="form-group">
                <label for="upgrade-message">Anything else?</label>
                <textarea id="upgrade-message" name="message" rows="3" placeholder="Special requirements, integrations, questions..."></textarea>
              </div>
            </div>
            <div class="contact-modal-footer">
              <button type="button" class="btn btn-secondary" onclick="closeUpgradeModal()">Cancel</button>
              <button type="submit" class="btn btn-primary" id="upgrade-submit-btn">Send Request</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Thank You Modal -->
      <div class="contact-modal-overlay" id="thank-you-modal-overlay" style="display: none;" onclick="closeThankYouModal()">
        <div class="contact-modal thank-you-modal" onclick="event.stopPropagation()">
          <div class="thank-you-content">
            <div class="thank-you-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <h3>Thank You!</h3>
            <p>We've received your request and will be in touch within 24 hours to discuss your custom plan.</p>
            <button class="btn btn-primary" onclick="closeThankYouModal()">Got it</button>
          </div>
        </div>
      </div>
    </nav>
  `;
}

export function renderBottomNav(currentPath = '/agent') {
  // Check if persistent nav container exists
  const persistentNav = document.getElementById('persistent-nav');
  if (persistentNav) {
    // Check if nav content already rendered
    if (persistentNav.querySelector('.bottom-nav')) {
      // Just update active state, don't re-render
      updateNavActiveState(currentPath);
      setTimeout(() => initUnreadTracking(), 100);
      return ''; // Return empty - nav already exists
    }
    // First time: render nav into persistent container
    setTimeout(() => {
      persistentNav.innerHTML = generateNavHtml(currentPath);
      // Trigger the async user data fetching
      setTimeout(async () => {
        const userData = await fetchNavUserData();
        if (userData) {
          updateNavLogoSection(userData);
          updateNavPlanSection(userData);
          updateNavUserSection(userData);
        }
      }, 0);
      setTimeout(() => initUnreadTracking(), 100);
    }, 0);
    return ''; // Return empty - nav will be in persistent container
  }

  // Fallback: no persistent container, render inline (shouldn't happen)
  const navItems = [
    {
      path: '/agent',
      icon: `<svg fill="currentColor" viewBox="0 0 90 90" style="width: 21.6px; height: 21.6px;"><path d="M27.965 40.691c-1.618 0-3.234-0.379-4.756-1.134-0.99-0.491-1.394-1.69-0.903-2.68 0.491-0.99 1.689-1.395 2.68-0.903 1.74 0.863 3.671 0.946 5.439 0.23 1.971-0.796 3.495-2.466 4.291-4.7 0.371-1.04 1.513-1.583 2.555-1.212 1.041 0.371 1.583 1.515 1.212 2.555-1.185 3.326-3.515 5.835-6.56 7.066C30.639 40.433 29.302 40.691 27.965 40.691zM21.166 28.948c-0.652 0-1.292-0.318-1.675-0.905-2.546-3.89-2.97-8.148-1.261-12.657 0.391-1.033 1.546-1.554 2.579-1.162 1.033 0.391 1.553 1.546 1.162 2.579-1.265 3.337-0.989 6.213 0.868 9.05 0.605 0.924 0.346 2.164-0.578 2.769C21.921 28.842 21.541 28.948 21.166 28.948zM27.086 28.887c-0.922 0-1.751-0.641-1.953-1.579-0.233-1.08 0.454-2.144 1.533-2.377 3.422-0.738 7.141-2.593 5.504-10.45-0.225-1.081 0.469-2.141 1.55-2.366 1.08-0.225 2.141 0.469 2.366 1.55 2.195 10.54-3.452 14.07-8.577 15.176C27.368 28.872 27.226 28.887 27.086 28.887zM34.069 50.104c-0.276 0-0.553-0.008-0.831-0.023-1.103-0.064-1.945-1.011-1.881-2.113 0.063-1.103 1.021-1.946 2.112-1.881 2.692 0.155 5.261-0.734 7.071-2.442C42.15 42.126 43 40.121 43 37.846c0-1.104 0.896-2 2-2 1.105 0 2 0.896 2 2 0 3.355-1.318 6.448-3.714 8.708C40.87 48.834 37.549 50.104 34.069 50.104zM24.921 65.499c-0.193 0-0.389-0.028-0.583-0.088-1.057-0.322-1.652-1.439-1.33-2.496 1.694-5.56 0.053-8.832-5.319-10.611-1.048-0.347-1.617-1.479-1.27-2.527 0.347-1.049 1.477-1.618 2.527-1.27 7.507 2.485 10.234 7.871 7.888 15.574C26.571 64.943 25.778 65.499 24.921 65.499zM23.703 55.668c-0.714 0-1.405-0.383-1.766-1.057-1.783-3.335-1.876-6.726-0.277-10.078 0.476-0.996 1.668-1.419 2.667-0.944 0.997 0.476 1.419 1.669 0.944 2.667-1.036 2.171-0.972 4.287 0.194 6.469 0.521 0.975 0.153 2.187-0.821 2.707C24.344 55.592 24.021 55.668 23.703 55.668zM39.537 75.33c-0.328 0-0.66-0.08-0.966-0.25-6.966-3.854-8.794-9.66-5.287-16.787 0.487-0.991 1.686-1.4 2.677-0.912 0.991 0.488 1.399 1.687 0.912 2.678-2.543 5.17-1.422 8.723 3.635 11.521 0.967 0.535 1.316 1.752 0.782 2.719C40.923 74.958 40.241 75.33 39.537 75.33zM33.683 79.286c-0.396 0-0.796-0.117-1.145-0.361-0.905-0.634-1.125-1.881-0.492-2.785 1.352-1.932 1.615-4.026 0.805-6.402-0.356-1.046 0.202-2.182 1.248-2.538 1.044-0.358 2.182 0.201 2.539 1.247 1.233 3.618 0.792 6.979-1.314 9.986C34.935 78.989 34.314 79.286 33.683 79.286zM16.509 65.353c-1.642 0-3.583-0.563-5.65-2.313-0.843-0.714-0.948-1.976-0.234-2.818 0.714-0.844 1.977-0.947 2.818-0.234 2.028 1.715 3.439 1.463 4.324 1.122 1.031-0.397 2.188 0.117 2.585 1.147 0.396 1.031-0.118 2.188-1.148 2.585C18.452 65.131 17.54 65.353 16.509 65.353zM13 40.717c-0.613 0-1.219-0.281-1.611-0.813-0.655-0.889-0.466-2.141 0.423-2.797 1.313-0.968 2.663-1.659 4.013-2.053 1.06-0.31 2.171 0.3 2.48 1.359 0.31 1.061-0.299 2.171-1.359 2.48-0.898 0.262-1.826 0.744-2.76 1.433C13.828 40.59 13.413 40.717 13 40.717zM37.472 55.794c-0.852 0-1.641-0.548-1.908-1.403-1.147-3.668 0.239-7.74 3.225-9.473 0.955-0.554 2.179-0.229 2.734 0.726 0.554 0.955 0.229 2.18-0.726 2.733-1.341 0.778-1.989 2.985-1.416 4.818 0.33 1.055-0.257 2.177-1.312 2.507C37.871 55.764 37.669 55.794 37.472 55.794zM34.245 22.77c-0.346 0-0.697-0.09-1.017-0.279-0.951-0.563-1.265-1.789-0.703-2.74 0.598-1.011 2.419-4.088 5.983-4.351 1.101-0.068 2.061 0.746 2.142 1.848s-0.746 2.06-1.848 2.142c-0.689 0.051-1.634 0.37-2.834 2.399C35.594 22.418 34.928 22.77 34.245 22.77zM45 80.512c-1.104 0-2-0.896-2-2V9.513c0-1.104 0.896-2 2-2 1.105 0 2 0.896 2 2v68.999C47 79.616 46.105 80.512 45 80.512zM24.572 83.518c-8.446 0-15.317-7.493-15.317-16.703 0-1.628 0.215-3.229 0.64-4.778C7.184 58.94 5.65 54.804 5.65 50.498c0-4.677 1.738-9.022 4.818-12.169-1.27-2.478-1.935-5.255-1.935-8.128 0-6.984 4.077-13.283 10.026-15.675 2.482-5.974 7.861-9.783 13.942-9.783 1.915 0 3.802 0.394 5.611 1.171 1.015 0.436 1.484 1.612 1.048 2.627-0.436 1.015-1.614 1.484-2.627 1.048-1.307-0.562-2.664-0.846-4.032-0.846-4.664 0-8.792 3.147-10.518 8.019l-0.33 0.931-0.94 0.304c-4.816 1.559-8.181 6.578-8.181 12.204 0 2.686 0.742 5.255 2.145 7.432l0.963 1.494-1.371 1.132c-2.894 2.39-4.622 6.218-4.622 10.239 0 3.672 1.421 7.165 3.898 9.584l0.911 0.89-0.421 1.202c-0.52 1.484-0.784 3.046-0.784 4.641 0 7.005 5.077 12.703 11.317 12.703 0.875 0 1.755-0.116 2.616-0.346 1.066-0.282 2.163 0.35 2.447 1.418 0.284 1.067-0.351 2.163-1.418 2.447C27.021 83.355 25.794 83.518 24.572 83.518zM45 11.513c-1.104 0-2-0.896-2-2C43 6.473 40.845 4 38.196 4c-1.959 0-3.706 1.347-4.449 3.432-0.371 1.04-1.515 1.583-2.556 1.211-1.04-0.372-1.583-1.516-1.211-2.556C31.299 2.39 34.524 0 38.196 0c4.855 0 8.805 4.268 8.805 9.513C47 10.617 46.105 11.513 45 11.513zM36.407 90c-5.841 0-10.593-5.153-10.593-11.488 0-1.104 0.896-2 2-2s2 0.896 2 2c0 4.129 2.958 7.488 6.593 7.488S43 82.641 43 78.512c0-1.104 0.896-2 2-2 1.105 0 2 0.896 2 2C47 84.847 42.248 90 36.407 90zM59.08 37.736c-1.337 0-2.674-0.258-3.959-0.778-3.045-1.23-5.375-3.74-6.561-7.066-0.371-1.041 0.172-2.185 1.212-2.555 1.044-0.373 2.185 0.171 2.556 1.212 0.797 2.234 2.32 3.904 4.291 4.7 1.771 0.716 3.701 0.633 5.439-0.231 0.99-0.49 2.189-0.086 2.681 0.903 0.49 0.99 0.086 2.189-0.903 2.681C62.314 37.357 60.697 37.736 59.08 37.736zM70.527 25.104c-0.151 0-0.304-0.017-0.457-0.053-1.075-0.251-1.744-1.327-1.492-2.403 0.428-1.832 0.249-3.744-0.547-5.846-0.392-1.033 0.129-2.188 1.162-2.579 1.034-0.389 2.188 0.129 2.578 1.163 1.071 2.83 1.308 5.579 0.701 8.172C72.258 24.481 71.436 25.104 70.527 25.104zM61.357 30.478c-0.363 0-0.731-0.1-1.063-0.307-4.438-2.791-8.54-8.039-2.873-17.194 0.581-0.939 1.813-1.23 2.753-0.648 0.939 0.582 1.229 1.814 0.647 2.753-4.224 6.824-1.362 9.838 1.602 11.702 0.936 0.588 1.217 1.823 0.629 2.758C62.673 30.146 62.022 30.478 61.357 30.478zM45 78.447c-1.104 0-2-0.896-2-2 0-3.355 1.319-6.448 3.714-8.708 2.608-2.461 6.27-3.74 10.048-3.527 1.103 0.064 1.944 1.011 1.881 2.113-0.064 1.103-0.995 1.943-2.113 1.881-2.673-0.151-5.259 0.734-7.07 2.442C47.85 72.167 47 74.172 47 76.447C47 77.552 46.104 78.447 45 78.447zM61.021 71.179c-0.698 0-1.377-0.366-1.744-1.018-0.542-0.963-0.202-2.183 0.76-2.725 4.932-2.779 5.912-6.307 3.182-11.438-0.519-0.975-0.149-2.187 0.826-2.705 0.975-0.52 2.187-0.147 2.705 0.826 3.783 7.108 2.141 12.918-4.748 16.801C61.691 71.096 61.354 71.179 61.021 71.179zM67.037 75.106c-0.612 0-1.216-0.279-1.608-0.809-2.213-2.981-2.773-6.327-1.665-9.942 0.324-1.057 1.445-1.646 2.498-1.326 1.056 0.323 1.65 1.442 1.326 2.498-0.725 2.366-0.38 4.455 1.054 6.388 0.658 0.887 0.473 2.14-0.415 2.798C67.869 74.979 67.451 75.106 67.037 75.106zM51.277 51.893c-0.478 0-0.958-0.171-1.34-0.517-0.819-0.74-0.884-2.005-0.143-2.824 5.326-5.893 11.396-6.34 17.553-1.289 0.854 0.7 0.979 1.96 0.277 2.814-0.698 0.854-1.96 0.979-2.814 0.277-4.467-3.663-8.184-3.395-12.049 0.879C52.367 51.671 51.823 51.893 51.277 51.893zM60.367 47.92c-1.059 0-1.942-0.831-1.995-1.9-0.056-1.103 0.794-2.042 1.897-2.097 2.508-0.125 4.356-1.144 5.652-3.114 0.606-0.922 1.85-1.178 2.77-0.572 0.923 0.607 1.18 1.847 0.572 2.77-2.018 3.067-4.977 4.72-8.795 4.91C60.435 47.919 60.401 47.92 60.367 47.92zM73.491 65.353c-1.031 0-1.943-0.222-2.695-0.512-1.03-0.396-1.545-1.554-1.147-2.585 0.396-1.03 1.556-1.542 2.585-1.147 0.882 0.341 2.295 0.595 4.323-1.122 0.844-0.714 2.105-0.608 2.818 0.234 0.714 0.843 0.608 2.104-0.234 2.818C77.073 64.789 75.132 65.353 73.491 65.353zM76.999 40.717c-0.412 0-0.828-0.127-1.186-0.391-0.933-0.688-1.86-1.17-2.759-1.432-1.061-0.31-1.669-1.42-1.359-2.48 0.31-1.06 1.419-1.669 2.48-1.359 1.352 0.395 2.701 1.085 4.013 2.053 0.889 0.656 1.077 1.908 0.422 2.797C78.218 40.436 77.612 40.717 76.999 40.717zM50.209 69.646c-0.689 0-1.36-0.356-1.731-0.996-0.555-0.955-0.23-2.179 0.726-2.733 1.342-0.779 1.99-2.985 1.417-4.818-0.33-1.055 0.257-2.177 1.311-2.506 1.056-0.328 2.177 0.256 2.506 1.311 1.148 3.666-0.238 7.738-3.226 9.473C50.896 69.56 50.55 69.646 50.209 69.646zM56.721 22.282c-0.943 0-1.783-0.67-1.964-1.631-0.436-2.318-1.215-2.94-1.845-3.224-1.008-0.453-1.457-1.637-1.004-2.645 0.454-1.008 1.638-1.457 2.645-1.003 3.259 1.465 3.919 4.979 4.136 6.133 0.204 1.085-0.511 2.131-1.597 2.335C56.967 22.271 56.843 22.282 56.721 22.282zM65.428 83.518c-1.222 0-2.448-0.162-3.646-0.48-1.067-0.284-1.702-1.38-1.418-2.447 0.284-1.066 1.375-1.703 2.447-1.418 0.861 0.229 1.742 0.346 2.616 0.346 6.24 0 11.317-5.698 11.317-12.703 0-1.596-0.264-3.157-0.784-4.64l-0.421-1.202 0.911-0.891c2.478-2.42 3.898-5.913 3.898-9.584 0-4.021-1.728-7.849-4.622-10.239l-1.371-1.132 0.964-1.494c1.403-2.175 2.146-4.745 2.146-7.431 0-5.626-3.364-10.645-8.181-12.204l-0.939-0.304-0.329-0.931c-1.727-4.871-5.855-8.019-10.519-8.019-1.368 0-2.725 0.285-4.032 0.846-1.013 0.435-2.192-0.034-2.627-1.048-0.436-1.015 0.033-2.191 1.049-2.627 1.809-0.777 3.696-1.171 5.61-1.171 6.08 0 11.459 3.809 13.942 9.783 5.949 2.392 10.025 8.691 10.025 15.675 0 2.873-0.665 5.651-1.935 8.128 3.08 3.147 4.818 7.492 4.818 12.169 0 4.306-1.533 8.441-4.244 11.537 0.425 1.549 0.64 3.15 0.64 4.779C80.745 76.024 73.874 83.518 65.428 83.518zM45 11.513c-1.104 0-2-0.896-2-2C43 4.268 46.949 0 51.804 0c3.672 0 6.897 2.389 8.218 6.087 0.371 1.04-0.171 2.185-1.211 2.556-1.04 0.372-2.185-0.169-2.557-1.211C55.51 5.347 53.763 4 51.804 4c-2.649 0-4.805 2.473-4.805 5.513C46.999 10.617 46.104 11.513 45 11.513zM53.593 90C47.752 90 43 84.847 43 78.512c0-1.104 0.896-2 2-2 1.105 0 2 0.896 2 2C47 82.641 49.957 86 53.593 86s6.594-3.359 6.594-7.488c0-1.104 0.896-2 2-2s2 0.896 2 2C64.187 84.847 59.435 90 53.593 90z"/></svg>`,
      label: 'Assistant'
    },
    {
      path: '/agents',
      icon: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="12" rx="2" stroke-width="2"/><circle cx="9" cy="10" r="1.5" fill="currentColor"/><circle cx="15" cy="10" r="1.5" fill="currentColor"/><path stroke-linecap="round" stroke-width="2" d="M9 14h6"/><path stroke-linecap="round" stroke-width="2" d="M12 16v3"/><path stroke-linecap="round" stroke-width="2" d="M8 19h8"/><path stroke-linecap="round" stroke-width="2" d="M2 8h2M20 8h2M12 2v2"/></svg>`,
      label: 'Agents'
    },
    {
      path: '/inbox',
      icon: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/></svg>`,
      label: 'Inbox',
      badge: true
    },
    {
      path: '/phone',
      icon: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>`,
      label: 'Phone',
      isPhone: true,
      desktopOnly: true
    },
    {
      path: '/contacts',
      icon: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>`,
      label: 'Contacts'
    },
    {
      path: '/settings',
      icon: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`,
      label: 'Settings',
      mobileOnly: true
    },
    {
      path: '/apps',
      icon: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg>`,
      label: 'Apps',
      desktopOnly: true
    },
    {
      path: '/knowledge',
      icon: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>`,
      label: 'Knowledge',
      desktopOnly: true
    }
  ];

  // Settings item shown at bottom on desktop
  const settingsItem = {
    path: '/settings',
    icon: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`,
    label: 'Settings'
  };

  // Initialize unread tracking on first render
  setTimeout(() => initUnreadTracking(), 100);

  // Fetch user data asynchronously and update the DOM
  setTimeout(async () => {
    const userData = await fetchNavUserData();
    if (userData) {
      updateNavLogoSection(userData);
      updateNavPlanSection(userData);
      updateNavUserSection(userData);
    }
  }, 0);

  return `
    <nav class="bottom-nav">
      <!-- Logo Section (Desktop Only) - populated async -->
      <div class="nav-logo-section desktop-only" id="nav-logo-section" style="display: none;"></div>

      <div class="nav-items-container">
        ${navItems.map(item => `
          <button
            id="${item.isPhone ? 'phone-nav-btn' : ''}"
            class="bottom-nav-item ${currentPath === item.path ? 'active' : ''}${item.desktopOnly ? ' desktop-only' : ''}${item.mobileOnly ? ' mobile-only' : ''}"
            onclick="navigateTo('${item.path}')"
          >
            <span class="nav-icon-wrapper">
              ${item.icon}
              ${item.badge ? `<span id="inbox-badge" class="nav-badge" style="display: none;">0</span>` : ''}
            </span>
            <span>${item.label}</span>
          </button>
        `).join('')}
      </div>

      <!-- Plan Summary Section (Desktop Only) - populated async -->
      <div class="nav-plan-section desktop-only" id="nav-plan-section">
        <div class="nav-plan-card" style="opacity: 0.5;">
          <div class="nav-plan-header">
            <span class="nav-plan-usage">Loading...</span>
          </div>
        </div>
      </div>

      <!-- User Profile Section (Desktop Only) - populated async -->
      <div class="nav-user-section" id="nav-user-section">
        <div class="nav-user-button" style="opacity: 0.5;">
          <div class="nav-user-avatar" style="background: var(--bg-secondary);"></div>
          <div class="nav-user-info">
            <span class="nav-user-name" style="background: var(--bg-secondary); width: 80px; height: 14px; border-radius: 4px;"></span>
            <span class="nav-user-email" style="background: var(--bg-secondary); width: 120px; height: 12px; border-radius: 4px; margin-top: 4px;"></span>
          </div>
        </div>
      </div>

      <!-- User Modal -->
      <div class="nav-user-modal" id="nav-user-modal">
        <div class="nav-modal-section">
          <div class="nav-modal-section-title">Documentation</div>
          <button class="nav-modal-item" onclick="window.open('https://docs.magpipe.ai', '_blank'); closeUserModal();">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            <span>All Documentation</span>
          </button>
        </div>

        <div class="nav-modal-section">
          <div class="nav-modal-section-title">Help</div>
          <button class="nav-modal-item" onclick="openContactModal()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="4" width="20" height="16" rx="2"></rect>
              <path d="M22 6l-10 7L2 6"></path>
            </svg>
            <span>Contact Us</span>
          </button>
          <button class="nav-modal-item" onclick="window.open('https://magpipe.ai/chat', '_blank'); closeUserModal();">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>Chat with us</span>
          </button>
        </div>

        <div class="nav-modal-divider"></div>

        <button class="nav-modal-item${currentPath === '/team' ? ' active' : ''}" data-path="/team" onclick="navigateTo('/team'); closeUserModal();">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          <span>Team</span>
        </button>
        <button class="nav-modal-item${currentPath === '/settings' ? ' active' : ''}" data-path="/settings" onclick="navigateTo('/settings'); closeUserModal();">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
          <span>Settings</span>
        </button>
        <button class="nav-modal-item nav-modal-logout" onclick="handleLogout()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          <span>Log out</span>
        </button>
      </div>

      <!-- Contact Modal -->
      <div class="contact-modal-overlay" id="contact-modal-overlay" style="display: none;" onclick="handleContactOverlayClick(event)">
        <div class="contact-modal" onclick="event.stopPropagation()">
          <div class="contact-modal-header">
            <h3>Contact Us</h3>
            <button class="close-modal-btn" onclick="closeContactModal()">&times;</button>
          </div>
          <form id="contact-form" onsubmit="submitContactForm(event)">
            <div class="contact-modal-body">
              <div class="form-group">
                <label for="contact-subject">Subject</label>
                <input type="text" id="contact-subject" name="subject" required placeholder="What can we help you with?">
              </div>
              <div class="form-group">
                <label for="contact-message">Message</label>
                <textarea id="contact-message" name="message" required rows="5" placeholder="Tell us more..."></textarea>
              </div>
            </div>
            <div class="contact-modal-footer">
              <button type="button" class="btn btn-secondary" onclick="closeContactModal()">Cancel</button>
              <button type="submit" class="btn btn-primary" id="contact-submit-btn">Send Message</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Upgrade Modal -->
      <div class="contact-modal-overlay" id="upgrade-modal-overlay" style="display: none;" onclick="handleUpgradeOverlayClick(event)">
        <div class="contact-modal" onclick="event.stopPropagation()">
          <div class="contact-modal-header">
            <h3>Request Custom Plan</h3>
            <button class="close-modal-btn" onclick="closeUpgradeModal()">&times;</button>
          </div>
          <form id="upgrade-form" onsubmit="submitUpgradeForm(event)">
            <div class="contact-modal-body">
              <div class="form-row">
                <div class="form-group">
                  <label for="upgrade-name">Name</label>
                  <input type="text" id="upgrade-name" name="name" readonly class="readonly-input">
                </div>
                <div class="form-group">
                  <label for="upgrade-email">Email</label>
                  <input type="email" id="upgrade-email" name="email" readonly class="readonly-input">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="upgrade-company">Company / Organization</label>
                  <input type="text" id="upgrade-company" name="company" placeholder="Your company name">
                </div>
                <div class="form-group">
                  <label for="upgrade-company-size">Company Size</label>
                  <select id="upgrade-company-size" name="company_size" class="form-input">
                    <option value="">Select...</option>
                    <option value="1-10">1-10 employees</option>
                    <option value="11-50">11-50 employees</option>
                    <option value="51-200">51-200 employees</option>
                    <option value="201-500">201-500 employees</option>
                    <option value="500+">500+ employees</option>
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="upgrade-call-volume">Expected Monthly Call Volume</label>
                  <select id="upgrade-call-volume" name="call_volume" class="form-input">
                    <option value="">Select...</option>
                    <option value="< 100">Less than 100 calls</option>
                    <option value="100-500">100-500 calls</option>
                    <option value="500-2000">500-2,000 calls</option>
                    <option value="2000-10000">2,000-10,000 calls</option>
                    <option value="10000+">10,000+ calls</option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="upgrade-concurrent">Expected Concurrent Calls</label>
                  <select id="upgrade-concurrent" name="concurrent_calls" class="form-input">
                    <option value="">Select...</option>
                    <option value="1-5">1-5 simultaneous</option>
                    <option value="6-20">6-20 simultaneous</option>
                    <option value="21-50">21-50 simultaneous</option>
                    <option value="50+">50+ simultaneous</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label>Current Usage</label>
                <div class="upgrade-usage-stats" id="upgrade-usage-stats">
                  <span>Loading...</span>
                </div>
              </div>
              <div class="form-group">
                <label for="upgrade-message">Anything else?</label>
                <textarea id="upgrade-message" name="message" rows="3" placeholder="Special requirements, integrations, questions..."></textarea>
              </div>
            </div>
            <div class="contact-modal-footer">
              <button type="button" class="btn btn-secondary" onclick="closeUpgradeModal()">Cancel</button>
              <button type="submit" class="btn btn-primary" id="upgrade-submit-btn">Send Request</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Thank You Modal -->
      <div class="contact-modal-overlay" id="thank-you-modal-overlay" style="display: none;" onclick="closeThankYouModal()">
        <div class="contact-modal thank-you-modal" onclick="event.stopPropagation()">
          <div class="thank-you-content">
            <div class="thank-you-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <h3>Thank You!</h3>
            <p>We've received your request and will be in touch within 24 hours to discuss your custom plan.</p>
            <button class="btn btn-primary" onclick="closeThankYouModal()">Got it</button>
          </div>
        </div>
      </div>
    </nav>
  `;
}

// Toggle user modal
window.toggleUserModal = function(event) {
  event.stopPropagation();
  const modal = document.getElementById('nav-user-modal');
  const button = document.getElementById('nav-user-button');
  if (modal && button) {
    const isOpen = modal.classList.contains('open');
    if (isOpen) {
      closeUserModal();
    } else {
      modal.classList.add('open');
      button.classList.add('open');
      // Close on click outside
      setTimeout(() => {
        document.addEventListener('click', closeUserModalOnClickOutside);
      }, 0);
    }
  }
};

window.closeUserModal = function() {
  const modal = document.getElementById('nav-user-modal');
  const button = document.getElementById('nav-user-button');
  if (modal) modal.classList.remove('open');
  if (button) button.classList.remove('open');
  document.removeEventListener('click', closeUserModalOnClickOutside);
};

function closeUserModalOnClickOutside(event) {
  const modal = document.getElementById('nav-user-modal');
  const button = document.getElementById('nav-user-button');
  if (modal && button && !modal.contains(event.target) && !button.contains(event.target)) {
    closeUserModal();
  }
}

window.handleLogout = async function() {
  closeUserModal();
  const { signOut } = await import('../lib/supabase.js');
  await signOut();
  navigateTo('/login');
};

// Contact modal functions
window.openContactModal = function() {
  closeUserModal();
  const overlay = document.getElementById('contact-modal-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
    // Focus on subject field
    setTimeout(() => {
      const subjectInput = document.getElementById('contact-subject');
      if (subjectInput) subjectInput.focus();
    }, 100);
  }
};

window.closeContactModal = function() {
  const overlay = document.getElementById('contact-modal-overlay');
  if (overlay) {
    overlay.style.display = 'none';
    // Reset form
    const form = document.getElementById('contact-form');
    if (form) form.reset();
  }
};

window.handleContactOverlayClick = function(event) {
  // Close modal when clicking the overlay (not the modal content)
  if (event.target.id === 'contact-modal-overlay') {
    closeContactModal();
  }
};

window.submitContactForm = async function(event) {
  event.preventDefault();

  const submitBtn = document.getElementById('contact-submit-btn');
  const subject = document.getElementById('contact-subject').value.trim();
  const message = document.getElementById('contact-message').value.trim();

  if (!subject || !message) return;

  // Disable button and show loading
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending...';

  try {
    const { supabase } = await import('../lib/supabase.js');
    const { data: { session } } = await supabase.auth.getSession();

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-contact-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': session ? `Bearer ${session.access_token}` : '',
      },
      body: JSON.stringify({ subject, message })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to send message');
    }

    // Success - close modal and show notification
    closeContactModal();
    showContactNotification('Message sent! We\'ll get back to you soon.', 'success');

  } catch (error) {
    console.error('Error sending contact message:', error);
    showContactNotification('Failed to send message. Please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send Message';
  }
};

function showContactNotification(message, type) {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `contact-notification ${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    z-index: 10001;
    animation: slideUp 0.3s ease;
    ${type === 'success'
      ? 'background: #10b981; color: white;'
      : 'background: #ef4444; color: white;'}
  `;

  document.body.appendChild(notification);

  // Remove after 3 seconds
  setTimeout(() => {
    notification.style.animation = 'slideDown 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Upgrade modal functions
window.openUpgradeModal = async function() {
  closeUserModal();
  const overlay = document.getElementById('upgrade-modal-overlay');
  if (overlay) {
    overlay.style.display = 'flex';

    // Pre-fill the form with user data
    const userData = cachedUserData || await fetchNavUserData();
    if (userData) {
      const nameInput = document.getElementById('upgrade-name');
      const emailInput = document.getElementById('upgrade-email');
      const usageStats = document.getElementById('upgrade-usage-stats');

      if (nameInput) nameInput.value = userData.name || '';
      if (emailInput) emailInput.value = userData.email || '';
      if (usageStats) {
        usageStats.innerHTML = `
          <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
            <span><strong>${userData.minutesUsed.toLocaleString()}</strong> minutes</span>
            <span><strong>${userData.messagesUsed.toLocaleString()}</strong> messages</span>
            <span><strong>$${userData.totalCost.toFixed(2)}</strong> this period</span>
          </div>
        `;
      }
    }

    // Focus on company field (first editable field)
    setTimeout(() => {
      const companyInput = document.getElementById('upgrade-company');
      if (companyInput) companyInput.focus();
    }, 100);
  }
};

window.closeUpgradeModal = function() {
  const overlay = document.getElementById('upgrade-modal-overlay');
  if (overlay) {
    overlay.style.display = 'none';
    // Reset form
    const form = document.getElementById('upgrade-form');
    if (form) form.reset();
  }
};

window.showThankYouModal = function() {
  const overlay = document.getElementById('thank-you-modal-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
  }
};

window.closeThankYouModal = function() {
  const overlay = document.getElementById('thank-you-modal-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
};

window.handleUpgradeOverlayClick = function(event) {
  if (event.target.id === 'upgrade-modal-overlay') {
    closeUpgradeModal();
  }
};

window.submitUpgradeForm = async function(event) {
  event.preventDefault();

  const submitBtn = document.getElementById('upgrade-submit-btn');
  const name = document.getElementById('upgrade-name').value.trim();
  const email = document.getElementById('upgrade-email').value.trim();
  const company = document.getElementById('upgrade-company').value.trim();
  const companySize = document.getElementById('upgrade-company-size').value;
  const callVolume = document.getElementById('upgrade-call-volume').value;
  const concurrentCalls = document.getElementById('upgrade-concurrent').value;
  const message = document.getElementById('upgrade-message').value.trim();

  // Get current usage stats
  const userData = cachedUserData || await fetchNavUserData();
  const usageInfo = userData
    ? `\n\nCurrent Usage:\n- Minutes: ${userData.minutesUsed}\n- Messages: ${userData.messagesUsed}\n- Total Cost: $${userData.totalCost.toFixed(2)}`
    : '';

  // Disable button and show loading
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending...';

  try {
    const { supabase } = await import('../lib/supabase.js');
    const { data: { session } } = await supabase.auth.getSession();

    const subject = `Custom Plan Request${company ? ` - ${company}` : ''}`;
    const fullMessage = `Name: ${name}
Email: ${email}
${company ? `Company: ${company}\n` : ''}${companySize ? `Company Size: ${companySize}\n` : ''}
Expected Monthly Call Volume: ${callVolume || 'Not specified'}
Expected Concurrent Calls: ${concurrentCalls || 'Not specified'}
${usageInfo}
${message ? `\nAdditional Notes:\n${message}` : ''}`;

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-contact-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': session ? `Bearer ${session.access_token}` : '',
      },
      body: JSON.stringify({ subject, message: fullMessage })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to send request');
    }

    // Success - close upgrade modal and show thank you modal
    closeUpgradeModal();
    showThankYouModal();

  } catch (error) {
    console.error('Error sending upgrade request:', error);
    showContactNotification('Failed to send request. Please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send Request';
  }
};

export function setPhoneNavActive(isActive) {
  const phoneBtn = document.getElementById('phone-nav-btn');
  const inboxBtn = document.querySelector('.bottom-nav-item[onclick*="inbox"]');

  if (phoneBtn) {
    if (isActive) {
      phoneBtn.classList.add('active');
      // Remove active from inbox when phone is active
      if (inboxBtn) {
        inboxBtn.classList.remove('active');
      }
    } else {
      phoneBtn.classList.remove('active');
    }
  }
}

export function attachBottomNav() {
  // Add the with-bottom-nav class to the container
  const container = document.querySelector('.container');
  if (container) {
    container.classList.add('with-bottom-nav');
  }
}
