# Price Alert Cron Job Setup

## Overview

The price alert cron job automatically checks eBay listings for cards that match your price alerts and triggers notifications when matches are found.

## API Endpoint

**POST/GET** `/api/cron/check-alerts`

This endpoint:
1. Fetches all active (non-triggered) alerts from server storage
2. Searches eBay for each card
3. Checks if any listing price is <= the target price
4. Triggers notifications for matches
5. Marks matched alerts as triggered

## Setup Options

### Option 1: Vercel Cron Jobs (Recommended for Vercel deployments)

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/check-alerts",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

This runs every 6 hours. Adjust the schedule as needed:
- `0 */6 * * *` - Every 6 hours
- `0 * * * *` - Every hour
- `0 9,15,21 * * *` - At 9 AM, 3 PM, and 9 PM daily

### Option 2: External Cron Service

Use services like:
- **cron-job.org** - Free tier available
- **EasyCron** - Free tier available
- **GitHub Actions** (for public repos)

Set the cron service to call:
```
POST https://your-domain.com/api/cron/check-alerts
Authorization: Bearer YOUR_CRON_SECRET
```

### Option 3: Manual Testing

Simply visit or curl:
```bash
curl -X POST https://your-domain.com/api/cron/check-alerts
```

Or with authentication:
```bash
curl -X POST https://your-domain.com/api/cron/check-alerts \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## Authentication (Optional)

To protect the endpoint, set `CRON_SECRET` in your environment variables:

```env
CRON_SECRET=your-secret-key-here
```

Then the endpoint will require:
```
Authorization: Bearer your-secret-key-here
```

## Storage

Alerts are stored in:
- **Client-side**: `localStorage` (for UI access)
- **Server-side**: `data/price-alerts.json` (for cron job access)

Alerts are automatically synced to the server when created via the UI.

## Notification System

Currently, notifications are logged to the console. To implement actual notifications, update the `triggerNotification()` function in `app/api/cron/check-alerts/route.ts` with:

- Email (Resend, SendGrid, etc.)
- Push notifications
- Webhooks
- SMS (Twilio, etc.)
- Discord/Slack webhooks

## Response Format

Success response:
```json
{
  "message": "Alert check completed",
  "checked": 5,
  "triggered": 2,
  "errors": []
}
```

Error response:
```json
{
  "error": "Internal server error",
  "message": "Error details"
}
```



