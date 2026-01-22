import openaiService from './openaiService.js';
import { createClient } from '@supabase/supabase-js';
import { PLAN_FEATURES } from '../config/planFeatures.js';
import dotenv from 'dotenv';

dotenv.config();

let supabaseClient = null;

const getSupabaseClient = () => {
  if (!supabaseClient) {
    supabaseClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
  }
  return supabaseClient;
};

/**
 * AI Insights Service
 * Generates actionable business recommendations using OpenAI
 * Analyzes metrics from: SEO & Website Performance, Competitor Intelligence, Social Media Performance
 */
class AIInsightsService {
  /**
   * Get cached insights if they exist and are less than 10 hours old
   * @param {string} userEmail - User's email
   * @returns {Promise<Object|null>} Cached insights or null
   */
  async getCachedInsights(userEmail) {
    try {
      const supabase = getSupabaseClient();
      const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000); // 10 hours in milliseconds

      const { data, error } = await supabase
        .from('ai_insights')
        .select('*')
        .eq('user_email', userEmail)
        .gte('created_at', tenHoursAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return null;
      }

      console.log(`📦 Found cached insights from ${new Date(data.created_at).toLocaleString()}`);
      return data;
    } catch (error) {
      console.log('No valid cache found, will generate new insights');
      return null;
    }
  }

  /**
   * Generate AI insights for a user
   * @param {string} userEmail - User's email
   * @param {string} category - Category of insights: 'all', 'seo', 'competitor', 'social'
   * @returns {Promise<Object>} AI-generated insights
   */
  async generateInsights(userEmail, category = 'all') {
    try {
      // Check for valid cache first (within 10 hours)
      const cached = await this.getCachedInsights(userEmail);
      if (cached) {
        console.log(`📦 Using cached AI insights for: ${userEmail} (age: ${Math.round((Date.now() - new Date(cached.created_at)) / (1000 * 60))} minutes)`);
        return {
          success: true,
          insights: cached.insights,
          generatedAt: cached.created_at,
          cached: true,
          cacheAge: Math.round((Date.now() - new Date(cached.created_at)) / (1000 * 60)) // age in minutes
        };
      }

      console.log(`🤖 Generating new AI insights for: ${userEmail} (no valid cache found)`);

      // Gather metrics from all features
      const metricsData = await this.gatherAllMetrics(userEmail);

      // Always generate unified insights (3-5 total based on plan)
      const insights = await this.generateAllInsights(userEmail, metricsData);

      // Only save to database if these are real AI-generated insights (not fallbacks)
      if (!insights.isFallback) {
        await this.saveInsights(userEmail, insights, metricsData);
        console.log(`✅ Generated and saved ${insights.insightCount} AI insights (${metricsData.userPlan} plan)`);
      } else {
        console.log(`⚠️ Using fallback insights (not saved to database) - no data available for AI analysis`);
      }

      return {
        success: true,
        insights,
        generatedAt: new Date().toISOString(),
        isFallback: insights.isFallback || false
      };
    } catch (error) {
      console.error('❌ Error generating AI insights:', error);
      throw error;
    }
  }

  /**
   * Gather comprehensive metrics from all features
   */
  async gatherAllMetrics(userEmail) {
    try {
      const supabase = getSupabaseClient();

      // Get user ID
      const { data: userData } = await supabase
        .from('users_table')
        .select('id, plan')
        .eq('email', userEmail)
        .single();

      if (!userData) {
        throw new Error('User not found');
      }

      const userId = userData.id;
      const userPlan = userData.plan;

      const metrics = {
        userPlan,
        seo: await this.getSEOMetrics(userId, userEmail),
        social: await this.getSocialMetrics(userEmail),
        competitor: await this.getCompetitorMetrics(userId, userEmail),
        traffic: await this.getTrafficMetrics(userId)
      };

      return metrics;
    } catch (error) {
      console.error('Error gathering metrics:', error);
      return {
        userPlan: 'starter',
        seo: null,
        social: null,
        competitor: null,
        traffic: null
      };
    }
  }

  /**
   * Get comprehensive SEO & Website Performance metrics
   */
  async getSEOMetrics(userId, userEmail) {
    try {
      const supabase = getSupabaseClient();

      // Fetch from search_console_cache for comprehensive SEO data
      const { data: searchConsoleData } = await supabase
        .from('search_console_cache')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Fetch from lighthouse_cache for performance scores
      const { data: lighthouseData } = await supabase
        .from('lighthouse_cache')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!searchConsoleData && !lighthouseData) return null;

      const seoMetrics = {
        // Search Console Metrics
        domain: searchConsoleData?.domain || searchConsoleData?.site_url,
        totalClicks: searchConsoleData?.total_clicks || 0,
        totalImpressions: searchConsoleData?.total_impressions || 0,
        averageCTR: searchConsoleData?.average_ctr || 0,
        averagePosition: searchConsoleData?.average_position || 0,
        organicTraffic: searchConsoleData?.organic_traffic || 0,
        topQueries: searchConsoleData?.top_queries || [],
        topPages: searchConsoleData?.top_pages || [],

        // Lighthouse Performance Scores
        performanceScore: lighthouseData?.lighthouse_data?.performance || 0,
        seoScore: lighthouseData?.lighthouse_data?.seo || 0,
        accessibilityScore: lighthouseData?.lighthouse_data?.accessibility || 0,
        bestPracticesScore: lighthouseData?.lighthouse_data?.bestPractices || 0,

        // PageSpeed Insights
        pagespeedDesktop: searchConsoleData?.pagespeed_data?.desktop?.performanceScore || 0,
        pagespeedMobile: searchConsoleData?.pagespeed_data?.mobile?.performanceScore || 0,

        // Technical SEO from Puppeteer
        wordCount: searchConsoleData?.puppeteer_data?.content?.wordCount || 0,
        imageCount: searchConsoleData?.puppeteer_data?.content?.images?.total || 0,
        altTextCoverage: searchConsoleData?.puppeteer_data?.content?.images?.altCoverage || 0,
        headingStructure: searchConsoleData?.puppeteer_data?.seo?.headings || {},
        metaDescription: searchConsoleData?.puppeteer_data?.seo?.metaDescription || null,

        // Backlinks (SE Ranking)
        totalBacklinks: searchConsoleData?.backlinks?.total || 0,
        referringDomains: searchConsoleData?.backlinks?.referring_domains || 0,

        // Technical Issues
        technicalIssues: searchConsoleData?.technical_seo_data?.issues || [],

        lastUpdated: searchConsoleData?.last_fetched_at || lighthouseData?.last_fetched_at
      };

      return seoMetrics;
    } catch (error) {
      console.warn('No SEO data available:', error.message);
      return null;
    }
  }

  /**
   * Get Social Media Performance metrics
   */
  async getSocialMetrics(userEmail) {
    try {
      const supabase = getSupabaseClient();

      const { data: socialData } = await supabase
        .from('social_media_cache')
        .select('*')
        .eq('user_email', userEmail)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      if (!socialData || socialData.length === 0) return null;

      const platforms = {};
      const activePlatforms = [];

      for (const record of socialData) {
        const platform = record.platform;

        if (!platforms[platform]) {
          platforms[platform] = {
            accountName: record.account_name,
            username: record.username,
            followerCount: record.follower_count || 0,
            followerGrowth: record.follower_growth || [],
            engagementData: record.engagement_data || {},
            topPosts: record.top_posts || [],
            reputationData: record.reputation_data || {},
            postsData: record.posts_data || [],
            lastFetched: record.last_fetched_at
          };
          activePlatforms.push(platform);
        }
      }

      // Get connection status
      const { data: connections } = await supabase
        .from('social_connections_v2')
        .select('platform, is_connected, connection_status')
        .eq('user_email', userEmail);

      const connectionStatus = {};
      if (connections) {
        connections.forEach(conn => {
          connectionStatus[conn.platform] = {
            connected: conn.is_connected,
            status: conn.connection_status
          };
        });
      }

      return {
        activePlatforms,
        platforms,
        connectionStatus,
        totalPosts: Object.values(platforms).reduce((sum, p) => sum + (p.postsData?.length || 0), 0),
        totalFollowers: Object.values(platforms).reduce((sum, p) => sum + (p.followerCount || 0), 0),
        lastUpdated: socialData[0]?.last_fetched_at
      };
    } catch (error) {
      console.warn('No social media data available:', error.message);
      return null;
    }
  }

  /**
   * Get Competitor Intelligence metrics
   */
  async getCompetitorMetrics(userId, userEmail) {
    try {
      const supabase = getSupabaseClient();

      const { data: competitorData } = await supabase
        .from('competitor_cache')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(10);

      if (!competitorData || competitorData.length === 0) return null;

      // Get user's business info
      const { data: businessInfo } = await supabase
        .from('user_business_info')
        .select('business_domain, competitors')
        .eq('user_email', userEmail)
        .single();

      const competitors = competitorData.map(comp => ({
        domain: comp.competitor_domain,
        userDomain: comp.user_domain,

        // Performance comparison
        lighthouseScores: {
          performance: comp.lighthouse_data?.performance || 0,
          seo: comp.lighthouse_data?.seo || 0,
          accessibility: comp.lighthouse_data?.accessibility || 0,
          bestPractices: comp.lighthouse_data?.bestPractices || 0
        },

        pagespeedScores: {
          desktop: comp.pagespeed_data?.desktop?.performanceScore || 0,
          mobile: comp.pagespeed_data?.mobile?.performanceScore || 0
        },

        // Content analysis
        contentMetrics: {
          wordCount: comp.puppeteer_data?.content?.wordCount || 0,
          imageCount: comp.puppeteer_data?.content?.images?.total || 0,
          altTextCoverage: comp.puppeteer_data?.content?.images?.altCoverage || 0
        },

        // Backlinks
        backlinks: {
          total: comp.backlinks_data?.total || 0,
          referringDomains: comp.backlinks_data?.referring_domains || 0
        },

        // Social presence
        socialHandles: {
          instagram: comp.competitor_instagram_handle,
          facebook: comp.competitor_facebook_handle,
          linkedin: comp.competitor_linkedin_handle
        },

        analysisStatus: comp.analysis_status,
        lastAnalyzed: comp.updated_at
      }));

      return {
        totalCompetitors: competitors.length,
        userDomain: businessInfo?.business_domain || competitorData[0]?.user_domain,
        competitors,
        lastUpdated: competitorData[0]?.updated_at
      };
    } catch (error) {
      console.warn('No competitor data available:', error.message);
      return null;
    }
  }

  /**
   * Get Traffic & Analytics metrics
   */
  async getTrafficMetrics(userId) {
    try {
      const supabase = getSupabaseClient();

      const { data: analyticsData } = await supabase
        .from('google_analytics_cache')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!analyticsData) return null;

      return {
        activeUsers: analyticsData.active_users || 0,
        sessions: analyticsData.sessions || 0,
        bounceRate: analyticsData.bounce_rate || 0,
        avgSessionDuration: analyticsData.avg_session_duration || 0,
        pageViews: analyticsData.page_views || 0,
        conversions: analyticsData.conversions || 0,
        revenue: analyticsData.revenue || 0,
        socialTraffic: {
          sessions: analyticsData.total_social_sessions || 0,
          users: analyticsData.total_social_users || 0,
          conversions: analyticsData.total_social_conversions || 0,
          conversionRate: analyticsData.social_conversion_rate || 0,
          trafficPercentage: analyticsData.social_traffic_percentage || 0,
          topSources: analyticsData.top_social_sources || []
        },
        lastUpdated: analyticsData.last_fetched_at
      };
    } catch (error) {
      console.warn('No traffic data available:', error.message);
      return null;
    }
  }

  /**
   * Generate all insights - SINGLE list of optimizations based on plan
   * starter: 0 (blocked), growth: 3, pro: 5
   */
  async generateAllInsights(userEmail, metricsData) {
    const { seo, competitor, social, userPlan } = metricsData;

    // Get optimization count from plan features
    const planFeatures = PLAN_FEATURES[userPlan] || PLAN_FEATURES.starter;
    const insightCount = planFeatures.aiInsights?.optimizations || 0;

    // Block if plan doesn't support AI insights
    if (!planFeatures.aiInsights?.enabled || insightCount === 0) {
      return {
        recommendations: [],
        overallScore: 0,
        summary: `AI Insights are not available on ${userPlan} plan. Upgrade to Growth or Pro to unlock this feature.`,
        dataAvailability: { seo: false, competitor: false, social: false },
        planTier: userPlan,
        insightCount: 0,
        locked: true
      };
    }

    // Check what data is available
    const hasData = {
      seo: !!seo,
      competitor: !!(competitor && competitor.competitors.length > 0),
      social: !!(social && social.activePlatforms.length > 0)
    };

    // If no data available, return fallbacks marked as such
    if (!hasData.seo && !hasData.competitor && !hasData.social) {
      const fallbackInsights = this.getFallbackAllInsights(insightCount);
      fallbackInsights.isFallback = true;
      fallbackInsights.fallbackReason = 'No SEO, competitor, or social data available for analysis';
      return fallbackInsights;
    }

    // Build comprehensive prompt for ALL categories
    const prompt = this.buildUnifiedPrompt(metricsData, hasData, insightCount);

    try {
      const aiResponse = await this.generateWithOpenAI(prompt);
      const insights = this.parseUnifiedResponse(aiResponse);

      // Limit to plan's optimization count
      const limitedRecommendations = (insights.recommendations || []).slice(0, insightCount);

      return {
        recommendations: limitedRecommendations,
        overallScore: this.calculateOverallScore(metricsData),
        summary: insights.summary || 'Analysis complete',
        dataAvailability: hasData,
        planTier: userPlan,
        insightCount: limitedRecommendations.length,
        maxOptimizations: insightCount,
        locked: false
      };
    } catch (error) {
      if (error.message === 'AI_RATE_LIMIT') {
        // Already logged as warning, just return fallback
      } else {
        console.error('Error generating insights:', error.message);
      }
      const fallbackInsights = this.getFallbackAllInsights(insightCount);
      fallbackInsights.isFallback = true;
      fallbackInsights.fallbackReason = error.message === 'AI_RATE_LIMIT'
        ? 'AI rate limit reached, using fallback recommendations'
        : 'AI generation failed, using fallback recommendations';
      return fallbackInsights;
    }
  }

  /**
   * Generate SEO & Website Performance insights
   */
  async generateSEOInsights(userEmail, metricsData) {
    const { seo, traffic } = metricsData;

    if (!seo) {
      return {
        category: 'SEO & Website Performance',
        available: false,
        message: 'No SEO data available. Please run a website analysis first.',
        recommendations: []
      };
    }

    // Use comprehensive prompt but only for SEO
    const hasData = { seo: true, competitor: false, social: false };
    const prompt = this.buildComprehensivePrompt(metricsData, hasData);

    try {
      const aiResponse = await this.generateWithOpenAI(prompt);
      const insights = this.parseComprehensiveResponse(aiResponse, hasData);

      if (insights.seo) {
        return {
          ...insights.seo,
          overallScore: this.calculateSEOScore(seo),
          metrics: {
            performanceScore: seo.performanceScore,
            seoScore: seo.seoScore,
            averagePosition: seo.averagePosition,
            organicTraffic: seo.organicTraffic,
            totalBacklinks: seo.totalBacklinks
          }
        };
      }
    } catch (error) {
      console.error('Error generating SEO insights:', error);
    }

    return this.getFallbackSEOInsights(seo);
  }

  /**
   * Generate Competitor Intelligence insights
   */
  async generateCompetitorInsights(userEmail, metricsData) {
    const { competitor } = metricsData;

    if (!competitor || competitor.competitors.length === 0) {
      return {
        category: 'Competitor Intelligence',
        available: false,
        message: 'No competitor data available. Please add competitors and run analysis.',
        recommendations: []
      };
    }

    // Use comprehensive prompt but only for Competitor
    const hasData = { seo: false, competitor: true, social: false };
    const prompt = this.buildComprehensivePrompt(metricsData, hasData);

    try {
      const aiResponse = await this.generateWithOpenAI(prompt);
      const insights = this.parseComprehensiveResponse(aiResponse, hasData);

      if (insights.competitor) {
        return {
          ...insights.competitor,
          competitorsAnalyzed: competitor.totalCompetitors,
          metrics: {
            avgCompetitorPerformance: this.calculateAvgCompetitorScore(competitor),
            strongestCompetitor: this.findStrongestCompetitor(competitor),
            yourPosition: this.calculateYourPosition(competitor)
          }
        };
      }
    } catch (error) {
      console.error('Error generating competitor insights:', error);
    }

    return this.getFallbackCompetitorInsights(competitor);
  }

  /**
   * Generate Social Media Performance insights
   */
  async generateSocialInsights(userEmail, metricsData) {
    const { social } = metricsData;

    if (!social || social.activePlatforms.length === 0) {
      return {
        category: 'Social Media Performance',
        available: false,
        message: 'No social media data available. Please connect your social media accounts.',
        recommendations: []
      };
    }

    // Use comprehensive prompt but only for Social
    const hasData = { seo: false, competitor: false, social: true };
    const prompt = this.buildComprehensivePrompt(metricsData, hasData);

    try {
      const aiResponse = await this.generateWithOpenAI(prompt);
      const insights = this.parseComprehensiveResponse(aiResponse, hasData);

      if (insights.social) {
        return {
          ...insights.social,
          platformsActive: social.activePlatforms,
          metrics: {
            totalFollowers: social.totalFollowers,
            totalPosts: social.totalPosts,
            avgEngagement: this.calculateAvgEngagement(social)
          }
        };
      }
    } catch (error) {
      console.error('Error generating social insights:', error);
    }

    return this.getFallbackSocialInsights(social);
  }

  /**
   * Build unified prompt for ALL metrics - returns SINGLE list of best insights
   */
  buildUnifiedPrompt(metricsData, hasData, insightCount) {
    const { seo, competitor, social, traffic } = metricsData;

    let prompt = `You are a digital marketing expert. Analyze ALL business metrics and provide the TOP ${insightCount} most impactful recommendations (NOT per category, total ${insightCount}).

`;

    prompt += `**BUSINESS METRICS:**

`;

    // SEO Section
    if (hasData.seo) {
      prompt += `SEO: Performance ${seo.performanceScore}/100, SEO Score ${seo.seoScore}/100, Position ${seo.averagePosition?.toFixed(1)}, Clicks ${seo.totalClicks}, Backlinks ${seo.totalBacklinks}\n`;
    }

    // Competitor Section
    if (hasData.competitor) {
      prompt += `Competitors: ${competitor.totalCompetitors} tracked\n`;
    }

    // Social Media Section
    if (hasData.social) {
      prompt += `Social: ${social.activePlatforms.join(', ')} - ${social.totalFollowers} followers, ${social.totalPosts} posts\n`;
    }

    if (traffic) {
      prompt += `Traffic: ${traffic.activeUsers} users, ${traffic.sessions} sessions\n`;
    }

    prompt += `\n**OUTPUT (JSON only):**\n{\n`;
    prompt += `  "recommendations": [\n`;
    prompt += `    {\n`;
    prompt += `      "title": "Clear actionable title",\n`;
    prompt += `      "description": "Why this matters (1-2 sentences)",\n`;
    prompt += `      "category": "SEO|Competitor|Social|Overall",\n`;
    prompt += `      "priority": "high|medium|low",\n`;
    prompt += `      "impact": "Expected outcome",\n`;
    prompt += `      "effort": "high|medium|low",\n`;
    prompt += `      "timeframe": "1-2 weeks|2-4 weeks|1-3 months",\n`;
    prompt += `      "actionSteps": ["step1", "step2", "step3"]\n`;
    prompt += `    }\n`;
    prompt += `  ],\n`;
    prompt += `  "summary": "One sentence overall assessment"\n`;
    prompt += `}\n\n`;
    prompt += `Provide exactly ${insightCount} recommendations total, prioritized by impact. Focus on quick wins and data-driven actions.`;

    return prompt;
  }

  /**
   * Parse unified AI response - single flat list of insights
   */
  parseUnifiedResponse(aiResponse) {
    try {
      let jsonText = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(jsonText);

      return {
        recommendations: parsed.recommendations || [],
        summary: parsed.summary || 'Analysis complete'
      };
    } catch (error) {
      console.error('Error parsing unified response:', error);
      return {
        recommendations: [],
        summary: 'Error parsing AI response'
      };
    }
  }

  /**
   * Build SEO-specific prompt
   */
  buildSEOPrompt(seo, traffic) {
    let prompt = `You are an SEO and website performance expert. Analyze the following metrics and provide 3-5 specific, actionable recommendations.\n\n`;

    prompt += `**WEBSITE METRICS:**\n\n`;
    prompt += `Domain: ${seo.domain}\n\n`;

    prompt += `**Performance Scores (0-100):**\n`;
    prompt += `- Performance: ${seo.performanceScore}\n`;
    prompt += `- SEO: ${seo.seoScore}\n`;
    prompt += `- Accessibility: ${seo.accessibilityScore}\n`;
    prompt += `- Best Practices: ${seo.bestPracticesScore}\n`;
    prompt += `- PageSpeed Desktop: ${seo.pagespeedDesktop}\n`;
    prompt += `- PageSpeed Mobile: ${seo.pagespeedMobile}\n\n`;

    prompt += `**Search Console Data:**\n`;
    prompt += `- Total Clicks (last 30 days): ${seo.totalClicks}\n`;
    prompt += `- Total Impressions: ${seo.totalImpressions}\n`;
    prompt += `- Average CTR: ${(seo.averageCTR * 100).toFixed(2)}%\n`;
    prompt += `- Average Position: ${seo.averagePosition?.toFixed(1)}\n`;
    prompt += `- Organic Traffic: ${seo.organicTraffic}\n`;
    prompt += `- Top Queries: ${seo.topQueries?.length || 0} keywords tracked\n`;
    prompt += `- Top Pages: ${seo.topPages?.length || 0} pages\n\n`;

    prompt += `**Technical SEO:**\n`;
    prompt += `- Total Backlinks: ${seo.totalBacklinks}\n`;
    prompt += `- Referring Domains: ${seo.referringDomains}\n`;
    prompt += `- Content Word Count: ${seo.wordCount}\n`;
    prompt += `- Images: ${seo.imageCount} (${seo.altTextCoverage?.toFixed(0)}% have alt text)\n`;
    prompt += `- Meta Description: ${seo.metaDescription ? 'Present' : 'Missing'}\n`;
    prompt += `- Technical Issues: ${seo.technicalIssues?.length || 0}\n\n`;

    if (traffic) {
      prompt += `**Traffic Data:**\n`;
      prompt += `- Active Users: ${traffic.activeUsers}\n`;
      prompt += `- Sessions: ${traffic.sessions}\n`;
      prompt += `- Bounce Rate: ${traffic.bounceRate?.toFixed(1)}%\n`;
      prompt += `- Avg Session Duration: ${traffic.avgSessionDuration?.toFixed(0)}s\n\n`;
    }

    prompt += `\n**OUTPUT FORMAT (JSON only, no markdown):**\n`;
    prompt += `{\n`;
    prompt += `  "recommendations": [\n`;
    prompt += `    {\n`;
    prompt += `      "title": "Clear, actionable title (max 60 chars)",\n`;
    prompt += `      "description": "Why this matters and what to do (2-3 sentences)",\n`;
    prompt += `      "priority": "high" | "medium" | "low",\n`;
    prompt += `      "impact": "Expected improvement (specific metrics)",\n`;
    prompt += `      "effort": "high" | "medium" | "low",\n`;
    prompt += `      "timeframe": "1-2 weeks" | "2-4 weeks" | "1-3 months",\n`;
    prompt += `      "actionSteps": ["Step 1", "Step 2", "Step 3"],\n`;
    prompt += `      "metrics": ["CTR", "Rankings", "Traffic", "Speed", "Core Web Vitals"]\n`;
    prompt += `    }\n`;
    prompt += `  ],\n`;
    prompt += `  "summary": "One sentence overall assessment"\n`;
    prompt += `}\n\n`;
    prompt += `Focus on: Quick wins, Technical SEO issues, Content gaps, Performance optimizations, Backlink opportunities.`;

    return prompt;
  }

  /**
   * Build Competitor-specific prompt
   */
  buildCompetitorPrompt(competitor) {
    let prompt = `You are a competitive intelligence analyst. Analyze the following competitor data and provide 3-5 strategic recommendations.\n\n`;

    prompt += `**YOUR DOMAIN:** ${competitor.userDomain}\n\n`;
    prompt += `**COMPETITORS ANALYZED:** ${competitor.totalCompetitors}\n\n`;

    competitor.competitors.slice(0, 5).forEach((comp, idx) => {
      prompt += `**Competitor ${idx + 1}: ${comp.domain}**\n`;
      prompt += `- Performance Score: ${comp.lighthouseScores.performance}\n`;
      prompt += `- SEO Score: ${comp.lighthouseScores.seo}\n`;
      prompt += `- PageSpeed Desktop: ${comp.pagespeedScores.desktop}\n`;
      prompt += `- PageSpeed Mobile: ${comp.pagespeedScores.mobile}\n`;
      prompt += `- Content Word Count: ${comp.contentMetrics.wordCount}\n`;
      prompt += `- Total Backlinks: ${comp.backlinks.total}\n`;
      prompt += `- Referring Domains: ${comp.backlinks.referringDomains}\n`;
      prompt += `- Social Presence: `;
      const socials = [];
      if (comp.socialHandles.instagram) socials.push('Instagram');
      if (comp.socialHandles.facebook) socials.push('Facebook');
      if (comp.socialHandles.linkedin) socials.push('LinkedIn');
      prompt += socials.length > 0 ? socials.join(', ') : 'Limited';
      prompt += `\n\n`;
    });

    prompt += `\n**OUTPUT FORMAT (JSON only, no markdown):**\n`;
    prompt += `{\n`;
    prompt += `  "recommendations": [\n`;
    prompt += `    {\n`;
    prompt += `      "title": "Strategic advantage or gap to address",\n`;
    prompt += `      "description": "Competitive insight and recommended action",\n`;
    prompt += `      "priority": "high" | "medium" | "low",\n`;
    prompt += `      "impact": "Expected competitive advantage",\n`;
    prompt += `      "effort": "high" | "medium" | "low",\n`;
    prompt += `      "timeframe": "1-2 weeks" | "2-4 weeks" | "1-3 months",\n`;
    prompt += `      "actionSteps": ["Step 1", "Step 2", "Step 3"],\n`;
    prompt += `      "competitorReference": "Which competitor(s) this relates to"\n`;
    prompt += `    }\n`;
    prompt += `  ],\n`;
    prompt += `  "summary": "One sentence competitive positioning assessment"\n`;
    prompt += `}\n\n`;
    prompt += `Focus on: Performance gaps, Content advantages/disadvantages, Backlink strategies, Social media presence, Market positioning.`;

    return prompt;
  }

  /**
   * Build Social Media-specific prompt
   */
  buildSocialPrompt(social) {
    let prompt = `You are a social media marketing strategist. Analyze the following social media metrics and provide 3-5 growth recommendations.\n\n`;

    prompt += `**ACTIVE PLATFORMS:** ${social.activePlatforms.join(', ')}\n\n`;
    prompt += `**OVERALL METRICS:**\n`;
    prompt += `- Total Followers: ${social.totalFollowers}\n`;
    prompt += `- Total Posts (last 30 days): ${social.totalPosts}\n\n`;

    for (const [platform, data] of Object.entries(social.platforms)) {
      prompt += `**${platform.toUpperCase()}:**\n`;
      prompt += `- Account: ${data.accountName || data.username}\n`;
      prompt += `- Followers: ${data.followerCount}\n`;

      if (data.followerGrowth && data.followerGrowth.length > 0) {
        const latestGrowth = data.followerGrowth[data.followerGrowth.length - 1];
        prompt += `- Recent Growth: ${latestGrowth.change > 0 ? '+' : ''}${latestGrowth.change}\n`;
      }

      if (data.engagementData && Object.keys(data.engagementData).length > 0) {
        prompt += `- Engagement Rate: ${data.engagementData.rate || 'N/A'}\n`;
        prompt += `- Avg Likes: ${data.engagementData.avgLikes || 0}\n`;
        prompt += `- Avg Comments: ${data.engagementData.avgComments || 0}\n`;
      }

      if (data.postsData && data.postsData.length > 0) {
        prompt += `- Posts in Period: ${data.postsData.length}\n`;
      }

      if (data.topPosts && data.topPosts.length > 0) {
        prompt += `- Top Performing Content: ${data.topPosts.length} posts tracked\n`;
      }

      prompt += `\n`;
    }

    // Add connection status
    prompt += `**CONNECTION STATUS:**\n`;
    for (const [platform, status] of Object.entries(social.connectionStatus)) {
      prompt += `- ${platform}: ${status.connected ? 'Connected' : 'Disconnected'} (${status.status})\n`;
    }
    prompt += `\n`;

    prompt += `\n**OUTPUT FORMAT (JSON only, no markdown):**\n`;
    prompt += `{\n`;
    prompt += `  "recommendations": [\n`;
    prompt += `    {\n`;
    prompt += `      "title": "Growth opportunity or optimization",\n`;
    prompt += `      "description": "Why this matters and how to implement",\n`;
    prompt += `      "priority": "high" | "medium" | "low",\n`;
    prompt += `      "impact": "Expected follower/engagement growth",\n`;
    prompt += `      "effort": "high" | "medium" | "low",\n`;
    prompt += `      "timeframe": "1-2 weeks" | "2-4 weeks" | "1-3 months",\n`;
    prompt += `      "actionSteps": ["Step 1", "Step 2", "Step 3"],\n`;
    prompt += `      "platforms": ["facebook", "instagram", "linkedin"]\n`;
    prompt += `    }\n`;
    prompt += `  ],\n`;
    prompt += `  "summary": "One sentence social media performance assessment"\n`;
    prompt += `}\n\n`;
    prompt += `Focus on: Posting frequency, Content quality, Engagement tactics, Follower growth strategies, Cross-platform opportunities.`;

    return prompt;
  }

  /**
   * Generate content using OpenAI
   */
  async generateWithOpenAI(prompt) {
    try {
      if (!process.env.OPENAI) {
        console.warn('⚠️ OpenAI API key not configured, falling back');
        throw new Error('OpenAI API key not configured');
      }

      console.log('🤖 Generating content with OpenAI...');

      const completion = await Promise.race([
        openaiService.client.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are an expert digital marketing and business consultant. Provide actionable recommendations in valid JSON format only."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 2000
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), 30000)
        )
      ]);

      const text = completion.choices[0].message.content;

      console.log('✅ AI content generated successfully');
      return text;

    } catch (error) {
      // Handle rate limits and quotas gracefully
      if (error.status === 429 || error.message?.includes('quota') || error.message?.includes('Too Many Requests')) {
        console.warn('⚠️ AI rate limit/quota exceeded, falling back to cached/template data.');
        throw new Error('AI_RATE_LIMIT');
      }

      console.error('❌ AI generation error:', error.message);
      throw error;
    }
  }

  /**
   * Parse structured response from AI
   */
  parseStructuredResponse(aiResponse, category) {
    try {
      // Extract JSON from response (OpenAI sometimes adds markdown)
      let jsonText = aiResponse;

      // Remove markdown code blocks if present
      jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      // Parse JSON
      const parsed = JSON.parse(jsonText);

      // Validate structure
      if (!parsed.recommendations || !Array.isArray(parsed.recommendations)) {
        throw new Error('Invalid recommendations structure');
      }

      return {
        recommendations: parsed.recommendations.slice(0, 5), // Max 5 recommendations
        summary: parsed.summary || 'Analysis complete'
      };
    } catch (error) {
      console.error(`Error parsing ${category} AI response:`, error);
      throw error;
    }
  }

  /**
   * Calculate overall summary
   */
  generateOverallSummary(seoInsights, competitorInsights, socialInsights, metricsData) {
    const scores = [];

    if (seoInsights.available) scores.push(seoInsights.overallScore);
    if (competitorInsights.available) scores.push(competitorInsights.metrics?.yourPosition || 50);
    if (socialInsights.available) scores.push(this.calculateSocialScore(socialInsights));

    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    return {
      overallScore: avgScore,
      dataAvailability: {
        seo: seoInsights.available,
        competitor: competitorInsights.available,
        social: socialInsights.available
      },
      recommendation: avgScore >= 80 ? 'Excellent' : avgScore >= 60 ? 'Good - Room for improvement' : 'Needs attention'
    };
  }

  /**
   * Get fallback insights - single unified list
   */
  getFallbackAllInsights(count) {
    const allFallbacks = [
      {
        title: "Improve Core Web Vitals",
        description: "Optimize page speed and performance for better user experience and SEO rankings.",
        category: "SEO",
        priority: "high",
        impact: "15-30% improvement in page speed",
        effort: "medium",
        timeframe: "2-4 weeks",
        actionSteps: [
          "Optimize and compress images",
          "Minimize JavaScript and CSS",
          "Enable browser caching"
        ]
      },
      {
        title: "Build Quality Backlinks",
        description: "Increase domain authority through strategic link building from relevant sources.",
        category: "SEO",
        priority: "high",
        impact: "20-40% improvement in domain authority",
        effort: "high",
        timeframe: "1-3 months",
        actionSteps: [
          "Create linkable content assets",
          "Reach out to industry publications",
          "Fix broken backlinks"
        ]
      },
      {
        title: "Increase Social Media Posting",
        description: "Maintain consistent presence across platforms to drive engagement and brand awareness.",
        category: "Social",
        priority: "high",
        impact: "30-50% increase in reach",
        effort: "medium",
        timeframe: "2-4 weeks",
        actionSteps: [
          "Create 30-day content calendar",
          "Batch create content in advance",
          "Use scheduling tools"
        ]
      },
      {
        title: "Analyze Competitor Strategies",
        description: "Identify gaps and opportunities by studying top competitor performance.",
        category: "Competitor",
        priority: "medium",
        impact: "Better market positioning",
        effort: "low",
        timeframe: "1-2 weeks",
        actionSteps: [
          "Audit competitor content",
          "Analyze their backlink profile",
          "Identify content gaps"
        ]
      },
      {
        title: "Optimize Meta Descriptions",
        description: "Improve click-through rates from search results with compelling meta descriptions.",
        category: "SEO",
        priority: "medium",
        impact: "10-20% improvement in CTR",
        effort: "low",
        timeframe: "1-2 weeks",
        actionSteps: [
          "Audit existing meta descriptions",
          "Write compelling copy with keywords",
          "Test and monitor CTR improvements"
        ]
      }
    ];

    return {
      recommendations: allFallbacks.slice(0, count),
      overallScore: 60,
      summary: "Good foundation with opportunities for improvement across SEO, social media, and competitive positioning",
      dataAvailability: { seo: true, competitor: true, social: true },
      planTier: 'starter',
      insightCount: count
    };
  }

  /**
   * Calculate overall score from all metrics
   */
  calculateOverallScore(metricsData) {
    const { seo, social, competitor } = metricsData;
    const scores = [];

    if (seo) {
      const seoScore = (seo.performanceScore + seo.seoScore + seo.accessibilityScore + seo.bestPracticesScore) / 4;
      scores.push(seoScore);
    }

    if (social && social.totalFollowers > 0) {
      const socialScore = Math.min(100, 50 + Math.log10(social.totalFollowers + 1) * 10);
      scores.push(socialScore);
    }

    if (competitor && competitor.competitors.length > 0) {
      scores.push(65); // Placeholder competitive score
    }

    return scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  }

  // Helper calculation methods
  calculateSEOScore(seo) {
    return Math.round(
      (seo.performanceScore + seo.seoScore + seo.accessibilityScore + seo.bestPracticesScore) / 4
    );
  }

  calculateAvgCompetitorScore(competitor) {
    if (!competitor.competitors.length) return 0;
    const total = competitor.competitors.reduce((sum, comp) => {
      const scores = comp.lighthouseScores;
      return sum + (scores.performance + scores.seo + scores.accessibility + scores.bestPractices) / 4;
    }, 0);
    return Math.round(total / competitor.competitors.length);
  }

  findStrongestCompetitor(competitor) {
    let strongest = competitor.competitors[0];
    let highestScore = 0;

    competitor.competitors.forEach(comp => {
      const score = (comp.lighthouseScores.performance + comp.lighthouseScores.seo +
        comp.lighthouseScores.accessibility + comp.lighthouseScores.bestPractices) / 4;
      if (score > highestScore) {
        highestScore = score;
        strongest = comp;
      }
    });

    return strongest?.domain || 'N/A';
  }

  calculateYourPosition(competitor) {
    // This would need user's own scores - return placeholder
    return 65;
  }

  calculateAvgEngagement(social) {
    let totalEngagement = 0;
    let count = 0;

    for (const platform of Object.values(social.platforms)) {
      if (platform.engagementData?.rate) {
        totalEngagement += parseFloat(platform.engagementData.rate);
        count++;
      }
    }

    return count > 0 ? (totalEngagement / count).toFixed(2) : 0;
  }

  calculateSocialScore(socialInsights) {
    // Simple scoring based on platform count and follower count
    if (!socialInsights || !socialInsights.platformsActive || !socialInsights.metrics) {
      return 0;
    }
    const platformScore = socialInsights.platformsActive.length * 20; // Max 60 for 3 platforms
    const followerScore = Math.min(40, Math.log10(socialInsights.metrics.totalFollowers + 1) * 10);
    return Math.round(platformScore + followerScore);
  }

  // Fallback insights methods
  getFallbackSEOInsights(seo) {
    return {
      category: 'SEO & Website Performance',
      available: true,
      overallScore: this.calculateSEOScore(seo),
      metrics: {
        performanceScore: seo.performanceScore,
        seoScore: seo.seoScore
      },
      recommendations: [
        {
          title: "Improve Core Web Vitals",
          description: "Your performance score indicates opportunities for optimization. Focus on load time, interactivity, and visual stability.",
          priority: "high",
          impact: "15-30% improvement in page speed and user experience",
          effort: "medium",
          timeframe: "2-4 weeks",
          actionSteps: [
            "Optimize and compress images",
            "Minimize JavaScript and CSS",
            "Enable browser caching and CDN"
          ],
          metrics: ["Speed", "Core Web Vitals", "User Experience"]
        },
        {
          title: "Optimize On-Page SEO Elements",
          description: "Ensure all pages have proper meta descriptions, title tags, and structured data for better search visibility.",
          priority: "high",
          impact: "10-20% improvement in CTR and rankings",
          effort: "low",
          timeframe: "1-2 weeks",
          actionSteps: [
            "Audit and update meta descriptions",
            "Optimize title tags with target keywords",
            "Add schema markup for rich snippets"
          ],
          metrics: ["CTR", "Rankings", "Impressions"]
        },
        {
          title: "Build Quality Backlinks",
          description: "Increase your domain authority through strategic link building from high-quality, relevant sources.",
          priority: "medium",
          impact: "20-40% improvement in domain authority over 3 months",
          effort: "high",
          timeframe: "1-3 months",
          actionSteps: [
            "Create linkable content assets",
            "Reach out to industry publications",
            "Fix broken backlinks"
          ],
          metrics: ["Backlinks", "Domain Authority", "Referral Traffic"]
        }
      ],
      summary: "Your site has a solid foundation but can benefit from performance and SEO optimizations"
    };
  }

  getFallbackCompetitorInsights(competitor) {
    return {
      category: 'Competitor Intelligence',
      available: true,
      competitorsAnalyzed: competitor.totalCompetitors,
      recommendations: [
        {
          title: "Match Competitor Content Depth",
          description: "Your competitors are publishing more comprehensive content. Increase word count and topic coverage to compete.",
          priority: "high",
          impact: "Better rankings for target keywords",
          effort: "medium",
          timeframe: "2-4 weeks",
          actionSteps: [
            "Analyze top competitor content",
            "Identify content gaps",
            "Create comprehensive guides"
          ],
          competitorReference: "Top performing competitors"
        },
        {
          title: "Close Technical Performance Gap",
          description: "Some competitors have better page speed scores. Optimize your site to match or exceed their performance.",
          priority: "medium",
          impact: "Better user experience and rankings",
          effort: "medium",
          timeframe: "2-4 weeks",
          actionSteps: [
            "Benchmark competitor speeds",
            "Implement technical optimizations",
            "Monitor improvements"
          ],
          competitorReference: "Fastest loading competitors"
        },
        {
          title: "Expand Social Media Presence",
          description: "Competitors are active on multiple social platforms. Strengthen your presence where they're engaging audiences.",
          priority: "medium",
          impact: "Increased brand awareness and traffic",
          effort: "high",
          timeframe: "1-3 months",
          actionSteps: [
            "Audit competitor social strategies",
            "Create platform-specific content",
            "Engage with target audience"
          ],
          competitorReference: "Socially active competitors"
        }
      ],
      summary: "You're competitive but can gain advantages through content, performance, and social media improvements"
    };
  }

  getFallbackSocialInsights(social) {
    return {
      category: 'Social Media Performance',
      available: true,
      platformsActive: social.activePlatforms,
      recommendations: [
        {
          title: "Increase Posting Frequency",
          description: "Consistent posting drives engagement. Develop a content calendar to maintain regular presence across platforms.",
          priority: "high",
          impact: "20-40% increase in reach and engagement",
          effort: "medium",
          timeframe: "2-4 weeks",
          actionSteps: [
            "Create 30-day content calendar",
            "Batch create content in advance",
            "Use scheduling tools"
          ],
          platforms: social.activePlatforms
        },
        {
          title: "Optimize Post Timing",
          description: "Post when your audience is most active. Analyze engagement patterns and adjust scheduling for maximum visibility.",
          priority: "medium",
          impact: "15-25% improvement in engagement rates",
          effort: "low",
          timeframe: "1-2 weeks",
          actionSteps: [
            "Review platform analytics",
            "Identify peak engagement times",
            "Schedule posts accordingly"
          ],
          platforms: social.activePlatforms
        },
        {
          title: "Leverage Video Content",
          description: "Video consistently outperforms other content types. Incorporate short-form videos into your strategy.",
          priority: "high",
          impact: "50-100% increase in engagement",
          effort: "medium",
          timeframe: "2-4 weeks",
          actionSteps: [
            "Create simple video templates",
            "Repurpose existing content",
            "Test different video formats"
          ],
          platforms: social.activePlatforms.filter(p => ['instagram', 'facebook'].includes(p))
        }
      ],
      summary: "Your social presence is active but can be optimized through consistent posting and engaging content formats"
    };
  }

  /**
   * Save insights to database
   * Schema: ai_insights (id, user_id, user_email, insights, metrics_snapshot, created_at, expires_at)
   */
  async saveInsights(userEmail, insights, metricsData) {
    try {
      const supabase = getSupabaseClient();

      // First, try to get user_id from auth.users via the email
      // The ai_insights table has a foreign key to auth.users(id)
      const { data: authUser } = await supabase
        .from('users_table')
        .select('id')
        .eq('email', userEmail)
        .single();

      if (!authUser) {
        console.warn(`⚠️ User not found for email: ${userEmail}, cannot save insights`);
        return;
      }

      const now = new Date();
      const tenHoursLater = new Date(now.getTime() + 10 * 60 * 60 * 1000); // 10 hours in milliseconds

      // Insert matching the exact schema - no 'category' field exists in the table
      const { error } = await supabase
        .from('ai_insights')
        .insert({
          user_id: authUser.id,
          user_email: userEmail,
          insights: insights,
          metrics_snapshot: metricsData || {},
          created_at: now.toISOString(),
          expires_at: tenHoursLater.toISOString()
        });

      if (error) {
        console.error('❌ Error inserting AI insights:', error.message);
        return;
      }

      console.log(`✅ AI insights saved to database (expires in 10 hours at ${tenHoursLater.toLocaleString()})`);
    } catch (error) {
      console.error('Error saving insights:', error);
      // Non-critical error, don't throw
    }
  }

  /**
   * Get latest insights for user
   */
  async getLatestInsights(userEmail, category = null) {
    try {
      const supabase = getSupabaseClient();

      let query = supabase
        .from('ai_insights')
        .select('*')
        .eq('user_email', userEmail)
        .order('created_at', { ascending: false });

      if (category && category !== 'all') {
        // Filter by category in insights JSON
        query = query.limit(10); // Get more to filter
        const { data } = await query;

        if (!data || data.length === 0) return null;

        // Return most recent matching category
        return data.find(insight =>
          insight.insights &&
          (insight.insights[category] || insight.insights.category === category)
        ) || data[0];
      } else {
        const { data } = await query.limit(1).single();
        return data;
      }
    } catch (error) {
      console.error('Error fetching insights:', error);
      return null;
    }
  }

  /**
   * Get insights history for user
   */
  async getInsightsHistory(userEmail, limit = 10) {
    try {
      const supabase = getSupabaseClient();

      const { data } = await supabase
        .from('ai_insights')
        .select('id, created_at, insights')
        .eq('user_email', userEmail)
        .order('created_at', { ascending: false })
        .limit(limit);

      return data || [];
    } catch (error) {
      console.error('Error fetching insights history:', error);
      return [];
    }
  }

  /**
   * Delete old insights (cleanup)
   */
  async cleanupOldInsights(userEmail, daysToKeep = 90) {
    try {
      const supabase = getSupabaseClient();

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      await supabase
        .from('ai_insights')
        .delete()
        .eq('user_email', userEmail)
        .lt('created_at', cutoffDate.toISOString());

      console.log(`🧹 Cleaned up insights older than ${daysToKeep} days`);
    } catch (error) {
      console.error('Error cleaning up insights:', error);
    }
  }
}

export default new AIInsightsService();
