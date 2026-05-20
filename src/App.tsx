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
  Scale
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

// Interface for conversational chat messages
interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
}

export default function App() {
  const cpaCloudUrl = 'https://script.google.com/macros/s/AKfycbyQ6utU_Qd7RwtVkLe7wh_7y1ws47t0Qplyyb2lazMRdYS9WR-njmM7CjjkhI2NRMKx/exec';
  const [iframeKey, setIframeKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [loadingIframe, setLoadingIframe] = useState(true);
  
  // Navigation: xml-audit (Analizador XML), sheets-console (GAS Iframe), ai-chat (CPA chat & Simulator)
  const [activeTab, setActiveTab] = useState<'xml-audit' | 'sheets-console' | 'ai-chat'>('xml-audit');

  // --- TAB 1: XML AUDITOR & TAX ANALYZER STATE ---
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

  // --- TAB 3: CHAT AND ESTIMATOR SECTIONS STATE ---
  const [ingresos, setIngresos] = useState<string>('55000');
  const [deducciones, setDeducciones] = useState<string>('18000');
  const [retenciones, setRetenciones] = useState<string>('1200');
  const [regimen, setRegimen] = useState<string>('RESICO_PF');
  const [calculating, setCalculating] = useState<boolean>(false);
  const [calcResult, setCalcResult] = useState<string>('');

  const [chatInput, setChatInput] = useState<string>('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

  // Initialize welcome message once
  React.useEffect(() => {
    setChatHistory([
      {
        id: 'welcome',
        role: 'model',
        content: '¡Hola! Soy tu **Asesor Fiscal y Contable de ISBB SOLUCIONES**. Como especialista en la legislación del SAT mexicano, puedo ayudarte a analizar tus ingresos, deducir correctamente bajo tu régimen fiscal, simular pagos de ISR/IVA o resolver dudas sobre CFDI 4.0. \n\n¿En qué puedo asistirte técnicamente hoy?',
        timestamp: new Date()
      }
    ]);
  }, []);

  const [sendingChat, setSendingChat] = useState<boolean>(false);

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

  // Remove a single parsed file safely by sorted index
  const handleRemoveFile = (indexToRemove: number) => {
    setUploadedFiles(prev => {
      const sorted = [...prev].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
      const fileToRemove = sorted[indexToRemove];
      if (fileToRemove) {
        return prev.filter(f => f.fileName !== fileToRemove.fileName);
      }
      return prev.filter((_, idx) => idx !== indexToRemove);
    });
    if (uploadedFiles.length <= 1) {
      setAuditResult('');
    }
  };

  // Reset entire files console
  const handleClearAllFiles = () => {
    setUploadedFiles([]);
    setAuditResult('');
  };

  // High performance computations on parsed XMLs
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

    // Detailed tax sums requested by user
    let impuestoExentoTotal = 0;
    let noObjetoImpuestoTotal = 0;
    let tasa0BaseTotal = 0;
    let tasa16BaseTotal = 0;
    let iepsTotalSum = 0;

    sortedUploadedFiles.forEach(f => {
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

      // Add detailed taxes
      impuestoExentoTotal += f.impuestoExento;
      noObjetoImpuestoTotal += f.noObjetoImpuesto;
      tasa0BaseTotal += f.tasa0Base;
      tasa16BaseTotal += f.tasa16Base;
      iepsTotalSum += f.iepsTotal;
    });

    const balanceIva = ivaTrasladadoTotal - ivaAcreditableTotal - ivaRetenidoTotal;

    return {
      totalFiles: sortedUploadedFiles.length,
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

      // New properties
      impuestoExentoTotal,
      noObjetoImpuestoTotal,
      tasa0BaseTotal,
      tasa16BaseTotal,
      iepsTotalSum
    };
  }, [sortedUploadedFiles]);

  // Export fully built catalog to standard Excel workbook (Sorted chronologically)
  const handleExportToExcel = () => {
    if (sortedUploadedFiles.length === 0) return;
    
    const excelRows = sortedUploadedFiles.map(f => ({
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

  // Send XML context to modern server-side endpoint for expert tax audit
  const handleAnalyzeXmlAI = async () => {
    if (uploadedFiles.length === 0 || auditing) return;
    
    setAuditing(true);
    setAuditResult('');
    
    // Thin down files array to strictly match active models context windows securely
    const structuredDetails = uploadedFiles.map(f => ({
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
      
      // Also write results directly to the active CPA chat history for seamless consolidation
      const newHistory: ChatMessage[] = [
        ...chatHistory,
        {
          id: `audit-usr-${Date.now()}`,
          role: 'user',
          content: `Efectúa una auditoría automatizada sobre un lote de ${uploadedFiles.length} archivos XML bajo mi régimen fiscal.`,
          timestamp: new Date()
        },
        {
          id: `audit-res-${Date.now()}`,
          role: 'model',
          content: `### 📋 Dictamen de Auditoría XML Generada:\n\n${data.result}`,
          timestamp: new Date()
        }
      ];
      setChatHistory(newHistory);
      
    } catch (error: any) {
      console.error('AI XML audit error:', error);
      setAuditResult(`⚠️ Error: ${error.message || 'La auditoría con Inteligencia Artificial no pudo procesarse.'}`);
    } finally {
      setAuditing(false);
    }
  };

  // Search filtering logic for the XML table
  const filteredFilesList = uploadedFiles.filter(item => {
    const q = xmlSearchQuery.toLowerCase();
    return (
      item.fileName.toLowerCase().includes(q) ||
      item.emisorNombre.toLowerCase().includes(q) ||
      item.emisorRfc.toLowerCase().includes(q) ||
      item.receptorNombre.toLowerCase().includes(q) ||
      item.receptorRfc.toLowerCase().includes(q) ||
      item.folio.toLowerCase().includes(q)
    );
  });

  // --- REFRESH / COPY SECURE APPS SCRIPT IFRAME ---
  const handleRefreshIframe = () => {
    setLoadingIframe(true);
    setIframeKey(prev => prev + 1);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(cpaCloudUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- MANUAL TAX CALCULATOR SIMULATION SUBMIT ---
  const handleCalculateTaxesManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setCalculating(true);
    setCalcResult('');

    const regimenLabelMap: Record<string, string> = {
      'RESICO_PF': 'Régimen Simplificado de Confianza (RESICO) - Persona Física',
      'AE_P_F': 'Personas Físicas con Actividad Empresarial y Profesional',
      'P_MORAL_GEN': 'Persona Moral - Régimen General Ley',
      'RIF': 'Régimen de Incorporación Fiscal (RIF)',
      'SUELDOS': 'Sueldos y Salarios / Asimilados'
    };

    const promptText = `Por favor, realiza un cálculo contable integral y reporte ejecutivo estimado para el periodo mensual con los siguientes datos monetarios:
- Ingresos Brutos Totales Declarados: $${ingresos} MXN
- Gastos y Deducciones Autorizadas Facturadas: $${deducciones} MXN
- Retenciones Efectuadas de Impuestos (por personas morales u otros): $${retenciones} MXN
- Régimen Fiscal del Contribuyente: ${regimenLabelMap[regimen] || regimen}

Genera las fórmulas fiscales con su desglose:
1. Base gravable y porcentaje de tasa aplicable mensual.
2. ISR aproximado a cargo y el ISR neto a pagar restando las retenciones correspondientes.
3. Desglose de IVA (IVA Trasladado al 16%, IVA Acreditable al 16% y resultado neto de IVA pagar o a favor).
4. Un diagnóstico rápido con 3 consejos de estrategia fiscal personalizados para el régimen seleccionado con el objetivo de optimizar el pago en futuros meses bajo la normatividad de la Ley de ISR mexicana actual.`;

    try {
      const response = await fetch('/api/analyze-tax-ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: promptText }),
      });

      if (!response.ok) {
        throw new Error('No se pudo establecer conexión con el motor de cálculo de IA.');
      }

      const data = await response.json();
      setCalcResult(data.result);
      
      const newHistory: ChatMessage[] = [
        ...chatHistory,
        {
          id: `calc-usr-${Date.now()}`,
          role: 'user',
          content: `Cálculo rápido ejecutado bajo el régimen "${regimenLabelMap[regimen]}" con Ingresos de $${ingresos} MXN y Deducciones de $${deducciones} MXN.`,
          timestamp: new Date()
        },
        {
          id: `calc-res-${Date.now()}`,
          role: 'model',
          content: `### 📊 Reporte de Cálculo Estimado Generado:\n\n${data.result}`,
          timestamp: new Date()
        }
      ];
      setChatHistory(newHistory);
    } catch (error: any) {
      console.error('Calculation AI error:', error);
      setCalcResult(`⚠️ Error: ${error.message || 'No se pudo generar el análisis. Verifique su conexión y vuelva a intentarlo.'}`);
    } finally {
      setCalculating(false);
    }
  };

  // --- CONVERSATIONAL CHAT API TRIGGERS ---
  const handleSendChatText = async (presetPrompt?: string) => {
    const textToSend = presetPrompt || chatInput;
    if (!textToSend.trim() || sendingChat) return;

    if (!presetPrompt) {
      setChatInput('');
    }

    const userMessage: ChatMessage = {
      id: `chat-usr-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date()
    };

    const temporaryHistory = [...chatHistory, userMessage];
    setChatHistory(temporaryHistory);
    setSendingChat(true);

    try {
      const apiHistory = temporaryHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const response = await fetch('/api/analyze-tax-ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          prompt: textToSend,
          chatHistory: apiHistory.slice(-6) // Preserve last 6 messages
        }),
      });

      if (!response.ok) {
        throw new Error('Fallo en la conexión del servicio contable de IA.');
      }

      const data = await response.json();
      
      setChatHistory(prev => [
        ...prev,
        {
          id: `chat-res-${Date.now()}`,
          role: 'model',
          content: data.result,
          timestamp: new Date()
        }
      ]);
    } catch (error: any) {
      console.error('Chat error:', error);
      setChatHistory(prev => [
        ...prev,
        {
          id: `chat-err-${Date.now()}`,
          role: 'model',
          content: `⚠️ Lo lamento, en este momento el módulo de Asesoría IA de ISBB SOLUCIONES experimenta latencia. Error: ${error.message || 'Error técnico de red.'}`,
          timestamp: new Date()
        }
      ]);
    } finally {
      setSendingChat(false);
    }
  };

  // Raw Markdown interpreter that maps lists, headers and bolding into premium CSS markup
  const renderMarkdownTextHTML = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, index) => {
      if (line.startsWith('### ')) {
        return <h4 key={index} className="text-sm font-black text-slate-900 mt-5 mb-2 first:mt-0 flex items-center gap-1.5">{line.substring(4)}</h4>;
      }
      if (line.startsWith('## ')) {
        return <h3 key={index} className="text-md font-black text-slate-950 mt-6 mb-3 flex items-center gap-1.5 border-b pb-1.5 border-slate-100">{line.substring(3)}</h3>;
      }
      if (line.startsWith('# ')) {
        return <h2 key={index} className="text-lg font-black text-gold-700 mt-7 mb-4 flex items-center gap-2">{line.substring(2)}</h2>;
      }
      
      if (line.trim().startsWith('|') && line.includes('-|-')) {
        return null;
      }
      if (line.trim().startsWith('|')) {
        const columns = line.split('|').map(c => c.trim()).filter(c => c !== '');
        return (
          <div key={index} className="grid grid-cols-2 gap-2 bg-slate-50 hover:bg-slate-100 p-2.5 rounded-lg border border-slate-200/50 my-1 text-xs">
            {columns.map((col, colIdx) => (
              <span key={colIdx} className={colIdx === 0 ? "font-bold text-slate-700" : "text-slate-600 font-medium"}>
                {col}
              </span>
            ))}
          </div>
        );
      }

      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        const cleanLine = line.trim().substring(2);
        return (
          <li key={index} className="ml-5 list-disc text-slate-650 pl-1 py-1.5 text-xs leading-relaxed">
            {parseBoldMarkers(cleanLine)}
          </li>
        );
      }

      if (line.trim() === '') {
        return <div key={index} className="h-3" />;
      }

      return (
        <p key={index} className="text-xs text-slate-600 leading-relaxed my-2">
          {parseBoldMarkers(line)}
        </p>
      );
    });
  };

  const parseBoldMarkers = (text: string) => {
    const parts = text.split('**');
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        return <strong key={index} className="font-black text-slate-800 bg-amber-50 px-1 py-0.5 rounded border border-amber-200/20">{part}</strong>;
      }
      return part;
    });
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
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] bg-amber-500/10 text-wheat font-black uppercase tracking-wider border border-amber-500/20">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" /> Soportado por IA Gemini
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

      {/* Flexible Tabs Navigation - Resolves client's clarification perfectly */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 flex flex-wrap gap-1 sm:gap-4">
          <button 
            onClick={() => setActiveTab('xml-audit')}
            id="nav-tab-xml-audit"
            className={`py-5 px-4 font-bold text-xs sm:text-sm tracking-wide relative transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'xml-audit' 
                ? 'border-gold-600 text-gold-700 bg-gold-50/10' 
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <Scale className="w-4 h-4 text-gold-650" />
            Analizador XML y Desglose Tributario
          </button>

          <button 
            onClick={() => setActiveTab('sheets-console')}
            id="nav-tab-sheets-console"
            className={`py-5 px-4 font-bold text-xs sm:text-sm tracking-wide relative transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'sheets-console' 
                ? 'border-gold-600 text-gold-700 bg-gold-50/10' 
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-slate-500" />
            Consola en la Nube (Google Sheets)
          </button>
          
          <button 
            onClick={() => setActiveTab('ai-chat')}
            id="nav-tab-ai-chat"
            className={`py-5 px-4 font-bold text-xs sm:text-sm tracking-wide relative transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'ai-chat' 
                ? 'border-gold-600 text-gold-700 bg-gold-50/10' 
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <Calculator className="w-4 h-4 text-emerald-600" />
            Simulador CPA y Chat de Asesoría
          </button>
        </div>
      </div>

      {/* Main Container Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 flex flex-col gap-8">
        <AnimatePresence mode="wait">
          
          {/* TAB 1: XML INTERACTIVE ANALYZER (AI-POWERED) */}
          {activeTab === 'xml-audit' && (
            <motion.div
              key="xml-audit-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-8"
              id="xml-analyzer-container"
            >
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
                                  onClick={() => handleRemoveFile(idx)}
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

            </motion.div>
          )}

          {/* TAB 2: SHEETS APPS SCRIPT IFRAME (LOOKS TOTALLY INTEGRATED) */}
          {activeTab === 'sheets-console' && (
            <motion.div
              key="sheets-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
              id="sheets-console-container"
            >
              {/* Properties description sidebar */}
              <div className="lg:col-span-4 space-y-6">
                
                <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200/80 shadow-md">
                  <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <CloudLightning className="w-5 h-5 text-gold-600" />
                    Propiedades del Motor de Conciliación
                  </h3>
                  
                  <div className="space-y-5">
                    <div className="flex gap-4">
                      <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded-xl border border-emerald-100 h-10 w-10 shrink-0 flex items-center justify-center">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">Conexión Segura SSL</h4>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                          La transmisión de datos se encripta bajo la robusta infraestructura con certificado único SSL de alta seguridad.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="bg-amber-50 text-amber-600 p-2.5 rounded-xl border border-amber-100 h-10 w-10 shrink-0 flex items-center justify-center">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">Generación Consolidada</h4>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                          Guarde, filtre, consolide, comparta y descargue análisis de CFDI directamente en formatos listos para su hoja de cálculo.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <div className="bg-blue-50 text-blue-600 p-2.5 rounded-xl border border-blue-100 h-10 w-10 shrink-0 flex items-center justify-center">
                        <Monitor className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">Análisis Automatizado</h4>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                          Procesa con precisión las sumas mensuales, complementos de pago y correspondencias fiscales sin errores humanos.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 mt-6 pt-6 space-y-3">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Enlace Alternativo del Servidor</h4>
                    <button 
                      onClick={handleCopyLink}
                      className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-gold-50/50 hover:border-gold-300 rounded-2xl border border-slate-200 text-xs font-semibold text-slate-600 transition-all group"
                    >
                      <span className="truncate pr-4 text-slate-500">{cpaCloudUrl}</span>
                      {copied ? (
                        <span className="flex items-center gap-1 text-emerald-600 shrink-0 font-bold">
                          <Check className="w-4 h-4" /> Copiado
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-slate-400 group-hover:text-gold-700 shrink-0">
                          <Copy className="w-4 h-4" /> Copiar Link
                        </span>
                      )}
                    </button>
                    <a 
                      href={cpaCloudUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200/70 text-slate-700 text-xs font-bold uppercase transition-all px-4 py-3 rounded-2xl border border-slate-200"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Ver en Pestaña Completa
                    </a>
                  </div>
                </div>

                {/* Helpful Hints Card style */}
                <div className="bg-amber-50/70 border border-amber-200 rounded-3xl p-6 md:p-8 space-y-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <HelpCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-amber-800">¿Dificultad al visualizar la consola?</h4>
                      <p className="text-xs text-amber-700/90 leading-relaxed">
                        Si experimenta bloqueos en el navegador por políticas de cookies o el inicio de sesión del SAT requiere interacción:
                      </p>
                    </div>
                  </div>
                  <ol className="list-decimal list-inside text-xs text-amber-800 space-y-2 pl-1 font-medium">
                    <li>Seleccione el botón <span className="font-bold">"Ver en Pestaña Completa"</span> de arriba para abrir el motor directamente en una pestaña de Chrome independiente.</li>
                    <li>Acceda de forma normal de forma de manera directa, y la información se sincronizará automáticamente.</li>
                  </ol>
                </div>

              </div>

              {/* Main Panel - Embedded interactive client console */}
              <div className="lg:col-span-8 flex flex-col gap-4">
                
                {/* Visual Window Frame */}
                <div className="bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden flex flex-col">
                  
                  {/* Web Toolbar Mock */}
                  <div className="bg-slate-900 text-white px-5 py-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1.5 shrink-0">
                        <span className="w-3.5 h-3.5 rounded-full bg-red-400 inline-block" />
                        <span className="w-3.5 h-3.5 rounded-full bg-amber-400 inline-block" />
                        <span className="w-3.5 h-3.5 rounded-full bg-emerald-400 inline-block" />
                      </div>
                      <span className="text-xs text-slate-300 font-mono tracking-tight hidden sm:inline-block bg-white/5 border border-white/10 px-4.5 py-1.5 rounded-xl">
                        isbb_server_reports://v4-engine
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-black uppercase tracking-wider">
                        Enlace Listo
                      </span>
                      <button 
                        onClick={handleRefreshIframe}
                        className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 transition-colors font-bold"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingIframe ? 'animate-spin' : ''}`} />
                        Reiniciar Motor
                      </button>
                    </div>
                  </div>

                  {/* Iframe View */}
                  <div className="relative bg-white flex-1" style={{ minHeight: '680px' }}>
                    {loadingIframe && (
                      <div className="absolute inset-0 bg-slate-50/95 z-10 flex flex-col items-center justify-center text-center p-8">
                        <div className="w-12 h-12 border-4 border-slate-200 border-t-gold-shiny rounded-full animate-spin mb-4" />
                        <h3 className="text-lg font-bold text-slate-800">Iniciando Consola de Reportes...</h3>
                        <p className="text-xs text-slate-400 mt-1 max-w-sm">Cargando módulos de compatibilidad para análisis y hojas de cálculo</p>
                      </div>
                    )}
                    
                    <iframe 
                      key={iframeKey}
                      src={cpaCloudUrl}
                      onLoad={() => setLoadingIframe(false)}
                      className="w-full h-[680px] md:h-[740px] lg:h-[800px] border-none block"
                      allow="geolocation; microphone; camera"
                      sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                    />
                  </div>

                </div>

              </div>
            </motion.div>
          )}

          {/* TAB 3: AI CPA TAX COPILOT (CHAT Terminal) */}
          {activeTab === 'ai-chat' && (
            <motion.div
              key="ai-chat-tab"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
              id="ai-cpa-terminal-container"
            >
              
              {/* Left Column: Interactive Express Tax Calculator Form */}
              <div className="lg:col-span-4 space-y-6">
                
                <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200/80 shadow-md">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="bg-amber-50 p-2 rounded-xl border border-amber-100">
                      <Calculator className="w-6 h-6 text-gold-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">Cálculo Express SAT 2026</h3>
                      <p className="text-xs text-slate-400 font-medium">Análisis rápido mediante IA</p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                    Ingrese los ingresos acumulados y deducciones brutas mensuales de su periodo de forma libre, seleccione su régimen contable y reciba una simulación tributaria inmediata.
                  </p>

                  <form onSubmit={handleCalculateTaxesManual} className="space-y-4">
                    <div>
                      <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Régimen Fiscal del Contribuyente</label>
                      <select 
                        value={regimen}
                        onChange={(e) => setRegimen(e.target.value)}
                        className="w-full bg-slate-50 outline-none border border-slate-200 p-3 rounded-xl focus:border-gold-500 focus:bg-white text-xs font-bold text-slate-800 transition-colors"
                      >
                        <option value="RESICO_PF">RESICO (Simplificado de Confianza - Pers. Física)</option>
                        <option value="AE_P_F">Actividad Empresarial y Profesional</option>
                        <option value="P_MORAL_GEN">Persona Moral (Régimen General)</option>
                        <option value="RIF">Régimen de Incorporación Fiscal (RIF)</option>
                        <option value="SUELDOS">Sueldos y Salarios / Asimilados</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Ingresos Totales Facturados ($ MXN)</label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs">$</span>
                        <input 
                          type="number" 
                          value={ingresos}
                          onChange={(e) => setIngresos(e.target.value)}
                          placeholder="0.00"
                          required
                          className="w-full bg-slate-50 outline-none border border-slate-200 pl-8 pr-4 py-3 rounded-xl focus:border-gold-500 focus:bg-white text-xs font-extrabold text-slate-800 transition-colors"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Deducciones Autorizadas con XML ($ MXN)</label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs">$</span>
                        <input 
                          type="number" 
                          value={deducciones}
                          onChange={(e) => setDeducciones(e.target.value)}
                          placeholder="0.00"
                          required
                          className="w-full bg-slate-50 outline-none border border-slate-200 pl-8 pr-4 py-3 rounded-xl focus:border-gold-500 focus:bg-white text-xs font-extrabold text-slate-800 transition-colors"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Retenciones del Periodo ($ MXN)</label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs">$</span>
                        <input 
                          type="number" 
                          value={retenciones}
                          onChange={(e) => setRetenciones(e.target.value)}
                          placeholder="0.00"
                          required
                          className="w-full bg-slate-50 outline-none border border-slate-200 pl-8 pr-4 py-3 rounded-xl focus:border-gold-500 focus:bg-white text-xs font-extrabold text-slate-800 transition-colors"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={calculating}
                      className="w-full bg-slate-900 border border-slate-800 hover:bg-slate-850 text-white py-3.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-2 hover:border-gold-400/50 shadow-md group mt-6"
                    >
                      {calculating ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-gold-500" />
                          Ejecutando Cálculos...
                        </>
                      ) : (
                        <>
                          <Calculator className="w-4 h-4 text-gold-400" />
                          Generar Diagnóstico IA
                        </>
                      )}
                    </button>
                  </form>
                </div>

                {/* Preset Fast Queries Card */}
                <div className="bg-gold-gradient rounded-3xl p-6 text-white border border-slate-800 shadow-md space-y-4 relative overflow-hidden">
                  <div className="relative z-10">
                    <h3 className="text-md font-extrabold text-wheat flex items-center gap-1.5 mb-2.5">
                      <BookOpen className="w-4.5 h-4.5" />
                      Consultas Frecuentes SAT
                    </h3>
                    <p className="text-[10px] text-slate-300 mb-4 leading-relaxed">
                      Seleccione una opción para cargar y procesar una consulta contable avanzada de forma inmediata:
                    </p>
                    <div className="space-y-2.5">
                      {[
                        { text: '¿Qué deducciones personales aplican al año?', label: 'Deducciones Personales' },
                        { text: 'Criterio de acreditamiento de IVA acreditable mensual', label: 'Criterios de IVA' },
                        { text: '¿Cómo funciona la regla de RESICO y copropiedad?', label: 'RESICO Copropiedad' },
                        { text: 'Causas comunes para Opinión de Cumplimiento Negativa', label: 'Opinión del SAT' }
                      ].map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSendChatText(item.text)}
                          disabled={sendingChat}
                          className="w-full text-left bg-white/10 hover:bg-white/15 active:bg-white/20 p-3 rounded-2xl border border-white/5 text-xs text-white transition-all font-bold flex items-center justify-between group"
                        >
                          <span className="truncate pr-3">{item.label}</span>
                          <ArrowRight className="w-4 h-4 text-wheat opacity-60 group-hover:opacity-100 group-hover:translate-x-1.5 transition-all" />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="absolute top-0 right-0 -mr-16 -mt-16 w-36 h-36 bg-wheat/5 rounded-full blur-2xl" />
                </div>

              </div>

              {/* Right Column: Conversational AI Accounting Terminal */}
              <div className="lg:col-span-8 flex flex-col gap-4">
                
                <div className="bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden flex flex-col h-[700px] md:h-[760px]">
                  
                  {/* Chat Terminal Header */}
                  <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between border-b border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <div className="bg-wheat/10 p-2 rounded-xl">
                        <Bot className="w-5 h-5 text-wheat" />
                      </div>
                      <div>
                        <h4 className="text-sm font-extrabold tracking-tight text-white flex items-center gap-1.5">
                          Asesoría Fiscal Corporativa
                          <span className="text-[10px] bg-amber-500/10 text-wheat px-2 py-0.5 rounded-full border border-amber-500/20 uppercase tracking-widest font-black font-sans">EXPERTO SAT</span>
                        </h4>
                        <p className="text-[10px] text-slate-400 font-medium">Asesoría contable, cálculos de ISR/IVA, CFDI 4.0</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setChatHistory([
                            {
                              id: 'welcome',
                              role: 'model',
                              content: '¡Hola! Soy tu **Asesor Fiscal y Contable de ISBB SOLUCIONES**. Como especialista en la legislación del SAT mexicano, puedo ayudarte a analizar tus ingresos, deducir correctamente bajo tu régimen fiscal, simular pagos de ISR/IVA o resolver dudas sobre CFDI 4.0. \n\n¿En qué puedo asistirte técnicamente hoy?',
                              timestamp: new Date()
                            }
                          ]);
                          setCalcResult('');
                        }}
                        className="text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700/80 p-2 rounded-xl border border-slate-700 transition-colors font-bold"
                        title="Resetear conversación"
                      >
                        Limpiar Historial
                      </button>
                    </div>
                  </div>

                  {/* Chat Messages Log */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar bg-slate-50/50">
                    {chatHistory.map((message) => (
                      <div
                        key={message.id}
                        className={`flex gap-3 max-w-[85%] ${message.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
                      >
                        <div className={`p-2 rounded-xl h-9 w-9 shrink-0 flex items-center justify-center border font-bold ${
                          message.role === 'user' 
                            ? 'bg-amber-100 text-amber-700 border-amber-200' 
                            : 'bg-slate-900 text-white border-slate-800'
                        }`}>
                          {message.role === 'user' ? <User className="w-4.5 h-4.5" /> : <Bot className="w-4.5 h-4.5 text-wheat" />}
                        </div>
                        
                        <div className={`p-4.5 rounded-2xl text-xs space-y-1.5 shadow-sm border ${
                          message.role === 'user'
                            ? 'bg-amber-50 text-slate-800 border-amber-100 rounded-tr-none'
                            : 'bg-white text-slate-700 border-slate-200/80 rounded-tl-none'
                        }`}>
                          <div className="prose prose-sm max-w-none text-xs">
                            {renderMarkdownTextHTML(message.content)}
                          </div>
                          
                          <div className="text-[9px] text-slate-400 font-mono flex items-center gap-1 justify-end pt-1">
                            <span>{message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* Chat sending state */}
                    {sendingChat && (
                      <div className="flex gap-3 max-w-[80%] mr-auto">
                        <div className="p-2 rounded-xl h-9 w-9 shrink-0 flex items-center justify-center bg-slate-900 border border-slate-800">
                          <Bot className="w-4.5 h-4.5 text-wheat" />
                        </div>
                        <div className="bg-white p-4.5 rounded-2xl text-xs text-slate-500 border border-slate-200/80 rounded-tl-none shadow-sm flex items-center gap-2">
                          <span className="flex gap-1.5 items-center">
                            <span className="w-1.5 h-1.5 rounded-full bg-gold-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-gold-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-1.5 rounded-full bg-gold-600 animate-bounce" style={{ animationDelay: '300ms' }} />
                          </span>
                          <span className="italic font-bold text-slate-400">Nuestro CPA Fiscal está respondiendo su consulta...</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Chat Input Toolbar Area */}
                  <div className="p-4 bg-white border-t border-slate-200/80 flex gap-3">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSendChatText();
                      }}
                      disabled={sendingChat}
                      placeholder="Escriba aquí su consulta o pregunta fiscal respecto a IVA/ISR..."
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-xs font-bold text-slate-700 outline-none focus:border-gold-500 focus:bg-white transition-colors"
                    />
                    <button
                      onClick={() => handleSendChatText()}
                      disabled={sendingChat || !chatInput.trim()}
                      className="bg-slate-900 text-white hover:bg-slate-850 p-3 rounded-2xl border border-slate-800 hover:border-gold-400/50 transition-colors duration-200 disabled:opacity-50 shrink-0 flex items-center justify-center"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>

                </div>

              </div>
              
            </motion.div>
          )}

        </AnimatePresence>
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
