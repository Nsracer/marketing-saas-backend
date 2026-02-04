/**
 * OAuth Token Service
 * Manages persistent OAuth connections for Google Analytics and Search Console
 * Tokens are stored in database and auto-refreshed when expired
 */

import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

// Validate environment variables (optional for some services)
if (!process.env.SUPABASE_URL) {
  console.warn('⚠️ SUPABASE_URL is not set in environment variables - OAuth features will be limited');
}

if (!process.env.SUPABASE_SERVICE_KEY) {
  console.warn('⚠️ SUPABASE_SERVICE_KEY is not set in environment variables - OAuth features will be limited');
}

console.log('🔍 Supabase Config Check:');
console.log('   SUPABASE_URL:', process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL.substring(0, 30)}...` : 'MISSING');
console.log('   SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? 'SET' : 'MISSING');

let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
} else {
  console.warn('⚠️ Supabase not configured - OAuth token persistence disabled');
}

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Bug #6 Fix: Mutex for token refresh to prevent race conditions
const refreshInProgress = new Map();

// Bug #1 Fix: Email normalization helper
function normalizeEmail(email) {
  return email?.toLowerCase().trim() || '';
}

// Bug #5 Fix: Validate timestamp is in milliseconds
function normalizeTimestamp(timestamp) {
  if (!timestamp) return null;
  // If timestamp is in seconds (less than year 2100 in seconds), convert to ms
  if (timestamp < 4102444800) {
    return timestamp * 1000;
  }
  return timestamp;
}

const oauthTokenService = {
  /**
   * Store OAuth tokens in database
   * @param {string} userEmail - User's email
   * @param {object} tokens - OAuth tokens from provider
   * @param {string} provider - OAuth provider ('google' or 'facebook')
   * @returns {Promise<boolean>} Success status
   */
  async storeTokens(userEmail, tokens, provider = 'google') {
    try {
      // Bug #1 Fix: Normalize email
      userEmail = normalizeEmail(userEmail);

      if (!supabase) {
        console.warn('⚠️ Supabase not configured - tokens not persisted');
        return true; // Return success but don't actually store
      }

      // Bug #5 & #9 Fix: Normalize timestamp and use consistent field name
      const expiresAt = normalizeTimestamp(tokens.expires_at || tokens.expiry_date);

      const tokenData = {
        user_email: userEmail,
        provider: provider,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        expires_at: expiresAt,
        scope: tokens.scope || null,
        updated_at: new Date().toISOString()
      };

      // For Facebook, store additional user info
      if (provider === 'facebook') {
        tokenData.provider_user_id = tokens.user_id || null;
        tokenData.provider_user_name = tokens.user_name || null;
      }

      // Bug #11 Fix: Store LinkedIn provider info if available
      if (provider === 'linkedin') {
        tokenData.provider_user_id = tokens.provider_user_id || null;
        tokenData.provider_user_name = tokens.provider_user_name || null;
        tokenData.provider_user_email = tokens.provider_user_email || null;
      }

      // Check if user already has tokens for this provider
      const { data: existing } = await supabase
        .from('oauth_tokens')
        .select('id')
        .eq('user_email', userEmail)
        .eq('provider', provider)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (existing && existing.length > 0) {
        // Update existing tokens
        const { error } = await supabase
          .from('oauth_tokens')
          .update(tokenData)
          .eq('id', existing[0].id);

        if (error) throw error;
      } else {
        // Insert new tokens
        const { error } = await supabase
          .from('oauth_tokens')
          .insert(tokenData);

        if (error) throw error;
      }

      return true;
    } catch (error) {
      console.error('❌ Error storing OAuth tokens:', error);
      return false;
    }
  },

  /**
   * Get stored OAuth tokens for a user
   * @param {string} userEmail - User's email
   * @param {string} provider - OAuth provider ('google' or 'facebook')
   * @returns {Promise<object|null>} OAuth tokens or null
   */
  async getTokens(userEmail, provider = 'google') {
    try {
      // Bug #1 Fix: Normalize email
      userEmail = normalizeEmail(userEmail);

      if (!supabase) {
        console.warn('⚠️ Supabase not configured - cannot retrieve stored tokens');
        return null;
      }

      const { data, error } = await supabase
        .from('oauth_tokens')
        .select('*')
        .eq('user_email', userEmail)
        .eq('provider', provider)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        return null;
      }

      const tokenRow = data[0];

      // Bug #5 Fix: Normalize timestamp when reading
      const expiresAt = normalizeTimestamp(tokenRow.expires_at);

      // Bug #9 Fix: Use consistent field names (expires_at everywhere)
      const tokens = {
        access_token: tokenRow.access_token,
        refresh_token: tokenRow.refresh_token,
        expires_at: expiresAt,
        expiry_date: expiresAt, // Keep for backward compatibility
        scope: tokenRow.scope,
        token_type: 'Bearer',
        provider: provider
      };

      // Add provider-specific fields
      if (provider === 'facebook') {
        tokens.user_id = tokenRow.provider_user_id;
        tokens.user_name = tokenRow.provider_user_name;
      }

      if (provider === 'linkedin') {
        tokens.provider_user_id = tokenRow.provider_user_id;
        tokens.provider_user_name = tokenRow.provider_user_name;
        tokens.provider_user_email = tokenRow.provider_user_email;
      }

      return tokens;
    } catch (error) {
      console.error('❌ Error fetching OAuth tokens:', error);
      return null;
    }
  },

  /**
   * Check if user has valid OAuth connection
   * @param {string} userEmail - User's email
   * @param {string} provider - OAuth provider ('google' or 'facebook')
   * @returns {Promise<boolean>} True if connected
   */
  async isConnected(userEmail, provider = 'google') {
    try {
      // Bug #1 Fix: Normalize email
      userEmail = normalizeEmail(userEmail);
      const tokens = await this.getTokens(userEmail, provider);
      return tokens !== null && (tokens.access_token || tokens.refresh_token);
    } catch (error) {
      console.error('❌ Error checking connection:', error);
      return false;
    }
  },

  /**
   * Refresh expired access token using refresh token
   * @param {string} userEmail - User's email
   * @returns {Promise<object|null>} New tokens or null
   */
  async refreshTokens(userEmail, provider = 'google') {
    try {
      // Bug #1 Fix: Normalize email
      userEmail = normalizeEmail(userEmail);

      // Only Google needs refresh really, but kept generic structure
      if (provider !== 'google') {
        // For now, only Google refresh is implemented with googleapis
        return await this.getTokens(userEmail, provider);
      }

      // Bug #6 Fix: Check if refresh is already in progress for this user
      if (refreshInProgress.get(userEmail)) {
        console.log('⏳ Token refresh already in progress for user, waiting...');
        // Wait for the existing refresh to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await this.getTokens(userEmail, provider);
      }

      // Mark refresh as in progress
      refreshInProgress.set(userEmail, true);

      try {
        const tokens = await this.getTokens(userEmail, provider);
        if (!tokens || !tokens.refresh_token) {
          console.log('❌ No refresh token available for user');
          return null;
        }

        console.log('🔄 Refreshing access token for user...');

        // Set credentials and refresh
        oauth2Client.setCredentials(tokens);
        const { credentials } = await oauth2Client.refreshAccessToken();

        console.log('✅ Access token refreshed successfully');

        // Bug #9 Fix: Use consistent field names
        const newTokens = {
          access_token: credentials.access_token,
          refresh_token: credentials.refresh_token || tokens.refresh_token,
          expires_at: normalizeTimestamp(credentials.expiry_date || credentials.expires_at),
          scope: credentials.scope || tokens.scope
        };
        await this.storeTokens(userEmail, newTokens, provider);

        return newTokens;
      } finally {
        // Bug #6 Fix: Clear the mutex after completion
        refreshInProgress.delete(userEmail);
      }
    } catch (error) {
      console.error('❌ Error refreshing OAuth tokens:', error);
      refreshInProgress.delete(userEmail);

      // If refresh fails, connection is broken
      if (error.message?.includes('invalid_grant')) {
        console.log('🔓 Invalid grant - disconnecting user');
        await this.disconnect(userEmail);
      }

      return null;
    }
  },

  /**
   * Get valid OAuth client (auto-refreshes if needed)
   * @param {string} userEmail - User's email
   * @returns {Promise<OAuth2Client|null>} Configured OAuth client or null
   */
  async getOAuthClient(userEmail) {
    try {
      // Bug #1 Fix: Normalize email
      userEmail = normalizeEmail(userEmail);

      let tokens = await this.getTokens(userEmail);

      if (!tokens) {
        console.log('❌ No tokens found for user');
        return null;
      }

      // Bug #5 Fix: Use normalized timestamp
      const now = Date.now();
      const expiryDate = tokens.expires_at || 0;
      const fiveMinutesFromNow = now + (5 * 60 * 1000);

      // Refresh if expired or expiring soon
      if (expiryDate && expiryDate < fiveMinutesFromNow) {
        console.log('🔄 Token expired or expiring soon, refreshing...');
        tokens = await this.refreshTokens(userEmail);

        if (!tokens) {
          console.log('❌ Failed to refresh tokens');
          return null;
        }
      }

      // Create and configure OAuth client
      const client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

      client.setCredentials(tokens);

      console.log(`✅ OAuth client ready for user`);
      return client;
    } catch (error) {
      console.error('❌ Error getting OAuth client:', error);
      return null;
    }
  },

  /**
   * Disconnect user's OAuth connection
   * @param {string} userEmail - User's email
   * @param {string} provider - OAuth provider ('google' or 'facebook')
   * @returns {Promise<boolean>} Success status
   */
  async disconnect(userEmail, provider = 'google') {
    try {
      // Bug #1 Fix: Normalize email
      userEmail = normalizeEmail(userEmail);

      // Revoke tokens with provider
      const tokens = await this.getTokens(userEmail, provider);
      if (tokens?.access_token) {
        try {
          if (provider === 'google') {
            await oauth2Client.revokeToken(tokens.access_token);
          }
          // Facebook doesn't require explicit token revocation
        } catch (error) {
          console.warn(`⚠️ Failed to revoke token with ${provider}:`, error.message);
        }
      }

      // Delete from database
      if (supabase) {
        const { error } = await supabase
          .from('oauth_tokens')
          .delete()
          .eq('user_email', userEmail)
          .eq('provider', provider);

        if (error) throw error;
      } else {
        console.warn('⚠️ Supabase not configured - tokens not deleted from database');
      }

      console.log(`✅ OAuth disconnected for: [USER_EMAIL] (${provider})`);
      return true;
    } catch (error) {
      return false;
    }
  },

  /**
   * Delete tokens from database (alias for disconnect)
   * @param {string} userEmail - User's email
   * @param {string} provider - OAuth provider ('google' or 'facebook')
   * @returns {Promise<boolean>} Success status
   */
  async deleteTokens(userEmail, provider = 'google') {
    // Bug #1 Fix: Normalize email (disconnect will also normalize, but be explicit)
    userEmail = normalizeEmail(userEmail);
    return this.disconnect(userEmail, provider);
  },

  /**
   * Get connection status with details
   * Bug #3 Fix: Now auto-refreshes expired tokens if refresh_token exists
   * @param {string} userEmail - User's email
   * @returns {Promise<object>} Connection status details
   */
  async getConnectionStatus(userEmail) {
    try {
      // Bug #1 Fix: Normalize email
      userEmail = normalizeEmail(userEmail);

      let tokens = await this.getTokens(userEmail);

      if (!tokens) {
        return {
          connected: false,
          message: 'Not connected to Google'
        };
      }

      const now = Date.now();
      const expiryDate = tokens.expires_at || 0;
      const isExpired = expiryDate && expiryDate < now;

      // Bug #3 Fix: Auto-refresh if expired but has refresh token
      if (isExpired && tokens.refresh_token) {
        console.log('🔄 Token expired, attempting auto-refresh in status check...');
        const refreshedTokens = await this.refreshTokens(userEmail);

        if (refreshedTokens) {
          tokens = refreshedTokens;
          return {
            connected: true,
            hasRefreshToken: true,
            isExpired: false,
            expiresAt: tokens.expires_at ? new Date(tokens.expires_at).toISOString() : null,
            scopes: tokens.scope?.split(' ') || [],
            message: 'Connected and active (token just refreshed)'
          };
        } else {
          // Refresh failed, token is truly expired
          return {
            connected: false,
            hasRefreshToken: false,
            isExpired: true,
            message: 'Token expired and refresh failed - please reconnect'
          };
        }
      }

      return {
        connected: true,
        hasRefreshToken: !!tokens.refresh_token,
        isExpired: isExpired,
        expiresAt: expiryDate ? new Date(expiryDate).toISOString() : null,
        scopes: tokens.scope?.split(' ') || [],
        message: isExpired
          ? 'Token expired, will auto-refresh on next request'
          : 'Connected and active'
      };
    } catch (error) {
      console.error('❌ Error getting connection status:', error);
      return {
        connected: false,
        error: error.message
      };
    }
  }
};

export default oauthTokenService;
