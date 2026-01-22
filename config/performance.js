/**
 * Performance Configuration
 * Adjust these settings based on your system capabilities
 */

export const performanceConfig = {
  // Lighthouse Analysis Settings
  lighthouse: {
    maxConcurrent: 1, // Number of concurrent Lighthouse analyses (1 = safest)
    queueDelay: 1000, // Delay between analyses in ms
    maxQueueSize: 5, // Maximum queue size before rejecting requests
    cacheTime: 10 * 60 * 1000, // Cache results for 10 minutes
    timeout: 120000, // 2 minutes timeout per analysis
    
    // Chrome resource limits
    chromeMemoryLimit: 512, // MB
    skipHeavyAudits: true, // Skip screenshots and detailed audits
  },

  // Rate Limiting
  rateLimit: {
    lighthouse: {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 3 // Max 3 requests per minute per IP
    },
    competitorAnalysis: {
      windowMs: 5 * 60 * 1000, // 5 minutes
      maxRequests: 2 // Max 2 analyses per 5 minutes per user
    }
  },

  // Request Settings
  request: {
    maxBodySize: '10mb', // Maximum request body size
    timeout: 120000, // 2 minutes
  },

  // Memory Management
  memory: {
    warningThresholdMB: 400, // Warn when heap usage exceeds this
    checkIntervalMs: 30000, // Check memory every 30 seconds
    forceGC: true // Force garbage collection after heavy operations
  },

  // Cache Settings
  cache: {
    enableMemoryCache: true,
    enableDatabaseCache: true,
    defaultTTL: 10 * 60 * 1000, // 10 minutes
    cleanupInterval: 10 * 60 * 1000 // Clean up every 10 minutes
  },

  // Competitor Analysis Optimization
  competitorAnalysis: {
    sequentialFetching: true, // Fetch data sequentially instead of parallel
    delayBetweenFetches: 500, // ms delay between fetches
    skipOptionalData: false, // Skip optional data sources if true
    maxRetries: 1 // Maximum retries for failed requests
  }
};

export default performanceConfig;
