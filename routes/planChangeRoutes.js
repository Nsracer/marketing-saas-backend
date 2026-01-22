import express from 'express';
import { clearPlanCache, markPlanAsRecentlyUpdated } from '../services/planAccessService.js';
import seoCacheService from '../services/seoCacheService.js';
import socialMediaCacheService from '../services/socialMediaCacheService.js';
import smartCacheService from '../services/smartCacheService.js';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * POST /api/plan/upgrade
 * Handle plan upgrade and clear all relevant caches
 * This ensures user immediately sees new features after upgrade
 */
router.post('/upgrade', async (req, res) => {
  try {
    const { email, newPlan } = req.body;

    if (!email || !newPlan) {
      return res.status(400).json({
        success: false,
        error: 'Email and newPlan are required'
      });
    }

    // Validate plan
    const validPlans = ['starter', 'growth', 'pro'];
    if (!validPlans.includes(newPlan)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid plan. Must be starter, growth, or pro'
      });
    }

    console.log(`🔄 Plan upgrade initiated: ${email} → ${newPlan}`);

    // 1. Get current plan before updating
    const { data: userData } = await supabase
      .from('users_table')
      .select('plan')
      .eq('email', email)
      .single();

    const oldPlan = userData?.plan || 'starter';
    console.log(`📊 Current plan: ${oldPlan}`);

    // 2. Update plan in database
    const { error: updateError } = await supabase
      .from('users_table')
      .update({ 
        plan: newPlan,
        updated_at: new Date().toISOString()
      })
      .eq('email', email);

    if (updateError) {
      console.error('❌ Failed to update plan:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to update plan in database'
      });
    }

    console.log('✅ Plan updated in database');

    // 3. IMMEDIATELY mark plan as recently updated (bypasses cache for 60s)
    markPlanAsRecentlyUpdated(email);
    console.log('✅ Plan marked as recently updated - cache will be bypassed');

    // 4. Smart cache invalidation (only clear NEW features)
    const cacheResults = await smartCacheService.smartCacheInvalidation(email, oldPlan, newPlan);
    console.log('✅ Smart cache invalidation complete:', cacheResults);

    console.log(`🎉 Plan upgrade complete: ${oldPlan} → ${newPlan}`);

    res.json({
      success: true,
      message: 'Plan upgraded successfully. New features unlocked.',
      oldPlan: oldPlan,
      newPlan: newPlan,
      cacheResults: cacheResults,
      nextSteps: [
        'Refresh your dashboard to see new features',
        'No need to reload existing data'
      ]
    });

  } catch (error) {
    console.error('❌ Plan upgrade error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/plan/mark-updated
 * Mark a plan as recently updated to bypass cache temporarily
 * Used by Stripe webhook to ensure immediate plan checks use fresh data
 */
router.post('/mark-updated', async (req, res) => {
  try {
    const email = req.body?.email || req.query?.email;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    console.log(`🔄 Marking plan as recently updated for: ${email}`);
    markPlanAsRecentlyUpdated(email);
    console.log('✅ Plan marked - getUserPlan will bypass cache for 60 seconds');

    res.json({
      success: true,
      message: 'Plan marked as recently updated. Cache will be bypassed for 60 seconds.',
      email: email,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Mark plan updated error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/plan/clear-cache
 * Clear caches for a user - supports smart or full cache clearing
 * Query params:
 * - email: user's email (required)
 * - mode: 'smart' (default) | 'full'
 * - fromPlan: old plan (for smart mode)
 * - toPlan: new plan (for smart mode)
 * 
 * Smart mode: Only clears caches for newly unlocked features
 * Full mode: Clears all caches (use for manual refresh button)
 */
router.post('/clear-cache', async (req, res) => {
  try {
    // Support both body and query params
    const email = req.body?.email || req.query?.email;
    const mode = req.body?.mode || req.query?.mode || 'smart';
    const fromPlan = req.body?.fromPlan || req.query?.fromPlan;
    const toPlan = req.body?.toPlan || req.query?.toPlan;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required (in body or query params)'
      });
    }

    console.log(`🗑️ Cache clear requested for: ${email}, mode: ${mode}`);

    let cacheResults;

    if (mode === 'full') {
      // Full cache clear - manual refresh
      console.log('💥 Performing FULL cache clear');
      cacheResults = await smartCacheService.fullCacheClear(email);
    } else if (mode === 'smart' && fromPlan && toPlan) {
      // Smart cache clear - only new features
      console.log(`🧠 Performing SMART cache clear: ${fromPlan} → ${toPlan}`);
      cacheResults = await smartCacheService.smartCacheInvalidation(email, fromPlan, toPlan);
    } else {
      // Default: clear plan cache only (fastest)
      console.log('⚡ Clearing plan cache only (no data caches)');
      clearPlanCache(email);
      cacheResults = { planCache: 'cleared', dataCaches: 'preserved' };
    }

    console.log('✅ Cache clearing complete:', cacheResults);

    res.json({
      success: true,
      message: `Cache cleared successfully (${mode} mode)`,
      email: email,
      mode: mode,
      cacheResults: cacheResults,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Clear cache error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/plan/status
 * Get user's current plan and cache status
 */
router.get('/status', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Get plan from database
    const { data, error } = await supabase
      .from('users_table')
      .select('plan, updated_at, subscription_status')
      .eq('email', email)
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if caches exist
    const seoCache = await seoCacheService.getSearchConsoleCache(email);
    const fbCache = await socialMediaCacheService.getCachedMetrics(email, 'facebook');
    const igCache = await socialMediaCacheService.getCachedMetrics(email, 'instagram');
    const liCache = await socialMediaCacheService.getCachedMetrics(email, 'linkedin');

    res.json({
      success: true,
      plan: data.plan,
      subscriptionStatus: data.subscription_status,
      lastUpdated: data.updated_at,
      cacheStatus: {
        seo: !!seoCache,
        social: {
          facebook: !!fbCache,
          instagram: !!igCache,
          linkedin: !!liCache
        }
      }
    });

  } catch (error) {
    console.error('❌ Status check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
