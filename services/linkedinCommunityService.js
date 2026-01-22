import axios from 'axios';
import oauthTokenService from './oauthTokenService.js';

/**
 * LinkedIn Community Management API Service - FIXED VERSION
 * Official Documentation: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/
 * API Version: 202510 (Latest as of 2025)
 * 
 * Required OAuth Scopes:
 * - r_organization_social: Read organization posts and engagement
 * - r_organization_followers: Read follower statistics
 * - rw_organization_admin: Admin access to organization pages
 * - r_basicprofile: Basic profile information
 * 
 * IMPORTANT: User must have ADMINISTRATOR role on LinkedIn Company Page
 */
class LinkedInCommunityService {
  constructor() {
    // ✅ Use /rest endpoint for latest API version
    this.baseURL = 'https://api.linkedin.com/rest';
    // ✅ Use latest version (YYYYMM format)
    this.apiVersion = '202510';
  }

  /**
   * Create axios instance with authentication and required headers
   */
  async getAuthenticatedClient(userEmail) {
    const tokens = await oauthTokenService.getTokens(userEmail, 'linkedin');

    if (!tokens || !tokens.access_token) {
      throw new Error('No LinkedIn access token found. Please connect your LinkedIn account.');
    }

    // Check if token is expired
    if (tokens.expires_at) {
      const expiresAt = new Date(tokens.expires_at);
      const now = new Date();

      if (expiresAt < now) {
        console.warn('⚠️ LinkedIn access token has expired');
        throw new Error('LinkedIn access token has expired. Please reconnect your account.');
      }

      const hoursUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);
      if (hoursUntilExpiry < 24) {
        console.warn(`⚠️ LinkedIn token expires in ${hoursUntilExpiry.toFixed(1)} hours`);
      }
    }

    console.log('✅ Using LinkedIn access token for user:', userEmail);
    console.log('   Token (first 20 chars):', tokens.access_token.substring(0, 20) + '...');

    return axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'LinkedIn-Version': this.apiVersion,
        'X-Restli-Protocol-Version': '2.0.0',
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
  }

  /**
   * Get organizations the user has admin access to
   * Endpoint: /organizationAcls
   * Docs: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-access-control-by-role
   * Required Scope: rw_organization_admin
   */
  async getUserOrganizations(userEmail) {
    try {
      const client = await this.getAuthenticatedClient(userEmail);

      console.log('🔍 Fetching LinkedIn organizations...');
      console.log('⏳ Waiting 3 seconds for token to propagate...');
      
      // LinkedIn tokens need time to propagate through their systems
      await new Promise(resolve => setTimeout(resolve, 3000));
      console.log('   Using endpoint: /organizationAcls');
      console.log('   Filter: roleAssignee with ADMINISTRATOR role');

      // ✅ Query for organizations where user is ADMINISTRATOR
      const response = await client.get('/organizationAcls', {
        params: {
          q: 'roleAssignee',
          role: 'ADMINISTRATOR',  // ✅ Only get admin access
          state: 'APPROVED',      // ✅ Only approved access
          projection: '(elements*(organizationalTarget,organizationalTarget~(localizedName,vanityName),roleAssignee,state,role))'
        }
      });

      const organizations = response.data.elements || [];
      console.log(`✅ Found ${organizations.length} organization(s) with ADMINISTRATOR access`);

      if (organizations.length === 0) {
        console.warn('⚠️ No organizations found. User may not have ADMINISTRATOR role on any LinkedIn Company Page.');
        console.warn('   To fix this:');
        console.warn('   1. Go to your LinkedIn Company Page');
        console.warn('   2. Click "Admin tools" → "Manage admins"');
        console.warn('   3. Add the logged-in user as ADMINISTRATOR');
      }

      return organizations
        .filter(org => org.state === 'APPROVED' && org.role === 'ADMINISTRATOR')
        .map((org, index) => {
          const orgUrn = org.organizationalTarget;
          const orgId = orgUrn.split(':').pop();
          const orgDetails = org['organizationalTarget~'] || {};

          console.log(`   📄 Organization ${index + 1}:`);
          console.log(`      - Name: ${orgDetails.localizedName || 'Unknown'}`);
          console.log(`      - ID: ${orgId}`);
          console.log(`      - URN: ${orgUrn}`);
          console.log(`      - Role: ${org.role}`);
          console.log(`      - Vanity Name: ${orgDetails.vanityName || 'N/A'}`);

          return {
            id: orgId,
            urn: orgUrn,
            name: orgDetails.localizedName || 'Unknown Organization',
            vanityName: orgDetails.vanityName || null,
            role: org.role || 'ADMINISTRATOR'
          };
        });

    } catch (error) {
      console.error('❌ Error fetching organizations:', error.response?.data || error.message);

      if (error.response?.status === 401) {
        const errorData = error.response.data;
        console.error('🔐 Authentication Error Details:', errorData);
        
        if (errorData.code === 'REVOKED_ACCESS_TOKEN') {
          throw new Error('LinkedIn access token has been revoked. Please reconnect your LinkedIn account.');
        } else if (errorData.serviceErrorCode === 65601) {
          throw new Error('LinkedIn access token is invalid or expired. Please reconnect your LinkedIn account.');
        } else {
          throw new Error('LinkedIn authentication failed. Please reconnect your LinkedIn account.');
        }
      }

      if (error.response?.status === 403) {
        const errorData = error.response.data;
        console.error('🚫 Permission Error Details:', errorData);
        
        throw new Error('Access denied. Ensure:\n1. Your LinkedIn app has rw_organization_admin scope approved\n2. You have ADMINISTRATOR role on a LinkedIn Company Page\n3. The Company Page has verified your app');
      }

      throw new Error(`Failed to fetch LinkedIn organizations: ${error.message}`);
    }
  }

  /**
   * Get organization posts
   * Endpoint: /posts
   * Docs: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
   * Required Scope: r_organization_social
   */
  async getOrganizationPosts(userEmail, organizationId, options = {}) {
    try {
      const client = await this.getAuthenticatedClient(userEmail);

      const {
        count = 20,
        start = 0,
        sortBy = 'LAST_MODIFIED'
      } = options;

      console.log(`📊 Fetching posts for organization: ${organizationId}`);

      const response = await client.get('/posts', {
        params: {
          author: `urn:li:organization:${organizationId}`,
          q: 'author',
          count,
          start,
          sortBy
        }
      });

      const posts = response.data.elements || [];
      console.log(`✅ Retrieved ${posts.length} post(s)`);

      return posts.map(post => ({
        id: post.id,
        urn: post.id,
        author: post.author,
        commentary: post.commentary || '',
        content: post.content || {},
        createdAt: post.createdAt,
        lastModifiedAt: post.lastModifiedAt,
        lifecycleState: post.lifecycleState,
        visibility: post.visibility
      }));

    } catch (error) {
      console.error('❌ Error fetching posts:', error.response?.data || error.message);

      if (error.response?.status === 403) {
        throw new Error('Access denied. Ensure you have r_organization_social scope and ADMINISTRATOR role.');
      }

      throw new Error(`Failed to fetch organization posts: ${error.message}`);
    }
  }

  /**
   * Get post statistics (likes, comments, shares)
   * Endpoint: /socialMetadata/{shareUrn}
   * Docs: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/social-metadata-api
   * Required Scope: r_organization_social
   */
  async getPostStatistics(userEmail, postUrn) {
    try {
      const client = await this.getAuthenticatedClient(userEmail);

      const encodedUrn = encodeURIComponent(postUrn);
      const response = await client.get(`/socialMetadata/${encodedUrn}`);

      const data = response.data;

      // Calculate total reactions
      let totalLikes = 0;
      if (data.reactionSummaries) {
        Object.values(data.reactionSummaries).forEach(reaction => {
          totalLikes += reaction.count || 0;
        });
      }

      const totalComments = data.commentSummary?.count || 0;
      const engagement = totalLikes + totalComments;

      return {
        likes: totalLikes,
        comments: totalComments,
        shares: 0, // LinkedIn API doesn't provide share count in socialMetadata
        engagement: engagement
      };

    } catch (error) {
      console.warn(`⚠️ Could not fetch statistics for post ${postUrn}:`, error.message);
      return {
        likes: 0,
        comments: 0,
        shares: 0,
        engagement: 0
      };
    }
  }

  /**
   * Get organization follower statistics
   * Endpoint: /networkSizes
   * Docs: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-lookup-api
   * Required Scope: rw_organization_admin
   */
  async getFollowerStatistics(userEmail, organizationId) {
    try {
      const client = await this.getAuthenticatedClient(userEmail);

      console.log(`👥 Fetching follower statistics for organization: ${organizationId}`);

      const response = await client.get(`/networkSizes/urn:li:organization:${organizationId}`, {
        params: {
          edgeType: 'CompanyFollowedByMember'
        }
      });

      const followerCount = response.data.firstDegreeSize || 0;
      console.log(`✅ Follower count: ${followerCount}`);

      return {
        totalFollowers: followerCount
      };

    } catch (error) {
      console.warn('⚠️ Could not fetch follower statistics:', error.message);

      if (error.response?.status === 403) {
        console.warn('Access denied for follower stats. Ensure rw_organization_admin scope is granted.');
      }

      return {
        totalFollowers: 0
      };
    }
  }

  /**
   * Calculate engagement rate
   */
  calculateEngagementRate(likes, comments, shares, followers) {
    if (followers === 0) return 0;

    const totalEngagement = likes + comments + shares;
    const rate = (totalEngagement / followers) * 100;

    return parseFloat(rate.toFixed(2));
  }

  /**
   * Get comprehensive metrics for dashboard
   */
  async getComprehensiveMetrics(userEmail, period = 'month') {
    try {
      console.log(`📈 Fetching comprehensive LinkedIn metrics for period: ${period}`);
      console.log(`📧 User: ${userEmail}`);

      // Step 1: Get organizations
      const organizations = await this.getUserOrganizations(userEmail);

      if (organizations.length === 0) {
        return {
          success: false,
          dataAvailable: false,
          error: 'No LinkedIn organizations found',
          message: 'This account does not have ADMINISTRATOR access to any LinkedIn Company Pages. Please:\n1. Go to your LinkedIn Company Page\n2. Click "Admin tools" → "Manage admins"\n3. Add yourself as ADMINISTRATOR'
        };
      }

      console.log(`✅ Using organization: ${organizations[0].name}`);
      const orgId = organizations[0].id;

      // Step 2: Get follower count
      const followerStats = await this.getFollowerStatistics(userEmail, orgId);

      // Step 3: Get recent posts
      const posts = await this.getOrganizationPosts(userEmail, orgId, {
        count: 50
      });

      // Step 4: Calculate date range
      const now = new Date();
      const periodStart = new Date();

      switch (period) {
        case 'week':
          periodStart.setDate(now.getDate() - 7);
          break;
        case 'month':
          periodStart.setMonth(now.getMonth() - 1);
          break;
        case 'quarter':
          periodStart.setMonth(now.getMonth() - 3);
          break;
        default:
          periodStart.setMonth(now.getMonth() - 1);
      }

      // Step 5: Filter posts by date
      const filteredPosts = posts.filter(post => {
        const postDate = new Date(post.createdAt);
        return postDate >= periodStart;
      });

      console.log(`📊 Analyzing ${filteredPosts.length} posts from the last ${period}`);

      // Step 6: Get statistics for each post
      let totalLikes = 0;
      let totalComments = 0;
      let totalShares = 0;
      const postsWithStats = [];

      for (const post of filteredPosts) {
        const stats = await this.getPostStatistics(userEmail, post.urn);

        totalLikes += stats.likes;
        totalComments += stats.comments;
        totalShares += stats.shares;

        postsWithStats.push({
          id: post.id,
          message: post.commentary?.substring(0, 100) || '(No message)',
          likes: stats.likes,
          comments: stats.comments,
          shares: stats.shares,
          reach: stats.engagement,
          createdAt: post.createdAt
        });
      }

      // Step 7: Sort by engagement
      postsWithStats.sort((a, b) => {
        const engagementA = a.likes + a.comments + a.shares;
        const engagementB = b.likes + b.comments + b.shares;
        return engagementB - engagementA;
      });

      // Step 8: Calculate metrics
      const totalEngagement = totalLikes + totalComments + totalShares;
      const engagementRate = this.calculateEngagementRate(
        totalLikes,
        totalComments,
        totalShares,
        followerStats.totalFollowers
      );

      console.log('✅ Metrics calculated successfully');
      console.log(`📊 Total Engagement: ${totalEngagement}`);
      console.log(`📈 Engagement Rate: ${engagementRate}%`);
      console.log(`👥 Followers: ${followerStats.totalFollowers}`);

      return {
        success: true,
        dataAvailable: true,
        period,
        organization: {
          id: orgId,
          name: organizations[0].name,
          vanityName: organizations[0].vanityName
        },
        followers: {
          total: followerStats.totalFollowers
        },
        engagement: {
          likes: totalLikes,
          comments: totalComments,
          shares: totalShares,
          total: totalEngagement,
          engagementRate: engagementRate + '%'
        },
        posts: {
          total: filteredPosts.length,
          topPerforming: postsWithStats.slice(0, 5)
        },
        summary: {
          averageLikesPerPost: filteredPosts.length > 0 ?
            Math.round(totalLikes / filteredPosts.length) : 0,
          averageCommentsPerPost: filteredPosts.length > 0 ?
            Math.round(totalComments / filteredPosts.length) : 0,
          averageSharesPerPost: filteredPosts.length > 0 ?
            Math.round(totalShares / filteredPosts.length) : 0
        }
      };

    } catch (error) {
      console.error('❌ Error fetching comprehensive metrics:', error);

      return {
        success: false,
        dataAvailable: false,
        error: error.message,
        message: error.message || 'Failed to fetch LinkedIn metrics. Please try reconnecting your account.'
      };
    }
  }
}

export default new LinkedInCommunityService();