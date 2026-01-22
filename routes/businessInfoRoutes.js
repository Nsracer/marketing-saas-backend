import express from 'express';
import userBusinessInfoService from '../services/userBusinessInfoService.js';
import oauthTokenService from '../services/oauthTokenService.js';
import { google } from 'googleapis';

const router = express.Router();

/**
 * GET /api/business-info
 * Get user's business information with GA/GSC connection status
 */
router.get('/', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    console.log(`📊 Fetching business info for: ${email}`);

    const businessInfo = await userBusinessInfoService.getUserBusinessInfo(email);

    // Check GA/GSC connection status
    let gaGscConnected = false;
    try {
      const oauth2Client = await oauthTokenService.getOAuthClient(email);
      gaGscConnected = oauth2Client !== null;
    } catch (err) {
      console.log('⚠️ Could not check GA/GSC connection status');
    }

    // Check social media connections and fetch actual profile info
    const socialConnections = {
      facebook: await oauthTokenService.isConnected(email, 'facebook'),
      instagram: await oauthTokenService.isConnected(email, 'instagram'),
      linkedin: await oauthTokenService.isConnected(email, 'linkedin')
    };

    console.log(`📱 Social: FB=${socialConnections.facebook ? '✓' : '✗'} IG=${socialConnections.instagram ? '✓' : '✗'} LI=${socialConnections.linkedin ? '✓' : '✗'}`);

    // Sync social media handles from cache (account_name column)
    const socialProfiles = {};
    let shouldUpdateDatabase = false;

    try {
      console.log(`🔄 Syncing social handles from cache...`);
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );

      const { data: cacheData } = await supabase
        .from('social_media_cache')
        .select('platform, account_name')
        .eq('user_email', email);

      if (cacheData && cacheData.length > 0) {
        cacheData.forEach(cache => {
          const fieldMap = {
            'facebook': 'facebook_handle',
            'instagram': 'instagram_handle',
            'linkedin': 'linkedin_handle'
          };

          const field = fieldMap[cache.platform];
          if (field && cache.account_name) {
            socialProfiles[field] = cache.account_name;
            console.log(`   ✅ ${cache.platform}: ${cache.account_name}`);

            // Check if DB needs update
            if (!businessInfo || businessInfo[field] !== cache.account_name) {
              shouldUpdateDatabase = true;
              console.log(`   🔄 DB update needed for ${cache.platform}`);
            }
          }
        });
      }
    } catch (syncError) {
      console.log(`⚠️ Cache sync error:`, syncError.message);
    }

    // Fetch actual social media handles from connected accounts (fallback)

    // Get Instagram username
    if (socialConnections.instagram) {
      try {
        const tokens = await oauthTokenService.getTokens(email, 'instagram');
        console.log(`   🔍 Fetching Instagram account details...`);
        if (tokens && tokens.access_token) {
          const instagramServiceV2 = (await import('../services/instagramMetricsServiceV2.js')).default;
          const igAccount = await instagramServiceV2.getInstagramAccount(tokens.access_token);
          if (igAccount && igAccount.username) {
            socialProfiles.instagram_handle = `@${igAccount.username}`;
            console.log(`   ✅ IG API returned: ${socialProfiles.instagram_handle}`);

            // Check if database has different value
            const dbValue = businessInfo?.instagram_handle;
            console.log(`   📊 DB currently has: ${dbValue || '(empty)'}`);
            if (!businessInfo || businessInfo.instagram_handle !== socialProfiles.instagram_handle) {
              shouldUpdateDatabase = true;
              console.log(`   🔄 Database needs update: "${dbValue}" → "${socialProfiles.instagram_handle}"`);
            }
          }
        }
      } catch (error) {
        // Silently skip - Instagram profile will be fetched when viewing dashboard
      }
    }

    // Get Facebook page name
    if (socialConnections.facebook) {
      try {
        const tokens = await oauthTokenService.getTokens(email, 'facebook');
        if (tokens && tokens.access_token) {
          const facebookServiceV2 = (await import('../services/facebookMetricsServiceV2.js')).default;
          const pages = await facebookServiceV2.getUserPages(tokens.access_token);
          if (pages && pages.length > 0) {
            socialProfiles.facebook_handle = pages[0].name;
            console.log(`   ✅ FB: ${socialProfiles.facebook_handle}`);

            // Check if database has different value
            if (businessInfo && businessInfo.facebook_handle !== socialProfiles.facebook_handle) {
              shouldUpdateDatabase = true;
              console.log(`   🔄 Database has outdated Facebook handle, will update`);
            }
          }
        }
      } catch (error) {
        // Silently skip - Facebook page will be fetched when viewing dashboard
      }
    }

    // Get LinkedIn organization name - ONLY from cache to avoid rate limits
    // The actual org lookup happens in the metrics service with proper deduplication
    if (socialConnections.linkedin && !socialProfiles.linkedin_handle) {
      // LinkedIn handle should already be in cache from above sync
      // Don't make direct API calls here to avoid hitting rate limits
      console.log(`   ⏭️ LinkedIn handle will be synced when metrics are fetched (avoiding duplicate org lookup)`);
    }

    // Update database if we fetched newer handles
    if (shouldUpdateDatabase && businessInfo) {
      try {
        await userBusinessInfoService.upsertBusinessInfo(email, {
          ...businessInfo,
          ...socialProfiles
        });
        console.log('   💾 Updated database with latest social handles');
      } catch (updateError) {
        console.warn('   ⚠️ Could not update database with social handles:', updateError.message);
      }
    }

    // If we have business info, merge with connected social handles
    // If no business info exists yet, create a minimal object with social handles
    let enrichedBusinessInfo = businessInfo;
    if (businessInfo) {
      enrichedBusinessInfo = {
        ...businessInfo,
        // Override with fetched handles if connected
        ...(socialProfiles.facebook_handle && { facebook_handle: socialProfiles.facebook_handle }),
        ...(socialProfiles.instagram_handle && { instagram_handle: socialProfiles.instagram_handle }),
        ...(socialProfiles.linkedin_handle && { linkedin_handle: socialProfiles.linkedin_handle })
      };
    } else if (Object.keys(socialProfiles).length > 0) {
      // No business info in DB yet, but we have social profiles - create minimal object
      enrichedBusinessInfo = {
        business_name: '',
        business_domain: '',
        business_description: '',
        business_industry: '',
        facebook_handle: socialProfiles.facebook_handle || '',
        instagram_handle: socialProfiles.instagram_handle || '',
        linkedin_handle: socialProfiles.linkedin_handle || '',
        youtube_handle: '',
        tiktok_handle: '',
        setup_completed: false
      };
      console.log('   📦 Created minimal business info with social handles:', enrichedBusinessInfo);
    }

    if (!businessInfo && !enrichedBusinessInfo) {
      return res.json({
        success: true,
        data: null,
        setup_completed: false,
        ga_gsc_connected: gaGscConnected,
        social_connections: socialConnections
      });
    }

    res.json({
      success: true,
      data: enrichedBusinessInfo,
      setup_completed: enrichedBusinessInfo?.setup_completed || false,
      ga_gsc_connected: gaGscConnected,
      social_connections: socialConnections
    });
  } catch (error) {
    console.error('❌ Error in GET /api/business-info:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/business-info
 * Create or update user's business information
 */
router.post('/', async (req, res) => {
  try {
    const { email, ...businessInfo } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // business_domain is now optional - it can come from GSC sync
    // if (!businessInfo.business_domain) {
    //   return res.status(400).json({
    //     success: false,
    //     error: 'Business domain is required'
    //   });
    // }

    console.log(`💾 Saving business info for: ${email}`);

    const result = await userBusinessInfoService.upsertBusinessInfo(email, businessInfo);

    // ===== NEW: Pre-warm Puppeteer cache in background if domain is provided =====
    if (businessInfo.business_domain) {
      (async () => {
        try {
          const puppeteerCacheService = (await import('../services/puppeteerCacheService.js')).default;
          await puppeteerCacheService.prewarmUserDomainCache(email, businessInfo.business_domain);
          console.log(`✅ [Background] Pre-warmed Puppeteer cache for ${businessInfo.business_domain}`);
        } catch (err) {
          console.error(`❌ [Background] Failed to pre-warm Puppeteer cache:`, err);
        }
      })();
    }
    // ===== END NEW =====

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Error in POST /api/business-info:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/business-info/competitors
 * Get all competitors for a user
 */
router.get('/competitors', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    console.log(`📊 Fetching competitors for: ${email}`);

    const competitors = await userBusinessInfoService.getCompetitors(email);

    res.json({
      success: true,
      data: competitors,
      count: competitors.length
    });
  } catch (error) {
    console.error('❌ Error in GET /api/business-info/competitors:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/business-info/competitors
 * Add a new competitor
 */
router.post('/competitors', async (req, res) => {
  try {
    const { email, competitor } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    if (!competitor || !competitor.domain) {
      return res.status(400).json({
        success: false,
        error: 'Competitor domain is required'
      });
    }

    console.log(`➕ Adding competitor for: ${email}`);

    const result = await userBusinessInfoService.addCompetitor(email, competitor);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Error in POST /api/business-info/competitors:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/business-info/competitors
 * Update all competitors
 */
router.put('/competitors', async (req, res) => {
  try {
    const { email, competitors } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    if (!Array.isArray(competitors)) {
      return res.status(400).json({
        success: false,
        error: 'Competitors must be an array'
      });
    }

    console.log(`🔄 Updating competitors for: ${email}`);

    const result = await userBusinessInfoService.updateCompetitors(email, competitors);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Error in PUT /api/business-info/competitors:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/business-info/competitors/:competitorId
 * Remove a competitor
 */
router.delete('/competitors/:competitorId', async (req, res) => {
  try {
    const { email } = req.query;
    const { competitorId } = req.params;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    console.log(`🗑️  Removing competitor ${competitorId} for: ${email}`);

    const result = await userBusinessInfoService.removeCompetitor(email, competitorId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Error in DELETE /api/business-info/competitors:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/business-info/setup-status
 * Check if user has completed business setup
 */
router.get('/setup-status', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    const isCompleted = await userBusinessInfoService.isSetupCompleted(email);

    res.json({
      success: true,
      setup_completed: isCompleted
    });
  } catch (error) {
    console.error('❌ Error in GET /api/business-info/setup-status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/business-info/complete-setup
 * Mark business setup as completed
 */
router.post('/complete-setup', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    console.log(`✅ Completing setup for: ${email}`);

    const result = await userBusinessInfoService.markSetupCompleted(email);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('❌ Error in POST /api/business-info/complete-setup:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/business-info/sync-domain-from-gsc
 * Fetch domain from Google Search Console and update business info
 */
router.post('/sync-domain-from-gsc', async (req, res) => {
  try {
    const { email, siteUrl } = req.body;


    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    console.log(`🔄 Syncing domain from GSC for: ${email}`);
    if (siteUrl) {
      console.log(`   📍 User-selected siteUrl: ${siteUrl}`);
    }


    // Check if user has GA/GSC connected
    const oauth2Client = await oauthTokenService.getOAuthClient(email);

    if (!oauth2Client) {
      return res.status(400).json({
        success: false,
        error: 'Google Analytics/Search Console not connected. Please connect first.'
      });
    }

    let domain;

    // If siteUrl is provided by the frontend, use it directly
    if (siteUrl) {
      domain = siteUrl
        .replace(/^https?:\/\//, '')
        .replace(/^sc-domain:/, '')
        .replace(/^www\./, '')
        .replace(/\/$/, '')
        .split('/')[0];
      console.log(`✅ Using user-selected domain: ${domain}`);
    } else {
      // Fallback: Fetch sites from Search Console and pick the first one
      console.log(`⚠️ No siteUrl provided, fetching from GSC API...`);
      const searchConsole = google.searchconsole({
        version: 'v1',
        auth: oauth2Client
      });

      const sitesResponse = await searchConsole.sites.list();
      const sites = sitesResponse.data.siteEntry || [];

      if (sites.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No sites found in Google Search Console. Please add your site to GSC first.',
          help: 'Visit https://search.google.com/search-console to add your site'
        });
      }

      // Get the first site (fallback only)
      domain = sites[0].siteUrl;

      // Clean domain
      domain = domain
        .replace(/^https?:\/\//, '')
        .replace(/^sc-domain:/, '')
        .replace(/^www\./, '')
        .replace(/\/$/, '')
        .split('/')[0];

      console.log(`✅ Domain found in GSC (fallback): ${domain}`);
    }


    // Get existing business info or create new
    let businessInfo = await userBusinessInfoService.getUserBusinessInfo(email);

    const businessData = {
      business_domain: domain,
      business_name: businessInfo?.business_name || null,
      business_description: businessInfo?.business_description || null,
      business_industry: businessInfo?.business_industry || null,
      facebook_handle: businessInfo?.facebook_handle || null,
      instagram_handle: businessInfo?.instagram_handle || null,
      linkedin_handle: businessInfo?.linkedin_handle || null,
      youtube_handle: businessInfo?.youtube_handle || null,
      tiktok_handle: businessInfo?.tiktok_handle || null
    };

    // Update or create business info with the domain from GSC
    const result = await userBusinessInfoService.upsertBusinessInfo(email, businessData);

    res.json({
      success: true,
      data: result,
      message: 'Domain successfully synced from Google Search Console',
      domain: domain
    });

  } catch (error) {
    console.error('❌ Error in POST /api/business-info/sync-domain-from-gsc:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
