/**
 * Main Application Entry Point
 * Routes to Configurator or Proofer based on URL path
 */

/**
 * Route to appropriate app based on URL pathname
 */
function route(): void {
  const pathname = window.location.pathname;

  // Route to proofer if path is /proofer
  if (pathname === '/proofer' || pathname.startsWith('/proofer/')) {
    import('../app/proofer/index.js');
  } else {
    // Default to configurator (/, /configurator, or any other path)
    import('../app/configurator/index.js');
  }
}

// Route when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', route);
} else {
  route();
}
