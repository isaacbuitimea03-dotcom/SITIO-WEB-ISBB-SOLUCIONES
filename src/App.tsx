import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  ExternalLink, 
  RefreshCw, 
  Copy, 
  Check, 
  Sparkles, 
  CloudLightning, 
  ShieldCheck, 
  Monitor, 
  HelpCircle,
  FileText,
  Send,
  Bot,
  User,
  Calculator,
  Percent,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  BookOpen,
  ArrowRight,
  Shield,
  Briefcase,
  Upload,
  Trash2,
  Download,
  Search,
  Info,
  ChevronDown,
  ChevronUp,
  BadgeAlert,
  Coins,
  Scale,
  Award
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

// Namespace and casing safe XML value extractor helpers
const getAttrSafe = (el: Element | null, attrNames: string[]): string => {
  if (!el) return '';
  for (const name of attrNames) {
    if (el.hasAttribute(name)) return el.getAttribute(name) || '';
    if (el.hasAttribute(name.toLowerCase())) return el.getAttribute(name.toLowerCase()) || '';
    const camel = name.charAt(0).toUpperCase() + name.slice(1);
    if (el.hasAttribute(camel)) return el.getAttribute(camel) || '';
  }
  return '';
};

const getElementSafe = (parent: Document | Element, tags: string[]): Element | null => {
  for (const tag of tags) {
    let el = parent.getElementsByTagName(tag);
    if (el.length > 0) return el[0];
    
    const localName = tag.includes(':') ? tag.split(':')[1] : tag;
    el = parent.getElementsByTagName(localName);
    if (el.length > 0) return el[0];
  }
  return null;
};

const getElementsSafe = (parent: Document | Element, tags: string[]): Element[] => {
  for (const tag of tags) {
    let el = parent.getElementsByTagName(tag);
    if (el.length > 0) return Array.from(el);
    const localName = tag.includes(':') ? tag.split(':')[1] : tag;
    el = parent.getElementsByTagName(localName);
    if (el.length > 0) return Array.from(el);
  }
  return [];
};

// Lookup dictionaries for Mexican XML CFDI 4.0 Standard Codes
const USO_CFDI_MAP: Record<string, string> = {
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

const FORMA_PAGO_MAP: Record<string, string> = {
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

const getUsoCfdiName = (code: string): string => {
  if (!code) return 'Sin especificar';
  const clean = code.trim().toUpperCase();
  return USO_CFDI_MAP[clean] || 'Uso personalizado o no listado';
};

const getFormaPagoName = (code: string): string => {
  if (!code) return 'Sin especificar';
  const clean = code.trim().toUpperCase();
  const normalized = clean.length === 1 ? '0' + clean : clean;
  return FORMA_PAGO_MAP[normalized] || 'Forma de pago no listada';
};

// Interface of extracted CFDI XML properties with detailed tax breakdown
interface ParsedCFDI {
  fileName: string;
  folio: string;
  serie: string;
  fecha: string;
  tipo: string; // 'I' (Ingreso), 'E' (Egreso), 'P' (Pago/Otros)
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
}

// Interface for filter preset
interface FilterPreset {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  cfdiType: string;
  rfcEmisor: string;
  rfcReceptor: string;
  conceptText: string;
}

export default function App() {
  // --- XML AUDITOR & TAX ANALYZER STATE ---
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<ParsedCFDI[]>([]);
  const [xmlRegimen, setXmlRegimen] = useState<string>('RESICO_PF');
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<string>('');
  const [xmlSearchQuery, setXmlSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<ParsedCFDI | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);

  // Decorative custom micro-loading steps during AI fiscal audit
  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (auditing) {
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingStep(prev => (prev + 1) % 4);
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [auditing]);

  const loadingMessages = [
    'Validando autenticidad y versión estructural CFDI 4.0...',
    'Conciliando base de ingresos vs deducciones autorizadas...',
    'Efectuando sumas directas de IVA trasladado e IVA acreditable...',
    'Consultando criterios y leyes vigentes de ISR del SAT mexicano...'
  ];

  // --- STATE FOR SEARCH AND FILTER FEATURES ---
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterCfdiType, setFilterCfdiType] = useState('ALL'); // 'ALL' | 'I' | 'E' | 'P'
  const [filterRfcEmisor, setFilterRfcEmisor] = useState('');
  const [filterRfcReceptor, setFilterRfcReceptor] = useState('');
  const [filterConcept, setFilterConcept] = useState('');
  const [presetName, setPresetName] = useState('');

  // Local storage saved filters state
  const [savedFilters, setSavedFilters] = useState<FilterPreset[]>(() => {
    try {
      const saved = localStorage.getItem('isbb_saved_filters_v2');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn(e);
    }
    return [
      {
        id: 'preset-ingresos',
        name: 'Solo Ingresos (Ventas)',
        startDate: '',
        endDate: '',
        cfdiType: 'I',
        rfcEmisor: '',
        rfcReceptor: '',
        conceptText: '',
      },
      {
        id: 'preset-gastos',
        name: 'Solo Egresos (Gastos Ded.)',
        startDate: '',
        endDate: '',
        cfdiType: 'E',
        rfcEmisor: '',
        rfcReceptor: '',
        conceptText: '',
      }
    ];
  });

  // Save filters whenever they change
  React.useEffect(() => {
    try {
      localStorage.setItem('isbb_saved_filters_v2', JSON.stringify(savedFilters));
    } catch (e) {
      console.warn(e);
    }
  }, [savedFilters]);

  // --- XML PARSER ENGINE IN REACT ---
  const parseXMLData = (xmlText: string, fileName: string): ParsedCFDI => {
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
    
    const receptor = getElementSafe(xmlDoc, ['cfdi:Receptor', 'Receptor']);
    const receptorRfc = getAttrSafe(receptor, ['Rfc', 'rfc']);
    const receptorNombre = getAttrSafe(receptor, ['Nombre', 'nombre']);
    const usoCfdi = getAttrSafe(receptor, ['UsoCFDI', 'usoCFDI']) || '';
    
    // Extract Conceptos
    const conceptoElements = getElementsSafe(xmlDoc, ['cfdi:Concepto', 'Concepto']);
    const conceptos = conceptoElements.map(c => {
      const desc = getAttrSafe(c, ['Descripcion', 'descripcion']);
      const imp = getAttrSafe(c, ['Importe', 'importe']);
      return `${desc} ($${parseFloat(imp || '0').toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN)`;
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
        const base = parseFloat(getAttrSafe(t, ['Base', 'base']) || '0');
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
              tasa0Base += base || subTotal;
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

    return {
      fileName,
      folio: folio || 'S/F',
      serie: serie || '',
      fecha: fecha ? fecha.substring(0, 10) : 'S/F',
      tipo,
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
      conceptos: conceptos.slice(0, 3),

      // Custom detailed parameters mapped perfectly
      usoCfdi,
      usoCfdiDesc: getUsoCfdiName(usoCfdi),
      formaPago,
      formaPagoDesc: getFormaPagoName(formaPago),
      impuestoExento,
      noObjetoImpuesto,
      tasa0Base,
      tasa16Base,
      iepsTotal
    };
  };

  // Drag and drop events for XML uploader
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files) {
      const files = Array.from(e.dataTransfer.files) as File[];
      await processXmlFiles(files);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files) as File[];
      await processXmlFiles(files);
    }
  };

  const processXmlFiles = async (files: File[]) => {
    const xmlFiles = files.filter(f => f.name.toLowerCase().endsWith('.xml') || f.type === 'text/xml');
    if (xmlFiles.length === 0) {
      alert('Por favor, ingresa solamente un formato .xml (CFDI fiscal emitido por el SAT).');
      return;
    }

    const parsedArray: ParsedCFDI[] = [];
    for (const file of xmlFiles) {
      try {
        const text = await file.text();
        const parsed = parseXMLData(text, file.name);
        parsedArray.push(parsed);
      } catch (err) {
        console.error(`Error de parseo para el archivo ${file.name}:`, err);
      }
    }

    setUploadedFiles(prev => {
      // Overwrite if same file is re-added
      const filteredPrev = prev.filter(p => !parsedArray.some(n => n.fileName === p.fileName));
      return [...filteredPrev, ...parsedArray];
    });
  };

  // Sort files chronologically by date
  const sortedUploadedFiles = React.useMemo(() => {
    return [...uploadedFiles].sort((a, b) => {
      const dateA = a.fecha || '0000-00-00';
      const dateB = b.fecha || '0000-00-00';
      return dateA.localeCompare(dateB);
    });
  }, [uploadedFiles]);

  // Remove a single parsed file safely by filename
  const handleRemoveFileByFilename = (fileNameToRemove: string) => {
    setUploadedFiles(prev => prev.filter(f => f.fileName !== fileNameToRemove));
    if (uploadedFiles.length <= 1) {
      setAuditResult('');
    }
  };

  // Reset entire files console
  const handleClearAllFiles = () => {
    setUploadedFiles([]);
    setAuditResult('');
  };

  // Search filtering logic for the XML table with Advanced Filter controls
  const filteredFilesList = React.useMemo(() => {
    return sortedUploadedFiles.filter(item => {
      // 1. Simple search query-matching
      if (xmlSearchQuery) {
        const q = xmlSearchQuery.toLowerCase();
        const matchesSimple = (
          item.fileName.toLowerCase().includes(q) ||
          item.emisorNombre.toLowerCase().includes(q) ||
          item.emisorRfc.toLowerCase().includes(q) ||
          item.receptorNombre.toLowerCase().includes(q) ||
          item.receptorRfc.toLowerCase().includes(q) ||
          item.folio.toLowerCase().includes(q) ||
          item.conceptos.some(c => c.toLowerCase().includes(q))
        );
        if (!matchesSimple) return false;
      }

      // 2. CFDI Type filter
      if (filterCfdiType !== 'ALL') {
        if (item.tipo !== filterCfdiType) return false;
      }

      // 3. Date range filters
      if (filterStartDate) {
        if (item.fecha < filterStartDate) return false;
      }
      if (filterEndDate) {
        if (item.fecha > filterEndDate) return false;
      }

      // 4. RFC Emisor filter
      if (filterRfcEmisor.trim()) {
        const emisorQ = filterRfcEmisor.trim().toLowerCase();
        const matchesEmisor = (
          item.emisorRfc.toLowerCase().includes(emisorQ) ||
          item.emisorNombre.toLowerCase().includes(emisorQ)
        );
        if (!matchesEmisor) return false;
      }

      // 5. RFC Receptor filter
      if (filterRfcReceptor.trim()) {
        const receptorQ = filterRfcReceptor.trim().toLowerCase();
        const matchesReceptor = (
          item.receptorRfc.toLowerCase().includes(receptorQ) ||
          item.receptorNombre.toLowerCase().includes(receptorQ)
        );
        if (!matchesReceptor) return false;
      }

      // 6. Specific Concepts filter
      if (filterConcept.trim()) {
        const conceptQ = filterConcept.trim().toLowerCase();
        const matchesConcept = item.conceptos.some(c => c.toLowerCase().includes(conceptQ));
        if (!matchesConcept) return false;
      }

      return true;
    });
  }, [sortedUploadedFiles, xmlSearchQuery, filterStartDate, filterEndDate, filterCfdiType, filterRfcEmisor, filterRfcReceptor, filterConcept]);

  // High performance computations on parsed XMLs, dynamically recalculating based on active advanced filters list
  const xmlTotals = React.useMemo(() => {
    let ingresosTotal = 0;
    let egresosTotal = 0;
    let ingresosCount = 0;
    let egresosCount = 0;
    let pagosCount = 0;
    
    let ivaTrasladadoTotal = 0;
    let ivaAcreditableTotal = 0;
    let ivaRetenidoTotal = 0;
    let isrRetenidoTotal = 0;
    let subTotalAcumulado = 0;
    let totalAcumulado = 0;

    let impuestoExentoTotal = 0;
    let noObjetoImpuestoTotal = 0;
    let tasa0BaseTotal = 0;
    let tasa16BaseTotal = 0;
    let iepsTotalSum = 0;

    filteredFilesList.forEach(f => {
      if (f.tipo === 'I') {
        ingresosTotal += f.subTotal;
        ingresosCount++;
        ivaTrasladadoTotal += f.ivaTrasladado;
      } else if (f.tipo === 'E') {
        egresosTotal += f.subTotal;
        egresosCount++;
        ivaAcreditableTotal += f.ivaAcreditable;
      } else if (f.tipo === 'P') {
        pagosCount++;
      }
      
      ivaRetenidoTotal += f.ivaRetenido;
      isrRetenidoTotal += f.isrRetenido;
      subTotalAcumulado += f.subTotal;
      totalAcumulado += f.total;

      impuestoExentoTotal += f.impuestoExento;
      noObjetoImpuestoTotal += f.noObjetoImpuesto;
      tasa0BaseTotal += f.tasa0Base;
      tasa16BaseTotal += f.tasa16Base;
      iepsTotalSum += f.iepsTotal;
    });

    const balanceIva = ivaTrasladadoTotal - ivaAcreditableTotal - ivaRetenidoTotal;

    return {
      totalFiles: filteredFilesList.length,
      ingresosCount,
      egresosCount,
      pagosCount,
      ingresosTotal,
      egresosTotal,
      ivaTrasladadoTotal,
      ivaAcreditableTotal,
      ivaRetenidoTotal,
      isrRetenidoTotal,
      subTotalAcumulado,
      totalAcumulado,
      balanceIva,
      impuestoExentoTotal,
      noObjetoImpuestoTotal,
      tasa0BaseTotal,
      tasa16BaseTotal,
      iepsTotalSum
    };
  }, [filteredFilesList]);

  // Export filtered catalog to standard Excel workbook (Chronological, strictly respecting active filter results)
  const handleExportToExcel = () => {
    if (filteredFilesList.length === 0) return;
    
    const excelRows = filteredFilesList.map(f => ({
      'Fecha Emisión': f.fecha,
      'Archivo': f.fileName,
      'Serie': f.serie,
      'Folio': f.folio,
      'Tipo CFDI': f.tipo === 'I' ? 'I - Ingreso (Cobros)' : f.tipo === 'E' ? 'E - Egreso (Gastos)' : 'P - Pago',
      'RFC Emisor': f.emisorRfc,
      'Razón Social Emisor': f.emisorNombre,
      'RFC Receptor': f.receptorRfc,
      'Razón Social Receptor': f.receptorNombre,
      'Subtotal ($)': f.subTotal,
      'Descuento ($)': f.descuento,
      'Impuesto Exento ($)': f.impuestoExento,
      'No Objeto a Impuesto ($)': f.noObjetoImpuesto,
      'Tasa 0% ($)': f.tasa0Base,
      'Tasa 16% ($)': f.tasa16Base,
      'IVA ($)': f.tipo === 'I' ? f.ivaTrasladado : f.ivaAcreditable,
      'IEPS ($)': f.iepsTotal,
      'Retención de IVA ($)': f.ivaRetenido,
      'Retención de ISR ($)': f.isrRetenido,
      'Uso CFDI (Clave)': f.usoCfdi || 'S/E',
      'Uso CFDI (Nombre)': f.usoCfdiDesc || 'Sin especificar',
      'Forma de Pago (Clave)': f.formaPago || 'S/E',
      'Forma de Pago (Nombre)': f.formaPagoDesc || 'Sin especificar',
      'Total Facturado ($)': f.total,
      'Conceptos Principales': f.conceptos.join(' | ')
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Auditoría XML ISBB');
    
    XLSX.writeFile(workbook, `Conciliacion_XML_ISBB_${new Date().toISOString().substring(0, 10)}.xlsx`);
  };

  // --- ADVANCED FILTER ACTIONS ---
  const applyPresetFilter = (preset: FilterPreset) => {
    setFilterStartDate(preset.startDate);
    setFilterEndDate(preset.endDate);
    setFilterCfdiType(preset.cfdiType);
    setFilterRfcEmisor(preset.rfcEmisor);
    setFilterRfcReceptor(preset.rfcReceptor);
    setFilterConcept(preset.conceptText);
  };

  const handleSaveCurrentFilter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!presetName.trim()) return;
    
    const newPreset: FilterPreset = {
      id: `filter-preset-${Date.now()}`,
      name: presetName.trim(),
      startDate: filterStartDate,
      endDate: filterEndDate,
      cfdiType: filterCfdiType,
      rfcEmisor: filterRfcEmisor,
      rfcReceptor: filterRfcReceptor,
      conceptText: filterConcept
    };

    setSavedFilters(prev => [...prev, newPreset]);
    setPresetName('');
  };

  const handleRemovePreset = (idToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavedFilters(prev => prev.filter(p => p.id !== idToRemove));
  };

  const handleResetFilters = () => {
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterCfdiType('ALL');
    setFilterRfcEmisor('');
    setFilterRfcReceptor('');
    setFilterConcept('');
    setXmlSearchQuery('');
  };

  // Send XML context to modern server-side endpoint for expert tax audit
  const handleAnalyzeXmlAI = async () => {
    if (uploadedFiles.length === 0 || auditing) return;
    
    setAuditing(true);
    setAuditResult('');
    
    // Thin down files array to strictly match active models context windows securely
    const structuredDetails = filteredFilesList.map(f => ({
      factura: f.folio !== 'S/F' ? `${f.serie || ''}${f.folio}` : f.fileName,
      tipo: f.tipo === 'I' ? 'Ingreso (Cliente)' : f.tipo === 'E' ? 'Egreso/Gasto' : 'Pago/Otro',
      emisor: f.emisorNombre,
      rfcemisor: f.emisorRfc,
      receptor: f.receptorNombre,
      rfcreceptor: f.receptorRfc,
      fecha: f.fecha,
      subtotal: f.subTotal,
      iva: f.tipo === 'I' ? f.ivaTrasladado : f.ivaAcreditable,
      retIv: f.ivaRetenido,
      retIsr: f.isrRetenido,
      total: f.total,
      conceptos: f.conceptos
    }));

    const labelRegimenMap: Record<string, string> = {
      'RESICO_PF': 'RESICO (Régimen Simplificado de Confianza - Persona Física)',
      'AE_P_F': 'Régimen de Actividad Empresarial y Profesional (Persona Física)',
      'P_MORAL_GEN': 'Persona Moral - Régimen General Ley',
      'RIF': 'Régimen de Incorporación Fiscal (RIF)',
      'SUELDOS': 'Régimen de Sueldos y Salarios'
    };

    try {
      const response = await fetch('/api/analyze-xml-ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          xmlSummary: xmlTotals,
          fileDetails: structuredDetails.slice(0, 35),
          regimen: labelRegimenMap[xmlRegimen] || xmlRegimen
        })
      });

      if (!response.ok) {
        throw new Error('El servidor de Inteligencia Artificial SAT no respondió a tiempo.');
      }

      const data = await response.json();
      setAuditResult(data.result);
    } catch (error: any) {
      console.error('AI XML audit error:', error);
      setAuditResult(`⚠️ Error: ${error.message || 'La auditoría con Inteligencia Artificial no pudo procesarse.'}`);
    } finally {
      setAuditing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col antialiased">
      {/* Upper header segment */}
      <header className="bg-gold-gradient shadow-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 backdrop-blur-md p-2.5 rounded-xl border border-white/20">
              <FileSpreadsheet className="text-wheat w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter text-white leading-none">
                ISBB <span className="text-wheat">SOLUCIONES</span>
              </h1>
              <p className="text-[10px] text-wheat/70 font-medium uppercase tracking-[0.2em] mt-1">Portal Contable de Alta Gama</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-emerald-550/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-bold px-3 py-1.5 rounded-full uppercase tracking-widest inline-flex items-center gap-1.5 bg-slate-800">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
              Sincronizado con el SAT
            </span>
          </div>
        </div>
      </header>

      {/* Hero Header Area */}
      <div className="bg-slate-900 border-b border-slate-800 py-10 text-white relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="space-y-3 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] bg-slate-800 text-gold-300 font-black uppercase tracking-wider border border-slate-700">
                <Award className="w-3.5 h-3.5 text-gold-400" /> Conciliador de XML Premium / ISBB
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] bg-blue-500/10 text-blue-300 font-black uppercase tracking-wider border border-blue-500/20">
                <Shield className="w-3.5 h-3.5 text-blue-400" /> Facturación CFDI 4.0
              </span>
            </div>
            <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight">
              Análisis y Conciliación Fiscal de <span className="text-wheat">Archivos XML</span>
            </h2>
            <p className="text-slate-300 text-sm leading-relaxed">
              Cargue de forma local, inmediata y segura sus archivos XML emitidos y recibidos del SAT. Obtenga visualización interactiva de sumas netas, exporte registros conciliados a Excel con desgloses tributarios completos por tasa y folio de manera cronológica.
            </p>
          </div>
          
          <div className="flex items-center gap-4 bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700/50 self-start md:self-auto">
            <div className="bg-wheat/10 p-2.5 rounded-xl">
              <Bot className="text-wheat w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Módulos Activos</p>
              <p className="text-xs text-wheat font-medium">Consola de Control Fiscal Activa</p>
            </div>
          </div>
        </div>
        {/* Decorative background shapes */}
        <div className="absolute top-0 right-0 -mr-24 -mt-24 w-80 h-80 bg-wheat/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-24 -mb-24 w-80 h-80 bg-gold-900/20 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Main Container Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 flex flex-col gap-8">
        <div className="space-y-8" id="xml-analyzer-container">
              {/* Quick Summary Cards on Parsed XML Data */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
                  <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl border border-emerald-100">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ingresos Emitidos (I)</p>
                    <p className="text-lg font-black text-emerald-700">
                      ${xmlTotals.ingresosTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                    </p>
                    <p className="text-[9px] text-slate-500 font-mono mt-0.5">{xmlTotals.ingresosCount} comprobantes cargados</p>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
                  <div className="bg-amber-50 text-amber-600 p-3 rounded-xl border border-amber-100">
                    <Percent className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Deducciones / Gastos (E)</p>
                    <p className="text-lg font-black text-amber-700">
                      ${xmlTotals.egresosTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                    </p>
                    <p className="text-[9px] text-slate-500 font-mono mt-0.5">{xmlTotals.egresosCount} comprobantes cargados</p>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
                  <div className="bg-blue-50 text-blue-600 p-3 rounded-xl border border-blue-100">
                    <Coins className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Balance IVA Neto</p>
                    <p className={`text-lg font-black ${xmlTotals.balanceIva >= 0 ? 'text-slate-800' : 'text-emerald-600'}`}>
                      ${xmlTotals.balanceIva.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                    </p>
                    <p className="text-[9px] text-slate-500 font-mono mt-0.5">IVA Trasladado vs Acreditable</p>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
                  <div className="bg-slate-900 border border-slate-800 text-white p-3 rounded-xl flex-1 flex justify-between items-center">
                    <div>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Total Impuestos Retenidos</p>
                      <p className="text-md font-black text-gold-400">
                        ${(xmlTotals.ivaRetenidoTotal + xmlTotals.isrRetenidoTotal).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN
                      </p>
                      <p className="text-[8px] text-slate-300 font-mono mt-0.5">IVA: ${xmlTotals.ivaRetenidoTotal.toFixed(1)} | ISR: ${xmlTotals.isrRetenidoTotal.toFixed(1)}</p>
                    </div>
                    <span className="bg-amber-500/10 text-wheat border border-amber-500/20 text-[10px] px-2.5 py-1 rounded font-black font-mono">
                      {xmlTotals.totalFiles} XMLs
                    </span>
                  </div>
                </div>
              </div>

              {/* Upload dashboard area */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                {/* Left controls panel */}
                <div className="lg:col-span-5 space-y-6">
                  
                  {/* File Upload Zone */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-md">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-3">Suministrar Documentos Fiscales</h3>
                    <p className="text-xs text-slate-500 leading-relaxed mb-4">
                      Arrastre o examine varios archivos XML de facturas del SAT al mismo tiempo. Se procesan de forma inmediata a nivel de cliente sin esperas de red.
                    </p>

                    <div 
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-2xl p-8 hover:bg-slate-50 text-center transition-all bg-slate-50/50 cursor-pointer ${
                        isDragging ? 'border-amber-500 bg-amber-50/30' : 'border-slate-350'
                      }`}
                      onClick={() => document.getElementById('xml-files-input')?.click()}
                    >
                      <input 
                        type="file" 
                        id="xml-files-input" 
                        multiple 
                        accept=".xml" 
                        onChange={handleFileChange} 
                        className="hidden" 
                      />
                      <div className="bg-white p-3.5 rounded-full shadow-sm w-12 h-12 flex items-center justify-center mx-auto mb-3 border border-slate-200">
                        <Upload className="w-6 h-6 text-slate-400 hover:text-gold-600" />
                      </div>
                      <p className="text-xs font-bold text-slate-700">Arrastre sus CFDIs XML aquí</p>
                      <p className="text-[10px] text-slate-400 mt-1">O pulse para examinar de forma manual</p>
                    </div>

                    {sortedUploadedFiles.length > 0 && (
                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-650 bg-slate-100 px-3 py-1 rounded-full flex items-center gap-1.5 border border-slate-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                          {sortedUploadedFiles.length} Facturas Cargadas
                        </span>
                        <button 
                          onClick={handleClearAllFiles}
                          className="text-[10px] font-bold text-red-600 hover:text-red-700 uppercase flex items-center gap-1 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Limpiar Todo
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Operational Guide Card replacing AI Trigger */}
                  <div className="bg-slate-900 border border-slate-800 text-white p-6 rounded-3xl shadow-md space-y-4">
                    <div className="flex items-center gap-2">
                      <Shield className="text-wheat w-5 h-5" />
                      <h3 className="text-xs font-black uppercase tracking-wider text-white">Dictamen y Conciliación Estándar</h3>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Este sistema procesa la estructura original de los archivos XML CFDI versión 4.0 emitida por el SAT mexicano.
                    </p>
                    <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/50 space-y-2 text-[10px] font-mono text-slate-300">
                      <p className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> Reconocimiento de Catálogos SAT 2026</p>
                      <p className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> Mapeo automático de Uso de CFDI</p>
                      <p className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> Mapeo automático de Forma de Pago</p>
                      <p className="flex items-center gap-1.5"><span className="text-emerald-400">✓</span> Clasificación de base exenta y no objeto</p>
                    </div>
                    <p className="text-[10px] text-slate-400 italic">
                      Toda la información se calcula automáticamente de manera estrictamente local para resguardar el secreto fiscal de sus clientes.
                    </p>
                  </div>

                </div>

                {/* Right Results / Reports view panel */}
                <div className="lg:col-span-7 space-y-6">
                  
                  {/* Detailed Tax Breakdown Audit Console */}
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-md p-6 min-h-[430px] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between border-b pb-4 mb-4">
                        <div className="flex items-center gap-2">
                          <Scale className="w-5 h-5 text-gold-600" />
                          <h3 className="text-md font-black text-slate-900 tracking-tight">Consola de Desglose de Impuestos</h3>
                        </div>
                        {sortedUploadedFiles.length > 0 && (
                          <button
                            onClick={handleExportToExcel}
                            className="text-[10px] bg-emerald-50 text-emerald-700 font-extrabold px-3 py-1.5 rounded-xl border border-emerald-100 flex items-center gap-1 hover:bg-emerald-100 transition-colors"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" /> Descargar Excel
                          </button>
                        )}
                      </div>

                      {/* Pending files state */}
                      {sortedUploadedFiles.length === 0 && (
                        <div className="py-24 text-center space-y-3">
                          <FileCodeSection />
                          <h4 className="text-sm font-bold text-slate-700">Sin Facturas XML Cargadas</h4>
                          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                            Cargue sus CFDIs emitidos o recibidos en el panel de suministro para ver el desglose fiscal e impuestos consolidados.
                          </p>
                        </div>
                      )}

                      {/* Formatted Tax breakdown and financial reconciliation sheets */}
                      {sortedUploadedFiles.length > 0 && (
                        <div className="space-y-4">
                          <div className="bg-slate-50 rounded-2xl border border-slate-150 p-4 space-y-3.5">
                            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b pb-2">Resumen General de Base Gravable</h4>
                            
                            <div className="grid grid-cols-2 gap-4 text-xs">
                              <div className="bg-white p-3 rounded-xl border border-slate-100 flex flex-col justify-between">
                                <span className="text-slate-400 text-[10px] font-bold uppercase">Subtotal Neto</span>
                                <span className="text-sm font-black text-slate-800">${xmlTotals.subTotalAcumulado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-slate-100 flex flex-col justify-between">
                                <span className="text-slate-400 text-[10px] font-bold uppercase">Total Facturado</span>
                                <span className="text-sm font-black text-slate-900">${xmlTotals.totalAcumulado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                            </div>
                          </div>

                          <div className="bg-slate-50 rounded-2xl border border-slate-150 p-4 space-y-3">
                            <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b pb-2">Desglose de Tasas y Exenciones</h4>
                            
                            <div className="space-y-2 text-xs">
                              <div className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-slate-100">
                                <span className="text-slate-500 font-semibold">Impuesto Exento base</span>
                                <span className="font-extrabold text-slate-705">${xmlTotals.impuestoExentoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>

                              <div className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-slate-100">
                                <span className="text-slate-500 font-semibold">No Objeto a Impuestos base</span>
                                <span className="font-extrabold text-slate-705">${xmlTotals.noObjetoImpuestoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>

                              <div className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-slate-100">
                                <span className="text-slate-500 font-semibold">Tasa 0% base</span>
                                <span className="font-extrabold text-slate-705">${xmlTotals.tasa0BaseTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>

                              <div className="flex justify-between items-center bg-white p-2.5 rounded-lg border border-slate-100">
                                <span className="text-slate-500 font-semibold">Tasa 16% base</span>
                                <span className="font-extrabold text-slate-705">${xmlTotals.tasa16BaseTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                            </div>
                          </div>

                          <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-3">
                            <h4 className="text-xs font-black text-gold-400 uppercase tracking-widest border-b border-slate-800 pb-2">Impuestos de Traslado, IEPS y Retenciones</h4>
                            
                            <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                              <div className="flex justify-between border-b border-slate-800 pb-1.5">
                                <span className="text-slate-400">IVA Trasladado:</span>
                                <span className="font-black text-emerald-400">${xmlTotals.ivaTrasladadoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                              <div className="flex justify-between border-b border-slate-800 pb-1.5">
                                <span className="text-slate-400">IVA Acreditable:</span>
                                <span className="font-black text-amber-400">${xmlTotals.ivaAcreditableTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                              <div className="flex justify-between border-b border-slate-800 pb-1.5">
                                <span className="text-slate-400">Retención IVA:</span>
                                <span className="font-black text-red-400">${xmlTotals.ivaRetenidoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                              <div className="flex justify-between border-b border-slate-800 pb-1.5">
                                <span className="text-slate-400">Retención ISR:</span>
                                <span className="font-black text-red-400">${xmlTotals.isrRetenidoTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              </div>
                            </div>
                            <div className="flex justify-between items-center pt-1 border-t border-slate-800 text-xs">
                              <span className="text-gold-300 font-bold">Impuesto IEPS Total:</span>
                              <span className="font-black text-gold-400">${xmlTotals.iepsTotalSum.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                </div>

              </div>

              {/* Data Table catalog containing parsed XML files list */}
              {uploadedFiles.length > 0 && (
                <div className="bg-white rounded-3xl border border-slate-200 shadow-md p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-black text-slate-900 tracking-tight">Catálogo Detallado de Facturas XML</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Listado y desgloses de comprobantes extraídos en tiempo real</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Search Bar */}
                      <div className="relative">
                        <input 
                          type="text" 
                          placeholder="Filtre por RFC, Razón o Folio..."
                          value={xmlSearchQuery}
                          onChange={(e) => setXmlSearchQuery(e.target.value)}
                          className="bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-4 py-2 text-xs font-medium text-slate-700 outline-none focus:border-gold-500 focus:bg-white w-48 transition-colors"
                        />
                        <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      </div>

                      {/* Toggle Advanced Filters Button */}
                      <button 
                        onClick={() => setIsAdvancedFiltersOpen(!isAdvancedFiltersOpen)}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border shadow-sm ${
                          isAdvancedFiltersOpen 
                            ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-850' 
                            : 'bg-white text-slate-705 border-slate-200 hover:bg-slate-50'
                        }`}
                        title="Activar panel de búsqueda y filtros detallados"
                      >
                        <Search className="w-4 h-4" />
                        Filtros Avanzados
                        {(filterStartDate || filterEndDate || filterCfdiType !== 'ALL' || filterRfcEmisor || filterRfcReceptor || filterConcept) && (
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        )}
                      </button>

                      <button 
                        onClick={handleExportToExcel}
                        className="py-2 px-3 bg-emerald-600 hover:bg-emerald-600 border border-emerald-550 text-white hover:border-emerald-700 text-xs font-bold uppercase tracking-wide rounded-xl flex items-center justify-center gap-1.5 transition-all w-full sm:w-auto shadow-sm"
                        title="Exportar conciliación a Excel"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                        Exportar XLSX
                      </button>
                    </div>
                  </div>

                  <AnimatePresence initial={false}>
                    {isAdvancedFiltersOpen && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="bg-slate-50/75 rounded-2xl border border-slate-200 p-5 space-y-4 overflow-hidden"
                      >
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                          <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                            Panel de Filtrado Avanzado
                          </span>
                          <button 
                            onClick={handleResetFilters}
                            className="text-[10px] font-bold text-red-600 hover:text-red-700 uppercase flex items-center gap-1 transition-colors"
                          >
                            Restablecer Filtros
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                          {/* Column 1: Dates & CFDI Type */}
                          <div className="space-y-3">
                            <div>
                              <span className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Rango de Fechas (Desde / Hasta)</span>
                              <div className="grid grid-cols-2 gap-2">
                                <input 
                                  type="date"
                                  value={filterStartDate}
                                  onChange={(e) => setFilterStartDate(e.target.value)}
                                  className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-bold focus:border-gold-500 outline-none transition-colors"
                                />
                                <input 
                                  type="date"
                                  value={filterEndDate}
                                  onChange={(e) => setFilterEndDate(e.target.value)}
                                  className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-bold focus:border-gold-500 outline-none transition-colors"
                                />
                              </div>
                            </div>

                            <div>
                              <span className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Tipo de CFDI</span>
                              <select 
                                value={filterCfdiType}
                                onChange={(e) => setFilterCfdiType(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-bold focus:border-gold-500 outline-none transition-colors"
                              >
                                <option value="ALL">Todos los tipos</option>
                                <option value="I">I - Ingresos (Ventas/Cobros)</option>
                                <option value="E">E - Egresos (Gastos)</option>
                                <option value="P">P - Complementos de Pago</option>
                              </select>
                            </div>
                          </div>

                          {/* Column 2: RFC Emisor, Receptor & Specific concepts */}
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">RFC/Nombre Emisor</span>
                                <input 
                                  type="text"
                                  placeholder="RFC o Nombre..."
                                  value={filterRfcEmisor}
                                  onChange={(e) => setFilterRfcEmisor(e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-semibold focus:border-gold-500 outline-none transition-colors"
                                />
                              </div>
                              <div>
                                <span className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">RFC/Nombre Receptor</span>
                                <input 
                                  type="text"
                                  placeholder="RFC o Nombre..."
                                  value={filterRfcReceptor}
                                  onChange={(e) => setFilterRfcReceptor(e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-semibold focus:border-gold-500 outline-none transition-colors"
                                />
                              </div>
                            </div>

                            <div>
                              <span className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Conceptos o Productos Específicos</span>
                              <input 
                                type="text"
                                placeholder="Ej: honorarios, gasolina, arrendamiento..."
                                value={filterConcept}
                                onChange={(e) => setFilterConcept(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-medium focus:border-gold-500 outline-none transition-colors"
                              />
                            </div>
                          </div>

                          {/* Column 3: Predefined & Saved Presets */}
                          <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col justify-between">
                            <div>
                              <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Filtros Guardados</span>
                              
                              <div className="flex flex-wrap gap-1 max-h-[80px] overflow-y-auto mb-2 content-start">
                                {savedFilters.map((preset) => (
                                  <div
                                    key={preset.id}
                                    onClick={() => applyPresetFilter(preset)}
                                    className="text-[9px] bg-slate-50 hover:bg-gold-50 hover:text-gold-700 hover:border-gold-200 text-slate-650 px-2.5 py-1 rounded-lg border border-slate-200 font-bold flex items-center gap-1 transition-all cursor-pointer"
                                    title="Aplicar preset"
                                  >
                                    <span>{preset.name}</span>
                                    <span 
                                      onClick={(e) => handleRemovePreset(preset.id, e)}
                                      className="text-slate-400 hover:text-red-600 font-black ml-1 text-[11px] h-3 w-3 flex items-center justify-center rounded-full hover:bg-red-50"
                                      title="Quitar preset"
                                    >
                                      ×
                                    </span>
                                  </div>
                                ))}

                                {savedFilters.length === 0 && (
                                  <span className="text-[10px] text-slate-450 italic">Sin filtros guardados aún</span>
                                )}
                              </div>
                            </div>

                            {/* Save Preset Form */}
                            <form onSubmit={handleSaveCurrentFilter} className="flex gap-1 border-t border-slate-100 pt-2 shrink-0">
                              <input 
                                type="text"
                                placeholder="Guardar como..."
                                value={presetName}
                                onChange={(e) => setPresetName(e.target.value)}
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-[10px] font-semibold text-slate-700 focus:border-gold-400 outline-none transition-colors"
                                required
                              />
                              <button
                                type="submit"
                                className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold px-2.5 py-1 rounded-xl text-[9px] uppercase tracking-wider transition-all"
                              >
                                Guardar
                              </button>
                            </form>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Responsive Table Grid */}
                  <div className="overflow-x-auto rounded-xl border border-slate-150">
                    <table className="w-full text-left border-collapse min-w-[1000px]">
                      <thead>
                        <tr className="bg-slate-900 text-white uppercase text-[10px] tracking-wider font-extrabold font-sans">
                          <th className="p-4 rounded-tl-xl">Folio / UUID</th>
                          <th className="p-4">Tipo</th>
                          <th className="p-4">Fecha</th>
                          <th className="p-4">Emisor</th>
                          <th className="p-4">Receptor</th>
                          <th className="p-4 text-right">Subtotal</th>
                          <th className="p-4 text-right">IVA (16%)</th>
                          <th className="p-4 text-right">ISR Ret.</th>
                          <th className="p-4 text-right">Total Neto</th>
                          <th className="p-4 text-center rounded-tr-xl">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {filteredFilesList.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-4">
                              <span className="font-bold text-slate-800">
                                {item.serie ? `${item.serie}-` : ''}{item.folio}
                              </span>
                              <span className="block text-[8px] text-slate-400 max-w-[100px] truncate" title={item.fileName}>
                                {item.fileName}
                              </span>
                            </td>
                            <td className="p-4">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                item.tipo === 'I' 
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                  : item.tipo === 'E' 
                                    ? 'bg-amber-50 text-amber-700 border border-amber-100' 
                                    : 'bg-slate-150 text-slate-600 border border-slate-200'
                              }`}>
                                {item.tipo === 'I' ? 'Cobro (I)' : item.tipo === 'E' ? 'Gasto (E)' : `Pago (${item.tipo})`}
                              </span>
                            </td>
                            <td className="p-4 font-bold text-slate-600 font-mono">{item.fecha}</td>
                            <td className="p-4">
                              <p className="font-extrabold text-slate-700 max-w-[150px] truncate" title={item.emisorNombre}>{item.emisorNombre}</p>
                              <p className="text-[9px] text-slate-400 font-mono">{item.emisorRfc}</p>
                            </td>
                            <td className="p-4">
                              <p className="font-extrabold text-slate-700 max-w-[150px] truncate" title={item.receptorNombre}>{item.receptorNombre}</p>
                              <p className="text-[9px] text-slate-400 font-mono">{item.receptorRfc}</p>
                            </td>
                            <td className="p-4 text-right font-bold text-slate-700">
                              ${item.subTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="p-4 text-right font-mono text-slate-500">
                              ${(item.tipo === 'I' ? item.ivaTrasladado : item.ivaAcreditable).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="p-4 text-right font-mono text-amber-700">
                              ${item.isrRetenido.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="p-4 text-right font-bold text-slate-900">
                              ${item.total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex justify-center gap-1.5">
                                <button 
                                  onClick={() => setSelectedFile(item)}
                                  className="p-1.5 bg-slate-100 hover:bg-gold-100/50 hover:text-gold-700 hover:border-gold-300 rounded text-slate-500 transition-colors border border-slate-200"
                                  title="Ver conceptos detallados"
                                >
                                  <Info className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => handleRemoveFileByFilename(item.fileName)}
                                  className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 hover:border-red-300 rounded transition-colors border border-red-200"
                                  title="Quitar factura"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {filteredFilesList.length === 0 && (
                    <p className="text-xs text-center py-6 text-slate-400 font-medium">No se encontraron comprobantes XML con su criterio de filtración.</p>
                  )}
                </div>
              )}

              {/* Individual File Detail Modal */}
              {selectedFile && (
                <div className="fixed inset-0 bg-slate-950/45 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
                    <div className="bg-slate-900 p-5 text-white flex justify-between items-center">
                      <div>
                        <h4 className="font-extrabold text-sm flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-gold-400" />
                          Detalles Técnicos: {selectedFile.serie ? `${selectedFile.serie}-` : ''}{selectedFile.folio}
                        </h4>
                        <p className="text-[10px] text-slate-450 truncate max-w-[320px]">{selectedFile.fileName}</p>
                      </div>
                      <button 
                        onClick={() => setSelectedFile(null)}
                        className="bg-white/15 hover:bg-white/20 px-3 py-1 text-xs rounded-lg text-slate-300 hover:text-white border border-white/10 transition-colors font-bold"
                      >
                        Cerrar
                      </button>
                    </div>

                    <div className="p-6 space-y-4 text-xs max-h-[500px] overflow-y-auto">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">RFC Emisor</p>
                          <p className="font-extrabold text-slate-700">{selectedFile.emisorRfc}</p>
                          <p className="text-[10px] text-slate-500 overflow-hidden text-ellipsis whitespace-nowrap">{selectedFile.emisorNombre}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">RFC Receptor</p>
                          <p className="font-extrabold text-slate-700">{selectedFile.receptorRfc}</p>
                          <p className="text-[10px] text-slate-500 overflow-hidden text-ellipsis whitespace-nowrap">{selectedFile.receptorNombre}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">Uso de CFDI</p>
                          <p className="font-bold text-slate-700">{selectedFile.usoCfdi || 'S/E'}</p>
                          <p className="text-[10px] text-slate-500 truncate" title={selectedFile.usoCfdiDesc}>{selectedFile.usoCfdiDesc || 'Sin especificar'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">Forma de Pago</p>
                          <p className="font-bold text-slate-700">{selectedFile.formaPago || 'S/E'}</p>
                          <p className="text-[10px] text-slate-500 truncate" title={selectedFile.formaPagoDesc}>{selectedFile.formaPagoDesc || 'Sin especificar'}</p>
                        </div>
                      </div>

                      <div className="bg-slate-900 text-white p-4 rounded-xl font-mono text-[10px] space-y-2 font-semibold">
                        <p className="text-gold-400 font-black border-b border-slate-800 pb-1 uppercase tracking-wider">Desglose de Impuestos SAT</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                          <div className="flex justify-between">
                            <span className="text-slate-450">Subtotal:</span>
                            <span className="font-bold text-slate-205">${selectedFile.subTotal.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-450">Impuesto Exento:</span>
                            <span className="font-bold text-slate-205">${selectedFile.impuestoExento.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-450 font-semibold text-slate-450">No Objeto:</span>
                            <span className="font-bold text-slate-205">${selectedFile.noObjetoImpuesto.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-450">Base Tasa 0%:</span>
                            <span className="font-bold text-slate-205">${selectedFile.tasa0Base.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-450">Base Tasa 16%:</span>
                            <span className="font-bold text-emerald-305">${selectedFile.tasa16Base.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-450">IVA Tras/Acred:</span>
                            <span className="font-bold text-emerald-305">${(selectedFile.tipo === 'I' ? selectedFile.ivaTrasladado : selectedFile.ivaAcreditable).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-450">IEPS total:</span>
                            <span className="font-bold text-amber-305">${selectedFile.iepsTotal.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-450">Retención IVA:</span>
                            <span className="font-bold text-red-305">${selectedFile.ivaRetenido.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-450">Retención ISR:</span>
                            <span className="font-bold text-red-305">${selectedFile.isrRetenido.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between border-t border-slate-800 pt-1.5 col-span-2 text-gold-300 font-extrabold text-xs">
                            <span>TOTAL NETO:</span>
                            <span>${selectedFile.total.toFixed(2)} MXN</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Conceptos Desglosados ({selectedFile.conceptos.length})</p>
                        <div className="space-y-1.5">
                          {selectedFile.conceptos.map((c, cIdx) => (
                            <div key={cIdx} className="bg-slate-50 border border-slate-150 p-2.5 rounded-lg text-slate-650 flex items-start gap-2">
                              <span className="bg-slate-200 text-slate-600 font-black h-4 w-4 shrink-0 rounded-full flex items-center justify-center text-[10px] font-mono mt-0.5">
                                {cIdx + 1}
                              </span>
                              <p className="text-xs leading-relaxed font-semibold text-slate-700">{c}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}


              



        </div>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 py-16 text-center border-t-4 border-wheat mt-auto">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-black text-white tracking-tighter mb-4">
            ISBB <span className="text-wheat">SOLUCIONES</span>
          </h2>
          <p className="text-wheat/40 text-xs font-bold uppercase tracking-[0.4em]">
            Inteligencia Contable & Soluciones Fiscales Avanzadas
          </p>
          <div className="w-12 h-1 bg-wheat mx-auto my-8 rounded-full opacity-30" />
          <p className="text-white/20 text-[10px] font-medium tracking-wider">
            © {new Date().getFullYear()} ISBB SOLUCIONES - Plataforma Especializada en Automatización y Reportes SAT
          </p>
        </div>
      </footer>
    </div>
  );
}

// Inline custom decorative components
function FileCodeSection() {
  return (
    <div className="mx-auto w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center border border-slate-200">
      <FileText className="w-8 h-8 text-slate-400" />
    </div>
  );
}
