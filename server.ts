import express, { Request, Response } from 'express';
import path from 'path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { parseCFDI } from './src/lib/xmlParser.ts';
import { extractTransactionsFromPDF } from './src/services/geminiService.ts';
import cors from 'cors';

console.log('--- SERVER INITIATING ---');
console.log('Current working directory:', process.cwd());

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

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.post('/api/analyze-xml', upload.array('files'), (req: Request, res: Response) => {
    console.log('API HIT: /api/analyze-xml', { filesCount: (req as any).files?.length });
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
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/analyze-bank-statement', upload.single('file'), async (req: Request, res: Response) => {
    console.log('--- BANK STATEMENT API HIT ---');
    console.log('File details:', { 
      exists: !!req.file,
      originalname: req.file?.originalname,
      size: req.file?.size,
      mimetype: req.file?.mimetype 
    });

    try {
      const file = req.file;
      if (!file) {
        console.error('No file found in request');
        return res.status(400).json({ error: 'No se subió ningún archivo' });
      }

      if (file.mimetype !== 'application/pdf' && !file.originalname.toLowerCase().endsWith('.pdf')) {
        console.error('Invalid file type:', file.mimetype);
        return res.status(400).json({ error: 'El archivo debe ser un PDF' });
      }

      console.log('Invoking extractTransactionsFromPDF...');
      // Analyze with Gemini using native PDF support
      const transactions = await extractTransactionsFromPDF(file.buffer);
      console.log('Extraction success, transactions count:', transactions.length);

      res.json({
        filename: file.originalname,
        transactions,
        status: 'success'
      });
    } catch (error: any) {
      console.error("PDF Analysis Endpoint Error:", error);
      res.status(500).json({ 
        error: error.message || 'Error interno al procesar el PDF',
        details: error.stack 
      });
    }
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
