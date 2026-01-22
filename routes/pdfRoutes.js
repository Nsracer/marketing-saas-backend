import express from 'express';
import pdfReportService from '../services/pdfReportService.js';

const router = express.Router();

/**
 * POST /api/pdf/competitor-report
 * Generate and download competitor analysis PDF report
 */
router.post('/competitor-report', async (req, res) => {
  try {
    console.log('📄 PDF Report Generation Request');

    const { data } = req.body;

    if (!data) {
      return res.status(400).json({
        success: false,
        error: 'Analysis data is required'
      });
    }

    console.log('📊 PDF Data received:', {
      hasYourSite: !!data.yourSite,
      hasCompetitorSite: !!data.competitorSite,
      hasComparison: !!data.comparison,
      yourSiteKeys: data.yourSite ? Object.keys(data.yourSite) : [],
      competitorSiteKeys: data.competitorSite ? Object.keys(data.competitorSite) : [],
      comparisonKeys: data.comparison ? Object.keys(data.comparison) : []
    });

    console.log('📊 Generating PDF report...');

    // Generate PDF buffer
    const pdfBuffer = await pdfReportService.generateCompetitorReport(data);

    // Set response headers for PDF download
    const filename = `competitor-analysis-${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    console.log(`✅ PDF report generated successfully: ${filename}`);

    // Send PDF buffer
    res.send(pdfBuffer);

  } catch (error) {
    console.error('❌ PDF generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate PDF report'
    });
  }
});

/**
 * GET /api/pdf/health
 * Health check for PDF service
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'PDF Report Generator',
    timestamp: new Date().toISOString()
  });
});

export default router;