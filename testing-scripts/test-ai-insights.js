import dotenv from 'dotenv';
import aiInsightsService from '../services/aiInsightsService.js';

dotenv.config();

const TEST_EMAIL = 'iammusharraf11@gmail.com';

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║         AI INSIGHTS SERVICE TEST (UNIFIED)                   ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

/**
 * Test data gathering
 */
async function testDataGathering() {
  console.log('📊 TEST 1: Data Gathering');
  console.log('─'.repeat(60));
  
  try {
    const metrics = await aiInsightsService.gatherAllMetrics(TEST_EMAIL);
    
    console.log(`✅ User Plan: ${metrics.userPlan}`);
    console.log(`✅ SEO Data Available: ${metrics.seo ? 'YES' : 'NO'}`);
    if (metrics.seo) {
      console.log(`   └─ Domain: ${metrics.seo.domain}`);
      console.log(`   └─ Performance: ${metrics.seo.performanceScore}/100, SEO: ${metrics.seo.seoScore}/100`);
      console.log(`   └─ Clicks: ${metrics.seo.totalClicks}, Position: ${metrics.seo.averagePosition?.toFixed(1)}`);
    }
    
    console.log(`✅ Social Data: ${metrics.social ? 'YES' : 'NO'}`);
    if (metrics.social) {
      console.log(`   └─ ${metrics.social.activePlatforms.join(', ')} - ${metrics.social.totalFollowers} followers`);
    }
    
    console.log(`✅ Competitor Data: ${metrics.competitor ? 'YES' : 'NO'}`);
    if (metrics.competitor) {
      console.log(`   └─ ${metrics.competitor.totalCompetitors} competitors tracked`);
    }
    
    console.log('\n✅ Data gathering PASSED\n');
    return metrics;
  } catch (error) {
    console.error('❌ Data gathering FAILED:', error.message);
    return null;
  }
}

/**
 * Test unified insights (3-5 total recommendations across ALL categories)
 */
async function testUnifiedInsights() {
  console.log(`🎯 TEST 2: Unified AI Insights (3-5 total recommendations)`);
  console.log('─'.repeat(60));
  
  try {
    const result = await aiInsightsService.generateInsights(TEST_EMAIL);
    
    console.log(`✅ Success: ${result.success}`);
    
    const insights = result.insights;
    console.log(`\n📊 Results:`);
    console.log(`   └─ Overall Score: ${insights.overallScore}/100`);
    console.log(`   └─ Plan Tier: ${insights.planTier}`);
    console.log(`   └─ Total Recommendations: ${insights.recommendations?.length || 0}`);
    
    if (insights.recommendations && insights.recommendations.length > 0) {
      console.log(`\n   📋 Recommendations:`);
      insights.recommendations.forEach((rec, idx) => {
        console.log(`\n   ${idx + 1}. [${rec.category}] ${rec.title}`);
        console.log(`      ${rec.description}`);
        console.log(`      Priority: ${rec.priority} | Effort: ${rec.effort} | Timeframe: ${rec.timeframe}`);
        if (rec.actionSteps && rec.actionSteps.length > 0) {
          console.log(`      Steps: ${rec.actionSteps.join(', ')}`);
        }
      });
    }
    
    console.log(`\n   💡 ${insights.summary}`);
    console.log('\n✅ Unified insights PASSED\n');
    return result;
  } catch (error) {
    console.error('❌ Unified insights FAILED:', error.message);
    return null;
  }
}

/**
 * Test retrieval
 */
async function testRetrieval() {
  console.log('📥 TEST 3: Insights Retrieval');
  console.log('─'.repeat(60));
  
  try {
    const latest = await aiInsightsService.getLatestInsights(TEST_EMAIL);
    console.log(`✅ Latest: ${latest ? 'FOUND' : 'NOT FOUND'}`);
    if (latest) {
      console.log(`   └─ Score: ${latest.insights?.overallScore}/100`);
      console.log(`   └─ Recommendations: ${latest.insights?.recommendations?.length || 0}`);
    }
    
    console.log('\n✅ Retrieval PASSED\n');
  } catch (error) {
    console.error('❌ Retrieval FAILED:', error.message);
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log(`Testing with: ${TEST_EMAIL}\n`);
  
  await testDataGathering();
  await testUnifiedInsights();
  await testRetrieval();
  
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         ALL TESTS COMPLETED                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
}

runAllTests().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});
