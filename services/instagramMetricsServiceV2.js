import axios from 'axios';
import https from 'https';
import oauthTokenService from './oauthTokenService.js';
import dotenv from 'dotenv';

dotenv.config();

// Create axios instance with SSL handling
const axiosInstance = axios.create({
  timeout: 30000,
  httpsAgent: new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true
  })
});

/**
 * Instagram Metrics Service V2 - Graph API Only
 * Uses official Facebook Graph API for all Instagram metrics
 * 
 * Handles both:
 * - User Access Token (needs Page token via /me/accounts)
 * - Page Access Token (use directly to get IG Business Account)
 */
class InstagramMetricsServiceV2 {
  constructor() {
    this.apiVersion = 'v24.0';
    this.baseURL = `https://graph.facebook.com/${this.apiVersion}`;
    this.axios = axiosInstance;
  }

  /**
   * Get Instagram Business Account - handles both User and Page tokens
   */
  async getInstagramAccount(accessToken) {
    try {
      // First try: Direct call assuming it's a Page token
      // GET /me?fields=id,name,instagram_business_account{...}
      try {
        const pageResponse = await this.axios.get(`${this.baseURL}/me`, {
          params: {
            access_token: accessToken,
            fields: 'id,name,instagram_business_account{id,username,followers_count,media_count}'
          }
        });

        const page = pageResponse.data;
        const igAccount = page.instagram_business_account;

        if (igAccount) {
          // Success - this was a Page token with linked IG
          return {
            id: igAccount.id,
            username: igAccount.username,
            name: page.name,
            followers: igAccount.followers_count,
            mediaCount: igAccount.media_count,
            pageToken: accessToken,
            tokenType: 'page_token_direct'
          };
        }
      } catch (directError) {
        // If error contains "nonexisting field (instagram_business_account) on node type (User)"
        // then this is a User token - need to get Page token first
        const isUserTokenError = directError.response?.data?.error?.message?.includes('node type (User)');

        if (!isUserTokenError) {
          // Some other error - rethrow
          throw directError;
        }
      }

      // Second try: This might be a User token - get pages first
      try {
        const accountsResponse = await this.axios.get(`${this.baseURL}/me/accounts`, {
          params: {
            fields: 'id,name,access_token,instagram_business_account{id,username,followers_count,media_count}',
            access_token: accessToken
          }
        });

        const pages = accountsResponse.data.data || [];

        // Find a page with Instagram Business Account linked
        for (const page of pages) {
          if (page.instagram_business_account) {
            return {
              id: page.instagram_business_account.id,
              username: page.instagram_business_account.username,
              name: page.name,
              followers: page.instagram_business_account.followers_count,
              mediaCount: page.instagram_business_account.media_count,
              pageToken: page.access_token,
              tokenType: 'user_token_exchanged'
            };
          }
        }

        // No page with IG linked
        throw new Error('No Instagram Business Account linked to any of your Facebook Pages.');
      } catch (accountsError) {
        // If this also fails with "node type (Page)" error, the token is a Page token
        // but without IG linked
        if (accountsError.response?.data?.error?.message?.includes('node type (Page)')) {
          throw new Error('No Instagram Business Account linked to this Facebook Page.');
        }
        throw accountsError;
      }

    } catch (error) {
      const errorMsg = error.response?.data?.error?.message || error.message;
      throw new Error(`Failed to get Instagram account: ${errorMsg}`);
    }
  }

  /**
   * Get comprehensive Instagram metrics using Graph API
   */
  async getComprehensiveMetrics(userEmail) {
    try {
      // Step 1: Get OAuth token
      const tokens = await oauthTokenService.getTokens(userEmail, 'instagram');

      if (!tokens || !tokens.access_token) {
        throw new Error('No Instagram OAuth token found. Please connect your Instagram account.');
      }

      // Step 2: Get Instagram Business Account (handles both token types)
      const account = await this.getInstagramAccount(tokens.access_token);

      // Step 3: Get 30-day follower growth
      const followerGrowth = await this.getFollowerGrowthTimeSeries(account.id, account.pageToken, account.followers, 30);

      // Step 4: Get account-level insights
      const accountInsights = await this.getAccountInsights(account.id, account.pageToken, 30);

      // Step 5: Get recent media and insights
      const media = await this.getRecentMedia(account.id, account.pageToken, 30);
      const mediaWithInsights = await this.getMediaInsights(media, account.pageToken);
      const processedPosts = this.processMedia(mediaWithInsights, account.followers);

      // Sort by weighted engagement to get top posts
      const topPosts = [...processedPosts]
        .sort((a, b) => {
          const weightedA = (a.comments * 3) + (a.likes * 1) + (a.saved * 2);
          const weightedB = (b.comments * 3) + (b.likes * 1) + (b.saved * 2);
          if (weightedB !== weightedA) return weightedB - weightedA;
          return b.totalInteractions - a.totalInteractions;
        })
        .slice(0, 10);

      // Step 6: Calculate totals and metrics
      const totals = topPosts.reduce((acc, post) => {
        acc.likes += post.likes;
        acc.comments += post.comments;
        acc.shares += post.shares || 0;
        acc.saved += post.saved || 0;
        // Explicitly sum all interactions for consistency
        acc.totalInteractions += (post.likes + post.comments + (post.shares || 0) + (post.saved || 0));
        return acc;
      }, { likes: 0, comments: 0, shares: 0, saved: 0, totalInteractions: 0 });

      // Calculate Activity metrics
      console.log('[Instagram] Account Insights daily metrics:', accountInsights?.daily?.map(m => m.name));
      const totalWebsiteClicks = accountInsights?.daily?.find(m => m.name === 'website_clicks')?.values?.reduce((s, v) => s + (v.value || 0), 0) || 0;
      const totalProfileViews = accountInsights?.daily?.find(m => m.name === 'profile_views')?.values?.reduce((s, v) => s + (v.value || 0), 0) || 0;
      const totalEmailContacts = accountInsights?.daily?.find(m => m.name === 'email_contacts')?.values?.reduce((s, v) => s + (v.value || 0), 0) || 0;
      console.log('[Instagram] Activity: clicks=' + totalWebsiteClicks + ', views=' + totalProfileViews);

      // Reach is now inside daily
      const reachMetric = accountInsights?.daily?.find(m => m.name === 'reach');
      const totalReach = reachMetric?.values?.reduce((sum, v) => sum + (v.value || 0), 0) || 0;

      // Calculate engagement metrics
      // Calculate engagement metrics
      const avgEngagement = topPosts.length > 0
        ? parseFloat((totals.totalInteractions / topPosts.length).toFixed(2))
        : 0;

      // Unified Formula: ((Total Engagement / Post Count) / Total Followers) * 100
      const avgEngagementPerPost = topPosts.length > 0 ? totals.totalInteractions / topPosts.length : 0;
      const engagementRate = account.followers > 0
        ? parseFloat(((avgEngagementPerPost / account.followers) * 100).toFixed(2))
        : 0;

      // Calculate engagement score (0-100%)
      const engagementScore = topPosts.length > 0
        ? Math.min(Math.round((avgEngagement / 10) * 100), 100)
        : 0;

      // Calculate follower growth
      const followerGrowthData = followerGrowth.length > 1 ? {
        startFollowers: followerGrowth[0].followers,
        endFollowers: followerGrowth[followerGrowth.length - 1].followers,
        growth: followerGrowth[followerGrowth.length - 1].followers - followerGrowth[0].followers
      } : {
        startFollowers: account.followers,
        endFollowers: account.followers,
        growth: 0
      };

      // Step 7: Compile final result
      const result = {
        dataAvailable: true,
        source: 'graph-api',
        account: {
          username: account.username,
          followers: account.followers,
          mediaCount: account.mediaCount
        },
        period: '30 days',
        engagementScore: {
          likes: topPosts.length > 0 ? Math.round(totals.likes / topPosts.length) : 0,
          comments: topPosts.length > 0 ? Math.round(totals.comments / topPosts.length) : 0,
          shares: 0,
          saved: topPosts.length > 0 ? Math.round(totals.saved / topPosts.length) : 0,
          saves: topPosts.length > 0 ? Math.round(totals.saved / topPosts.length) : 0,
          totalEngagement: avgEngagement,
          engagementRate: parseFloat(engagementRate),
          reach: totalReach || 0,
          impressions: 0,
          clicks: 0,
          postsInPeriod: topPosts.length,
          score: engagementScore,
          rateSource: 'graph-api'
        },
        cumulativeTotals: {
          likes: totals.likes,
          comments: totals.comments,
          shares: totals.shares || 0,
          saved: totals.saved,
          totalEngagement: totals.totalInteractions
        },
        averages: {
          likesPerPost: topPosts.length > 0 ? (totals.likes / topPosts.length).toFixed(1) : '0.0',
          commentsPerPost: topPosts.length > 0 ? (totals.comments / topPosts.length).toFixed(1) : '0.0',
          engagementPerPost: avgEngagement,
          engagementRate: parseFloat(engagementRate)
        },
        followerGrowth: followerGrowth,
        followerGrowthSummary: {
          growth: followerGrowthData.growth,
          startFollowers: followerGrowthData.startFollowers,
          endFollowers: followerGrowthData.endFollowers
        },
        topPerformingPosts: topPosts.map(post => ({
          id: post.id,
          caption: post.caption,
          url: post.url,
          mediaUrl: post.mediaUrl,
          thumbnailUrl: post.thumbnailUrl,
          date: post.date,
          type: post.mediaProductType || post.mediaType,
          format: this.getPostFormat(post.mediaType, post.mediaProductType),
          likes: post.likes,
          comments: post.comments,
          shares: post.shares || 0,
          saves: post.saved || 0,
          saved: post.saved || 0,
          totalEngagement: post.totalInteractions,
          engagementRate: post.engagementRate
        })),
        topPosts: topPosts.map(post => ({
          id: post.id,
          caption: post.caption,
          message: post.caption,
          url: post.url,
          mediaUrl: post.mediaUrl,
          thumbnailUrl: post.thumbnailUrl,
          date: post.date,
          format: this.getPostFormat(post.mediaType, post.mediaProductType),
          likes: post.likes,
          comments: post.comments,
          shares: post.shares || 0,
          saves: post.saved || 0,
          reach: post.reach || 0,
          engagementRate: post.engagementRate
        })),
        // Add structure expected by CompetitorResults.tsx
        profile: {
          followers: account.followers,
          avgInteractions: avgEngagement,
          avgEngagementRate: parseFloat(engagementRate)
        },
        engagement: {
          summary: {
            avgLikesPerPost: topPosts.length > 0 ? parseFloat((totals.likes / topPosts.length).toFixed(1)) : 0,
            avgCommentsPerPost: topPosts.length > 0 ? parseFloat((totals.comments / topPosts.length).toFixed(1)) : 0,
            engagementRate: parseFloat(engagementRate)
          }
        },
        username: account.username,
        currentFollowers: account.followers,
        mediaCount: account.mediaCount,
        totalReach: totalReach,
        profileViews: totalProfileViews,
        reputationBenchmark: {
          followers: account.followers,
          profileViews: totalProfileViews
        },
        lastUpdated: new Date().toISOString(),
        audienceInsight: this.calculateAudienceSnapshot(accountInsights.demographics),
        contentInsight: this.calculateContentMaximizer(processedPosts),
        activityMetrics: {
          websiteClicks: totalWebsiteClicks,
          profileVisits: totalProfileViews,
          emailContacts: totalEmailContacts
        }
      };

      return result;

    } catch (error) {
      return {
        dataAvailable: false,
        reason: error.message,
        error: error.message
      };
    }
  }

  /**
   * Dev Mode: Get comprehensive Instagram metrics with custom token
   */
  async getComprehensiveMetricsWithToken(accessToken) {
    try {
      // Step 1: Get Instagram Business Account
      const account = await this.getInstagramAccount(accessToken);

      // Step 2: Get recent media
      const media = await this.getRecentMedia(account.id, account.pageToken, 30);

      // Step 3: Get insights for each post
      const mediaWithInsights = await this.getMediaInsights(media, account.pageToken);

      // Step 4: Get 30-day follower growth
      const followerGrowth = await this.getFollowerGrowthTimeSeries(account.id, account.pageToken, account.followers, 30);

      // Step 5: Process posts
      const processedPosts = this.processMedia(mediaWithInsights, account.followers);

      const topPosts = [...processedPosts]
        .sort((a, b) => {
          const weightedA = (a.comments * 3) + (a.likes * 1) + (a.saved * 2);
          const weightedB = (b.comments * 3) + (b.likes * 1) + (b.saved * 2);
          if (weightedB !== weightedA) return weightedB - weightedA;
          return b.totalInteractions - a.totalInteractions;
        })
        .slice(0, 10);

      // Calculate metrics
      const totals = processedPosts.reduce((acc, post) => {
        acc.likes += post.likes;
        acc.comments += post.comments;
        acc.shares += post.shares || 0;
        acc.saved += post.saved;
        acc.totalInteractions += post.totalInteractions;
        return acc;
      }, { likes: 0, comments: 0, shares: 0, saved: 0, totalInteractions: 0 });

      const avgEngagement = processedPosts.length > 0
        ? Math.round(totals.totalInteractions / processedPosts.length)
        : 0;

      const engagementRate = account.followers > 0 && processedPosts.length > 0
        ? ((totals.totalInteractions / (processedPosts.length * account.followers)) * 100).toFixed(2)
        : '0.00';

      const engagementScore = processedPosts.length > 0
        ? Math.min(Math.round((avgEngagement / 10) * 100), 100)
        : 0;

      const followerGrowthData = followerGrowth.length > 1 ? {
        growth: followerGrowth[followerGrowth.length - 1].followers - followerGrowth[0].followers,
        startFollowers: followerGrowth[0].followers,
        endFollowers: followerGrowth[followerGrowth.length - 1].followers
      } : {
        startFollowers: account.followers,
        endFollowers: account.followers,
        growth: 0
      };

      const result = {
        dataAvailable: true,
        account: {
          username: account.username,
          followers: account.followers,
          mediaCount: account.mediaCount
        },
        period: '30 days',
        engagementScore: engagementScore,
        cumulativeTotals: {
          likes: totals.likes,
          comments: totals.comments,
          shares: totals.shares || 0,
          saved: totals.saved,
          totalEngagement: totals.totalInteractions
        },
        averages: {
          likesPerPost: processedPosts.length > 0 ? (totals.likes / processedPosts.length).toFixed(1) : '0.0',
          commentsPerPost: processedPosts.length > 0 ? (totals.comments / processedPosts.length).toFixed(1) : '0.0',
          engagementPerPost: avgEngagement,
          engagementRate: parseFloat(engagementRate)
        },
        followerGrowth: followerGrowth,
        followerGrowthSummary: {
          growth: followerGrowthData.growth,
          startFollowers: followerGrowthData.startFollowers,
          endFollowers: followerGrowthData.endFollowers
        },
        topPerformingPosts: topPosts.map(post => ({
          id: post.id,
          caption: post.caption,
          url: post.url,
          date: post.date,
          type: post.mediaProductType || post.mediaType,
          likes: post.likes,
          comments: post.comments,
          shares: post.shares || 0,
          saved: post.saved,
          totalEngagement: post.totalInteractions
        })),
        username: account.username,
        currentFollowers: account.followers,
        mediaCount: account.mediaCount,
        lastUpdated: new Date().toISOString()
      };

      return result;

    } catch (error) {
      return {
        dataAvailable: false,
        reason: error.message,
        error: error.message
      };
    }
  }

  /**
   * Get recent media posts
   */
  async getRecentMedia(igAccountId, token, limit = 30) {
    try {
      const response = await this.axios.get(`${this.baseURL}/${igAccountId}/media`, {
        params: {
          access_token: token,
          fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,media_product_type',
          limit: limit
        }
      });

      return response.data.data || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Get insights for posts
   */
  async getMediaInsights(media, token) {
    const mediaWithInsights = [];

    for (const post of media) {
      try {
        const response = await this.axios.get(`${this.baseURL}/${post.id}/insights`, {
          params: {
            access_token: token,
            metric: 'likes,comments,shares,saved,total_interactions,reach,impressions'
          }
        });

        const insights = {};
        response.data.data.forEach(insight => {
          if (insight.values && insight.values[0]) {
            insights[insight.name] = insight.values[0].value || 0;
          }
        });

        mediaWithInsights.push({
          ...post,
          insights: insights,
          hasInsights: true
        });
      } catch (err) {
        // Fallback to basic counts if insights not available
        mediaWithInsights.push({
          ...post,
          insights: {
            likes: post.like_count || 0,
            comments: post.comments_count || 0,
            shares: 0,
            saved: 0,
            total_interactions: (post.like_count || 0) + (post.comments_count || 0)
          },
          hasInsights: false
        });
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return mediaWithInsights;
  }

  /**
   * Get follower growth time series (last 30 days)
   */
  async getFollowerGrowthTimeSeries(igAccountId, token, currentFollowers, days = 30) {
    try {
      const until = Math.floor(Date.now() / 1000);
      const since = until - (days * 24 * 60 * 60);

      console.log(`[Instagram] Fetching follower growth for account ${igAccountId}, since=${new Date(since * 1000).toISOString()}, until=${new Date(until * 1000).toISOString()}`);

      const response = await this.axios.get(`${this.baseURL}/${igAccountId}/insights`, {
        params: {
          access_token: token,
          metric: 'follower_count',
          since: since,
          until: until,
          period: 'day'
        }
      });

      const data = response.data.data || [];
      console.log(`[Instagram] Follower insights API returned ${data.length} metrics`);

      const followerMetric = data.find(m => m.name === 'follower_count');
      const apiValues = (followerMetric && followerMetric.values) ? followerMetric.values : [];

      console.log(`[Instagram] Processing ${apiValues.length} data points for follower growth`);

      // Use the shared logic builder
      const followerTimeSeries = this.buildFollowerTimeSeries(apiValues, currentFollowers);

      console.log(`[Instagram] Built follower time series with ${followerTimeSeries.length} data points`);
      return followerTimeSeries;

    } catch (error) {
      console.error('[Instagram] Error fetching follower growth:', error.response?.data?.error?.message || error.message);
      return []; // Return empty - no fallback
    }
  }

  /**
   * Build follower growth time series from daily gains
   * Ensures a continuous 30-day timeline by filling missing dates with 0
   * Replicates logic from FacebookMetricsServiceV2
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
   * Generate estimated time series when API data not available
   */
  generateEstimatedTimeSeries(currentFollowers, days) {
    const followerTimeSeries = [];
    const estimatedStartFollowers = Math.max(1, currentFollowers - 20);
    const totalGrowth = currentFollowers - estimatedStartFollowers;

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (days - i));

      const progress = i / (days - 1);
      const estimatedFollowers = Math.round(estimatedStartFollowers + (totalGrowth * progress));

      followerTimeSeries.push({
        date: date.toISOString().split('T')[0],
        followers: estimatedFollowers,
        gained: i > 0 ? estimatedFollowers - followerTimeSeries[i - 1].followers : 0,
        lost: 0,
        net: i > 0 ? estimatedFollowers - followerTimeSeries[i - 1].followers : 0
      });
    }

    return followerTimeSeries;
  }

  /**
   * Get account insights (reach, profile views)
   */
  async getAccountInsights(igAccountId, token, days = 30) {
    try {
      const until = Math.floor(Date.now() / 1000);
      const since = until - (Math.min(days, 30) * 24 * 60 * 60);

      // 1. Daily Metrics (Reach, Profile Views, Website Clicks)
      const dailyResponse = await this.axios.get(`${this.baseURL}/${igAccountId}/insights`, {
        params: {
          access_token: token,
          metric: 'reach,profile_views,website_clicks,email_contacts',
          since: since,
          until: until,
          period: 'day'
        }
      });

      // 2. Lifetime Metrics (Demographics) - requires separate call
      let demographics = { ageGender: {}, cities: {}, countries: {} };
      try {
        const lifetimeResponse = await this.axios.get(`${this.baseURL}/${igAccountId}/insights`, {
          params: {
            access_token: token,
            metric: 'audience_gender_age,audience_city,audience_country',
            period: 'lifetime'
          }
        });

        const lifetimeData = lifetimeResponse.data.data || [];
        console.log('[Instagram] Demographics metrics received:', lifetimeData.map(m => m.name));
        for (const metric of lifetimeData) {
          if (metric.name === 'audience_gender_age') {
            demographics.ageGender = metric.values[0]?.value || {};
            console.log('[Instagram] Age/Gender data keys:', Object.keys(demographics.ageGender).slice(0, 5));
          }
          if (metric.name === 'audience_city') {
            demographics.cities = metric.values[0]?.value || {};
            console.log('[Instagram] Cities data keys:', Object.keys(demographics.cities).slice(0, 5));
          }
          if (metric.name === 'audience_country') {
            demographics.countries = metric.values[0]?.value || {};
            console.log('[Instagram] Countries data keys:', Object.keys(demographics.countries).slice(0, 5));
          }
        }
      } catch (e) {
        // Demographics might fail if account has <100 followers
        console.log('[Instagram] Demographics API error:', e.response?.data?.error?.message || e.message);
        // Proceed without them
      }

      return {
        daily: dailyResponse.data.data || [],
        demographics: demographics
      };
    } catch (error) {
      return { daily: [], demographics: { ageGender: {}, cities: {}, countries: {} } };
    }
  }

  /**
   * Calculate Audience Snapshot (Top Age, Gender, Location)
   */
  calculateAudienceSnapshot(demographics) {
    if (!demographics || !demographics.ageGender) return null;

    try {
      // 1. Find Top Age & Gender
      // Format: "F.25-34": 123
      let topSegment = { key: '', value: 0 };
      Object.entries(demographics.ageGender).forEach(([key, value]) => {
        if (value > topSegment.value) topSegment = { key, value };
      });

      // Parse "F.25-34" -> Gender: Female, Age: 25-34
      const [genderCode, ageGroup] = topSegment.key ? topSegment.key.split('.') : ['?', 'N/A'];
      const topGender = genderCode === 'F' ? 'Women' : genderCode === 'M' ? 'Men' : 'People';

      // 2. Find Top City
      let topCity = { key: '', value: 0 };
      Object.entries(demographics.cities || {}).forEach(([key, value]) => {
        if (value > topCity.value) topCity = { key, value };
      });
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
      const date = new Date(post.timestamp);
      const day = days[date.getDay()];
      const hour = date.getHours();
      const hourLabel = hour === 0 ? '12 AM' : hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`;

      if (!dayEngagement[day]) dayEngagement[day] = { total: 0, count: 0 };
      dayEngagement[day].total += post.totalInteractions;
      dayEngagement[day].count += 1;

      if (!hourEngagement[hourLabel]) hourEngagement[hourLabel] = { total: 0, count: 0 };
      hourEngagement[hourLabel].total += post.totalInteractions;
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
      bestDay: bestDay || 'Wednesday',
      bestHour: bestHour || '6 PM'
    };
  }

  /**
   * Process media with insights
   */
  processMedia(mediaList, currentFollowers) {
    return mediaList.map(post => {
      const insights = post.insights || {};

      const likes = insights.likes || post.like_count || 0;
      const comments = insights.comments || post.comments_count || 0;
      const shares = insights.shares || 0;
      const saved = insights.saved || 0;
      const reach = insights.reach || 0;
      const impressions = insights.impressions || 0;
      const totalInteractions = insights.total_interactions || (likes + comments + shares + saved);

      const postDate = new Date(post.timestamp);
      const formattedDate = postDate.toISOString().split('T')[0];

      return {
        id: post.id,
        caption: (post.caption || '(No caption)').substring(0, 80),
        fullCaption: post.caption || '(No caption)',
        mediaType: post.media_type,
        mediaProductType: post.media_product_type,
        timestamp: post.timestamp,
        date: formattedDate,
        url: post.permalink,
        // For videos/reels, use thumbnail_url since media_url might be the video file
        mediaUrl: post.media_url || post.thumbnail_url,
        thumbnailUrl: post.thumbnail_url,
        likes: likes,
        comments: comments,
        shares: shares,
        saved: saved,
        reach: reach,
        impressions: impressions,
        totalInteractions: totalInteractions,
        engagementRate: currentFollowers > 0 ? parseFloat(((totalInteractions / currentFollowers) * 100).toFixed(2)) : 0,
        hasInsights: post.hasInsights
      };
    });
  }

  /**
   * Get post format display name
   */
  getPostFormat(mediaType, mediaProductType) {
    if (mediaProductType === 'REELS') return 'Reel';
    if (mediaProductType === 'IGTV') return 'IGTV';
    if (mediaProductType === 'STORY') return 'Story';

    if (mediaType === 'VIDEO') return 'Video';
    if (mediaType === 'IMAGE') return 'Photo';
    if (mediaType === 'CAROUSEL_ALBUM') return 'Carousel';

    return 'Post';
  }

  /**
   * Calculate reputation score
   */
  calculateReputationScore(followers, engagementRate, postCount) {
    return Math.min(100, Math.round(
      (engagementRate * 15) +
      (followers / 100) +
      (postCount * 2) +
      20
    ));
  }
}

export default new InstagramMetricsServiceV2();
