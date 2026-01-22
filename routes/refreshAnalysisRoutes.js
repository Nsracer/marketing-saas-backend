import express from 'express';
import seoCacheService from '../services/seoCacheService.js';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Clear all caches for a user and force fresh data fetch
 * POST /api/refresh-analysis
 * Query params: email, domain (optional)
 */
router.post('/refresh-analysis', async (req, res) => {
  try {
    const { email, domain } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email parameter is required'
      });
    }

    console.log(`🔄 Refresh Analysis requested for: ${email}${domain ? ` (${domain})` : ''}`);

    // Get user ID
    const userId = await seoCacheService.getUserIdByEmail(email);
    if (!userId) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const clearedCaches = [];

    // Clear Search Console cache
    try {
      await supabase
        .from('search_console_cache')
        .delete()
        .eq('user_id', userId);
      clearedCaches.push('Search Console');
      console.log('✅ Search Console cache cleared');
    } catch (err) {
      console.error('❌ Error clearing Search Console cache:', err);
    }

    // Clear Google Analytics cache
    try {
      await supabase
        .from('google_analytics_cache')
        .delete()
        .eq('user_id', userId);
      clearedCaches.push('Google Analytics');
      console.log('✅ Google Analytics cache cleared');
    } catch (err) {
      console.error('❌ Error clearing Google Analytics cache:', err);
    }

    // Clear Lighthouse cache (all domains or specific domain)
    try {
      let query = supabase
        .from('lighthouse_cache')
        .delete()
        .eq('user_id', userId);

      if (domain) {
        query = query.eq('domain', domain);
      }

      await query;
      clearedCaches.push('Lighthouse');
      console.log('✅ Lighthouse cache cleared');
    } catch (err) {
      console.error('❌ Error clearing Lighthouse cache:', err);
    }

    // Clear SE Ranking backlinks cache (all domains or specific domain)
    try {
      let query = supabase
        .from('se_ranking_cache')
        .delete()
        .eq('user_id', userId);

      if (domain) {
        query = query.eq('domain', domain);
      }

      await query;
      clearedCaches.push('SE Ranking (Backlinks)');
      console.log('✅ SE Ranking cache cleared');
    } catch (err) {
      console.error('❌ Error clearing SE Ranking cache:', err);
    }

    // Note: Social media caches (Facebook, Instagram, LinkedIn) are NOT cleared here
    // They have their own refresh mechanism in the Social Dashboard

    console.log(`✅ Refresh Analysis complete. Cleared SEO caches: ${clearedCaches.join(', ')}`);

    res.json({
      success: true,
      message: 'All caches cleared successfully. Fresh data will be fetched on next request.',
      clearedCaches,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error in refresh-analysis:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear caches',
      details: error.message
    });
  }
});

export default router;
