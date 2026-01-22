import express from 'express';
import facebookMetricsServiceV2 from '../services/facebookMetricsServiceV2.js';
import socialMediaCacheService from '../services/socialMediaCacheService.js';
import { filterSocialData } from '../services/planAccessService.js';

const router = express.Router();

/**
 * Get Facebook metrics for dashboard (V2)
 * GET /api/facebook/v2/metrics?email=user@example.com&forceRefresh=true
 * Uses: Official Facebook Graph API ONLY (30 days)
 * Supports cache with 30-minute expiration
 */
router.get('/metrics', async (req, res) => {
  let startTime = Date.now();
  let email = '';
  
  try {
    email = req.query.email;
    const forceRefresh = req.query.forceRefresh === 'true';

    if (!email) {
      return res.status(400).json({
        success: false,
        dataAvailable: false,
        error: 'email_required',
        message: 'Email parameter is required'
      });
    }

    console.log('\n📊 [Facebook V2 API] Fetching metrics for:', email);
    console.log(`   🔄 Force Refresh: ${forceRefresh ? 'YES' : 'NO'}`);
    startTime = Date.now();

    // Check cache first unless force refresh
    if (!forceRefresh) {
      const cachedData = await socialMediaCacheService.getCachedMetrics(email, 'facebook');
      if (cachedData) {
        console.log(`✅ Returning cached data (${cachedData.cacheAge} min old)`);
        // Filter cached data based on user's plan
        const filteredData = await filterSocialData(cachedData, email, 'facebook');
        return res.json({
          success: true,
          ...filteredData,
          cached: true
        });
      }
    } else {
      console.log('🗑️ Force refresh - invalidating cache...');
      await socialMediaCacheService.invalidateCache(email, 'facebook');
    }

    // Use V2 service (Official API only)
    console.log('🔄 Calling facebookMetricsServiceV2.getComprehensiveMetrics...');
    const result = await facebookMetricsServiceV2.getComprehensiveMetrics(email);
    console.log('✅ Got result from service:', { dataAvailable: result.dataAvailable, hasTopPosts: !!result.topPosts });

    if (!result.dataAvailable) {
      console.log('⚠️ No data available:', result.reason);
      return res.json({
        success: false,
        dataAvailable: false,
        reason: result.reason
      });
    }

    // Cache the result (unfiltered)
    await socialMediaCacheService.cacheMetrics(email, 'facebook', result);
    console.log('💾 Metrics cached successfully');

    // Filter result based on user's plan before sending
    const filteredResult = await filterSocialData(result, email, 'facebook');

    console.log('[>>] Sending response to frontend...');
    console.log(`   Response contains:`);
    console.log(`      - dataAvailable: ${filteredResult.dataAvailable}`);
    console.log(`      - topPosts: ${filteredResult.topPosts?.length || 0} posts`);
    console.log(`      - followerGrowth: ${filteredResult.followerGrowth?.length || 0} data points`);
    console.log(`      - basicOnly: ${filteredResult.basicOnly || false}`);
    console.log(`      - advancedMetricsBlocked: ${filteredResult.advancedMetricsBlocked || false}`);
    
    res.json({
      success: true,
      ...filteredResult,
      cached: false
    });
    console.log('[OK] Response sent successfully\n');

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ [Facebook V2 API] ROUTE Error:', error.message);
    console.error('   Stack:', error.stack);

    res.status(500).json({
      success: false,
      dataAvailable: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export default router;
