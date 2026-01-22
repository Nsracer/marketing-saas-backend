/**
 * Test script to verify Puppeteer setup
 * Run: node test-puppeteer-setup.js
 */

import puppeteer from 'puppeteer';
import { getPuppeteerConfig } from './config/chromeConfig.js';

async function testPuppeteerSetup() {
  console.log('🧪 Testing Puppeteer setup...\n');

  try {
    // Get configuration
    console.log('1️⃣ Getting Puppeteer configuration...');
    const config = await getPuppeteerConfig();
    console.log('Config:', JSON.stringify(config, null, 2));
    console.log('');

    // Launch browser
    console.log('2️⃣ Launching browser...');
    const browser = await puppeteer.launch(config);
    console.log('✅ Browser launched successfully!');
    console.log('');

    // Create a page
    console.log('3️⃣ Creating new page...');
    const page = await browser.newPage();
    console.log('✅ Page created!');
    console.log('');

    // Navigate to a test URL
    console.log('4️⃣ Navigating to example.com...');
    await page.goto('https://example.com', { waitUntil: 'networkidle0' });
    const title = await page.title();
    console.log(`✅ Page loaded! Title: "${title}"`);
    console.log('');

    // Close browser
    console.log('5️⃣ Closing browser...');
    await browser.close();
    console.log('✅ Browser closed!');
    console.log('');

    console.log('🎉 All tests passed! Puppeteer is working correctly.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testPuppeteerSetup();
