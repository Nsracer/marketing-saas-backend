-- Add subscription fields to users_table
-- Run this in your Supabase SQL Editor

-- Step 1: First, check what plan values exist
-- SELECT DISTINCT plan FROM users_table;

-- Step 2: Update any invalid plan values to 'free'
UPDATE users_table 
SET plan = 'free' 
WHERE plan IS NULL OR plan NOT IN ('free', 'starter', 'pro', 'enterprise');

-- Step 3: Add new columns (plan and stripe_id already exist)
ALTER TABLE users_table 
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active',
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_payment_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Step 4: Update existing users to have active status
UPDATE users_table 
SET subscription_status = 'active' 
WHERE subscription_status IS NULL;

-- Step 5: Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_stripe_id ON users_table(stripe_id);
CREATE INDEX IF NOT EXISTS idx_users_plan ON users_table(plan);
CREATE INDEX IF NOT EXISTS idx_users_email ON users_table(email);

-- Step 6: Add check constraints (after data is cleaned)
ALTER TABLE users_table 
DROP CONSTRAINT IF EXISTS valid_plan;

ALTER TABLE users_table 
ADD CONSTRAINT valid_plan 
CHECK (plan IN ('free', 'starter', 'pro', 'enterprise'));

ALTER TABLE users_table 
DROP CONSTRAINT IF EXISTS valid_subscription_status;

ALTER TABLE users_table 
ADD CONSTRAINT valid_subscription_status 
CHECK (subscription_status IN ('active', 'cancelled', 'past_due', 'trialing', 'incomplete', 'incomplete_expired'));

-- Step 7: Add comments
COMMENT ON COLUMN users_table.plan IS 'User subscription plan: free, starter, pro, or enterprise';
COMMENT ON COLUMN users_table.subscription_status IS 'Stripe subscription status';
COMMENT ON COLUMN users_table.stripe_id IS 'Stripe customer ID for billing';
COMMENT ON COLUMN users_table.stripe_subscription_id IS 'Stripe subscription ID';

-- Step 8: Verify the migration
SELECT 
  COUNT(*) as total_users,
  COUNT(CASE WHEN plan = 'free' THEN 1 END) as free_users,
  COUNT(CASE WHEN plan = 'starter' THEN 1 END) as starter_users,
  COUNT(CASE WHEN plan = 'pro' THEN 1 END) as pro_users,
  COUNT(CASE WHEN plan = 'enterprise' THEN 1 END) as enterprise_users
FROM users_table;
