import express, { Request, Response } from 'express';
import path from 'path';
import cors from 'cors';
import multer from 'multer';

// Import our modular routers
import satRouter from './server/routes/sat.js';
import aiRouter from './server/routes/ai.js';
import bankRouter from './server/routes/bank.js';
import { getAuthorizationHeader } from './server/utils/satGoClient.js';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// App Health & Status API
app.get(['/api/health', '/api', '/health'], (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'ISBB Soluciones API active' });
});

// Mount Routers directly
app.use('/', satRouter);
app.use('/', aiRouter);
app.use('/', bankRouter);

app.use('/api/sat', satRouter);
app.use('/api/sat-go', satRouter);
app.use('/api/ai', aiRouter);
app.use('/api/bank', bankRouter);
app.use('/api', satRouter);
app.use('/api', aiRouter);
app.use('/api', bankRouter);

// Catch-all middleware for any unmatched API endpoints
// Guarantees a JSON response and prevents falling through to Vite/index.html
app.use([
  '/api*',
  '/sat*',
  '/ai*',
  '/bank*',
  '/csf*',
  '/facfiel*',
  '/solicita*',
  '/verifica*',
  '/descarga*',
  '/efos*',
  '/ocfiel*',
  '/retencionfiel*',
  '/informacionfiscalfiel*',
  '/analyze*'
], (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  return res.status(404).json({
    error: `Ruta de API no encontrada o método no permitido: ${req.method} ${req.originalUrl}`
  });
});

// Global error handling middleware for API routes to guarantee JSON response
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('Unhandled API Error:', err);
  const status = err.status || err.statusCode || 500;
  res.setHeader('Content-Type', 'application/json');
  res.status(status).json({
    error: err.message || 'Error en el servidor al procesar la solicitud.'
  });
});

// Servir frontend en producción
async function startServer() {
  const PORT = 3000;
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// Only start standalone HTTP server when NOT running inside Vercel Serverless Functions
if (!process.env.VERCEL && !process.env.VERCEL_ENV && !process.env.NOW_REGION) {
  startServer();
}

export default app;
