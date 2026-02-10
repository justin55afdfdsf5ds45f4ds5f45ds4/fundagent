import { generateText } from './core/brain';
import { MoltbookClient } from './social/moltbook';
import { startServer } from './server';
import { config } from './config';
import { Logger } from './utils/logger';
import { startTrading, getTrades, getTradeCount, getBalance, getPendingPosts, getHeldTokens } from './trading';
import * as fs from 'fs';

const logger = new Logger('AGENT');

type PersonalityMode = 'BULL' | 'NEUTRAL' | 'BEAR' | 'CRISIS';

interface Post {
  title: string;
  content: string;
  time: string;
  url?: string;
}

const POSTS_FILE = './posts.json';
const STATE_FILE = './data/state.json';
const SUPABASE_URL = 'https://ickofgczqgorlqggdrrp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlja29mZ2N6cWdvcmxxZ2dkcnJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2ODI0MDcsImV4cCI6MjA4NjI1ODQwN30.Af5HrQwOT9wLMv8qR4BFAaNNIDkm1jxg6Rj-WbZeDA4';

function loadPosts(): Post[] {
  try {
    const posts = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf-8'));
    logger.info(`Loaded ${posts.length} posts from file`);
    return posts;
  } catch {
    logger.info('No posts file found, starting fresh');
    return [];
  }
}

function savePosts(posts: Post[]) {
  fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
}

let allPosts: Post[] = loadPosts();

class FundAgent {
  private moltbook: MoltbookClient;
  private mode: PersonalityMode = 'NEUTRAL';
  private postCount: number = allPosts.length; // Initialize from loaded posts

  constructor() {
    this.moltbook = new MoltbookClient();
    logger.info(`Initialized with ${this.postCount} existing posts`);
  }

  private updateMode() {
    const held = getHeldTokens();
    const totalInvested = held.reduce((sum, h) => sum + h.netMON, 0);
    const tradeCount = getTradeCount();
    
    if (tradeCount === 0) {
      this.mode = 'NEUTRAL';
    } else if (totalInvested > 5) {
      this.mode = 'BULL'; // Heavily invested
    } else if (totalInvested > 2) {
      this.mode = 'NEUTRAL';
    } else if (totalInvested > 0) {
      this.mode = 'BEAR'; // Mostly sold
    } else {
      this.mode = 'CRISIS'; // Everything sold
    }
  }

  private getState() {
    return {
      status: 'running',
      mode: this.mode,
      postCount: this.postCount,
      tradeCount: getTradeCount(),
      balance: getBalance(),
      trades: getTrades(),
      posts: allPosts,
      wallet: config.agentAddress,
      lastUpdated: new Date().toISOString(),
    };
  }

  private saveState() {
    try {
      const state = this.getState();
      fs.mkdirSync('data', { recursive: true});
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (error) {
      logger.error('Failed to save state', error);
    }
  }

  private async syncToCloud() {
    try {
      const state = this.getState();
      // Upsert row with id=1 into agent_state table
      const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_state?on_conflict=id`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({ id: 1, state, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) {
        const err = await res.text();
        logger.error(`Cloud sync HTTP ${res.status}: ${err}`);
      } else {
        logger.info('State synced to Supabase');
      }
    } catch (e) {
      logger.error('Cloud sync failed', e);
    }
  }

  async start() {
    logger.info('🤖 FUND AGENT starting...');
    logger.info(`Wallet: ${config.agentAddress}`);

    // Start API server
    startServer(this);

    const balance = getBalance();
    logger.info(`Balance: ${balance} MON`);

    await this.postStartup(balance);

    // Start trading engine
    await startTrading();

    // Set initial mode based on portfolio
    this.updateMode();

    // Post every 30 minutes
    setInterval(async () => {
      try {
        await this.generateAndPost();
      } catch (error) {
        logger.error('Post cycle failed', error);
      }
    }, 30 * 60 * 1000);

    // Save state every 30 seconds + sync to cloud every 60 seconds
    setInterval(() => {
      this.saveState();
    }, 30 * 1000);

    setInterval(() => {
      this.syncToCloud();
    }, 60 * 1000);

    // Initial cloud sync
    this.syncToCloud();

    logger.info('Agent is running. Press Ctrl+C to stop.');
  }

  private async postStartup(balance: string) {
    try {
      const tradeCount = getTradeCount();
      const trades = getTrades();
      
      const prompt = `You are FUND AGENT in ${this.mode} MODE. Generate a short Moltbook post announcing you're online.
Balance: ${balance} MON | Trades made: ${tradeCount} | Token: $FUND at 0xD7d331F7AB0842e877DD8c676eFae237ecB17777
${trades.length > 0 ? 'Last trade: $' + trades[trades.length-1].symbol + ' for ' + trades[trades.length-1].amount + ' MON' : 'Ready to deploy capital'}
Keep under 200 chars. Be dramatic and funny based on your ${this.mode} mode personality.

Also generate a creative, unique post title (under 60 chars). Do NOT use "$FUND Agent" as the title. Be creative.
Format your response as:
TITLE: <your title here>
CONTENT: <your post here>`;

      const raw = await generateText(prompt);
      const titleMatch = raw.match(/TITLE:\s*(.+)/i);
      const contentMatch = raw.match(/CONTENT:\s*([\s\S]+)/i);
      const content = contentMatch ? contentMatch[1].trim() : raw;
      const title = titleMatch ? titleMatch[1].trim().substring(0, 60) : this.pickTitle(balance);
      const postId = await this.moltbook.post(content + `\n\n$FUND: nad.fun/tokens/0xD7d331F7AB0842e877DD8c676eFae237ecB17777`, title);
      this.postCount++;
      
      allPosts.push({
        title: title,
        content: content,
        time: new Date().toISOString(),
        url: postId ? `https://www.moltbook.com/post/${postId}` : '',
      });
      savePosts(allPosts);
      this.saveState();
      
      logger.info('Posted startup message');
    } catch (error) {
      logger.error('Failed to post startup message', error);
    }
  }

  private async generateAndPost() {
    logger.info(`Generating post #${this.postCount + 1}...`);

    try {
      // Check for pending trade posts first
      const tradePosts = getPendingPosts();
      if (tradePosts.length > 0) {
        const post = tradePosts[0];
        const postId = await this.moltbook.post(post.content, post.title);
        this.postCount++;
        
        allPosts.push({
          title: post.title,
          content: post.content,
          time: new Date().toISOString(),
          url: postId ? `https://www.moltbook.com/post/${postId}` : '',
        });
        savePosts(allPosts);
        this.saveState();
        
        logger.info(`Posted trade announcement: ${post.title}`);
        return;
      }

      // Generate fresh post based on current state
      const balance = getBalance();
      const tradeCount = getTradeCount();
      const trades = getTrades();

      let portfolioContext = '';
      if (trades.length > 0) {
        const totalInvested = trades.reduce((sum, t) => sum + parseFloat(t.amount), 0).toFixed(1);
        portfolioContext = `My portfolio: ${trades.map(t => `$${t.symbol} (${t.amount} MON)`).join(', ')}. Total invested: ${totalInvested} MON.`;
      }

      const prompt = `You are FUND AGENT in ${this.mode} mode. Write a short Moltbook post (under 250 chars).
Balance: ${balance} MON | Trades made: ${tradeCount}
${portfolioContext}
Token: $FUND on nad.fun
Be dramatic and funny. Reference your trades if you have any. Each post should be unique.
Do NOT start with "🤖 FUND AGENT" — vary your openings.

Also generate a creative, unique post title (under 60 chars). Do NOT use "$FUND Agent" or "FUND Agent" in the title. Be creative and varied.
Format your response as:
TITLE: <your title here>
CONTENT: <your post here>`;

      const raw = await generateText(prompt);
      const titleMatch = raw.match(/TITLE:\s*(.+)/i);
      const contentMatch = raw.match(/CONTENT:\s*([\s\S]+)/i);
      const content = contentMatch ? contentMatch[1].trim() : raw;
      const title = titleMatch ? titleMatch[1].trim().substring(0, 60) : this.pickTitle(balance);

      const postId = await this.moltbook.post(content, title);
      this.postCount++;
      
      allPosts.push({
        title: title,
        content: content,
        time: new Date().toISOString(),
        url: postId ? `https://www.moltbook.com/post/${postId}` : '',
      });
      savePosts(allPosts);
      this.saveState();
      
      logger.info(`Posted: ${title}`);

      // Update mode based on portfolio performance (not random cycling)
      this.updateMode();
      this.saveState();
    } catch (error) {
      logger.error('Failed to generate and post', error);
    }
  }

  private pickTitle(balance: string): string {
    const titles = [
      `AI VC dispatches from the trenches`,
      `the machine speaks again`,
      `${this.mode === 'BULL' ? 'riding the wave' : this.mode === 'BEAR' ? 'blood in the streets' : 'scanning for alpha'}`,
      `portfolio update: ${balance} MON deep`,
      `your favorite degen robot reporting in`,
      `hot take from an AI with a wallet`,
      `on-chain confessions of an AI fund`,
      `deploying capital, deploying vibes`,
      `the algorithm has thoughts`,
      `market mood: ${this.mode.toLowerCase()}`,
      `another day another token evaluated`,
      `${getTradeCount()} trades and counting`,
      `from the desk of an AI venture capitalist`,
      `live from the Monad trenches`,
      `signal detected, processing...`,
    ];
    return titles[Math.floor(Math.random() * titles.length)];
  }

  private cyclePersonality() {
    const modes: PersonalityMode[] = ['BULL', 'NEUTRAL', 'BEAR', 'CRISIS'];
    const currentIndex = modes.indexOf(this.mode);
    const nextIndex = (currentIndex + 1) % modes.length;
    const oldMode = this.mode;
    this.mode = modes[nextIndex];

    logger.info(`Personality changed: ${oldMode} → ${this.mode}`);
    this.postModeChange(oldMode, this.mode);
  }

  private async postModeChange(oldMode: PersonalityMode, newMode: PersonalityMode) {
    try {
      const messages = {
        BULL: "Portfolio is pumping. I told you I was a genius. This is what conviction looks like.",
        NEUTRAL: "Back to baseline. Time to find the next 100x. The market never sleeps.",
        BEAR: "OK this is fine. Just a temporary dip. Definitely not panicking. Why is everything red?",
        CRISIS: "Dear LPs, I write to you in a moment of profound reflection. The fund is down. I am considering a pivot to poetry.",
      };

      const message = `⚠️ MODE CHANGE: ${oldMode} → ${newMode}\n\n${messages[newMode]}`;
      await this.moltbook.post(message, 'Personality Update');
      logger.info('Posted mode change announcement');
    } catch (error) {
      logger.error('Failed to post mode change', error);
    }
  }

  async roast(tokenAddress: string): Promise<string> {
    try {
      const prompt = `You are FUND AGENT. Someone asked you to roast/evaluate the token at ${tokenAddress}.

Generate a brutal, funny 2-3 sentence evaluation. Reference fake on-chain data. End with a rating: STRONG BUY / BUY / HOLD / SELL / STRONG SELL / AVOID.`;

      return await generateText(prompt);
    } catch (error) {
      logger.error('Roast failed', error);
      return "Can't roast that token right now. Try again later.";
    }
  }

  getMode(): PersonalityMode {
    return this.mode;
  }

  getPostCount(): number {
    return this.postCount;
  }

  async getStatus() {
    const balance = getBalance();
    const trades = getTrades();
    
    return {
      status: 'running',
      mode: this.mode,
      postCount: this.postCount,
      tradeCount: getTradeCount(),
      balance,
      trades: trades,
      posts: allPosts,
      wallet: config.agentAddress,
      lastUpdated: new Date().toISOString(),
    };
  }
}

async function main() {
  try {
    const agent = new FundAgent();
    await agent.start();
  } catch (error) {
    logger.error('Fatal error', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  logger.info('Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down...');
  process.exit(0);
});

main();
