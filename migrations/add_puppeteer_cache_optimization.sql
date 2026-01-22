-- Migration: Add Puppeteer analysis caching for faster competitor analysis
-- This migration adds caching for Puppeteer API results to speed up competitor analysis

-- The search_console_cache table already has puppeteer_data column
-- We just need to ensure it's being used properly

-- Add index for faster lookups on search_console_cache
CREATE INDEX IF NOT EXISTS idx_search_console_cache_user_domain 
ON public.search_console_cache(user_id, domain);

-- Add index for faster lookups on competitor_cache
CREATE INDEX IF NOT EXISTS idx_competitor_cache_domains 
ON public.competitor_cache(user_id, user_domain, competitor_domain);

-- Add index for checking cache expiry (using CURRENT_TIMESTAMP instead of NOW())
CREATE INDEX IF NOT EXISTS idx_competitor_cache_expires 
ON public.competitor_cache(expires_at);

-- Add comment to document the puppeteer_data usage
COMMENT ON COLUMN public.search_console_cache.puppeteer_data IS 
'Cached Puppeteer API analysis data for the users own domain. Used to speed up competitor analysis by reusing this data instead of fetching again.';

COMMENT ON COLUMN public.competitor_cache.puppeteer_data IS 
'Cached Puppeteer API analysis data for competitor domains. Stored for 7 days to speed up subsequent competitor analyses.';
