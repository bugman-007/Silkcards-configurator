/**
 * URL Rewriter Utility
 * 
 * Rewrites parser service asset URLs to use the Vercel proxy
 * to avoid mixed content errors (HTTPS -> HTTP).
 */

const PARSER_BASE_URL = 'https://silkcards-parser.duckdns.org';

/**
 * Rewrite an asset URL to use the proxy if needed
 * 
 * @param originalUrl - Original URL (may be HTTP or already proxied)
 * @returns Rewritten URL using /api/parser-proxy if in production and URL is HTTP
 */
export function rewriteAssetUrl(originalUrl: string): string {
  // If already a relative URL or already using proxy, return as-is
  if (originalUrl.startsWith('/api/parser-proxy') || originalUrl.startsWith('/')) {
    return originalUrl;
  }
  
  // If already HTTPS, return as-is
  if (originalUrl.startsWith('https://')) {
    return originalUrl;
  }
  
  // Check if this is a parser service URL
  if (originalUrl.startsWith('http://') && originalUrl.includes(PARSER_BASE_URL.replace('http://', ''))) {
    // In production (HTTPS), rewrite to use proxy
    const isProduction = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const envBaseUrl = import.meta.env.VITE_PARSER_BASE_URL;
    const useProxy = isProduction && (!envBaseUrl || envBaseUrl.startsWith('http://'));
    
    if (useProxy) {
      // Extract path from URL
      try {
        const url = new URL(originalUrl);
        // Rewrite to proxy: http://54.198.104.149:8080/assets/... -> /api/parser-proxy/assets/...
        const proxyUrl = `/api/parser-proxy${url.pathname}${url.search}`;
        console.log(`[URLRewriter] Rewriting ${originalUrl} -> ${proxyUrl}`);
        return proxyUrl;
      } catch (error) {
        console.error('[URLRewriter] Failed to parse URL:', originalUrl, error);
        return originalUrl;
      }
    }
  }
  
  // Return original URL if no rewrite needed
  return originalUrl;
}

/**
 * Rewrite multiple asset URLs
 */
export function rewriteAssetUrls(urls: string[]): string[] {
  return urls.map(rewriteAssetUrl);
}

