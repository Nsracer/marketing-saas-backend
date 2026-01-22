import https from 'https';

const competitorAnalysisService = {
  /**
   * Main function to analyze a website using external Puppeteer API
   * @param {string} domain - The domain to analyze
   * @returns {Object} Comprehensive analysis data
   */
  async analyzeWebsite(domain) {
    // Validate input
    if (!domain || typeof domain !== 'string') {
      console.error('❌ Invalid domain provided:', domain);
      return {
        success: false,
        error: 'Invalid domain parameter',
        domain: domain
      };
    }

    let cleanDomain = domain.trim();
    
    // Remove protocol if present to get clean domain
    cleanDomain = cleanDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');

    try {
      console.log(`🔍 Starting Puppeteer API analysis for: ${cleanDomain}`);

      // Get API URL from environment variable or use default
      const puppeteerApiUrl = process.env.PUPPETEER_API_URL || 
        'https://puppeteer-on-vercel-red.vercel.app/api/analyze';
      
      const apiUrl = `${puppeteerApiUrl}?domain=${encodeURIComponent(cleanDomain)}`;
      
      // Use fetch API instead of axios for better compatibility
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          ...(process.env.PUPPETEER_API_KEY && {
            'Authorization': `Bearer ${process.env.PUPPETEER_API_KEY}`
          })
        },
        signal: AbortSignal.timeout(120000) // 2 minutes timeout
      });

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}: ${response.statusText}`);
      }

      const apiData = await response.json();

      // Check if API call was successful
      if (!apiData.success) {
        throw new Error(apiData.error || 'API analysis failed');
      }

      console.log(`✅ Puppeteer API analysis completed for: ${cleanDomain}`);

      // Return data in the expected format (API already provides correct structure)
      return {
        success: true,
        url: apiData.url,
        domain: apiData.domain,
        timestamp: apiData.timestamp || new Date().toISOString(),
        statusCode: apiData.statusCode,
        
        // Security & Technical
        security: apiData.security || {
          isHTTPS: false,
          server: null,
          cdn: null,
          mixedContent: false,
          mixedContentCount: 0,
          hasServiceWorker: false
        },
        
        // Robots and Sitemap
        robotsTxt: apiData.robotsTxt || {
          exists: false,
          accessible: false
        },
        sitemap: apiData.sitemap || {
          exists: false,
          accessible: false,
          urlCount: 0
        },
        
        // SEO Elements
        seo: apiData.seo || {
          title: null,
          metaDescription: null,
          canonical: null,
          robotsMeta: null,
          headings: { h1: [], h2: [], h3: [], h1Count: 0, h2Count: 0, h3Count: 0 },
          openGraph: {},
          twitterCard: {},
          schemaMarkup: []
        },
        
        // Content Analysis
        content: apiData.content || {
          wordCount: 0,
          paragraphCount: 0,
          images: { total: 0, withAlt: 0, altCoverage: 0 },
          links: { total: 0, internal: 0, external: 0, broken: 0 }
        },
        
        // Technology Stack
        technology: apiData.technology || {
          cms: null,
          frameworks: [],
          analytics: [],
          thirdPartyScripts: []
        }
      };

    } catch (error) {
      console.error(`❌ Puppeteer API analysis failed for ${cleanDomain}:`, error.message);

      return {
        success: false,
        url: `https://${cleanDomain}`,
        domain: cleanDomain,
        error: error.message,
        errorType: this.categorizeError(error),
        timestamp: new Date().toISOString()
      };
    }
  },

  /**
   * Categorize error type for better error handling
   */
  categorizeError(error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('timeout') || message.includes('timed out')) {
      return 'TIMEOUT';
    }
    if (message.includes('enotfound') || message.includes('dns')) {
      return 'DNS_ERROR';
    }
    if (message.includes('econnrefused') || message.includes('connection refused')) {
      return 'CONNECTION_REFUSED';
    }
    if (message.includes('certificate') || message.includes('ssl')) {
      return 'SSL_ERROR';
    }
    if (message.includes('navigation') || message.includes('net::')) {
      return 'NAVIGATION_ERROR';
    }
    if (message.includes('econnreset') || message.includes('socket hang up')) {
      return 'CONNECTION_RESET';
    }
    
    return 'UNKNOWN_ERROR';
  }
};

export default competitorAnalysisService;
