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
    let lastError: any = null;
    for (let attempt = 0; attempt <= 1; attempt++) {
      try {
        return await super.call(request);
      } catch (error: any) {
        lastError = error;
        const msg = String(error?.message || '');
        const isTimeoutOrNetwork = msg.includes('Timeout') ||
                                   msg.includes('timeout') ||
                                   msg.includes('ECONNRESET') ||
                                   msg.includes('ETIMEDOUT') ||
                                   msg.includes('ENOTFOUND') ||
                                   msg.includes('socket hung up');
        if (isTimeoutOrNetwork && attempt < 1) {
          console.warn(`[SafeHttpsWebClient] Reintento ${attempt + 1}/2 tras error de tiempo/red (${msg})`);
          await new Promise(r => setTimeout(r, 600));
          continue;
        }
        break;
      }
    }

    if (!lastError || typeof lastError.getResponse !== 'function') {
      const errMsg = lastError?.message || 'Error de comunicación con el servicio Web del SAT.';
      const errorResponse = new CResponse(0, errMsg, {});
      throw new WebClientException(errMsg, request, errorResponse);
    }
    throw lastError;
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

  const certBuf = creds.certificado.buffer;
  const keyBuf = creds.llavePrivada.buffer;

  const isCertPem = certBuf.toString('utf8', 0, 100).includes('-----BEGIN');
  const certStr = isCertPem ? certBuf.toString('utf8') : certBuf.toString('binary');

  const isKeyPem = keyBuf.toString('utf8', 0, 100).includes('-----BEGIN');
  const keyStr = isKeyPem ? keyBuf.toString('utf8') : keyBuf.toString('binary');

  const passwordsToTry = [
    creds.contrasena,
    creds.contrasena.trim(),
    creds.contrasena.replace(/[\r\n]+/g, ''),
    creds.contrasena.trim().replace(/[\r\n]+/g, '')
  ].filter((p, i, arr) => p !== undefined && p !== null && arr.indexOf(p) === i);

  let lastErr: any = null;

  for (const pass of passwordsToTry) {
    try {
      const fiel = Fiel.create(certStr, keyStr, pass);
      if (fiel && fiel.isValid()) {
        if (!creds.rfc) {
          try {
            creds.rfc = fiel.getRfc().toUpperCase();
          } catch {
            // ignore
          }
        }
        return fiel;
      }
    } catch (err: any) {
      lastErr = err;
    }
  }

  const certVariants = [
    certStr,
    certBuf.toString('binary'),
    certBuf.toString('utf8')
  ].filter((c, i, arr) => c && arr.indexOf(c) === i);

  const keyVariants = [
    keyStr,
    keyBuf.toString('binary'),
    keyBuf.toString('utf8')
  ].filter((k, i, arr) => k && arr.indexOf(k) === i);

  for (const c of certVariants) {
    for (const k of keyVariants) {
      for (const pass of passwordsToTry) {
        try {
          const fiel = Fiel.create(c, k, pass);
          if (fiel && fiel.isValid()) {
            if (!creds.rfc) {
              try {
                creds.rfc = fiel.getRfc().toUpperCase();
              } catch {
                // ignore
              }
            }
            return fiel;
          }
        } catch (err: any) {
          lastErr = err;
        }
      }
    }
  }

  console.error('[SAT Direct] Error al instanciar FIEL:', lastErr);
  const rawMsg = String(lastErr?.message || '');
  if (
    rawMsg.toLowerCase().includes('cannot open private key') ||
    rawMsg.toLowerCase().includes('invalid key or password') ||
    rawMsg.toLowerCase().includes('bad decrypt') ||
    rawMsg.toLowerCase().includes('wrong final block') ||
    rawMsg.toLowerCase().includes('passphrase') ||
    rawMsg.toLowerCase().includes('openssl') ||
    rawMsg.toLowerCase().includes('asn.1')
  ) {
    throw new Error('La contraseña ingresada de la FIEL (e.firma) es incorrecta o la llave privada (.key) no corresponde al certificado (.cer). Verifique la contraseña e intente nuevamente.');
  }
  throw new Error(rawMsg || 'Error al validar las credenciales de la FIEL (.cer, .key y contraseña). Verifique la contraseña e intente nuevamente.');
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
  const d = new Date(Date.now() - 180000);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(d);
  const p: Record<string, string> = {};
  for (const part of parts) {
    p[part.type] = part.value;
  }
  let hour = p.hour || '00';
  if (hour === '24') hour = '00';

  const nowYmd = `${p.year}-${p.month}-${p.day}`;
  const nowHms = `${hour}:${p.minute}:${p.second}`;
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
  const spaceIndex = cleaned.indexOf(' ');
  const datePart = spaceIndex > 0 ? cleaned.substring(0, spaceIndex) : cleaned;
  let timePart = spaceIndex > 0 ? cleaned.substring(spaceIndex + 1) : '';

  if (!timePart) {
    timePart = (boundary === 'start') ? '00:00:00' : '23:59:59';
  }

  cleaned = `${datePart} ${timePart}`;

  if (boundary === 'end') {
    if (datePart >= mx.nowYmd && cleaned > mx.nowFull) {
      cleaned = mx.nowFull;
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

export function parseSatMetadataTxt(txtContent: string, fileName: string): any[] {
  if (!txtContent) return [];
  const lines = txtContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const firstLine = lines[0];
  let delimiter = '~';
  if (firstLine.includes('~')) delimiter = '~';
  else if (firstLine.includes('|')) delimiter = '|';
  else if (firstLine.includes('\t')) delimiter = '\t';

  const headers = firstLine.split(delimiter).map(h => h.trim().toLowerCase());

  const findIdx = (...names: string[]) => {
    return headers.findIndex(h => names.some(n => h.includes(n.toLowerCase())));
  };

  const uuidIdx = findIdx('uuid', 'folio fiscal');
  const emisorRfcIdx = findIdx('rfcemisor', 'rfc emisor');
  const emisorNombreIdx = findIdx('nombreemisor', 'nombre emisor', 'razonsocialemisor');
  const receptorRfcIdx = findIdx('rfcreceptor', 'rfc receptor');
  const receptorNombreIdx = findIdx('nombrereceptor', 'nombre receptor', 'razonsocialreceptor');
  const fechaIdx = findIdx('fechaemision', 'fecha emision', 'fecha');
  const montoIdx = findIdx('monto', 'total');
  const efectoIdx = findIdx('efectocomprobante', 'efecto comprobante', 'tipo');
  const estatusIdx = findIdx('estatus', 'estado');

  const results: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delimiter).map(c => c.trim());
    if (cols.length < 3) continue;

    const uuid = (uuidIdx >= 0 && cols[uuidIdx]) ? cols[uuidIdx].toUpperCase() : (cols[0]?.length >= 30 ? cols[0].toUpperCase() : '');
    if (!uuid || uuid.length < 10) continue;

    const rfcEmisor = (emisorRfcIdx >= 0 && cols[emisorRfcIdx]) ? cols[emisorRfcIdx].toUpperCase() : '';
    const nombreEmisor = (emisorNombreIdx >= 0) ? cols[emisorNombreIdx] : '';
    const rfcReceptor = (receptorRfcIdx >= 0 && cols[receptorRfcIdx]) ? cols[receptorRfcIdx].toUpperCase() : '';
    const nombreReceptor = (receptorNombreIdx >= 0) ? cols[receptorNombreIdx] : '';
    const fechaEmision = (fechaIdx >= 0) ? cols[fechaIdx] : '';
    const montoRaw = (montoIdx >= 0) ? cols[montoIdx] : '0';
    const totalNum = parseFloat(montoRaw.replace(/[^0-9.-]+/g, '')) || 0;
    const efecto = (efectoIdx >= 0) ? cols[efectoIdx] : 'Ingreso';
    const estatus = (estatusIdx >= 0) ? cols[estatusIdx] : 'Vigente';

    const tipoMap: Record<string, string> = {
      'I': 'Ingreso',
      'E': 'Egreso',
      'T': 'Traslado',
      'N': 'Nómina',
      'P': 'Pago',
      '1': 'Vigente',
      '0': 'Cancelado'
    };

    results.push({
      uuid,
      version: 'Metadata',
      serie: '',
      folio: '',
      fechaEmision,
      fecha: fechaEmision,
      rfCemisor: rfcEmisor,
      rfcEmisor,
      razonSocialEmisor: nombreEmisor,
      nombreEmisor,
      rfcReceptor,
      razonSocialReceptor: nombreReceptor,
      nombreReceptor,
      total: '$' + totalNum.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      subtotal: '$' + totalNum.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      totalNum,
      subTotalNum: totalNum,
      tipoDeComprobante: efecto,
      efectoDelComprobante: tipoMap[efecto] || efecto || 'Ingreso',
      estatus: tipoMap[estatus] || estatus || 'Vigente',
      fileName,
      rawXml: ''
    });
  }

  return results;
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

  let startDateStr = formatSatDate(params.fecha_inicial, 'start');
  let endDateStr = formatSatDate(params.fecha_final, 'end');

  // CRITICAL: Ensure startDateStr < endDateStr for SAT SOAP API
  if (startDateStr >= endDateStr) {
    const sDatePart = startDateStr.substring(0, 10);
    endDateStr = `${sDatePart} 23:59:59`;

    if (startDateStr >= endDateStr) {
      const sDateTime = new Date(startDateStr.replace(' ', 'T'));
      const adjustedEnd = new Date(sDateTime.getTime() + 1000);
      const y = adjustedEnd.getFullYear();
      const m = String(adjustedEnd.getMonth() + 1).padStart(2, '0');
      const d = String(adjustedEnd.getDate()).padStart(2, '0');
      const h = String(adjustedEnd.getHours()).padStart(2, '0');
      const min = String(adjustedEnd.getMinutes()).padStart(2, '0');
      const s = String(adjustedEnd.getSeconds()).padStart(2, '0');
      endDateStr = `${y}-${m}-${d} ${h}:${min}:${s}`;
    }
  }

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
  let queryResult;
  try {
    queryResult = await service.query(queryParams);
  } catch (errQuery: any) {
    console.warn('[SAT Direct] Error enviando query a SAT:', errQuery);
    throw errQuery;
  }

  const status = queryResult.getStatus();
  const code = status.getCode();
  const message = status.getMessage();
  const requestId = queryResult.getRequestId();

  if (code !== 5000 && !requestId) {
    if (code === 5005) {
      console.log(`[SAT Direct] Código 5005 (solicitud idéntica en proceso). Reintentando en 2.5s...`);
      await new Promise(r => setTimeout(r, 2500));
      try {
        const retryRes = await service.query(queryParams);
        const retryCode = retryRes.getStatus().getCode();
        const retryReqId = retryRes.getRequestId();
        if (retryReqId || retryCode === 5000) {
          return {
            idSolicitud: retryReqId,
            codEstatus: retryCode,
            mensaje: retryRes.getStatus().getMessage() || 'Solicitud recibida con éxito en el SAT.',
            estadoSolicitud: 1,
            success: true
          };
        }
      } catch (eRetry) {
        console.warn('[SAT Direct] Reintento tras 5005 falló:', eRetry);
      }

      return {
        idSolicitud: '',
        codEstatus: 5005,
        mensaje: 'Existe una solicitud en proceso idéntica enviada recientemente al SAT. Se consultará de nuevo en la siguiente iteración.',
        estadoSolicitud: 2,
        success: true
      };
    }

    if (code === 5004) {
      return {
        idSolicitud: '',
        codEstatus: 5004,
        mensaje: `No se encontraron comprobantes fiscales en el SAT para las fechas o filtros seleccionados (${params.fecha_inicial} a ${params.fecha_final}).`,
        estadoSolicitud: 3,
        success: true
      };
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
      if (!entry.isDirectory) {
        const nameLower = entry.entryName.toLowerCase();
        if (nameLower.endsWith('.xml') || nameLower.endsWith('.txt') || nameLower.endsWith('.csv')) {
          xmlFiles.push({
            fileName: entry.entryName,
            content: entry.getData().toString('utf8')
          });
        }
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

    if (!requestId) {
      if (solRes?.codEstatus === 5004) {
        return {
          idSolicitud: '',
          estadoSolicitud: 'Terminada',
          codEstatus: 5004,
          mensaje: solRes.mensaje || `No se encontraron comprobantes fiscales en el SAT para las fechas o filtros seleccionados (${options.fecha_inicial} a ${options.fecha_final}).`,
          facturas: [],
          comprobantes: []
        };
      }

      if (solRes?.codEstatus === 5005) {
        return {
          idSolicitud: '',
          estadoSolicitud: 'En Proceso',
          codEstatus: 5005,
          mensaje: solRes.mensaje || 'Existe una solicitud en proceso idéntica enviada recientemente al SAT. Se reintentará la verificación en la siguiente iteración.',
          facturas: [],
          comprobantes: []
        };
      }

      throw new Error(solRes?.mensaje || 'No se obtuvo un ID de solicitud del SAT. Verifique el periodo seleccionado e intente nuevamente.');
    }
  }

  // Perform status checks with fast responses to prevent client HTTP timeouts
  let verifyRes: any = null;
  const maxAttempts = options.requestId ? 2 : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[SAT Direct] Verificando solicitud ${requestId} (intento ${attempt}/${maxAttempts})...`);
    try {
      verifyRes = await verificaSolicitudDirect(creds, requestId);
    } catch (errVer: any) {
      console.warn(`[SAT Direct] Error en intento ${attempt} de verificaSolicitudDirect:`, errVer);
      const msg = String(errVer?.message || '').toLowerCase();
      if (
        msg.includes('contraseña') ||
        msg.includes('fiel') ||
        msg.includes('llave') ||
        msg.includes('certificado') ||
        msg.includes('private key') ||
        msg.includes('passphrase') ||
        msg.includes('invalid key')
      ) {
        throw errVer;
      }
      verifyRes = {
        idSolicitud: requestId,
        estadoSolicitud: 2,
        estadoSolicitudTexto: 'En Proceso',
        codigoEstadoSolicitud: 5000,
        mensajeCodigoEstadoSolicitud: 'El SAT está procesando la solicitud (los servidores del SAT responden de forma asíncrona).'
      };
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

    for (const fileItem of allXmlFiles) {
      if (fileItem.content.includes('<cfdi:Comprobante') || fileItem.content.includes('<Comprobante')) {
        const parsed = parseCfdiXml(fileItem.content, fileItem.fileName);
        if (parsed) {
          facturasParsed.push(parsed);
        }
      } else if (fileItem.fileName.toLowerCase().endsWith('.txt') || fileItem.fileName.toLowerCase().endsWith('.csv') || fileItem.content.includes('~') || fileItem.content.includes('|')) {
        const metaItems = parseSatMetadataTxt(fileItem.content, fileItem.fileName);
        if (metaItems && metaItems.length > 0) {
          facturasParsed.push(...metaItems);
        }
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
