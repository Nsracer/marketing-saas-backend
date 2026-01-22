import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

console.log('UserRoutes Init: Checking Supabase Config...');
console.log('UserRoutes: SUPABASE_URL present:', !!supabaseUrl);
if (supabaseUrl) console.log('UserRoutes: SUPABASE_URL starts with:', supabaseUrl.substring(0, 10) + '...');
console.log('UserRoutes: SUPABASE_SERVICE_KEY present:', !!supabaseKey);

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ UserRoutes: Missing Supabase credentials!');
}

const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder'
);

/**
 * GET /api/user/plan
 * Get user's subscription plan
 */
router.get('/plan', async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Fetch user's plan from database
    const { data, error } = await supabase
      .from('users_table')
      .select('plan')
      .eq('email', email)
      .single();

    if (error || !data) {
      console.error('Error fetching user plan:', error);
      return res.status(404).json({
        success: false,
        error: 'User not found',
        plan: 'starter' // Default to starter
      });
    }

    res.json({
      success: true,
      plan: data.plan.toLowerCase()
    });

  } catch (error) {
    console.error('Error in /api/user/plan:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      plan: 'starter' // Default to starter on error
    });
  }
});

export default router;
