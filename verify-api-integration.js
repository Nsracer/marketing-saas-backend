/**
 * Verification Script: Confirm API is being used (not local Puppeteer)
 */

import competitorAnalysisService from './services/competitorAnalysisService.js';
import fs from 'fs';

console.log('🔍 VERIFICATION: Competitor Analysis API Integration\n');
console.log('='.repeat(70));

// Check the service file for Puppeteer imports
console.log('\n1️⃣ Checking competitorAnalysisService.js imports:');
const serviceContent = fs.readFileSync('./services/competitorAnalysisService.js', 'utf8');

if (serviceContent.includes('import puppeteer') || serviceContent.includes('require(\'puppeteer\')')) {
  console.log('   ❌ FOUND: Local Puppeteer import');
} else {
  console.log('   ✅ CONFIRMED: No Puppeteer imports');
}

if (serviceContent.includes('puppeteer.launch') || serviceContent.includes('browser = await')) {
  console.log('   ❌ FOUND: Puppeteer launch code');
} else {
  console.log('   ✅ CONFIRMED: No Puppeteer launch code');
}

if (serviceContent.includes('fetch(apiUrl') || serviceContent.includes('await fetch')) {
  console.log('   ✅ CONFIRMED: Uses fetch API for external endpoint');
} else {
  console.log('   ⚠️  WARNING: fetch API not found');
}

// Check environment configuration
console.log('\n2️⃣ Checking environment configuration:');
const apiUrl = process.env.PUPPETEER_API_URL || 'https://puppeteer-on-vercel-red.vercel.app/api/analyze';
console.log(`   API URL: ${apiUrl}`);

if (apiUrl.includes('vercel.app')) {
  console.log('   ✅ CONFIRMED: Using external Vercel API');
} else if (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
  console.log('   ⚠️  WARNING: Using localhost (might be local instance)');
} else {
  console.log('   ✅ CONFIRMED: Using external API endpoint');
}

// Test with a real domain
console.log('\n3️⃣ Testing with real domain (example.com):');
console.log('   Starting analysis...');

const startTime = Date.now();
const result = await competitorAnalysisService.analyzeWebsite('example.com');
const duration = Date.now() - startTime;

console.log(`   ✅ Completed in ${duration}ms`);
console.log(`   Success: ${result.success}`);

if (result.success) {
  console.log(`   Domain: ${result.domain}`);
  console.log(`   Title: ${result.seo?.title || 'N/A'}`);
  console.log(`   ✅ CONFIRMED: API is working correctly`);
} else {
  console.log(`   ❌ Error: ${result.error}`);
}

// Final verdict
console.log('\n' + '='.repeat(70));
console.log('\n🎯 FINAL VERIFICATION RESULT:\n');

const checks = [
  !serviceContent.includes('import puppeteer'),
  !serviceContent.includes('puppeteer.launch'),
  serviceContent.includes('fetch(apiUrl'),
  apiUrl.includes('vercel.app') || (!apiUrl.includes('localhost') && !apiUrl.includes('127.0.0.1')),
  result.success
];

const passedChecks = checks.filter(Boolean).length;
const totalChecks = checks.length;

if (passedChecks === totalChecks) {
  console.log('✅ ALL CHECKS PASSED (' + passedChecks + '/' + totalChecks + ')');
  console.log('✅ Competitor Analysis is using EXTERNAL API ONLY');
  console.log('✅ No local Puppeteer instance is being used');
} else {
  console.log('⚠️  SOME CHECKS FAILED (' + passedChecks + '/' + totalChecks + ')');
  console.log('   Please review the issues above');
}

console.log('\n' + '='.repeat(70) + '\n');
process.exit(0);
