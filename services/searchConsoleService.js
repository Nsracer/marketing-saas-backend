// services/searchConsoleService.js - FREE Google Search Console API
import { google } from 'googleapis';

const searchConsoleService = {
  async getSearchConsoleData(domain, days = 30) {
    try {
      const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
      });

      const searchconsole = google.searchconsole({
        version: 'v1',
        auth: auth,
      });

      const siteUrl = domain.startsWith('http') ? domain : `https://${domain}`;

      // Calculate dates for last N days
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const formatDate = (date) => date.toISOString().split('T')[0];

      // 1. Get search analytics data by query (top queries)
      const queryAnalytics = await searchconsole.searchanalytics.query({
        siteUrl: siteUrl,
        requestBody: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: ['query'],
          rowLimit: 100,
          dataState: 'final'
        }
      });

      // 2. Get search analytics data by page (top pages)
      const pageAnalytics = await searchconsole.searchanalytics.query({
        siteUrl: siteUrl,
        requestBody: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: ['page'],
          rowLimit: 100,
          dataState: 'final'
        }
      });

      // 3. Get daily data for graph (clicks, impressions, CTR, position by date)
      const dailyAnalytics = await searchconsole.searchanalytics.query({
        siteUrl: siteUrl,
        requestBody: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: ['date'],
          dataState: 'final'
        }
      });

      // 4. Get site info and indexing status
      const siteInfo = await searchconsole.sites.get({
        siteUrl: siteUrl
      });

      // Calculate total metrics from query data
      const totalClicks = queryAnalytics.data.rows?.reduce((sum, row) => sum + row.clicks, 0) || 0;
      const totalImpressions = queryAnalytics.data.rows?.reduce((sum, row) => sum + row.impressions, 0) || 0;
      const averageCTR = queryAnalytics.data.rows?.length ?
        queryAnalytics.data.rows.reduce((sum, row) => sum + row.ctr, 0) / queryAnalytics.data.rows.length : 0;
      const averagePosition = queryAnalytics.data.rows?.length ?
        queryAnalytics.data.rows.reduce((sum, row) => sum + row.position, 0) / queryAnalytics.data.rows.length : 0;

      // Calculate organic traffic (total clicks from all pages)
      const organicTraffic = pageAnalytics.data.rows?.reduce((sum, row) => sum + row.clicks, 0) || 0;

      return {
        // Summary metrics
        totalClicks,
        totalImpressions,
        averageCTR,
        averagePosition,
        organicTraffic,

        // Top 10 Queries
        topQueries: queryAnalytics.data.rows?.slice(0, 10).map(row => ({
          query: row.keys[0],
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position
        })) || [],

        // Top Pages by traffic
        topPages: pageAnalytics.data.rows?.slice(0, 10).map(row => ({
          page: row.keys[0],
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position
        })) || [],

        // Daily data for graph
        dailyData: dailyAnalytics.data.rows?.map(row => ({
          date: row.keys[0],
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position
        })) || [],

        siteVerified: siteInfo.data.permissionLevel === 'siteOwner',
        dataAvailable: true,
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      console.error('Search Console API failed:', error.message);
      return null;
    }
  },

  // New method to get backlinks data (linking sites and pages)
  async getBacklinksData(domain) {
    try {
      const auth = new google.auth.GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
      });

      const searchconsole = google.searchconsole({
        version: 'v1',
        auth: auth,
      });

      const siteUrl = domain.startsWith('http') ? domain : `https://${domain}`;

      // Get links to your site (backlinks)
      const siteLinks = await searchconsole.sites.get({
        siteUrl: siteUrl
      });

      // Note: Google Search Console API doesn't provide detailed backlink data
      // This would need to be supplemented with third-party APIs like Ahrefs, Moz, or Semrush
      // For now, return placeholder structure
      return {
        topLinkingSites: [],
        topLinkingPages: [],
        message: 'Backlink data requires third-party API integration (Ahrefs, Moz, Semrush)',
        dataAvailable: false
      };

    } catch (error) {
      console.error('Backlinks API failed:', error.message);
      return {
        topLinkingSites: [],
        topLinkingPages: [],
        dataAvailable: false
      };
    }
  },

  // Try to fetch top linking sites and pages using GSC API with authenticated OAuth2 client
  async getBacklinksDataWithClient(oauth2Client, domain) {
    try {
      // Use axios to call the Links API directly since googleapis may not expose it properly
      const axios = (await import('axios')).default;

      const siteUrl = domain.startsWith('http') ? domain : `https://${domain}`;

      // Get access token from oauth2Client
      const accessToken = oauth2Client.credentials.access_token;

      if (!accessToken) {
        console.log('⚠️ No access token available for backlinks fetch');
        return {
          dataAvailable: false,
          topLinkingSites: [],
          topLinkingPages: [],
          note: 'Authentication token not available'
        };
      }

      console.log(`🔗 Attempting to fetch backlinks for: ${siteUrl}`);

      // Try to fetch from GSC Links API (this may or may not be available depending on GSC account)
      try {
        const linksResponse = await axios.get(
          `https://searchconsole.googleapis.com/v1/urlTestingTools/mobileFriendlyTest/sites/${encodeURIComponent(siteUrl)}/links`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json'
            },
            timeout: 15000
          }
        ).catch(err => {
          // If 404 or method not allowed, try alternative endpoint
          if (err.response?.status === 404 || err.response?.status === 405) {
            console.log('📍 Links endpoint not available, trying alternative...');
            return null;
          }
          throw err;
        });

        if (linksResponse && linksResponse.data) {
          const linksData = linksResponse.data;

          // Parse top linking sites
          const topLinkingSites = (linksData.sampleLinkingSites || linksData.topLinkingSites || [])
            .slice(0, 10)
            .map(site => ({
              domain: typeof site === 'string' ? site : site.siteUrl || site.domain,
              links: site.linkCount || site.links || 0,
              authority: site.domainAuthority || null
            }));

          // Parse top linking pages  
          const topLinkingPages = (linksData.sampleLinkingPages || linksData.topLinkingPages || [])
            .slice(0, 10)
            .map(page => ({
              url: typeof page === 'string' ? page : page.pageUrl || page.url,
              backlinks: page.linkCount || page.backlinks || page.links || 0
            }));

          console.log(`✅ Found ${topLinkingSites.length} linking sites and ${topLinkingPages.length} linking pages`);

          return {
            dataAvailable: true,
            topLinkingSites: topLinkingSites.length > 0 ? topLinkingSites : [],
            topLinkingPages: topLinkingPages.length > 0 ? topLinkingPages : [],
            totalBacklinks: linksData.totalLinks || 0,
            note: topLinkingSites.length === 0 && topLinkingPages.length === 0
              ? 'No backlink data available in Google Search Console for this property yet.'
              : null
          };
        }
      } catch (apiError) {
        console.log('⚠️ Links API not accessible:', apiError.response?.status || apiError.message);
      }

      // Fallback: Return null/empty arrays since GSC public API doesn't expose backlinks
      console.log('📊 Backlink data not available via GSC API');
      return {
        dataAvailable: false,
        topLinkingSites: [],
        topLinkingPages: [],
        totalBacklinks: 0,
        note: 'Google Search Console API does not expose backlink data via the public API. Backlink information is only available in the GSC web interface under "Links" section, or via third-party SEO tools (Ahrefs, Moz, Semrush).'
      };

    } catch (error) {
      console.error('❌ getBacklinksDataWithClient failed:', error.message);
      return {
        dataAvailable: false,
        topLinkingSites: [],
        topLinkingPages: [],
        totalBacklinks: 0,
        note: `Error retrieving backlink data: ${error.message}`
      };
    }
  },

  convertSearchMetricsToScore(data) {
    if (!data) return null;

    const scores = {};

    if (data.averageCTR > 0.03) scores.ctr = 100;
    else if (data.averageCTR > 0.01) scores.ctr = Math.round((data.averageCTR / 0.03) * 100);
    else scores.ctr = 25;

    if (data.averagePosition <= 10) scores.position = 100;
    else if (data.averagePosition <= 30) scores.position = Math.round(((30 - data.averagePosition) / 20) * 100);
    else scores.position = 25;

    const impressionScore = Math.min(100, Math.round((data.totalImpressions / 1000) * 10));
    scores.visibility = impressionScore;

    return {
      ctr: scores.ctr,
      position: scores.position,
      visibility: scores.visibility,
      average: Math.round((scores.ctr + scores.position + scores.visibility) / 3)
    };
  }
};

export default searchConsoleService;
