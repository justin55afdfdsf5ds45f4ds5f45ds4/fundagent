import { think } from './brain';
import { strategy, CommitteeMember } from '../strategy';
import { Logger } from '../utils/logger';

const logger = new Logger('COMMITTEE');

export interface CommitteeVote {
  member: string;
  persona: string;
  decision: 'BUY' | 'SELL' | 'HOLD' | 'SKIP';
  confidence: number;
  reasoning: string;
  votingWeight: number;
}

export interface CommitteeDecision {
  token: string;
  symbol: string;
  action: 'BUY_EVAL' | 'SELL_EVAL';
  finalDecision: 'BUY' | 'SELL' | 'HOLD' | 'SKIP';
  confidence: number;
  votes: CommitteeVote[];
  deliberation: string;
  voteTally: Record<string, number>;
  time: string;
}

export class InvestmentCommittee {
  private members: CommitteeMember[];
  private votingThreshold: number;

  constructor() {
    if (!strategy.committee?.enabled || !strategy.committee.members.length) {
      throw new Error('Committee not enabled or no members defined');
    }
    this.members = strategy.committee.members;
    this.votingThreshold = strategy.committee.votingThreshold;
    logger.info(`Committee initialized: ${this.members.map(m => m.name).join(', ')}`);
  }

  async evaluateBuy(data: {
    address: string;
    name: string;
    symbol: string;
    balance: string;
    portfolio: string;
  }): Promise<CommitteeDecision> {
    logger.info(`Committee voting on BUY: $${data.symbol}...`);

    const votePromises = this.members.map(member =>
      this.getMemberVote(member, 'BUY', data)
    );

    const votes = await Promise.all(votePromises);
    const decision = this.tallyVotes(votes, data.address, data.symbol, 'BUY_EVAL');

    logger.info(`Committee result for $${data.symbol}: ${decision.finalDecision} (${JSON.stringify(decision.voteTally)})`);
    return decision;
  }

  async evaluateSell(data: {
    token: string;
    symbol: string;
    netMON: number;
  }): Promise<CommitteeDecision> {
    logger.info(`Committee voting on SELL: $${data.symbol}...`);

    const votePromises = this.members.map(member =>
      this.getMemberVote(member, 'SELL', data)
    );

    const votes = await Promise.all(votePromises);
    const decision = this.tallyVotes(votes, data.token, data.symbol, 'SELL_EVAL');

    logger.info(`Committee result for $${data.symbol}: ${decision.finalDecision} (${JSON.stringify(decision.voteTally)})`);
    return decision;
  }

  private async getMemberVote(
    member: CommitteeMember,
    action: 'BUY' | 'SELL',
    data: any
  ): Promise<CommitteeVote> {
    try {
      const prompt = this.buildPrompt(member, action, data);
      const response = await think(member.systemPrompt, prompt);
      const parsed = this.parseResponse(response, action);

      return {
        member: member.name,
        persona: member.persona,
        decision: parsed.decision,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
        votingWeight: member.votingWeight,
      };
    } catch (e: any) {
      logger.error(`${member.name} vote failed: ${e.message}`);
      return {
        member: member.name,
        persona: member.persona,
        decision: 'SKIP',
        confidence: 0,
        reasoning: 'Failed to evaluate — abstaining',
        votingWeight: 0, // Don't count failed votes
      };
    }
  }

  private buildPrompt(member: CommitteeMember, action: 'BUY' | 'SELL', data: any): string {
    if (action === 'BUY') {
      return `INVESTMENT COMMITTEE VOTE — BUY EVALUATION

Token: ${data.name} ($${data.symbol})
Address: ${data.address}
Fund Balance: ${data.balance} MON
Current Portfolio: ${data.portfolio || 'empty'}

As ${member.name}, should the fund BUY this token for ${strategy.trading.buyAmountMON} MON?

Respond ONLY with JSON:
{"decision":"BUY","confidence":0.8,"reasoning":"Your 1-2 sentence reasoning."}
or
{"decision":"SKIP","confidence":0.3,"reasoning":"Your 1-2 sentence reasoning."}`;
    } else {
      return `INVESTMENT COMMITTEE VOTE — SELL EVALUATION

Position: $${data.symbol}
Invested: ${data.netMON} MON
Token: ${data.token}

As ${member.name}, should the fund SELL this position?

Respond ONLY with JSON:
{"decision":"SELL","confidence":0.8,"reasoning":"Your 1-2 sentence reasoning."}
or
{"decision":"HOLD","confidence":0.6,"reasoning":"Your 1-2 sentence reasoning."}`;
    }
  }

  private parseResponse(response: string, action: 'BUY' | 'SELL'): { decision: 'BUY' | 'SELL' | 'HOLD' | 'SKIP'; confidence: number; reasoning: string } {
    try {
      const jsonMatch = response.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const validBuy = ['BUY', 'SKIP'];
        const validSell = ['SELL', 'HOLD'];
        const valid = action === 'BUY' ? validBuy : validSell;
        const decision = valid.includes(parsed.decision?.toUpperCase()) ? parsed.decision.toUpperCase() : (action === 'BUY' ? 'SKIP' : 'HOLD');
        return {
          decision,
          confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
          reasoning: parsed.reasoning || parsed.thesis || 'No reasoning provided',
        };
      }
    } catch {}

    // Fallback: try to detect decision from text
    const upper = response.toUpperCase();
    if (action === 'BUY') {
      return {
        decision: upper.includes('BUY') ? 'BUY' : 'SKIP',
        confidence: 0.5,
        reasoning: response.substring(0, 100),
      };
    } else {
      return {
        decision: upper.includes('SELL') ? 'SELL' : 'HOLD',
        confidence: 0.5,
        reasoning: response.substring(0, 100),
      };
    }
  }

  private tallyVotes(votes: CommitteeVote[], token: string, symbol: string, action: 'BUY_EVAL' | 'SELL_EVAL'): CommitteeDecision {
    const tally: Record<string, number> = {};
    let totalWeight = 0;
    let weightedConfidence = 0;

    for (const vote of votes) {
      tally[vote.decision] = (tally[vote.decision] || 0) + vote.votingWeight;
      totalWeight += vote.votingWeight;
      weightedConfidence += vote.confidence * vote.votingWeight;
    }

    // Find the winning decision
    let winner = 'SKIP';
    let maxWeight = 0;
    for (const [decision, weight] of Object.entries(tally)) {
      if (weight > maxWeight) {
        maxWeight = weight;
        winner = decision;
      }
    }

    // Check if threshold is met
    const winnerPercent = totalWeight > 0 ? (maxWeight / totalWeight) * 100 : 0;
    const defaultDecision = action === 'BUY_EVAL' ? 'SKIP' : 'HOLD';
    const finalDecision = winnerPercent >= this.votingThreshold ? winner : defaultDecision;

    // Build deliberation summary
    const deliberation = votes.map(v =>
      `${v.member} (${v.persona}): ${v.decision} — ${v.reasoning}`
    ).join('\n');

    return {
      token,
      symbol,
      action,
      finalDecision: finalDecision as any,
      confidence: totalWeight > 0 ? weightedConfidence / totalWeight : 0,
      votes,
      deliberation,
      voteTally: tally,
      time: new Date().toISOString(),
    };
  }
}
