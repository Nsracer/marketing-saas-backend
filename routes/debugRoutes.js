import express from 'express';
import competitorCacheService from '../services/competitorCacheService.js';

const router = express.Router();

/**
 * GET /api/debug/cache-status
 * Check if cache exists for a specific competitor analysis
 */
router.get('/cache-status', async (req, res) => {
  try {
    const { email, yourSite, competitorSite } = req.query;

    if (!email || !yourSite || !competitorSite) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: email, yourSite, competitorSite'
      });
    }

    console.log(`\n🔍 Cache Status Check:`);
    console.log(`   Email: ${email}`);
    console.log(`   Your Site: ${yourSite}`);
    console.log(`   Competitor: ${competitorSite}`);

    const cachedData = await competitorCacheService.getCompetitorCache(email, yourSite, competitorSite);

    if (cachedData) {
      res.json({
        success: true,
        cached: true,
        cacheAge: cachedData.cacheAge,
        lastUpdated: cachedData.lastUpdated,
        hasTechnology: !!cachedData.competitorSite?.puppeteer?.technology,
        hasTraffic: !!cachedData.competitorSite?.traffic,
        hasBacklinks: !!cachedData.competitorSite?.backlinks,
        message: `Cache found! Age: ${cachedData.cacheAge} hours`
      });
    } else {
      res.json({
        success: true,
        cached: false,
        message: 'No cache found for this analysis'
      });
    }

  } catch (error) {
    console.error('❌ Cache status check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/debug/clear-cache
 * Clear cache for a specific competitor analysis
 */
router.delete('/clear-cache', async (req, res) => {
  try {
    const { email, yourSite, competitorSite } = req.body;

    if (!email || !yourSite || !competitorSite) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: email, yourSite, competitorSite'
      });
    }

    console.log(`\n🗑️ Clearing cache:`);
    console.log(`   Email: ${email}`);
    console.log(`   Your Site: ${yourSite}`);
    console.log(`   Competitor: ${competitorSite}`);

    const deleted = await competitorCacheService.deleteCache(email, yourSite, competitorSite);

    res.json({
      success: true,
      deleted: deleted,
      message: deleted ? 'Cache cleared successfully' : 'No cache found to clear'
    });

  } catch (error) {
    console.error('❌ Clear cache error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;