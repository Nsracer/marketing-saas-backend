import axios from 'axios';

/**
 * Competitor Intelligence Service
 * Fetches and analyzes competitor social media metrics
 */
class CompetitorIntelligenceService {
  constructor() {
    // Updated Facebook API key for competitor analysis (new working endpoint)
    // RapidAPI removed - using Apify scrapers for all social media data
  }

  /**
   * Get Facebook page metrics for competitor analysis
   * @param {string} pageUrl - Facebook page URL
   * @returns {Object} Competitor metrics
   */
  async getFacebookCompetitorMetrics(pageUrl) {
    try {
      console.log(`🔍 Analyzing competitor: ${pageUrl}`);

      // RapidAPI removed - using Apify facebook-posts-scraper instead
      const { ApifyClient } = await import('apify-client');
      const apifyClient = new ApifyClient({
        token: process.env.APIFY_API_TOKEN
      });

      console.log(`   📊 Using Apify scraper for Facebook page: ${pageUrl}`);

      const run = await apifyClient.actor('apify/facebook-posts-scraper').call({
        startUrls: [{ url: pageUrl }],
        resultsLimit: 5,
        maxPosts: 5
      }, {
        timeout: 60000
      });

      const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();

      console.log('   📦 Apify scraper completed');
      console.log('   📊 Response data:', items && items.length > 0 ? 'data found' : 'no data');

      if (items && items.length > 0) {
        const pageData = items[0];

        // Extract actual metrics from scraped data - NO HARDCODED VALUES
        // Use the first post to get follower count (assuming it's available in post metadata)
        const followers = pageData.followers || pageData.likesCount || 0;

        // Calculate total engagement from all fetched posts
        const postsCount = items.length;
        const totalEngagement = items.reduce((sum, post) => {
          return sum + (post.likes || 0) + (post.comments || 0) + (post.shares || 0);
        }, 0);

        // Unified Formula: ((Total Engagement / Post Count) / Total Followers) * 100
        const avgEngagementPerPost = postsCount > 0 ? totalEngagement / postsCount : 0;
        const engagementRate = followers > 0
          ? parseFloat(((avgEngagementPerPost / followers) * 100).toFixed(2))
          : null;

        // Use the first post's likes for display if needed, or average
        const likes = pageData.likes || 0;

        const pageName = pageData.pageName || pageData.name || 'Unknown';

        console.log(`✅ Competitor analyzed: ${pageName}`);
        console.log(`   Followers: ${followers.toLocaleString()}`);
        console.log(`   Likes: ${likes.toLocaleString()}`);
        console.log(`   Engagement Rate: ${engagementRate !== null ? engagementRate + '%' : 'N/A (no follower data)'}`);

        return {
          success: true,
          platform: 'facebook',
          data: {
            name: pageName,
            url: pageUrl,
            image: pageData.image || null,
            followers: followers,
            followersDisplay: followers.toLocaleString(),
            likes: likes,
            likesDisplay: likes.toLocaleString(),
            likes: likes,
            likesDisplay: likes.toLocaleString(),
            totalEngagement: totalEngagement,
            engagementRate: engagementRate,
            metrics: {
              followers: followers,
              avgLikes: postsCount > 0 ? items.reduce((sum, p) => sum + (p.likes || 0), 0) / postsCount : 0,
              avgComments: postsCount > 0 ? items.reduce((sum, p) => sum + (p.comments || 0), 0) / postsCount : 0,
              avgShares: postsCount > 0 ? items.reduce((sum, p) => sum + (p.shares || 0), 0) / postsCount : 0,
              avgInteractions: avgEngagementPerPost
            },
            // Post-level metrics - only include if actually scraped, null otherwise
            avgReactions: null,
            avgComments: null,
            avgShares: null,
            avgPostReach: null,
            // Additional data
            category: pageData.categories || [],
            rating: pageData.rating || null,
            description: pageData.description || null,
            website: pageData.website || null,
            creationDate: pageData.createdAt || null,
            talkingAbout: pageData.talkingAbout || 0,
            lastUpdated: new Date().toISOString(),
            dataSource: 'apify-scraper'
          }
        };
      }

      return {
        success: false,
        error: 'No data returned from API'
      };
    } catch (error) {
      console.error('❌ Error analyzing competitor:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Compare multiple competitors
   * @param {Array<string>} pageUrls - Array of Facebook page URLs
   * @returns {Object} Comparison data
   */
  async compareCompetitors(pageUrls) {
    try {
      console.log(`📊 Comparing ${pageUrls.length} competitors...`);

      const results = await Promise.all(
        pageUrls.map(url => this.getFacebookCompetitorMetrics(url))
      );

      const successfulResults = results.filter(r => r.success);

      if (successfulResults.length === 0) {
        return {
          success: false,
          error: 'Failed to fetch data for any competitor'
        };
      }

      // Sort by followers
      const sortedCompetitors = successfulResults
        .map(r => r.data)
        .sort((a, b) => b.followers - a.followers);

      // Calculate averages
      const avgFollowers = sortedCompetitors.reduce((sum, c) => sum + c.followers, 0) / sortedCompetitors.length;
      const avgEngagementRate = sortedCompetitors.reduce((sum, c) => sum + c.engagementRate, 0) / sortedCompetitors.length;

      console.log(`✅ Comparison complete`);
      console.log(`   Average Followers: ${Math.round(avgFollowers)}`);
      console.log(`   Average Engagement Rate: ${avgEngagementRate.toFixed(2)}%`);

      return {
        success: true,
        competitors: sortedCompetitors,
        benchmarks: {
          avgFollowers: Math.round(avgFollowers),
          avgEngagementRate: parseFloat(avgEngagementRate.toFixed(2)),
          topCompetitor: sortedCompetitors[0],
          totalCompetitors: sortedCompetitors.length
        },
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error comparing competitors:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Format number for display
   */
  formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }
}

export default new CompetitorIntelligenceService();
