/**
 * Enhanced Competitor Intelligence Service
 * 
 * Flow:
 * 1. Get competitor domain from GA
 * 2. Fetch social handles from business info
 * 3. Use cached SEO/Website data for user
 * 4. Fetch live social media metrics for competitor
 * 5. Run comprehensive analysis
 */

import userBusinessInfoService from './userBusinessInfoService.js';
import seoCacheService from './seoCacheService.js';
import socialMediaCacheService from './socialMediaCacheService.js';
import competitorCacheService from './competitorCacheService.js';
import socialConnectionService from './socialConnectionService.js';

class EnhancedCompetitorIntelligenceService {
  /**
   * Main entry point: Analyze competitor using GA domain and cached user data
   * @param {string} userEmail - User's email
   * @param {string} competitorDomain - Competitor domain (from GA or manual input)
   * @param {Object} options - Additional options
   * @returns {Object} Complete competitor analysis
   */
  async analyzeCompetitor(userEmail, competitorDomain, options = {}) {
    const { forceRefresh = false } = options;
    const failedMetrics = [];

    try {
      console.log(`\n🎯 Starting Enhanced Competitor Intelligence Analysis`);
      console.log(`   User: ${userEmail}`);
      console.log(`   Competitor: ${competitorDomain}`);
      console.log(`   Force Refresh: ${forceRefresh}\n`);

      // Step 1: Get user's business info (domain + social handles)
      const userBusinessInfo = await userBusinessInfoService.getUserBusinessInfo(userEmail);

      if (!userBusinessInfo || !userBusinessInfo.business_domain) {
        console.warn('⚠️ User business info not found');
        return {
          success: false,
          error: 'User business info not found. Please complete business setup first.',
          failedMetrics: [{ metric: 'businessInfo', error: 'Not configured' }]
        };
      }

      const userDomain = userBusinessInfo.business_domain;
      console.log(`✅ User domain: ${userDomain}`);

      // Step 1.5: Get OAuth-connected social accounts (priority over business info)
      let userSocialHandles = {};
      try {
        userSocialHandles = await socialConnectionService.getSocialHandlesWithPriority(userEmail);
        console.log(`✅ User social handles loaded (OAuth priority)`);
      } catch (err) {
        console.warn(`⚠️ Failed to get social handles: ${err.message}`);
        failedMetrics.push({ metric: 'socialHandles', error: err.message });
      }

      // Step 2: Get competitor's social handles from business info
      const competitors = userBusinessInfo.competitors || [];
      const competitorInfo = competitors.find(c =>
        c.domain.toLowerCase().includes(competitorDomain.toLowerCase()) ||
        competitorDomain.toLowerCase().includes(c.domain.toLowerCase())
      );

      console.log(`📋 Competitor social handles:`, competitorInfo ? {
        instagram: competitorInfo.instagram,
        facebook: competitorInfo.facebook,
        linkedin: competitorInfo.linkedin
      } : 'Not found in business info');

      // Step 3: Check cache first (unless force refresh)
      if (!forceRefresh) {
        try {
          const cachedData = await competitorCacheService.getCompetitorCache(
            userEmail,
            userDomain,
            competitorDomain,
            {
              instagram: userSocialHandles.instagram?.username,
              facebook: userSocialHandles.facebook?.username
            },
            {
              instagram: competitorInfo?.instagram,
              facebook: competitorInfo?.facebook
            }
          );

          if (cachedData && cachedData.yourSite && cachedData.competitorSite) {
            console.log(`✅ Using cached competitor analysis (${cachedData.cacheAge}h old)\n`);
            return {
              success: true,
              cached: true,
              cacheAge: cachedData.cacheAge,
              ...cachedData
            };
          }
        } catch (err) {
          console.warn(`⚠️ Cache check failed: ${err.message}`);
          failedMetrics.push({ metric: 'cache', error: err.message });
        }
      }

      // Step 4: Fetch user's data from cache (SEO, Website Performance, Social Media)
      console.log(`\n📊 Fetching USER data from cache...`);
      let userData = {};
      try {
        userData = await this.getUserDataFromCache(userEmail, userDomain, userBusinessInfo, userSocialHandles);
      } catch (err) {
        console.warn(`⚠️ Failed to fetch user data: ${err.message}`);
        failedMetrics.push({ metric: 'userData', error: err.message });
        userData = {
          domain: userDomain,
          businessName: userBusinessInfo.business_name,
          error: err.message
        };
      }

      // Step 5: Fetch competitor's data (live + some cached)
      console.log(`\n🔍 Fetching COMPETITOR data (live)...`);
      let competitorData = {};
      try {
        competitorData = await this.getCompetitorData(
          competitorDomain,
          competitorInfo,
          userEmail
        );
      } catch (err) {
        console.warn(`⚠️ Failed to fetch competitor data: ${err.message}`);
        failedMetrics.push({ metric: 'competitorData', error: err.message });
        competitorData = {
          domain: competitorDomain,
          name: competitorInfo?.name || competitorDomain,
          error: err.message
        };
      }

      // Step 6: Run comparison analysis
      console.log(`\n⚖️ Running comparison analysis...`);
      const comparison = this.compareMetrics(userData, competitorData);

      // Log any failed metrics for debugging
      if (failedMetrics.length > 0) {
        console.warn(`\n⚠️ Some metrics failed during analysis:`);
        failedMetrics.forEach(f => {
          console.warn(`   - ${f.metric}: ${f.error}`);
        });
        console.log('');
      }

      // Step 7: Build final result
      const result = {
        success: true,
        cached: false,
        partialFailure: failedMetrics.length > 0,
        failedMetrics: failedMetrics.length > 0 ? failedMetrics : undefined,
        yourSite: userData,
        competitorSite: competitorData,
        comparison: comparison,
        timestamp: new Date().toISOString()
      };

      // Step 8: Save to cache (only if we have meaningful data)
      if (userData.domain && competitorData.domain) {
        try {
          await competitorCacheService.saveCompetitorCache(
            userEmail,
            userDomain,
            competitorDomain,
            result,
            {
              instagram: userSocialHandles.instagram?.username,
              facebook: userSocialHandles.facebook?.username
            },
            {
              instagram: competitorInfo?.instagram,
              facebook: competitorInfo?.facebook
            },
            7 // 7 days cache
          );
        } catch (err) {
          console.warn(`⚠️ Failed to save to cache: ${err.message}`);
          // Don't add to failedMetrics as this is not critical
        }
      }

      console.log(`\n✅ Competitor analysis complete!\n`);
      return result;

    } catch (error) {
      console.error('❌ Error in analyzeCompetitor:', error);
      // Return partial results instead of throwing
      return {
        success: false,
        error: error.message,
        failedMetrics: [...failedMetrics, { metric: 'general', error: error.message }],
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get user's data from cached sources
   * Uses: Search Console cache, GA cache, Social Media cache
   */
  async getUserDataFromCache(userEmail, userDomain, businessInfo, socialHandles) {
    const userData = {
      domain: userDomain,
      businessName: businessInfo.business_name,
      businessInfo: {
        name: businessInfo.business_name,
        domain: userDomain,
        industry: businessInfo.business_industry,
        description: businessInfo.business_description
      },
      socialConnections: {
        facebook: socialHandles.facebook || null,
        instagram: socialHandles.instagram || null,
        linkedin: socialHandles.linkedin || null,
        twitter: socialHandles.twitter || null
      }
    };

    // 1. Get SEO data from Search Console cache
    try {
      console.log(`   📈 Fetching SEO data from cache...`);
      const seoData = await seoCacheService.getSearchConsoleCache(userEmail, true);
      if (seoData && seoData.dataAvailable) {
        userData.seo = {
          totalClicks: seoData.totalClicks,
          totalImpressions: seoData.totalImpressions,
          averageCTR: seoData.averageCTR,
          averagePosition: seoData.averagePosition,
          organicTraffic: seoData.organicTraffic,
          topQueries: seoData.topQueries?.slice(0, 10) || [],
          topPages: seoData.topPages?.slice(0, 10) || [],
          fromCache: true,
          lastUpdated: seoData.lastUpdated
        };
        console.log(`   ✅ SEO data loaded (${seoData.totalClicks} clicks)`);
      }
    } catch (error) {
      console.log(`   ⚠️ SEO data not available:`, error.message);
    }

    // 2. Get Website Performance data from cache
    try {
      console.log(`   🚀 Fetching website performance from cache...`);
      const lighthouseData = await seoCacheService.getLighthouseCache(userEmail, userDomain, true);
      if (lighthouseData) {
        userData.lighthouse = lighthouseData;
        userData.pagespeed = {
          performance: lighthouseData.performance,
          accessibility: lighthouseData.accessibility,
          bestPractices: lighthouseData.bestPractices,
          seo: lighthouseData.seo,
          loadTime: lighthouseData.loadTime
        };
        console.log(`   ✅ Lighthouse data loaded (${lighthouseData.performance} performance)`);
      }
    } catch (error) {
      console.log(`   ⚠️ Lighthouse data not available:`, error.message);
    }

    // 3. Get Backlinks data from cache
    try {
      console.log(`   🔗 Fetching backlinks from cache...`);
      const backlinksData = await seoCacheService.getSERankingCache(userEmail, userDomain, true);
      if (backlinksData) {
        userData.backlinks = backlinksData;
        console.log(`   ✅ Backlinks data loaded (${backlinksData.totalBacklinks || 0} backlinks)`);
      }
    } catch (error) {
      console.log(`   ⚠️ Backlinks data not available:`, error.message);
    }

    // 4. Get Google Analytics data from cache
    try {
      console.log(`   📊 Fetching GA data from cache...`);
      const gaData = await seoCacheService.getGoogleAnalyticsCache(userEmail);
      if (gaData && gaData.dataAvailable) {
        userData.analytics = {
          activeUsers: gaData.activeUsers,
          sessions: gaData.sessions,
          bounceRate: gaData.bounceRate,
          avgSessionDuration: gaData.avgSessionDuration,
          pageViews: gaData.pageViews,
          conversions: gaData.conversions,
          fromCache: true,
          lastUpdated: gaData.lastUpdated
        };
        console.log(`   ✅ GA data loaded (${gaData.sessions} sessions)`);
      }
    } catch (error) {
      console.log(`   ⚠️ GA data not available:`, error.message);
    }

    // 5. Get Social Media metrics from cache (using OAuth-connected accounts)
    try {
      console.log(`   📱 Fetching social media metrics from cache...`);

      // Facebook (OAuth priority)
      if (socialHandles.facebook) {
        const fbData = await socialMediaCacheService.getCachedMetrics(userEmail, 'facebook');
        if (fbData) {
          userData.facebook = {
            ...fbData,
            connectionSource: socialHandles.facebook.source,
            isOAuthConnected: socialHandles.facebook.connected,
            connectedUsername: socialHandles.facebook.username
          };
          console.log(`   ✅ Facebook data loaded (${fbData.companyFollowers} followers) [${socialHandles.facebook.source}]`);
        }
      }

      // Instagram (OAuth priority)
      if (socialHandles.instagram) {
        const igData = await socialMediaCacheService.getCachedMetrics(userEmail, 'instagram');
        if (igData) {
          userData.instagram = {
            ...igData,
            connectionSource: socialHandles.instagram.source,
            isOAuthConnected: socialHandles.instagram.connected,
            connectedUsername: socialHandles.instagram.username
          };
          console.log(`   ✅ Instagram data loaded (${igData.companyFollowers} followers) [${socialHandles.instagram.source}]`);
        }
      }

      // LinkedIn (OAuth priority)
      if (socialHandles.linkedin) {
        const liData = await socialMediaCacheService.getCachedMetrics(userEmail, 'linkedin');
        if (liData) {
          userData.linkedin = {
            ...liData,
            connectionSource: socialHandles.linkedin.source,
            isOAuthConnected: socialHandles.linkedin.connected,
            connectedUsername: socialHandles.linkedin.username
          };
          console.log(`   ✅ LinkedIn data loaded (${liData.companyFollowers} followers) [${socialHandles.linkedin.source}]`);
        }
      }
    } catch (error) {
      console.log(`   ⚠️ Social media data not available:`, error.message);
    }

    return userData;
  }

  /**
   * Get competitor's data (live fetch)
   * Fetches: SEO, Website Performance, Social Media, Ads
   */
  async getCompetitorData(competitorDomain, competitorInfo, userEmail) {
    const competitorData = {
      domain: competitorDomain,
      name: competitorInfo?.name || competitorDomain
    };

    // 1. Fetch SEO data (Lighthouse, PageSpeed, Technical SEO)
    try {
      console.log(`   🚀 Fetching competitor website performance...`);
      const lighthouseService = (await import('./lighthouseService.js')).default;
      const lighthouseData = await lighthouseService.analyzeSite(`https://${competitorDomain}`);

      if (lighthouseData) {
        competitorData.lighthouse = lighthouseData;
        competitorData.pagespeed = {
          performance: lighthouseData.performance,
          accessibility: lighthouseData.accessibility,
          bestPractices: lighthouseData.bestPractices,
          seo: lighthouseData.seo,
          loadTime: lighthouseData.loadTime
        };
        console.log(`   ✅ Lighthouse data fetched (${lighthouseData.performance} performance)`);
      }
    } catch (error) {
      console.log(`   ⚠️ Lighthouse failed:`, error.message);
    }

    // 2. Fetch Backlinks data
    try {
      console.log(`   🔗 Fetching competitor backlinks...`);
      const seRankingService = (await import('./seRankingService.js')).default;
      const backlinksData = await seRankingService.getBacklinks(competitorDomain);

      if (backlinksData && !backlinksData.error) {
        competitorData.backlinks = backlinksData;
        console.log(`   ✅ Backlinks fetched (${backlinksData.totalBacklinks || 0} backlinks)`);
      }
    } catch (error) {
      console.log(`   ⚠️ Backlinks failed:`, error.message);
    }

    // 3. Fetch Traffic data
    try {
      console.log(`   📊 Fetching competitor traffic...`);
      const similarWebService = (await import('./similarWebTrafficService.js')).default;
      const trafficData = await similarWebService.getTrafficData(competitorDomain);

      if (trafficData && !trafficData.error) {
        competitorData.traffic = trafficData;
        console.log(`   ✅ Traffic data fetched`);
      }
    } catch (error) {
      console.log(`   ⚠️ Traffic data failed:`, error.message);
    }

    // 4. Fetch Social Media metrics (LIVE)
    try {
      console.log(`   📱 Fetching competitor social media metrics...`);

      // Facebook
      if (competitorInfo?.facebook) {
        try {
          const competitorIntelligenceService = (await import('./competitorIntelligenceService.js')).default;
          const fbUrl = competitorInfo.facebook.startsWith('http')
            ? competitorInfo.facebook
            : `https://www.facebook.com/${competitorInfo.facebook}`;

          const fbResult = await competitorIntelligenceService.getFacebookCompetitorMetrics(fbUrl);
          if (fbResult.success) {
            competitorData.facebook = {
              profile: {
                name: fbResult.data.name,
                url: fbResult.data.url,
                image: fbResult.data.image,
                likes: fbResult.data.likes,
                avgEngagementRate: fbResult.data.engagementRate, // Already in percentage format
                category: fbResult.data.category
              },
              metrics: {
                followers: fbResult.data.followers,
                talkingAbout: fbResult.data.talkingAbout
              },
              engagement: {
                summary: {
                  avgReactionsPerPost: fbResult.data.avgReactions,
                  avgCommentsPerPost: fbResult.data.avgComments,
                  avgSharesPerPost: fbResult.data.avgShares,
                  avgPostReach: fbResult.data.avgPostReach
                }
              },
              lastUpdated: fbResult.data.lastUpdated
            };
            console.log(`   ✅ Facebook data fetched (${fbResult.data.followers} followers)`);
          }
        } catch (fbError) {
          console.log(`   ⚠️ Facebook failed:`, fbError.message);
        }
      }

      // Instagram
      if (competitorInfo?.instagram) {
        try {
          const instagramEngagementService = (await import('./instagramEngagementService.js')).default;
          const igHandle = competitorInfo.instagram.replace('@', '');
          const igData = await instagramEngagementService.getCompleteEngagementMetrics(igHandle);

          if (igData.success) {
            competitorData.instagram = {
              ...igData,
              metrics: {
                followers: igData.profile.followers,
                avgInteractions: igData.engagement.summary.avgInteractionsPerPost,
                avgLikes: igData.engagement.summary.avgLikesPerPost,
                avgComments: igData.engagement.summary.avgCommentsPerPost
              }
            };
            console.log(`   ✅ Instagram data fetched (@${igData.profile.username})`);
          }
        } catch (igError) {
          console.log(`   ⚠️ Instagram failed:`, igError.message);
        }
      }

      // LinkedIn
      if (competitorInfo?.linkedin) {
        try {
          const linkedinRapidApiService = (await import('./linkedinRapidApiService.js')).default;
          const linkedInUrl = competitorInfo.linkedin.startsWith('http')
            ? competitorInfo.linkedin
            : `https://www.linkedin.com/company/${competitorInfo.linkedin}`;

          // Extract username from URL if needed, or pass full URL if supported
          // getCompanyMetrics expects username/vanity name
          let liUsername = competitorInfo.linkedin;
          if (linkedInUrl.includes('/company/')) {
            liUsername = linkedInUrl.split('/company/')[1].replace(/\/$/, '');
          }

          const liData = await linkedinRapidApiService.getCompanyMetrics(liUsername, 20);

          if (liData.dataAvailable) {
            competitorData.linkedin = liData;
            console.log(`   ✅ LinkedIn data fetched (${liData.companyName})`);
          }
        } catch (liError) {
          console.log(`   ⚠️ LinkedIn failed:`, liError.message);
        }
      }
    } catch (error) {
      console.log(`   ⚠️ Social media fetch failed:`, error.message);
    }

    // 5. Fetch Google Ads data
    try {
      console.log(`   📢 Fetching competitor Google Ads...`);
      const { getGoogleAdsMonitoring } = await import('./googleAdsMonitoringService.js');
      const googleAds = await getGoogleAdsMonitoring(competitorDomain);

      if (!googleAds.error) {
        competitorData.googleAds = googleAds;
        console.log(`   ✅ Google Ads fetched (${googleAds.totalAds} ads)`);
      }
    } catch (error) {
      console.log(`   ⚠️ Google Ads failed:`, error.message);
    }

    // 6. Fetch Meta Ads data
    if (competitorInfo?.facebook) {
      try {
        console.log(`   📘 Fetching competitor Meta Ads...`);
        const { getMetaAdsMonitoring } = await import('./metaAdsMonitoringService.js');
        const metaAds = await getMetaAdsMonitoring(competitorInfo.facebook);

        if (!metaAds.error) {
          competitorData.metaAds = metaAds;
          console.log(`   ✅ Meta Ads fetched (${metaAds.totalAds} ads)`);
        }
      } catch (error) {
        console.log(`   ⚠️ Meta Ads failed:`, error.message);
      }
    }

    return competitorData;
  }

  /**
   * Compare user vs competitor metrics
   */
  compareMetrics(userData, competitorData) {
    const comparison = {
      seo: {},
      performance: {},
      social: {},
      overall: {}
    };

    // SEO Comparison
    if (userData.seo && competitorData.backlinks) {
      comparison.seo = {
        userClicks: userData.seo.totalClicks || 0,
        userImpressions: userData.seo.totalImpressions || 0,
        userCTR: userData.seo.averageCTR || 0,
        userPosition: userData.seo.averagePosition || 0,
        competitorBacklinks: competitorData.backlinks.totalBacklinks || 0,
        competitorDomainRank: competitorData.backlinks.domainRank || 0
      };
    }

    // Performance Comparison
    if (userData.pagespeed && competitorData.pagespeed) {
      comparison.performance = {
        userPerformance: userData.pagespeed.performance || 0,
        competitorPerformance: competitorData.pagespeed.performance || 0,
        performanceDiff: (userData.pagespeed.performance || 0) - (competitorData.pagespeed.performance || 0),
        userLoadTime: userData.pagespeed.loadTime || 0,
        competitorLoadTime: competitorData.pagespeed.loadTime || 0
      };
    }

    // Social Media Comparison
    const socialComparison = {};

    // Facebook
    if (userData.facebook && competitorData.facebook) {
      socialComparison.facebook = {
        userFollowers: userData.facebook.companyFollowers || 0,
        competitorFollowers: competitorData.facebook.metrics?.followers || 0,
        followerDiff: (userData.facebook.companyFollowers || 0) - (competitorData.facebook.metrics?.followers || 0),
        userEngagement: userData.facebook.engagementScore?.engagementRate || 0,
        competitorEngagement: competitorData.facebook.profile?.avgEngagementRate || 0
      };
    }

    // Instagram
    if (userData.instagram && competitorData.instagram) {
      // User engagement from official API (engagementScore.engagementRate is numeric %)
      // Competitor engagement from instagramEngagementService (profile.avgEngagementRate is numeric %)
      socialComparison.instagram = {
        userFollowers: userData.instagram.account?.followers || userData.instagram.profile?.followers || userData.instagram.currentFollowers || 0,
        competitorFollowers: competitorData.instagram.profile?.followers || 0,
        followerDiff: (userData.instagram.account?.followers || userData.instagram.profile?.followers || userData.instagram.currentFollowers || 0) - (competitorData.instagram.profile?.followers || 0),
        userEngagement: userData.instagram.engagementScore?.engagementRate || userData.instagram.averages?.engagementRate || 0,
        competitorEngagement: competitorData.instagram.profile?.avgEngagementRate || 0  // Use profile.avgEngagementRate (numeric), NOT engagement.summary.engagementRate (string)
      };
    }

    // LinkedIn
    if (userData.linkedin && competitorData.linkedin) {
      socialComparison.linkedin = {
        userFollowers: userData.linkedin.companyFollowers || 0,
        competitorFollowers: competitorData.linkedin.companyFollowers || 0,
        followerDiff: (userData.linkedin.companyFollowers || 0) - (competitorData.linkedin.companyFollowers || 0),
        userEngagement: userData.linkedin.engagementScore?.engagementRate || 0,
        competitorEngagement: competitorData.linkedin.engagementScore?.engagementRate || 0
      };
    }

    comparison.social = socialComparison;

    // Overall Score
    let userScore = 0;
    let competitorScore = 0;
    let totalCategories = 0;

    // Performance score
    if (comparison.performance.userPerformance && comparison.performance.competitorPerformance) {
      userScore += comparison.performance.userPerformance;
      competitorScore += comparison.performance.competitorPerformance;
      totalCategories++;
    }

    // Social score (average across platforms)
    const socialPlatforms = Object.keys(socialComparison);
    if (socialPlatforms.length > 0) {
      const userSocialScore = socialPlatforms.reduce((sum, platform) =>
        sum + (socialComparison[platform].userEngagement || 0), 0) / socialPlatforms.length;
      const compSocialScore = socialPlatforms.reduce((sum, platform) =>
        sum + (socialComparison[platform].competitorEngagement || 0), 0) / socialPlatforms.length;

      userScore += userSocialScore * 100;
      competitorScore += compSocialScore * 100;
      totalCategories++;
    }

    if (totalCategories > 0) {
      comparison.overall = {
        userScore: Math.round(userScore / totalCategories),
        competitorScore: Math.round(competitorScore / totalCategories),
        winner: userScore > competitorScore ? 'user' : 'competitor'
      };
    }

    return comparison;
  }

  /**
   * Get competitor domain from Google Analytics
   * (Helper method - can be called separately)
   */
  async getCompetitorDomainFromGA(userEmail) {
    try {
      // This would integrate with your GA service
      // For now, return from business info competitors
      const businessInfo = await userBusinessInfoService.getUserBusinessInfo(userEmail);
      const competitors = businessInfo?.competitors || [];

      if (competitors.length === 0) {
        return null;
      }

      // Return first competitor domain
      return competitors[0].domain;
    } catch (error) {
      console.error('Error getting competitor from GA:', error);
      return null;
    }
  }
}

export default new EnhancedCompetitorIntelligenceService();
