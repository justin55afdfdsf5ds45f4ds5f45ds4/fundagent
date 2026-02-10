import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { Logger } from './utils/logger';

const logger = new Logger('STRATEGY');

// ============ TYPES ============
export interface CommitteeMember {
  name: string;
  persona: string;
  votingWeight: number;
  systemPrompt: string;
}

export interface StrategyConfig {
  name: string;
  description: string;

  trading: {
    buyIntervalMs: number;
    sellIntervalMs: number;
    buyAmountMON: number;
    maxTotalTrades: number;
    confidenceThreshold: number;
    buyBiasPercent: number;
    sellBiasPercent: number;
  };

  risk: {
    slippageBondingPercent: number;
    slippageDexPercent: number;
  };

  personality: {
    postIntervalMs: number;
    contentMaxChars: number;
    modeThresholds: {
      bullMinMON: number;
      neutralMinMON: number;
      bearMinMON: number;
    };
  };

  committee?: {
    enabled: boolean;
    votingThreshold: number;
    members: CommitteeMember[];
  };

  prompts?: {
    buyEvaluation?: string;
    sellEvaluation?: string;
    postGeneration?: string;
  };
}

// ============ DEFAULTS ============
const DEFAULT_STRATEGY: StrategyConfig = {
  name: 'FUND AGENT Default',
  description: 'Original FUND AGENT strategy — balanced degen approach',
  trading: {
    buyIntervalMs: 3 * 60 * 60 * 1000,    // 3 hours
    sellIntervalMs: 5 * 60 * 60 * 1000,   // 5 hours
    buyAmountMON: 1,
    maxTotalTrades: 30,
    confidenceThreshold: 0.3,
    buyBiasPercent: 60,
    sellBiasPercent: 40,
  },
  risk: {
    slippageBondingPercent: 15,
    slippageDexPercent: 20,
  },
  personality: {
    postIntervalMs: 30 * 60 * 1000,       // 30 minutes
    contentMaxChars: 250,
    modeThresholds: {
      bullMinMON: 5,
      neutralMinMON: 2,
      bearMinMON: 0,
    },
  },
};

// ============ LOADER ============
export function loadStrategy(path?: string): StrategyConfig {
  const strategyPath = path || process.env.STRATEGY_PATH;

  if (!strategyPath) {
    logger.info('No STRATEGY_PATH set, using defaults');
    return DEFAULT_STRATEGY;
  }

  try {
    const raw = fs.readFileSync(strategyPath, 'utf-8');
    const parsed = yaml.load(raw) as any;

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Strategy file is empty or invalid');
    }

    // Merge with defaults — strategy file can be partial
    const config: StrategyConfig = {
      name: parsed.name || DEFAULT_STRATEGY.name,
      description: parsed.description || DEFAULT_STRATEGY.description,
      trading: { ...DEFAULT_STRATEGY.trading, ...parsed.trading },
      risk: { ...DEFAULT_STRATEGY.risk, ...parsed.risk },
      personality: {
        ...DEFAULT_STRATEGY.personality,
        ...parsed.personality,
        modeThresholds: {
          ...DEFAULT_STRATEGY.personality.modeThresholds,
          ...(parsed.personality?.modeThresholds || {}),
        },
      },
    };

    // Load committee config if present
    if (parsed.committee?.enabled) {
      if (!parsed.committee.members || parsed.committee.members.length === 0) {
        throw new Error('Committee enabled but no members defined');
      }
      config.committee = {
        enabled: true,
        votingThreshold: parsed.committee.votingThreshold || 50,
        members: parsed.committee.members.map((m: any) => ({
          name: m.name || 'Unnamed Member',
          persona: m.persona || 'General investor',
          votingWeight: m.votingWeight ?? 1.0,
          systemPrompt: m.systemPrompt || `You are ${m.name}, a committee member evaluating investments.`,
        })),
      };
    }

    // Load custom prompts if present
    if (parsed.prompts) {
      config.prompts = parsed.prompts;
    }

    logger.info(`Loaded strategy: "${config.name}" from ${strategyPath}`);
    if (config.committee?.enabled) {
      logger.info(`Committee mode: ${config.committee.members.length} members, ${config.committee.votingThreshold}% threshold`);
    }

    return config;
  } catch (e: any) {
    if (e.code === 'ENOENT') {
      logger.warn(`Strategy file not found: ${strategyPath}, using defaults`);
      return DEFAULT_STRATEGY;
    }
    logger.error(`Failed to load strategy: ${e.message}`);
    throw e;
  }
}

// ============ SINGLETON ============
export const strategy = loadStrategy();
