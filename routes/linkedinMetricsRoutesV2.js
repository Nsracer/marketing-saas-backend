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
    console.log(`   🏢 Organization ID: ${organizationId || '(not provided)'}`);
    startTime = Date.now();

    // If no organizationId provided, try to find the best cached org (one with actual data)
    let effectiveOrgId = organizationId;
    if (!effectiveOrgId) {
      const cachedOrgs = await socialMediaCacheService.getCachedOrganizations(email);
      if (cachedOrgs && cachedOrgs.length > 0) {
        // Find an org that has actual post data (not personal profile)
        for (const org of cachedOrgs) {
          if (org.id !== 'personal') {
            effectiveOrgId = org.id;
            console.log(`   📌 Auto-selected organization from cache: ${org.name} (${org.id})`);
            break;
          }
        }
      }
    }

    // Check cache first unless force refresh
    if (!forceRefresh) {
      // Pass organizationId to getCachedMetrics to find specific org cache
      const cachedData = await socialMediaCacheService.getCachedMetrics(email, 'linkedin', 'month', false, effectiveOrgId);

      if (cachedData) {
        console.log(`✅ Returning cached data (${cachedData.cacheAge} min old)`);

        // Double check org ID match just in case (though service query handles it)
        if (!effectiveOrgId || (cachedData.organizationInfo && cachedData.organizationInfo.id === effectiveOrgId) || (cachedData.linkedin_company_id === effectiveOrgId)) {
          // Also fetch cached personal analytics to include profile data
          const cachedPersonal = await socialMediaCacheService.getCachedPersonalAnalytics(email, false);
          if (cachedPersonal) {
            console.log(`   👤 Attaching personal profile: ${cachedPersonal.profile?.name}`);
            cachedData.profile = cachedPersonal.profile;
            cachedData.personalAnalytics = cachedPersonal.personalAnalytics;
          }

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
    const result = await linkedinMetricsServiceV2.getComprehensiveMetrics(email, effectiveOrgId);

    // Check if result indicates rate limiting or has no real data
    const isRateLimited = result.reason?.toLowerCase().includes('rate limit') || result.partialData;
    const hasZeroData = result.companyFollowers === 0 && (!result.topPosts || result.topPosts.length === 0);
    const hasNoPosts = !result.topPosts || result.topPosts.length === 0;
    const hasNoGrowth = !result.followerGrowth || result.followerGrowth.length === 0;

    // Always check expired cache first to compare data quality
    const expiredCacheData = await socialMediaCacheService.getCachedMetrics(email, 'linkedin', 'month', true, effectiveOrgId);
    const cacheHasBetterData = expiredCacheData && (
      (expiredCacheData.topPosts?.length > 0 && hasNoPosts) ||
      (expiredCacheData.followerGrowth?.length > 0 && hasNoGrowth)
    );

    // If rate limited, got zeros, or cache has better data, use expired cache
    if (!result.dataAvailable || isRateLimited || hasZeroData || cacheHasBetterData) {
      console.log('⚠️ API returned limited/empty data or cache has better data, checking expired cache...');
      console.log(`   Fresh data: ${result.topPosts?.length || 0} posts, ${result.followerGrowth?.length || 0} growth points`);
      console.log(`   Cached data: ${expiredCacheData?.topPosts?.length || 0} posts, ${expiredCacheData?.followerGrowth?.length || 0} growth points`);

      if (expiredCacheData && (expiredCacheData.companyFollowers > 0 || expiredCacheData.topPosts?.length > 0)) {
        console.log(`✅ Returning expired cache data (${expiredCacheData.cacheAge} min old) - has better/more complete data`);

        // Also try to get cached personal analytics
        const cachedPersonal = await socialMediaCacheService.getCachedPersonalAnalytics(email, true);
        if (cachedPersonal) {
          expiredCacheData.profile = cachedPersonal.profile;
          expiredCacheData.personalAnalytics = cachedPersonal.personalAnalytics;
        }

        const filteredData = await filterSocialData(expiredCacheData, email, 'linkedin');
        return res.json({
          success: true,
          ...filteredData,
          cached: true,
          cacheExpired: true,
          rateLimited: isRateLimited,
          message: 'Returning cached data due to LinkedIn API rate limits. Data will refresh automatically when limits reset.'
        });
      }

      // No good cache data available
      return res.json({
        success: false,
        dataAvailable: false,
        reason: result.reason || 'Could not fetch LinkedIn data',
        needsBusinessSetup: result.needsBusinessSetup,
        rateLimited: isRateLimited
      });
    }

    // Cache the successful result (unfiltered)
    await socialMediaCacheService.cacheMetrics(email, 'linkedin', result);
    console.log('💾 Metrics cached successfully');

    // Also cache personal analytics separately (user-level, not org-level)
    if (result.profile || result.personalAnalytics) {
      await socialMediaCacheService.cachePersonalAnalytics(email, {
        profile: result.profile,
        personalAnalytics: result.personalAnalytics
      });
      console.log('💾 Personal analytics cached successfully');
    }

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

    // On error, try to return expired cache as fallback
    let errorOrgId = req.query.organizationId;
    if (!errorOrgId) {
      // Try to find a real org (not personal) from cache
      const cachedOrgs = await socialMediaCacheService.getCachedOrganizations(email);
      if (cachedOrgs && cachedOrgs.length > 0) {
        for (const org of cachedOrgs) {
          if (org.id !== 'personal') {
            errorOrgId = org.id;
            break;
          }
        }
      }
    }
    const expiredCacheData = await socialMediaCacheService.getCachedMetrics(email, 'linkedin', 'month', true, errorOrgId);

    if (expiredCacheData && (expiredCacheData.companyFollowers > 0 || expiredCacheData.topPosts?.length > 0)) {
      console.log(`✅ Returning expired cache on error (${expiredCacheData.cacheAge} min old)`);

      // Also try to get cached personal analytics
      const cachedPersonal = await socialMediaCacheService.getCachedPersonalAnalytics(email, true);
      if (cachedPersonal) {
        expiredCacheData.profile = cachedPersonal.profile;
        expiredCacheData.personalAnalytics = cachedPersonal.personalAnalytics;
      }

      const filteredData = await filterSocialData(expiredCacheData, email, 'linkedin');
      return res.json({
        success: true,
        ...filteredData,
        cached: true,
        cacheExpired: true,
        errorFallback: true,
        message: 'Returning cached data due to API error. Data will refresh automatically.'
      });
    }

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
 * Falls back to cached organizations if live API hits rate limits
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

    // Try to get organizations from live API first
    let organizations = [];
    let fromCache = false;
    let rateLimited = false;

    try {
      organizations = await linkedinMetricsServiceV2.getOrganizations(email);
    } catch (apiError) {
      console.warn('⚠️ Live API call failed, checking cache...', apiError.message);
      rateLimited = apiError.response?.status === 429;
    }

    // If live API returned empty or failed, fallback to cached organizations
    if (!organizations || organizations.length === 0) {
      console.log('📦 Falling back to cached organizations...');
      organizations = await socialMediaCacheService.getCachedOrganizations(email);
      fromCache = organizations.length > 0;
    }

    res.json({
      success: true,
      organizations,
      cached: fromCache,
      rateLimited: rateLimited && fromCache
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
