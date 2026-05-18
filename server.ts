import express, { Request, Response } from 'express';
import path from 'path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { parseCFDI } from './src/lib/xmlParser';
import cors from 'cors';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('--- ISBB SERVER STARTING ---');
console.log('Mode:', process.env.NODE_ENV);

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB limit
});

interface MulterRequest extends Request {
  files: any;
}

async function start() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // API Health check - DEFINED FIRST BEFORE ANY MIDDLEWARE
  app.get('/api/health', (req, res) => {
    console.log('[HEALTH] Request received');
    res.json({ 
      status: 'ok', 
      version: '3.5.0',
      time: new Date().toISOString()
    });
  });

  app.use(cors());
  app.use(express.json());

  // Log every single request for maximum visibility
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });
  app.post('/api/analyze-xml', upload.array('files'), (req: Request, res: Response) => {
    console.log('[XML] Start processing');
    try {
      const files = (req as MulterRequest).files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No se subieron archivos XML' });
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
          console.error(`[XML] Error in ${file.originalname}:`, error);
          return { filename: file.originalname, error: error.message, status: 'error' };
        }
      });

      res.json(results);
    } catch (error: any) {
      console.error('[XML] Global error:', error);
      res.status(500).json({ error: 'Error interno al procesar XML', details: error.message });
    }
  });

  // Development vs Production setup
  if (process.env.NODE_ENV !== 'production' && !process.env.AIS_PREVIEW) {
    console.log('Starting VITE dev middleware...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('Production mode: Serving static files from dist/');
    const distPath = path.join(process.cwd(), 'dist');
    
    // Serve static files
    app.use(express.static(distPath));
    
    // Wildcard handler for SPA
    app.get('*', (req, res) => {
      if (req.url.startsWith('/api/')) {
        console.warn(`[NOT_FOUND] Missing API route: ${req.url}`);
        return res.status(404).json({ 
          error: 'API route not found', 
          url: req.url,
          hint: 'Ensure your health check and processing routes are defined before the static wildcard.'
        });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`>>> ISBB SERVER RUNNING ON PORT ${PORT} <<<`);
    console.log(`>>> HEALTH CHECK AT /api/health <<<`);
  });
}

start().catch(err => {
  console.error('SERVER FAILED TO START:', err);
});

