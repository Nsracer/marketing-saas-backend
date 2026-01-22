import express from 'express';
import lighthouseService from '../services/lighthouseService.js';
import websiteAnalysisCacheService from '../services/websiteAnalysisCacheService.js';

const router = express.Router();

// Simple in-memory cache (2 day expiry - increased for better performance)
const cache = new Map();
const CACHE_TTL = 48 * 60 * 60 * 1000; // 2 days (48 hours)

// Rate limiting per IP (prevent abuse)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 3; // Max 3 requests per minute per IP

const checkRateLimit = (ip) => {
  const now = Date.now();
  const userRequests = rateLimitMap.get(ip) || [];

  // Remove old requests outside the window
  const recentRequests = userRequests.filter(time => now - time < RATE_LIMIT_WINDOW);

  if (recentRequests.length >= MAX_REQUESTS_PER_WINDOW) {
    return false; // Rate limit exceeded
  }

  recentRequests.push(now);
  rateLimitMap.set(ip, recentRequests);
  return true;
};

// Clean up rate limit map every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, requests] of rateLimitMap.entries()) {
    const recentRequests = requests.filter(time => now - time < RATE_LIMIT_WINDOW);
    if (recentRequests.length === 0) {
      rateLimitMap.delete(ip);
    } else {
      rateLimitMap.set(ip, recentRequests);
    }
  }
}, 5 * 60 * 1000);

// Analyze a domain with Lighthouse
router.get('/lighthouse/:domain', async (req, res) => {
  try {
    const { domain } = req.params;
    const { email } = req.query; // Get user email from query params
    const clientIp = req.ip || req.connection.remoteAddress;

    if (!domain) {
      return res.status(400).json({ error: 'Domain parameter is required' });
    }

    // Check rate limit
    if (!checkRateLimit(clientIp)) {
      console.log(`⚠️ Rate limit exceeded for IP: ${clientIp}`);
      return res.status(429).json({
        error: 'Too many requests',
        message: 'Please wait a minute before analyzing another site',
        retryAfter: 60
      });
    }

    // Check queue status
    const queueStatus = lighthouseService.getQueueStatus();
    if (queueStatus.queueLength > 5) {
      return res.status(503).json({
        error: 'Server busy',
        message: 'Too many analysis requests in queue. Please try again in a few minutes.',
        queueLength: queueStatus.queueLength
      });
    }

    // Check database cache first if email is provided
    if (email) {
      const dbCache = await websiteAnalysisCacheService.getAnalysisCache(email, domain);
      if (dbCache) {
        console.log(`📦 Returning cached results from database for: ${domain}`);
        return res.json(dbCache.full_analysis);
      }
    }

    // Check in-memory cache
    const cacheKey = domain.toLowerCase();
    const cached = cache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log(`📦 Returning cached results from memory for: ${domain}`);
      return res.json(cached.data);
    }

    console.log(`📊 Starting Lighthouse analysis for: ${domain}`);

    const result = await lighthouseService.analyzeSite(domain);

    if (!result) {
      return res.status(500).json({
        error: 'Failed to analyze site',
        message: 'Lighthouse analysis returned no results'
      });
    }

    // Cache in memory
    cache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    // Save to database if email is provided
    if (email) {
      const analysisData = {
        healthScore: {
          overall: result.categoryScores?.seo || 0,
          overall_score: result.categoryScores?.seo || 0,
          performance: result.categoryScores?.performance || 0,
          accessibility: result.categoryScores?.accessibility || 0,
          bestPractices: result.categoryScores?.bestPractices || 0,
          breakdown: {
            seo: result.categoryScores?.seo || 0,
            performance: result.categoryScores?.performance || 0,
            accessibility: result.categoryScores?.accessibility || 0,
            bestPractices: result.categoryScores?.bestPractices || 0
          }
        },
        quickWins: result.opportunities?.slice(0, 10) || [],
        fullAnalysis: result
      };

      await websiteAnalysisCacheService.saveAnalysisCache(email, domain, analysisData);
      console.log(`💾 Saved analysis to database for: ${email} - ${domain}`);
    }

    console.log(`✅ Lighthouse analysis completed for: ${domain}`);
    return res.json(result);

  } catch (error) {
    console.error('❌ Error in lighthouse analysis:', error);
    return res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

// Get user's last analyzed domain
router.get('/lighthouse/last-domain/:email', async (req, res) => {
  try {
    const { email } = req.params;

    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }

    const lastDomain = await websiteAnalysisCacheService.getLastAnalyzedDomain(email);

    if (!lastDomain) {
      return res.json({ domain: null, message: 'No previous analysis found' });
    }

    return res.json(lastDomain);

  } catch (error) {
    console.error('❌ Error getting last domain:', error);
    return res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

// Get cached analysis for a domain
router.get('/lighthouse/cache/:email/:domain', async (req, res) => {
  try {
    const { email, domain } = req.params;

    if (!email || !domain) {
      return res.status(400).json({ error: 'Email and domain parameters are required' });
    }

    const cachedData = await websiteAnalysisCacheService.getAnalysisCache(email, domain);

    if (!cachedData) {
      return res.json({ cached: false, message: 'No cached data found' });
    }

    return res.json({
      cached: true,
      data: cachedData,
      healthScore: cachedData.health_score,
      quickWins: cachedData.quick_wins
    });

  } catch (error) {
    console.error('❌ Error getting cached analysis:', error);
    return res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
});

// Clean up old cache entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}, 10 * 60 * 1000);

export default router;