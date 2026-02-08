import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import { config, SOUL_MD } from '../config';
import { Logger } from '../utils/logger';

const logger = new Logger('BRAIN');

// Initialize Claude client (only if using Claude)
let anthropicClient: Anthropic | null = null;
if (config.llmProvider === 'anthropic' && config.anthropicApiKey) {
  anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey });
}

export async function think(systemPrompt: string, userMessage: string): Promise<string> {
  try {
    const provider = config.llmProvider || 'anthropic';

    switch (provider) {
      case 'anthropic':
        return await thinkAnthropic(systemPrompt, userMessage);
      
      case 'replicate':
        return await thinkReplicate(systemPrompt, userMessage);
      
      case 'openai':
        return await thinkOpenAI(systemPrompt, userMessage);
      
      default:
        throw new Error(`Unknown LLM provider: ${provider}`);
    }
  } catch (error) {
    logger.error('LLM call failed', error);
    throw error;
  }
}

async function thinkAnthropic(systemPrompt: string, userMessage: string): Promise<string> {
  if (!anthropicClient) {
    throw new Error('Anthropic client not initialized. Check ANTHROPIC_API_KEY');
  }

  const response = await anthropicClient.messages.create({
    model: config.model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  return response.content
    .filter(block => block.type === 'text')
    .map(block => (block as any).text)
    .join('\n');
}

async function thinkReplicate(systemPrompt: string, userMessage: string): Promise<string> {
  const response = await axios.post(
    'https://api.replicate.com/v1/predictions',
    {
      version: 'anthropic/claude-3.5-sonnet',
      input: {
        prompt: userMessage,
        max_tokens: 8192,
        system_prompt: systemPrompt,
        max_image_resolution: 0.5,
      },
    },
    {
      headers: {
        'Authorization': `Token ${config.replicateApiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  // Wait for completion
  let prediction = response.data;
  while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const statusResponse = await axios.get(prediction.urls.get, {
      headers: { 'Authorization': `Token ${config.replicateApiKey}` },
    });
    prediction = statusResponse.data;
  }

  if (prediction.status === 'failed') {
    throw new Error('Replicate prediction failed');
  }

  return Array.isArray(prediction.output) ? prediction.output.join('') : prediction.output;
}

async function thinkOpenAI(systemPrompt: string, userMessage: string): Promise<string> {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model: config.model || 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 1024,
      temperature: 0.7,
    },
    {
      headers: {
        'Authorization': `Bearer ${config.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data.choices[0].message.content;
}

export interface TokenEvaluation {
  action: 'BUY' | 'SELL' | 'HOLD' | 'AVOID';
  reasoning: string;
  confidence: number;
  thesis: string;
}

export async function evaluateToken(
  tokenData: any,
  personalityMode: string,
  prompt: string
): Promise<TokenEvaluation> {
  const raw = await think(SOUL_MD, prompt);
  
  // Parse JSON from response (handle markdown code blocks)
  const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
  
  try {
    return JSON.parse(cleaned);
  } catch (error) {
    logger.error('Failed to parse LLM response', { raw, error });
    throw new Error('Invalid LLM response format');
  }
}

export async function generateText(prompt: string): Promise<string> {
  return await think(SOUL_MD, prompt);
}
