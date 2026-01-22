// Manual Stripe Testing (No CLI needed)
// Usage: node test-stripe-manual.js

import dotenv from 'dotenv';
dotenv.config();

const API_URL = process.env.BACKEND_URL || 'http://localhost:3010';
const testEmail = 'henax19725@haotuwu.com'; // Change to your test user email

console.log('\n🧪 Manual Stripe Testing (No CLI Required)\n');

// Test 1: Check current plan
async function checkPlan() {
  console.log('1️⃣ Checking current plan...');
  try {
    const response = await fetch(`${API_URL}/api/stripe-test/check-plan?email=${testEmail}`);
    const data = await response.json();
    console.log('Current plan:', data);
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log('');
}

// Test 2: Simulate successful checkout (upgrade to pro)
async function simulateCheckout(plan = 'pro') {
  console.log(`2️⃣ Simulating checkout success → ${plan}...`);
  try {
    const response = await fetch(`${API_URL}/api/stripe-test/simulate-checkout-success`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, plan })
    });
    const data = await response.json();
    if (data.success) {
      console.log('✅ Success:', data.message);
      console.log('Updated user:', data.user);
    } else {
      console.log('❌ Failed:', data);
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log('');
}

// Test 3: Simulate cancellation
async function simulateCancel() {
  console.log('3️⃣ Simulating subscription cancellation...');
  try {
    const response = await fetch(`${API_URL}/api/stripe-test/simulate-cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail })
    });
    const data = await response.json();
    if (data.success) {
      console.log('✅ Success:', data.message);
    } else {
      console.log('❌ Failed:', data);
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log('');
}

// Run tests
async function runTests() {
  console.log('Testing with email:', testEmail);
  console.log('API URL:', API_URL);
  console.log('');
  
  await checkPlan();
  await simulateCheckout('pro');
  await checkPlan();
  
  console.log('✨ Tests complete!\n');
  console.log('📝 To test cancellation, run:');
  console.log('   node test-stripe-manual.js cancel\n');
}

// Check command line args
const command = process.argv[2];

if (command === 'cancel') {
  simulateCancel().then(() => checkPlan());
} else if (command === 'starter') {
  simulateCheckout('starter').then(() => checkPlan());
} else if (command === 'enterprise') {
  simulateCheckout('enterprise').then(() => checkPlan());
} else {
  runTests();
}
