import lighthouseService from './lighthouseService.js';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

class QuickWinsService {
  /**
   * Get quick wins data from multiple sources
   * Priority: Cached opportunities > Fresh Lighthouse analysis > Fallback recommendations
   */
  async getQuickWinsData(email, domain, forceRefresh = false) {
    const quickWinsData = {
      source: null,
      opportunities: [],
      summary: {
        totalOpportunities: 0,
        highImpact: 0,
        mediumImpact: 0,
        lowImpact: 0,
        totalSavingsMs: 0,
        totalSavingsBytes: 0
      },
      categories: {
        performance: [],
        seo: [],
        accessibility: [],
        bestPractices: []
      },
      lastUpdated: null
    };

    try {
      // If not forcing refresh, try to get cached data first
      if (!forceRefresh) {
        const cachedData = await this.getCachedQuickWins(email, domain);
        if (cachedData) {
          console.log('✅ Returning cached Quick Wins data');
          return cachedData;
        }
      }

      // Cache miss or force refresh - get fresh Lighthouse data
      console.log('🔦 Fetching fresh Lighthouse data for Quick Wins...');
      const lighthouseData = await lighthouseService.analyzeSite(domain);
      
      if (lighthouseData && lighthouseData.opportunities) {
        quickWinsData.source = 'lighthouse_fresh';
        quickWinsData.opportunities = this.processLighthouseOpportunities(lighthouseData.opportunities);
        quickWinsData.summary = this.calculateOpportunitiesSummary(quickWinsData.opportunities);
        quickWinsData.categories = this.categorizeOpportunities(quickWinsData.opportunities);
        quickWinsData.lastUpdated = new Date().toISOString();
        
        // Cache the processed data
        await this.cacheQuickWins(email, domain, quickWinsData);
        
        return quickWinsData;
      }
    } catch (error) {
      console.error('⚠️ Fresh Lighthouse analysis failed, trying fallback...', error.message);
    }

    // Fallback to generic recommendations
    try {
      quickWinsData.source = 'fallback_recommendations';
      quickWinsData.opportunities = await this.getFallbackRecommendations(domain);
      quickWinsData.summary = this.calculateOpportunitiesSummary(quickWinsData.opportunities);
      quickWinsData.categories = this.categorizeOpportunities(quickWinsData.opportunities);
      quickWinsData.lastUpdated = new Date().toISOString();
      
      return quickWinsData;
    } catch (error) {
      console.error('❌ Error generating fallback recommendations:', error);
      return quickWinsData; // Return empty structure
    }
  }

  /**
   * Get cached quick wins from database
   */
  async getCachedQuickWins(email, domain) {
    if (!supabase || !email || !domain) return null;
    
    try {
      const { data, error } = await supabase
        .from('health_score_cache')
        .select('improvement_opportunities, updated_at, expires_at')
        .eq('user_email', email)
        .eq('website_url', domain)
        .single();

      if (error || !data) {
        console.log('📊 No cached Quick Wins found for:', domain);
        return null;
      }

      // Check if cache is expired
      const now = new Date();
      const expiresAt = new Date(data.expires_at);
      if (now > expiresAt) {
        console.log('⏰ Cached Quick Wins expired for:', domain);
        return null;
      }

      if (data.improvement_opportunities) {
        console.log('✅ Found cached Quick Wins data for:', domain);
        return {
          source: 'database_cache',
          opportunities: data.improvement_opportunities.opportunities || [],
          summary: data.improvement_opportunities.summary || {
            totalOpportunities: 0,
            highImpact: 0,
            mediumImpact: 0,
            lowImpact: 0
          },
          categories: data.improvement_opportunities.categories || {},
          lastUpdated: data.updated_at
        };
      }

      return null;
    } catch (error) {
      console.error('❌ Error fetching cached quick wins:', error);
      return null;
    }
  }

  /**
   * Cache quick wins data in database
   */
  async cacheQuickWins(email, domain, data) {
    if (!supabase || !email || !domain) return false;
    
    try {
      // Prepare the data to cache
      const quickWinsCache = {
        opportunities: data.opportunities || [],
        summary: data.summary || {},
        categories: data.categories || {},
        source: data.source,
        lastUpdated: data.lastUpdated
      };

      // Upsert into health_score_cache table
      const { error } = await supabase
        .from('health_score_cache')
        .upsert({
          user_email: email,
          website_url: domain,
          improvement_opportunities: quickWinsCache,
          updated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString() // 6 hours
        }, {
          onConflict: 'user_email,website_url'
        });

      if (error) {
        console.error('❌ Error caching Quick Wins:', error);
        return false;
      }

      console.log('💾 Successfully cached Quick Wins data for:', domain);
      return true;
    } catch (error) {
      console.error('❌ Error caching quick wins:', error);
      return false;
    }
  }

  /**
   * Process Lighthouse opportunities into standardized format
   */
  processLighthouseOpportunities(opportunities) {
    return opportunities.map((opp, index) => ({
      id: `lh_${index}`,
      title: opp.title || `Optimization ${index + 1}`,
      description: opp.description || 'Performance optimization opportunity',
      impact: opp.impact || this.categorizeImpact(opp.savings || 0),
      category: this.determineCategory(opp.audit || opp.title),
      savingsMs: opp.savings || 0,
      savingsBytes: opp.savingsBytes || 0,
      score: opp.score || 0,
      audit: opp.audit,
      priority: this.calculatePriority(opp.savings || 0, opp.impact),
      estimatedEffort: this.estimateEffort(opp.audit),
      tags: this.generateTags(opp.audit, opp.title)
    })).sort((a, b) => b.priority - a.priority);
  }

  /**
   * Calculate summary statistics
   */
  calculateOpportunitiesSummary(opportunities) {
    const summary = {
      totalOpportunities: opportunities.length,
      highImpact: 0,
      mediumImpact: 0,
      lowImpact: 0,
      totalSavingsMs: 0,
      totalSavingsBytes: 0
    };

    opportunities.forEach(opp => {
      switch (opp.impact) {
        case 'high':
          summary.highImpact++;
          break;
        case 'medium':
          summary.mediumImpact++;
          break;
        case 'low':
          summary.lowImpact++;
          break;
      }
      summary.totalSavingsMs += opp.savingsMs || 0;
      summary.totalSavingsBytes += opp.savingsBytes || 0;
    });

    return summary;
  }

  /**
   * Categorize opportunities by type
   */
  categorizeOpportunities(opportunities) {
    const categories = {
      performance: [],
      seo: [],
      accessibility: [],
      bestPractices: []
    };

    opportunities.forEach(opp => {
      const category = opp.category || 'performance';
      if (categories[category]) {
        categories[category].push(opp);
      } else {
        categories.performance.push(opp); // Default to performance
      }
    });

    return categories;
  }

  /**
   * Determine category based on audit name
   */
  determineCategory(auditName = '') {
    const audit = auditName.toLowerCase();
    
    if (audit.includes('seo') || audit.includes('title') || audit.includes('meta') || 
        audit.includes('crawl') || audit.includes('robots') || audit.includes('structured')) {
      return 'seo';
    }
    
    if (audit.includes('accessibility') || audit.includes('contrast') || audit.includes('alt') || 
        audit.includes('label') || audit.includes('aria') || audit.includes('heading')) {
      return 'accessibility';
    }
    
    if (audit.includes('security') || audit.includes('https') || audit.includes('vulnerable') || 
        audit.includes('mixed-content') || audit.includes('hsts')) {
      return 'bestPractices';
    }
    
    return 'performance'; // Default
  }

  /**
   * Categorize impact based on savings
   */
  categorizeImpact(savingsMs) {
    if (savingsMs > 1500) return 'high';
    if (savingsMs > 750) return 'medium';
    return 'low';
  }

  /**
   * Calculate priority score (0-100)
   */
  calculatePriority(savingsMs, impact) {
    const savingsScore = Math.min(100, (savingsMs || 0) / 50); // Max 5000ms = 100 points
    const impactScore = impact === 'high' ? 100 : impact === 'medium' ? 70 : 40;
    
    return Math.round((savingsScore + impactScore) / 2);
  }

  /**
   * Estimate implementation effort
   */
  estimateEffort(auditName = '') {
    const audit = auditName.toLowerCase();
    
    // High effort
    if (audit.includes('unused-javascript') || audit.includes('code-splitting') || 
        audit.includes('server-response-time') || audit.includes('third-party')) {
      return 'high';
    }
    
    // Medium effort  
    if (audit.includes('unused-css') || audit.includes('modern-image-formats') || 
        audit.includes('efficiently-encode-images') || audit.includes('render-blocking')) {
      return 'medium';
    }
    
    // Low effort
    return 'low';
  }

  /**
   * Generate tags for opportunities
   */
  generateTags(auditName = '', title = '') {
    const tags = [];
    const text = (auditName + ' ' + title).toLowerCase();
    
    if (text.includes('image')) tags.push('images');
    if (text.includes('css')) tags.push('css');
    if (text.includes('javascript') || text.includes('js')) tags.push('javascript');
    if (text.includes('render') || text.includes('blocking')) tags.push('render-blocking');
    if (text.includes('compression') || text.includes('gzip')) tags.push('compression');
    if (text.includes('cache') || text.includes('caching')) tags.push('caching');
    if (text.includes('mobile') || text.includes('responsive')) tags.push('mobile');
    if (text.includes('security') || text.includes('https')) tags.push('security');
    
    return tags.length > 0 ? tags : ['optimization'];
  }

  /**
   * Generate fallback recommendations when Lighthouse fails
   */
  async getFallbackRecommendations(domain) {
    const fallbackOpportunities = [
      {
        id: 'fb_1',
        title: 'Optimize Images',
        description: 'Serve images in next-gen formats like WebP and ensure proper sizing',
        impact: 'high',
        category: 'performance',
        savingsMs: 1200,
        savingsBytes: 500000,
        score: 70,
        priority: 85,
        estimatedEffort: 'medium',
        tags: ['images', 'optimization']
      },
      {
        id: 'fb_2',
        title: 'Enable Text Compression',
        description: 'Enable gzip/brotli compression for text-based resources',
        impact: 'medium',
        category: 'performance',
        savingsMs: 800,
        savingsBytes: 200000,
        score: 60,
        priority: 75,
        estimatedEffort: 'low',
        tags: ['compression', 'optimization']
      },
      {
        id: 'fb_3',
        title: 'Minify CSS',
        description: 'Remove unused CSS and minify remaining stylesheets',
        impact: 'medium',
        category: 'performance',
        savingsMs: 600,
        savingsBytes: 150000,
        score: 55,
        priority: 70,
        estimatedEffort: 'low',
        tags: ['css', 'optimization']
      },
      {
        id: 'fb_4',
        title: 'Add Meta Description',
        description: 'Include descriptive meta descriptions for better search visibility',
        impact: 'medium',
        category: 'seo',
        savingsMs: 0,
        savingsBytes: 0,
        score: 40,
        priority: 65,
        estimatedEffort: 'low',
        tags: ['seo', 'meta']
      },
      {
        id: 'fb_5',
        title: 'Improve Color Contrast',
        description: 'Ensure text has sufficient color contrast for accessibility',
        impact: 'medium',
        category: 'accessibility',
        savingsMs: 0,
        savingsBytes: 0,
        score: 45,
        priority: 60,
        estimatedEffort: 'low',
        tags: ['accessibility', 'contrast']
      }
    ];

    return fallbackOpportunities;
  }

  /**
   * Format bytes for display
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Format milliseconds for display
   */
  formatTime(ms) {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }
}

const quickWinsService = new QuickWinsService();
export default quickWinsService;