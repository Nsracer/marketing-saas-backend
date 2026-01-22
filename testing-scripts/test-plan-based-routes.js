/**
 * Test Plan-Based Route Filtering
 * 
 * This script tests all routes with different plans to verify:
 * 1. Starter plan gets limited data (2 pages/queries, no backlinks, no Instagram)
 * 2. Growth plan gets medium data (10 pages/queries, backlinks, Instagram)
 * 3. Pro plan gets unlimited data
 * 
 * Usage: node test-plan-based-routes.js
 * Note: This is a temporary test file with hardcoded credentials - will be deleted after testing
 */

// Hardcode env vars for testing
process.env.SUPABASE_URL = 'https://krgaukhigntjdfacppbq.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtyZ2F1a2hpZ250amRmYWNwcGJxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTIyMzE3NSwiZXhwIjoyMDc0Nzk5MTc1fQ.ZHqUGqVC0iw4xTiWaAARj_5yC5QIkvK7HpR_Igok2B8';

import { getUserPlan, filterSEOData, filterSocialData, shouldCallAPI, getUserPlanFeatures } from '../services/planAccessService.js';
import { getPlanFeatures } from '../config/planFeatures.js';

// Test data
const TEST_USERS = {
  starter: 'iammusharraf11@gmail.com',  // Real user with starter plan
  growth: 'growth@test.com',
  pro: 'pro@test.com'
};

// Mock SEO data (as if fetched from APIs)
const MOCK_SEO_DATA = {
  dataAvailable: true,
  totalClicks: 5000,
  totalImpressions: 100000,
  averageCTR: 5.0,
  averagePosition: 12.5,
  organicTraffic: 5000,
  topPages: [
    { page: '/page1', clicks: 500 },
    { page: '/page2', clicks: 400 },
    { page: '/page3', clicks: 300 },
    { page: '/page4', clicks: 250 },
    { page: '/page5', clicks: 200 },
    { page: '/page6', clicks: 180 },
    { page: '/page7', clicks: 150 },
    { page: '/page8', clicks: 130 },
    { page: '/page9', clicks: 120 },
    { page: '/page10', clicks: 110 },
    { page: '/page11', clicks: 100 },
    { page: '/page12', clicks: 90 }
  ],
  topQueries: [
    { query: 'keyword1', clicks: 600 },
    { query: 'keyword2', clicks: 550 },
    { query: 'keyword3', clicks: 500 },
    { query: 'keyword4', clicks: 450 },
    { query: 'keyword5', clicks: 400 },
    { query: 'keyword6', clicks: 350 },
    { query: 'keyword7', clicks: 300 },
    { query: 'keyword8', clicks: 280 },
    { query: 'keyword9', clicks: 260 },
    { query: 'keyword10', clicks: 240 },
    { query: 'keyword11', clicks: 220 },
    { query: 'keyword12', clicks: 200 }
  ],
  backlinks: {
    available: true,
    totalBacklinks: 1500,
    totalRefDomains: 250,
    topLinkingSites: ['site1.com', 'site2.com', 'site3.com'],
    topLinkingPages: Array.from({ length: 15 }, (_, i) => ({
      url: `https://example.com/linking-page-${i + 1}`,
      backlinks: 50 - i * 2
    }))
  }
};

// Mock social data
const MOCK_SOCIAL_DATA = {
  dataAvailable: true,
  followerCount: 10000,
  engagementRate: 4.5,
  postsCount: 150,
  topPosts: [
    { id: '1', likes: 500, comments: 50 },
    { id: '2', likes: 450, comments: 45 },
    { id: '3', likes: 400, comments: 40 }
  ],
  postsData: [
    { id: '1', content: 'Post 1', engagement: 550 },
    { id: '2', content: 'Post 2', engagement: 495 }
  ],
  audienceInsights: {
    ageRange: '25-34',
    topLocations: ['US', 'UK', 'Canada']
  },
  historicalData: {
    followerGrowth: [100, 150, 200, 250, 300]
  }
};

console.log('\n🧪 ========== TESTING PLAN-BASED ROUTE FILTERING ==========\n');

// Test 1: Display Plan Features
console.log('📋 TEST 1: Plan Features Configuration\n');
['starter', 'growth', 'pro'].forEach(plan => {
  const features = getPlanFeatures(plan);
  console.log(`\n${plan.toUpperCase()} PLAN:`);
  console.log(`  Competitors: ${features.competitors.max}`);
  console.log(`  Top Pages: ${features.seo.topPages === -1 ? 'Unlimited' : features.seo.topPages}`);
  console.log(`  Top Queries: ${features.seo.topQueries === -1 ? 'Unlimited' : features.seo.topQueries}`);
  console.log(`  Backlinks: ${features.seo.backlinks ? '✅' : '❌'}`);
  console.log(`  SE Ranking API: ${features.seo.seRanking ? '✅' : '❌'}`);
  console.log(`  Facebook: ${features.social.facebook.enabled ? '✅' : '❌'} (Advanced: ${features.social.facebook.advancedMetrics ? '✅' : '❌'})`);
  console.log(`  LinkedIn: ${features.social.linkedin.enabled ? '✅' : '❌'} (Advanced: ${features.social.linkedin.advancedMetrics ? '✅' : '❌'})`);
  console.log(`  Instagram: ${features.social.instagram.enabled ? '✅' : '❌'}`);
  console.log(`  Quick Wins: ${features.seo.optimization ? '✅' : '❌'}`);
});

// Test 2: Test API Call Gates
console.log('\n\n📡 TEST 2: API Call Gates (shouldCallAPI)\n');

async function testAPIGates() {
  const apis = ['seRanking', 'backlinks', 'instagram'];
  
  for (const api of apis) {
    console.log(`\n${api.toUpperCase()} API:`);
    for (const [plan, email] of Object.entries(TEST_USERS)) {
      const shouldCall = await shouldCallAPI(email, api);
      console.log(`  ${plan.padEnd(8)}: ${shouldCall ? '✅ CALL' : '❌ SKIP'}`);
    }
  }
}

await testAPIGates();

// Test 3: Test SEO Data Filtering
console.log('\n\n🔍 TEST 3: SEO Data Filtering\n');

async function testSEOFiltering() {
  for (const [plan, email] of Object.entries(TEST_USERS)) {
    console.log(`\n${plan.toUpperCase()} PLAN (${email}):`);
    
    const filtered = await filterSEOData(MOCK_SEO_DATA, email);
    
    console.log(`  Top Pages: ${filtered.topPages?.length || 0} / ${MOCK_SEO_DATA.topPages.length}`);
    if (filtered.topPagesLimited) {
      console.log(`    ⚠️  Limited to ${filtered.topPagesLimit}`);
    }
    
    console.log(`  Top Queries: ${filtered.topQueries?.length || 0} / ${MOCK_SEO_DATA.topQueries.length}`);
    if (filtered.topQueriesLimited) {
      console.log(`    ⚠️  Limited to ${filtered.topQueriesLimit}`);
    }
    
    console.log(`  Backlinks: ${filtered.backlinks ? '✅ Available' : '❌ Blocked'}`);
    if (filtered.backlinkBlocked) {
      console.log(`    💎 Upgrade to ${filtered.upgradeRequired} to unlock`);
    } else if (filtered.backlinks?.available) {
      console.log(`    Total: ${filtered.backlinks.totalBacklinks}`);
      console.log(`    Linking Pages: ${filtered.backlinks.topLinkingPages?.length || 0}`);
    }
    
    if (filtered.planInfo) {
      console.log(`  Plan Info: ${JSON.stringify(filtered.planInfo.currentPlan)}`);
    }
  }
}

await testSEOFiltering();

// Test 4: Test Social Media Filtering
console.log('\n\n📱 TEST 4: Social Media Filtering\n');

async function testSocialFiltering() {
  const platforms = ['facebook', 'linkedin', 'instagram'];
  
  for (const platform of platforms) {
    console.log(`\n${platform.toUpperCase()}:`);
    
    for (const [plan, email] of Object.entries(TEST_USERS)) {
      const filtered = await filterSocialData(MOCK_SOCIAL_DATA, email, platform);
      
      if (filtered.blocked) {
        console.log(`  ${plan.padEnd(8)}: ❌ BLOCKED - ${filtered.reason}`);
        if (filtered.upgradeRequired) {
          console.log(`              💎 Upgrade to ${filtered.upgradeRequired}`);
        }
      } else if (filtered.dataAvailable) {
        console.log(`  ${plan.padEnd(8)}: ✅ Available`);
        console.log(`              Followers: ${filtered.followerCount || 'N/A'}`);
        console.log(`              Advanced Metrics: ${filtered.advancedMetricsBlocked ? '❌ Blocked' : '✅ Available'}`);
        console.log(`              Posts Data: ${filtered.postsData ? '✅' : '❌'}`);
        console.log(`              Historical: ${filtered.historicalData ? '✅' : '❌'}`);
      }
    }
  }
}

await testSocialFiltering();

// Test 5: Test User Plan Retrieval
console.log('\n\n👤 TEST 5: User Plan Retrieval (from Database)\n');

async function testPlanRetrieval() {
  console.log('Attempting to fetch plans from database...\n');
  
  for (const [plan, email] of Object.entries(TEST_USERS)) {
    try {
      const userPlan = await getUserPlan(email);
      const features = await getUserPlanFeatures(email);
      
      console.log(`${email}:`);
      console.log(`  Expected: ${plan}`);
      console.log(`  Got: ${userPlan}`);
      console.log(`  Match: ${plan === userPlan ? '✅' : '❌'}`);
      console.log(`  Competitors Limit: ${features.competitors.max}`);
    } catch (error) {
      console.log(`${email}: ❌ Error - ${error.message}`);
      console.log(`  Note: User may not exist in database yet`);
    }
  }
  
  console.log('\n💡 If users don\'t exist, the service defaults to "starter" plan');
}

await testPlanRetrieval();

// Summary
console.log('\n\n📊 ========== TEST SUMMARY ==========\n');
console.log('✅ Plan features configuration loaded');
console.log('✅ API call gates tested for all plans');
console.log('✅ SEO data filtering tested');
console.log('✅ Social media filtering tested');
console.log('✅ User plan retrieval tested');
console.log('\n💡 Next Steps:');
console.log('1. Run: node test-plan-based-routes.js');
console.log('2. Check if users exist in database with correct plans');
console.log('3. Test actual HTTP endpoints with Postman/curl');
console.log('4. Verify frontend receives filtered data correctly');
console.log('\n========================================\n');
