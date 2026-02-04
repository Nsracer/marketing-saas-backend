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

async function checkTables() {
    const email = 'pushpakagrawal123@gmail.com';
    
    console.log('Checking oauth_tokens for all providers...');
    const { data: allTokens } = await supabase
        .from('oauth_tokens')
        .select('provider, user_email, updated_at')
        .eq('user_email', email);
    console.log('Providers in oauth_tokens:', allTokens?.map(t => t.provider) || []);

    console.log('\nChecking user_business_info for social handles...');
    const { data: bizInfo } = await supabase
        .from('user_business_info')
        .select('facebook_handle, instagram_handle, linkedin_handle')
        .eq('user_email', email)
        .single();
    console.log('Business info handles:', bizInfo);

    console.log('\nChecking social_media_cache for actual data...');
    const { data: cacheData } = await supabase
        .from('social_media_cache')
        .select('platform, account_name, data_available, last_fetched_at')
        .eq('user_email', email);
    console.log('Cached platforms:', cacheData?.map(c => ({ 
        platform: c.platform, 
        account: c.account_name, 
        available: c.data_available 
    })) || []);
}

checkTables();
