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

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Log every request
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// API Routes (Defined on the app object directly)
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: '3.8.0',
    time: new Date().toISOString(),
    platform: process.env.VERCEL ? 'Vercel' : 'Standard'
  });
});

app.post('/api/analyze-xml', upload.array('files'), (req: Request, res: Response) => {
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
        return { filename: file.originalname, error: error.message, status: 'error' };
      }
    });

    res.json(results);
  } catch (error: any) {
    res.status(500).json({ error: 'Error interno del servidor', details: error.message });
  }
});

async function start() {
  const PORT = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production' || process.env.AIS_PREVIEW === 'true' || !!process.env.VERCEL;

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    
    app.all('/api/*', (req, res) => {
      res.status(404).json({ error: 'Ruta de API no encontrada' });
    });

    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Solo escuchar si no estamos en Vercel
  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`>>> SERVER RUNNING ON PORT ${PORT} <<<`);
    });
  }
}

start().catch(err => {
  console.error('SERVER ERROR:', err);
});

export default app;

