import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { parseCFDI } from './src/lib/xmlParser.js';
import { extractTransactionsFromPDF } from './src/services/geminiService.js';
import cors from 'cors';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Log every single request for maximum visibility
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: '2.5.1',
    env: process.env.NODE_ENV || 'dev',
    key: !!process.env.GEMINI_API_KEY
  });
});

// XML Analysis Route
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

// PDF Analysis Route
app.post('/api/analyze-pdf-bank', upload.array('files'), async (req: Request, res: Response) => {
  console.log('[PDF] Start processing');
  try {
    const files = (req as MulterRequest).files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No se subieron archivos PDF' });
    }

    const results = [];
    for (const file of files) {
      try {
        console.log(`[PDF] Analyzing: ${file.originalname}`);
        const transactions = await extractTransactionsFromPDF(file.buffer);
        results.push({
          filename: file.originalname,
          transactions,
          status: 'success'
        });
      } catch (error: any) {
        console.error(`[PDF] Error in ${file.originalname}:`, error);
        results.push({
          filename: file.originalname,
          error: error.message,
          status: 'error',
          transactions: []
        });
      }
    }

    res.json(results);
  } catch (error: any) {
    console.error('[PDF] Global error:', error);
    res.status(500).json({ error: 'Error fatal en servidor PDF', details: error.message });
  }
});

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    console.log('Starting VITE dev middleware...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('Production mode: Serving static files');
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.url.startsWith('/api/')) return res.status(404).json({ error: 'API route not found' });
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`>>> SERVER RUNNING ON PORT ${PORT} <<<`);
  });
}

start().catch(err => {
  console.error('SERVER FAILED TO START:', err);
});

export default app;

