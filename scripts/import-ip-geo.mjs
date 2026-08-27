#!/usr/bin/env node
/**
 * One-time import of db-ip city lite CSV into ip_geolocation table.
 * Usage: node scripts/import-ip-geo.mjs /path/to/dbip-city-lite.csv.gz
 *
 * The CSV (gzipped) can be downloaded from:
 *   https://download.db-ip.com/free/dbip-city-lite-YYYY-MM.csv.gz
 */

import { createClient } from '@supabase/supabase-js'
import { createReadStream } from 'fs'
import { createGunzip } from 'zlib'
import { createInterface } from 'readline'
import { config } from 'dotenv'

config()

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const BATCH_SIZE = 2000

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const csvPath = process.argv[2]
if (!csvPath) {
  console.error('Usage: node scripts/import-ip-geo.mjs <path-to-csv-or-csv.gz>')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function insertBatch(rows) {
  const { error } = await supabase.from('ip_geolocation').insert(rows)
  if (error) throw error
}

async function main() {
  console.log(`Reading from: ${csvPath}`)

  const isGzipped = csvPath.endsWith('.gz')
  const fileStream = createReadStream(csvPath)
  const inputStream = isGzipped ? fileStream.pipe(createGunzip()) : fileStream
  const rl = createInterface({ input: inputStream, crlfDelay: Infinity })

  let batch = []
  let total = 0
  let errors = 0

  for await (const line of rl) {
    if (!line.trim()) continue

    // Format: ip_start,ip_end,continent,country,state,city,lat,lng
    const parts = line.split(',')
    if (parts.length < 6) continue

    const [ip_start, ip_end, continent, country, state, city, lat, lng] = parts.map(p => p.replace(/^"|"$/g, '').trim())

    // Skip invalid or reserved ranges
    if (!ip_start || !ip_end || ip_start === '0.0.0.0') continue

    batch.push({
      ip_start,
      ip_end,
      continent: continent || null,
      country: country || null,
      state: state || null,
      city: city || null,
      lat: lat ? parseFloat(lat) : null,
      lng: lng ? parseFloat(lng) : null,
    })

    if (batch.length >= BATCH_SIZE) {
      try {
        await insertBatch(batch)
        total += batch.length
        process.stdout.write(`\rInserted ${total.toLocaleString()} rows...`)
      } catch (err) {
        console.error(`\nBatch error at row ~${total}: ${err.message}`)
        errors++
      }
      batch = []
    }
  }

  // Final batch
  if (batch.length > 0) {
    try {
      await insertBatch(batch)
      total += batch.length
    } catch (err) {
      console.error(`\nFinal batch error: ${err.message}`)
      errors++
    }
  }

  console.log(`\nDone. ${total.toLocaleString()} rows inserted. ${errors} batch errors.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
