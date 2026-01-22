-- Migration: Create health_score_cache table
-- This table is required by quickWinsService.js and healthScoreRoutes.js
-- Run this SQL in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.health_score_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  website_url text NOT NULL,
  health_score jsonb,
  improvement_opportunities jsonb,
  lighthouse_data jsonb,
  pagespeed_data jsonb,
  technical_seo_data jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + interval '6 hours'),
  CONSTRAINT health_score_cache_pkey PRIMARY KEY (id),
  CONSTRAINT health_score_cache_unique_user_url UNIQUE (user_email, website_url)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_health_score_cache_user_email 
ON public.health_score_cache(user_email);

CREATE INDEX IF NOT EXISTS idx_health_score_cache_website_url 
ON public.health_score_cache(website_url);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE public.health_score_cache ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role access
CREATE POLICY "Service role can do all" ON public.health_score_cache
FOR ALL
USING (true)
WITH CHECK (true);
