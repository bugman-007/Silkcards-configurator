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
  private useProxy: boolean;

  constructor() {
    // Get from environment variables (Vite uses import.meta.env.VITE_*)
    // Vite only exposes variables prefixed with VITE_ to client code
    const envBaseUrl = import.meta.env.VITE_PARSER_BASE_URL;
    const envApiKey = import.meta.env.VITE_PARSER_API_KEY;
    
    // In production (HTTPS), use the proxy API route to avoid mixed content errors
    // The proxy will forward requests to the HTTP parser service
    const isProduction = window.location.protocol === 'https:';
    this.useProxy = isProduction && (!envBaseUrl || envBaseUrl.startsWith('http://'));
    
    if (this.useProxy) {
      // Use relative path to Vercel API route (same domain, HTTPS)
      this.baseUrl = '/api/parser-proxy';
      // API key is not needed for proxy (server-side handles it)
      this.apiKey = '';
    } else {
      // Development or if HTTPS parser service URL is provided
      this.baseUrl = envBaseUrl || 'http://localhost:8080';
      this.apiKey = envApiKey || '';
    }
    
    // Log configuration for debugging
    console.log('[ParserClient] Initialized with:', {
      baseUrl: this.baseUrl,
      useProxy: this.useProxy,
      hasApiKey: !!this.apiKey,
      envBaseUrl: envBaseUrl || '(not set - using default)',
      envApiKey: envApiKey ? '***' : '(not set)',
      allEnvKeys: Object.keys(import.meta.env).filter(k => k.startsWith('VITE_'))
    });
    
    // Warn if using defaults (only in development, not when using proxy)
    if (!this.useProxy && !envBaseUrl) {
      console.warn('[ParserClient] ⚠️ VITE_PARSER_BASE_URL not found in environment!');
      console.warn('[ParserClient] Current baseUrl:', this.baseUrl);
      console.warn('[ParserClient]');
      console.warn('[ParserClient] To fix:');
      console.warn('[ParserClient] 1. Create/update frontend/.env file with:');
      console.warn('[ParserClient]    VITE_PARSER_BASE_URL=https://silkcards-parser.duckdns.org');
      console.warn('[ParserClient]    VITE_PARSER_API_KEY=your-api-key-here');
      console.warn('[ParserClient] 2. Restart the Vite dev server (npm run dev)');
      console.warn('[ParserClient] 3. Vite only loads .env files on startup');
    } else if (this.useProxy) {
      console.log('[ParserClient] ✅ Using proxy API route (HTTPS -> HTTP handled server-side):', this.baseUrl);
    } else {
      console.log('[ParserClient] ✅ Using configured parser service:', this.baseUrl);
    }
  }

  /**
   * Upload file and start parsing
   */
  async uploadFile(
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<ParseJobResponse> {
    // Size threshold for direct upload (8MB)
    const LARGE_FILE_THRESHOLD = 8 * 1024 * 1024; // 8MB in bytes
    const isLargeFile = file.size > LARGE_FILE_THRESHOLD;
    
    // Check for direct URL override for large files
    const directUrl = import.meta.env.VITE_PARSER_DIRECT_URL;
    const useDirectForLarge = isLargeFile && !!directUrl;
    
    // Determine upload URL and API key handling
    let uploadUrl: string;
    let apiKeyToUse: string | undefined;
    let uploadMethod: 'proxy' | 'direct';
    
    if (useDirectForLarge) {
      // Large file: use direct URL (bypass proxy to avoid 413)
      uploadUrl = `${directUrl}/parse`;
      uploadMethod = 'direct';
      
      // Ensure API key is available for direct upload
      const directApiKey = import.meta.env.VITE_PARSER_API_KEY;
      if (!directApiKey) {
        throw new Error(
          'Large file upload requires VITE_PARSER_DIRECT_URL and VITE_PARSER_API_KEY. ' +
          'Set both environment variables and rebuild the frontend.'
        );
      }
      apiKeyToUse = directApiKey;
      
      console.log('[ParserClient] Large file detected, using direct URL:', uploadUrl, 'Size:', file.size, 'bytes');
    } else {
      // Normal file: use existing logic (proxy in production, direct in dev)
      uploadUrl = `${this.baseUrl}/parse`;
      uploadMethod = this.useProxy ? 'proxy' : 'direct';
      
      // If not using proxy, API key is required
      if (!this.useProxy && !this.apiKey) {
        throw new Error(
          'Missing API key for parser service. Set VITE_PARSER_API_KEY (Vite client env var) ' +
          'to match the parser backend API_KEY, then restart/rebuild the frontend.'
        );
      }
      apiKeyToUse = this.useProxy ? undefined : this.apiKey;
      
      console.log('[ParserClient] Uploading file to:', uploadUrl, 'Size:', file.size, 'bytes', uploadMethod === 'proxy' ? '(via proxy)' : '(direct)');
    }

    const formData = new FormData();
    formData.append('file', file);

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
        const targetUrl = useDirectForLarge ? directUrl : this.baseUrl;
        reject(new Error(
          `Cannot connect to parser service at ${targetUrl}. ` +
          `Please check:\n` +
          `1. Parser service is running (npm run dev in silkcards-parser/server)\n` +
          `2. VITE_PARSER_BASE_URL or VITE_PARSER_DIRECT_URL is set correctly in frontend/.env file\n` +
          `3. Firewall allows connections to the parser service port`
        ));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload aborted'));
      });

      // Start upload
      xhr.open('POST', uploadUrl);
      
      // Set headers - send API key for direct uploads (proxy handles it server-side)
      if (apiKeyToUse) {
        xhr.setRequestHeader('x-api-key', apiKeyToUse);
      }

      xhr.send(formData);
    });
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<ParseJobStatus> {
    // If not using proxy, API key is required
    // When using proxy, API key is handled server-side
    if (!this.useProxy && !this.apiKey) {
      throw new Error(
        'Missing API key for parser service. Set VITE_PARSER_API_KEY (Vite client env var) ' +
        'to match the parser backend API_KEY, then restart/rebuild the frontend.'
      );
    }

    const headers: HeadersInit = {};
    // Only send API key when not using proxy (proxy handles it server-side)
    if (!this.useProxy && this.apiKey) {
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

