// Check constraints on competitor_cache table
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://hzhzrhfqfbkhutrqfqoj.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6aHpyaGZxZmJraHV0cnFmcW9qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzQwMzEwNCwiZXhwIjoyMDcyOTc5MTA0fQ.mD9fhTl1VM7G8S9c4KuxMmt8bh4qWeGXBH3IBTXVyh8'
);

async function testUpsert() {
    console.log('=== Testing competitor_cache UPSERT ===\n');

    const testData = {
        user_id: '8d9ae382-189c-4ebc-b837-1b8c711874e0',
        user_domain: 'foundcoo.com',
        competitor_domain: 'upsert-test-competitor.com',
        full_result: { test: true },
        analysis_status: 'completed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };

    console.log('1. Testing UPSERT with onConflict:');
    const { data, error } = await supabase
        .from('competitor_cache')
        .upsert(testData, {
            onConflict: 'user_id,user_domain,competitor_domain'
        })
        .select();

    if (error) {
        console.log('❌ UPSERT FAILED!');
        console.log('   Error code:', error.code);
        console.log('   Error message:', error.message);

        // If failed, try regular INSERT instead
        console.log('\n2. Trying regular INSERT instead:');
        const { data: insertData, error: insertError } = await supabase
            .from('competitor_cache')
            .insert(testData)
            .select();

        if (insertError) {
            console.log('   INSERT also failed:', insertError.message);
        } else {
            console.log('   INSERT succeeded!');
            console.log('   This means the table lacks the unique constraint for UPSERT');

            // Clean up
            await supabase.from('competitor_cache').delete().eq('competitor_domain', 'upsert-test-competitor.com');
            console.log('   (Cleaned up test data)');
        }
    } else {
        console.log('✅ UPSERT SUCCEEDED!');
        console.log('   Record:', data);

        // Clean up
        await supabase.from('competitor_cache').delete().eq('competitor_domain', 'upsert-test-competitor.com');
        console.log('   (Cleaned up test data)');
    }

    // Check what constraints exist
    console.log('\n3. Querying pg_indexes for competitor_cache:');
    const { data: indexes, error: idxError } = await supabase.rpc('get_table_info', { table_name: 'competitor_cache' });

    if (idxError) {
        console.log('   Could not query indexes (RPC may not exist)');
    } else {
        console.log('   Indexes:', indexes);
    }
}

testUpsert().catch(console.error);
