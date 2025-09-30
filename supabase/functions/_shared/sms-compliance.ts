/**
 * USA SMS Compliance Utilities
 * Handles STOP/CANCEL/UNSUBSCRIBE requirements for US SMS
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// USA Campaign phone number for SignalWire
export const USA_CAMPAIGN_NUMBER = '+16503912711'

// Enable/disable USA campaign routing (set to false until campaign number is configured in SignalWire)
const USE_CAMPAIGN_NUMBER = Deno.env.get('USE_USA_CAMPAIGN_NUMBER') === 'true'

// Opt-out keywords (case insensitive)
const OPT_OUT_KEYWORDS = ['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit']

// Opt-in keywords (case insensitive)
const OPT_IN_KEYWORDS = ['start', 'unstop', 'yes']

// Cache for Canadian area codes (refreshed periodically)
let canadianAreaCodesCache: Set<string> | null = null
let cacheLastUpdated: number = 0
const CACHE_TTL = 1000 * 60 * 60 // 1 hour

/**
 * Load Canadian area codes from database
 */
async function loadCanadianAreaCodes(supabase: SupabaseClient): Promise<Set<string>> {
  const now = Date.now()

  // Return cached data if still fresh
  if (canadianAreaCodesCache && (now - cacheLastUpdated) < CACHE_TTL) {
    return canadianAreaCodesCache
  }

  // Fetch from database
  const { data, error } = await supabase
    .from('area_codes')
    .select('area_code')
    .eq('country', 'Canada')

  if (error) {
    console.error('Error loading Canadian area codes:', error)
    // Return empty set on error (fail open - treat as non-US)
    return new Set()
  }

  // Update cache
  canadianAreaCodesCache = new Set(data.map(row => row.area_code))
  cacheLastUpdated = now

  return canadianAreaCodesCache
}

/**
 * Check if a phone number is a US number (not Canadian)
 * Requires database access to check area codes
 */
export async function isUSNumber(
  phoneNumber: string,
  supabase: SupabaseClient
): Promise<boolean> {
  const cleaned = phoneNumber.replace(/\D/g, '')

  // Must be North American format (+1 and 11 digits total)
  if (!cleaned.startsWith('1') || cleaned.length !== 11) {
    return false
  }

  // Extract area code (3 digits after country code)
  const areaCode = cleaned.substring(1, 4)

  // Load Canadian area codes
  const canadianAreaCodes = await loadCanadianAreaCodes(supabase)

  // If it's a Canadian area code, it's not a US number
  if (canadianAreaCodes.has(areaCode)) {
    return false
  }

  // It's a North American number (+1) that's not Canadian, so it's US
  return true
}

/**
 * Check if message contains opt-out keyword
 */
export function isOptOutMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase()
  return OPT_OUT_KEYWORDS.includes(normalized)
}

/**
 * Check if message contains opt-in keyword
 */
export function isOptInMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase()
  return OPT_IN_KEYWORDS.includes(normalized)
}

/**
 * Check if a phone number has opted out
 */
export async function isOptedOut(
  supabase: SupabaseClient,
  phoneNumber: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('sms_opt_outs')
    .select('status')
    .eq('phone_number', phoneNumber)
    .single()

  if (error || !data) {
    return false // If no record, assume not opted out
  }

  return data.status === 'opted_out'
}

/**
 * Record opt-out for a phone number
 */
export async function recordOptOut(
  supabase: SupabaseClient,
  phoneNumber: string
): Promise<void> {
  await supabase
    .from('sms_opt_outs')
    .upsert({
      phone_number: phoneNumber,
      status: 'opted_out',
      opted_out_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'phone_number'
    })
}

/**
 * Record opt-in for a phone number
 */
export async function recordOptIn(
  supabase: SupabaseClient,
  phoneNumber: string
): Promise<void> {
  await supabase
    .from('sms_opt_outs')
    .upsert({
      phone_number: phoneNumber,
      status: 'opted_in',
      opted_in_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'phone_number'
    })
}

/**
 * Get appropriate sender number based on recipient location
 * US service numbers need to be in a campaign, so always use campaign number for US recipients
 * Canadian numbers can be used directly for Canadian recipients
 */
export async function getSenderNumber(
  recipientNumber: string,
  defaultNumber: string,
  supabase: SupabaseClient
): Promise<string> {
  // Check if campaign routing is enabled
  const useCampaignNumber = Deno.env.get('USE_USA_CAMPAIGN_NUMBER') === 'true'

  // If campaign routing is disabled, always use default number
  if (!useCampaignNumber) {
    console.log('USA campaign routing disabled, using default number')
    return defaultNumber
  }

  // Check if recipient is US
  const recipientIsUS = await isUSNumber(recipientNumber, supabase)

  // For US recipients, always use campaign number (ensures 10DLC compliance)
  if (recipientIsUS) {
    console.log(`Recipient ${recipientNumber} is US, using campaign number ${USA_CAMPAIGN_NUMBER}`)
    return USA_CAMPAIGN_NUMBER
  }

  // For non-US recipients, use service number
  console.log(`Recipient ${recipientNumber} is non-US, using service number ${defaultNumber}`)
  return defaultNumber
}

/**
 * Get opt-out confirmation message
 */
export function getOptOutConfirmation(): string {
  return 'You have been unsubscribed from SMS messages. Reply START to opt back in.'
}

/**
 * Get opt-in confirmation message
 */
export function getOptInConfirmation(): string {
  return 'You have been subscribed to SMS messages. Reply STOP to unsubscribe.'
}
