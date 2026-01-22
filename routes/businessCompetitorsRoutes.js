import express from 'express';
import userBusinessInfoService from '../services/userBusinessInfoService.js';

const router = express.Router();

/**
 * GET /api/business-competitors
 * Fetch competitors from business settings
 */
router.get('/', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    console.log(`📋 Fetching competitors for: ${email}`);

    // Get business info including competitors
    const businessInfo = await userBusinessInfoService.getUserBusinessInfo(email);

    if (!businessInfo) {
      return res.json({
        success: true,
        competitors: [],
        userDomain: null,
        userSocialHandles: {
          instagram: null,
          facebook: null
        }
      });
    }

    // Return competitors with user's own social handles
    return res.json({
      success: true,
      competitors: businessInfo.competitors || [],
      userDomain: businessInfo.business_domain,
      userSocialHandles: {
        instagram: businessInfo.instagram_handle,
        facebook: businessInfo.facebook_handle
      }
    });

  } catch (error) {
    console.error('❌ Error fetching business competitors:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/business-competitors
 * Add competitor to business settings
 */
router.post('/', async (req, res) => {
  try {
    const { email, competitor } = req.body;

    if (!email || !competitor || !competitor.domain) {
      return res.status(400).json({
        success: false,
        error: 'Email and competitor data with domain are required'
      });
    }

    console.log(`➕ Adding competitor for: ${email}`);

    // Add competitor through business info service
    const updatedInfo = await userBusinessInfoService.addCompetitor(email, competitor);

    return res.json({
      success: true,
      competitors: updatedInfo.competitors
    });

  } catch (error) {
    console.error('❌ Error adding competitor:', error);
    
    // Handle specific error for duplicate competitor
    if (error.message.includes('already exists')) {
      return res.status(409).json({
        success: false,
        error: error.message
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/business-competitors/:competitorId
 * Remove competitor from business settings
 */
router.delete('/:competitorId', async (req, res) => {
  try {
    const { competitorId } = req.params;
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    console.log(`🗑️ Removing competitor ${competitorId} for: ${email}`);

    const updatedInfo = await userBusinessInfoService.removeCompetitor(email, competitorId);

    return res.json({
      success: true,
      competitors: updatedInfo.competitors
    });

  } catch (error) {
    console.error('❌ Error removing competitor:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
