// Namespace and casing safe XML value extractor helpers
export interface ConceptoItem {
  claveProdServ?: string;
  noIdentificacion?: string;
  cantidad: number;
  claveUnidad?: string;
  unidad?: string;
  descripcion: string;
  valorUnitario: number;
  importe: number;
  descuento?: number;
  objetoImp?: string;
}

export interface ParsedCFDI {
  fileName: string;
  fileContent?: string;
  folio: string;
  serie: string;
  fecha: string;
  tipo: string; // 'I' (Ingreso), 'E' (Egreso), 'P' (Pago/Otros), 'N' (Nómina)
  subTotal: number;
  descuento: number;
  total: number;
  emisorRfc: string;
  emisorNombre: string;
  receptorRfc: string;
  receptorNombre: string;
  ivaTrasladado: number;
  ivaAcreditable: number;
  ivaRetenido: number;
  isrRetenido: number;
  conceptos: string[];
  conceptosDetalle?: ConceptoItem[];
  emisorRegimenFiscal?: string;
  emisorRegimenFiscalDesc?: string;
  receptorRegimenFiscal?: string;
  receptorRegimenFiscalDesc?: string;

  // Custom detailed fields for tax auditor requirements
  usoCfdi: string;
  usoCfdiDesc: string;
  formaPago: string;
  formaPagoDesc: string;
  impuestoExento: number;
  noObjetoImpuesto: number;
  tasa0Base: number;
  tasa16Base: number;
  iepsTotal: number;

  // Payroll/Nómina specific optional properties (ISBB premium suite)
  isNomina?: boolean;
  nominaVersion?: string;
  nominaTipo?: string;
  nominaFechaPago?: string;
  nominaFechaInicialPago?: string;
  nominaFechaFinalPago?: string;
  nominaNumDiasPagados?: number;
  nominaReceptorCurp?: string;
  nominaReceptorNss?: string;
  nominaReceptorTipoContrato?: string;
  nominaReceptorTipoRegimen?: string;
  nominaReceptorNumEmpleado?: string;
  nominaReceptorPeriodicidadPago?: string;
  nominaReceptorClaveEntFed?: string;
  nominaTotalPercepciones?: number;
  nominaTotalDeducciones?: number;
  nominaTotalOtrosPagos?: number;
  nominaNeto?: number;
  nominaPercepcionesStr?: string;
  nominaDeduccionesStr?: string;

  // Granular payroll breakdown fields
  percepcionSueldo?: number;
  percepcionAguinaldoGrav?: number;
  percepcionAguinaldoExent?: number;
  percepcionPrimaVacGrav?: number;
  percepcionPrimaVacExent?: number;
  percepcionPrimaDomGrav?: number;
  percepcionPrimaDomExent?: number;
  percepcionHorasExtrasGrav?: number;
  percepcionHorasExtrasExent?: number;
  percepcionBonosGrav?: number;
  percepcionBonosExent?: number;
  percepcionPtuGrav?: number;
  percepcionPtuExent?: number;
  percepcionOtrosGrav?: number;
  percepcionOtrosExent?: number;

  percepcionSueldo_nomina?: number; // fallback helper

  deduccionIsr?: number;
  deduccionImss?: number;
  deduccionFondoAhorro?: number;
  deduccionDescuentos?: number;
  deduccionOtros?: number;
  fechaHoraRaw?: string;
  hora?: string;
  isCancelada?: boolean;
  allTaxesMap?: Record<string, { base: number; importe: number; tasaStr: string; type: string }>;
}

export const getAttrSafe = (el: Element | null, attrNames: string[]): string => {
  if (!el) return '';
  for (const name of attrNames) {
    if (el.hasAttribute(name)) return el.getAttribute(name) || '';
    if (el.hasAttribute(name.toLowerCase())) return el.getAttribute(name.toLowerCase()) || '';
    const camel = name.charAt(0).toUpperCase() + name.slice(1);
    if (el.hasAttribute(camel)) return el.getAttribute(camel) || '';
  }
  return '';
};

export const getElementSafe = (parent: Document | Element, tags: string[]): Element | null => {
  for (const tag of tags) {
    let el = parent.getElementsByTagName(tag);
    if (el.length > 0) return el[0];
    
    const localName = tag.includes(':') ? tag.split(':')[1] : tag;
    el = parent.getElementsByTagName(localName);
    if (el.length > 0) return el[0];
  }
  return null;
};

export const getElementsSafe = (parent: Document | Element, tags: string[]): Element[] => {
  for (const tag of tags) {
    let el = parent.getElementsByTagName(tag);
    if (el.length > 0) return Array.from(el);
    const localName = tag.includes(':') ? tag.split(':')[1] : tag;
    el = parent.getElementsByTagName(localName);
    if (el.length > 0) return Array.from(el);
  }
  return [];
};

export const isIvaTasaSpecial = (lbl: string): boolean => {
  const norm = lbl.toLowerCase();
  return (
    norm.includes('iva') &&
    !norm.includes('reten') &&
    (norm.includes('16') || norm.includes('8') || norm.includes('0'))
  );
};

export const USO_CFDI_MAP: Record<string, string> = {
  'G01': 'Adquisición de mercancías',
  'G02': 'Devoluciones, descuentos o bonificaciones',
  'G03': 'Gastos en general',
  'I01': 'Construcciones',
  'I02': 'Mobiliario y equipo de oficina por inversiones',
  'I03': 'Equipo de transporte',
  'I04': 'Equipo de cómputo y accesorios',
  'I05': 'Dados, troqueles, moldes, matrices y herramental',
  'I06': 'Comunicaciones telefónicas',
  'I07': 'Comunicaciones de satélites',
  'I08': 'Otra maquinaria y equipo',
  'D01': 'Honorarios médicos, dentales y gastos hospitalarios',
  'D02': 'Gastos médicos por incapacidad o discapacidad',
  'D03': 'Gastos funerales',
  'D04': 'Donativos',
  'D05': 'Intereses reales efectivamente pagados por créditos hipotecarios (casa habitación)',
  'D06': 'Aportaciones voluntarias al SAR',
  'D07': 'Primas por seguros de gastos médicos',
  'D08': 'Gastos de transportación escolar obligatoria',
  'D10': 'Pagos por servicios educativos (colegiaturas)',
  'S01': 'Sin efectos fiscales',
  'CP01': 'Pagos',
  'CN01': 'Nómina',
};

export const FORMA_PAGO_MAP: Record<string, string> = {
  '01': 'Efectivo',
  '02': 'Cheque nominativo',
  '03': 'Transferencia electrónica de fondos',
  '04': 'Tarjeta de crédito',
  '05': 'Monedero electrónico',
  '06': 'Dinero electrónico',
  '08': 'Vales de despensa',
  '12': 'Dación en pago',
  '13': 'Pago por subrogación',
  '15': 'Pago por consignación',
  '17': 'Compensación',
  '23': 'Novación',
  '24': 'Confusión',
  '25': 'Remisión de deuda',
  '26': 'Prescripción o caducidad',
  '27': 'A los que se refiere la resolución miscelánea fiscal',
  '28': 'Tarjeta de débito',
  '29': 'Tarjeta de servicios',
  '30': 'Aplicación de anticipos',
  '31': 'Intermediario pagos',
  '99': 'Por definir',
};

export const getUsoCfdiName = (code: string): string => {
  if (!code) return 'Sin especificar';
  const clean = code.trim().toUpperCase();
  return USO_CFDI_MAP[clean] || 'Uso personalizado o no listado';
};

export const getFormaPagoName = (code: string): string => {
  if (!code) return 'Sin especificar';
  const clean = code.trim().toUpperCase();
  const normalized = clean.length === 1 ? '0' + clean : clean;
  return FORMA_PAGO_MAP[normalized] || 'Forma de pago no listada';
};

export const getContractTypeName = (code: string): string => {
  const map: Record<string, string> = {
    '01': 'Contrato de trabajo por tiempo indeterminado',
    '02': 'Contrato de trabajo por tiempo determinado',
    '03': 'Contrato de trabajo por temporada',
    '04': 'Contrato de trabajo por obra determinada',
    '05': 'Contrato de trabajo por capacitación inicial',
    '06': 'Contrato de trabajo por periodo de prueba',
    '07': 'Contrato de trabajo por tiempo indeterminado sujeto a periodo de prueba',
    '08': 'Contrato de trabajo por tiempo indeterminado con opción de capacitación inicial',
    '09': 'Contrato de trabajo por tiempo indeterminado a tiempo parcial',
    '10': 'Contrato de trabajo por tiempo indeterminado para el campo',
    '99': 'Otro contrato'
  };
  return map[code.trim()] || 'Otro';
};

export const getRegimenTypeName = (code: string): string => {
  const map: Record<string, string> = {
    '01': 'Sueldos',
    '02': 'Sueldos (Sueldos y Salarios)',
    '03': 'Jubilados',
    '04': 'Pensionados',
    '05': 'Asimilados Miembros Sociedades Cooperativas',
    '06': 'Asimilados Integrantes Sociedades Civiles',
    '07': 'Asimilados Miembros de Consejos',
    '08': 'Asimilados Comisionistas',
    '09': 'Asimilados Honorarios',
    '10': 'Asimilados Acciones o Títulos',
    '11': 'Asimilados Otros',
    '12': 'Sueldos y salarios que no causan impuesto'
  };
  return map[code.trim()] || 'Sueldos y salarios';
};

export const REGIMEN_FISCAL_MAP: Record<string, string> = {
  '601': 'General de Ley Personas Morales',
  '603': 'Personas Morales con Fines no Lucrativos',
  '605': 'Sueldos y Salarios e Ingresos Asimilados a Salarios',
  '606': 'Arrendamiento',
  '607': 'Régimen de Enajenación o Adquisición de Bienes',
  '608': 'Demás ingresos',
  '610': 'Residentes en el Extranjero sin Establecimiento Permanente en México',
  '611': 'Ingresos por Dividendos (socios y accionistas)',
  '612': 'Personas Físicas con Actividades Empresariales y Profesionales',
  '614': 'Ingresos por intereses',
  '615': 'Régimen de los ingresos por obtención de premios',
  '616': 'Sin obligaciones fiscales',
  '620': 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos',
  '621': 'Incorporación Fiscal',
  '622': 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras',
  '623': 'Opcional para Grupos de Sociedades',
  '624': 'Coordinados',
  '625': 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas',
  '626': 'Régimen Simplificado de Confianza',
};

export const getRegimenFiscalName = (code: string): string => {
  if (!code) return 'Sin especificar';
  const clean = code.trim().toUpperCase();
  return REGIMEN_FISCAL_MAP[clean] || 'Régimen no listado';
};

export const getPeriodicidadName = (code: string): string => {
  const map: Record<string, string> = {
    '01': 'Diario',
    '02': 'Semanal',
    '03': 'Catorcenal',
    '04': 'Quincenal',
    '05': 'Mensual',
    '06': 'Bimestral',
    '07': 'Unitaria',
    '08': 'Comisión',
    '09': 'Precio alzado',
    '99': 'Otra Periodicidad'
  };
  return map[code.trim()] || 'Quincenal';
};

export const parseXMLData = (xmlText: string, fileName: string): ParsedCFDI => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");
  
  const comprobante = getElementSafe(xmlDoc, ['cfdi:Comprobante', 'Comprobante']);
  
  const folio = getAttrSafe(comprobante, ['Folio', 'folio']);
  const serie = getAttrSafe(comprobante, ['Serie', 'serie']);
  const fecha = getAttrSafe(comprobante, ['Fecha', 'fecha']);
  const tipo = (getAttrSafe(comprobante, ['TipoDeComprobante', 'tipoDeComprobante']) || 'I').toUpperCase();
  const subTotal = parseFloat(getAttrSafe(comprobante, ['SubTotal', 'subTotal']) || '0');
  const descuento = parseFloat(getAttrSafe(comprobante, ['Descuento', 'descuento']) || '0');
  const total = parseFloat(getAttrSafe(comprobante, ['Total', 'total']) || '0');
  const formaPago = getAttrSafe(comprobante, ['FormaPago', 'formaPago']) || '';
  
  const emisor = getElementSafe(xmlDoc, ['cfdi:Emisor', 'Emisor']);
  const emisorRfc = getAttrSafe(emisor, ['Rfc', 'rfc']);
  const emisorNombre = getAttrSafe(emisor, ['Nombre', 'nombre']);
  const emisorRegimenFiscal = getAttrSafe(emisor, ['RegimenFiscal', 'regimenFiscal', 'RegimenFiscalEmisor']);
  
  const receptor = getElementSafe(xmlDoc, ['cfdi:Receptor', 'Receptor']);
  const receptorRfc = getAttrSafe(receptor, ['Rfc', 'rfc']);
  const receptorNombre = getAttrSafe(receptor, ['Nombre', 'nombre']);
  const usoCfdi = getAttrSafe(receptor, ['UsoCFDI', 'usoCFDI']) || '';
  const receptorRegimenFiscal = getAttrSafe(receptor, ['RegimenFiscalReceptor', 'regimenFiscalReceptor', 'RegimenFiscal']);
  
  // Extract Conceptos
  const conceptoElements = getElementsSafe(xmlDoc, ['cfdi:Concepto', 'Concepto']);
  const conceptos = conceptoElements.map(c => {
    const desc = getAttrSafe(c, ['Descripcion', 'descripcion']);
    const imp = getAttrSafe(c, ['Importe', 'importe']);
    return `${desc} ($${parseFloat(imp || '0').toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN)`;
  });

  const conceptosDetalle: ConceptoItem[] = conceptoElements.map(c => {
    const claveProdServ = getAttrSafe(c, ['ClaveProdServ', 'claveProdServ']);
    const noIdentificacion = getAttrSafe(c, ['NoIdentificacion', 'noIdentificacion']);
    const cantidad = parseFloat(getAttrSafe(c, ['Cantidad', 'cantidad']) || '1');
    const claveUnidad = getAttrSafe(c, ['ClaveUnidad', 'claveUnidad']);
    const unidad = getAttrSafe(c, ['Unidad', 'unidad']);
    const descripcion = getAttrSafe(c, ['Descripcion', 'descripcion']);
    const valorUnitario = parseFloat(getAttrSafe(c, ['ValorUnitario', 'valorUnitario']) || '0');
    const importe = parseFloat(getAttrSafe(c, ['Importe', 'importe']) || '0');
    const descuento = parseFloat(getAttrSafe(c, ['Descuento', 'descuento']) || '0');
    const objetoImp = getAttrSafe(c, ['ObjetoImp', 'objetoImp']);
    return {
      claveProdServ,
      noIdentificacion,
      cantidad,
      claveUnidad,
      unidad,
      descripcion,
      valorUnitario,
      importe,
      descuento,
      objetoImp
    };
  });
  
  // Tax Desgloses requested by user
  let noObjetoImpuesto = 0;
  let impuestoExento = 0;
  let tasa0Base = 0;
  let tasa16Base = 0;
  let iepsTotal = 0;
  let ivaTrasladado = 0;
  let ivaAcreditable = 0;
  let ivaRetenido = 0;
  let isrRetenido = 0;

  // Classify concept elements nested taxes
  conceptoElements.forEach(concepto => {
    const objetoImp = getAttrSafe(concepto, ['ObjetoImp', 'objetoImp']);
    const cpImporte = parseFloat(getAttrSafe(concepto, ['Importe', 'importe']) || '0');
    
    if (objetoImp === '01') {
      noObjetoImpuesto += cpImporte;
    }
    
    const conceptTraslados = getElementsSafe(concepto, ['cfdi:Traslado', 'Traslado']);
    conceptTraslados.forEach(t => {
      const impuesto = getAttrSafe(t, ['Impuesto', 'impuesto']);
      const tipoFactor = getAttrSafe(t, ['TipoFactor', 'tipoFactor']);
      const tasaOCuotaStr = getAttrSafe(t, ['TasaOCuota', 'tasaOCuota']);
      const tasaOCuota = parseFloat(tasaOCuotaStr || '0');
      // Fallback to concept's own subtotal Importe if the base is missing or 0
      const base = parseFloat(getAttrSafe(t, ['Base', 'base']) || '0') || cpImporte;
      const importe = parseFloat(getAttrSafe(t, ['Importe', 'importe']) || '0');
      
      if (impuesto === '002' || impuesto === 'IVA') {
        if (tipoFactor === 'Exento') {
          impuestoExento += base;
        } else if (tipoFactor === 'Tasa') {
          if (tasaOCuota === 0) {
            tasa0Base += base;
          } else if (Math.abs(tasaOCuota - 0.16) < 0.01) {
            tasa16Base += base;
            if (tipo === 'I') {
              ivaTrasladado += importe;
            } else if (tipo === 'E') {
              ivaAcreditable += importe;
            }
          }
        }
      } else if (impuesto === '003' || impuesto === 'IEPS') {
        iepsTotal += importe;
      }
    });

    const conceptRetenciones = getElementsSafe(concepto, ['cfdi:Retencion', 'Retencion']);
    conceptRetenciones.forEach(r => {
      const impuesto = getAttrSafe(r, ['Impuesto', 'impuesto']);
      const base = parseFloat(getAttrSafe(r, ['Base', 'base']) || '0') || cpImporte;
      const importe = parseFloat(getAttrSafe(r, ['Importe', 'importe']) || '0');
      if (impuesto === '001' || impuesto === 'ISR') {
        isrRetenido += importe;
      } else if (impuesto === '002' || impuesto === 'IVA') {
        ivaRetenido += importe;
      } else if (impuesto === '003' || impuesto === 'IEPS') {
        iepsTotal += importe;
      }
    });
  });

  // Fallback if concept taxes are empty (common in simplified invoices)
  if (tasa16Base === 0 && tasa0Base === 0 && impuestoExento === 0) {
    const traslados = getElementsSafe(xmlDoc, ['cfdi:Traslado', 'Traslado']);
    
    // Let's first pre-calculate the bases for non-zero rates so we can subtract them from subTotal if we encounter a 0% rate without a base!
    let tempTasa16Base = 0;
    let tempImpuestoExento = 0;
    
    traslados.forEach(t => {
      const impuesto = getAttrSafe(t, ['Impuesto', 'impuesto']);
      const tipoFactor = getAttrSafe(t, ['TipoFactor', 'tipoFactor']);
      const tasaOCuotaStr = getAttrSafe(t, ['TasaOCuota', 'tasaOCuota']);
      const tasaOCuota = parseFloat(tasaOCuotaStr || '0');
      const base = parseFloat(getAttrSafe(t, ['Base', 'base']) || '0');
      const importe = parseFloat(getAttrSafe(t, ['Importe', 'importe']) || '0');

      if (impuesto === '002' || impuesto === 'IVA') {
        if (tipoFactor === 'Exento') {
          tempImpuestoExento += base;
        } else if (tipoFactor === 'Tasa' && Math.abs(tasaOCuota - 0.16) < 0.01) {
          tempTasa16Base += base || (importe / 0.16);
        }
      }
    });

    traslados.forEach(t => {
      const impuesto = getAttrSafe(t, ['Impuesto', 'impuesto']);
      const tipoFactor = getAttrSafe(t, ['TipoFactor', 'tipoFactor']);
      const tasaOCuotaStr = getAttrSafe(t, ['TasaOCuota', 'tasaOCuota']);
      const tasaOCuota = parseFloat(tasaOCuotaStr || '0');
      const base = parseFloat(getAttrSafe(t, ['Base', 'base']) || '0');
      const importe = parseFloat(getAttrSafe(t, ['Importe', 'importe']) || '0');

      if (impuesto === '002' || impuesto === 'IVA') {
        if (tipoFactor === 'Exento') {
          impuestoExento += base || subTotal;
        } else if (tipoFactor === 'Tasa') {
          if (tasaOCuota === 0) {
            if (base > 0) {
              tasa0Base += base;
            } else if (tempTasa16Base > 0 || tempImpuestoExento > 0) {
              // Subtract other rates' bases from subTotal to get the 0% base dynamically and prevent taking the entire invoice total!
              const calculated0Base = Math.max(0, subTotal - (tempTasa16Base + tempImpuestoExento));
              tasa0Base += calculated0Base;
            } else {
              tasa0Base += subTotal;
            }
          } else if (Math.abs(tasaOCuota - 0.16) < 0.01) {
            tasa16Base += base || (importe / 0.16);
            if (tipo === 'I') {
              ivaTrasladado += importe;
            } else if (tipo === 'E') {
              ivaAcreditable += importe;
            }
          }
        }
      } else if (impuesto === '003' || impuesto === 'IEPS') {
        iepsTotal += importe;
      }
    });

    const retenciones = getElementsSafe(xmlDoc, ['cfdi:Retencion', 'Retencion']);
    retenciones.forEach(r => {
      const impuesto = getAttrSafe(r, ['Impuesto', 'impuesto']);
      const importe = parseFloat(getAttrSafe(r, ['Importe', 'importe']) || '0');
      if (impuesto === '001' || impuesto === 'ISR') {
        isrRetenido += importe;
      } else if (impuesto === '002' || impuesto === 'IVA') {
        ivaRetenido += importe;
      } else if (impuesto === '003' || impuesto === 'IEPS') {
        iepsTotal += importe;
      }
    });
  }

  // Direct fallback for total 16% IVA if not calculated through traslados loop
  if (tipo === 'I' && ivaTrasladado === 0) {
    const parentImpuestos = getElementSafe(xmlDoc, ['cfdi:Impuestos', 'Impuestos']);
    const totalIvaStr = getAttrSafe(parentImpuestos, ['TotalImpuestosTrasladados', 'totalImpuestosTrasladados']);
    const totalIva = parseFloat(totalIvaStr || '0');
    if (totalIva > 0) {
      ivaTrasladado = totalIva;
      if (tasa16Base === 0) tasa16Base = totalIva / 0.16;
    }
  } else if (tipo === 'E' && ivaAcreditable === 0) {
    const parentImpuestos = getElementSafe(xmlDoc, ['cfdi:Impuestos', 'Impuestos']);
    const totalIvaStr = getAttrSafe(parentImpuestos, ['TotalImpuestosTrasladados', 'totalImpuestosTrasladados']);
    const totalIva = parseFloat(totalIvaStr || '0');
    if (totalIva > 0) {
      ivaAcreditable = totalIva;
      if (tasa16Base === 0) tasa16Base = totalIva / 0.16;
    }
  }

  // --- DYNAMIC TAX ANALYZER ENGINE (HIGH FIDELITY BASE & IMPORTE COLLECTION) ---
  const xmlTaxes: {
    type: 'Traslado' | 'Retencion' | 'Local';
    taxName: string;
    base: number;
    importe: number;
    tasaStr: string;
    label: string;
  }[] = [];

  const getTaxCodeName = (code: string): string => {
    const c = code.trim();
    if (c === '001' || c.toUpperCase() === 'ISR') return 'ISR';
    if (c === '002' || c.toUpperCase() === 'IVA') return 'IVA';
    if (c === '003' || c.toUpperCase() === 'IEPS') return 'IEPS';
    return c;
  };

  let hasConceptTaxes = false;
  conceptoElements.forEach(concepto => {
    const cpImporte = parseFloat(getAttrSafe(concepto, ['Importe', 'importe']) || '0');
    const cTraslados = getElementsSafe(concepto, ['cfdi:Traslado', 'Traslado']);
    if (cTraslados.length > 0) hasConceptTaxes = true;
    cTraslados.forEach(t => {
      const impCode = getAttrSafe(t, ['Impuesto', 'impuesto']) || '002';
      const impName = getTaxCodeName(impCode);
      const tipoFactor = getAttrSafe(t, ['TipoFactor', 'tipoFactor']) || 'Tasa';
      const tasaOCuotaStr = getAttrSafe(t, ['TasaOCuota', 'tasaOCuota']) || '0';
      const tasaNum = parseFloat(tasaOCuotaStr);
      // Fallback to concept's own subtotal Importe if the base is missing or 0
      const base = parseFloat(getAttrSafe(t, ['Base', 'base']) || '0') || cpImporte;
      const importe = parseFloat(getAttrSafe(t, ['Importe', 'importe']) || '0');

      let label = '';
      let tasaPct = '';
      if (tipoFactor === 'Exento') {
        label = `Traslado ${impName} Exento`;
        tasaPct = 'Exento';
      } else if (tipoFactor === 'Tasa') {
        label = `Traslado ${impName} ${(tasaNum * 100).toFixed(2)}%`;
        tasaPct = `${(tasaNum * 100).toFixed(2)}%`;
      } else {
        label = `Traslado ${impName} Cuota ${tasaNum}`;
        tasaPct = `Cuota ${tasaNum}`;
      }

      xmlTaxes.push({
        type: 'Traslado',
        taxName: impName,
        base,
        importe,
        tasaStr: tasaPct,
        label
      });
    });

    const cRetenciones = getElementsSafe(concepto, ['cfdi:Retencion', 'Retencion']);
    if (cRetenciones.length > 0) hasConceptTaxes = true;
    cRetenciones.forEach(r => {
      const impCode = getAttrSafe(r, ['Impuesto', 'impuesto']) || '001';
      const impName = getTaxCodeName(impCode);
      const base = parseFloat(getAttrSafe(r, ['Base', 'base']) || '0') || cpImporte;
      const importe = parseFloat(getAttrSafe(r, ['Importe', 'importe']) || '0');
      const tasaOCuotaStr = getAttrSafe(r, ['TasaOCuota', 'tasaOCuota', 'tasaocuota']) || '';
      
      let label = '';
      let tasaPct = '';
      if (tasaOCuotaStr) {
        const tNum = parseFloat(tasaOCuotaStr);
        label = `Retención ${impName} ${(tNum * 100).toFixed(2)}%`;
        tasaPct = `${(tNum * 100).toFixed(2)}%`;
      } else {
        label = `Retención ${impName}`;
        tasaPct = 'Retenido';
      }

      xmlTaxes.push({
        type: 'Retencion',
        taxName: impName,
        base,
        importe,
        tasaStr: tasaPct,
        label
      });
    });
  });

  if (!hasConceptTaxes) {
    const gTraslados = getElementsSafe(xmlDoc, ['cfdi:Traslado', 'Traslado']);
    
    // Let's first pre-calculate the bases for non-zero rates so we can subtract them from subTotal if we encounter a 0% rate without a base!
    let tempTasa16Base = 0;
    let tempTasa8Base = 0;
    let tempImpuestoExento = 0;

    gTraslados.forEach(t => {
      let parentNode = t.parentNode;
      let isConceptChild = false;
      while (parentNode) {
        if (parentNode.nodeName && parentNode.nodeName.toLowerCase().includes('concepto')) {
          isConceptChild = true;
          break;
        }
        parentNode = parentNode.parentNode;
      }
      if (isConceptChild) return;

      const impCode = getAttrSafe(t, ['Impuesto', 'impuesto']) || '002';
      const impName = getTaxCodeName(impCode);
      const tipoFactor = getAttrSafe(t, ['TipoFactor', 'tipoFactor']) || 'Tasa';
      const tasaOCuotaStr = getAttrSafe(t, ['TasaOCuota', 'tasaOCuota']) || '0';
      const tasaNum = parseFloat(tasaOCuotaStr);
      const base = parseFloat(getAttrSafe(t, ['Base', 'base']) || '0');
      const importe = parseFloat(getAttrSafe(t, ['Importe', 'importe']) || '0');

      if (impName === 'IVA') {
        if (tipoFactor === 'Exento') {
          tempImpuestoExento += base;
        } else if (tipoFactor === 'Tasa') {
          if (Math.abs(tasaNum - 0.16) < 0.01) {
            tempTasa16Base += base || (importe / 0.16);
          } else if (Math.abs(tasaNum - 0.08) < 0.01) {
            tempTasa8Base += base || (importe / 0.08);
          }
        }
      }
    });

    gTraslados.forEach(t => {
      let parentNode = t.parentNode;
      let isConceptChild = false;
      while (parentNode) {
        if (parentNode.nodeName && parentNode.nodeName.toLowerCase().includes('concepto')) {
          isConceptChild = true;
          break;
        }
        parentNode = parentNode.parentNode;
      }
      if (isConceptChild) return;

      const impCode = getAttrSafe(t, ['Impuesto', 'impuesto']) || '002';
      const impName = getTaxCodeName(impCode);
      const tipoFactor = getAttrSafe(t, ['TipoFactor', 'tipoFactor']) || 'Tasa';
      const tasaOCuotaStr = getAttrSafe(t, ['TasaOCuota', 'tasaOCuota']) || '0';
      const tasaNum = parseFloat(tasaOCuotaStr);
      const base = parseFloat(getAttrSafe(t, ['Base', 'base']) || '0');
      const importe = parseFloat(getAttrSafe(t, ['Importe', 'importe']) || '0');

      let label = '';
      let tasaPct = '';
      if (tipoFactor === 'Exento') {
        label = `Traslado ${impName} Exento`;
        tasaPct = 'Exento';
      } else if (tipoFactor === 'Tasa') {
        label = `Traslado ${impName} ${(tasaNum * 100).toFixed(2)}%`;
        tasaPct = `${(tasaNum * 100).toFixed(2)}%`;
      } else {
        label = `Traslado ${impName} Cuota ${tasaNum}`;
        tasaPct = `Cuota ${tasaNum}`;
      }

      let calculatedBase = base;
      if (impName === 'IVA' && tipoFactor === 'Tasa' && tasaNum === 0) {
        if (base > 0) {
          calculatedBase = base;
        } else if (tempTasa16Base > 0 || tempTasa8Base > 0 || tempImpuestoExento > 0) {
          calculatedBase = Math.max(0, subTotal - (tempTasa16Base + tempTasa8Base + tempImpuestoExento));
        } else {
          calculatedBase = subTotal;
        }
      } else if (impName === 'IVA' && tipoFactor === 'Tasa' && Math.abs(tasaNum - 0.16) < 0.01) {
        calculatedBase = base || (importe / 0.16);
      } else if (impName === 'IVA' && tipoFactor === 'Tasa' && Math.abs(tasaNum - 0.08) < 0.01) {
        calculatedBase = base || (importe / 0.08);
      } else if (calculatedBase === 0) {
        calculatedBase = subTotal;
      }

      xmlTaxes.push({
        type: 'Traslado',
        taxName: impName,
        base: calculatedBase,
        importe,
        tasaStr: tasaPct,
        label
      });
    });

    const gRetenciones = getElementsSafe(xmlDoc, ['cfdi:Retencion', 'Retencion']);
    gRetenciones.forEach(r => {
      let parentNode = r.parentNode;
      let isConceptChild = false;
      while (parentNode) {
        if (parentNode.nodeName && parentNode.nodeName.toLowerCase().includes('concepto')) {
          isConceptChild = true;
          break;
        }
        parentNode = parentNode.parentNode;
      }
      if (isConceptChild) return;

      const impCode = getAttrSafe(r, ['Impuesto', 'impuesto']) || '001';
      const impName = getTaxCodeName(impCode);
      const base = parseFloat(getAttrSafe(r, ['Base', 'base']) || '0');
      const importe = parseFloat(getAttrSafe(r, ['Importe', 'importe']) || '0');
      const tasaOCuotaStr = getAttrSafe(r, ['TasaOCuota', 'tasaOCuota']) || '';

      let label = '';
      let tasaPct = '';
      if (tasaOCuotaStr) {
        const tNum = parseFloat(tasaOCuotaStr);
        label = `Retención ${impName} ${(tNum * 100).toFixed(2)}%`;
        tasaPct = `${(tNum * 100).toFixed(2)}%`;
      } else {
        label = `Retención ${impName}`;
        tasaPct = 'Retenido';
      }

      xmlTaxes.push({
        type: 'Retencion',
        taxName: impName,
        base: base || (importe > 0 && impName === 'ISR' ? (importe / 0.10) : 0),
        importe,
        tasaStr: tasaPct,
        label
      });
    });
  }

  const localTasaLocales = getElementsSafe(xmlDoc, ['implocal:TrasladosLocales', 'TrasladosLocales']);
  localTasaLocales.forEach(lt => {
    const impLocName = getAttrSafe(lt, ['ImpLocTrasladado', 'impLocTrasladado']) || 'Impuesto Local Traslado';
    const tasaTraslado = parseFloat(getAttrSafe(lt, ['TasadeTraslado', 'tasadeTraslado']) || '0');
    const importe = parseFloat(getAttrSafe(lt, ['Importe', 'importe']) || '0');
    
    const label = `Traslado Local: ${impLocName} ${tasaTraslado.toFixed(2)}%`;
    xmlTaxes.push({
      type: 'Local',
      taxName: impLocName,
      base: subTotal,
      importe,
      tasaStr: `${tasaTraslado.toFixed(2)}%`,
      label
    });
  });

  const localRetLocales = getElementsSafe(xmlDoc, ['implocal:RetencionesLocales', 'RetencionesLocales']);
  localRetLocales.forEach(lr => {
    const impLocName = getAttrSafe(lr, ['ImpLocRetenido', 'impLocRetenido']) || 'Impuesto Local Retención';
    const tasaRetencion = parseFloat(getAttrSafe(lr, ['TasadeRetencion', 'tasadeRetencion']) || '0');
    const importe = parseFloat(getAttrSafe(lr, ['Importe', 'importe']) || '0');

    const label = `Retención Local: ${impLocName} ${tasaRetencion.toFixed(2)}%`;
    xmlTaxes.push({
      type: 'Local',
      taxName: impLocName,
      base: subTotal,
      importe,
      tasaStr: `${tasaRetencion.toFixed(2)}%`,
      label
    });
  });

  const allTaxesMap: Record<string, { base: number; importe: number; tasaStr: string; type: string }> = {};
  xmlTaxes.forEach(t => {
    const normalizedLabel = t.label.trim();
    if (!allTaxesMap[normalizedLabel]) {
      allTaxesMap[normalizedLabel] = {
        base: 0,
        importe: 0,
        tasaStr: t.tasaStr,
        type: t.type
      };
    }
    allTaxesMap[normalizedLabel].base += t.base;
    allTaxesMap[normalizedLabel].importe += t.importe;
  });

  // --- PAYROLL (NÓMINA) DETECTOR & PARSER (ISBB PREMIUM ENGINE) ---
  const nominaEl = getElementSafe(xmlDoc, ['nomina12:Nomina', 'Nomina', 'nomina11:Nomina', 'nomina:Nomina']);
  const isNomina = !!nominaEl || tipo === 'N';

  let nominaVersion = '';
  let nominaTipo = '';
  let nominaFechaPago = '';
  let nominaFechaInicialPago = '';
  let nominaFechaFinalPago = '';
  let nominaNumDiasPagados = 0;
  let nominaTotalPercepciones = 0;
  let nominaTotalDeducciones = 0;
  let nominaTotalOtrosPagos = 0;
  let nominaNeto = 0;

  let nominaReceptorCurp = '';
  let nominaReceptorNss = '';
  let nominaReceptorTipoContrato = '';
  let nominaReceptorTipoRegimen = '';
  let nominaReceptorNumEmpleado = '';
  let nominaReceptorPeriodicidadPago = '';
  let nominaReceptorClaveEntFed = '';

  let nominaPercepcionesStr = '';
  let nominaDeduccionesStr = '';

  // Payroll detailed parsing
  let percepcionSueldo = 0;
  let percepcionAguinaldoGrav = 0;
  let percepcionAguinaldoExent = 0;
  let percepcionPrimaVacGrav = 0;
  let percepcionPrimaVacExent = 0;
  let percepcionPrimaDomGrav = 0;
  let percepcionPrimaDomExent = 0;
  let percepcionHorasExtrasGrav = 0;
  let percepcionHorasExtrasExent = 0;
  let percepcionBonosGrav = 0;
  let percepcionBonosExent = 0;
  let percepcionPtuGrav = 0;
  let percepcionPtuExent = 0;
  let percepcionOtrosGrav = 0;
  let percepcionOtrosExent = 0;

  let deduccionIsr = 0;
  let deduccionImss = 0;
  let deduccionFondoAhorro = 0;
  let deduccionDescuentos = 0;
  let deduccionOtros = 0;

  if (isNomina && nominaEl) {
    nominaVersion = getAttrSafe(nominaEl, ['Version', 'version']);
    nominaTipo = getAttrSafe(nominaEl, ['TipoNomina', 'tipoNomina']) === 'O' ? 'Ordinaria' : 'Extraordinaria';
    nominaFechaPago = getAttrSafe(nominaEl, ['FechaPago', 'fechaPago']);
    nominaFechaInicialPago = getAttrSafe(nominaEl, ['FechaInicialPago', 'fechaInicialPago']);
    nominaFechaFinalPago = getAttrSafe(nominaEl, ['FechaFinalPago', 'fechaFinalPago']);
    nominaNumDiasPagados = parseFloat(getAttrSafe(nominaEl, ['NumDiasPagados', 'numDiasPagados']) || '0');
    nominaTotalPercepciones = parseFloat(getAttrSafe(nominaEl, ['TotalPercepciones', 'totalPercepciones']) || '0');
    nominaTotalDeducciones = parseFloat(getAttrSafe(nominaEl, ['TotalDeducciones', 'totalDeducciones']) || '0');
    nominaTotalOtrosPagos = parseFloat(getAttrSafe(nominaEl, ['TotalOtrosPagos', 'totalOtrosPagos']) || '0');
    nominaNeto = total - nominaTotalDeducciones;

    const nomReceptor = getElementSafe(nominaEl, ['nomina12:Receptor', 'Receptor', 'nomina11:Receptor', 'nomina:Receptor']);
    if (nomReceptor) {
      nominaReceptorCurp = getAttrSafe(nomReceptor, ['Curp', 'curp']);
      nominaReceptorNss = getAttrSafe(nomReceptor, ['Nss', 'nss']);
      nominaReceptorNumEmpleado = getAttrSafe(nomReceptor, ['NumEmpleado', 'numEmpleado']);
      nominaReceptorClaveEntFed = getAttrSafe(nomReceptor, ['ClaveEntFed', 'claveEntFed']);
      
      const tc = getAttrSafe(nomReceptor, ['TipoContrato', 'tipoContrato']);
      nominaReceptorTipoContrato = getContractTypeName(tc);
      
      const tr = getAttrSafe(nomReceptor, ['TipoRegimen', 'tipoRegimen']);
      nominaReceptorTipoRegimen = getRegimenTypeName(tr);
      
      const pp = getAttrSafe(nomReceptor, ['PeriodicidadPago', 'periodicidadPago']);
      nominaReceptorPeriodicidadPago = getPeriodicidadName(pp);
    }

    // Percepciones breakdown
    const percepcionesEl = getElementSafe(nominaEl, ['nomina12:Percepciones', 'Percepciones', 'nomina11:Percepciones', 'nomina:Percepciones']);
    if (percepcionesEl) {
      const percElements = getElementsSafe(percepcionesEl, ['nomina12:Percepcion', 'Percepcion', 'nomina11:Percepcion', 'nomina:Percepcion']);
      const percStrArr: string[] = [];
      percElements.forEach(pe => {
        const pType = getAttrSafe(pe, ['TipoPercepcion', 'tipoPercepcion']);
        const concept = getAttrSafe(pe, ['Concepto', 'concepto']);
        const impGrav = parseFloat(getAttrSafe(pe, ['ImporteGravado', 'importeGravado']) || '0');
        const impExent = parseFloat(getAttrSafe(pe, ['ImporteExento', 'importeExento']) || '0');
        const impTot = impGrav + impExent;

        percStrArr.push(`${concept} (${pType}): $${impTot.toFixed(2)}`);

        // Map to specific categories
        if (pType === '001') { // Sueldos/Salarios
          percepcionSueldo += impTot;
        } else if (pType === '002') { // Aguinaldo
          percepcionAguinaldoGrav += impGrav;
          percepcionAguinaldoExent += impExent;
        } else if (pType === '010') { // PTU
          percepcionPtuGrav += impGrav;
          percepcionPtuExent += impExent;
        } else if (pType === '019') { // Horas extras
          percepcionHorasExtrasGrav += impGrav;
          percepcionHorasExtrasExent += impExent;
        } else if (pType === '020' || pType === '021') { // Prima vacacional / prima dominical
          if (pType === '020') {
            percepcionPrimaVacGrav += impGrav;
            percepcionPrimaVacExent += impExent;
          } else {
            percepcionPrimaDomGrav += impGrav;
            percepcionPrimaDomExent += impExent;
          }
        } else if (['003', '004', '005', '006', '009', '028', '029', '030', '038', '046', '047', '049'].includes(pType)) {
          // Bonos / premios / despensa / puntualidad / asistencia
          percepcionBonosGrav += impGrav;
          percepcionBonosExent += impExent;
        } else {
          percepcionOtrosGrav += impGrav;
          percepcionOtrosExent += impExent;
        }
      });
      nominaPercepcionesStr = percStrArr.join(' | ');
    }

    // Deducciones breakdown
    const deduccionesEl = getElementSafe(nominaEl, ['nomina12:Deducciones', 'Deducciones', 'nomina11:Deducciones', 'nomina:Deducciones']);
    if (deduccionesEl) {
      const dedElements = getElementsSafe(deduccionesEl, ['nomina12:Deduccion', 'Deduccion', 'nomina11:Deduccion', 'nomina:Deduccion']);
      const dedStrArr: string[] = [];
      dedElements.forEach(de => {
        const dType = getAttrSafe(de, ['TipoDeduction', 'tipoDeduccion', 'TipoDeduccion']);
        const concept = getAttrSafe(de, ['Concepto', 'concepto']);
        const importe = parseFloat(getAttrSafe(de, ['Importe', 'importe']) || '0');

        dedStrArr.push(`${concept} (${dType}): $${importe.toFixed(2)}`);

        if (dType === '001') { // Retención de ISR
          deduccionIsr += importe;
        } else if (dType === '002') { // IMSS
          deduccionImss += importe;
        } else if (dType === '005') { // Fondo de ahorro
          deduccionFondoAhorro += importe;
        } else if (['003', '004', '010', '011', '012', '015', '016', '020', '021', '023'].includes(dType)) {
          // Descuentos, pensiones alimenticias, préstamos, INFONAVIT, FONACOT
          deduccionDescuentos += importe;
        } else {
          deduccionOtros += importe;
        }
      });
      nominaDeduccionesStr = dedStrArr.join(' | ');
    }
  }

  let parsedHora = '';
  if (fecha && fecha.includes('T')) {
    parsedHora = fecha.split('T')[1].substring(0, 8);
  } else {
    parsedHora = '00:00:00';
  }

  const lowerFileName = fileName.toLowerCase();
  const isCancelada = 
    lowerFileName.includes('cancelada') || 
    lowerFileName.includes('cancelado') || 
    lowerFileName.includes('cancel') || 
    (total === 0 && subTotal === 0 && (tipo === 'I' || tipo === 'E')) ||
    !comprobante || 
    xmlDoc.documentElement.nodeName.toLowerCase().includes('cancel');

  return {
    fileName,
    fileContent: xmlText,
    folio: folio || 'S/F',
    serie: serie || '',
    fecha: fecha ? fecha.substring(0, 10) : 'S/F',
    tipo: isNomina ? 'N' : tipo,
    fechaHoraRaw: fecha || '',
    hora: parsedHora,
    isCancelada,
    subTotal,
    descuento,
    total,
    emisorRfc: emisorRfc || 'Desconocido',
    emisorNombre: emisorNombre || 'Sin Razón Social',
    receptorRfc: receptorRfc || 'Desconocido',
    receptorNombre: receptorNombre || 'Sin Razón Social',
    ivaTrasladado,
    ivaAcreditable,
    ivaRetenido,
    isrRetenido,
    conceptos,
    conceptosDetalle,

    // Custom detailed parameters mapped perfectly
    usoCfdi,
    usoCfdiDesc: getUsoCfdiName(usoCfdi),
    formaPago,
    formaPagoDesc: getFormaPagoName(formaPago),
    impuestoExento,
    noObjetoImpuesto,
    tasa0Base,
    tasa16Base,
    iepsTotal,
    emisorRegimenFiscal,
    emisorRegimenFiscalDesc: getRegimenFiscalName(emisorRegimenFiscal),
    receptorRegimenFiscal,
    receptorRegimenFiscalDesc: getRegimenFiscalName(receptorRegimenFiscal),

    // Payroll specific attributes
    isNomina,
    nominaVersion,
    nominaTipo,
    nominaFechaPago,
    nominaFechaInicialPago,
    nominaFechaFinalPago,
    nominaNumDiasPagados,
    nominaReceptorCurp,
    nominaReceptorNss,
    nominaReceptorTipoContrato,
    nominaReceptorTipoRegimen,
    nominaReceptorNumEmpleado,
    nominaReceptorPeriodicidadPago,
    nominaReceptorClaveEntFed,
    nominaTotalPercepciones,
    nominaTotalDeducciones,
    nominaTotalOtrosPagos,
    nominaNeto,
    nominaPercepcionesStr,
    nominaDeduccionesStr,

    // Detailed parsed payroll items
    percepcionSueldo,
    percepcionAguinaldoGrav,
    percepcionAguinaldoExent,
    percepcionPrimaVacGrav,
    percepcionPrimaVacExent,
    percepcionPrimaDomGrav,
    percepcionPrimaDomExent,
    percepcionHorasExtrasGrav,
    percepcionHorasExtrasExent,
    percepcionBonosGrav,
    percepcionBonosExent,
    percepcionPtuGrav,
    percepcionPtuExent,
    percepcionOtrosGrav,
    percepcionOtrosExent,
    deduccionIsr,
    deduccionImss,
    deduccionFondoAhorro,
    deduccionDescuentos,
    deduccionOtros,
    allTaxesMap
  };
};
