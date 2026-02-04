import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkCompetitorCache() {
    const email = 'pushpakagrawal123@gmail.com';

    console.log('=== Checking competitor_cache for LinkedIn data ===\n');

    // Get user ID first
    const { data: user, error: userError } = await supabase
        .from('users_table')
        .select('id')
        .eq('email', email)
        .single();

    if (userError || !user) {
        console.log('User not found:', userError?.message);
        process.exit(1);
    }

    console.log('User ID:', user.id);

    // Get competitor cache
    const { data: caches, error: cacheError } = await supabase
        .from('competitor_cache')
        .select('competitor_domain, full_result, created_at, expires_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(3);

    if (cacheError) {
        console.log('Error fetching cache:', cacheError.message);
        process.exit(1);
    }

    if (!caches || caches.length === 0) {
        console.log('No competitor cache found');
        process.exit(0);
    }

    console.log('Found', caches.length, 'cached analyses:\n');

    caches.forEach((cache, i) => {
        console.log('--- Cache', i + 1, ':', cache.competitor_domain, '---');
        const linkedin = cache.full_result?.yourSite?.linkedin;
        if (linkedin) {
            console.log('  LinkedIn companyName:', linkedin.companyName);
            console.log('  LinkedIn followers:', linkedin.companyFollowers);
            console.log('  LinkedIn dataAvailable:', linkedin.dataAvailable);
        } else {
            console.log('  No LinkedIn data');
        }
        console.log('  Created:', cache.created_at);
        console.log('  Expired:', new Date(cache.expires_at) < new Date() ? 'YES' : 'NO');
        console.log('');
    });
}

checkCompetitorCache().catch(console.error);
