
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

async function checkSupabaseCache() {
    const testEmail = 'pushpakagrawal123@gmail.com';
    console.log(`Checking Supabase tables for LinkedIn data for ${testEmail}...`);

    try {
        // 1. Check oauth_tokens
        console.log('\n--- oauth_tokens ---');
        const { data: tokens } = await supabase
            .from('oauth_tokens')
            .select('*')
            .eq('user_email', testEmail)
            .eq('provider', 'linkedin');

        if (tokens && tokens.length > 0) {
            tokens.forEach(t => {
                console.log(`Token ID: ${t.id}`);
                console.log('metadata:', JSON.stringify(t.metadata, null, 2));
                console.log('extra_data:', JSON.stringify(t.extra_data, null, 2));
            });
        } else {
            console.log('No LinkedIn tokens found.');
        }

        // 2. Check social_connections_v2
        console.log('\n--- social_connections_v2 ---');
        const { data: connections } = await supabase
            .from('social_connections_v2')
            .select('*')
            .eq('user_email', testEmail)
            .eq('platform', 'linkedin');

        if (connections && connections.length > 0) {
            connections.forEach(c => {
                console.log('platform_metadata:', JSON.stringify(c.platform_metadata, null, 2));
            });
        } else {
            console.log('No social_connections_v2 found.');
        }

        // 3. Check social_media_cache (all rows for this user)
        console.log('\n--- social_media_cache (non-null data) ---');
        const { data: cache } = await supabase
            .from('social_media_cache')
            .select('id, platform, cached_data')
            .eq('user_email', testEmail)
            .eq('platform', 'linkedin')
            .not('cached_data', 'is', null);

        if (cache && cache.length > 0) {
            console.log(`Found ${cache.length} valid entries.`);
            cache.forEach(c => {
                console.log(`ID: ${c.id}`);
                console.log(JSON.stringify(c.cached_data, null, 2).substring(0, 500) + '...');
            });
        } else {
            console.log('No non-null cached_data found for LinkedIn.');
        }

    } catch (err) {
        console.error('Script Error:', err);
    }
}

checkSupabaseCache();
