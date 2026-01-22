import express from 'express';
import socialMetricsWithCache from '../services/socialMetricsWithCache.js';
import socialMediaCacheService from '../services/socialMediaCacheService.js';

const router = express.Router();

/**
 * Get connection status for all social platforms
 * GET /api/social/status?email=user@example.com
 */
router.get('/status', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    console.log(`🔍 Checking social connection status for: ${email}`);

    const statuses = await socialMetricsWithCache.getAllConnectionStatuses(email);

    res.json({
      success: true,
      connections: statuses
    });
  } catch (error) {
    console.error('❌ Error getting social status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get cache statistics for a user
 * GET /api/social/cache-stats?email=user@example.com
 */
router.get('/cache-stats', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    console.log(`📊 Getting cache stats for: ${email}`);

    const stats = await socialMetricsWithCache.getCacheStats(email);

    res.json({
      success: true,
      stats: stats
    });
  } catch (error) {
    console.error('❌ Error getting cache stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Invalidate cache for a platform
 * POST /api/social/invalidate-cache
 * Body: { email, platform }
 */
router.post('/invalidate-cache', async (req, res) => {
  try {
    const { email, platform } = req.body;

    if (!email || !platform) {
      return res.status(400).json({
        success: false,
        error: 'Email and platform parameters are required'
      });
    }

    console.log(`🗑️  Invalidating cache for ${platform} (${email})`);

    const success = await socialMetricsWithCache.invalidateCache(email, platform);

    res.json({
      success: success,
      message: success ? 'Cache invalidated successfully' : 'Failed to invalidate cache'
    });
  } catch (error) {
    console.error('❌ Error invalidating cache:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Refresh metrics for a platform (force refresh from API)
 * POST /api/social/refresh
 * Body: { email, platform, period }
 */
router.post('/refresh', async (req, res) => {
  try {
    const { email, platform, period = 'month' } = req.body;

    if (!email || !platform) {
      return res.status(400).json({
        success: false,
        error: 'Email and platform parameters are required'
      });
    }

    console.log(`🔄 Force refreshing ${platform} metrics for ${email}`);

    let metrics;
    if (platform === 'facebook') {
      metrics = await socialMetricsWithCache.getFacebookMetrics(email, period, true);
    } else if (platform === 'instagram') {
      metrics = await socialMetricsWithCache.getInstagramMetrics(email, period, true);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid platform. Must be facebook or instagram'
      });
    }

    res.json({
      success: metrics.dataAvailable,
      data: metrics
    });
  } catch (error) {
    console.error('❌ Error refreshing metrics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Clean up expired cache entries (admin endpoint)
 * POST /api/social/cleanup-cache
 */
router.post('/cleanup-cache', async (req, res) => {
  try {
    console.log('🧹 Cleaning up expired cache entries...');

    const deletedCount = await socialMediaCacheService.cleanupExpiredCache();

    res.json({
      success: true,
      deletedCount: deletedCount,
      message: `Cleaned up ${deletedCount} expired cache entries`
    });
  } catch (error) {
    console.error('❌ Error cleaning up cache:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
