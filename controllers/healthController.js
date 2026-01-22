import lighthouseService from '../services/lighthouseService.js';
import pagespeedService from '../services/pagespeedService.js';
import analyticsService from '../services/analyticsService.js';
import scoringService from '../services/scoringService.js';
import searchConsoleService from '../services/searchConsoleService.js';
import technicalSEOService from '../services/technicalSEOService.js';

// Debug: Check if services are properly imported
console.log('🔧 Services loaded:', {
  lighthouse: !!lighthouseService,
  pagespeed: !!pagespeedService,
  analytics: !!analyticsService,
  scoring: !!scoringService,
  searchConsole: !!searchConsoleService,
  technicalSEO: !!technicalSEOService
});

const healthController = {
  async analyzeWebsite(req, res) {
    try {
      const { domain, email } = req.body;

      if (!domain) {
        return res.status(400).json({
          error: 'Domain is required',
          message: 'Please provide a domain to analyze'
        });
      }

      console.log(`🔍 Starting analysis for: ${domain}, user: ${email || 'anonymous'}`);

      // Collect data from ALL services in parallel
      const [lighthouseData, pagespeedData, analyticsData, searchConsoleData, technicalSEOData] = await Promise.allSettled([
        lighthouseService.analyzeSite(domain),
        pagespeedService.getPageSpeedData(domain),
        analyticsService.getAnalyticsData(domain),
        searchConsoleService.getSearchConsoleData(domain),
        technicalSEOService.getTechnicalSEOData(domain)
      ]);

      // Process results and handle failures
      const processedData = {
        lighthouse: lighthouseData.status === 'fulfilled' ? lighthouseData.value : null,
        pagespeed: pagespeedData.status === 'fulfilled' ? pagespeedData.value : null,
        analytics: analyticsData.status === 'fulfilled' ? analyticsData.value : null,
        searchConsole: searchConsoleData.status === 'fulfilled' ? searchConsoleData.value : null,
        technicalSEO: technicalSEOData.status === 'fulfilled' ? technicalSEOData.value : null
      };

      console.log('📊 Data collection summary:', {
        lighthouse: !!processedData.lighthouse,
        pagespeed: !!processedData.pagespeed,
        analytics: !!processedData.analytics,
        searchConsole: !!processedData.searchConsole,
        technicalSEO: !!processedData.technicalSEO
      });

      // Calculate comprehensive health score
      const healthScore = scoringService.calculateHealthScore(processedData);

      // Prepare response data
      const responseData = {
        domain,
        overall_score: healthScore.overall,
        breakdown: {
          technical: healthScore.technical,
          user_experience: healthScore.userExperience,
          seo_health: healthScore.seoHealth,
          seo: healthScore.seoHealth, // Alias for frontend compatibility
          performance: processedData.lighthouse?.categoryScores?.performance || 0,
          accessibility: processedData.lighthouse?.categoryScores?.accessibility || 0,
          bestPractices: processedData.lighthouse?.categoryScores?.bestPractices || 0
        },
        data_sources: {
          lighthouse: !!processedData.lighthouse,
          pagespeed: !!processedData.pagespeed,
          analytics: !!processedData.analytics,
          search_console: !!processedData.searchConsole,
          technical_seo: !!processedData.technicalSEO
        },
        data_quality: healthScore.dataQuality,
        core_vitals_score: healthScore.coreVitalsScore,
        timestamp: new Date().toISOString(),
        // Include full analysis for frontend to use immediately
        fullAnalysis: processedData.lighthouse,
        quickWins: processedData.lighthouse?.opportunities?.slice(0, 10) || []
      };

      // Save to database cache if email is provided
      if (email) {
        try {
          // Import cache service dynamically to avoid circular dependencies if any
          const { default: websiteAnalysisCacheService } = await import('../services/websiteAnalysisCacheService.js');

          const cachePayload = {
            healthScore: {
              overall: healthScore.overall,
              overall_score: healthScore.overall,
              breakdown: responseData.breakdown,
              // Keep these for backward compatibility with some frontend components
              performance: responseData.breakdown.performance,
              accessibility: responseData.breakdown.accessibility,
              bestPractices: responseData.breakdown.bestPractices,
              seo: responseData.breakdown.seo
            },
            quickWins: responseData.quickWins,
            fullAnalysis: processedData.lighthouse,
            trafficData: null // We don't have traffic data here yet
          };

          await websiteAnalysisCacheService.saveAnalysisCache(email, domain, cachePayload);
          console.log(`💾 Saved comprehensive analysis to database for: ${email} - ${domain}`);
        } catch (cacheError) {
          console.error('❌ Failed to save analysis to cache:', cacheError);
          // Don't fail the request if caching fails
        }
      }

      console.log('✅ Analysis completed for:', domain);

      res.json(responseData);

    } catch (error) {
      console.error('❌ Error analyzing website:', error);
      res.status(500).json({
        error: 'Analysis failed',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  },

  async getHealthReport(req, res) {
    try {
      const { domain } = req.params;

      if (!domain) {
        return res.status(400).json({
          error: 'Domain parameter is required'
        });
      }

      // This would typically fetch from a database
      // For now, return a placeholder response
      res.json({
        domain,
        message: 'Health report endpoint - implementation pending',
        suggestion: 'Use POST /api/health/analyze for real-time analysis'
      });

    } catch (error) {
      console.error('❌ Error getting health report:', error);
      res.status(500).json({
        error: 'Failed to get health report',
        message: error.message
      });
    }
  }
};

export default healthController;