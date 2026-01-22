/**
 * Simple Test for API Fallback
 * Run: node test-fallback-simple.js
 */

import dotenv from 'dotenv';
dotenv.config();

// Force API fallback (simulate Chrome not available)
process.env.FORCE_API_FALLBACK = 'true';

import lighthouseService from './services/lighthouseService.js';

const testDomain = process.argv[2] || 'example.com';

console.log('\n🧪 Testing API Fallback Mode\n');
console.log('Domain:', testDomain);
console.log('API Key:', process.env.GOOGLE_API_KEY ? '✅ Set' : '❌ Missing');
console.log('\n⏳ Analyzing... (this may take 30-60 seconds)\n');

const startTime = Date.now();

lighthouseService.analyzeSite(testDomain)
    .then(result => {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        if (result) {
            console.log('✅ SUCCESS!\n');
            console.log(`Duration: ${duration}s`);
            console.log(`Source: ${result.source || 'Unknown'}`);
            console.log('\nScores:');
            console.log(`  Performance:    ${result.categoryScores.performance}%`);
            console.log(`  Accessibility:  ${result.categoryScores.accessibility}%`);
            console.log(`  Best Practices: ${result.categoryScores.bestPractices}%`);
            console.log(`  SEO:            ${result.categoryScores.seo}%`);
            console.log('\nCore Web Vitals:');
            console.log(`  LCP: ${result.coreWebVitals.lcp.displayValue}`);
            console.log(`  FID: ${result.coreWebVitals.fid.displayValue}`);
            console.log(`  CLS: ${result.coreWebVitals.cls.displayValue}`);
            console.log('\n✨ API fallback is working correctly!\n');
        } else {
            console.log('❌ FAILED - No data returned\n');
        }
    })
    .catch(error => {
        console.log('❌ ERROR:', error.message, '\n');
    });
