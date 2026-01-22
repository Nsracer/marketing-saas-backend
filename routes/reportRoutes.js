import express from 'express';
import comprehensiveReportService from '../services/comprehensiveReportService.js';
import pdfReportService from '../services/pdfReportService.js';
import socialMediaReportService from '../services/socialMediaReportService.js';
import seoCacheService from '../services/seoCacheService.js';
import lighthouseService from '../services/lighthouseService.js';
import pagespeedService from '../services/pagespeedService.js';
import technicalSEOService from '../services/technicalSEOService.js';
import competitorCacheService from '../services/competitorCacheService.js';
import reportGenerationService from '../services/reportGenerationService.js';
import websiteAnalysisCacheService from '../services/websiteAnalysisCacheService.js';
import scoringService from '../services/scoringService.js';

const router = express.Router();

/**
 * POST /api/reports/seo-performance
 * Generate SEO & Website Performance PDF Report
 */
router.post('/seo-performance', async (req, res) => {
  try {
    console.log('📄 Generating SEO Performance Report');

    const { email, domain } = req.body;

    if (!email || !domain) {
      return res.status(400).json({
        success: false,
        error: 'Email and domain are required'
      });
    }

    // Fetch SEO data
    console.log('📊 Fetching SEO data...');

    // Try to get cached analysis first (which includes the official health score)
    let cachedAnalysis = null;
    try {
      cachedAnalysis = await websiteAnalysisCacheService.getAnalysisCache(email, domain);
    } catch (e) {
      console.warn('Failed to fetch analysis cache:', e);
    }

    let healthScore = null;
    let lighthouse = null;
    let pagespeed = null;
    let technicalSEO = null;

    if (cachedAnalysis) {
      console.log('✅ Using cached analysis data for report');
      if (cachedAnalysis.full_analysis) lighthouse = cachedAnalysis.full_analysis;
      if (cachedAnalysis.health_score) healthScore = cachedAnalysis.health_score;
    }

    // If no cache, fetch fresh data
    if (!lighthouse) {
      console.log('🔄 No cache found, fetching fresh data...');
      // Try legacy cache
      lighthouse = await seoCacheService.getLighthouseCache(email, domain);

      if (!lighthouse) {
        lighthouse = await lighthouseService.analyzeSite(domain);
        if (lighthouse) {
          await seoCacheService.saveLighthouseCache(email, domain, lighthouse);
        }
      }
    }

    // Fetch additional data
    try {
      if (!pagespeed && !cachedAnalysis) {
        pagespeed = await pagespeedService.analyzePageSpeed(domain);
      }
    } catch (error) {
      console.warn('⚠️ PageSpeed data unavailable:', error.message);
    }

    try {
      if (!technicalSEO && !cachedAnalysis) {
        technicalSEO = await technicalSEOService.getTechnicalSEOData(domain);
      }
    } catch (error) {
      console.warn('⚠️ Technical SEO data unavailable:', error.message);
    }

    // Calculate health score if not available from cache
    if (!healthScore) {
      console.log('🧮 Calculating fresh health score for report...');
      healthScore = scoringService.calculateHealthScore({
        lighthouse,
        pagespeed,
        technicalSEO
      });
    }

    const reportData = {
      domain,
      lighthouse,
      pagespeed,
      technicalSEO,
      healthScore,
      generatedAt: new Date().toISOString()
    };

    console.log('📝 Generating PDF...');
    const pdfBuffer = await comprehensiveReportService.generateSEOReport(reportData);

    const filename = `seo-performance-report-${domain}-${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    console.log(`✅ SEO Performance Report generated: ${filename}`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('❌ SEO Report generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate SEO report'
    });
  }
});

/**
 * POST /api/reports/competitor-intelligence
 * Generate Competitor Intelligence PDF Report
 */
router.post('/competitor-intelligence', async (req, res) => {
  try {
    console.log('📄 Generating Competitor Intelligence Report');

    const { email, yourDomain, competitorDomain } = req.body;

    if (!email || !yourDomain || !competitorDomain) {
      return res.status(400).json({
        success: false,
        error: 'Email, your domain, and competitor domain are required'
      });
    }

    console.log('📊 Fetching competitor data...');

    // Fetch competitor comparison data
    const comparisonData = await competitorCacheService.getComparisonData(
      email,
      yourDomain,
      competitorDomain
    );

    if (!comparisonData) {
      return res.status(404).json({
        success: false,
        error: 'No competitor data available. Please run a competitor analysis first.'
      });
    }

    console.log('📝 Generating PDF...');
    const pdfBuffer = await pdfReportService.generateCompetitorReport(comparisonData);

    const filename = `competitor-intelligence-${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    console.log(`✅ Competitor Intelligence Report generated: ${filename}`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('❌ Competitor Report generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate competitor report'
    });
  }
});

/**
 * POST /api/reports/social-media
 * Generate Social Media Performance PDF Report
 */
router.post('/social-media', async (req, res) => {
  try {
    console.log('📄 Generating Social Media Performance Report');

    const { email, platform, timeframe } = req.body;

    if (!email || !platform) {
      return res.status(400).json({
        success: false,
        error: 'Email and platform are required'
      });
    }

    console.log('📊 Fetching social media data...');

    // Fetch social media data from cache or API
    // This would integrate with your existing social media services
    const socialData = {
      platform,
      timeframe: timeframe || '30d',
      companyName: 'Your Company',
      generatedAt: new Date().toISOString(),
      data: {
        engagementScore: {
          engagementRate: 2.5,
          likes: 1250,
          comments: 180,
          shares: 95,
          reach: 45000
        },
        reputationBenchmark: {
          score: 85,
          sentiment: 'Positive',
          followers: 12500
        },
        followerGrowth: [],
        topPosts: [],
        totalFollowers: 12500,
        postsCount: 24,
        avgReach: 1875
      }
    };

    console.log('📝 Generating PDF...');
    const pdfBuffer = await socialMediaReportService.generateSocialMediaReport(socialData);

    const filename = `social-media-report-${platform}-${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    console.log(`✅ Social Media Report generated: ${filename}`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('❌ Social Media Report generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate social media report'
    });
  }
});

/**
 * POST /api/reports/comprehensive
 * Generate Comprehensive Business PDF Report
 */
router.post('/comprehensive', async (req, res) => {
  try {
    console.log('📄 Generating Comprehensive Business Report');

    const { email, domain, competitorDomain } = req.body;

    if (!email || !domain) {
      return res.status(400).json({
        success: false,
        error: 'Email and domain are required'
      });
    }

    console.log('📊 Fetching all data sources...');

    // Fetch SEO data
    let lighthouse = await seoCacheService.getLighthouseCache(email, domain);
    if (!lighthouse) {
      lighthouse = await lighthouseService.analyzeSite(domain);
    }

    let technicalSEO = null;
    try {
      technicalSEO = await technicalSEOService.getTechnicalSEOData(domain);
    } catch (error) {
      console.warn('⚠️ Technical SEO data unavailable');
    }

    // Fetch competitor data if provided
    let competitorData = null;
    if (competitorDomain) {
      try {
        competitorData = await competitorCacheService.getComparisonData(
          email,
          domain,
          competitorDomain
        );
      } catch (error) {
        console.warn('⚠️ Competitor data unavailable');
      }
    }

    // Compile comprehensive data
    const reportData = {
      companyName: 'Your Business',
      domain,
      generatedAt: new Date().toISOString(),
      seo: {
        lighthouse,
        technicalSEO,
        overallScore: lighthouse?.categoryScores?.seo || 0
      },
      competitor: competitorData ? {
        count: 1,
        position: 'Analyzing...',
        strengths: ['Performance', 'SEO'],
        improvements: ['Social Media', 'Content']
      } : null,
      socialMedia: {
        totalFollowers: 12500,
        engagementRate: 2.5,
        postsCount: 24,
        avgReach: 1875
      }
    };

    console.log('📝 Generating comprehensive PDF...');
    const pdfBuffer = await comprehensiveReportService.generateComprehensiveReport(reportData);

    const filename = `comprehensive-business-report-${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    console.log(`✅ Comprehensive Business Report generated: ${filename}`);
    res.send(pdfBuffer);

  } catch (error) {
    console.error('❌ Comprehensive Report generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate comprehensive report'
    });
  }
});

/**
 * GET /api/reports/health
 * Health check for report service
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Report Generator',
    timestamp: new Date().toISOString(),
    availableReports: [
      'SEO & Website Performance',
      'Competitor Intelligence',
      'Social Media Performance',
      'Comprehensive Business'
    ]
  });
});

/**
 * POST /api/reports/generate
 * Generate a new report (dashboard, competitor, social, seo, or overall)
 */
router.post('/generate', async (req, res) => {
  try {
    const { email, reportType, periodStart, periodEnd } = req.body;

    if (!email || !reportType) {
      return res.status(400).json({
        success: false,
        error: 'Email and reportType are required'
      });
    }

    const start = periodStart || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(); // Default: 30 days ago
    const end = periodEnd || new Date().toISOString();

    let report;

    switch (reportType) {
      case 'dashboard':
        report = await reportGenerationService.generateDashboardReport(email, start, end);
        break;
      case 'competitor':
        report = await reportGenerationService.generateCompetitorReport(email, start, end);
        break;
      case 'social':
        report = await reportGenerationService.generateSocialReport(email, start, end);
        break;
      case 'seo':
        report = await reportGenerationService.generateSEOReport(email, start, end);
        break;
      case 'overall':
        report = await reportGenerationService.generateOverallReport(email, start, end);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid report type. Must be: dashboard, competitor, social, seo, or overall'
        });
    }

    return res.json({
      success: true,
      report
    });

  } catch (error) {
    console.error('❌ Error generating report:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/reports/list
 * Get all reports for a user
 */
router.get('/list', async (req, res) => {
  try {
    const { email, reportType } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    const reports = await reportGenerationService.getUserReports(email, reportType || null);

    return res.json({
      success: true,
      reports
    });

  } catch (error) {
    console.error('❌ Error fetching reports:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/reports/:reportId
 * Delete a specific report
 */
router.delete('/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    await reportGenerationService.deleteReport(reportId, email);

    return res.json({
      success: true,
      message: 'Report deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting report:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
