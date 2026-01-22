-- Migration: Unify Plans to Starter, Growth, Pro
-- Date: 2025-12-12
-- Description: Remove 'free' and 'enterprise' plans, keep only starter/growth/pro
-- Default plan for new users: starter

-- Step 1: Update existing 'free' plan users to 'starter'
UPDATE users_table
SET plan = 'starter'
WHERE plan = 'free';

-- Step 2: Update existing 'enterprise' plan users to 'pro' (same features)
UPDATE users_table
SET plan = 'pro'
WHERE plan = 'enterprise';

-- Step 3: Drop old constraint
ALTER TABLE users_table 
DROP CONSTRAINT IF EXISTS users_table_plan_check;

-- Step 4: Add new constraint with only starter, growth, pro
ALTER TABLE users_table
ADD CONSTRAINT users_table_plan_check 
CHECK (plan IN ('starter', 'growth', 'pro'));

-- Step 5: Update default value to 'starter'
ALTER TABLE users_table 
ALTER COLUMN plan SET DEFAULT 'starter';

-- Step 6: Update users_data table (if exists)
UPDATE users_data
SET plan = 'starter'
WHERE plan = 'free';

UPDATE users_data
SET plan = 'pro'
WHERE plan = 'enterprise';

ALTER TABLE users_data 
ALTER COLUMN plan SET DEFAULT 'starter';

-- Verification queries
SELECT 
  plan,
  COUNT(*) as user_count
FROM users_table
GROUP BY plan
ORDER BY plan;

-- Expected output: Only 'starter', 'growth', 'pro' plans
