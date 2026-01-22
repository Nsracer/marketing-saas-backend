import pagespeedService from './pagespeedService.js';
import analyticsService from './analyticsService.js';

const scoringService = {
  calculateHealthScore(data) {
    const { lighthouse, pagespeed, analytics, searchConsole, technicalSEO } = data;
    console.log('🧮 Calculating health score with data:', {
      lighthouse: !!lighthouse,
      pagespeed: !!pagespeed,
      analytics: !!analytics,
      searchConsole: !!searchConsole,
      technicalSEO: !!technicalSEO
    });

    // Calculate individual scores
    const technicalScore = this.calculateTechnicalScore(lighthouse, pagespeed);
    const userExperienceScore = this.calculateUserExperienceScore(analytics, pagespeed);
    const seoHealthScore = this.calculateSEOHealthScore(lighthouse, technicalSEO);

    // Define weights
    const weights = {
      technical: 0.4,
      userExperience: 0.35,
      seoHealth: 0.25
    };

    // Calculate weighted scores
    const validScores = [];
    const scoreBreakdown = {};

    if (technicalScore !== null) {
      validScores.push(technicalScore * weights.technical);
      scoreBreakdown.technical = technicalScore;
    }

    if (userExperienceScore !== null) {
      validScores.push(userExperienceScore * weights.userExperience);
      scoreBreakdown.userExperience = userExperienceScore;
    }

    if (seoHealthScore !== null) {
      validScores.push(seoHealthScore * weights.seoHealth);
      scoreBreakdown.seoHealth = seoHealthScore;
    }

    // Calculate overall score
    const overallScore = validScores.length > 0 ?
      Math.round(validScores.reduce((sum, score) => sum + score, 0)) : null;

    const dataQuality = this.assessDataQuality(data);

    console.log('📊 Score calculation results:', {
      overall: overallScore,
      breakdown: scoreBreakdown,
      dataQuality
    });

    return {
      overall: overallScore,
      technical: scoreBreakdown.technical,
      userExperience: scoreBreakdown.userExperience,
      seoHealth: scoreBreakdown.seoHealth,
      dataQuality,
      coreVitalsScore: this.calculateCoreVitalsScore(pagespeed),
      timestamp: new Date().toISOString()
    };
  },

  // FIXED: Add missing technical score calculation
  calculateTechnicalScore(lighthouse, pagespeed) {
    if (!lighthouse && !pagespeed) {
      console.log('⚠️ No technical data available');
      return null;
    }

    let score = 0;
    let factors = 0;

    // Lighthouse performance score (40% weight)
    // Fix: Access categoryScores
    if (lighthouse?.categoryScores?.performance) {
      score += lighthouse.categoryScores.performance * 0.4;
      factors += 0.4;
      console.log('🔦 Lighthouse performance:', lighthouse.categoryScores.performance);
    } else if (lighthouse?.performance) {
      // Fallback for flat structure
      score += lighthouse.performance * 0.4;
      factors += 0.4;
      console.log('🔦 Lighthouse performance (flat):', lighthouse.performance);
    }

    // PageSpeed mobile performance (30% weight)
    if (pagespeed?.mobile?.labData?.performanceScore) {
      score += pagespeed.mobile.labData.performanceScore * 0.3;
      factors += 0.3;
      console.log('📱 PageSpeed mobile performance:', pagespeed.mobile.labData.performanceScore);
    }

    // Core Web Vitals (30% weight)
    const coreVitalsScore = this.calculateCoreVitalsScore(pagespeed);
    if (coreVitalsScore !== null) {
      score += coreVitalsScore * 0.3;
      factors += 0.3;
      console.log('⚡ Core Web Vitals score:', coreVitalsScore);
    }

    const finalScore = factors > 0 ? Math.round(score / factors) : null;
    console.log('🔧 Technical score calculated:', finalScore);
    return finalScore;
  },

  // FIXED: Add missing user experience score calculation
  calculateUserExperienceScore(analytics, pagespeed) {
    let score = 0;
    let factors = 0;

    // Core Web Vitals (50% weight)
    const coreVitalsScore = this.calculateCoreVitalsScore(pagespeed);
    if (coreVitalsScore !== null) {
      score += coreVitalsScore * 0.5;
      factors += 0.5;
    }

    // Analytics bounce rate (25% weight)
    if (analytics?.bounceRate !== null && analytics?.bounceRate !== undefined) {
      const bounceScore = Math.max(0, Math.min(100, 100 - analytics.bounceRate));
      score += bounceScore * 0.25;
      factors += 0.25;
      console.log('📊 Bounce rate score:', bounceScore);
    }

    // Session duration (25% weight)
    if (analytics?.avgSessionDuration !== null && analytics?.avgSessionDuration !== undefined) {
      const durationScore = Math.min(100, (analytics.avgSessionDuration / 180) * 100); // 3 min = 100%
      score += durationScore * 0.25;
      factors += 0.25;
      console.log('⏱️ Session duration score:', durationScore);
    }

    const finalScore = factors > 0 ? Math.round(score / factors) : null;
    console.log('👤 User experience score calculated:', finalScore);
    return finalScore;
  },

  // FIXED: Add missing SEO health score calculation
  calculateSEOHealthScore(lighthouse, technicalSEO) {
    let score = 0;
    let factors = 0;

    // Lighthouse SEO score (60% weight)
    // Fix: Access categoryScores
    if (lighthouse?.categoryScores?.seo) {
      score += lighthouse.categoryScores.seo * 0.6;
      factors += 0.6;
      console.log('🔍 Lighthouse SEO score:', lighthouse.categoryScores.seo);
    } else if (lighthouse?.seo) {
      // Fallback for flat structure
      score += lighthouse.seo * 0.6;
      factors += 0.6;
      console.log('🔍 Lighthouse SEO score (flat):', lighthouse.seo);
    }

    // Technical SEO score (40% weight)
    if (technicalSEO?.overallScore) {
      score += technicalSEO.overallScore * 0.4;
      factors += 0.4;
      console.log('⚙️ Technical SEO score:', technicalSEO.overallScore);
    }

    const finalScore = factors > 0 ? Math.round(score / factors) : null;
    console.log('🎯 SEO health score calculated:', finalScore);
    return finalScore;
  },

  // FIXED: Add Core Web Vitals calculation
  calculateCoreVitalsScore(pagespeed) {
    if (!pagespeed?.mobile?.labData) {
      console.log('⚠️ No Core Web Vitals data available');
      return null;
    }

    const { lcp, fid, cls } = pagespeed.mobile.labData;
    let totalScore = 0;
    let validMetrics = 0;

    // LCP scoring (Good: <2.5s, Needs Improvement: 2.5-4s, Poor: >4s)
    if (lcp !== null) {
      const lcpSeconds = lcp / 1000;
      let lcpScore;
      if (lcpSeconds <= 2.5) lcpScore = 100;
      else if (lcpSeconds <= 4.0) lcpScore = Math.round(((4.0 - lcpSeconds) / 1.5) * 100);
      else lcpScore = 0;

      totalScore += lcpScore;
      validMetrics++;
      console.log(`📏 LCP: ${lcpSeconds.toFixed(2)}s = ${lcpScore} points`);
    }

    // FID scoring (Good: <100ms, Needs Improvement: 100-300ms, Poor: >300ms)
    if (fid !== null) {
      let fidScore;
      if (fid <= 100) fidScore = 100;
      else if (fid <= 300) fidScore = Math.round(((300 - fid) / 200) * 100);
      else fidScore = 0;

      totalScore += fidScore;
      validMetrics++;
      console.log(`⚡ FID: ${fid}ms = ${fidScore} points`);
    }

    // CLS scoring (Good: <0.1, Needs Improvement: 0.1-0.25, Poor: >0.25)
    if (cls !== null) {
      let clsScore;
      if (cls <= 0.1) clsScore = 100;
      else if (cls <= 0.25) clsScore = Math.round(((0.25 - cls) / 0.15) * 100);
      else clsScore = 0;

      totalScore += clsScore;
      validMetrics++;
      console.log(`📊 CLS: ${cls.toFixed(3)} = ${clsScore} points`);
    }

    const avgScore = validMetrics > 0 ? Math.round(totalScore / validMetrics) : null;
    console.log('⚡ Core Web Vitals average score:', avgScore);
    return avgScore;
  },

  // FIXED: Add data quality assessment
  assessDataQuality(data) {
    const sources = [];

    if (data.lighthouse) sources.push('lighthouse');
    if (data.pagespeed) sources.push('pagespeed');
    if (data.analytics) sources.push('analytics');
    if (data.searchConsole) sources.push('searchConsole');
    if (data.technicalSEO) sources.push('technicalSEO');

    const quality = sources.length >= 3 ? 'good' : sources.length >= 2 ? 'fair' : 'limited';

    console.log('📊 Data quality assessment:', {
      sources: sources.length,
      available: sources,
      quality
    });

    return {
      level: quality,
      sources: sources.length,
      available: sources,
      recommendations: this.getDataQualityRecommendations(sources)
    };
  },

  getDataQualityRecommendations(sources) {
    const recommendations = [];

    if (!sources.includes('pagespeed')) {
      recommendations.push('Connect PageSpeed Insights for Core Web Vitals data');
    }
    if (!sources.includes('analytics')) {
      recommendations.push('Connect Google Analytics for user behavior insights');
    }
    if (!sources.includes('searchConsole')) {
      recommendations.push('Connect Search Console for search performance data');
    }

    return recommendations;
  }
};

export default scoringService;
