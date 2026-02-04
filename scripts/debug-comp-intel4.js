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
    const userId = await competitorCacheService.getUserIdByEmail(email);
    
    const { data: compCache } = await supabase
        .from('competitor_cache')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1);
    
    const cache = compCache?.[0];
    const fullResult = cache?.full_result;
    
    console.log('\n📊 Full yourSite keys:', fullResult?.yourSite ? Object.keys(fullResult.yourSite) : 'none');
    console.log('\n📊 Full yourSite:');
    console.log(JSON.stringify(fullResult?.yourSite, null, 2)?.substring(0, 2000));
    
    console.log('\n\n📦 Checking social_media_cache for comparison...');
    const { data: socialCache } = await supabase
        .from('social_media_cache')
        .select('platform, account_name, data_available, updated_at')
        .eq('user_email', email);
    console.log('Social cache entries:', socialCache?.map(c => ({ 
        platform: c.platform, 
        account: c.account_name
    })));
}

debugCompIntel();
