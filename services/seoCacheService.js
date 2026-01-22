import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ Supabase credentials not configured for cache service');
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Cache duration: 48 hours (in milliseconds) - Extended to reduce GA API usage
const CACHE_DURATION = 48 * 60 * 60 * 1000; // 48 hours (2 days)

const seoCacheService = {
  /**
   * Check if cached data is still valid (less than 24 hours old)
   */
  isCacheValid(lastFetchedAt) {
    if (!lastFetchedAt) return false;
    const cacheAge = Date.now() - new Date(lastFetchedAt).getTime();
    return cacheAge < CACHE_DURATION;
  },

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
      console.error('❌ Error fetching user ID:', error);
      return null;
    }

    if (!data) {
      console.warn('⚠️ No user found with email:', email);
      return null;
    }

    console.log('✅ Found user ID:', data.id);
    return data.id;
  },

  /**
   * Get cached Search Console data
   */
  async getSearchConsoleCache(email, days = 30, ignoreExpiry = false) {
    try {
      if (!supabase) {
        console.warn('⚠️ Supabase not configured, skipping cache');
        return null;
      }

      // Get user with plan info
      const { data: userData, error: userError } = await supabase
        .from('users_table')
        .select('id, plan')
        .eq('email', email)
        .maybeSingle();

      if (userError || !userData) {
        console.warn('⚠️ User not found in database');
        return null;
      }

      const userId = userData.id;
      const currentPlan = userData.plan;

      const { data, error } = await supabase
        .from('search_console_cache')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No cache entry found
          console.log('📭 No cache entry found for Search Console');
          return null;
        }
        console.error('❌ Error fetching Search Console cache:', error);
        return null;
      }

      // Check if plan matches (cache invalidation on plan change)
      if (data.plan && data.plan !== currentPlan) {
        console.log(`🔄 Plan changed (${data.plan} → ${currentPlan}), cache invalid`);
        return null;
      }

      // Check if date range matches (approximate check)
      if (data.date_range_start && data.date_range_end) {
        const startDate = new Date(data.date_range_start);
        const endDate = new Date(data.date_range_end);
        const durationMs = endDate.getTime() - startDate.getTime();
        const durationDays = Math.round(durationMs / (1000 * 60 * 60 * 24));

        // Allow 1 day difference to account for time zones / partial days
        if (Math.abs(durationDays - days) > 1) {
          console.log(`🔄 Cache miss: Requested ${days} days, found ${durationDays} days`);
          return null;
        }
      } else {
        // Legacy cache (assumed 30 days)
        // If user requests anything other than 30 days, treat legacy cache as invalid
        if (days !== 30) {
          console.log(`🔄 Cache miss: Requested ${days} days, found legacy cache (assumed 30 days)`);
          return null;
        }
      }

      // Check if cache is still valid (unless ignoreExpiry is true)
      if (!ignoreExpiry && !this.isCacheValid(data.last_fetched_at)) {
        console.log('⏰ Search Console cache expired');
        return null;
      }

      if (ignoreExpiry && !this.isCacheValid(data.last_fetched_at)) {
        console.log('✅ Using expired Search Console cache (fallback mode)');
      } else {
        console.log('✅ Using cached Search Console data');
      }
      return {
        dataAvailable: true,
        totalClicks: data.total_clicks,
        totalImpressions: data.total_impressions,
        averageCTR: parseFloat(data.average_ctr),
        averagePosition: parseFloat(data.average_position),
        organicTraffic: data.organic_traffic,
        topQueries: data.top_queries,
        topPages: data.top_pages,
        dailyData: data.daily_data,
        lighthouse: data.lighthouse,
        backlinks: data.backlinks,
        pagespeed: data.pagespeed_data,
        technicalSEO: data.technical_seo_data,
        puppeteer: data.puppeteer_data,
        siteUrl: data.site_url,
        domain: data.domain,
        dateRange: {
          startDate: data.date_range_start,
          endDate: data.date_range_end
        },
        lastUpdated: data.last_fetched_at,
        fromCache: true
      };
    } catch (error) {
      console.error('❌ Error in getSearchConsoleCache:', error);
      return null;
    }
  },

  /**
   * Save Search Console data to cache
   */
  async saveSearchConsoleCache(email, data) {
    try {
      if (!supabase) {
        console.warn('⚠️ Supabase not configured, skipping cache save');
        return false;
      }

      // Get user with plan info
      const { data: userData, error: userError } = await supabase
        .from('users_table')
        .select('id, plan')
        .eq('email', email)
        .maybeSingle();

      if (userError || !userData) {
        console.warn('⚠️ User not found in database, cannot save cache');
        return false;
      }

      const cacheData = {
        user_id: userData.id,
        site_url: data.siteUrl || '',
        domain: data.domain || '',
        total_clicks: data.totalClicks || 0,
        total_impressions: data.totalImpressions || 0,
        average_ctr: data.averageCTR || 0,
        average_position: data.averagePosition || 0,
        organic_traffic: data.organicTraffic || 0,
        top_queries: data.topQueries || [],
        top_pages: data.topPages || [],
        daily_data: data.dailyData || [],
        backlinks: data.backlinks || {},
        lighthouse: data.lighthouse || null,
        pagespeed_data: data.pagespeed || null,
        technical_seo_data: data.technicalSEO || null,
        puppeteer_data: data.puppeteer || null,
        date_range_start: data.dateRange?.startDate || null,
        date_range_end: data.dateRange?.endDate || null,
        updated_at: new Date().toISOString(),
        last_fetched_at: new Date().toISOString()
      };

      // Delete existing cache entry first (more reliable than upsert)
      await supabase
        .from('search_console_cache')
        .delete()
        .eq('user_id', userData.id);

      // Insert new cache entry
      const { error } = await supabase
        .from('search_console_cache')
        .insert(cacheData);

      if (error) {
        console.error('❌ Error saving Search Console cache:', error);
        return false;
      }

      console.log('✅ Search Console data cached successfully');
      return true;
    } catch (error) {
      console.error('❌ Error in saveSearchConsoleCache:', error);
      return false;
    }
  },

  /**
   * Get cached Google Analytics data
   */
  async getGoogleAnalyticsCache(email) {
    try {
      if (!supabase) {
        console.warn('⚠️ Supabase not configured, skipping cache');
        return null;
      }

      const userId = await this.getUserIdByEmail(email);
      if (!userId) {
        console.warn('⚠️ User not found in database');
        return null;
      }

      const { data, error } = await supabase
        .from('google_analytics_cache')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No cache entry found
          console.log('📭 No cache entry found for Google Analytics');
          return null;
        }
        console.error('❌ Error fetching Google Analytics cache:', error);
        return null;
      }

      // Check if cache is still valid
      if (!this.isCacheValid(data.last_fetched_at)) {
        console.log('⏰ Google Analytics cache expired');
        return null;
      }

      console.log('✅ Using cached Google Analytics data');
      return {
        propertyId: data.property_id,
        activeUsers: data.active_users,
        sessions: data.sessions,
        bounceRate: parseFloat(data.bounce_rate),
        avgSessionDuration: parseFloat(data.avg_session_duration),
        pageViews: data.page_views,
        conversions: data.conversions,
        revenue: parseFloat(data.revenue),
        dataAvailable: true,
        connected: true,
        lastUpdated: data.last_fetched_at,
        fromCache: true
      };
    } catch (error) {
      console.error('❌ Error in getGoogleAnalyticsCache:', error);
      return null;
    }
  },

  /**
   * Save Google Analytics data to cache
   */
  async saveGoogleAnalyticsCache(email, data) {
    try {
      if (!supabase) {
        console.warn('⚠️ Supabase not configured, skipping cache save');
        return false;
      }

      const userId = await this.getUserIdByEmail(email);
      if (!userId) {
        console.warn('⚠️ User not found in database, cannot save cache');
        return false;
      }

      const cacheData = {
        user_id: userId,
        property_id: data.propertyId || null,
        active_users: data.activeUsers || 0,
        sessions: data.sessions || 0,
        bounce_rate: data.bounceRate || 0,
        avg_session_duration: data.avgSessionDuration || 0,
        page_views: data.pageViews || 0,
        conversions: data.conversions || 0,
        revenue: data.revenue || 0,
        total_social_sessions: data.totalSocialSessions || 0,
        total_social_users: data.totalSocialUsers || 0,
        total_social_conversions: data.totalSocialConversions || 0,
        social_conversion_rate: data.socialConversionRate || 0,
        social_traffic_percentage: data.socialTrafficPercentage || 0,
        top_social_sources: data.topSocialSources || [],
        updated_at: new Date().toISOString(),
        last_fetched_at: new Date().toISOString()
      };

      // Upsert (insert or update)
      const { error } = await supabase
        .from('google_analytics_cache')
        .upsert(cacheData, {
          onConflict: 'user_id',
          ignoreDuplicates: false
        });

      if (error) {
        console.error('❌ Error saving Google Analytics cache:', error);
        return false;
      }

      console.log('✅ Google Analytics data cached successfully');
      return true;
    } catch (error) {
      console.error('❌ Error in saveGoogleAnalyticsCache:', error);
      return false;
    }
  },

  /**
   * Get cached Social Media metrics
   */
  async getSocialMediaCache(email) {
    try {
      if (!supabase) {
        console.warn('⚠️ Supabase not configured, skipping cache');
        return null;
      }

      const userId = await this.getUserIdByEmail(email);
      if (!userId) {
        console.warn('⚠️ User not found in database');
        return null;
      }

      const { data, error } = await supabase
        .from('google_analytics_cache')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.log('📭 No cache entry found for Social Media');
          return null;
        }
        console.error('❌ Error fetching Social Media cache:', error);
        return null;
      }

      // Check if cache is still valid
      if (!this.isCacheValid(data.last_fetched_at)) {
        console.log('⏰ Social Media cache expired');
        return null;
      }

      console.log('✅ Using cached Social Media data');
      return {
        totalSocialSessions: data.total_social_sessions,
        totalSocialUsers: data.total_social_users,
        totalSocialConversions: data.total_social_conversions,
        socialConversionRate: parseFloat(data.social_conversion_rate),
        socialTrafficPercentage: parseFloat(data.social_traffic_percentage),
        topSocialSources: data.top_social_sources || [],
        dataAvailable: true,
        connected: true,
        lastUpdated: data.last_fetched_at,
        fromCache: true
      };
    } catch (error) {
      console.error('❌ Error in getSocialMediaCache:', error);
      return null;
    }
  },

  /**
   * Clear cache for a user (useful for manual refresh)
   */
  async clearUserCache(email) {
    try {
      if (!supabase) {
        console.warn('⚠️ Supabase not configured');
        return false;
      }

      const userId = await this.getUserIdByEmail(email);
      if (!userId) {
        return false;
      }

      // Delete both caches
      await supabase.from('search_console_cache').delete().eq('user_id', userId);
      await supabase.from('google_analytics_cache').delete().eq('user_id', userId);
      await supabase.from('lighthouse_cache').delete().eq('user_id', userId);

      console.log('✅ Cache cleared for user');
      return true;
    } catch (error) {
      console.error('❌ Error clearing cache:', error);
      return false;
    }
  },

  /**
   * Get cached Lighthouse data for a specific domain
   * @param {string} email - User email
   * @param {string} domain - Domain to get Lighthouse data for
   * @param {boolean} ignoreExpiry - If true, return data even if expired (for fallback)
   */
  async getLighthouseCache(email, domain, ignoreExpiry = false) {
    try {
      if (!supabase) {
        console.warn('⚠️ Supabase not configured, skipping cache');
        return null;
      }

      const userId = await this.getUserIdByEmail(email);
      if (!userId) {
        console.warn('⚠️ User not found in database');
        return null;
      }

      const { data, error } = await supabase
        .from('lighthouse_cache')
        .select('*')
        .eq('user_id', userId)
        .eq('domain', domain)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.log('📭 No cache entry found for Lighthouse');
          return null;
        }
        console.error('❌ Error fetching Lighthouse cache:', error);
        return null;
      }

      // Check if cache is still valid (unless ignoreExpiry is true)
      if (!ignoreExpiry && !this.isCacheValid(data.last_fetched_at)) {
        console.log('⏰ Lighthouse cache expired');
        return null;
      }

      if (ignoreExpiry) {
        console.log('✅ Using expired Lighthouse cache (fallback mode)');
      } else {
        console.log('✅ Using cached Lighthouse data');
      }

      return data.lighthouse_data;
    } catch (error) {
      console.error('❌ Error in getLighthouseCache:', error);
      return null;
    }
  },

  /**
   * Save Lighthouse data to cache
   * @param {string} email - User email
   * @param {string} domain - Domain the data is for
   * @param {object} lighthouseData - Lighthouse analysis results
   */
  async saveLighthouseCache(email, domain, lighthouseData) {
    try {
      if (!supabase) {
        console.warn('⚠️ Supabase not configured, skipping cache save');
        return false;
      }

      if (!lighthouseData) {
        console.warn('⚠️ No lighthouse data to cache');
        return false;
      }

      const userId = await this.getUserIdByEmail(email);
      if (!userId) {
        console.warn('⚠️ User not found in database, cannot save cache');
        return false;
      }

      const cacheData = {
        user_id: userId,
        domain: domain,
        lighthouse_data: lighthouseData,
        updated_at: new Date().toISOString(),
        last_fetched_at: new Date().toISOString()
      };

      // Delete existing cache entry first (more reliable than upsert with schema cache issues)
      await supabase
        .from('lighthouse_cache')
        .delete()
        .eq('user_id', userId)
        .eq('domain', domain);

      // Insert new cache entry
      const { error } = await supabase
        .from('lighthouse_cache')
        .insert(cacheData);

      if (error) {
        console.error('❌ Error saving Lighthouse cache:', error);
        return false;
      }

      console.log('✅ Lighthouse data cached successfully for domain:', domain);
      return true;
    } catch (error) {
      console.error('❌ Error in saveLighthouseCache:', error);
      return false;
    }
  },

  /**
   * Get cached SE Ranking backlinks data
   * @param {string} email - User email
   * @param {string} domain - Domain to get cached data for
   * @param {boolean} ignoreExpiry - Whether to return expired cache (default: false)
   * @returns {Object|null} Cached backlinks data or null
   */
  async getSERankingCache(email, domain, ignoreExpiry = false) {
    if (!supabase) {
      console.warn('⚠️ Supabase not configured, skipping SE Ranking cache check');
      return null;
    }

    try {
      // Get user ID
      const userId = await this.getUserIdByEmail(email);
      if (!userId) {
        console.warn('⚠️ User not found, cannot retrieve SE Ranking cache');
        return null;
      }

      // Clean domain
      const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').split('/')[0];

      console.log(`🔍 Checking SE Ranking cache for domain: ${cleanDomain}`);

      // Query cache
      const { data, error } = await supabase
        .from('se_ranking_cache')
        .select('*')
        .eq('user_id', userId)
        .eq('domain', cleanDomain)
        .maybeSingle();

      if (error) {
        console.error('❌ Error fetching SE Ranking cache:', error);
        return null;
      }

      if (!data) {
        console.log('📭 No SE Ranking cache found for domain:', cleanDomain);
        return null;
      }

      // Check if cache is expired
      const now = new Date();
      const expiresAt = new Date(data.expires_at);
      const isExpired = now > expiresAt;

      if (isExpired && !ignoreExpiry) {
        console.log('⏰ SE Ranking cache expired for domain:', cleanDomain);
        return null;
      }

      const cacheAge = Math.round((now - new Date(data.updated_at)) / 1000 / 60); // minutes
      console.log(`✅ SE Ranking cache hit! Age: ${cacheAge} minutes${isExpired ? ' (expired but used anyway)' : ''}`);

      return {
        ...data.backlinks_data,
        cached: true,
        cacheAge: cacheAge,
        lastUpdated: data.updated_at
      };

    } catch (error) {
      console.error('❌ Error in getSERankingCache:', error);
      return null;
    }
  },

  /**
   * Save SE Ranking backlinks data to cache
   * @param {string} email - User email
   * @param {string} domain - Domain to cache data for
   * @param {Object} backlinksData - SE Ranking backlinks data to cache
   * @param {number} cacheDurationHours - Cache duration in hours (default: 24)
   * @returns {boolean} Success status
   */
  async saveSERankingCache(email, domain, backlinksData, cacheDurationHours = 24) {
    if (!supabase) {
      console.warn('⚠️ Supabase not configured, skipping SE Ranking cache save');
      return false;
    }

    try {
      // Get user ID
      const userId = await this.getUserIdByEmail(email);
      if (!userId) {
        console.warn('⚠️ User not found, cannot save SE Ranking cache');
        return false;
      }

      // Clean domain
      const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').split('/')[0];

      console.log(`💾 Saving SE Ranking cache for domain: ${cleanDomain}`);

      const now = new Date();
      const expiresAt = new Date(now.getTime() + (cacheDurationHours * 60 * 60 * 1000));

      // Prepare cache data (remove any existing cache metadata)
      const { cached, cacheAge, lastUpdated, ...cleanData } = backlinksData;

      // Delete existing cache entry first (more reliable than upsert)
      await supabase
        .from('se_ranking_cache')
        .delete()
        .eq('user_id', userId)
        .eq('domain', cleanDomain);

      // Insert new cache entry
      const { error } = await supabase
        .from('se_ranking_cache')
        .insert({
          user_id: userId,
          domain: cleanDomain,
          backlinks_data: cleanData,
          updated_at: now.toISOString(),
          expires_at: expiresAt.toISOString()
        });

      if (error) {
        console.error('❌ Error saving SE Ranking cache:', error);
        return false;
      }

      console.log(`✅ SE Ranking cache saved successfully (expires in ${cacheDurationHours}h)`);
      return true;

    } catch (error) {
      console.error('❌ Error in saveSERankingCache:', error);
      return false;
    }
  },

  /**
   * Clear expired SE Ranking cache entries
   * @returns {number} Number of entries deleted
   */
  async clearExpiredSERankingCache() {
    if (!supabase) {
      console.warn('⚠️ Supabase not configured, skipping cache cleanup');
      return 0;
    }

    try {
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from('se_ranking_cache')
        .delete()
        .lt('expires_at', now)
        .select();

      if (error) {
        console.error('❌ Error clearing expired SE Ranking cache:', error);
        return 0;
      }

      const count = data?.length || 0;
      if (count > 0) {
        console.log(`🗑️ Cleared ${count} expired SE Ranking cache entries`);
      }

      return count;

    } catch (error) {
      console.error('❌ Error in clearExpiredSERankingCache:', error);
      return 0;
    }
  },

  /**
   * Get cached competitor intelligence data
   * @param {string} email - User email
   * @param {string} userDomain - User's own domain
   * @param {string} competitorDomain - Competitor domain
   * @param {boolean} ignoreExpiry - Whether to return expired cache (default: false)
   * @returns {Object|null} Cached competitor data or null
   */
  async getCompetitorCache(email, userDomain, competitorDomain, ignoreExpiry = false) {
    if (!supabase) {
      console.warn('⚠️ Supabase not configured, skipping competitor cache check');
      return null;
    }

    try {
      // Get user ID
      const userId = await this.getUserIdByEmail(email);
      if (!userId) {
        console.warn('⚠️ User not found, cannot retrieve competitor cache');
        return null;
      }

      // Clean domains
      const cleanUserDomain = userDomain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').split('/')[0];
      const cleanCompetitorDomain = competitorDomain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').split('/')[0];

      console.log(`🔍 Checking competitor cache: ${cleanUserDomain} vs ${cleanCompetitorDomain}`);

      // Query cache
      const { data, error } = await supabase
        .from('competitor_cache')
        .select('*')
        .eq('user_id', userId)
        .eq('user_domain', cleanUserDomain)
        .eq('competitor_domain', cleanCompetitorDomain)
        .maybeSingle();

      if (error) {
        console.error('❌ Error fetching competitor cache:', error);
        return null;
      }

      if (!data) {
        console.log('📭 No competitor cache found');
        return null;
      }

      // Check if cache is expired
      const now = new Date();
      const expiresAt = new Date(data.expires_at);
      const isExpired = now > expiresAt;

      if (isExpired && !ignoreExpiry) {
        console.log('⏰ Competitor cache expired');
        return null;
      }

      const cacheAge = Math.round((now - new Date(data.updated_at)) / 1000 / 60 / 60); // hours
      console.log(`✅ Competitor cache hit! Age: ${cacheAge} hours${isExpired ? ' (expired but used anyway)' : ''}`);

      // Reconstruct the data structure from separated columns
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
        contentUpdates: data.content_updates_data
      };

      return {
        success: true,
        competitorSite: competitorSite,
        cached: true,
        cacheAge: cacheAge,
        lastUpdated: data.updated_at
      };

    } catch (error) {
      console.error('❌ Error in getCompetitorCache:', error);
      return null;
    }
  },

  /**
   * Save competitor intelligence data to cache
   * @param {string} email - User email
   * @param {string} userDomain - User's own domain
   * @param {string} competitorDomain - Competitor domain
   * @param {Object} competitorData - Competitor analysis data
   * @param {number} cacheDurationDays - Cache duration in days (default: 7)
   * @returns {boolean} Success status
   */
  async saveCompetitorCache(email, userDomain, competitorDomain, competitorData, cacheDurationDays = 7) {
    if (!supabase) {
      console.warn('⚠️ Supabase not configured, skipping competitor cache save');
      return false;
    }

    try {
      // Get user ID
      const userId = await this.getUserIdByEmail(email);
      if (!userId) {
        console.warn('⚠️ User not found, cannot save competitor cache');
        return false;
      }

      // Clean domains
      const cleanUserDomain = userDomain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').split('/')[0];
      const cleanCompetitorDomain = competitorDomain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').split('/')[0];

      console.log(`💾 Saving competitor cache: ${cleanUserDomain} vs ${cleanCompetitorDomain}`);

      const now = new Date();
      const expiresAt = new Date(now.getTime() + (cacheDurationDays * 24 * 60 * 60 * 1000));

      // Remove cache metadata before saving
      const { cached, cacheAge, lastUpdated, ...cleanData } = competitorData;

      // Extract data for each service from competitorSite
      const competitor = cleanData.competitorSite || {};

      // Upsert cache data with separated columns
      const { error } = await supabase
        .from('competitor_cache')
        .upsert(
          {
            user_id: userId,
            user_domain: cleanUserDomain,
            competitor_domain: cleanCompetitorDomain,
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
            analysis_status: 'completed',
            error_details: null,
            updated_at: now.toISOString(),
            expires_at: expiresAt.toISOString()
          },
          {
            onConflict: 'user_id,user_domain,competitor_domain',
            ignoreDuplicates: false
          });

      if (error) {
        console.error('❌ Error saving competitor cache:', error);
        return false;
      }

      console.log(`✅ Competitor cache saved (expires in ${cacheDurationDays} days)`);
      return true;

    } catch (error) {
      console.error('❌ Error in saveCompetitorCache:', error);
      return false;
    }
  },

  /**
   * Clear expired competitor cache entries
   * @returns {number} Number of entries deleted
   */
  async clearExpiredCompetitorCache() {
    if (!supabase) {
      console.warn('⚠️ Supabase not configured, skipping cache cleanup');
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
        console.error('❌ Error clearing expired competitor cache:', error);
        return 0;
      }

      const count = data?.length || 0;
      if (count > 0) {
        console.log(`🗑️ Cleared ${count} expired competitor cache entries`);
      }

      return count;

    } catch (error) {
      console.error('❌ Error in clearExpiredCompetitorCache:', error);
      return 0;
    }
  }
};

export default seoCacheService;
