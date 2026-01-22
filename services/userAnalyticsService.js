import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import fs from 'fs/promises';
import path from 'path';
import oauthTokenService from './oauthTokenService.js';

const getTokensFilePath = () => path.join(process.cwd(), 'data', 'oauth_tokens.json');

const getTokensFromFile = async (email) => {
  try {
    const filePath = getTokensFilePath();
    const data = await fs.readFile(filePath, 'utf-8');
    const allTokens = JSON.parse(data);
    return allTokens[email] || null;
  } catch {
    return null;
  }
};

const userAnalyticsService = {
  /**
   * Get list of GA4 properties the user has access to
   */
  async getUserProperties(email) {
    try {
      console.log('📊 Fetching GA properties for:', email);

      // Get OAuth client with auto-refresh
      const oauth2Client = await oauthTokenService.getOAuthClient(email);

      if (!oauth2Client) {
        console.log('❌ User not authenticated or token refresh failed');
        return {
          success: false,
          error: 'Authentication token expired. Please reconnect.',
          needsReconnect: true
        };
      }

      console.log('✅ OAuth client ready, fetching properties...');

      // Get GA4 Admin API
      const analyticsAdmin = google.analyticsadmin({
        version: 'v1beta',
        auth: oauth2Client
      });

      // List all GA4 properties user has access to
      const response = await analyticsAdmin.accounts.list();

      const properties = [];
      if (response.data.accounts) {
        for (const account of response.data.accounts) {
          try {
            const propsResponse = await analyticsAdmin.properties.list({
              filter: `parent:${account.name}`
            });

            if (propsResponse.data.properties) {
              properties.push(...propsResponse.data.properties.map(prop => ({
                id: prop.name.split('/')[1],
                displayName: prop.displayName,
                account: account.displayName
              })));
            }
          } catch (propError) {
            console.warn('⚠️ Error fetching properties for account:', account.name);
          }
        }
      }

      console.log(`✅ Found ${properties.length} GA4 properties`);

      return {
        success: true,
        properties
      };

    } catch (error) {
      console.error('❌ Error fetching user properties:', error.message);

      // Check if it's an auth error
      if (error.message?.includes('invalid_grant') || error.message?.includes('expired')) {
        return {
          success: false,
          error: 'Authentication token expired. Please reconnect.',
          needsReconnect: true
        };
      }

      return {
        success: false,
        error: error.message
      };
    }
  },

  /**
   * Get Analytics data from user's GA4 property using REST API
   */
  async getUserAnalyticsData(email, propertyId = null, dateRange = '30days') {
    try {
      console.log('📊 Fetching user GA data for:', email);

      // Get OAuth client with auto-refresh
      const oauth2Client = await oauthTokenService.getOAuthClient(email);

      if (!oauth2Client) {
        console.log('❌ User not authenticated or token refresh failed');
        return {
          dataAvailable: false,
          reason: 'Authentication token expired. Please reconnect.',
          connected: false,
          needsReconnect: true
        };
      }

      console.log('✅ OAuth client ready');

      // Property ID is required - don't auto-select first property
      if (!propertyId) {
        console.log('⚠️ No property ID provided');
        return {
          dataAvailable: false,
          reason: 'Please select a Google Analytics property to view data',
          connected: true,
          needsPropertySelection: true
        };
      }

      // Get access token from OAuth client
      const credentials = oauth2Client.credentials;
      if (!credentials || !credentials.access_token) {
        throw new Error('No access token available');
      }

      // Use REST API instead of gRPC client to avoid authentication issues
      const reportUrl = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

      // Map dateRange to GA4 format
      const startDate = dateRange === '7days' ? '7daysAgo' : '30daysAgo';
      console.log(`📅 Using date range: ${startDate} to today`);

      const requestBody = {
        dateRanges: [{
          startDate: startDate,
          endDate: 'today'
        }],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
          { name: 'screenPageViews' },
          { name: 'conversions' },
          { name: 'totalRevenue' }
        ],
        dimensions: [
          { name: 'date' }
        ]
      };

      const response = await fetch(reportUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${credentials.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ GA API error:', response.status, errorText);

        // Check if token expired
        if (response.status === 401) {
          console.log('🔄 Token expired, attempting refresh...');
          // Try to refresh token
          const refreshed = await oauthTokenService.refreshTokens(email);
          if (!refreshed) {
            return {
              dataAvailable: false,
              reason: 'Authentication token expired. Please reconnect.',
              connected: false,
              needsReconnect: true
            };
          }
          // Retry the request with new token
          return this.getUserAnalyticsData(email, propertyId);
        }

        throw new Error(`GA API returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log('✅ User Analytics data received');

      // Process the response
      const metrics = this.processAnalyticsResponse(data);

      return {
        propertyId,
        activeUsers: metrics.activeUsers,
        sessions: metrics.sessions,
        bounceRate: metrics.bounceRate,
        avgSessionDuration: metrics.averageSessionDuration,
        pageViews: metrics.screenPageViews,
        conversions: metrics.conversions,
        revenue: metrics.totalRevenue,
        daily: metrics.daily,
        dataAvailable: true,
        connected: true,
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ User Analytics API failed:', error.message);

      return {
        dataAvailable: false,
        reason: error.message.includes('token') ? 'Authentication failed' : 'API error',
        connected: false,
        error: error.message
      };
    }
  },

  /**
   * Get social media traffic metrics from GA4
   */
  async getSocialMediaMetrics(email) {
    try {
      console.log('📱 Fetching social media metrics for:', email);

      const tokens = await getTokensFromFile(email);

      if (!tokens || !tokens.access_token) {
        return {
          dataAvailable: false,
          reason: 'Google account not connected',
          connected: false
        };
      }

      // Get the first property ID
      const propertiesResult = await this.getUserProperties(email);
      if (!propertiesResult.success || !propertiesResult.properties || propertiesResult.properties.length === 0) {
        return {
          dataAvailable: false,
          reason: 'No GA4 properties found',
          connected: true
        };
      }

      const propertyId = propertiesResult.properties[0].id;
      console.log('📍 Using property:', propertyId);

      // Prepare request body for social media metrics
      const requestBody = {
        dateRanges: [
          {
            startDate: '30daysAgo',
            endDate: 'today'
          }
        ],
        dimensions: [
          { name: 'sessionSource' },
          { name: 'sessionMedium' }
        ],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'conversions' },
          { name: 'bounceRate' }
        ],
        dimensionFilter: {
          filter: {
            fieldName: 'sessionMedium',
            stringFilter: {
              matchType: 'CONTAINS',
              value: 'social'
            }
          }
        },
        orderBys: [
          {
            metric: {
              metricName: 'sessions'
            },
            desc: true
          }
        ],
        limit: 10
      };

      // Make request to GA4 API
      const response = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ GA Social API error:', response.status, errorText);

        if (response.status === 401) {
          return {
            dataAvailable: false,
            reason: 'Authentication token expired. Please reconnect.',
            connected: false
          };
        }

        throw new Error(`GA API returned ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ Social media data received');

      // Also get total traffic for percentage calculation
      const totalTrafficResponse = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
            metrics: [
              { name: 'activeUsers' },
              { name: 'sessions' }
            ]
          })
        }
      );

      const totalData = await totalTrafficResponse.json();
      const totalUsers = totalData.rows?.[0]?.metricValues?.[0]?.value || 0;
      const totalSessions = totalData.rows?.[0]?.metricValues?.[1]?.value || 0;

      // Process social media data
      const socialMetrics = this.processSocialMediaResponse(data, totalUsers);

      return {
        ...socialMetrics,
        dataAvailable: true,
        connected: true,
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Social Media API failed:', error.message);

      return {
        dataAvailable: false,
        reason: error.message.includes('token') ? 'Authentication failed' : 'Unable to fetch social data',
        connected: false,
        totalSocialSessions: 0,
        totalSocialUsers: 0,
        totalSocialConversions: 0,
        socialConversionRate: 0,
        socialTrafficPercentage: 0,
        topSocialSources: []
      };
    }
  },

  processAnalyticsResponse(response) {
    const metrics = {
      activeUsers: 0,
      sessions: 0,
      bounceRate: 0,
      averageSessionDuration: 0,
      screenPageViews: 0,
      conversions: 0,
      totalRevenue: 0,
      daily: []
    };

    if (response.rows && response.rows.length > 0) {
      let totalRows = 0;

      response.rows.forEach(row => {
        totalRows++;

        // Extract date from dimension (YYYYMMDD format)
        const dateStr = row.dimensionValues?.[0]?.value || '';
        // Format date as YYYY-MM-DD for consistency
        const formattedDate = dateStr.length === 8
          ? `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`
          : dateStr;

        const dailyData = {
          date: formattedDate,
          visitors: 0,
          sessions: 0,
          pageViews: 0
        };

        row.metricValues.forEach((metricValue, index) => {
          const metricName = response.metricHeaders[index].name;
          const value = parseFloat(metricValue.value) || 0;

          switch (metricName) {
            case 'activeUsers':
              metrics.activeUsers += value;
              dailyData.visitors = value;
              break;
            case 'sessions':
              metrics.sessions += value;
              dailyData.sessions = value;
              break;
            case 'bounceRate':
              metrics.bounceRate += value;
              break;
            case 'averageSessionDuration':
              metrics.averageSessionDuration += value;
              break;
            case 'screenPageViews':
              metrics.screenPageViews += value;
              dailyData.pageViews = value;
              break;
            case 'conversions':
              metrics.conversions += value;
              break;
            case 'totalRevenue':
              metrics.totalRevenue += value;
              break;
          }
        });

        metrics.daily.push(dailyData);
      });

      // Sort daily data by date
      metrics.daily.sort((a, b) => a.date.localeCompare(b.date));

      // Calculate averages for rate/duration metrics
      // Note: This simple average might not be weighted correctly for all scenarios, 
      // but it matches the previous logic. Ideally, weighted averages should be used.
      if (totalRows > 0) {
        metrics.bounceRate = metrics.bounceRate / totalRows;
        metrics.averageSessionDuration = metrics.averageSessionDuration / totalRows;
      }
    }

    return metrics;
  },

  processSocialMediaResponse(response, totalUsers) {
    const metrics = {
      totalSocialUsers: 0,
      totalSocialSessions: 0,
      totalSocialConversions: 0,
      socialConversionRate: 0,
      socialTrafficPercentage: 0,
      topSocialSources: []
    };

    if (response.rows && response.rows.length > 0) {
      const sources = [];

      response.rows.forEach(row => {
        const sourceName = row.dimensionValues[0]?.value || 'Unknown';
        const users = parseInt(row.metricValues[0]?.value) || 0;
        const sessions = parseInt(row.metricValues[1]?.value) || 0;
        const pageViews = parseInt(row.metricValues[2]?.value) || 0;
        const conversions = parseFloat(row.metricValues[3]?.value) || 0;
        const bounceRate = parseFloat(row.metricValues[4]?.value) || 0;

        metrics.totalSocialUsers += users;
        metrics.totalSocialSessions += sessions;
        metrics.totalSocialConversions += conversions;

        // Clean up source name
        let cleanSource = sourceName.toLowerCase();
        if (cleanSource.includes('facebook')) cleanSource = 'Facebook';
        else if (cleanSource.includes('twitter') || cleanSource.includes('t.co')) cleanSource = 'Twitter / X';
        else if (cleanSource.includes('instagram')) cleanSource = 'Instagram';
        else if (cleanSource.includes('linkedin')) cleanSource = 'LinkedIn';
        else if (cleanSource.includes('youtube')) cleanSource = 'YouTube';
        else if (cleanSource.includes('reddit')) cleanSource = 'Reddit';
        else if (cleanSource.includes('tiktok')) cleanSource = 'TikTok';
        else if (cleanSource.includes('pinterest')) cleanSource = 'Pinterest';
        else cleanSource = sourceName;

        sources.push({
          source: cleanSource,
          users,
          sessions,
          pageViews,
          conversions,
          bounceRate
        });
      });

      metrics.topSocialSources = sources;
      metrics.socialConversionRate = metrics.totalSocialSessions > 0
        ? (metrics.totalSocialConversions / metrics.totalSocialSessions) * 100
        : 0;

      metrics.socialTrafficPercentage = totalUsers > 0
        ? (metrics.totalSocialUsers / parseInt(totalUsers)) * 100
        : 0;
    }

    return metrics;
  }
};

export default userAnalyticsService;