import { ApifyClient } from 'apify-client';
import dotenv from 'dotenv';
const result = dotenv.config();

console.log('APIFY_API_KEY:', process.env.APIFY_API_KEY ? 'Set' : 'Not Set');

async function test() {
    const client = new ApifyClient({
        token: process.env.APIFY_API_KEY,
    });

    // Strategy 1: Test scraper-engine/linkedin-profile-scraper (maybe? checking common names)
    // or scraper-engine/linkedin-company-scraper
    const actorsToTest = [
        'scraper-engine/linkedin-company-scraper', // Guessing this exists
        'scraper-engine/profile-scraper',
        'revolist/linkedin-company-scraper' // Another popular one
    ];

    for (const actorId of actorsToTest) {
        console.log(`\nTesting Apify actor: ${actorId}`);
        try {
            const run = await client.actor(actorId).call({
                urls: ['https://www.linkedin.com/company/google'],
                // Some require startUrls format
                startUrls: [{ url: 'https://www.linkedin.com/company/google' }]
            });
            console.log(`   ✅ Run started...`);
            const { items } = await client.dataset(run.defaultDatasetId).listItems();

            if (items.length > 0) {
                console.log(`   ✅ Success! Found data with ${actorId}:`);
                console.log(JSON.stringify(items[0], null, 2));
                return; // Found one!
            } else {
                console.log('   ⚠️ No items returned.');
            }
        } catch (error) {
            console.log(`   ❌ Failed: ${error.message}`);
        }
    }
}

test();
