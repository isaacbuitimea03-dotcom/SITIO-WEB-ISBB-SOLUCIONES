import app from '../server.js';

export default function handler(req: any, res: any) {
  try {
    return app(req, res);
  } catch (error: any) {
    console.error('[Vercel Serverless Function Error]:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Error interno en la función serverless.',
        message: error?.message || String(error)
      });
    }
  }
}

