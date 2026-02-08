export class Logger {
  private prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  info(message: string, data?: any) {
    console.log(`[${new Date().toISOString()}] [${this.prefix}] ${message}`, data || '');
  }

  error(message: string, error?: any) {
    console.error(`[${new Date().toISOString()}] [${this.prefix}] ERROR: ${message}`, error || '');
  }

  warn(message: string, data?: any) {
    console.warn(`[${new Date().toISOString()}] [${this.prefix}] WARN: ${message}`, data || '');
  }
}
