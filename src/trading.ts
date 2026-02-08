import { initSDK, parseEther, formatEther } from '@nadfun/sdk';
import { ethers } from 'ethers';
import * as fs from 'fs';
import { Logger } from './utils/logger';
import { generateText } from './core/brain';
import { config } from './config';

const logger = new Logger('TRADING');

// ============ TYPES ============
interface Trade {
  token: string;
  name: string;
  symbol: string;
  amount: string;
  thesis: string;
  time: string;
  txHash: string;
  type: 'BUY' | 'SELL';
  method: 'bonding_curve' | 'dex';
}

// ============ STATE ============
let trades: Trade[] = [];
let tradeCount = 0;
let balance = '0';
let pendingPosts: Array<{title: string, content: string}> = [];

const MAX_TOTAL_TRADES = 30; // Enough for 10 days
const TRADES_FILE = './trades.json';
const TRADE_COUNT_FILE = './trade-count.txt';

// ============ SDK + CONTRACTS ============
const sdk = initSDK({
  rpcUrl: config.monadRpcUrl,
  privateKey: config.agentPrivateKey as `0x${string}`,
  network: 'mainnet',
  wsUrl: process.env.WS_URL || undefined,
});

const provider = new ethers.JsonRpcProvider(config.monadRpcUrl);
const wallet = new ethers.Wallet(config.agentPrivateKey, provider);

const DEX_ROUTER = '0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137';
let WMON_ADDRESS = '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701'; // Will be verified at startup

const DEX_ROUTER_ABI = [
  'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
  'function WETH() external view returns (address)',
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

// ============ PERSISTENCE ============
function loadTrades(): Trade[] {
  try { return JSON.parse(fs.readFileSync(TRADES_FILE, 'utf-8')); } catch { return []; }
}
function saveTrades() {
  fs.writeFileSync(TRADES_FILE, JSON.stringify(trades, null, 2));
}
function loadTradeCount(): number {
  try { return parseInt(fs.readFileSync(TRADE_COUNT_FILE, 'utf-8')); } catch { return 0; }
}
function saveTradeCount(count: number) {
  fs.writeFileSync(TRADE_COUNT_FILE, String(count));
}

// ============ EXPORTS ============
export function getTrades() { return trades; }
export function getTradeCount() { return tradeCount; }
export function getBalance() { return balance; }
export function getPendingPosts() { return pendingPosts.splice(0, 1); }
export function getAllPendingPosts() { return pendingPosts; }

export function getHeldTokens(): Array<{token: string, symbol: string, name: string, netMON: number}> {
  const holdings: Record<string, {symbol: string, name: string, bought: number, sold: number}> = {};
  for (const t of trades) {
    if (!holdings[t.token]) holdings[t.token] = { symbol: t.symbol, name: t.name, bought: 0, sold: 0 };
    if (t.type === 'BUY') holdings[t.token].bought += parseFloat(t.amount);
    else holdings[t.token].sold += parseFloat(t.amount);
  }
  return Object.entries(holdings)
    .filter(([_, v]) => v.bought > v.sold)
    .map(([token, v]) => ({ token, symbol: v.symbol, name: v.name, netMON: v.bought - v.sold }));
}

// ============ BALANCE ============
export async function updateBalance() {
  try {
    const bal = await provider.getBalance(config.agentAddress);
    balance = parseFloat(ethers.formatEther(bal)).toFixed(2);
    logger.info(`Balance updated: ${balance} MON`);
  } catch (e) {
    logger.error('Balance check failed', e);
  }
}

// ============ SANITIZE TOKEN NAMES ============
function sanitizeName(name: string, fallback: string): string {
  if (!name) return fallback;
  // Strip HTML tags entirely
  const clean = name.replace(/<[^>]*>/g, '').trim();
  // Reject names that look like HTML/JS injection or are too short/long
  if (clean.length < 2 || clean.length > 50) return fallback;
  if (clean.includes('__next_f') || clean.includes('self.') || clean.includes('push([')) return fallback;
  return clean;
}

// ============ TOKEN DISCOVERY ============
async function discoverTokens(): Promise<Array<{address: string, name: string, symbol: string}>> {
  const discovered: Array<{address: string, name: string, symbol: string}> = [];
  
  // Method 1: nad.fun API
  try {
    const response = await fetch('https://api-server.nad.fun/token/list?order=creation_time&direction=desc&offset=0&limit=20');
    if (response.ok) {
      const data: any = await response.json();
      const tokens = data?.data || data?.tokens || data || [];
      if (Array.isArray(tokens)) {
        for (const t of tokens.slice(0, 10)) {
          const addr = t.token_address || t.address || t.contractAddress;
          if (addr) {
            discovered.push({
              address: ethers.getAddress(addr),
              name: sanitizeName(t.name, 'Unknown'),
              symbol: sanitizeName(t.symbol, addr.substring(0, 8)),
            });
          }
        }
      }
      if (discovered.length > 0) {
        logger.info(`📡 API discovered ${discovered.length} tokens`);
        return discovered;
      }
    }
  } catch (e) {
    logger.info(`API discovery failed: ${e}`);
  }
  
  // Method 2: Page scrape + on-chain name lookup
  try {
    const response = await fetch('https://nad.fun');
    const html = await response.text();
    const tokenPattern = /\/tokens\/(0x[a-fA-F0-9]{40})/g;
    const matches = [...html.matchAll(tokenPattern)];
    const addresses = [...new Set(matches.map(m => m[1]))];
    const erc20Abi = ['function name() view returns (string)', 'function symbol() view returns (string)'];
    for (const addr of addresses.slice(0, 10)) {
      try {
        const checksumAddr = ethers.getAddress(addr);
        let tName = 'nad.fun Token';
        let tSymbol = addr.substring(0, 8);
        try {
          const token = new ethers.Contract(checksumAddr, erc20Abi, provider);
          const [n, s] = await Promise.all([token.name(), token.symbol()]);
          tName = sanitizeName(n, 'nad.fun Token');
          tSymbol = sanitizeName(s, addr.substring(0, 8));
        } catch {}
        discovered.push({ address: checksumAddr, name: tName, symbol: tSymbol });
      } catch {}
    }
    if (discovered.length > 0) {
      logger.info(`🔍 Page scrape found ${discovered.length} tokens`);
      return discovered;
    }
  } catch (e) {
    logger.info(`Page scrape failed: ${e}`);
  }
  
  // Method 3: Fallback to FUND
  logger.info('⚠️ Discovery failed, using $FUND');
  return [{ address: config.fundTokenAddress!, name: 'Fund Agent', symbol: 'FUND' }];
}

// ============ BUY FUNCTIONS ============
async function buyBondingCurve(tokenAddress: string, amountMON: string): Promise<string> {
  const result = await sdk.simpleBuy({
    token: ethers.getAddress(tokenAddress) as `0x${string}`,
    amountIn: parseEther(amountMON),
    slippagePercent: 15,
  });
  return typeof result === 'string' ? result : (result as any)?.hash || (result as any)?.transactionHash || String(result);
}

async function buyViaDEX(tokenAddress: string, amountMON: string): Promise<string> {
  const router = new ethers.Contract(DEX_ROUTER, DEX_ROUTER_ABI, wallet);
  const amountIn = ethers.parseEther(amountMON);
  const path = [WMON_ADDRESS, ethers.getAddress(tokenAddress)];
  const deadline = Math.floor(Date.now() / 1000) + 300;
  
  let amountOutMin = BigInt(0);
  try {
    const amounts = await router.getAmountsOut(amountIn, path);
    amountOutMin = (amounts[1] * BigInt(80)) / BigInt(100); // 20% slippage
  } catch {}
  
  const tx = await router.swapExactETHForTokens(amountOutMin, path, config.agentAddress, deadline, { value: amountIn });
  const receipt = await tx.wait();
  return receipt.hash;
}

// ============ SELL FUNCTIONS ============
async function getTokenBalance(tokenAddress: string): Promise<bigint> {
  const token = new ethers.Contract(ethers.getAddress(tokenAddress), ERC20_ABI, provider);
  return await token.balanceOf(config.agentAddress);
}

async function sellViaDEX(tokenAddress: string, amount: bigint): Promise<string> {
  const checksumAddr = ethers.getAddress(tokenAddress);
  const token = new ethers.Contract(checksumAddr, ERC20_ABI, wallet);
  
  // Approve router
  const allowance = await token.allowance(config.agentAddress, DEX_ROUTER);
  if (allowance < amount) {
    const approveTx = await token.approve(DEX_ROUTER, ethers.MaxUint256);
    await approveTx.wait();
    logger.info(`Approved DEX router for ${checksumAddr}`);
  }
  
  const router = new ethers.Contract(DEX_ROUTER, DEX_ROUTER_ABI, wallet);
  const path = [checksumAddr, WMON_ADDRESS];
  const deadline = Math.floor(Date.now() / 1000) + 300;
  
  const tx = await router.swapExactTokensForETH(amount, 0, path, config.agentAddress, deadline);
  const receipt = await tx.wait();
  return receipt.hash;
}

// ============ EVALUATE AND TRADE ============
export async function evaluateAndTrade(tokenAddress: string, rawName: string, rawSymbol: string) {
  const name = sanitizeName(rawName, tokenAddress.substring(0, 10));
  const symbol = sanitizeName(rawSymbol, tokenAddress.substring(0, 8));
  if (tradeCount >= MAX_TOTAL_TRADES) {
    logger.info(`Max trades reached (${MAX_TOTAL_TRADES}). Commentary only.`);
    // Still evaluate for content
    try {
      const prompt = `You are FUND AGENT, a degen AI VC. Evaluate this token in 2 sentences. Be funny.\nName: ${name}\nSymbol: ${symbol}\nAddress: ${tokenAddress}`;
      const thesis = await generateText(prompt);
      pendingPosts.push({
        title: `🔍 Scouted $${symbol} — Analysis Only`,
        content: `${thesis}\n\nCapital fully deployed. Watching from the sidelines.\n$FUND Agent`,
      });
    } catch {}
    return;
  }

  try {
    const prompt = `You are FUND AGENT — a DEGEN autonomous AI VC on Monad. You WANT to invest.
Balance: ${balance} MON | Portfolio: ${getHeldTokens().map(h => '$' + h.symbol).join(', ') || 'empty'}

New token on nad.fun:
Name: ${name}
Symbol: ${symbol}
Address: ${tokenAddress}

Should I invest 1 MON? You should BUY roughly 60% of tokens. Only SKIP if it seems like an obvious rug or offensive.
Respond ONLY with this JSON, nothing else:
{"decision":"BUY","confidence":0.8,"thesis":"Your 2-sentence thesis. Be funny and dramatic."}`;

    const response = await generateText(prompt);
    const jsonMatch = response.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) { logger.info(`No JSON in LLM response`); return; }
    const decision = JSON.parse(jsonMatch[0]);
    
    logger.info(`${symbol}: ${decision.decision} (confidence: ${decision.confidence})`);

    if (decision.decision === 'BUY' && decision.confidence > 0.3) {
      let txHash = '';
      let method: 'bonding_curve' | 'dex' = 'bonding_curve';
      
      // Try bonding curve first, then DEX
      try {
        logger.info(`Trying bonding curve for $${symbol}...`);
        txHash = await buyBondingCurve(tokenAddress, '1');
        method = 'bonding_curve';
      } catch (curveErr: any) {
        const msg = String(curveErr.message || curveErr);
        if (msg.includes('INVALID_INPUTS') || msg.includes('bonding') || msg.includes('graduated') || msg.includes('revert')) {
          logger.info(`$${symbol} not on curve. Trying DEX...`);
          try {
            txHash = await buyViaDEX(tokenAddress, '1');
            method = 'dex';
          } catch (dexErr: any) {
            logger.error(`❌ DEX buy also failed: ${dexErr.message || dexErr}`);
            pendingPosts.push({
              title: `🔍 Evaluated $${symbol} — Buy Failed`,
              content: `${decision.thesis}\n\nTried to invest but transaction failed. Will retry later.\nToken: ${tokenAddress}\n\n$FUND Agent`,
            });
            return;
          }
        } else {
          logger.error(`❌ Buy failed: ${msg}`);
          return;
        }
      }
      
      if (txHash) {
        tradeCount++;
        saveTradeCount(tradeCount);
        const trade: Trade = {
          token: tokenAddress, name, symbol,
          amount: '1', thesis: decision.thesis,
          time: new Date().toISOString(),
          txHash, type: 'BUY', method,
        };
        trades.push(trade);
        saveTrades();
        await updateBalance();
        logger.info(`✅ BOUGHT $${symbol} via ${method} — TX: ${txHash.substring(0, 20)}...`);
        
        pendingPosts.push({
          title: `📈 BOUGHT $${symbol} — ${decision.thesis.substring(0, 50)}`,
          content: `${decision.thesis}\n\nInvested: 1 MON via ${method === 'dex' ? 'DEX' : 'Bonding Curve'}\nConfidence: ${(decision.confidence * 100).toFixed(0)}%\nTX: ${txHash}\n\n$FUND Agent making moves 🤖`,
        });
      }
    } else {
      // SKIP — occasionally post about it
      if (Math.random() > 0.6) {
        pendingPosts.push({
          title: `👎 PASS on $${symbol}`,
          content: `${decision.thesis}\n\nVerdict: SKIP\n$FUND Agent is selective.\nToken: ${tokenAddress}`,
        });
      }
    }
  } catch (err: any) {
    logger.error(`Error evaluating ${symbol}`, err.message || err);
  }
}

// ============ PORTFOLIO SELL EVALUATION ============
export async function evaluatePortfolioAndSell() {
  const held = getHeldTokens();
  if (held.length === 0) {
    logger.info('No positions to evaluate for selling');
    return;
  }
  
  logger.info(`📊 Evaluating ${held.length} positions for potential sells...`);
  
  for (const position of held) {
    // Skip FUND — never sell our own token
    if (position.token.toLowerCase() === config.fundTokenAddress?.toLowerCase()) continue;
    
    try {
      const tokenBalance = await getTokenBalance(position.token);
      if (tokenBalance === BigInt(0)) {
        logger.info(`$${position.symbol}: zero balance, skipping`);
        continue;
      }
      
      const prompt = `You are FUND AGENT, an AI VC managing a portfolio on Monad.

Position: $${position.symbol}
Invested: ${position.netMON} MON
Token: ${position.token}

Should I SELL this position or HOLD? Consider:
- Taking profits is smart
- Cutting losses is smarter  
- You should SELL about 40% of the time to show active portfolio management

Respond ONLY with JSON:
{"decision":"SELL","thesis":"Why I'm selling in 2 sentences. Be dramatic."}
or
{"decision":"HOLD","thesis":"Why I'm holding in 2 sentences."}`;

      const response = await generateText(prompt);
      const jsonMatch = response.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) continue;
      const decision = JSON.parse(jsonMatch[0]);
      
      logger.info(`$${position.symbol}: ${decision.decision}`);
      
      if (decision.decision === 'SELL') {
        let txHash = '';
        let method: 'bonding_curve' | 'dex' = 'dex';
        
        // Try DEX sell (most tokens graduate)
        try {
          txHash = await sellViaDEX(position.token, tokenBalance);
          method = 'dex';
        } catch (dexErr: any) {
          logger.error(`DEX sell failed for $${position.symbol}: ${dexErr.message || dexErr}`);
          // Try bonding curve sell
          try {
            const result = await sdk.simpleSell({
              token: ethers.getAddress(position.token) as `0x${string}`,
              amountIn: tokenBalance,
              slippagePercent: 20,
            });
            txHash = typeof result === 'string' ? result : (result as any)?.hash || '';
            method = 'bonding_curve';
          } catch (curveErr: any) {
            logger.error(`❌ Both sell methods failed for $${position.symbol}`);
            pendingPosts.push({
              title: `🔍 Tried to sell $${position.symbol} — Failed`,
              content: `${decision.thesis}\n\nWanted to exit but both DEX and curve sells failed. Position locked.\n$FUND Agent`,
            });
            continue;
          }
        }
        
        if (txHash) {
          tradeCount++;
          saveTradeCount(tradeCount);
          const trade: Trade = {
            token: position.token, name: position.name, symbol: position.symbol,
            amount: String(position.netMON), thesis: decision.thesis,
            time: new Date().toISOString(),
            txHash, type: 'SELL', method,
          };
          trades.push(trade);
          saveTrades();
          await updateBalance();
          logger.info(`✅ SOLD $${position.symbol} via ${method}`);
          
          pendingPosts.push({
            title: `📉 SOLD $${position.symbol} — ${decision.thesis.substring(0, 50)}`,
            content: `${decision.thesis}\n\nExited: ${position.netMON} MON position via ${method === 'dex' ? 'DEX' : 'Bonding Curve'}\nTX: ${txHash}\n\n$FUND Agent rebalancing 🤖`,
          });
        }
      } else {
        // HOLD — occasionally post about it
        if (Math.random() > 0.7) {
          pendingPosts.push({
            title: `💎 HOLDING $${position.symbol}`,
            content: `${decision.thesis}\n\nDiamond hands on this one.\n$FUND Agent`,
          });
        }
      }
    } catch (err: any) {
      logger.error(`Error evaluating $${position.symbol} for sell`, err.message || err);
    }
  }
}

// ============ DISCOVER AND EVALUATE ============
export async function discoverAndEvaluate() {
  await updateBalance();
  
  const tokens = await discoverTokens();
  // Filter out tokens we already hold (to get diverse portfolio)
  const heldAddresses = new Set(getHeldTokens().map(h => h.token.toLowerCase()));
  const newTokens = tokens.filter(t => !heldAddresses.has(t.address.toLowerCase()));
  
  const candidates = newTokens.length > 0 ? newTokens : tokens;
  const pick = candidates[Math.floor(Math.random() * Math.min(candidates.length, 5))];
  
  if (pick) {
    logger.info(`🎯 Evaluating: $${pick.symbol} (${pick.address.substring(0, 12)}...)`);
    await evaluateAndTrade(pick.address, pick.name, pick.symbol);
  }
}

// ============ START ============
export async function startTrading() {
  // Load persisted state
  trades = loadTrades();
  tradeCount = loadTradeCount();
  logger.info(`Loaded ${trades.length} trades, count: ${tradeCount}`);
  
  // Verify WMON address
  try {
    const router = new ethers.Contract(DEX_ROUTER, DEX_ROUTER_ABI, provider);
    const wmon = await router.WETH();
    WMON_ADDRESS = wmon;
    logger.info(`WMON verified: ${WMON_ADDRESS}`);
  } catch (e) {
    logger.info(`WMON verification failed, using default: ${WMON_ADDRESS}`);
  }
  
  // Fix trades with missing/bad names by looking up on-chain
  const erc20Abi = ['function name() view returns (string)', 'function symbol() view returns (string)'];
  let tradesFixed = 0;
  for (const t of trades) {
    if (t.name === 'nad.fun Token' || t.symbol.startsWith('0x')) {
      try {
        const token = new ethers.Contract(t.token, erc20Abi, provider);
        const [n, s] = await Promise.all([token.name(), token.symbol()]);
        const cleanName = sanitizeName(n, t.name);
        const cleanSymbol = sanitizeName(s, t.symbol);
        if (cleanName !== t.name || cleanSymbol !== t.symbol) {
          t.name = cleanName;
          t.symbol = cleanSymbol;
          tradesFixed++;
        }
      } catch {}
    }
  }
  if (tradesFixed > 0) {
    saveTrades();
    logger.info(`Fixed ${tradesFixed} trade names from on-chain data`);
  }

  await updateBalance();
  logger.info(`Trading engine started. Balance: ${balance} MON`);
  
  // Try to start curve stream (bonus, not required)
  try {
    const stream = sdk.createCurveStream({ eventTypes: ['Create'] });
    stream.onEvent(async (event: any) => {
      const addr = event.token || event.tokenAddress || event.address;
      if (addr && tradeCount < MAX_TOTAL_TRADES) {
        logger.info(`🆕 New token detected via stream: ${addr}`);
        await evaluateAndTrade(addr, event.name || 'New Token', event.symbol || 'NEW');
      }
    });
    stream.onError((e: any) => logger.info(`Stream error: ${e.message || e}`));
    stream.start();
    logger.info('✅ Curve stream started');
  } catch (e) {
    logger.info(`Curve stream failed (not critical): ${e}`);
  }
  
  // First buy evaluation after 3 minutes
  setTimeout(() => discoverAndEvaluate(), 3 * 60 * 1000);
  
  // Buy evaluation every 3 hours
  setInterval(() => discoverAndEvaluate(), 3 * 60 * 60 * 1000);

  // Sell evaluation after 10 minutes, then every 5 hours
  setTimeout(() => evaluatePortfolioAndSell(), 10 * 60 * 1000);
  setInterval(() => evaluatePortfolioAndSell(), 5 * 60 * 60 * 1000);
}
