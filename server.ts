import express, { Request, Response, NextFunction } from 'express';
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

const app = express();
const apiRouter = express.Router();

// Middlewares
app.use(cors());
app.use(express.json());

// Log every request
app.use((req, res, next) => {
  console.log(`[REQUEST] ${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// API Routes
apiRouter.get('/health', (req, res) => {
  console.log('[HEALTH] Checking status...');
  res.json({ 
    status: 'ok', 
    version: '4.1.0',
    time: new Date().toISOString(),
    platform: process.env.VERCEL ? 'Vercel' : 'Standard',
    env: process.env.NODE_ENV
  });
});

apiRouter.post('/analyze-xml', upload.array('files'), (req: Request, res: Response) => {
  console.log('[XML] POST /api/analyze-xml received');
  try {
    const files = (req as MulterRequest).files as Express.Multer.File[];
    if (!files || files.length === 0) {
      console.warn('[XML] No files uploaded');
      return res.status(400).json({ error: 'No se subieron archivos XML' });
    }

    console.log(`[XML] Processing ${files.length} files...`);
    const results = files.map(file => {
      try {
        const xmlContent = file.buffer.toString('utf-8');
        return {
          filename: file.originalname,
          data: parseCFDI(xmlContent),
          status: 'success'
        };
      } catch (error: any) {
        console.error(`[XML] Error parsing ${file.originalname}:`, error.message);
        return { filename: file.originalname, error: error.message, status: 'error' };
      }
    });

    res.json(results);
  } catch (error: any) {
    console.error('[XML] Global error:', error);
    res.status(500).json({ error: 'Error interno del servidor', details: error.message });
  }
});

app.use('/api', apiRouter);

// Middleware de manejo de errores global
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[CRITICAL ERROR]:', err);
  res.status(500).json({ error: 'Ruta no válida o error interno', details: err.message });
});

async function start() {
  const PORT = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production' || process.env.AIS_PREVIEW === 'true' || !!process.env.VERCEL;

  if (!isProduction) {
    console.log('[DEV] Starting Vite Middleware...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('[PROD] Serving static dist files...');
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    // SPA Wildcard fallback
    app.get('*', (req, res) => {
      if (!req.url.startsWith('/api/')) {
        res.sendFile(path.join(distPath, 'index.html'));
      } else {
        res.status(404).json({ error: 'API endpoint not found' });
      }
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`>>> SERVER READY ON PORT ${PORT} <<<`);
    });
  }
}

start().catch(err => {
  console.error('SERVER ERROR:', err);
});

export default app;

