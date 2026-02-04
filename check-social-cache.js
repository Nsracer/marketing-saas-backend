// Check social_media_cache table for user's Facebook and Instagram data
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://hzhzrhfqfbkhutrqfqoj.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6aHpyaGZxZmJraHV0cnFmcW9qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzQwMzEwNCwiZXhwIjoyMDcyOTc5MTA0fQ.mD9fhTl1VM7G8S9c4KuxMmt8bh4qWeGXBH3IBTXVyh8'
);

async function checkSocialMediaCache() {
    const testEmail = 'pushpakagrawal123@gmail.com';

    console.log('=== Checking social_media_cache Table ===\n');

    // 1. Check if the table exists and get all records for user
    const { data, error } = await supabase
        .from('social_media_cache')
        .select('*')
        .eq('user_email', testEmail);

    if (error) {
        console.log('Error:', error.message);
        console.log('Full error:', error);
        return;
    }

    if (!data || data.length === 0) {
        console.log('❌ NO RECORDS FOUND in social_media_cache for:', testEmail);
        console.log('\nThis is the problem! The user\'s social media metrics from the Social Media Performance page');
        console.log('are NOT being saved to this cache table.');
        console.log('\nWhen competitor analysis runs, it tries to read from this table but finds nothing.');
        return;
    }

    console.log('✅ Found', data.length, 'records:\n');

    data.forEach((record, i) => {
        console.log(`--- Record ${i + 1}: ${record.platform} ---`);
        console.log('  account_name:', record.account_name);
        console.log('  follower_count:', record.follower_count);
        console.log('  data_available:', record.data_available);
        console.log('  last_fetched_at:', record.last_fetched_at);
        console.log('  expires_at:', record.expires_at);
        const now = new Date();
        const expires = new Date(record.expires_at);
        console.log('  EXPIRED:', expires < now ? 'YES ❌' : 'NO ✅');
        console.log('  engagement_data:', JSON.stringify(record.engagement_data, null, 2).substring(0, 300));
        console.log('');
    });
}

checkSocialMediaCache().catch(console.error);
