import express, { Request, Response } from 'express';
import path from 'path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { parseCFDI } from './src/lib/xmlParser.ts';
import { extractTransactionsFromPDF } from './src/services/geminiService.ts';
import cors from 'cors';

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

  app.use(cors());
  app.use(express.json());

  // Use a Router for API to be more organized and prevent conflicts with Vite
  const apiRouter = express.Router();

  apiRouter.get('/health', (req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  apiRouter.post('/analyze-xml', upload.array('files'), (req: Request, res: Response) => {
    console.log('[API] analyze-xml hit', { count: (req as any).files?.length });
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

  apiRouter.post('/analyze-bank-statement', upload.single('file'), async (req: Request, res: Response) => {
    console.log('[API] analyze-bank-statement hit', { 
      file: req.file?.originalname,
      size: req.file?.size,
      mime: req.file?.mimetype 
    });

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No se subió ningún archivo' });
      }

      const file = req.file;
      if (file.mimetype !== 'application/pdf' && !file.originalname.toLowerCase().endsWith('.pdf')) {
        return res.status(400).json({ error: 'El archivo debe ser un PDF' });
      }

      const transactions = await extractTransactionsFromPDF(file.buffer);
      res.json({
        filename: file.originalname,
        transactions,
        status: 'success'
      });
    } catch (error: any) {
      console.error("[API] analyze-bank-statement error:", error);
      res.status(500).json({ 
        error: error.message || 'Error interno al procesar el PDF',
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
      });
    }
  });

  // Mount API router
  app.use('/api', apiRouter);

  // API 404 Handler - MUST be after apiRouter mounting
  app.use('/api/*', (req, res) => {
    console.warn(`[API] 404: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ 
      error: 'Ruta de API no encontrada', 
      method: req.method, 
      path: req.originalUrl 
    });
  });

  // Global Error Handler
  app.use((err: any, req: Request, res: Response, next: any) => {
    console.error('SERVER ERROR:', err);
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
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
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
