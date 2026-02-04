// Check OAuth tokens structure and how user social data should flow
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://hzhzrhfqfbkhutrqfqoj.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6aHpyaGZxZmJraHV0cnFmcW9qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzQwMzEwNCwiZXhwIjoyMDcyOTc5MTA0fQ.mD9fhTl1VM7G8S9c4KuxMmt8bh4qWeGXBH3IBTXVyh8'
);

async function checkOAuthAndSocialFlow() {
    const testEmail = 'pushpakagrawal123@gmail.com';

    console.log('=== Deep Dive: OAuth Tokens and Social Data Flow ===\n');

    // 1. Get OAuth tokens - check all columns
    console.log('1. OAuth tokens (all columns):');
    const { data: tokens, error: tokenError } = await supabase
        .from('oauth_tokens')
        .select('*')
        .eq('user_email', testEmail);

    if (tokenError) {
        console.log('   Error:', tokenError.message);
    } else if (tokens && tokens.length > 0) {
        console.log('   Found', tokens.length, 'tokens:');
        tokens.forEach((token, i) => {
            console.log(`\n   Token ${i + 1} columns:`, Object.keys(token));
            console.log(`   Token ${i + 1} data:`, {
                provider: token.provider,
                // Remove sensitive data
                has_access_token: !!token.access_token,
                has_refresh_token: !!token.refresh_token,
                page_id: token.page_id,
                instagram_id: token.instagram_business_id || token.instagram_id,
                created_at: token.created_at,
                extra_data: token.extra_data || token.metadata
            });
        });
    } else {
        console.log('   No tokens found');
    }

    // 2. Check user_business_info structure
    console.log('\n\n2. user_business_info full record:');
    const { data: bizInfo, error: bizError } = await supabase
        .from('user_business_info')
        .select('*')
        .eq('user_email', testEmail)
        .single();

    if (bizError) {
        console.log('   Error:', bizError.message);
    } else {
        console.log('   Columns:', Object.keys(bizInfo));
        console.log('   Social URLs:', {
            facebook_url: bizInfo.facebook_url,
            instagram_url: bizInfo.instagram_url,
            linkedin_url: bizInfo.linkedin_url,
            twitter_url: bizInfo.twitter_url
        });
        console.log('   Handles:', {
            facebook_handle: bizInfo.facebook_handle,
            instagram_handle: bizInfo.instagram_handle
        });
    }

    // 3. Check if there's a competitor analysis with user social data
    console.log('\n\n3. Detailed competitor_cache analysis:');
    const { data: cache, error: cacheError } = await supabase
        .from('competitor_cache')
        .select('*')
        .eq('user_domain', 'foundcoo.com')
        .limit(1);

    if (cacheError) {
        console.log('   Error:', cacheError.message);
    } else if (cache && cache.length > 0) {
        const record = cache[0];
        console.log('   full_result.yourSite structure:');
        const yourSite = record.full_result?.yourSite;
        if (yourSite) {
            console.log('   - Keys in yourSite:', Object.keys(yourSite));
            console.log('   - facebook:', yourSite.facebook ? JSON.stringify(yourSite.facebook, null, 2).substring(0, 500) : 'null');
            console.log('   - instagram:', yourSite.instagram ? JSON.stringify(yourSite.instagram, null, 2).substring(0, 500) : 'null');
        } else {
            console.log('   - yourSite is null/undefined');
        }

        console.log('\n   facebook_data column:', record.facebook_data ? 'Has data' : 'null');
        if (record.facebook_data) {
            console.log('   - Keys:', Object.keys(record.facebook_data));
        }

        console.log('\n   instagram_data column:', record.instagram_data ? 'Has data' : 'null');
        if (record.instagram_data) {
            console.log('   - Keys:', Object.keys(record.instagram_data));
        }

        // Check user handles stored in the cache
        console.log('\n   User handles in cache:');
        console.log('   - user_instagram_handle:', record.user_instagram_handle);
        console.log('   - user_facebook_handle:', record.user_facebook_handle);
    }

    // 4. Check what handles are stored during competitor analysis
    console.log('\n\n4. All records with user social handles:');
    const { data: withHandles, error: handleError } = await supabase
        .from('competitor_cache')
        .select('user_domain, competitor_domain, user_instagram_handle, user_facebook_handle, user_linkedin_handle')
        .not('user_instagram_handle', 'is', null);

    if (handleError) {
        console.log('   Error:', handleError.message);
    } else {
        console.log('   Records with user handles:', withHandles?.length || 0);
        if (withHandles && withHandles.length > 0) {
            withHandles.forEach(r => console.log('   -', r));
        }
    }
}

checkOAuthAndSocialFlow().catch(console.error);
