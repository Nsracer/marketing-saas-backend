// Test the social_media_cache upsert to verify the unique constraint issue  
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://hzhzrhfqfbkhutrqfqoj.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6aHpyaGZxZmJraHV0cnFmcW9qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzQwMzEwNCwiZXhwIjoyMDcyOTc5MTA0fQ.mD9fhTl1VM7G8S9c4KuxMmt8bh4qWeGXBH3IBTXVyh8'
);

async function testSocialMediaCacheUpsert() {
    console.log('=== Testing social_media_cache Upsert ===\n');

    const testData = {
        user_email: 'test-constraint@example.com',
        platform: 'facebook',
        period: 'month',
        account_name: 'Test Page',
        follower_count: 1000,
        engagement_data: { likes: 100, comments: 10, shares: 5 },
        follower_growth: [],
        top_posts: [],
        posts_data: { total: 0, topPerforming: [] },
        reputation_data: { score: 50 },
        data_available: true,
        updated_at: new Date().toISOString(),
        last_fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
    };

    console.log('1. Testing UPSERT with onConflict: user_email,platform,period');
    const { data, error } = await supabase
        .from('social_media_cache')
        .upsert(testData, {
            onConflict: 'user_email,platform,period',
            ignoreDuplicates: false
        });

    if (error) {
        console.log('❌ UPSERT FAILED (as expected)!');
        console.log('   Error code:', error.code);
        console.log('   Error message:', error.message);
        console.log('\n>>> YOU NEED TO ADD THE UNIQUE CONSTRAINT <<<');
        console.log('\nRun this SQL in Supabase SQL Editor:\n');
        console.log('ALTER TABLE public.social_media_cache');
        console.log('ADD CONSTRAINT social_media_cache_unique_user_platform_period');
        console.log('UNIQUE (user_email, platform, period);');
    } else {
        console.log('✅ UPSERT SUCCEEDED!');
        console.log('   Constraint exists and working.');

        // Clean up test data
        await supabase
            .from('social_media_cache')
            .delete()
            .eq('user_email', 'test-constraint@example.com');
        console.log('   (Test record cleaned up)');
    }
}

testSocialMediaCacheUpsert().catch(console.error);
