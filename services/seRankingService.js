import fetch from 'node-fetch';

const seRankingService = {
  /**
   * Get backlinks summary for a domain from SE Ranking API
   * @param {string} domain - Domain to analyze (e.g., 'example.com')
   * @returns {Promise<Object>} Backlinks data
   */
  async getBacklinksSummary(domain) {
    try {
      const apiKey = process.env.SE_RANKING_API_TOKEN;
      let baseUrl = process.env.SE_RANKING_BASE_URL || 'https://api.seranking.com';
      
      // Remove trailing slash from base URL if present
      baseUrl = baseUrl.replace(/\/$/, '');

      if (!apiKey) {
        console.warn('⚠️ SE Ranking API token not configured');
        return {
          available: false,
          reason: 'API token not configured',
          totalBacklinks: 0,
          totalRefDomains: 0,
          topLinkingSites: [],
          topLinkingPages: []
        };
      }

      // Clean domain - remove protocol, www, and trailing slash
      let cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
      
      // Remove any path - just get the domain
      cleanDomain = cleanDomain.split('/')[0];
      
      console.log(`🔗 Fetching SE Ranking backlinks data for: ${cleanDomain}`);
      console.log(`🌐 Using API base URL: ${baseUrl}`);

      // SE Ranking API v1 Backlinks endpoint
      // Per official docs: apikey is passed as query parameter (not header)
      const params = new URLSearchParams({
        apikey: apiKey,
        target: cleanDomain,
        mode: 'host',        // Options: host, domain, url
        output: 'json'
      });

      const url = `${baseUrl}/v1/backlinks/summary?${params.toString()}`;
      
      console.log(`📡 Full API Request URL: ${url.replace(apiKey, 'API_KEY_HIDDEN')}`);
      console.log(`🎯 Target domain: ${cleanDomain}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'SaaS-Platform/1.0'
          },
          signal: controller.signal
        });

        clearTimeout(timeout);

        console.log(`📨 Response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
          let errorText = '';
          let errorJson = null;
          
          try {
            errorText = await response.text();
            errorJson = JSON.parse(errorText);
            console.error(`❌ SE Ranking API error ${response.status}:`, JSON.stringify(errorJson, null, 2));
          } catch (e) {
            console.error(`❌ SE Ranking API error ${response.status}:`, errorText);
          }
        
        // Handle specific error cases
        if (response.status === 400) {
          console.error('💡 Bad Request - Check API parameters and domain format');
          console.error('💡 Requested domain:', cleanDomain);
          console.error('💡 Error details:', errorJson || errorText);
          return {
            available: false,
            reason: `Bad Request: ${errorJson?.message || errorText || 'Invalid parameters'}`,
            totalBacklinks: 0,
            totalRefDomains: 0,
            topLinkingSites: [],
            topLinkingPages: []
          };
        }
        
        if (response.status === 401) {
          return {
            available: false,
            reason: 'Invalid API token',
            totalBacklinks: 0,
            totalRefDomains: 0,
            topLinkingSites: [],
            topLinkingPages: []
          };
        }
        
        if (response.status === 429) {
          return {
            available: false,
            reason: 'API rate limit exceeded. Please try again later.',
            totalBacklinks: 0,
            totalRefDomains: 0,
            topLinkingSites: [],
            topLinkingPages: []
          };
        }

        throw new Error(`SE Ranking API returned ${response.status}: ${errorJson?.message || errorText}`);
      }

      const data = await response.json();
      console.log('✅ SE Ranking backlinks data received');
      console.log('📦 Response structure:', JSON.stringify(Object.keys(data), null, 2));
      
      // Debug: Check if data.summary exists
      if (data.summary) {
        console.log('📊 Summary array length:', data.summary.length);
      } else {
        console.log('⚠️ No summary field in response. Full data keys:', Object.keys(data));
      }

      // Process the response
      const summary = data.summary && data.summary.length > 0 ? data.summary[0] : null;

      if (!summary) {
        console.warn('⚠️ No backlinks data available for domain');
        console.warn('📋 Available data fields:', Object.keys(data));
        return {
          available: false,
          reason: 'No backlinks data available for this domain',
          totalBacklinks: 0,
          totalRefDomains: 0,
          topLinkingSites: [],
          topLinkingPages: []
        };
      }

      // Extract top linking sites from top_pages_by_refdomains
      const topLinkingSites = this.extractTopLinkingSites(summary.top_pages_by_refdomains || []);

      // Extract top linking pages
      const topLinkingPages = (summary.top_pages_by_backlinks || []).slice(0, 10).map(page => ({
        url: page.url,
        backlinks: page.backlinks,
        domain: this.extractDomain(page.url)
      }));

      // Build comprehensive response
      const result = {
        available: true,
        totalBacklinks: summary.backlinks || 0,
        totalRefDomains: summary.refdomains || 0,
        
        // Backlink metrics
        metrics: {
          dofollowBacklinks: summary.dofollow_backlinks || 0,
          nofollowBacklinks: summary.nofollow_backlinks || 0,
          eduBacklinks: summary.edu_backlinks || 0,
          govBacklinks: summary.gov_backlinks || 0,
          textBacklinks: summary.text_backlinks || 0,
          fromHomePageBacklinks: summary.from_home_page_backlinks || 0,
          subnets: summary.subnets || 0,
          ips: summary.ips || 0
        },

        // Domain metrics
        domainMetrics: {
          inlinkRank: summary.inlink_rank || 0,
          domainInlinkRank: summary.domain_inlink_rank || 0,
          dofollowRefDomains: summary.dofollow_refdomains || 0,
          eduRefDomains: summary.edu_refdomains || 0,
          govRefDomains: summary.gov_refdomains || 0,
          anchors: summary.anchors || 0,
          pagesWithBacklinks: summary.pages_with_backlinks || 0
        },

        // Top data
        topLinkingSites: topLinkingSites,
        topLinkingPages: topLinkingPages,
        topAnchors: (summary.top_anchors_by_refdomains || []).slice(0, 10).map(anchor => ({
          anchor: anchor.anchor || 'Unknown',
          refdomains: anchor.refdomains || 0
        })),
        topTlds: (summary.top_tlds || []).slice(0, 5),
        topCountries: (summary.top_countries || []).slice(0, 5),

        // Raw summary for any additional processing
        rawSummary: summary,
        
        lastUpdated: new Date().toISOString(),
        source: 'SE Ranking'
      };

      console.log(`📊 Processed: ${result.totalBacklinks} backlinks from ${result.totalRefDomains} domains`);
      return result;

      } catch (fetchError) {
        clearTimeout(timeout);
        if (fetchError.name === 'AbortError') {
          console.error('⏱️ SE Ranking API request timed out after 30 seconds');
          return {
            available: false,
            reason: 'Request timed out after 30 seconds',
            totalBacklinks: 0,
            totalRefDomains: 0,
            topLinkingSites: [],
            topLinkingPages: []
          };
        }
        throw fetchError;
      }

    } catch (error) {
      console.error('❌ SE Ranking backlinks fetch failed:', error.message);
      
      // Check if it's a network error
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        console.error('🌐 Network error: Unable to reach SE Ranking API');
        console.error('💡 Check your internet connection or SE Ranking API status');
      }
      
      return {
        available: false,
        reason: `API error: ${error.message}`,
        totalBacklinks: 0,
        totalRefDomains: 0,
        topLinkingSites: [],
        topLinkingPages: [],
        error: error.message
      };
    }
  },

  /**
   * Extract top linking sites (unique domains) from top pages
   * @param {Array} topPages - Array of top pages by refdomains
   * @returns {Array} Array of top linking sites with metrics
   */
  extractTopLinkingSites(topPages) {
    const sitesMap = new Map();

    topPages.forEach(page => {
      const domain = this.extractDomain(page.url);
      if (domain) {
        if (sitesMap.has(domain)) {
          // Aggregate refdomains if domain appears multiple times
          const existing = sitesMap.get(domain);
          existing.refdomains += page.refdomains || 0;
          existing.links = (existing.links || 1) + 1;
        } else {
          sitesMap.set(domain, {
            domain: domain,
            refdomains: page.refdomains || 0,
            links: 1,
            authority: 'N/A' // Could be calculated from inlink_rank if available per domain
          });
        }
      }
    });

    // Convert to array and sort by refdomains
    return Array.from(sitesMap.values())
      .sort((a, b) => b.refdomains - a.refdomains)
      .slice(0, 10);
  },

  /**
   * Extract domain from URL
   * @param {string} url - Full URL
   * @returns {string} Domain name
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch (error) {
      // If URL parsing fails, try simple extraction
      const match = url.match(/^(?:https?:\/\/)?(?:www\.)?([^\/]+)/);
      return match ? match[1] : url;
    }
  },

  /**
   * Format backlinks data for cache storage
   * @param {Object} backlinksData - Backlinks data from SE Ranking
   * @returns {Object} Formatted data for cache
   */
  formatForCache(backlinksData) {
    if (!backlinksData.available) {
      return {
        available: false,
        note: backlinksData.reason || 'No backlinks data available'
      };
    }

    return {
      available: true,
      totalBacklinks: backlinksData.totalBacklinks,
      totalRefDomains: backlinksData.totalRefDomains,
      topLinkingSites: backlinksData.topLinkingSites,
      topLinkingPages: backlinksData.topLinkingPages,
      metrics: backlinksData.metrics,
      domainMetrics: backlinksData.domainMetrics,
      topAnchors: backlinksData.topAnchors,
      lastUpdated: backlinksData.lastUpdated,
      source: 'SE Ranking'
    };
  }
};

export default seRankingService;
