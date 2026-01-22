import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const logFile = 'verify_output.txt';
function log(msg) {
    fs.appendFileSync(logFile, msg + '\n');
}

// Clear log file
if (fs.existsSync(logFile)) fs.unlinkSync(logFile);

log('--- START VERIFY ENV ---');

// Load env vars
const result = dotenv.config();
if (result.error) {
    log('Error loading .env: ' + result.error);
}

log('PWD: ' + process.cwd());
log('SUPABASE_URL: ' + (process.env.SUPABASE_URL ? 'PRESENT' : 'MISSING'));
if (process.env.SUPABASE_URL) {
    log('Value(masked): ' + process.env.SUPABASE_URL.substring(0, 10) + '...');
}
log('SUPABASE_SERVICE_KEY: ' + (process.env.SUPABASE_SERVICE_KEY ? 'PRESENT' : 'MISSING'));

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    log('Missing required environment variables.');
    process.exit(1);
}

const runTest = async () => {
    try {
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        log('Client created. Testing connection...');

        // Test simple query
        const { data, error } = await supabase.from('users_table').select('count', { count: 'exact', head: true });

        if (error) {
            log('❌ Supabase Connection Failed: ' + JSON.stringify(error));
        } else {
            log('✅ Supabase Connection Successful!');
        }
    } catch (err) {
        log('❌ CRITICAL ERROR: ' + err);
    }
    log('--- END VERIFY ENV ---');
};

runTest();
