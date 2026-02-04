-- =====================================================
-- SQL Migration: Add Missing Unique Constraints
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Add unique constraint to social_media_cache table
-- This allows the upsert to work on (user_email, platform, period)
ALTER TABLE public.social_media_cache 
ADD CONSTRAINT social_media_cache_unique_user_platform_period 
UNIQUE (user_email, platform, period);

-- 2. Add unique constraint to competitor_cache table (if not already exists)
-- This allows the upsert to work on (user_id, user_domain, competitor_domain)
-- NOTE: Check if this constraint already exists before running
ALTER TABLE public.competitor_cache 
ADD CONSTRAINT competitor_cache_unique_user_domains 
UNIQUE (user_id, user_domain, competitor_domain);

-- =====================================================
-- Verification Queries (run after the above)
-- =====================================================

-- Check constraints on social_media_cache
SELECT constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'social_media_cache';

-- Check constraints on competitor_cache
SELECT constraint_name, constraint_type 
FROM information_schema.table_constraints 
WHERE table_name = 'competitor_cache';
