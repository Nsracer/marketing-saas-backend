import express from 'express';
import competitorIntelligenceService from '../services/competitorIntelligenceService.js';
import openaiService from '../services/openaiService.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { validateCompetitorLimit, incrementUsage } from '../middleware/tierValidation.js';

dotenv.config();

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Rate limiting for competitor analysis (very resource intensive)
const analysisRateLimitMap = new Map();
const ANALYSIS_RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes
const MAX_ANALYSIS_PER_WINDOW = 3; // Max 3 analyses per 5 minutes per user

// Smart duplicate prevention - allows retries after 5 minutes or on error
const activeAnalysis = new Map(); // Track in-flight analyses with timestamps

const checkAnalysisRateLimit = (email) => {
  const now = Date.now();
  const userRequests = analysisRateLimitMap.get(email) || [];

  const recentRequests = userRequests.filter(time => now - time < ANALYSIS_RATE_LIMIT_WINDOW);

  if (recentRequests.length >= MAX_ANALYSIS_PER_WINDOW) {
    return false;
  }

  recentRequests.push(now);
  analysisRateLimitMap.set(email, recentRequests);
  return true;
};

// Clean up every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [email, requests] of analysisRateLimitMap.entries()) {
    const recentRequests = requests.filter(time => now - time < ANALYSIS_RATE_LIMIT_WINDOW);
    if (recentRequests.length === 0) {
      analysisRateLimitMap.delete(email);
    }
  }
}, 10 * 60 * 1000);

/**
 * Comprehensive competitor analysis - ROBUST & FAST VERSION
 * POST /api/competitor/analyze
 * Body: { email, yourSite, competitorSite, competitorInstagram, competitorFacebook, forceRefresh }
 * 
 * Optimizations & Improvements:
 * - ✅ Graceful degradation: Returns partial results if some services fail
 * - ✅ Parallel processing: Non-Chrome services run concurrently
 * - ✅ Smart timeouts: 45s for Facebook, 60s for Instagram, 90s for Lighthouse
 * - ✅ Non-blocking scrapers: Social media failures don't crash entire analysis
 * - ✅ Comprehensive error handling: Each service wrapped in try-catch
 * - ✅ No duplicate check: Allows retries if previous analysis failed
 * - ✅ Rate limiting: 3 analyses per 5 minutes (prevents abuse but allows retries)
 * - ✅ Cache-first approach: Uses cached data when available for speed
 */
router.post('/analyze', validateCompetitorLimit, async (req, res) => {
  try {
    const {
      email,
      yourSite,
      competitorSite,
      competitorInstagram,
      competitorFacebook,
      facebookCompetitorData,
      forceRefresh = false,
      refreshSection = null  // 'seo' | 'technical' | 'content' | 'social' | null (null = full refresh)
    } = req.body;

    if (!email || !yourSite || !competitorSite) {
      return res.status(400).json({
        success: false,
        error: 'email, yourSite, and competitorSite are required'
      });
    }

    // Smart duplicate check - allow retry if >5 min old or if force refresh
    const analysisKey = `${email}:${yourSite}:${competitorSite}`;
    const existingAnalysis = activeAnalysis.get(analysisKey);

    if (existingAnalysis && !forceRefresh) {
      const ageMs = Date.now() - existingAnalysis;
      const ageMinutes = Math.floor(ageMs / 60000);

      // Allow retry after 5 minutes (analysis might have failed)
      if (ageMs < 300000) { // 5 minutes
        console.log(`⚠️ Duplicate request - analysis in progress (${ageMinutes} min old)`);
        return res.status(409).json({
          success: false,
          error: 'ANALYSIS_IN_PROGRESS',
          message: `Analysis already running. Started ${ageMinutes} minute(s) ago. Please wait or try force refresh in ${5 - ageMinutes} minutes.`,
          retryAfter: 300 - Math.floor(ageMs / 1000)
        });
      } else {
        console.log(`🔄 Previous analysis stale (${ageMinutes} min) - allowing retry`);
        activeAnalysis.delete(analysisKey);
      }
    }

    // Mark analysis as active
    activeAnalysis.set(analysisKey, Date.now());

    // Check rate limit (unless forceRefresh is explicitly requested)
    if (!forceRefresh && !checkAnalysisRateLimit(email)) {
      activeAnalysis.delete(analysisKey); // Clean up on rate limit
      console.log(`⚠️ Rate limit exceeded for user: ${email}`);
      return res.status(429).json({
        success: false,
        error: 'Too many analysis requests',
        message: 'Please wait 5 minutes before running another competitor analysis',
        retryAfter: 300
      });
    }

    console.log(`🔍 Analyzing competitor: ${competitorSite} for ${email}`);

    // STEP 1: Validate GA/GSC connection (required for domain data)
    console.log('🔐 Step 1: Validating GA/GSC connection...');
    const oauthTokenService = (await import('../services/oauthTokenService.js')).default;
    const gaConnected = await oauthTokenService.isConnected(email, 'google');

    if (!gaConnected) {
      return res.status(400).json({
        success: false,
        error: 'GA_NOT_CONNECTED',
        message: 'Please connect Google Analytics and Google Search Console first',
        requiredConnections: {
          ga_gsc: false,
          facebook: null,
          instagram: null,
          linkedin: null
        }
      });
    }
    console.log('✅ GA/GSC connected');

    // STEP 2: Check social media connections and fetch/cache if needed
    console.log('📦 Step 2: Checking social media connections...');
    const socialMediaCacheService = (await import('../services/socialMediaCacheService.js')).default;

    // Check which platforms are connected
    const [fbConnected, igConnected, liConnected] = await Promise.all([
      oauthTokenService.isConnected(email, 'facebook'),
      oauthTokenService.isConnected(email, 'instagram'),
      oauthTokenService.isConnected(email, 'linkedin')
    ]);

    console.log('🔗 Social connections:', {
      facebook: !!fbConnected,
      instagram: !!igConnected,
      linkedin: !!liConnected
    });

    // Social media is OPTIONAL - analysis will work with whatever is connected
    const connectedPlatforms = [];
    const missingPlatforms = [];

    if (fbConnected) connectedPlatforms.push('Facebook');
    else missingPlatforms.push('Facebook');

    if (igConnected) connectedPlatforms.push('Instagram');
    else missingPlatforms.push('Instagram');

    if (liConnected) connectedPlatforms.push('LinkedIn');
    else missingPlatforms.push('LinkedIn');

    if (connectedPlatforms.length === 0) {
      console.log('⚠️ No social media connected - analysis will proceed without social data');
    } else {
      console.log(`✅ Connected platforms: ${connectedPlatforms.join(', ')}`);
      if (missingPlatforms.length > 0) {
        console.log(`ℹ️ Not connected: ${missingPlatforms.join(', ')} - will be skipped`);
      }
    }

    // Try to get cached data - CACHE ONLY, NO RE-FETCHING
    // User should refresh their social data from Social Dashboard if needed
    // We allow expired cache (ignoreExpiration=true) because it's better to show old data than nothing
    let [fbCache, igCache, liCache] = await Promise.all([
      fbConnected ? socialMediaCacheService.getCachedMetrics(email, 'facebook', 'month', true) : null,
      igConnected ? socialMediaCacheService.getCachedMetrics(email, 'instagram', 'month', true) : null,
      liConnected ? socialMediaCacheService.getCachedMetrics(email, 'linkedin', 'month', true) : null
    ]);

    // Log available social media data (no re-fetching)
    const availablePlatforms = [];
    const expiredPlatforms = [];

    if (fbCache && fbCache.dataAvailable) {
      availablePlatforms.push(`Facebook (${fbCache.cacheAge}m old)`);
    } else if (fbConnected) {
      expiredPlatforms.push('Facebook');
    }

    if (igCache && igCache.dataAvailable) {
      availablePlatforms.push(`Instagram (${igCache.cacheAge}m old)`);
    } else if (igConnected) {
      expiredPlatforms.push('Instagram');
    }

    if (liCache && liCache.dataAvailable) {
      availablePlatforms.push(`LinkedIn (${liCache.cacheAge}m old)`);
    } else if (liConnected) {
      expiredPlatforms.push('LinkedIn');
    }

    if (availablePlatforms.length > 0) {
      console.log(`✅ Social media data ready: ${availablePlatforms.join(', ')}`);
    } else {
      console.log('ℹ️ No social media data available - analysis will proceed without social metrics');
    }

    if (expiredPlatforms.length > 0) {
      console.log(`ℹ️ Expired/missing cache for: ${expiredPlatforms.join(', ')} - refresh from Social Dashboard first`);
    }

    // Get user ID from email
    const { data: userData } = await supabase
      .from('users_table')
      .select('id')
      .eq('email', email)
      .single();

    if (!userData) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const userId = userData.id;

    // Get user's social media handles from cache (account_name from social_media_cache)
    const userInstagram = igCache?.username || igCache?.companyName || null;
    const userFacebook = fbCache?.pageName || fbCache?.companyName || null;
    const userLinkedIn = liCache?.companyName || null;

    // Get competitor's social media handles from request or business info
    let compInstagram = competitorInstagram || null;
    let compFacebook = competitorFacebook || null;
    let compLinkedIn = null;

    // Try to get competitor LinkedIn from business info
    try {
      const businessInfoResponse = await fetch(`${process.env.BACKEND_URL || 'https://saas-wets.onrender.com'}/api/business-info?email=${encodeURIComponent(email)}`);
      if (businessInfoResponse.ok) {
        const businessData = await businessInfoResponse.json();
        if (businessData.success && businessData.data?.competitors) {
          const competitor = businessData.data.competitors.find(c => c.domain === competitorSite);
          if (competitor) {
            compInstagram = compInstagram || competitor.instagram || null;
            compFacebook = compFacebook || competitor.facebook || null;
            compLinkedIn = competitor.linkedin || null;
          }
        }
      }
    } catch (err) {
      console.log('⚠️ Could not fetch competitor handles from business info');
    }

    console.log('📱 Social handles for cache check:');
    console.log('   User:', { instagram: userInstagram, facebook: userFacebook, linkedin: userLinkedIn });
    console.log('   Competitor:', { instagram: compInstagram, facebook: compFacebook, linkedin: compLinkedIn });

    // Check cache first (unless forceRefresh is true)
    // Valid cache = domains match + ALL social handles match
    if (!forceRefresh) {
      const { data: cachedData } = await supabase
        .from('competitor_cache')
        .select('*')
        .eq('user_id', userId)
        .eq('user_domain', yourSite)
        .eq('competitor_domain', competitorSite)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (cachedData) {
        // Check if ALL social media handles match
        const cachedUserInstagram = cachedData.user_instagram_handle || null;
        const cachedUserFacebook = cachedData.user_facebook_handle || null;
        const cachedUserLinkedIn = cachedData.user_linkedin_handle || null;
        const cachedCompInstagram = cachedData.competitor_instagram_handle || null;
        const cachedCompFacebook = cachedData.competitor_facebook_handle || null;
        const cachedCompLinkedIn = cachedData.competitor_linkedin_handle || null;

        // Normalize handles for comparison (remove @ and lowercase)
        const normalize = (handle) => handle ? handle.replace('@', '').toLowerCase() : null;

        const userHandlesMatch =
          normalize(cachedUserInstagram) === normalize(userInstagram) &&
          normalize(cachedUserFacebook) === normalize(userFacebook) &&
          normalize(cachedUserLinkedIn) === normalize(userLinkedIn);

        const compHandlesMatch =
          normalize(cachedCompInstagram) === normalize(compInstagram) &&
          normalize(cachedCompFacebook) === normalize(compFacebook) &&
          normalize(cachedCompLinkedIn) === normalize(compLinkedIn);

        if (userHandlesMatch && compHandlesMatch) {
          console.log(`✅ Cache HIT - Domains and ALL social handles match`);
          const cachedResult = cachedData.full_result || cachedData;

          // Ensure cached data has the correct structure
          if (!cachedResult.yourSite || !cachedResult.competitorSite || !cachedResult.comparison) {
            console.log('⚠️ Cached data has old structure, will fetch fresh data');
          } else {
            return res.json({
              success: true,
              cached: true,
              data: cachedResult,
              cachedAt: cachedData.created_at,
              cacheAge: Math.round((Date.now() - new Date(cachedData.created_at).getTime()) / (1000 * 60 * 60))
            });
          }
        } else {
          console.log(`❌ Cache MISS - Social media handles changed`);
          if (!userHandlesMatch) {
            console.log(`   User handles changed:`);
            console.log(`      IG: ${cachedUserInstagram} → ${userInstagram}`);
            console.log(`      FB: ${cachedUserFacebook} → ${userFacebook}`);
            console.log(`      LI: ${cachedUserLinkedIn} → ${userLinkedIn}`);
          }
          if (!compHandlesMatch) {
            console.log(`   Competitor handles changed:`);
            console.log(`      IG: ${cachedCompInstagram} → ${compInstagram}`);
            console.log(`      FB: ${cachedCompFacebook} → ${compFacebook}`);
            console.log(`      LI: ${cachedCompLinkedIn} → ${compLinkedIn}`);
          }
        }
      } else {
        console.log(`❌ Cache MISS - No cached data found or expired`);
      }
    } else {
      console.log(`🔄 Force refresh requested - skipping cache`);
    }

    // PER-SECTION REFRESH: Only refresh specific section if requested
    if (refreshSection) {
      console.log(`🔍 [DEBUG] refreshSection received: "${refreshSection}"`);
      console.log(`🔍 [DEBUG] Valid sections: seo, technical, content, social`);

      // Get cached data first to use as base (ignore expiration for base data)
      const { data: cachedData, error: cacheError } = await supabase
        .from('competitor_cache')
        .select('*')
        .eq('user_id', userId)
        .eq('user_domain', yourSite)
        .eq('competitor_domain', competitorSite)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (cacheError) {
        console.log(`⚠️ [DEBUG] Cache query error: ${cacheError.message}`);
      }

      if (cachedData && cachedData.full_result) {
        console.log(`🔄 Per-section refresh: Only refreshing ${refreshSection.toUpperCase()}`);
        console.log(`✅ [DEBUG] Found cached data to update`);
        let result = cachedData.full_result;

        // Only refresh the requested section
        if (refreshSection === 'social') {
          // Refresh competitor social media only
          console.log(`📸 Refreshing competitor social media only...`);
          const [compFacebookResult, compInstagramResult] = await Promise.allSettled([
            (async () => {
              const compFbHandle = competitorFacebook || compFacebook;
              if (!compFbHandle) return null;
              const facebookScraperService = (await import('../services/facebookScraperService.js')).default;
              // Force refresh for the specific section
              const fbMetrics = await facebookScraperService.getFacebookMetrics(compFbHandle);
              if (fbMetrics && fbMetrics.followers) {
                return {
                  success: true,
                  platform: 'facebook',
                  data: { name: fbMetrics.pageName, url: fbMetrics.url, followers: fbMetrics.followers },
                  profile: { name: fbMetrics.pageName, avgEngagementRate: fbMetrics.engagementRate || 0 },
                  metrics: { followers: fbMetrics.followers, avgLikes: fbMetrics.avgLikes || 0, avgComments: fbMetrics.avgComments || 0, avgShares: fbMetrics.avgShares || 0, avgInteractions: fbMetrics.avgInteractions || 0, engagementRate: fbMetrics.engagementRate || 0, postsAnalyzed: fbMetrics.postsCount || 0 }
                };
              }
              return null;
            })(),
            (async () => {
              const compIgHandle = competitorInstagram || compInstagram;
              if (!compIgHandle) return null;
              const instagramScraperService = (await import('../services/instagramScraperService.js')).default;
              // Force refresh for the specific section
              const igMetrics = await instagramScraperService.getInstagramMetrics(compIgHandle);
              if (igMetrics && igMetrics.followers) {
                return {
                  success: true,
                  profile: { username: igMetrics.username, followers: igMetrics.followers, avgInteractions: igMetrics.avgInteractions, avgEngagementRate: igMetrics.engagementRate },
                  metrics: { followers: igMetrics.followers, avgLikes: igMetrics.avgLikes, avgComments: igMetrics.avgComments, avgInteractions: igMetrics.avgInteractions, engagementRate: igMetrics.engagementRate },
                  engagement: { avgLikes: igMetrics.avgLikes, avgComments: igMetrics.avgComments, avgEngagement: igMetrics.avgInteractions, engagementRate: igMetrics.engagementRate }
                };
              }
              return null;
            })()
          ]);

          // Update only social data in result
          if (compFacebookResult.status === 'fulfilled' && compFacebookResult.value) {
            result.competitorSite.facebook = compFacebookResult.value;
          }
          if (compInstagramResult.status === 'fulfilled' && compInstagramResult.value) {
            result.competitorSite.instagram = compInstagramResult.value;
          }

          // Update user social data from fresh cache (try to get latest even if we didn't fetch it above)
          // We re-fetch these to ensure we have the latest user data to pair with new competitor data
          const [freshFbCache, freshIgCache] = await Promise.all([
            socialMediaCacheService.getCachedMetrics(email, 'facebook', 'month', true),
            socialMediaCacheService.getCachedMetrics(email, 'instagram', 'month', true)
          ]);

          if (freshFbCache && freshFbCache.dataAvailable) {
            result.yourSite.facebook = {
              metrics: {
                followers: freshFbCache.currentFollowers || freshFbCache.companyFollowers || 0,
                avgLikes: freshFbCache.metrics?.avgLikes || 0,
                avgComments: freshFbCache.metrics?.avgComments || 0,
                avgShares: freshFbCache.metrics?.avgShares || 0,
                avgInteractions: freshFbCache.metrics?.avgInteractions || 0,
                engagementRate: freshFbCache.metrics?.engagementRate || freshFbCache.engagementScore?.engagementRate || 0
              },
              cached: true, source: 'oauth'
            };
          }
          if (freshIgCache && freshIgCache.dataAvailable) {
            // Use the structure expected by CompetitorResults.tsx
            const engagementRate = freshIgCache.metrics?.engagementRate || freshIgCache.engagementScore?.engagementRate || 0;
            result.yourSite.instagram = {
              profile: {
                username: freshIgCache.companyName,
                followers: freshIgCache.companyFollowers || 0,
                avgInteractions: freshIgCache.metrics?.avgInteractions || 0,
                avgEngagementRate: engagementRate
              },
              metrics: {
                followers: freshIgCache.companyFollowers || 0,
                avgLikes: freshIgCache.metrics?.avgLikes || 0,
                avgComments: freshIgCache.metrics?.avgComments || 0,
                avgInteractions: freshIgCache.metrics?.avgInteractions || 0,
                engagementRate: engagementRate
              },
              engagement: {
                summary: {
                  avgLikesPerPost: freshIgCache.metrics?.avgLikes || 0,
                  avgCommentsPerPost: freshIgCache.metrics?.avgComments || 0,
                  engagementRate: `${engagementRate.toFixed(2)}%`
                }
              },
              cached: true, source: 'oauth'
            };
          }

          console.log(`✅ Social media refresh complete`);

          // Update cache with new data
          await supabase
            .from('competitor_cache')
            .update({
              full_result: result,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .eq('user_domain', yourSite)
            .eq('competitor_domain', competitorSite);

          // Clear active analysis lock
          activeAnalysis.delete(analysisKey);

          return res.json({
            success: true,
            cached: false,
            partialRefresh: refreshSection,
            yourSite: result.yourSite,
            competitorSite: result.competitorSite,
            comparison: result.comparison
          });
        }
        // SEO SECTION REFRESH: Lighthouse + PageSpeed + Backlinks
        if (refreshSection === 'seo') {
          console.log(`🔍 Refreshing SEO data only (Lighthouse, PageSpeed, Backlinks)...`);

          const seoCacheService = (await import('../services/seoCacheService.js')).default;
          const competitorLighthouseService = (await import('../services/competitorLighthouseService.js')).default;
          const pagespeedService = (await import('../services/pagespeedService.js')).default;
          const seRankingService = (await import('../services/seRankingService.js')).default;

          // TRY TO USE CACHED USER SEO DATA FROM SEO DASHBOARD
          console.log(`   📦 Checking for cached user SEO data...`);
          const cachedUserSEO = await seoCacheService.getSearchConsoleCache(email, true); // ignoreExpiry=true for fallback

          let yourLighthouse, yourPagespeed, yourBacklinks;

          if (cachedUserSEO && (cachedUserSEO.lighthouse || cachedUserSEO.pagespeed)) {
            console.log(`   ✅ Using cached user SEO data from SEO Dashboard`);
            yourLighthouse = { status: 'fulfilled', value: cachedUserSEO.lighthouse };
            yourPagespeed = { status: 'fulfilled', value: cachedUserSEO.pagespeed };
            yourBacklinks = cachedUserSEO.backlinks
              ? { status: 'fulfilled', value: { available: true, ...cachedUserSEO.backlinks } }
              : { status: 'rejected' };
          } else {
            console.log(`   ⚠️ No cached user data, fetching fresh...`);
            [yourLighthouse, yourPagespeed, yourBacklinks] = await Promise.allSettled([
              competitorLighthouseService.analyzeViaPageSpeedAPI(yourSite),
              pagespeedService.getPageSpeedData(yourSite),
              seRankingService.getBacklinksSummary(yourSite)
            ]);
          }

          // Always fetch fresh competitor data
          console.log(`   🔄 Fetching fresh competitor SEO data...`);
          const [compLighthouse, compPagespeed, compBacklinks] = await Promise.allSettled([
            competitorLighthouseService.analyzeViaPageSpeedAPI(competitorSite),
            pagespeedService.getPageSpeedData(competitorSite),
            seRankingService.getBacklinksSummary(competitorSite)
          ]);

          // Update yourSite SEO data
          if (yourLighthouse.status === 'fulfilled' && yourLighthouse.value?.dataAvailable) {
            result.yourSite.lighthouse = yourLighthouse.value;
          }
          if (yourPagespeed.status === 'fulfilled' && yourPagespeed.value?.dataAvailable) {
            result.yourSite.pagespeed = yourPagespeed.value;
          }
          if (yourBacklinks.status === 'fulfilled' && yourBacklinks.value?.available) {
            result.yourSite.backlinks = yourBacklinks.value;
          }

          // Update competitorSite SEO data
          if (compLighthouse.status === 'fulfilled' && compLighthouse.value?.dataAvailable) {
            result.competitorSite.lighthouse = compLighthouse.value;
          }
          if (compPagespeed.status === 'fulfilled' && compPagespeed.value?.dataAvailable) {
            result.competitorSite.pagespeed = compPagespeed.value;
          }
          if (compBacklinks.status === 'fulfilled' && compBacklinks.value?.available) {
            result.competitorSite.backlinks = compBacklinks.value;
          }

          console.log(`✅ SEO data refresh complete`);

          // Regenerate comparison with updated data to recalculate market share
          const competitorService = (await import('../services/competitorService.js')).default;
          result.comparison = competitorService.generateComparison(result.yourSite, result.competitorSite);

          // Update cache with new data
          await supabase
            .from('competitor_cache')
            .update({
              full_result: result,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .eq('user_domain', yourSite)
            .eq('competitor_domain', competitorSite);

          // Clear active analysis lock
          activeAnalysis.delete(analysisKey);

          console.log(`✅ [DEBUG] SEO section refresh COMPLETE - returning response now (NO social media fetched)`);
          return res.json({
            success: true,
            cached: false,
            partialRefresh: refreshSection,
            yourSite: result.yourSite,
            competitorSite: result.competitorSite,
            comparison: result.comparison
          });
        }

        // TECHNICAL SECTION REFRESH: robots.txt, sitemap, SSL, meta tags
        if (refreshSection === 'technical') {
          console.log(`⚙️ Refreshing Technical SEO data only (robots.txt, sitemap, SSL, meta tags)...`);

          const seoCacheService = (await import('../services/seoCacheService.js')).default;
          const technicalSEOService = (await import('../services/technicalSEOService.js')).default;

          // TRY TO USE CACHED USER TECHNICAL SEO DATA FROM SEO DASHBOARD
          console.log(`   📦 Checking for cached user technical SEO data...`);
          const cachedUserSEO = await seoCacheService.getSearchConsoleCache(email, true);

          let yourTechnicalSEO;

          if (cachedUserSEO && cachedUserSEO.technicalSEO) {
            console.log(`   ✅ Using cached user technical SEO data from SEO Dashboard`);
            yourTechnicalSEO = { status: 'fulfilled', value: { dataAvailable: true, ...cachedUserSEO.technicalSEO } };
          } else {
            console.log(`   ⚠️ No cached user data, fetching fresh...`);
            [yourTechnicalSEO] = await Promise.allSettled([
              technicalSEOService.getTechnicalSEOData(yourSite)
            ]);
          }

          // Always fetch fresh competitor data
          console.log(`   🔄 Fetching fresh competitor technical SEO data...`);
          const [compTechnicalSEO] = await Promise.allSettled([
            technicalSEOService.getTechnicalSEOData(competitorSite)
          ]);

          // Update yourSite technical data
          if (yourTechnicalSEO.status === 'fulfilled' && yourTechnicalSEO.value?.dataAvailable) {
            result.yourSite.technicalSEO = yourTechnicalSEO.value;
          }

          // Update competitorSite technical data
          if (compTechnicalSEO.status === 'fulfilled' && compTechnicalSEO.value?.dataAvailable) {
            result.competitorSite.technicalSEO = compTechnicalSEO.value;
          }

          console.log(`✅ Technical SEO data refresh complete`);

          // Regenerate comparison with updated data
          const competitorService = (await import('../services/competitorService.js')).default;
          result.comparison = competitorService.generateComparison(result.yourSite, result.competitorSite);

          // Update cache with new data
          await supabase
            .from('competitor_cache')
            .update({
              full_result: result,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .eq('user_domain', yourSite)
            .eq('competitor_domain', competitorSite);

          // Clear active analysis lock
          activeAnalysis.delete(analysisKey);

          console.log(`✅ [DEBUG] TECHNICAL section refresh COMPLETE - returning response now (NO social media fetched)`);
          return res.json({
            success: true,
            cached: false,
            partialRefresh: refreshSection,
            yourSite: result.yourSite,
            competitorSite: result.competitorSite,
            comparison: result.comparison
          });
        }

        // CONTENT SECTION REFRESH: RSS feeds, sitemap updates
        if (refreshSection === 'content') {
          console.log(`📝 Refreshing Content data only (RSS feeds, sitemap updates)...`);

          const contentUpdatesService = (await import('../services/contentUpdatesService.js')).default;

          // Refresh content data for both sites in parallel
          const [yourContent, compContent] = await Promise.allSettled([
            contentUpdatesService.getContentUpdates(yourSite),
            contentUpdatesService.getContentUpdates(competitorSite)
          ]);

          // Update yourSite content data
          if (yourContent.status === 'fulfilled' && yourContent.value) {
            result.yourSite.contentUpdates = yourContent.value;
          }

          // Update competitorSite content data
          if (compContent.status === 'fulfilled' && compContent.value) {
            result.competitorSite.contentUpdates = compContent.value;
          }

          console.log(`✅ Content data refresh complete`);

          // Regenerate comparison with updated data
          const competitorService = (await import('../services/competitorService.js')).default;
          result.comparison = competitorService.generateComparison(result.yourSite, result.competitorSite);

          // Update cache with new data
          await supabase
            .from('competitor_cache')
            .update({
              full_result: result,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .eq('user_domain', yourSite)
            .eq('competitor_domain', competitorSite);

          // Clear active analysis lock
          activeAnalysis.delete(analysisKey);

          console.log(`✅ [DEBUG] CONTENT section refresh COMPLETE - returning response now (NO social media fetched)`);
          return res.json({
            success: true,
            cached: false,
            partialRefresh: refreshSection,
            yourSite: result.yourSite,
            competitorSite: result.competitorSite,
            comparison: result.comparison
          });
        }
      } else {
        console.log(`⚠️ No cached data available to update - falling back to full analysis`);
      }
    }

    // If not cached or forceRefresh, run COMPLETE analysis
    if (refreshSection) {
      console.log(`⚠️ [DEBUG] refreshSection was "${refreshSection}" but falling through to full analysis!`);
      console.log(`⚠️ [DEBUG] This should NOT happen if section handlers worked correctly.`);
    }
    console.log(`📊 Running COMPLETE competitor analysis for ${competitorSite}`);
    console.log(`🚀 ULTRA-PARALLEL MODE: Starting ALL tasks simultaneously...`);

    // Import the comprehensive competitor service
    const competitorService = (await import('../services/competitorService.js')).default;

    // 🚀 PHASE 1: START ALL TASKS IN PARALLEL (no waiting!)
    const parallelStartTime = Date.now();

    // Get competitor social handles
    let compFbHandle = competitorFacebook || compFacebook;
    let compIgHandle = competitorInstagram || compInstagram;
    let compLiHandle = compLinkedIn;

    console.log(`   🎯 Task 1: Main analysis (YOUR site + COMPETITOR comparison)`);
    console.log(`   🎯 Task 2: Competitor Facebook scraper (@${compFbHandle || 'none'})`);
    console.log(`   🎯 Task 3: Competitor Instagram scraper (@${compIgHandle || 'none'})`);
    console.log(`   🎯 Task 4: Competitor LinkedIn scraper (${compLiHandle || 'none'})`);

    const [
      analysisResult,
      compFacebookResult,
      compInstagramResult,
      compLinkedInResult
    ] = await Promise.allSettled([
      // Task 1: Main competitor analysis (includes YOUR site + competitor Puppeteer/Lighthouse/APIs)
      competitorService.compareWebsites(yourSite, competitorSite, email),

      // Task 2: Competitor Facebook (parallel with main analysis)
      (async () => {
        if (!compFbHandle && !facebookCompetitorData) return null;

        try {
          if (facebookCompetitorData) {
            return {
              success: true,
              platform: 'facebook',
              data: {
                name: facebookCompetitorData.name,
                url: facebookCompetitorData.url,
                likes: facebookCompetitorData.likes,
                followers: facebookCompetitorData.followers
              }
            };
          }

          console.log(`📘 Starting Facebook scraper for: ${compFbHandle}`);
          const facebookScraperService = (await import('../services/facebookScraperService.js')).default;
          const fbMetrics = await Promise.race([
            facebookScraperService.getFacebookMetrics(compFbHandle),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 90000))
          ]);

          if (fbMetrics && fbMetrics.followers) {
            return {
              success: true,
              platform: 'facebook',
              data: {
                name: fbMetrics.pageName,
                url: fbMetrics.url,
                followers: fbMetrics.followers
              },
              profile: {
                name: fbMetrics.pageName,
                avgEngagementRate: fbMetrics.engagementRate || 0  // For frontend compatibility
              },
              metrics: {
                followers: fbMetrics.followers,
                avgLikes: fbMetrics.avgLikes || 0,
                avgComments: fbMetrics.avgComments || 0,
                avgShares: fbMetrics.avgShares || 0,
                avgInteractions: fbMetrics.avgInteractions || 0,
                engagementRate: fbMetrics.engagementRate || 0,
                postsAnalyzed: fbMetrics.postsCount || 0
              }
            };
          }
          return { success: false, error: 'No data available' };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })(),

      // Task 3: Competitor Instagram (parallel with main analysis)
      (async () => {
        if (!compIgHandle) return null;

        try {
          console.log(`📸 Starting Instagram scraper for: @${compIgHandle}`);
          const instagramScraperService = (await import('../services/instagramScraperService.js')).default;
          const igMetrics = await Promise.race([
            instagramScraperService.getInstagramMetrics(compIgHandle),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 60000))
          ]);

          if (igMetrics && igMetrics.followers) {
            // engagementRate from scraper is already a percentage (e.g., 3.10 means 3.10%)
            // DO NOT divide by 100 again!
            return {
              success: true,
              profile: {
                username: igMetrics.username,
                followers: igMetrics.followers,
                avgInteractions: igMetrics.avgInteractions,
                avgEngagementRate: igMetrics.engagementRate  // Already a percentage!
              },
              metrics: {
                followers: igMetrics.followers,
                avgLikes: igMetrics.avgLikes,
                avgComments: igMetrics.avgComments,
                avgInteractions: igMetrics.avgInteractions,
                engagementRate: igMetrics.engagementRate  // Already a percentage!
              },
              engagement: {
                avgLikes: igMetrics.avgLikes,
                avgComments: igMetrics.avgComments,
                avgEngagement: igMetrics.avgInteractions,
                engagementRate: igMetrics.engagementRate  // Already a percentage!
              }
            };
          }
          return { success: false, error: 'No data available' };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })(),

      // Task 4: Competitor LinkedIn (parallel with main analysis)
      (async () => {
        if (!compLiHandle) return null;

        try {
          console.log(`💼 Starting LinkedIn scraper for: ${compLiHandle}`);
          const linkedinScraperService = (await import('../services/linkedinScraperService.js')).default;
          const linkedInUrl = compLiHandle.startsWith('http')
            ? compLiHandle
            : `https://www.linkedin.com/company/${compLiHandle}`;

          const liData = await Promise.race([
            linkedinScraperService.scrapeCompanyPosts(linkedInUrl, 20),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 90000))
          ]);

          return liData.dataAvailable ? liData : { dataAvailable: false, error: 'No data available' };
        } catch (error) {
          return { dataAvailable: false, error: error.message };
        }
      })()
    ]);

    console.log(`⚡ ALL PARALLEL TASKS COMPLETE (${Date.now() - parallelStartTime}ms)`);
    console.log(`   ✅ Main Analysis: ${analysisResult.status}`);
    console.log(`   ✅ Facebook: ${compFacebookResult.status}`);
    console.log(`   ✅ Instagram: ${compInstagramResult.status}`);
    console.log(`   ✅ LinkedIn: ${compLinkedInResult.status}`);

    // GRACEFUL DEGRADATION: Always return partial data - NEVER block on failed metrics
    let result;
    let partialFailure = false;
    let failedMetrics = [];

    if (analysisResult.status === 'rejected' || (analysisResult.status === 'fulfilled' && !analysisResult.value.success)) {
      const error = analysisResult.status === 'rejected' ? analysisResult.reason : analysisResult.value.error;
      console.warn('⚠️ Main analysis had failures:', error);
      partialFailure = true;

      const analysisData = analysisResult.status === 'fulfilled' ? analysisResult.value : {};

      // Check if we have ANY data at all
      if (!analysisData.yourSite && !analysisData.competitorSite) {
        // Complete failure - absolutely no data
        console.error('❌ Complete failure - no data from either site');
        return res.status(500).json({
          success: false,
          error: 'ANALYSIS_FAILED',
          message: `Competitor analysis completely failed: ${error}`,
          details: error
        });
      }

      console.log('✅ Partial data available - continuing with what we have...');
      failedMetrics = analysisData.failedMetrics || [];
    }

    // Extract the result structure (include partial/failed data)
    const mainAnalysis = analysisResult.status === 'fulfilled' ? analysisResult.value : {};
    result = {
      yourSite: mainAnalysis.yourSite || {},
      competitorSite: mainAnalysis.competitorSite || {},
      comparison: mainAnalysis.comparison || {},
      timestamp: mainAnalysis.timestamp,
      partialFailure: partialFailure,
      failedMetrics: failedMetrics.length > 0 ? failedMetrics : undefined
    };

    // Fetch user's Facebook data - Use CACHED OAuth data ONLY (no scrapers)
    if (fbCache && fbCache.dataAvailable) {
      console.log(`✅ Using Facebook OAuth cache (no scraper for user's site)`);

      const engScore = fbCache.engagementScore || {};
      const metrics = fbCache.metrics || {};

      result.yourSite.facebook = {
        metrics: {
          followers: fbCache.currentFollowers || fbCache.companyFollowers || 0,
          avgLikes: metrics.avgLikes || engScore.avgLikes || 0,
          avgComments: metrics.avgComments || engScore.avgComments || 0,
          avgShares: metrics.avgShares || engScore.avgShares || 0,
          avgInteractions: metrics.avgInteractions || engScore.avgInteractions || 0,
          engagementRate: metrics.engagementRate || engScore.engagementRate || 0
        },
        cached: true,
        source: 'oauth'
      };
      console.log(`   📊 FB OAuth: ${fbCache.currentFollowers || fbCache.companyFollowers} followers (cached)`);
    }

    // Fetch user's Instagram data - Use CACHED OAuth data ONLY (no scrapers)
    if (igCache && igCache.dataAvailable) {
      console.log(`✅ Using Instagram OAuth cache (no scraper for user's site)`);

      // Handle Instagram V2 structure (cumulative totals) vs Standard
      const engData = igCache.engagement_data || igCache.engagementScore || {};
      const postsCount = engData.postsInPeriod || igCache.topPosts?.length || 1;

      // Calculate averages
      const totalLikes = engData.likes || 0;
      const totalComments = engData.comments || 0;
      const totalEngagement = engData.totalEngagement || (totalLikes + totalComments);

      const avgLikes = Math.round(totalLikes / postsCount);
      const avgComments = Math.round(totalComments / postsCount);
      const avgInteractions = Math.round(totalEngagement / postsCount);

      // Engagement Rate: Check if it's already a percentage (e.g. 3.5) or decimal (0.035)
      // Social Dashboard usually stores it as percentage (e.g. 3.5)
      // We should pass it as is, and let frontend handle formatting
      const engagementRate = igCache.metrics?.engagementRate || engData.engagementRate || 0;

      result.yourSite.instagram = {
        profile: {
          username: igCache.companyName,
          followers: igCache.companyFollowers || 0,
          avgInteractions: igCache.metrics?.avgInteractions || avgInteractions,
          avgEngagementRate: engagementRate // Pass as is (percentage)
        },
        metrics: {
          followers: igCache.companyFollowers || 0,
          avgLikes: igCache.metrics?.avgLikes || avgLikes,
          avgComments: igCache.metrics?.avgComments || avgComments,
          avgInteractions: igCache.metrics?.avgInteractions || avgInteractions,
          engagementRate: engagementRate // Pass as is (percentage)
        },
        engagement: {
          summary: {
            avgLikesPerPost: igCache.metrics?.avgLikes || avgLikes,
            avgCommentsPerPost: igCache.metrics?.avgComments || avgComments,
            engagementRate: `${engagementRate.toFixed(2)}%`
          }
        },
        cached: true,
        source: 'oauth'
      };
      console.log(`   📊 IG OAuth: ${igCache.companyFollowers} followers, ${engagementRate}% ER (cached)`);
    }


    // Fetch user's LinkedIn data from CACHE ONLY - Display ALL metrics
    if (liCache && liCache.dataAvailable) {
      console.log(`✅ Using cached LinkedIn data (${liCache.cacheAge} min old)`);
      result.yourSite.linkedin = {
        dataAvailable: true,
        companyName: liCache.companyName,
        companyUrl: liCache.companyUrl,
        companyFollowers: liCache.companyFollowers,
        metrics: liCache.metrics || {
          avgLikes: 0,
          avgComments: 0,
          avgShares: 0,
          avgInteractions: 0,
          engagementRate: 0,
          postsInPeriod: 0
        },
        engagementScore: liCache.engagementScore || {
          likes: 0,
          comments: 0,
          shares: 0,
          engagementRate: 0,
          totalEngagement: 0
        },
        followerGrowth: liCache.followerGrowth || [],
        topPosts: liCache.topPosts || [],
        posts: liCache.posts || { total: 0, topPerforming: [] },
        reputationBenchmark: liCache.reputationBenchmark || {
          score: 0,
          rating: 'N/A',
          description: 'No reputation data available'
        },
        lastUpdated: liCache.lastUpdated,
        cached: true
      };
    }

    // 🚀 PROCESS PARALLEL RESULTS (social media already fetched above)
    console.log(`📊 Processing competitor social media results...`);

    // Process Facebook result
    console.log(`📘 Facebook Result Status: ${compFacebookResult.status}`);
    if (compFacebookResult.status === 'fulfilled') {
      if (compFacebookResult.value && compFacebookResult.value.success !== false) {
        // Valid data received
        result.competitorSite.facebook = compFacebookResult.value;
        console.log(`   ✅ Competitor Facebook: ${compFacebookResult.value.data?.name || 'Unknown'} (${compFacebookResult.value.data?.followers || 0} followers)`);
      } else if (compFacebookResult.value && compFacebookResult.value.error) {
        // Timeout or error
        console.log(`   ⚠️ Competitor Facebook timed out - data may be incomplete`);
        result.competitorSite.facebook = { success: false, error: 'Data collection timed out' };
      }
    } else {
      console.log(`   ❌ Competitor Facebook: Promise rejected - ${compFacebookResult.reason?.message || 'Unknown'}`);
      result.competitorSite.facebook = { success: false, error: compFacebookResult.reason?.message || 'Failed to fetch' };
    }

    // Process Instagram result
    console.log(`📸 Instagram Result Status: ${compInstagramResult.status}`);
    if (compInstagramResult.status === 'fulfilled' && compInstagramResult.value) {
      result.competitorSite.instagram = compInstagramResult.value;
      if (compInstagramResult.value.success) {
        console.log(`   ✅ Competitor Instagram: @${compInstagramResult.value.profile?.username || 'Unknown'} (${compInstagramResult.value.profile?.followers || 0} followers)`);
      }
    } else if (compIgHandle) {
      result.competitorSite.instagram = { success: false, error: compInstagramResult.reason?.message || 'Failed to fetch' };
    }

    // Process LinkedIn result
    console.log(`💼 LinkedIn Result Status: ${compLinkedInResult.status}`);
    if (compLinkedInResult.status === 'fulfilled' && compLinkedInResult.value) {
      result.competitorSite.linkedin = compLinkedInResult.value;
      if (compLinkedInResult.value.dataAvailable) {
        console.log(`   ✅ Competitor LinkedIn: ${compLinkedInResult.value.companyName || 'Unknown'}`);
      }
    } else if (compLiHandle) {
      result.competitorSite.linkedin = { dataAvailable: false, error: compLinkedInResult.reason?.message || 'Failed to fetch' };
    }

    // Fetch Google Ads data for both sites (PARALLEL with timeout for speed)
    try {
      console.log(`📢 Fetching Google Ads data for both sites...`);
      const { getGoogleAdsMonitoring } = await import('../services/googleAdsMonitoringService.js');

      // Fetch in parallel with timeout to prevent hanging
      const [yourGoogleAds, compGoogleAds] = await Promise.allSettled([
        Promise.race([
          getGoogleAdsMonitoring(yourSite),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Google Ads timeout (30s)')), 30000))
        ]),
        Promise.race([
          getGoogleAdsMonitoring(competitorSite),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Google Ads timeout (30s)')), 30000))
        ])
      ]);

      if (yourGoogleAds.status === 'fulfilled' && !yourGoogleAds.value.error) {
        result.yourSite.googleAds = yourGoogleAds.value;
        console.log(`✅ Your Google Ads: ${yourGoogleAds.value.totalAds} ads`);
      }

      if (compGoogleAds.status === 'fulfilled' && !compGoogleAds.value.error) {
        result.competitorSite.googleAds = compGoogleAds.value;
        console.log(`✅ Competitor Google Ads: ${compGoogleAds.value.totalAds} ads`);
      }
    } catch (googleAdsError) {
      console.log('⚠️ Google Ads failed - continuing:', googleAdsError.message);
    }

    // Meta Ads monitoring removed (SearchAPI quota exhausted)
    // Use Facebook Ads Library directly via browser for manual checking

    console.log(`✅ COMPLETE analysis finished for ${competitorSite}`);

    // Get competitor's LinkedIn handle from business settings
    let competitorLinkedIn = null;
    try {
      const businessInfoResponse = await fetch(`${process.env.BACKEND_URL || 'https://saas-wets.onrender.com'}/api/business-info?email=${encodeURIComponent(email)}`);
      if (businessInfoResponse.ok) {
        const businessData = await businessInfoResponse.json();
        if (businessData.success && businessData.data?.competitors) {
          const competitor = businessData.data.competitors.find(c => c.domain === competitorSite);
          competitorLinkedIn = competitor?.linkedin || null;
        }
      }
    } catch (err) {
      console.log('⚠️ Could not fetch competitor LinkedIn handle for cache');
    }

    // Store in cache with social media handles as part of the cache key
    const cacheData = {
      user_id: userId,
      user_domain: yourSite,
      competitor_domain: competitorSite,
      user_instagram_handle: userInstagram,
      user_facebook_handle: userFacebook,
      user_linkedin_handle: userLinkedIn,
      competitor_instagram_handle: compInstagram,
      competitor_facebook_handle: compFacebook,
      competitor_linkedin_handle: compLinkedIn,
      facebook_data: result.competitorSite.facebook || null,
      instagram_data: result.competitorSite.instagram || null,
      full_result: result,
      analysis_status: 'completed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
    };

    console.log('💾 Saving to cache with handles:', {
      user: { ig: userInstagram, fb: userFacebook, li: userLinkedIn },
      competitor: { ig: compInstagram, fb: compFacebook, li: compLinkedIn }
    });

    const { error: cacheError } = await supabase
      .from('competitor_cache')
      .upsert(cacheData, {
        onConflict: 'user_id,user_domain,competitor_domain'
      });

    if (cacheError) {
      console.error('❌ Failed to save to competitor_cache:', cacheError);
      console.error('   Cache data user_id:', userId);
      console.error('   Cache data structure:', JSON.stringify(Object.keys(cacheData)));
    } else {
      console.log(`✅ Successfully saved to competitor_cache for ${competitorSite}`);
    }

    console.log(`✅ Analysis complete for ${competitorSite}`);

    // Clear active analysis lock
    activeAnalysis.delete(analysisKey);
    console.log('📤 Sending response to frontend...');
    console.log(`   ✅ yourSite data keys: ${Object.keys(result.yourSite || {}).join(', ')}`);
    console.log(`   ✅ competitorSite data keys: ${Object.keys(result.competitorSite || {}).join(', ')}`);

    // Detailed social media status
    console.log('📊 Social Media Status:');
    console.log(`   Your FB: ${result.yourSite.facebook ? '✅' : '❌'}`);
    console.log(`   Your IG: ${result.yourSite.instagram ? '✅' : '❌'}`);
    console.log(`   Your LI: ${result.yourSite.linkedin ? '✅' : '❌'}`);
    console.log(`   Comp FB: ${result.competitorSite.facebook ? (result.competitorSite.facebook.success ? '✅' : '⚠️') : '❌'}`);
    console.log(`   Comp IG: ${result.competitorSite.instagram ? (result.competitorSite.instagram.success ? '✅' : '⚠️') : '❌'}`);
    console.log(`   Comp LI: ${result.competitorSite.linkedin ? (result.competitorSite.linkedin.dataAvailable ? '✅' : '⚠️') : '❌'}`);

    if (result.competitorSite.facebook) {
      console.log('📘 Competitor Facebook Data:', JSON.stringify(result.competitorSite.facebook, null, 2));
    }

    const response = {
      success: true,
      cached: false,
      partialFailure: result.partialFailure || false,
      failedMetrics: result.failedMetrics,
      yourSite: result.yourSite,
      competitorSite: result.competitorSite,
      comparison: result.comparison,
      quickWins: result.quickWins,
      contentOpportunities: result.contentOpportunities,
      aiInsights: result.aiInsights
    };

    console.log('✅ Response structure:', JSON.stringify({
      success: response.success,
      cached: response.cached,
      hasYourSite: !!response.yourSite,
      hasCompetitorSite: !!response.competitorSite
    }));

    res.json(response);

  } catch (error) {
    console.error('❌ Error in analyze route:', error);

    // Clear active analysis lock on error
    const analysisKey = `${req.body.email}:${req.body.yourSite}:${req.body.competitorSite}`;
    activeAnalysis.delete(analysisKey);

    res.status(500).json({
      success: false,
      error: error.message,
      details: error.stack
    });
  }
});

/**
 * Get competitor metrics for a single Facebook page
 * GET /api/competitor/facebook?url=https://www.facebook.com/page
 */
router.get('/facebook', async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Facebook page URL is required'
      });
    }

    console.log(`🔍 Fetching competitor metrics for: ${url}`);

    const result = await competitorIntelligenceService.getFacebookCompetitorMetrics(url);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('❌ Error in competitor route:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Compare multiple competitors
 * POST /api/competitor/compare
 * Body: { urls: ['url1', 'url2', ...] }
 */
router.post('/compare', async (req, res) => {
  try {
    const { urls } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Array of Facebook page URLs is required'
      });
    }

    console.log(`📊 Comparing ${urls.length} competitors`);

    const result = await competitorIntelligenceService.compareCompetitors(urls);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('❌ Error in compare route:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Generate AI-powered insights from competitor analysis
 * POST /api/competitor/ai-insights
 * Body: { yourSite, competitorSite, comparison }
 */
router.post('/ai-insights', async (req, res) => {
  try {
    const { yourSite, competitorSite, comparison } = req.body;

    if (!yourSite || !competitorSite) {
      return res.status(400).json({
        success: false,
        error: 'yourSite and competitorSite data are required'
      });
    }

    console.log(`🧠 Generating AI insights for ${yourSite.domain || 'your site'} vs ${competitorSite.domain || 'competitor'}`);

    // Generate AI recommendations using OpenAI
    const recommendations = await openaiService.generateRecommendations(
      yourSite,
      competitorSite,
      comparison || {}
    );

    console.log(`✅ Generated ${recommendations.length} AI recommendations`);

    res.json({
      success: true,
      recommendations,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error generating AI insights:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate AI insights'
    });
  }
});

/**
 * Get competitor analysis history for the user
 * GET /api/competitor/history?email=user@example.com
 */
router.get('/history', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Get user ID
    const { data: userData } = await supabase
      .from('users_table')
      .select('id')
      .eq('email', email)
      .single();

    if (!userData) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Fetch all cached competitor analyses for this user
    // We select specific fields to keep the payload light
    const { data: history, error } = await supabase
      .from('competitor_cache')
      .select('*')
      .eq('user_id', userData.id)
      .order('updated_at', { ascending: false });

    if (error) {
      throw error;
    }

    console.log(`✅ Fetched ${history.length} competitor history records for ${email}`);

    res.json({
      success: true,
      count: history.length,
      data: history
    });

  } catch (error) {
    console.error('❌ Error fetching competitor history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
