# Configuring Twilio Elastic SIP Trunk with Maggie

This guide walks you through connecting a Twilio Elastic SIP Trunk to Maggie so you can receive calls on your Twilio phone numbers through Maggie's AI agent.

## Prerequisites

- A Twilio account with Elastic SIP Trunking enabled
- One or more phone numbers in Twilio
- A Maggie account

## Overview

```
Caller → Twilio Phone Number → Twilio SIP Trunk → Maggie (LiveKit) → AI Agent
```

When someone calls your Twilio number, Twilio forwards the call via SIP to Maggie's infrastructure, where your AI agent handles it.

---

## Step 1: Create an External Trunk in Maggie

1. Log in to Maggie at https://magpipe.ai
2. Go to **Settings**
3. Scroll down to **External SIP Trunks**
4. Click **Add Trunk**
5. Fill in the details:
   - **Trunk Name**: `Twilio` (or any descriptive name)
   - **Provider**: `Twilio` (optional, for your reference)
   - **Authentication Type**: Choose **IP Whitelist**
   - **Allowed IP Addresses**: Add Twilio's signaling IPs (see Step 2)
6. Click **Create Trunk**
7. Note the SIP connection info displayed:
   - **Domain**: `378ads1njtd.sip.livekit.cloud`
   - **Port**: `5060` (UDP/TCP) or `5061` (TLS)

---

## Step 2: Get Twilio's IP Addresses

Twilio sends SIP traffic from specific IP ranges. Add these to your Maggie trunk's allowed IPs.

### Twilio Signaling IPs (Required)

Go to: https://www.twilio.com/docs/sip-trunking/ip-addresses

As of 2024, Twilio's primary signaling IPs include:

**North America (Ashburn):**
```
54.172.60.0/30
54.172.60.4/30
54.244.51.0/30
54.244.51.4/30
```

**North America (Oregon):**
```
54.244.51.0/30
54.244.51.4/30
```

**Edge Locations (recommended to add all):**
```
34.203.250.0/23
54.172.60.0/23
54.244.51.0/23
177.71.206.192/26
54.171.127.192/26
54.65.63.192/26
54.169.127.128/26
54.252.254.64/26
```

> **Note**: Check Twilio's documentation for the most current IP list, as these may change.

---

## Step 3: Add Your Phone Number to Maggie

1. In Maggie Settings → External SIP Trunks, find your Twilio trunk
2. Click **+ Add Number**
3. Enter your Twilio phone number in E.164 format (e.g., `+14155551234`)
4. Optionally add a label (e.g., "Main Line")
5. Click **Add**

The SIP URI for this number will be displayed:
```
sip:+14155551234@378ads1njtd.sip.livekit.cloud
```

---

## Step 4: Configure Twilio Elastic SIP Trunk

### 4.1 Create the SIP Trunk in Twilio

1. Log in to the [Twilio Console](https://console.twilio.com)
2. Navigate to **Elastic SIP Trunking** → **Trunks**
3. Click **Create new SIP Trunk**
4. Name it (e.g., "Maggie AI Agent")
5. Click **Create**

### 4.2 Configure Origination (Twilio → Maggie)

This tells Twilio where to send incoming calls.

1. In your trunk, go to the **Origination** tab
2. Click **Add new Origination URI**
3. Enter the Origination SIP URI:
   ```
   sip:378ads1njtd.sip.livekit.cloud:5060
   ```
4. Set **Priority**: `10`
5. Set **Weight**: `10`
6. Click **Add**

> **Note on TLS/Secure Trunking**: Twilio's Secure Trunking feature requires both TLS (signaling encryption) and SRTP (media encryption) together. Since SRTP is not currently configured on our LiveKit SIP trunk, use the non-secure option (port 5060) for now. Do not enable "Secure Trunking" in your Twilio trunk settings.

### 4.3 Configure Authentication

Twilio needs to authenticate with Maggie. Since we're using IP whitelist authentication on Maggie's side, no additional credential configuration is needed in Twilio.

However, ensure your trunk's **Origination** settings are correct and that the IPs you added to Maggie match Twilio's egress IPs.

### 4.4 Associate Phone Numbers

1. In your trunk, go to the **Numbers** tab
2. Click **Add a Number**
3. Select the phone number(s) you want to route through Maggie
4. Click **Add Selected**

---

## Step 5: Test the Connection

1. Call your Twilio phone number from any phone
2. The call should:
   - Hit Twilio
   - Route via SIP to Maggie (LiveKit)
   - Connect to your AI agent
3. Check Maggie's call logs to verify the call was received

---

## Troubleshooting

### Call not connecting

1. **Verify IP whitelist**: Ensure all Twilio IPs are added to your Maggie trunk
2. **Check phone number format**: Must be E.164 (e.g., `+14155551234`)
3. **Verify number is added**: The number must be registered in both Twilio AND Maggie
4. **Check trunk status**: In Maggie Settings, ensure the trunk shows "Active"

### "Number not found" errors

- The phone number in Maggie must exactly match the format Twilio sends (E.164)
- Ensure the number is added to the correct trunk in Maggie

### Authentication failures

- Double-check that Twilio's current IP ranges are in your Maggie trunk's allowed IPs
- Twilio IPs can change; check their documentation for updates

### One-way audio

- This usually indicates NAT/firewall issues
- Ensure your network allows UDP traffic on ports 10000-60000 (RTP media)

---

## Alternative: Registration-Based Authentication

If IP whitelisting doesn't work for your setup, you can use registration-based auth:

1. In Maggie, create the trunk with **Registration** auth type
2. Set a username and password
3. In Twilio, configure **Credential Lists**:
   - Go to **Elastic SIP Trunking** → **Authentication** → **Credential Lists**
   - Create a credential list with the same username/password
   - Associate it with your trunk

---

## Architecture Notes

- **Inbound calls**: Twilio → Maggie (LiveKit) → AI Agent
- **Outbound calls**: Not yet supported via external trunks (use Maggie's built-in calling)
- **Recording**: Handled by Maggie/LiveKit, not Twilio
- **Call transfer**: Supported - agent can transfer to any number

---

## Support

If you encounter issues:
1. Check Maggie's call logs for error details
2. Check Twilio's SIP Trunk logs in the console
3. Contact support with your trunk ID and call timestamps
