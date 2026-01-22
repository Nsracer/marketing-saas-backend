import express from 'express';
import socialMediaCacheService from '../services/socialMediaCacheService.js';
import linkedinMetricsService from '../services/linkedinMetricsService.js';

const router = express.Router();

/**
 * Get LinkedIn metrics for dashboard (OLD ENDPOINT)
 * GET /api/linkedin/metrics?email=user@example.com
 * NOTE: This uses the original implementation. For new Apify + API version, use /api/linkedin/v2/metrics
 */
router.get('/metrics', async (req, res) => {
  let startTime = Date.now();
  let email = '';
  
  try {
    email = req.query.email;

    if (!email) {
      return res.status(400).json({
        success: false,
        dataAvailable: false,
        error: 'email_required',
        message: 'Email parameter is required'
      });
    }

    console.log('\n📊 [LinkedIn OLD] Fetching metrics for:', email);
    startTime = Date.now();

    // Check cache first
    const cachedData = await socialMediaCacheService.getCachedData(email, 'linkedin');
    if (cachedData) {
      console.log(`✅ Returning cached LinkedIn data (${cachedData.cacheAge} min old)\n`);
      return res.json({
        success: true,
        ...cachedData
      });
    }

    console.log('📡 Cache miss - fetching fresh data from old service...');

    // Use the original comprehensive metrics service
    const result = await linkedinMetricsService.getComprehensiveMetrics(email);
    
    if (!result.dataAvailable) {
      const duration = Date.now() - startTime;
      await socialMediaCacheService.logFetch(
        email, 
        'linkedin', 
        'metrics', 
        'failed', 
        duration, 
        0, 
        false, 
        result.reason
      );
      
      return res.json({
        success: false,
        dataAvailable: false,
        reason: result.reason
      });
    }

    // Cache the successful result
    await socialMediaCacheService.cacheData(email, 'linkedin', result);

    // Log successful fetch
    const duration = Date.now() - startTime;
    const dataSize = JSON.stringify(result).length;
    await socialMediaCacheService.logFetch(
      email,
      'linkedin',
      'metrics',
      'success',
      duration,
      dataSize,
      true,
      null
    );

    console.log(`✅ LinkedIn metrics fetched successfully (${duration}ms)\n`);
    
    res.json({
      success: true,
      dataAvailable: true,
      ...result
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ [LinkedIn OLD] Error:', error.message);
    
    await socialMediaCacheService.logFetch(
      email,
      'linkedin',
      'metrics',
      'failed',
      duration,
      0,
      false,
      error.message
    );
    
    res.status(500).json({
      success: false,
      dataAvailable: false,
      error: error.message
    });
  }
});

export default router;
