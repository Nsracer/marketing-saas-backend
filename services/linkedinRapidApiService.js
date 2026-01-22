// LinkedIn RapidAPI Service - Company Posts & Metrics
import axios from 'axios';

class LinkedInRapidApiService {
  constructor() {
    this.rapidApiKey = process.env.RAPIDAPI_KEY;
    if (!this.rapidApiKey) {
      console.warn('⚠️ RAPIDAPI_KEY not configured');
    }
    this.baseUrl = 'https://linkedin-data-api.p.rapidapi.com';
    this.cache = new Map();
  }

  /**
   * Get company posts and calculate engagement metrics
   * @param {string} username - LinkedIn company username
   * @param {number} maxPosts - Maximum number of posts to fetch (default: 20)
   * @returns {Object} Company metrics and posts
   */
  async getCompanyMetrics(username, maxPosts = 20) {
    try {
      console.log(`📊 Fetching LinkedIn data for: ${username}`);

      // Check cache first (1 hour)
      const cacheKey = `linkedin_${username}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        console.log(`⚡ Using cached data (${cached.age} minutes old)`);
        return cached.data;
      }

      const options = {
        method: 'GET',
        url: `${this.baseUrl}/get-company-posts`,
        params: {
          username: username,
          start: '0'
        },
        headers: {
          'x-rapidapi-key': this.rapidApiKey,
          'x-rapidapi-host': 'linkedin-data-api.p.rapidapi.com'
        },
        timeout: 15000
      };

      // Fetch profile first to get followers
      let followers = 0;
      try {
        const profile = await this.getCompanyProfile(username);
        if (profile.success && profile.followers) {
          followers = profile.followers;
        }
      } catch (err) {
        console.warn(`⚠️ Could not fetch profile for ${username}, followers will be 0`);
      }

      const response = await axios.request(options);
      const data = response.data;

      if (!data.success || !data.data || data.data.length === 0) {
        console.log(`⚠️ No posts found for ${username}`);
        return {
          dataAvailable: false,
          reason: 'No posts found for this LinkedIn company',
          username: username
        };
      }

      // Process the data
      const result = this.processCompanyData(data.data, username, followers);

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
   * @param {Array} posts - Array of posts from API
   * @param {string} username - Company username
   * @param {number} followers - Company followers count
   * @returns {Object} Processed metrics
   */
  processCompanyData(posts, username, followers = 0) {
    // Limit to maxPosts
    const limitedPosts = posts.slice(0, 20);

    // Extract company info from first post
    const firstPost = limitedPosts[0];
    const companyName = firstPost.author?.company?.name || username;
    const companyUrl = firstPost.author?.company?.url || `https://www.linkedin.com/company/${username}`;
    const companyUrn = firstPost.author?.company?.urn || null;

    // Calculate engagement metrics
    let totalLikes = 0;
    let totalComments = 0;
    let totalReposts = 0;
    let totalReactions = 0;

    const processedPosts = limitedPosts.map(post => {
      const likes = post.likeCount || 0;
      const comments = post.commentsCount || 0;
      const reposts = post.repostsCount || 0;
      const reactions = post.totalReactionCount || 0;

      totalLikes += likes;
      totalComments += comments;
      totalReposts += reposts;
      totalReactions += reactions;

      return {
        text: post.text || '',
        postedAt: post.postedAt,
        postedDate: post.postedDate,
        url: post.postUrl,
        likes: likes,
        comments: comments,
        reposts: reposts,
        totalReactions: reactions,
        contentType: post.contentType,
        article: post.article || null,
        engagement: likes + comments + reposts
      };
    });

    // Sort by engagement
    processedPosts.sort((a, b) => b.engagement - a.engagement);

    // Calculate averages
    const avgLikes = totalLikes / limitedPosts.length;
    const avgComments = totalComments / limitedPosts.length;
    const avgReposts = totalReposts / limitedPosts.length;
    const totalEngagement = totalLikes + totalComments + totalReposts;
    const avgEngagement = totalEngagement / limitedPosts.length;

    // Unified Formula: ((Total Engagement / Post Count) / Total Followers) * 100
    // which is (avgEngagement / followers) * 100
    const engagementRate = followers > 0
      ? ((avgEngagement / followers) * 100).toFixed(2)
      : '0.00';

    // Use real followers instead of estimated
    const estimatedFollowers = followers;
    const estimatedReach = followers * limitedPosts.length;

    // Calculate reputation score (0-100)
    const reputationScore = Math.min(100, Math.round(
      (parseFloat(engagementRate) * 10) +
      (limitedPosts.length * 2) +
      (avgEngagement / 10) +
      20 // Base score
    ));

    console.log(`📊 Processed ${limitedPosts.length} posts for ${companyName}`);
    console.log(`   Total Engagement: ${totalEngagement}`);
    console.log(`   Avg Engagement/Post: ${avgEngagement.toFixed(1)}`);
    console.log(`   Engagement Rate: ${engagementRate}%`);
    console.log(`   Reputation Score: ${reputationScore}/100`);

    return {
      dataAvailable: true,
      companyName: companyName,
      companyUrl: companyUrl,
      companyUrn: companyUrn,
      companyFollowers: estimatedFollowers,
      username: username,
      source: 'linkedin-rapidapi',
      scrapedPostsCount: limitedPosts.length,
      metrics: {
        avgInteractions: avgEngagement
      },
      engagementScore: {
        likes: totalLikes,
        comments: totalComments,
        shares: totalReposts,
        totalReactions: totalReactions,
        engagementRate: parseFloat(engagementRate),
        reach: estimatedReach
      },
      topPosts: processedPosts.slice(0, 5),
      allPosts: processedPosts,
      reputationBenchmark: {
        score: reputationScore,
        followers: estimatedFollowers,
        avgEngagementRate: parseFloat(engagementRate),
        sentiment: reputationScore > 75 ? 'Excellent' : reputationScore > 50 ? 'Good' : 'Fair',
        avgEngagementPerPost: avgEngagement
      },
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Get company info (basic profile)
   * @param {string} username - LinkedIn company username
   * @returns {Object} Company profile info
   */
  async getCompanyProfile(username) {
    try {
      console.log(`📋 Fetching LinkedIn profile for: ${username}`);

      const options = {
        method: 'GET',
        url: `${this.baseUrl}/get-company-details`,
        params: {
          username: username
        },
        headers: {
          'x-rapidapi-key': this.rapidApiKey,
          'x-rapidapi-host': 'linkedin-data-api.p.rapidapi.com'
        },
        timeout: 10000
      };

      const response = await axios.request(options);
      const data = response.data;

      if (data.success && data.data) {
        console.log(`✅ Profile fetched for ${data.data.name}`);
        return {
          success: true,
          name: data.data.name,
          description: data.data.description,
          website: data.data.website,
          industry: data.data.industry,
          companySize: data.data.companySize,
          headquarters: data.data.headquarters,
          founded: data.data.founded,
          specialties: data.data.specialties,
          followers: data.data.followersCount
        };
      }

      return { success: false, error: 'Profile not found' };

    } catch (error) {
      console.error(`❌ Error fetching profile for ${username}:`, error.message);
      return { success: false, error: error.message };
    }
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

export default new LinkedInRapidApiService();
