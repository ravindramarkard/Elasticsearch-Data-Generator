import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/es-proxy': {
        target: 'https://10.142.2.45:9200',
        changeOrigin: true,
        secure: false, // Allow self-signed certificates
        rewrite: (path) => path.replace(/^\/es-proxy/, ''),
        timeout: 30000, // 30 second timeout
        proxyTimeout: 30000,
        configure: (proxy, _options) => {
          proxy.on('error', (err, req, res) => {
            console.error('❌ Proxy error:', err.message);
            console.error('   Request:', req.method, req.url);
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ 
                error: 'Proxy error', 
                message: err.message,
                target: 'https://10.142.2.45:9200'
              }));
            }
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('🔄 Proxying:', req.method, req.url, '→', proxyReq.path);
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('✅ Proxy response:', req.url, '→ Status:', proxyRes.statusCode);
          });
        }
      }
    }
  }
})
