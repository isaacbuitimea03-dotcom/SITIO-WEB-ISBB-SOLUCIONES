import express, { Request, Response } from 'express';
import path from 'path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { parseCFDI } from './src/lib/xmlParser';
import { extractTransactionsFromPDF } from './src/services/geminiService';
import cors from 'cors';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

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

const app = express();
const PORT = 3000;

// Use CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Log all requests with more detail
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Incoming Request: ${req.method} ${req.url}`);
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    deployment: 'isbb-v9-stable',
    time: new Date().toISOString()
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

// PDF Bank Analysis Route - sequential for robustness
app.post('/api/analyze-pdf-bank', upload.array('files'), async (req: Request, res: Response) => {
  console.log('[API] multi-PDF Request Received');
  try {
    const files = (req as MulterRequest).files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No PDF files uploaded' });
    }

    const results = [];
    for (const file of files) {
      try {
        console.log(`[API] Processing PDF sequentially: ${file.originalname}`);
        const transactions = await extractTransactionsFromPDF(file.buffer);
        results.push({
          filename: file.originalname,
          transactions,
          status: 'success'
        });
      } catch (error: any) {
        console.error(`[API] Error in ${file.originalname}:`, error);
        results.push({
          filename: file.originalname,
          error: error.message,
          status: 'error',
          transactions: []
        });
      }
    }

    res.status(200).json(results);
  } catch (error: any) {
    console.error('[API] Global PDF Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route inspector
app.get('/api/debug-routes', (req, res) => {
  const routes = app._router.stack
    .filter((r: any) => r.route)
    .map((r: any) => ({
      path: r.route.path,
      methods: Object.keys(r.route.methods)
    }));
  res.json({ routes });
});

async function startServer() {
  console.log('Finalizing server setup...');

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In production (Cloud Run), serve static files from dist
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    app.get('*', (req, res) => {
      if (req.url.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is listening on 0.0.0.0:${PORT}`);
  });
}

// Start the server
startServer().catch((err) => {
  console.error('FAILED TO START SERVER:', err);
});

export default app;
