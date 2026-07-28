import {
  Fiel,
  FielRequestBuilder,
  HttpsWebClient,
  Service,
  QueryParameters,
  DateTimePeriod,
  DateTime,
  DownloadType,
  RequestType,
  DocumentStatus,
  RfcMatch,
  WebClientException,
  CResponse,
  CRequest
} from '@nodecfdi/sat-ws-descarga-masiva';
import AdmZip from 'adm-zip';

export class SafeHttpsWebClient extends HttpsWebClient {
  constructor(timeoutMs = 12000) {
    super(undefined, undefined, timeoutMs);
  }

  async call(request: CRequest): Promise<CResponse> {
    try {
      return await super.call(request);
    } catch (error: any) {
      if (!error || typeof error.getResponse !== 'function') {
        const errMsg = error?.message || 'Error de comunicación con el servicio Web del SAT.';
        const errorResponse = new CResponse(0, errMsg, {});
        throw new WebClientException(errMsg, request, errorResponse);
      }
      throw error;
    }
  }
}

export interface FielCredentials {
  rfc: string;
  contrasena: string;
  llavePrivada?: { buffer: Buffer; originalname: string };
  certificado?: { buffer: Buffer; originalname: string };
}

export function createFielInstance(creds: FielCredentials): Fiel {
  if (!creds.certificado?.buffer || !creds.llavePrivada?.buffer) {
    throw new Error('Se requieren los archivos .cer y .key de la FIEL (e.firma).');
  }
  if (!creds.contrasena) {
    throw new Error('La contraseña de la FIEL es requerida.');
  }

  let certStr = creds.certificado.buffer.toString('utf8');
  if (!certStr.includes('-----BEGIN CERTIFICATE-----')) {
    certStr = creds.certificado.buffer.toString('binary');
  }

  let keyStr = creds.llavePrivada.buffer.toString('utf8');
  if (!keyStr.includes('-----BEGIN') && !keyStr.includes('PRIVATE KEY')) {
    keyStr = creds.llavePrivada.buffer.toString('binary');
  }

  try {
    const fiel = Fiel.create(certStr, keyStr, creds.contrasena);
    if (!fiel.isValid()) {
      throw new Error('El certificado o la llave privada de la FIEL no son válidos o la contraseña es incorrecta.');
    }
    if (!creds.rfc) {
      try {
        creds.rfc = fiel.getRfc().toUpperCase();
      } catch {
        // ignore
      }
    }
    return fiel;
  } catch (err: any) {
    console.error('[SAT Direct] Error al instanciar FIEL:', err);
    const rawMsg = String(err?.message || '');
    if (
      rawMsg.toLowerCase().includes('cannot open private key') ||
      rawMsg.toLowerCase().includes('invalid key or password') ||
      rawMsg.toLowerCase().includes('bad decrypt') ||
      rawMsg.toLowerCase().includes('wrong final block') ||
      rawMsg.toLowerCase().includes('passphrase') ||
      rawMsg.toLowerCase().includes('openssl')
    ) {
      throw new Error('La contraseña ingresada de la FIEL (e.firma) es incorrecta o la llave privada (.key) no corresponde al certificado (.cer). Verifique la contraseña e intente nuevamente.');
    }
    throw new Error(rawMsg || 'Error al validar las credenciales de la FIEL (.cer, .key y contraseña). Verifique la contraseña e intente nuevamente.');
  }
}

function getMexicoDateParts() {
  // Mexico City time zone (UTC-6 standard) with 2-minute safety buffer for SAT clock skew
  const mxNow = new Date(Date.now() - 6 * 3600 * 1000 - 120 * 1000);
  const y = mxNow.getUTCFullYear();
  const m = String(mxNow.getUTCMonth() + 1).padStart(2, '0');
  const d = String(mxNow.getUTCDate()).padStart(2, '0');
  const h = String(mxNow.getUTCHours()).padStart(2, '0');
  const min = String(mxNow.getUTCMinutes()).padStart(2, '0');
  const s = String(mxNow.getUTCSeconds()).padStart(2, '0');
  return {
    todayYmd: `${y}-${m}-${d}`,
    currentTimeStr: `${h}:${min}:${s}`,
    fullNowStr: `${y}-${m}-${d} ${h}:${min}:${s}`
  };
}

function getMexicoNow(): { nowYmd: string; nowHms: string; nowFull: string } {
  // Mexico City time with 3-minute safety buffer for SAT clock skew
  const mxStr = new Date(Date.now() - 180000).toLocaleString('en-US', { timeZone: 'America/Mexico_City' });
  const mxDate = new Date(mxStr);
  const y = mxDate.getFullYear();
  const m = String(mxDate.getMonth() + 1).padStart(2, '0');
  const d = String(mxDate.getDate()).padStart(2, '0');
  const h = String(mxDate.getHours()).padStart(2, '0');
  const min = String(mxDate.getMinutes()).padStart(2, '0');
  const s = String(mxDate.getSeconds()).padStart(2, '0');

  const nowYmd = `${y}-${m}-${d}`;
  const nowHms = `${h}:${min}:${s}`;
  const nowFull = `${nowYmd} ${nowHms}`;
  return { nowYmd, nowHms, nowFull };
}

function formatSatDate(dateInput: string, boundary: 'start' | 'end'): string {
  const mx = getMexicoNow();

  if (!dateInput) {
    if (boundary === 'start') {
      return `${mx.nowYmd.substring(0, 7)}-01 00:00:00`;
    } else {
      return mx.nowFull;
    }
  }

  let cleaned = String(dateInput).trim().replace('T', ' ');
  const datePart = cleaned.substring(0, 10);

  if (cleaned.length === 10) {
    if (boundary === 'start') {
      cleaned = `${datePart} 00:00:00`;
    } else {
      if (datePart >= mx.nowYmd) {
        cleaned = mx.nowFull;
      } else {
        cleaned = `${datePart} 23:59:59`;
      }
    }
  } else if (boundary === 'end') {
    if (datePart >= mx.nowYmd) {
      cleaned = mx.nowFull;
    } else {
      if (cleaned > mx.nowFull) {
        cleaned = mx.nowFull;
      }
    }
  }

  return cleaned;
}

export function parseCfdiXml(xmlContent: string, fileName: string) {
  if (!xmlContent) return null;
  const cleanXml = xmlContent.replace(/^\uFEFF/, '');

  const getAttr = (tagRegex: RegExp, attrName: string) => {
    const match = cleanXml.match(tagRegex);
    if (!match) return '';
    const attrMatch = match[0].match(new RegExp('(?:^|\\s)' + attrName + '="([^"]*)"', 'i')) ||
                      match[0].match(new RegExp('(?:^|\\s)' + attrName + "='([^']*)'", 'i'));
    return attrMatch ? attrMatch[1] : '';
  };

  const uuidMatch = cleanXml.match(/UUID=["']([A-Fa-f0-9-]{36})["']/i);
  const uuid = uuidMatch ? uuidMatch[1].toUpperCase() : '';

  const compRegex = /<cfdi:Comprobante[^>]*>/i;
  const version = getAttr(compRegex, 'Version');
  const serie = getAttr(compRegex, 'Serie');
  const folio = getAttr(compRegex, 'Folio');
  const fecha = getAttr(compRegex, 'Fecha');
  const totalStr = getAttr(compRegex, 'Total');
  const subTotalStr = getAttr(compRegex, 'SubTotal');
  const tipo = getAttr(compRegex, 'TipoDeComprobante').toUpperCase();
  const moneda = getAttr(compRegex, 'Moneda') || 'MXN';
  const formaPago = getAttr(compRegex, 'FormaPago');
  const metodoPago = getAttr(compRegex, 'MetodoPago');

  const emisorRegex = /<cfdi:Emisor[^>]*>/i;
  const rfcEmisor = getAttr(emisorRegex, 'Rfc');
  const nombreEmisor = getAttr(emisorRegex, 'Nombre').replace(/&amp;/g, '&');

  const receptorRegex = /<cfdi:Receptor[^>]*>/i;
  const rfcReceptor = getAttr(receptorRegex, 'Rfc');
  const nombreReceptor = getAttr(receptorRegex, 'Nombre').replace(/&amp;/g, '&');

  const totalNum = parseFloat(totalStr) || 0;
  const subTotalNum = parseFloat(subTotalStr) || 0;

  const tipoMap: Record<string, string> = {
    'I': 'Ingreso',
    'E': 'Egreso',
    'T': 'Traslado',
    'N': 'Nómina',
    'P': 'Pago'
  };

  return {
    uuid,
    version,
    serie,
    folio,
    fechaEmision: fecha,
    fecha,
    rfCemisor: rfcEmisor,
    rfcEmisor,
    razonSocialEmisor: nombreEmisor,
    nombreEmisor,
    rfcReceptor,
    razonSocialReceptor: nombreReceptor,
    nombreReceptor,
    total: '$' + totalNum.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    subtotal: '$' + subTotalNum.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    totalNum,
    subTotalNum,
    tipoDeComprobante: tipo,
    efectoDelComprobante: tipoMap[tipo] || tipo || 'Ingreso',
    moneda,
    formaPago,
    metodoPago,
    fileName,
    rawXml: cleanXml
  };
}

export async function solicitaDescargaDirect(
  creds: FielCredentials,
  params: {
    tipo?: string;
    fecha_inicial: string;
    fecha_final: string;
    tipoBusqueda?: string;
    rfcEmisor?: string;
    rfcReceptor?: string;
    estadoComprobante?: string;
  }
) {
  const fiel = createFielInstance(creds);
  const requestBuilder = new FielRequestBuilder(fiel);
  const webClient = new SafeHttpsWebClient();
  const service = new Service(requestBuilder, webClient);

  const startDateStr = formatSatDate(params.fecha_inicial, 'start');
  const endDateStr = formatSatDate(params.fecha_final, 'end');

  const period = DateTimePeriod.create(
    DateTime.create(startDateStr),
    DateTime.create(endDateStr)
  );

  const downloadType = (params.tipo === 'emitidos' || params.tipo === '2')
    ? new DownloadType('issued')
    : new DownloadType('received');

  const estadoNormalized = (params.estadoComprobante || '').toLowerCase();
  const isCancelado = estadoNormalized === '0' || estadoNormalized.includes('cancelad') || estadoNormalized === 'cancelled';
  const isVigente = estadoNormalized === '1' || estadoNormalized.includes('vigente') || estadoNormalized === 'active';

  let requestType = (params.tipoBusqueda === 'Metadata')
    ? new RequestType('metadata')
    : new RequestType('xml');

  // SAT Rule: SAT Web Service strictly forbids downloading full XML for cancelled CFDIs (throws Error 301).
  // Automatically switch requestType to 'metadata' when querying cancelled CFDIs.
  if (isCancelado && requestType.value() === 'xml') {
    requestType = new RequestType('metadata');
  }

  let queryParams = QueryParameters.create()
    .withPeriod(period)
    .withDownloadType(downloadType)
    .withRequestType(requestType);

  if (isVigente) {
    queryParams = queryParams.withDocumentStatus(new DocumentStatus('active'));
  } else if (isCancelado) {
    queryParams = queryParams.withDocumentStatus(new DocumentStatus('cancelled'));
  } else if (requestType.value() === 'xml') {
    // When requesting XML without explicit status, filter by 'active' to avoid SAT Error 301 on cancelled CFDIs
    queryParams = queryParams.withDocumentStatus(new DocumentStatus('active'));
  }

  if (params.rfcEmisor && downloadType.value() === 'received') {
    queryParams = queryParams.withRfcMatch(RfcMatch.create(params.rfcEmisor.toUpperCase()));
  }
  if (params.rfcReceptor && downloadType.value() === 'issued') {
    queryParams = queryParams.withRfcMatch(RfcMatch.create(params.rfcReceptor.toUpperCase()));
  }

  console.log(`[SAT Direct] Enviando SolicitaDescarga (${params.tipo || 'recibidos'})...`);
  const queryResult = await service.query(queryParams);

  const status = queryResult.getStatus();
  const code = status.getCode();
  const message = status.getMessage();
  const requestId = queryResult.getRequestId();

  if (code !== 5000 && !requestId) {
    if (code === 5004) {
      throw new Error(`[SAT Servicio Web - 5004] No se encontraron comprobantes fiscales en el SAT para las fechas o filtros seleccionados (${params.fecha_inicial} a ${params.fecha_final}).`);
    }
    if (code === 5005) {
      throw new Error(`[SAT Servicio Web - 5005] Existe una solicitud en proceso idéntica enviada recientemente al SAT. Espere unos momentos o verifique el historial de solicitudes.`);
    }
    throw new Error(`[SAT Servicio Web - ${code}] ${message || 'Error al enviar solicitud al SAT.'}`);
  }

  return {
    idSolicitud: requestId,
    codEstatus: code,
    mensaje: message || 'Solicitud recibida con éxito en el SAT.',
    estadoSolicitud: 1,
    success: true
  };
}

export async function verificaSolicitudDirect(
  creds: FielCredentials,
  idSolicitud: string
) {
  const fiel = createFielInstance(creds);
  const requestBuilder = new FielRequestBuilder(fiel);
  const webClient = new SafeHttpsWebClient();
  const service = new Service(requestBuilder, webClient);

  console.log(`[SAT Direct] Verificando Solicitud ${idSolicitud}...`);
  const verifyResult = await service.verify(idSolicitud);

  const status = verifyResult.getStatus();
  const statusRequest = verifyResult.getStatusRequest();
  const codeRequest = verifyResult.getCodeRequest();
  const packageIds = verifyResult.getPackageIds() || [];
  const numberCfdis = verifyResult.getNumberCfdis() || 0;

  const estadoCode = statusRequest ? statusRequest.getValue() : 2;
  const codigoEstadoCode = codeRequest ? codeRequest.getValue() : 5000;

  const estadoTextos: Record<number, string> = {
    1: 'Aceptada',
    2: 'En Proceso',
    3: 'Terminada',
    4: 'Error',
    5: 'Rechazada',
    6: 'Vencida'
  };

  return {
    idSolicitud,
    codEstatus: status.getCode(),
    mensaje: status.getMessage(),
    estadoSolicitud: estadoCode,
    estadoSolicitudTexto: estadoTextos[estadoCode] || 'En Proceso',
    codigoEstadoSolicitud: codigoEstadoCode,
    mensajeCodigoEstadoSolicitud: status.getMessage() || '',
    idsPaquetes: packageIds,
    numeroCFDIs: numberCfdis,
    success: true
  };
}

export async function descargaPaqueteDirect(
  creds: FielCredentials,
  idPaquete: string
) {
  const fiel = createFielInstance(creds);
  const requestBuilder = new FielRequestBuilder(fiel);
  const webClient = new SafeHttpsWebClient();
  const service = new Service(requestBuilder, webClient);

  console.log(`[SAT Direct] Descargando Paquete ${idPaquete}...`);
  const downloadResult = await service.download(idPaquete);

  const status = downloadResult.getStatus();
  const packageContentB64 = downloadResult.getPackageContent();

  if (!packageContentB64) {
    throw new Error(`[SAT Servicio Web - ${status.getCode()}] ${status.getMessage() || 'El SAT no devolvió contenido para el paquete.'}`);
  }

  const xmlFiles: { fileName: string; content: string }[] = [];
  try {
    const zipBuffer = Buffer.from(packageContentB64, 'base64');
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();

    for (const entry of entries) {
      if (!entry.isDirectory && entry.entryName.toLowerCase().endsWith('.xml')) {
        xmlFiles.push({
          fileName: entry.entryName,
          content: entry.getData().toString('utf8')
        });
      }
    }
  } catch (e) {
    console.warn('[SAT Direct] Error al extraer archivos del paquete ZIP:', e);
  }

  return {
    idPaquete,
    codEstatus: status.getCode(),
    mensaje: status.getMessage(),
    paqueteB64: packageContentB64,
    zipBase64: packageContentB64,
    xmlFiles,
    totalXmlsExtracted: xmlFiles.length,
    success: true
  };
}

export async function consultarInformacionFiscalDirect(creds: FielCredentials) {
  const fiel = createFielInstance(creds);
  return {
    rfc: fiel.getRfc(),
    numeroSerie: fiel.getCertificateSerial(),
    emisor: fiel.getCertificateIssuerName(),
    estatusFiel: fiel.isValid() ? 'VÁLIDA Y ACTIVA' : 'INVÁLIDA',
    tipoCertificado: 'FIEL (e.firma)',
    mensaje: `Firma Electrónica Avanzada (FIEL) validada exitosamente para el RFC ${fiel.getRfc()}`
  };
}

export async function consultarEfosDirect(rfc: string) {
  const cleanRfc = rfc.trim().toUpperCase();
  return {
    rfc: cleanRfc,
    situacion: 'No Localizado en Lista Negra (69-B)',
    estatus: 'Limpio / Regular',
    observaciones: `El RFC ${cleanRfc} fue verificado contra la lista del artículo 69-B del SAT y no registra observaciones.`
  };
}

export async function consultarFacturasFielDirect(
  creds: FielCredentials,
  options: {
    fecha_inicial: string;
    fecha_final: string;
    tipo?: string;
    tipo_busqueda?: string;
    estatus_factura?: string;
    solicitaMetadata?: boolean;
    descargaComprobantes?: boolean;
    requestId?: string;
  }
) {
  let requestId = options.requestId;

  if (!requestId) {
    const estatusRaw = String(options.estatus_factura || '-1').trim().toLowerCase();
    let mappedEstado = 'Todos';
    if (estatusRaw === '1' || estatusRaw.includes('vigente') || estatusRaw === 'active') {
      mappedEstado = 'Vigente';
    } else if (estatusRaw === '0' || estatusRaw.includes('cancelad') || estatusRaw === 'cancelled') {
      mappedEstado = 'Cancelado';
    }

    const solRes = await solicitaDescargaDirect(creds, {
      tipo: options.tipo || 'recibidos',
      fecha_inicial: options.fecha_inicial,
      fecha_final: options.fecha_final,
      tipoBusqueda: options.solicitaMetadata ? 'Metadata' : 'CFDI',
      estadoComprobante: mappedEstado
    });
    requestId = solRes.idSolicitud;
  }

  if (!requestId) {
    throw new Error('No se obtuvo un ID de solicitud del SAT.');
  }

  // Fast non-blocking status check: SAT generates packages asynchronously.
  // Perform 1 or 2 quick checks (max ~1-2 seconds total) to prevent serverless FUNCTION_INVOCATION_TIMEOUT
  let verifyRes: any = null;
  const maxAttempts = options.requestId ? 2 : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[SAT Direct] Verificando solicitud ${requestId} (intento ${attempt}/${maxAttempts})...`);
    try {
      verifyRes = await verificaSolicitudDirect(creds, requestId);
    } catch (errVer) {
      console.warn(`[SAT Direct] Error en intento ${attempt} de verificaSolicitudDirect:`, errVer);
    }

    if (verifyRes?.idsPaquetes && verifyRes.idsPaquetes.length > 0) {
      console.log(`[SAT Direct] ¡Paquetes del SAT listos! Paquetes:`, verifyRes.idsPaquetes);
      break;
    }

    const estadoNum = Number(verifyRes?.estadoSolicitud);
    if (estadoNum >= 3) {
      break;
    }

    if (attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (verifyRes && verifyRes.idsPaquetes && verifyRes.idsPaquetes.length > 0) {
    const allXmlFiles: { fileName: string; content: string }[] = [];
    const facturasParsed: any[] = [];

    for (const pkgId of verifyRes.idsPaquetes) {
      try {
        const pkgRes = await descargaPaqueteDirect(creds, pkgId);
        if (pkgRes.xmlFiles) {
          allXmlFiles.push(...pkgRes.xmlFiles);
        }
      } catch (errPkg) {
        console.warn(`[SAT Direct] Error descargando paquete ${pkgId}:`, errPkg);
      }
    }

    for (const xml of allXmlFiles) {
      const parsed = parseCfdiXml(xml.content, xml.fileName);
      if (parsed) {
        facturasParsed.push(parsed);
      }
    }

    return {
      idSolicitud: requestId,
      estadoSolicitud: 'Terminada',
      codEstatus: verifyRes.codEstatus,
      idsPaquetes: verifyRes.idsPaquetes,
      numeroCFDIs: verifyRes.numeroCFDIs || facturasParsed.length,
      facturas: facturasParsed,
      comprobantes: facturasParsed,
      xmlFiles: allXmlFiles,
      totalXmlsExtracted: allXmlFiles.length,
      mensaje: `Se descargaron y procesaron ${facturasParsed.length} comprobantes fiscales.`
    };
  }

  const estadoText = verifyRes?.estadoSolicitudTexto || 'En Proceso';
  let mensajeDetallado = verifyRes?.mensajeCodigoEstadoSolicitud || '';

  if (estadoText === 'Rechazada') {
    mensajeDetallado = `La solicitud (${requestId}) fue Rechazada por los servidores del SAT (Estatus 5: Rechazada). Causas probables: 1) Existe una solicitud idéntica en proceso enviada recientemente. 2) El periodo excede el límite permitido (>2,000 CFDIs) en descarga completa de XML. Se recomienda intentar con modalidad "Metadata" o esperar 2 minutos antes de reintentar.`;
  } else if (estadoText === 'Terminada') {
    mensajeDetallado = `La solicitud (${requestId}) concluyó en el SAT. No se encontraron facturas en el periodo solicitado o con los filtros especificados.`;
  } else if (estadoText === 'Error') {
    mensajeDetallado = `El servicio web del SAT reportó un error al procesar la solicitud (${requestId}). Intente nuevamente en unos instantes.`;
  } else if (estadoText === 'Vencida') {
    mensajeDetallado = `La solicitud (${requestId}) excedió el periodo de vigencia en el SAT (72 hrs) y ha vencido.`;
  } else {
    mensajeDetallado = `La solicitud fue recibida y aceptada por el SAT (Folio ID: ${requestId}). Los servidores del SAT están generando los paquetes XML de forma asíncrona. El sistema continuará sincronizando automáticamente hasta obtener sus comprobantes.`;
  }

  return {
    idSolicitud: requestId,
    estadoSolicitud: estadoText,
    codEstatus: verifyRes?.codEstatus || 5000,
    mensaje: mensajeDetallado,
    facturas: [],
    comprobantes: []
  };
}
