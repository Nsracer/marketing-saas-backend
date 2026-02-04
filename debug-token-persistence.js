
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://hzhzrhfqfbkhutrqfqoj.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6aHpyaGZxZmJraHV0cnFmcW9qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzQwMzEwNCwiZXhwIjoyMDcyOTc5MTA0fQ.mD9fhTl1VM7G8S9c4KuxMmt8bh4qWeGXBH3IBTXVyh8'
);

async function testTokenPersistence() {
    const email = 'pushpakagrawal123@gmail.com';
    const provider = 'facebook';

    console.log(`Testing token persistence for ${email} (${provider})...`);

    // 1. Check existing
    const { data: existingBefore } = await supabase
        .from('oauth_tokens')
        .select('*')
        .eq('user_email', email)
        .eq('provider', provider);

    console.log('Existing tokens before:', existingBefore?.length || 0);

    // 2. Insert fake token
    const tokenData = {
        user_email: email,
        provider: provider,
        access_token: 'valid_test_token_' + Date.now(),
        expires_at: Date.now() + 3600000,
        scope: 'test_scope',
        updated_at: new Date().toISOString()
    };

    console.log('Inserting/Updating token...');

    // Upsert equivalent logic from service
    // Check if user already has tokens for this provider
    const { data: existing } = await supabase
        .from('oauth_tokens')
        .select('id')
        .eq('user_email', email)
        .eq('provider', provider)
        .single();

    if (existing) {
        console.log('Updating existing record ID:', existing.id);
        const { error } = await supabase
            .from('oauth_tokens')
            .update(tokenData)
            .eq('id', existing.id);
        if (error) console.error('Update error:', error);
    } else {
        console.log('Inserting new record');
        const { error } = await supabase
            .from('oauth_tokens')
            .insert(tokenData);
        if (error) console.error('Insert error:', error);
    }

    // 3. Verify
    const { data: existingAfter } = await supabase
        .from('oauth_tokens')
        .select('*')
        .eq('user_email', email)
        .eq('provider', provider);

    console.log('Existing tokens after:', existingAfter?.length || 0);
    if (existingAfter && existingAfter.length > 0) {
        console.log('Token data:', existingAfter[0]);
    }

}

testTokenPersistence().catch(console.error);
