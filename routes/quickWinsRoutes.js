import express from 'express';
import quickWinsService from '../services/quickWinsService.js';
import { requireOptimization } from '../middleware/planAccessMiddleware.js';

const router = express.Router();

/**
 * GET /api/quickwins/data
 * Get website quick wins and opportunities
 * Query params:
 *   - email: User's email (for caching)
 *   - domain: Website domain to analyze
 *   - forceRefresh: Force fresh analysis (default: false)
 * REQUIRES: Growth or Pro plan
 */
router.get('/data', requireOptimization, async (req, res) => {
  try {
    const { email, domain, forceRefresh = false } = req.query;

    if (!domain) {
      return res.status(400).json({ 
        error: 'Domain parameter is required' 
      });
    }

    // Clean domain
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

    console.log(`🚀 Fetching Quick Wins data for ${cleanDomain}...`);

    const quickWinsData = await quickWinsService.getQuickWinsData(
      email, 
      cleanDomain, 
      forceRefresh === 'true'
    );

    res.json({
      success: true,
      domain: cleanDomain,
      ...quickWinsData
    });

  } catch (error) {
    console.error('❌ Error fetching Quick Wins data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch Quick Wins data',
      message: error.message 
    });
  }
});

/**
 * GET /api/quickwins/categories
 * Get quick wins grouped by category
 */
router.get('/categories/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    const { email } = req.query;
    
    const quickWinsData = await quickWinsService.getQuickWinsData(email, domain);
    
    res.json({
      success: true,
      domain,
      categories: quickWinsData.categories,
      summary: quickWinsData.summary
    });

  } catch (error) {
    console.error('❌ Error fetching categorized Quick Wins:', error);
    res.status(500).json({ 
      error: 'Failed to fetch categorized Quick Wins',
      message: error.message 
    });
  }
});

/**
 * GET /api/quickwins/top/:count
 * Get top N quick wins by priority
 */
router.get('/top/:count', async (req, res) => {
  try {
    const { count } = req.params;
    const { email, domain } = req.query;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain parameter is required' });
    }
    
    const quickWinsData = await quickWinsService.getQuickWinsData(email, domain);
    const topOpportunities = quickWinsData.opportunities
      .sort((a, b) => b.priority - a.priority)
      .slice(0, parseInt(count) || 10);
    
    res.json({
      success: true,
      domain,
      count: topOpportunities.length,
      opportunities: topOpportunities,
      summary: quickWinsData.summary
    });

  } catch (error) {
    console.error('❌ Error fetching top Quick Wins:', error);
    res.status(500).json({ 
      error: 'Failed to fetch top Quick Wins',
      message: error.message 
    });
  }
});

/**
 * POST /api/quickwins/refresh
 * Force refresh of Quick Wins data
 */
router.post('/refresh', async (req, res) => {
  try {
    const { email, domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }
    
    console.log(`🔄 Force refreshing Quick Wins for ${domain}...`);
    
    const quickWinsData = await quickWinsService.getQuickWinsData(
      email, 
      domain, 
      true // Force refresh
    );
    
    res.json({
      success: true,
      message: 'Quick Wins data refreshed successfully',
      domain,
      ...quickWinsData
    });

  } catch (error) {
    console.error('❌ Error refreshing Quick Wins:', error);
    res.status(500).json({ 
      error: 'Failed to refresh Quick Wins data',
      message: error.message 
    });
  }
});

export default router;