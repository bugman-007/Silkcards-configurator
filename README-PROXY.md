# Parser Service Proxy Setup

## Problem
When the frontend is served over HTTPS (Vercel), browsers block HTTP requests to the parser service (mixed content error).

## Solution
A Vercel API route (`/api/parser-proxy/[...path]`) proxies requests from the frontend to the parser service.

## Environment Variables Required in Vercel

Set these in Vercel Dashboard → Project Settings → Environment Variables:

1. **PARSER_BASE_URL** (Server-side only)
   - Value: `http://54.198.104.149:8080`
   - This is used by the API proxy to forward requests

2. **PARSER_API_KEY** (Server-side only)
   - Value: Your parser service API key
   - This is used by the API proxy to authenticate with the parser service

**Note:** These are server-side environment variables (no `VITE_` prefix) because they're only used by the API route, not the frontend code.

## How It Works

1. Frontend makes HTTPS request to `/api/parser-proxy/parse`
2. Vercel API route receives the request
3. API route forwards the request to `http://54.198.104.149:8080/parse` (HTTP is OK server-side)
4. API route returns the response to the frontend

## Testing

After deploying:
1. Check browser console - should see requests to `/api/parser-proxy/...` instead of direct HTTP URLs
2. File uploads should work without mixed content errors
3. Texture loading should work (also uses proxy for `/output/` paths)

## Troubleshooting

If you still see mixed content errors:
1. Verify `PARSER_BASE_URL` and `PARSER_API_KEY` are set in Vercel
2. Redeploy after setting environment variables (they're read at build/runtime)
3. Check Vercel function logs for proxy errors

