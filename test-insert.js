// Check if competitor_cache table exists and has correct constraints
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://hzhzrhfqfbkhutrqfqoj.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6aHpyaGZxZmJraHV0cnFmcW9qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzQwMzEwNCwiZXhwIjoyMDcyOTc5MTA0fQ.mD9fhTl1VM7G8S9c4KuxMmt8bh4qWeGXBH3IBTXVyh8'
);

async function testInsert() {
    console.log('=== Testing competitor_cache insert ===\n');

    // Test data with known good user_id
    const testData = {
        user_id: '8d9ae382-189c-4ebc-b837-1b8c711874e0',  // pushpakagrawal123@gmail.com
        user_domain: 'foundcoo.com',
        competitor_domain: 'test-competitor.com',
        full_result: { test: true, yourSite: {}, competitorSite: {} },
        analysis_status: 'completed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };

    console.log('1. Attempting insert with data:');
    console.log('   user_id:', testData.user_id);
    console.log('   user_domain:', testData.user_domain);
    console.log('   competitor_domain:', testData.competitor_domain);

    const { data, error } = await supabase
        .from('competitor_cache')
        .insert(testData)
        .select();

    if (error) {
        console.log('\n❌ INSERT FAILED!');
        console.log('   Error code:', error.code);
        console.log('   Error message:', error.message);
        console.log('   Error details:', error.details);
        console.log('   Error hint:', error.hint);
    } else {
        console.log('\n✅ INSERT SUCCEEDED!');
        console.log('   Inserted record:', data);

        // Clean up test data
        const { error: deleteError } = await supabase
            .from('competitor_cache')
            .delete()
            .eq('competitor_domain', 'test-competitor.com');

        if (!deleteError) {
            console.log('   (Test record cleaned up)');
        }
    }

    // List all table columns
    console.log('\n2. Checking table structure by attempting a select:');
    const { data: cols, error: colError } = await supabase
        .from('competitor_cache')
        .select('*')
        .limit(0);

    if (colError) {
        console.log('   Error:', colError.message);
    } else {
        console.log('   Table exists and is accessible');
    }
}

testInsert().catch(console.error);
