import axios from 'axios';
import https from 'https';
import oauthTokenService from './oauthTokenService.js';
import followerGrowthForecastService from './followerGrowthForecastService.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Create axios instance with SSL handling
const axiosInstance = axios.create({
  timeout: 30000,
  httpsAgent: new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true
  })
});

/**
 * Facebook Metrics Service V2 - Graph API Only
 * Uses official Facebook Graph API for all metrics
 * 
 * Handles both:
 * - User Access Token (needs exchange via /me/accounts)
 * - Page Access Token (stored directly, use as-is)
 */
class FacebookMetricsServiceV2 {
  constructor() {
    this.baseURL = 'https://graph.facebook.com/v24.0';
    this.axios = axiosInstance;
  }

  /**
   * Detect token type and get Page Access Token
   * - If token is User token: exchange via /me/accounts
   * - If token is Page token: use directly
   */
  async getPageAccessToken(accessToken) {
    try {
      // First, try to detect what type of token this is
      const meResponse = await this.axios.get(`${this.baseURL}/me`, {
        params: {
          fields: 'id,name',
          access_token: accessToken
        }
      });

      const meData = meResponse.data;

      // Try to get /me/accounts - only works with User Access Token
      try {
        const accountsResponse = await this.axios.get(`${this.baseURL}/me/accounts`, {
          params: {
            fields: 'name,access_token,id',
            access_token: accessToken
          }
        });

        const pages = accountsResponse.data.data || [];

        if (pages.length > 0) {
          // This is a User Access Token - use the first page
          const page = pages[0];
          return {
            pageId: page.id,
            pageName: page.name,
            pageAccessToken: page.access_token,
            tokenType: 'user_token_exchanged'
          };
        }
      } catch (accountsError) {
        // /me/accounts failed - this is likely a Page Access Token
        // The error "(#100) Tried accessing nonexisting field (accounts) on node type (Page)"
        // indicates this is already a Page token
      }

      // If we get here, the token is already a Page Access Token
      // Use it directly - meData contains Page info
      return {
        pageId: meData.id,
        pageName: meData.name,
        pageAccessToken: accessToken,
        tokenType: 'page_token_direct'
      };

    } catch (error) {
      throw error;
    }
  }

  /**
   * Fetch Total Followers
   * Endpoint: GET /{PAGE_ID}?fields=followers_count
   */
  async getFollowersCount(pageId, pageAccessToken) {
    try {
      const response = await this.axios.get(`${this.baseURL}/${pageId}`, {
        params: {
          fields: 'followers_count,fan_count,username',
          access_token: pageAccessToken
        }
      });

      return {
        followersCount: response.data.followers_count || response.data.fan_count || 0,
        username: response.data.username || null
      };
    } catch (error) {
      return { followersCount: 0, username: null };
    }
  }

  /**
   * Fetch All Posts with Engagement (with pagination)
   * Endpoint: GET /{PAGE_ID}/published_posts?fields=message,created_time,reactions.summary(true),comments.summary(true),shares,permalink_url
   */
  async getPostsWithEngagement(pageId, pageAccessToken, limit = 100) {
    try {
      const allPosts = [];
      let url = `${this.baseURL}/${pageId}/published_posts`;
      let params = {
        fields: 'message,created_time,reactions.summary(true),comments.summary(true),shares,permalink_url,full_picture',
        limit: 25, // Facebook recommends max 25 per request
        access_token: pageAccessToken
      };

      console.log(`[Facebook] Fetching posts for page ${pageId}...`);

      // Paginate to get all posts up to limit
      while (allPosts.length < limit) {
        const response = await this.axios.get(url, { params });
        const posts = response.data.data || [];

        if (posts.length === 0) break;

        allPosts.push(...posts);
        console.log(`[Facebook] Fetched ${posts.length} posts, total: ${allPosts.length}`);

        // Check for next page
        if (response.data.paging?.next && allPosts.length < limit) {
          url = response.data.paging.next;
          params = {}; // Next URL includes all params
        } else {
          break;
        }
      }

      console.log(`[Facebook] Total posts fetched: ${allPosts.length}`);

      // Log engagement stats for first few posts
      allPosts.slice(0, 3).forEach((post, i) => {
        console.log(`[Facebook] Post ${i + 1}: reactions=${post.reactions?.summary?.total_count || 0}, comments=${post.comments?.summary?.total_count || 0}, shares=${post.shares?.count || 0}`);
      });

      const mappedPosts = allPosts.map(post => ({
        postId: post.id,
        message: post.message || '[No message]',
        createdTime: post.created_time,
        date: new Date(post.created_time).toISOString().split('T')[0],
        url: post.permalink_url || '',
        mediaUrl: post.full_picture || '',
        likes: post.reactions?.summary?.total_count || 0,
        comments: post.comments?.summary?.total_count || 0,
        shares: post.shares?.count || 0,
        totalEngagement: (post.reactions?.summary?.total_count || 0) +
          (post.comments?.summary?.total_count || 0) +
          (post.shares?.count || 0)
      }));

      // Log totals
      const totalLikes = mappedPosts.reduce((sum, p) => sum + p.likes, 0);
      const totalComments = mappedPosts.reduce((sum, p) => sum + p.comments, 0);
      const totalShares = mappedPosts.reduce((sum, p) => sum + p.shares, 0);
      console.log(`[Facebook] Engagement totals: reactions=${totalLikes}, comments=${totalComments}, shares=${totalShares}`);

      return mappedPosts;
    } catch (error) {
      console.error('[Facebook] Error fetching posts:', error.response?.data?.error?.message || error.message);
      return [];
    }
  }

  /**
   * Fetch Impressions and Follower Growth
   * Endpoint: GET /{PAGE_ID}/insights?metric=page_posts_impressions,page_daily_follows_unique&period=day
   * Note: Insights have a 2-day delay
   */
  async getInsights(pageId, pageAccessToken, days = 30) {
    try {
      // Account for 2-day delay in insights
      const untilDate = new Date();
      untilDate.setDate(untilDate.getDate() - 2);
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - days - 2);

      const since = sinceDate.toISOString().split('T')[0];
      const until = untilDate.toISOString().split('T')[0];

      const result = {
        impressions: [],
        followerGrowth: [],
        demographics: {
          ageGender: {},
          cities: {},
          countries: {}
        }
      };

      // 1. Daily metrics (impressions, follower growth) - these work with period=day
      console.log(`[Facebook] Fetching insights for page ${pageId}, since=${since}, until=${until}`);
      try {
        const dailyResponse = await this.axios.get(`${this.baseURL}/${pageId}/insights`, {
          params: {
            metric: 'page_posts_impressions,page_daily_follows_unique',
            period: 'day',
            since: since,
            until: until,
            access_token: pageAccessToken
          }
        });

        const dailyData = dailyResponse.data.data || [];
        console.log(`[Facebook] Insights API returned ${dailyData.length} metrics`);

        for (const metric of dailyData) {
          console.log(`[Facebook] Metric: ${metric.name}, values count: ${metric.values?.length || 0}`);
          if (metric.name === 'page_posts_impressions') {
            result.impressions = metric.values || [];
          } else if (metric.name === 'page_daily_follows_unique') {
            result.followerGrowth = metric.values || [];
            // Log first and last few values
            if (result.followerGrowth.length > 0) {
              console.log(`[Facebook] Follower growth data: ${result.followerGrowth.length} days`);
              console.log(`[Facebook]   First: ${result.followerGrowth[0]?.end_time} = ${result.followerGrowth[0]?.value}`);
              console.log(`[Facebook]   Last: ${result.followerGrowth[result.followerGrowth.length - 1]?.end_time} = ${result.followerGrowth[result.followerGrowth.length - 1]?.value}`);
            }
          }
        }
      } catch (dailyError) {
        console.error('[Facebook] Error fetching daily insights:', dailyError.response?.data?.error?.message || dailyError.message);
      }

      // 2. Lifetime demographics (gender/age, city, country) - require period=lifetime
      try {
        const lifetimeResponse = await this.axios.get(`${this.baseURL}/${pageId}/insights`, {
          params: {
            metric: 'page_fans_gender_age,page_fans_city,page_fans_country',
            period: 'lifetime',
            access_token: pageAccessToken
          }
        });

        const lifetimeData = lifetimeResponse.data.data || [];
        for (const metric of lifetimeData) {
          if (metric.name === 'page_fans_gender_age') {
            result.demographics.ageGender = metric.values[0]?.value || {};
          } else if (metric.name === 'page_fans_city') {
            result.demographics.cities = metric.values[0]?.value || {};
          } else if (metric.name === 'page_fans_country') {
            result.demographics.countries = metric.values[0]?.value || {};
          }
        }
      } catch (lifetimeError) {
        console.error('Error fetching lifetime Facebook demographics:', lifetimeError.message);
      }

      return result;
    } catch (error) {
      console.error('Error getting Facebook insights:', error.message);
      return { impressions: [], followerGrowth: [], demographics: { ageGender: {}, cities: {}, countries: {} } };
    }
  }

  /**
   * Calculate Audience Snapshot (Top Age, Gender, Location)
   */
  calculateAudienceSnapshot(demographics) {
    try {
      if (!demographics || !demographics.ageGender) return null;

      // 1. Find Top Age & Gender
      // Format: "F.25-34": 123
      let topSegment = { key: '', value: 0 };
      Object.entries(demographics.ageGender).forEach(([key, value]) => {
        if (value > topSegment.value) topSegment = { key, value };
      });

      // Parse "F.25-34" -> Gender: Female, Age: 25-34
      const [genderCode, ageGroup] = topSegment.key.split('.');
      const topGender = genderCode === 'F' ? 'Women' : genderCode === 'M' ? 'Men' : 'People';

      // 2. Find Top City
      let topCity = { key: '', value: 0 };
      Object.entries(demographics.cities || {}).forEach(([key, value]) => {
        if (value > topCity.value) topCity = { key, value };
      });
      // Format "New York, New York" -> "New York"
      const cityName = topCity.key ? topCity.key.split(',')[0] : 'Unknown City';

      // 3. Find Top Country
      let topCountry = { key: '', value: 0 };
      Object.entries(demographics.countries || {}).forEach(([key, value]) => {
        if (value > topCountry.value) topCountry = { key, value };
      });

      return {
        topAgeGroup: ageGroup || 'N/A',
        topGender: topGender,
        topCity: cityName,
        topCountry: topCountry.key || 'Unknown'
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Calculate Best Time to Post based on historical engagement
   */
  calculateContentMaximizer(posts) {
    if (!posts || posts.length === 0) return null;

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayEngagement = {};
    const hourEngagement = {};

    posts.forEach(post => {
      const date = new Date(post.createdTime);
      const day = days[date.getDay()];
      const hour = date.getHours();
      const hourLabel = hour === 0 ? '12 AM' : hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`;

      if (!dayEngagement[day]) dayEngagement[day] = { total: 0, count: 0 };
      dayEngagement[day].total += post.totalEngagement;
      dayEngagement[day].count += 1;

      if (!hourEngagement[hourLabel]) hourEngagement[hourLabel] = { total: 0, count: 0 };
      hourEngagement[hourLabel].total += post.totalEngagement;
      hourEngagement[hourLabel].count += 1;
    });

    // Find Best Day
    let bestDay = '';
    let maxDayAvg = 0;
    Object.entries(dayEngagement).forEach(([day, data]) => {
      const avg = data.total / data.count;
      if (avg > maxDayAvg) {
        maxDayAvg = avg;
        bestDay = day;
      }
    });

    // Find Best Hour
    let bestHour = '';
    let maxHourAvg = 0;
    Object.entries(hourEngagement).forEach(([hour, data]) => {
      const avg = data.total / data.count;
      if (avg > maxHourAvg) {
        maxHourAvg = avg;
        bestHour = hour;
      }
    });

    return {
      bestDay: bestDay || 'Wednesday', // Default fallback
      bestHour: bestHour || '6 PM'
    };
  }

  /**
   * Build follower growth time series from daily gains
   * Ensures a continuous 30-day timeline by filling missing dates with 0
   */
  buildFollowerTimeSeries(dailyGains, currentFollowers) {
    const days = 30;
    const timeSeries = [];

    // Create map of API data for quick lookup
    const gainsMap = new Map();
    if (dailyGains && Array.isArray(dailyGains)) {
      dailyGains.forEach(day => {
        const dateStr = day.end_time.split('T')[0];
        gainsMap.set(dateStr, day.value || 0);
      });
    }

    // Calculate total known gain from API data
    const totalKnownGain = Array.from(gainsMap.values()).reduce((a, b) => a + b, 0);

    // Determine starting count
    // If we have data, we back-calculate. If perfectly flat (no data), start = current.
    let cumulativeFollowers = Math.max(0, currentFollowers - totalKnownGain);

    // Build chronologically: Start Date = Today - 29 days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1));

    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];

      // Use API data if exists, else 0
      const gain = gainsMap.get(dateStr) || 0;

      cumulativeFollowers += gain;

      timeSeries.push({
        date: dateStr,
        followers: Math.round(cumulativeFollowers),
        gained: gain,
        lost: 0,
        net: gain
      });
    }

    // Adjustment: Ensure the FINAL value matches currentFollowers exactly
    if (timeSeries.length > 0) {
      const lastPoint = timeSeries[timeSeries.length - 1];
      const diff = currentFollowers - lastPoint.followers;

      if (diff !== 0) {
        lastPoint.followers = currentFollowers;
        // Adjust net for the last day to account for the snap
        lastPoint.gained += diff;
        lastPoint.net += diff;
      }
    }

    return timeSeries;
  }

  /**
   * Get top performing posts sorted by weighted engagement
   * Prioritizes engagement over recency - posts with most engagement always shown first
   */
  getTopPosts(posts, limit = 7) {
    return posts
      .map(post => ({
        ...post,
        format: 'Facebook Post',
        weightedEngagement: (post.comments * 3) + (post.likes * 1) + (post.shares * 2)
      }))
      .sort((a, b) => {
        // Primary sort: by weighted engagement (descending)
        if (b.weightedEngagement !== a.weightedEngagement) {
          return b.weightedEngagement - a.weightedEngagement;
        }
        // Secondary sort: by total engagement
        if (b.totalEngagement !== a.totalEngagement) {
          return b.totalEngagement - a.totalEngagement;
        }
        // Tertiary sort: by recency (newest first for equal engagement)
        return new Date(b.createdTime) - new Date(a.createdTime);
      })
      .slice(0, limit);
  }

  /**
   * Get comprehensive Facebook metrics using Graph API
   */
  async getComprehensiveMetrics(userEmail) {
    try {
      // Get token from OAuth storage
      const tokens = await oauthTokenService.getTokens(userEmail, 'facebook');

      if (!tokens || !tokens.access_token) {
        return {
          dataAvailable: false,
          reason: 'Please connect your Facebook account first'
        };
      }

      // Detect token type and get Page Access Token
      const pageData = await this.getPageAccessToken(tokens.access_token);
      const { pageId, pageName, pageAccessToken } = pageData;

      // Get current followers count
      const { followersCount, username } = await this.getFollowersCount(pageId, pageAccessToken);

      // Get all posts with engagement
      const allPosts = await this.getPostsWithEngagement(pageId, pageAccessToken, 100);

      // Calculate metrics FIRST (needed for forecast below)
      const totalLikes = allPosts.reduce((sum, post) => sum + post.likes, 0);
      const totalComments = allPosts.reduce((sum, post) => sum + post.comments, 0);
      const totalShares = allPosts.reduce((sum, post) => sum + post.shares, 0);
      const totalEngagement = totalLikes + totalComments + totalShares;
      const postsCount = allPosts.length;

      // Get insights (impressions + follower growth)
      const insights = await this.getInsights(pageId, pageAccessToken, 30);

      // Build follower time series
      let followerGrowth = this.buildFollowerTimeSeries(insights.followerGrowth, followersCount);
      console.log(`[Facebook] Follower growth time series: ${followerGrowth.length} data points`);

      // No fallback - just log if no data
      if (followerGrowth.length === 0) {
        console.log('[Facebook] No follower growth data available from insights API');
      }

      // Unified Formula: ((Total Engagement / Post Count) / Total Followers) * 100
      const avgEngagementPerPost = postsCount > 0 ? totalEngagement / postsCount : 0;
      const engagementRate = followersCount > 0
        ? parseFloat(((avgEngagementPerPost / followersCount) * 100).toFixed(2))
        : 0;

      // Average per post
      const avgLikes = postsCount > 0 ? totalLikes / postsCount : 0;
      const avgComments = postsCount > 0 ? totalComments / postsCount : 0;
      const avgShares = postsCount > 0 ? totalShares / postsCount : 0;


      // Get top posts (sorted by engagement, not recency)
      const topPosts = this.getTopPosts(allPosts, 7);

      // Calculate total impressions
      const totalImpressions = insights.impressions.reduce((sum, day) => sum + (day.value || 0), 0);

      const result = {
        dataAvailable: true,
        source: 'graph-api',
        pageName: pageName,
        pageId: pageId,
        pageUsername: username,
        currentFollowers: followersCount,
        followerGrowth: followerGrowth,
        followerGrowthDeprecated: followerGrowth.length === 0,
        followerGrowthForecasted: followerGrowth.length > 0 && followerGrowth[0].forecasted !== undefined,
        followerGrowthNote: followerGrowth.length === 0
          ? 'Facebook insights have a 2-day delay. We can only show current follower count.'
          : followerGrowth.length > 0 && followerGrowth[0].forecasted !== undefined
            ? 'Follower growth is forecasted based on current engagement metrics.'
            : null,
        topPosts: topPosts.map(post => ({
          format: post.format || 'Post',
          message: post.message.length > 100 ? post.message.substring(0, 100) + '...' : post.message,
          url: post.url,
          mediaUrl: post.mediaUrl || '',
          date: post.date,
          createdDate: post.date,
          created_time: post.createdTime,
          likes: post.likes,
          comments: post.comments,
          shares: post.shares,
          reach: 0,
          impressions: 0,
          engagementRate: post.totalEngagement && post.followers ? ((post.totalEngagement / post.followers) * 100).toFixed(2) : 0,
          engagementScore: 0
        })),
        metrics: {
          avgLikes: parseFloat(avgLikes.toFixed(2)),
          avgComments: parseFloat(avgComments.toFixed(2)),
          avgShares: parseFloat(avgShares.toFixed(2)),
          avgInteractions: parseFloat((avgLikes + avgComments + avgShares).toFixed(2)),
          avgEngagementPerPost: avgEngagementPerPost,
          engagementRate: engagementRate,
          engagementRateNote: null,
          postsInPeriod: postsCount
        },
        engagementScore: {
          likes: totalLikes,
          comments: totalComments,
          shares: totalShares,
          avgLikes: parseFloat(avgLikes.toFixed(2)),
          avgComments: parseFloat(avgComments.toFixed(2)),
          avgShares: parseFloat(avgShares.toFixed(2)),
          avgInteractions: parseFloat((avgLikes + avgComments + avgShares).toFixed(2)),
          avgEngagementPerPost: avgEngagementPerPost,
          engagementRate: engagementRate,
          engagementRateNote: null,
          reach: 0,
          totalReactions: totalEngagement,
          clicks: 0,
          impressions: totalImpressions,
          postsInPeriod: postsCount,
          score: Math.min(100, Math.round(engagementRate * 10)),
          rateSource: 'graph-api'
        },
        cumulativeTotals: {
          likes: totalLikes,
          comments: totalComments,
          shares: totalShares,
          reach: 0
        },
        reputationBenchmark: {
          score: Math.min(100, Math.round(
            (engagementRate * 10) +
            (followersCount / 100) +
            (topPosts.length * 2) +
            20
          )),
          followers: followersCount,
          avgEngagementRate: engagementRate,
          sentiment: engagementRate > 5 ? 'Good' : 'Fair'
        },
        lastUpdated: new Date().toISOString(),
        audienceInsight: this.calculateAudienceSnapshot(insights.demographics),
        contentInsight: this.calculateContentMaximizer(allPosts)
      };

      return result;

    } catch (error) {
      return {
        dataAvailable: false,
        reason: error.message,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Get user's Facebook pages (for page selection UI)
   */
  async getUserPages(userAccessToken) {
    try {
      const response = await this.axios.get(`${this.baseURL}/me/accounts`, {
        params: {
          fields: 'id,name,access_token',
          access_token: userAccessToken
        }
      });

      return response.data.data || [];
    } catch (error) {
      return [];
    }
  }
}

export default new FacebookMetricsServiceV2();
