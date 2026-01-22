// Test Stripe Integration
// Usage: node test-stripe.js

import dotenv from 'dotenv';
dotenv.config();

const API_URL = process.env.BACKEND_URL || 'http://localhost:3010';
const testEmail = 'test@example.com';

console.log('\n🧪 Testing Stripe Integration\n');

// Test 1: Get subscription status
async function testGetStatus() {
  console.log('1️⃣ Testing: Get Subscription Status');
  try {
    const response = await fetch(`${API_URL}/api/stripe/subscription-status?email=${testEmail}`);
    const data = await response.json();
    console.log('✅ Status:', data);
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log('');
}

// Test 2: Create checkout session
async function testCreateCheckout() {
  console.log('2️⃣ Testing: Create Checkout Session');
  try {
    const response = await fetch(`${API_URL}/api/stripe/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        priceId: process.env.STRIPE_PRICE_PRO || 'price_test',
        successUrl: 'http://localhost:3002/dashboard?upgrade=success',
        cancelUrl: 'http://localhost:3002/pricing'
      })
    });
    const data = await response.json();
    if (data.url) {
      console.log('✅ Checkout URL created:', data.url.substring(0, 50) + '...');
    } else {
      console.log('⚠️ Response:', data);
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log('');
}

// Test 3: Check environment variables
function testEnvVars() {
  console.log('3️⃣ Testing: Environment Variables');
  const required = {
    'STRIPE_SECRET_KEY': process.env.STRIPE_SECRET_KEY,
    'STRIPE_WEBHOOK_SECRET': process.env.STRIPE_WEBHOOK_SECRET,
    'STRIPE_PRICE_STARTER': process.env.STRIPE_PRICE_STARTER,
    'STRIPE_PRICE_PRO': process.env.STRIPE_PRICE_PRO,
    'STRIPE_PRICE_ENTERPRISE': process.env.STRIPE_PRICE_ENTERPRISE,
  };

  for (const [key, value] of Object.entries(required)) {
    if (value) {
      console.log(`✅ ${key}: Set (${value.substring(0, 15)}...)`);
    } else {
      console.log(`❌ ${key}: Not set`);
    }
  }
  console.log('');
}

// Run tests
async function runTests() {
  testEnvVars();
  await testGetStatus();
  await testCreateCheckout();
  
  console.log('✨ Tests complete!\n');
  console.log('📖 Next steps:');
  console.log('1. Run: stripe listen --forward-to localhost:3010/api/stripe/webhook');
  console.log('2. Test checkout with card: 4242 4242 4242 4242');
  console.log('3. Check webhook logs for plan update\n');
}

runTests();
