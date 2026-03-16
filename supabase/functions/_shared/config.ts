/**
 * App Configuration (Edge Functions)
 * Centralizes app name, URLs, and email addresses for easy customization.
 */

export const APP_NAME = Deno.env.get('APP_NAME') || 'Magpipe';
export const APP_URL = Deno.env.get('APP_URL') || Deno.env.get('FRONTEND_URL') || '';
export const API_URL = Deno.env.get('API_URL') || Deno.env.get('SUPABASE_URL') || '';
export const SUPPORT_EMAIL = Deno.env.get('SUPPORT_EMAIL') || 'help@magpipe.ai';
export const NOTIFICATION_EMAIL = Deno.env.get('NOTIFICATION_EMAIL') || 'info@magpipe.ai';
