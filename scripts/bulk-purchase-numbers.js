#!/usr/bin/env node

/**
 * Bulk Purchase US Phone Numbers for Campaign Pool
 *
 * This script purchases multiple US phone numbers across major US cities
 * to build a pre-provisioned pool that can be added to the SignalWire campaign.
 *
 * Usage:
 *   node scripts/bulk-purchase-numbers.js --count 100
 */

import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const SIGNALWIRE_PROJECT_ID = process.env.SIGNALWIRE_PROJECT_ID;
const SIGNALWIRE_API_TOKEN = process.env.SIGNALWIRE_API_TOKEN;
const SIGNALWIRE_SPACE_URL = process.env.SIGNALWIRE_SPACE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Major US cities and their area codes
const US_CITIES = [
  { city: 'New York', areaCodes: ['212', '646', '917', '718', '347'] },
  { city: 'Los Angeles', areaCodes: ['213', '323', '310', '424', '818'] },
  { city: 'Chicago', areaCodes: ['312', '773', '872'] },
  { city: 'Houston', areaCodes: ['713', '281', '832'] },
  { city: 'Phoenix', areaCodes: ['602', '623', '480'] },
  { city: 'Philadelphia', areaCodes: ['215', '267', '445'] },
  { city: 'San Antonio', areaCodes: ['210', '726'] },
  { city: 'San Diego', areaCodes: ['619', '858', '935'] },
  { city: 'Dallas', areaCodes: ['214', '469', '972', '945'] },
  { city: 'San Jose', areaCodes: ['408', '669'] },
  { city: 'Austin', areaCodes: ['512', '737'] },
  { city: 'Jacksonville', areaCodes: ['904'] },
  { city: 'San Francisco', areaCodes: ['415', '628'] },
  { city: 'Columbus', areaCodes: ['614', '380'] },
  { city: 'Indianapolis', areaCodes: ['317'] },
  { city: 'Seattle', areaCodes: ['206', '253', '425'] },
  { city: 'Denver', areaCodes: ['303', '720', '983'] },
  { city: 'Boston', areaCodes: ['617', '857'] },
  { city: 'Nashville', areaCodes: ['615', '629'] },
  { city: 'Miami', areaCodes: ['305', '786', '645'] },
];

// Parse command line arguments
const args = process.argv.slice(2);
const countArg = args.find(arg => arg.startsWith('--count='));

const COUNT = countArg ? parseInt(countArg.split('=')[1]) : 100;

console.log(`\n🚀 Bulk Number Purchase Script`);
console.log(`📊 Purchasing ${COUNT} numbers across ${US_CITIES.length} major US cities\n`);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function searchAvailableNumbers(areaCode, limit) {
  const auth = btoa(`${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}`);

  const response = await fetch(
    `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/AvailablePhoneNumbers/US/Local?AreaCode=${areaCode}&SmsEnabled=true&VoiceEnabled=true&PageSize=${limit}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`SignalWire search failed: ${error}`);
  }

  const result = await response.json();
  return result.available_phone_numbers || [];
}

async function purchaseNumber(phoneNumber) {
  const auth = btoa(`${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}`);

  const data = new URLSearchParams({
    PhoneNumber: phoneNumber,
  });

  const response = await fetch(
    `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}/IncomingPhoneNumbers`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: data.toString(),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Purchase failed: ${error}`);
  }

  return await response.json();
}

async function storeInPool(phoneNumber, phoneSid, areaCode, city) {
  const { error } = await supabase
    .from('phone_number_pool')
    .insert({
      phone_number: phoneNumber,
      phone_sid: phoneSid,
      area_code: areaCode,
      city: city,
      status: 'provisioning', // Will be 'ready' after added to campaign
      purchased_at: new Date().toISOString(),
    });

  if (error) {
    console.error(`❌ Failed to store ${phoneNumber} in pool:`, error.message);
  }
}

async function main() {
  try {
    // Distribute purchases across cities
    const numbersPerCity = Math.ceil(COUNT / US_CITIES.length);

    console.log(`🌎 Distributing ${COUNT} numbers across ${US_CITIES.length} cities (~${numbersPerCity} per city)\n`);

    let totalPurchased = 0;
    let totalFailed = 0;
    const cityStats = {};

    for (const cityInfo of US_CITIES) {
      if (totalPurchased >= COUNT) break;

      const remainingNeeded = COUNT - totalPurchased;
      const targetForCity = Math.min(numbersPerCity, remainingNeeded);

      console.log(`\n📍 ${cityInfo.city}`);
      console.log(`   Searching ${cityInfo.areaCodes.join(', ')}...`);

      let cityPurchased = 0;

      // Try each area code for this city
      for (const areaCode of cityInfo.areaCodes) {
        if (cityPurchased >= targetForCity) break;

        try {
          const needed = targetForCity - cityPurchased;
          const availableNumbers = await searchAvailableNumbers(areaCode, needed);

          for (const num of availableNumbers) {
            if (cityPurchased >= targetForCity || totalPurchased >= COUNT) break;

            try {
              const result = await purchaseNumber(num.phone_number);

              await storeInPool(result.phone_number, result.sid, areaCode, cityInfo.city);

              cityPurchased++;
              totalPurchased++;
              console.log(`   ✅ ${result.phone_number} (${totalPurchased}/${COUNT})`);

              // Small delay to avoid rate limits
              await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
              totalFailed++;
              console.error(`   ❌ Failed: ${num.phone_number} - ${error.message}`);
            }
          }
        } catch (error) {
          console.error(`   ⚠️  Area code ${areaCode} search failed: ${error.message}`);
        }
      }

      cityStats[cityInfo.city] = cityPurchased;
      console.log(`   📊 ${cityInfo.city}: ${cityPurchased} numbers purchased`);
    }

    console.log(`\n\n📊 Final Summary:`);
    console.log(`   ✅ Successfully purchased: ${totalPurchased}`);
    console.log(`   ❌ Failed: ${totalFailed}`);
    console.log(`\n🌎 City Distribution:`);
    Object.entries(cityStats).forEach(([city, count]) => {
      if (count > 0) {
        console.log(`   ${city}: ${count} numbers`);
      }
    });
    console.log(`\n⏰ Wait 1 hour before running add-to-campaign script\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
