import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { S3Client, GetObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3@3'
import { getSignedUrl } from 'https://esm.sh/@aws-sdk/s3-request-presigner@3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { recordingUrl } = await req.json()

    if (!recordingUrl) {
      return new Response(JSON.stringify({ error: 'recordingUrl is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Parse S3 URL to extract bucket and key
    // Format: https://pat-livekit-recordings.s3.amazonaws.com/recordings/file.mp4
    const url = new URL(recordingUrl)
    const bucket = url.hostname.split('.')[0] // pat-livekit-recordings
    const key = url.pathname.substring(1) // Remove leading slash

    console.log(`Generating signed URL for bucket: ${bucket}, key: ${key}`)

    // Initialize S3 client
    const s3Client = new S3Client({
      region: Deno.env.get('AWS_REGION') || 'us-east-2',
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID')!,
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY')!,
      },
    })

    // Generate signed URL valid for 1 hour
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })

    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600, // 1 hour
    })

    console.log(`✅ Generated signed URL (expires in 1 hour)`)

    return new Response(JSON.stringify({ signedUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Error generating signed URL:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
