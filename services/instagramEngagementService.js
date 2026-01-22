// services/instagramEngagementService.js - Instagram Social Media Analytics
import axios from 'axios';

class InstagramEngagementService {
  constructor() {
    this.rapidApiKey = process.env.RAPIDAPI_KEY;
    if (!this.rapidApiKey) {
      console.warn('⚠️ RAPIDAPI_KEY not configured');
    }
    this.baseUrl = 'https://instagram-statistics-api.p.rapidapi.com';
  }

  /**
   * Get Instagram Creator ID (CID) from username or profile URL
   * @param {string} usernameOrUrl - Instagram username or full profile URL
   * @returns {Object} Account information including CID
   */
  async getInstagramCID(usernameOrUrl) {
    try {
      // Extract username from URL if full URL provided
      let username = usernameOrUrl;
      if (usernameOrUrl.includes('instagram.com/')) {
        const match = usernameOrUrl.match(/instagram\.com\/([^\/\?]+)/);
        username = match ? match[1] : usernameOrUrl;
      }

      // Remove @ if present
      username = username.replace('@', '');

      console.log(`📸 Fetching Instagram CID for: ${username}`);

      // Construct Instagram URL
      const instagramUrl = `https://www.instagram.com/${username}/`;
      const url = `${this.baseUrl}/community?url=${encodeURIComponent(instagramUrl)}`;

      const options = {
        method: 'GET',
        headers: {
          'x-rapidapi-key': this.rapidApiKey,
          'x-rapidapi-host': 'instagram-statistics-api.p.rapidapi.com'
        },
        timeout: 10000 // Reduced from 15000
      };

      // Add retry logic for 503 errors
      let response;
      const maxRetries = 2;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          response = await axios(url, options);
          break;
        } catch (err) {
          if (attempt < maxRetries && (err.response?.status === 503 || err.code === 'ECONNABORTED')) {
            console.log(`   ⚠️ Attempt ${attempt} failed (${err.response?.status || err.code}), retrying...`);
            await new Promise(r => setTimeout(r, 1500)); // Wait 1.5s
            continue;
          }
          throw err;
        }
      }

      const data = response.data;

      if (data.meta.code !== 200 || !data.data.cid) {
        throw new Error('Instagram account not found or CID not available');
      }

      console.log(`✅ Found Instagram account: ${data.data.name} (@${data.data.screenName})`);
      console.log(`   CID: ${data.data.cid}`);
      console.log(`   Followers: ${data.data.usersCount.toLocaleString()}`);

      return {
        success: true,
        cid: data.data.cid,
        username: data.data.screenName,
        name: data.data.name,
        followers: data.data.usersCount,
        verified: data.data.verified,
        avgEngagementRate: data.data.avgER,
        avgInteractions: data.data.avgInteractions,
        profileImage: data.data.image,
        bio: data.data.description,
        categories: data.data.categories || [],
        qualityScore: data.data.qualityScore
      };
    } catch (error) {
      console.error(`❌ Error fetching Instagram CID for ${usernameOrUrl}:`, error.message);
      return {
        success: false,
        error: error.message,
        username: usernameOrUrl
      };
    }
  }

  /**
   * Get Instagram posting activity and engagement statistics
   * @param {string} cid - Creator ID (format: INST:xxxxxxxxx)
   * @param {number} followers - Follower count (optional, for ER calculation)
   * @returns {Object} Activity and engagement metrics
   */
  async getInstagramActivity(cid, followers = 0) {
    try {
      console.log(`📊 Fetching Instagram activity for CID: ${cid}`);

      const url = `${this.baseUrl}/statistics/activity?cid=${encodeURIComponent(cid)}`;

      const options = {
        method: 'GET',
        headers: {
          'x-rapidapi-key': this.rapidApiKey,
          'x-rapidapi-host': 'instagram-statistics-api.p.rapidapi.com'
        },
        timeout: 15000
      };

      const response = await axios(url, options);
      const data = response.data;

      if (data.meta.code !== 200 || !data.data) {
        throw new Error('Activity data not available');
      }

      console.log(`✅ Instagram activity data received (${data.data.length} data points)`);

      // Process activity data
      return this.processActivityData(data.data, followers);
    } catch (error) {
      console.error(`❌ Error fetching Instagram activity for ${cid}:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process Instagram activity data into meaningful metrics
   */
  processActivityData(activityData, followers = 0) {
    try {
      // Activity data format: { time: "1_0", interactions: 61345.52, likes: 60982.24, comments: 363.27 }
      // Time format: "DAY_HOUR" where DAY: 1=Mon, 2=Tue, etc. and HOUR: 0-23

      // Calculate aggregated metrics
      const totalInteractions = activityData.reduce((sum, item) => sum + item.interactions, 0);
      const totalLikes = activityData.reduce((sum, item) => sum + item.likes, 0);
      const totalComments = activityData.reduce((sum, item) => sum + item.comments, 0);

      const avgInteractions = totalInteractions / activityData.length;
      const avgLikes = totalLikes / activityData.length;
      const avgComments = totalComments / activityData.length;

      // Find peak posting times
      const sortedByInteractions = [...activityData].sort((a, b) => b.interactions - a.interactions);
      const top5Times = sortedByInteractions.slice(0, 5).map(item => ({
        time: this.formatTime(item.time),
        interactions: Math.round(item.interactions),
        likes: Math.round(item.likes),
        comments: Math.round(item.comments)
      }));

      // Group by day of week
      const byDay = this.groupByDay(activityData);

      // Group by hour of day
      const byHour = this.groupByHour(activityData);

      // Find best posting days
      const bestDays = Object.entries(byDay)
        .sort((a, b) => b[1].avgInteractions - a[1].avgInteractions)
        .slice(0, 3)
        .map(([day, stats]) => ({
          day,
          avgInteractions: Math.round(stats.avgInteractions),
          avgLikes: Math.round(stats.avgLikes),
          avgComments: Math.round(stats.avgComments)
        }));

      // Find best posting hours
      const bestHours = Object.entries(byHour)
        .sort((a, b) => b[1].avgInteractions - a[1].avgInteractions)
        .slice(0, 3)
        .map(([hour, stats]) => ({
          hour: this.formatHour(hour),
          avgInteractions: Math.round(stats.avgInteractions),
          avgLikes: Math.round(stats.avgLikes),
          avgComments: Math.round(stats.avgComments)
        }));

      // Calculate engagement consistency (coefficient of variation)
      const stdDev = this.calculateStdDev(activityData.map(d => d.interactions));
      const coefficientOfVariation = (stdDev / avgInteractions) * 100;
      const consistency = coefficientOfVariation < 50 ? 'high' : coefficientOfVariation < 100 ? 'medium' : 'low';

      return {
        success: true,
        summary: {
          avgInteractionsPerPost: Math.round(avgInteractions),
          avgLikesPerPost: Math.round(avgLikes),
          avgCommentsPerPost: Math.round(avgComments),
          avgInteractionsPerPost: Math.round(avgInteractions),
          avgLikesPerPost: Math.round(avgLikes),
          avgCommentsPerPost: Math.round(avgComments),
          // Unified Formula: ((Avg Interactions / Followers) * 100)
          engagementRate: followers > 0
            ? ((avgInteractions / followers) * 100).toFixed(2) + '%'
            : '0.00%',
          consistency: consistency,
          totalDataPoints: activityData.length
        },
        peakTimes: {
          bestDays: bestDays,
          bestHours: bestHours,
          top5PostingTimes: top5Times
        },
        activityByDay: byDay,
        activityByHour: byHour,
        rawData: activityData.slice(0, 168) // Last week (7 days * 24 hours)
      };
    } catch (error) {
      console.error('Error processing activity data:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get complete Instagram engagement metrics for a profile
   */
  async getCompleteEngagementMetrics(usernameOrUrl) {
    try {
      console.log(`\n📱 Starting Instagram engagement analysis for: ${usernameOrUrl}`);

      // Step 1: Get CID and basic profile info
      const profileData = await this.getInstagramCID(usernameOrUrl);

      if (!profileData.success || !profileData.cid) {
        return {
          success: false,
          error: 'Failed to fetch Instagram profile',
          details: profileData.error
        };
      }

      // Step 2: Get activity and engagement data
      const activityData = await this.getInstagramActivity(profileData.cid, profileData.followers);

      if (!activityData.success) {
        return {
          success: true, // Profile found, but activity data unavailable
          profile: profileData,
          activity: null,
          message: 'Profile found but activity data unavailable'
        };
      }

      // Combine both datasets
      return {
        success: true,
        profile: {
          username: profileData.username,
          name: profileData.name,
          followers: profileData.followers,
          verified: profileData.verified,
          avgEngagementRate: profileData.avgEngagementRate,
          avgInteractions: profileData.avgInteractions,
          qualityScore: profileData.qualityScore,
          categories: profileData.categories,
          bio: profileData.bio
        },
        engagement: {
          summary: activityData.summary,
          peakTimes: activityData.peakTimes,
          postingPattern: {
            bestDays: activityData.peakTimes.bestDays,
            bestHours: activityData.peakTimes.bestHours
          }
        },
        rawActivity: activityData.rawData,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error in getCompleteEngagementMetrics:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Compare Instagram engagement between two accounts
   */
  async compareInstagramEngagement(username1, username2) {
    console.log(`\n🔄 Comparing Instagram engagement: ${username1} vs ${username2}`);

    const [data1, data2] = await Promise.all([
      this.getCompleteEngagementMetrics(username1),
      this.getCompleteEngagementMetrics(username2)
    ]);

    if (!data1.success || !data2.success) {
      return {
        success: false,
        error: 'Failed to fetch data for one or both accounts',
        account1: data1,
        account2: data2
      };
    }

    // Compare metrics
    const comparison = {
      followers: {
        account1: data1.profile.followers,
        account2: data2.profile.followers,
        winner: data1.profile.followers > data2.profile.followers ? username1 : username2,
        difference: Math.abs(data1.profile.followers - data2.profile.followers)
      },
      avgInteractions: {
        account1: data1.engagement.summary.avgInteractionsPerPost,
        account2: data2.engagement.summary.avgInteractionsPerPost,
        winner: data1.engagement.summary.avgInteractionsPerPost > data2.engagement.summary.avgInteractionsPerPost ? username1 : username2,
        difference: Math.abs(data1.engagement.summary.avgInteractionsPerPost - data2.engagement.summary.avgInteractionsPerPost)
      },
      engagementRate: {
        account1: data1.profile.avgEngagementRate,
        account2: data2.profile.avgEngagementRate,
        winner: data1.profile.avgEngagementRate > data2.profile.avgEngagementRate ? username1 : username2
      },
      consistency: {
        account1: data1.engagement.summary.consistency,
        account2: data2.engagement.summary.consistency
      }
    };

    return {
      success: true,
      account1: data1,
      account2: data2,
      comparison: comparison
    };
  }

  // Helper methods
  formatTime(timeStr) {
    const [day, hour] = timeStr.split('_');
    const days = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const hourFormatted = hour.padStart(2, '0') + ':00';
    return `${days[day]} ${hourFormatted}`;
  }

  formatHour(hour) {
    return hour.padStart(2, '0') + ':00';
  }

  groupByDay(data) {
    const grouped = {};
    data.forEach(item => {
      const [day] = item.time.split('_');
      if (!grouped[day]) {
        grouped[day] = { interactions: [], likes: [], comments: [] };
      }
      grouped[day].interactions.push(item.interactions);
      grouped[day].likes.push(item.likes);
      grouped[day].comments.push(item.comments);
    });

    const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const result = {};
    Object.entries(grouped).forEach(([day, values]) => {
      result[days[day]] = {
        avgInteractions: values.interactions.reduce((a, b) => a + b, 0) / values.interactions.length,
        avgLikes: values.likes.reduce((a, b) => a + b, 0) / values.likes.length,
        avgComments: values.comments.reduce((a, b) => a + b, 0) / values.comments.length
      };
    });
    return result;
  }

  groupByHour(data) {
    const grouped = {};
    data.forEach(item => {
      const [, hour] = item.time.split('_');
      if (!grouped[hour]) {
        grouped[hour] = { interactions: [], likes: [], comments: [] };
      }
      grouped[hour].interactions.push(item.interactions);
      grouped[hour].likes.push(item.likes);
      grouped[hour].comments.push(item.comments);
    });

    const result = {};
    Object.entries(grouped).forEach(([hour, values]) => {
      result[hour] = {
        avgInteractions: values.interactions.reduce((a, b) => a + b, 0) / values.interactions.length,
        avgLikes: values.likes.reduce((a, b) => a + b, 0) / values.likes.length,
        avgComments: values.comments.reduce((a, b) => a + b, 0) / values.comments.length
      };
    });
    return result;
  }

  calculateStdDev(values) {
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(value => Math.pow(value - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    return Math.sqrt(avgSquareDiff);
  }
}

export default new InstagramEngagementService();
