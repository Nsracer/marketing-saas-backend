/**
 * Plan Access Service
 * Centralized service for checking user plans and filtering data based on subscription tier
 */

import { createClient } from '@supabase/supabase-js';
import { getPlanFeatures, hasFeatureAccess, getFeatureLimit } from '../config/planFeatures.js';

// Initialize Supabase client lazily
let supabase = null;

function getSupabaseClient() {
  if (!supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }
  return supabase;
}

// In-memory cache for plan lookups (5 minute TTL)
const planCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Track recent plan updates to invalidate cache immediately
const recentPlanUpdates = new Map();
const RECENT_UPDATE_WINDOW = 60 * 1000; // 60 seconds

/**
 * Mark a plan as recently updated (called after Stripe webhook)
 * @param {string} email - User's email
 */
export function markPlanAsRecentlyUpdated(email) {
  recentPlanUpdates.set(email, Date.now());
  // Auto-cleanup after 2 minutes
  setTimeout(() => recentPlanUpdates.delete(email), 120000);
}

/**
 * Get user's subscription plan from database with caching
 * @param {string} email - User's email
 * @returns {Promise<string>} Plan name (starter, growth, pro)
 */
export async function getUserPlan(email) {
  if (!email) {
    console.warn('⚠️ No email provided, defaulting to starter plan');
    return 'starter';
  }

  // CRITICAL: If plan was recently updated (within 60s), ALWAYS bypass cache
  const recentUpdateTime = recentPlanUpdates.get(email);
  const bypassCache = recentUpdateTime && (Date.now() - recentUpdateTime < RECENT_UPDATE_WINDOW);

  // Check cache first (unless recently updated)
  const cached = planCache.get(email);
  if (!bypassCache && cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.plan;
  }

  if (bypassCache) {
    console.log('🔄 Plan recently updated - bypassing cache for fresh data');
  }

  try {
    // Query database
    const supabase = getSupabaseClient();
    
    if (!supabase) {
      console.warn('⚠️ Supabase not configured, defaulting to starter plan');
      return 'starter';
    }
    
    const { data, error } = await supabase
      .from('users_table')
      .select('plan, subscription_status')
      .eq('email', email)
      .single();

    if (error || !data) {
      console.warn(`⚠️ Could not fetch plan for ${email}, defaulting to 'starter'`);
      return 'starter';
    }

    const plan = data.plan.toLowerCase();
    
    // Validate plan - only starter, growth, pro allowed
    const validPlans = ['starter', 'growth', 'pro'];
    const userPlan = validPlans.includes(plan) ? plan : 'starter';

    // Cache the result
    planCache.set(email, {
      plan: userPlan,
      timestamp: Date.now()
    });

    return userPlan;

  } catch (err) {
    console.error('❌ Error fetching user plan:', err);
    return 'starter'; // Default to starter on error
  }
}

/**
 * Check if user can access a specific feature
 * @param {string} email - User's email
 * @param {string} featurePath - Feature path (e.g., 'social.instagram.enabled')
 * @returns {Promise<boolean>}
 */
export async function canAccessFeature(email, featurePath) {
  const plan = await getUserPlan(email);
  return hasFeatureAccess(plan, featurePath);
}

/**
 * Get feature limit for a user
 * @param {string} email - User's email
 * @param {string} featurePath - Feature path (e.g., 'seo.topPages')
 * @returns {Promise<number>} Limit (-1 for unlimited)
 */
export async function getFeatureLimitForUser(email, featurePath) {
  const plan = await getUserPlan(email);
  return getFeatureLimit(plan, featurePath);
}

/**
 * Filter SEO data based on user's plan
 * @param {object} data - Full SEO data
 * @param {string} email - User's email
 * @returns {Promise<object>} Filtered SEO data
 */
export async function filterSEOData(data, email) {
  const plan = await getUserPlan(email);
  const features = getPlanFeatures(plan);

  const filtered = { ...data };

  // Filter top pages
  if (features.seo.topPages > 0 && data.topPages) {
    filtered.topPages = data.topPages.slice(0, features.seo.topPages);
    filtered.topPagesLimited = true;
    filtered.topPagesLimit = features.seo.topPages;
  } else if (features.seo.topPages === 0) {
    filtered.topPages = [];
    filtered.topPagesLimited = true;
  }

  // Filter top queries
  if (features.seo.topQueries > 0 && data.topQueries) {
    filtered.topQueries = data.topQueries.slice(0, features.seo.topQueries);
    filtered.topQueriesLimited = true;
    filtered.topQueriesLimit = features.seo.topQueries;
  } else if (features.seo.topQueries === 0) {
    filtered.topQueries = [];
    filtered.topQueriesLimited = true;
  }

  // Remove backlinks if not available
  if (!features.seo.backlinks) {
    filtered.backlinks = null;
    filtered.backlinkOverview = null;
    filtered.linkingPages = null;
    filtered.backlinkBlocked = true;
    filtered.upgradeRequired = 'growth';
  } else if (features.seo.linkingPages > 0 && data.linkingPages) {
    // Limit linking pages
    filtered.linkingPages = data.linkingPages.slice(0, features.seo.linkingPages);
  }

  // Add plan metadata
  filtered.planInfo = {
    currentPlan: plan,
    features: {
      topPages: features.seo.topPages,
      topQueries: features.seo.topQueries,
      backlinks: features.seo.backlinks,
      seRanking: features.seo.seRanking,
      optimization: features.seo.optimization
    }
  };

  return filtered;
}

/**
 * Filter social media data based on plan
 * @param {object} data - Full social media data
 * @param {string} email - User's email
 * @param {string} platform - Platform name (facebook, instagram, linkedin)
 * @returns {Promise<object>} Filtered social media data
 */
export async function filterSocialData(data, email, platform) {
  const plan = await getUserPlan(email);
  const features = getPlanFeatures(plan);
  
  const platformFeatures = features.social[platform.toLowerCase()];
  
  console.log(`\n[Plan Filter] Filtering ${platform} data for ${email}`);
  console.log(`   Plan: ${plan}`);
  console.log(`   Platform Features:`, JSON.stringify(platformFeatures, null, 2));
  console.log(`   Data before filtering:`);
  console.log(`      - topPosts: ${data.topPosts?.length || 0} posts`);
  console.log(`      - followerGrowth: ${data.followerGrowth?.length || 0} data points`);
  console.log(`      - dataAvailable: ${data.dataAvailable}`);
  
  if (!platformFeatures || !platformFeatures.enabled) {
    console.log(`   [X] Platform blocked for ${plan} plan`);
    return {
      dataAvailable: false,
      blocked: true,
      reason: `${platform} is not available in ${plan} plan`,
      upgradeRequired: platform === 'linkedin' ? 'growth' : null,
      currentPlan: plan
    };
  }

  const filtered = { ...data };

  // Filter based on metric level
  if (!platformFeatures.advancedMetrics) {
    console.log(`   [!] Advanced metrics disabled - removing topPosts`);
    // Return only basic metrics for starter plan
    filtered.basicOnly = true;
    filtered.advancedMetricsBlocked = true;
    filtered.upgradeRequired = 'growth';
    
    // Keep only essential fields
    const basicFields = [
      'followerCount',
      'followersCount', 
      'totalFollowers',
      'engagementRate',
      'postsCount',
      'totalPosts'
    ];
    
    // Remove advanced fields
    delete filtered.postsData;
    delete filtered.topPosts;
    delete filtered.audienceInsights;
    delete filtered.demographics;
    delete filtered.historicalData;
  } else {
    console.log(`   [OK] Advanced metrics enabled - keeping topPosts`);
  }

  if (!platformFeatures.historicalData) {
    console.log(`   [!] Historical data disabled - removing followerGrowth`);
    delete filtered.historicalData;
    delete filtered.followerGrowth;
    delete filtered.engagementHistory;
  } else {
    console.log(`   [OK] Historical data enabled - keeping followerGrowth`);
  }

  // Add plan metadata
  filtered.planInfo = {
    currentPlan: plan,
    platform: platform,
    features: platformFeatures
  };

  console.log(`   [>>] Data after filtering:`);
  console.log(`      - topPosts: ${filtered.topPosts?.length || 0} posts`);
  console.log(`      - followerGrowth: ${filtered.followerGrowth?.length || 0} data points`);
  console.log(`      - basicOnly: ${filtered.basicOnly || false}`);
  console.log(`      - advancedMetricsBlocked: ${filtered.advancedMetricsBlocked || false}\n`);

  return filtered;
}

/**
 * Filter competitor data based on plan
 * @param {array} competitors - Array of competitor data
 * @param {string} email - User's email
 * @returns {Promise<object>} Filtered competitor data with limits
 */
export async function filterCompetitorData(competitors, email) {
  const plan = await getUserPlan(email);
  const features = getPlanFeatures(plan);
  const maxCompetitors = features.competitors.max;

  const filtered = {
    competitors: competitors.slice(0, maxCompetitors),
    total: competitors.length,
    limited: competitors.length > maxCompetitors,
    maxAllowed: maxCompetitors,
    currentPlan: plan
  };

  if (filtered.limited) {
    filtered.upgradeMessage = `Showing ${maxCompetitors} of ${competitors.length} competitors. Upgrade to see more.`;
  }

  return filtered;
}

/**
 * Check if user should call expensive API
 * @param {string} email - User's email
 * @param {string} apiName - API name (e.g., 'seRanking', 'instagram')
 * @returns {Promise<boolean>} Whether to call the API
 */
export async function shouldCallAPI(email, apiName) {
  const plan = await getUserPlan(email);
  const features = getPlanFeatures(plan);

  const apiMapping = {
    'seRanking': features.seo.seRanking,
    'backlinks': features.seo.backlinks,
    'instagram': features.social.instagram.enabled,
    'facebookAdvanced': features.social.facebook.advancedMetrics,
    'linkedinAdvanced': features.social.linkedin.advancedMetrics
  };

  return apiMapping[apiName] || false;
}

/**
 * Clear plan cache for a user (useful after plan changes)
 * @param {string} email - User's email
 */
export function clearPlanCache(email) {
  if (email) {
    planCache.delete(email);
    markPlanAsRecentlyUpdated(email); // Mark as recently updated to bypass cache
  } else {
    planCache.clear();
  }
}

/**
 * Get plan features for a user
 * @param {string} email - User's email
 * @returns {Promise<object>} Plan features
 */
export async function getUserPlanFeatures(email) {
  const plan = await getUserPlan(email);
  return getPlanFeatures(plan);
}

export default {
  getUserPlan,
  canAccessFeature,
  getFeatureLimitForUser,
  filterSEOData,
  filterSocialData,
  filterCompetitorData,
  shouldCallAPI,
  clearPlanCache,
  markPlanAsRecentlyUpdated,
  getUserPlanFeatures
};
