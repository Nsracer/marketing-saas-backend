import express from 'express';
import { google } from 'googleapis';
import lighthouseService from '../services/lighthouseService.js';
import gscBacklinksScraper from '../services/gscBacklinksScraper.js';
import seoCacheService from '../services/seoCacheService.js';
import seRankingService from '../services/seRankingService.js';
import oauthTokenService from '../services/oauthTokenService.js';
import { getUserPlan, shouldCallAPI, filterSEOData } from '../services/planAccessService.js';

const router = express.Router();

// Get user's Search Console data
router.get('/search-console/data', async (req, res) => {
  try {
    const { email, siteUrl, forceRefresh, days } = req.query;
    const daysToFetch = parseInt(days) || 30; // Default to 30 days

    if (!email) {
      return res.status(400).json({
        error: 'Email parameter is required',
        dataAvailable: false,
        reason: 'Missing email parameter'
      });
    }

    console.log(`📊 Fetching Search Console data for: ${email}${siteUrl ? ` (${siteUrl})` : ''}`);
    console.log(`📅 Date range: ${daysToFetch} days`);

    // Check cache first (unless forceRefresh is true)
    if (forceRefresh !== 'true') {
      const cachedData = await seoCacheService.getSearchConsoleCache(email, daysToFetch);
      if (cachedData) {
        // Check if lighthouse data is missing - if so, try to get it
        if (!cachedData.lighthouse) {
          console.log('⚠️ Cached data missing lighthouse - fetching separately...');
          const domain = cachedData.domain || (siteUrl ? siteUrl.replace(/^(sc-domain:|https?:\/\/)/, '').replace(/\/$/, '') : null);
          if (domain) {
            // Try to get lighthouse from separate cache or fetch fresh
            let lighthouseData = await seoCacheService.getLighthouseCache(email, domain);
            if (!lighthouseData) {
              // Fetch fresh lighthouse data with 30s timeout
              console.log(`   ⏱️ Lighthouse: Fetching with 30s timeout...`);
              try {
                const timeoutPromise = new Promise((_, reject) =>
                  setTimeout(() => reject(new Error('Lighthouse timeout')), 30000)
                );
                const lighthousePromise = lighthouseService.analyzeSite(domain);
                lighthouseData = await Promise.race([lighthousePromise, timeoutPromise]);
                if (lighthouseData) {
                  console.log(`   ✅ Lighthouse: Fetched - Performance ${lighthouseData.categoryScores?.performance || 'N/A'}%`);
                  await seoCacheService.saveLighthouseCache(email, domain, lighthouseData);
                }
              } catch (err) {
                console.log(`   ⚠️ Lighthouse fetch failed: ${err.message}`);
              }
            }
            if (lighthouseData) {
              cachedData.lighthouse = lighthouseData;
            }
          }
        }

        console.log('✅ Returning cached Search Console data');

        // Filter cached data based on user's plan
        const filteredData = await filterSEOData(cachedData, email);
        return res.json(filteredData);
      }
    } else {
      console.log('🔄 Force refresh requested, skipping cache');
      console.log('🔗 SE Ranking API will be called for fresh backlinks data');
    }

    // Cache miss or expired - fetch fresh data
    console.log('📡 Fetching fresh data from Google Search Console...');

    // Get OAuth client with auto-refresh from oauthTokenService
    const oauth2Client = await oauthTokenService.getOAuthClient(email);

    if (!oauth2Client) {
      console.log('❌ User not authenticated or token refresh failed');
      return res.json({
        dataAvailable: false,
        reason: 'Authentication token expired. Please reconnect your Google account.',
        needsReconnect: true,
        connected: false
      });
    }

    console.log('✅ OAuth client ready');

    // Get Search Console service
    const searchConsole = google.searchconsole({
      version: 'v1',
      auth: oauth2Client
    });

    // List all sites the user has access to
    let sites;
    try {
      const sitesResponse = await searchConsole.sites.list();
      sites = sitesResponse.data.siteEntry || [];
      console.log(`✅ Found ${sites.length} sites in Search Console`);
    } catch (error) {
      console.error('❌ Error fetching sites:', error.message);

      // Check if it's an auth error
      if (error.message?.includes('invalid_grant') || error.message?.includes('expired')) {
        console.log('🔄 Token expired, attempting refresh...');
        const refreshed = await oauthTokenService.refreshTokens(email);
        if (!refreshed) {
          return res.json({
            dataAvailable: false,
            reason: 'Authentication token expired. Please reconnect your Google account.',
            needsReconnect: true,
            connected: false
          });
        }
        // Retry after refresh
        return res.redirect(`/api/search-console/data?email=${email}&forceRefresh=${forceRefresh}`);
      }

      // Check if it's a permission issue
      if (error.code === 403 || error.message.includes('insufficient')) {
        return res.json({
          dataAvailable: false,
          reason: 'Search Console permission not granted. Please reconnect your account with Search Console access.',
          needsReconnect: true,
          connected: false
        });
      }

      return res.json({
        dataAvailable: false,
        reason: 'Unable to access Search Console. Please ensure you have Search Console set up and try reconnecting.',
        needsReconnect: true,
        connected: false
      });
    }

    if (sites.length === 0) {
      return res.json({
        dataAvailable: false,
        reason: 'No sites found in Google Search Console. Please add and verify a site first at https://search.google.com/search-console',
        needsSiteSelection: true
      });
    }

    // Require explicit site selection - don't auto-select first site
    let selectedSiteUrl = siteUrl;
    if (!selectedSiteUrl) {
      console.log('⚠️ No site URL provided - user needs to select a site');
      return res.json({
        dataAvailable: false,
        reason: 'Please select a Search Console site to view data',
        connected: true,
        needsSiteSelection: true,
        availableSites: sites.map(s => s.siteUrl)
      });
    }

    // Verify the selected site exists in user's sites
    const siteExists = sites.some(s => s.siteUrl === selectedSiteUrl);
    if (!siteExists) {
      console.log('Selected site not found in user sites');
      return res.json({
        dataAvailable: false,
        reason: 'Selected site not found. Please choose from available sites.',
        connected: true,
        needsSiteSelection: true,
        availableSites: sites.map(s => s.siteUrl)
      });
    }

    console.log(`📍 Using site: ${selectedSiteUrl}`);

    // Calculate date range (last N days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysToFetch);

    const formatDate = (date) => {
      return date.toISOString().split('T')[0];
    };

    // Get search analytics data
    let analyticsResponse;
    try {
      analyticsResponse = await searchConsole.searchanalytics.query({
        siteUrl: selectedSiteUrl,
        requestBody: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: ['query'],
          rowLimit: 100,
          dataState: 'all' // Use 'all' instead of 'final' for more recent data
        }
      });
    } catch (error) {
      console.error('❌ Error fetching search analytics:', error.message);
      return res.json({
        dataAvailable: false,
        reason: 'Unable to fetch search analytics data. The site may not have enough data yet.'
      });
    }

    // Get page analytics data (top pages)
    let pageAnalyticsResponse;
    try {
      pageAnalyticsResponse = await searchConsole.searchanalytics.query({
        siteUrl: selectedSiteUrl,
        requestBody: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: ['page'],
          rowLimit: 100,
          dataState: 'all'
        }
      });
    } catch (error) {
      console.error('⚠️ Error fetching page analytics:', error.message);
      pageAnalyticsResponse = { data: { rows: [] } };
    }

    // Get daily analytics data for graph
    let dailyAnalyticsResponse;
    try {
      dailyAnalyticsResponse = await searchConsole.searchanalytics.query({
        siteUrl: selectedSiteUrl,
        requestBody: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: ['date'],
          dataState: 'all'
        }
      });
    } catch (error) {
      console.error('⚠️ Error fetching daily analytics:', error.message);
      dailyAnalyticsResponse = { data: { rows: [] } };
    }

    const rows = analyticsResponse.data.rows || [];
    const pageRows = pageAnalyticsResponse.data.rows || [];
    const dailyRows = dailyAnalyticsResponse.data.rows || [];
    console.log(`📈 Retrieved ${rows.length} query rows, ${pageRows.length} page rows, ${dailyRows.length} daily rows`);

    if (rows.length === 0) {
      return res.json({
        dataAvailable: false,
        reason: 'No search data available for this site in the last 30 days. The site may be new or not indexed yet.',
        siteUrl
      });
    }

    // Calculate aggregated metrics from DAILY data (most accurate - no row limit issues)
    // Using dailyRows instead of query rows to match Google Search Console totals
    const totalClicks = dailyRows.reduce((sum, row) => sum + (row.clicks || 0), 0);
    const totalImpressions = dailyRows.reduce((sum, row) => sum + (row.impressions || 0), 0);

    // Calculate weighted average CTR: total clicks / total impressions
    const averageCTR = totalImpressions > 0 ? totalClicks / totalImpressions : 0;

    // Calculate weighted average position from daily data
    // Weight by impressions for accurate average (same as GSC calculates it)
    const totalWeightedPosition = dailyRows.reduce((sum, row) => sum + ((row.position || 0) * (row.impressions || 0)), 0);
    const averagePosition = totalImpressions > 0 ? totalWeightedPosition / totalImpressions : 0;

    // Organic traffic = total clicks (same metric, from daily aggregation)
    const organicTraffic = totalClicks;

    // Get top queries
    const topQueries = rows
      .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
      .slice(0, 10)
      .map(row => ({
        query: row.keys?.[0] || 'Unknown',
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
        ctr: row.ctr || 0,
        position: row.position || 0
      }));

    // Get top pages
    const topPages = pageRows
      .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
      .slice(0, 10)
      .map(row => ({
        page: row.keys?.[0] || 'Unknown',
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
        ctr: row.ctr || 0,
        position: row.position || 0
      }));

    // Get daily data for graph
    const dailyData = dailyRows
      .sort((a, b) => (a.keys?.[0] || '').localeCompare(b.keys?.[0] || ''))
      .map(row => ({
        date: row.keys?.[0] || '',
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
        ctr: row.ctr || 0,
        position: row.position || 0
      }));

    // Get backlinks data from SE Ranking API
    let backlinksResult = {
      available: false,
      topLinkingSites: [],
      topLinkingPages: [],
      totalBacklinks: 0,
      note: '',
      source: 'SE Ranking'
    };

    // Extract clean domain from selectedSiteUrl for backlinks analysis
    let domain = selectedSiteUrl;

    // Handle different GSC URL formats
    if (domain.startsWith('sc-domain:')) {
      // Domain property format: sc-domain:example.com -> example.com
      domain = domain.replace('sc-domain:', '');
      console.log(`� Extracted domain from sc-domain format: ${domain}`);
    } else {
      // URL prefix format: https://example.com/ -> example.com
      domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
      console.log(`📍 Extracted domain from URL format: ${domain}`);
    }

    // Check SE Ranking cache first
    const cachedBacklinks = await seoCacheService.getSERankingCache(email, domain);

    // ===== CHECK PLAN BEFORE CALLING SE RANKING API =====
    const userPlan = await getUserPlan(email);
    const canCallSERanking = await shouldCallAPI(email, 'seRanking');

    console.log(`👤 User plan: ${userPlan}, SE Ranking API access: ${canCallSERanking}`);

    if (cachedBacklinks && forceRefresh !== 'true') {
      console.log('✅ Using cached SE Ranking backlinks data');
      backlinksResult = cachedBacklinks;
    } else if (!canCallSERanking) {
      // User plan doesn't include SE Ranking API - skip the call
      console.log(`⏭️ Skipping SE Ranking API - ${userPlan} plan doesn't include backlink analysis`);
      backlinksResult.note = `Backlink analysis available in Growth and Pro plans. Upgrade to unlock this feature.`;
      backlinksResult.upgradeRequired = 'growth';
    } else {
      if (forceRefresh === 'true') {
        console.log('🔄 Force refresh: Fetching fresh SE Ranking data');
      }

      try {
        console.log('🔗 Fetching backlinks data from SE Ranking API...');

        // Fetch backlinks data from SE Ranking
        const seRankingData = await seRankingService.getBacklinksSummary(domain);

        if (seRankingData && seRankingData.available) {
          backlinksResult.available = true;
          backlinksResult.topLinkingSites = seRankingData.topLinkingSites || [];
          backlinksResult.topLinkingPages = seRankingData.topLinkingPages || [];
          backlinksResult.totalBacklinks = seRankingData.totalBacklinks || 0;
          backlinksResult.totalRefDomains = seRankingData.totalRefDomains || 0;
          backlinksResult.metrics = seRankingData.metrics;
          backlinksResult.domainMetrics = seRankingData.domainMetrics;
          backlinksResult.topAnchors = seRankingData.topAnchors;
          backlinksResult.topTlds = seRankingData.topTlds;
          backlinksResult.topCountries = seRankingData.topCountries;
          backlinksResult.note = `Data from SE Ranking API - ${seRankingData.totalBacklinks.toLocaleString()} backlinks from ${seRankingData.totalRefDomains.toLocaleString()} domains`;
          console.log(`✅ SE Ranking: ${backlinksResult.totalBacklinks} backlinks from ${backlinksResult.totalRefDomains} domains`);

          // Cache the successful response (48 hours - 2 days)
          await seoCacheService.saveSERankingCache(email, domain, backlinksResult, 48);
        } else {
          backlinksResult.note = seRankingData?.reason || 'Backlink data not available from SE Ranking API';
          console.log('⚠️ SE Ranking API returned no data');
        }
      } catch (err) {
        console.log('⚠️ SE Ranking API failed:', err.message);
        backlinksResult.note = `SE Ranking API error: ${err.message}`;

        // Try to use expired cache as fallback
        const expiredCache = await seoCacheService.getSERankingCache(email, domain, true);
        if (expiredCache) {
          console.log('📦 Using expired SE Ranking cache as fallback');
          backlinksResult = expiredCache;
          backlinksResult.note = `${backlinksResult.note} (Using cached data due to API error)`;
        }
      }
    }

    console.log('✅ Search Console data retrieved successfully');
    console.log(`📊 Stats: ${totalClicks} clicks, ${totalImpressions} impressions, ${organicTraffic} organic traffic`);

    // Domain already extracted above for backlinks
    console.log(`🚀 Fetching Lighthouse data...`);

    // ===== PUPPETEER: Check cache only (no waiting for fresh data) =====
    let puppeteerData = null;
    try {
      const puppeteerCacheService = (await import('../services/puppeteerCacheService.js')).default;
      const cachedPuppeteer = await puppeteerCacheService.getUserDomainPuppeteerCache(email, domain, forceRefresh === 'true');

      if (cachedPuppeteer && cachedPuppeteer.success) {
        console.log(`   ✅ Puppeteer: Using cached data (${cachedPuppeteer.cacheAge}m old)`);
        puppeteerData = cachedPuppeteer.data;
      } else {
        console.log(`   📭 Puppeteer: No cache available`);
      }

      // Run fresh Puppeteer analysis in background (fire & forget - for precaching only)
      if (!cachedPuppeteer || forceRefresh === 'true') {
        console.log(`   🔄 Puppeteer: Starting background precache (won't delay response)...`);
        puppeteerCacheService.fetchAndCachePuppeteerAnalysis(email, domain, true)
          .then(() => console.log(`   ✅ Puppeteer: Background precache completed`))
          .catch(err => console.error(`   ⚠️ Puppeteer: Background precache failed:`, err.message));
      }
    } catch (err) {
      console.error(`   ❌ Puppeteer cache check failed:`, err.message);
    }

    // ===== LIGHTHOUSE: Check cache only (no waiting for fresh data) =====
    let lighthouseData = null;

    try {
      // Always try to get cached data first (even with forceRefresh)
      const cachedLighthouse = await seoCacheService.getLighthouseCache(email, domain);

      if (cachedLighthouse) {
        console.log(`   ✅ Lighthouse: Using cached data`);
        lighthouseData = cachedLighthouse;
      } else {
        // Try expired cache as fallback
        const expiredCache = await seoCacheService.getLighthouseCache(email, domain, true);
        if (expiredCache) {
          console.log(`   ✅ Lighthouse: Using expired cache (better than nothing)`);
          lighthouseData = expiredCache;
        } else {
          console.log(`   📭 Lighthouse: No cache available`);

          // Fetch synchronously - 30s for initial load, 60s for force refresh
          const timeoutMs = forceRefresh === 'true' ? 60000 : 30000;
          console.log(`   ⏱️ Lighthouse: Fetching with ${timeoutMs / 1000}s timeout...`);
          try {
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Lighthouse timeout')), timeoutMs)
            );
            const lighthousePromise = lighthouseService.analyzeSite(domain);

            lighthouseData = await Promise.race([lighthousePromise, timeoutPromise]);

            if (lighthouseData) {
              console.log(`   ✅ Lighthouse: Fresh data fetched - Performance ${lighthouseData.categoryScores.performance}%`);
              await seoCacheService.saveLighthouseCache(email, domain, lighthouseData);
            }
          } catch (timeoutErr) {
            console.log(`   ⏱️ Lighthouse: Timed out after ${timeoutMs / 1000}s`);
          }
        }
      }

      // Run fresh Lighthouse analysis in background (fire & forget) only if not just fetched
      if ((!cachedLighthouse || forceRefresh === 'true') && !lighthouseData) {
        console.log(`   🔄 Lighthouse: Starting background refresh (won't delay response)...`);
        (async () => {
          try {
            const freshLighthouse = await lighthouseService.analyzeSite(domain);
            if (freshLighthouse) {
              console.log(`   ✅ Lighthouse: Background refresh completed - Performance ${freshLighthouse.categoryScores.performance}%`);
              await seoCacheService.saveLighthouseCache(email, domain, freshLighthouse);
            } else {
              console.log(`   ⚠️ Lighthouse: Background refresh returned no data`);
            }
          } catch (err) {
            console.error(`   ⚠️ Lighthouse: Background refresh failed:`, err.message);
          }
        })();
      }
    } catch (err) {
      console.error(`   ❌ Lighthouse cache check failed:`, err.message);
    }

    console.log(`✅ Response data ready (Lighthouse/Puppeteer may still be running in background)`);
    // backlinksResult is already processed above from SE Ranking API

    // Prepare response data
    const responseData = {
      dataAvailable: true,
      totalClicks,
      totalImpressions,
      averageCTR,
      averagePosition,
      organicTraffic,
      topQueries,
      topPages,
      dailyData,
      lighthouse: lighthouseData, // Add Lighthouse data
      puppeteer: puppeteerData, // Add Puppeteer data
      backlinks: {
        available: backlinksResult.available,
        topLinkingSites: backlinksResult.topLinkingSites,
        topLinkingPages: backlinksResult.topLinkingPages,
        totalBacklinks: backlinksResult.totalBacklinks || 0,
        totalRefDomains: backlinksResult.totalRefDomains || 0,
        metrics: backlinksResult.metrics || {},
        domainMetrics: backlinksResult.domainMetrics || {},
        topAnchors: backlinksResult.topAnchors || [],
        topTlds: backlinksResult.topTlds || [],
        topCountries: backlinksResult.topCountries || [],
        note: backlinksResult.note || '',
        source: backlinksResult.source || 'SE Ranking',
        requiresSetup: backlinksResult.requiresSetup || false,
        sessionExpired: backlinksResult.sessionExpired || false,
        upgradeRequired: backlinksResult.upgradeRequired || null
      },
      siteUrl,
      domain, // Add domain info
      dateRange: {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate)
      },
      lastUpdated: new Date().toISOString()
    };

    // ===== FILTER DATA BASED ON USER'S PLAN =====
    const filteredData = await filterSEOData(responseData, email);

    // Save to cache asynchronously (save unfiltered data)
    seoCacheService.saveSearchConsoleCache(email, responseData).catch(err => {
      console.error('⚠️ Failed to save cache:', err);
    });

    // Return filtered data based on user's plan
    res.json(filteredData);

  } catch (error) {
    console.error('❌ Error fetching Search Console data:', error);

    // Handle specific error cases
    if (error.code === 403) {
      return res.json({
        dataAvailable: false,
        reason: 'Access denied. Please ensure you have granted Search Console permissions and try reconnecting.'
      });
    }

    if (error.code === 401) {
      return res.json({
        dataAvailable: false,
        reason: 'Authentication failed. Please reconnect your Google account.'
      });
    }

    res.status(500).json({
      error: 'Failed to fetch Search Console data',
      dataAvailable: false,
      reason: error.message || 'An unexpected error occurred'
    });
  }
});

// Get list of sites in Search Console
router.get('/search-console/sites', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    // Get OAuth client with auto-refresh
    const oauth2Client = await oauthTokenService.getOAuthClient(email);

    if (!oauth2Client) {
      return res.json({
        sites: [],
        message: 'Google account not connected',
        needsReconnect: true
      });
    }

    const searchConsole = google.searchconsole({
      version: 'v1',
      auth: oauth2Client
    });

    const sitesResponse = await searchConsole.sites.list();
    const sites = sitesResponse.data.siteEntry || [];

    res.json({
      sites: sites.map(site => ({
        siteUrl: site.siteUrl,
        permissionLevel: site.permissionLevel
      }))
    });

  } catch (error) {
    console.error('❌ Error fetching sites:', error);

    // Check for auth errors
    if (error.message?.includes('invalid_grant') || error.message?.includes('expired')) {
      return res.json({
        sites: [],
        message: 'Authentication expired. Please reconnect.',
        needsReconnect: true
      });
    }

    res.status(500).json({
      error: 'Failed to fetch sites',
      sites: []
    });
  }
});

// Get backlinks data
router.get('/search-console/backlinks', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    // Get OAuth client with auto-refresh
    const oauth2Client = await oauthTokenService.getOAuthClient(email);

    if (!oauth2Client) {
      return res.json({
        dataAvailable: false,
        message: 'Google account not connected',
        needsReconnect: true
      });
    }

    const searchConsole = google.searchconsole({
      version: 'v1',
      auth: oauth2Client
    });

    // Get sites list
    const sitesResponse = await searchConsole.sites.list();
    const sites = sitesResponse.data.siteEntry || [];

    if (sites.length === 0) {
      return res.json({
        dataAvailable: false,
        message: 'No sites found in Search Console'
      });
    }

    const siteUrl = sites[0].siteUrl;

    // Note: Google Search Console API v1 has very limited backlink support
    // Backlink data is primarily available through the Search Console UI
    // For comprehensive backlink analysis, third-party tools are recommended

    res.json({
      dataAvailable: false,
      siteUrl: siteUrl,
      message: 'Backlink data is limited in Google Search Console API',
      note: 'GSC API v1 does not provide detailed backlink data. You can view backlinks in the Search Console UI at https://search.google.com/search-console under "Links" section.',
      recommendation: 'For comprehensive backlink analysis, consider using: Ahrefs, Moz, Semrush, or Majestic',
      topLinkingSites: [],
      topLinkingPages: []
    });

  } catch (error) {
    console.error('❌ Error fetching backlinks:', error);
    res.status(500).json({
      error: 'Failed to fetch backlinks data',
      dataAvailable: false
    });
  }
});

// NEW: Setup backlinks scraper with interactive login (first-time only)
router.post('/search-console/setup-backlinks-scraper', async (req, res) => {
  try {
    const { email, domain } = req.body;

    if (!email || !domain) {
      return res.status(400).json({
        error: 'Email and domain are required',
        success: false
      });
    }

    console.log(`🔧 Setting up backlinks scraper for: ${email}, domain: ${domain}`);

    // Launch Puppeteer with interactive login (non-headless)
    const result = await gscBacklinksScraper.scrapeBacklinksWithSession(email, domain, true);

    res.json({
      success: result.dataAvailable,
      message: result.dataAvailable
        ? 'Backlinks scraper setup successfully! Future requests will use the saved session.'
        : 'Setup completed but no backlinks data found. Session is saved for future use.',
      data: result
    });

  } catch (error) {
    console.error('❌ Error setting up backlinks scraper:', error);
    res.status(500).json({
      error: 'Failed to setup backlinks scraper',
      success: false,
      message: error.message
    });
  }
});

export default router;
