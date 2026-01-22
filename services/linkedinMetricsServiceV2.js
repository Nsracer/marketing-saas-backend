import axios from 'axios';
import oauthTokenService from './oauthTokenService.js';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * LinkedIn Metrics Service V2
 * Uses Official LinkedIn API for all metrics (Followers + Posts)
 * Robust error handling for Rate Limits (429) and API failures
 */
class LinkedInMetricsServiceV2 {
  constructor() {
    this.baseURL = 'https://api.linkedin.com/v2';
    this.restURL = 'https://api.linkedin.com/rest';
    this.version = '202506'; // Required for r_member_postAnalytics and r_member_profileAnalytics scopes

    // Request deduplication - prevents multiple concurrent requests for same user
    this.pendingRequests = new Map();
  }

  /**
   * Get comprehensive LinkedIn metrics
   * @param {string} userEmail - User's email
   * @param {string} [organizationId] - Optional organization ID to filter by
   * @returns {Object} Comprehensive metrics
   */
  async getComprehensiveMetrics(userEmail, organizationId = null) {
    // Request deduplication - return existing promise if request is in-flight
    // key needs to include orgId to avoid collisions
    const requestKey = `${userEmail}:${organizationId || 'default'}`;

    if (this.pendingRequests.has(requestKey)) {
      console.log(`   ⏳ Request already in-flight for ${requestKey}, reusing...`);
      return this.pendingRequests.get(requestKey);
    }

    // Create and store the promise
    const requestPromise = this._fetchMetrics(userEmail, organizationId);
    this.pendingRequests.set(requestKey, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Clean up after 30 seconds to allow better caching of concurrent calls
      setTimeout(() => this.pendingRequests.delete(requestKey), 30000);
    }
  }

  /**
   * Internal method that actually fetches metrics
   */
  async _fetchMetrics(userEmail, targetOrgId = null) {
    try {
      console.log(`\n📊 [LinkedIn V2 - OFFICIAL API] Fetching metrics for: ${userEmail} ${targetOrgId ? `(Org: ${targetOrgId})` : ''}`);

      // Initialize result object
      let companyUrl = null;
      let companyName = null;
      let followers = 0;
      let followerGrowth = [];
      let topPosts = [];
      let engagementScore = {
        likes: 0,
        comments: 0,
        shares: 0,
        engagementRate: 0,
        reach: 0,
        impressions: 0,
        clicks: 0,
        postsInPeriod: 0,
        rateSource: 'official-api'
      };
      let reputationBenchmark = {
        score: 0,
        followers: 0,
        avgEngagementRate: 0,
        sentiment: 'neutral'
      };

      // ========================================
      // STEP 1: FETCH OAUTH DATA
      // ========================================
      const tokens = await oauthTokenService.getTokens(userEmail, 'linkedin');

      if (!tokens || !tokens.access_token) {
        console.log(`   ⚠️ No OAuth token found`);
        return {
          dataAvailable: false,
          reason: 'Please connect your LinkedIn account to view metrics',
          needsBusinessSetup: true
        };
      }

      console.log(`   ✅ LinkedIn OAuth token found`);

      // Get basic profile (Personal Account Details)
      let profile = null;
      let personalAnalytics = null;
      try {
        profile = await this.getBasicProfile(tokens.access_token);
        if (profile) {
          console.log(`   ✅ Personal Profile: ${profile.name} (${profile.email})`);

          // Fetch personal analytics (post stats, profile views, connections)
          console.log('📊 Fetching personal analytics...');
          const [postAnalytics, profileAnalytics, connectionsCount] = await Promise.all([
            this.getMemberPostAnalytics(tokens.access_token),
            this.getMemberProfileAnalytics(tokens.access_token),
            this.getConnectionsCount(tokens.access_token)
          ]);

          personalAnalytics = {
            postStats: postAnalytics,
            profileStats: profileAnalytics,
            connections: connectionsCount
          };

          if (postAnalytics) {
            console.log(`   ✅ Post Analytics: ${postAnalytics.impressions} impressions, ${postAnalytics.reactions} reactions`);
          }
          if (profileAnalytics) {
            console.log(`   ✅ Profile Analytics: ${profileAnalytics.profileViews} views`);
          }
          if (connectionsCount !== null) {
            console.log(`   ✅ Connections: ${connectionsCount}`);
          }
        }
      } catch (profileError) {
        console.warn(`   ⚠️ Could not fetch personal profile: ${profileError.message}`);
      }

      // Get user's organizations - with caching to avoid per-resource daily limit
      let orgs = [];
      let orgsFailed = false;
      let orgsRateLimited = false;

      // First, try to get cached org info from social_media_cache
      let cachedOrgInfo = null;
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_KEY
        );

        const { data: cacheData } = await supabase
          .from('social_media_cache')
          .select('cached_data, created_at')
          .eq('user_email', userEmail)
          .eq('platform', 'linkedin')
          .single();

        if (cacheData?.cached_data?.organizationInfo) {
          cachedOrgInfo = cacheData.cached_data.organizationInfo;
          console.log(`   📦 Using cached org info: ${cachedOrgInfo.name} (cached)`);
        }
      } catch (cacheError) {
        // Cache miss or error - will try API
      }

      try {
        orgs = await this.getUserOrganizations(tokens.access_token);
      } catch (orgError) {
        orgsFailed = true;
        if (orgError.response?.status === 429) {
          orgsRateLimited = true;
          console.warn('   ⚠️ Rate limit exceeded fetching organizations');

          // Use cached org info if available
          if (cachedOrgInfo) {
            console.log(`   💾 Using cached organization data to avoid rate limit`);
            orgs = [{
              urn: cachedOrgInfo.urn,
              id: cachedOrgInfo.id,
              name: cachedOrgInfo.name,
              role: 'ADMINISTRATOR',
              state: 'APPROVED'
            }];
            orgsRateLimited = false; // We have data from cache
          }
        } else {
          throw orgError;
        }
      }

      // Add delay to prevent rate limiting between organization calls
      await new Promise(r => setTimeout(r, 300));

      if (!orgs || orgs.length === 0) {
        console.log(`   ⚠️ No organizations found`);

        // If rate limited, return partial data with profile and a clear message
        if (orgsRateLimited) {
          return {
            dataAvailable: true, // Partial data available
            partialData: true,
            profile: profile,
            personalAnalytics: personalAnalytics, // Include personal post/profile analytics
            companyName: profile?.name || 'Your Profile',
            companyUrl: null,
            companyFollowers: 0,
            source: 'official-api-partial',
            metrics: { avgLikes: 0, avgComments: 0, avgShares: 0, avgInteractions: 0, engagementRate: 0, postsInPeriod: 0 },
            engagementScore: { likes: 0, comments: 0, shares: 0, engagementRate: 0, reach: 0, impressions: 0, clicks: 0, postsInPeriod: 0, rateSource: 'official-api' },
            followerGrowth: [],
            topPosts: [],
            reputationBenchmark: { score: 0, followers: 0, avgEngagementRate: 0, sentiment: 'neutral' },
            reason: 'LinkedIn API rate limit exceeded for organization data. Personal profile and analytics loaded. Please try again later for company data.',
            lastUpdated: new Date().toISOString()
          };
        }

        // Genuine no-orgs scenario
        return {
          dataAvailable: false,
          reason: 'No LinkedIn organizations found for this account. Please ensure you are an admin of a LinkedIn Company Page.',
          needsBusinessSetup: false,
          profile: profile // Return profile even if no orgs found
        };
      }

      let org = null;

      if (targetOrgId) {
        // Find the specific organization requested
        org = orgs.find(o => o.id === targetOrgId);

        if (!org) {
          console.warn(`   ⚠️ Requested organization ${targetOrgId} not found in user's list`);
          // Fallback to first org or handle error? 
          // For now, let's fallback to first org but log it, or maybe we should return an error?
          // Let's return the first one as fallback but maybe we should be strict.
          // Actually, if they requested a specific one and we can't find it, that's an issue.
          // But for robustness, let's default to the first one if the ID is invalid, 
          // unless the list is empty (handled above).
          if (orgs.length > 0) {
            org = orgs[0];
            console.log(`   ⚠️ Fallback to default organization: ${org.name}`);
          }
        }
      } else {
        // Default to the first one
        org = orgs[0];
      }

      if (!org) {
        // Should be covered by orgs.length check above, but just in case
        return {
          dataAvailable: false,
          reason: 'No valid organization found.',
          needsBusinessSetup: false,
          profile: profile
        };
      }
      console.log(`   ✅ Organization: ${org.name} (${org.urn})`);

      // Get organization details
      try {
        const orgId = org.id;
        const detailsResponse = await axios.get(`${this.baseURL}/organizations/${orgId}`, {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'X-Restli-Protocol-Version': '2.0.0',
            'LinkedIn-Version': this.version
          }
        });

        const orgDetails = detailsResponse.data;
        const vanityName = orgDetails.vanityName;
        companyName = orgDetails.localizedName;
        companyUrl = vanityName ? `https://www.linkedin.com/company/${vanityName}` : null;

        if (companyUrl) {
          console.log(`   ✅ Company URL: ${companyUrl}`);
          console.log(`   ✅ Company Name: ${companyName}`);

          // Update business settings
          await this.updateBusinessInfo(userEmail, companyUrl);
        }
      } catch (detailsError) {
        if (detailsError.response?.status === 429) {
          console.warn('   ⚠️ Rate limit exceeded fetching org details');
        } else {
          console.log(`   ⚠️ Error fetching org details: ${detailsError.message}`);
        }
      }

      // Add delay to prevent rate limiting
      await new Promise(r => setTimeout(r, 300));

      // Get follower count
      try {
        const followerCount = await this.getFollowerCount(tokens.access_token, org.urn);
        if (followerCount !== null) {
          followers = followerCount;
          console.log(`   ✅ Follower count: ${followers.toLocaleString()}`);
        }
      } catch (followerError) {
        if (followerError.response?.status === 429) {
          console.warn('   ⚠️ Rate limit exceeded fetching follower count');
        } else {
          console.log(`   ⚠️ Error fetching follower count: ${followerError.message}`);
        }
      }

      // Add delay to prevent rate limiting
      await new Promise(r => setTimeout(r, 300));

      // Get follower growth trend (30 days)
      try {
        const growthData = await this.getFollowerGrowthTrend(tokens.access_token, org.urn, 30, followers);
        if (growthData && growthData.length > 0) {
          followerGrowth = growthData;
          console.log(`   ✅ Follower growth data: ${growthData.length} days`);
        }
      } catch (growthError) {
        if (growthError.response?.status === 429) {
          console.warn('   ⚠️ Rate limit exceeded fetching follower growth');
        } else {
          console.log(`   ⚠️ Error fetching follower growth: ${growthError.message}`);
        }
      }

      // Add delay to prevent rate limiting before posts fetch
      await new Promise(r => setTimeout(r, 500));

      // ========================================
      // STEP 2: FETCH POSTS & ENGAGEMENT (OFFICIAL API)
      // ========================================
      try {
        console.log(`   📝 Fetching posts from Official API...`);
        const postsData = await this.getCompanyPosts(tokens.access_token, org.urn, followers);

        if (postsData.posts && postsData.posts.length > 0) {
          topPosts = postsData.posts;
          engagementScore = postsData.engagementScore;

          console.log(`   ✅ Retrieved ${topPosts.length} posts`);
          console.log(`   📊 Engagement Rate: ${engagementScore.engagementRate}%`);
        } else {
          console.log(`   ⚠️ No posts found via API`);
        }
      } catch (postsError) {
        if (postsError.response?.status === 429) {
          console.warn('   ⚠️ Rate limit exceeded fetching posts');
        } else {
          console.log(`   ⚠️ Error fetching posts: ${postsError.message}`);
        }
      }

      // ========================================
      // STEP 3: COMPILE RESULT
      // ========================================

      // Calculate reputation score
      const reputationScore = Math.min(100, Math.round(
        (parseFloat(engagementScore.engagementRate) * 2) +
        (followers / 100) +
        (topPosts.length * 2)
      ));

      reputationBenchmark = {
        score: reputationScore,
        followers: followers,
        avgEngagementRate: parseFloat(engagementScore.engagementRate),
        sentiment: reputationScore > 75 ? 'Excellent' : reputationScore > 50 ? 'Good' : 'Fair'
      };

      const result = {
        dataAvailable: true,
        profile: profile, // Add personal profile data
        personalAnalytics: personalAnalytics, // Add personal analytics data
        companyName: companyName || 'Your Company',
        companyUrl: companyUrl,
        companyFollowers: followers,
        source: 'official-api-only',
        scrapedPostsCount: 0,
        scraperFailed: false,
        scraperError: null,
        // Cache organization info to avoid hitting daily per-resource limit
        organizationInfo: org ? {
          urn: org.urn,
          id: org.id,
          name: companyName || org.name
        } : null,
        metrics: {
          avgLikes: engagementScore.likes / (engagementScore.postsInPeriod || 1),
          avgComments: engagementScore.comments / (engagementScore.postsInPeriod || 1),
          avgShares: engagementScore.shares / (engagementScore.postsInPeriod || 1),
          avgInteractions: (engagementScore.likes + engagementScore.comments + engagementScore.shares) / (engagementScore.postsInPeriod || 1),
          engagementRate: engagementScore.engagementRate,
          postsInPeriod: engagementScore.postsInPeriod
        },
        engagementScore: engagementScore,
        followerGrowth: followerGrowth,
        topPosts: topPosts,
        reputationBenchmark: reputationBenchmark,
        lastUpdated: new Date().toISOString()
      };

      console.log(`\n✅ LinkedIn metrics compiled (OFFICIAL API):`);
      console.log(`   👤 Profile: ${profile ? profile.name : 'N/A'}`);
      console.log(`   📊 Posts: ${result.topPosts.length}`);
      console.log(`   👥 Followers: ${followers.toLocaleString()}`);
      console.log(`   📈 Growth data: ${followerGrowth.length} days`);

      return result;

    } catch (error) {
      console.error('❌ [LinkedIn V2] Critical error:', error.message);

      // Handle 429 specifically at top level if it bubbled up
      if (error.response?.status === 429) {
        return {
          dataAvailable: false,
          reason: 'LinkedIn API rate limit exceeded. Please try again in a few minutes.',
          error: 'Rate limit exceeded'
        };
      }

      return {
        dataAvailable: false,
        reason: 'An unexpected error occurred while fetching LinkedIn data',
        error: error.message
      };
    }
  }

  /**
   * Get list of organizations for a user
   * @param {string} userEmail 
   */
  async getOrganizations(userEmail) {
    try {
      console.log(`🔍 Fetching organizations for: ${userEmail}`);
      const tokens = await oauthTokenService.getTokens(userEmail, 'linkedin');

      if (!tokens || !tokens.access_token) {
        throw new Error('No LinkedIn tokens found');
      }

      const orgs = await this.getUserOrganizations(tokens.access_token);
      return orgs.map(org => ({
        id: org.id,
        name: org.name,
        urn: org.urn,
        picture: org.picture // Now returning the logo URL
      }));
    } catch (error) {
      console.error('❌ Error getting organizations:', error.message);
      return [];
    }
  }

  /**
   * Get basic LinkedIn profile information (OpenID Connect or V2)
   * @param {string} accessToken - OAuth access token
   * @returns {Object} Basic profile data
   */
  async getBasicProfile(accessToken) {
    try {
      console.log('🔍 Fetching LinkedIn basic profile...');

      // STRATEGY 1: Try OpenID Connect userinfo endpoint (Standard)
      // Requires 'openid', 'profile', 'email' scopes
      try {
        const response = await axios.get('https://api.linkedin.com/v2/userinfo', {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        const profile = response.data;
        return {
          id: profile.sub,
          name: profile.name,
          givenName: profile.given_name,
          familyName: profile.family_name,
          email: profile.email,
          picture: profile.picture,
          locale: profile.locale
        };
      } catch (oidcError) {
        // If 403, it means we don't have OIDC scopes, try V2 API
        if (oidcError.response?.status === 403) {
          console.log('   ⚠️ OIDC userinfo failed (403), trying v2/me endpoint (Legacy/V2)...');

          // STRATEGY 2: Try V2 'me' endpoint
          // Requires 'r_liteprofile' or 'r_basicprofile'
          const v2Response = await axios.get('https://api.linkedin.com/v2/me', {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'X-Restli-Protocol-Version': '2.0.0',
              'LinkedIn-Version': this.version
            },
            params: {
              projection: '(id,localizedFirstName,localizedLastName,profilePicture(displayImage~:playableStreams))'
            }
          });

          const v2Profile = v2Response.data;

          // Construct profile object from V2 data
          let pictureUrl = null;
          if (v2Profile.profilePicture?.['displayImage~']?.elements?.length > 0) {
            // Get the largest image
            const pictures = v2Profile.profilePicture['displayImage~'].elements;
            pictureUrl = pictures[pictures.length - 1]?.identifiers?.[0]?.identifier;
          }

          return {
            id: v2Profile.id,
            name: `${v2Profile.localizedFirstName} ${v2Profile.localizedLastName}`,
            givenName: v2Profile.localizedFirstName,
            familyName: v2Profile.localizedLastName,
            email: null, // v2/me doesn't return email, would need r_emailaddress and separate call
            picture: pictureUrl,
            locale: null
          };
        }

        throw oidcError;
      }
    } catch (error) {
      console.error('❌ Error fetching LinkedIn profile:', error.response?.data || error.message);
      // Don't throw, just return null so the main flow continues
      return null;
    }
  }

  /**
   * Update business info in Supabase
   */
  async updateBusinessInfo(userEmail, companyUrl) {
    try {
      const { data: existing } = await supabase
        .from('user_business_info')
        .select('*')
        .eq('user_email', userEmail)
        .single();

      if (existing) {
        await supabase
          .from('user_business_info')
          .update({
            linkedin_handle: companyUrl,
            updated_at: new Date().toISOString()
          })
          .eq('user_email', userEmail);
      } else {
        await supabase
          .from('user_business_info')
          .insert({
            user_email: userEmail,
            linkedin_handle: companyUrl,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
      }
    } catch (error) {
      console.error('Error updating business info:', error);
    }
  }

  /**
   * Get user's LinkedIn organizations
   */
  async getUserOrganizations(accessToken) {
    try {
      const response = await axios.get(`${this.baseURL}/organizationalEntityAcls`, {
        params: {
          q: 'roleAssignee',
          projection: '(elements*(organizationalTarget,role,state))'
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
          'LinkedIn-Version': this.version
        }
      });

      const elements = response.data.elements || [];

      // Fetch details for each organization to get real names and logos
      // The basic ACL endpoint only gives URNs and roles
      const detailedOrgs = await Promise.all(elements.map(async (element) => {
        const orgUrn = element.organizationalTarget;
        const orgId = orgUrn ? orgUrn.split(':').pop() : null;

        let name = `Organization ${orgId}`;
        let logo = null;

        if (orgId) {
          try {
            // Fetch org details
            const orgDetailsResponse = await axios.get(`${this.baseURL}/organizations/${orgId}`, {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'X-Restli-Protocol-Version': '2.0.0',
                'LinkedIn-Version': this.version
              },
              params: {
                projection: '(localizedName,logoV2(original~:playableStreams))'
              }
            });

            if (orgDetailsResponse.data) {
              name = orgDetailsResponse.data.localizedName || name;

              // Extract logo
              if (orgDetailsResponse.data.logoV2?.['original~']?.elements?.length > 0) {
                const pictures = orgDetailsResponse.data.logoV2['original~'].elements;
                logo = pictures[pictures.length - 1]?.identifiers?.[0]?.identifier;
              }
            }
          } catch (detailError) {
            console.warn(`   ⚠️ Could not fetch details for org ${orgId}: ${detailError.message}`);
          }
        }

        return {
          urn: orgUrn,
          id: orgId,
          name: name,
          picture: logo,
          role: element.role,
          state: element.state
        };
      }));

      return detailedOrgs;
    } catch (error) {
      // Log detailed error info for debugging
      const status = error.response?.status;
      const errorCode = error.response?.data?.serviceErrorCode || error.response?.data?.code;
      const errorMessage = error.response?.data?.message || error.message;

      console.error(`   ❌ Organizations API error:`);
      console.error(`      Status: ${status}`);
      console.error(`      Error Code: ${errorCode}`);
      console.error(`      Message: ${errorMessage}`);

      if (error.response?.headers) {
        console.error(`      X-Li-Request-Id: ${error.response.headers['x-li-request-id']}`);
        console.error(`      X-RestLi-Error-Response: ${error.response.headers['x-restli-error-response']}`);
      }

      if (status === 429) {
        console.warn('   ⚠️ Rate limit exceeded fetching organizations (getUserOrganizations)');
        // THROW the error so outer code can detect rate limit and return partial data with profile
        throw error;
      }

      if (status === 403) {
        console.warn('   ⚠️ Permission denied - user may not have organization admin access');
        console.warn('   💡 This is NOT a rate limit - check OAuth scopes and org permissions');
        return [];
      }

      console.error('   ❌ Error fetching organizations:', error.message);
      throw error;
    }
  }

  /**
   * Get personal post analytics (impressions, reactions, comments, reshares)
   * Requires r_member_postAnalytics scope
   */
  async getMemberPostAnalytics(accessToken) {
    try {
      console.log('📊 Fetching member post analytics...');

      let totalImpressions = 0;
      let totalReactions = 0;
      let totalComments = 0;
      let totalReshares = 0;
      let membersReached = 0;

      // Try each queryType individually (LinkedIn API requires single value)
      // MEMBERS_REACHED = unique views/reach
      const queryTypes = ['IMPRESSION', 'REACTION', 'COMMENT', 'RESHARE', 'MEMBERS_REACHED'];

      for (const queryType of queryTypes) {
        try {
          const response = await axios.get(`${this.restURL}/memberCreatorPostAnalytics`, {
            params: {
              q: 'me',
              queryType: queryType,
              aggregation: 'TOTAL'
            },
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'LinkedIn-Version': this.version
            }
          });

          const elements = response.data?.elements || [];
          if (elements.length > 0) {
            const data = elements[0];
            // API returns 'count' field in the response
            const count = data.count || data.total || data[queryType.toLowerCase() + 'Count'] || 0;
            console.log(`   ✅ ${queryType}: ${count}`);

            if (queryType === 'IMPRESSION') totalImpressions = count;
            if (queryType === 'REACTION') totalReactions = count;
            if (queryType === 'COMMENT') totalComments = count;
            if (queryType === 'RESHARE') totalReshares = count;
            if (queryType === 'MEMBERS_REACHED') membersReached = count;
          }

          // Small delay between requests to avoid rate limiting
          await new Promise(r => setTimeout(r, 150));
        } catch (typeError) {
          if (typeError.response?.status === 429) {
            console.warn(`   ⚠️ Rate limit hit on ${queryType}, stopping`);
            break;
          }
          console.warn(`   ⚠️ ${queryType}: ${typeError.response?.status || typeError.message}`);
        }
      }

      // If REST API failed, try getting personal posts via V2 API
      if (totalImpressions === 0 && totalReactions === 0 && totalComments === 0) {
        console.log('   📝 REST API failed, trying V2 personal posts...');
        try {
          const meResponse = await axios.get(`${this.baseURL}/me`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'X-Restli-Protocol-Version': '2.0.0'
            }
          });
          const memberUrn = `urn:li:person:${meResponse.data.id}`;

          const postsResponse = await axios.get(`${this.baseURL}/ugcPosts`, {
            params: {
              q: 'authors',
              authors: `List(${encodeURIComponent(memberUrn)})`,
              count: 20
            },
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'X-Restli-Protocol-Version': '2.0.0'
            }
          });

          const posts = postsResponse.data?.elements || [];
          console.log(`   📝 Found ${posts.length} personal posts`);

          // Get engagement for up to 5 posts
          for (const post of posts.slice(0, 5)) {
            try {
              const likesRes = await axios.get(`${this.baseURL}/socialActions/${encodeURIComponent(post.id)}/likes?count=0`, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'X-Restli-Protocol-Version': '2.0.0' }
              });
              totalReactions += likesRes.data?.paging?.total || 0;
            } catch (e) { /* ignore rate limits */ }

            try {
              const commentsRes = await axios.get(`${this.baseURL}/socialActions/${encodeURIComponent(post.id)}/comments?count=0`, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'X-Restli-Protocol-Version': '2.0.0' }
              });
              totalComments += commentsRes.data?.paging?.total || 0;
            } catch (e) { /* ignore rate limits */ }

            await new Promise(r => setTimeout(r, 200));
          }

          if (totalReactions > 0 || totalComments > 0) {
            console.log(`   ✅ Personal posts: ${totalReactions} reactions, ${totalComments} comments`);
          }
        } catch (altError) {
          console.warn('   ⚠️ V2 personal posts failed:', altError.response?.status || altError.message);
        }
      }

      return {
        impressions: totalImpressions,
        reactions: totalReactions,
        comments: totalComments,
        reshares: totalReshares,
        membersReached: membersReached
      };
    } catch (error) {
      if (error.response?.status === 403) {
        console.warn('   ⚠️ No access to member post analytics (scope r_member_postAnalytics may not be granted)');
        return null;
      }
      if (error.response?.status === 429) {
        console.warn('   ⚠️ Rate limit on member post analytics');
        return null;
      }
      console.error('   ❌ Error fetching member post analytics:', error.response?.status || error.message);
      return null;
    }
  }

  /**
   * Get personal profile analytics (profile views, search appearances)
   * Requires r_member_profileAnalytics scope
   */
  async getMemberProfileAnalytics(accessToken) {
    try {
      console.log('📊 Fetching member profile analytics...');

      // Use REST API for member analytics (not V2)
      const response = await axios.get(`${this.restURL}/memberProfileAnalytics`, {
        params: {
          q: 'me'
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'LinkedIn-Version': this.version
        }
      });

      const analytics = response.data?.elements?.[0] || {};

      return {
        profileViews: analytics.profileViewCount || 0,
        searchAppearances: analytics.searchAppearanceCount || 0,
        uniqueProfileViewers: analytics.uniqueViewCount || 0
      };
    } catch (error) {
      if (error.response?.status === 403) {
        console.warn('   ⚠️ No access to member profile analytics (scope r_member_profileAnalytics may not be granted)');
        return null;
      }
      if (error.response?.status === 404) {
        console.warn('   ⚠️ Member profile analytics endpoint not found (404). This requires:');
        console.warn('      1. LinkedIn Developer App with "Member Profile Analytics" product approved');
        console.warn('      2. r_member_profileAnalytics OAuth scope');
        console.warn('      3. User to reconnect LinkedIn after scope is approved');
        return null;
      }
      if (error.response?.status === 429) {
        console.warn('   ⚠️ Rate limit on member profile analytics');
        return null;
      }
      console.error('   ❌ Error fetching member profile analytics:', error.response?.status || error.message);
      return null;
    }
  }

  /**
   * Get 1st-degree connections count
   * Requires r_1st_connections_size scope
   */
  async getConnectionsCount(accessToken) {
    try {
      console.log('📊 Fetching connections count...');

      // First get the actual person ID
      const meResponse = await axios.get(`${this.baseURL}/me`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });
      const personId = meResponse.data?.id;
      if (!personId) {
        console.warn('   ⚠️ Could not get person ID');
        return null;
      }

      const personUrn = `urn:li:person:${personId}`;
      console.log(`   👤 Person URN: ${personUrn}`);

      // Use the /connections endpoint for r_1st_connections_size scope
      // NOT /networkSizes which is for organizations
      const response = await axios.get(`${this.baseURL}/connections/${encodeURIComponent(personUrn)}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });

      const count = response.data?.firstDegreeSize || response.data?.count || 0;
      console.log(`   ✅ Connections count: ${count}`);
      return count;
    } catch (error) {
      if (error.response?.status === 403 || error.response?.status === 404) {
        console.warn('   ⚠️ Connections endpoint access denied or not found:', error.response?.status);
        console.warn('   ℹ️ This may require LinkedIn Partner Program membership');
        return null;
      }
      if (error.response?.status === 429) {
        console.warn('   ⚠️ Rate limited on connections count');
        return null;
      }
      console.error('   ❌ Error fetching connections:', error.response?.status || error.message);
      return null;
    }
  }

  /**
   * Get current follower count using Official LinkedIn V2 API
   */
  async getFollowerCount(accessToken, organizationUrn) {
    try {
      // Use V2 API (not REST) with correct edgeType
      const response = await axios.get(`${this.baseURL}/networkSizes/${encodeURIComponent(organizationUrn)}`, {
        params: {
          edgeType: 'CompanyFollowedByMember'
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });

      const count = response.data.firstDegreeSize || 0;
      return count;
    } catch (error) {
      console.error(`   ❌ Error fetching follower count: ${error.message}`);
      if (error.response?.status === 429) throw error;
      return null;
    }
  }

  /**
   * Get follower growth trend (last 30 days) using Official LinkedIn V2 API
   * @param {string} accessToken - OAuth access token
   * @param {string} organizationUrn - Organization URN
   * @param {number} days - Number of days to fetch
   * @param {number} currentFollowerCount - Current follower count (to compute cumulative values)
   */
  async getFollowerGrowthTrend(accessToken, organizationUrn, days = 30, currentFollowerCount = 0) {
    try {
      // LinkedIn provides data up to 2 days before today
      const endDate = new Date();
      endDate.setDate(endDate.getDate() - 2);
      endDate.setHours(0, 0, 0, 0);

      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - days);

      const start = startDate.getTime();
      const end = endDate.getTime();

      // Use V2 API (not REST API) for compatibility
      const url = `${this.baseURL}/organizationalEntityFollowerStatistics`;
      const queryString = `q=organizationalEntity&organizationalEntity=${encodeURIComponent(organizationUrn)}&timeIntervals=(timeRange:(start:${start},end:${end}),timeGranularityType:DAY)`;

      const response = await axios.get(`${url}?${queryString}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });

      const data = response.data.elements || [];

      if (data.length === 0) {
        return null;
      }

      // Sort by date ascending first
      const sortedData = data.sort((a, b) =>
        new Date(a.timeRange?.start) - new Date(b.timeRange?.start)
      );

      // Calculate total gains to work backward from current follower count
      const totalGains = sortedData.reduce((sum, item) => {
        return sum + (item.followerGains?.organicFollowerGain || 0) + (item.followerGains?.paidFollowerGain || 0);
      }, 0);

      // Starting followers = current - all gains in the period
      let runningFollowers = currentFollowerCount - totalGains;

      // Convert to frontend format with cumulative followers
      const timeSeries = sortedData.map(item => {
        const gained = (item.followerGains?.organicFollowerGain || 0) + (item.followerGains?.paidFollowerGain || 0);
        runningFollowers += gained;

        return {
          date: new Date(item.timeRange?.start).toISOString().split('T')[0],
          followers: runningFollowers,
          organicGained: item.followerGains?.organicFollowerGain || 0,
          paidGained: item.followerGains?.paidFollowerGain || 0,
          totalGained: gained,
          gained: gained,
          lost: 0,
          net: gained
        };
      });

      return timeSeries;
    } catch (error) {
      console.error(`   ❌ Error fetching follower growth: ${error.response?.data || error.message}`);
      if (error.response?.status === 429) throw error;
      return null;
    }
  }

  /**
   * Get company posts using Official LinkedIn V2 API with real engagement stats
   */
  async getCompanyPosts(accessToken, organizationUrn, followersCount = 0) {
    try {
      // Fetch posts using V2 ugcPosts API
      const url = `${this.baseURL}/ugcPosts?q=authors&authors=List(${encodeURIComponent(organizationUrn)})&count=50`;

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        }
      });

      const elements = response.data.elements || [];
      console.log(`   📝 Found ${elements.length} posts`);

      let totalLikes = 0;
      let totalComments = 0;
      let totalShares = 0;

      // Fetch social actions for each post (limit to 10 to avoid rate limits)
      // Each post requires 2 API calls (likes + comments), so 10 posts = 20 calls
      const postsWithStats = [];
      const postsToProcess = elements.slice(0, 10);

      let rateLimitHit = false;

      for (const post of postsToProcess) {
        // Skip remaining posts if we hit rate limit
        if (rateLimitHit) break;

        const content = post.specificContent?.['com.linkedin.ugc.ShareContent'];
        const text = content?.shareCommentary?.text || '';
        const media = content?.media || [];
        const imageUrl = media.length > 0 ? media[0].originalUrl : null;
        const postUrn = post.id;

        let likes = 0;
        let comments = 0;

        // Get likes count from socialActions API
        try {
          const likesUrl = `${this.baseURL}/socialActions/${encodeURIComponent(postUrn)}/likes?count=0`;
          const likesResponse = await axios.get(likesUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'X-Restli-Protocol-Version': '2.0.0'
            }
          });
          likes = likesResponse.data.paging?.total || 0;
        } catch (e) {
          if (e.response?.status === 429) {
            console.warn(`   ⚠️ Rate limit hit on likes API - stopping further calls`);
            rateLimitHit = true;
          } else if (e.response?.status === 403) {
            console.warn(`   ⚠️ socialActions/likes API 403 - may lack w_member_social scope`);
          } else {
            console.warn(`   ⚠️ Likes API error for post: ${e.response?.status || e.message}`);
          }
        }

        // Get comments count from socialActions API
        try {
          const commentsUrl = `${this.baseURL}/socialActions/${encodeURIComponent(postUrn)}/comments?count=0`;
          const commentsResponse = await axios.get(commentsUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'X-Restli-Protocol-Version': '2.0.0'
            }
          });
          comments = commentsResponse.data.paging?.total || 0;
        } catch (e) {
          if (e.response?.status === 429) {
            console.warn(`   ⚠️ Rate limit hit on comments API - stopping further calls`);
            rateLimitHit = true;
          } else if (e.response?.status === 403) {
            console.warn(`   ⚠️ socialActions/comments API 403 - may lack w_member_social scope`);
          } else {
            console.warn(`   ⚠️ Comments API error for post: ${e.response?.status || e.message}`);
          }
        }

        totalLikes += likes;
        totalComments += comments;

        postsWithStats.push({
          id: post.id,
          urn: post.id,
          message: text,
          url: imageUrl || `https://www.linkedin.com/feed/update/${post.id}`,
          postedDate: new Date(post.created.time).toISOString().split('T')[0],
          timestamp: post.created.time,
          likes,
          comments,
          shares: 0,
          reach: 0,
          totalEngagement: likes + comments
        });

        // Delay between post processing to avoid rate limits (200ms)
        await new Promise(r => setTimeout(r, 200));
      }

      // Sort by total engagement (descending) to get top posts
      postsWithStats.sort((a, b) => b.totalEngagement - a.totalEngagement);

      const totalEngagement = totalLikes + totalComments + totalShares;
      const postsCount = postsWithStats.length;

      // Calculate engagement rate
      const avgEngagementPerPost = postsCount > 0 ? totalEngagement / postsCount : 0;
      const engagementRate = followersCount > 0
        ? parseFloat(((avgEngagementPerPost / followersCount) * 100).toFixed(2))
        : (postsCount > 0 ? parseFloat(((totalEngagement / (postsCount * 100)) * 100).toFixed(2)) : 0);

      console.log(`   📊 Total engagement: ${totalEngagement} (${totalLikes} likes, ${totalComments} comments)`);

      return {
        posts: postsWithStats.slice(0, 10), // Return top 10 by engagement
        engagementScore: {
          likes: totalLikes,
          comments: totalComments,
          shares: totalShares,
          reach: 0,
          impressions: 0,
          engagementRate: engagementRate,
          postsInPeriod: postsCount
        },
        metrics: {
          avgLikes: postsCount > 0 ? totalLikes / postsCount : 0,
          avgComments: postsCount > 0 ? totalComments / postsCount : 0,
          avgShares: postsCount > 0 ? totalShares / postsCount : 0,
          avgInteractions: postsCount > 0 ? totalEngagement / postsCount : 0
        }
      };

    } catch (error) {
      console.error(`   ❌ Error fetching posts: ${error.message}`);
      if (error.response?.status === 429) throw error;
      return { posts: [], engagementScore: { likes: 0, comments: 0, shares: 0, engagementRate: 0, postsInPeriod: 0 } };
    }
  }

  formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }
}

export default new LinkedInMetricsServiceV2();
