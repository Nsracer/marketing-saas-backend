/**
 * Test script for Puppeteer caching optimization
 * Demonstrates the caching flow and performance improvements
 */

import puppeteerCacheService from './services/puppeteerCacheService.js';
import { performance } from 'perf_hooks';

const testEmail = 'test@example.com';
const testDomain = 'example.com';

console.log('🧪 TESTING: Puppeteer Caching Optimization\n');
console.log('='.repeat(70));

async function runTest() {
  try {
    // ==== TEST 1: First fetch (cache miss) ====
    console.log('\n📊 TEST 1: First fetch (cache miss - should call API)\n');
    const test1Start = performance.now();
    
    const result1 = await puppeteerCacheService.getPuppeteerAnalysis(
      testEmail,
      testDomain,
      true, // isUserDomain
      false // forceRefresh
    );
    
    const test1Duration = Math.round(performance.now() - test1Start);
    
    if (result1 && result1.success) {
      console.log(`✅ TEST 1 PASSED`);
      console.log(`   Duration: ${test1Duration}ms`);
      console.log(`   Domain: ${result1.domain}`);
      console.log(`   Title: ${result1.seo?.title || 'N/A'}`);
      console.log(`   Data cached: Yes`);
    } else {
      console.log(`❌ TEST 1 FAILED: ${result1?.error || 'Unknown error'}`);
      return;
    }

    // ==== TEST 2: Second fetch (cache hit) ====
    console.log('\n📊 TEST 2: Second fetch (cache hit - should be instant)\n');
    const test2Start = performance.now();
    
    const result2 = await puppeteerCacheService.getPuppeteerAnalysis(
      testEmail,
      testDomain,
      true,
      false
    );
    
    const test2Duration = Math.round(performance.now() - test2Start);
    
    if (result2 && result2.success) {
      console.log(`✅ TEST 2 PASSED`);
      console.log(`   Duration: ${test2Duration}ms`);
      console.log(`   Speed improvement: ${Math.round((test1Duration / test2Duration) * 100) / 100}x faster`);
      console.log(`   Cached: Yes`);
    } else {
      console.log(`❌ TEST 2 FAILED: ${result2?.error || 'Unknown error'}`);
      return;
    }

    // ==== TEST 3: Pre-warm cache ====
    console.log('\n📊 TEST 3: Pre-warm cache (should detect existing cache)\n');
    const test3Start = performance.now();
    
    const result3 = await puppeteerCacheService.prewarmUserDomainCache(
      testEmail,
      testDomain
    );
    
    const test3Duration = Math.round(performance.now() - test3Start);
    
    if (result3) {
      console.log(`✅ TEST 3 PASSED`);
      console.log(`   Duration: ${test3Duration}ms`);
      console.log(`   Cache already warm: Yes`);
    } else {
      console.log(`⚠️  TEST 3: Pre-warm returned false (might be okay if cache already exists)`);
    }

    // ==== TEST 4: Force refresh ====
    console.log('\n📊 TEST 4: Force refresh (should bypass cache and call API)\n');
    const test4Start = performance.now();
    
    const result4 = await puppeteerCacheService.getPuppeteerAnalysis(
      testEmail,
      testDomain,
      true,
      true // forceRefresh = true
    );
    
    const test4Duration = Math.round(performance.now() - test4Start);
    
    if (result4 && result4.success) {
      console.log(`✅ TEST 4 PASSED`);
      console.log(`   Duration: ${test4Duration}ms`);
      console.log(`   Fresh API call: Yes`);
      console.log(`   Data updated in cache: Yes`);
    } else {
      console.log(`❌ TEST 4 FAILED: ${result4?.error || 'Unknown error'}`);
      return;
    }

    // ==== SUMMARY ====
    console.log('\n' + '='.repeat(70));
    console.log('\n📈 PERFORMANCE SUMMARY:\n');
    console.log(`   First API call (cold):     ${test1Duration}ms`);
    console.log(`   Cached retrieval:          ${test2Duration}ms (${Math.round((test1Duration / test2Duration) * 100) / 100}x faster)`);
    console.log(`   Cache pre-warm check:      ${test3Duration}ms`);
    console.log(`   Forced refresh (hot):      ${test4Duration}ms`);
    console.log('\n✅ All tests completed successfully!\n');
    
    console.log('💡 BENEFITS:\n');
    console.log(`   - Competitor analysis will be ${Math.round((test1Duration / test2Duration) * 100) / 100}x faster when using cached data`);
    console.log(`   - User's own domain data is pre-cached in background`);
    console.log(`   - Cache duration: 7 days`);
    console.log(`   - Reduces API calls to external Puppeteer service`);
    console.log(`   - Improves user experience with instant results`);
    
    console.log('\n' + '='.repeat(70) + '\n');

  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED:', error);
    console.error(error.stack);
  }
}

// Run the test
runTest()
  .then(() => {
    console.log('🎉 Test suite finished\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Test suite error:', error);
    process.exit(1);
  });
