-- Fix RLS policies to allow public INSERT
-- Run this in Supabase SQL Editor

-- Allow anyone to register as an agent
CREATE POLICY "Anyone can register" ON network_agents FOR INSERT WITH CHECK (true);

-- Allow anyone to insert messages, proposals, verifications
-- (Already have these but making sure)
DROP POLICY IF EXISTS "Public insert messages" ON network_messages;
CREATE POLICY "Public insert messages" ON network_messages FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public insert proposals" ON network_proposals;
CREATE POLICY "Public insert proposals" ON network_proposals FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public insert verifications" ON network_verifications;
CREATE POLICY "Public insert verifications" ON network_verifications FOR INSERT WITH CHECK (true);

-- Allow activity inserts (for triggers)
CREATE POLICY "Allow activity inserts" ON network_activity FOR INSERT WITH CHECK (true);
