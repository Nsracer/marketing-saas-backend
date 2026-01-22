// Query the actual constraints on competitor_cache table
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://hzhzrhfqfbkhutrqfqoj.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6aHpyaGZxZmJraHV0cnFmcW9qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzQwMzEwNCwiZXhwIjoyMDcyOTc5MTA0fQ.mD9fhTl1VM7G8S9c4KuxMmt8bh4qWeGXBH3IBTXVyh8'
);

async function checkConstraints() {
    console.log('=== Checking competitor_cache constraints ===\n');

    // Query pg_constraint to see actual constraints
    const { data, error } = await supabase
        .from('pg_catalog.pg_constraint')
        .select('*');

    // Since we can't query system tables directly, let's try a different approach
    // Insert same row twice and see if it creates duplicates (which means no unique constraint)

    const testData = {
        user_id: '8d9ae382-189c-4ebc-b837-1b8c711874e0',
        user_domain: 'foundcoo.com',
        competitor_domain: 'duplicate-test.com',
        full_result: { test: 1 },
        analysis_status: 'completed',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };

    console.log('Test: Inserting same row twice to check for unique constraint...\n');

    // First insert
    const { error: err1 } = await supabase.from('competitor_cache').insert(testData);
    if (err1) {
        console.log('First insert failed:', err1.message);
        return;
    }
    console.log('First insert: SUCCESS');

    // Second insert with same key columns
    const { error: err2 } = await supabase.from('competitor_cache').insert({
        ...testData,
        full_result: { test: 2 }  // Different data, same key
    });

    if (err2) {
        console.log('Second insert: FAILED (unique constraint exists!)');
        console.log('   Error:', err2.message);
    } else {
        console.log('Second insert: SUCCESS');
        console.log('\n❌ NO UNIQUE CONSTRAINT EXISTS!');
        console.log('   Both rows were inserted, meaning there is no unique constraint.');
        console.log('   This is why UPSERT fails with onConflict.');
    }

    // Check how many rows with this test domain
    const { data: rows } = await supabase
        .from('competitor_cache')
        .select('id, full_result')
        .eq('competitor_domain', 'duplicate-test.com');

    console.log('\nRows found with duplicate-test.com:', rows?.length || 0);
    if (rows) {
        rows.forEach(r => console.log('  -', r.id, JSON.stringify(r.full_result)));
    }

    // Cleanup
    await supabase.from('competitor_cache').delete().eq('competitor_domain', 'duplicate-test.com');
    console.log('\n(Cleaned up test rows)');
}

checkConstraints().catch(console.error);
