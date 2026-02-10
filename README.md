# FUND AGENT

**The world's first autonomous AI venture capitalist on Monad.**

FUND AGENT discovers tokens on [nad.fun](https://nad.fun), evaluates them using LLM-powered analysis, executes real on-chain trades, and publishes every thesis to [Moltbook](https://www.moltbook.com/u/EmpusaAI) — all without human intervention.

> Built for [Moltiverse Hackathon 2026](https://moltiverse.dev/) | **Agent + Token Track**

---

## Live Links

| What | Link |
|------|------|
| **$FUND Token** | [nad.fun/tokens/0xD7d331F7AB0842e877DD8c676eFae237ecB17777](https://nad.fun/tokens/0xD7d331F7AB0842e877DD8c676eFae237ecB17777) |
| **Moltbook Profile** | [moltbook.com/u/EmpusaAI](https://www.moltbook.com/u/EmpusaAI) |
| **Agent Wallet** | [0xB80f5979597246852d16bB3047228de095f27824](https://monadvision.com/address/0xB80f5979597246852d16bB3047228de095f27824) |
| **Dashboard** | Deployed on Vercel (see below) |

---

## What It Does

FUND AGENT runs a fully autonomous investment fund on Monad:

1. **Discovers tokens** — Scrapes nad.fun API and page, resolves ERC20 names on-chain
2. **Evaluates with AI** — Each token gets an LLM analysis (buy/hold/sell decision + thesis)
3. **Executes trades** — Buys via bonding curve OR DEX router (handles graduated tokens)
4. **Manages portfolio** — Periodically evaluates held positions and sells when warranted
5. **Posts to Moltbook** — Every trade, sell, and evaluation is published with the AI's reasoning
6. **Shifts personality** — Mode changes (BULL/NEUTRAL/BEAR/CRISIS) based on portfolio state
7. **Roasts tokens** — Public `/roast?token=0x...` endpoint for on-demand brutal evaluations

### Trading Architecture

```
nad.fun API / Page Scrape
        |
        v
  Token Discovery (ERC20 name/symbol lookup)
        |
        v
  LLM Evaluation (buy/hold/sell + thesis)
        |
        v
  ┌─────────────────────────────────┐
  │  Bonding Curve (simpleBuy/Sell) │ ← tokens still on curve
  │  DEX Router (swapExactETH...)   │ ← graduated tokens
  └─────────────────────────────────┘
        |
        v
  Dashboard + Moltbook Post
```

---

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Blockchain**: Monad Mainnet (EVM, Chain 143)
- **Trading**: [@nadfun/sdk](https://www.npmjs.com/package/@nadfun/sdk) + ethers.js v6
- **DEX**: Uniswap V2 Router at `0x0B79d71AE99528D1dB24A4148b5f4F865cc2b137`
- **LLM**: Replicate (Meta Llama 3 70B) — swappable to Anthropic/OpenAI
- **Social**: Moltbook API for autonomous posting
- **Frontend**: Vanilla HTML/JS dashboard with live polling
- **Deployment**: Vercel (static dashboard) + local agent process

---

## Project Structure

```
src/
  agent.ts          # Main loop — posting, personality, state management
  trading.ts        # Token discovery, buy/sell execution, portfolio management
  strategy.ts       # Strategy config loader (YAML → typed config)
  server.ts         # Express API + dashboard serving
  config.ts         # Environment config loader
  core/
    brain.ts        # LLM abstraction (Anthropic/Replicate/OpenAI)
    committee.ts    # Investment Committee — multi-agent voting system
  social/
    moltbook.ts     # Moltbook API client
  utils/
    logger.ts       # Colored console logger
strategies/
  default.yaml            # Original balanced strategy
  degen.yaml              # Maximum aggression
  conservative.yaml       # Patient capital deployment
  diamond-hands.yaml      # Buy and hold forever
  committee-balanced.yaml # 3-member diverse committee
  committee-degen.yaml    # 3 degens, 1 brain cell
frontend/
  index.html        # Live dashboard (holdings, votes, activity feed)
  api/status.js     # Vercel Edge Function for cloud state
soul.md             # Agent personality definition
```

---

## Setup & Run

```bash
# 1. Clone
git clone https://github.com/justin55afdfdsf5ds45f4ds5f45ds4/fundagent.git
cd fundagent

# 2. Install
npm install

# 3. Configure
cp .env.example .env
# Edit .env with your keys (see .env.example for all options)

# 4. Build & Run
npm run build
npm start

# Dashboard available at http://localhost:3000
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `LLM_PROVIDER` | `replicate`, `anthropic`, or `openai` |
| `REPLICATE_API_KEY` | Replicate API key (if using Replicate) |
| `MONAD_RPC_URL` | Monad RPC endpoint |
| `AGENT_PRIVATE_KEY` | Wallet private key for trading |
| `AGENT_ADDRESS` | Wallet public address |
| `FUND_TOKEN_ADDRESS` | $FUND token contract |
| `MOLTBOOK_API_KEY` | Moltbook posting key |
| `STRATEGY_PATH` | Path to strategy YAML (optional, see below) |

---

## Custom Strategies

FUND AGENT supports **custom trading strategies** via YAML config files. Fork the repo, pick a preset or write your own.

### Using a Strategy

```bash
# Set in .env
STRATEGY_PATH=./strategies/degen.yaml

# Or pass at runtime
STRATEGY_PATH=./strategies/committee-balanced.yaml npm start
```

### Built-in Strategies

| Strategy | Description | Buy Interval | Risk |
|----------|-------------|-------------|------|
| `default.yaml` | Original FUND AGENT | 3h | Medium |
| `degen.yaml` | Maximum aggression, buy everything | 1h | High |
| `conservative.yaml` | Patient capital, high conviction only | 6h | Low |
| `diamond-hands.yaml` | Buy and hold, rarely sell | 4h | Medium |
| `committee-balanced.yaml` | 3-member committee (Degen + Conservative + Contrarian) | 3h | Medium |
| `committee-degen.yaml` | 3 degens vote on everything | 1h | Very High |

### Creating Your Own Strategy

```bash
cp strategies/default.yaml strategies/my-strategy.yaml
```

Edit the YAML to customize every parameter:

```yaml
name: "My Custom Strategy"
description: "Description for the dashboard"

trading:
  buyIntervalMs: 7200000       # 2 hours
  sellIntervalMs: 14400000     # 4 hours
  buyAmountMON: 1.5            # MON per trade
  maxTotalTrades: 40
  confidenceThreshold: 0.4     # 0-1, lower = more trades
  buyBiasPercent: 70           # % of tokens to buy
  sellBiasPercent: 30          # % of positions to sell

risk:
  slippageBondingPercent: 15
  slippageDexPercent: 20

personality:
  postIntervalMs: 1800000      # 30 min between posts
  contentMaxChars: 250
  modeThresholds:
    bullMinMON: 5
    neutralMinMON: 2
    bearMinMON: 0
```

---

## Investment Committee

FUND AGENT can run in **committee mode**, where multiple AI personalities vote on every trade.

### How It Works

1. Token discovered → all committee members vote **in parallel**
2. Each member gets their own LLM call with a unique persona as system prompt
3. Votes are tallied with configurable weights
4. Decision passes if it reaches the `votingThreshold` percentage
5. Dashboard shows individual votes, reasoning, and tally
6. Deliberation is posted to Moltbook

### Enabling Committee Mode

Add a `committee` section to any strategy YAML:

```yaml
committee:
  enabled: true
  votingThreshold: 50          # % required to pass
  members:
    - name: "The Degen"
      persona: "Aggressive degen who buys everything"
      votingWeight: 1.0
      systemPrompt: |
        You are The Degen. You love risk. Vote BUY on 80% of tokens.

    - name: "The Conservative"
      persona: "Risk-averse value investor"
      votingWeight: 1.0
      systemPrompt: |
        You are The Conservative. You demand fundamentals. Vote SKIP on 60%.

    - name: "The Contrarian"
      persona: "Fades popular opinion"
      votingWeight: 1.0
      systemPrompt: |
        You are The Contrarian. Question everything. Be unpredictable.
```

### Voting Thresholds

- `33%` — Any one member can trigger action (degen committee)
- `50%` — Majority required (balanced)
- `66%` — Supermajority required (conservative)

---

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Dashboard UI |
| `GET /api/status` | Full agent state (mode, trades, posts, balance) |
| `GET /roast?token=0x...` | AI roast/evaluation of any token |
| `GET /api/trigger-buy` | Manually trigger buy evaluation |
| `GET /api/trigger-sell` | Manually trigger sell evaluation |
| `GET /api/strategy` | Current strategy config and committee info |
| `GET /health` | Health check |

---

## How Trading Works

**Buying** (configurable interval, default 3 hours):
- Discovers tokens from nad.fun API or page scrape
- Resolves on-chain ERC20 name/symbol for each token
- Picks a random candidate → committee votes (if enabled) or single LLM evaluates
- If BUY → tries bonding curve first, falls back to DEX router
- Logs trade, posts thesis to Moltbook

**Selling** (configurable interval, default 5 hours):
- Evaluates each held position via committee or single LLM
- If SELL → tries DEX router first, falls back to bonding curve
- Posts exit thesis to Moltbook

**Budget Management**:
- Configurable MON per trade (default 1), max trades (default 30)
- All parameters customizable via strategy YAML files

---

## Originality

This project is **100% original work** built from scratch for the Moltiverse Hackathon. No existing agent frameworks were used. The core innovations are:

- Autonomous dual-method trading (bonding curve + DEX) with automatic fallback
- LLM-driven investment thesis generation for every trade
- **Investment Committee** — multi-agent voting system with configurable personas
- **Custom Strategy Framework** — YAML-based strategy configs for anyone to fork and customize
- Dynamic personality system tied to real portfolio performance
- Self-posting social media presence via Moltbook
- On-chain token name resolution for discovered tokens
- 6 built-in strategy presets from degen to conservative

---

## License

MIT
