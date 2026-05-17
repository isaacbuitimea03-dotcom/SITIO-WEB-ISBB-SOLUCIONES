import express, { Request, Response } from 'express';
import path from 'path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { parseCFDI } from './src/lib/xmlParser';
import { extractTransactionsFromPDF } from './src/services/geminiService';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';

console.log('--- SERVER INITIATING ---');
console.log('Current working directory:', process.cwd());
console.log('GEMINI_API_KEY present:', !!process.env.GEMINI_API_KEY);

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

interface MulterRequest extends Request {
  files: any;
}

async function startServer() {
  console.log('Starting server...');
  const app = express();
  const PORT = 3000;

  // Use CORS and JSON parsing
  app.use(cors());
  app.use(express.json());

  // Log all requests with more detail
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Incoming Request: ${req.method} ${req.url}`);
    console.log(`[${timestamp}] Headers: ${JSON.stringify(req.headers)}`);
    next();
  });

  // Health check and ping
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      deployment: 'isbb-v6-stable', 
      time: new Date().toISOString(),
      node: process.version
    });
  });

  app.get('/api/ping', (req, res) => {
    res.send('pong');
  });

  // XML Analysis Route
  app.post('/api/analyze-xml', upload.array('files'), (req: Request, res: Response) => {
    console.log('[API] XML Request Received');
    try {
      const files = (req as MulterRequest).files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const results = files.map(file => {
        try {
          const xmlContent = file.buffer.toString('utf-8');
          return {
            filename: file.originalname,
            data: parseCFDI(xmlContent),
            status: 'success'
          };
        } catch (error: any) {
          return { filename: file.originalname, error: error.message, status: 'error' };
        }
      });

      res.status(200).json(results);
    } catch (error: any) {
      console.error('[API] XML Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PDF Bank Analysis Route - Multi-file support
  app.post('/api/analyze-pdf-bank', upload.array('files'), async (req: Request, res: Response) => {
    console.log('[API] multi-PDF Request Received');
    try {
      const files = (req as MulterRequest).files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No PDF files uploaded' });
      }

      const results = await Promise.all(
        files.map(async file => {
          try {
            console.log(`[API] Processing PDF: ${file.originalname}`);
            const transactions = await extractTransactionsFromPDF(file.buffer);
            return {
              filename: file.originalname,
              transactions,
              status: 'success'
            };
          } catch (error: any) {
            console.error(`[API] Error in ${file.originalname}:`, error);
            return {
              filename: file.originalname,
              error: error.message,
              status: 'error',
              transactions: []
            };
          }
        })
      );

      res.status(200).json(results);
    } catch (error: any) {
      console.error('[API] Global PDF Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Route inspector for debugging 404s
  app.get('/api/debug-routes', (req, res) => {
    const routes = app._router.stack
      .filter((r: any) => r.route)
      .map((r: any) => ({
        path: r.route.path,
        methods: Object.keys(r.route.methods)
      }));
    res.json({ routes });
  });

  // Catch-all for any other /api route
  app.all('/api/*', (req, res) => {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [API 404 NOT FOUND] ${req.method} ${req.url}`);
    res.status(404).json({ 
      error: 'Endpoint de API no encontrado en el servidor Express', 
      method: req.method, 
      url: req.url,
      server_time: timestamp
    });
  });

  // Global Error Handler
  app.use((err: any, req: Request, res: Response, next: any) => {
    console.error('SERVER FATAL ERROR:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error interno del servidor', message: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve from dist using absolute path
    const distPath = path.resolve(process.cwd(), 'dist');
    console.log('Serving static files from:', distPath);
    app.use(express.static(distPath));
    
    console.log('Production mode: serving static files and catch-all');
    
    // Everything else serves index.html (SPA fallback)
    app.get('*', (req, res) => {
      // If it's an API route that missed, return JSON 404
      if (req.url.startsWith('/api/')) {
        console.warn(`[SERVER 404] API endpoint missed: ${req.method} ${req.url}`);
        return res.status(404).json({ 
          error: 'Endpoint de API no encontrado (SPA Fallback)', 
          method: req.method, 
          url: req.url 
        });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is listening on 0.0.0.0:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer().catch(err => {
  console.error('CRITICAL STARTUP ERROR:', err);
  process.exit(1);
});
