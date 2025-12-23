/**
 * Vercel API Route: Parser Service Proxy (Streaming)
 * 
 * Proxies requests to the parser service to avoid mixed content errors.
 * Uses streaming to handle multipart/form-data uploads without parsing/buffering.
 * 
 * This handler accepts a query parameter 'path' to specify the target endpoint.
 * Example: /api/parser-proxy?path=parse
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

const PARSER_BASE_URL = process.env.PARSER_BASE_URL || 'https://silkcards-parser.duckdns.org';
const PARSER_API_KEY = process.env.PARSER_API_KEY || '';
const PROXY_TIMEOUT_MS = 300000; // 5 minutes for large file uploads

export default function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Log all incoming requests for debugging
  console.log(`[ParserProxy] Received ${req.method} request to ${req.url}`);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    return res.status(200).end();
  }

  // Ensure we support the requested method
  const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
  if (!allowedMethods.includes(req.method || '')) {
    console.error(`[ParserProxy] Method not allowed: ${req.method}`);
    res.status(405).json({ 
      error: 'Method not allowed',
      method: req.method,
      allowed: allowedMethods
    });
    return;
  }

  // Extract path from query parameter or URL
  let path = '';
  if (req.query.path) {
    path = Array.isArray(req.query.path) 
      ? req.query.path.join('/') 
      : req.query.path;
  } else if (req.url) {
    // Try to extract from URL: /api/parser-proxy/parse -> parse
    const urlMatch = req.url.match(/\/api\/parser-proxy\/(.+?)(?:\?|$)/);
    if (urlMatch) {
      path = urlMatch[1];
    }
  }
  
  // Construct the target URL
  const targetUrl = path ? `${PARSER_BASE_URL}/${path}` : PARSER_BASE_URL;
  
  console.log(`[ParserProxy] Streaming ${req.method} ${req.url} -> ${targetUrl}`, {
    path,
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length']
  });
  
  try {
    // Parse target URL
    const targetUrlObj = new URL(targetUrl);
    const isHttps = targetUrlObj.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    
    // Prepare headers for upstream request
    const upstreamHeaders: http.OutgoingHttpHeaders = {
      'x-api-key': PARSER_API_KEY,
    };
    
    // Forward important headers
    if (req.headers['content-type']) {
      upstreamHeaders['content-type'] = req.headers['content-type'];
    }
    if (req.headers['content-length']) {
      upstreamHeaders['content-length'] = req.headers['content-length'];
    }
    
    // Options for upstream request
    const upstreamOptions: http.RequestOptions = {
      hostname: targetUrlObj.hostname,
      port: targetUrlObj.port || (isHttps ? 443 : 80),
      path: targetUrlObj.pathname + targetUrlObj.search,
      method: req.method,
      headers: upstreamHeaders,
      timeout: PROXY_TIMEOUT_MS,
    };
    
    // Create upstream request
    const upstreamReq = httpModule.request(upstreamOptions, (upstreamRes) => {
      // Set response status
      res.status(upstreamRes.statusCode || 500);
      
      // Forward response headers
      const responseHeaders = upstreamRes.headers;
      let hasCacheControl = false;
      let hasContentType = false;
      
      for (const [key, value] of Object.entries(responseHeaders)) {
        if (value) {
          // Handle array values
          if (Array.isArray(value)) {
            res.setHeader(key, value);
          } else {
            res.setHeader(key, value);
          }
          
          // Track important headers
          if (key.toLowerCase() === 'cache-control') {
            hasCacheControl = true;
          }
          if (key.toLowerCase() === 'content-type') {
            hasContentType = true;
          }
        }
      }
      
      // For GET requests to assets, add caching headers if EC2 doesn't provide them
      if (req.method === 'GET' && path.includes('assets/')) {
        if (!hasCacheControl) {
          // Add long-term caching for static assets
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
      
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
      
      // Pipe upstream response to client response (streaming, no buffering)
      upstreamRes.pipe(res);
      
      // Handle upstream response errors
      upstreamRes.on('error', (error) => {
        console.error('[ParserProxy] Upstream response error:', error);
        if (!res.headersSent) {
          res.status(502).json({
            error: 'Bad Gateway',
            message: 'Error receiving response from parser service'
          });
        } else {
          // If headers already sent, destroy the response stream
          res.destroy();
        }
      });
    });
    
    // Handle upstream request errors
    upstreamReq.on('error', (error) => {
      console.error('[ParserProxy] Upstream request error:', error);
      if (!res.headersSent) {
        res.status(502).json({
          error: 'Bad Gateway',
          message: error.message || 'Failed to connect to parser service'
        });
      }
    });
    
    // Handle timeout
    upstreamReq.on('timeout', () => {
      console.error('[ParserProxy] Upstream request timeout');
      upstreamReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({
          error: 'Gateway Timeout',
          message: 'Parser service did not respond in time'
        });
      }
    });
    
    // Pipe incoming request body directly to upstream request
    // This streams the multipart data without parsing/buffering
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      // Vercel's req is a wrapper around Node's IncomingMessage
      // IncomingMessage is a readable stream, so we should be able to pipe it
      // Try to access the underlying stream
      const nodeReq = req as any;
      
      // Check if req itself is a readable stream (Node.js IncomingMessage)
      if (typeof nodeReq.pipe === 'function' && nodeReq.readable !== false) {
        // Pipe the request stream directly to upstream
        // This preserves the multipart boundary and streams without buffering
        nodeReq.pipe(upstreamReq);
        console.log('[ParserProxy] Piping request stream directly to upstream (streaming mode)');
      } else {
        // Fallback: try to access raw body stream
        const rawBody = nodeReq.rawBody || nodeReq.body;
        
        if (rawBody && typeof rawBody.pipe === 'function') {
          rawBody.pipe(upstreamReq);
          console.log('[ParserProxy] Piping raw body stream to upstream');
        } else if (rawBody && Buffer.isBuffer(rawBody)) {
          upstreamReq.write(rawBody);
          upstreamReq.end();
          console.log('[ParserProxy] Writing raw body buffer to upstream');
        } else {
          // If stream is not available, log warning and try fallback
          console.warn('[ParserProxy] Request stream not available - body may be truncated. Available:', {
            hasPipe: typeof nodeReq.pipe === 'function',
            readable: nodeReq.readable,
            hasRawBody: !!nodeReq.rawBody,
            hasBody: !!nodeReq.body
          });
          
          // Last resort: try to send what we have (may be incomplete/truncated)
          if (nodeReq.body) {
            if (Buffer.isBuffer(nodeReq.body)) {
              upstreamReq.write(nodeReq.body);
            } else {
              // This will likely fail for multipart, but it's better than nothing
              console.error('[ParserProxy] Body is not a buffer - multipart data will be corrupted');
            }
          }
          upstreamReq.end();
        }
      }
    } else {
      // GET/HEAD requests have no body
      upstreamReq.end();
    }
    
  } catch (error) {
    console.error('[ParserProxy] Error setting up proxy:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

