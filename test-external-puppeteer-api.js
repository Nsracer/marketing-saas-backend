/**
 * Test script for external Puppeteer API integration
 * This verifies that the new API-based competitor analysis works correctly
 */

import competitorAnalysisService from './services/competitorAnalysisService.js';

async function testExternalPuppeteerAPI() {
  console.log('🧪 Testing External Puppeteer API Integration\n');
  console.log('='.repeat(60));
  
  const testDomains = [
    'agentic.tech',
    'example.com'
  ];

  for (const domain of testDomains) {
    console.log(`\n📊 Testing domain: ${domain}`);
    console.log('-'.repeat(60));
    
    try {
      const startTime = Date.now();
      const result = await competitorAnalysisService.analyzeWebsite(domain);
      const duration = Date.now() - startTime;
      
      console.log(`\n⏱️  Analysis completed in ${duration}ms`);
      console.log(`✅ Success: ${result.success}`);
      
      if (result.success) {
        console.log(`\n📋 Analysis Results:`);
        console.log(`   URL: ${result.url}`);
        console.log(`   Domain: ${result.domain}`);
        console.log(`   Status Code: ${result.statusCode}`);
        console.log(`   HTTPS: ${result.security.isHTTPS}`);
        console.log(`   Server: ${result.security.server || 'N/A'}`);
        console.log(`   CDN: ${result.security.cdn || 'N/A'}`);
        
        console.log(`\n📄 SEO:`);
        console.log(`   Title: ${result.seo.title || 'N/A'}`);
        console.log(`   Meta Description: ${result.seo.metaDescription ? 'Present' : 'Missing'}`);
        console.log(`   H1 Count: ${result.seo.headings.h1Count}`);
        console.log(`   H2 Count: ${result.seo.headings.h2Count}`);
        
        console.log(`\n📝 Content:`);
        console.log(`   Word Count: ${result.content.wordCount}`);
        console.log(`   Images: ${result.content.images.total} (${result.content.images.altCoverage}% with alt)`);
        console.log(`   Links: ${result.content.links.total} (${result.content.links.internal} internal, ${result.content.links.external} external)`);
        
        console.log(`\n🛠️  Technology:`);
        console.log(`   CMS: ${result.technology.cms || 'N/A'}`);
        console.log(`   Frameworks: ${result.technology.frameworks.join(', ') || 'None detected'}`);
        console.log(`   Analytics: ${result.technology.analytics.join(', ') || 'None detected'}`);
        
        console.log(`\n🤖 Files:`);
        console.log(`   robots.txt: ${result.robotsTxt.exists ? '✅ Found' : '❌ Not found'}`);
        console.log(`   sitemap.xml: ${result.sitemap.exists ? `✅ Found (${result.sitemap.urlCount} URLs)` : '❌ Not found'}`);
      } else {
        console.log(`\n❌ Error: ${result.error}`);
        console.log(`   Error Type: ${result.errorType}`);
      }
      
    } catch (error) {
      console.error(`\n❌ Test failed for ${domain}:`, error.message);
      console.error(`   Stack: ${error.stack}`);
    }
    
    console.log('\n' + '='.repeat(60));
  }
  
  console.log('\n✅ All tests completed!\n');
}

// Run the test
testExternalPuppeteerAPI()
  .then(() => {
    console.log('🎉 Test suite finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  });
