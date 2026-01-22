import { BetaAnalyticsDataClient } from '@google-analytics/data';

const analyticsService = {
  async getAnalyticsData(domain) {
    try {
      console.log('📊 Attempting to get Analytics data for:', domain);
      
      const propertyId = process.env.GOOGLE_ANALYTICS_PROPERTY_ID;
      if (!propertyId) {
        console.log('⚠️ GA4 Property ID not configured, skipping Analytics');
        return {
          dataAvailable: false,
          reason: 'No property ID configured',
          bounceRate: null,
          avgSessionDuration: null,
          totalSessions: null,
          organicSessions: null
        };
      }

      // FIXED: Initialize client with proper authentication
      const analyticsClient = new BetaAnalyticsDataClient({
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
      });

      // Query GA4 API for metrics last 30 days
      const [response] = await analyticsClient.runReport({
        property: `properties/${propertyId}`,
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        metrics: [
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
          { name: 'sessions' },
          { name: 'organicSessions' }
        ],
        // FIXED: Add dimension to avoid empty response
        dimensions: [{ name: 'date' }]
      });

      console.log('✅ Analytics API response received');

      // Process the response
      const metrics = this.processAnalyticsResponse(response);

      return {
        bounceRate: metrics.bounceRate,
        avgSessionDuration: metrics.averageSessionDuration,
        totalSessions: metrics.sessions,
        organicSessions: metrics.organicSessions,
        dataAvailable: true,
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Analytics API failed:', error.message);
      
      // FIXED: Return null instead of throwing error so other services can continue
      return {
        dataAvailable: false,
        reason: error.message.includes('UNAUTHENTICATED') ? 'Authentication failed' : 'API error',
        bounceRate: null,
        avgSessionDuration: null,
        totalSessions: null,
        organicSessions: null,
        error: error.message
      };
    }
  },

  processAnalyticsResponse(response) {
    const metrics = {
      bounceRate: 0,
      averageSessionDuration: 0,
      sessions: 0,
      organicSessions: 0
    };

    if (response.rows && response.rows.length > 0) {
      // Aggregate metrics across all rows
      response.rows.forEach(row => {
        row.metricValues.forEach((metricValue, index) => {
          const metricName = response.metricHeaders[index].name;
          const value = parseFloat(metricValue.value) || 0;
          
          switch(metricName) {
            case 'bounceRate':
              metrics.bounceRate += value;
              break;
            case 'averageSessionDuration':
              metrics.averageSessionDuration += value;
              break;
            case 'sessions':
              metrics.sessions += value;
              break;
            case 'organicSessions':
              metrics.organicSessions += value;
              break;
          }
        });
      });

      // Calculate averages
      const rowCount = response.rows.length;
      metrics.bounceRate = metrics.bounceRate / rowCount;
      metrics.averageSessionDuration = metrics.averageSessionDuration / rowCount;
    }

    return metrics;
  }
};

export default analyticsService;
