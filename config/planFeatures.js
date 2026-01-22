/**
 * Plan Features Configuration
 * Defines what each subscription plan can access
 * 
 * Plans: starter, growth, pro (ONLY)
 * Default for new users: starter
 * 
 * SOCIAL MEDIA FEATURES:
 * - STARTER: Full Facebook + Instagram metrics, LinkedIn LOCKED
 * - GROWTH: All platforms (Facebook, Instagram, LinkedIn) with full metrics
 * - PRO: Same as Growth (all platforms, full metrics)
 */

export const PLAN_FEATURES = {
  starter: {
    name: 'Starter',
    // Competitor limits
    competitors: {
      max: 1,
      canCompare: true
    },
    
    // SEO & Website Performance
    seo: {
      // Search Console & Traffic
      topPages: 2,              // Only top 2 pages
      topQueries: 2,            // Only top 2 search queries
      trafficAnalytics: true,   // Basic traffic data
      
      // Lighthouse & Performance
      lighthouse: true,         // Page speed insights
      healthScore: true,        // Basic health score
      
      // Advanced Features
      backlinks: false,         // No backlink data
      seRanking: false,         // No SE Ranking API
      backlinkOverview: false,  // No backlink overview
      linkingPages: 0,          // No linking pages
      optimization: false,      // No optimization recommendations
      quickWins: false,         // No quick wins
      
      // Google Integrations
      googleAnalytics: true,    // GA integration allowed
      searchConsole: true       // GSC integration allowed
    },
    
    // Social Media Performance
    social: {
      facebook: {
        enabled: true,
        connect: true,
        basicMetrics: true,
        advancedMetrics: true,   // ✅ Full metrics for Starter
        historicalData: true     // ✅ Full historical data for Starter
      },
      linkedin: {
        enabled: false,          // 🔒 Locked for Starter
        connect: false,
        basicMetrics: false,
        advancedMetrics: false,
        historicalData: false
      },
      instagram: {
        enabled: true,           // ✅ Instagram enabled for Starter
        connect: true,
        basicMetrics: true,
        advancedMetrics: true,   // ✅ Full metrics for Starter
        historicalData: true     // ✅ Full historical data for Starter
      }
    },
    
    // Additional Features
    reports: {
      canGenerate: true,
      pdfExport: false,
      maxPerMonth: 2
    },
    aiInsights: {
      enabled: false,      // 🔒 Locked for starter
      maxPerMonth: 0,
      optimizations: 0     // No AI optimizations
    }
  },
  
  growth: {
    name: 'Growth',
    // Competitor limits
    competitors: {
      max: 3,
      canCompare: true
    },
    
    // SEO & Website Performance
    seo: {
      // Search Console & Traffic
      topPages: 10,             // Top 10 pages
      topQueries: 10,           // Top 10 search queries
      trafficAnalytics: true,   // Advanced traffic data
      
      // Lighthouse & Performance
      lighthouse: true,
      healthScore: true,
      
      // Advanced Features
      backlinks: true,          // ✅ SE Ranking API enabled
      seRanking: true,          // ✅ SE Ranking integration
      backlinkOverview: true,   // ✅ Backlink overview
      linkingPages: 10,         // Top 10 linking pages
      optimization: true,       // ✅ SEO optimization page
      quickWins: true,          // ✅ Quick wins recommendations
      
      // Google Integrations
      googleAnalytics: true,
      searchConsole: true
    },
    
    // Social Media Performance
    social: {
      facebook: {
        enabled: true,
        connect: true,
        basicMetrics: true,
        advancedMetrics: true,   // ✅ Full metrics
        historicalData: true
      },
      linkedin: {
        enabled: true,
        connect: true,
        basicMetrics: true,
        advancedMetrics: true,   // ✅ Full metrics
        historicalData: true
      },
      instagram: {
        enabled: true,           // ✅ Instagram enabled
        connect: true,
        basicMetrics: true,
        advancedMetrics: true,   // ✅ Full metrics
        historicalData: true
      }
    },
    
    // Additional Features
    reports: {
      canGenerate: true,
      pdfExport: true,
      maxPerMonth: 20
    },
    aiInsights: {
      enabled: true,       // ✅ Enabled for growth
      maxPerMonth: 50,
      optimizations: 3     // 3 AI optimizations
    }
  },
  
  pro: {
    name: 'Pro',
    // Competitor limits
    competitors: {
      max: 10,
      canCompare: true
    },
    
    // SEO & Website Performance
    seo: {
      // Search Console & Traffic
      topPages: -1,             // Unlimited pages
      topQueries: -1,           // Unlimited queries
      trafficAnalytics: true,
      
      // Lighthouse & Performance
      lighthouse: true,
      healthScore: true,
      
      // Advanced Features - Everything enabled
      backlinks: true,
      seRanking: true,
      backlinkOverview: true,
      linkingPages: -1,         // Unlimited linking pages
      optimization: true,
      quickWins: true,
      
      // Google Integrations
      googleAnalytics: true,
      searchConsole: true
    },
    
    // Social Media Performance - Everything enabled
    social: {
      facebook: {
        enabled: true,
        connect: true,
        basicMetrics: true,
        advancedMetrics: true,
        historicalData: true
      },
      linkedin: {
        enabled: true,
        connect: true,
        basicMetrics: true,
        advancedMetrics: true,
        historicalData: true
      },
      instagram: {
        enabled: true,
        connect: true,
        basicMetrics: true,
        advancedMetrics: true,
        historicalData: true
      }
    },
    
    // Additional Features - Everything unlimited
    reports: {
      canGenerate: true,
      pdfExport: true,
      maxPerMonth: -1           // Unlimited
    },
    aiInsights: {
      enabled: true,            // ✅ Enabled for pro
      maxPerMonth: -1,          // Unlimited
      optimizations: 5          // 5 AI optimizations
    }
  }
};

/**
 * Get plan features for a specific plan
 * @param {string} plan - Plan name (starter, growth, pro)
 * @returns {object} Plan features configuration
 */
export function getPlanFeatures(plan) {
  const normalizedPlan = plan?.toLowerCase() || 'starter';
  const validPlans = ['starter', 'growth', 'pro'];
  return validPlans.includes(normalizedPlan) ? PLAN_FEATURES[normalizedPlan] : PLAN_FEATURES.starter;
}

/**
 * Check if a plan has access to a specific feature
 * @param {string} plan - Plan name
 * @param {string} featurePath - Dot notation path to feature (e.g., 'seo.backlinks', 'social.instagram.enabled')
 * @returns {boolean} Whether the plan has access
 */
export function hasFeatureAccess(plan, featurePath) {
  const features = getPlanFeatures(plan);
  const keys = featurePath.split('.');
  
  let current = features;
  for (const key of keys) {
    if (current[key] === undefined) return false;
    current = current[key];
  }
  
  return current === true || current > 0 || current === -1;
}

/**
 * Get limit for a numeric feature
 * @param {string} plan - Plan name
 * @param {string} featurePath - Path to numeric feature (e.g., 'seo.topPages')
 * @returns {number} Limit (-1 for unlimited, 0 for none)
 */
export function getFeatureLimit(plan, featurePath) {
  const features = getPlanFeatures(plan);
  const keys = featurePath.split('.');
  
  let current = features;
  for (const key of keys) {
    if (current[key] === undefined) return 0;
    current = current[key];
  }
  
  return typeof current === 'number' ? current : 0;
}

export default PLAN_FEATURES;
