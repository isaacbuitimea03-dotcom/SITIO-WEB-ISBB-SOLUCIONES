import { XMLParser } from 'fast-xml-parser';

export interface taxBreakdown {
  base16: number;
  iva16: number;
  base8: number;
  iva8: number;
  base0: number;
  baseExento: number;
  baseNoObjeto: number;
  retIVA: number;
  retISR: number;
  baseIEPS: number;
  ieps: number;
  otrosTrasladados: number;
  otrosRetenidos: number;
}

export interface CFDIData {
  tipo: string;
  uuid: string;
  folio: string;
  serie: string;
  fecha: string;
  emisorNombre: string;
  emisorRfc: string;
  receptorNombre: string;
  receptorRfc: string;
  usoCFDI: string;
  usoCFDINombre: string;
  moneda: string;
  tipoCambio: number;
  subtotal: number;
  descuento: number;
  total: number;
  metodoPago: string;
  formaPago: string;
  conceptos: Array<{
    claveProdServ: string;
    cantidad: number;
    unidad: string;
    descripcion: string;
    valorUnitario: number;
    importe: number;
  }>;
  impuestos: {
    totalTrasladados: number;
    totalRetenidos: number;
    desglose: taxBreakdown;
  };
}

const USO_CFDI: Record<string, string> = {
  'G01': 'Adquisición de mercancías',
  'G02': 'Devoluciones, descuentos o bonificaciones',
  'G03': 'Gastos en general',
  'I01': 'Construcciones',
  'I02': 'Mobiliario y equipo de oficina por inversiones',
  'I03': 'Equipo de transporte',
  'I04': 'Equipo de computo y accesorios',
  'I05': 'Dados, troqueles, moldes, matrices y herramental',
  'I06': 'Comunicaciones telefónicas',
  'I07': 'Comunicaciones satelitales',
  'I08': 'Otra maquinaria y equipo',
  'D01': 'Honorarios médicos, dentales y gastos hospitalarios',
  'D02': 'Gastos médicos por incapacidad o discapacidad',
  'D03': 'Gastos funerales',
  'D04': 'Donativos',
  'D05': 'Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación)',
  'D06': 'Aportaciones voluntarias al SAR',
  'D07': 'Primas por seguros de gastos médicos',
  'D08': 'Gastos de transportación escolar obligatoria',
  'D09': 'Depósitos en cuentas especiales para el ahorro, primas que tengan como base planes de pensiones',
  'D10': 'Pagos por servicios educativos (colegiaturas)',
  'P01': 'Por definir',
  'S01': 'Sin efectos fiscales',
  'CP01': 'Pagos',
  'CN01': 'Nómina',
};

const TIPO_COMPROBANTE: Record<string, string> = {
  'I': 'Ingreso',
  'E': 'Egreso',
  'T': 'Traslado',
  'N': 'Nómina',
  'P': 'Pago',
};

export const parseCFDI = (xmlContent: string): CFDIData => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: false,
  });

  const jsonObj = parser.parse(xmlContent);
  
  // Find Comprobante even with different prefixes or case
  const findNode = (obj: any, target: string): any => {
    if (!obj) return undefined;
    const lowerTarget = target.toLowerCase();
    for (const key of Object.keys(obj)) {
      if (key.toLowerCase() === lowerTarget || key.toLowerCase().endsWith(':' + lowerTarget)) {
        return obj[key];
      }
    }
    return undefined;
  };

  const comprobante = findNode(jsonObj, 'Comprobante');

  if (!comprobante) {
    console.error('JSON Structure:', jsonObj);
    throw new Error('No se encontró el nodo Comprobante en el XML. Asegúrese de que sea un CFDI válido.');
  }

  // Helper to get attribute or node regardless of case, prefix or SAT namespace
  const getAttr = (node: any, name: string) => {
    if (!node) return undefined;
    const lowerName = name.toLowerCase();
    
    // Check direct properties first (attributes or nodes)
    for (const key of Object.keys(node)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === lowerName || lowerKey.endsWith(':' + lowerName)) {
        return node[key];
      }
    }
    return undefined;
  };

  const emisor = getAttr(comprobante, 'Emisor') || {};
  const receptor = getAttr(comprobante, 'Receptor') || {};
  const complemento = getAttr(comprobante, 'Complemento') || {};
  const complementaryList = Array.isArray(complemento) ? complemento : [complemento];
  const tfdNode = complementaryList.find(c => getAttr(c, 'TimbreFiscalDigital'));
  const timbre = tfdNode ? getAttr(tfdNode, 'TimbreFiscalDigital') : {};

  const uuid = getAttr(timbre, 'UUID') || 'N/A';
  const usoCFDICode = getAttr(receptor, 'UsoCFDI') || 'N/A';

  // Process Conceptos
  const conceptosWrapper = getAttr(comprobante, 'Conceptos') || {};
  const conceptosList = getAttr(conceptosWrapper, 'Concepto') || [];
  const normalizedConceptos = (Array.isArray(conceptosList) ? conceptosList : [conceptosList]).map((c: any) => ({
    claveProdServ: getAttr(c, 'ClaveProdServ'),
    cantidad: Number(getAttr(c, 'Cantidad')),
    unidad: getAttr(c, 'Unidad') || getAttr(c, 'ClaveUnidad'),
    descripcion: getAttr(c, 'Descripcion'),
    valorUnitario: Number(getAttr(c, 'ValorUnitario')),
    importe: Number(getAttr(c, 'Importe')),
  }));

  // Process Impuestos
  const impuestosWrapper = getAttr(comprobante, 'Impuestos') || {};
  
  const traslados = getAttr(impuestosWrapper, 'Traslados') || {};
  const trasladosList = getAttr(traslados, 'Traslado') || [];
  const normalizedTraslados = (Array.isArray(trasladosList) ? trasladosList : [trasladosList]).map((t: any) => ({
    impuesto: String(getAttr(t, 'Impuesto')),
    tasa: getAttr(t, 'TasaOCuota') !== undefined ? `${(Number(getAttr(t, 'TasaOCuota')) * 100).toFixed(2)}%` : 'N/A',
    tipoFactor: getAttr(t, 'TipoFactor') || 'N/A',
    importe: Number(getAttr(t, 'Importe') || 0),
  }));

  const retenidos = getAttr(impuestosWrapper, 'Retenciones') || {};
  const retenidosList = getAttr(retenidos, 'Retencion') || [];
  const normalizedRetenidos = (Array.isArray(retenidosList) ? retenidosList : [retenidosList]).map((r: any) => ({
    impuesto: String(getAttr(r, 'Impuesto')),
    tasa: getAttr(r, 'TasaOCuota') !== undefined ? `${(Number(getAttr(r, 'TasaOCuota')) * 100).toFixed(2)}%` : 'N/A',
    importe: Number(getAttr(r, 'Importe') || 0),
  }));

  // Tax Breakdown Calculation - Precise Concept-by-Concept Analysis
  const desglose: taxBreakdown = {
    base16: 0, iva16: 0, base8: 0, iva8: 0, base0: 0, baseExento: 0, baseNoObjeto: 0,
    retIVA: 0, retISR: 0, baseIEPS: 0, ieps: 0,
    otrosTrasladados: 0, otrosRetenidos: 0
  };

  const tc = Number(getAttr(comprobante, 'TipoCambio') || 1);

  // Function to process a list of tax nodes (Traslados or Retenciones)
  const processTaxList = (list: any, isTraslado: boolean) => {
    if (!list) return;
    const items = Array.isArray(list) ? list : [list];
    items.forEach((t: any) => {
      const imp = String(getAttr(t, 'Impuesto') || '');
      const base = Number(getAttr(t, 'Base') || 0) * tc;
      const importe = Number(getAttr(t, 'Importe') || 0) * tc;
      const tasaStr = getAttr(t, 'TasaOCuota') !== undefined ? String(getAttr(t, 'TasaOCuota')) : '';
      const tasa = parseFloat(tasaStr);
      const factor = getAttr(t, 'TipoFactor');

      if (isTraslado) {
        // XML codes: 002 = IVA, 003 = IEPS, 001 = ISR (rare for traslados)
        if (imp === '002' || imp === 'IVA' || imp === '2') {
          if (factor === 'Exento') {
            desglose.baseExento += base;
          } else if (tasa > 0.10) { 
            desglose.base16 += base; 
            desglose.iva16 += importe; 
          } else if (tasa > 0) { 
            desglose.base8 += base; 
            desglose.iva8 += importe; 
          } else {
            desglose.base0 += base;
          }
        } else if (imp === '003' || imp === 'IEPS' || imp === '3') {
          desglose.baseIEPS += base;
          desglose.ieps += importe;
        } else {
          desglose.otrosTrasladados += importe;
        }
      } else {
        // XML codes: 001 = ISR, 002 = IVA, 003 = IEPS
        if (imp === '002' || imp === 'IVA' || imp === '2') {
          desglose.retIVA += importe;
        } else if (imp === '001' || imp === 'ISR' || imp === '1') {
          desglose.retISR += importe;
        } else {
          desglose.otrosRetenidos += importe;
        }
      }
    });
  };

  // Analyze at Concept Level (Primary Source of Truth)
  let foundConceptTaxes = false;
  const conceptosArray = Array.isArray(conceptosList) ? conceptosList : [conceptosList];
  conceptosArray.forEach((c: any) => {
    // Check if concept is "No objeto de impuesto" (CFDI 4.0)
    const objetoImp = getAttr(c, 'ObjetoImp');
    if (objetoImp === '01') {
      desglose.baseNoObjeto += Number(getAttr(c, 'Importe') || 0) * tc;
    }

    const cImpuestos = getAttr(c, 'Impuestos');
    if (cImpuestos) {
      const cTraslados = getAttr(cImpuestos, 'Traslados');
      if (cTraslados) {
        const tNode = getAttr(cTraslados, 'Traslado');
        if (tNode) {
          processTaxList(tNode, true);
          foundConceptTaxes = true;
        }
      }
      
      const cRetenciones = getAttr(cImpuestos, 'Retenciones');
      if (cRetenciones) {
        const rNode = getAttr(cRetenciones, 'Retencion');
        if (rNode) {
          processTaxList(rNode, false);
          foundConceptTaxes = true;
        }
      }
    }
  });

  // Fallback to Global Impuestos if no taxes found at concept level
  if (!foundConceptTaxes) {
    const gTraslados = getAttr(impuestosWrapper, 'Traslados');
    if (gTraslados) processTaxList(getAttr(gTraslados, 'Traslado'), true);
    
    const gRetenciones = getAttr(impuestosWrapper, 'Retenciones');
    if (gRetenciones) processTaxList(getAttr(gRetenciones, 'Retencion'), false);
  }

  return {
    tipo: TIPO_COMPROBANTE[getAttr(comprobante, 'TipoDeComprobante')] || getAttr(comprobante, 'TipoDeComprobante'),
    uuid,
    folio: getAttr(comprobante, 'Folio') || 'S/F',
    serie: getAttr(comprobante, 'Serie') || 'S/S',
    fecha: getAttr(comprobante, 'Fecha'),
    emisorNombre: getAttr(emisor, 'Nombre') || 'N/A',
    emisorRfc: getAttr(emisor, 'Rfc') || 'N/A',
    receptorNombre: getAttr(receptor, 'Nombre') || 'N/A',
    receptorRfc: getAttr(receptor, 'Rfc') || 'N/A',
    usoCFDI: usoCFDICode,
    usoCFDINombre: USO_CFDI[usoCFDICode] || 'N/A',
    moneda: getAttr(comprobante, 'Moneda'),
    tipoCambio: tc,
    subtotal: Number(getAttr(comprobante, 'SubTotal')) * tc,
    descuento: Number(getAttr(comprobante, 'Descuento') || 0) * tc,
    total: Number(getAttr(comprobante, 'Total')) * tc,
    metodoPago: getAttr(comprobante, 'MetodoPago') || 'N/A',
    formaPago: getAttr(comprobante, 'FormaPago') || 'N/A',
    conceptos: normalizedConceptos,
    impuestos: {
      totalTrasladados: (desglose.iva16 + desglose.iva8 + desglose.ieps + desglose.otrosTrasladados),
      totalRetenidos: (desglose.retIVA + desglose.retISR + desglose.otrosRetenidos),
      desglose
    },
  };
};
