/**
 * Plan Access Middleware
 * Middleware functions to check feature access before processing requests
 */

import { getUserPlan, canAccessFeature, getUserPlanFeatures } from '../services/planAccessService.js';

/**
 * Middleware: Require Instagram access (Growth or Pro plan)
 */
export async function requireInstagram(req, res, next) {
  try {
    const { email } = req.query || req.body;
    
    if (!email) {
      return res.status(400).json({
        error: 'Email parameter is required',
        dataAvailable: false
      });
    }

    const hasAccess = await canAccessFeature(email, 'social.instagram.enabled');
    
    if (!hasAccess) {
      const plan = await getUserPlan(email);
      return res.status(403).json({
        dataAvailable: false,
        blocked: true,
        error: 'Instagram requires a paid plan',
        reason: 'PLAN_LIMIT',
        currentPlan: plan,
        upgradeRequired: 'starter',
        upgradeMessage: '📸 Upgrade to access Instagram analytics',
        features: {
          available: ['Facebook'],
          locked: ['Instagram', 'LinkedIn']
        }
      });
    }

    // Attach plan info to request
    req.userPlan = await getUserPlan(email);
    next();
    
  } catch (error) {
    console.error('❌ Instagram access check error:', error);
    next(); // Continue on error
  }
}

/**
 * Middleware: Require LinkedIn access (Growth or Pro plan)
 */
export async function requireLinkedIn(req, res, next) {
  try {
    const { email } = req.query || req.body;
    
    if (!email) {
      return res.status(400).json({
        error: 'Email parameter is required',
        dataAvailable: false
      });
    }

    const hasAccess = await canAccessFeature(email, 'social.linkedin.enabled');
    
    if (!hasAccess) {
      const plan = await getUserPlan(email);
      return res.status(403).json({
        dataAvailable: false,
        blocked: true,
        error: 'LinkedIn is not available in Starter plan',
        reason: 'PLAN_LIMIT',
        currentPlan: plan,
        upgradeRequired: 'growth',
        upgradeMessage: '💼 Upgrade to Growth plan to unlock LinkedIn analytics',
        features: {
          available: ['Facebook', 'Instagram'],
          locked: ['LinkedIn']
        }
      });
    }

    // Attach plan info to request
    req.userPlan = await getUserPlan(email);
    next();
    
  } catch (error) {
    console.error('❌ LinkedIn access check error:', error);
    next(); // Continue on error
  }
}

/**
 * Middleware: Require backlinks/SE Ranking access (Growth or Pro plan)
 */
export async function requireBacklinks(req, res, next) {
  try {
    const { email } = req.query || req.body;
    
    if (!email) {
      return res.status(400).json({
        error: 'Email parameter is required'
      });
    }

    const hasAccess = await canAccessFeature(email, 'seo.backlinks');
    
    if (!hasAccess) {
      const plan = await getUserPlan(email);
      return res.status(403).json({
        success: false,
        blocked: true,
        error: 'Backlink analysis is not available in Starter plan',
        reason: 'PLAN_LIMIT',
        currentPlan: plan,
        upgradeRequired: 'growth',
        upgradeMessage: '🔗 Upgrade to Growth plan to unlock backlink analysis'
      });
    }

    req.userPlan = await getUserPlan(email);
    next();
    
  } catch (error) {
    console.error('❌ Backlinks access check error:', error);
    next();
  }
}

/**
 * Middleware: Require Quick Wins/Optimization access (Growth or Pro plan)
 */
export async function requireOptimization(req, res, next) {
  try {
    const { email } = req.query || req.body;
    
    if (!email) {
      return res.status(400).json({
        error: 'Email parameter is required'
      });
    }

    const hasAccess = await canAccessFeature(email, 'seo.optimization');
    
    if (!hasAccess) {
      const plan = await getUserPlan(email);
      return res.status(403).json({
        success: false,
        blocked: true,
        error: 'SEO optimization recommendations are not available in Starter plan',
        reason: 'PLAN_LIMIT',
        currentPlan: plan,
        upgradeRequired: 'growth',
        upgradeMessage: '⚡ Upgrade to Growth plan to unlock Quick Wins and optimization recommendations'
      });
    }

    req.userPlan = await getUserPlan(email);
    next();
    
  } catch (error) {
    console.error('❌ Optimization access check error:', error);
    next();
  }
}

/**
 * Middleware: Attach user plan to request (doesn't block, just adds context)
 */
export async function attachUserPlan(req, res, next) {
  try {
    const { email } = req.query || req.body;
    
    if (email) {
      req.userPlan = await getUserPlan(email);
      req.userPlanFeatures = await getUserPlanFeatures(email);
    }
    
    next();
  } catch (error) {
    console.error('❌ Error attaching user plan:', error);
    next();
  }
}

export default {
  requireInstagram,
  requireLinkedIn,
  requireBacklinks,
  requireOptimization,
  attachUserPlan
};
