// test-facebook.js
import axios from 'axios';

const options = {
  method: 'GET',
  url: 'https://facebook-scraper3.p.rapidapi.com/page/details',
  params: {
    url: 'https://www.facebook.com/facebook'
  },
  headers: {
    'x-rapidapi-key': '82e9e61bd2msh3d9cd5a1750b4dbp18672fjsn3f6882556d13',
    'x-rapidapi-host': 'facebook-scraper3.p.rapidapi.com'
  }
};

async function fetchFacebookMetrics() {
  try {
    const response = await axios.request(options);
    const { name, likes, followers } = response.data.results;
    
    console.log('\n📘 Facebook Page Metrics:');
    console.table([
      {
        'Page Name': name,
        'Likes': likes.toLocaleString(),
        'Followers': followers.toLocaleString()
      }
    ]);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

fetchFacebookMetrics();
