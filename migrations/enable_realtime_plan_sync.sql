-- Enable Supabase Realtime for users_table
-- This allows instant plan updates in the frontend without polling
-- Run this in Supabase SQL Editor

-- Step 1: Enable replica identity (required for realtime updates)
ALTER TABLE users_table REPLICA IDENTITY FULL;

-- Step 2: Add table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE users_table;

-- Step 3: Verify realtime is enabled
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
AND tablename = 'users_table';

-- Expected output: 1 row showing users_table is published

-- Note: Realtime updates will now be pushed to frontend via WebSocket
-- Frontend will receive instant notifications when plan column changes
