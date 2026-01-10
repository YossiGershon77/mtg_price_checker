import 'server-only';

/**
 * Server-only environment variables wrapper
 * This file ensures environment variables can only be accessed from server-side code
 * If imported in a client component, it will throw an error at build time
 */

/**
 * Validated environment variables
 * Throws an error if required environment variables are missing
 */
export const ENV = {
  EBAY_CLIENT_ID: process.env.EBAY_CLIENT_ID,
  EBAY_CLIENT_SECRET: process.env.EBAY_CLIENT_SECRET,
} as const;

// Validate required environment variables
if (!ENV.EBAY_CLIENT_ID) {
  throw new Error(
    'EBAY_CLIENT_ID is required but not set in environment variables. ' +
    'Please set EBAY_CLIENT_ID in your .env.local file.'
  );
}

if (!ENV.EBAY_CLIENT_SECRET) {
  throw new Error(
    'EBAY_CLIENT_SECRET is required but not set in environment variables. ' +
    'Please set EBAY_CLIENT_SECRET in your .env.local file.'
  );
}




