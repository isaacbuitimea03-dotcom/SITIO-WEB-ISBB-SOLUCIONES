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

  // Health check - Very simple
  app.get('/api/health', (req, res) => {
    res.status(200).json({ 
      status: 'ok', 
      deployment: 'isbb-v2',
      time: new Date().toISOString() 
    });
  });

  // API Routes - Defined at the top level of the app for maximum priority
  app.post('/api/analyze-xml', upload.array('files'), (req: Request, res: Response) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [API] analyze-xml start`);
    try {
      const files = (req as MulterRequest).files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No se subieron archivos' });
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
          return {
            filename: file.originalname,
            error: error.message,
            status: 'error'
          };
        }
      });

      res.json(results);
    } catch (error: any) {
      console.error('[API] analyze-xml error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post(['/api/analyze-bank-statement', '/api/analyze-bank-statement/'], upload.single('file'), async (req: Request, res: Response) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [API] analyze-bank-statement start`);
    try {
      if (!req.file) {
        console.warn('[API] No file provided');
        return res.status(400).json({ error: 'No se subió ningún archivo' });
      }

      const file = req.file;
      console.log(`[API] Processing: ${file.originalname} (${file.size} bytes)`);
      
      const transactions = await extractTransactionsFromPDF(file.buffer);
      console.log(`[API] Extracted ${transactions.length} transactions`);

      res.json({
        filename: file.originalname,
        transactions,
        status: 'success'
      });
    } catch (error: any) {
      console.error("[API] Error in analyze-bank-statement:", error);
      res.status(500).json({ 
        error: error.message || 'Error interno del servidor al procesar el PDF',
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      });
    }
  });

  // Health check - accessible and fast
  app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Catch-all for other /api routes
  app.all('/api/*', (req, res) => {
    console.warn(`[API 404] ${req.method} ${req.url}`);
    res.status(404).json({ 
      error: 'Endpoint de API no encontrado', 
      method: req.method, 
      url: req.url 
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
