import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import enhancedCompetitorIntelligenceService from '../services/enhancedCompetitorIntelligenceService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

(async () => {
    const result = await enhancedCompetitorIntelligenceService.analyzeCompetitor(
        'pushpakagrawal123@gmail.com',
        'google.com',
        { forceRefresh: false }
    );
    
    console.log('\n=== RESULT ===');
    console.log('Success:', result.success);
    console.log('Cached:', result.cached);
    console.log('yourSite.facebook:', !!result.yourSite?.facebook);
    console.log('yourSite.instagram:', !!result.yourSite?.instagram);
    console.log('yourSite.linkedin:', !!result.yourSite?.linkedin);
    
    if (result.yourSite?.facebook) {
        console.log('FB profile:', !!result.yourSite.facebook.profile);
        console.log('FB metrics:', !!result.yourSite.facebook.metrics);
    }
    if (result.yourSite?.instagram) {
        console.log('IG profile:', !!result.yourSite.instagram.profile);
        console.log('IG metrics:', !!result.yourSite.instagram.metrics);
    }
    
    process.exit(0);
})();
