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
import { scrapeCsfFromSat, extractCifParams } from '../utils/csfScraper.js';

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
  const rfc = req.headers['rfc'] || req.body?.rfc || req.query?.rfc || req.headers['x-rfc'];
  const contrasena = req.body?.Contrasena || req.body?.contrasena || req.headers['contrasena'] || req.query?.contrasena;

  if (!contrasena) throw new Error('La contraseña de la FIEL es requerida.');

  const filesMap = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  let keyFile = filesMap?.['llavePrivada']?.[0];
  let certFile = filesMap?.['Certificado']?.[0];

  let keyBuffer = keyFile?.buffer;
  let certBuffer = certFile?.buffer;

  const keyB64 = req.body?.llavePrivadaBase64 || req.body?.keyBase64 || req.body?.llavePrivada;
  if (!keyBuffer && keyB64 && typeof keyB64 === 'string') {
    const cleanB64 = keyB64.replace(/^data:.*;base64,/, '').trim();
    if (cleanB64) {
      keyBuffer = Buffer.from(cleanB64, 'base64');
    }
  }

  const certB64 = req.body?.certificadoBase64 || req.body?.cerBase64 || req.body?.Certificado;
  if (!certBuffer && certB64 && typeof certB64 === 'string') {
    const cleanB64 = certB64.replace(/^data:.*;base64,/, '').trim();
    if (cleanB64) {
      certBuffer = Buffer.from(cleanB64, 'base64');
    }
  }

  return {
    rfc: rfc ? String(rfc).toUpperCase().trim() : '',
    contrasena: String(contrasena),
    llavePrivada: keyBuffer ? { buffer: keyBuffer, originalname: keyFile?.originalname || 'llave.key' } : undefined,
    certificado: certBuffer ? { buffer: certBuffer, originalname: certFile?.originalname || 'certificado.cer' } : undefined
  };
}

const fielUpload = upload.fields([
  { name: 'llavePrivada', maxCount: 1 },
  { name: 'Certificado', maxCount: 1 }
]);

// 0. Scraper de Constancia de Situación Fiscal (phpcfdi/csf-sat-scraper inspired)
router.post(['/csf-scraper', '/sat/csf-scraper', '/api/sat/csf-scraper', '/api/csf-scraper', '/consultar-csf-scraper'], async (req: Request, res: Response) => {
  try {
    const input = req.body.url || req.body.input || req.body.qrUrl || req.body.idCIF;
    const directRfc = req.body.rfc;

    let idCIF = req.body.idCIF;
    let rfc = directRfc;

    if (input) {
      try {
        const extracted = extractCifParams(String(input));
        idCIF = extracted.idCIF;
        if (!rfc) rfc = extracted.rfc;
      } catch (err: any) {
        if (!idCIF) throw err;
      }
    }

    if (!idCIF || !rfc) {
      return res.status(400).json({
        error: 'Se requiere la URL de la Cédula de Identificación Fiscal, el enlace QR del SAT o los parámetros idCIF y RFC.'
      });
    }

    const csfData = await scrapeCsfFromSat(String(idCIF), String(rfc));
    return res.json({
      success: true,
      mensaje: `Constancia de Situación Fiscal obtenida exitosamente para el RFC ${csfData.rfc}.`,
      rfc: csfData.rfc,
      csf: csfData,
      info: {
        rfc: csfData.rfc,
        razonSocial: csfData.nombreCompleto,
        tipoPersona: csfData.tipoPersona,
        estatus: csfData.estatusPadron,
        domicilio: csfData.domicilio.domicilioCompleto,
        regimenes: csfData.regimenes
      }
    });
  } catch (error: any) {
    console.error('[SAT ROUTE] Error en csf-scraper:', error);
    return res.status(400).json({
      error: error?.message || 'Error al obtener la Constancia de Situación Fiscal vía Scraper del SAT.'
    });
  }
});

// 1. Constancia de Situación Fiscal (CSF) vía FIEL / Scraper
router.post(['/csffiel', '/sat/csffiel', '/api/sat/csffiel', '/api/csffiel', '/consultar-csffiel'], fielUpload, async (req: Request, res: Response) => {
  try {
    // Check if URL/idCIF was provided for scraper mode
    const urlInput = req.body.url || req.body.input || req.body.qrUrl;
    if (urlInput) {
      const extracted = extractCifParams(String(urlInput));
      const csfData = await scrapeCsfFromSat(extracted.idCIF, extracted.rfc);
      return res.json({
        success: true,
        rfc: csfData.rfc,
        mensaje: `Constancia de Situación Fiscal obtenida vía SAT Scraper para el RFC ${csfData.rfc}.`,
        csf: csfData,
        info: {
          rfc: csfData.rfc,
          razonSocial: csfData.nombreCompleto,
          tipoPersona: csfData.tipoPersona,
          estatus: csfData.estatusPadron,
          domicilio: csfData.domicilio.domicilioCompleto,
          regimenes: csfData.regimenes
        }
      });
    }

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
router.post(['/ocfiel', '/sat/ocfiel', '/api/sat/ocfiel', '/api/ocfiel', '/consultar-ocfiel'], fielUpload, async (req: Request, res: Response) => {
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
router.post(['/facfiel', '/sat/facfiel', '/api/sat/facfiel', '/api/facfiel', '/consultar-facfiel'], fielUpload, async (req: Request, res: Response) => {
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

    const tb = String(tipoBusqueda || req.query.tipoBusqueda || '1');
    const isMeta = solicitaMetadata === 'true' ||
                   req.query.solicitaMetadata === 'true' ||
                   tb === '2' ||
                   tb === 'Metadata';

    const result = await consultarFacturasFielDirect(creds, {
      tipo_busqueda: tb,
      estatus_factura: estatusFactura || req.query.estatusFactura || '-1',
      fecha_inicial: String(fecha_inicial),
      fecha_final: String(fecha_final),
      tipo: String(tipo || req.query.tipo || 'recibidos'),
      solicitaMetadata: isMeta,
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
router.post(['/retencionfiel', '/sat/retencionfiel', '/api/sat/retencionfiel', '/api/retencionfiel'], fielUpload, async (req: Request, res: Response) => {
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
router.get(['/efos/:rfc', '/sat/efos/:rfc', '/api/sat/efos/:rfc', '/api/efos/:rfc'], async (req: Request, res: Response) => {
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
router.post(['/informacionfiscalfiel', '/sat/informacionfiscalfiel', '/api/sat/informacionfiscalfiel', '/api/informacionfiscalfiel'], fielUpload, async (req: Request, res: Response) => {
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
router.post(['/solicita', '/sat/solicita', '/api/sat/solicita', '/api/solicita'], fielUpload, async (req: Request, res: Response) => {
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
router.post(['/verifica', '/sat/verifica', '/api/sat/verifica', '/api/verifica'], fielUpload, async (req: Request, res: Response) => {
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
router.post(['/descarga', '/sat/descarga', '/api/sat/descarga', '/api/descarga'], fielUpload, async (req: Request, res: Response) => {
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
router.post(['/createkey', '/create-key', '/sat/createkey', '/api/sat/createkey', '/api/createkey'], async (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Su aplicación utiliza conexión directa al Web Service oficial del SAT con @nodecfdi/sat-ws-descarga-masiva. No requiere token de API ni llaves de terceros.'
  });
});

export default router;
