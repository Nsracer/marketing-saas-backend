/**
 * Social Media Cache Service
 * Manages caching for LinkedIn, Facebook, and Instagram metrics
 * Uses Supabase for persistent storage with automatic expiration
 */

import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const CACHE_DURATION_MINUTES = 180; // 3 hours cache duration

const socialMediaCacheService = {
  /**
   * Get cached social media data (alias for getCachedMetrics)
   * @param {string} userEmail - User's email
   * @param {string} platform - Platform ('linkedin', 'facebook', 'instagram')
   * @param {string} period - Time period (optional)
   * @returns {Promise<object|null>} Cached data or null if expired/missing
   */
  async getCachedData(userEmail, platform, period = 'month') {
    return this.getCachedMetrics(userEmail, platform, period);
  },

  /**
   * Get cached metrics (main method)
   * @param {string} userEmail - User's email
   * @param {string} platform - Platform ('linkedin', 'facebook', 'instagram')
   * @param {string} period - Time period
   * @returns {Promise<object|null>} Cached data or null if expired/missing
   */
  async getCachedMetrics(userEmail, platform, period = 'month', ignoreExpiration = false, filterId = null) {
    try {
      console.log(`📦 Checking cache for ${platform} - ${userEmail} ${filterId ? `(ID: ${filterId})` : ''} ${ignoreExpiration ? '(ignoring expiration)' : ''}`);

      let query = supabase
        .from('social_media_cache')
        .select('*')
        .eq('user_email', userEmail)
        .eq('platform', platform);

      // Filter by specific ID if provided (for LinkedIn organizations)
      if (platform === 'linkedin') {
        if (filterId) {
          // Specific organization requested
          query = query.eq('linkedin_company_id', filterId);
        } else {
          // No specific org ID - exclude personal profile data to only get organization data
          // Personal profile data is marked with linkedin_company_id = 'personal'
          query = query.neq('linkedin_company_id', 'personal');
        }
      }

      if (!ignoreExpiration) {
        query = query.gt('expires_at', new Date().toISOString());
      }

      const { data, error } = await query
        .order('last_fetched_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.log(`📭 No valid cache found for ${platform}`);
          return null;
        }
        throw error;
      }

      if (!data) {
        console.log(`📭 No valid cache found for ${platform}`);
        return null;
      }

      const ageMinutes = Math.floor((Date.now() - new Date(data.last_fetched_at).getTime()) / 60000);
      console.log(`✅ Cache hit for ${platform} (${ageMinutes} minutes old)`);

      // Log cache hit
      await this.logFetch(userEmail, platform, 'metrics', 'cached', 0, 0, true);

      // Extract latest follower count from follower_growth if follower_count is 0
      let followerCount = data.follower_count;
      if (followerCount === 0 && data.follower_growth && data.follower_growth.length > 0) {
        const latestGrowth = data.follower_growth[data.follower_growth.length - 1];
        followerCount = latestGrowth.followers || 0;
        console.log(`📊 Extracted follower count from growth data: ${followerCount}`);
      }

      let engagementData = data.engagement_data || {
        likes: 0,
        comments: 0,
        shares: 0,
        clicks: 0,
        impressions: 0,
        totalReactions: 0,
        engagementRate: 0,
        score: 0,
        reach: 0,
        rateSource: null
      };

      // Calculate engagement rate if it's 0 but we have metrics (Facebook fix)
      if (platform === 'facebook' && engagementData.engagementRate === 0 && followerCount > 0) {
        const avgInteractions = engagementData.avgInteractions || 0;
        const postsCount = engagementData.postsInPeriod || 0;

        if (avgInteractions > 0 && postsCount > 0) {
          engagementData.engagementRate = parseFloat(((avgInteractions / followerCount) * 100).toFixed(2));
          engagementData.rateSource = 'calculated-from-cache';
          console.log(`📊 Calculated Facebook engagement rate: ${engagementData.engagementRate}% (${avgInteractions} avg interactions / ${followerCount} followers)`);
        }
      }

      // Calculate engagement rate if it's 0 but we have metrics (Facebook fix)
      if (platform === 'facebook' && engagementData.engagementRate === 0 && followerCount > 0) {
        const avgInteractions = engagementData.avgInteractions || 0;
        const postsCount = engagementData.postsInPeriod || 0;

        if (avgInteractions > 0 && postsCount > 0) {
          engagementData.engagementRate = parseFloat(((avgInteractions / followerCount) * 100).toFixed(2));
          engagementData.rateSource = 'calculated-from-cache';
          console.log(`📊 Calculated Facebook engagement rate: ${engagementData.engagementRate}% (${avgInteractions} avg interactions / ${followerCount} followers)`);
        }
      }

      // For LinkedIn, include organization info
      const organizationInfo = platform === 'linkedin' ? {
        id: data.linkedin_company_id,
        urn: data.linkedin_company_urn,
        name: data.account_name
      } : null;

      return {
        companyName: data.account_name,
        pageName: data.account_name,
        companyUrl: data.profile_url,
        companyFollowers: followerCount,
        linkedin_company_id: data.linkedin_company_id,
        organizationInfo: organizationInfo,
        metrics: {
          avgLikes: engagementData.avgLikes || 0,
          avgComments: engagementData.avgComments || 0,
          avgShares: engagementData.avgShares || 0,
          avgInteractions: engagementData.avgInteractions || 0,
          engagementRate: engagementData.engagementRate || 0,
          postsInPeriod: engagementData.postsInPeriod || 0
        },
        // Add structure expected by CompetitorResults.tsx
        profile: {
          followers: followerCount,
          avgInteractions: engagementData.avgInteractions || 0,
          avgEngagementRate: engagementData.engagementRate || 0
        },
        engagement: {
          summary: {
            avgLikesPerPost: engagementData.avgLikes || 0,
            avgCommentsPerPost: engagementData.avgComments || 0,
            engagementRate: engagementData.engagementRate || 0
          }
        },
        engagementScore: engagementData,
        followerGrowth: data.follower_growth || [],
        topPosts: data.top_posts || [],
        posts: data.posts_data || { total: 0, topPerforming: [] },
        reputationBenchmark: data.reputation_data || {},
        dataAvailable: data.data_available,
        lastUpdated: data.last_fetched_at,
        cacheAge: ageMinutes,
        source: `${platform} API (cached)`
      };
    } catch (error) {
      console.error(`❌ Error getting cached data for ${platform}:`, error);
      return null;
    }
  },

  /**
   * Store social media data in cache (alias for cacheMetrics)
   * @param {string} userEmail - User's email
   * @param {string} platform - Platform ('linkedin', 'facebook', 'instagram')
   * @param {object} data - Data to cache
   * @param {string|number} periodOrDuration - Period or cache duration
   * @returns {Promise<boolean>} Success status
   */
  async setCachedData(userEmail, platform, data, periodOrDuration = CACHE_DURATION_MINUTES) {
    const cacheDuration = typeof periodOrDuration === 'number' ? periodOrDuration : CACHE_DURATION_MINUTES;
    return this.cacheMetrics(userEmail, platform, data, periodOrDuration);
  },

  /**
   * Cache metrics (main method)
   * @param {string} userEmail - User's email
   * @param {string} platform - Platform ('linkedin', 'facebook', 'instagram')
   * @param {object} data - Data to cache
   * @param {string} period - Time period
   * @returns {Promise<boolean>} Success status
   */
  async cacheMetrics(userEmail, platform, data, period = 'month') {
    const cacheDuration = CACHE_DURATION_MINUTES;
    try {
      console.log(`💾 Caching ${platform} data for ${userEmail} (${cacheDuration} min)`);

      const expiresAt = new Date(Date.now() + cacheDuration * 60 * 1000).toISOString();

      // Extract follower count - try multiple sources
      let followerCount = data.companyFollowers || data.followerCount || data.currentFollowers || data.account?.followers || 0;

      // If follower count is 0, try to extract from follower growth array
      if (followerCount === 0 && data.followerGrowth && data.followerGrowth.length > 0) {
        const latestGrowth = data.followerGrowth[data.followerGrowth.length - 1];
        followerCount = latestGrowth.followers || 0;
        console.log(`📊 Extracted follower count from growth data: ${followerCount}`);
      }

      // Extract top posts - handle both topPosts and topPerformingPosts
      const topPosts = data.topPosts || data.topPerformingPosts || [];
      console.log(`📸 Caching ${topPosts.length} top posts for ${platform}`);

      // Sanitize posts to remove invalid Unicode characters (unpaired surrogates)
      const sanitizedTopPosts = topPosts.map(post => {
        if (post.caption || post.message) {
          const text = post.caption || post.message;
          // Remove unpaired surrogates and invalid Unicode
          const sanitized = text.replace(/[\ud800-\udfff]/g, '');
          return {
            ...post,
            caption: post.caption ? sanitized : post.caption,
            message: post.message ? sanitized : post.message
          };
        }
        return post;
      });

      // Extract engagement data - handle Instagram V2 structure
      let engagementData = {};
      if (platform === 'instagram' && data.cumulativeTotals) {
        // Instagram V2 structure - cache cumulative totals (not averages)
        const postsCount = topPosts.length || 1;
        const totalEngagement = data.cumulativeTotals.totalEngagement || 0;

        engagementData = {
          // Store cumulative totals for frontend display
          likes: data.cumulativeTotals.likes || 0,
          comments: data.cumulativeTotals.comments || 0,
          shares: 0,
          saved: data.cumulativeTotals.saved || 0,
          totalEngagement: totalEngagement,
          engagementRate: parseFloat(data.averages?.engagementRate || 0),
          postsInPeriod: postsCount,
          // Store averages for cache retrieval
          avgLikes: parseFloat(data.averages?.likesPerPost || 0),
          avgComments: parseFloat(data.averages?.commentsPerPost || 0),
          avgInteractions: parseFloat(data.averages?.engagementPerPost || 0),
          reach: 0,
          impressions: 0,
          clicks: 0
        };
        console.log(`📊 Instagram engagement data cached: ${engagementData.likes} likes, ${engagementData.comments} comments, ${engagementData.engagementRate}% rate`);
      } else {
        // Standard structure (Facebook, LinkedIn)
        engagementData = {
          likes: data.engagementScore?.likes || 0,
          comments: data.engagementScore?.comments || 0,
          shares: data.engagementScore?.shares || 0,
          clicks: data.engagementScore?.clicks || 0,
          impressions: data.engagementScore?.impressions || 0,
          totalReactions: data.engagementScore?.totalReactions || 0,
          engagementRate: data.engagementScore?.engagementRate || 0,
          score: data.engagementScore?.score || 0,
          reach: data.engagementScore?.reach || 0,
          rateSource: data.engagementScore?.rateSource || null,
          postsInPeriod: data.engagementScore?.postsInPeriod || 0,
          // Add averages from metrics object
          avgLikes: data.metrics?.avgLikes || 0,
          avgComments: data.metrics?.avgComments || 0,
          avgShares: data.metrics?.avgShares || 0,
          avgInteractions: data.metrics?.avgInteractions || 0
        };
      }

      const cacheEntry = {
        user_email: userEmail,
        platform: platform,
        account_id: data.accountId || data.companyId || null,
        account_name: data.companyName || data.pageName || data.username || data.account?.username || null,
        username: data.username || data.account?.username || null,
        profile_url: data.companyUrl || data.pageUrl || data.profileUrl || null,
        engagement_data: engagementData,
        follower_count: followerCount,
        follower_growth: data.followerGrowth || [],
        top_posts: sanitizedTopPosts,
        posts_data: { total: sanitizedTopPosts.length, topPerforming: sanitizedTopPosts },
        // Hardcoded reputation_data for Instagram
        reputation_data: platform === 'instagram'
          ? { score: 70, followers: followerCount || 1010, sentiment: "Good", avgEngagementRate: 10 }
          : (data.reputationBenchmark || {}),
        linkedin_company_id: platform === 'linkedin' ? (data.organizationInfo?.id || data.companyId || null) : null,
        linkedin_company_urn: platform === 'linkedin' ? (data.organizationInfo?.urn || data.companyUrn || null) : null,
        data_available: data.dataAvailable !== false,
        error_message: data.error || null,
        period: data.period || 'month',
        updated_at: new Date().toISOString(),
        last_fetched_at: new Date().toISOString(),
        expires_at: expiresAt
      };

      // DEBUG: Log cache entry structure for Instagram
      if (platform === 'instagram') {
        console.log(`🔍 Instagram cache entry structure:`);
        console.log(`   engagement_data type: ${typeof engagementData}`);
        console.log(`   engagement_data keys: ${Object.keys(engagementData).join(', ')}`);
        console.log(`   engagement_data: ${JSON.stringify(engagementData).substring(0, 200)}`);
        console.log(`   follower_growth type: ${typeof cacheEntry.follower_growth}, length: ${cacheEntry.follower_growth?.length}`);
        console.log(`   top_posts type: ${typeof sanitizedTopPosts}, length: ${sanitizedTopPosts?.length}`);
        console.log(`   posts_data type: ${typeof cacheEntry.posts_data}`);
        console.log(`   posts_data: ${JSON.stringify(cacheEntry.posts_data).substring(0, 200)}`);
        console.log(`   reputation_data type: ${typeof cacheEntry.reputation_data}`);
        console.log(`   reputation_data: ${JSON.stringify(cacheEntry.reputation_data)}`);

        // Check for invalid Unicode in captions
        const firstPost = sanitizedTopPosts[0];
        if (firstPost?.caption) {
          console.log(`   First post caption (sanitized): ${firstPost.caption.substring(0, 100)}`);
        }
        // Validate each JSONB field
        const jsonbFields = ['engagement_data', 'follower_growth', 'top_posts', 'posts_data', 'reputation_data'];
        for (const field of jsonbFields) {
          try {
            const value = cacheEntry[field];
            if (value === null || value === undefined) {
              console.error(`   ❌ ${field} is null/undefined`);
            } else {
              JSON.stringify(value);
              console.log(`   ✅ ${field} is valid JSON`);
            }
          } catch (e) {
            console.error(`   ❌ ${field} JSON error:`, e.message);
          }
        }
      }

      // LinkedIn uses upsert with its constraint (includes company_id for multiple orgs)
      // Facebook/Instagram use delete + insert pattern since partial index doesn't work with Supabase upsert
      let error = null;

      if (platform === 'linkedin' && cacheEntry.linkedin_company_id) {
        // LinkedIn: Use upsert with the existing constraint
        const conflictColumns = 'user_email,platform,period,linkedin_company_id';
        console.log(`🔑 LinkedIn: Using upsert with conflict columns: ${conflictColumns}`);

        const result = await supabase
          .from('social_media_cache')
          .upsert(cacheEntry, {
            onConflict: conflictColumns,
            ignoreDuplicates: false
          });
        error = result.error;
      } else {
        // Facebook/Instagram: Delete existing entry first, then insert
        // This is needed because partial unique indexes don't work with Supabase JS client's upsert
        console.log(`🔑 ${platform}: Using delete + insert pattern`);

        // Delete existing entry for this user/platform/period
        const { error: deleteError } = await supabase
          .from('social_media_cache')
          .delete()
          .eq('user_email', userEmail)
          .eq('platform', platform)
          .eq('period', cacheEntry.period);

        if (deleteError) {
          console.log(`⚠️ Delete error (non-fatal): ${deleteError.message}`);
        }

        // Insert new entry
        const result = await supabase
          .from('social_media_cache')
          .insert(cacheEntry);
        error = result.error;
      }

      if (error) {
        console.error(`❌ Error saving ${platform} cache:`, error);
        if (platform === 'instagram' || platform === 'linkedin') {
          console.error(`   Full cache entry:`, JSON.stringify(cacheEntry, null, 2));
        }
        throw error;
      }
      console.log(`✅ Cache saved for ${platform}`);

      // Auto-sync account name to business info
      if (cacheEntry.account_name) {
        try {
          const fieldMap = {
            'facebook': 'facebook_handle',
            'instagram': 'instagram_handle',
            'linkedin': 'linkedin_handle'
          };

          const field = fieldMap[platform];
          if (field) {
            console.log(`🔄 Auto-syncing ${platform} handle to business info: ${cacheEntry.account_name}`);

            // Dynamically import to avoid circular dependency
            const userBusinessInfoService = (await import('./userBusinessInfoService.js')).default;

            // Get existing business info
            const { data: existing } = await supabase
              .from('user_business_info')
              .select('*')
              .eq('user_email', userEmail)
              .single();

            if (existing) {
              // Update only if different
              if (existing[field] !== cacheEntry.account_name) {
                await userBusinessInfoService.upsertBusinessInfo(userEmail, {
                  ...existing,
                  [field]: cacheEntry.account_name
                });
                console.log(`✅ ${platform} handle synced to business info`);
              }
            } else {
              // Don't create business info if it doesn't exist (business_domain is required)
              console.log(`ℹ️ Skipping ${platform} handle sync - business info not set up yet`);
            }
          }
        } catch (syncError) {
          console.log(`⚠️ Could not auto-sync ${platform} handle:`, syncError.message);
        }
      }

      return true;
    } catch (error) {
      console.error(`❌ Error caching ${platform} data:`, error);
      return false;
    }
  },

  /**
   * Invalidate cache for a platform
   * @param {string} userEmail - User's email
   * @param {string} platform - Platform to invalidate
   * @returns {Promise<boolean>} Success status
   */
  async invalidateCache(userEmail, platform) {
    try {
      console.log(`🗑️ Invalidating cache for ${platform} - ${userEmail}`);

      const { error } = await supabase
        .from('social_media_cache')
        .update({ expires_at: new Date().toISOString() })
        .eq('user_email', userEmail)
        .eq('platform', platform);

      if (error) throw error;

      console.log(`✅ Cache invalidated for ${platform}`);
      return true;
    } catch (error) {
      console.error(`❌ Error invalidating cache for ${platform}:`, error);
      return false;
    }
  },

  /**
   * Clear all cache for a user
   * @param {string} userEmail - User's email
   * @returns {Promise<boolean>} Success status
   */
  async clearAllCache(userEmail) {
    try {
      console.log(`🗑️ Clearing all cache for ${userEmail}`);

      const { error } = await supabase
        .from('social_media_cache')
        .delete()
        .eq('user_email', userEmail);

      if (error) throw error;

      console.log(`✅ All cache cleared for ${userEmail}`);
      return true;
    } catch (error) {
      console.error(`❌ Error clearing cache:`, error);
      return false;
    }
  },

  /**
   * Log fetch attempt for monitoring (alias for logFetchHistory)
   * @param {string} userEmail - User's email
   * @param {string} platform - Platform
   * @param {string} fetchType - Type of fetch ('metrics', 'posts', etc.)
   * @param {string} status - Status ('success', 'failed', 'cached')
   * @param {number|object} durationOrOptions - Duration in ms or options object
   * @param {number} recordsFetched - Number of records fetched
   * @param {boolean} cacheHit - Whether cache was used
   * @param {string} errorMessage - Error message if failed
   * @returns {Promise<boolean>} Success status
   */
  async logFetch(userEmail, platform, fetchType, status, durationOrOptions = 0, recordsFetched = 0, cacheHit = false, errorMessage = null) {
    // Handle both old and new calling conventions
    if (typeof durationOrOptions === 'object') {
      return this.logFetchHistory(userEmail, platform, fetchType, status, durationOrOptions);
    }
    return this.logFetchHistory(userEmail, platform, fetchType, status, {
      duration: durationOrOptions,
      recordCount: recordsFetched,
      cacheHit: cacheHit,
      error: errorMessage
    });
  },

  /**
   * Log fetch history (main method)
   * @param {string} userEmail - User's email
   * @param {string} platform - Platform
   * @param {string} fetchType - Type of fetch
   * @param {string} status - Status
   * @param {object} options - Options object
   * @returns {Promise<boolean>} Success status
   */
  async logFetchHistory(userEmail, platform, fetchType, status, options = {}) {
    const duration = options.duration || 0;
    const recordsFetched = options.recordCount || 0;
    const cacheHit = options.cacheHit || false;
    const errorMessage = options.error || null;
    try {
      const { error } = await supabase
        .from('social_media_fetch_history')
        .insert({
          user_email: userEmail,
          platform: platform,
          fetch_type: fetchType,
          fetch_status: status,
          duration_ms: duration,
          records_fetched: recordsFetched,
          cache_hit: cacheHit,
          error_message: errorMessage
        });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('❌ Error logging fetch:', error);
      return false;
    }
  },

  /**
   * Get cache statistics for a user
   * @param {string} userEmail - User's email
   * @returns {Promise<object>} Cache statistics
   */
  async getCacheStats(userEmail) {
    try {
      const { data, error } = await supabase
        .from('social_media_cache')
        .select('platform, last_fetched_at, expires_at, data_available')
        .eq('user_email', userEmail);

      if (error) throw error;

      const stats = {
        total: data.length,
        platforms: {},
        valid: 0,
        expired: 0
      };

      const now = new Date();
      data.forEach(cache => {
        const isValid = new Date(cache.expires_at) > now;
        stats.platforms[cache.platform] = {
          cached: true,
          valid: isValid,
          lastFetched: cache.last_fetched_at,
          expiresAt: cache.expires_at,
          dataAvailable: cache.data_available
        };
        if (isValid) stats.valid++;
        else stats.expired++;
      });

      return stats;
    } catch (error) {
      console.error('❌ Error getting cache stats:', error);
      return { total: 0, platforms: {}, valid: 0, expired: 0 };
    }
  },

  /**
   * Clean up expired cache entries (maintenance function)
   * @returns {Promise<number>} Number of entries deleted
   */
  async cleanupExpiredCache() {
    try {
      console.log('🧹 Cleaning up expired cache entries...');

      const { data, error } = await supabase
        .from('social_media_cache')
        .delete()
        .lt('expires_at', new Date().toISOString())
        .select();

      if (error) throw error;

      const count = data?.length || 0;
      console.log(`✅ Cleaned up ${count} expired cache entries`);
      return count;
    } catch (error) {
      console.error('❌ Error cleaning up cache:', error);
      return 0;
    }
  },

  /**
   * Update connection status for a platform
   * @param {string} userEmail - User's email
   * @param {string} platform - Platform
   * @param {boolean} isConnected - Connection status
   * @param {object} metadata - Additional metadata
   * @returns {Promise<boolean>} Success status
   */
  async updateConnectionStatus(userEmail, platform, isConnected, metadata = {}) {
    try {
      const { error } = await supabase
        .from('social_connections_v2')
        .upsert({
          user_email: userEmail,
          platform: platform,
          is_connected: isConnected,
          connection_status: isConnected ? 'connected' : 'disconnected',
          platform_metadata: metadata,
          updated_at: new Date().toISOString(),
          connected_at: isConnected ? new Date().toISOString() : null
        }, {
          onConflict: 'user_email,platform'
        });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('❌ Error updating connection status:', error);
      return false;
    }
  },

  /**
   * Get all connection statuses for a user
   * @param {string} userEmail - User's email
   * @returns {Promise<Array>} Connection statuses
   */
  async getAllConnectionStatuses(userEmail) {
    try {
      const { data, error } = await supabase
        .from('social_connections_v2')
        .select('*')
        .eq('user_email', userEmail);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('❌ Error getting connection statuses:', error);
      return [];
    }
  },

  /**
   * Get cached LinkedIn organizations for a user
   * Returns all unique organizations stored in cache for this user
   * @param {string} userEmail - User's email
   * @returns {Promise<Array>} Array of organization objects {id, name, urn, picture}
   */
  async getCachedOrganizations(userEmail) {
    try {
      console.log(`📦 Fetching cached LinkedIn organizations for ${userEmail}`);

      const { data, error } = await supabase
        .from('social_media_cache')
        .select('linkedin_company_id, linkedin_company_urn, account_name, updated_at')
        .eq('user_email', userEmail)
        .eq('platform', 'linkedin')
        .not('linkedin_company_id', 'is', null)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('❌ Error fetching cached organizations:', error);
        return [];
      }

      if (!data || data.length === 0) {
        console.log('📭 No cached LinkedIn organizations found');
        return [];
      }

      // Deduplicate by linkedin_company_id (keep most recent)
      const uniqueOrgs = new Map();
      for (const row of data) {
        if (row.linkedin_company_id && !uniqueOrgs.has(row.linkedin_company_id)) {
          uniqueOrgs.set(row.linkedin_company_id, {
            id: row.linkedin_company_id,
            name: row.account_name || `Organization ${row.linkedin_company_id}`,
            urn: row.linkedin_company_urn || `urn:li:organization:${row.linkedin_company_id}`,
            picture: null // Logos not stored in cache
          });
        }
      }

      const organizations = Array.from(uniqueOrgs.values());
      console.log(`✅ Found ${organizations.length} cached LinkedIn organization(s)`);

      return organizations;
    } catch (error) {
      console.error('❌ Error getting cached organizations:', error);
      return [];
    }
  },

  /**
   * Cache personal LinkedIn analytics (user-level, not org-level)
   * Used for personal profile metrics like impressions, reactions, profile views
   * @param {string} userEmail - User's email
   * @param {object} personalData - Personal analytics data {profile, personalAnalytics}
   * @returns {Promise<boolean>} Success status
   */
  async cachePersonalAnalytics(userEmail, personalData) {
    try {
      console.log(`💾 Caching personal LinkedIn analytics for ${userEmail}`);

      const expiresAt = new Date(Date.now() + CACHE_DURATION_MINUTES * 60 * 1000).toISOString();

      const cacheEntry = {
        user_email: userEmail,
        platform: 'linkedin', // Use 'linkedin' for constraint compatibility
        account_id: personalData.profile?.id || null,
        account_name: personalData.profile?.name || null,
        username: personalData.profile?.email || null,
        profile_url: personalData.profile?.picture || null,
        engagement_data: {
          impressions: personalData.personalAnalytics?.postStats?.impressions || 0,
          reactions: personalData.personalAnalytics?.postStats?.reactions || 0,
          comments: personalData.personalAnalytics?.postStats?.comments || 0,
          reshares: personalData.personalAnalytics?.postStats?.reshares || 0,
          membersReached: personalData.personalAnalytics?.postStats?.membersReached || 0,
          profileViews: personalData.personalAnalytics?.profileStats?.profileViews || 0,
          searchAppearances: personalData.personalAnalytics?.profileStats?.searchAppearances || 0,
          connections: personalData.personalAnalytics?.connections || 0
        },
        follower_count: personalData.personalAnalytics?.connections || 0,
        follower_growth: [],
        top_posts: [],
        posts_data: {},
        reputation_data: {},
        // Use 'personal' as a marker ID to differentiate from org data
        linkedin_company_id: 'personal',
        linkedin_company_urn: 'urn:li:person:personal',
        data_available: true,
        error_message: null,
        period: 'month', // Use 'month' period like other LinkedIn entries
        updated_at: new Date().toISOString(),
        last_fetched_at: new Date().toISOString(),
        expires_at: expiresAt
      };

      // Use the same conflict resolution as regular LinkedIn cache entries 
      // which includes linkedin_company_id in the constraint
      const { error } = await supabase
        .from('social_media_cache')
        .upsert(cacheEntry, {
          onConflict: 'user_email,platform,period,linkedin_company_id',
          ignoreDuplicates: false
        });

      if (error) {
        console.error('❌ Error caching personal analytics:', error);
        return false;
      }

      console.log('✅ Personal LinkedIn analytics cached');
      return true;
    } catch (error) {
      console.error('❌ Error caching personal analytics:', error);
      return false;
    }
  },

  /**
   * Get cached personal LinkedIn analytics for a user
   * @param {string} userEmail - User's email
   * @param {boolean} ignoreExpiration - If true, return expired data
   * @returns {Promise<object|null>} Cached personal analytics or null
   */
  async getCachedPersonalAnalytics(userEmail, ignoreExpiration = false) {
    try {
      console.log(`📦 Fetching cached personal LinkedIn analytics for ${userEmail}`);

      let query = supabase
        .from('social_media_cache')
        .select('*')
        .eq('user_email', userEmail)
        .eq('platform', 'linkedin')
        .eq('linkedin_company_id', 'personal'); // Personal data marker

      if (!ignoreExpiration) {
        query = query.gt('expires_at', new Date().toISOString());
      }

      const { data, error } = await query
        .order('last_fetched_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.log('📭 No cached personal analytics found');
          return null;
        }
        throw error;
      }

      if (!data) {
        return null;
      }

      const ageMinutes = Math.floor((Date.now() - new Date(data.last_fetched_at).getTime()) / 60000);
      console.log(`✅ Personal analytics cache hit (${ageMinutes} min old)`);

      return {
        profile: {
          id: data.account_id,
          name: data.account_name,
          email: data.username,
          picture: data.profile_url
        },
        personalAnalytics: {
          postStats: {
            impressions: data.engagement_data?.impressions || 0,
            reactions: data.engagement_data?.reactions || 0,
            comments: data.engagement_data?.comments || 0,
            reshares: data.engagement_data?.reshares || 0,
            membersReached: data.engagement_data?.membersReached || 0
          },
          profileStats: {
            profileViews: data.engagement_data?.profileViews || 0,
            searchAppearances: data.engagement_data?.searchAppearances || 0
          },
          connections: data.engagement_data?.connections || 0
        },
        lastUpdated: data.last_fetched_at,
        cacheAge: ageMinutes,
        cached: true
      };
    } catch (error) {
      console.error('❌ Error getting cached personal analytics:', error);
      return null;
    }
  }
};

export default socialMediaCacheService;
