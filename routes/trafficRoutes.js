import express from 'express';
import trafficService from '../services/trafficService.js';

const router = express.Router();

/**
 * GET /api/traffic/data
 * Get website traffic data from multiple sources
 * Query params:
 *   - email: User's email (for GA integration)
 *   - domain: Website domain to analyze
 *   - days: Number of days (default: 14)
 */
router.get('/traffic/data', async (req, res) => {
  try {
    const { email, domain, days = 14 } = req.query;

    if (!domain) {
      return res.status(400).json({
        error: 'Domain parameter is required'
      });
    }

    // Clean domain
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

    console.log(`📊 Fetching traffic data for ${cleanDomain}...`);

    const trafficData = await trafficService.getTrafficData(
      email,
      cleanDomain,
      parseInt(days)
    );

    res.json({
      success: true,
      domain: cleanDomain,
      ...trafficData
    });

  } catch (error) {
    console.error('❌ Error fetching traffic data:', error);
    res.status(500).json({
      error: 'Failed to fetch traffic data',
      message: error.message
    });
  }
});

/**
 * POST /api/traffic/analyze
 * Analyze website traffic data (used by Dashboard for competitor benchmarking)
 * Body params:
 *   - domain: Website domain to analyze
 * Query params (optional):
 *   - email: User's email (for GA integration)
 *   - propertyId: GA property ID
 *   - days: Number of days (default: 14)
 */
router.post('/traffic/analyze', async (req, res) => {
  try {
    const { domain } = req.body;
    const { email, propertyId, days = 14 } = req.query;

    if (!domain) {
      return res.status(400).json({
        error: 'Domain parameter is required'
      });
    }

    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

    console.log(`📊 Analyzing traffic for ${cleanDomain}...`);

    const trafficData = await trafficService.getTrafficData(
      email,
      cleanDomain,
      parseInt(days)
    );

    res.json({
      success: true,
      domain: cleanDomain,
      ...trafficData
    });

  } catch (error) {
    console.error('❌ Error analyzing traffic:', error);
    res.status(500).json({
      error: 'Failed to analyze traffic',
      message: error.message
    });
  }
});

export default router;