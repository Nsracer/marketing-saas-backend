import { ApifyClient } from 'apify-client';
import dotenv from 'dotenv';
const result = dotenv.config();

console.log('APIFY_API_KEY:', process.env.APIFY_API_KEY ? 'Set' : 'Not Set');

async function test() {
    const client = new ApifyClient({
        token: process.env.APIFY_API_KEY,
    });

    // Actor: apify/linkedin-company-scraper
    const actorId = 'apify/linkedin-company-scraper';
    console.log(`Testing Apify actor: ${actorId}`);

    try {
        const run = await client.actor(actorId).call({
            urls: [{ url: 'https://www.linkedin.com/company/google' }],
        });

        const { items } = await client.dataset(run.defaultDatasetId).listItems();

        if (items.length > 0) {
            console.log('✅ Success! Found data:');
            console.log(JSON.stringify(items[0], null, 2));
        } else {
            console.log('⚠️ No items returned.');
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

test();
