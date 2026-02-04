import dotenv from 'dotenv';
const result = dotenv.config();

if (result.error) {
    console.error('Error loading .env file:', result.error);
}

console.log('Dotenv parsed:', result.parsed ? Object.keys(result.parsed) : 'null');
console.log('APIFY_API_KEY:', process.env.APIFY_API_KEY ? 'Set (starts with ' + process.env.APIFY_API_KEY.substring(0, 5) + ')' : 'Not Set');
console.log('APIFY_API_TOKEN:', process.env.APIFY_API_TOKEN ? 'Set (starts with ' + process.env.APIFY_API_TOKEN.substring(0, 5) + ')' : 'Not Set');

async function test() {
    // Dynamic import to ensure env vars are loaded first
    const { default: linkedinApifyService } = await import('./services/linkedinRapidApiService.js');

    console.log('Testing Apify LinkedIn Scraper...');
    try {
        const result = await linkedinApifyService.getCompanyMetrics('google');
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error running test:', error);
    }
}

test();
