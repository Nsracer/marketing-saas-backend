-- Migration: Fix dashboard_cache table for proper caching
-- This fixes the missing unique constraint and adds missing columns
-- Run this SQL in your Supabase SQL Editor

-- Add unique constraint for proper upsert functionality
ALTER TABLE public.dashboard_cache 
ADD CONSTRAINT dashboard_cache_user_email_domain_unique 
UNIQUE (user_email, domain);

-- Add missing columns used by websiteAnalysisCacheService
ALTER TABLE public.dashboard_cache 
ADD COLUMN IF NOT EXISTS competitor_data jsonb;

ALTER TABLE public.dashboard_cache 
ADD COLUMN IF NOT EXISTS traffic_data jsonb;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_dashboard_cache_user_email 
ON public.dashboard_cache(user_email);

CREATE INDEX IF NOT EXISTS idx_dashboard_cache_domain 
ON public.dashboard_cache(domain);
