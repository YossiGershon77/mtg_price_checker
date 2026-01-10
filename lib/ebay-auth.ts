/**
 * EBAY PRODUCTION AUTH FIX (STRICT)
 */

import "server-only";

let cachedToken: string | null = null;
let tokenExpiry: number = 0;

export async function getEbayToken() {
  // 1. Manually pull and CLEAN the keys from .env.local
  const rawAppId = process.env.EBAY_APP_ID || "";
  const rawCertId = process.env.EBAY_CERT_ID || "";
  
  // .trim() removes any accidental spaces or newlines from the file
  const appId = rawAppId.trim();
  const certId = rawCertId.trim();

  // 2. Create the EXACT string eBay expects: "AppID:CertID"
  const credentialString = `${appId}:${certId}`;
  
  // 3. Base64 Encode
  const encoded = Buffer.from(credentialString).toString('base64');

  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${encoded}`,
      'Accept': 'application/json', // Sometimes required for production
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope' // Ensure this is exactly this URL
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    console.error("❌ EBAY AUTH DETAIL:", errorData);
    return { success: false, error: errorData.error_description };
  }

  const data = await response.json();
  return { success: true, token: data.access_token };
}
