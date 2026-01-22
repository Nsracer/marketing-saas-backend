// Test API Fallback - Forces PageSpeed API instead of Chrome
// Usage: node test-fallback.js yourdomain.com

import dotenv from 'dotenv';
dotenv.config();

// Force API fallback
process.env.FORCE_API_FALLBACK = 'true';

import lighthouseService from './services/lighthouseService.js';

const domain = process.argv[2] || 'example.com';

console.log(`\n🧪 Testing API Fallback for: ${domain}`);
console.log(`⏳ Analyzing... (30-60 seconds)\n`);

const start = Date.now();

lighthouseService.analyzeSite(domain)
  .then(result => {
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    
    if (!result) {
      console.log('❌ No data returned\n');
      return;
    }
    
    console.log(`✅ Analysis Complete (${duration}s)`);
    console.log(`📊 Source: ${result.source}\n`);
    
    console.log('Category Scores:');
    console.log(`  Performance:    ${result.categoryScores.performance}%`);
    console.log(`  Accessibility:  ${result.categoryScores.accessibility}%`);
    console.log(`  Best Practices: ${result.categoryScores.bestPractices}%`);
    console.log(`  SEO:            ${result.categoryScores.seo}%\n`);
    
    console.log('Core Web Vitals:');
    console.log(`  LCP: ${result.coreWebVitals.lcp.displayValue} (${result.coreWebVitals.lcp.rating})`);
    console.log(`  FID: ${result.coreWebVitals.fid.displayValue} (${result.coreWebVitals.fid.rating})`);
    console.log(`  CLS: ${result.coreWebVitals.cls.displayValue} (${result.coreWebVitals.cls.rating})`);
    console.log(`  FCP: ${result.coreWebVitals.fcp.displayValue} (${result.coreWebVitals.fcp.rating})\n`);
    
    console.log('Performance Timeline:');
    console.log(`  FCP: ${result.performanceTimeline.fcp}ms`);
    console.log(`  LCP: ${result.performanceTimeline.lcp}ms`);
    console.log(`  TTI: ${result.performanceTimeline.tti}ms`);
    console.log(`  Speed Index: ${result.performanceTimeline.speedIndex}ms`);
    console.log(`  TBT: ${result.performanceTimeline.tbt}ms\n`);
    
    console.log('Resource Metrics:');
    console.log(`  Total Size: ${result.resourceMetrics.totalByteWeight.displayValue}`);
    console.log(`  Unused CSS: ${result.resourceMetrics.unusedCss.displayValue}`);
    console.log(`  Unused JS: ${result.resourceMetrics.unusedJavaScript.displayValue}\n`);
    
    console.log('SEO Analysis:');
    console.log(`  Title: ${result.seoAnalysis.hasTitle.passed ? '✅' : '❌'} (${result.seoAnalysis.hasTitle.score}%)`);
    console.log(`  Meta: ${result.seoAnalysis.hasMetaDescription.passed ? '✅' : '❌'} (${result.seoAnalysis.hasMetaDescription.score}%)`);
    console.log(`  HTTPS: ${result.seoAnalysis.isHTTPS.passed ? '✅' : '❌'} (${result.seoAnalysis.isHTTPS.score}%)`);
    console.log(`  Viewport: ${result.seoAnalysis.hasViewport.passed ? '✅' : '❌'} (${result.seoAnalysis.hasViewport.score}%)`);
    console.log(`  Crawlable: ${result.seoAnalysis.isCrawlable.passed ? '✅' : '❌'} (${result.seoAnalysis.isCrawlable.score}%)\n`);
    
    if (result.opportunities && result.opportunities.length > 0) {
      console.log(`Opportunities (${result.opportunities.length}):`);
      result.opportunities.slice(0, 5).forEach((opp, i) => {
        console.log(`  ${i + 1}. ${opp.title} (${opp.savings}ms savings)`);
      });
      console.log();
    }
    
    console.log('✨ API fallback working correctly!\n');
  })
  .catch(error => {
    console.log(`❌ Error: ${error.message}\n`);
  });
