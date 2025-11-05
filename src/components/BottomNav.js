/**
 * Mobile Bottom Navigation Component
 */

import { supabase, getCurrentUser } from '../lib/supabase.js';

// Global unread count
let unreadCount = 0;
let unreadSubscription = null;

// Initialize unread message tracking
export async function initUnreadTracking() {
  const { user } = await getCurrentUser();
  if (!user) return;

  // Get initial unread count
  await updateUnreadCount(user.id);
  updateBadge(); // Show initial count

  // Clean up existing subscription
  if (unreadSubscription) {
    unreadSubscription.unsubscribe();
  }

  // Subscribe to new messages
  unreadSubscription = supabase
    .channel('unread-messages')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'sms_messages',
      filter: `user_id=eq.${user.id}`
    }, async (payload) => {
      console.log('New message notification:', payload);
      await updateUnreadCount(user.id);
      updateBadge();
    })
    .subscribe((status) => {
      console.log('Unread tracking subscription status:', status);
    });
}

async function updateUnreadCount(userId) {
  // Get last viewed timestamp from localStorage
  const lastViewed = localStorage.getItem('inbox_last_viewed');

  if (lastViewed) {
    // Count only messages received after last view
    const { count } = await supabase
      .from('sms_messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('direction', 'inbound')
      .gt('created_at', lastViewed);

    unreadCount = count || 0;
  } else {
    // First time - count all inbound messages
    const { count } = await supabase
      .from('sms_messages')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('direction', 'inbound');

    unreadCount = count || 0;
  }
}

function updateBadge() {
  const badge = document.getElementById('inbox-badge');
  if (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }
}

export function clearUnreadBadge() {
  // Mark inbox as viewed by storing current timestamp
  localStorage.setItem('inbox_last_viewed', new Date().toISOString());
  unreadCount = 0;
  updateBadge();
}

export function renderBottomNav(currentPath = '/dashboard') {
  const navItems = [
    {
      path: '/dashboard',
      icon: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>`,
      label: 'Home'
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
      isPhone: true
    },
    {
      path: '/contacts',
      icon: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>`,
      label: 'Contacts'
    },
    {
      path: '/settings',
      icon: `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>`,
      label: 'Settings'
    }
  ];

  // Initialize unread tracking on first render
  setTimeout(() => initUnreadTracking(), 100);

  return `
    <nav class="bottom-nav">
      ${navItems.map(item => `
        <button
          id="${item.isPhone ? 'phone-nav-btn' : ''}"
          class="bottom-nav-item ${currentPath === item.path ? 'active' : ''}"
          onclick="${item.isPhone ? 'window.showDialpad && window.showDialpad()' : `navigateTo('${item.path}')`}"
          style="position: relative;"
        >
          ${item.icon}
          <span>${item.label}</span>
          ${item.badge ? `<span id="inbox-badge" class="nav-badge" style="display: none;">0</span>` : ''}
        </button>
      `).join('')}
    </nav>
  `;
}

export function setPhoneNavActive(isActive) {
  const phoneBtn = document.getElementById('phone-nav-btn');
  if (phoneBtn) {
    if (isActive) {
      phoneBtn.classList.add('active');
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