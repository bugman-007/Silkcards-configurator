/**
 * Parser Client
 * 
 * Handles communication with the parser service API
 */

export interface ParseJobResponse {
  jobId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
}

export interface ParseJobStatus {
  jobId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  createdAt?: number;
  updatedAt?: number;
  sourceFilename?: string;
  error?: string;
  payload?: any; // ParserPayload when status is 'done'
}

/**
 * Parser Client
 * 
 * Communicates with the parser service API
 */
export class ParserClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    // Get from environment variables (Vite uses import.meta.env.VITE_*)
    // Vite only exposes variables prefixed with VITE_ to client code
    const envBaseUrl = import.meta.env.VITE_PARSER_BASE_URL;
    const envApiKey = import.meta.env.VITE_PARSER_API_KEY;
    
    // NEVER use proxy for uploads - always use direct parser service URL
    // Proxy is only used for asset downloads (handled by urlRewriter)
    // This avoids 413 FUNCTION_PAYLOAD_TOO_LARGE errors from Vercel serverless functions
    
    // Always use direct parser service URL
    // Default to HTTPS parser service in production, HTTP localhost in development
    if (envBaseUrl) {
      this.baseUrl = envBaseUrl;
    } else {
      // Default: use HTTPS parser service in production, localhost in development
      const isProduction = typeof window !== 'undefined' && window.location.protocol === 'https:';
      this.baseUrl = isProduction 
        ? 'https://silkcards-parser.duckdns.org'
        : 'http://localhost:8080';
    }
    
    this.apiKey = envApiKey || '';
    
    // Log configuration for debugging
    const isProduction = typeof window !== 'undefined' && window.location.protocol === 'https:';
    console.log('[ParserClient] Initialized with:', {
      baseUrl: this.baseUrl,
      hasApiKey: !!this.apiKey,
      envBaseUrl: envBaseUrl || '(not set - using default)',
      envApiKey: envApiKey ? '***' : '(not set)',
      isProduction,
      allEnvKeys: Object.keys(import.meta.env).filter(k => k.startsWith('VITE_'))
    });
    
    // Warn if using defaults
    if (!envBaseUrl) {
      console.warn('[ParserClient] ⚠️ VITE_PARSER_BASE_URL not found in environment!');
      console.warn('[ParserClient] Current baseUrl:', this.baseUrl);
      console.warn('[ParserClient]');
      if (isProduction) {
        console.warn('[ParserClient] To fix in Vercel:');
        console.warn('[ParserClient] 1. Go to Vercel project settings > Environment Variables');
        console.warn('[ParserClient] 2. Add: VITE_PARSER_BASE_URL=https://silkcards-parser.duckdns.org');
        console.warn('[ParserClient] 3. Add: VITE_PARSER_API_KEY=your-api-key-here');
        console.warn('[ParserClient] 4. Redeploy the application');
      } else {
        console.warn('[ParserClient] To fix locally:');
        console.warn('[ParserClient] 1. Create/update frontend/.env file with:');
        console.warn('[ParserClient]    VITE_PARSER_BASE_URL=https://silkcards-parser.duckdns.org');
        console.warn('[ParserClient]    VITE_PARSER_API_KEY=your-api-key-here');
        console.warn('[ParserClient] 2. Restart the Vite dev server (npm run dev)');
        console.warn('[ParserClient] 3. Vite only loads .env files on startup');
      }
    } else {
      console.log('[ParserClient] ✅ Using configured parser service:', this.baseUrl);
    }
    
    if (!this.apiKey) {
      if (isProduction) {
        console.error('[ParserClient] ❌ VITE_PARSER_API_KEY not set in Vercel environment variables!');
        console.error('[ParserClient] This will cause uploads to fail.');
        console.error('[ParserClient]');
        console.error('[ParserClient] IMPORTANT: Vite only exposes variables prefixed with VITE_ to client code.');
        console.error('[ParserClient] You need to add VITE_PARSER_API_KEY (not PARSER_API_KEY) to Vercel.');
        console.error('[ParserClient]');
        console.error('[ParserClient] Steps to fix:');
        console.error('[ParserClient] 1. Go to Vercel project settings > Environment Variables');
        console.error('[ParserClient] 2. Add: VITE_PARSER_API_KEY=<your-api-key-value>');
        console.error('[ParserClient] 3. Add: VITE_PARSER_BASE_URL=https://silkcards-parser.duckdns.org');
        console.error('[ParserClient] 4. Redeploy the application');
      } else {
        console.warn('[ParserClient] ⚠️ VITE_PARSER_API_KEY not set - uploads may fail');
      }
    }
  }

  /**
   * Upload file and start parsing
   * 
   * IMPORTANT: Always uploads directly to parser service (never via proxy)
   * to avoid Vercel serverless function payload size limits (413 errors).
   * Proxy is only used for asset downloads (handled by urlRewriter).
   */
  async uploadFile(
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<ParseJobResponse> {
    // API key is always required for direct uploads
    if (!this.apiKey) {
      const isProduction = typeof window !== 'undefined' && window.location.protocol === 'https:';
      const errorMsg = isProduction
        ? 'Missing API key for parser service.\n\n' +
          'In Vercel, you need to add VITE_PARSER_API_KEY (not PARSER_API_KEY) to environment variables.\n' +
          'Vite only exposes variables prefixed with VITE_ to client code.\n\n' +
          'Steps to fix:\n' +
          '1. Go to Vercel project settings > Environment Variables\n' +
          '2. Add: VITE_PARSER_API_KEY=<your-api-key-value>\n' +
          '3. Add: VITE_PARSER_BASE_URL=https://silkcards-parser.duckdns.org\n' +
          '4. Redeploy the application'
        : 'Missing API key for parser service. Set VITE_PARSER_API_KEY (Vite client env var) ' +
          'to match the parser backend API_KEY, then restart/rebuild the frontend.';
      throw new Error(errorMsg);
    }

    const formData = new FormData();
    formData.append('file', file);

    // Always use direct parser service URL (never proxy)
    const url = `${this.baseUrl}/parse`;
    console.log('[ParserClient] Uploading file directly to:', url, 'Size:', file.size, 'bytes (direct, no proxy)');

    return new Promise<ParseJobResponse>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Track upload progress
      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            onProgress(percent);
          }
        });
      }

      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result: ParseJobResponse = JSON.parse(xhr.responseText);
            resolve(result);
          } catch (e) {
            reject(new Error('Failed to parse response'));
          }
        } else {
          const body = (xhr.responseText || '').trim();
          reject(new Error(
            `Parser upload failed: ${xhr.status} ${xhr.statusText}` +
            (body ? ` - ${body}` : '')
          ));
        }
      });

      // Handle errors
      xhr.addEventListener('error', () => {
        reject(new Error(
          `Cannot connect to parser service at ${this.baseUrl}. ` +
          `Please check:\n` +
          `1. Parser service is running (npm run dev in silkcards-parser/server)\n` +
          `2. VITE_PARSER_BASE_URL is set correctly in frontend/.env file\n` +
          `3. Firewall allows connections to the parser service port`
        ));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload aborted'));
      });

      // Start upload
      xhr.open('POST', url);
      
      // Always send API key for direct uploads
      if (this.apiKey) {
        xhr.setRequestHeader('x-api-key', this.apiKey);
      }

      xhr.send(formData);
    });
  }

  /**
   * Get job status
   * 
   * Always uses direct parser service URL (never via proxy)
   */
  async getJobStatus(jobId: string): Promise<ParseJobStatus> {
    // API key is always required for direct requests
    if (!this.apiKey) {
      const isProduction = typeof window !== 'undefined' && window.location.protocol === 'https:';
      const errorMsg = isProduction
        ? 'Missing API key for parser service.\n\n' +
          'In Vercel, you need to add VITE_PARSER_API_KEY (not PARSER_API_KEY) to environment variables.\n' +
          'Vite only exposes variables prefixed with VITE_ to client code.\n\n' +
          'Steps to fix:\n' +
          '1. Go to Vercel project settings > Environment Variables\n' +
          '2. Add: VITE_PARSER_API_KEY=<your-api-key-value>\n' +
          '3. Add: VITE_PARSER_BASE_URL=https://silkcards-parser.duckdns.org\n' +
          '4. Redeploy the application'
        : 'Missing API key for parser service. Set VITE_PARSER_API_KEY (Vite client env var) ' +
          'to match the parser backend API_KEY, then restart/rebuild the frontend.';
      throw new Error(errorMsg);
    }

    const headers: HeadersInit = {};
    // Always send API key for direct requests
    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }

    const response = await fetch(`${this.baseUrl}/parse/${jobId}`, {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Job not found: ${jobId}`);
      }
      const errorText = await response.text();
      throw new Error(`Failed to get job status: ${response.status} ${errorText}`);
    }

    const result: ParseJobStatus = await response.json();
    return result;
  }

  /**
   * Poll job status until done or failed
   */
  async pollJobStatus(
    jobId: string,
    onStatusUpdate?: (status: ParseJobStatus) => void,
    pollInterval: number = 2000,
    maxAttempts: number = 150, // 5 minutes max (150 * 2s = 300s)
    abortSignal?: AbortSignal
  ): Promise<ParseJobStatus> {
    let attempts = 0;

    while (attempts < maxAttempts) {
      // Check if aborted
      if (abortSignal?.aborted) {
        throw new Error('Polling aborted');
      }

      const status = await this.getJobStatus(jobId);
      
      if (onStatusUpdate) {
        onStatusUpdate(status);
      }

      if (status.status === 'done') {
        return status;
      }

      if (status.status === 'failed') {
        throw new Error(status.error || 'Parser job failed');
      }

      // Wait before next poll (with abort support)
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(resolve, pollInterval);
        abortSignal?.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new Error('Polling aborted'));
        });
      });
      
      attempts++;
    }

    throw new Error(`Parser job timed out after ${maxAttempts} attempts`);
  }
}

