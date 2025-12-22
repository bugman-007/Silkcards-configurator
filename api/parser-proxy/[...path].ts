/**
 * Vercel API Route: Parser Service Proxy
 * 
 * Proxies requests to the parser service to avoid mixed content errors.
 * Frontend makes HTTPS requests to this API route, which forwards to the HTTP parser service.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const PARSER_BASE_URL = process.env.PARSER_BASE_URL || 'http://54.198.104.149:8080';
const PARSER_API_KEY = process.env.PARSER_API_KEY || '';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    return res.status(200).end();
  }

  // Get the path from the catch-all route
  const path = Array.isArray(req.query.path) 
    ? req.query.path.join('/') 
    : req.query.path || '';
  
  // Construct the target URL
  const targetUrl = `${PARSER_BASE_URL}/${path}`;
  
  console.log(`[ParserProxy] Proxying ${req.method} ${req.url} -> ${targetUrl}`);
  
  try {
    // Prepare headers
    const headers: HeadersInit = {
      'x-api-key': PARSER_API_KEY,
    };
    
    // For file uploads (multipart/form-data), don't set Content-Type - let fetch set it with boundary
    // For other requests, forward Content-Type
    if (req.headers['content-type'] && !req.headers['content-type'].includes('multipart/form-data')) {
      headers['Content-Type'] = req.headers['content-type'];
    }
    
    // Prepare body
    let body: BodyInit | undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.headers['content-type']?.includes('multipart/form-data')) {
        // For file uploads, Vercel provides req.body as a buffer
        // We need to forward it as-is with the correct content-type header
        // Remove Content-Type from headers so fetch can set it with boundary
        delete headers['Content-Type'];
        body = req.body as any;
      } else if (req.body) {
        // For JSON or other content types, stringify if it's an object
        body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      }
    }
    
    // Forward the request to the parser service
    const proxyResponse = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: body as any,
    });
    
    // Get response data
    const contentType = proxyResponse.headers.get('content-type') || 'application/json';
    let data: any;
    
    if (contentType.includes('application/json')) {
      data = await proxyResponse.json();
    } else if (contentType.includes('text/')) {
      data = await proxyResponse.text();
    } else {
      // For binary data (like images), get as array buffer
      const buffer = await proxyResponse.arrayBuffer();
      data = Buffer.from(buffer);
    }
    
    // Forward status and headers
    res.status(proxyResponse.status);
    
    // Forward content-type
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    
    // Send response
    if (Buffer.isBuffer(data)) {
      res.send(data);
    } else if (contentType.includes('application/json')) {
      res.json(data);
    } else {
      res.send(data);
    }
  } catch (error) {
    console.error('[ParserProxy] Error proxying request:', error);
    res.status(500).json({ 
      error: 'Failed to proxy request to parser service',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

