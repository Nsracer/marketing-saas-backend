import express from 'express';
import socialConnectionService from '../services/socialConnectionService.js';

const router = express.Router();

/**
 * Get all social connections with OAuth priority
 * GET /api/social-connections?email=user@example.com
 */
router.get('/', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'email is required'
      });
    }

    const handles = await socialConnectionService.getSocialHandlesWithPriority(email);

    res.json({
      success: true,
      connections: handles
    });

  } catch (error) {
    console.error('❌ Error getting social connections:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get connection status for all platforms
 * GET /api/social-connections/status?email=user@example.com
 */
router.get('/status', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'email is required'
      });
    }

    const status = await socialConnectionService.getConnectionStatus(email);

    res.json({
      success: true,
      status
    });

  } catch (error) {
    console.error('❌ Error getting connection status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update connection after OAuth
 * POST /api/social-connections/update
 * Body: { email, platform, connectionData }
 */
router.post('/update', async (req, res) => {
  try {
    const { email, platform, connectionData } = req.body;

    if (!email || !platform || !connectionData) {
      return res.status(400).json({
        success: false,
        error: 'email, platform, and connectionData are required'
      });
    }

    const result = await socialConnectionService.updateConnection(
      email,
      platform,
      connectionData
    );

    if (result) {
      res.json({
        success: true,
        message: `${platform} connection updated successfully`
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to update connection'
      });
    }

  } catch (error) {
    console.error('❌ Error updating connection:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Disconnect a platform
 * POST /api/social-connections/disconnect
 * Body: { email, platform }
 */
router.post('/disconnect', async (req, res) => {
  try {
    const { email, platform } = req.body;

    if (!email || !platform) {
      return res.status(400).json({
        success: false,
        error: 'email and platform are required'
      });
    }

    const result = await socialConnectionService.disconnectPlatform(email, platform);

    if (result) {
      res.json({
        success: true,
        message: `${platform} disconnected successfully`
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to disconnect platform'
      });
    }

  } catch (error) {
    console.error('❌ Error disconnecting platform:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Check if a specific platform is connected
 * GET /api/social-connections/check?email=user@example.com&platform=linkedin
 */
router.get('/check', async (req, res) => {
  try {
    const { email, platform } = req.query;

    if (!email || !platform) {
      return res.status(400).json({
        success: false,
        error: 'email and platform are required'
      });
    }

    const isConnected = await socialConnectionService.isPlatformConnected(email, platform);

    res.json({
      success: true,
      platform,
      connected: isConnected
    });

  } catch (error) {
    console.error('❌ Error checking platform connection:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
