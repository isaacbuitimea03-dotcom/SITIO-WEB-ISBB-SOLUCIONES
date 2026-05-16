import express, { Request, Response } from 'express';
import path from 'path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { parseCFDI } from './src/lib/xmlParser.js';
import { extractTransactionsFromText } from './src/services/geminiService.js';
import cors from 'cors';

const upload = multer({ storage: multer.memoryStorage() });

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
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No se subió ningún archivo' });
      }

      if (file.mimetype !== 'application/pdf') {
        return res.status(400).json({ error: 'El archivo debe ser un PDF' });
      }

      // Extract text from PDF - Lazy load pdf-parse
      const { default: pdf } = await import('pdf-parse/lib/pdf-parse.js');
      const data = await pdf(file.buffer);
      const textContent = data.text;

      if (!textContent || textContent.trim().length === 0) {
        throw new Error('No se pudo extraer texto del PDF. Asegúrese de que no sea una imagen escaneada sin OCR.');
      }

      // Analyze with Gemini
      const transactions = await extractTransactionsFromText(textContent);

      res.json({
        filename: file.originalname,
        transactions,
        status: 'success'
      });
    } catch (error: any) {
      console.error("PDF Analysis Error:", error);
      res.status(500).json({ error: error.message || 'Error interno al procesar el PDF' });
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

startServer();
