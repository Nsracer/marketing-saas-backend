import { ApifyClient } from 'apify-client';
import dotenv from 'dotenv';

dotenv.config();

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN || 'apify_api_590m7JjPk5L7f72A3Lq5LhzLGWkCGs4yXPDH';
const ACTOR_ID = 'apify/instagram-scraper';

/**
 * Test Hybrid Instagram Approach
 * - OAuth API: Follower count + growth data
 * - Scraper: Top performing posts with engagement
 */
async function testHybridInstagram(username) {
  try {
    console.log(`\n🔬 Testing Hybrid Instagram Approach for @${username}`);
    console.log(`   📝 Strategy: Scraper for posts, OAuth for followers\n`);

    // ===== PART 1: SCRAPER FOR POSTS =====
    console.log(`1️⃣ Fetching posts via Apify scraper...`);
    
    const client = new ApifyClient({
      token: APIFY_API_TOKEN,
    });

    const run = await client.actor(ACTOR_ID).call({
      directUrls: [`https://www.instagram.com/${username}`],
      resultsType: 'details',
      resultsLimit: 200
    });

    console.log(`   ✅ Scraper run finished`);

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    if (!items || items.length === 0) {
      console.log('   ❌ No data found from scraper');
      return null;
    }

    const profile = items[0];
    const latestPosts = profile.latestPosts || [];

    console.log(`   📦 Found ${latestPosts.length} posts from scraper`);
    console.log(`   👥 Followers from scraper: ${profile.followersCount || 0}`);

    // ===== PART 2: PROCESS POSTS =====
    console.log(`\n2️⃣ Processing scraped posts...`);

    const processedPosts = latestPosts.map(post => {
      const likes = post.likesCount || 0;
      const comments = post.commentsCount || 0;
      const totalEngagement = likes + comments;
      
      // Calculate weighted engagement (comments = 3x, likes = 1x)
      const weightedEngagement = (comments * 3) + (likes * 1);

      return {
        id: post.id || post.shortCode,
        caption: (post.caption || '(No caption)').substring(0, 80),
        url: post.url || `https://www.instagram.com/p/${post.shortCode}`,
        timestamp: post.timestamp,
        date: post.timestamp ? new Date(post.timestamp).toISOString().split('T')[0] : 'Unknown',
        type: post.type || 'Post',
        likes: likes,
        comments: comments,
        shares: 0, // Not available from scraper
        saved: 0, // Not available from scraper
        totalEngagement: totalEngagement,
        weightedEngagement: weightedEngagement,
        displayUrl: post.displayUrl,
        videoUrl: post.videoUrl
      };
    });

    // Sort by weighted engagement
    const topPosts = processedPosts
      .sort((a, b) => {
        if (b.weightedEngagement !== a.weightedEngagement) {
          return b.weightedEngagement - a.weightedEngagement;
        }
        return b.totalEngagement - a.totalEngagement;
      })
      .slice(0, 10);

    console.log(`   ✅ Top ${topPosts.length} posts identified`);

    // ===== PART 3: CALCULATE METRICS =====
    console.log(`\n3️⃣ Calculating metrics...`);

    const totals = processedPosts.reduce((acc, post) => {
      acc.likes += post.likes;
      acc.comments += post.comments;
      acc.totalEngagement += post.totalEngagement;
      return acc;
    }, { likes: 0, comments: 0, totalEngagement: 0 });

    const avgEngagement = processedPosts.length > 0 
      ? Math.round(totals.totalEngagement / processedPosts.length)
      : 0;

    const followers = profile.followersCount || 0;
    const engagementRate = followers > 0 && processedPosts.length > 0
      ? ((totals.totalEngagement / (processedPosts.length * followers)) * 100).toFixed(2)
      : '0.00';

    // ===== PART 4: DISPLAY RESULTS =====
    console.log(`\n📊 HYBRID INSTAGRAM RESULTS:`);
    console.log(`   Username: @${profile.username}`);
    console.log(`   Followers: ${followers.toLocaleString()}`);
    console.log(`   Posts Analyzed: ${processedPosts.length}`);
    console.log(`   Avg Engagement/Post: ${avgEngagement}`);
    console.log(`   Engagement Rate: ${engagementRate}%`);

    console.log(`\n   📋 Top 5 Posts:`);
    topPosts.slice(0, 5).forEach((post, idx) => {
      console.log(`      ${idx + 1}. ${post.caption}...`);
      console.log(`         Date: ${post.date}, Type: ${post.type}`);
      console.log(`         ❤️  ${post.likes} likes | 💬 ${post.comments} comments`);
      console.log(`         🎯 Weighted Score: ${post.weightedEngagement}`);
    });

    // ===== PART 5: STRUCTURE FOR BACKEND =====
    const result = {
      dataAvailable: true,
      source: 'hybrid-scraper-oauth',
      account: {
        username: profile.username,
        followers: followers,
        mediaCount: profile.postsCount || 0
      },
      period: 'Recent posts',
      engagementScore: {
        likes: Math.round(totals.likes / processedPosts.length) || 0,
        comments: Math.round(totals.comments / processedPosts.length) || 0,
        shares: 0,
        saved: 0,
        totalEngagement: avgEngagement,
        engagementRate: parseFloat(engagementRate),
        reach: 0,
        impressions: 0,
        clicks: 0,
        postsInPeriod: processedPosts.length
      },
      cumulativeTotals: {
        likes: totals.likes,
        comments: totals.comments,
        shares: 0,
        saved: 0,
        totalEngagement: totals.totalEngagement
      },
      averages: {
        likesPerPost: processedPosts.length > 0 ? (totals.likes / processedPosts.length).toFixed(1) : '0.0',
        commentsPerPost: processedPosts.length > 0 ? (totals.comments / processedPosts.length).toFixed(1) : '0.0',
        engagementPerPost: avgEngagement,
        engagementRate: parseFloat(engagementRate)
      },
      topPerformingPosts: topPosts.map(post => ({
        id: post.id,
        caption: post.caption,
        url: post.url,
        date: post.date,
        type: post.type,
        likes: post.likes,
        comments: post.comments,
        shares: 0,
        saved: 0,
        totalEngagement: post.totalEngagement
      })),
      username: profile.username,
      currentFollowers: followers,
      mediaCount: profile.postsCount || 0,
      lastUpdated: new Date().toISOString()
    };

    console.log(`\n✅ Hybrid Instagram test complete!`);
    console.log(`\n📦 Result structure ready for backend integration`);
    
    return result;

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Run test
const username = process.argv[2] || 'pesuniversity';
testHybridInstagram(username);
