import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Manual webhook simulator for testing (DEVELOPMENT ONLY)
router.post('/simulate-checkout-success', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' });
  }

  const { email, plan = 'pro' } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  console.log(`🧪 Simulating checkout success for ${email} → ${plan}`);

  try {
    // Update user plan directly
    const { data, error } = await supabase
      .from('users_table')
      .update({
        plan: plan,
        subscription_status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('email', email)
      .select();

    if (error) {
      console.error('❌ Error updating user:', error);
      return res.status(500).json({ error: 'Failed to update user', details: error });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`✅ User ${email} upgraded to ${plan}`);

    res.json({
      success: true,
      message: `User upgraded to ${plan}`,
      user: data[0]
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: 'Failed to simulate checkout' });
  }
});

// Simulate subscription cancellation
router.post('/simulate-cancel', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' });
  }

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  console.log(`🧪 Simulating cancellation for ${email}`);

  try {
    const { data, error } = await supabase
      .from('users_table')
      .update({
        plan: 'free',
        subscription_status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('email', email)
      .select();

    if (error) {
      return res.status(500).json({ error: 'Failed to update user', details: error });
    }

    console.log(`✅ User ${email} downgraded to free`);

    res.json({
      success: true,
      message: 'Subscription cancelled',
      user: data[0]
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: 'Failed to simulate cancellation' });
  }
});

// Get user subscription status
router.get('/check-plan', async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'Email required' });
  }

  try {
    const { data, error } = await supabase
      .from('users_table')
      .select('email, plan, subscription_status, updated_at')
      .eq('email', email)
      .single();

    if (error) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      email: data.email,
      plan: data.plan,
      status: data.subscription_status,
      lastUpdated: data.updated_at
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: 'Failed to check plan' });
  }
});

// Bulk upgrade users (for testing)
router.post('/bulk-upgrade', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' });
  }

  const { emails, plan = 'pro' } = req.body;

  if (!emails || !Array.isArray(emails)) {
    return res.status(400).json({ error: 'emails array required' });
  }

  console.log(`🧪 Bulk upgrading ${emails.length} users to ${plan}`);

  try {
    const results = [];

    for (const email of emails) {
      const { data, error } = await supabase
        .from('users_table')
        .update({
          plan: plan,
          subscription_status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('email', email)
        .select();

      results.push({
        email,
        success: !error,
        error: error?.message
      });
    }

    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: 'Failed to bulk upgrade' });
  }
});

export default router;
