import { ApifyClient } from 'apify-client';
import dotenv from 'dotenv';

dotenv.config();

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN || 'apify_api_590m7JjPk5L7f72A3Lq5LhzLGWkCGs4yXPDH';
const POSTS_ACTOR_ID = 'apify/facebook-posts-scraper';
const PAGE_ACTOR_ID = 'apify/facebook-pages-scraper';

/**
 * Test Hybrid Facebook Approach
 * - OAuth API: Follower count + growth data
 * - Scraper: Top performing posts with engagement
 */
async function testHybridFacebook(pageUrl) {
  try {
    console.log(`\n🔬 Testing Hybrid Facebook Approach`);
    console.log(`   📝 Strategy: Scraper for posts, OAuth for followers`);
    console.log(`   🔗 Page: ${pageUrl}\n`);

    const client = new ApifyClient({
      token: APIFY_API_TOKEN,
    });

    // ===== PART 1: GET PAGE INFO (FOLLOWERS) =====
    console.log(`1️⃣ Fetching page info via scraper...`);
    
    const pageRun = await client.actor(PAGE_ACTOR_ID).call({
      startUrls: [{ url: pageUrl }]
    });

    const { items: pageItems } = await client.dataset(pageRun.defaultDatasetId).listItems();
    const pageInfo = pageItems[0];
    const followers = pageInfo.followers || pageInfo.likes || 0;

    console.log(`   ✅ Page: ${pageInfo.title}`);
    console.log(`   👥 Followers: ${followers.toLocaleString()}`);

    // ===== PART 2: GET POSTS (ENGAGEMENT) =====
    console.log(`\n2️⃣ Fetching posts via scraper...`);
    
    const postsRun = await client.actor(POSTS_ACTOR_ID).call({
      startUrls: [{ url: pageUrl }],
      resultsLimit: 50,
      captionText: false
    });

    const { items: posts } = await client.dataset(postsRun.defaultDatasetId).listItems();

    if (!posts || posts.length === 0) {
      console.log('   ❌ No posts found from scraper');
      return null;
    }

    console.log(`   📦 Found ${posts.length} posts from scraper`);

    // ===== PART 3: PROCESS POSTS =====
    console.log(`\n3️⃣ Processing scraped posts...`);

    const processedPosts = posts.map(post => {
      const likes = post.likes || 0;
      const comments = post.comments || 0;
      const shares = post.shares || 0;
      const totalEngagement = likes + comments + shares;
      
      // Calculate weighted engagement (comments = 3x, likes = 1x, shares = 2x)
      const weightedEngagement = (comments * 3) + (likes * 1) + (shares * 2);

      return {
        id: post.postId || post.url,
        message: (post.text || '(No message)').substring(0, 100),
        url: post.postUrl || post.url,
        timestamp: post.time,
        date: post.time ? new Date(post.time).toISOString().split('T')[0] : 'Unknown',
        format: 'Post',
        likes: likes,
        comments: comments,
        shares: shares,
        totalEngagement: totalEngagement,
        weightedEngagement: weightedEngagement,
        reach: 0, // Not available from scraper
        impressions: 0 // Not available from scraper
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

    // ===== PART 4: CALCULATE METRICS =====
    console.log(`\n4️⃣ Calculating metrics...`);

    const totals = processedPosts.reduce((acc, post) => {
      acc.likes += post.likes;
      acc.comments += post.comments;
      acc.shares += post.shares;
      acc.totalEngagement += post.totalEngagement;
      return acc;
    }, { likes: 0, comments: 0, shares: 0, totalEngagement: 0 });

    const avgEngagement = processedPosts.length > 0 
      ? Math.round(totals.totalEngagement / processedPosts.length)
      : 0;

    const engagementRate = followers > 0 && processedPosts.length > 0
      ? ((totals.totalEngagement / (processedPosts.length * followers)) * 100).toFixed(2)
      : '0.00';

    // ===== PART 5: DISPLAY RESULTS =====
    console.log(`\n📊 HYBRID FACEBOOK RESULTS:`);
    console.log(`   Page: ${pageInfo.title}`);
    console.log(`   Followers: ${followers.toLocaleString()}`);
    console.log(`   Posts Analyzed: ${processedPosts.length}`);
    console.log(`   Avg Engagement/Post: ${avgEngagement}`);
    console.log(`   Engagement Rate: ${engagementRate}%`);

    console.log(`\n   📋 Top 5 Posts:`);
    topPosts.slice(0, 5).forEach((post, idx) => {
      console.log(`      ${idx + 1}. ${post.message}...`);
      console.log(`         Date: ${post.date}`);
      console.log(`         ❤️  ${post.likes} likes | 💬 ${post.comments} comments | 🔁 ${post.shares} shares`);
      console.log(`         🎯 Weighted Score: ${post.weightedEngagement}`);
    });

    // ===== PART 6: STRUCTURE FOR BACKEND =====
    const result = {
      dataAvailable: true,
      source: 'hybrid-scraper-oauth',
      pageName: pageInfo.title,
      pageId: pageInfo.pageId || null,
      pageUsername: pageInfo.username || null,
      currentFollowers: followers,
      period: 'Recent posts',
      engagementScore: {
        likes: Math.round(totals.likes / processedPosts.length) || 0,
        comments: Math.round(totals.comments / processedPosts.length) || 0,
        shares: Math.round(totals.shares / processedPosts.length) || 0,
        engagementRate: parseFloat(engagementRate),
        reach: 0
      },
      cumulativeTotals: {
        likes: totals.likes,
        comments: totals.comments,
        shares: totals.shares,
        totalEngagement: totals.totalEngagement
      },
      averages: {
        likesPerPost: processedPosts.length > 0 ? (totals.likes / processedPosts.length).toFixed(1) : '0.0',
        commentsPerPost: processedPosts.length > 0 ? (totals.comments / processedPosts.length).toFixed(1) : '0.0',
        sharesPerPost: processedPosts.length > 0 ? (totals.shares / processedPosts.length).toFixed(1) : '0.0',
        engagementPerPost: avgEngagement,
        engagementRate: parseFloat(engagementRate)
      },
      topPosts: topPosts.map(post => ({
        format: post.format,
        message: post.message,
        url: post.url,
        createdDate: post.date,
        likes: post.likes,
        comments: post.comments,
        shares: post.shares,
        reach: 0,
        impressions: 0,
        engagementScore: 0
      })),
      reputationBenchmark: {
        score: Math.min(100, Math.round(
          (parseFloat(engagementRate) * 10) +
          (followers / 100) +
          (topPosts.length * 2) +
          20
        )),
        followers: followers,
        avgEngagementRate: parseFloat(engagementRate),
        sentiment: parseFloat(engagementRate) > 1 ? 'Good' : 'Fair'
      },
      lastUpdated: new Date().toISOString()
    };

    console.log(`\n✅ Hybrid Facebook test complete!`);
    console.log(`\n📦 Result structure ready for backend integration`);
    
    return result;

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Run test
const pageUrl = process.argv[2] || 'https://www.facebook.com/pesuniversity';
testHybridFacebook(pageUrl);
