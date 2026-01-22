-- Migration: Set default plan to 'starter' for new users
-- Run this in Supabase SQL Editor

-- Step 1: Update the default value for the plan column
ALTER TABLE users_table 
ALTER COLUMN plan SET DEFAULT 'starter'::text;

-- Step 2: Update any existing 'free' users to 'starter' (optional, only if you want to upgrade existing free users)
-- Comment out if you want to keep existing free users as-is
UPDATE users_table 
SET plan = 'starter' 
WHERE plan = 'free';

-- Step 3: Update the CHECK constraint to still allow free, but make starter the default
-- The constraint already exists, no need to change it
-- CHECK (plan = ANY (ARRAY['free'::text, 'starter'::text, 'growth'::text, 'pro'::text]))

-- Step 4: Verify the change
SELECT column_name, column_default, data_type 
FROM information_schema.columns 
WHERE table_name = 'users_table' AND column_name = 'plan';

-- Expected output: plan | 'starter'::text | text

-- Step 5: Test with a query
SELECT 
  COUNT(*) as total_users,
  COUNT(CASE WHEN plan = 'free' THEN 1 END) as free_users,
  COUNT(CASE WHEN plan = 'starter' THEN 1 END) as starter_users,
  COUNT(CASE WHEN plan = 'growth' THEN 1 END) as growth_users,
  COUNT(CASE WHEN plan = 'pro' THEN 1 END) as pro_users
FROM users_table;

-- Note: New users will now default to 'starter' plan
COMMENT ON COLUMN users_table.plan IS 'User subscription plan: free, starter (default), growth, pro';
