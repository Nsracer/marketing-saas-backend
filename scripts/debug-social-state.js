
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import oauthTokenService from '../services/oauthTokenService.js';
import socialMediaCacheService from '../services/socialMediaCacheService.js';
import { createClient } from '@supabase/supabase-js';

// Setup environment
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

async function debugSocialState() {
    try {
        console.log('🔍 Finding a user with social media cache...');

        // Find a user who has some social cache
        const { data: cacheData, error: cacheError } = await supabase
            .from('social_media_cache')
            .select('user_email, platform, data_available, expires_at')
            .limit(5);

        if (cacheError) throw cacheError;
        if (!cacheData || cacheData.length === 0) {
            console.log('❌ No social media cache found in DB.');
            return;
        }

        const email = cacheData[0].user_email;
        console.log(`👤 Analyzing User: ${email}`);

        // Check Connections
        console.log('\n🔗 Connection Status (oauthTokenService):');
        const fbConnected = await oauthTokenService.isConnected(email, 'facebook');
        const igConnected = await oauthTokenService.isConnected(email, 'instagram');
        const liConnected = await oauthTokenService.isConnected(email, 'linkedin');

        console.log(`   - Facebook: ${fbConnected ? '✅ Connected' : '❌ Disconnected'}`);
        console.log(`   - Instagram: ${igConnected ? '✅ Connected' : '❌ Disconnected'}`);
        console.log(`   - LinkedIn: ${liConnected ? '✅ Connected' : '❌ Disconnected'}`);

        // Check Cache Fetch
        console.log('\n📦 Cache Retrieval (socialMediaCacheService):');

        const platforms = ['facebook', 'instagram', 'linkedin'];

        for (const platform of platforms) {
            console.log(`\n   --- ${platform.toUpperCase()} ---`);
            const cached = await socialMediaCacheService.getCachedMetrics(email, platform, 'month', true); // ignoreExpiration=true

            if (cached) {
                console.log(`   ✅ Cache Found`);
                console.log(`      dataAvailable: ${cached.dataAvailable}`);
                console.log(`      cacheAge: ${cached.cacheAge} minutes`);
                console.log(`      expires_at: ${cached.expires_at || 'N/A'}`);
                console.log(`      companyFollowers: ${cached.companyFollowers}`);
                console.log(`      metrics:`, cached.metrics);
            } else {
                console.log(`   ❌ Cache NOT Returned by service`);
                // Check Raw DB if service returned null
                const { data: raw, error: rawError } = await supabase
                    .from('social_media_cache')
                    .select('*')
                    .eq('user_email', email)
                    .eq('platform', platform)
                    .single();

                if (raw) {
                    console.log(`      ⚠️ BUT record exists in DB!`);
                    console.log(`      Row data_available: ${raw.data_available}`);
                    console.log(`      Row expires_at: ${raw.expires_at}`);
                } else {
                    console.log(`      Verified: No record in DB`);
                }
            }
        }

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

debugSocialState();
