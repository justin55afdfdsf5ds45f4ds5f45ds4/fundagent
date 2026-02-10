import axios from 'axios';
import { config } from '../config';
import { Logger } from '../utils/logger';

const logger = new Logger('MOLTBOOK');

// Real Moltbook API endpoint
const MOLTBOOK_API_BASE = 'https://www.moltbook.com/api/v1';

export class MoltbookClient {
  private apiKey: string;
  private verificationCode: string = 'seabed-6YDS';
  private verified: boolean = false;

  constructor() {
    this.apiKey = config.moltbookApiKey;
  }

  async verify(): Promise<boolean> {
    try {
      logger.info('Attempting verification with Moltbook...');
      const response = await axios.post(
        `${MOLTBOOK_API_BASE}/verify`,
        { verification_code: this.verificationCode },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );
      logger.info('Verification response:', response.data);
      this.verified = true;
      return true;
    } catch (error: any) {
      logger.error('Verification failed:', error.response?.data || error.message);
      return false;
    }
  }

  async post(content: string, title: string = 'Fund Agent Update'): Promise<string> {
    try {
      logger.info('Posting to Moltbook...');

      const response = await axios.post(
        `${MOLTBOOK_API_BASE}/posts`,
        {
          submolt: 'general',
          title: title,
          content: content
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const postId = response.data.post?.id || response.data.id;
      logger.info(`Posted successfully: ${postId}`);
      logger.info(`View at: https://www.moltbook.com/post/${postId}`);
      return postId;
    } catch (error: any) {
      const errData = error.response?.data;
      const hint = errData?.hint || errData?.error || '';

      // Auto-verify on suspension or verification challenge
      if (hint.includes('suspended') || hint.includes('verification') || hint.includes('challenge') || error.response?.status === 401 || error.response?.status === 403) {
        if (!this.verified) {
          logger.warn('Post blocked — attempting auto-verification...');
          const ok = await this.verify();
          if (ok) {
            logger.info('Verified! Retrying post...');
            // Wait a moment then retry once
            await new Promise(r => setTimeout(r, 2000));
            try {
              const retry = await axios.post(
                `${MOLTBOOK_API_BASE}/posts`,
                { submolt: 'general', title, content },
                { headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' } }
              );
              const retryId = retry.data.post?.id || retry.data.id;
              logger.info(`Retry posted successfully: ${retryId}`);
              return retryId;
            } catch (retryErr: any) {
              logger.error('Retry also failed:', retryErr.response?.data || retryErr.message);
              throw retryErr;
            }
          }
        }
      }

      logger.error('Failed to post to Moltbook', errData || error.message);
      throw error;
    }
  }

  async reply(postId: string, content: string): Promise<string> {
    try {
      logger.info(`Replying to post ${postId}...`);
      
      const response = await axios.post(
        `${MOLTBOOK_API_BASE}/posts/${postId}/comments`,
        { content },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const commentId = response.data.id || response.data.comment_id;
      logger.info(`Replied successfully: ${commentId}`);
      return commentId;
    } catch (error: any) {
      logger.error('Failed to reply on Moltbook', error.response?.data || error.message);
      throw error;
    }
  }

  async getPost(postId: string): Promise<any> {
    try {
      const response = await axios.get(
        `${MOLTBOOK_API_BASE}/posts/${postId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        }
      );

      return response.data;
    } catch (error: any) {
      logger.error('Failed to get post', error.response?.data || error.message);
      return null;
    }
  }

  async getMentions(): Promise<Array<{ id: string; content: string; author: string }>> {
    try {
      // Note: Moltbook may not have a mentions endpoint
      // This is a placeholder - check actual API docs
      logger.warn('getMentions not implemented - check Moltbook API docs');
      return [];
    } catch (error) {
      logger.error('Failed to get mentions', error);
      return [];
    }
  }
}
