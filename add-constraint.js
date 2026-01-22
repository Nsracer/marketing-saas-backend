// Add the missing unique constraint to competitor_cache table
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://hzhzrhfqfbkhutrqfqoj.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6aHpyaGZxZmJraHV0cnFmcW9qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzQwMzEwNCwiZXhwIjoyMDcyOTc5MTA0fQ.mD9fhTl1VM7G8S9c4KuxMmt8bh4qWeGXBH3IBTXVyh8'
);

async function addConstraint() {
    console.log('=== Adding unique constraint to competitor_cache ===\n');

    // Execute raw SQL to add the constraint
    const { data, error } = await supabase.rpc('exec_sql', {
        sql: `ALTER TABLE public.competitor_cache 
          ADD CONSTRAINT competitor_cache_unique_user_domains 
          UNIQUE (user_id, user_domain, competitor_domain);`
    });

    if (error) {
        console.log('Note: RPC exec_sql may not exist. You need to add this constraint manually.\n');
        console.log('Run this SQL in Supabase SQL Editor:\n');
        console.log('ALTER TABLE public.competitor_cache');
        console.log('ADD CONSTRAINT competitor_cache_unique_user_domains');
        console.log('UNIQUE (user_id, user_domain, competitor_domain);');
    } else {
        console.log('✅ Constraint added successfully!');
    }

    // Test UPSERT after constraint (if it was added)
    console.log('\nTesting UPSERT after constraint...');
    const testData = {
        user_id: '8d9ae382-189c-4ebc-b837-1b8c711874e0',
        user_domain: 'foundcoo.com',
        competitor_domain: 'constraint-test.com',
        full_result: { test: true },
        analysis_status: 'completed',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };

    const { error: upsertError } = await supabase
        .from('competitor_cache')
        .upsert(testData, { onConflict: 'user_id,user_domain,competitor_domain' });

    if (upsertError) {
        console.log('UPSERT still failing:', upsertError.message);
        console.log('\n>>> YOU NEED TO RUN THE SQL MANUALLY IN SUPABASE <<<');
    } else {
        console.log('✅ UPSERT now works!');
        await supabase.from('competitor_cache').delete().eq('competitor_domain', 'constraint-test.com');
    }
}

addConstraint().catch(console.error);
