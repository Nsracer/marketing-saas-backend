import express from 'express';
import socialMetricsWithCache from '../services/socialMetricsWithCache.js';

const router = express.Router();

/**
 * Get comprehensive Instagram metrics with caching
 * GET /api/instagram/metrics?email=user@example.com&period=month&forceRefresh=false
 */
router.get('/metrics', async (req, res) => {
  try {
    const { email, period = 'month', forceRefresh = 'false' } = req.query;

    if (!email) {
      return res.status(400).json({
        dataAvailable: false,
        error: 'Email parameter is required'
      });
    }

    const shouldForceRefresh = forceRefresh === 'true';
    console.log(`📊 Fetching Instagram metrics for: ${email}, period: ${period}, forceRefresh: ${shouldForceRefresh}`);

    const metrics = await socialMetricsWithCache.getInstagramMetrics(email, period, shouldForceRefresh);

    res.json(metrics);
  } catch (error) {
    console.error('❌ Error in Instagram metrics endpoint:', error);
    res.status(500).json({
      dataAvailable: false,
      error: error.message,
      reason: 'Failed to fetch Instagram metrics'
    });
  }
});

/**
 * Get Instagram Business Account info
 * GET /api/instagram/account?email=user@example.com
 */
router.get('/account', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    console.log(`📄 Fetching Instagram account info for: ${email}`);

    const account = await instagramMetricsService.getInstagramAccount(email);

    res.json({
      success: true,
      account: account
    });
  } catch (error) {
    console.error('❌ Error fetching Instagram account:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get engagement metrics
 * GET /api/instagram/engagement?email=user@example.com&period=month
 */
router.get('/engagement', async (req, res) => {
  try {
    const { email, period = 'month' } = req.query;

    if (!email) {
      return res.status(400).json({
        dataAvailable: false,
        error: 'Email parameter is required'
      });
    }

    console.log(`💬 Fetching Instagram engagement metrics for: ${email}`);

    const engagement = await instagramMetricsService.getEngagementMetrics(email, period);

    res.json({
      dataAvailable: true,
      ...engagement
    });
  } catch (error) {
    console.error('❌ Error fetching engagement:', error);
    res.status(500).json({
      dataAvailable: false,
      error: error.message
    });
  }
});

/**
 * Get top performing posts
 * GET /api/instagram/top-posts?email=user@example.com&limit=10
 */
router.get('/top-posts', async (req, res) => {
  try {
    const { email, limit = 10 } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    console.log(`📝 Fetching Instagram top posts for: ${email}`);

    const posts = await instagramMetricsService.getTopPosts(email, parseInt(limit));

    res.json({
      success: true,
      posts: posts
    });
  } catch (error) {
    console.error('❌ Error fetching top posts:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get follower growth trend
 * GET /api/instagram/follower-growth?email=user@example.com&days=30
 */
router.get('/follower-growth', async (req, res) => {
  try {
    const { email, days = 30 } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    console.log(`📈 Fetching Instagram follower growth for: ${email}`);

    const growth = await instagramMetricsService.getFollowerGrowth(email, parseInt(days));

    res.json({
      success: true,
      growth: growth
    });
  } catch (error) {
    console.error('❌ Error fetching follower growth:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Check Instagram connection status
 * GET /api/instagram/status?email=user@example.com
 */
router.get('/status', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.json({
        connected: false,
        error: 'Email parameter is required'
      });
    }

    const account = await instagramMetricsService.getInstagramAccount(email);
    
    res.json({
      connected: true,
      username: account.username,
      followers: account.followers
    });
  } catch (error) {
    res.json({
      connected: false,
      error: error.message
    });
  }
});

export default router;
