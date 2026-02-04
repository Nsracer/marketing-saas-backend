import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

(async () => {
    // Check for any facebook/instagram cache entries in the entire table
    const { data, error } = await supabase
        .from('social_media_cache')
        .select('user_email, platform, account_name, updated_at')
        .in('platform', ['facebook', 'instagram'])
        .order('updated_at', { ascending: false })
        .limit(20);
    
    if (error) {
        console.error('Error:', error);
    } else if (!data || data.length === 0) {
        console.log('❌ No Facebook or Instagram cache entries found in entire table!');
    } else {
        console.log('Recent FB/IG cache entries:');
        data.forEach(entry => {
            const age = Math.round((Date.now() - new Date(entry.updated_at).getTime()) / 1000 / 60);
            console.log(`  ${entry.platform}: ${entry.user_email} - ${entry.account_name || 'N/A'} (${age} min ago)`);
        });
    }
    
    // Check specifically for storyboy with any variation
    console.log('\n=== Checking for "storyboy" anywhere in user_email ===');
    const { data: storyboy, error: sbError } = await supabase
        .from('social_media_cache')
        .select('user_email, platform, account_name, updated_at')
        .ilike('user_email', '%storyboy%');
    
    if (storyboy && storyboy.length > 0) {
        console.log('Found entries with storyboy:');
        storyboy.forEach(e => console.log(`  ${e.platform}: ${e.account_name}`));
    } else {
        console.log('No entries with storyboy in email');
    }
    
    // Check specifically for foundcoo account name
    console.log('\n=== Checking for "foundcoo" as account_name ===');
    const { data: foundcoo, error: fcError } = await supabase
        .from('social_media_cache')
        .select('user_email, platform, account_name, updated_at')
        .ilike('account_name', '%foundcoo%');
    
    if (foundcoo && foundcoo.length > 0) {
        console.log('Found entries with foundcoo:');
        foundcoo.forEach(e => console.log(`  ${e.platform}: ${e.user_email} - ${e.account_name}`));
    } else {
        console.log('No entries with foundcoo as account_name');
    }
    
    process.exit(0);
})();
