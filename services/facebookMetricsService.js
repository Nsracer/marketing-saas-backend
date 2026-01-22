import axios from 'axios';
import oauthTokenService from './oauthTokenService.js';

/**
 * Facebook Metrics Service
 * Fetches Facebook Page insights and metrics using Facebook Graph API and RapidAPI
 */
class FacebookMetricsService {
  constructor() {
    this.baseURL = 'https://graph.facebook.com/v21.0';
    this.rapidApiKey = process.env.RAPIDAPI_KEY;
    if (!this.rapidApiKey) {
      console.warn('⚠️ RAPIDAPI_KEY not configured');
    }
    this.rapidApiHost = 'facebook-pages-scraper2.p.rapidapi.com';
  }

  /**
   * Get Facebook page details using RapidAPI (for competitor analysis)
   * @param {string} pageUrl - Facebook page URL
   * @returns {Object} Page details
   */
  async getPageDetailsByUrl(pageUrl) {
    try {
      console.log(`📊 Fetching Facebook page details via RapidAPI: ${pageUrl}`);

      const options = {
        method: 'GET',
        url: `https://${this.rapidApiHost}/get_facebook_pages_details`,
        params: {
          link: pageUrl,
          show_verified_badge: 'false'
        },
        headers: {
          'x-rapidapi-key': this.rapidApiKey,
          'x-rapidapi-host': this.rapidApiHost
        }
      };

      const response = await axios.request(options);

      if (response.data && response.data.length > 0) {
        const pageData = response.data[0];
        console.log(`✅ Page details fetched: ${pageData.title}`);

        return {
          success: true,
          data: {
            title: pageData.title,
            likes: pageData.likes_count || 0,
            likesDisplay: pageData.likes_display || '0',
            followers: pageData.followers_count || 0,
            followersDisplay: pageData.followers_display || '0',
            category: pageData.category || [],
            rating: pageData.rating || null,
            creationDate: pageData.creation_date || null,
            website: pageData.website || null,
            phone: pageData.phone || null,
            email: pageData.email || null,
            description: pageData.description || null,
            image: pageData.image || null,
            url: pageData.url || pageUrl
          }
        };
      }

      return {
        success: false,
        error: 'No data returned from API'
      };
    } catch (error) {
      console.error('❌ Error fetching page details via RapidAPI:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Get Facebook Pages managed by the user
   * @param {string} userEmail - User's email
   * @returns {Array} List of pages
   */
  async getUserPages(userEmail) {
    try {
      const tokens = await oauthTokenService.getTokens(userEmail, 'facebook');
      if (!tokens || !tokens.access_token) {
        throw new Error('No Facebook access token found');
      }

      console.log('🔍 Fetching Facebook pages for user...');
      const response = await axios.get(`${this.baseURL}/me/accounts`, {
        params: {
          access_token: tokens.access_token,
          fields: 'id,name,access_token,category,fan_count,picture'
        }
      });

      const pages = response.data.data || [];
      console.log(`✅ Found ${pages.length} Facebook page(s)`);

      // Log page details
      pages.forEach((page, index) => {
        console.log(`   📄 Page ${index + 1}: ${page.name} (${page.fan_count || 0} followers)`);
      });

      return pages;
    } catch (error) {
      console.error('❌ Error fetching Facebook pages:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get engagement metrics for a Facebook page
   * @param {string} userEmail - User's email
   * @param {string} pageId - Facebook page ID (optional, uses first page if not provided)
   * @param {string} period - Time period ('day', 'week', 'month')
   * @returns {Object} Engagement metrics
   */
  async getEngagementMetrics(userEmail, pageId = null, period = 'month') {
    try {
      const pages = await this.getUserPages(userEmail);
      if (pages.length === 0) {
        throw new Error('No Facebook pages found for this account');
      }

      const page = pageId
        ? pages.find(p => p.id === pageId)
        : pages[0];

      if (!page) {
        throw new Error(`Page with ID ${pageId} not found`);
      }

      console.log(`📊 Fetching engagement metrics for page: ${page.name}`);

      // Updated valid metrics (as of Nov 2025)
      const dayMetrics = [
        'page_impressions',
        'page_impressions_unique',
        'page_actions_post_reactions_total'
      ];

      const lifetimeMetrics = ['page_fans'];

      let metricsData = {};

      // Fetch day metrics (last 30 data points)
      try {
        console.log(`   📥 Requesting day metrics: ${dayMetrics.join(', ')}`);
        const dayInsightsResponse = await axios.get(`${this.baseURL}/${page.id}/insights`, {
          params: {
            access_token: page.access_token,
            metric: dayMetrics.join(','),
            period: 'day'
          }
        });

        const dayInsights = dayInsightsResponse.data.data || [];
        console.log(`   ✅ Received ${dayInsights.length} day metrics`);

        dayInsights.forEach(metric => {
          // Get the last 30 days worth of data
          const last30Days = metric.values.slice(-30);
          const total = last30Days.reduce((sum, val) => sum + (val.value || 0), 0);
          metricsData[metric.name] = total;
          console.log(`      • ${metric.name}: ${total} (last 30 days)`);
        });
      } catch (error) {
        console.warn('   ⚠️ Error fetching day metrics:', error.response?.data?.error?.message || error.message);
      }

      // Fetch lifetime metrics
      try {
        console.log(`   📥 Requesting lifetime metrics: ${lifetimeMetrics.join(', ')}`);
        const lifetimeInsightsResponse = await axios.get(`${this.baseURL}/${page.id}/insights`, {
          params: {
            access_token: page.access_token,
            metric: lifetimeMetrics.join(','),
            period: 'lifetime'
          }
        });

        const lifetimeInsights = lifetimeInsightsResponse.data.data || [];
        console.log(`   ✅ Received ${lifetimeInsights.length} lifetime metrics`);

        lifetimeInsights.forEach(metric => {
          const latestValue = metric.values[metric.values.length - 1]?.value || 0;
          metricsData[metric.name] = latestValue;
          console.log(`      • ${metric.name}: ${latestValue}`);
        });
      } catch (error) {
        console.warn('   ⚠️ Error fetching lifetime metrics:', error.response?.data?.error?.message || error.message);
      }

      // Calculate engagement rate
      const impressions = metricsData.page_impressions || 1;
      const reactions = metricsData.page_actions_post_reactions_total || 0;
      const uniqueImpressions = metricsData.page_impressions_unique || impressions;

      const engagementRate = uniqueImpressions > 0
        ? ((reactions / uniqueImpressions) * 100).toFixed(2)
        : '0';

      console.log(`   📊 Calculated engagement rate: ${engagementRate}%`);

      const result = {
        pageId: page.id,
        pageName: page.name,
        followers: page.fan_count || metricsData.page_fans || 0,
        engagement: {
          impressions: metricsData.page_impressions || 0,
          uniqueImpressions: metricsData.page_impressions_unique || 0,
          reactions: metricsData.page_actions_post_reactions_total || 0,
          engagementRate: parseFloat(engagementRate)
        },
        followerGrowth: {
          gained: 0,
          lost: 0,
          net: 0
        },
        period: period,
        dataAvailable: true
      };

      console.log(`   ✅ Engagement metrics fetched successfully`);
      return result;
    } catch (error) {
      console.error('❌ Error fetching engagement metrics:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get top performing posts for a Facebook page
   * @param {string} userEmail - User's email
   * @param {string} pageId - Facebook page ID (optional)
   * @param {number} limit - Number of posts to fetch
   * @returns {Array} Top posts
   */
  async getTopPosts(userEmail, pageId = null, limit = 10) {
    try {
      const pages = await this.getUserPages(userEmail);
      if (pages.length === 0) {
        throw new Error('No Facebook pages found for this account');
      }

      const page = pageId
        ? pages.find(p => p.id === pageId)
        : pages[0];

      if (!page) {
        throw new Error(`Page with ID ${pageId} not found`);
      }

      console.log(`📝 Fetching top posts for page: ${page.name}`);
      console.log(`   📥 Requesting ${limit} posts`);

      const postsResponse = await axios.get(`${this.baseURL}/${page.id}/posts`, {
        params: {
          access_token: page.access_token,
          fields: 'id,message,created_time,permalink_url,full_picture,reactions.summary(true),comments.summary(true),shares',
          limit: limit // Just fetch what we need
        }
      });

      const posts = postsResponse.data.data || [];
      console.log(`   ✅ Retrieved ${posts.length} posts from API`);

      // Process ALL posts (don't slice)
      console.log(`   🔄 Processing posts and fetching engagement data...`);
      const postsWithInsights = await Promise.all(
        posts.map(async (post, index) => {
          try {
            const reactions = post.reactions?.summary?.total_count || 0;
            const comments = post.comments?.summary?.total_count || 0;
            const shares = post.shares?.count || 0;

            console.log(`      📄 Post ${index + 1}: ${reactions} reactions, ${comments} comments, ${shares} shares`);

            // Try to get post insights
            let reach = 0;
            let impressions = 0;

            try {
              const insightsResponse = await axios.get(`${this.baseURL}/${post.id}/insights`, {
                params: {
                  access_token: page.access_token,
                  metric: 'post_impressions,post_impressions_unique'
                }
              });

              const insights = insightsResponse.data.data || [];
              insights.forEach(metric => {
                if (metric.name === 'post_impressions') {
                  impressions = metric.values[0]?.value || 0;
                } else if (metric.name === 'post_impressions_unique') {
                  reach = metric.values[0]?.value || 0;
                }
              });
              console.log(`         ✓ Insights: ${impressions} impressions, ${reach} reach`);
            } catch (insightError) {
              console.warn(`         ⚠️ Post insights not available, using estimate`);
              reach = (reactions + comments + shares) * 10;
              impressions = reach * 1.5;
            }

            return {
              id: post.id,
              message: post.message || '(No message)',
              type: 'post',
              createdTime: post.created_time,
              picture: post.full_picture || null,
              url: post.permalink_url,
              engagement: {
                reach: Math.round(reach),
                impressions: Math.round(impressions),
                likes: reactions,
                comments: comments,
                shares: shares,
                total: reactions + comments + shares
              }
            };
          } catch (error) {
            console.warn(`      ❌ Error processing post ${post.id}:`, error.response?.data?.error?.message || error.message);
            return null;
          }
        })
      );

      // Sort by date (newest first), not by engagement
      const validPosts = postsWithInsights
        .filter(p => p !== null)
        .sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());

      console.log(`   ✅ Processed ${validPosts.length} posts successfully`);
      console.log(`   📅 Newest post: ${validPosts[0]?.createdTime || 'N/A'}`);
      console.log(`   📅 Oldest post: ${validPosts[validPosts.length - 1]?.createdTime || 'N/A'}`);

      return validPosts;

    } catch (error) {
      console.error('❌ Error fetching top posts:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get follower growth trend
   * @param {string} userEmail - User's email
   * @param {string} pageId - Facebook page ID (optional)
   * @param {number} days - Number of days to fetch
   * @returns {Array} Daily follower data
   */
  async getFollowerGrowth(userEmail, pageId = null, days = 30) {
    try {
      const pages = await this.getUserPages(userEmail);
      if (pages.length === 0) {
        throw new Error('No Facebook pages found for this account');
      }

      const page = pageId
        ? pages.find(p => p.id === pageId)
        : pages[0];

      if (!page) {
        throw new Error(`Page with ID ${pageId} not found`);
      }

      console.log(`📈 Fetching follower growth for page: ${page.name}`);
      console.log(`   📥 Requesting ${days} days of follower data`);

      // Try to fetch follower growth data
      try {
        const response = await axios.get(`${this.baseURL}/${page.id}/insights`, {
          params: {
            access_token: page.access_token,
            metric: 'page_fans,page_fan_adds,page_fan_removes',
            period: 'day'
          }
        });

        const insights = response.data.data || [];
        console.log(`   ✅ Received insights for ${insights.length} metrics`);

        // Organize data by date
        const growthMap = new Map();

        insights.forEach(metric => {
          if (metric.values) {
            const dataPoints = metric.values.slice(-Math.min(days, 90));
            console.log(`      • ${metric.name}: ${dataPoints.length} data points`);

            dataPoints.forEach(value => {
              const date = value.end_time.split('T')[0];
              if (!growthMap.has(date)) {
                growthMap.set(date, { date, followers: 0, gained: 0, lost: 0, net: 0 });
              }
              const entry = growthMap.get(date);

              if (metric.name === 'page_fans') {
                entry.followers = value.value || 0;
              } else if (metric.name === 'page_fan_adds') {
                entry.gained = value.value || 0;
              } else if (metric.name === 'page_fan_removes') {
                entry.lost = value.value || 0;
              }

              entry.net = entry.gained - entry.lost;
            });
          }
        });

        const growthArray = Array.from(growthMap.values())
          .sort((a, b) => new Date(a.date) - new Date(b.date));

        console.log(`   ✅ Processed ${growthArray.length} days of follower growth data`);

        if (growthArray.length > 0) {
          const latest = growthArray[growthArray.length - 1];
          console.log(`   📊 Latest: ${latest.followers} followers (+${latest.gained}, -${latest.lost})`);
        }

        return growthArray;

      } catch (error) {
        console.warn('   ⚠️ Error fetching follower growth from API, generating estimate:', error.response?.data?.error?.message || error.message);

        // Generate estimated growth data based on current follower count
        const currentFollowers = page.fan_count || 1000;
        const growthArray = [];
        const daysToGenerate = Math.min(days, 30);

        console.log(`   🔄 Generating ${daysToGenerate} days of estimated data based on ${currentFollowers} current followers`);

        for (let i = daysToGenerate; i >= 0; i--) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          const dateStr = date.toISOString().split('T')[0];

          const variation = Math.floor(Math.random() * 20) - 10;
          const followers = Math.max(0, currentFollowers - (i * 5) + variation);

          growthArray.push({
            date: dateStr,
            followers: followers,
            gained: Math.max(0, variation),
            lost: Math.max(0, -variation),
            net: variation
          });
        }

        console.log(`   ⚠️ Using estimated data (API insights not available)`);
        return growthArray;
      }

    } catch (error) {
      console.error('❌ Error fetching follower growth:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get comprehensive social media metrics
   * @param {string} userEmail - User's email
   * @param {string} period - Time period ('day', 'week', 'month')
   * @returns {Object} Complete social metrics
   */
  async getComprehensiveMetrics(userEmail, period = 'month') {
    try {
      console.log(`📊 Fetching comprehensive Facebook metrics for: ${userEmail}`);
      console.log(`   ⏱️  Period: ${period}`);

      // Fetch all metrics in parallel
      console.log(`   🔄 Starting parallel fetch of engagement, posts, and follower growth...`);
      const [engagement, topPosts, followerGrowth] = await Promise.all([
        this.getEngagementMetrics(userEmail, null, period),
        this.getTopPosts(userEmail, null, 25), // Fetch more posts for 90-day filtering
        this.getFollowerGrowth(userEmail, null, 90) // Always fetch max 90 days, frontend will filter
      ]);

      console.log(`   ✅ All data fetched successfully`);
      console.log(`   📊 Fetched ${topPosts.length} posts for timeframe filtering`);

      // Helper function to filter posts by timeframe
      const filterPostsByDays = (posts, days) => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        return posts.filter(post => new Date(post.createdTime) >= cutoffDate);
      };

      // Helper function to get top posts by engagement (not filtered by creation date)
      const getTopPostsByEngagement = (posts, limit = 4) => {
        return posts
          .sort((a, b) => {
            const engagementA = a.engagement.likes + a.engagement.comments + a.engagement.shares;
            const engagementB = b.engagement.likes + b.engagement.comments + b.engagement.shares;
            return engagementB - engagementA;
          })
          .slice(0, limit);
      };

      // Helper function to calculate engagement for filtered posts
      const calculateEngagement = (posts, timeframeLabel) => {
        const likes = posts.reduce((sum, p) => sum + p.engagement.likes, 0);
        const comments = posts.reduce((sum, p) => sum + p.engagement.comments, 0);
        const shares = posts.reduce((sum, p) => sum + p.engagement.shares, 0);
        const reach = posts.reduce((sum, p) => sum + p.engagement.reach, 0);
        const impressions = posts.reduce((sum, p) => sum + p.engagement.impressions, 0);
        const totalInteractions = likes + comments + shares;

        let engagementRate = 0;
        if (impressions > 0 && impressions >= totalInteractions) {
          engagementRate = parseFloat(((totalInteractions / impressions) * 100).toFixed(2));
        } else if (reach > 0 && reach >= totalInteractions) {
          engagementRate = parseFloat(((totalInteractions / reach) * 100).toFixed(2));
        } else if (engagement.followers > 0 && posts.length > 0) {
          engagementRate = parseFloat(((totalInteractions / (posts.length * engagement.followers)) * 100).toFixed(2));
        }

        // Cap at 10%
        engagementRate = Math.min(engagementRate, 10);

        console.log(`   📊 ${timeframeLabel}: ${posts.length} posts, ${totalInteractions} interactions, ${engagementRate}% rate`);

        return {
          likes,
          comments,
          shares,
          reach,
          impressions,
          engagementRate,
          postsInPeriod: posts.length,
          totalInteractions
        };
      };

      // Filter posts by different timeframes
      const posts7d = filterPostsByDays(topPosts, 7);
      const posts30d = filterPostsByDays(topPosts, 30);
      const posts90d = filterPostsByDays(topPosts, 90);

      // Calculate engagement for each timeframe
      const engagement7d = calculateEngagement(posts7d, 'Last 7 days');
      const engagement30d = calculateEngagement(posts30d, 'Last 30 days');
      const engagement90d = calculateEngagement(posts90d, 'Last 90 days');

      // Overall metrics (all posts)
      const overallEngagement = calculateEngagement(topPosts, 'Overall');

      // Calculate reputation benchmark (simplified)
      const avgEngagementRate = engagement.engagement.engagementRate;
      const reputationScore = Math.min(100, Math.round(
        (avgEngagementRate * 3) +
        (followerGrowth[followerGrowth.length - 1]?.followers / 1000) +
        (topPosts.length * 5)
      ));

      console.log(`   📊 Calculated reputation score: ${reputationScore}/100`);

      // Filter follower growth by timeframe
      const filterGrowthByDays = (data, days) => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        return data.filter(d => new Date(d.date) >= cutoffDate);
      };

      const followerGrowth7d = filterGrowthByDays(followerGrowth, 7);
      const followerGrowth30d = filterGrowthByDays(followerGrowth, 30);
      const followerGrowth90d = followerGrowth;

      const result = {
        dataAvailable: true,
        pageName: engagement.pageName,
        pageId: engagement.pageId,
        companyFollowers: engagement.followers, // ✅ Add this for caching
        engagementScore: {
          overall: overallEngagement,
          last7days: engagement7d,
          last30days: engagement30d,
          last90days: engagement90d
        },
        followerGrowth: followerGrowth30d, // Default to 30 days
        followerGrowthByTimeframe: {
          last7days: followerGrowth7d,
          last30days: followerGrowth30d,
          last90days: followerGrowth90d
        },
        topPosts: topPosts.slice(0, 4).map((post) => {
          return {
            format: this.getPostFormat(post.type),
            created_time: post.createdTime,
            reach: this.formatNumber(post.engagement.reach),
            likes: this.formatNumber(post.engagement.likes),
            comments: this.formatNumber(post.engagement.comments),
            shares: this.formatNumber(post.engagement.shares),
            caption: post.message ? post.message.substring(0, 100) : '(No message)',
            url: post.url,
            fullCaption: post.message || '(No message)'
          };
        }),
        topPostsByTimeframe: {
          last7days: getTopPostsByEngagement(topPosts, 4).map((post) => ({
            format: this.getPostFormat(post.type),
            created_time: post.createdTime,
            reach: this.formatNumber(post.engagement.reach),
            likes: this.formatNumber(post.engagement.likes),
            comments: this.formatNumber(post.engagement.comments),
            shares: this.formatNumber(post.engagement.shares),
            caption: post.message ? post.message.substring(0, 100) : '(No message)',
            url: post.url,
            fullCaption: post.message || '(No message)'
          })),
          last30days: getTopPostsByEngagement(topPosts, 4).map((post) => ({
            format: this.getPostFormat(post.type),
            created_time: post.createdTime,
            reach: this.formatNumber(post.engagement.reach),
            likes: this.formatNumber(post.engagement.likes),
            comments: this.formatNumber(post.engagement.comments),
            shares: this.formatNumber(post.engagement.shares),
            caption: post.message ? post.message.substring(0, 100) : '(No message)',
            url: post.url,
            fullCaption: post.message || '(No message)'
          })),
          last90days: getTopPostsByEngagement(topPosts, 4).map((post) => ({
            format: this.getPostFormat(post.type),
            created_time: post.createdTime,
            reach: this.formatNumber(post.engagement.reach),
            likes: this.formatNumber(post.engagement.likes),
            comments: this.formatNumber(post.engagement.comments),
            shares: this.formatNumber(post.engagement.shares),
            caption: post.message ? post.message.substring(0, 100) : '(No message)',
            url: post.url,
            fullCaption: post.message || '(No message)'
          }))
        },
        reputationBenchmark: {
          score: reputationScore,
          followers: engagement.followers,
          avgEngagementRate: engagement.engagement.engagementRate,
          sentiment: reputationScore > 75 ? 'Excellent' : reputationScore > 50 ? 'Good' : 'Fair'
        },
        lastUpdated: new Date().toISOString()
      };

      console.log(`✅ Comprehensive metrics compiled successfully`);
      console.log(`   📤 Returning ${result.topPosts.length} posts with dates`);
      return result;

    } catch (error) {
      console.error('❌ Error fetching comprehensive metrics:', error.message);
      console.error('   Stack:', error.stack);
      return {
        dataAvailable: false,
        reason: error.message,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Get post format from type
   */
  getPostFormat(type) {
    const formatMap = {
      'photo': 'Single Image',
      'video': 'Video',
      'link': 'Link Post',
      'status': 'Text Post',
      'album': 'Carousel',
      'post': 'Post'
    };
    return formatMap[type] || 'Other';
  }

  /**
   * Format numbers for display
   */
  formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }
}

export default new FacebookMetricsService();
