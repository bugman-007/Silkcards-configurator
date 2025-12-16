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
    
    this.baseUrl = envBaseUrl || 'http://localhost:8080';
    this.apiKey = envApiKey || '';
    
    // Log configuration for debugging
    console.log('[ParserClient] Initialized with:', {
      baseUrl: this.baseUrl,
      hasApiKey: !!this.apiKey,
      envBaseUrl: envBaseUrl || '(not set - using default)',
      envApiKey: envApiKey ? '***' : '(not set)',
      allEnvKeys: Object.keys(import.meta.env).filter(k => k.startsWith('VITE_'))
    });
    
    // Warn if using defaults
    if (!envBaseUrl) {
      console.error('[ParserClient] ⚠️ VITE_PARSER_BASE_URL not found in environment!');
      console.error('[ParserClient] Current baseUrl:', this.baseUrl);
      console.error('[ParserClient]');
      console.error('[ParserClient] To fix:');
      console.error('[ParserClient] 1. Create/update frontend/.env file with:');
      console.error('[ParserClient]    VITE_PARSER_BASE_URL=http://54.198.104.149:8080');
      console.error('[ParserClient]    VITE_PARSER_API_KEY=your-api-key-here');
      console.error('[ParserClient] 2. Restart the Vite dev server (npm run dev)');
      console.error('[ParserClient] 3. Vite only loads .env files on startup');
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
    const formData = new FormData();
    formData.append('file', file);

    const url = `${this.baseUrl}/parse`;
    console.log('[ParserClient] Uploading file to:', url, 'Size:', file.size, 'bytes');

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
          reject(new Error(`Parser upload failed: ${xhr.status} ${xhr.statusText}`));
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
      
      // Set headers
      if (this.apiKey) {
        xhr.setRequestHeader('x-api-key', this.apiKey);
      }

      xhr.send(formData);
    });
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<ParseJobStatus> {
    const headers: HeadersInit = {};
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

