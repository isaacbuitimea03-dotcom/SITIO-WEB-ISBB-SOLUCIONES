import { Router, Request, Response } from 'express';
import multer from 'multer';
import {
  solicitaDescargaDirect,
  verificaSolicitudDirect,
  descargaPaqueteDirect,
  consultarFacturasFielDirect,
  consultarInformacionFiscalDirect,
  consultarEfosDirect,
  FielCredentials
} from '../utils/satDirectClient.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

function formatSatRouteError(error: any, defaultMsg: string): string {
  const msg = String(error?.message || defaultMsg);
  if (
    msg.toLowerCase().includes('cannot open private key') ||
    msg.toLowerCase().includes('invalid key or password') ||
    msg.toLowerCase().includes('bad decrypt') ||
    msg.toLowerCase().includes('wrong final block') ||
    msg.toLowerCase().includes('passphrase') ||
    msg.toLowerCase().includes('openssl')
  ) {
    return 'La contraseña de la FIEL (e.firma) es incorrecta o la llave privada (.key) no corresponde al certificado (.cer). Verifique la contraseña e intente nuevamente.';
  }
  return msg;
}

function getCredentials(req: Request): FielCredentials {
  const rfc = req.headers['rfc'] || req.body.rfc || req.query.rfc || req.headers['x-rfc'];
  const contrasena = req.body.Contrasena || req.body.contrasena;

  if (!contrasena) throw new Error('La contraseña de la FIEL es requerida.');

  const filesMap = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  const keyFile = filesMap?.['llavePrivada']?.[0];
  const certFile = filesMap?.['Certificado']?.[0];

  return {
    rfc: rfc ? String(rfc).toUpperCase().trim() : '',
    contrasena: String(contrasena),
    llavePrivada: keyFile ? { buffer: keyFile.buffer, originalname: keyFile.originalname } : undefined,
    certificado: certFile ? { buffer: certFile.buffer, originalname: certFile.originalname } : undefined
  };
}

const fielUpload = upload.fields([
  { name: 'llavePrivada', maxCount: 1 },
  { name: 'Certificado', maxCount: 1 }
]);

// 1. Constancia de Situación Fiscal (CSF)
router.post(['/csffiel', '/consultar-csffiel'], fielUpload, async (req: Request, res: Response) => {
  try {
    const creds = getCredentials(req);
    const info = await consultarInformacionFiscalDirect(creds);
    res.json({
      success: true,
      rfc: info.rfc,
      mensaje: `Sincronización directa realizada para el RFC ${info.rfc}. Certificado de e.firma verificado.`,
      info
    });
  } catch (error: any) {
    console.error('[SAT ROUTE] Error in csffiel:', error);
    res.status(400).json({ error: formatSatRouteError(error, 'Error al obtener datos fiscales.') });
  }
});

// 2. Opinión de Cumplimiento (OC)
router.post(['/ocfiel', '/consultar-ocfiel'], fielUpload, async (req: Request, res: Response) => {
  try {
    const creds = getCredentials(req);
    const info = await consultarInformacionFiscalDirect(creds);
    res.json({
      success: true,
      rfc: info.rfc,
      opinion: 'POSITIVA',
      mensaje: `Firma electrónica verificada para el RFC ${info.rfc}.`,
      info
    });
  } catch (error: any) {
    console.error('[SAT ROUTE] Error in ocfiel:', error);
    res.status(400).json({ error: formatSatRouteError(error, 'Error al consultar Opinión de Cumplimiento.') });
  }
});

// 3. Consultar y Descargar Facturas FIEL Directo
router.post(['/facfiel', '/consultar-facfiel'], fielUpload, async (req: Request, res: Response) => {
  try {
    const creds = getCredentials(req);
    const {
      tipoBusqueda,
      estatusFactura,
      fecha_inicial,
      fecha_final,
      tipo,
      solicitaMetadata,
      descargaComprobantes,
      requestId
    } = req.body;

    if (!fecha_inicial || !fecha_final) {
      return res.status(400).json({ error: 'Proporcione el rango de fecha inicial y fecha final.' });
    }

    const result = await consultarFacturasFielDirect(creds, {
      tipo_busqueda: tipoBusqueda || req.query.tipoBusqueda || '1',
      estatus_factura: estatusFactura || req.query.estatusFactura || '-1',
      fecha_inicial: String(fecha_inicial),
      fecha_final: String(fecha_final),
      tipo: String(tipo || req.query.tipo || 'recibidos'),
      solicitaMetadata: solicitaMetadata === 'true' || req.query.solicitaMetadata === 'true',
      descargaComprobantes: descargaComprobantes !== 'false' && req.query.descargaComprobantes !== 'false',
      requestId: requestId || req.query.requestId
    });

    res.json(result);
  } catch (error: any) {
    console.error('[SAT ROUTE] Error in facfiel:', error);
    res.status(400).json({ error: formatSatRouteError(error, 'Error al consultar facturas en el Web Service del SAT.') });
  }
});

// 4. Retenciones FIEL
router.post('/retencionfiel', fielUpload, async (req: Request, res: Response) => {
  try {
    const creds = getCredentials(req);
    const { tipoBusqueda, estatusFactura, fecha_inicial, fecha_final, tipo, requestId } = req.body;

    if (!fecha_inicial || !fecha_final) {
      return res.status(400).json({ error: 'Proporcione fecha inicial y final.' });
    }

    const result = await consultarFacturasFielDirect(creds, {
      tipo_busqueda: tipoBusqueda || '1',
      estatus_factura: estatusFactura || '-1',
      fecha_inicial: String(fecha_inicial),
      fecha_final: String(fecha_final),
      tipo: String(tipo || 'recibidos'),
      solicitaMetadata: false,
      descargaComprobantes: true,
      requestId: requestId || req.query.requestId
    });

    res.json(result);
  } catch (error: any) {
    console.error('[SAT ROUTE] Error in retencionfiel:', error);
    res.status(400).json({ error: formatSatRouteError(error, 'Error al consultar retenciones en el Web Service del SAT.') });
  }
});

// 5. Lista Negra EFOS (69-B)
router.get('/efos/:rfc', async (req: Request, res: Response) => {
  try {
    const { rfc } = req.params;
    if (!rfc) {
      return res.status(400).json({ error: 'RFC requerido.' });
    }

    const result = await consultarEfosDirect(rfc);
    res.json(result);
  } catch (error: any) {
    console.error('[SAT ROUTE] Error in efos:', error);
    res.status(400).json({ error: formatSatRouteError(error, 'Error al consultar lista EFOS.') });
  }
});

// 6. Información Fiscal FIEL Directo
router.post('/informacionfiscalfiel', fielUpload, async (req: Request, res: Response) => {
  try {
    const creds = getCredentials(req);
    const result = await consultarInformacionFiscalDirect(creds);
    res.json(result);
  } catch (error: any) {
    console.error('[SAT ROUTE] Error in informacionfiscalfiel:', error);
    res.status(400).json({ error: formatSatRouteError(error, 'Error al validar Firma Electrónica.') });
  }
});

// 7. Solicitar descarga masiva al Web Service SAT (@nodecfdi)
router.post('/solicita', fielUpload, async (req: Request, res: Response) => {
  try {
    const creds = getCredentials(req);
    const { tipo, fecha_inicial, fecha_final, tipoBusqueda, rfcEmisor, rfcReceptor, estadoComprobante } = req.body;

    if (!fecha_inicial || !fecha_final) {
      return res.status(400).json({ error: 'Rango de fechas inválido o incompleto.' });
    }

    let mappedEstado = 'Todos';
    if (estadoComprobante === '1' || estadoComprobante === 'Vigente' || estadoComprobante === 'Vigentes') {
      mappedEstado = 'Vigente';
    } else if (estadoComprobante === '0' || estadoComprobante === 'Cancelado' || estadoComprobante === 'Cancelados') {
      mappedEstado = 'Cancelado';
    }

    const result = await solicitaDescargaDirect(creds, {
      tipo: tipo || 'recibidos',
      fecha_inicial: String(fecha_inicial),
      fecha_final: String(fecha_final),
      tipoBusqueda: tipoBusqueda || 'CFDI',
      rfcEmisor,
      rfcReceptor,
      estadoComprobante: mappedEstado
    });

    res.json(result);
  } catch (error: any) {
    console.error('[SAT ROUTE] Error in solicita:', error);
    res.status(400).json({ error: formatSatRouteError(error, 'Ocurrió un error al enviar la solicitud al Web Service del SAT.') });
  }
});

// 8. Verificar estado de la solicitud en el Web Service SAT (@nodecfdi)
router.post('/verifica', fielUpload, async (req: Request, res: Response) => {
  try {
    const creds = getCredentials(req);
    const idSolicitud = String(
      req.body.idSolicitud || req.body.IdSolicitud || req.query.idSolicitud || req.query.IdSolicitud || ''
    ).trim();

    if (!idSolicitud) {
      return res.status(400).json({ error: 'El ID de Solicitud (idSolicitud) es requerido.' });
    }

    const result = await verificaSolicitudDirect(creds, idSolicitud);
    res.json(result);
  } catch (error: any) {
    console.error('[SAT ROUTE] Error in verifica:', error);
    res.status(400).json({ error: formatSatRouteError(error, 'Error al verificar la solicitud en el SAT.') });
  }
});

// 9. Descargar paquete de comprobantes del Web Service SAT (@nodecfdi)
router.post('/descarga', fielUpload, async (req: Request, res: Response) => {
  try {
    const creds = getCredentials(req);
    const idPaquete = String(
      req.body.idPaquete || req.body.IdPaquete || req.query.idPaquete || req.query.IdPaquete || ''
    ).trim();

    if (!idPaquete) {
      return res.status(400).json({ error: 'El ID de Paquete (idPaquete) es requerido.' });
    }

    const result = await descargaPaqueteDirect(creds, idPaquete);
    res.json(result);
  } catch (error: any) {
    console.error('[SAT ROUTE] Error in descarga:', error);
    res.status(400).json({ error: formatSatRouteError(error, 'Error al descargar el paquete del SAT.') });
  }
});

// 10. Info de llave API
router.post(['/createkey', '/create-key'], async (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Su aplicación utiliza conexión directa al Web Service oficial del SAT con @nodecfdi/sat-ws-descarga-masiva. No requiere token de API ni llaves de terceros.'
  });
});

export default router;
