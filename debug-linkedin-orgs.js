
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import linkedinMetricsServiceV2 from './services/linkedinMetricsServiceV2.js';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

async function debugOrgs() {
    const testEmail = 'pushpakagrawal123@gmail.com'; // User from check-oauth-flow.js
    console.log(`Debugging LinkedIn Orgs for ${testEmail}...`);

    try {
        const orgs = await linkedinMetricsServiceV2.getOrganizations(testEmail);

        console.log(`\nFound ${orgs.length} organizations:`);
        orgs.forEach((org, i) => {
            console.log(`\n[Org ${i + 1}]`);
            console.log(`  Name: ${org.name}`);
            console.log(`  ID: ${org.id}`);
            console.log(`  URN: ${org.urn}`);
            console.log(`  Role: ${org.role}`);
            console.log(`  State: ${org.state}`);
        });

    } catch (error) {
        console.error('Error:', error.message);
    }
}

debugOrgs();
