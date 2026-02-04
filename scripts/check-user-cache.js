import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

(async () => {
    const email = 'storyboy2x@gmail.com';
    
    console.log('=== Checking social_media_cache for:', email, '===');
    
    const { data, error } = await supabase
        .from('social_media_cache')
        .select('platform, account_name, updated_at, expires_at')
        .eq('user_email', email)
        .order('updated_at', { ascending: false });
    
    if (error) {
        console.error('Error:', error);
    } else if (!data || data.length === 0) {
        console.log('❌ No social media cache entries found for this user');
    } else {
        console.log(`Found ${data.length} cache entries:`);
        data.forEach(entry => {
            const age = Math.round((Date.now() - new Date(entry.updated_at).getTime()) / 1000 / 60);
            console.log(`  ${entry.platform}: ${entry.account_name || 'N/A'} (${age} min old)`);
        });
    }
    
    // Also check oauth_tokens
    console.log('\n=== Checking oauth_tokens for:', email, '===');
    const { data: tokens, error: tokensError } = await supabase
        .from('oauth_tokens')
        .select('provider, created_at, updated_at')
        .eq('user_email', email);
    
    if (tokensError) {
        console.error('Error:', tokensError);
    } else if (!tokens || tokens.length === 0) {
        console.log('❌ No OAuth tokens found for this user');
    } else {
        console.log(`Found ${tokens.length} OAuth tokens:`);
        tokens.forEach(token => {
            console.log(`  ${token.provider}`);
        });
    }
    
    process.exit(0);
})();
