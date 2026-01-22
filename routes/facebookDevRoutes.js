import express from 'express';
import axios from 'axios';

const router = express.Router();

/**
 * POST /api/facebook/dev/metrics
 * Get Facebook metrics using a custom access token (for dev/testing)
 */
router.post('/metrics', async (req, res) => {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        error: 'Access token is required'
      });
    }

    console.log('\n🔧 DEV MODE: Fetching Facebook metrics with custom token');

    // Get Facebook pages
    const pagesResponse = await axios.get(
      'https://graph.facebook.com/v21.0/me/accounts',
      {
        params: {
          access_token: accessToken,
          fields: 'id,name,access_token,fan_count'
        }
      }
    );

    const pages = pagesResponse.data.data || [];
    if (pages.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No Facebook pages found'
      });
    }

    const page = pages[0];
    const pageName = page.name;
    const pageId = page.id;
    const pageToken = page.access_token;
    const followers = page.fan_count || 0;

    console.log(`✅ Page: ${pageName}`);
    console.log(`   Followers: ${followers}`);

    // Fetch posts (last 25)
    console.log('📥 Fetching posts...');
    const postsResponse = await axios.get(
      `https://graph.facebook.com/v21.0/${pageId}/posts`,
      {
        params: {
          access_token: pageToken,
          fields: 'id,message,created_time,type,reactions.summary(true),comments.summary(true)',
          limit: 25
        }
      }
    );

    const posts = postsResponse.data.data || [];
    console.log(`✅ Found ${posts.length} posts`);

    // Process posts with engagement
    const postsWithEngagement = posts.map(post => {
      const likes = post.reactions?.summary?.total_count || 0;
      const comments = post.comments?.summary?.total_count || 0;
      
      // shares field might not be available
      let shares = 0;
      try {
        if (post.shares && post.shares.count) {
          shares = post.shares.count;
        }
      } catch (e) {
        shares = 0;
      }
      
      let impressions = 0;
      let reach = 0;
      if (post.insights && post.insights.data) {
        post.insights.data.forEach(insight => {
          if (insight.name === 'post_impressions' && insight.values && insight.values[0]) {
            impressions = insight.values[0].value || 0;
          }
          if (insight.name === 'post_engaged_users' && insight.values && insight.values[0]) {
            reach = insight.values[0].value || 0;
          }
        });
      }

      const totalInteractions = likes + comments + shares;

      return {
        id: post.id,
        message: post.message || '(No message)',
        createdTime: post.created_time,
        type: post.type,
        likes,
        comments,
        shares,
        impressions,
        reach,
        totalInteractions
      };
    });

    console.log(`✅ Processed ${postsWithEngagement.length} posts`);

    // Fetch follower growth (last 30 days)
    console.log('📈 Fetching follower growth...');
    const now = Math.floor(Date.now() / 1000);
    const since = now - (30 * 86400);

    let followerGrowth = [];
    try {
      const followerResponse = await axios.get(
        `https://graph.facebook.com/v21.0/${pageId}/insights`,
        {
          params: {
            access_token: pageToken,
            metric: 'page_fans',
            period: 'day',
            since,
            until: now
          }
        }
      );

      const data = followerResponse.data.data || [];
      if (data.length > 0 && data[0].values) {
        followerGrowth = data[0].values.map(v => ({
          date: v.end_time.split('T')[0],
          followers: v.value
        }));
        console.log(`✅ Got ${followerGrowth.length} days of follower data`);
      }
    } catch (err) {
      console.log('⚠️ Follower growth not available, using estimates');
      const currentFollowers = followers;
      const startFollowers = Math.floor(currentFollowers * 0.98);
      for (let i = 30; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const progress = (30 - i) / 30;
        const followerCount = Math.floor(startFollowers + (currentFollowers - startFollowers) * progress);
        followerGrowth.push({
          date: date.toISOString().split('T')[0],
          followers: followerCount
        });
      }
    }

    // Filter follower growth by timeframe
    const filterGrowthByDays = (data, days) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      return data.filter(d => new Date(d.date) >= cutoffDate);
    };
    
    const followerGrowth7d = filterGrowthByDays(followerGrowth, 7);
    const followerGrowth30d = followerGrowth;
    const followerGrowth90d = followerGrowth;

    // Helper function to filter posts by timeframe
    const filterPostsByDays = (posts, days) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      return posts.filter(post => new Date(post.createdTime) >= cutoffDate);
    };

    // Helper function to calculate engagement for filtered posts
    const calculateEngagement = (posts) => {
      const likes = posts.reduce((sum, p) => sum + p.likes, 0);
      const comments = posts.reduce((sum, p) => sum + p.comments, 0);
      const shares = posts.reduce((sum, p) => sum + p.shares, 0);
      const reach = posts.reduce((sum, p) => sum + p.reach, 0);
      const impressions = posts.reduce((sum, p) => sum + p.impressions, 0);
      const totalInteractions = likes + comments + shares;
      
      let engagementRate = 0;
      if (impressions > 0 && impressions >= totalInteractions) {
        engagementRate = parseFloat(((totalInteractions / impressions) * 100).toFixed(2));
      } else if (reach > 0 && reach >= totalInteractions) {
        engagementRate = parseFloat(((totalInteractions / reach) * 100).toFixed(2));
      } else if (followers > 0 && posts.length > 0) {
        engagementRate = parseFloat(((totalInteractions / (posts.length * followers)) * 100).toFixed(2));
      }
      
      // Cap at 10%
      engagementRate = Math.min(engagementRate, 10);
      
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
    const posts7d = filterPostsByDays(postsWithEngagement, 7);
    const posts30d = filterPostsByDays(postsWithEngagement, 30);
    const posts90d = filterPostsByDays(postsWithEngagement, 90);

    // Calculate engagement for each timeframe
    const engagement7d = calculateEngagement(posts7d);
    const engagement30d = calculateEngagement(posts30d);
    const engagement90d = calculateEngagement(posts90d);
    const overallEngagement = calculateEngagement(postsWithEngagement);

    console.log('📊 Calculating engagement metrics by timeframe...');
    console.log(`   7-day engagement rate: ${engagement7d.engagementRate}%`);
    console.log(`   30-day engagement rate: ${engagement30d.engagementRate}%`);
    console.log(`   90-day engagement rate: ${engagement90d.engagementRate}%`);

    // Get top posts by engagement (NOT filtered by creation date)
    const getTopPostsByEngagement = (posts) => {
      return posts
        .sort((a, b) => b.totalInteractions - a.totalInteractions)
        .slice(0, 4);
    };

    // Top posts based on highest engagement, not creation date
    const topPostsAll = getTopPostsByEngagement(postsWithEngagement);

    // Helper to format posts
    const formatTopPosts = (posts) => posts.map(post => ({
      format: post.type || 'Post',
      created_time: post.createdTime,
      reach: post.reach.toString(),
      likes: post.likes.toString(),
      comments: post.comments.toString(),
      shares: post.shares.toString(),
      engagement: post.totalInteractions.toString(),
      caption: post.message.substring(0, 100),
      fullCaption: post.message
    }));

    const result = {
      dataAvailable: true,
      pageName,
      pageId,
      engagementScore: {
        overall: overallEngagement,
        last7days: engagement7d,
        last30days: engagement30d,
        last90days: engagement90d
      },
      followerGrowth: followerGrowth30d,
      followerGrowthByTimeframe: {
        last7days: followerGrowth7d,
        last30days: followerGrowth30d,
        last90days: followerGrowth90d
      },
      topPosts: formatTopPosts(topPostsAll),
      topPostsByTimeframe: {
        last7days: formatTopPosts(topPostsAll),
        last30days: formatTopPosts(topPostsAll),
        last90days: formatTopPosts(topPostsAll)
      },
      reputationBenchmark: {
        score: Math.min(100, Math.round(engagement30d.engagementRate * 10)),
        followers: followers,
        avgEngagementRate: engagement30d.engagementRate,
        sentiment: engagement30d.engagementRate > 5 ? 'Excellent' : engagement30d.engagementRate > 2 ? 'Good' : 'Fair'
      },
      lastUpdated: new Date().toISOString()
    };

    console.log('✅ Dev mode metrics compiled successfully\n');

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Dev mode error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data?.error?.message || error.message
    });
  }
});

export default router;
