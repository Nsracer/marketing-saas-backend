import { clearPlanCache, markPlanAsRecentlyUpdated } from './planAccessService.js';
import seoCacheService from './seoCacheService.js';
import socialMediaCacheService from './socialMediaCacheService.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Smart Cache Invalidation Service
 * Only clears caches for features that are NEW to the upgraded plan
 */

// Define what features each plan has access to
const PLAN_FEATURES = {
  starter: {
    clearOnUpgrade: [], // Nothing to clear when upgrading FROM starter
    features: ['search_console', 'google_analytics', 'lighthouse', 'facebook', 'linkedin']
  },
  growth: {
    clearOnUpgrade: ['se_ranking'], // Only clear SE Ranking cache (new feature)
    features: ['search_console', 'google_analytics', 'lighthouse', 'facebook', 'linkedin', 'instagram', 'se_ranking', 'backlinks']
  },
  pro: {
    clearOnUpgrade: [], // All features already unlocked in growth, just update limits
    features: ['search_console', 'google_analytics', 'lighthouse', 'facebook', 'linkedin', 'instagram', 'se_ranking', 'backlinks', 'competitor_ads']
  }
};

/**
 * Intelligently clear only NEW feature caches based on plan upgrade
 * @param {string} email - User email
 * @param {string} fromPlan - Previous plan
 * @param {string} toPlan - New plan
 */
export async function smartCacheInvalidation(email, fromPlan, toPlan) {
  console.log(`🧠 Smart cache invalidation: ${fromPlan} → ${toPlan} for ${email}`);
  
  const results = {
    planCache: false,
    seRanking: false,
    instagram: false,
    seoCache: false,
    backgroundRefetch: false,
    totalCleared: 0
  };

  try {
    // ALWAYS clear plan cache and mark as recently updated (bypasses cache for 60s)
    clearPlanCache(email);
    markPlanAsRecentlyUpdated(email);
    results.planCache = true;
    results.totalCleared++;
    console.log('✅ Plan cache cleared and marked as recently updated');

    // Determine what NEW features were unlocked
    const upgradePath = `${fromPlan}_to_${toPlan}`;
    
    switch(upgradePath) {
      case 'starter_to_growth':
        // Growth unlocks: Instagram + SE Ranking/Backlinks + more SEO metrics
        console.log('🎯 Clearing caches for newly unlocked features: Instagram, SE Ranking, SEO data');
        
        // Clear Instagram cache (new platform)
        await socialMediaCacheService.invalidateCache(email, 'instagram');
        results.instagram = true;
        results.totalCleared++;
        
        // Clear SE Ranking cache (new SEO feature)
        await clearSERankingCache(email);
        results.seRanking = true;
        results.totalCleared++;
        
        // Clear SEO cache to refetch with backlinks and new metrics
        await seoCacheService.clearUserCache(email);
        results.seoCache = true;
        results.totalCleared++;
        console.log('✅ SEO cache cleared - backlinks will be fetched on next request');
        
        // Trigger background refetch of SEO data with new metrics
        triggerSEOBackgroundRefetch(email).catch(err => 
          console.error('⚠️ Background SEO refetch failed:', err.message)
        );
        
        console.log('✅ Growth-specific caches cleared');
        break;

      case 'starter_to_pro':
        // Pro unlocks: Everything Growth has + more limits + all SEO metrics
        console.log('🎯 Clearing caches for newly unlocked features: Instagram, SE Ranking, SEO data');
        
        await socialMediaCacheService.invalidateCache(email, 'instagram');
        results.instagram = true;
        results.totalCleared++;
        
        await clearSERankingCache(email);
        results.seRanking = true;
        results.totalCleared++;
        
        // Clear SEO cache to refetch with all pro-level metrics
        await seoCacheService.clearUserCache(email);
        results.seoCache = true;
        results.totalCleared++;
        console.log('✅ SEO cache cleared - all metrics will be fetched on next request');
        
        // Trigger background refetch of SEO data with new metrics
        triggerSEOBackgroundRefetch(email).catch(err => 
          console.error('⚠️ Background SEO refetch failed:', err.message)
        );
        
        console.log('✅ Pro-specific caches cleared');
        break;

      case 'growth_to_pro':
        // Pro just increases limits, no new features to unlock
        console.log('✅ No new features unlocked (just increased limits)');
        // Don't clear any data caches, just plan cache
        break;

      default:
        // Downgrade or same plan
        console.log('⚠️ No cache clearing needed for this transition');
    }

    // DON'T clear these (they work in ALL plans):
    // ❌ Search Console cache - already available in starter
    // ❌ Google Analytics cache - already available in starter  
    // ❌ Lighthouse cache - already available in starter
    // ❌ Facebook cache - already available in starter
    // ❌ LinkedIn cache - already available in starter

    console.log(`✅ Smart cache invalidation complete: ${results.totalCleared} caches cleared`);
    return results;

  } catch (error) {
    console.error('❌ Smart cache invalidation error:', error);
    return results;
  }
}

/**
 * Trigger background refetch of SEO data after plan upgrade
 * This fetches new unlocked metrics without making user wait
 * @param {string} email - User email
 */
async function triggerSEOBackgroundRefetch(email) {
  console.log(`🔄 Triggering background SEO refetch for: ${email}`);
  
  try {
    // Get user's domain from most recent search console cache
    const { data: cache } = await supabase
      .from('search_console_cache')
      .select('domain, site_url')
      .eq('user_id', await getUserIdByEmail(email))
      .order('last_fetched_at', { ascending: false })
      .limit(1)
      .single();
    
    if (!cache || !cache.domain) {
      console.log('📭 No domain found for background refetch - user needs to connect first');
      return;
    }
    
    console.log(`📡 Background refetching SEO data for domain: ${cache.domain}`);
    
    // Import services dynamically to avoid circular dependencies
    const lighthouseService = (await import('./lighthouseService.js')).default;
    const seRankingService = (await import('./seRankingService.js')).default;
    
    // Fetch lighthouse data in background
    lighthouseService.analyzeSite(cache.domain)
      .then(data => {
        if (data) {
          console.log('✅ Background lighthouse refetch completed');
          return seoCacheService.saveLighthouseCache(email, cache.domain, data);
        }
      })
      .catch(err => console.error('⚠️ Background lighthouse refetch failed:', err.message));
    
    // Fetch SE Ranking data in background (for growth/pro users)
    seRankingService.getBacklinksSummary(cache.domain)
      .then(data => {
        if (data && data.available) {
          console.log('✅ Background backlinks refetch completed');
          return seoCacheService.saveSERankingCache(email, cache.domain, data);
        }
      })
      .catch(err => console.error('⚠️ Background backlinks refetch failed:', err.message));
    
    console.log('✅ Background SEO refetch initiated (non-blocking)');
    
  } catch (error) {
    console.error('❌ Error triggering background SEO refetch:', error);
  }
}

/**
 * Clear SE Ranking cache specifically
 * @param {string} email - User email
 */
async function clearSERankingCache(email) {
  try {
    // Get user's domains from search_console_cache
    const { data: caches } = await supabase
      .from('search_console_cache')
      .select('domain')
      .eq('user_id', await getUserIdByEmail(email));

    if (!caches || caches.length === 0) {
      console.log('📭 No domains found for SE Ranking cache clear');
      return;
    }

    // Clear SE Ranking cache for each domain
    for (const cache of caches) {
      if (cache.domain) {
        await supabase
          .from('se_ranking_cache')
          .delete()
          .eq('domain', cache.domain);
        console.log(`🗑️ Cleared SE Ranking cache for domain: ${cache.domain}`);
      }
    }
  } catch (error) {
    console.error('❌ Error clearing SE Ranking cache:', error);
  }
}

/**
 * Get user ID by email
 */
async function getUserIdByEmail(email) {
  try {
    const { data } = await supabase
      .from('users_table')
      .select('id')
      .eq('email', email)
      .single();
    return data?.id;
  } catch (error) {
    console.error('❌ Error getting user ID:', error);
    return null;
  }
}

/**
 * Full cache clear (for manual refresh or debugging)
 * Use only when user explicitly clicks "Refresh" button
 * @param {string} email - User email
 */
export async function fullCacheClear(email) {
  console.log(`🗑️ Full cache clear for: ${email}`);
  
  try {
    // Clear everything
    clearPlanCache(email);
    await seoCacheService.clearUserCache(email);
    await socialMediaCacheService.invalidateCache(email, 'facebook');
    await socialMediaCacheService.invalidateCache(email, 'instagram');
    await socialMediaCacheService.invalidateCache(email, 'linkedin');
    
    console.log('✅ Full cache cleared');
    return true;
  } catch (error) {
    console.error('❌ Full cache clear error:', error);
    return false;
  }
}

export default {
  smartCacheInvalidation,
  fullCacheClear
};
