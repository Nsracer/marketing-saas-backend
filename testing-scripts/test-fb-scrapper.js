import { ApifyClient } from 'apify-client';

const APIFY_API_TOKEN = 'apify_api_590m7JjPk5L7f72A3Lq5LhzLGWkCGs4yXPDH';
const POSTS_ACTOR_ID = 'apify/facebook-posts-scraper';
const PAGE_ACTOR_ID = 'apify/facebook-pages-scraper';

async function getFacebookMetrics(pageUrl) {
  try {
    console.log(`Fetching Facebook metrics for: ${pageUrl}...`);

    const client = new ApifyClient({
      token: APIFY_API_TOKEN,
    });

    // Step 1: Get page details (followers)
    console.log('\n📊 Fetching page info...');
    const pageRun = await client.actor(PAGE_ACTOR_ID).call({
      startUrls: [{ url: pageUrl }]
    });

    const { items: pageItems } = await client.dataset(pageRun.defaultDatasetId).listItems();
    const pageInfo = pageItems[0];
    const followers = pageInfo.followers || pageInfo.likes || 0;

    console.log(`✅ Page: ${pageInfo.title}`);
    console.log(`👥 Followers: ${followers}`);

    // Step 2: Get posts (engagement)
    console.log('\n📝 Fetching posts...');
    const postsRun = await client.actor(POSTS_ACTOR_ID).call({
      startUrls: [{ url: pageUrl }],
      resultsLimit: 20,
      captionText: false
    });

    const { items: posts } = await client.dataset(postsRun.defaultDatasetId).listItems();

    if (!posts || posts.length === 0) {
      console.log('No posts found');
      return null;
    }

    console.log(`📦 Found ${posts.length} posts`);

    // Calculate metrics
    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;

    posts.forEach(post => {
      totalLikes += post.likes || 0;
      totalComments += post.comments || 0;
      totalShares += post.shares || 0;
    });

    const avgLikes = totalLikes / posts.length;
    const avgComments = totalComments / posts.length;
    const avgShares = totalShares / posts.length;
    const avgInteractions = (totalLikes + totalComments + totalShares) / posts.length;
    const engagementRate = followers > 0 
      ? (avgInteractions / followers) * 100 
      : 0;

    const metrics = {
      pageName: pageInfo.title,
      followers: followers,
      avgLikes: parseFloat(avgLikes.toFixed(2)),
      avgComments: parseFloat(avgComments.toFixed(2)),
      avgShares: parseFloat(avgShares.toFixed(2)),
      avgInteractions: parseFloat(avgInteractions.toFixed(2)),
      engagementRate: parseFloat(engagementRate.toFixed(3))
    };

    console.log('\n✅ Metrics:', metrics);
    return metrics;

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

// Get page URL from command line or use default
const pageUrl = process.argv[2] || 'https://www.facebook.com/pesuniversity';
getFacebookMetrics(pageUrl);
