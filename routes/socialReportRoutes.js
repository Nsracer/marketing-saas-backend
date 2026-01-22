import express from 'express';
import socialMediaReportService from '../services/socialMediaReportService.js';

const router = express.Router();

/**
 * Generate social media performance report
 * POST /api/social/report
 * Body: { platform, companyName, data, generatedAt, timeframe }
 */
router.post('/report', async (req, res) => {
  try {
    const reportData = req.body;

    if (!reportData.platform || !reportData.data) {
      return res.status(400).json({
        success: false,
        error: 'Platform and data are required'
      });
    }

    console.log(`📊 Generating ${reportData.platform} social media report...`);
    console.log(`   📄 Company: ${reportData.companyName || 'Unknown'}`);
    console.log(`   📅 Period: ${reportData.timeframe || '30d'}`);

    const pdfBuffer = await socialMediaReportService.generateSocialMediaReport(reportData);

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${reportData.platform}-social-media-report-${new Date().toISOString().split('T')[0]}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    console.log(`✅ Report generated successfully (${pdfBuffer.length} bytes)`);
    
    res.send(pdfBuffer);
  } catch (error) {
    console.error('❌ Error generating social media report:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      reason: 'Failed to generate social media report'
    });
  }
});

/**
 * Get report templates/formats available
 * GET /api/social/report/templates
 */
router.get('/report/templates', (req, res) => {
  res.json({
    success: true,
    templates: [
      {
        id: 'standard',
        name: 'Standard Performance Report',
        description: 'Comprehensive social media performance analysis',
        sections: [
          'Executive Summary',
          'Engagement Analysis', 
          'Content Performance',
          'Audience Insights',
          'Strategic Recommendations'
        ]
      },
      {
        id: 'executive',
        name: 'Executive Summary Report',
        description: 'High-level overview for stakeholders',
        sections: [
          'Key Metrics',
          'Performance Highlights',
          'Strategic Recommendations'
        ]
      }
    ]
  });
});

/**
 * Get report history for a user
 * GET /api/social/report/history?email=user@example.com
 */
router.get('/report/history', (req, res) => {
  const { email } = req.query;
  
  if (!email) {
    return res.status(400).json({
      success: false,
      error: 'Email parameter is required'
    });
  }

  // This would typically fetch from database
  // For now, return mock history
  res.json({
    success: true,
    reports: [
      {
        id: '1',
        platform: 'facebook',
        companyName: 'Example Company',
        generatedAt: new Date().toISOString(),
        timeframe: '30d',
        downloadUrl: '/api/social/report/download/1'
      }
    ]
  });
});

export default router;