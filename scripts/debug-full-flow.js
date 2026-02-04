import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import socialMediaCacheService from '../services/socialMediaCacheService.js';
import oauthTokenService from '../services/oauthTokenService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

(async () => {
    const email = 'pushpakagrawal123@gmail.com';
    
    // Check OAuth connections
    console.log('=== OAuth Connection Status ===');
    const fbConnected = await oauthTokenService.isConnected(email, 'facebook');
    const liConnected = await oauthTokenService.isConnected(email, 'linkedin');
    const igConnected = fbConnected; // Instagram uses Facebook OAuth
    
    console.log('Facebook connected:', !!fbConnected);
    console.log('Instagram connected (via FB):', !!igConnected);
    console.log('LinkedIn connected:', !!liConnected);
    
    // Fetch caches with ignoreExpiration=true (like the actual code does)
    console.log('\n=== Cache Retrieval (ignoreExpiration=true) ===');
    const [fbCache, igCache, liCache] = await Promise.all([
        fbConnected ? socialMediaCacheService.getCachedMetrics(email, 'facebook', 'month', true) : null,
        igConnected ? socialMediaCacheService.getCachedMetrics(email, 'instagram', 'month', true) : null,
        liConnected ? socialMediaCacheService.getCachedMetrics(email, 'linkedin', 'month', true) : null
    ]);
    
    console.log('\nFacebook cache:');
    console.log('  returned:', fbCache !== null);
    console.log('  dataAvailable:', fbCache?.dataAvailable);
    console.log('  followers:', fbCache?.companyFollowers);
    
    console.log('\nInstagram cache:');
    console.log('  returned:', igCache !== null);
    console.log('  dataAvailable:', igCache?.dataAvailable);
    console.log('  followers:', igCache?.companyFollowers);
    
    console.log('\nLinkedIn cache:');
    console.log('  returned:', liCache !== null);
    console.log('  dataAvailable:', liCache?.dataAvailable);
    console.log('  followers:', liCache?.companyFollowers);
    
    // Simulate what the code does
    console.log('\n=== What would be added to yourSite ===');
    console.log('Facebook will be added:', !!(fbCache && fbCache.dataAvailable));
    console.log('Instagram will be added:', !!(igCache && igCache.dataAvailable));
    console.log('LinkedIn will be added:', !!(liCache && liCache.dataAvailable));
    
    process.exit(0);
})();
