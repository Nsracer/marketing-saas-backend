import axios from 'axios';

/**
 * PageSpeed Service for Competitor Analysis
 * This version does NOT validate against GA/GSC connected domains
 * It can analyze any website for competitor intelligence purposes
 */
const competitorPageSpeedService = {
  async getPageSpeedData(domain) {
    let url = domain;
    
    // Ensure URL has protocol
    if (!url.startsWith('http')) {
      url = `https://${url}`;
    }

    try {
      console.log(`📱 Fetching Competitor PageSpeed data for: ${url}`);
      
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        console.log('⚠️ Google API key not configured, skipping PageSpeed');
        return {
          dataAvailable: false,
          reason: 'No API key configured'
        };
      }

      // Fetch both mobile and desktop in parallel
      console.log('📱 Fetching mobile and desktop PageSpeed data...');
      const [mobileResponse, desktopResponse] = await Promise.all([
        axios.get(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed`, {
          params: {
            url: url,
            key: apiKey,
            strategy: 'mobile',
            category: ['performance']
          },
          timeout: 60000,
          headers: {
            'User-Agent': 'SEO-Health-Analyzer/1.0'
          }
        }).catch(error => {
          console.log(`⚠️ Mobile PageSpeed failed for ${url}: ${error.message}`);
          return null;
        }),
        axios.get(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed`, {
          params: {
            url: url,
            key: apiKey,
            strategy: 'desktop',
            category: ['performance']
          },
          timeout: 60000,
          headers: {
            'User-Agent': 'SEO-Health-Analyzer/1.0'
          }
        }).catch(error => {
          console.log(`⚠️ Desktop PageSpeed failed for ${url}: ${error.message}`);
          return null;
        })
      ]);

      // Check if both failed
      if (!mobileResponse && !desktopResponse) {
        console.log(`⚠️ Both mobile and desktop PageSpeed failed for ${url}`);
        return {
          dataAvailable: false,
          reason: 'PageSpeed API request failed',
          desktop: {
            performanceScore: null,
            category: 'UNKNOWN'
          },
          mobile: {
            performanceScore: null,
            category: 'UNKNOWN'
          }
        };
      }

      const mobileData = mobileResponse ? this.extractPageSpeedMetrics(mobileResponse.data, 'mobile') : {
        strategy: 'mobile',
        performanceScore: null,
        category: 'UNKNOWN',
        fieldData: null,
        labData: {}
      };
      
      const desktopData = desktopResponse ? this.extractPageSpeedMetrics(desktopResponse.data, 'desktop') : {
        strategy: 'desktop',
        performanceScore: null,
        category: 'UNKNOWN',
        fieldData: null,
        labData: {}
      };
      
      console.log(`✅ PageSpeed data retrieved for ${domain}`);
      if (desktopData.performanceScore) {
        console.log(`   Desktop: ${desktopData.performanceScore}%`);
      }
      if (mobileData.performanceScore) {
        console.log(`   Mobile: ${mobileData.performanceScore}%`);
      }
      
      return {
        dataAvailable: true,
        url: url,
        desktop: desktopData,
        mobile: mobileData
      };

    } catch (error) {
      console.error(`❌ Competitor PageSpeed API failed for ${domain}:`, error.message);
      
      // Return structured error response
      return {
        dataAvailable: false,
        reason: error.code === 'ECONNABORTED' ? 'Timeout' : 'API Error',
        error: error.message,
        desktop: {
          performanceScore: null,
          category: 'UNKNOWN'
        },
        mobile: {
          performanceScore: null,
          category: 'UNKNOWN'
        }
      };
    }
  },

  extractPageSpeedMetrics(data, strategy) {
    const fieldData = data.loadingExperience;
    const labData = data.lighthouseResult?.audits || {};
    const categories = data.lighthouseResult?.categories || {};
    const performanceScore = categories.performance ? Math.round(categories.performance.score * 100) : null;

    // Determine category based on score
    let category = 'UNKNOWN';
    if (performanceScore !== null) {
      if (performanceScore >= 90) category = 'FAST';
      else if (performanceScore >= 50) category = 'AVERAGE';
      else category = 'SLOW';
    }

    return {
      strategy: strategy,
      performanceScore: performanceScore,
      category: category,
      fieldData: fieldData ? {
        lcp: this.extractMetricValue(fieldData.metrics?.LARGEST_CONTENTFUL_PAINT_MS),
        fid: this.extractMetricValue(fieldData.metrics?.FIRST_INPUT_DELAY_MS),
        cls: this.extractMetricValue(fieldData.metrics?.CUMULATIVE_LAYOUT_SHIFT_SCORE),
        overall_category: fieldData.overall_category || 'UNKNOWN'
      } : null,
      labData: {
        lcp: labData['largest-contentful-paint']?.numericValue || null,
        fid: labData['max-potential-fid']?.numericValue || null,
        cls: labData['cumulative-layout-shift']?.numericValue || null,
        fcp: labData['first-contentful-paint']?.numericValue || null,
        tti: labData['interactive']?.numericValue || null,
        tbt: labData['total-blocking-time']?.numericValue || null,
        speedIndex: labData['speed-index']?.numericValue || null
      }
    };
  },

  // Extract metric value from PageSpeed API response
  extractMetricValue(metric) {
    if (!metric || !metric.percentile) return null;
    return metric.percentile;
  }
};

export default competitorPageSpeedService;
