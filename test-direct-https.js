import https from 'https';

const url = 'https://puppeteer-on-vercel-red.vercel.app/api/analyze?domain=agentic.tech';

console.log('Testing URL:', url);

https.get(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
}, (res) => {
  console.log('\n📋 Response Status:', res.statusCode);
  console.log('📋 Response Headers:', JSON.stringify(res.headers, null, 2));
  
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('\n✅ Success! Response:', JSON.stringify(json, null, 2).substring(0, 500));
    } catch (e) {
      console.log('\n❌ Response (not JSON):', data.substring(0, 500));
    }
  });
}).on('error', (err) => {
  console.error('❌ Error:', err.message);
});
