// test-similarweb.js
import axios from 'axios';

const options = {
  method: 'GET',
  url: 'https://similarweb-traffic-api-for-bulk.p.rapidapi.com/rapidapi.php',
  params: { domain: 'pes.edu' },
  headers: {
    'x-rapidapi-key': 'def09cdccdmsh0c9d8a2ef094fc0p13dceejsnf2f6461baddf',
    'x-rapidapi-host': 'similarweb-traffic-api-for-bulk.p.rapidapi.com'
  }
};

async function fetchMetrics() {
  try {
    const response = await axios.request(options);
    const { Engagments, EstimatedMonthlyVisits } = response.data;
    
    // Display bounce rate and current visits
    console.log('\n📊 Current Metrics:');
    console.table([
      {
        'Monthly Visits': parseInt(Engagments.Visits).toLocaleString(),
        'Bounce Rate': `${(parseFloat(Engagments.BounceRate) * 100).toFixed(2)}%`
      }
    ]);
    
    // Display monthly visits trend
    console.log('\n📅 Monthly Visits History:');
    const monthlyData = Object.entries(EstimatedMonthlyVisits).map(([date, visits]) => ({
      Month: new Date(date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      Visits: visits.toLocaleString()
    }));
    console.table(monthlyData);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

fetchMetrics();
