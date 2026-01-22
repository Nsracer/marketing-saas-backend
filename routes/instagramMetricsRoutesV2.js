import express from 'express';
import instagramMetricsServiceV2 from '../services/instagramMetricsServiceV2.js';
import socialMediaCacheService from '../services/socialMediaCacheService.js';

const router = express.Router();

/**
 * GET /api/instagram/v2/metrics?email=user@example.com&forceRefresh=true
 * Get comprehensive Instagram metrics (Official API)
 * Supports cache with 30-minute expiration
 * Available in all plans (Starter, Growth, Pro)
 */
router.get('/metrics', async (req, res) => {
  try {
    const userEmail = req.query.email;
    const forceRefresh = req.query.forceRefresh === 'true';

    if (!userEmail) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    console.log(`\n📊 [Instagram V2 API] Fetching metrics for: ${userEmail}`);
    console.log(`   🔄 Force Refresh: ${forceRefresh ? 'YES' : 'NO'}`);

    // Check cache first unless force refresh
    if (!forceRefresh) {
      const cachedData = await socialMediaCacheService.getCachedMetrics(userEmail, 'instagram');
      if (cachedData) {
        console.log(`✅ Returning cached data (${cachedData.cacheAge} min old)`);
        return res.json({
          success: true,
          ...cachedData,
          cached: true
        });
      }
    } else {
      console.log('🗑️ Force refresh - invalidating cache...');
      await socialMediaCacheService.invalidateCache(userEmail, 'instagram');
    }

    console.log(`🔄 Calling instagramMetricsServiceV2.getComprehensiveMetrics...`);

    const result = await instagramMetricsServiceV2.getComprehensiveMetrics(userEmail);

    console.log(`✅ Got result from service: { dataAvailable: ${result.dataAvailable}, hasTopPosts: ${result.topPosts?.length > 0} }`);

    if (!result.dataAvailable) {
      console.log(`⚠️ No data available: ${result.reason}`);
      return res.json({
        success: false,
        dataAvailable: false,
        reason: result.reason
      });
    }

    // Cache the successful result
    await socialMediaCacheService.cacheMetrics(userEmail, 'instagram', result);
    console.log('[CACHE] Metrics cached successfully');

    console.log(`[>>] Sending response to frontend...`);
    console.log(`   Response contains:`);
    console.log(`      - dataAvailable: ${result.dataAvailable}`);
    console.log(`      - topPosts: ${result.topPosts?.length || result.topPerformingPosts?.length || 0} posts`);
    console.log(`      - followerGrowth: ${result.followerGrowth?.length || 0} data points`);
    
    res.json({
      success: true,
      ...result,
      cached: false
    });
    console.log(`[OK] Response sent successfully\n`);

  } catch (error) {
    console.error(`❌ [Instagram V2 API] ROUTE Error: ${error.message}`);
    console.error(`   Stack:`, error.stack);
    
    res.status(500).json({
      success: false,
      dataAvailable: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * POST /api/instagram/v2/metrics/dev
 * Dev Mode: Get Instagram metrics with custom access token
 */
router.post('/metrics/dev', async (req, res) => {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        error: 'Access token is required'
      });
    }

    console.log(`\n🔧 [Instagram Dev Mode] Fetching metrics with custom token`);

    const result = await instagramMetricsServiceV2.getComprehensiveMetricsWithToken(accessToken);

    console.log(`✅ Got result: { dataAvailable: ${result.dataAvailable} }`);

    res.json({
      success: result.dataAvailable,
      ...result
    });

  } catch (error) {
    console.error(`❌ [Instagram Dev Mode] Error: ${error.message}`);
    
    res.status(500).json({
      success: false,
      dataAvailable: false,
      error: error.message
    });
  }
});

export default router;
