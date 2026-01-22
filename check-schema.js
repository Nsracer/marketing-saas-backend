// Script to query Supabase schema and competitor_cache data
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://hzhzrhfqfbkhutrqfqoj.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6aHpyaGZxZmJraHV0cnFmcW9qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzQwMzEwNCwiZXhwIjoyMDcyOTc5MTA0fQ.mD9fhTl1VM7G8S9c4KuxMmt8bh4qWeGXBH3IBTXVyh8'
);

async function checkSchema() {
    console.log('=== Checking Supabase Tables ===\n');

    // 1. Check competitor_cache table
    console.log('1. competitor_cache table:');
    const { data: competitorData, error: competitorError } = await supabase
        .from('competitor_cache')
        .select('*')
        .limit(5);

    if (competitorError) {
        console.log('   Error:', competitorError.message);
    } else {
        console.log('   Records found:', competitorData?.length || 0);
        if (competitorData && competitorData.length > 0) {
            console.log('   First record keys:', Object.keys(competitorData[0]));
            console.log('   Sample user_id:', competitorData[0].user_id);
            console.log('   Sample competitor_domain:', competitorData[0].competitor_domain);
        }
    }

    // 2. Check users_table
    console.log('\n2. users_table:');
    const { data: userData, error: userError } = await supabase
        .from('users_table')
        .select('id, email, plan')
        .limit(5);

    if (userError) {
        console.log('   Error:', userError.message);
    } else {
        console.log('   Records found:', userData?.length || 0);
        if (userData && userData.length > 0) {
            console.log('   Sample users:');
            userData.forEach(u => console.log(`     - ${u.email}: id=${u.id}, plan=${u.plan}`));
        }
    }

    // 3. Check user_business_info (contains competitors list)
    console.log('\n3. user_business_info table (competitors config):');
    const { data: bizData, error: bizError } = await supabase
        .from('user_business_info')
        .select('user_email, business_domain, competitors')
        .limit(5);

    if (bizError) {
        console.log('   Error:', bizError.message);
    } else {
        console.log('   Records found:', bizData?.length || 0);
        if (bizData && bizData.length > 0) {
            bizData.forEach(b => {
                console.log(`   - ${b.user_email}:`);
                console.log(`     Domain: ${b.business_domain}`);
                console.log(`     Competitors: ${JSON.stringify(b.competitors?.slice(0, 2) || [])}`);
            });
        }
    }

    // 4. Check health_score_cache
    console.log('\n4. health_score_cache table:');
    const { data: healthData, error: healthError } = await supabase
        .from('health_score_cache')
        .select('user_email, website_url, overall_health_score, seo_score')
        .limit(5);

    if (healthError) {
        console.log('   Error:', healthError.message);
    } else {
        console.log('   Records found:', healthData?.length || 0);
        if (healthData && healthData.length > 0) {
            healthData.forEach(h => {
                console.log(`   - ${h.user_email}: ${h.website_url} (health: ${h.overall_health_score}, seo: ${h.seo_score})`);
            });
        }
    }

    // 5. Check search_console_cache (user's SEO data)
    console.log('\n5. search_console_cache table:');
    const { data: seoData, error: seoError } = await supabase
        .from('search_console_cache')
        .select('user_id, site_url, total_clicks, total_impressions')
        .limit(5);

    if (seoError) {
        console.log('   Error:', seoError.message);
    } else {
        console.log('   Records found:', seoData?.length || 0);
        if (seoData && seoData.length > 0) {
            seoData.forEach(s => {
                console.log(`   - ${s.user_id}: ${s.site_url} (clicks: ${s.total_clicks}, impressions: ${s.total_impressions})`);
            });
        }
    }

    // 6. Check if specific user exists and their competitor_cache
    console.log('\n6. Checking specific user "pushpakagrawal123@gmail.com":');
    const { data: specificUser } = await supabase
        .from('users_table')
        .select('id, email')
        .eq('email', 'pushpakagrawal123@gmail.com')
        .single();

    if (specificUser) {
        console.log('   User ID:', specificUser.id);

        // Check their competitor_cache
        const { data: userCompCache, error: compError } = await supabase
            .from('competitor_cache')
            .select('competitor_domain, analysis_status, created_at')
            .eq('user_id', specificUser.id);

        if (compError) {
            console.log('   Competitor cache error:', compError.message);
        } else {
            console.log('   Competitor cache records:', userCompCache?.length || 0);
            if (userCompCache && userCompCache.length > 0) {
                userCompCache.forEach(c => console.log(`     - ${c.competitor_domain}: ${c.analysis_status}`));
            }
        }

        // Check their business info
        const { data: userBiz } = await supabase
            .from('user_business_info')
            .select('competitors')
            .eq('user_email', 'pushpakagrawal123@gmail.com')
            .single();

        if (userBiz) {
            console.log('   Configured competitors:', JSON.stringify(userBiz.competitors));
        }
    } else {
        console.log('   User not found');
    }
}

checkSchema().catch(console.error);
