// test-similarweb-traffic.js - Test SimilarWeb Traffic Service
import 'dotenv/config';
import similarWebTrafficService from './services/similarWebTrafficService.js';

console.log('🧪 Testing SimilarWeb Traffic Service\n');
console.log('=' .repeat(60));

// Test domain
const testDomain = 'pes.edu';

async function testSimilarWebTraffic() {
  try {
    console.log(`\n📊 Testing domain: ${testDomain}`);
    console.log('-'.repeat(60));

    // Check if API key is configured
    if (!process.env.RAPIDAPI_KEY) {
      console.error('❌ RAPIDAPI_KEY not found in environment variables');
      console.log('Please add RAPIDAPI_KEY to your .env file');
      return;
    }

    console.log('✅ API Key configured');
    console.log(`\n🔄 Fetching traffic data for ${testDomain}...\n`);

    // Test getCompetitorTraffic
    const trafficData = await similarWebTrafficService.getCompetitorTraffic(testDomain);

    console.log('=' .repeat(60));
    console.log('📈 TRAFFIC DATA RESULTS');
    console.log('=' .repeat(60));

    if (trafficData.success) {
      console.log('\n✅ Successfully retrieved traffic data\n');

      // Display metrics
      console.log('📊 TRAFFIC METRICS:');
      console.log('-'.repeat(60));
      console.log(`Domain: ${trafficData.domain}`);
      console.log(`Source: ${trafficData.source}`);
      console.log(`Monthly Visits: ${trafficData.metrics.monthlyVisits.toLocaleString()}`);
      console.log(`Avg Visit Duration: ${trafficData.metrics.avgVisitDuration}s`);
      console.log(`Pages Per Visit: ${trafficData.metrics.pagesPerVisit}`);
      console.log(`Bounce Rate: ${trafficData.metrics.bounceRate}`);
      
      // Display rankings
      console.log('\n🏆 RANKINGS:');
      console.log('-'.repeat(60));
      console.log(`Global Rank: ${trafficData.metrics.globalRank || 'N/A'}`);
      console.log(`Country Rank: ${trafficData.metrics.countryRank || 'N/A'}`);
      console.log(`Category Rank: ${trafficData.metrics.categoryRank || 'N/A'}`);

      // Display traffic sources
      console.log('\n🔗 TRAFFIC SOURCES:');
      console.log('-'.repeat(60));
      const sources = trafficData.metrics.trafficSources;
      console.log(`Direct: ${sources.direct}`);
      console.log(`Search: ${sources.search}`);
      console.log(`Social: ${sources.social}`);
      console.log(`Referral: ${sources.referral}`);
      console.log(`Mail: ${sources.mail}`);
      console.log(`Paid: ${sources.paid}`);

      // Display top countries
      if (trafficData.metrics.topCountries && trafficData.metrics.topCountries.length > 0) {
        console.log('\n🌍 TOP COUNTRIES:');
        console.log('-'.repeat(60));
        trafficData.metrics.topCountries.forEach((country, index) => {
          console.log(`${index + 1}. ${country.code}: ${country.share}`);
        });
      }

      // Display trends
      if (trafficData.trends && trafficData.trends.length > 0) {
        console.log('\n📈 TRAFFIC TRENDS (Last 6 Months):');
        console.log('-'.repeat(60));
        trafficData.trends.forEach(trend => {
          const changeIndicator = trend.change > 0 ? '↑' : trend.change < 0 ? '↓' : '→';
          const changeColor = trend.change > 0 ? '+' : '';
          console.log(`${trend.monthName}: ${trend.visits.toLocaleString()} visits ${changeIndicator} ${changeColor}${trend.change}%`);
        });
      }

      // Display raw data
      console.log('\n📦 RAW DATA:');
      console.log('-'.repeat(60));
      console.log(JSON.stringify(trafficData, null, 2));

    } else {
      console.log('\n⚠️ Failed to retrieve traffic data\n');
      console.log(`Domain: ${trafficData.domain}`);
      console.log(`Error: ${trafficData.error || 'Unknown error'}`);
      
      if (trafficData.data && trafficData.data.note) {
        console.log(`Note: ${trafficData.data.note}`);
      }

      console.log('\n📦 RESPONSE DATA:');
      console.log('-'.repeat(60));
      console.log(JSON.stringify(trafficData, null, 2));
    }

    console.log('\n' + '=' .repeat(60));
    console.log('✅ Test completed');
    console.log('=' .repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    console.error('\nStack trace:');
    console.error(error.stack);
  }
}

// Run the test
console.log('\n🚀 Starting SimilarWeb Traffic Service Test...\n');
testSimilarWebTraffic()
  .then(() => {
    console.log('✅ All tests completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  });
