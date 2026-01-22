import express from 'express';
import socialMetricsWithCache from '../services/socialMetricsWithCache.js';

const router = express.Router();

/**
 * Get comprehensive Facebook metrics with caching
 * GET /api/facebook/metrics?email=user@example.com&period=month&forceRefresh=false
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
    console.log(`📊 Fetching Facebook metrics for: ${email}, period: ${period}, forceRefresh: ${shouldForceRefresh}`);

    const metrics = await socialMetricsWithCache.getFacebookMetrics(email, period, shouldForceRefresh);

    res.json(metrics);
  } catch (error) {
    console.error('❌ Error in Facebook metrics endpoint:', error);
    res.status(500).json({
      dataAvailable: false,
      error: error.message,
      reason: 'Failed to fetch Facebook metrics'
    });
  }
});

/**
 * Get user's Facebook pages
 * GET /api/facebook/pages?email=user@example.com
 */
router.get('/pages', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    console.log(`📄 Fetching Facebook pages for: ${email}`);

    const pages = await facebookMetricsService.getUserPages(email);

    res.json({
      success: true,
      pages: pages
    });
  } catch (error) {
    console.error('❌ Error fetching Facebook pages:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get engagement metrics for a specific page
 * GET /api/facebook/engagement?email=user@example.com&pageId=123&period=month
 */
router.get('/engagement', async (req, res) => {
  try {
    const { email, pageId, period = 'month' } = req.query;

    if (!email) {
      return res.status(400).json({
        dataAvailable: false,
        error: 'Email parameter is required'
      });
    }

    console.log(`💬 Fetching engagement metrics for: ${email}`);

    const engagement = await facebookMetricsService.getEngagementMetrics(email, pageId, period);

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
 * GET /api/facebook/top-posts?email=user@example.com&limit=10
 */
router.get('/top-posts', async (req, res) => {
  try {
    const { email, pageId, limit = 10 } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    console.log(`📝 Fetching top posts for: ${email}`);

    const posts = await facebookMetricsService.getTopPosts(email, pageId, parseInt(limit));

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
 * GET /api/facebook/follower-growth?email=user@example.com&days=30
 */
router.get('/follower-growth', async (req, res) => {
  try {
    const { email, pageId, days = 30 } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    console.log(`📈 Fetching follower growth for: ${email}`);

    const growth = await facebookMetricsService.getFollowerGrowth(email, pageId, parseInt(days));

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

export default router;
