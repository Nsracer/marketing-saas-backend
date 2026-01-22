import express from 'express';
import socialMediaCacheService from '../services/socialMediaCacheService.js';
import linkedinMetricsServiceV2 from '../services/linkedinMetricsServiceV2.js';
import { filterSocialData } from '../services/planAccessService.js';
import { requireLinkedIn } from '../middleware/planAccessMiddleware.js';

const router = express.Router();

/**
 * GET /api/linkedin/v2/metrics?email=user@example.com&forceRefresh=true&organizationId=12345
 * Uses: Apify scraper for posts + Official LinkedIn API for follower growth (30 days)
 * Supports cache with 30-minute expiration
 * REQUIRES: Growth or Pro plan
 */
router.get('/metrics', requireLinkedIn, async (req, res) => {
  let startTime = Date.now();
  let email = '';

  try {
    email = req.query.email;
    const forceRefresh = req.query.forceRefresh === 'true';
    const organizationId = req.query.organizationId;

    if (!email) {
      return res.status(400).json({
        success: false,
        dataAvailable: false,
        error: 'email_required',
        message: 'Email parameter is required'
      });
    }

    console.log('\n📊 [LinkedIn V2 API] Fetching metrics for:', email);
    console.log(`   🔄 Force Refresh: ${forceRefresh ? 'YES' : 'NO'}`);
    startTime = Date.now();

    // Check cache first unless force refresh
    if (!forceRefresh) {
      // Pass organizationId to getCachedMetrics to find specific org cache
      const cachedData = await socialMediaCacheService.getCachedMetrics(email, 'linkedin', 'month', false, organizationId);

      if (cachedData) {
        console.log(`✅ Returning cached data (${cachedData.cacheAge} min old)`);

        // Double check org ID match just in case (though service query handles it)
        if (!organizationId || (cachedData.organizationInfo && cachedData.organizationInfo.id === organizationId) || (cachedData.linkedin_company_id === organizationId)) {
          const filteredData = await filterSocialData(cachedData, email, 'linkedin');
          return res.json({
            success: true,
            ...filteredData,
            cached: true
          });
        }
        console.log('⚠️ Cached data ID mismatch, fetching fresh...');
      }
    } else {
      console.log('🗑️ Force refresh - invalidating cache...');
      await socialMediaCacheService.invalidateCache(email, 'linkedin');
    }

    console.log('📡 Fetching fresh data from LinkedIn...');

    // Use V2 service (Apify + Official API)
    const result = await linkedinMetricsServiceV2.getComprehensiveMetrics(email, organizationId);

    if (!result.dataAvailable) {
      return res.json({
        success: false,
        dataAvailable: false,
        reason: result.reason,
        needsBusinessSetup: result.needsBusinessSetup
      });
    }

    // Cache the successful result (unfiltered)
    await socialMediaCacheService.cacheMetrics(email, 'linkedin', result);
    console.log('💾 Metrics cached successfully');

    // Filter result based on user's plan
    const filteredResult = await filterSocialData(result, email, 'linkedin');

    const duration = Date.now() - startTime;
    console.log(`[OK] LinkedIn V2 metrics fetched successfully (${duration}ms)`);
    console.log(`   Response contains:`);
    console.log(`      - dataAvailable: ${filteredResult.dataAvailable}`);
    console.log(`      - topPosts: ${filteredResult.topPosts?.length || 0} posts`);
    console.log(`      - followerGrowth: ${filteredResult.followerGrowth?.length || 0} data points`);
    console.log(`      - basicOnly: ${filteredResult.basicOnly || false}`);
    console.log(`      - advancedMetricsBlocked: ${filteredResult.advancedMetricsBlocked || false}\n`);

    res.json({
      success: true,
      ...filteredResult,
      cached: false
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ [LinkedIn V2 API] Error:', error.message);

    // await socialMediaCacheService.logFetch(
    //   email,
    //   'linkedin',
    //   'metrics',
    //   'failed',
    //   duration,
    //   0,
    //   false,
    //   error.message
    // );

    res.status(500).json({
      success: false,
      dataAvailable: false,
      error: error.message
    });
  }
});

/**
 * Get user's LinkedIn organizations
 * GET /api/linkedin/v2/organizations?email=user@example.com
 */
router.get('/organizations', requireLinkedIn, async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'email_required'
      });
    }

    const organizations = await linkedinMetricsServiceV2.getOrganizations(email);

    res.json({
      success: true,
      organizations
    });
  } catch (error) {
    console.error('❌ Error fetching organizations:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
