import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import oauthTokenService from '../services/oauthTokenService.js';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

// Debug environment variables
console.log('🔍 Facebook OAuth Route Environment Check:');
console.log('FACEBOOK_APP_ID:', process.env.FACEBOOK_APP_ID ? `${process.env.FACEBOOK_APP_ID.substring(0, 10)}...` : 'MISSING');
console.log('FACEBOOK_APP_SECRET:', process.env.FACEBOOK_APP_SECRET ? 'SET' : 'MISSING');
console.log('FRONTEND_URL:', process.env.FRONTEND_URL);

// Use placeholder values if not configured (features will be limited)
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID || 'not_configured';
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET || 'not_configured';
const REDIRECT_URI = `${process.env.BACKEND_URL || 'http://localhost:3010'}/api/auth/facebook/callback`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://saas-frontend-o2cx.onrender.com';

if (!process.env.FACEBOOK_APP_ID || !process.env.FACEBOOK_APP_SECRET) {
  console.warn('⚠️ Facebook OAuth not configured - Facebook routes will return errors');
} else {
  console.log('✅ Facebook OAuth client initialized successfully');
  console.log('   Redirect URI:', REDIRECT_URI);
}

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

// State storage with longer TTL and better cleanup
const oauthStates = new Map();

// Cleanup function to remove expired states
const cleanupExpiredStates = () => {
  const now = Date.now();
  const FIFTEEN_MINUTES = 15 * 60 * 1000;

  for (const [key, value] of oauthStates.entries()) {
    if (now - value.timestamp > FIFTEEN_MINUTES) {
      oauthStates.delete(key);
      console.log('🧹 Cleaned up expired Facebook state:', key.substring(0, 10) + '...');
    }
  }
};

// Run cleanup every 5 minutes
setInterval(cleanupExpiredStates, 5 * 60 * 1000);

// Debug route
router.get('/auth/facebook/debug', (req, res) => {
  res.json({
    appId: process.env.FACEBOOK_APP_ID ? `${process.env.FACEBOOK_APP_ID.substring(0, 10)}...` : 'MISSING',
    appSecret: process.env.FACEBOOK_APP_SECRET ? 'SET' : 'MISSING',
    redirectUri: REDIRECT_URI,
    frontendUrl: FRONTEND_URL,
    activeStates: oauthStates.size
  });
});

// Initiate Facebook OAuth flow
router.get('/auth/facebook', (req, res) => {
  try {
    const { email, returnUrl } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    console.log('🚀 Starting Facebook OAuth flow for:', email);
    if (returnUrl) {
      console.log('🔙 Will return to:', returnUrl);
    }

    // Generate secure state parameter
    const state = crypto.randomBytes(32).toString('hex');

    // Store state with email, returnUrl, and timestamp
    oauthStates.set(state, {
      email,
      returnUrl: returnUrl || null,
      timestamp: Date.now()
    });

    console.log('🔒 Generated state:', state.substring(0, 10) + '...');
    console.log('📊 Total active states:', oauthStates.size);

    // Facebook + Instagram permissions (matching granted permissions)
    const scopes = [
      // Basic
      'email',
      'public_profile',

      // Page Permissions
      'pages_show_list',
      'pages_read_engagement',
      'pages_read_user_content',
      'pages_manage_engagement',

      // Insights
      'read_insights',

      // Instagram Permissions
      'instagram_basic',
      'instagram_manage_comments',
      'instagram_manage_insights',
      // 'instagram_content_publish',

      // Business
      'business_management'
    ];

    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
      `client_id=${FACEBOOK_APP_ID}&` +
      `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
      `state=${state}&` +
      `scope=${scopes.join(',')}&` +
      `response_type=code`;

    console.log('🔗 Redirecting to Facebook OAuth...');
    res.redirect(authUrl);
  } catch (error) {
    console.error('❌ Error initiating Facebook OAuth:', error);
    res.redirect(`${FRONTEND_URL}/dashboard/social?error=${encodeURIComponent(error.message)}`);
  }
});

// Facebook OAuth callback
router.get('/auth/facebook/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    console.log('📥 Facebook OAuth callback received');
    console.log('   State:', state ? state.substring(0, 10) + '...' : 'MISSING');
    console.log('   Code:', code ? 'RECEIVED' : 'MISSING');
    console.log('   Error:', error || 'NONE');

    // Check for OAuth errors
    if (error) {
      console.error('❌ Facebook OAuth error:', error, error_description);
      return res.redirect(
        `${FRONTEND_URL}/dashboard/social?error=${encodeURIComponent(error_description || error)}`
      );
    }

    // Validate state parameter
    if (!state) {
      console.error('❌ Missing state parameter');
      return res.redirect(
        `${FRONTEND_URL}/dashboard/social?error=Invalid OAuth state`
      );
    }

    const stateData = oauthStates.get(state);

    if (!stateData) {
      console.error('❌ Invalid or expired state:', state);
      console.log('📊 Available states:', Array.from(oauthStates.keys()).map(k => k.substring(0, 10) + '...'));
      return res.redirect(
        `${FRONTEND_URL}/dashboard/social?error=OAuth state expired or invalid. Please try again.`
      );
    }

    // Remove used state
    oauthStates.delete(state);
    const { email, returnUrl } = stateData;

    console.log('✅ Valid state found for:', email);
    if (returnUrl) {
      console.log('🔙 Will redirect to:', returnUrl);
    }

    if (!code) {
      console.error('❌ Missing authorization code');
      return res.redirect(
        `${FRONTEND_URL}/dashboard/social?error=Missing authorization code`
      );
    }

    // Exchange code for access token
    console.log('🔄 Exchanging code for access token...');
    console.log('   Using App ID:', FACEBOOK_APP_ID);
    console.log('   App Secret length:', FACEBOOK_APP_SECRET ? FACEBOOK_APP_SECRET.length : 0, 'chars');
    console.log('   App Secret (partial):', FACEBOOK_APP_SECRET ? FACEBOOK_APP_SECRET.substring(0, 8) + '...' : 'MISSING');

    const tokenUrl = 'https://graph.facebook.com/v18.0/oauth/access_token';
    const tokenParams = {
      client_id: FACEBOOK_APP_ID,
      client_secret: FACEBOOK_APP_SECRET,
      redirect_uri: REDIRECT_URI,
      code: code
    };

    const tokenResponse = await axios.get(tokenUrl, { params: tokenParams });
    const { access_token, expires_in } = tokenResponse.data;

    if (!access_token) {
      throw new Error('Failed to obtain access token from Facebook');
    }

    console.log('✅ Access token obtained');
    console.log('   Expires in:', expires_in, 'seconds');

    // Get long-lived token (60 days instead of 1-2 hours)
    console.log('🔄 Exchanging for long-lived token...');
    const longLivedTokenUrl = 'https://graph.facebook.com/v18.0/oauth/access_token';
    const longLivedParams = {
      grant_type: 'fb_exchange_token',
      client_id: FACEBOOK_APP_ID,
      client_secret: FACEBOOK_APP_SECRET,
      fb_exchange_token: access_token
    };

    const longLivedResponse = await axios.get(longLivedTokenUrl, { params: longLivedParams });
    const longLivedToken = longLivedResponse.data.access_token;
    const longLivedExpiresIn = longLivedResponse.data.expires_in || (90 * 24 * 60 * 60); // 90 days (Facebook maximum)

    console.log('✅ Long-lived token obtained');
    console.log('   Expires in:', longLivedExpiresIn, 'seconds (~', Math.floor(longLivedExpiresIn / 86400), 'days)');

    // Get user info from Facebook
    const userInfoUrl = 'https://graph.facebook.com/v18.0/me';
    const userInfoParams = {
      access_token: longLivedToken,
      fields: 'id,name,email'
    };

    const userInfoResponse = await axios.get(userInfoUrl, { params: userInfoParams });
    const userInfo = userInfoResponse.data;

    console.log('✅ User info retrieved:', userInfo.name, userInfo.email);

    // Store tokens in database using oauthTokenService
    const tokens = {
      access_token: longLivedToken,
      expires_at: Date.now() + (longLivedExpiresIn * 1000),
      scope: tokenParams.scope,
      user_id: userInfo.id,
      user_name: userInfo.name,
      user_email: userInfo.email || email
    };

    // Store for Facebook
    const storedFacebook = await oauthTokenService.storeTokens(email, tokens, 'facebook');

    // Also store for Instagram since it uses the same OAuth token
    const storedInstagram = await oauthTokenService.storeTokens(email, tokens, 'instagram');

    if (!storedFacebook || !storedInstagram) {
      throw new Error('Failed to store Facebook/Instagram tokens');
    }

    console.log('✅ Facebook & Instagram tokens stored successfully');

    // Fetch Facebook Page details and update business settings
    console.log('\n📊 Fetching Facebook Page details...');
    try {
      const pagesResponse = await axios.get('https://graph.facebook.com/v24.0/me/accounts', {
        params: {
          access_token: longLivedToken,
          fields: 'id,name,username,access_token'
        }
      });

      if (pagesResponse.data.data && pagesResponse.data.data.length > 0) {
        const page = pagesResponse.data.data[0];
        const pageUsername = page.username || page.name;
        const pageAccessToken = page.access_token; // This is the Page Access Token!

        console.log(`✅ Found page: ${page.name}`);
        console.log(`   📌 Username: ${pageUsername}`);
        console.log(`   🔑 Got Page Access Token (never expires!)`);

        // IMPORTANT: Store the Page Access Token instead of user token
        // Page tokens have more permissions and don't expire!
        const pageTokens = {
          access_token: pageAccessToken, // Use PAGE token, not user token!
          expires_at: Date.now() + (365 * 24 * 60 * 60 * 1000), // Page tokens don't expire, set to 1 year
          scope: tokenParams.scope,
          user_id: userInfo.id,
          user_name: userInfo.name,
          user_email: userInfo.email || email,
          page_id: page.id,
          page_name: page.name
        };

        // Update stored tokens with Page Access Token
        await oauthTokenService.storeTokens(email, pageTokens, 'facebook');
        await oauthTokenService.storeTokens(email, pageTokens, 'instagram');
        console.log(`✅ Updated tokens with Page Access Token`);

        // Update business settings with Facebook page username
        if (supabase) {
          const { data: existing } = await supabase
            .from('user_business_info')
            .select('*')
            .eq('user_email', email)
            .single();

          if (existing) {
            await supabase
              .from('user_business_info')
              .update({
                facebook_handle: pageUsername,
                updated_at: new Date().toISOString()
              })
              .eq('user_email', email);
            console.log(`✅ Updated business settings with Facebook page username`);
          } else {
            await supabase
              .from('user_business_info')
              .insert({
                user_email: email,
                facebook_handle: pageUsername,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
            console.log(`✅ Created business settings with Facebook page username`);
          }
        } else {
          console.warn('⚠️ Supabase not configured - business settings not updated');
        }
      }
    } catch (pageError) {
      console.warn('⚠️ Error fetching page details (OAuth still succeeded):', pageError.message);
    }

    console.log('✅ Facebook & Instagram OAuth completed successfully for:', email);
    console.log('   Both platforms now accessible with single OAuth token');
    res.redirect(`${FRONTEND_URL}/dashboard/social?success=true`);

  } catch (error) {
    console.error('❌ Error in Facebook OAuth callback:', error.message);

    // Log detailed error from Facebook
    if (error.response?.data) {
      console.error('📋 Facebook API Error Details:');
      console.error(JSON.stringify(error.response.data, null, 2));
    }

    const errorMessage = error.response?.data?.error?.message || error.message;
    const errorType = error.response?.data?.error?.type || 'unknown';

    console.error(`❌ Error Type: ${errorType}`);
    console.error(`❌ Error Message: ${errorMessage}`);

    // Provide helpful error message
    let userMessage = errorMessage;
    if (errorMessage.includes('client secret')) {
      userMessage = 'Invalid Facebook App Secret. Please check your .env file and ensure FACEBOOK_APP_SECRET is complete (32 characters).';
    } else if (errorMessage.includes('redirect_uri')) {
      userMessage = 'Invalid redirect URI. Please check your Facebook App settings.';
    }

    res.redirect(
      `${FRONTEND_URL}/dashboard/social?error=${encodeURIComponent(userMessage)}`
    );
  }
});

// Check Facebook connection status
router.get('/auth/facebook/status', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        connected: false,
        error: 'Email parameter is required'
      });
    }

    console.log('🔍 Checking Facebook connection status for:', email);

    const isConnected = await oauthTokenService.isConnected(email, 'facebook');

    console.log('✅ Facebook connection status:', isConnected);

    res.json({
      connected: isConnected,
      provider: 'facebook'
    });

  } catch (error) {
    console.error('❌ Error checking Facebook connection:', error);
    res.status(500).json({
      connected: false,
      error: error.message
    });
  }
});

// Disconnect Facebook account
router.post('/auth/facebook/disconnect', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    console.log('🔌 Disconnecting Facebook account for:', email);

    // Delete both Facebook and Instagram tokens since they share the same OAuth
    const deletedFacebook = await oauthTokenService.deleteTokens(email, 'facebook');
    const deletedInstagram = await oauthTokenService.deleteTokens(email, 'instagram');

    if (!deletedFacebook && !deletedInstagram) {
      throw new Error('Failed to delete Facebook/Instagram tokens');
    }

    console.log('✅ Facebook & Instagram accounts disconnected for:', email);

    res.json({
      success: true,
      message: 'Facebook and Instagram accounts disconnected successfully'
    });

  } catch (error) {
    console.error('❌ Error disconnecting Facebook:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
