// Check how Facebook and Instagram metrics are stored for users
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://hzhzrhfqfbkhutrqfqoj.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6aHpyaGZxZmJraHV0cnFmcW9qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzQwMzEwNCwiZXhwIjoyMDcyOTc5MTA0fQ.mD9fhTl1VM7G8S9c4KuxMmt8bh4qWeGXBH3IBTXVyh8'
);

async function checkSocialMetrics() {
    const testEmail = 'pushpakagrawal123@gmail.com';

    console.log('=== Checking Social Metrics Storage for User ===\n');
    console.log('User email:', testEmail);

    // 1. Check social_metrics_cache table
    console.log('\n1. Checking social_metrics_cache table...');
    const { data: socialCache, error: socialCacheError } = await supabase
        .from('social_metrics_cache')
        .select('*')
        .eq('user_email', testEmail);

    if (socialCacheError) {
        console.log('   Error:', socialCacheError.message);
    } else if (socialCache && socialCache.length > 0) {
        console.log('   Found', socialCache.length, 'records');
        socialCache.forEach((record, i) => {
            console.log(`   Record ${i + 1}:`, {
                platform: record.platform,
                period: record.period,
                data_available: record.cached_data?.dataAvailable,
                has_facebook: !!record.cached_data?.facebook,
                has_instagram: !!record.cached_data?.instagram,
                updated_at: record.updated_at
            });
        });
    } else {
        console.log('   No records found');
    }

    // 2. Check user_business_info for social handles
    console.log('\n2. Checking user_business_info for social handles...');
    const { data: businessInfo, error: bizError } = await supabase
        .from('user_business_info')
        .select('*')
        .eq('user_email', testEmail)
        .single();

    if (bizError) {
        console.log('   Error:', bizError.message);
    } else if (businessInfo) {
        console.log('   Business info found:');
        console.log('   - Facebook URL:', businessInfo.facebook_url || 'Not set');
        console.log('   - Instagram URL:', businessInfo.instagram_url || 'Not set');
        console.log('   - LinkedIn URL:', businessInfo.linkedin_url || 'Not set');
        console.log('   - Business Domain:', businessInfo.business_domain || 'Not set');
    }

    // 3. Check oauth_tokens for Facebook connection
    console.log('\n3. Checking oauth_tokens for Facebook/Instagram connection...');
    const { data: oauthTokens, error: oauthError } = await supabase
        .from('oauth_tokens')
        .select('provider, page_name, page_id, instagram_business_id, created_at, expires_at')
        .eq('user_email', testEmail);

    if (oauthError) {
        console.log('   Error:', oauthError.message);
    } else if (oauthTokens && oauthTokens.length > 0) {
        console.log('   Found', oauthTokens.length, 'OAuth tokens:');
        oauthTokens.forEach((token, i) => {
            console.log(`   Token ${i + 1}:`, {
                provider: token.provider,
                page_name: token.page_name,
                page_id: token.page_id,
                instagram_business_id: token.instagram_business_id,
                created_at: token.created_at
            });
        });
    } else {
        console.log('   No OAuth tokens found');
    }

    // 4. Check competitor_cache for user's social data in yourSite
    console.log('\n4. Checking competitor_cache for yourSite social data...');
    const { data: competitorCache, error: compError } = await supabase
        .from('competitor_cache')
        .select('id, user_domain, competitor_domain, full_result, facebook_data, instagram_data, updated_at')
        .limit(5);

    if (compError) {
        console.log('   Error:', compError.message);
    } else if (competitorCache && competitorCache.length > 0) {
        console.log('   Found', competitorCache.length, 'competitor records');
        competitorCache.forEach((record, i) => {
            const yourSite = record.full_result?.yourSite;
            console.log(`\n   Record ${i + 1}:`, {
                user_domain: record.user_domain,
                competitor_domain: record.competitor_domain,
                has_yourSite: !!yourSite,
                yourSite_facebook: yourSite?.facebook ? 'Has data' : 'No data',
                yourSite_instagram: yourSite?.instagram ? 'Has data' : 'No data',
                facebook_data_col: record.facebook_data ? 'Has data' : 'null',
                instagram_data_col: record.instagram_data ? 'Has data' : 'null'
            });

            if (yourSite?.facebook) {
                console.log('     Facebook metrics:', {
                    followers: yourSite.facebook.metrics?.followers || yourSite.facebook.data?.followers,
                    engagementRate: yourSite.facebook.metrics?.engagementRate,
                    success: yourSite.facebook.success
                });
            }

            if (yourSite?.instagram) {
                console.log('     Instagram metrics:', {
                    followers: yourSite.instagram.metrics?.followers || yourSite.instagram.profile?.followers,
                    engagementRate: yourSite.instagram.metrics?.engagementRate || yourSite.instagram.profile?.avgEngagementRate,
                    success: yourSite.instagram.success
                });
            }
        });
    } else {
        console.log('   No competitor cache records found');
    }

    // 5. List all tables that might have social data
    console.log('\n5. Checking for other tables with social data...');
    const tables = ['facebook_cache', 'instagram_cache', 'user_social_connections'];

    for (const table of tables) {
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .limit(1);

        if (error) {
            console.log(`   ${table}: ${error.message}`);
        } else {
            console.log(`   ${table}: ${data.length > 0 ? 'Has data' : 'Empty table'}`);
        }
    }
}

checkSocialMetrics().catch(console.error);
