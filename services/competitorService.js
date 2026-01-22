import competitorAnalysisService from './competitorAnalysisService.js';
import competitorPageSpeedService from './competitorPageSpeedService.js';
import competitorLighthouseService from './competitorLighthouseService.js';
import technicalSEOService from './technicalSEOService.js';
import similarWebTrafficService from './similarWebTrafficService.js';
import trafficService from './trafficService.js';
import userAnalyticsService from './userAnalyticsService.js';
import seRankingService from './seRankingService.js';

const competitorService = {
  /**
   * Comprehensive competitor analysis comparing two websites
   * @param {string} yourSite - Your website domain
   * @param {string} competitorSite - Competitor website domain
   * @param {string} email - User email for GA/GSC data
   * @returns {Object} Detailed comparison data
   */
  async compareWebsites(yourSite, competitorSite, email = null) {
    console.log(`\n🔄 Starting competitor analysis...`);
    console.log(`   Your Site: ${yourSite}`);
    console.log(`   Competitor: ${competitorSite}`);
    console.log(`   Email: ${email || 'Not provided'}\n`);

    const failedMetrics = [];

    // 🚀 Run BOTH sites in PARALLEL for maximum speed!
    console.log(`🚀 PARALLEL SITE ANALYSIS: Starting both sites simultaneously...`);
    const siteAnalysisStart = Date.now();

    const [yourAnalysisResult, competitorAnalysisResult] = await Promise.allSettled([
      // Analyze YOUR site
      (async () => {
        console.log(`📊 Analyzing YOUR site: ${yourSite}`);
        try {
          const result = await this.analyzeSingleSite(yourSite, email, true);
          if (result.failedMetrics) {
            failedMetrics.push(...result.failedMetrics.map(m => ({ site: 'yours', ...m })));
          }
          return result;
        } catch (error) {
          console.error(`❌ Your site analysis failed: ${error.message}`);
          failedMetrics.push({ site: 'yours', metric: 'all', error: error.message });
          return { success: false, error: error.message };
        }
      })(),

      // Analyze COMPETITOR site
      (async () => {
        console.log(`📊 Analyzing COMPETITOR site: ${competitorSite}`);
        try {
          const result = await this.analyzeSingleSite(competitorSite, null, false);
          if (result.failedMetrics) {
            failedMetrics.push(...result.failedMetrics.map(m => ({ site: 'competitor', ...m })));
          }
          return result;
        } catch (error) {
          console.error(`❌ Competitor site analysis failed: ${error.message}`);
          failedMetrics.push({ site: 'competitor', metric: 'all', error: error.message });
          return { success: false, error: error.message };
        }
      })()
    ]);

    console.log(`⚡ BOTH SITES ANALYZED IN PARALLEL (${Date.now() - siteAnalysisStart}ms)`);

    // Extract results
    const yourAnalysis = yourAnalysisResult.status === 'fulfilled' ? yourAnalysisResult.value : { success: false, error: yourAnalysisResult.reason?.message };
    const competitorAnalysis = competitorAnalysisResult.status === 'fulfilled' ? competitorAnalysisResult.value : { success: false, error: competitorAnalysisResult.reason?.message };

    // Log any failed metrics for debugging
    if (failedMetrics.length > 0) {
      console.warn(`\n⚠️ Some metrics failed during analysis:`);
      failedMetrics.forEach(f => {
        console.warn(`   - [${f.site}] ${f.metric}: ${f.error}`);
      });
      console.log('');
    }

    console.log(`✅ Analysis completed for both sites\n`);

    // Generate comparison insights (handles null/partial data gracefully)
    const comparison = this.generateComparison(yourAnalysis || {}, competitorAnalysis || {});

    return {
      success: true,
      partialFailure: failedMetrics.length > 0,
      failedMetrics: failedMetrics.length > 0 ? failedMetrics : undefined,
      timestamp: new Date().toISOString(),
      yourSite: {
        domain: yourSite,
        ...(yourAnalysis || {})
      },
      competitorSite: {
        domain: competitorSite,
        ...(competitorAnalysis || {})
      },
      comparison: comparison
    };
  },

  /**
   * Analyze a single website using all available tools
   * ⚡ OPTIMIZED: Parallelized non-Chrome services for 2-3x faster analysis
   * @param {string} domain - Website domain to analyze
   * @param {string} email - User email for GA/GSC data (optional)
   * @param {boolean} isUserSite - Whether this is the user's site (affects data source)
   * @returns {Object} Complete analysis data
   */
  async analyzeSingleSite(domain, email = null, isUserSite = false) {
    console.log(`\n⚡ OPTIMIZED ANALYSIS for: ${domain}`);
    const startTime = Date.now();
    const failedMetrics = [];

    try {
      // ========== PHASE 1: Puppeteer analysis (PARALLEL with Phase 2) ==========
      console.log(`\n🔍 PHASE 1: Starting Puppeteer analysis...`);

      const puppeteerStart = Date.now();

      // Use smart caching for Puppeteer analysis
      const puppeteerPromise = (async () => {
        try {
          const puppeteerCacheService = (await import('./puppeteerCacheService.js')).default;

          // Check cache first (7 day cache for both user and competitor domains)
          const cachedData = isUserSite
            ? await puppeteerCacheService.getUserDomainPuppeteerCache(email, domain, false)
            : await puppeteerCacheService.getCompetitorDomainPuppeteerCache(email, domain, false);

          if (cachedData && cachedData.success) {
            console.log(`   ✅ Puppeteer done - Cache (${Date.now() - puppeteerStart}ms, ${cachedData.cacheAge}m old)`);
            return cachedData.data;
          }

          // Cache miss - fetch from API
          console.log(`   📡 Puppeteer cache miss, fetching from API...`);
          const result = await competitorAnalysisService.analyzeWebsite(domain);

          // Save to cache for future use
          if (result.success && isUserSite && email) {
            await puppeteerCacheService.saveUserDomainPuppeteerCache(email, domain, result);
          }

          console.log(`   ✅ Puppeteer done - Fresh API (${Date.now() - puppeteerStart}ms)`);
          return result;
        } catch (err) {
          console.error(`   ❌ Puppeteer failed: ${err.message}`);
          return { status: 'rejected', reason: err };
        }
      })();

      // ========== PHASE 2: Lighthouse audit ==========
      console.log(`🔍 PHASE 2: Starting Lighthouse audit...`);
      const lighthouseStart = Date.now();
      const maxRetries = 2; // Reduced from 3 for speed
      let lighthouseResult;

      // For user's site, try cache first (but NOT expired cache)
      if (isUserSite && email) {
        try {
          const seoCacheService = (await import('./seoCacheService.js')).default;
          const cachedData = await seoCacheService.getLighthouseCache(email, domain, false); // false = don't use expired cache

          if (cachedData) {
            console.log(`   ✅ Lighthouse done - Cache (${Date.now() - lighthouseStart}ms)`);
            lighthouseResult = {
              ...cachedData,
              cached: true
            };
          } else {
            console.log(`   ⏰ Lighthouse cache expired or missing - will fetch fresh`);
          }
        } catch (cacheErr) {
          console.log(`   ⚠️ Cache failed, will run fresh Lighthouse`);
        }
      }

      // If not cached or not user's site, run fresh Lighthouse with better error handling
      if (!lighthouseResult) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            lighthouseResult = await Promise.race([
              competitorLighthouseService.analyzeSite(domain),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Lighthouse timeout (90s)')), 90000)
              )
            ]);
            console.log(`   ✅ Lighthouse done (${Date.now() - lighthouseStart}ms)`);
            break;
          } catch (err) {
            console.error(`   ❌ Lighthouse attempt ${attempt}/${maxRetries} failed: ${err.message}`);
            if (attempt === maxRetries) {
              console.log(`   ⚠️ Lighthouse failed after ${maxRetries} attempts - continuing without it`);
              lighthouseResult = {
                status: 'rejected',
                reason: err,
                error: 'Lighthouse analysis unavailable',
                performanceScore: null,
                accessibilityScore: null,
                bestPracticesScore: null,
                seoScore: null
              };
            } else {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        }
      }

      // ========== PHASE 3: Non-Chrome analyses (PARALLEL with Puppeteer & Lighthouse) ==========
      console.log(`⚡ PHASE 3: Running 4 analyses in PARALLEL with Puppeteer & Lighthouse...`);
      const phase3Start = Date.now();

      const [
        puppeteerResult,
        pagespeedResult,
        technicalSEOResult,
        trafficResult,
        backlinksResult
      ] = await Promise.allSettled([
        // 0. Puppeteer (already started, just await it)
        puppeteerPromise,
        // 1. PageSpeed (API call) - Use CACHE for user's site
        (async () => {
          console.log(`   📱 PageSpeed starting...`);
          const start = Date.now();
          let result;

          if (isUserSite && email) {
            try {
              // Try Lighthouse cache first (PageSpeed data is in lighthouse_cache, not search_console_cache)
              const seoCacheService = (await import('./seoCacheService.js')).default;
              let cachedData = await seoCacheService.getLighthouseCache(email, domain, false);

              // If cache miss or expired, fetch fresh PageSpeed data
              if (!cachedData || !cachedData.desktop || !cachedData.mobile) {
                console.log(`   🔄 PageSpeed cache miss - fetching FRESH data from Google PageSpeed API...`);
                const freshPageSpeed = await competitorPageSpeedService.getPageSpeedData(domain);

                if (freshPageSpeed && (freshPageSpeed.desktop || freshPageSpeed.mobile)) {
                  // Cache the fresh data (cacheLighthouse may not exist, handle gracefully)
                  try {
                    if (typeof seoCacheService.cacheLighthouse === 'function') {
                      await seoCacheService.cacheLighthouse(email, domain, {
                        desktop: freshPageSpeed.desktop,
                        mobile: freshPageSpeed.mobile
                      });
                    }
                  } catch (cacheErr) {
                    console.log(`   ⚠️ Failed to cache PageSpeed data: ${cacheErr.message}`);
                  }
                  result = freshPageSpeed;
                  console.log(`   ✅ PageSpeed done - Fresh API data (${Date.now() - start}ms)`);
                } else {
                  throw new Error('Failed to fetch PageSpeed data');
                }
              } else {
                result = {
                  desktop: cachedData.desktop,
                  mobile: cachedData.mobile,
                  cached: true
                };
                console.log(`   ✅ PageSpeed done - Cache (${Date.now() - start}ms)`);
              }
            } catch (err) {
              console.error(`   ❌ PageSpeed fetch failed: ${err.message}`);
              throw new Error(`Failed to fetch PageSpeed data for your site: ${err.message}`);
            }
          } else {
            result = await competitorPageSpeedService.getPageSpeedData(domain);
            console.log(`   ✅ PageSpeed done - API (${Date.now() - start}ms)`);
          }
          return result;
        })(),

        // 2. Technical SEO (HTTP requests)
        (async () => {
          console.log(`   🔧 Technical SEO starting...`);
          const start = Date.now();
          const result = await technicalSEOService.getTechnicalSEOData(domain);
          console.log(`   ✅ Technical SEO done (${Date.now() - start}ms)`);
          return result;
        })(),

        // 3. Traffic data - Use CACHE for user's site
        (async () => {
          console.log(`   📊 Traffic analysis starting...`);
          const start = Date.now();
          let result;

          if (isUserSite && email) {
            try {
              // Try GA cache first
              const seoCacheService = (await import('./seoCacheService.js')).default;
              let gaData = await seoCacheService.getGoogleAnalyticsCache(email);

              // If cache miss or expired, fetch fresh GA data
              if (!gaData || !gaData.sessions) {
                console.log(`   🔄 GA cache miss - fetching FRESH data from Google Analytics...`);
                const userAnalyticsService = (await import('./userAnalyticsService.js')).default;
                const freshGA = await userAnalyticsService.getAnalyticsData(email, 'month');

                if (freshGA && freshGA.sessions) {
                  // Cache the fresh data
                  await seoCacheService.cacheGoogleAnalytics(email, freshGA);
                  gaData = freshGA;
                  console.log(`   ✅ Fresh GA data fetched and cached`);
                } else {
                  throw new Error('Failed to fetch Google Analytics data');
                }
              }

              if (gaData && gaData.sessions) {
                // Sessions can be either a number (from cache) or an object (from live fetch)
                let totalSessions = 0;
                let avgDailySessions = 0;

                if (typeof gaData.sessions === 'number') {
                  // Cache format: sessions is a single number
                  totalSessions = gaData.sessions;
                  avgDailySessions = Math.round(totalSessions / 30); // Assuming 30 days
                } else if (typeof gaData.sessions === 'object') {
                  // Live format: sessions is an object with daily data
                  const sessionValues = Object.values(gaData.sessions || {});
                  totalSessions = sessionValues.reduce((a, b) => a + b, 0);
                  avgDailySessions = sessionValues.length > 0 ? totalSessions / sessionValues.length : 0;
                }

                result = {
                  success: true,
                  source: 'google_analytics',
                  data: gaData,
                  metrics: {
                    monthlyVisits: Math.round(totalSessions),
                    avgDailyVisits: Math.round(avgDailySessions),
                    bounceRate: gaData.bounceRate || 'N/A',
                    avgSessionDuration: gaData.avgSessionDuration || 'N/A'
                  },
                  cached: gaData.fromCache || false
                };
                console.log(`   ✅ Traffic done - GA: ${totalSessions} sessions (${Date.now() - start}ms)`);
              } else {
                throw new Error('Google Analytics data unavailable');
              }
            } catch (err) {
              console.error(`   ❌ GA fetch failed: ${err.message}`);
              throw new Error(`Failed to fetch traffic data for your site: ${err.message}`);
            }
          } else {
            result = await similarWebTrafficService.getCompetitorTraffic(domain);
            console.log(`   ✅ Traffic done - SimilarWeb (${Date.now() - start}ms)`);
          }
          return result;
        })(),

        // 4. SE Ranking Backlinks - Use CACHE for user's site
        (async () => {
          console.log(`   🔗 SE Ranking backlinks starting...`);
          const start = Date.now();
          let result;

          if (isUserSite && email) {
            try {
              // Try cache first
              const seoCacheService = (await import('./seoCacheService.js')).default;
              const cachedBacklinks = await seoCacheService.getSERankingCache(email, domain, true);

              if (cachedBacklinks) {
                console.log(`   ✅ Backlinks done - Cache (${Date.now() - start}ms)`);
                result = {
                  ...cachedBacklinks,
                  cached: true
                };
              } else {
                result = await seRankingService.getBacklinksSummary(domain);
                console.log(`   ✅ Backlinks done - API (${Date.now() - start}ms)`);
              }
            } catch (err) {
              result = await seRankingService.getBacklinksSummary(domain);
              console.log(`   ✅ Backlinks done - API fallback (${Date.now() - start}ms)`);
            }
          } else {
            result = await seRankingService.getBacklinksSummary(domain);
            console.log(`   ✅ Backlinks done - API (${Date.now() - start}ms)`);
          }
          return result;
        })()
      ]);

      const phase3Time = Date.now() - phase3Start;
      console.log(`✅ PHASE 3 complete - All parallel tasks done (${phase3Time}ms)\n`);

      const totalTime = Date.now() - startTime;
      const puppeteerTime = Date.now() - puppeteerStart;
      const lighthouseTime = Date.now() - lighthouseStart;

      console.log(`🎉 TOTAL ANALYSIS TIME: ${(totalTime / 1000).toFixed(1)}s`);
      console.log(`   Puppeteer: ${(puppeteerTime / 1000).toFixed(1)}s`);
      console.log(`   Lighthouse: ${(lighthouseTime / 1000).toFixed(1)}s`);
      console.log(`   Other APIs (parallel): ${(phase3Time / 1000).toFixed(1)}s\n`);

      // Track failed metrics for debugging
      if (puppeteerResult.status !== 'fulfilled') {
        const errMsg = puppeteerResult.reason?.message || 'Analysis failed';
        console.warn(`   ⚠️ Puppeteer metric failed: ${errMsg}`);
        failedMetrics.push({ metric: 'puppeteer', error: errMsg });
      }
      if (pagespeedResult.status !== 'fulfilled') {
        const errMsg = pagespeedResult.reason?.message || 'PageSpeed failed';
        console.warn(`   ⚠️ PageSpeed metric failed: ${errMsg}`);
        failedMetrics.push({ metric: 'pagespeed', error: errMsg });
      }
      if (technicalSEOResult.status !== 'fulfilled') {
        const errMsg = technicalSEOResult.reason?.message || 'Technical SEO failed';
        console.warn(`   ⚠️ Technical SEO metric failed: ${errMsg}`);
        failedMetrics.push({ metric: 'technicalSEO', error: errMsg });
      }
      if (trafficResult.status !== 'fulfilled') {
        const errMsg = trafficResult.reason?.message || 'Traffic data unavailable';
        console.warn(`   ⚠️ Traffic metric failed: ${errMsg}`);
        failedMetrics.push({ metric: 'traffic', error: errMsg });
      }
      if (backlinksResult.status !== 'fulfilled') {
        const errMsg = backlinksResult.reason?.message || 'Backlinks data unavailable';
        console.warn(`   ⚠️ Backlinks metric failed: ${errMsg}`);
        failedMetrics.push({ metric: 'backlinks', error: errMsg });
      }
      if (lighthouseResult.status === 'rejected') {
        const errMsg = lighthouseResult.reason?.message || 'Audit failed';
        console.warn(`   ⚠️ Lighthouse metric failed: ${errMsg}`);
        failedMetrics.push({ metric: 'lighthouse', error: errMsg });
      }

      return {
        // Puppeteer analysis
        puppeteer: puppeteerResult.status === 'fulfilled' ? puppeteerResult.value : {
          success: false,
          error: puppeteerResult.reason?.message || 'Analysis failed'
        },

        // Lighthouse audit
        lighthouse: lighthouseResult.status !== 'rejected' ? lighthouseResult : {
          dataAvailable: false,
          error: lighthouseResult.reason?.message || 'Audit failed'
        },

        // PageSpeed metrics
        pagespeed: pagespeedResult.status === 'fulfilled' ? pagespeedResult.value : {
          dataAvailable: false,
          error: pagespeedResult.reason?.message || 'PageSpeed failed'
        },

        // Technical SEO
        technicalSEO: technicalSEOResult.status === 'fulfilled' ? technicalSEOResult.value : {
          score: 0,
          error: technicalSEOResult.reason?.message || 'Technical SEO failed'
        },

        // Traffic data
        traffic: trafficResult.status === 'fulfilled' ? trafficResult.value : {
          success: false,
          error: trafficResult.reason?.message || 'Traffic data unavailable'
        },

        // SE Ranking Backlinks
        backlinks: backlinksResult.status === 'fulfilled' ? backlinksResult.value : {
          available: false,
          error: backlinksResult.reason?.message || 'Backlinks data unavailable',
          totalBacklinks: 0,
          totalRefDomains: 0
        },

        // Performance metadata
        _performance: {
          totalTime: totalTime,
          puppeteerTime: puppeteerTime,
          lighthouseTime: lighthouseTime,
          parallelTime: phase3Time
        },

        // Failed metrics tracking
        failedMetrics: failedMetrics.length > 0 ? failedMetrics : undefined
      };

    } catch (error) {
      console.error(`❌ Error analyzing ${domain}:`, error.message);
      failedMetrics.push({ metric: 'general', error: error.message });
      // Return partial data instead of throwing
      return {
        success: false,
        error: error.message,
        failedMetrics
      };
    }
  },

  /**
   * Generate comparison insights between two sites
   */
  generateComparison(yourData, competitorData) {
    const comparison = {
      performance: this.comparePerformance(yourData, competitorData),
      seo: this.compareSEO(yourData, competitorData),
      content: this.compareContent(yourData, competitorData),
      technology: this.compareTechnology(yourData, competitorData),
      security: this.compareSecurity(yourData, competitorData),
      traffic: this.compareTraffic(yourData, competitorData),
      backlinks: this.compareBacklinks(yourData, competitorData)
    };

    // Calculate overall winner and gaps
    comparison.summary = this.generateSummary(comparison);

    return comparison;
  },

  /**
   * Compare performance metrics
   */
  comparePerformance(yourData, competitorData) {
    const yourLighthouse = yourData.lighthouse;
    const compLighthouse = competitorData.lighthouse;
    const yourPagespeed = yourData.pagespeed;
    const compPagespeed = competitorData.pagespeed;

    const comparison = {
      lighthouse: {
        your: {
          performance: yourLighthouse?.categories?.performance?.score || 0,
          accessibility: yourLighthouse?.categories?.accessibility?.score || 0,
          bestPractices: yourLighthouse?.categories?.['best-practices']?.score || 0,
          seo: yourLighthouse?.categories?.seo?.score || 0
        },
        competitor: {
          performance: compLighthouse?.categories?.performance?.score || 0,
          accessibility: compLighthouse?.categories?.accessibility?.score || 0,
          bestPractices: compLighthouse?.categories?.['best-practices']?.score || 0,
          seo: compLighthouse?.categories?.seo?.score || 0
        }
      },
      pagespeed: {
        your: {
          desktop: yourPagespeed?.desktop?.performanceScore || 0,
          mobile: yourPagespeed?.mobile?.performanceScore || 0
        },
        competitor: {
          desktop: compPagespeed?.desktop?.performanceScore || 0,
          mobile: compPagespeed?.mobile?.performanceScore || 0
        }
      }
    };

    // Determine winner
    const yourAvg = (comparison.lighthouse.your.performance +
      comparison.pagespeed.your.desktop +
      comparison.pagespeed.your.mobile) / 3;
    const compAvg = (comparison.lighthouse.competitor.performance +
      comparison.pagespeed.competitor.desktop +
      comparison.pagespeed.competitor.mobile) / 3;

    comparison.winner = yourAvg > compAvg ? 'yours' : 'competitor';
    comparison.gap = Math.abs(yourAvg - compAvg).toFixed(1);

    return comparison;
  },

  /**
   * Compare SEO elements
   */
  compareSEO(yourData, competitorData) {
    const yourSEO = yourData.puppeteer?.seo || {};
    const compSEO = competitorData.puppeteer?.seo || {};

    const comparison = {
      metaTags: {
        your: {
          hasTitle: !!yourSEO.title,
          hasDescription: !!yourSEO.metaDescription,
          hasCanonical: !!yourSEO.canonical,
          titleLength: yourSEO.title?.length || 0,
          descriptionLength: yourSEO.metaDescription?.length || 0
        },
        competitor: {
          hasTitle: !!compSEO.title,
          hasDescription: !!compSEO.metaDescription,
          hasCanonical: !!compSEO.canonical,
          titleLength: compSEO.title?.length || 0,
          descriptionLength: compSEO.metaDescription?.length || 0
        }
      },
      headings: {
        your: yourSEO.headings || { h1Count: 0, h2Count: 0, h3Count: 0 },
        competitor: compSEO.headings || { h1Count: 0, h2Count: 0, h3Count: 0 }
      },
      socialMedia: {
        your: {
          hasOpenGraph: !!(yourSEO.openGraph?.title || yourSEO.openGraph?.description),
          hasTwitterCard: !!(yourSEO.twitterCard?.card)
        },
        competitor: {
          hasOpenGraph: !!(compSEO.openGraph?.title || compSEO.openGraph?.description),
          hasTwitterCard: !!(compSEO.twitterCard?.card)
        }
      },
      structuredData: {
        your: yourSEO.schemaMarkup?.length || 0,
        competitor: compSEO.schemaMarkup?.length || 0
      }
    };

    // Calculate SEO score
    const yourScore = this.calculateSEOScore(comparison.metaTags.your, comparison.headings.your, comparison.socialMedia.your, comparison.structuredData.your);
    const compScore = this.calculateSEOScore(comparison.metaTags.competitor, comparison.headings.competitor, comparison.socialMedia.competitor, comparison.structuredData.competitor);

    comparison.scores = { your: yourScore, competitor: compScore };
    comparison.winner = yourScore > compScore ? 'yours' : 'competitor';

    return comparison;
  },

  /**
   * Calculate SEO score
   */
  calculateSEOScore(meta, headings, social, structuredData) {
    let score = 0;

    // Meta tags (40 points)
    if (meta.hasTitle) score += 10;
    if (meta.hasDescription) score += 10;
    if (meta.hasCanonical) score += 10;
    if (meta.titleLength >= 30 && meta.titleLength <= 60) score += 5;
    if (meta.descriptionLength >= 120 && meta.descriptionLength <= 160) score += 5;

    // Headings (20 points)
    if (headings.h1Count === 1) score += 10; // Exactly one H1
    if (headings.h2Count > 0) score += 5;
    if (headings.h3Count > 0) score += 5;

    // Social media (20 points)
    if (social.hasOpenGraph) score += 10;
    if (social.hasTwitterCard) score += 10;

    // Structured data (20 points)
    if (structuredData > 0) score += 20;

    return score;
  },

  /**
   * Compare content metrics
   */
  compareContent(yourData, competitorData) {
    const yourContent = yourData.puppeteer?.content || {};
    const compContent = competitorData.puppeteer?.content || {};

    return {
      your: {
        wordCount: yourContent.wordCount || 0,
        paragraphCount: yourContent.paragraphCount || 0,
        imageCount: yourContent.images?.total || 0,
        imageAltCoverage: yourContent.images?.altCoverage || 0,
        totalLinks: yourContent.links?.total || 0,
        internalLinks: yourContent.links?.internal || 0,
        externalLinks: yourContent.links?.external || 0,
        brokenLinks: yourContent.links?.broken || 0
      },
      competitor: {
        wordCount: compContent.wordCount || 0,
        paragraphCount: compContent.paragraphCount || 0,
        imageCount: compContent.images?.total || 0,
        imageAltCoverage: compContent.images?.altCoverage || 0,
        totalLinks: compContent.links?.total || 0,
        internalLinks: compContent.links?.internal || 0,
        externalLinks: compContent.links?.external || 0,
        brokenLinks: compContent.links?.broken || 0
      },
      winner: (yourContent.wordCount || 0) > (compContent.wordCount || 0) ? 'yours' : 'competitor'
    };
  },

  /**
   * Compare technology stacks
   */
  compareTechnology(yourData, competitorData) {
    const yourTech = yourData.puppeteer?.technology || {};
    const compTech = competitorData.puppeteer?.technology || {};

    return {
      your: {
        cms: yourTech.cms || 'Unknown',
        frameworks: yourTech.frameworks || [],
        analytics: yourTech.analytics || [],
        thirdPartyScripts: yourTech.thirdPartyScripts?.length || 0
      },
      competitor: {
        cms: compTech.cms || 'Unknown',
        frameworks: compTech.frameworks || [],
        analytics: compTech.analytics || [],
        thirdPartyScripts: compTech.thirdPartyScripts?.length || 0
      }
    };
  },

  /**
   * Compare security & technical aspects
   */
  compareSecurity(yourData, competitorData) {
    console.log('🔍 compareSecurity - yourData.puppeteer keys:', yourData.puppeteer ? Object.keys(yourData.puppeteer) : 'undefined');
    console.log('🔍 compareSecurity - yourData.puppeteer?.robotsTxt:', yourData.puppeteer?.robotsTxt);
    console.log('🔍 compareSecurity - yourData.puppeteer?.sitemap:', yourData.puppeteer?.sitemap);
    console.log('🔍 compareSecurity - competitorData.puppeteer keys:', competitorData.puppeteer ? Object.keys(competitorData.puppeteer) : 'undefined');

    const yourSecurity = yourData.puppeteer?.security || {};
    const compSecurity = competitorData.puppeteer?.security || {};

    const result = {
      your: {
        isHTTPS: yourSecurity.isHTTPS || false,
        hasCDN: !!yourSecurity.cdn,
        cdnProvider: yourSecurity.cdn || null,
        hasMixedContent: yourSecurity.mixedContent || false,
        hasRobotsTxt: yourData.puppeteer?.robotsTxt?.exists || false,
        hasSitemap: yourData.puppeteer?.sitemap?.exists || false,
        sitemapUrls: yourData.puppeteer?.sitemap?.urlCount || 0
      },
      competitor: {
        isHTTPS: compSecurity.isHTTPS || false,
        hasCDN: !!compSecurity.cdn,
        cdnProvider: compSecurity.cdn || null,
        hasMixedContent: compSecurity.mixedContent || false,
        hasRobotsTxt: competitorData.puppeteer?.robotsTxt?.exists || false,
        hasSitemap: competitorData.puppeteer?.sitemap?.exists || false,
        sitemapUrls: competitorData.puppeteer?.sitemap?.urlCount || 0
      }
    };

    console.log('🔍 compareSecurity result:', JSON.stringify(result, null, 2));
    return result;
  },

  /**
   * Compare traffic metrics (NEW)
   */
  compareTraffic(yourData, competitorData) {
    const yourTraffic = yourData.traffic || {};
    const compTraffic = competitorData.traffic || {};

    const comparison = {
      available: yourTraffic.success && compTraffic.success,
      your: {
        source: yourTraffic.source || 'unknown',
        monthlyVisits: yourTraffic.metrics?.monthlyVisits || 'N/A',
        avgVisitDuration: yourTraffic.metrics?.avgVisitDuration || 'N/A',
        pagesPerVisit: yourTraffic.metrics?.pagesPerVisit || 'N/A',
        bounceRate: yourTraffic.metrics?.bounceRate || 'N/A',
        trafficSources: yourTraffic.metrics?.trafficSources || {},
        globalRank: yourTraffic.metrics?.globalRank || 'N/A'
      },
      competitor: {
        source: compTraffic.source || 'unknown',
        monthlyVisits: compTraffic.metrics?.monthlyVisits || 'N/A',
        avgVisitDuration: compTraffic.metrics?.avgVisitDuration || 'N/A',
        pagesPerVisit: compTraffic.metrics?.pagesPerVisit || 'N/A',
        bounceRate: compTraffic.metrics?.bounceRate || 'N/A',
        trafficSources: compTraffic.metrics?.trafficSources || {},
        globalRank: compTraffic.metrics?.globalRank || 'N/A'
      },
      insights: {
        trafficWinner: null,
        engagementWinner: null,
        trafficGap: 0,
        recommendations: []
      }
    };

    if (comparison.available) {
      // Determine traffic winner
      const yourVisits = typeof yourTraffic.metrics?.monthlyVisits === 'number'
        ? yourTraffic.metrics.monthlyVisits : 0;
      const compVisits = typeof compTraffic.metrics?.monthlyVisits === 'number'
        ? compTraffic.metrics.monthlyVisits : 0;

      if (yourVisits > compVisits) {
        comparison.insights.trafficWinner = 'yours';
        comparison.insights.trafficGap = yourVisits - compVisits;
      } else {
        comparison.insights.trafficWinner = 'competitor';
        comparison.insights.trafficGap = compVisits - yourVisits;
      }

      // Determine engagement winner
      const yourBounce = typeof yourTraffic.metrics?.bounceRate === 'number'
        ? yourTraffic.metrics.bounceRate : 100;
      const compBounce = typeof compTraffic.metrics?.bounceRate === 'number'
        ? compTraffic.metrics.bounceRate : 100;
      const yourPages = typeof yourTraffic.metrics?.pagesPerVisit === 'number'
        ? yourTraffic.metrics.pagesPerVisit : 0;
      const compPages = typeof compTraffic.metrics?.pagesPerVisit === 'number'
        ? compTraffic.metrics.pagesPerVisit : 0;

      let yourEngagementScore = 0;
      let compEngagementScore = 0;

      // Lower bounce rate is better
      if (yourBounce < compBounce) yourEngagementScore++;
      else compEngagementScore++;

      // Higher pages per visit is better
      if (yourPages > compPages) yourEngagementScore++;
      else compEngagementScore++;

      comparison.insights.engagementWinner = yourEngagementScore > compEngagementScore
        ? 'yours' : 'competitor';

      // Generate recommendations
      if (comparison.insights.trafficWinner === 'competitor') {
        comparison.insights.recommendations.push(
          `Competitor has ${((compVisits / yourVisits - 1) * 100).toFixed(0)}% more traffic. Focus on SEO and content marketing.`
        );
      }

      if (comparison.insights.engagementWinner === 'competitor') {
        comparison.insights.recommendations.push(
          'Improve user engagement by enhancing content quality and site navigation.'
        );
      }

      if (compBounce < yourBounce) {
        comparison.insights.recommendations.push(
          `Reduce bounce rate from ${yourBounce.toFixed(1)}% to match competitor's ${compBounce.toFixed(1)}%.`
        );
      }
    }

    return comparison;
  },

  /**
   * Compare backlinks data (SE Ranking)
   */
  compareBacklinks(yourData, competitorData) {
    const yourBacklinks = yourData.backlinks || {};
    const compBacklinks = competitorData.backlinks || {};

    const comparison = {
      available: yourBacklinks.available && compBacklinks.available,
      your: {
        totalBacklinks: yourBacklinks.totalBacklinks || 0,
        totalRefDomains: yourBacklinks.totalRefDomains || 0,
        source: yourBacklinks.source || 'SE Ranking'
      },
      competitor: {
        totalBacklinks: compBacklinks.totalBacklinks || 0,
        totalRefDomains: compBacklinks.totalRefDomains || 0,
        source: compBacklinks.source || 'SE Ranking'
      },
      winner: null,
      difference: 0
    };

    if (comparison.available) {
      const yourTotal = comparison.your.totalBacklinks;
      const compTotal = comparison.competitor.totalBacklinks;

      if (yourTotal > compTotal) {
        comparison.winner = 'yours';
        comparison.difference = yourTotal - compTotal;
      } else if (compTotal > yourTotal) {
        comparison.winner = 'competitor';
        comparison.difference = compTotal - yourTotal;
      } else {
        comparison.winner = 'tie';
        comparison.difference = 0;
      }
    }

    return comparison;
  },

  /**
   * Compare content update activity - REMOVED FOR PERFORMANCE
   */
  compareContentUpdates(yourData, competitorData) {
    return { removed: true };

    const comparison = {
      your: {
        hasRSS: yourContent.rss?.found || false,
        hasSitemap: yourContent.sitemap?.found || false,
        recentPosts: yourContent.rss?.recentPosts?.length || 0,
        totalPosts: yourContent.rss?.totalPosts || 0,
        lastUpdated: yourContent.contentActivity?.lastContentDate || 'Unknown',
        updateFrequency: yourContent.contentActivity?.updateFrequency || 'unknown',
        averagePostsPerMonth: yourContent.contentActivity?.averagePostsPerMonth || 0,
        isActive: yourContent.contentActivity?.isActive || false,
        contentVelocity: yourContent.contentActivity?.contentVelocity || 'unknown',
        recentActivityCount: yourContent.contentActivity?.recentActivityCount || 0
      },
      competitor: {
        hasRSS: compContent.rss?.found || false,
        hasSitemap: compContent.sitemap?.found || false,
        recentPosts: compContent.rss?.recentPosts?.length || 0,
        totalPosts: compContent.rss?.totalPosts || 0,
        lastUpdated: compContent.contentActivity?.lastContentDate || 'Unknown',
        updateFrequency: compContent.contentActivity?.updateFrequency || 'unknown',
        averagePostsPerMonth: compContent.contentActivity?.averagePostsPerMonth || 0,
        isActive: compContent.contentActivity?.isActive || false,
        contentVelocity: compContent.contentActivity?.contentVelocity || 'unknown',
        recentActivityCount: compContent.contentActivity?.recentActivityCount || 0
      },
      insights: {
        moreActive: null,
        contentGap: 0,
        velocityComparison: null,
        recommendations: []
      }
    };

    // Determine who is more active
    if (comparison.your.recentActivityCount > comparison.competitor.recentActivityCount) {
      comparison.insights.moreActive = 'yours';
    } else if (comparison.competitor.recentActivityCount > comparison.your.recentActivityCount) {
      comparison.insights.moreActive = 'competitor';
    } else {
      comparison.insights.moreActive = 'equal';
    }

    // Calculate content gap
    comparison.insights.contentGap =
      comparison.competitor.averagePostsPerMonth - comparison.your.averagePostsPerMonth;

    // Velocity comparison
    const velocityScore = { 'high': 4, 'medium': 3, 'low': 2, 'minimal': 1, 'unknown': 0 };
    const yourScore = velocityScore[comparison.your.contentVelocity] || 0;
    const compScore = velocityScore[comparison.competitor.contentVelocity] || 0;

    if (compScore > yourScore) {
      comparison.insights.velocityComparison = 'competitor_faster';
    } else if (yourScore > compScore) {
      comparison.insights.velocityComparison = 'yours_faster';
    } else {
      comparison.insights.velocityComparison = 'equal';
    }

    // Generate recommendations
    if (comparison.insights.moreActive === 'competitor') {
      comparison.insights.recommendations.push(
        `Competitor publishes ${comparison.competitor.averagePostsPerMonth} posts/month vs your ${comparison.your.averagePostsPerMonth}. Increase content production.`
      );
    }

    if (!comparison.your.hasRSS && comparison.competitor.hasRSS) {
      comparison.insights.recommendations.push(
        'Add an RSS feed to help users and search engines discover new content.'
      );
    }

    if (!comparison.your.isActive && comparison.competitor.isActive) {
      comparison.insights.recommendations.push(
        'Your content is stale. Publish fresh content regularly to stay competitive.'
      );
    }

    if (comparison.insights.contentGap > 5) {
      comparison.insights.recommendations.push(
        `Significant content gap: Aim to publish at least ${Math.ceil(comparison.competitor.averagePostsPerMonth)} posts per month.`
      );
    }

    return comparison;
  },

  /**
   * Generate summary and recommendations
   */
  generateSummary(comparison) {
    const summary = {
      strengths: [],
      weaknesses: [],
      opportunities: [],
      recommendations: [],
      marketShare: this.calculateMarketShare(comparison)
    };

    // Performance analysis
    if (comparison.performance.winner === 'yours') {
      summary.strengths.push('Better overall performance scores');
    } else {
      summary.weaknesses.push('Lower performance scores than competitor');
      summary.recommendations.push('Optimize images, reduce JavaScript, and improve server response times');
    }

    // SEO analysis
    if (comparison.seo.winner === 'yours') {
      summary.strengths.push('Better SEO optimization');
    } else {
      summary.weaknesses.push('SEO implementation needs improvement');
      summary.recommendations.push('Improve meta tags, add structured data, and optimize heading structure');
    }

    // Content analysis
    if (comparison.content.winner === 'yours') {
      summary.strengths.push('More comprehensive content');
    } else {
      summary.opportunities.push('Create more in-depth content to match competitor');
    }

    // Traffic analysis (NEW)
    if (comparison.traffic?.available) {
      if (comparison.traffic.insights.trafficWinner === 'yours') {
        summary.strengths.push('Higher website traffic than competitor');
      } else {
        summary.weaknesses.push('Lower website traffic than competitor');
        summary.recommendations.push(...comparison.traffic.insights.recommendations);
      }
    }

    // Security
    if (!comparison.security.your.isHTTPS) {
      summary.weaknesses.push('Not using HTTPS');
      summary.recommendations.push('Implement SSL certificate for security');
    }

    if (!comparison.security.your.hasCDN && comparison.security.competitor.hasCDN) {
      summary.opportunities.push('Implement CDN for better performance');
    }

    return summary;
  },

  /**
   * Calculate market share based on SEO, traffic, and backlinks
   */
  calculateMarketShare(comparison) {
    let yourScore = 0;
    let competitorScore = 0;
    let totalMetrics = 0;

    // SEO Score (weight: 30%)
    if (comparison.seo && comparison.seo.scores) {
      // Use actual SEO scores from compareSEO calculation (0-100 scale)
      const yourSeoScore = comparison.seo.scores.your || 0;
      const compSeoScore = comparison.seo.scores.competitor || 0;
      const totalSeoScore = yourSeoScore + compSeoScore;

      if (totalSeoScore > 0) {
        yourScore += (yourSeoScore / totalSeoScore) * 30;
        competitorScore += (compSeoScore / totalSeoScore) * 30;
        totalMetrics += 30;
      }
    }

    // Traffic Score (weight: 40%)
    if (comparison.traffic?.available) {
      const yourVisits = typeof comparison.traffic.your?.monthlyVisits === 'number'
        ? comparison.traffic.your.monthlyVisits : 0;
      const compVisits = typeof comparison.traffic.competitor?.monthlyVisits === 'number'
        ? comparison.traffic.competitor.monthlyVisits : 0;

      const totalVisits = yourVisits + compVisits;
      if (totalVisits > 0) {
        yourScore += (yourVisits / totalVisits) * 40;
        competitorScore += (compVisits / totalVisits) * 40;
        totalMetrics += 40;
      }
    }

    // Backlinks Score (weight: 30%)
    if (comparison.backlinks?.available) {
      const yourBacklinks = comparison.backlinks.your?.totalBacklinks || 0;
      const compBacklinks = comparison.backlinks.competitor?.totalBacklinks || 0;

      const totalBacklinks = yourBacklinks + compBacklinks;
      if (totalBacklinks > 0) {
        yourScore += (yourBacklinks / totalBacklinks) * 30;
        competitorScore += (compBacklinks / totalBacklinks) * 30;
        totalMetrics += 30;
      }
    }

    // Normalize to 100%
    const totalScore = yourScore + competitorScore;
    if (totalScore > 0 && totalMetrics > 0) {
      return {
        yours: Math.round((yourScore / totalScore) * 100),
        competitor: Math.round((competitorScore / totalScore) * 100)
      };
    }

    // Default fallback if no data
    return {
      yours: 0,
      competitor: 0
    };
  }
};

export default competitorService;
