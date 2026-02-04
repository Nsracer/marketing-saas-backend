import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import competitorCacheService from '../services/competitorCacheService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

async function debugCompIntel() {
    const email = 'pushpakagrawal123@gmail.com';
    
    // Use the service method to get userId
    const userId = await competitorCacheService.getUserIdByEmail(email);
    console.log('User ID:', userId);
    
    if (!userId) {
        console.log('User not found');
        return;
    }
    
    console.log('\n🔍 Checking competitor_cache table...');
    const { data: compCache, error } = await supabase
        .from('competitor_cache')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1);
    
    if (error) {
        console.log('Error:', error.message);
        return;
    }
    
    if (!compCache || compCache.length === 0) {
        console.log('❌ No competitor cache found');
        return;
    }
    
    const cache = compCache[0];
    console.log('\n📦 Cached competitor analysis:');
    console.log('   User domain:', cache.user_domain);
    console.log('   Competitor domain:', cache.competitor_domain);
    console.log('   Updated at:', cache.updated_at);
    
    const fullResult = cache.full_result;
    if (!fullResult) {
        console.log('❌ No full_result stored');
        console.log('Cache keys:', Object.keys(cache));
        return;
    }
    
    console.log('\n📊 yourSite data structure:');
    const yourSite = fullResult.yourSite;
    if (yourSite) {
        console.log('   Has facebook:', !!yourSite.facebook);
        if (yourSite.facebook) {
            console.log('     - facebook.profile:', !!yourSite.facebook.profile);
            console.log('     - facebook.metrics:', !!yourSite.facebook.metrics);
            console.log('     - facebook keys:', Object.keys(yourSite.facebook));
        }
        
        console.log('   Has instagram:', !!yourSite.instagram);
        if (yourSite.instagram) {
            console.log('     - instagram.profile:', !!yourSite.instagram.profile);
            console.log('     - instagram.metrics:', !!yourSite.instagram.metrics);
            console.log('     - instagram keys:', Object.keys(yourSite.instagram));
        }
        
        console.log('   Has linkedin:', !!yourSite.linkedin);
        if (yourSite.linkedin) {
            console.log('     - linkedin.dataAvailable:', yourSite.linkedin.dataAvailable);
        }
    } else {
        console.log('   ❌ yourSite is missing');
    }
    
    console.log('\n📊 Full yourSite.facebook:');
    console.log(JSON.stringify(yourSite?.facebook, null, 2)?.substring(0, 800));
    
    console.log('\n📊 Full yourSite.instagram:');
    console.log(JSON.stringify(yourSite?.instagram, null, 2)?.substring(0, 800));
}

debugCompIntel();
