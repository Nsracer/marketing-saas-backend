import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { google } from 'googleapis';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import oauthTokenService from '../services/oauthTokenService.js';

const router = express.Router();

// Debug environment variables
console.log('🔍 OAuth Route Environment Check:');
console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? `${process.env.GOOGLE_CLIENT_ID.substring(0, 10)}...` : 'MISSING');
console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'MISSING');
console.log('GOOGLE_REDIRECT_URI:', process.env.GOOGLE_REDIRECT_URI);
console.log('FRONTEND_URL:', process.env.FRONTEND_URL);

// Validate environment variables
if (!process.env.GOOGLE_CLIENT_ID) {
  throw new Error('GOOGLE_CLIENT_ID environment variable is required');
}
if (!process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error('GOOGLE_CLIENT_SECRET environment variable is required');
}
if (!process.env.GOOGLE_REDIRECT_URI) {
  throw new Error('GOOGLE_REDIRECT_URI environment variable is required');
}

// Initialize OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

console.log('✅ OAuth2 client initialized successfully');

// State storage with longer TTL and better cleanup
const oauthStates = new Map();

// Bug #1 Fix: Email normalization helper
function normalizeEmail(email) {
  return email?.toLowerCase().trim() || '';
}

// Cleanup function to remove expired states
const cleanupExpiredStates = () => {
  const now = Date.now();
  const FIFTEEN_MINUTES = 15 * 60 * 1000;

  for (const [key, value] of oauthStates.entries()) {
    if (now - value.timestamp > FIFTEEN_MINUTES) {
      oauthStates.delete(key);
      console.log('🧹 Cleaned up expired state:', key.substring(0, 10) + '...');
    }
  }
};

// Run cleanup every 5 minutes
setInterval(cleanupExpiredStates, 5 * 60 * 1000);

// File-based token storage functions
const getTokensFilePath = () => path.join(process.cwd(), 'data', 'oauth_tokens.json');

const ensureDataDirectory = async () => {
  const dataDir = path.join(process.cwd(), 'data');
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
};

const saveTokensToFile = async (email, tokens) => {
  // Bug #1 Fix: Normalize email for file storage too
  email = normalizeEmail(email);
  await ensureDataDirectory();
  const filePath = getTokensFilePath();

  let allTokens = {};
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    allTokens = JSON.parse(data);
  } catch {
    // File doesn't exist, start with empty object
  }

  allTokens[email] = {
    ...tokens,
    updated_at: new Date().toISOString()
  };

  await fs.writeFile(filePath, JSON.stringify(allTokens, null, 2));
};

const getTokensFromFile = async (email) => {
  // Bug #1 Fix: Normalize email
  email = normalizeEmail(email);
  try {
    const filePath = getTokensFilePath();
    const data = await fs.readFile(filePath, 'utf-8');
    const allTokens = JSON.parse(data);
    return allTokens[email] || null;
  } catch {
    return null;
  }
};

const deleteTokensFromFile = async (email) => {
  // Bug #1 Fix: Normalize email
  email = normalizeEmail(email);
  try {
    const filePath = getTokensFilePath();
    const data = await fs.readFile(filePath, 'utf-8');
    const allTokens = JSON.parse(data);
    delete allTokens[email];
    await fs.writeFile(filePath, JSON.stringify(allTokens, null, 2));
  } catch {
    // Ignore errors
  }
};

// Debug route
router.get('/auth/google/debug', (req, res) => {
  res.json({
    clientId: process.env.GOOGLE_CLIENT_ID ? `${process.env.GOOGLE_CLIENT_ID.substring(0, 10)}...` : 'MISSING',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'MISSING',
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
    frontendUrl: process.env.FRONTEND_URL,
    activeStates: oauthStates.size,
    oauthClientConfigured: !!oauth2Client._clientId
  });
});

// Initiate OAuth flow
router.get('/auth/google', (req, res) => {
  try {
    let { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    // Bug #1 Fix: Normalize email
    email = normalizeEmail(email);

    console.log('🚀 Starting OAuth flow for:', email);

    // Generate secure state parameter
    const state = crypto.randomBytes(32).toString('hex');

    // Store state with normalized email and timestamp
    oauthStates.set(state, {
      email,
      timestamp: Date.now()
    });

    console.log('🔒 Generated state:', state.substring(0, 10) + '...');
    console.log('📊 Total active states:', oauthStates.size);

    const scopes = [
      'https://www.googleapis.com/auth/analytics.readonly',
      'https://www.googleapis.com/auth/webmasters.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
      state: state,
      include_granted_scopes: true
    });

    console.log('🔗 Redirecting to Google OAuth...');
    res.redirect(authUrl);
  } catch (error) {
    console.error('❌ Error initiating OAuth:', error);
    res.status(500).json({ error: 'Failed to initiate OAuth flow', details: error.message });
  }
});

// Handle OAuth callback
router.get('/auth/google/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    console.log('📥 Received OAuth callback');
    console.log('Has code:', !!code);
    console.log('Has state:', !!state);
    console.log('State value:', state ? state.substring(0, 10) + '...' : 'NONE');
    console.log('Has error:', !!error);
    console.log('Active states count:', oauthStates.size);

    // Get frontend URL from environment or use production URL
    const frontendUrl = process.env.FRONTEND_URL || 'https://saas-frontend-o2cx.onrender.com';
    console.log('🌐 Frontend URL for redirect:', frontendUrl);

    if (error) {
      console.error('❌ OAuth error from Google:', error);
      return res.redirect(`${frontendUrl}/dashboard?error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      console.error('❌ Missing authorization code');
      return res.redirect(`${frontendUrl}/dashboard?error=missing_code`);
    }

    if (!state) {
      console.error('❌ Missing state parameter');
      return res.redirect(`${frontendUrl}/dashboard?error=missing_state`);
    }

    // Validate state parameter
    const stateData = oauthStates.get(state);

    if (!stateData) {
      // Bug #7 Fix: REMOVED dev mode bypass - always fail on invalid state
      console.error('❌ Invalid or expired state parameter - CSRF protection triggered');
      console.log('🔍 Looking for state:', state.substring(0, 10) + '...');
      console.log('🔍 Available states:', Array.from(oauthStates.keys()).map(k => k.substring(0, 10) + '...'));

      // Always fail - do not proceed without valid state (security)
      return res.redirect(`${frontendUrl}/dashboard?error=state_validation_failed`);
    }

    // Remove used state
    oauthStates.delete(state);
    console.log('✅ State parameter validated and consumed');

    // Process tokens with normalized email
    await processOAuthTokens(code, stateData.email, res, frontendUrl);

  } catch (error) {
    console.error('❌ Error in OAuth callback:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'https://saas-frontend-o2cx.onrender.com';
    res.redirect(`${frontendUrl}/dashboard?error=${encodeURIComponent(error.message)}`);
  }
});

// Helper function to process OAuth tokens
async function processOAuthTokens(code, email, res, frontendUrl) {
  try {
    // Bug #1 Fix: Normalize email
    email = normalizeEmail(email);

    // Exchange code for tokens
    console.log('🔄 Exchanging authorization code for tokens...');
    const { tokens } = await oauth2Client.getToken(code);

    console.log('✅ Received tokens:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      scope: tokens.scope,
      expiresAt: tokens.expiry_date
    });

    // Set credentials to get user info
    oauth2Client.setCredentials(tokens);

    // Get user information
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    console.log('👤 User info retrieved:', {
      id: userInfo.data.id,
      email: userInfo.data.email,
      name: userInfo.data.name,
      verified: userInfo.data.verified_email
    });

    // Save tokens to database (persistent storage) with normalized email
    const saved = await oauthTokenService.storeTokens(email, tokens);

    if (saved) {
      console.log('💾 ✅ Tokens saved to database for:', email);
    } else {
      console.warn('⚠️ Failed to save tokens to database, using file fallback');
      // Fallback to file storage
      await saveTokensToFile(email, {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiry_date,
        scope: tokens.scope,
        user_info: userInfo.data
      });
    }

    console.log('🎉 OAuth connection established successfully for:', email);
    console.log('🔗 Redirecting to:', `${frontendUrl}/dashboard/seo-performance?oauth_success=true&connected=google`);

    // Redirect back to SEO Performance page with success flag
    res.redirect(`${frontendUrl}/dashboard/seo-performance?oauth_success=true&connected=google`);
  } catch (error) {
    console.error('❌ Error processing tokens:', error);
    throw error;
  }
}

// Check OAuth connection status
router.get('/auth/google/status', async (req, res) => {
  try {
    let { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    // Bug #1 Fix: Normalize email
    email = normalizeEmail(email);

    console.log('🔍 Checking OAuth status for:', email);

    // Get connection status from database (now auto-refreshes if expired)
    const status = await oauthTokenService.getConnectionStatus(email);

    res.json({
      ...status,
      email
    });

  } catch (error) {
    console.error('❌ Error checking OAuth status:', error);
    res.status(500).json({ error: 'Failed to check OAuth status' });
  }
});

// Disconnect OAuth
router.post('/auth/google/disconnect', async (req, res) => {
  try {
    let { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    // Bug #1 Fix: Normalize email
    email = normalizeEmail(email);

    console.log('🔌 Disconnecting OAuth for:', email);

    // Disconnect from database
    const disconnected = await oauthTokenService.disconnect(email);

    if (disconnected) {
      console.log('✅ Successfully disconnected OAuth for:', email);
      res.json({ success: true, message: 'Successfully disconnected from Google' });
    } else {
      throw new Error('Failed to disconnect');
    }

  } catch (error) {
    console.error('❌ Error disconnecting OAuth:', error);
    res.status(500).json({ error: 'Failed to disconnect', details: error.message });
  }
});

export default router;
