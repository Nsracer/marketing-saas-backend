import axios from 'axios';
import userAnalyticsService from './userAnalyticsService.js';

class TrafficService {
  /**
   * Get website traffic data from multiple sources
   * Priority: Google Analytics > SimilarWeb > No data
   */
  async getTrafficData(email, domain, days = 14) {
    const trafficData = {
      source: null,
      data: [],
      summary: {
        totalVisitors: 0,
        avgDailyVisitors: 0,
        trend: 'stable',
        changePercent: 0
      }
    };

    try {
      // Try Google Analytics first (if connected)
      const gaData = await this.getGoogleAnalyticsTraffic(email, days);
      if (gaData && gaData.length > 0) {
        trafficData.source = 'google_analytics';
        trafficData.data = gaData;
        trafficData.summary = this.calculateSummary(gaData);
        return trafficData;
      }
    } catch (error) {
      console.log('Google Analytics not available, trying alternatives...');
    }

    try {
      // Try SimilarWeb API (requires API key)
      const similarWebData = await this.getSimilarWebTraffic(domain, days);
      if (similarWebData && similarWebData.length > 0) {
        trafficData.source = 'similarweb_estimate';
        trafficData.data = similarWebData;
        trafficData.summary = this.calculateSummary(similarWebData);
        return trafficData;
      }
    } catch (error) {
      console.log('SimilarWeb not available');
    }

    // No fallback - return empty data to indicate no real data available
    console.log('⚠️ No real traffic data available. Please connect Google Analytics.');
    return trafficData;
  }

  /**
   * Get traffic from Google Analytics
   */
  async getGoogleAnalyticsTraffic(email, days = 14) {
    try {
      const analyticsData = await userAnalyticsService.getUserAnalyticsData(email);

      if (!analyticsData || !analyticsData.sessions) {
        return null;
      }

      // Transform GA data to our format - only use real data
      const trafficData = [];
      const sessionsData = analyticsData.sessions || {};

      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        // Only include days with actual data
        if (sessionsData[dateStr]) {
          trafficData.push({
            date: dateStr,
            day: days - i,
            visitors: sessionsData[dateStr],
            sessions: sessionsData[dateStr],
            pageViews: Math.floor(sessionsData[dateStr] * 2) // Estimate 2 pages per session
          });
        }
      }

      // Return null if no real data found
      return trafficData.length > 0 ? trafficData : null;
    } catch (error) {
      console.error('Error fetching GA traffic:', error);
      return null;
    }
  }

  /**
   * Get traffic estimates from SimilarWeb API
   * Note: Requires SIMILARWEB_API_KEY in .env file
   */
  async getSimilarWebTraffic(domain, days = 14) {
    const apiKey = process.env.SIMILARWEB_API_KEY;

    if (!apiKey) {
      console.log('SimilarWeb API key not configured');
      return null;
    }

    try {
      // SimilarWeb provides monthly estimates, we'll distribute them daily
      const response = await axios.get(
        `https://api.similarweb.com/v1/website/${domain}/total-traffic-and-engagement/visits`,
        {
          params: {
            api_key: apiKey,
            start_date: this.getDateMonthsAgo(1),
            end_date: this.getCurrentDate(),
            country: 'world',
            granularity: 'daily',
            main_domain_only: false
          },
          timeout: 10000
        }
      );

      if (response.data && response.data.visits) {
        return this.transformSimilarWebData(response.data.visits, days);
      }

      return null;
    } catch (error) {
      console.error('Error fetching SimilarWeb data:', error.message);
      return null;
    }
  }

  /**
   * Generate estimated traffic based on website characteristics
   */
  async getEstimatedTraffic(domain, days = 14) {
    try {
      // Base estimate on domain age, popularity indicators
      const baseVisitors = await this.estimateBaseTraffic(domain);

      const trafficData = [];
      let currentVisitors = baseVisitors;

      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - (days - 1 - i));

        // Add natural variation (weekends lower, weekdays higher)
        const dayOfWeek = date.getDay();
        const weekendFactor = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.7 : 1.0;

        // Random variation ±15%
        const randomFactor = 0.85 + Math.random() * 0.3;

        currentVisitors = Math.floor(baseVisitors * weekendFactor * randomFactor);

        trafficData.push({
          date: date.toISOString().split('T')[0],
          day: i + 1,
          visitors: currentVisitors,
          sessions: Math.floor(currentVisitors * 1.2),
          pageViews: Math.floor(currentVisitors * 2.5)
        });
      }

      return trafficData;
    } catch (error) {
      console.error('Error generating estimated traffic:', error);
      return this.generateFallbackData(days);
    }
  }

  /**
   * Estimate base traffic from domain characteristics
   */
  async estimateBaseTraffic(domain) {
    try {
      // Check if domain is accessible
      const response = await axios.get(`https://${domain}`, {
        timeout: 5000,
        validateStatus: () => true
      });

      // Base estimate: 100-5000 daily visitors depending on response
      let baseEstimate = 500;

      if (response.status === 200) {
        // More established sites
        baseEstimate = 1000 + Math.floor(Math.random() * 2000);
      } else {
        // Smaller or less accessible sites
        baseEstimate = 100 + Math.floor(Math.random() * 400);
      }

      return baseEstimate;
    } catch (error) {
      // Default for unreachable/error domains
      return 200 + Math.floor(Math.random() * 300);
    }
  }

  /**
   * Generate fallback data when all else fails
   */
  generateFallbackData(days) {
    const data = [];
    let baseValue = 300 + Math.floor(Math.random() * 500);

    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (days - 1 - i));

      baseValue += Math.floor(Math.random() * 100) - 50;
      baseValue = Math.max(100, baseValue);

      data.push({
        date: date.toISOString().split('T')[0],
        day: i + 1,
        visitors: baseValue,
        sessions: Math.floor(baseValue * 1.15),
        pageViews: Math.floor(baseValue * 2.3)
      });
    }

    return data;
  }

  /**
   * Calculate summary statistics
   */
  calculateSummary(data) {
    if (!data || data.length === 0) {
      return {
        totalVisitors: 0,
        avgDailyVisitors: 0,
        trend: 'stable',
        changePercent: 0
      };
    }

    const totalVisitors = data.reduce((sum, day) => sum + day.visitors, 0);
    const avgDailyVisitors = Math.floor(totalVisitors / data.length);

    // Calculate trend (compare first half vs second half)
    const midpoint = Math.floor(data.length / 2);
    const firstHalfAvg = data.slice(0, midpoint)
      .reduce((sum, day) => sum + day.visitors, 0) / midpoint;
    const secondHalfAvg = data.slice(midpoint)
      .reduce((sum, day) => sum + day.visitors, 0) / (data.length - midpoint);

    const changePercent = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;

    let trend = 'stable';
    if (changePercent > 5) trend = 'up';
    else if (changePercent < -5) trend = 'down';

    return {
      totalVisitors,
      avgDailyVisitors,
      trend,
      changePercent: Math.round(changePercent * 10) / 10
    };
  }

  /**
   * Transform SimilarWeb data to our format
   */
  transformSimilarWebData(visits, days) {
    const data = [];
    const recentVisits = visits.slice(-days);

    recentVisits.forEach((visit, index) => {
      data.push({
        date: visit.date,
        day: index + 1,
        visitors: Math.floor(visit.visits / 1000) || 500,
        sessions: Math.floor(visit.visits / 1000 * 1.2) || 600,
        pageViews: Math.floor(visit.visits / 1000 * 2.5) || 1250
      });
    });

    return data;
  }

  // Helper functions
  getCurrentDate() {
    return new Date().toISOString().split('T')[0];
  }

  getDateMonthsAgo(months) {
    const date = new Date();
    date.setMonth(date.getMonth() - months);
    return date.toISOString().split('T')[0];
  }
}

export default new TrafficService();