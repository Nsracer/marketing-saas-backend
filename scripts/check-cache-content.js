import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

async function checkCache() {
    const email = 'pushpakagrawal123@gmail.com';
    
    const { data: cache } = await supabase
        .from('social_media_cache')
        .select('*')
        .eq('user_email', email);
        
    console.log('Found', cache.length, 'cache entries');
    
    cache.forEach(c => {
        console.log(`\n--- ${c.platform} ---`);
        console.log('Last fetched:', c.last_fetched_at);
        console.log('Data available:', c.data_available);
        
        // Inspect JSON columns if they verify
        // It seems the service parses many columns to build the return object
        // Let's see what columns we have
        console.log('Keys:', Object.keys(c));
        
        if (c.platform === 'facebook' || c.platform === 'instagram') {
             console.log('Follower count:', c.follower_count);
             console.log('Engagement data:', typeof c.engagement_data);
             if (c.engagement_data) {
                 console.log(JSON.stringify(c.engagement_data, null, 2));
             }
        }
    });
}

checkCache();
