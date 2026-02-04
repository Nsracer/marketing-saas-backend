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
    
    console.log('Checking oauth_tokens table for Instagram...');
    const { data: oauthData, error: oauthError } = await supabase
        .from('oauth_tokens')
        .select('*')
        .eq('user_email', email)
        .eq('provider', 'instagram');
    console.log('oauth_tokens (instagram):', oauthData?.length || 0, 'records');
    if (oauthData && oauthData.length > 0) {
        console.log('  First record:', JSON.stringify(oauthData[0]).substring(0, 200) + '...');
    }
    
    console.log('\nChecking oauth_tokens for Facebook...');
    const { data: fbOauth } = await supabase
        .from('oauth_tokens')
        .select('*')
        .eq('user_email', email)
        .eq('provider', 'facebook');
    console.log('oauth_tokens (facebook):', fbOauth?.length || 0, 'records');

    console.log('\nChecking social_connections_v2 table...');
    const { data: socialData } = await supabase
        .from('social_connections_v2')
        .select('*')
        .eq('user_email', email);
    console.log('social_connections_v2:', socialData?.length || 0, 'records');
    socialData?.forEach(c => {
        console.log(`  ${c.platform}: connected=${c.is_connected}, username=${c.provider_username || c.account_name}`);
    });
}

checkTables();
