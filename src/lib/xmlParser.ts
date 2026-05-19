import { XMLParser } from 'fast-xml-parser';

export interface CFDIData {
  version: string;
  uuid: string;
  fecha: string;
  serie: string;
  folio: string;
  tipoComprobante: string;
  emisorRfc: string;
  emisorNombre: string;
  receptorRfc: string;
  receptorNombre: string;
  usoCFDI: string;
  formaPago: string;
  metodoPago: string;
  subtotal: number;
  descuento: number;
  total: number;
  conceptos: string;
  impuestos: {
    totalTrasladados: number;
    totalRetenidos: number;
    ivaTrasladado: number;
    ivaRetenido: number;
    isrRetenido: number;
    iepsTrasladado: number;
  };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

export function parseCFDI(xmlContent: string): CFDIData {
  const jsonObj = parser.parse(xmlContent);
  const comprobante = jsonObj['cfdi:Comprobante'] || jsonObj['Comprobante'];
  
  if (!comprobante) {
    throw new Error('Formato XML no reconocido como CFDI');
  }

  const timbre = comprobante['cfdi:Complemento']?.['tfd:TimbreFiscalDigital'] || 
                 comprobante['Complemento']?.['TimbreFiscalDigital'];
                 
  const emisor = comprobante['cfdi:Emisor'] || comprobante['Emisor'];
  const receptor = comprobante['cfdi:Receptor'] || comprobante['Receptor'];
  const impuestosGlobal = comprobante['cfdi:Impuestos'] || comprobante['Impuestos'];
  
  const conceptosNode = comprobante['cfdi:Conceptos']?.['cfdi:Concepto'] || 
                        comprobante['Conceptos']?.['Concepto'];
  
  const conceptosArr = Array.isArray(conceptosNode) ? conceptosNode : (conceptosNode ? [conceptosNode] : []);
  const conceptosStr = conceptosArr.map((c: any) => c['@_Descripcion']).join(' | ');

  const getAttr = (obj: any, attr: string) => obj?.['@_' + attr] || '';
  const getNum = (obj: any, attr: string) => parseFloat(getAttr(obj, attr)) || 0;

  // Detailed tax extraction
  let ivaTrasladado = 0;
  let iepsTrasladado = 0;
  let ivaRetenido = 0;
  let isrRetenido = 0;

  const traslados = impuestosGlobal?.['cfdi:Traslados']?.['cfdi:Traslado'] || 
                    impuestosGlobal?.['Traslados']?.['Traslado'];
  const trasladosArr = Array.isArray(traslados) ? traslados : (traslados ? [traslados] : []);

  trasladosArr.forEach((t: any) => {
    const impuesto = getAttr(t, 'Impuesto');
    const importe = getNum(t, 'Importe');
    if (impuesto === '002') ivaTrasladado += importe;
    if (impuesto === '003') iepsTrasladado += importe;
  });

  const retenciones = impuestosGlobal?.['cfdi:Retenciones']?.['cfdi:Retencion'] || 
                      impuestosGlobal?.['Retenciones']?.['Retencion'];
  const retencionesArr = Array.isArray(retenciones) ? retenciones : (retenciones ? [retenciones] : []);

  retencionesArr.forEach((r: any) => {
    const impuesto = getAttr(r, 'Impuesto');
    const importe = getNum(r, 'Importe');
    if (impuesto === '002') ivaRetenido += importe;
    if (impuesto === '001') isrRetenido += importe;
  });

  return {
    version: getAttr(comprobante, 'Version'),
    uuid: getAttr(timbre, 'UUID'),
    fecha: getAttr(comprobante, 'Fecha'),
    serie: getAttr(comprobante, 'Serie'),
    folio: getAttr(comprobante, 'Folio'),
    tipoComprobante: getAttr(comprobante, 'TipoDeComprobante'),
    emisorRfc: getAttr(emisor, 'Rfc'),
    emisorNombre: getAttr(emisor, 'Nombre'),
    receptorRfc: getAttr(receptor, 'Rfc'),
    receptorNombre: getAttr(receptor, 'Nombre'),
    usoCFDI: getAttr(receptor, 'UsoCFDI'),
    formaPago: getAttr(comprobante, 'FormaPago'),
    metodoPago: getAttr(comprobante, 'MetodoPago'),
    subtotal: getNum(comprobante, 'SubTotal'),
    descuento: getNum(comprobante, 'Descuento'),
    total: getNum(comprobante, 'Total'),
    conceptos: conceptosStr,
    impuestos: {
      totalTrasladados: getNum(impuestosGlobal, 'TotalImpuestosTrasladados'),
      totalRetenidos: getNum(impuestosGlobal, 'TotalImpuestosRetenidos'),
      ivaTrasladado,
      ivaRetenido,
      isrRetenido,
      iepsTrasladado
    }
  };
}
