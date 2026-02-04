
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://hzhzrhfqfbkhutrqfqoj.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6aHpyaGZxZmJraHV0cnFmcW9qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzQwMzEwNCwiZXhwIjoyMDcyOTc5MTA0fQ.mD9fhTl1VM7G8S9c4KuxMmt8bh4qWeGXBH3IBTXVyh8'
);

async function findFacebookTokens() {
    console.log('Searching for ALL Facebook tokens...');

    const { data: tokens, error } = await supabase
        .from('oauth_tokens')
        .select('id, user_email, provider, created_at, updated_at')
        .eq('provider', 'facebook');

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log(`Found ${tokens.length} Facebook tokens.`);
    tokens.forEach(t => {
        console.log(`- [${t.id}] ${t.user_email} (${t.created_at})`);
    });
}

findFacebookTokens().catch(console.error);
