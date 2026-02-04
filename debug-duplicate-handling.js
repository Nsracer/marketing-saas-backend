
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://hzhzrhfqfbkhutrqfqoj.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6aHpyaGZxZmJraHV0cnFmcW9qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzQwMzEwNCwiZXhwIjoyMDcyOTc5MTA0fQ.mD9fhTl1VM7G8S9c4KuxMmt8bh4qWeGXBH3IBTXVyh8'
);

async function testDuplicateHandling() {
    const email = 'pushpakagrawal123@gmail.com';
    const provider = 'facebook';

    console.log(`Testing duplicate handling for ${email} (${provider})...`);

    // 1. Fetch using new logic
    const { data, error } = await supabase
        .from('oauth_tokens')
        .select('*')
        .eq('user_email', email)
        .eq('provider', provider)
        .order('updated_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Fetch error:', error);
    } else {
        console.log('Fetched data:', data);
        if (data && data.length > 0) {
            console.log('Success! Retrieved one valid token despite potential duplicates.');
        } else {
            console.log('No token found.');
        }
    }
}

testDuplicateHandling().catch(console.error);
