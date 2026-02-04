/**
 * Unified Unread Tracking Service
 * Single source of truth for unread counts across the app
 */

import { supabase, getCurrentUser } from '../lib/supabase.js';

// Singleton state
let unreadCounts = {
  sms: 0,
  chat: 0,
  calls: 0,
  total: 0
};

let subscriptions = [];
let listeners = new Set();
let isInitialized = false;
let currentUserId = null;

/**
 * Get the current total unread count
 */
export function getUnreadCount() {
  return unreadCounts.total;
}

/**
 * Get breakdown of unread counts by type
 */
export function getUnreadCounts() {
  return { ...unreadCounts };
}

/**
 * Subscribe to unread count changes
 * @param {function} callback - Called with new count when it changes
 * @returns {function} Unsubscribe function
 */
export function onUnreadChange(callback) {
  listeners.add(callback);
  // Immediately call with current count
  callback(unreadCounts.total);
  return () => listeners.delete(callback);
}

/**
 * Notify all listeners of count change
 */
function notifyListeners() {
  listeners.forEach(callback => {
    try {
      callback(unreadCounts.total);
    } catch (e) {
      console.error('Error in unread listener:', e);
    }
  });
}

/**
 * Update the badge in the DOM
 */
function updateBadgeDOM() {
  const badge = document.getElementById('inbox-badge');
  if (badge) {
    if (unreadCounts.total > 0) {
      badge.textContent = unreadCounts.total > 99 ? '99+' : unreadCounts.total;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }
}

/**
 * Get localStorage keys for tracking viewed state
 */
function getViewedConversations() {
  const saved = localStorage.getItem('inbox_viewed_conversations');
  return saved ? new Set(JSON.parse(saved)) : new Set();
}

/**
 * Check if a conversation/item has been viewed
 */
function isViewed(type, key, itemDate) {
  const viewedConversations = getViewedConversations();

  let convKey, lastViewedKey;
  if (type === 'sms') {
    convKey = key; // phone_serviceNumber
    lastViewedKey = `conversation_last_viewed_sms_${key}`;
  } else if (type === 'chat') {
    convKey = `chat_${key}`;
    lastViewedKey = `conversation_last_viewed_chat_${key}`;
  } else if (type === 'call') {
    convKey = `call_${key}`;
    lastViewedKey = `conversation_last_viewed_call_${key}`;
  }

  // Check if in viewedConversations set (current session)
  if (viewedConversations.has(convKey)) return true;

  // Check lastViewed timestamp
  const lastViewed = localStorage.getItem(lastViewedKey);
  if (lastViewed && itemDate <= new Date(lastViewed)) return true;

  return false;
}

/**
 * Calculate unread counts from database
 */
export async function recalculateUnreads(userId = null) {
  if (!userId) {
    const { user } = await getCurrentUser();
    if (!user) return;
    userId = user.id;
  }

  currentUserId = userId;

  let smsUnread = 0;
  let chatUnread = 0;
  let callsUnread = 0;

  // Count SMS unreads
  try {
    const { data: messages } = await supabase
      .from('sms_messages')
      .select('sender_number, recipient_number, sent_at, created_at')
      .eq('user_id', userId)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false });

    if (messages?.length > 0) {
      const unreadByConv = {};

      messages.forEach(msg => {
        const phone = msg.sender_number;
        const serviceNumber = msg.recipient_number;
        const convKey = `${phone}_${serviceNumber}`;
        const msgDate = new Date(msg.sent_at || msg.created_at || Date.now());

        if (!isViewed('sms', convKey, msgDate)) {
          unreadByConv[convKey] = (unreadByConv[convKey] || 0) + 1;
        }
      });

      smsUnread = Object.values(unreadByConv).reduce((sum, count) => sum + count, 0);
    }
  } catch (e) {
    console.error('Error counting SMS unreads:', e);
  }

  // Count chat unreads
  try {
    const { data: chatSessions } = await supabase
      .from('chat_sessions')
      .select('id, last_message_at')
      .eq('user_id', userId)
      .order('last_message_at', { ascending: false })
      .limit(50);

    if (chatSessions?.length > 0) {
      const sessionIds = chatSessions.map(s => s.id);
      const { data: allMessages } = await supabase
        .from('chat_messages')
        .select('session_id, role, created_at')
        .in('session_id', sessionIds)
        .order('created_at', { ascending: false });

      const sessionLastMessage = {};
      (allMessages || []).forEach(msg => {
        if (!sessionLastMessage[msg.session_id]) {
          sessionLastMessage[msg.session_id] = msg;
        }
      });

      for (const session of chatSessions) {
        const lastMsg = sessionLastMessage[session.id];
        if (!lastMsg || lastMsg.role !== 'visitor') continue;

        const msgDate = new Date(lastMsg.created_at);
        if (!isViewed('chat', session.id, msgDate)) {
          chatUnread += 1;
        }
      }
    }
  } catch (e) {
    console.error('Error counting chat unreads:', e);
  }

  // Count call unreads
  try {
    const { data: calls } = await supabase
      .from('call_records')
      .select('id, started_at, created_at')
      .eq('user_id', userId)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(50);

    if (calls?.length > 0) {
      for (const call of calls) {
        const callDate = new Date(call.started_at || call.created_at || Date.now());
        if (!isViewed('call', call.id, callDate)) {
          callsUnread += 1;
        }
      }
    }
  } catch (e) {
    console.error('Error counting call unreads:', e);
  }

  // Update state
  unreadCounts = {
    sms: smsUnread,
    chat: chatUnread,
    calls: callsUnread,
    total: smsUnread + chatUnread + callsUnread
  };

  updateBadgeDOM();
  notifyListeners();

  return unreadCounts;
}

/**
 * Mark a conversation as read
 */
export function markAsRead(type, key) {
  const viewedConversations = getViewedConversations();

  let convKey, lastViewedKey;
  if (type === 'sms') {
    convKey = key;
    lastViewedKey = `conversation_last_viewed_sms_${key}`;
  } else if (type === 'chat') {
    convKey = `chat_${key}`;
    lastViewedKey = `conversation_last_viewed_chat_${key}`;
  } else if (type === 'call') {
    convKey = `call_${key}`;
    lastViewedKey = `conversation_last_viewed_call_${key}`;
  }

  // Update both localStorage mechanisms
  viewedConversations.add(convKey);
  localStorage.setItem('inbox_viewed_conversations', JSON.stringify([...viewedConversations]));
  localStorage.setItem(lastViewedKey, new Date().toISOString());

  // Recalculate (this will update counts and notify listeners)
  if (currentUserId) {
    recalculateUnreads(currentUserId);
  }
}

/**
 * Mark all conversations as read
 */
export async function markAllAsRead() {
  if (!currentUserId) {
    const { user } = await getCurrentUser();
    if (!user) return;
    currentUserId = user.id;
  }

  const viewedConversations = getViewedConversations();
  const now = new Date().toISOString();

  // Mark all SMS as read
  try {
    const { data: messages } = await supabase
      .from('sms_messages')
      .select('sender_number, recipient_number')
      .eq('user_id', currentUserId)
      .eq('direction', 'inbound');

    const seenConvs = new Set();
    messages?.forEach(msg => {
      const convKey = `${msg.sender_number}_${msg.recipient_number}`;
      if (!seenConvs.has(convKey)) {
        seenConvs.add(convKey);
        viewedConversations.add(convKey);
        localStorage.setItem(`conversation_last_viewed_sms_${convKey}`, now);
      }
    });
  } catch (e) {
    console.error('Error marking SMS as read:', e);
  }

  // Mark all chats as read
  try {
    const { data: sessions } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('user_id', currentUserId);

    sessions?.forEach(s => {
      viewedConversations.add(`chat_${s.id}`);
      localStorage.setItem(`conversation_last_viewed_chat_${s.id}`, now);
    });
  } catch (e) {
    console.error('Error marking chats as read:', e);
  }

  // Mark all calls as read
  try {
    const { data: calls } = await supabase
      .from('call_records')
      .select('id')
      .eq('user_id', currentUserId)
      .eq('direction', 'inbound');

    calls?.forEach(c => {
      viewedConversations.add(`call_${c.id}`);
      localStorage.setItem(`conversation_last_viewed_call_${c.id}`, now);
    });
  } catch (e) {
    console.error('Error marking calls as read:', e);
  }

  // Save and update
  localStorage.setItem('inbox_viewed_conversations', JSON.stringify([...viewedConversations]));

  unreadCounts = { sms: 0, chat: 0, calls: 0, total: 0 };
  updateBadgeDOM();
  notifyListeners();
}

/**
 * Set the unread count directly (for when inbox.js has already calculated it)
 */
export function setUnreadCount(count) {
  unreadCounts.total = count;
  updateBadgeDOM();
  notifyListeners();
}

/**
 * Initialize real-time subscriptions
 */
export async function initUnreadTracking() {
  const { user } = await getCurrentUser();
  if (!user) return;

  currentUserId = user.id;

  // Calculate initial counts
  await recalculateUnreads(user.id);

  // Clean up existing subscriptions
  subscriptions.forEach(sub => sub.unsubscribe());
  subscriptions = [];

  // Subscribe to new SMS messages
  const smsSubscription = supabase
    .channel('unread-sms-service')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'sms_messages',
      filter: `user_id=eq.${user.id}`
    }, (payload) => {
      if (payload.new.direction === 'inbound') {
        // New inbound message - recalculate
        recalculateUnreads(user.id);
      }
    })
    .subscribe();
  subscriptions.push(smsSubscription);

  // Subscribe to new chat messages
  const chatSubscription = supabase
    .channel('unread-chat-service')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'chat_messages'
    }, (payload) => {
      if (payload.new.role === 'visitor') {
        // New visitor message - recalculate
        recalculateUnreads(user.id);
      }
    })
    .subscribe();
  subscriptions.push(chatSubscription);

  // Subscribe to new calls
  const callSubscription = supabase
    .channel('unread-calls-service')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'call_records',
      filter: `user_id=eq.${user.id}`
    }, (payload) => {
      if (payload.new.direction === 'inbound') {
        // New inbound call - recalculate
        recalculateUnreads(user.id);
      }
    })
    .subscribe();
  subscriptions.push(callSubscription);

  isInitialized = true;
}

/**
 * Cleanup subscriptions
 */
export function cleanup() {
  subscriptions.forEach(sub => sub.unsubscribe());
  subscriptions = [];
  isInitialized = false;
}
