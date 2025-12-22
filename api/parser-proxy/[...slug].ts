/**
 * Vercel API Route: Parser Service Proxy (Catch-all)
 * 
 * Proxies requests to the parser service to avoid mixed content errors.
 * Frontend makes HTTPS requests to this API route, which forwards to the HTTP parser service.
 * 
 * Route: /api/parser-proxy/*
 * This catch-all route handles all sub-paths like /api/parser-proxy/parse, /api/parser-proxy/parse/jobId, etc.
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

  // Get the path from the catch-all route parameter
  // Vercel passes it as req.query.slug (or the parameter name)
  const slug = req.query.slug;
  const path = Array.isArray(slug) 
    ? slug.join('/') 
    : (slug || '');
  
  // Construct the target URL
  const targetUrl = path ? `${PARSER_BASE_URL}/${path}` : PARSER_BASE_URL;
  
  console.log(`[ParserProxy] Proxying ${req.method} ${req.url} -> ${targetUrl}`);
  
  try {
    // Prepare headers
    const headers: HeadersInit = {
      'x-api-key': PARSER_API_KEY,
    };
    
    // Forward content-type (important for multipart/form-data with boundary)
    const contentType = req.headers['content-type'];
    if (contentType) {
      headers['Content-Type'] = contentType;
    }
    
    // Prepare body
    let body: BodyInit | undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.body) {
        if (contentType?.includes('multipart/form-data')) {
          // For multipart, try to forward as-is
          // Vercel may have parsed it, but we'll try to reconstruct
          if (Buffer.isBuffer(req.body)) {
            body = req.body;
          } else if (typeof req.body === 'string') {
            body = req.body;
          } else {
            // If parsed, we can't easily reconstruct multipart
            // This is a limitation - might need busboy/formidable for production
            body = req.body as any;
          }
        } else {
          // For JSON or other types
          body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        }
      }
    }
    
    // Forward the request to the parser service
    const proxyResponse = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: body as any,
    });
    
    // Get response data
    const responseContentType = proxyResponse.headers.get('content-type') || 'application/json';
    let data: any;
    
    if (responseContentType.includes('application/json')) {
      data = await proxyResponse.json();
    } else if (responseContentType.includes('text/')) {
      data = await proxyResponse.text();
    } else {
      // For binary data (like images), get as array buffer
      const buffer = await proxyResponse.arrayBuffer();
      data = Buffer.from(buffer);
    }
    
    // Forward status and headers
    res.status(proxyResponse.status);
    
    // Forward content-type
    if (responseContentType) {
      res.setHeader('Content-Type', responseContentType);
    }
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
    
    // Send response
    if (Buffer.isBuffer(data)) {
      res.send(data);
    } else if (responseContentType.includes('application/json')) {
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

