import { createClient } from '@supabase/supabase-js';
import competitorAnalysisService from './competitorAnalysisService.js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ Supabase credentials not configured for Puppeteer cache service');
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Cache duration: 7 days (same as competitor cache)
const CACHE_DURATION_DAYS = 7;
const CACHE_DURATION_MS = CACHE_DURATION_DAYS * 24 * 60 * 60 * 1000;

const puppeteerCacheService = {
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
   * Get user ID from email
   */
  async getUserIdByEmail(email) {
    if (!supabase) {
      throw new Error('Supabase client not initialized');
    }

    const { data, error } = await supabase
      .from('users_table')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      console.error('❌ [PuppeteerCache] Error fetching user ID:', error);
      return null;
    }

    if (!data) {
      console.warn('⚠️ [PuppeteerCache] No user found with email:', email);
      return null;
    }

    return data.id;
  },

  /**
   * Check if cache is still valid (less than 7 days old)
   */
  isCacheValid(lastFetchedAt) {
    if (!lastFetchedAt) return false;
    const cacheAge = Date.now() - new Date(lastFetchedAt).getTime();
    return cacheAge < CACHE_DURATION_MS;
  },

  /**
   * Get cached Puppeteer analysis for user's own domain from search_console_cache
   * This is used during competitor analysis to avoid re-analyzing the user's site
   */
  async getUserDomainPuppeteerCache(email, domain, forceRefresh = false) {
    if (!supabase) {
      console.warn('⚠️ [PuppeteerCache] Supabase not configured, skipping cache');
      return null;
    }

    if (forceRefresh) {
      console.log('🔄 [PuppeteerCache] Force refresh requested, skipping cache');
      return null;
    }

    try {
      const userId = await this.getUserIdByEmail(email);
      if (!userId) {
        return null;
      }

      const cleanDomainName = this.cleanDomain(domain);

      console.log(`🔍 [PuppeteerCache] Checking cache for user domain: ${cleanDomainName}`);

      const { data, error } = await supabase
        .from('search_console_cache')
        .select('puppeteer_data, last_fetched_at, domain')
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.log('📭 [PuppeteerCache] No cache entry found for user domain');
          return null;
        }
        console.error('❌ [PuppeteerCache] Error fetching cache:', error);
        return null;
      }

      // Check if puppeteer data exists
      if (!data.puppeteer_data) {
        console.log('📭 [PuppeteerCache] No Puppeteer data in cache');
        return null;
      }

      // Check if cache is still valid
      if (!this.isCacheValid(data.last_fetched_at)) {
        const cacheAge = Math.round((Date.now() - new Date(data.last_fetched_at).getTime()) / (1000 * 60 * 60));
        console.log(`⏰ [PuppeteerCache] Cache expired (${cacheAge}h old)`);
        return null;
      }

      const cacheAgeMinutes = Math.round((Date.now() - new Date(data.last_fetched_at).getTime()) / (1000 * 60));
      console.log(`✅ [PuppeteerCache] Using cached Puppeteer data (${cacheAgeMinutes}m old)`);

      return {
        success: true,
        data: data.puppeteer_data,
        cached: true,
        cacheAge: cacheAgeMinutes,
        lastFetchedAt: data.last_fetched_at
      };

    } catch (error) {
      console.error('❌ [PuppeteerCache] Error in getUserDomainPuppeteerCache:', error);
      return null;
    }
  },

  /**
   * Get cached Puppeteer analysis for a competitor domain from competitor_cache
   */
  async getCompetitorDomainPuppeteerCache(email, competitorDomain, forceRefresh = false) {
    if (!supabase) {
      console.warn('⚠️ [PuppeteerCache] Supabase not configured, skipping cache');
      return null;
    }

    if (forceRefresh) {
      console.log('🔄 [PuppeteerCache] Force refresh requested, skipping cache');
      return null;
    }

    try {
      const userId = await this.getUserIdByEmail(email);
      if (!userId) {
        return null;
      }

      const cleanCompetitorDomain = this.cleanDomain(competitorDomain);

      console.log(`🔍 [PuppeteerCache] Checking cache for competitor domain: ${cleanCompetitorDomain}`);

      const { data, error } = await supabase
        .from('competitor_cache')
        .select('puppeteer_data, updated_at, competitor_domain, expires_at')
        .eq('user_id', userId)
        .eq('competitor_domain', cleanCompetitorDomain)
        .gt('expires_at', new Date().toISOString())
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('❌ [PuppeteerCache] Error fetching competitor cache:', error);
        return null;
      }

      if (!data) {
        console.log('📭 [PuppeteerCache] No cache entry found for competitor domain');
        return null;
      }

      // Check if puppeteer data exists
      if (!data.puppeteer_data) {
        console.log('📭 [PuppeteerCache] No Puppeteer data in competitor cache');
        return null;
      }

      const cacheAgeMinutes = Math.round((Date.now() - new Date(data.updated_at).getTime()) / (1000 * 60));
      console.log(`✅ [PuppeteerCache] Using cached competitor Puppeteer data (${cacheAgeMinutes}m old)`);

      return {
        success: true,
        data: data.puppeteer_data,
        cached: true,
        cacheAge: cacheAgeMinutes,
        lastFetchedAt: data.updated_at
      };

    } catch (error) {
      console.error('❌ [PuppeteerCache] Error in getCompetitorDomainPuppeteerCache:', error);
      return null;
    }
  },

  /**
   * Save Puppeteer analysis for user's own domain to search_console_cache
   * This should be called from the SEO dashboard when fetching user's site data
   */
  async saveUserDomainPuppeteerCache(email, domain, puppeteerData) {
    if (!supabase) {
      console.warn('⚠️ [PuppeteerCache] Supabase not configured, skipping cache save');
      return false;
    }

    try {
      const userId = await this.getUserIdByEmail(email);
      if (!userId) {
        return false;
      }

      const cleanDomainName = this.cleanDomain(domain);
      const now = new Date().toISOString();

      console.log(`💾 [PuppeteerCache] Saving Puppeteer data for user domain: ${cleanDomainName}`);

      // Update or insert puppeteer_data in search_console_cache
      const { error } = await supabase
        .from('search_console_cache')
        .upsert(
          {
            user_id: userId,
            site_url: `https://${cleanDomainName}`,
            domain: cleanDomainName,
            puppeteer_data: puppeteerData,
            updated_at: now,
            last_fetched_at: now
          },
          {
            onConflict: 'user_id'
          }
        );

      if (error) {
        console.error('❌ [PuppeteerCache] Error saving cache:', error);
        return false;
      }

      console.log('✅ [PuppeteerCache] Successfully saved Puppeteer data to cache');
      return true;

    } catch (error) {
      console.error('❌ [PuppeteerCache] Error in saveUserDomainPuppeteerCache:', error);
      return false;
    }
  },

  /**
   * Fetch and cache Puppeteer analysis for a domain
   * This is a convenience method that fetches from API and saves to cache
   */
  async fetchAndCachePuppeteerAnalysis(email, domain, isUserDomain = true) {
    console.log(`🚀 [PuppeteerCache] Fetching Puppeteer analysis for: ${domain}`);

    try {
      // Fetch from Puppeteer API
      const result = await competitorAnalysisService.analyzeWebsite(domain);

      if (!result.success) {
        console.error('❌ [PuppeteerCache] Puppeteer analysis failed:', result.error);
        return null;
      }

      // Save to appropriate cache
      if (isUserDomain) {
        await this.saveUserDomainPuppeteerCache(email, domain, result);
      }
      // For competitor domains, saving will be handled by competitorCacheService

      return result;

    } catch (error) {
      console.error('❌ [PuppeteerCache] Error in fetchAndCachePuppeteerAnalysis:', error);
      return null;
    }
  },

  /**
   * Get Puppeteer analysis with smart caching
   * Tries cache first, falls back to API if needed
   */
  async getPuppeteerAnalysis(email, domain, isUserDomain = true, forceRefresh = false) {
    console.log(`🔎 [PuppeteerCache] Getting Puppeteer analysis for: ${domain} (user=${isUserDomain})`);

    // Try cache first if not forcing refresh
    if (!forceRefresh) {
      const cachedData = isUserDomain
        ? await this.getUserDomainPuppeteerCache(email, domain, forceRefresh)
        : await this.getCompetitorDomainPuppeteerCache(email, domain, forceRefresh);

      if (cachedData && cachedData.success) {
        console.log(`✅ [PuppeteerCache] Returning cached data (${cachedData.cacheAge}m old)`);
        return cachedData.data;
      }
    }

    // Cache miss or force refresh - fetch from API
    console.log('📡 [PuppeteerCache] Cache miss, fetching from Puppeteer API...');
    const result = await this.fetchAndCachePuppeteerAnalysis(email, domain, isUserDomain);

    return result;
  },

  /**
   * Pre-warm cache for user's domain
   * Call this from SEO dashboard or during user setup
   */
  async prewarmUserDomainCache(email, domain) {
    console.log(`🔥 [PuppeteerCache] Pre-warming cache for user domain: ${domain}`);

    try {
      // Check if we already have recent cache
      const cached = await this.getUserDomainPuppeteerCache(email, domain);
      if (cached) {
        console.log(`✅ [PuppeteerCache] Cache already warm (${cached.cacheAge}m old)`);
        return true;
      }

      // Fetch and cache
      const result = await this.fetchAndCachePuppeteerAnalysis(email, domain, true);
      return result !== null;

    } catch (error) {
      console.error('❌ [PuppeteerCache] Error pre-warming cache:', error);
      return false;
    }
  }
};

export default puppeteerCacheService;
