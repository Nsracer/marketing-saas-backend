import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import socialMetricsWithCache from '../services/socialMetricsWithCache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

(async () => {
    const email = 'storyboy2x@gmail.com';
    console.log(`=== API Fetch Test for ${email} ===`);
    
    // Test Facebook
    console.log('\n--- Fetching Facebook Metrics (Force Refresh) ---');
    try {
        const fbMetrics = await socialMetricsWithCache.getFacebookMetrics(email, 'month', true);
        console.log('Result:', {
            dataAvailable: fbMetrics.dataAvailable,
            reason: fbMetrics.reason,
            error: fbMetrics.error,
            pageName: fbMetrics.pageName,
            followers: fbMetrics.companyFollowers || fbMetrics.followers
        });
    } catch (e) {
        console.error('CRITICAL FB ERROR:', e);
    }
    
    // Test Instagram
    console.log('\n--- Fetching Instagram Metrics (Force Refresh) ---');
    try {
        const igMetrics = await socialMetricsWithCache.getInstagramMetrics(email, 'month', true);
        console.log('Result:', {
            dataAvailable: igMetrics.dataAvailable,
            reason: igMetrics.reason,
            error: igMetrics.error,
            username: igMetrics.username,
            followers: igMetrics.companyFollowers || igMetrics.followers
        });
    } catch (e) {
        console.error('CRITICAL IG ERROR:', e);
    }

    process.exit(0);
})();
