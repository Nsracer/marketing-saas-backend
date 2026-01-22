import { ApifyClient } from 'apify-client';

class FacebookScraperService {
  constructor() {
    this.apifyToken = process.env.APIFY_API_KEY || process.env.APIFY_API_TOKEN;
    if (!this.apifyToken) {
      console.warn('⚠️ APIFY_API_KEY not configured');
    }
    this.postsActorId = 'apify/facebook-posts-scraper';
    this.pageActorId = 'apify/facebook-pages-scraper';
    this.client = new ApifyClient({
      token: this.apifyToken,
    });
  }

  /**
   * Get Facebook metrics for a competitor using Apify scraper
   * @param {string} pageUrl - Facebook page URL or handle
   * @returns {Promise<Object>} Facebook metrics including followers, engagement, etc.
   */
  async getFacebookMetrics(pageUrl) {
    try {
      console.log(`📘 Fetching Facebook metrics for: ${pageUrl} via Apify...`);

      // Normalize the URL
      let normalizedUrl = pageUrl;
      if (!pageUrl.startsWith('http')) {
        // If it's just a handle, convert to full URL
        normalizedUrl = `https://www.facebook.com/${pageUrl}`;
      }

      // Step 1: Get page details (followers/likes)
      console.log('📊 Fetching Facebook page info...');
      const pageRun = await this.client.actor(this.pageActorId).call({
        startUrls: [{ url: normalizedUrl }]
      });

      const { items: pageItems } = await this.client.dataset(pageRun.defaultDatasetId).listItems();
      
      if (!pageItems || pageItems.length === 0) {
        console.log(`❌ No Facebook page data found for ${pageUrl}`);
        return null;
      }

      const pageInfo = pageItems[0];
      const followers = pageInfo.followers || pageInfo.likes || 0;

      console.log(`✅ Facebook: ${pageInfo.title} (${followers} followers)`);

      // Step 2: Get posts (engagement metrics)
      console.log('📝 Fetching Facebook posts...');
      const postsRun = await this.client.actor(this.postsActorId).call({
        startUrls: [{ url: normalizedUrl }],
        resultsLimit: 20,
        captionText: false
      });

      const { items: posts } = await this.client.dataset(postsRun.defaultDatasetId).listItems();

      if (!posts || posts.length === 0) {
        console.log(`⚠️ No posts found for ${pageUrl}`);
        return {
          pageName: pageInfo.title || pageUrl,
          url: normalizedUrl,
          followers: followers,
          likes: followers,
          avgLikes: 0,
          avgComments: 0,
          avgShares: 0,
          avgInteractions: 0,
          engagementRate: 0,
          postsCount: 0
        };
      }

      // Calculate engagement metrics
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
        pageName: pageInfo.title || pageUrl,
        url: normalizedUrl,
        followers: followers,
        likes: followers, // Facebook uses "likes" for page followers
        avgLikes: parseFloat(avgLikes.toFixed(2)),
        avgComments: parseFloat(avgComments.toFixed(2)),
        avgShares: parseFloat(avgShares.toFixed(2)),
        avgInteractions: parseFloat(avgInteractions.toFixed(2)),
        engagementRate: parseFloat(engagementRate.toFixed(3)),
        postsCount: posts.length
      };

      console.log(`✅ Facebook metrics for ${pageInfo.title}:`, metrics);
      return metrics;

    } catch (error) {
      console.error(`❌ Error fetching Facebook metrics for ${pageUrl}:`, error.message);
      throw error;
    }
  }
}

export default new FacebookScraperService();
