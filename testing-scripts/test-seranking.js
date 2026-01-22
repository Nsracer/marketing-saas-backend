import fetch from 'node-fetch';

// ========================================
// Configuration - Edit these values
// ========================================
const API_KEY = 'c2ec32d1-cd63-0a6e-e431-e097f196e8a6';
const BASE_URL = 'https://api.seranking.com';
const TEST_DOMAIN = 'pes.edu';

// ========================================
// SE Ranking Service (Updated per official docs)
// ========================================
const seRankingService = {
  async getBacklinksSummary(domain) {
    try {
      const apiKey = API_KEY;
      let baseUrl = BASE_URL;

      baseUrl = baseUrl.replace(/\/$/, '');

      if (!apiKey) {
        console.warn('⚠️ SE Ranking API token not configured');
        return {
          available: false,
          reason: 'API token not configured'
        };
      }

      let cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
      cleanDomain = cleanDomain.split('/')[0];

      console.log(`🔗 Fetching SE Ranking backlinks data for: ${cleanDomain}`);
      console.log(`🌐 Using API base URL: ${baseUrl}`);

      // Per official docs: apikey can be passed as query parameter
      const params = new URLSearchParams({
        apikey: apiKey,
        target: cleanDomain,
        mode: 'host',
        output: 'json'
      });

      const url = `${baseUrl}/v1/backlinks/summary?${params.toString()}`;

      console.log(`📡 Making API request...`);
      console.log(`🎯 Target: ${cleanDomain}`);
      console.log(`🔑 Auth: Using apikey query parameter`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

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

          if (response.status === 400) {
            console.error('💡 Bad Request - Check API parameters and domain format');
            return {
              available: false,
              reason: `Bad Request: ${errorJson?.message || errorText || 'Invalid parameters'}`
            };
          }

          if (response.status === 401) {
            console.error('💡 Unauthorized - Check your API key');
            return {
              available: false,
              reason: 'Invalid API token'
            };
          }

          if (response.status === 403) {
            console.error('💡 Forbidden - API key may not have permission');
            return {
              available: false,
              reason: 'API key does not have permission'
            };
          }

          if (response.status === 429) {
            return {
              available: false,
              reason: 'API rate limit exceeded. Please try again later.'
            };
          }

          throw new Error(`SE Ranking API returned ${response.status}: ${errorJson?.message || errorText}`);
        }

        const data = await response.json();
        console.log('✅ SE Ranking backlinks data received');
        console.log('📦 Response structure:', JSON.stringify(Object.keys(data), null, 2));

        if (data.summary) {
          console.log('📊 Summary array length:', data.summary.length);
        } else {
          console.log('⚠️ No summary field in response. Full response:');
          console.log(JSON.stringify(data, null, 2));
        }

        const summary = data.summary && data.summary.length > 0 ? data.summary[0] : null;

        if (!summary) {
          console.warn('⚠️ No backlinks data available for domain');
          return {
            available: false,
            reason: 'No backlinks data available for this domain',
            rawResponse: data
          };
        }

        const topLinkingSites = this.extractTopLinkingSites(summary.top_pages_by_refdomains || []);

        const topLinkingPages = (summary.top_pages_by_backlinks || []).slice(0, 10).map(page => ({
          url: page.url,
          backlinks: page.backlinks,
          domain: this.extractDomain(page.url)
        }));

        const result = {
          available: true,
          totalBacklinks: summary.backlinks || 0,
          totalRefDomains: summary.refdomains || 0,

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

          domainMetrics: {
            inlinkRank: summary.inlink_rank || 0,
            domainInlinkRank: summary.domain_inlink_rank || 0,
            dofollowRefDomains: summary.dofollow_refdomains || 0,
            eduRefDomains: summary.edu_refdomains || 0,
            govRefDomains: summary.gov_refdomains || 0,
            anchors: summary.anchors || 0,
            pagesWithBacklinks: summary.pages_with_backlinks || 0
          },

          topLinkingSites: topLinkingSites,
          topLinkingPages: topLinkingPages,
          topAnchors: (summary.top_anchors_by_refdomains || []).slice(0, 10).map(anchor => ({
            anchor: anchor.anchor || 'Unknown',
            refdomains: anchor.refdomains || 0
          })),

          topTlds: (summary.top_tlds || []).slice(0, 5).map(tld => ({
            tld: tld.tld || 'Unknown',
            count: tld.count || 0
          })),

          topCountries: (summary.top_countries || []).slice(0, 5).map(country => ({
            country: country.country || 'Unknown',
            count: country.count || 0
          })),

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
            reason: 'Request timed out after 30 seconds'
          };
        }
        throw fetchError;
      }

    } catch (error) {
      console.error('❌ SE Ranking backlinks fetch failed:', error.message);
      console.error('📋 Error details:', error);

      if (error.code === 'ENOTFOUND') {
        console.error('🌐 DNS resolution failed - Cannot find api.seranking.com');
      } else if (error.code === 'ECONNREFUSED') {
        console.error('🌐 Connection refused by server');
      } else if (error.code === 'ECONNRESET') {
        console.error('🌐 Connection reset by server');
      } else if (error.type === 'system') {
        console.error('🌐 System error - Check internet connection and firewall');
      }

      return {
        available: false,
        reason: `API error: ${error.message}`,
        error: error.message,
        errorCode: error.code
      };
    }
  },

  extractTopLinkingSites(topPages) {
    const sitesMap = new Map();

    topPages.forEach(page => {
      const domain = this.extractDomain(page.url);
      if (domain) {
        if (sitesMap.has(domain)) {
          const existing = sitesMap.get(domain);
          existing.refdomains += page.refdomains || 0;
          existing.links = (existing.links || 1) + 1;
        } else {
          sitesMap.set(domain, {
            domain: domain,
            refdomains: page.refdomains || 0,
            links: 1,
            authority: 'N/A'
          });
        }
      }
    });

    return Array.from(sitesMap.values())
      .sort((a, b) => b.refdomains - a.refdomains)
      .slice(0, 10);
  },

  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch (error) {
      const match = url.match(/^(?:https?:\/\/)?(?:www\.)?([^\/]+)/);
      return match ? match[1] : url;
    }
  }
};

// ========================================
// Test Runner
// ========================================
async function runTest() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 SE Ranking API Test Script (Updated)');
  console.log('='.repeat(60));
  console.log(`📅 Test started: ${new Date().toLocaleString()}`);
  console.log(`🎯 Testing domain: ${TEST_DOMAIN}`);
  console.log(`🔑 API Key: ${API_KEY.substring(0, 8)}...${API_KEY.substring(API_KEY.length - 4)}`);
  console.log('='.repeat(60) + '\n');

  try {
    const result = await seRankingService.getBacklinksSummary(TEST_DOMAIN);

    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST RESULTS');
    console.log('='.repeat(60) + '\n');

    if (!result.available) {
      console.log('❌ API Request Failed');
      console.log(`Reason: ${result.reason}`);
      if (result.error) {
        console.log(`Error: ${result.error}`);
      }
      if (result.errorCode) {
        console.log(`Error Code: ${result.errorCode}`);
      }
      if (result.rawResponse) {
        console.log('\n📋 Raw API Response:');
        console.log(JSON.stringify(result.rawResponse, null, 2));
      }
      return;
    }

    console.log('✅ API Request Successful\n');

    // Summary Statistics
    console.log('📈 BACKLINKS SUMMARY');
    console.log('-'.repeat(60));
    console.log(`Total Backlinks: ${result.totalBacklinks.toLocaleString()}`);
    console.log(`Total Referring Domains: ${result.totalRefDomains.toLocaleString()}`);
    console.log();

    // Backlink Metrics
    console.log('🔗 BACKLINK METRICS');
    console.log('-'.repeat(60));
    console.log(`Dofollow Backlinks: ${result.metrics.dofollowBacklinks.toLocaleString()}`);
    console.log(`Nofollow Backlinks: ${result.metrics.nofollowBacklinks.toLocaleString()}`);
    console.log(`EDU Backlinks: ${result.metrics.eduBacklinks.toLocaleString()}`);
    console.log(`GOV Backlinks: ${result.metrics.govBacklinks.toLocaleString()}`);
    console.log(`Text Backlinks: ${result.metrics.textBacklinks.toLocaleString()}`);
    console.log(`From HomePage: ${result.metrics.fromHomePageBacklinks.toLocaleString()}`);
    console.log(`Unique Subnets: ${result.metrics.subnets.toLocaleString()}`);
    console.log(`Unique IPs: ${result.metrics.ips.toLocaleString()}`);
    console.log();

    // Domain Metrics
    console.log('🌐 DOMAIN METRICS');
    console.log('-'.repeat(60));
    console.log(`Inlink Rank: ${result.domainMetrics.inlinkRank}`);
    console.log(`Domain Inlink Rank: ${result.domainMetrics.domainInlinkRank}`);
    console.log(`Dofollow Ref Domains: ${result.domainMetrics.dofollowRefDomains.toLocaleString()}`);
    console.log(`EDU Ref Domains: ${result.domainMetrics.eduRefDomains.toLocaleString()}`);
    console.log(`GOV Ref Domains: ${result.domainMetrics.govRefDomains.toLocaleString()}`);
    console.log(`Total Anchors: ${result.domainMetrics.anchors.toLocaleString()}`);
    console.log(`Pages with Backlinks: ${result.domainMetrics.pagesWithBacklinks.toLocaleString()}`);
    console.log();

    // Top Linking Sites
    if (result.topLinkingSites && result.topLinkingSites.length > 0) {
      console.log('🏆 TOP LINKING SITES');
      console.log('-'.repeat(60));
      result.topLinkingSites.slice(0, 5).forEach((site, index) => {
        console.log(`${index + 1}. ${site.domain}`);
        console.log(`   Ref Domains: ${site.refdomains} | Links: ${site.links}`);
      });
      console.log();
    }

    // Top Anchors
    if (result.topAnchors && result.topAnchors.length > 0) {
      console.log('⚓ TOP ANCHOR TEXTS');
      console.log('-'.repeat(60));
      result.topAnchors.slice(0, 5).forEach((anchor, index) => {
        console.log(`${index + 1}. "${anchor.anchor}" (${anchor.refdomains} ref domains)`);
      });
      console.log();
    }

    // Top TLDs
    if (result.topTlds && result.topTlds.length > 0) {
      console.log('🌍 TOP TLDs');
      console.log('-'.repeat(60));
      result.topTlds.forEach(tld => {
        console.log(`  .${tld.tld}: ${tld.count} backlinks`);
      });
      console.log();
    }

    // Top Countries
    if (result.topCountries && result.topCountries.length > 0) {
      console.log('🗺️ TOP COUNTRIES');
      console.log('-'.repeat(60));
      result.topCountries.forEach(country => {
        console.log(`  ${country.country.toUpperCase()}: ${country.count} backlinks`);
      });
      console.log();
    }

    console.log('='.repeat(60));
    console.log(`✅ Test completed successfully at ${new Date().toLocaleString()}`);
    console.log('='.repeat(60) + '\n');

    // Optionally save full result to JSON file
    console.log('💾 To save full results to JSON file, run:');
    console.log('   node -p "JSON.stringify(require(\'./test-results.json\'), null, 2)"');
    console.log();

  } catch (error) {
    console.error('\n❌ Test failed with unexpected error:');
    console.error('Message:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
  }
}

// Run the test
runTest();
