import express, { Request, Response } from 'express';
import path from 'path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { parseCFDI } from './src/lib/xmlParser.js';
import cors from 'cors';

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file
    files: 500 // Max 500 files at once
  }
});

interface MulterRequest extends Request {
  files: any;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API Routes
  app.post('/api/analyze-xml', (req, res, next) => {
    upload.array('files')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        console.error('Multer error:', err);
        return res.status(400).json({ error: `Error de carga: ${err.message}` });
      } else if (err) {
        console.error('Unknown upload error:', err);
        return res.status(500).json({ error: 'Error interno al cargar archivos' });
      }
      next();
    });
  }, (req: Request, res: Response) => {
    try {
      const files = (req as MulterRequest).files as Express.Multer.File[];
      
      console.log(`Received request to analyze ${files?.length || 0} files`);

      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No se subieron archivos' });
      }

      const results = files.map(file => {
        try {
          const xmlContent = file.buffer.toString('utf-8');
          const parsedData = parseCFDI(xmlContent);
          return {
            filename: file.originalname,
            data: parsedData,
            status: 'success'
          };
        } catch (error: any) {
          console.error(`Error parsing file ${file.originalname}:`, error.message);
          return {
            filename: file.originalname,
            error: error.message,
            status: 'error'
          };
        }
      });

      res.json(results);
    } catch (error: any) {
      console.error('Global API error:', error);
      res.status(500).json({ error: error.message });
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
