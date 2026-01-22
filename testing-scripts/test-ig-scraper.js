import { ApifyClient } from 'apify-client';

const APIFY_API_TOKEN = 'apify_api_590m7JjPk5L7f72A3Lq5LhzLGWkCGs4yXPDH';
const ACTOR_ID = 'apify/instagram-scraper';

async function getInstagramMetrics(username) {
  try {
    console.log(`Fetching metrics for @${username}...`);

    const client = new ApifyClient({
      token: APIFY_API_TOKEN,
    });

    const run = await client.actor(ACTOR_ID).call({
      directUrls: [`https://www.instagram.com/${username}`],
      resultsType: 'details',
      resultsLimit: 200
    });

    console.log(`✅ Actor run finished`);

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    if (!items || items.length === 0) {
      console.log('No data found');
      return null;
    }

    const profile = items[0];
    const followersCount = profile.followersCount || 0;
    const latestPosts = profile.latestPosts || [];

    if (latestPosts.length === 0) {
      console.log('No posts found');
      return null;
    }

    console.log(`📦 Found ${latestPosts.length} posts`);

    let totalLikes = 0;
    let totalComments = 0;

    latestPosts.forEach(post => {
      totalLikes += post.likesCount || 0;
      totalComments += post.commentsCount || 0;
    });

    const avgLikes = totalLikes / latestPosts.length;
    const avgComments = totalComments / latestPosts.length;
    const avgInteractions = (totalLikes + totalComments) / latestPosts.length;
    const engagementRate = followersCount > 0 
      ? (avgInteractions / followersCount) * 100 
      : 0;

    const metrics = {
      username: profile.username,
      followers: followersCount,
      avgLikes: parseFloat(avgLikes.toFixed(2)),
      avgComments: parseFloat(avgComments.toFixed(2)),
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

const username = process.argv[2] || 'pesuniversity';
getInstagramMetrics(username);
