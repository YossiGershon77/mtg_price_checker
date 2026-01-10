import 'server-only';

/**
 * eBay OAuth 2.0 Client Credentials flow implementation
 * Handles token acquisition and caching for eBay API authentication
 */

import { ENV } from './env';

const EBAY_OAUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token';

interface EbayOAuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Cached token and expiry timestamp
 */
let cachedToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Get eBay OAuth 2.0 access token using Client Credentials flow
 * Implements token caching to avoid unnecessary API calls
 * 
 * @returns Promise<string> - The access token
 */
export async function getEbayAccessToken(): Promise<string> {
  // Check if we have a valid cached token
  const now = Date.now();
  if (cachedToken && tokenExpiry > now) {
    return cachedToken;
  }

  // Token expired or doesn't exist, fetch a new one
  try {
    // Base64 encode CLIENT_ID:CLIENT_SECRET
    const credentials = Buffer.from(`${ENV.EBAY_CLIENT_ID}:${ENV.EBAY_CLIENT_SECRET}`).toString('base64');

    const response = await fetch(EBAY_OAUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'https://api.ebay.com/oauth/api_scope',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`eBay OAuth error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data: EbayOAuthResponse = await response.json();

    // Cache the token with expiry timestamp (subtract 60 seconds as safety buffer)
    cachedToken = data.access_token;
    tokenExpiry = now + (data.expires_in - 60) * 1000; // Convert seconds to milliseconds, subtract 60s buffer

    return cachedToken;
  } catch (error) {
    // Clear cache on error
    cachedToken = null;
    tokenExpiry = 0;
    console.error('Error fetching eBay access token:', error);
    throw error;
  }
}



