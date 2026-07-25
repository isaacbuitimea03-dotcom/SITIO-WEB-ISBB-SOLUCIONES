import { Readable } from 'stream';

const SAT_GO_BASE_URL_V2 = 'https://api.sat-go.com/api/v2';
const SAT_GO_BASE_URL_V1 = 'https://api.sat-go.com/api/v1';

const DEFAULT_FIXED_TOKEN = "eyJhbGciOiJSUzI1NiIsImNhdCI6ImNsX0I3ZDRQRDIyMkFBQSIsImtpZCI6Imluc18zQldabzhxMjR6S2pVdlVWc2pzcHppb012bUsiLCJ0eXAiOiJKV1QifQ.eyJhenAiOiJodHRwczovL3dlYi5zYXQtZ28uY29tIiwiZW1haWwiOiJpc2FhY2J1aXRpbWVhMDNAZ21haWwuY29tIiwiZXhwIjoxNzg0ODU1NzEyLCJpYXQiOjE3ODQyNTA3MTIsImlzcyI6Imh0dHBzOi8vY2xlcmsucHJlcHJvZC5zYXQtZ28uY29tIiwianRpIjoiYWIyMDQ1YjY0NmRhZWJlZDllZmUiLCJuYmYiOjE3ODQyNTA3MDcsInJvbGUiOm51bGwsInN1YiI6InVzZXJfM0RuRHYxUWptbk1XNGhHSmVUdnd6VGowN0hoIiwidXNlclV1aWQiOiJ1c2VyXzNEbkR2MVFqbW5NVzRoR0plVHZ3elRqMDdIaCIsInVzZXJuYW1lIjpudWxsfQ.glSl4l8gfNDOWD_N53PHqVyOebFjVk3-rSlmUbsRWocMMAMsgikaKW3yHeA8W56Alyq-bXZTuQJgtYd96OVH0XpyFpjm0qZj3uCK_rD1Xb0K4HI0fokL3A_7-s1ia3ADvXmIn3KQjwwcFXUwfTR--FH49rVdhVxb12S4dhMJk9ugQZtAO3Yn-h4Rwh2h8n1yj9-SSCYjWgpUz9EpdG_7a79dUq4JPjErO8KNZY_oH4d4toUBOmNHvFvY9JOYFjIm5DuT-CFRW5p7GPeTwqJELi562yhMRBSQYGZaSIZ826Jshoborl9eTsYbRt484pCk_RQdHRj0ZZWmjm4z3pH7uQ";

export interface SatGoCredentials {
  rfc: string;
  contrasena: string;
  llavePrivada?: { buffer: Buffer; originalname: string };
  certificado?: { buffer: Buffer; originalname: string };
  satGoToken?: string;
}

export function getAuthorizationHeader(userToken?: string): string {
  const token = userToken?.trim() || process.env.SAT_GO_TOKEN?.trim();
  if (token) {
    return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }
  return `Bearer ${DEFAULT_FIXED_TOKEN}`;
}

export function formatSatDate(dStr: string, defaultTime: string = '00:00:00'): string {
  if (!dStr) return '';
  let clean = dStr.replace('T', ' ').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return `${clean} ${defaultTime}`;
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(clean)) {
    return `${clean}:00`;
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(clean)) {
    return clean;
  }
  return clean;
}

async function fetchWithTimeout(url: string, options: any = {}, timeoutMs = 45000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await globalThis.fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error: any) {
    clearTimeout(id);
    if (error.name === 'AbortError' || error.message?.includes('aborted')) {
      throw new Error('Los servidores del SAT / SAT-GO no respondieron a tiempo (Timeout). Por favor reintente la operación en un par de minutos.');
    }
    throw error;
  }
}

function parseSatGoError(errorText: string, status: number): Error {
  let message = errorText;
  try {
    const parsed = JSON.parse(errorText);
    message = parsed.message || parsed.errorMessage || parsed.error || errorText;
  } catch (e) {
    // raw text
  }

  if (!message || message.length > 500 || message.trim().startsWith('<!doctype') || message.trim().startsWith('<html')) {
    return new Error(`Error ${status}: El servidor del SAT / SAT-GO respondió con un formato de página no válido.`);
  }

  const lower = message.toLowerCase();
  if (lower.includes('límite mensual') || lower.includes('limite mensual') || lower.includes('excedido')) {
    return new Error('Límite mensual de consultas excedido en el proveedor SAT-GO. El cupo de peticiones es administrado externamente por SAT-GO para la API Key actual. Para continuar o reiniciar el límite: 1) Proporcione un Token de Autorización personal de SAT-GO en el panel superior, o 2) Renueve o incremente su paquete en https://web.sat-go.com.');
  }

  if (lower.includes('timed out') || lower.includes('saturated') || lower.includes('maintenance')) {
    return new Error('Los servidores del SAT se encuentran actualmente saturados o en mantenimiento. Por favor intente de nuevo en un par de minutos.');
  }

  return new Error(message);
}

function buildFielFormData(creds: SatGoCredentials): FormData {
  const formData = new FormData();
  if (creds.llavePrivada) {
    const blob = new globalThis.Blob([creds.llavePrivada.buffer]);
    formData.append('llavePrivada', blob, creds.llavePrivada.originalname);
  }
  if (creds.certificado) {
    const blob = new globalThis.Blob([creds.certificado.buffer]);
    formData.append('Certificado', blob, creds.certificado.originalname);
  }
  formData.append('Contrasena', creds.contrasena);
  return formData;
}

// 1. Constancia de Situación Fiscal (CSF)
export async function consultarCsfFiel(creds: SatGoCredentials): Promise<{ buffer: Buffer; contentType: string }> {
  const authHeader = getAuthorizationHeader(creds.satGoToken);
  const formData = buildFielFormData(creds);

  const url = `${SAT_GO_BASE_URL_V2}/Consultar/csffiel`;
  console.log(`[SAT-GO CLIENT] Consulting CSF for RFC: ${creds.rfc}`);

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'RFC': creds.rfc,
      'Authorization': authHeader,
      'Accept': 'application/pdf, application/json, */*'
    },
    body: formData
  }, 50000);

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    const errText = await response.text();
    throw parseSatGoError(errText, response.status);
  }

  if (contentType.includes('application/json')) {
    const json = await response.json() as any;
    if (json.error || json.message) {
      throw new Error(json.error || json.message);
    }
  }

  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

// 2. Opinión de Cumplimiento (OC)
export async function consultarOpinionFiel(creds: SatGoCredentials): Promise<{ buffer: Buffer; contentType: string }> {
  const authHeader = getAuthorizationHeader(creds.satGoToken);
  const formData = buildFielFormData(creds);

  const url = `${SAT_GO_BASE_URL_V2}/Consultar/ocfiel`;
  console.log(`[SAT-GO CLIENT] Consulting OC for RFC: ${creds.rfc}`);

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'RFC': creds.rfc,
      'Authorization': authHeader,
      'Accept': 'application/pdf, application/json, */*'
    },
    body: formData
  }, 50000);

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    const errText = await response.text();
    throw parseSatGoError(errText, response.status);
  }

  if (contentType.includes('application/json')) {
    const json = await response.json() as any;
    if (json.error || json.message) {
      throw new Error(json.error || json.message);
    }
  }

  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

// 3. Consultar Facturas FIEL
export async function consultarFacturasFiel(
  creds: SatGoCredentials,
  params: {
    tipo_busqueda?: string | number; // 1 = CFDI, 2 = Metadata
    estatus_factura?: string | number; // -1 = Todos, 1 = Vigentes, 0 = Cancelados
    fecha_inicial: string;
    fecha_final: string;
    tipo: 'recibidos' | 'emitidos';
    solicitaMetadata?: boolean;
    descargaComprobantes?: boolean;
    descargaPdfs?: boolean;
    requestId?: string;
  }
) {
  const authHeader = getAuthorizationHeader(creds.satGoToken);
  const formData = buildFielFormData(creds);

  const queryParams = new URLSearchParams({
    tipoBusqueda: String(params.tipo_busqueda ?? 1),
    estatusFactura: String(params.estatus_factura ?? -1),
    fecha_inicial: formatSatDate(params.fecha_inicial, '00:00:00'),
    fecha_final: formatSatDate(params.fecha_final, '23:59:59'),
    tipo: params.tipo || 'recibidos',
    solicitaMetadata: params.solicitaMetadata ? 'true' : 'false',
    descargaComprobantes: params.descargaComprobantes ? 'true' : 'false',
    descargaPdfs: params.descargaPdfs ? 'true' : 'false'
  });

  if (params.requestId && params.requestId.trim()) {
    queryParams.append('requestId', params.requestId.trim());
  }

  const url = `${SAT_GO_BASE_URL_V2}/Consultar/facfiel?${queryParams.toString()}`;
  console.log(`[SAT-GO CLIENT] Consulting Facturas FIEL: ${url}`);

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'RFC': creds.rfc,
      'Authorization': authHeader,
      'Accept': 'application/json'
    },
    body: formData
  }, 50000);

  if (!response.ok) {
    const errText = await response.text();
    throw parseSatGoError(errText, response.status);
  }

  return response.json();
}

// 4. Consultar Retenciones FIEL
export async function consultarRetencionesFiel(
  creds: SatGoCredentials,
  params: {
    tipo_busqueda?: string | number;
    estatus_factura?: string | number;
    fecha_inicial: string;
    fecha_final: string;
    tipo: 'recibidos' | 'emitidos';
  }
) {
  const authHeader = getAuthorizationHeader(creds.satGoToken);
  const formData = buildFielFormData(creds);

  const queryParams = new URLSearchParams({
    tipoBusqueda: String(params.tipo_busqueda ?? 1),
    estatusFactura: String(params.estatus_factura ?? -1),
    fecha_inicial: formatSatDate(params.fecha_inicial, '00:00:00'),
    fecha_final: formatSatDate(params.fecha_final, '23:59:59'),
    tipo: params.tipo || 'recibidos'
  });

  const url = `${SAT_GO_BASE_URL_V2}/Consultar/retencionfiel?${queryParams.toString()}`;
  console.log(`[SAT-GO CLIENT] Consulting Retenciones FIEL: ${url}`);

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'RFC': creds.rfc,
      'Authorization': authHeader,
      'Accept': 'application/json'
    },
    body: formData
  }, 50000);

  if (!response.ok) {
    const errText = await response.text();
    throw parseSatGoError(errText, response.status);
  }

  return response.json();
}

// 5. Consultar Lista Negra EFOS 69-B
export async function consultarEfosRfc(rfc: string, satGoToken?: string) {
  const authHeader = getAuthorizationHeader(satGoToken);
  const cleanRfc = encodeURIComponent(rfc.trim().toUpperCase());
  const url = `${SAT_GO_BASE_URL_V2}/Efos/rfc/${cleanRfc}`;

  console.log(`[SAT-GO CLIENT] Checking EFOS list for RFC: ${cleanRfc}`);

  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json'
    }
  }, 20000);

  if (!response.ok) {
    const errText = await response.text();
    throw parseSatGoError(errText, response.status);
  }

  return response.json();
}

// 6. Consultar Información Fiscal FIEL
export async function consultarInformacionFiscalFiel(creds: SatGoCredentials) {
  const authHeader = getAuthorizationHeader(creds.satGoToken);
  const formData = buildFielFormData(creds);

  const url = `${SAT_GO_BASE_URL_V2}/Consultar/informacionfiscalfiel`;

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'RFC': creds.rfc,
      'Authorization': authHeader,
      'Accept': 'application/json'
    },
    body: formData
  }, 45000);

  if (!response.ok) {
    const errText = await response.text();
    throw parseSatGoError(errText, response.status);
  }

  return response.json();
}

// 7. SAT WebService solicita
export async function solicitaDescarga(
  creds: SatGoCredentials,
  params: {
    tipo: 'recibidos' | 'emitidos';
    fecha_inicial: string;
    fecha_final: string;
    tipoBusqueda: 'CFDI' | 'Metadata';
    rfcEmisor?: string;
    rfcReceptor?: string;
    estadoComprobante?: string;
  }
) {
  const authHeader = getAuthorizationHeader(creds.satGoToken);
  const formData = buildFielFormData(creds);

  const qParams = new URLSearchParams({
    tipo: params.tipo,
    fecha_inicial: formatSatDate(params.fecha_inicial, '00:00:00'),
    fecha_Final: formatSatDate(params.fecha_final, '23:59:59'),
    tipoBusqueda: params.tipoBusqueda
  });

  if (params.rfcEmisor) qParams.append('rfcEmisor', params.rfcEmisor);
  if (params.rfcReceptor) qParams.append('rfcReceptor', params.rfcReceptor);
  if (params.estadoComprobante) qParams.append('estadoComprobante', params.estadoComprobante);

  const url = `${SAT_GO_BASE_URL_V2}/SatWebService/solicita?${qParams.toString()}`;
  console.log(`[SAT-GO CLIENT] Solicita WS: ${url}`);

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'RFC': creds.rfc,
      'Authorization': authHeader,
      'Accept': 'application/json'
    },
    body: formData
  }, 45000);

  if (!response.ok) {
    const errorText = await response.text();
    throw parseSatGoError(errorText, response.status);
  }

  return response.json();
}

// 8. SAT WebService verifica
export async function verificaSolicitud(creds: SatGoCredentials, idSolicitud: string) {
  const authHeader = getAuthorizationHeader(creds.satGoToken);
  const formData = buildFielFormData(creds);
  formData.append('idSolicitud', idSolicitud);
  formData.append('IdSolicitud', idSolicitud);

  const cleanId = encodeURIComponent(idSolicitud.trim());
  const url = `${SAT_GO_BASE_URL_V2}/SatWebService/verifica?IdSolicitud=${cleanId}&idSolicitud=${cleanId}&api-version=2.0`;
  console.log(`[SAT-GO CLIENT] Verifica WS: ${url}`);

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'RFC': creds.rfc,
      'Authorization': authHeader,
      'Accept': 'application/json'
    },
    body: formData
  }, 45000);

  if (!response.ok) {
    const errorText = await response.text();
    throw parseSatGoError(errorText, response.status);
  }

  return response.json();
}

// 9. SAT WebService descarga
export async function descargaPaquete(creds: SatGoCredentials, idPaquete: string) {
  const authHeader = getAuthorizationHeader(creds.satGoToken);
  const formData = buildFielFormData(creds);
  formData.append('idPaquete', idPaquete);
  formData.append('IdPaquete', idPaquete);

  const cleanPkg = encodeURIComponent(idPaquete.trim());
  const url = `${SAT_GO_BASE_URL_V2}/SatWebService/descarga?IdPaquete=${cleanPkg}&idPaquete=${cleanPkg}&api-version=2.0`;
  console.log(`[SAT-GO CLIENT] Descarga WS: ${url}`);

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'RFC': creds.rfc,
      'Authorization': authHeader,
      'Accept': 'application/json'
    },
    body: formData
  }, 45000);

  if (!response.ok) {
    const errorText = await response.text();
    throw parseSatGoError(errorText, response.status);
  }

  return response.json();
}

// 10. Crear Key / Token
export async function crearLlaveSatGo(satGoToken?: string) {
  const authHeader = getAuthorizationHeader(satGoToken);
  const url = `${SAT_GO_BASE_URL_V1}/Users/Createkey`;

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json'
    }
  }, 15000);

  if (!response.ok) {
    const errorText = await response.text();
    throw parseSatGoError(errorText, response.status);
  }

  return response.json();
}
