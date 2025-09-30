#!/usr/bin/env node

/**
 * Add Phone Number Pool to SignalWire Campaign
 *
 * This script takes all 'provisioning' numbers from the pool and adds them
 * to the SignalWire 10DLC campaign. Run this 1 hour after bulk purchase.
 *
 * Usage:
 *   node scripts/add-pool-to-campaign.js --campaign-id YOUR_CAMPAIGN_ID
 */

import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const SIGNALWIRE_PROJECT_ID = process.env.SIGNALWIRE_PROJECT_ID;
const SIGNALWIRE_API_TOKEN = process.env.SIGNALWIRE_API_TOKEN;
const SIGNALWIRE_SPACE_URL = process.env.SIGNALWIRE_SPACE_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Parse command line arguments
const args = process.argv.slice(2);
const campaignArg = args.find(arg => arg.startsWith('--campaign-id='));

if (!campaignArg) {
  console.error('❌ Missing --campaign-id argument');
  console.log('\nUsage: node scripts/add-pool-to-campaign.js --campaign-id YOUR_CAMPAIGN_ID');
  process.exit(1);
}

const CAMPAIGN_ID = campaignArg.split('=')[1];

console.log(`\n🚀 Add Numbers to Campaign Script`);
console.log(`📋 Campaign ID: ${CAMPAIGN_ID}\n`);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function addNumberToCampaign(phoneNumber, campaignId) {
  const auth = btoa(`${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}`);

  const data = new URLSearchParams({
    PhoneNumber: phoneNumber,
  });

  const response = await fetch(
    `https://${SIGNALWIRE_SPACE_URL}/api/fabric/phone_numbers/${campaignId}/assignments`,
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
    throw new Error(`Campaign assignment failed: ${error}`);
  }

  return await response.json();
}

async function updatePoolStatus(phoneNumber, status, campaignId = null) {
  const updateData = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (campaignId) {
    updateData.campaign_id = campaignId;
  }

  const { error } = await supabase
    .from('phone_number_pool')
    .update(updateData)
    .eq('phone_number', phoneNumber);

  if (error) {
    console.error(`❌ Failed to update pool status for ${phoneNumber}:`, error.message);
  }
}

async function main() {
  try {
    console.log(`🔍 Finding numbers in 'provisioning' status...`);

    const { data: numbers, error } = await supabase
      .from('phone_number_pool')
      .select('*')
      .eq('status', 'provisioning');

    if (error) {
      throw new Error(`Failed to fetch pool: ${error.message}`);
    }

    if (!numbers || numbers.length === 0) {
      console.log(`✅ No numbers in provisioning status. All done!`);
      return;
    }

    console.log(`📞 Found ${numbers.length} numbers to add to campaign\n`);

    let added = 0;
    let failed = 0;

    for (const num of numbers) {
      try {
        console.log(`📞 Adding ${num.phone_number} to campaign...`);

        await addNumberToCampaign(num.phone_number, CAMPAIGN_ID);

        await updatePoolStatus(num.phone_number, 'ready', CAMPAIGN_ID);

        added++;
        console.log(`✅ Added ${num.phone_number} (${added}/${numbers.length})`);

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        failed++;
        console.error(`❌ Failed to add ${num.phone_number}:`, error.message);
        await updatePoolStatus(num.phone_number, 'failed');
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Successfully added: ${added}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`\n✨ Numbers are now ready for customer assignment!\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
