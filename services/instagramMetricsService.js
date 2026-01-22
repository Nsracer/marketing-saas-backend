import axios from 'axios';
import oauthTokenService from './oauthTokenService.js';

/**
 * Instagram Metrics Service
 * Fetches Instagram Business Account insights and metrics using Instagram Graph API
 * Requires: Instagram Business Account or Creator Account connected to a Facebook Page
 * Now supports per-user OAuth authentication
 */
class InstagramMetricsService {
  constructor() {
    this.baseURL = 'https://graph.facebook.com/v21.0';
  }

  /**
   * Get Instagram Business Account ID
   * @param {string} userEmail - User's email
   * @param {string} facebookPageId - Facebook Page ID (optional, will fetch first page if not provided)
   * @returns {Object} Instagram account info
   */
  async getInstagramAccount(userEmail, facebookPageId = null) {
    try {
      // Try Instagram token first, fallback to Facebook token
      let tokens = await oauthTokenService.getTokens(userEmail, 'instagram');
      
      // If no Instagram token, try Facebook token (since Instagram uses Facebook OAuth)
      if (!tokens || !tokens.access_token) {
        console.log('   ℹ️  No Instagram token found, trying Facebook token...');
        tokens = await oauthTokenService.getTokens(userEmail, 'facebook');
      }
      
      if (!tokens || !tokens.access_token) {
        throw new Error('No Facebook/Instagram access token found. Please connect your Facebook account.');
      }

      const accessToken = tokens.access_token;
      console.log('🔍 Fetching Instagram Business Account for:', userEmail);

      // If no page ID provided, get the first page
      let pageId = facebookPageId;
      if (!pageId) {
        const pagesResponse = await axios.get(`${this.baseURL}/me/accounts`, {
          params: {
            access_token: accessToken,
            fields: 'id,name'
          }
        });

        const pages = pagesResponse.data.data || [];
        if (pages.length === 0) {
          throw new Error('No Facebook pages found');
        }
        pageId = pages[0].id;
        console.log(`   Using Facebook Page: ${pages[0].name} (${pageId})`);
      }

      // Get Instagram Business Account connected to this page
      const response = await axios.get(`${this.baseURL}/${pageId}`, {
        params: {
          access_token: accessToken,
          fields: 'instagram_business_account'
        }
      });

      const igAccountId = response.data.instagram_business_account?.id;
      if (!igAccountId) {
        throw new Error('No Instagram Business Account connected to this Facebook Page');
      }

      // Get Instagram account details
      const accountResponse = await axios.get(`${this.baseURL}/${igAccountId}`, {
        params: {
          access_token: accessToken,
          fields: 'id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website'
        }
      });

      const account = accountResponse.data;
      console.log(`✅ Found Instagram account: @${account.username}`);
      console.log(`   Followers: ${account.followers_count?.toLocaleString() || 0}`);
      console.log(`   Posts: ${account.media_count || 0}`);

      return {
        success: true,
        id: account.id,
        username: account.username,
        name: account.name,
        profilePicture: account.profile_picture_url,
        followers: account.followers_count || 0,
        following: account.follows_count || 0,
        mediaCount: account.media_count || 0,
        biography: account.biography,
        website: account.website
      };
    } catch (error) {
      console.error('❌ Error fetching Instagram account:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get engagement metrics for Instagram account
   * @param {string} userEmail - User's email
   * @param {string} period - Time period ('day', 'week', 'month')
   * @returns {Object} Engagement metrics
   */
  async getEngagementMetrics(userEmail, period = 'month') {
    try {
      const tokens = await oauthTokenService.getTokens(userEmail, 'instagram');
      if (!tokens || !tokens.access_token) {
        throw new Error('No Instagram access token found');
      }

      const accessToken = tokens.access_token;
      const account = await this.getInstagramAccount(userEmail);
      
      console.log(`📊 Fetching engagement metrics for @${account.username}`);

      // Calculate date range
      const since = new Date();
      const until = new Date();
      const daysBack = period === 'day' ? 1 : (period === 'week' ? 7 : 30);
      since.setDate(since.getDate() - daysBack);

      const sinceTimestamp = Math.floor(since.getTime() / 1000);
      const untilTimestamp = Math.floor(until.getTime() / 1000);

      // Available metrics for Instagram Business Accounts (v24.0)
      const metrics = [
        'reach',
        'profile_views',
        'follower_count'
      ];

      let metricsData = {
        impressions: 0,
        reach: 0,
        profileViews: 0,
        followerCount: account.followers,
        engagement: 0,
        likes: 0,
        comments: 0,
        saves: 0,
        shares: 0
      };

      // Fetch account insights
      try {
        console.log(`   📥 Requesting account insights for last ${daysBack} days...`);
        const insightsResponse = await axios.get(`${this.baseURL}/${account.id}/insights`, {
          params: {
            access_token: accessToken,
            metric: metrics.join(','),
            period: 'day',
            since: sinceTimestamp,
            until: untilTimestamp
          }
        });

        const insights = insightsResponse.data.data || [];
        console.log(`   ✅ Received ${insights.length} insight metrics`);

        insights.forEach(metric => {
          const values = metric.values || [];
          const total = values.reduce((sum, val) => sum + (val.value || 0), 0);
          
          switch (metric.name) {
            case 'impressions':
              metricsData.impressions = total;
              console.log(`      • impressions: ${total}`);
              break;
            case 'reach':
              metricsData.reach = total;
              console.log(`      • reach: ${total}`);
              break;
            case 'profile_views':
              metricsData.profileViews = total;
              console.log(`      • profile_views: ${total}`);
              break;
            case 'follower_count':
              // Get the latest follower count
              if (values.length > 0) {
                metricsData.followerCount = values[values.length - 1].value || account.followers;
              }
              break;
          }
        });
      } catch (error) {
        console.warn('   ⚠️ Error fetching account insights:', error.response?.data?.error?.message || error.message);
      }

      // Fetch recent media to calculate engagement
      try {
        console.log(`   📥 Fetching recent media for engagement calculation...`);
        const mediaResponse = await axios.get(`${this.baseURL}/${account.id}/media`, {
          params: {
            access_token: accessToken,
            fields: 'id,like_count,comments_count,timestamp',
            limit: 25
          }
        });

        const mediaItems = mediaResponse.data.data || [];
        console.log(`   ✅ Retrieved ${mediaItems.length} media items`);

        // Filter media within the time period
        const filteredMedia = mediaItems.filter(item => {
          const itemDate = new Date(item.timestamp);
          return itemDate >= since && itemDate <= until;
        });

        console.log(`   📊 ${filteredMedia.length} posts within the selected period`);

        // Calculate engagement from media
        filteredMedia.forEach(item => {
          metricsData.likes += item.like_count || 0;
          metricsData.comments += item.comments_count || 0;
        });

        metricsData.engagement = metricsData.likes + metricsData.comments;
        
        console.log(`      • total likes: ${metricsData.likes}`);
        console.log(`      • total comments: ${metricsData.comments}`);
        console.log(`      • total engagement: ${metricsData.engagement}`);
      } catch (error) {
        console.warn('   ⚠️ Error fetching media:', error.response?.data?.error?.message || error.message);
      }

      // Calculate engagement rate
      const engagementRate = metricsData.reach > 0
        ? ((metricsData.engagement / metricsData.reach) * 100).toFixed(2)
        : '0.00';

      console.log(`   📊 Calculated engagement rate: ${engagementRate}%`);

      const result = {
        accountId: account.id,
        username: account.username,
        name: account.name,
        followers: metricsData.followerCount,
        engagement: {
          impressions: metricsData.impressions,
          reach: metricsData.reach,
          profileViews: metricsData.profileViews,
          likes: metricsData.likes,
          comments: metricsData.comments,
          saves: metricsData.saves,
          shares: metricsData.shares,
          totalEngagement: metricsData.engagement,
          engagementRate: parseFloat(engagementRate)
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
   * Get top performing posts (using final-insta.js approach)
   * @param {string} userEmail - User's email
   * @param {number} limit - Number of posts to fetch
   * @returns {Array} Top posts
   */
  async getTopPosts(userEmail, limit = 30) {
    try {
      const tokens = await oauthTokenService.getTokens(userEmail, 'instagram');
      if (!tokens || !tokens.access_token) {
        throw new Error('No Instagram access token found');
      }

      const accessToken = tokens.access_token;
      const account = await this.getInstagramAccount(userEmail);

      console.log(`📝 Fetching top posts for @${account.username}`);
      console.log(`   📥 Requesting ${limit} posts`);

      // Get recent media with basic fields
      const mediaResponse = await axios.get(`${this.baseURL}/${account.id}/media`, {
        params: {
          access_token: accessToken,
          fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,media_product_type',
          limit: limit
        }
      });

      const mediaItems = mediaResponse.data.data || [];
      console.log(`   ✅ Retrieved ${mediaItems.length} posts from API`);

      if (mediaItems.length === 0) {
        return [];
      }

      // Process posts and get insights (using working metrics only)
      console.log(`   ⏳ Fetching insights for ${mediaItems.length} posts...`);
      let successCount = 0;
      
      const postsWithInsights = await Promise.all(
        mediaItems.map(async (post, index) => {
          try {
            const likes = post.like_count || 0;
            const comments = post.comments_count || 0;
            let saves = 0;
            let shares = 0;
            let totalInteractions = 0;

            // Try to get post insights (only metrics that work for FEED posts)
            try {
              const insightsResponse = await axios.get(`${this.baseURL}/${post.id}/insights`, {
                params: {
                  access_token: accessToken,
                  metric: 'likes,comments,shares,saved,total_interactions'
                }
              });

              const insights = insightsResponse.data.data || [];
              insights.forEach(metric => {
                const value = metric.values?.[0]?.value || 0;
                switch (metric.name) {
                  case 'likes':
                    // Use insight data if available, otherwise use basic count
                    break;
                  case 'comments':
                    break;
                  case 'shares':
                    shares = value;
                    break;
                  case 'saved':
                    saves = value;
                    break;
                  case 'total_interactions':
                    totalInteractions = value;
                    break;
                }
              });
              
              successCount++;
            } catch (insightError) {
              // Insights not available for this post (normal for some post types)
            }

            // Calculate total interactions (use insight if available, otherwise calculate)
            if (totalInteractions === 0) {
              totalInteractions = likes + comments + shares + saves;
            }

            if ((index + 1) % 10 === 0) {
              console.log(`      ✓ Processed ${index + 1}/${mediaItems.length} posts`);
            }

            return {
              id: post.id,
              caption: post.caption || '(No caption)',
              type: post.media_type,
              mediaProductType: post.media_product_type,
              mediaUrl: post.media_url,
              thumbnailUrl: post.thumbnail_url,
              permalink: post.permalink,
              timestamp: post.timestamp,
              engagement: {
                likes: likes,
                comments: comments,
                saves: saves,
                shares: shares,
                total: totalInteractions
              },
              hasInsights: successCount > 0
            };
          } catch (error) {
            console.warn(`      ❌ Error processing post ${post.id}:`, error.message);
            return null;
          }
        })
      );

      console.log(`   ✅ Completed: ${successCount}/${mediaItems.length} posts with insights`);

      const validPosts = postsWithInsights
        .filter(p => p !== null)
        .sort((a, b) => b.engagement.total - a.engagement.total);

      console.log(`   ✅ Processed ${validPosts.length} posts successfully`);
      if (validPosts.length > 0) {
        console.log(`   🏆 Top post has ${validPosts[0].engagement.total} total engagements`);
      }

      return validPosts;
    } catch (error) {
      console.error('❌ Error fetching top posts:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get follower growth trend (CUMULATIVE - using new-insta.js approach)
   * @param {string} userEmail - User's email
   * @param {number} days - Number of days to fetch
   * @returns {Array} Daily follower data with cumulative counts
   */
  async getFollowerGrowth(userEmail, days = 30) {
    try {
      // Get tokens (dynamic, not hardcoded)
      let tokens = await oauthTokenService.getTokens(userEmail, 'instagram');
      if (!tokens || !tokens.access_token) {
        console.log('   ℹ️  No Instagram token found, trying Facebook token...');
        tokens = await oauthTokenService.getTokens(userEmail, 'facebook');
      }
      
      if (!tokens || !tokens.access_token) {
        throw new Error('No Instagram/Facebook access token found');
      }

      const accessToken = tokens.access_token;

      console.log(`\n📈 FETCHING INSTAGRAM FOLLOWER GROWTH`);
      console.log(`   User: ${userEmail}`);
      console.log(`   Days requested: ${days}`);

      // Get Instagram account info (includes current follower count)
      const account = await this.getInstagramAccount(userEmail);
      console.log(`   Account: @${account.username}`);
      console.log(`   Current followers: ${account.followers}`);

      // Calculate timestamps (max 30 days for Instagram API)
      const now = Math.floor(Date.now() / 1000);
      const daysToFetch = Math.min(days, 30); // Instagram API limit is 30 days
      const since = now - (daysToFetch * 86400);

      console.log(`   Fetching ${daysToFetch} days of data...`);

      try {
        const response = await axios.get(`${this.baseURL}/${account.id}/insights`, {
          params: {
            access_token: accessToken,
            metric: 'follower_count',
            period: 'day',
            since: since,
            until: now
          }
        });

        const data = response.data.data || [];
        console.log(`   ✅ API Response received`);

        if (data.length > 0 && data[0].values && data[0].values.length > 0) {
          const dailyChanges = data[0].values;
          console.log(`   📊 Got ${dailyChanges.length} data points from API`);
          
          // CRITICAL FIX: Instagram API returns DAILY CHANGES, not cumulative counts
          // Need to convert: work backwards from current followers
          const currentFollowers = account.followers;
          
          // Sum all daily changes to get total growth over the period
          const totalDailyChanges = dailyChanges.reduce((sum, v) => sum + v.value, 0);
          console.log(`   📊 Total daily changes sum: ${totalDailyChanges}`);
          console.log(`   📊 Current followers: ${currentFollowers}`);
          
          // Calculate starting follower count
          const startingFollowers = currentFollowers - totalDailyChanges;
          console.log(`   📊 Calculated starting followers: ${startingFollowers}`);
          
          // Convert daily changes to cumulative follower counts
          const growthArray = [];
          let cumulativeFollowers = startingFollowers;
          
          for (const dayData of dailyChanges) {
            cumulativeFollowers += dayData.value; // Add daily change to cumulative
            growthArray.push({
              date: dayData.end_time.split('T')[0],
              followers: Math.max(0, cumulativeFollowers) // Never go below 0
            });
          }
          
          // Verify last day matches current followers
          const lastDataPoint = growthArray[growthArray.length - 1];
          if (lastDataPoint && lastDataPoint.followers !== currentFollowers) {
            console.log(`   ⚠️  Last data point (${lastDataPoint.followers}) doesn't match current followers (${currentFollowers})`);
            console.log(`   🔧 Correcting last data point to match current followers...`);
            lastDataPoint.followers = currentFollowers;
          }

          if (growthArray.length > 0) {
            console.log(`   ✅ REAL CUMULATIVE DATA (converted from daily changes):`);
            console.log(`      First day: ${growthArray[0].date} = ${growthArray[0].followers} followers`);
            console.log(`      Last day: ${growthArray[growthArray.length - 1].date} = ${growthArray[growthArray.length - 1].followers} followers`);
            console.log(`      Growth: ${growthArray[growthArray.length - 1].followers - growthArray[0].followers} followers`);
            console.log(`      Days: ${growthArray.length}`);
            return growthArray;
          }
        } else {
          console.log(`   ⚠️ No values in API response - falling back to empty array`);
        }
      } catch (error) {
        console.error(`   ❌ API Error: ${error.response?.data?.error?.message || error.message}`);
        console.log(`   ℹ️  This is expected if account lacks historical data access`);
      }

      // Return empty array instead of estimated data - user should see REAL data only
      console.log(`   ℹ️  No real follower data available from API`);
      console.log(`   💡 Note: Instagram API requires proper token permissions to access follower insights\n`);
      return [];
      
    } catch (error) {
      console.error('❌ Error fetching follower growth:', error.message);
      return [];
    }
  }

  /**
   * Get comprehensive Instagram metrics
   * @param {string} userEmail - User's email
   * @param {string} period - Time period ('day', 'week', 'month')
   * @returns {Object} Complete Instagram metrics
   */
  async getComprehensiveMetrics(userEmail, period = 'month') {
    try {
      console.log(`📊 Fetching comprehensive Instagram metrics for: ${userEmail}`);
      console.log(`   ⏱️  Period: ${period}`);

      // Fetch all metrics in parallel
      console.log(`   🔄 Starting parallel fetch of engagement, posts, and follower growth...`);
      const [engagement, topPosts, followerGrowth] = await Promise.all([
        this.getEngagementMetrics(userEmail, period),
        this.getTopPosts(userEmail, 100), // Fetch more posts to get better stats
        this.getFollowerGrowth(userEmail, period === 'day' ? 7 : (period === 'week' ? 14 : 30))
      ]);

      console.log(`   ✅ All data fetched successfully`);

      // Helper function to get top posts by posting date in timeframe
      const getTopPostsByTimeframe = (posts, days) => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        // Filter posts created within the timeframe AND have engagement
        const filtered = posts.filter(post => {
          const postDate = new Date(post.timestamp);
          return postDate >= cutoffDate && post.engagement.total > 0;
        });
        
        return filtered
          .sort((a, b) => b.engagement.total - a.engagement.total)
          .slice(0, 4);
      };

      // Helper function to calculate engagement metrics for posts in timeframe
      const getMetricsByTimeframe = (posts, days) => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        // Filter posts created within the timeframe
        const filtered = posts.filter(post => {
          const postDate = new Date(post.timestamp);
          return postDate >= cutoffDate;
        });
        
        const totals = filtered.reduce((acc, post) => {
          acc.likes += post.engagement.likes;
          acc.comments += post.engagement.comments;
          acc.saves += post.engagement.saves;
          acc.shares += post.engagement.shares;
          acc.total += post.engagement.total;
          return acc;
        }, { likes: 0, comments: 0, saves: 0, shares: 0, total: 0 });

        const engagementRate = engagement.followers > 0 && filtered.length > 0
          ? ((totals.total / (filtered.length * engagement.followers)) * 100).toFixed(2)
          : 0;

        return {
          likes: totals.likes,
          comments: totals.comments,
          saves: totals.saves,
          shares: totals.shares,
          engagementRate: parseFloat(engagementRate),
          reach: engagement.engagement.reach,
          impressions: engagement.engagement.impressions,
          profileViews: engagement.engagement.profileViews,
          postsInPeriod: filtered.length,
          totalInteractions: totals.total
        };
      };

      console.log('📊 Calculating engagement metrics by timeframe...');

      // Calculate metrics for different timeframes
      const engagement7d = getMetricsByTimeframe(topPosts, 7);
      const engagement30d = getMetricsByTimeframe(topPosts, 30);
      const engagement90d = getMetricsByTimeframe(topPosts, 90);

      // Get top posts by timeframe (globally best performing posts)
      const topPostsGlobal = topPosts
        .sort((a, b) => b.engagement.total - a.engagement.total)
        .slice(0, 4);

      const topPosts7d = getTopPostsByTimeframe(topPosts, 7);
      const topPosts30d = getTopPostsByTimeframe(topPosts, 30);
      const topPosts90d = getTopPostsByTimeframe(topPosts, 90);

      // Helper to format posts
      const formatTopPosts = (posts) => posts.map(post => ({
        format: this.getPostFormat(post.type),
        timestamp: post.timestamp,
        reach: this.formatNumber(post.engagement.reach),
        likes: this.formatNumber(post.engagement.likes),
        comments: this.formatNumber(post.engagement.comments),
        saves: this.formatNumber(post.engagement.saves),
        shares: this.formatNumber(post.engagement.shares),
        engagement: this.formatNumber(post.engagement.total),
        caption: post.caption ? post.caption.substring(0, 100) : '(No caption)',
        url: post.permalink,
        fullCaption: post.caption || '(No caption)'
      }));

      // Calculate reputation benchmark
      const avgEngagementRate = engagement.engagement.engagementRate;
      const reputationScore = Math.min(100, Math.round(
        (avgEngagementRate * 3) +
        (followerGrowth[followerGrowth.length - 1]?.followers / 1000) +
        (topPostsGlobal.length * 5)
      ));

      console.log(`   📊 Calculated reputation score: ${reputationScore}/100`);
      console.log(`   📈 7-day engagement rate: ${engagement7d.engagementRate}%`);
      console.log(`   📈 30-day engagement rate: ${engagement30d.engagementRate}%`);
      console.log(`   📈 90-day engagement rate: ${engagement90d.engagementRate}%`);

      // Filter follower growth by timeframe
      const filterGrowthByDays = (data, days) => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        return data.filter(d => new Date(d.date) >= cutoffDate);
      };
      
      const followerGrowth7d = filterGrowthByDays(followerGrowth, 7);
      const followerGrowth30d = followerGrowth; // Already fetched 30 days
      const followerGrowth90d = followerGrowth; // API limit is 30 days

      const result = {
        dataAvailable: true,
        username: engagement.username,
        accountId: engagement.accountId,
        name: engagement.name,
        companyFollowers: engagement.followers, // ✅ Add this for caching
        // Engagement scores for each timeframe
        engagementScore: {
          overall: {
            likes: engagement.engagement.likes,
            comments: engagement.engagement.comments,
            saves: engagement.engagement.saves,
            shares: engagement.engagement.shares,
            engagementRate: engagement.engagement.engagementRate,
            reach: engagement.engagement.reach,
            impressions: engagement.engagement.impressions,
            profileViews: engagement.engagement.profileViews
          },
          last7days: engagement7d,
          last30days: engagement30d,
          last90days: engagement90d
        },
        followerGrowth: followerGrowth30d, // Default to 30 days for backward compatibility
        // Follower growth by timeframe
        followerGrowthByTimeframe: {
          last7days: followerGrowth7d,
          last30days: followerGrowth30d,
          last90days: followerGrowth90d
        },
        // Top posts - globally best performing
        topPosts: formatTopPosts(topPostsGlobal),
        // Top posts by timeframe
        topPostsByTimeframe: {
          last7days: formatTopPosts(topPosts7d),
          last30days: formatTopPosts(topPosts30d),
          last90days: formatTopPosts(topPosts90d)
        },
        reputationBenchmark: {
          score: reputationScore,
          followers: engagement.followers,
          avgEngagementRate: engagement.engagement.engagementRate,
          sentiment: reputationScore > 75 ? 'Excellent' : reputationScore > 50 ? 'Good' : 'Fair'
        },
        lastUpdated: new Date().toISOString()
      };

      console.log(`✅ Comprehensive Instagram metrics compiled successfully`);
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
      'IMAGE': 'Single Image',
      'VIDEO': 'Video',
      'CAROUSEL_ALBUM': 'Carousel',
      'REELS': 'Reel'
    };
    return formatMap[type] || 'Post';
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

export default new InstagramMetricsService();
