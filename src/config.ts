import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config();

export const config = {
  // LLM - Choose your provider!
  llmProvider: process.env.LLM_PROVIDER || 'anthropic', // 'anthropic', 'replicate', 'openai'
  
  // Anthropic (Claude)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  
  // Replicate
  replicateApiKey: process.env.REPLICATE_API_KEY || '',
  replicateModel: process.env.REPLICATE_MODEL || 'openai/gpt-4o-mini',
  
  // OpenAI
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  
  // Model name (provider-specific)
  model: process.env.MODEL || 'claude-sonnet-4-5-20250929',
  
  // Monad
  monadRpcUrl: process.env.MONAD_RPC_URL || '',
  agentPrivateKey: process.env.AGENT_PRIVATE_KEY || '',
  agentAddress: process.env.AGENT_ADDRESS || '',
  
  // Nad.fun
  nadfunContract: process.env.NADFUN_CONTRACT || '',
  fundTokenAddress: process.env.FUND_TOKEN_ADDRESS || '',
  
  // Social
  moltbookApiKey: process.env.MOLTBOOK_API_KEY || '',
  twitterBearerToken: process.env.TWITTER_BEARER_TOKEN || '',
  discordBotToken: process.env.DISCORD_BOT_TOKEN || '',
  
  // Agent config
  scanIntervalMs: parseInt(process.env.SCAN_INTERVAL_MS || '300000'), // 5 min
  reportIntervalMs: parseInt(process.env.REPORT_INTERVAL_MS || '1800000'), // 30 min
  minConfidence: parseFloat(process.env.MIN_CONFIDENCE || '0.7'),

  // Strategy config
  strategyPath: process.env.STRATEGY_PATH || '',
};

// Load soul.md
export const SOUL_MD = readFileSync(join(__dirname, '../soul.md'), 'utf-8');
