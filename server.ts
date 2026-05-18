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

  app.use(cors());
  app.use(express.json());

  // Log every single request for maximum visibility - MOVE TO TOP
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // API Health check
  app.get('/api/health', (req, res) => {
    console.log('[HEALTH] Request received');
    res.json({ 
      status: 'ok', 
      version: '3.7.0',
      time: new Date().toISOString()
    });
  });

  // XML Analysis Route - DEFINED CLEARLY AT TOP LEVEL
  app.post('/api/analyze-xml', upload.array('files'), (req: Request, res: Response) => {
    console.log('[XML] POST /api/analyze-xml reached');
    try {
      const files = (req as MulterRequest).files as Express.Multer.File[];
      if (!files || files.length === 0) {
        console.warn('[XML] No files in request');
        return res.status(400).json({ error: 'No se subieron archivos XML' });
      }

      console.log(`[XML] Processing ${files.length} files...`);
      const results = files.map(file => {
        try {
          const xmlContent = file.buffer.toString('utf-8');
          const parsedData = parseCFDI(xmlContent);
          console.log(`[XML] Success: ${file.originalname}`);
          return {
            filename: file.originalname,
            data: parsedData,
            status: 'success'
          };
        } catch (error: any) {
          console.error(`[XML] Error in file ${file.originalname}:`, error.message);
          return { filename: file.originalname, error: error.message, status: 'error' };
        }
      });

      res.json(results);
    } catch (error: any) {
      console.error('[XML] Global processing error:', error);
      res.status(500).json({ error: 'Error interno del servidor al procesar XML', details: error.message });
    }
  });

  // Development vs Production setup
  const isProduction = process.env.NODE_ENV === 'production' || process.env.AIS_PREVIEW === 'true';

  if (!isProduction) {
    console.log('Starting VITE dev middleware (Development Mode)');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('Production Mode: Serving static assets');
    const distPath = path.resolve(process.cwd(), 'dist');
    
    // Serve static files from /dist
    app.use(express.static(distPath));
    
    // API 404 Handler - Only for paths starting with /api/ that were NOT matched above
    app.all('/api/*', (req, res) => {
      console.warn(`[NOT_FOUND] Route ${req.method} ${req.url} failed to match`);
      res.status(404).json({ error: 'Ruta de API no encontrada o método incorrecto' });
    });

    // SPA Wildcard - Handle all other routes by serving index.html
    app.get('*', (req, res) => {
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

