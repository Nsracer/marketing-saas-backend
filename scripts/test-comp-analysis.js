import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import enhancedCompetitorIntelligenceService from '../services/enhancedCompetitorIntelligenceService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function test() {
    const email = 'pushpakagrawal123@gmail.com';
    const competitorDomain = 'google.com';
    
    console.log('Testing analyzeCompetitor...\n');
    const result = await enhancedCompetitorIntelligenceService.analyzeCompetitor(
        email,
        competitorDomain,
        { forceRefresh: false }  // Use cache to test supplementation
    );
    
    console.log('\n\n=== RESULT ===');
    console.log('Success:', result.success);
    console.log('Cached:', result.cached);
    
    console.log('\nyourSite social data:');
    console.log('  Has facebook:', !!result.yourSite?.facebook);
    console.log('  Has instagram:', !!result.yourSite?.instagram);
    console.log('  Has linkedin:', !!result.yourSite?.linkedin);
    
    if (result.yourSite?.facebook) {
        console.log('\n  Facebook structure:');
        console.log('    - profile:', !!result.yourSite.facebook.profile);
        console.log('    - metrics:', !!result.yourSite.facebook.metrics);
        console.log('    - companyFollowers:', result.yourSite.facebook.companyFollowers);
    }
    
    if (result.yourSite?.instagram) {
        console.log('\n  Instagram structure:');
        console.log('    - profile:', !!result.yourSite.instagram.profile);
        console.log('    - metrics:', !!result.yourSite.instagram.metrics);
        console.log('    - companyFollowers:', result.yourSite.instagram.companyFollowers);
    }
}

test();
