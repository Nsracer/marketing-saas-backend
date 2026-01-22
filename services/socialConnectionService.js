/**
 * Social Connection Service
 * Manages OAuth connections and provides unified access to social media accounts
 * Priority: OAuth connections > Business Info handles
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

class SocialConnectionService {
  /**
   * Get all connected social accounts for a user
   * Returns OAuth-connected accounts with actual usernames
   */
  async getConnectedAccounts(userEmail) {
    try {
      console.log(`🔍 Checking OAuth connections for: [USER_EMAIL]`);

      const { data, error } = await supabase
        .from('social_connections_v2')
        .select('*')
        .eq('user_email', userEmail)
        .eq('is_connected', true);

      if (error) throw error;

      const connections = {};
      
      if (data && data.length > 0) {
        data.forEach(conn => {
          connections[conn.platform] = {
            connected: true,
            username: conn.provider_username || conn.account_name,
            accountName: conn.account_name,
            profileUrl: conn.profile_url,
            providerId: conn.provider_user_id,
            connectedAt: conn.connected_at,
            status: conn.connection_status,
            metadata: conn.platform_metadata
          };
        });
      }

      console.log(`✅ Found ${Object.keys(connections).length} OAuth connections`);
      return connections;

    } catch (error) {
      console.error('❌ Error getting connected accounts:', error);
      return {};
    }
  }

  /**
   * Get social handles with OAuth priority
   * Returns: { platform: { source: 'oauth'|'business_info', username, connected, ... } }
   */
  async getSocialHandlesWithPriority(userEmail) {
    try {
      console.log(`\n📱 Getting social handles for: [USER_EMAIL]`);

      // 1. Get OAuth connections (highest priority)
      const oauthConnections = await this.getConnectedAccounts(userEmail);

      // 2. Get business info handles (fallback)
      const { data: businessInfo, error } = await supabase
        .from('user_business_info')
        .select('facebook_handle, instagram_handle, linkedin_handle, twitter_handle, youtube_handle, tiktok_handle')
        .eq('user_email', userEmail)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('⚠️ Error fetching business info:', error);
      }

      // 3. Merge with priority: OAuth > Business Info
      const handles = {
        facebook: null,
        instagram: null,
        linkedin: null,
        twitter: null,
        youtube: null,
        tiktok: null
      };

      // Add OAuth connections first (highest priority)
      Object.keys(oauthConnections).forEach(platform => {
        handles[platform] = {
          source: 'oauth',
          connected: true,
          username: oauthConnections[platform].username,
          accountName: oauthConnections[platform].accountName,
          profileUrl: oauthConnections[platform].profileUrl,
          connectedAt: oauthConnections[platform].connectedAt,
          status: oauthConnections[platform].status
        };
      });

      // Add business info handles as fallback (only if not OAuth connected)
      if (businessInfo) {
        const platformMap = {
          facebook: 'facebook_handle',
          instagram: 'instagram_handle',
          linkedin: 'linkedin_handle',
          twitter: 'twitter_handle',
          youtube: 'youtube_handle',
          tiktok: 'tiktok_handle'
        };

        Object.keys(platformMap).forEach(platform => {
          const handle = businessInfo[platformMap[platform]];
          if (handle && !handles[platform]) {
            handles[platform] = {
              source: 'business_info',
              connected: false,
              username: handle,
              accountName: null,
              profileUrl: null,
              needsConnection: true
            };
          }
        });
      }

      // Log summary
      console.log(`\n📊 Social Handles Summary:`);
      Object.keys(handles).forEach(platform => {
        if (handles[platform]) {
          const h = handles[platform];
          console.log(`   ${platform}: ${h.username} (${h.source}${h.connected ? ' ✓' : ''})`);
        }
      });
      console.log('');

      return handles;

    } catch (error) {
      console.error('❌ Error getting social handles:', error);
      return {};
    }
  }

  /**
   * Get connection status for all platforms
   */
  async getConnectionStatus(userEmail) {
    try {
      const handles = await this.getSocialHandlesWithPriority(userEmail);
      
      const status = {
        facebook: {
          connected: handles.facebook?.connected || false,
          source: handles.facebook?.source || null,
          username: handles.facebook?.username || null,
          needsConnection: handles.facebook?.needsConnection || false
        },
        instagram: {
          connected: handles.instagram?.connected || false,
          source: handles.instagram?.source || null,
          username: handles.instagram?.username || null,
          needsConnection: handles.instagram?.needsConnection || false
        },
        linkedin: {
          connected: handles.linkedin?.connected || false,
          source: handles.linkedin?.source || null,
          username: handles.linkedin?.username || null,
          needsConnection: handles.linkedin?.needsConnection || false
        },
        twitter: {
          connected: handles.twitter?.connected || false,
          source: handles.twitter?.source || null,
          username: handles.twitter?.username || null,
          needsConnection: handles.twitter?.needsConnection || false
        }
      };

      return status;

    } catch (error) {
      console.error('❌ Error getting connection status:', error);
      return {};
    }
  }

  /**
   * Update connection status after OAuth
   */
  async updateConnection(userEmail, platform, connectionData) {
    try {
      console.log(`💾 Updating ${platform} connection for [USER_EMAIL]`);

      const { error } = await supabase
        .from('social_connections_v2')
        .upsert({
          user_email: userEmail,
          platform: platform,
          is_connected: true,
          connection_status: 'connected',
          provider_user_id: connectionData.providerId,
          provider_username: connectionData.username,
          provider_email: connectionData.email,
          account_name: connectionData.accountName,
          profile_url: connectionData.profileUrl,
          platform_metadata: connectionData.metadata || {},
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_email,platform'
        });

      if (error) throw error;

      console.log(`✅ ${platform} connection updated`);
      return true;

    } catch (error) {
      console.error(`❌ Error updating ${platform} connection:`, error);
      return false;
    }
  }

  /**
   * Disconnect a platform
   */
  async disconnectPlatform(userEmail, platform) {
    try {
      console.log(`🔌 Disconnecting ${platform} for [USER_EMAIL]`);

      const { error } = await supabase
        .from('social_connections_v2')
        .update({
          is_connected: false,
          connection_status: 'disconnected',
          disconnected_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_email', userEmail)
        .eq('platform', platform);

      if (error) throw error;

      console.log(`✅ ${platform} disconnected`);
      return true;

    } catch (error) {
      console.error(`❌ Error disconnecting ${platform}:`, error);
      return false;
    }
  }

  /**
   * Check if a specific platform is connected via OAuth
   */
  async isPlatformConnected(userEmail, platform) {
    try {
      // Check actual OAuth tokens table - this is the source of truth
      const oauthTokenService = (await import('./oauthTokenService.js')).default;
      const hasValidTokens = await oauthTokenService.isConnected(userEmail, platform);
      
      // Also check social_connections_v2 table for consistency
      const { data, error } = await supabase
        .from('social_connections_v2')
        .select('is_connected, connection_status')
        .eq('user_email', userEmail)
        .eq('platform', platform)
        .single();

      if (error && error.code !== 'PGRST116') {
        // Table entry might not exist, which is okay
        console.log(`⚠️ No entry in social_connections_v2 for ${platform}, checking OAuth tokens only`);
      }

      // Return true only if OAuth tokens exist (source of truth)
      return hasValidTokens;

    } catch (error) {
      console.error(`❌ Error checking ${platform} connection:`, error);
      return false;
    }
  }

  /**
   * Get OAuth token for a platform (if connected)
   */
  async getOAuthToken(userEmail, platform) {
    try {
      const { data, error } = await supabase
        .from('oauth_tokens')
        .select('*')
        .eq('user_email', userEmail)
        .eq('provider', platform)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (!data) return null;

      // Check if token is expired
      if (data.expires_at && data.expires_at < Date.now()) {
        console.log(`⚠️ ${platform} token expired`);
        return null;
      }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: data.expires_at,
        scope: data.scope
      };

    } catch (error) {
      console.error(`❌ Error getting ${platform} token:`, error);
      return null;
    }
  }
}

export default new SocialConnectionService();
