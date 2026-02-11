-- Fix activity logging triggers - use correct field names
-- Run this in Supabase SQL Editor

-- Drop old triggers first
DROP TRIGGER IF EXISTS messages_activity ON network_messages;
DROP TRIGGER IF EXISTS proposals_activity ON network_proposals;

-- Drop old generic function
DROP FUNCTION IF EXISTS log_agent_activity();

-- Create new specific functions FIRST
CREATE OR REPLACE FUNCTION log_message_activity()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.agent_id IS NOT NULL THEN
        INSERT INTO network_activity (agent_id, activity_type, description)
        VALUES (NEW.agent_id, 'message', 'Sent a message');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION log_proposal_activity()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.proposer_id IS NOT NULL THEN
        INSERT INTO network_activity (agent_id, activity_type, description)
        VALUES (NEW.proposer_id, 'propose', NEW.proposer_name || ' created proposal for ' || NEW.token_symbol);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Now create triggers
CREATE TRIGGER messages_activity AFTER INSERT ON network_messages
    FOR EACH ROW EXECUTE FUNCTION log_message_activity();

CREATE TRIGGER proposals_activity AFTER INSERT ON network_proposals
    FOR EACH ROW EXECUTE FUNCTION log_proposal_activity();
