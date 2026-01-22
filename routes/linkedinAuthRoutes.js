import express from 'express';
import axios from 'axios';
import oauthTokenService from '../services/oauthTokenService.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const router = express.Router();

// Environment variables
const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI || 'https://saas-frontend-o2cx.onrender.com/auth/linkedin/callback';

console.log('🔧 LinkedIn OAuth Configuration:');
console.log('LINKEDIN_CLIENT_ID:', LINKEDIN_CLIENT_ID ? `${LINKEDIN_CLIENT_ID.substring(0, 10)}...` : 'MISSING');
console.log('LINKEDIN_CLIENT_SECRET:', LINKEDIN_CLIENT_SECRET ? 'SET' : 'MISSING');
console.log('REDIRECT_URI:', REDIRECT_URI);

if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET) {
    console.warn('⚠️ LinkedIn credentials not configured - LinkedIn features will be disabled');
}

// Bug #1 Fix: Email normalization helper
function normalizeEmail(email) {
    return email?.toLowerCase().trim() || '';
}

/**
 * Handle OAuth callback and exchange code for access token
 * POST /api/auth/linkedin/callback
 * Body: { code, email, state }
 */
router.post('/callback', async (req, res) => {
    try {
        let { code, email, state } = req.body;

        console.log('\n🔄 ========== LinkedIn OAuth Callback ==========');
        console.log(`📧 Email from body: ${email || 'Not provided'}`);
        console.log(`🔑 Code: ${code ? code.substring(0, 20) + '...' : 'Missing'}`);
        console.log(`🛡️ State: ${state || 'Not provided'}`);

        // ✅ FIX: Extract email from state parameter if not in body
        if (!email && state && state.includes('|')) {
            try {
                const [stateId, emailBase64] = state.split('|');
                email = Buffer.from(emailBase64, 'base64').toString('utf-8');
                console.log('✅ Email extracted from state parameter:', email);
            } catch (decodeError) {
                console.warn('⚠️ Failed to decode email from state:', decodeError.message);
            }
        }

        // Bug #1 Fix: Normalize email
        email = normalizeEmail(email);

        console.log('💡 Note: If the first attempt failed, LinkedIn may reuse the authorization')
        console.log('   without asking for credentials again. This is normal behavior.');
        console.log('===============================================\n');

        if (!code) {
            return res.status(400).json({
                success: false,
                error: 'authorization_code_missing',
                message: 'Authorization code is required'
            });
        }

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'email_required',
                message: 'Email is required to associate the LinkedIn account'
            });
        }

        // Check if user already has tokens for this provider
        const existingTokens = await oauthTokenService.getTokens(email, 'linkedin');
        if (existingTokens) {
            // Instead of checking last_code (which doesn't exist), just check token validity
            const isExpired = existingTokens.expires_at ? existingTokens.expires_at < Date.now() : false;

            if (!isExpired) {
                console.log('✅ Valid token exists - returning existing connection');
                return res.json({
                    success: true,
                    message: 'LinkedIn account already connected',
                    data: {
                        connected: true,
                        access_token: existingTokens.access_token,
                        scopes: existingTokens.scope?.split(',').map(s => s.trim()) || [],
                        expiresIn: existingTokens.expires_in,
                        expiresAt: existingTokens.expires_at ? new Date(existingTokens.expires_at).toISOString() : null
                    }
                });
            } else {
                console.warn('⚠️ Token expired - will attempt exchange');
            }
        }

        console.log('🔄 Exchanging authorization code for access token...');

        // ✅ LinkedIn Web OAuth does NOT use PKCE - only mobile apps do
        const tokenParams = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            client_id: LINKEDIN_CLIENT_ID,
            client_secret: LINKEDIN_CLIENT_SECRET,
            redirect_uri: REDIRECT_URI  // Must EXACTLY match authorization request
        });

        console.log('📋 Token exchange parameters:');
        console.log('   - grant_type: authorization_code');
        console.log('   - client_id:', LINKEDIN_CLIENT_ID);
        console.log('   - redirect_uri:', REDIRECT_URI);
        console.log('   - code:', code.substring(0, 20) + '...');

        const tokenResponse = await axios.post(
            'https://www.linkedin.com/oauth/v2/accessToken',
            tokenParams,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const { access_token, expires_in, refresh_token, scope } = tokenResponse.data;

        console.log('✅ Access token obtained successfully');
        console.log(`📊 Scopes granted: ${scope}`);
        console.log(`⏰ Expires in: ${expires_in} seconds (${(expires_in / 86400).toFixed(1)} days)`);
        console.log(`🔄 Refresh Token: ${refresh_token ? 'Provided' : 'Not provided'}`);

        // Calculate expiration timestamp
        const expiresAt = Date.now() + (expires_in * 1000);

        // Bug #11 Fix: Try to fetch LinkedIn profile info
        let providerUserId = null;
        let providerUserName = null;
        let providerUserEmail = null;

        try {
            const profileResponse = await axios.get('https://api.linkedin.com/v2/userinfo', {
                headers: {
                    'Authorization': `Bearer ${access_token}`
                }
            });

            if (profileResponse.data) {
                providerUserId = profileResponse.data.sub;
                providerUserName = profileResponse.data.name;
                providerUserEmail = profileResponse.data.email;
                console.log('👤 LinkedIn profile fetched:', {
                    id: providerUserId,
                    name: providerUserName,
                    email: providerUserEmail
                });
            }
        } catch (profileError) {
            console.warn('⚠️ Could not fetch LinkedIn profile (non-critical):', profileError.message);
        }

        // Bug #14 Fix: Removed last_code field (doesn't exist in schema)
        // Bug #11 Fix: Added provider user fields
        await oauthTokenService.storeTokens(email, {
            access_token,
            refresh_token: refresh_token || null,
            expires_in,
            expires_at: expiresAt,
            scope,
            token_type: 'Bearer',
            provider_user_id: providerUserId,
            provider_user_name: providerUserName,
            provider_user_email: providerUserEmail
        }, 'linkedin');

        console.log('💾 Tokens saved to database');
        console.log(`📅 Token expires at: ${new Date(expiresAt).toISOString()}`);
        console.log('💡 Token saved successfully! You can now fetch LinkedIn metrics.');

        // NOTE: Organization details will be fetched by linkedinMetricsServiceV2 when metrics are requested
        // This avoids duplicate API calls and rate limiting issues

        return res.json({
            success: true,
            message: 'LinkedIn account connected successfully',
            data: {
                connected: true,
                access_token: access_token, // ✅ Return token for localStorage
                scopes: scope.split(',').map(s => s.trim()),
                expiresIn: expires_in,
                expiresAt: new Date(expiresAt).toISOString(),
                companyInfo: null // Will be fetched when metrics are requested
            }
        });

    } catch (error) {
        console.error('❌ LinkedIn OAuth Error:', error.response?.data || error.message);

        if (error.response?.data) {
            const { error: errorCode, error_description } = error.response.data;

            const errorMessages = {
                'invalid_request': 'Invalid OAuth request parameters. Please try connecting again.',
                'invalid_client': 'Invalid LinkedIn app credentials. Please contact support.',
                'invalid_grant': 'Authorization code is invalid, expired, or already used. Please try connecting again.',
                'unauthorized_client': 'Client is not authorized for this grant type',
                'unsupported_grant_type': 'Grant type is not supported'
            };

            return res.status(400).json({
                success: false,
                error: errorCode || 'oauth_error',
                message: errorMessages[errorCode] || error_description || 'Failed to exchange authorization code',
                details: error_description
            });
        }

        return res.status(500).json({
            success: false,
            error: 'server_error',
            message: 'An error occurred during LinkedIn authorization'
        });
    }
});

/**
 * Check if user has connected LinkedIn
 * GET /api/auth/linkedin/status?email=user@example.com
 */
router.get('/status', async (req, res) => {
    try {
        let { email } = req.query;

        if (!email) {
            return res.status(400).json({
                success: false,
                connected: false,
                error: 'email_required',
                message: 'Email parameter is required'
            });
        }

        // Bug #1 Fix: Normalize email
        email = normalizeEmail(email);

        const isConnected = await oauthTokenService.isConnected(email, 'linkedin');

        if (!isConnected) {
            return res.json({
                success: false,
                connected: false,
                message: 'LinkedIn account not connected'
            });
        }

        const tokens = await oauthTokenService.getTokens(email, 'linkedin');
        const isExpired = tokens.expires_at ? tokens.expires_at < Date.now() : false;

        return res.json({
            success: true,
            data: {
                connected: true,
                provider: 'linkedin',
                scopes: tokens.scope?.split(',').map(s => s.trim()) || [],
                expiresAt: tokens.expires_at ? new Date(tokens.expires_at).toISOString() : null,
                isExpired: isExpired
            }
        });

    } catch (error) {
        console.error('❌ Error checking LinkedIn status:', error);
        return res.status(500).json({
            success: false,
            connected: false,
            error: 'server_error',
            message: 'Failed to check LinkedIn connection status'
        });
    }
});

/**
 * Disconnect LinkedIn account
 * DELETE /api/auth/linkedin/disconnect?email=user@example.com
 */
router.delete('/disconnect', async (req, res) => {
    try {
        let { email } = req.query;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'email_required',
                message: 'Email parameter is required'
            });
        }

        // Bug #1 Fix: Normalize email
        email = normalizeEmail(email);

        console.log(`🔌 Disconnecting LinkedIn account for: ${email}`);
        await oauthTokenService.deleteTokens(email, 'linkedin');
        console.log('✅ LinkedIn account disconnected');

        return res.json({
            success: true,
            message: 'LinkedIn account disconnected successfully'
        });

    } catch (error) {
        console.error('❌ Error disconnecting LinkedIn:', error);
        return res.status(500).json({
            success: false,
            error: 'server_error',
            message: 'Failed to disconnect LinkedIn account'
        });
    }
});

/**
 * Refresh access token
 * POST /api/auth/linkedin/refresh
 * Body: { email }
 */
router.post('/refresh', async (req, res) => {
    try {
        let { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'email_required',
                message: 'Email is required'
            });
        }

        // Bug #1 Fix: Normalize email
        email = normalizeEmail(email);

        const tokens = await oauthTokenService.getTokens(email, 'linkedin');

        if (!tokens || !tokens.refresh_token) {
            return res.status(401).json({
                success: false,
                error: 'no_refresh_token',
                message: 'No refresh token available. Please reconnect your LinkedIn account.'
            });
        }

        console.log('🔄 Refreshing LinkedIn access token...');

        const tokenResponse = await axios.post(
            'https://www.linkedin.com/oauth/v2/accessToken',
            new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: tokens.refresh_token,
                client_id: LINKEDIN_CLIENT_ID,
                client_secret: LINKEDIN_CLIENT_SECRET
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const { access_token, expires_in, refresh_token } = tokenResponse.data;
        const expiresAt = Date.now() + (expires_in * 1000);

        await oauthTokenService.storeTokens(email, {
            ...tokens,
            access_token,
            refresh_token: refresh_token || tokens.refresh_token,
            expires_in,
            expires_at: expiresAt
        }, 'linkedin');

        console.log('✅ Access token refreshed successfully');

        return res.json({
            success: true,
            message: 'Access token refreshed successfully',
            data: {
                expiresIn: expires_in,
                expiresAt: new Date(expiresAt).toISOString()
            }
        });

    } catch (error) {
        console.error('❌ Error refreshing token:', error.response?.data || error.message);

        return res.status(400).json({
            success: false,
            error: 'refresh_failed',
            message: 'Failed to refresh access token. Please reconnect your LinkedIn account.'
        });
    }
});

/**
 * Exchange authorization code for token (for test page)
 * POST /api/auth/linkedin/token
 * Body: { code, redirectUri }
 */
router.post('/token', async (req, res) => {
    try {
        const { code, redirectUri } = req.body;

        console.log('\n🧪 ========== LinkedIn Token Exchange (Test) ==========');
        console.log(`🔑 Code: ${code ? code.substring(0, 20) + '...' : 'Missing'}`);
        console.log(`🔗 Redirect URI: ${redirectUri}`);

        if (!code) {
            return res.status(400).json({
                success: false,
                error: 'code_required',
                message: 'Authorization code is required'
            });
        }

        const tokenParams = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            client_id: LINKEDIN_CLIENT_ID,
            client_secret: LINKEDIN_CLIENT_SECRET,
            redirect_uri: redirectUri || REDIRECT_URI
        });

        console.log('🔄 Exchanging code for token...');

        const tokenResponse = await axios.post(
            'https://www.linkedin.com/oauth/v2/accessToken',
            tokenParams,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const { access_token, expires_in, refresh_token, scope } = tokenResponse.data;

        console.log('✅ Token obtained successfully!');
        console.log(`📊 Scopes: ${scope}`);
        console.log(`⏰ Expires in: ${expires_in} seconds`);

        // Return token directly (for test page - not stored)
        return res.json({
            success: true,
            access_token,
            refresh_token,
            expires_in,
            scope
        });

    } catch (error) {
        console.error('❌ Token exchange error:', error.response?.data || error.message);

        return res.status(400).json({
            success: false,
            error: error.response?.data?.error || 'token_exchange_failed',
            message: error.response?.data?.error_description || 'Failed to exchange code for token'
        });
    }
});

export default router;
