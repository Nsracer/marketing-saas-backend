import express from 'express';
import aiInsightsService from '../services/aiInsightsService.js';

const router = express.Router();

/**
 * POST /api/ai-insights/generate
 * Generate new unified AI insights (3-5 total recommendations)
 */
router.post('/generate', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    console.log(`🤖 Generating unified AI insights for: ${email}`);

    const result = await aiInsightsService.generateInsights(email);

    return res.json(result);

  } catch (error) {
    console.error('❌ Error generating AI insights:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/ai-insights/latest
 * Get latest unified AI insights
 */
router.get('/latest', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const insights = await aiInsightsService.getLatestInsights(email);

    if (!insights) {
      return res.json({
        success: true,
        insights: null,
        message: 'No insights generated yet'
      });
    }

    return res.json({
      success: true,
      insights: insights.insights,
      createdAt: insights.created_at,
      expiresAt: insights.expires_at
    });

  } catch (error) {
    console.error('❌ Error fetching AI insights:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/ai-insights/history
 * Get insights history for a user
 */
router.get('/history', async (req, res) => {
  try {
    const { email } = req.query;
    const limit = parseInt(req.query.limit) || 10;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const history = await aiInsightsService.getInsightsHistory(email, limit);

    return res.json({
      success: true,
      history,
      count: history.length
    });

  } catch (error) {
    console.error('❌ Error fetching insights history:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/ai-insights/categories
 * Get available insight categories and their status
 */
router.get('/categories', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Get latest insights to check what's available
    const latestInsights = await aiInsightsService.getLatestInsights(email);

    const categories = {
      seo: {
        name: 'SEO & Website Performance',
        description: 'Performance scores, search rankings, technical SEO, and backlinks',
        available: latestInsights?.insights?.seo?.available || false,
        lastGenerated: latestInsights?.created_at
      },
      competitor: {
        name: 'Competitor Intelligence',
        description: 'Competitive analysis, market positioning, and strategic opportunities',
        available: latestInsights?.insights?.competitor?.available || false,
        lastGenerated: latestInsights?.created_at
      },
      social: {
        name: 'Social Media Performance',
        description: 'Social engagement, follower growth, and content strategy',
        available: latestInsights?.insights?.social?.available || false,
        lastGenerated: latestInsights?.created_at
      }
    };

    return res.json({
      success: true,
      categories
    });

  } catch (error) {
    console.error('❌ Error fetching categories:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/ai-insights/cleanup
 * Cleanup old insights (admin/maintenance endpoint)
 */
router.delete('/cleanup', async (req, res) => {
  try {
    const { email } = req.body;
    const daysToKeep = parseInt(req.body.daysToKeep) || 90;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    await aiInsightsService.cleanupOldInsights(email, daysToKeep);

    return res.json({
      success: true,
      message: `Cleaned up insights older than ${daysToKeep} days`
    });

  } catch (error) {
    console.error('❌ Error cleaning up insights:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
