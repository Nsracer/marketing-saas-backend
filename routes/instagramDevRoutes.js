import express from 'express';
import axios from 'axios';

const router = express.Router();

/**
 * POST /api/instagram/dev/metrics
 * Get Instagram metrics using a custom access token (for dev/testing)
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

    console.log('\n🔧 DEV MODE: Fetching Instagram metrics with custom token');

    // Get Instagram account
    const pagesResponse = await axios.get(
      'https://graph.facebook.com/v24.0/me/accounts',
      {
        params: {
          access_token: accessToken,
          fields: 'id,name,access_token,instagram_business_account{id,username,name,followers_count,follows_count,media_count}'
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
    const igAccount = page.instagram_business_account;

    if (!igAccount) {
      return res.status(404).json({
        success: false,
        error: 'No Instagram Business Account connected to this Facebook Page'
      });
    }

    console.log(`✅ Account: @${igAccount.username}`);
    console.log(`   Followers: ${igAccount.followers_count}`);
    console.log(`   Posts: ${igAccount.media_count}`);

    const pageToken = page.access_token;
    const igId = igAccount.id;

    // Fetch media (last 100 posts to get better top performing posts)
    console.log('📥 Fetching posts...');
    const mediaResponse = await axios.get(
      `https://graph.facebook.com/v24.0/${igId}/media`,
      {
        params: {
          access_token: pageToken,
          fields: 'id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count,media_product_type',
          limit: 100
        }
      }
    );

    const media = mediaResponse.data.data || [];
    console.log(`✅ Found ${media.length} posts`);

    // Fetch insights for each post
    console.log('⏳ Fetching post insights...');
    const postsWithInsights = await Promise.all(
      media.map(async (post, index) => {
        try {
          const insightsResponse = await axios.get(
            `https://graph.facebook.com/v24.0/${post.id}/insights`,
            {
              params: {
                access_token: pageToken,
                metric: 'likes,comments,shares,saved,total_interactions'
              }
            }
          );

          const insights = insightsResponse.data.data || [];
          const metrics = {};
          insights.forEach(m => {
            metrics[m.name] = m.values[0]?.value || 0;
          });

          const likes = metrics.likes || post.like_count || 0;
          const comments = metrics.comments || post.comments_count || 0;
          const shares = metrics.shares || 0;
          const saved = metrics.saved || 0;
          const totalInteractions = metrics.total_interactions || (likes + comments + shares + saved);

          if ((index + 1) % 10 === 0) {
            console.log(`   ✓ Processed ${index + 1}/${media.length} posts`);
          }

          return {
            id: post.id,
            caption: post.caption || '(No caption)',
            mediaType: post.media_type,
            mediaProductType: post.media_product_type,
            timestamp: post.timestamp,
            url: post.permalink,
            likes,
            comments,
            shares,
            saved,
            totalInteractions
          };
        } catch (err) {
          return {
            id: post.id,
            caption: post.caption || '(No caption)',
            mediaType: post.media_type,
            mediaProductType: post.media_product_type,
            timestamp: post.timestamp,
            url: post.permalink,
            likes: post.like_count || 0,
            comments: post.comments_count || 0,
            shares: 0,
            saved: 0,
            totalInteractions: (post.like_count || 0) + (post.comments_count || 0)
          };
        }
      })
    );

    console.log(`✅ Processed ${postsWithInsights.length} posts`);

    // Fetch follower growth (last 30 days) - USING SAME LOGIC AS NON-DEV MODE
    console.log('📈 Fetching follower growth...');
    const now = Math.floor(Date.now() / 1000);
    const since = now - (30 * 86400);

    let followerGrowth = [];
    let followerGrowth7d = [];
    let followerGrowth30d = [];
    let followerGrowth90d = [];
    
    try {
      const followerResponse = await axios.get(
        `https://graph.facebook.com/v24.0/${igId}/insights`,
        {
          params: {
            access_token: pageToken,
            metric: 'follower_count',
            period: 'day',
            since,
            until: now
          }
        }
      );

      const data = followerResponse.data.data || [];
      console.log(`   ✅ API Response received`);

      if (data.length > 0 && data[0].values && data[0].values.length > 0) {
        const dailyChanges = data[0].values;
        console.log(`   📊 Got ${dailyChanges.length} data points from API`);
        
        // Instagram API returns DAILY CHANGES, not cumulative counts
        // Convert to cumulative counts by working backwards from current followers
        const currentFollowers = igAccount.followers_count;
        
        // Sum all daily changes to get total growth
        const totalDailyChanges = dailyChanges.reduce((sum, v) => sum + v.value, 0);
        console.log(`   📊 Total daily changes: ${totalDailyChanges}`);
        console.log(`   📊 Current followers: ${currentFollowers}`);
        
        // Calculate starting follower count
        const startingFollowers = currentFollowers - totalDailyChanges;
        console.log(`   📊 Starting followers: ${startingFollowers}`);
        
        // Convert daily changes to cumulative follower counts
        let cumulativeFollowers = startingFollowers;
        
        for (const dayData of dailyChanges) {
          cumulativeFollowers += dayData.value; // Add daily change to cumulative
          followerGrowth.push({
            date: dayData.end_time.split('T')[0],
            followers: Math.max(0, cumulativeFollowers) // Never go below 0
          });
        }
        
        console.log(`✅ Got ${followerGrowth.length} days of follower data`);
        console.log(`   First day: ${followerGrowth[0]?.followers} followers`);
        console.log(`   Last day: ${followerGrowth[followerGrowth.length - 1]?.followers} followers`);
        
        // Filter for different timeframes
        const filterByDays = (data, days) => {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - days);
          return data.filter(d => new Date(d.date) >= cutoffDate);
        };
        
        followerGrowth7d = filterByDays(followerGrowth, 7);
        followerGrowth30d = followerGrowth; // Already 30 days
        followerGrowth90d = followerGrowth; // API only gives 30 days max
        
        console.log(`   📊 7-day data: ${followerGrowth7d.length} days`);
        console.log(`   📊 30-day data: ${followerGrowth30d.length} days`);
        console.log(`   📊 90-day data: ${followerGrowth90d.length} days`);
      }
    } catch (err) {
      console.log('⚠️ Follower growth API error:', err.response?.data || err.message);
      console.log('   Using fallback estimated data');
      
      // Fallback: Generate estimated data based on current followers
      const currentFollowers = igAccount.followers_count;
      const startFollowers = Math.floor(currentFollowers * 0.98);
      for (let i = 30; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const progress = (30 - i) / 30;
        const followers = Math.floor(startFollowers + (currentFollowers - startFollowers) * progress);
        followerGrowth.push({
          date: date.toISOString().split('T')[0],
          followers
        });
      }
      
      // Filter fallback data for timeframes
      const filterByDays = (data, days) => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        return data.filter(d => new Date(d.date) >= cutoffDate);
      };
      
      followerGrowth7d = filterByDays(followerGrowth, 7);
      followerGrowth30d = followerGrowth;
      followerGrowth90d = followerGrowth;
    }

    // Helper function to get top posts by posting date in timeframe
    const getTopPostsByTimeframe = (posts, days) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      // Filter posts created within the timeframe AND have engagement
      const filtered = posts.filter(post => {
        const postDate = new Date(post.timestamp);
        return postDate >= cutoffDate && post.totalInteractions > 0;
      });
      
      return filtered
        .sort((a, b) => b.totalInteractions - a.totalInteractions)
        .slice(0, 4);
    };

    // Helper function to calculate engagement metrics for posts in timeframe
    const getMetricsByTimeframe = (posts, days) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      // DEBUG: Log post dates for 7-day check
      if (days === 7) {
        console.log(`\n🔍 Instagram Post Date Analysis (${days} days):`);
        console.log(`   Cutoff date: ${cutoffDate.toISOString()}`);
        console.log(`   Total posts fetched: ${posts.length}`);
        if (posts.length > 0) {
          const oldestPost = posts[posts.length - 1];
          const newestPost = posts[0];
          console.log(`   Newest post: ${newestPost.timestamp} (${Math.floor((Date.now() - new Date(newestPost.timestamp).getTime()) / (24 * 60 * 60 * 1000))} days ago)`);
          console.log(`   Oldest post: ${oldestPost.timestamp} (${Math.floor((Date.now() - new Date(oldestPost.timestamp).getTime()) / (24 * 60 * 60 * 1000))} days ago)`);
        }
      }
      
      // Filter posts created within the timeframe
      const filtered = posts.filter(post => {
        const postDate = new Date(post.timestamp);
        return postDate >= cutoffDate;
      });
      
      if (days === 7) {
        console.log(`   Posts in last ${days} days: ${filtered.length}`);
      }
      
      const totals = filtered.reduce((acc, post) => {
        acc.likes += post.likes;
        acc.comments += post.comments;
        acc.shares += post.shares;
        acc.saved += post.saved;
        acc.totalInteractions += post.totalInteractions;
        return acc;
      }, { likes: 0, comments: 0, shares: 0, saved: 0, totalInteractions: 0 });

      const engagementRate = igAccount.followers_count > 0 && filtered.length > 0
        ? ((totals.totalInteractions / (filtered.length * igAccount.followers_count)) * 100).toFixed(2)
        : 0;

      return {
        likes: totals.likes,
        comments: totals.comments,
        saves: totals.saved,
        shares: totals.shares,
        engagementRate: parseFloat(engagementRate),
        reach: 0,
        impressions: 0,
        profileViews: 0,
        postsInPeriod: filtered.length,
        totalInteractions: totals.totalInteractions
      };
    };

    console.log('📊 Calculating engagement metrics by timeframe...');

    // Calculate metrics for different timeframes
    const engagement7d = getMetricsByTimeframe(postsWithInsights, 7);
    const engagement30d = getMetricsByTimeframe(postsWithInsights, 30);
    const engagement90d = getMetricsByTimeframe(postsWithInsights, 90);
    
    // Overall metrics (all posts)
    const totalEngagement = postsWithInsights.reduce((acc, post) => {
      acc.likes += post.likes;
      acc.comments += post.comments;
      acc.shares += post.shares;
      acc.saved += post.saved;
      acc.totalInteractions += post.totalInteractions;
      return acc;
    }, { likes: 0, comments: 0, shares: 0, saved: 0, totalInteractions: 0 });

    const overallEngagementRate = igAccount.followers_count > 0
      ? ((totalEngagement.totalInteractions / (postsWithInsights.length * igAccount.followers_count)) * 100).toFixed(2)
      : 0;

    console.log(`   7-day engagement rate: ${engagement7d.engagementRate}%`);
    console.log(`   30-day engagement rate: ${engagement30d.engagementRate}%`);
    console.log(`   90-day engagement rate: ${engagement90d.engagementRate}%`);

    // Get top posts by timeframe (ignore timeframe - show globally best posts)
    // These are the posts with maximum engagement across all time
    const topPostsGlobal = postsWithInsights
      .sort((a, b) => b.totalInteractions - a.totalInteractions)
      .slice(0, 4);

    const topPosts7d = getTopPostsByTimeframe(postsWithInsights, 7);
    const topPosts30d = getTopPostsByTimeframe(postsWithInsights, 30);
    const topPosts90d = getTopPostsByTimeframe(postsWithInsights, 90);

    // Helper to format posts
    const formatTopPosts = (posts) => posts.map(post => ({
      format: post.mediaProductType || post.mediaType,
      timestamp: post.timestamp,
      reach: '0',
      likes: post.likes.toString(),
      comments: post.comments.toString(),
      shares: post.shares.toString(),
      saves: post.saved.toString(),
      engagement: post.totalInteractions.toString(),
      caption: post.caption.substring(0, 100),
      url: post.url,
      fullCaption: post.caption
    }));

    const result = {
      dataAvailable: true,
      username: igAccount.username,
      accountId: igAccount.id,
      name: igAccount.name,
      // Engagement scores for each timeframe
      engagementScore: {
        overall: {
          likes: totalEngagement.likes,
          comments: totalEngagement.comments,
          saves: totalEngagement.saved,
          shares: totalEngagement.shares,
          engagementRate: parseFloat(overallEngagementRate),
          reach: 0,
          impressions: 0,
          profileViews: 0
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
        score: Math.min(100, Math.round(parseFloat(overallEngagementRate) * 10)),
        followers: igAccount.followers_count,
        avgEngagementRate: parseFloat(overallEngagementRate),
        sentiment: parseFloat(overallEngagementRate) > 5 ? 'Excellent' : parseFloat(overallEngagementRate) > 2 ? 'Good' : 'Fair'
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
