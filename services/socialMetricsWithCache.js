import facebookMetricsService from './facebookMetricsService.js';
import instagramMetricsService from './instagramMetricsService.js';
import socialMediaCacheService from './socialMediaCacheService.js';
import oauthTokenService from './oauthTokenService.js';

/**
 * Social Metrics Service with Caching
 * Wraps the individual platform services with caching layer
 */
class SocialMetricsWithCache {

  /**
   * Get Facebook metrics with caching
   * @param {string} userEmail - User's email
   * @param {string} period - Time period
   * @param {boolean} forceRefresh - Force refresh from API
   * @returns {Object} Facebook metrics
   */
  async getFacebookMetrics(userEmail, period = 'month', forceRefresh = false) {
    const startTime = Date.now();

    try {
      // Check if user is connected
      const isConnected = await oauthTokenService.isConnected(userEmail, 'facebook');
      if (!isConnected) {
        console.log('❌ Facebook not connected for:', userEmail);
        return {
          dataAvailable: false,
          reason: 'Facebook account not connected. Please connect your account.',
          requiresConnection: true
        };
      }

      // Try cache first unless force refresh
      if (!forceRefresh) {
        const cached = await socialMediaCacheService.getCachedMetrics(userEmail, 'facebook', period);
        if (cached) {
          // Log cache hit
          await socialMediaCacheService.logFetchHistory(
            userEmail,
            'facebook',
            'metrics',
            'cached',
            {
              cacheHit: true,
              cacheAge: cached.cacheAge,
              duration: Date.now() - startTime
            }
          );
          return cached;
        }
      }

      // Fetch from API
      console.log(`🔄 Fetching Facebook metrics from API for ${userEmail}`);
      const metrics = await facebookMetricsService.getComprehensiveMetrics(userEmail, period);

      // Cache the results if successful
      if (metrics.dataAvailable) {
        await socialMediaCacheService.cacheMetrics(userEmail, 'facebook', metrics, period);

        // Update connection status
        await socialMediaCacheService.updateConnectionStatus(userEmail, 'facebook', true, {
          pageId: metrics.pageId,
          pageName: metrics.pageName
        });

        // Log successful fetch
        await socialMediaCacheService.logFetchHistory(
          userEmail,
          'facebook',
          'metrics',
          'success',
          {
            cacheHit: false,
            duration: Date.now() - startTime,
            recordCount: metrics.topPosts?.length || 0
          }
        );
      } else {
        // Log failed fetch
        await socialMediaCacheService.logFetchHistory(
          userEmail,
          'facebook',
          'metrics',
          'failed',
          {
            cacheHit: false,
            duration: Date.now() - startTime,
            error: metrics.reason
          }
        );
      }

      return metrics;
    } catch (error) {
      console.error('❌ Error getting Facebook metrics:', error.message);

      // Log error
      await socialMediaCacheService.logFetchHistory(
        userEmail,
        'facebook',
        'metrics',
        'failed',
        {
          cacheHit: false,
          duration: Date.now() - startTime,
          error: error.message
        }
      );

      return {
        dataAvailable: false,
        reason: error.message,
        error: error.message
      };
    }
  }

  /**
   * Get Instagram metrics with caching
   * @param {string} userEmail - User's email
   * @param {string} period - Time period
   * @param {boolean} forceRefresh - Force refresh from API
   * @returns {Object} Instagram metrics
   */
  async getInstagramMetrics(userEmail, period = 'month', forceRefresh = false) {
    const startTime = Date.now();

    try {
      // Check if user is connected
      const isConnected = await oauthTokenService.isConnected(userEmail, 'instagram');
      if (!isConnected) {
        console.log('❌ Instagram not connected for:', userEmail);
        return {
          dataAvailable: false,
          reason: 'Instagram account not connected. Please connect your Instagram Business account.',
          requiresConnection: true
        };
      }

      // Try cache first unless force refresh
      if (!forceRefresh) {
        const cached = await socialMediaCacheService.getCachedMetrics(userEmail, 'instagram', period);
        if (cached) {
          // Log cache hit
          await socialMediaCacheService.logFetchHistory(
            userEmail,
            'instagram',
            'metrics',
            'cached',
            {
              cacheHit: true,
              cacheAge: cached.cacheAge,
              duration: Date.now() - startTime
            }
          );
          return cached;
        }
      }

      // Fetch from API
      console.log(`🔄 Fetching Instagram metrics from API for ${userEmail}`);
      const metrics = await instagramMetricsService.getComprehensiveMetrics(userEmail, period);

      // Cache the results if successful
      if (metrics.dataAvailable) {
        await socialMediaCacheService.cacheMetrics(userEmail, 'instagram', metrics, period);

        // Update connection status
        await socialMediaCacheService.updateConnectionStatus(userEmail, 'instagram', true, {
          accountId: metrics.accountId,
          username: metrics.username,
          name: metrics.name
        });

        // Log successful fetch
        await socialMediaCacheService.logFetchHistory(
          userEmail,
          'instagram',
          'metrics',
          'success',
          {
            cacheHit: false,
            duration: Date.now() - startTime,
            recordCount: metrics.topPosts?.length || 0
          }
        );
      } else {
        // Log failed fetch
        await socialMediaCacheService.logFetchHistory(
          userEmail,
          'instagram',
          'metrics',
          'failed',
          {
            cacheHit: false,
            duration: Date.now() - startTime,
            error: metrics.reason
          }
        );
      }

      return metrics;
    } catch (error) {
      console.error('❌ Error getting Instagram metrics:', error.message);

      // Log error
      await socialMediaCacheService.logFetchHistory(
        userEmail,
        'instagram',
        'metrics',
        'failed',
        {
          cacheHit: false,
          duration: Date.now() - startTime,
          error: error.message
        }
      );

      return {
        dataAvailable: false,
        reason: error.message,
        error: error.message
      };
    }
  }

  /**
   * Get connection status for all platforms
   * @param {string} userEmail - User's email
   * @returns {Object} Connection statuses
   */
  async getAllConnectionStatuses(userEmail) {
    try {
      const [facebookConnected, instagramConnected, linkedinConnected] = await Promise.all([
        oauthTokenService.isConnected(userEmail, 'facebook'),
        oauthTokenService.isConnected(userEmail, 'instagram'),
        oauthTokenService.isConnected(userEmail, 'linkedin')
      ]);

      // Get additional metadata from cache
      const connections = await socialMediaCacheService.getAllConnectionStatuses(userEmail);

      const facebookMeta = connections.find(c => c.platform === 'facebook');
      const instagramMeta = connections.find(c => c.platform === 'instagram');
      const linkedinMeta = connections.find(c => c.platform === 'linkedin');

      return {
        facebook: {
          connected: facebookConnected,
          metadata: facebookMeta?.platform_metadata || {},
          lastUpdated: facebookMeta?.updated_at
        },
        instagram: {
          connected: instagramConnected,
          metadata: instagramMeta?.platform_metadata || {},
          lastUpdated: instagramMeta?.updated_at
        },
        linkedin: {
          connected: linkedinConnected,
          metadata: linkedinMeta?.platform_metadata || {},
          lastUpdated: linkedinMeta?.updated_at
        }
      };
    } catch (error) {
      console.error('❌ Error getting connection statuses:', error.message);
      return {
        facebook: { connected: false },
        instagram: { connected: false },
        linkedin: { connected: false }
      };
    }
  }

  /**
   * Invalidate cache for a platform
   * @param {string} userEmail - User's email
   * @param {string} platform - Platform name
   * @returns {boolean} Success status
   */
  async invalidateCache(userEmail, platform) {
    return await socialMediaCacheService.invalidateCache(userEmail, platform);
  }

  /**
   * Get cache statistics
   * @param {string} userEmail - User's email
   * @returns {Object} Cache statistics
   */
  async getCacheStats(userEmail) {
    return await socialMediaCacheService.getCacheStats(userEmail);
  }
}

export default new SocialMetricsWithCache();
