import express from 'express';
import enhancedCompetitorIntelligenceService from '../services/enhancedCompetitorIntelligenceService.js';
import userBusinessInfoService from '../services/userBusinessInfoService.js';

const router = express.Router();

/**
 * Enhanced Competitor Analysis
 * Uses cached user data + live competitor data
 * 
 * POST /api/enhanced-competitor/analyze
 * Body: { email, competitorDomain, forceRefresh }
 */
router.post('/analyze', async (req, res) => {
  try {
    const { email, competitorDomain, forceRefresh = false } = req.body;

    if (!email || !competitorDomain) {
      return res.status(400).json({
        success: false,
        error: 'email and competitorDomain are required'
      });
    }

    console.log(`\n🎯 Enhanced Competitor Analysis Request`);
    console.log(`   Email: ${email}`);
    console.log(`   Competitor: ${competitorDomain}`);
    console.log(`   Force Refresh: ${forceRefresh}\n`);

    const result = await enhancedCompetitorIntelligenceService.analyzeCompetitor(
      email,
      competitorDomain,
      { forceRefresh }
    );

    res.json(result);

  } catch (error) {
    console.error('❌ Error in enhanced competitor analysis:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get competitor suggestions from GA
 * 
 * GET /api/enhanced-competitor/suggestions?email=user@example.com
 */
router.get('/suggestions', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'email is required'
      });
    }

    // Get competitors from business info
    const businessInfo = await userBusinessInfoService.getUserBusinessInfo(email);
    const competitors = businessInfo?.competitors || [];

    res.json({
      success: true,
      competitors: competitors.map(c => ({
        id: c.id,
        name: c.name,
        domain: c.domain,
        hasSocialHandles: !!(c.facebook || c.instagram || c.linkedin),
        socialHandles: {
          facebook: c.facebook || null,
          instagram: c.instagram || null,
          linkedin: c.linkedin || null
        }
      }))
    });

  } catch (error) {
    console.error('❌ Error getting competitor suggestions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Compare multiple competitors at once
 * 
 * POST /api/enhanced-competitor/compare-multiple
 * Body: { email, competitorDomains: ['domain1.com', 'domain2.com'] }
 */
router.post('/compare-multiple', async (req, res) => {
  try {
    const { email, competitorDomains, forceRefresh = false } = req.body;

    if (!email || !competitorDomains || !Array.isArray(competitorDomains)) {
      return res.status(400).json({
        success: false,
        error: 'email and competitorDomains array are required'
      });
    }

    console.log(`\n📊 Comparing ${competitorDomains.length} competitors for ${email}\n`);

    // Analyze each competitor
    const results = await Promise.all(
      competitorDomains.map(domain =>
        enhancedCompetitorIntelligenceService.analyzeCompetitor(
          email,
          domain,
          { forceRefresh }
        ).catch(error => ({
          success: false,
          domain,
          error: error.message
        }))
      )
    );

    // Separate successful and failed analyses
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    res.json({
      success: true,
      totalCompetitors: competitorDomains.length,
      successfulAnalyses: successful.length,
      failedAnalyses: failed.length,
      results: successful,
      errors: failed
    });

  } catch (error) {
    console.error('❌ Error in multiple competitor comparison:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get cached analysis if available
 * 
 * GET /api/enhanced-competitor/cached?email=user@example.com&competitorDomain=competitor.com
 */
router.get('/cached', async (req, res) => {
  try {
    const { email, competitorDomain } = req.query;

    if (!email || !competitorDomain) {
      return res.status(400).json({
        success: false,
        error: 'email and competitorDomain are required'
      });
    }

    // Get business info for cache key
    const businessInfo = await userBusinessInfoService.getUserBusinessInfo(email);
    if (!businessInfo) {
      return res.status(404).json({
        success: false,
        error: 'User business info not found'
      });
    }

    const competitors = businessInfo.competitors || [];
    const competitorInfo = competitors.find(c => 
      c.domain.toLowerCase().includes(competitorDomain.toLowerCase())
    );

    // Import cache service
    const competitorCacheService = (await import('../services/competitorCacheService.js')).default;
    
    const cachedData = await competitorCacheService.getCompetitorCache(
      email,
      businessInfo.business_domain,
      competitorDomain,
      {
        instagram: businessInfo.instagram_handle,
        facebook: businessInfo.facebook_handle
      },
      {
        instagram: competitorInfo?.instagram,
        facebook: competitorInfo?.facebook
      }
    );

    if (cachedData) {
      res.json({
        success: true,
        cached: true,
        cacheAge: cachedData.cacheAge,
        data: cachedData
      });
    } else {
      res.json({
        success: true,
        cached: false,
        message: 'No cached data available'
      });
    }

  } catch (error) {
    console.error('❌ Error checking cache:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
