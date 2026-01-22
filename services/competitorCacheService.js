import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ Supabase credentials not configured for competitor cache service');
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Cache duration: 7 days (in milliseconds)
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

const competitorCacheService = {
  /**
   * Get user ID from email
   */
  async getUserIdByEmail(email) {
    if (!supabase) {
      throw new Error('Supabase client not initialized');
    }

    // Lookup user by email

    const { data, error } = await supabase
      .from('users_table')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      console.error('❌ [CompetitorCache] Error fetching user ID:', error);
      return null;
    }

    if (!data) {
      console.warn('⚠️ [CompetitorCache] No user found with email:', email);
      return null;
    }

    console.log('✅ [CompetitorCache] Found user ID:', data.id);
    return data.id;
  },

  /**
   * Clean domain name for consistent storage
   */
  cleanDomain(domain) {
    return domain
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/$/, '')
      .split('/')[0]
      .toLowerCase();
  },

  /**
   * Get cached competitor analysis data
   * Now includes Instagram and Facebook handle matching for more accurate cache hits
   */
  async getCompetitorCache(email, userDomain, competitorDomain, userSocialHandles = {}, competitorSocialHandles = {}, forceRefresh = false) {
    if (!supabase) {
      console.warn('⚠️ [CompetitorCache] Supabase not configured, skipping cache check');
      return null;
    }

    if (forceRefresh) {
      console.log('🔄 [CompetitorCache] Force refresh requested, skipping cache');
      return null;
    }

    try {
      // Get user ID
      const userId = await this.getUserIdByEmail(email);
      if (!userId) {
        console.warn('⚠️ [CompetitorCache] User not found, cannot retrieve cache');
        return null;
      }

      // Clean domains
      const cleanUserDomain = this.cleanDomain(userDomain);
      const cleanCompetitorDomain = this.cleanDomain(competitorDomain);

      // Normalize social handles (lowercase, remove @ symbol)
      const normalizeHandle = (handle) => {
        if (!handle) return null;
        return handle.toLowerCase().replace('@', '').trim();
      };

      const userInstagram = normalizeHandle(userSocialHandles.instagram);
      const userFacebook = normalizeHandle(userSocialHandles.facebook);
      const competitorInstagram = normalizeHandle(competitorSocialHandles.instagram);
      const competitorFacebook = normalizeHandle(competitorSocialHandles.facebook);

      console.log(`🔍 [CompetitorCache] Checking cache:`);
      console.log(`   Domains: ${cleanUserDomain} vs ${cleanCompetitorDomain}`);
      console.log(`   User Social: IG=${userInstagram || 'none'}, FB=${userFacebook || 'none'}`);
      console.log(`   Competitor Social: IG=${competitorInstagram || 'none'}, FB=${competitorFacebook || 'none'}`);

      // Query cache with domain match first
      let query = supabase
        .from('competitor_cache')
        .select('*')
        .eq('user_id', userId)
        .eq('user_domain', cleanUserDomain)
        .eq('competitor_domain', cleanCompetitorDomain);

      // Add social handle matching
      if (userInstagram) {
        query = query.eq('user_instagram', userInstagram);
      } else {
        query = query.is('user_instagram', null);
      }

      if (userFacebook) {
        query = query.eq('user_facebook', userFacebook);
      } else {
        query = query.is('user_facebook', null);
      }

      if (competitorInstagram) {
        query = query.eq('competitor_instagram', competitorInstagram);
      } else {
        query = query.is('competitor_instagram', null);
      }

      if (competitorFacebook) {
        query = query.eq('competitor_facebook', competitorFacebook);
      } else {
        query = query.is('competitor_facebook', null);
      }

      const { data, error } = await query.maybeSingle();

      if (error) {
        console.error('❌ [CompetitorCache] Error fetching cache:', error);
        return null;
      }

      if (!data) {
        console.log('📭 [CompetitorCache] No cache found');
        return null;
      }

      // Check if cache is expired
      const now = new Date();
      const expiresAt = new Date(data.expires_at);
      const isExpired = now > expiresAt;

      if (isExpired) {
        console.log('⏰ [CompetitorCache] Cache expired, removing...');
        // Delete expired cache
        await supabase
          .from('competitor_cache')
          .delete()
          .eq('id', data.id);
        return null;
      }

      const cacheAge = Math.round((now - new Date(data.updated_at)) / 1000 / 60 / 60); // hours
      console.log(`✅ [CompetitorCache] Cache hit! Age: ${cacheAge} hours`);

      // Check if we have the new full_result format (includes both sites)
      if (data.full_result) {
        console.log('✅ [CompetitorCache] Using full result cache (includes both sites)');
        const fullResult = typeof data.full_result === 'string' ? JSON.parse(data.full_result) : data.full_result;
        return {
          ...fullResult,
          cached: true,
          cacheAge: cacheAge,
          lastUpdated: data.updated_at
        };
      }

      // Legacy format: only competitor data (will still fetch your site fresh)
      console.log('⚠️ [CompetitorCache] Using legacy cache format (competitor only)');
      const competitorSite = {
        domain: cleanCompetitorDomain,
        lighthouse: data.lighthouse_data,
        pagespeed: data.pagespeed_data,
        technicalSEO: data.technical_seo_data,
        puppeteer: data.puppeteer_data,
        backlinks: data.backlinks_data,
        googleAds: data.google_ads_data,
        metaAds: data.meta_ads_data,
        instagram: data.instagram_data,
        facebook: data.facebook_data,
        traffic: data.traffic_data,
        contentChanges: data.content_changes_data,
        contentUpdates: data.content_updates_data,
        fromCache: true
      };

      return {
        success: true,
        competitorSite: competitorSite,
        cached: true,
        cacheAge: cacheAge,
        lastUpdated: data.updated_at
      };

    } catch (error) {
      console.error('❌ [CompetitorCache] Error in getCompetitorCache:', error);
      return null;
    }
  },

  /**
   * Save competitor analysis data to cache
   * Now includes Instagram and Facebook handles for accurate cache key matching
   */
  async saveCompetitorCache(email, userDomain, competitorDomain, competitorData, userSocialHandles = {}, competitorSocialHandles = {}, cacheDurationDays = 7) {
    if (!supabase) {
      console.warn('⚠️ [CompetitorCache] Supabase not configured, skipping cache save');
      return false;
    }

    try {
      // Get user ID
      const userId = await this.getUserIdByEmail(email);
      if (!userId) {
        console.warn('⚠️ [CompetitorCache] User not found, cannot save cache');
        return false;
      }

      // Clean domains
      const cleanUserDomain = this.cleanDomain(userDomain);
      const cleanCompetitorDomain = this.cleanDomain(competitorDomain);

      // Normalize social handles
      const normalizeHandle = (handle) => {
        if (!handle) return null;
        return handle.toLowerCase().replace('@', '').trim();
      };

      const userInstagram = normalizeHandle(userSocialHandles.instagram);
      const userFacebook = normalizeHandle(userSocialHandles.facebook);
      const competitorInstagram = normalizeHandle(competitorSocialHandles.instagram);
      const competitorFacebook = normalizeHandle(competitorSocialHandles.facebook);

      console.log(`💾 [CompetitorCache] Saving cache:`);
      console.log(`   Domains: ${cleanUserDomain} vs ${cleanCompetitorDomain}`);
      console.log(`   User Social: IG=${userInstagram || 'none'}, FB=${userFacebook || 'none'}`);
      console.log(`   Competitor Social: IG=${competitorInstagram || 'none'}, FB=${competitorFacebook || 'none'}`);

      const now = new Date();
      const expiresAt = new Date(now.getTime() + (cacheDurationDays * 24 * 60 * 60 * 1000));

      // Extract competitor data (for backward compatibility)
      const competitor = competitorData.competitorSite || {};
      
      // Store FULL result including both sites and comparison
      const fullResultToCache = {
        success: competitorData.success,
        yourSite: competitorData.yourSite,
        competitorSite: competitorData.competitorSite,
        comparison: competitorData.comparison,
        timestamp: competitorData.timestamp
      };
      
      // Upsert cache data with social handle keys
      const { error } = await supabase
        .from('competitor_cache')
        .upsert(
          {
            user_id: userId,
            user_domain: cleanUserDomain,
            competitor_domain: cleanCompetitorDomain,
            // Add social handle identifiers for cache key matching
            user_instagram: userInstagram,
            user_facebook: userFacebook,
            competitor_instagram: competitorInstagram,
            competitor_facebook: competitorFacebook,
            // Store individual fields for backward compatibility
            lighthouse_data: competitor.lighthouse || null,
            pagespeed_data: competitor.pagespeed || null,
            technical_seo_data: competitor.technicalSEO || null,
            puppeteer_data: competitor.puppeteer || null,
            backlinks_data: competitor.backlinks || null,
            google_ads_data: competitor.googleAds || null,
            meta_ads_data: competitor.metaAds || null,
            instagram_data: competitor.instagram || null,
            facebook_data: competitor.facebook || null,
            traffic_data: competitor.traffic || null,
            content_changes_data: competitor.contentChanges || null,
            content_updates_data: competitor.contentUpdates || null,
            // NEW: Store complete result as JSON
            full_result: fullResultToCache,
            analysis_status: 'completed',
            error_details: null,
            updated_at: now.toISOString(),
            expires_at: expiresAt.toISOString()
          },
          {
            onConflict: 'user_id,user_domain,competitor_domain,user_instagram,user_facebook,competitor_instagram,competitor_facebook',
            ignoreDuplicates: false
          });

      if (error) {
        console.error('❌ [CompetitorCache] Error saving cache:', error);
        return false;
      }

      console.log(`✅ [CompetitorCache] Cache saved (expires in ${cacheDurationDays} days)`);
      return true;

    } catch (error) {
      console.error('❌ [CompetitorCache] Error in saveCompetitorCache:', error);
      return false;
    }
  },

  /**
   * Clear expired cache entries
   */
  async clearExpiredCache() {
    if (!supabase) {
      console.warn('⚠️ [CompetitorCache] Supabase not configured, skipping cleanup');
      return 0;
    }

    try {
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from('competitor_cache')
        .delete()
        .lt('expires_at', now)
        .select();

      if (error) {
        console.error('❌ [CompetitorCache] Error clearing expired cache:', error);
        return 0;
      }

      const count = data?.length || 0;
      if (count > 0) {
        console.log(`🗑️ [CompetitorCache] Cleared ${count} expired cache entries`);
      }

      return count;

    } catch (error) {
      console.error('❌ [CompetitorCache] Error in clearExpiredCache:', error);
      return 0;
    }
  },

  /**
   * Delete specific cache entry
   */
  async deleteCache(email, userDomain, competitorDomain) {
    if (!supabase) {
      console.warn('⚠️ [CompetitorCache] Supabase not configured');
      return false;
    }

    try {
      const userId = await this.getUserIdByEmail(email);
      if (!userId) return false;

      const cleanUserDomain = this.cleanDomain(userDomain);
      const cleanCompetitorDomain = this.cleanDomain(competitorDomain);

      const { error } = await supabase
        .from('competitor_cache')
        .delete()
        .eq('user_id', userId)
        .eq('user_domain', cleanUserDomain)
        .eq('competitor_domain', cleanCompetitorDomain);

      if (error) {
        console.error('❌ [CompetitorCache] Error deleting cache:', error);
        return false;
      }

      console.log(`🗑️ [CompetitorCache] Deleted cache: ${cleanUserDomain} vs ${cleanCompetitorDomain}`);
      return true;

    } catch (error) {
      console.error('❌ [CompetitorCache] Error in deleteCache:', error);
      return false;
    }
  }
};

export default competitorCacheService;