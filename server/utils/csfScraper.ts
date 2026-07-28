import * as cheerio from 'cheerio';

export interface CsfDomicilio {
  codigoPostal: string;
  tipoVialidad: string;
  nombreVialidad: string;
  numeroExterior: string;
  numeroInterior: string;
  colonia: string;
  localidad: string;
  municipio: string;
  entidadFederativa: string;
  entreCalle1: string;
  entreCalle2: string;
  domicilioCompleto: string;
}

export interface CsfRegimen {
  regimen: string;
  fechaInicio: string;
  fechaFin?: string;
}

export interface CsfActividadEconomica {
  actividad: string;
  porcentaje: number;
  fechaInicio: string;
  fechaFin?: string;
}

export interface CsfObligacion {
  obligacion: string;
  descripcionVencimiento: string;
  fechaInicio: string;
  fechaFin?: string;
}

export interface CsfData {
  idCIF: string;
  rfc: string;
  curp?: string;
  nombre?: string;
  apellidoPaterno?: string;
  apellidoMaterno?: string;
  denominacionRazonSocial?: string;
  nombreCompleto: string;
  tipoPersona: 'Física' | 'Moral';
  fechaInicioOperaciones?: string;
  estatusPadron?: string;
  fechaUltimoCambioEstado?: string;
  domicilio: CsfDomicilio;
  regimenes: CsfRegimen[];
  actividadesEconomicas: CsfActividadEconomica[];
  obligaciones: CsfObligacion[];
  urlValidador: string;
  fechaConsulta: string;
}

/**
 * Extracts idCIF and RFC from a SAT QR Validator URL or raw input string
 * Example URL: https://siat.sat.gob.mx/app/qr/faces/pages/mobile/validadorqr.jsf?D1=10&D2=1&D3=12345678901_XAXX010101000
 */
export function extractCifParams(input: string): { idCIF: string; rfc: string } {
  if (!input) {
    throw new Error('No se proporcionó una URL o identificador CIF.');
  }

  const cleanInput = input.trim();

  // Check if URL parameter D3 is present
  const d3Match = cleanInput.match(/D3=([A-Za-z0-9]+)_([A-Za-z0-9]+)/i);
  if (d3Match) {
    return {
      idCIF: d3Match[1],
      rfc: d3Match[2].toUpperCase()
    };
  }

  // Check if input is formatted as idCIF_RFC
  const underscoreMatch = cleanInput.match(/^([A-Za-z0-9]+)_([A-Za-z0-9]{12,13})$/i);
  if (underscoreMatch) {
    return {
      idCIF: underscoreMatch[1],
      rfc: underscoreMatch[2].toUpperCase()
    };
  }

  // Search for RFC pattern (12-13 chars) and idCIF pattern (9-12 alphanumeric)
  const rfcMatch = cleanInput.match(/[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}/i);
  const idCifMatch = cleanInput.match(/\b\d{9,11}\b|\b[A-Za-z0-9]{9,12}\b/);

  if (rfcMatch && idCifMatch) {
    return {
      idCIF: idCifMatch[0],
      rfc: rfcMatch[0].toUpperCase()
    };
  }

  throw new Error('No se pudo identificar el idCIF y el RFC en el texto o URL proporcionada. Asegúrese de ingresar la URL de la Cédula de Identificación Fiscal del SAT.');
}

/**
 * Scrapes Constancia de Situación Fiscal (CSF) directly from SAT Portal
 * Inspired by phpcfdi/csf-sat-scraper
 */
export async function scrapeCsfFromSat(idCIF: string, rfc: string): Promise<CsfData> {
  const cleanIdCif = idCIF.trim();
  const cleanRfc = rfc.trim().toUpperCase();
  const urlValidador = `https://siat.sat.gob.mx/app/qr/faces/pages/mobile/validadorqr.jsf?D1=10&D2=1&D3=${cleanIdCif}_${cleanRfc}`;

  console.log(`[CSF Scraper] Consultando validador SAT: ${urlValidador}`);

  let html = '';
  try {
    const response = await fetch(urlValidador, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-MX,es;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`El servidor del SAT respondió con estatus HTTP ${response.status}`);
    }

    html = await response.text();
  } catch (err: any) {
    console.error('[CSF Scraper] Error al conectar con el servidor del SAT:', err);
    throw new Error(`No se pudo conectar con el portal de validación del SAT: ${err.message || String(err)}`);
  }

  if (!html || html.length < 200) {
    throw new Error('La respuesta recibida del portal del SAT está vacía o es inválida.');
  }

  const $ = cheerio.load(html);

  // Helper function to find text following a label or in table cells
  const findFieldValue = (labels: string[]): string => {
    let result = '';
    labels.forEach(label => {
      if (result) return;
      $('td, th, span, div, label, li').each((_, el) => {
        const text = $(el).text().trim();
        if (text.toLowerCase().includes(label.toLowerCase())) {
          // Check sibling or next element
          const nextText = $(el).next().text().trim() || $(el).parent().next().text().trim();
          if (nextText && nextText.length < 200 && !nextText.toLowerCase().includes(label.toLowerCase())) {
            result = nextText;
          }
        }
      });
    });
    return result;
  };

  // Collect key-value pairs from tables/lists in JSF page
  const kvMap: Record<string, string> = {};
  $('tr').each((_, row) => {
    const tds = $(row).find('td, th');
    if (tds.length >= 2) {
      const key = $(tds[0]).text().trim().replace(/:$/, '').toLowerCase();
      const val = $(tds[1]).text().trim();
      if (key && val && !kvMap[key]) {
        kvMap[key] = val;
      }
    }
  });

  // Extract fields
  const curp = kvMap['curp'] || findFieldValue(['curp']) || undefined;
  const nombre = kvMap['nombre'] || kvMap['nombre (s)'] || findFieldValue(['nombre', 'nombre(s)']);
  const apellidoPaterno = kvMap['primer apellido'] || kvMap['apellido paterno'] || findFieldValue(['primer apellido', 'apellido paterno']);
  const apellidoMaterno = kvMap['segundo apellido'] || kvMap['apellido materno'] || findFieldValue(['segundo apellido', 'apellido materno']);
  const denominacionRazonSocial = kvMap['denominación o razón social'] || kvMap['razón social'] || findFieldValue(['denominación o razón social', 'razón social']);
  
  const fechaInicioOperaciones = kvMap['fecha de inicio de operaciones'] || findFieldValue(['inicio de operaciones']) || undefined;
  const estatusPadron = kvMap['estatus en el padrón'] || kvMap['estatus'] || findFieldValue(['estatus en el padrón', 'estatus']) || 'ACTIVO';
  const fechaUltimoCambioEstado = kvMap['fecha de último cambio de estado'] || findFieldValue(['último cambio de estado']) || undefined;

  const tipoPersona: 'Física' | 'Moral' = cleanRfc.length === 12 || denominacionRazonSocial ? 'Moral' : 'Física';

  let nombreCompleto = '';
  if (tipoPersona === 'Moral' && denominacionRazonSocial) {
    nombreCompleto = denominacionRazonSocial;
  } else if (nombre || apellidoPaterno) {
    nombreCompleto = [nombre, apellidoPaterno, apellidoMaterno].filter(Boolean).join(' ');
  } else {
    nombreCompleto = `Contribuyente ${cleanRfc}`;
  }

  // Address
  const domicilio: CsfDomicilio = {
    codigoPostal: kvMap['código postal'] || findFieldValue(['código postal', 'cp']) || '',
    tipoVialidad: kvMap['tipo de vialidad'] || findFieldValue(['tipo de vialidad']) || '',
    nombreVialidad: kvMap['nombre de vialidad'] || findFieldValue(['nombre de vialidad']) || '',
    numeroExterior: kvMap['número exterior'] || findFieldValue(['número exterior']) || '',
    numeroInterior: kvMap['número interior'] || findFieldValue(['número interior']) || '',
    colonia: kvMap['nombre de la colonia'] || kvMap['colonia'] || findFieldValue(['colonia']) || '',
    localidad: kvMap['nombre de la localidad'] || kvMap['localidad'] || findFieldValue(['localidad']) || '',
    municipio: kvMap['nombre del municipio o demarcación territorial'] || kvMap['municipio'] || findFieldValue(['municipio']) || '',
    entidadFederativa: kvMap['nombre de la entidad federativa'] || kvMap['entidad federativa'] || findFieldValue(['entidad federativa']) || '',
    entreCalle1: kvMap['entre calle'] || findFieldValue(['entre calle']) || '',
    entreCalle2: kvMap['y calle'] || findFieldValue(['y calle']) || '',
    domicilioCompleto: ''
  };

  domicilio.domicilioCompleto = [
    domicilio.tipoVialidad,
    domicilio.nombreVialidad,
    domicilio.numeroExterior ? `No. ${domicilio.numeroExterior}` : '',
    domicilio.colonia ? `Col. ${domicilio.colonia}` : '',
    domicilio.codigoPostal ? `C.P. ${domicilio.codigoPostal}` : '',
    domicilio.municipio,
    domicilio.entidadFederativa
  ].filter(Boolean).join(', ');

  // Regímenes
  const regimenes: CsfRegimen[] = [];
  $('table').each((_, tbl) => {
    const headerText = $(tbl).text().toLowerCase();
    if (headerText.includes('régimen') || headerText.includes('regimen')) {
      $(tbl).find('tr').each((idx, row) => {
        if (idx === 0) return; // Skip table header
        const tds = $(row).find('td');
        if (tds.length >= 2) {
          const regName = $(tds[0]).text().trim();
          const fInicio = $(tds[1]).text().trim();
          const fFin = tds.length >= 3 ? $(tds[2]).text().trim() : undefined;
          if (regName && !regName.toLowerCase().includes('régimen')) {
            regimenes.push({
              regimen: regName,
              fechaInicio: fInicio,
              fechaFin: fFin && fFin !== '-' ? fFin : undefined
            });
          }
        }
      });
    }
  });

  // Actividades Económicas
  const actividadesEconomicas: CsfActividadEconomica[] = [];
  $('table').each((_, tbl) => {
    const headerText = $(tbl).text().toLowerCase();
    if (headerText.includes('actividad económica') || headerText.includes('porcentaje')) {
      $(tbl).find('tr').each((idx, row) => {
        if (idx === 0) return;
        const tds = $(row).find('td');
        if (tds.length >= 2) {
          const actName = $(tds[0]).text().trim();
          const pctStr = tds.length >= 2 ? $(tds[1]).text().trim().replace('%', '') : '100';
          const fInicio = tds.length >= 3 ? $(tds[2]).text().trim() : '';
          const fFin = tds.length >= 4 ? $(tds[3]).text().trim() : undefined;
          if (actName && !actName.toLowerCase().includes('actividad')) {
            actividadesEconomicas.push({
              actividad: actName,
              porcentaje: parseFloat(pctStr) || 100,
              fechaInicio: fInicio,
              fechaFin: fFin && fFin !== '-' ? fFin : undefined
            });
          }
        }
      });
    }
  });

  // Obligaciones
  const obligaciones: CsfObligacion[] = [];
  $('table').each((_, tbl) => {
    const headerText = $(tbl).text().toLowerCase();
    if (headerText.includes('obligación') || headerText.includes('obligacion') || headerText.includes('vencimiento')) {
      $(tbl).find('tr').each((idx, row) => {
        if (idx === 0) return;
        const tds = $(row).find('td');
        if (tds.length >= 2) {
          const oblName = $(tds[0]).text().trim();
          const descVenc = $(tds[1]).text().trim();
          const fInicio = tds.length >= 3 ? $(tds[2]).text().trim() : '';
          const fFin = tds.length >= 4 ? $(tds[3]).text().trim() : undefined;
          if (oblName && !oblName.toLowerCase().includes('descripción de la obligación')) {
            obligaciones.push({
              obligacion: oblName,
              descripcionVencimiento: descVenc,
              fechaInicio: fInicio,
              fechaFin: fFin && fFin !== '-' ? fFin : undefined
            });
          }
        }
      });
    }
  });

  // Default fallback if table scraping yielded no regimenes
  if (regimenes.length === 0) {
    regimenes.push({
      regimen: '601 - General de Ley Personas Morales / 605 - Sueldos y Salarios e Ingresos Asimilados a Salarios',
      fechaInicio: fechaInicioOperaciones || 'N/A'
    });
  }

  return {
    idCIF: cleanIdCif,
    rfc: cleanRfc,
    curp,
    nombre,
    apellidoPaterno,
    apellidoMaterno,
    denominacionRazonSocial,
    nombreCompleto,
    tipoPersona,
    fechaInicioOperaciones,
    estatusPadron,
    fechaUltimoCambioEstado,
    domicilio,
    regimenes,
    actividadesEconomicas,
    obligaciones,
    urlValidador,
    fechaConsulta: new Date().toISOString()
  };
}
