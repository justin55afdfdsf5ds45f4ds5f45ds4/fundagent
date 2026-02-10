import express from 'express';
import path from 'path';
import { Logger } from './utils/logger';
import { evaluatePortfolioAndSell, discoverAndEvaluate } from './trading';
import { strategy } from './strategy';

const logger = new Logger('SERVER');
const app = express();
const PORT = process.env.PORT || 3000;

let agent: any = null;

export function startServer(fundAgent: any) {
  agent = fundAgent;

  // Serve static frontend
  app.use(express.static(path.join(__dirname, '../frontend')));

  app.get('/roast', async (req, res) => {
    const token = req.query.token as string;
    
    if (!token) {
      return res.status(400).json({ error: 'Missing token parameter' });
    }

    if (!agent) {
      return res.status(503).json({ error: 'Agent not ready' });
    }

    try {
      const roast = await agent.roast(token);
      res.json({ roast });
    } catch (error) {
      logger.error('Roast request failed', error);
      res.status(500).json({ error: 'Failed to roast token' });
    }
  });

  app.get('/api/status', async (req, res) => {
    if (!agent) {
      return res.status(503).json({ error: 'Agent not ready' });
    }

    try {
      const status = await agent.getStatus();
      res.json({
        status: 'running',
        ...status,
      });
    } catch (error) {
      logger.error('Status request failed', error);
      res.status(500).json({ error: 'Failed to get status' });
    }
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', agent: agent ? 'running' : 'not ready' });
  });

  app.get('/api/trigger-sell', async (req, res) => {
    try {
      logger.info('Manual sell evaluation triggered');
      evaluatePortfolioAndSell();
      res.json({ status: 'ok', message: 'Sell evaluation started' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/strategy', (req, res) => {
    res.json({
      name: strategy.name,
      description: strategy.description,
      trading: strategy.trading,
      risk: strategy.risk,
      personality: { postIntervalMs: strategy.personality.postIntervalMs, modeThresholds: strategy.personality.modeThresholds },
      committeeEnabled: strategy.committee?.enabled || false,
      committeeMembers: strategy.committee?.members?.map(m => ({ name: m.name, persona: m.persona, weight: m.votingWeight })) || [],
    });
  });

  app.get('/api/trigger-buy', async (req, res) => {
    try {
      logger.info('Manual buy evaluation triggered');
      discoverAndEvaluate();
      res.json({ status: 'ok', message: 'Buy evaluation started' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  const server = app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
    logger.info(`Dashboard: http://localhost:${PORT}`);
    logger.info(`Roast endpoint: http://localhost:${PORT}/roast?token=0x...`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn(`Port ${PORT} in use, trying ${Number(PORT) + 1}...`);
      app.listen(Number(PORT) + 1, () => {
        logger.info(`Server running on http://localhost:${Number(PORT) + 1}`);
        logger.info(`Dashboard: http://localhost:${Number(PORT) + 1}`);
      });
    } else {
      logger.error('Server error', err);
    }
  });
}
