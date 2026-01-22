import { ApifyClient } from 'apify-client';

class InstagramScraperService {
  constructor() {
    this.apifyToken = process.env.APIFY_API_KEY || process.env.APIFY_API_TOKEN;
    if (!this.apifyToken) {
      console.warn('⚠️ APIFY_API_KEY not configured');
    }
    this.actorId = 'apify/instagram-scraper';
    this.client = new ApifyClient({
      token: this.apifyToken,
    });
  }

  /**
   * Get Instagram metrics for a competitor using Apify scraper
   * @param {string} username - Instagram username (without @)
   * @returns {Promise<Object>} Instagram metrics including followers, engagement, etc.
   */
  async getInstagramMetrics(username) {
    try {
      console.log(`📸 Fetching Instagram metrics for @${username} via Apify...`);

      // Remove @ if present
      const cleanUsername = username.replace('@', '');

      const run = await this.client.actor(this.actorId).call({
        directUrls: [`https://www.instagram.com/${cleanUsername}`],
        resultsType: 'details',
        resultsLimit: 20  // Reduced from 200 to 20 posts
      });

      console.log(`✅ Apify actor run finished for @${cleanUsername}`);

      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

      if (!items || items.length === 0) {
        console.log(`❌ No Instagram data found for @${cleanUsername}`);
        return null;
      }

      const profile = items[0];
      
      const followersCount = profile.followersCount || 0;
      const latestPosts = profile.latestPosts || [];

      console.log(`📊 Instagram @${cleanUsername}: ${followersCount} followers, ${latestPosts.length} posts`);

      if (latestPosts.length === 0) {
        console.log(`⚠️ No posts found for @${cleanUsername}`);
        return {
          username: profile.username || cleanUsername,
          followers: followersCount,
          avgLikes: 0,
          avgComments: 0,
          avgInteractions: 0,
          engagementRate: 0,
          postsCount: 0
        };
      }

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
        username: profile.username || cleanUsername,
        followers: followersCount,
        avgLikes: parseFloat(avgLikes.toFixed(2)),
        avgComments: parseFloat(avgComments.toFixed(2)),
        avgInteractions: parseFloat(avgInteractions.toFixed(2)),
        engagementRate: parseFloat(engagementRate.toFixed(3)),
        postsCount: latestPosts.length
      };

      console.log(`✅ Instagram @${cleanUsername}: ${metrics.engagementRate.toFixed(2)}% ER (${latestPosts.length} posts analyzed)`);
      return metrics;

    } catch (error) {
      console.error(`❌ Error fetching Instagram metrics for @${username}:`, error.message);
      throw error;
    }
  }
}

export default new InstagramScraperService();
