// config/scraperConfig.js - Configuration for GSC Puppeteer scraper

export const scraperConfig = {
  // Browser settings
  browser: {
    headless: true,              // Set to false for debugging
    devtools: false,              // Set to true to open DevTools automatically
    slowMo: 0,                    // Slow down by X ms (useful for debugging)
    defaultViewport: {
      width: 1920,
      height: 1080
    },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080'
    ]
  },

  // Timeout settings (in milliseconds)
  timeouts: {
    navigation: 45000,            // Page navigation timeout
    waitAfterNavigation: 3000,    // Wait time after navigation
    loginWait: 60000,             // How long to wait for user to login
    elementWait: 5000             // Wait for specific elements
  },

  // Session settings
  sessions: {
    maxAgeDays: 30,               // Clean up sessions older than this
    saveScreenshots: true,        // Save debug screenshots
    screenshotPath: 'gsc-screenshot.png'
  },

  // Scraping settings
  scraping: {
    maxResults: 10,               // Max number of sites/pages to return
    retryAttempts: 2,             // Number of retry attempts on failure
    retryDelay: 5000              // Delay between retries (ms)
  },

  // Caching (recommended to implement)
  cache: {
    enabled: false,               // TODO: Implement caching
    ttl: 3600000,                 // Cache TTL: 1 hour in milliseconds
    keyPrefix: 'gsc_backlinks_'   // Cache key prefix
  },

  // Rate limiting (recommended to implement)
  rateLimit: {
    enabled: false,               // TODO: Implement rate limiting
    maxRequestsPerMinute: 1,      // Max 1 scrape per minute per user
    maxRequestsPerHour: 10        // Max 10 scrapes per hour per user
  },

  // Monitoring & Logging
  monitoring: {
    logToFile: false,             // TODO: Implement file logging
    logFilePath: 'logs/scraper.log',
    trackMetrics: false,          // TODO: Implement metrics tracking
    alertOnFailureCount: 5        // Alert if X failures in a row
  },

  // GSC selectors (update if Google changes UI)
  selectors: {
    linkingSites: [
      'table[aria-label*="linking"] tr',
      'table[aria-label*="sites"] tr',
      '[data-testid*="linking-site"]',
      '[data-type="linking-site"]',
      'table tbody tr',
      'div[role="row"]'
    ],
    linkingPages: [
      'table[aria-label*="linking"] tr',
      'table[aria-label*="pages"] tr',
      '[data-testid*="linking-page"]',
      '[data-type="linking-page"]',
      'table tbody tr',
      'div[role="row"]'
    ],
    linkingPagesTab: [
      'button:contains("pages")',
      '[aria-label*="linking pages"]',
      '[data-tab="pages"]',
      'a[href*="linking-pages"]'
    ]
  },

  // Fallback options
  fallback: {
    useThirdPartyAPI: false,      // Switch to paid API on failure
    thirdPartyProvider: null,     // 'ahrefs', 'moz', 'semrush'
    showNoDataMessage: true       // Show message when no data available
  }
};

export default scraperConfig;
