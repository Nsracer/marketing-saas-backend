/**
 * Tier Validation Middleware
 * Enforces subscription limits on API endpoints
 * Plans: starter, growth, pro (ONLY)
 */

// Tier limits configuration - Unified with planFeatures.js
const TIER_LIMITS = {
  starter: {
    competitors: 1,
    aiInsights: 5,
    reports: 2,
    competitorAnalysis: 3,
    socialConnections: 2,
    advancedMetrics: false,
    exportPDF: false,
    apiAccess: false
  },
  growth: {
    competitors: 3,
    aiInsights: 50,
    reports: 20,
    competitorAnalysis: 25,
    socialConnections: 10,
    advancedMetrics: true,
    exportPDF: true,
    apiAccess: false
  },
  pro: {
    competitors: 10,
    aiInsights: 999999,
    reports: 999999,
    competitorAnalysis: 999999,
    socialConnections: 999999,
    advancedMetrics: true,
    exportPDF: true,
    apiAccess: true
  }
};

/**
 * Get user's subscription plan from database
 * @param {string} email - User email
 * @returns {Promise<string>} - Plan name (starter/growth/pro/enterprise)
 */
async function getUserPlan(email) {
  try {
    // Import Supabase client
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    
    // Query user's plan from database
    const { data, error } = await supabase
      .from('users_table')
      .select('plan')
      .eq('email', email)
      .single();
    
    if (error || !data) {
      console.warn(`⚠️ Could not fetch plan for ${email}, defaulting to 'starter'`);
      return 'starter';
    }
    
    // Return the actual plan - only starter, growth, pro allowed
    const plan = data.plan.toLowerCase();
    const validPlans = ['starter', 'growth', 'pro'];
    return validPlans.includes(plan) ? plan : 'starter';
    
  } catch (err) {
    console.error('Error fetching user plan:', err);
    return 'starter'; // Default to starter on error
  }
}

/**
 * Get user's current usage from database
 * @param {string} email - User email
 * @returns {Promise<object>} - Usage object
 */
async function getUserUsage(email) {
  // TODO: Query usage from database
  // For now, return mock data
  return {
    competitors: 0,
    aiInsightsThisMonth: 0,
    reportsThisMonth: 0,
    competitorAnalysisThisMonth: 0,
    socialConnectionsThisMonth: 0
  };
}

/**
 * Middleware: Check if user can add competitor
 */
export async function validateCompetitorLimit(req, res, next) {
  try {
    const { email } = req.body || req.query;
    
    if (!email) {
      return res.status(400).json({ 
        error: 'Email required for validation',
        tierLimited: true
      });
    }
    
    const plan = await getUserPlan(email);
    const usage = await getUserUsage(email);
    const limit = TIER_LIMITS[plan].competitors;
    
    if (usage.competitors >= limit) {
      let upgradeMessage = '';
      if (plan === 'starter') {
        upgradeMessage = '🚀 Upgrade to Growth to analyze up to 3 competitors';
      } else if (plan === 'growth') {
        upgradeMessage = '💎 Upgrade to Pro to analyze up to 10 competitors';
      } else {
        upgradeMessage = '💎 Upgrade to Enterprise for unlimited competitor analysis';
      }
      
      return res.status(403).json({
        error: `Competitor limit reached. Upgrade to add more competitors.`,
        tierLimited: true,
        currentPlan: plan,
        limit: limit,
        usage: usage.competitors,
        upgradeMessage
      });
    }
    
    // Attach plan info to request for later use
    req.userPlan = plan;
    req.userLimits = TIER_LIMITS[plan];
    
    next();
  } catch (error) {
    console.error('Tier validation error:', error);
    next(); // Continue on error, don't block request
  }
}

/**
 * Middleware: Check if user can generate report
 */
export async function validateReportLimit(req, res, next) {
  try {
    const { email } = req.body || req.query;
    
    if (!email) {
      return res.status(400).json({ 
        error: 'Email required for validation',
        tierLimited: true
      });
    }
    
    const plan = await getUserPlan(email);
    const usage = await getUserUsage(email);
    const limit = TIER_LIMITS[plan].reports;
    
    if (usage.reportsThisMonth >= limit) {
      let upgradeMessage = '';
      if (plan === 'starter') {
        upgradeMessage = '📊 Upgrade to Growth for 20 reports per month';
      } else if (plan === 'growth') {
        upgradeMessage = '💎 Upgrade to Pro for unlimited reports';
      } else {
        upgradeMessage = '💎 Upgrade to Enterprise for unlimited reports';
      }
      
      return res.status(403).json({
        error: `Report limit reached. Upgrade for more reports.`,
        tierLimited: true,
        currentPlan: plan,
        limit: limit,
        usage: usage.reportsThisMonth,
        upgradeMessage
      });
    }
    
    req.userPlan = plan;
    req.userLimits = TIER_LIMITS[plan];
    
    next();
  } catch (error) {
    console.error('Tier validation error:', error);
    next();
  }
}

/**
 * Middleware: Check if user has access to advanced features
 */
export async function validateAdvancedFeature(req, res, next) {
  try {
    const { email } = req.body || req.query;
    
    if (!email) {
      return res.status(400).json({ 
        error: 'Email required for validation',
        tierLimited: true
      });
    }
    
    const plan = await getUserPlan(email);
    const hasAccess = TIER_LIMITS[plan].advancedMetrics;
    
    if (!hasAccess) {
      return res.status(403).json({
        error: `Advanced features require Growth, Pro or Enterprise plan`,
        tierLimited: true,
        currentPlan: plan,
        upgradeMessage: '✨ Unlock advanced metrics with Growth plan'
      });
    }
    
    req.userPlan = plan;
    req.userLimits = TIER_LIMITS[plan];
    
    next();
  } catch (error) {
    console.error('Tier validation error:', error);
    next();
  }
}

/**
 * Middleware: Check if user can export PDF
 */
export async function validatePDFExport(req, res, next) {
  try {
    const { email } = req.body || req.query;
    
    if (!email) {
      return res.status(400).json({ 
        error: 'Email required for validation',
        tierLimited: true
      });
    }
    
    const plan = await getUserPlan(email);
    const hasAccess = TIER_LIMITS[plan].exportPDF;
    
    if (!hasAccess) {
      return res.status(403).json({
        error: `PDF export requires Growth, Pro or Enterprise plan`,
        tierLimited: true,
        currentPlan: plan,
        upgradeMessage: '📄 Upgrade to Growth to export PDF reports'
      });
    }
    
    req.userPlan = plan;
    req.userLimits = TIER_LIMITS[plan];
    
    next();
  } catch (error) {
    console.error('Tier validation error:', error);
    next();
  }
}

/**
 * Helper: Increment usage counter
 */
export async function incrementUsage(email, feature) {
  // TODO: Increment usage in database
  // UPDATE user_usage SET ${feature}_count = ${feature}_count + 1 WHERE email = ?
  console.log(`Incrementing ${feature} usage for ${email}`);
}

export default {
  validateCompetitorLimit,
  validateReportLimit,
  validateAdvancedFeature,
  validatePDFExport,
  incrementUsage
};
