import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Report Generation Service
 * Aggregates metrics from all features and generates comprehensive reports
 */
class ReportGenerationService {
  /**
   * Generate Dashboard Report
   * Includes overall site health, SEO metrics, and performance data
   */
  async generateDashboardReport(userEmail, periodStart, periodEnd) {
    try {
      console.log(`📊 Generating dashboard report for: ${userEmail}`);

      const reportData = {
        seo: await this.getSEOMetrics(userEmail),
        performance: await this.getPerformanceMetrics(userEmail),
        analytics: await this.getAnalyticsMetrics(userEmail),
        period: {
          start: periodStart,
          end: periodEnd
        }
      };

      const metricsSummary = {
        seoScore: reportData.seo?.score || 0,
        performanceScore: reportData.performance?.score || 0,
        totalVisits: reportData.analytics?.totalVisits || 0,
        avgPageLoadTime: reportData.performance?.avgLoadTime || 0
      };

      return await this.saveReport(userEmail, 'dashboard', 'Dashboard Overview Report', reportData, metricsSummary, periodStart, periodEnd);
    } catch (error) {
      console.error('❌ Error generating dashboard report:', error);
      throw error;
    }
  }

  /**
   * Generate Competitor Analysis Report
   */
  async generateCompetitorReport(userEmail, periodStart, periodEnd) {
    try {
      console.log(`🎯 Generating competitor report for: ${userEmail}`);

      // Get competitor analysis history from localStorage (stored in browser)
      // For backend, we'll fetch from competitor_cache
      const { data: competitorData } = await supabase
        .from('competitor_cache')
        .select('*')
        .eq('user_email', userEmail)
        .gte('updated_at', periodStart)
        .lte('updated_at', periodEnd)
        .order('updated_at', { ascending: false });

      const reportData = {
        analyses: competitorData || [],
        summary: {
          totalAnalyses: competitorData?.length || 0,
          uniqueCompetitors: [...new Set(competitorData?.map(d => d.competitor_domain) || [])].length,
          avgCacheAge: this.calculateAvgCacheAge(competitorData)
        },
        period: {
          start: periodStart,
          end: periodEnd
        }
      };

      const metricsSummary = {
        totalAnalyses: reportData.summary.totalAnalyses,
        uniqueCompetitors: reportData.summary.uniqueCompetitors
      };

      return await this.saveReport(userEmail, 'competitor', 'Competitor Intelligence Report', reportData, metricsSummary, periodStart, periodEnd);
    } catch (error) {
      console.error('❌ Error generating competitor report:', error);
      throw error;
    }
  }

  /**
   * Generate Social Media Performance Report
   */
  async generateSocialReport(userEmail, periodStart, periodEnd) {
    try {
      console.log(`📱 Generating social media report for: ${userEmail}`);

      const { data: socialLogs } = await supabase
        .from('social_media_fetch_log')
        .select('*')
        .eq('user_email', userEmail)
        .gte('created_at', periodStart)
        .lte('created_at', periodEnd)
        .order('created_at', { ascending: false });

      const platforms = ['facebook', 'instagram', 'linkedin'];
      const platformMetrics = {};

      for (const platform of platforms) {
        const platformLogs = socialLogs?.filter(log => log.platform === platform) || [];
        platformMetrics[platform] = {
          totalFetches: platformLogs.length,
          successfulFetches: platformLogs.filter(log => log.status === 'success').length,
          cacheHits: platformLogs.filter(log => log.cache_hit).length,
          avgDuration: this.calculateAvgDuration(platformLogs),
          totalRecords: platformLogs.reduce((sum, log) => sum + (log.records_fetched || 0), 0)
        };
      }

      const reportData = {
        platforms: platformMetrics,
        summary: {
          totalFetches: socialLogs?.length || 0,
          successRate: this.calculateSuccessRate(socialLogs),
          cacheHitRate: this.calculateCacheHitRate(socialLogs)
        },
        period: {
          start: periodStart,
          end: periodEnd
        }
      };

      const metricsSummary = {
        totalPosts: Object.values(platformMetrics).reduce((sum, m) => sum + m.totalRecords, 0),
        avgEngagement: 0, // Calculate from actual metrics
        platforms: Object.keys(platformMetrics).length
      };

      return await this.saveReport(userEmail, 'social', 'Social Media Performance Report', reportData, metricsSummary, periodStart, periodEnd);
    } catch (error) {
      console.error('❌ Error generating social report:', error);
      throw error;
    }
  }

  /**
   * Generate SEO Report
   */
  async generateSEOReport(userEmail, periodStart, periodEnd) {
    try {
      console.log(`🔍 Generating SEO report for: ${userEmail}`);

      const reportData = {
        technicalSEO: await this.getTechnicalSEOMetrics(userEmail),
        searchConsole: await this.getSearchConsoleMetrics(userEmail),
        lighthouse: await this.getLighthouseMetrics(userEmail),
        period: {
          start: periodStart,
          end: periodEnd
        }
      };

      const metricsSummary = {
        seoScore: reportData.technicalSEO?.overallScore || 0,
        lighthouseScore: reportData.lighthouse?.seoScore || 0,
        totalClicks: reportData.searchConsole?.totalClicks || 0,
        avgPosition: reportData.searchConsole?.avgPosition || 0
      };

      return await this.saveReport(userEmail, 'seo', 'SEO Analysis Report', reportData, metricsSummary, periodStart, periodEnd);
    } catch (error) {
      console.error('❌ Error generating SEO report:', error);
      throw error;
    }
  }

  /**
   * Generate Overall Accumulated Report
   * Combines all metrics from all features
   */
  async generateOverallReport(userEmail, periodStart, periodEnd) {
    try {
      console.log(`📈 Generating overall report for: ${userEmail}`);

      const [dashboard, competitor, social, seo] = await Promise.allSettled([
        this.generateDashboardReport(userEmail, periodStart, periodEnd),
        this.generateCompetitorReport(userEmail, periodStart, periodEnd),
        this.generateSocialReport(userEmail, periodStart, periodEnd),
        this.generateSEOReport(userEmail, periodStart, periodEnd)
      ]);

      const reportData = {
        dashboard: dashboard.status === 'fulfilled' ? dashboard.value.report_data : null,
        competitor: competitor.status === 'fulfilled' ? competitor.value.report_data : null,
        social: social.status === 'fulfilled' ? social.value.report_data : null,
        seo: seo.status === 'fulfilled' ? seo.value.report_data : null,
        summary: {
          reportsGenerated: [dashboard, competitor, social, seo].filter(r => r.status === 'fulfilled').length,
          reportsFailed: [dashboard, competitor, social, seo].filter(r => r.status === 'rejected').length
        },
        period: {
          start: periodStart,
          end: periodEnd
        }
      };

      const metricsSummary = {
        overallScore: this.calculateOverallScore(reportData),
        ...this.extractKeyMetrics(reportData)
      };

      return await this.saveReport(userEmail, 'overall', 'Complete Business Report', reportData, metricsSummary, periodStart, periodEnd);
    } catch (error) {
      console.error('❌ Error generating overall report:', error);
      throw error;
    }
  }

  /**
   * Save report to database
   */
  async saveReport(userEmail, reportType, reportTitle, reportData, metricsSummary, periodStart, periodEnd) {
    try {
      // Get user ID
      const { data: userData } = await supabase
        .from('users_table')
        .select('id')
        .eq('email', userEmail)
        .single();

      if (!userData) {
        throw new Error('User not found');
      }

      const reportRecord = {
        user_id: userData.id,
        user_email: userEmail,
        report_type: reportType,
        report_title: reportTitle,
        report_data: reportData,
        metrics_summary: metricsSummary,
        report_period_start: periodStart,
        report_period_end: periodEnd,
        status: 'generated'
      };

      const { data, error } = await supabase
        .from('reports')
        .insert(reportRecord)
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log(`✅ Report saved: ${reportType} - ${data.id}`);
      return data;
    } catch (error) {
      console.error('❌ Error saving report:', error);
      throw error;
    }
  }

  /**
   * Get user reports
   */
  async getUserReports(userEmail, reportType = null) {
    try {
      let query = supabase
        .from('reports')
        .select('*')
        .eq('user_email', userEmail)
        .order('created_at', { ascending: false });

      if (reportType) {
        query = query.eq('report_type', reportType);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('❌ Error fetching reports:', error);
      throw error;
    }
  }

  /**
   * Delete report
   */
  async deleteReport(reportId, userEmail) {
    try {
      const { error } = await supabase
        .from('reports')
        .delete()
        .eq('id', reportId)
        .eq('user_email', userEmail);

      if (error) {
        throw error;
      }

      console.log(`✅ Report deleted: ${reportId}`);
      return true;
    } catch (error) {
      console.error('❌ Error deleting report:', error);
      throw error;
    }
  }

  // Helper methods - These are placeholders, actual data should come from cache/services
  async getSEOMetrics(userEmail) {
    // TODO: Fetch from SEO cache service
    // Returning null instead of hardcoded values
    return null;
  }

  async getPerformanceMetrics(userEmail) {
    // TODO: Fetch from lighthouse/pagespeed cache
    // Returning null instead of hardcoded values
    return null;
  }

  async getAnalyticsMetrics(userEmail) {
    // TODO: Fetch from analytics service cache
    // Returning null instead of hardcoded values
    return null;
  }

  async getTechnicalSEOMetrics(userEmail) {
    // TODO: Fetch from technical SEO service cache
    return null;
  }

  async getSearchConsoleMetrics(userEmail) {
    // TODO: Fetch from search console cache
    return null;
  }

  async getLighthouseMetrics(userEmail) {
    // TODO: Fetch from lighthouse cache
    return null;
  }

  calculateAvgCacheAge(data) {
    if (!data || data.length === 0) return 0;
    const totalAge = data.reduce((sum, item) => {
      const age = (new Date() - new Date(item.updated_at)) / (1000 * 60 * 60); // hours
      return sum + age;
    }, 0);
    return (totalAge / data.length).toFixed(2);
  }

  calculateAvgDuration(logs) {
    if (!logs || logs.length === 0) return 0;
    const total = logs.reduce((sum, log) => sum + (log.duration_ms || 0), 0);
    return (total / logs.length).toFixed(0);
  }

  calculateSuccessRate(logs) {
    if (!logs || logs.length === 0) return 0;
    const successful = logs.filter(log => log.status === 'success').length;
    return ((successful / logs.length) * 100).toFixed(2);
  }

  calculateCacheHitRate(logs) {
    if (!logs || logs.length === 0) return 0;
    const cacheHits = logs.filter(log => log.cache_hit).length;
    return ((cacheHits / logs.length) * 100).toFixed(2);
  }

  calculateOverallScore(reportData) {
    // Calculate weighted average of all scores
    let totalScore = 0;
    let totalWeight = 0;

    if (reportData.dashboard) {
      totalScore += (reportData.dashboard.seoScore || 0) * 0.3;
      totalWeight += 0.3;
    }

    if (reportData.seo) {
      totalScore += (reportData.seo.seoScore || 0) * 0.4;
      totalWeight += 0.4;
    }

    return totalWeight > 0 ? (totalScore / totalWeight).toFixed(0) : 0;
  }

  extractKeyMetrics(reportData) {
    return {
      seoScore: reportData.seo?.metricsSummary?.seoScore || 0,
      socialPosts: reportData.social?.metricsSummary?.totalPosts || 0,
      competitorAnalyses: reportData.competitor?.metricsSummary?.totalAnalyses || 0
    };
  }
}

export default new ReportGenerationService();
