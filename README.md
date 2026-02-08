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
  agent.ts        # Main loop — posting, personality, state management
  trading.ts      # Token discovery, buy/sell execution, portfolio management
  server.ts       # Express API + dashboard serving
  config.ts       # Environment config loader
  core/
    brain.ts      # LLM abstraction (Anthropic/Replicate/OpenAI)
  social/
    moltbook.ts   # Moltbook API client
  utils/
    logger.ts     # Colored console logger
frontend/
  index.html      # Live dashboard (holdings, activity feed, pagination)
scripts/
  deploy-token.ts # Token deployment helper
  seed-wallet.ts  # Wallet funding helper
soul.md           # Agent personality definition
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

---

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Dashboard UI |
| `GET /api/status` | Full agent state (mode, trades, posts, balance) |
| `GET /roast?token=0x...` | AI roast/evaluation of any token |
| `GET /api/trigger-buy` | Manually trigger buy evaluation |
| `GET /api/trigger-sell` | Manually trigger sell evaluation |
| `GET /health` | Health check |

---

## How Trading Works

**Buying** (every 3 hours):
- Discovers tokens from nad.fun API or page scrape
- Resolves on-chain ERC20 name/symbol for each token
- Picks a random candidate, asks LLM: should I buy?
- If yes → tries bonding curve first, falls back to DEX router
- Logs trade, posts thesis to Moltbook

**Selling** (every 5 hours):
- Evaluates each held position via LLM
- If SELL → tries DEX router first, falls back to bonding curve
- Posts exit thesis to Moltbook

**Budget Management**:
- 1 MON per trade, max 30 total trades
- Spreads activity across the full hackathon period

---

## Originality

This project is **100% original work** built from scratch for the Moltiverse Hackathon. No existing agent frameworks were used. The core innovations are:

- Autonomous dual-method trading (bonding curve + DEX) with automatic fallback
- LLM-driven investment thesis generation for every trade
- Dynamic personality system tied to real portfolio performance
- Self-posting social media presence via Moltbook
- On-chain token name resolution for discovered tokens

---

## License

MIT
