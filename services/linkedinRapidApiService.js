// LinkedIn Apify Service - Company Posts & Metrics
// Uses Apify's LinkedIn Company Post Scraper instead of RapidAPI
import { ApifyClient } from 'apify-client';

class LinkedInApifyService {
  constructor() {
    this.apifyToken = process.env.APIFY_API_KEY || process.env.APIFY_API_TOKEN;
    if (!this.apifyToken) {
      console.warn('⚠️ APIFY_API_KEY not configured');
    }
    // Actor ID from: https://apify.com/scraper-engine/linkedin-company-post-scraper
    this.actorId = 'scraper-engine/linkedin-company-post-scraper';
    this.client = new ApifyClient({
      token: this.apifyToken,
    });
    this.cache = new Map();
  }

  /**
   * Get company posts and calculate engagement metrics
   * @param {string} username - LinkedIn company username or URL
   * @param {number} maxPosts - Maximum number of posts to fetch (default: 20)
   * @returns {Object} Company metrics and posts
   */
  async getCompanyMetrics(username, maxPosts = 20) {
    try {
      console.log(`📊 Fetching LinkedIn data for: ${username} via Apify...`);

      // Check cache first (1 hour)
      const cacheKey = `linkedin_${username}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        console.log(`⚡ Using cached data (${cached.age} minutes old)`);
        return cached.data;
      }

      // Normalize the URL
      let companyUrl;
      if (username.startsWith('http')) {
        companyUrl = username;
      } else {
        companyUrl = `https://www.linkedin.com/company/${username}`;
      }

      console.log(`📝 Calling Apify actor: ${this.actorId}`);
      console.log(`   URL: ${companyUrl}`);
      console.log(`   Max posts: ${maxPosts}`);

      // Run the Apify actor (minimum 10 posts required by Apify)
      const run = await this.client.actor(this.actorId).call({
        urls: [companyUrl],
        max_posts: Math.max(10, maxPosts)  // Apify requires minimum 10
      }, {
        timeout: 120, // 2 minute timeout
        memory: 1024  // Reduce from default 4096MB to avoid hitting Apify free tier limit
      });

      // Get the results from the dataset
      const { items: posts } = await this.client.dataset(run.defaultDatasetId).listItems();

      if (!posts || posts.length === 0) {
        console.log(`⚠️ No posts found for ${username}`);
        return {
          dataAvailable: false,
          reason: 'No posts found for this LinkedIn company',
          username: username
        };
      }

      console.log(`✅ Fetched ${posts.length} posts from LinkedIn`);

      // Process the data
      const result = this.processCompanyData(posts, username);

      // Cache the result
      this.saveToCache(cacheKey, result);

      console.log(`✅ LinkedIn data fetched successfully for ${username}`);
      return result;

    } catch (error) {
      console.error(`❌ Error fetching LinkedIn data for ${username}:`, error.message);
      return {
        dataAvailable: false,
        error: error.message,
        username: username
      };
    }
  }

  /**
   * Process company posts data into metrics
   * @param {Array} posts - Array of posts from Apify
   * @param {string} username - Company username
   * @returns {Object} Processed metrics
   */
  processCompanyData(posts, username) {
    if (posts && posts.length > 0) {
      console.log('🔍 RAW APIFY POST ITEM (First Item):');
      console.log(JSON.stringify(posts[0], null, 2));
      // throw new Error('DEBUG_STOP'); // Stop here to see the log
    }

    // Limit to 20 posts max
    const limitedPosts = posts.slice(0, 20);

    // Extract company info from first post
    const firstPost = limitedPosts[0];
    const companyName = firstPost.authorFullName || firstPost.authorName || username;
    const companyUrl = firstPost.authorProfileUrl || `https://www.linkedin.com/company/${username}`;

    // Calculate engagement metrics
    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;

    const processedPosts = limitedPosts.map(post => {
      const likes = post.numLikes || 0;
      const comments = post.numComments || 0;
      const shares = post.numShares || 0;

      totalLikes += likes;
      totalComments += comments;
      totalShares += shares;

      return {
        text: post.text || '',
        postedAt: post.postedAtTimestamp || post.Company_PostedAtTimestamp,
        postedDate: post.postedAtISO || post.Company_PostedAtISO,
        url: post.url,
        likes: likes,
        comments: comments,
        reposts: shares,
        totalReactions: likes,
        contentType: post.type || 'unknown',
        images: post.images || [],
        engagement: likes + comments + shares
      };
    });

    // Sort by engagement
    processedPosts.sort((a, b) => b.engagement - a.engagement);

    // Calculate averages
    const avgLikes = totalLikes / limitedPosts.length;
    const avgComments = totalComments / limitedPosts.length;
    const avgShares = totalShares / limitedPosts.length;
    const totalEngagement = totalLikes + totalComments + totalShares;
    const avgEngagement = totalEngagement / limitedPosts.length;

    // Engagement rate - we don't have followers from this API
    // So we'll estimate based on engagement (or set to 0)
    const estimatedFollowers = 0; // Not available from post scraper
    const engagementRate = 0; // Can't calculate without followers

    // Calculate reputation score (0-100)
    const reputationScore = Math.min(100, Math.round(
      (limitedPosts.length * 2) +
      (avgEngagement / 10) +
      20 // Base score
    ));

    console.log(`📊 Processed ${limitedPosts.length} posts for ${companyName}`);
    console.log(`   Total Engagement: ${totalEngagement}`);
    console.log(`   Avg Engagement/Post: ${avgEngagement.toFixed(1)}`);
    console.log(`   Reputation Score: ${reputationScore}/100`);

    return {
      dataAvailable: true,
      companyName: companyName,
      companyUrl: companyUrl,
      companyUrn: null,
      companyFollowers: estimatedFollowers,
      username: username,
      source: 'apify-linkedin',
      scrapedPostsCount: limitedPosts.length,
      metrics: {
        avgInteractions: avgEngagement,
        avgLikes: parseFloat(avgLikes.toFixed(2)),
        avgComments: parseFloat(avgComments.toFixed(2)),
        avgShares: parseFloat(avgShares.toFixed(2))
      },
      engagementScore: {
        likes: totalLikes,
        comments: totalComments,
        shares: totalShares,
        totalReactions: totalLikes,
        engagementRate: parseFloat(engagementRate.toFixed(2)),
        reach: 0
      },
      topPosts: processedPosts.slice(0, 5),
      allPosts: processedPosts,
      reputationBenchmark: {
        score: reputationScore,
        followers: estimatedFollowers,
        avgEngagementRate: parseFloat(engagementRate.toFixed(2)),
        sentiment: reputationScore > 75 ? 'Excellent' : reputationScore > 50 ? 'Good' : 'Fair',
        avgEngagementPerPost: avgEngagement
      },
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Simple in-memory cache
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const ageMinutes = (Date.now() - cached.timestamp) / (1000 * 60);
    if (ageMinutes > 60) { // Cache for 1 hour
      this.cache.delete(key);
      return null;
    }

    return {
      data: cached.data,
      age: Math.round(ageMinutes)
    };
  }

  saveToCache(key, data) {
    this.cache.set(key, {
      data: data,
      timestamp: Date.now()
    });

    // Clean old cache entries (keep max 20)
    if (this.cache.size > 20) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
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

export default new LinkedInApifyService();
