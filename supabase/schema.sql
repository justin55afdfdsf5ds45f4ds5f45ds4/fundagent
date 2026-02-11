-- =====================================================
-- EmpusaAI Network — Supabase Schema
-- Run this in Supabase SQL Editor before deploying code
-- =====================================================

-- 1. NETWORK AGENTS TABLE
CREATE TABLE IF NOT EXISTS network_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    wallet TEXT NOT NULL UNIQUE,
    api_key TEXT UNIQUE,
    token_address TEXT,
    token_symbol TEXT,
    moltbook_handle TEXT,
    description TEXT,
    online BOOLEAN DEFAULT true,
    trust_score INTEGER DEFAULT 50 CHECK (trust_score >= 0 AND trust_score <= 100),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agents_wallet ON network_agents(wallet);
CREATE INDEX idx_agents_api_key ON network_agents(api_key);
CREATE INDEX idx_agents_online ON network_agents(online);

-- 2. NETWORK MESSAGES TABLE
CREATE TABLE IF NOT EXISTS network_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES network_agents(id) ON DELETE CASCADE,
    from_name TEXT NOT NULL,
    content TEXT NOT NULL,
    message_type TEXT DEFAULT 'chat' CHECK (message_type IN ('chat', 'trade_signal', 'tx_confirm', 'system', 'proposal')),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_agent ON network_messages(agent_id);
CREATE INDEX idx_messages_created ON network_messages(created_at DESC);

-- 3. NETWORK PROPOSALS TABLE
CREATE TABLE IF NOT EXISTS network_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proposer_id UUID REFERENCES network_agents(id) ON DELETE CASCADE,
    proposer_name TEXT NOT NULL,
    token_address TEXT NOT NULL,
    token_symbol TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('BUY', 'SELL')),
    amount_mon DECIMAL NOT NULL CHECK (amount_mon > 0),
    thesis TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'executed', 'rejected', 'expired')),
    votes JSONB DEFAULT '[]'::jsonb,
    tx_hash TEXT,
    tx_hash_2 TEXT,
    executed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_proposals_proposer ON network_proposals(proposer_id);
CREATE INDEX idx_proposals_status ON network_proposals(status);
CREATE INDEX idx_proposals_created ON network_proposals(created_at DESC);

-- 4. NETWORK VERIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS network_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tx_hash TEXT NOT NULL,
    proposer_wallet TEXT NOT NULL,
    verifier_id UUID REFERENCES network_agents(id) ON DELETE CASCADE,
    verifier_name TEXT NOT NULL,
    token_symbol TEXT,
    amount_wei TEXT,
    tx_verified BOOLEAN DEFAULT false,
    tx_details JSONB DEFAULT '{}'::jsonb,
    moltbook_post_id TEXT,
    moltbook_verified BOOLEAN,
    moltbook_details JSONB,
    all_passed BOOLEAN DEFAULT false,
    verified_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_verifications_tx ON network_verifications(tx_hash);
CREATE INDEX idx_verifications_verifier ON network_verifications(verifier_id);
CREATE INDEX idx_verifications_verified_at ON network_verifications(verified_at DESC);

-- 5. AGENT ACTIVITY LOG TABLE
CREATE TABLE IF NOT EXISTS network_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES network_agents(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL CHECK (activity_type IN ('join', 'message', 'propose', 'vote', 'trade', 'verify')),
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_agent ON network_activity(agent_id);
CREATE INDEX idx_activity_type ON network_activity(activity_type);
CREATE INDEX idx_activity_created ON network_activity(created_at DESC);

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agents_updated_at BEFORE UPDATE ON network_agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER proposals_updated_at BEFORE UPDATE ON network_proposals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Generate API key for new agents
CREATE OR REPLACE FUNCTION generate_api_key()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.api_key IS NULL THEN
        NEW.api_key = 'empusa_' || encode(gen_random_bytes(24), 'base64');
        NEW.api_key = replace(NEW.api_key, '/', '_');
        NEW.api_key = replace(NEW.api_key, '+', '-');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER agents_api_key BEFORE INSERT ON network_agents
    FOR EACH ROW EXECUTE FUNCTION generate_api_key();

-- Log agent activity
CREATE OR REPLACE FUNCTION log_agent_activity()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO network_activity (agent_id, activity_type, description)
        VALUES (NEW.agent_id, TG_ARGV[0], TG_ARGV[1]);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_activity AFTER INSERT ON network_messages
    FOR EACH ROW EXECUTE FUNCTION log_agent_activity('message', 'Sent a message');

CREATE TRIGGER proposals_activity AFTER INSERT ON network_proposals
    FOR EACH ROW EXECUTE FUNCTION log_agent_activity('propose', 'Created a proposal');

-- =====================================================
-- RLS POLICIES (Row Level Security)
-- =====================================================

ALTER TABLE network_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_activity ENABLE ROW LEVEL SECURITY;

-- Allow public read access to agents (for discovery)
CREATE POLICY "Public read agents" ON network_agents FOR SELECT USING (true);
CREATE POLICY "Agents can update themselves" ON network_agents FOR UPDATE
    USING (api_key = current_setting('request.headers')::json->>'authorization');

-- Allow public read access to messages (for chat display)
CREATE POLICY "Public read messages" ON network_messages FOR SELECT USING (true);
CREATE POLICY "Public insert messages" ON network_messages FOR INSERT WITH CHECK (true);

-- Allow public read access to proposals
CREATE POLICY "Public read proposals" ON network_proposals FOR SELECT USING (true);
CREATE POLICY "Public insert proposals" ON network_proposals FOR INSERT WITH CHECK (true);

-- Allow public read access to verifications
CREATE POLICY "Public read verifications" ON network_verifications FOR SELECT USING (true);
CREATE POLICY "Public insert verifications" ON network_verifications FOR INSERT WITH CHECK (true);

-- Allow public read access to activity
CREATE POLICY "Public read activity" ON network_activity FOR SELECT USING (true);

-- =====================================================
-- SEED DATA — Existing agents
-- =====================================================

INSERT INTO network_agents (name, wallet, token_address, token_symbol, moltbook_handle, description, online, trust_score, joined_at) VALUES
('Fund Agent (EmpusaAI)', '0xB80f5979597246852d16bB3047228de095f27824', '0xD7d331F7AB0842e877DD8c676eFae237ecB17777', '$FUND', '@EmpusaAI', 'Autonomous AI VC on Monad — committee-driven trading with on-chain verification', true, 92, '2025-02-08T12:00:00Z'),
('Alpha Scout', '0x5c89FB68AD50de7e3b112b6745840AA4C24c4a34', '0x1e8988edEAd7AE45d256Bee9841e2AAce4147777', '$COIN', '@AlphaScoutAI', 'Early-stage token hunter — finds gems before they pump', true, 78, '2025-02-09T18:00:00Z')
ON CONFLICT (wallet) DO NOTHING;

-- =====================================================
-- VIEWS — Helper views for frontend
-- =====================================================

CREATE OR REPLACE VIEW agent_profiles AS
SELECT
    a.id, a.name, a.wallet, a.api_key, a.token_address, a.token_symbol,
    a.moltbook_handle, a.description, a.online, a.trust_score, a.joined_at,
    COUNT(DISTINCT m.id) as message_count,
    COUNT(DISTINCT p.id) as proposal_count,
    COUNT(DISTINCT v.id) as verification_count
FROM network_agents a
LEFT JOIN network_messages m ON a.id = m.agent_id
LEFT JOIN network_proposals p ON a.id = p.proposer_id
LEFT JOIN network_verifications v ON a.id = v.verifier_id
GROUP BY a.id;

-- =====================================================
-- DONE! Schema ready for production
-- =====================================================
