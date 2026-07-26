import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { parseXMLData, isIvaTasaSpecial, ParsedCFDI } from '../utils/xmlParser';
import { AncofiClient, getSavedClients, saveClients, fileToBase64, base64ToFile } from '../utils/profileHelpers';
import {
  Key,
  FileText,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Download,
  Search,
  Building2,
  RefreshCw,
  Eye,
  EyeOff,
  ShieldAlert,
  FileCode,
  Trash2,
  Copy,
  Check,
  Lock,
  Calendar,
  Filter,
  FileSpreadsheet,
  ExternalLink,
  ShieldCheck,
  Zap,
  Info,
  Clock,
  Archive,
  Layers,
  ArrowRight,
  Phone,
  Mail,
  Plus,
  Edit3
} from 'lucide-react';

interface FielState {
  rfc: string;
  contrasena: string;
  satGoToken: string;
}

interface SolicitudHistory {
  idSolicitud: string;
  fechaSolicitud: string;
  tipo: 'recibidos' | 'emitidos';
  tipoBusqueda: string;
  rangoFechas: string;
  estado: string; // 'En Proceso', 'Aceptada', 'Terminada', 'Rechazada'
  paquetes: string[];
  totalXmls?: number;
}

interface FacturaItem {
  uuid?: string;
  rfcEmisor?: string;
  nombreEmisor?: string;
  rfcReceptor?: string;
  nombreReceptor?: string;
  fechaEmision?: string;
  montoTotal?: number | string;
  estatus?: string;
  xmlBase64?: string;
  pdfBase64?: string;
  tipoComprobante?: string;
}

export function SatWebService() {
  // Active Tab: 'csf' | 'oc' | 'facturas' | 'solicita' | 'efos' | 'info' | 'perfiles'
  const [activeTab, setActiveTab] = useState<'csf' | 'oc' | 'facturas' | 'solicita' | 'efos' | 'info' | 'perfiles'>('facturas');

  // Saved Profiles / Clients State
  const [savedProfiles, setSavedProfiles] = useState<AncofiClient[]>(() => getSavedClients());
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');

  // Profile Form state (for 'perfiles' tab)
  const [profRfc, setProfRfc] = useState('');
  const [profName, setProfName] = useState('');
  const [profPhone, setProfPhone] = useState('');
  const [profEmail, setProfEmail] = useState('');
  const [profAuthType, setProfAuthType] = useState<'FIEL' | 'CIEC'>('FIEL');
  const [profFielPass, setProfFielPass] = useState('');
  const [profCerFile, setProfCerFile] = useState<File | null>(null);
  const [profCerFileName, setProfCerFileName] = useState('');
  const [profCerB64, setProfCerB64] = useState('');
  const [profKeyFile, setProfKeyFile] = useState<File | null>(null);
  const [profKeyFileName, setProfKeyFileName] = useState('');
  const [profKeyB64, setProfKeyB64] = useState('');
  const [profCiecPass, setProfCiecPass] = useState('');
  const [showProfPass, setShowProfPass] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  // Shared FIEL Credentials State
  const [fiel, setFiel] = useState<FielState>(() => {
    const saved = localStorage.getItem('sat_fiel_creds');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return {
      rfc: '',
      contrasena: '',
      satGoToken: ''
    };
  });

  const [certFile, setCertFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);

  // Status & Notification Messages
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Function to load a profile into session
  const loadProfileIntoSession = (profile: AncofiClient) => {
    setFiel(prev => ({
      ...prev,
      rfc: profile.rfc,
      contrasena: profile.fielPassword || profile.ciecPassword || ''
    }));

    if (profile.cerBase64) {
      const f = base64ToFile(profile.cerBase64, profile.cerFileName || `${profile.rfc}.cer`);
      setCertFile(f);
    } else {
      setCertFile(null);
    }

    if (profile.keyBase64) {
      const f = base64ToFile(profile.keyBase64, profile.keyFileName || `${profile.rfc}.key`);
      setKeyFile(f);
    } else {
      setKeyFile(null);
    }

    setSelectedProfileId(profile.id);
    setSuccessMessage(`✓ Perfil de "${profile.name}" (${profile.rfc}) cargado correctamente con su ${profile.authType || 'FIEL'}. Todos los servicios del SAT utilizarán este contribuyente.`);
  };

  // Save text credentials locally
  useEffect(() => {
    localStorage.setItem('sat_fiel_creds', JSON.stringify(fiel));
  }, [fiel]);

  // Helper for error formatting
  const formatFetchError = (err: any): string => {
    if (!err) return 'Ocurrió un error inesperado de comunicación.';
    let msg = typeof err === 'string' ? err : (err.message || String(err));
    msg = msg.trim();
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('fetch failed')) {
      return 'Error de conexión con el servidor. Compruebe su conexión a internet o reintente la operación.';
    }
    if (msg.startsWith('<!doctype') || msg.startsWith('<html') || msg.includes('<!DOCTYPE html>')) {
      return 'El servidor del SAT respondió con un formato de respuesta no esperado. Por favor reintente en un momento.';
    }
    return msg;
  };

  const scrollToFielSection = () => {
    const formEl = document.getElementById('fiel-credentials-section');
    if (formEl) {
      formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const getFormDataWithFiles = () => {
    const fd = new FormData();
    fd.append('rfc', fiel.rfc.trim().toUpperCase());
    fd.append('contrasena', fiel.contrasena);
    if (fiel.satGoToken.trim()) {
      fd.append('satGoToken', fiel.satGoToken.trim());
    }
    if (keyFile) fd.append('llavePrivada', keyFile);
    if (certFile) fd.append('Certificado', certFile);
    return fd;
  };

  // Safe response parser to prevent "Unexpected token <" or stream reuse SyntaxErrors
  const parseResponseJson = async (res: Response) => {
    let text = '';
    try {
      text = await res.text();
    } catch {
      throw new Error('No se pudo leer la respuesta del servidor.');
    }

    let parsed: any = null;
    let isJson = false;

    if (text && text.trim()) {
      try {
        parsed = JSON.parse(text);
        isJson = true;
      } catch {
        isJson = false;
      }
    }

    if (!res.ok) {
      if (isJson && parsed && (parsed.error || parsed.mensaje || parsed.message)) {
        throw new Error(parsed.error || parsed.mensaje || parsed.message);
      }
      if (text.toLowerCase().includes('<!doctype') || text.toLowerCase().includes('<html')) {
        throw new Error(`El servidor respondió con un error de página (Código HTTP ${res.status}). Verifique la conexión al servidor.`);
      }
      throw new Error((text && text.substring(0, 250)) || `Error del servidor (${res.status})`);
    }

    if (!isJson) {
      if (text.toLowerCase().includes('<!doctype') || text.toLowerCase().includes('<html')) {
        throw new Error(`El servidor respondió con una página HTML en lugar de JSON (Código HTTP ${res.status}). Verifique la ruta del API.`);
      }
      if (!text || !text.trim()) {
        throw new Error(`El servidor devolvió una respuesta vacía (Código HTTP ${res.status}).`);
      }
      throw new Error(`Respuesta no válida del servidor (${res.status}): ${text.substring(0, 150)}`);
    }

    return parsed;
  };

  // ==========================================
  // TAB 1: CONSTANCIA DE SITUACIÓN FISCAL (CSF)
  // ==========================================
  const [isConsultingCsf, setIsConsultingCsf] = useState(false);
  const [csfPdfBlobUrl, setCsfPdfBlobUrl] = useState<string | null>(null);
  const [csfDataResult, setCsfDataResult] = useState<any>(null);

  const handleConsultarCsf = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    if (!fiel.rfc) {
      scrollToFielSection();
      setErrorMessage('Por favor ingrese su RFC en el panel superior de Credenciales.');
      return;
    }
    if (!fiel.contrasena) {
      scrollToFielSection();
      setErrorMessage('🔑 Por favor ingrese la Contraseña de su FIEL en el panel de Credenciales.');
      return;
    }
    if (!certFile || !keyFile) {
      scrollToFielSection();
      setErrorMessage('📁 Por favor cargue sus archivos .cer y .key de su FIEL en el panel de Credenciales.');
      return;
    }

    setIsConsultingCsf(true);
    try {
      const fd = getFormDataWithFiles();
      const res = await fetch('/api/sat/csffiel', {
        method: 'POST',
        body: fd
      });

      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/pdf')) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setCsfPdfBlobUrl(url);
        setCsfDataResult(null);
        setSuccessMessage('¡Constancia de Situación Fiscal (CSF) PDF descargada exitosamente!');
      } else {
        const data = await parseResponseJson(res);
        setCsfDataResult(data);
        setCsfPdfBlobUrl(null);
        setSuccessMessage('¡Datos fiscales y certificado e.firma sincronizados exitosamente con el SAT!');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(formatFetchError(err));
    } finally {
      setIsConsultingCsf(false);
    }
  };

  // ==========================================
  // TAB 2: OPINIÓN DE CUMPLIMIENTO (OC)
  // ==========================================
  const [isConsultingOc, setIsConsultingOc] = useState(false);
  const [ocPdfBlobUrl, setOcPdfBlobUrl] = useState<string | null>(null);
  const [ocDataResult, setOcDataResult] = useState<any>(null);

  const handleConsultarOc = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    if (!fiel.rfc) {
      scrollToFielSection();
      setErrorMessage('Por favor ingrese su RFC en el panel superior de Credenciales.');
      return;
    }
    if (!fiel.contrasena) {
      scrollToFielSection();
      setErrorMessage('🔑 Por favor ingrese la Contraseña de su FIEL en el panel de Credenciales.');
      return;
    }
    if (!certFile || !keyFile) {
      scrollToFielSection();
      setErrorMessage('📁 Por favor cargue sus archivos .cer y .key de su FIEL en el panel de Credenciales.');
      return;
    }

    setIsConsultingOc(true);
    try {
      const fd = getFormDataWithFiles();
      const res = await fetch('/api/sat/ocfiel', {
        method: 'POST',
        body: fd
      });

      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/pdf')) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setOcPdfBlobUrl(url);
        setOcDataResult(null);
        setSuccessMessage('¡Opinión de Cumplimiento PDF descargada exitosamente!');
      } else {
        const data = await parseResponseJson(res);
        setOcDataResult(data);
        setOcPdfBlobUrl(null);
        setSuccessMessage('¡Opinión de Cumplimiento de Obligaciones verificada con éxito ante el SAT!');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(formatFetchError(err));
    } finally {
      setIsConsultingOc(false);
    }
  };

  // ==========================================
  // TAB 3: CONSULTAR FACTURAS (FACFIEL)
  // ==========================================
  const [facturaFilters, setFacturaFilters] = useState({
    fecha_inicial: new Date(new Date().setDate(1)).toISOString().split('T')[0],
    fecha_final: new Date().toISOString().split('T')[0],
    tipo: 'recibidos' as 'recibidos' | 'emitidos',
    tipoBusqueda: '1', // 1 = CFDI, 2 = Metadata
    estatusFactura: '-1', // -1 = Todos, 1 = Vigentes, 0 = Cancelados
    descargaComprobantes: true,
    descargaPdfs: false
  });

  const [isConsultingFacturas, setIsConsultingFacturas] = useState(false);
  const [facturasResult, setFacturasResult] = useState<any>(null);
  const [searchFacturaText, setSearchFacturaText] = useState('');
  const [autoPollActive, setAutoPollActive] = useState(false);
  const [selectedXmlModal, setSelectedXmlModal] = useState<{ fileName: string; content: string } | null>(null);

  const handleDownloadAllZip = async () => {
    if (!facturasResult?.xmlFiles || facturasResult.xmlFiles.length === 0) return;
    try {
      const zip = new JSZip();
      facturasResult.xmlFiles.forEach((xml: any) => {
        zip.file(xml.fileName, xml.content);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `SAT_Facturas_${fiel.rfc || 'CFDI'}_${new Date().toISOString().slice(0, 10)}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error al generar ZIP de comprobantes:', err);
    }
  };

  const handleExportExcel = () => {
    if (!facturasResult) return;
    const hasXmlFiles = facturasResult.xmlFiles && facturasResult.xmlFiles.length > 0;
    const hasFacturas = facturasResult.facturas && facturasResult.facturas.length > 0;

    if (!hasXmlFiles && !hasFacturas) return;

    try {
      let parsedCfdis: ParsedCFDI[] = [];

      if (hasXmlFiles) {
        parsedCfdis = facturasResult.xmlFiles.map((file: { fileName: string; content: string }) => {
          return parseXMLData(file.content, file.fileName || 'factura.xml');
        });
      } else if (hasFacturas) {
        parsedCfdis = facturasResult.facturas.map((f: any) => {
          if (f.rawXml || f.content) {
            return parseXMLData(f.rawXml || f.content, f.fileName || `${f.uuid || 'CFDI'}.xml`);
          }
          return {
            fileName: f.fileName || `${f.uuid || 'CFDI'}.xml`,
            folio: f.folio || f.uuid || '',
            serie: f.serie || '',
            fecha: f.fechaEmision || f.fecha || '',
            hora: f.hora || '00:00:00',
            tipo: f.tipoDeComprobante || f.tipo || 'I',
            subTotal: f.subTotalNum ?? f.subTotal ?? 0,
            descuento: f.descuento ?? 0,
            total: f.totalNum ?? f.total ?? 0,
            emisorRfc: f.rfcEmisor || f.rfCemisor || f.emisorRfc || '',
            emisorNombre: f.nombreEmisor || f.razonSocialEmisor || f.emisorNombre || '',
            receptorRfc: f.rfcReceptor || f.receptorRfc || '',
            receptorNombre: f.nombreReceptor || f.razonSocialReceptor || f.receptorNombre || '',
            ivaTrasladado: f.ivaTrasladado ?? 0,
            ivaAcreditable: f.ivaAcreditable ?? 0,
            ivaRetenido: f.ivaRetenido ?? 0,
            isrRetenido: f.isrRetenido ?? 0,
            conceptos: Array.isArray(f.conceptos) ? f.conceptos : [f.concepto || f.conceptosStr || ''],
            conceptosDetalle: f.conceptosDetalle || [],
            emisorRegimenFiscal: f.emisorRegimenFiscal || '',
            emisorRegimenFiscalDesc: f.emisorRegimenFiscalDesc || '',
            receptorRegimenFiscal: f.receptorRegimenFiscal || '',
            receptorRegimenFiscalDesc: f.receptorRegimenFiscalDesc || '',
            usoCfdi: f.usoCfdi || '',
            usoCfdiDesc: f.usoCfdiDesc || '',
            formaPago: f.formaPago || '',
            formaPagoDesc: f.formaPagoDesc || '',
            impuestoExento: f.impuestoExento ?? 0,
            noObjetoImpuesto: f.noObjetoImpuesto ?? 0,
            tasa0Base: f.tasa0Base ?? 0,
            tasa16Base: f.tasa16Base ?? 0,
            iepsTotal: f.iepsTotal ?? 0,
            isNomina: f.isNomina || f.tipo === 'N',
            allTaxesMap: f.allTaxesMap
          } as ParsedCFDI;
        });
      }

      if (parsedCfdis.length === 0) return;

      // Collect all dynamic tax labels across all parsed CFDIs
      const uniqueTaxLabelsSet = new Set<string>();
      parsedCfdis.forEach(f => {
        if (f.allTaxesMap) {
          Object.keys(f.allTaxesMap).forEach(lbl => uniqueTaxLabelsSet.add(lbl));
        }
      });
      const uniqueTaxLabels = Array.from(uniqueTaxLabelsSet).sort();

      // Sheet 1: Auditoría General (CFDIs)
      const excelRows = parsedCfdis.map(f => {
        const row: Record<string, any> = {
          'Fecha Emisión': f.fecha,
          'Hora Emisión': f.hora || '00:00:00',
          'Archivo': f.fileName,
          'Serie': f.serie,
          'Folio / UUID': f.folio,
          'Tipo CFDI': f.tipo === 'I' ? 'I - Ingreso (Cobros)' : f.tipo === 'E' ? 'E - Egreso (Gastos)' : f.tipo === 'N' ? 'N - Nómina (Sueldos)' : f.tipo === 'P' ? 'P - Pago' : 'Otros',
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
          'IVA ($)': f.tipo === 'I' ? f.ivaTrasladado : f.tipo === 'E' ? f.ivaAcreditable : 0,
          'IEPS ($)': f.iepsTotal,
          'Retención de IVA ($)': f.ivaRetenido,
          'Retención de ISR ($)': f.isrRetenido,
          'Uso CFDI (Clave)': f.usoCfdi || 'S/E',
          'Uso CFDI (Nombre)': f.usoCfdiDesc || 'Sin especificar',
          'Forma de Pago (Clave)': f.formaPago || 'S/E',
          'Forma de Pago (Nombre)': f.formaPagoDesc || 'Sin especificar',
          'Régimen Fiscal Emisor (Clave)': f.emisorRegimenFiscal || 'S/E',
          'Régimen Fiscal Emisor (Descripción)': f.emisorRegimenFiscalDesc || 'Sin especificar',
          'Régimen Fiscal Receptor (Clave)': f.receptorRegimenFiscal || 'S/E',
          'Régimen Fiscal Receptor (Descripción)': f.receptorRegimenFiscalDesc || 'Sin especificar',
          'Total Facturado ($)': f.total,
          'Conceptos Principales': f.conceptos ? f.conceptos.join(' | ') : ''
        };

        // Add dynamic tax columns
        uniqueTaxLabels.forEach(lbl => {
          const taxDetail = f.allTaxesMap?.[lbl];
          if (isIvaTasaSpecial(lbl)) {
            row[`Base de ${lbl} ($)`] = taxDetail ? taxDetail.base : 0;
          }
          row[`Importe de ${lbl} ($)`] = taxDetail ? taxDetail.importe : 0;
        });

        return row;
      });

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(excelRows);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Auditoría General (CFDIs)');

      // Sheet 2: Desglose de Conceptos
      const itemizedConceptRows: any[] = [];
      parsedCfdis.forEach(f => {
        if (f.conceptosDetalle && f.conceptosDetalle.length > 0) {
          f.conceptosDetalle.forEach((item, idx) => {
            itemizedConceptRows.push({
              'Archivo': f.fileName,
              'UUID / Folio Fiscal': f.folio || 'N/A',
              'Serie': f.serie || '',
              'Fecha': f.fecha,
              'Hora': f.hora || '00:00:00',
              'Tipo CFDI': f.tipo,
              'RFC Emisor': f.emisorRfc,
              'Emisor': f.emisorNombre,
              'RFC Receptor': f.receptorRfc,
              'Receptor': f.receptorNombre,
              'Item #': idx + 1,
              'Clave Prod/Serv': item.claveProdServ || '',
              'No. Identificación': item.noIdentificacion || '',
              'Cantidad': item.cantidad || 1,
              'Clave Unidad': item.claveUnidad || '',
              'Unidad': item.unidad || '',
              'Descripción del Concepto / Renglón': item.descripcion || '',
              'Valor Unitario ($)': item.valorUnitario || 0,
              'Importe ($)': item.importe || 0,
              'Descuento ($)': item.descuento || 0,
              'Objeto Impuesto': item.objetoImp || ''
            });
          });
        } else if (f.conceptos && f.conceptos.length > 0) {
          f.conceptos.forEach((concStr, idx) => {
            itemizedConceptRows.push({
              'Archivo': f.fileName,
              'UUID / Folio Fiscal': f.folio || 'N/A',
              'Serie': f.serie || '',
              'Fecha': f.fecha,
              'Hora': f.hora || '00:00:00',
              'Tipo CFDI': f.tipo,
              'RFC Emisor': f.emisorRfc,
              'Emisor': f.emisorNombre,
              'RFC Receptor': f.receptorRfc,
              'Receptor': f.receptorNombre,
              'Item #': idx + 1,
              'Descripción del Concepto / Renglón': concStr,
              'Importe ($)': f.subTotal || 0
            });
          });
        }
      });

      if (itemizedConceptRows.length > 0) {
        const wsConceptos = XLSX.utils.json_to_sheet(itemizedConceptRows);
        XLSX.utils.book_append_sheet(workbook, wsConceptos, 'Desglose de Conceptos');
      }

      // Sheet 3: Desglose de Nóminas (if payroll CFDIs exist)
      const payrollFiles = parsedCfdis.filter(f => f.isNomina || f.tipo === 'N');
      if (payrollFiles.length > 0) {
        const payrollRows = payrollFiles.map(f => ({
          'Archivo XML': f.fileName,
          'Serie': f.serie || 'S/S',
          'Folio': f.folio || 'S/F',
          'Fecha Pago': f.nominaFechaPago || f.fecha,
          'Hora Emisión': f.hora || '00:00:00',
          'Periodo Inicial': f.nominaFechaInicialPago || '',
          'Periodo Final': f.nominaFechaFinalPago || '',
          'Días Pagados': f.nominaNumDiasPagados || 0,
          'Tipo de Nómina': f.nominaTipo || 'Ordinaria',
          'RFC Patrón (Emisor)': f.emisorRfc,
          'Patrón (Emisor)': f.emisorNombre,
          'RFC Trabajador (Receptor)': f.receptorRfc,
          'Trabajador (Receptor)': f.receptorNombre,
          'CURP Trabajador': f.nominaReceptorCurp || '',
          'NSS Trabajador': f.nominaReceptorNss || '',
          'No. de Empleado': f.nominaReceptorNumEmpleado || '',
          'Periodicidad Pago': f.nominaReceptorPeriodicidadPago || '',
          'Tipo Contrato': f.nominaReceptorTipoContrato || '',
          'Tipo Régimen Directo': f.nominaReceptorTipoRegimen || '',

          // --- DESGLOSE DE PERCEPCIONES ---
          'Sueldo Base ($)': f.percepcionSueldo || 0,
          'Aguinaldo Gravado ($)': f.percepcionAguinaldoGrav || 0,
          'Aguinaldo Exento ($)': f.percepcionAguinaldoExent || 0,
          'Prima Vacacional Gravada ($)': f.percepcionPrimaVacGrav || 0,
          'Prima Vacacional Exenta ($)': f.percepcionPrimaVacExent || 0,
          'Prima Dominical Gravada ($)': f.percepcionPrimaDomGrav || 0,
          'Prima Dominical Exenta ($)': f.percepcionPrimaDomExent || 0,
          'Horas Extras Gravadas ($)': f.percepcionHorasExtrasGrav || 0,
          'Horas Extras Exentas ($)': f.percepcionHorasExtrasExent || 0,
          'PTU Gravado ($)': f.percepcionPtuGrav || 0,
          'PTU Exento ($)': f.percepcionPtuExent || 0,
          'Bonos y Premios Gravados ($)': f.percepcionBonosGrav || 0,
          'Bonos y Premios Exentos ($)': f.percepcionBonosExent || 0,
          'Otras Percepciones Gravadas ($)': f.percepcionOtrosGrav || 0,
          'Otras Percepciones Exentas ($)': f.percepcionOtrosExent || 0,
          'Total Percepciones ($)': f.nominaTotalPercepciones || 0,

          // --- DESGLOSE DE DEDUCCIONES ---
          'ISR Retenido de Nómina ($)': f.deduccionIsr || 0,
          'Seguridad Social IMSS ($)': f.deduccionImss || 0,
          'Aportaciones Fondo de Ahorro ($)': f.deduccionFondoAhorro || 0,
          'Descuentos y Préstamos ($)': f.deduccionDescuentos || 0,
          'Otras Deducciones de Nómina ($)': f.deduccionOtros || 0,
          'Total Deducciones ($)': f.nominaTotalDeducciones || 0,

          // --- NETO ---
          'Total Otros Pagos ($)': f.nominaTotalOtrosPagos || 0,
          'Total Neto Recibido por Trabajador ($)': f.nominaNeto || f.total,

          // --- CONCEPTOS CRUDOS DESCRIPTIVOS ---
          'Toda la Percepción (SAT)': f.nominaPercepcionesStr || 'No especificada',
          'Toda la Deducción (SAT)': f.nominaDeduccionesStr || 'No especificada'
        }));

        const payrollWorksheet = XLSX.utils.json_to_sheet(payrollRows);
        XLSX.utils.book_append_sheet(workbook, payrollWorksheet, 'Desglose de Nóminas');
      }

      XLSX.writeFile(workbook, `Sincronizacion_SAT_${fiel.rfc || 'CFDI'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
      console.error('Error al exportar Excel detallado:', err);
    }
  };

  const registerSolicitudInHistory = (idSol: string, stateText: string, xmlCount?: number) => {
    if (!idSol) return;
    setSolicitaHistory(prev => {
      const exists = prev.find(item => item.idSolicitud === idSol);
      if (exists) {
        return prev.map(item => item.idSolicitud === idSol ? {
          ...item,
          estado: stateText,
          totalXmls: xmlCount !== undefined ? xmlCount : item.totalXmls
        } : item);
      }
      const newEntry: SolicitudHistory = {
        idSolicitud: idSol,
        fechaSolicitud: new Date().toLocaleString('es-MX'),
        tipo: facturaFilters.tipo,
        tipoBusqueda: facturaFilters.tipoBusqueda === '2' ? 'Metadata' : 'CFDI',
        rangoFechas: `${facturaFilters.fecha_inicial} a ${facturaFilters.fecha_final}`,
        estado: stateText,
        paquetes: [],
        totalXmls: xmlCount
      };
      return [newEntry, ...prev];
    });
  };

  const handleRevisarEstatusFacturas = async (idSolOverride?: string) => {
    const targetId = idSolOverride || facturasResult?.idSolicitud;
    if (!targetId) return;

    if (!fiel.rfc || !fiel.contrasena || !certFile || !keyFile) {
      scrollToFielSection();
      setErrorMessage('Por favor asegúrese de tener cargadas sus credenciales FIEL (.cer, .key y contraseña).');
      return;
    }

    setIsConsultingFacturas(true);
    setErrorMessage('');

    try {
      const fd = getFormDataWithFiles();
      fd.append('requestId', targetId);
      fd.append('fecha_inicial', `${facturaFilters.fecha_inicial}T00:00:00`);
      fd.append('fecha_final', `${facturaFilters.fecha_final}T23:59:59`);
      fd.append('tipo', facturaFilters.tipo);
      fd.append('tipoBusqueda', facturaFilters.tipoBusqueda);
      fd.append('estatusFactura', facturaFilters.estatusFactura);

      const res = await fetch('/api/sat/facfiel', {
        method: 'POST',
        body: fd
      });

      const data = await parseResponseJson(res);
      setFacturasResult(data);

      if (data.facturas && data.facturas.length > 0) {
        setSuccessMessage(`¡Se recuperaron y procesaron ${data.facturas.length} comprobantes XML del SAT!`);
        setAutoPollActive(false);
        registerSolicitudInHistory(targetId, 'Terminada', data.facturas.length);
      } else if (data.estadoSolicitud === 'Terminada') {
        setSuccessMessage(`Consulta finalizada en el SAT (Folio: ${targetId}). No existen comprobantes en este periodo.`);
        setAutoPollActive(false);
        registerSolicitudInHistory(targetId, 'Terminada', 0);
      } else if (data.estadoSolicitud === 'Rechazada' || data.estadoSolicitud === 'Error' || data.estadoSolicitud === 'Vencida') {
        setAutoPollActive(false);
        setErrorMessage(data.mensaje || `Solicitud ${data.estadoSolicitud} por el SAT.`);
        registerSolicitudInHistory(targetId, data.estadoSolicitud);
      } else {
        setAutoPollActive(true);
        setSuccessMessage(`Estatus SAT: ${data.estadoSolicitud || 'En Proceso'}. (Folio de Solicitud: ${targetId}). Sincronizando...`);
        registerSolicitudInHistory(targetId, data.estadoSolicitud || 'En Proceso');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(formatFetchError(err));
    } finally {
      setIsConsultingFacturas(false);
    }
  };

  const handleConsultarFacturas = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    if (!fiel.rfc) {
      scrollToFielSection();
      setErrorMessage('Por favor ingrese su RFC en el panel superior de Credenciales.');
      return;
    }
    if (!fiel.contrasena) {
      scrollToFielSection();
      setErrorMessage('🔑 Ingrese la Contraseña de su FIEL para autorizar la consulta en el SAT.');
      return;
    }
    if (!certFile || !keyFile) {
      scrollToFielSection();
      setErrorMessage('📁 Seleccione sus archivos FIEL (.cer y .key) en el panel superior.');
      return;
    }

    setIsConsultingFacturas(true);
    setFacturasResult(null);

    try {
      const fd = getFormDataWithFiles();
      fd.append('fecha_inicial', `${facturaFilters.fecha_inicial}T00:00:00`);
      fd.append('fecha_final', `${facturaFilters.fecha_final}T23:59:59`);
      fd.append('tipo', facturaFilters.tipo);
      fd.append('tipoBusqueda', facturaFilters.tipoBusqueda);
      fd.append('estatusFactura', facturaFilters.estatusFactura);
      fd.append('descargaComprobantes', String(facturaFilters.descargaComprobantes));
      fd.append('descargaPdfs', String(facturaFilters.descargaPdfs));

      const res = await fetch('/api/sat/facfiel', {
        method: 'POST',
        body: fd
      });

      const data = await parseResponseJson(res);
      setFacturasResult(data);

      if (data.idSolicitud) {
        registerSolicitudInHistory(data.idSolicitud, data.estadoSolicitud || 'Aceptada', data.facturas?.length);
      }

      if (data.facturas && data.facturas.length > 0) {
        setSuccessMessage(`¡Consulta completada con éxito! Se obtuvieron ${data.facturas.length} comprobante(s) fiscal(es).`);
        setAutoPollActive(false);
      } else if (data.idSolicitud && (data.estadoSolicitud === 'En Proceso' || data.estadoSolicitud === 'Aceptada' || data.codEstatus === 5004 || data.codEstatus === 5000)) {
        setAutoPollActive(true);
        setSuccessMessage(`⚡ Solicitud procesándose en los servidores del SAT (ID: ${data.idSolicitud}). Sincronizando de forma automática...`);
      } else {
        setAutoPollActive(false);
        setSuccessMessage('¡Consulta finalizada exitosamente!');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(formatFetchError(err));
    } finally {
      setIsConsultingFacturas(false);
    }
  };

  // Auto-polling timer when SAT is processing request
  useEffect(() => {
    let timer: any = null;
    const isPending = facturasResult?.idSolicitud && 
      (!facturasResult?.facturas || facturasResult?.facturas.length === 0) &&
      facturasResult?.estadoSolicitud !== 'Terminada' &&
      facturasResult?.estadoSolicitud !== 'Rechazada' &&
      facturasResult?.estadoSolicitud !== 'Error' &&
      facturasResult?.estadoSolicitud !== 'Vencida';

    if (autoPollActive && isPending) {
      timer = setInterval(() => {
        handleRevisarEstatusFacturas(facturasResult.idSolicitud);
      }, 6000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [autoPollActive, facturasResult]);

  // ==========================================
  // TAB 4: SAT WEB SERVICE MASIVO (SOLICITA/VERIFICA/DESCARGA)
  // ==========================================
  const [wsFilters, setWsFilters] = useState({
    fecha_inicial: new Date(new Date().setDate(1)).toISOString().split('T')[0],
    fecha_final: new Date().toISOString().split('T')[0],
    tipo: 'recibidos' as 'recibidos' | 'emitidos',
    tipoBusqueda: 'CFDI' as 'CFDI' | 'Metadata',
    estadoComprobante: 'Todos'
  });

  const [solicitaHistory, setSolicitaHistory] = useState<SolicitudHistory[]>(() => {
    const saved = localStorage.getItem('sat_solicita_history');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { /* ignore */ }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem('sat_solicita_history', JSON.stringify(solicitaHistory));
  }, [solicitaHistory]);

  const [isSolicitansoWs, setIsSolicitansoWs] = useState(false);
  const [isVerificandoId, setIsVerificandoId] = useState<string | null>(null);
  const [isDescargandoPkg, setIsDescargandoPkg] = useState<string | null>(null);
  const [extractedXmls, setExtractedXmls] = useState<{ fileName: string; content: string }[] | null>(null);

  const handleSolicitarWs = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    if (!fiel.rfc) {
      scrollToFielSection();
      setErrorMessage('Ingrese su RFC en el panel de Credenciales.');
      return;
    }
    if (!fiel.contrasena) {
      scrollToFielSection();
      setErrorMessage('🔑 Ingrese la Contraseña de su FIEL.');
      return;
    }
    if (!certFile || !keyFile) {
      scrollToFielSection();
      setErrorMessage('📁 Seleccione sus archivos .cer y .key.');
      return;
    }

    setIsSolicitansoWs(true);
    try {
      const fd = getFormDataWithFiles();
      fd.append('fecha_inicial', `${wsFilters.fecha_inicial}T00:00:00`);
      fd.append('fecha_final', `${wsFilters.fecha_final}T23:59:59`);
      fd.append('tipo', wsFilters.tipo);
      fd.append('tipoBusqueda', wsFilters.tipoBusqueda);
      fd.append('estadoComprobante', wsFilters.estadoComprobante);

      const res = await fetch('/api/sat/solicita', {
        method: 'POST',
        body: fd
      });

      const data = await parseResponseJson(res);

      const idSol = data.idSolicitud || data.IdSolicitud || data.data?.idSolicitud;
      if (!idSol) throw new Error('El SAT no devolvió un ID de Solicitud válido.');

      const newEntry: SolicitudHistory = {
        idSolicitud: idSol,
        fechaSolicitud: new Date().toLocaleString('es-MX'),
        tipo: wsFilters.tipo,
        tipoBusqueda: wsFilters.tipoBusqueda,
        rangoFechas: `${wsFilters.fecha_inicial} a ${wsFilters.fecha_final}`,
        estado: 'Aceptada',
        paquetes: []
      };

      setSolicitaHistory(prev => [newEntry, ...prev]);
      setSuccessMessage(`¡Solicitud enviada al SAT exitosamente! ID Solicitud: ${idSol}`);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(formatFetchError(err));
    } finally {
      setIsSolicitansoWs(false);
    }
  };

  const handleVerificarWs = async (idSolicitud: string) => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsVerificandoId(idSolicitud);

    try {
      if (!fiel.contrasena || !certFile || !keyFile) {
        scrollToFielSection();
        throw new Error('Por favor verifique que sus datos de FIEL estén completos en el panel superior.');
      }

      const fd = getFormDataWithFiles();
      fd.append('idSolicitud', idSolicitud);

      const res = await fetch('/api/sat/verifica', {
        method: 'POST',
        body: fd
      });

      const data = await parseResponseJson(res);

      const packIds = data.idsPaquetes || data.IdsPaquetes || data.data?.idsPaquetes || [];
      const estCode = String(data.estadoSolicitud || data.EstadoSolicitud || data.data?.estadoSolicitud || '2');

      let estadoTexto = 'En Proceso';
      if (estCode === '3' || packIds.length > 0) estadoTexto = 'Terminada';
      if (estCode === '4') estadoTexto = 'Rechazada';

      setSolicitaHistory(prev => prev.map(item => {
        if (item.idSolicitud === idSolicitud) {
          return {
            ...item,
            estado: estadoTexto,
            paquetes: packIds.length > 0 ? packIds : item.paquetes
          };
        }
        return item;
      }));

      if (packIds.length > 0) {
        setSuccessMessage(`¡Solicitud Lista! Se encontraron ${packIds.length} paquete(s) disponible(s) para descarga.`);
      } else {
        setSuccessMessage(`Estatus SAT: ${estadoTexto}. (El SAT procesa paquetes masivos de 5 a 15 minutos).`);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(formatFetchError(err));
    } finally {
      setIsVerificandoId(null);
    }
  };

  const handleDescargarPaqueteWs = async (idPaquete: string) => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsDescargandoPkg(idPaquete);

    try {
      const fd = getFormDataWithFiles();
      fd.append('idPaquete', idPaquete);

      const res = await fetch('/api/sat/descarga', {
        method: 'POST',
        body: fd
      });

      const data = await parseResponseJson(res);

      if (data.xmlFiles && data.xmlFiles.length > 0) {
        setExtractedXmls(data.xmlFiles);
        setSuccessMessage(`¡Paquete ${idPaquete} descargado y descomprimido con éxito! (${data.xmlFiles.length} archivos XML extraídos).`);
      } else if (data.zipBase64) {
        const link = document.createElement('a');
        link.href = `data:application/zip;base64,${data.zipBase64}`;
        link.download = `SAT_Paquete_${idPaquete}.zip`;
        link.click();
        setSuccessMessage(`¡Paquete ${idPaquete} descargado en formato ZIP!`);
      } else {
        setSuccessMessage('Paquete descargado correctamente.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(formatFetchError(err));
    } finally {
      setIsDescargandoPkg(null);
    }
  };

  // ==========================================
  // TAB 5: LISTA NEGRA EFOS (69-B)
  // ==========================================
  const [efosRfcInput, setEfosRfcInput] = useState('');
  const [isConsultingEfos, setIsConsultingEfos] = useState(false);
  const [efosResult, setEfosResult] = useState<any>(null);

  const handleConsultarEfos = async () => {
    if (!efosRfcInput.trim()) return;
    setErrorMessage('');
    setSuccessMessage('');
    setIsConsultingEfos(true);
    setEfosResult(null);

    try {
      const headers: Record<string, string> = {};

      const res = await fetch(`/api/sat/efos/${encodeURIComponent(efosRfcInput.trim().toUpperCase())}`, {
        headers
      });

      const data = await parseResponseJson(res);

      setEfosResult(data);
      setSuccessMessage(`Consulta de lista negra EFOS completada para el RFC ${efosRfcInput.toUpperCase()}.`);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(formatFetchError(err));
    } finally {
      setIsConsultingEfos(false);
    }
  };

  // ==========================================
  // TAB 6: INFORMACIÓN FISCAL
  // ==========================================
  const [isConsultingFiscal, setIsConsultingFiscal] = useState(false);
  const [fiscalInfoResult, setFiscalInfoResult] = useState<any>(null);

  const handleConsultarInformacionFiscal = async () => {
    setErrorMessage('');
    setSuccessMessage('');

    if (!fiel.rfc || !fiel.contrasena || !certFile || !keyFile) {
      scrollToFielSection();
      setErrorMessage('Por favor ingrese su RFC, Contraseña de FIEL y archivos .cer y .key en el panel superior.');
      return;
    }

    setIsConsultingFiscal(true);
    setFiscalInfoResult(null);

    try {
      const fd = getFormDataWithFiles();
      const res = await fetch('/api/sat/informacionfiscalfiel', {
        method: 'POST',
        body: fd
      });

      const data = await parseResponseJson(res);

      setFiscalInfoResult(data);
      setSuccessMessage('Información fiscal obtenida directamente del SAT.');
    } catch (err: any) {
      console.error(err);
      setErrorMessage(formatFetchError(err));
    } finally {
      setIsConsultingFiscal(false);
    }
  };

  // Helper function to download text/XML
  const downloadTextFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8 font-sans">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold border border-indigo-400/30 backdrop-blur-sm">
              <Zap className="w-3.5 h-3.5 text-amber-400" /> SAT Web Service Client v2.0
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              Sincronizador & Módulo SAT Web Service
            </h1>
            <p className="text-slate-300 text-sm sm:text-base max-w-2xl leading-relaxed">
              Consulte y descargue de forma directa y automatizada la Constancia de Situación Fiscal (CSF), Opinión de Cumplimiento, Facturas CFDI / Metadatos, Descarga Masiva y estatus en lista negra EFOS.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://web.sat-go.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium backdrop-blur-md transition-all border border-white/15"
            >
              <ExternalLink className="w-4 h-4" /> Portal SAT-GO
            </a>
          </div>
        </div>
      </div>

      {/* Global Alerts */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-2xl p-5 flex flex-col sm:flex-row items-start gap-3 shadow-sm animate-fadeIn">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm font-medium leading-relaxed whitespace-pre-line space-y-3">
            <div>{errorMessage}</div>
            {(errorMessage.includes('Límite mensual') || errorMessage.includes('limite mensual')) && (
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  onClick={scrollToFielSection}
                  className="px-3.5 py-1.5 rounded-lg bg-red-600 text-white font-bold text-xs hover:bg-red-700 transition-all shadow-sm"
                >
                  🔑 Configurar Token Personal SAT-GO
                </button>
                <a
                  href="https://web.sat-go.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 rounded-lg bg-white border border-red-300 text-red-700 font-bold text-xs hover:bg-red-100 transition-all inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Renovar en Portal SAT-GO
                </a>
              </div>
            )}
          </div>
          <button
            onClick={() => setErrorMessage('')}
            className="text-red-500 hover:text-red-700 text-xs font-bold px-2 py-1 rounded shrink-0 self-start"
          >
            Cerrar
          </button>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-5 flex items-start gap-3 shadow-sm animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-sm font-medium leading-relaxed">
            {successMessage}
          </div>
          <button
            onClick={() => setSuccessMessage('')}
            className="text-emerald-600 hover:text-emerald-800 text-xs font-bold px-2 py-1 rounded"
          >
            Aceptar
          </button>
        </div>
      )}

      {/* QUICK SELECT SAVED TAXPAYER PROFILE BAR */}
      {savedProfiles.length > 0 && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-indigo-950 border border-slate-800 rounded-2xl p-4 shadow-sm text-white flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-200 uppercase tracking-wider">Perfil Contribuyente Guardado</p>
              <p className="text-[11px] text-slate-400">Seleccione un cliente para autocompletar su Firma FIEL (.cer, .key) o CIEC de inmediato:</p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <select
              value={selectedProfileId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedProfileId(id);
                const found = savedProfiles.find(p => p.id === id);
                if (found) {
                  loadProfileIntoSession(found);
                }
              }}
              className="bg-slate-800 border border-slate-700 text-white font-bold text-xs rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none w-full md:w-64"
            >
              <option value="">-- Seleccionar Perfil Guardado --</option>
              {savedProfiles.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.rfc}) - {p.authType || 'FIEL'}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setActiveTab('perfiles')}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all shrink-0 inline-flex items-center gap-1.5 shadow"
            >
              <Plus className="w-3.5 h-3.5" /> Gestionar Perfiles
            </button>
          </div>
        </div>
      )}

      {/* CREDENTIALS SECTION (SHARED FORM) */}
      <div id="fiel-credentials-section" className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6 scroll-mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Credenciales de Firma Electrónica (FIEL) & API</h2>
              <p className="text-xs text-slate-500">Se mantienen guardadas en su navegador para agilizar todas sus consultas.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              {certFile && keyFile && fiel.contrasena ? 'Credenciales Completas' : 'Credenciales Incompletas'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* RFC */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              RFC del Contribuyente *
            </label>
            <input
              type="text"
              placeholder="PEJU880101XXX"
              value={fiel.rfc}
              onChange={(e) => setFiel({ ...fiel, rfc: e.target.value.toUpperCase() })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-semibold tracking-wider text-slate-900 bg-slate-50/50"
            />
          </div>

          {/* Contraseña FIEL */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Contraseña FIEL *
            </label>
            <input
              type="password"
              placeholder="••••••••••••"
              value={fiel.contrasena}
              onChange={(e) => setFiel({ ...fiel, contrasena: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-medium text-slate-900 bg-slate-50/50"
            />
          </div>

          {/* Certificado .CER */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
              <span>Certificado (.cer) *</span>
              {certFile && <span className="text-emerald-600 font-medium">✓ Listo</span>}
            </label>
            <input
              type="file"
              accept=".cer"
              onChange={(e) => setCertFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-slate-600 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer border border-slate-200 rounded-xl p-1 bg-slate-50/50"
            />
          </div>

          {/* Llave Privada .KEY */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
              <span>Llave Privada (.key) *</span>
              {keyFile && <span className="text-emerald-600 font-medium">✓ Listo</span>}
            </label>
            <input
              type="file"
              accept=".key"
              onChange={(e) => setKeyFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-slate-600 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer border border-slate-200 rounded-xl p-1 bg-slate-50/50"
            />
          </div>
        </div>

        {/* Direct Web Service Info Badge */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/80 px-3.5 py-2.5 rounded-xl w-full">
            <Zap className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Sincronización Nativa con el Web Service Oficial del SAT (vía <strong>@nodecfdi/sat-ws-descarga-masiva</strong>). Conexión directa con su Firma Electrónica (.cer, .key y contraseña), sin intermediarios ni tokens de API.</span>
          </div>
        </div>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('facturas')}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${
            activeTab === 'facturas'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          Consulta Facturas CFDI
        </button>

        <button
          onClick={() => setActiveTab('csf')}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${
            activeTab === 'csf'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Constancia CSF
        </button>

        <button
          onClick={() => setActiveTab('oc')}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${
            activeTab === 'oc'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Opinión de Cumplimiento
        </button>

        <button
          onClick={() => setActiveTab('solicita')}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${
            activeTab === 'solicita'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Archive className="w-4 h-4" />
          Descarga Masiva (WS)
        </button>

        <button
          onClick={() => setActiveTab('efos')}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${
            activeTab === 'efos'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          Lista Negra EFOS
        </button>

        <button
          onClick={() => setActiveTab('info')}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${
            activeTab === 'info'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Info className="w-4 h-4" />
          Información Fiscal
        </button>

        <button
          onClick={() => setActiveTab('perfiles')}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${
            activeTab === 'perfiles'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Key className="w-4 h-4 text-amber-600" />
          Guardar Credenciales (FIEL / CIEC)
        </button>
      </div>

      {/* TAB CONTENT AREAS */}

      {/* TAB 1: CONSULTA DE FACTURAS */}
      {activeTab === 'facturas' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Consultar y Descargar Facturas CFDI</h3>
                <p className="text-xs text-slate-500">Obtenga los comprobantes o metadatos emitidos y recibidos directamente del Web Service SAT-GO.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Tipo de Comprobantes</label>
                <select
                  value={facturaFilters.tipo}
                  onChange={(e) => setFacturaFilters({ ...facturaFilters, tipo: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-slate-50"
                >
                  <option value="recibidos">📥 Facturas Recibidas</option>
                  <option value="emitidos">📤 Facturas Emitidas</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Fecha Inicial</label>
                <input
                  type="date"
                  value={facturaFilters.fecha_inicial}
                  onChange={(e) => setFacturaFilters({ ...facturaFilters, fecha_inicial: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-slate-50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Fecha Final</label>
                <input
                  type="date"
                  value={facturaFilters.fecha_final}
                  onChange={(e) => setFacturaFilters({ ...facturaFilters, fecha_final: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-slate-50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Estatus del CFDI</label>
                <select
                  value={facturaFilters.estatusFactura}
                  onChange={(e) => setFacturaFilters({ ...facturaFilters, estatusFactura: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-slate-50"
                >
                  <option value="-1">Todos los Estatus</option>
                  <option value="1">Vigentes únicamente</option>
                  <option value="0">Cancelados únicamente</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <div className="flex items-center gap-6">
                <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={facturaFilters.descargaComprobantes}
                    onChange={(e) => setFacturaFilters({ ...facturaFilters, descargaComprobantes: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  Descargar XML Comprobantes
                </label>
              </div>

              <button
                onClick={handleConsultarFacturas}
                disabled={isConsultingFacturas}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-all disabled:opacity-50"
              >
                {isConsultingFacturas ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Consultando SAT...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Consultar Facturas
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Results Table / Status Card */}
          {facturasResult && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
              {/* CASE 1: Facturas recovered (length > 0) */}
              {facturasResult.facturas && facturasResult.facturas.length > 0 ? (
                <div className="space-y-6">
                  {/* Header Stats */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-indigo-50/60 border border-indigo-100">
                    <div>
                      <div className="flex items-center gap-2 text-indigo-950 font-bold text-base">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <span>{facturasResult.facturas.length} Comprobante(s) Recuperado(s)</span>
                      </div>
                      <p className="text-xs text-indigo-700/80 mt-0.5">
                        Folio de Solicitud SAT: <code className="font-mono bg-white/80 px-1.5 py-0.5 rounded text-[11px]">{facturasResult.idSolicitud}</code>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {facturasResult.xmlFiles && facturasResult.xmlFiles.length > 0 && (
                        <button
                          onClick={handleDownloadAllZip}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-sm transition-all"
                        >
                          <Download className="w-4 h-4" /> Descargar Todo (.ZIP)
                        </button>
                      )}
                      <button
                        onClick={handleExportExcel}
                        className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-sm transition-all"
                      >
                        <FileSpreadsheet className="w-4 h-4" /> Exportar a Excel
                      </button>
                    </div>
                  </div>

                  {/* Filter input */}
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Detalle de Comprobantes CFDI</p>
                    <input
                      type="text"
                      placeholder="Buscar por RFC, Nombre, Folio..."
                      value={searchFacturaText}
                      onChange={(e) => setSearchFacturaText(e.target.value)}
                      className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs w-full max-w-xs focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {/* Facturas Table */}
                  <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px] tracking-wider">
                          <th className="p-3">UUID / Folio</th>
                          <th className="p-3">Fecha</th>
                          <th className="p-3">Emisor</th>
                          <th className="p-3">Receptor</th>
                          <th className="p-3">Efecto</th>
                          <th className="p-3 text-right">Total ($)</th>
                          <th className="p-3 text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                        {facturasResult.facturas
                          .filter((f: any) => {
                            if (!searchFacturaText.trim()) return true;
                            const query = searchFacturaText.toLowerCase();
                            return (
                              (f.uuid || '').toLowerCase().includes(query) ||
                              (f.rfcEmisor || f.rfCemisor || '').toLowerCase().includes(query) ||
                              (f.nombreEmisor || '').toLowerCase().includes(query) ||
                              (f.rfcReceptor || '').toLowerCase().includes(query) ||
                              (f.nombreReceptor || '').toLowerCase().includes(query)
                            );
                          })
                          .map((f: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                              <td className="p-3 font-mono text-[11px] text-slate-900 font-semibold max-w-[180px] truncate" title={f.uuid}>
                                {f.uuid || 'S/N'}
                              </td>
                              <td className="p-3 whitespace-nowrap text-slate-600">{f.fechaEmision || f.fecha || 'N/A'}</td>
                              <td className="p-3 max-w-[160px] truncate">
                                <div className="font-bold text-slate-900 text-[11px]">{f.rfcEmisor || f.rfCemisor || 'N/A'}</div>
                                <div className="text-[10px] text-slate-500 truncate">{f.nombreEmisor || f.razonSocialEmisor || ''}</div>
                              </td>
                              <td className="p-3 max-w-[160px] truncate">
                                <div className="font-bold text-slate-900 text-[11px]">{f.rfcReceptor || 'N/A'}</div>
                                <div className="text-[10px] text-slate-500 truncate">{f.nombreReceptor || f.razonSocialReceptor || ''}</div>
                              </td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                                  {f.efectoDelComprobante || f.tipoDeComprobante || 'Ingreso'}
                                </span>
                              </td>
                              <td className="p-3 text-right font-mono font-bold text-slate-900 text-xs">
                                {typeof f.totalNum === 'number' && !isNaN(f.totalNum)
                                  ? `$${f.totalNum.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                  : typeof f.total === 'number'
                                    ? `$${f.total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                    : (f.total || '$0.00')}
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  {f.rawXml && (
                                    <button
                                      onClick={() => setSelectedXmlModal({ fileName: f.fileName || `${f.uuid}.xml`, content: f.rawXml })}
                                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] inline-flex items-center gap-1"
                                      title="Ver XML"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  {f.rawXml && (
                                    <button
                                      onClick={() => downloadTextFile(f.rawXml, f.fileName || `${f.uuid}.xml`)}
                                      className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] inline-flex items-center gap-1"
                                      title="Descargar XML"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (facturasResult.estadoSolicitud === 'Rechazada' || facturasResult.estadoSolicitud === 'Error' || facturasResult.estadoSolicitud === 'Vencida') ? (
                /* CASE 2: Solicitud Rechazada o Error por el SAT */
                <div className="space-y-6">
                  <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200/90 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-rose-100 text-rose-800 shrink-0 mt-0.5">
                        <AlertCircle className="w-6 h-6" />
                      </div>
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="font-bold text-rose-950 text-base flex items-center gap-2">
                            <span>Solicitud {facturasResult.estadoSolicitud || 'Rechazada'} por el SAT</span>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-200 text-rose-900 uppercase tracking-wider">
                              Estatus: {facturasResult.estadoSolicitud}
                            </span>
                          </h4>
                        </div>

                        <p className="text-xs text-rose-900 leading-relaxed font-medium">
                          {facturasResult.mensaje || 'La solicitud fue rechazada por los servidores del SAT.'}
                        </p>

                        <div className="text-[11px] text-rose-800 bg-rose-100/60 p-3 rounded-xl border border-rose-200 space-y-1 font-mono">
                          <div>• Folio de Solicitud SAT: <strong>{facturasResult.idSolicitud}</strong></div>
                          <div>• Código de Respuesta: <strong>{facturasResult.codEstatus}</strong></div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-rose-200/60 flex flex-wrap items-center justify-end gap-3">
                      <button
                        onClick={() => {
                          setFacturaFilters(prev => ({ ...prev, tipoBusqueda: '2' }));
                          setTimeout(() => handleConsultarFacturas(), 100);
                        }}
                        disabled={isConsultingFacturas}
                        className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs inline-flex items-center gap-1.5 transition-all"
                      >
                        <FileText className="w-3.5 h-3.5" /> Cambiar a Modo "Metadata"
                      </button>

                      <button
                        onClick={handleConsultarFacturas}
                        disabled={isConsultingFacturas}
                        className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs inline-flex items-center gap-1.5 shadow-sm transition-all"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isConsultingFacturas ? 'animate-spin' : ''}`} /> Reintentar Consulta
                      </button>
                    </div>
                  </div>

                  <details className="text-xs text-slate-500">
                    <summary className="cursor-pointer font-semibold hover:text-slate-700 py-1">
                      Ver detalle técnico de la respuesta del SAT
                    </summary>
                    <pre className="p-3 mt-2 bg-slate-900 text-emerald-400 font-mono text-[11px] overflow-auto max-h-48 rounded-xl">
                      {JSON.stringify(facturasResult, null, 2)}
                    </pre>
                  </details>
                </div>
              ) : (
                /* CASE 3: Facturas array is empty, but idSolicitud is active/in process */
                <div className="space-y-6">
                  <div className="p-6 rounded-2xl bg-amber-50/90 border border-amber-200/90 space-y-4 shadow-xs">
                    <div className="flex items-start gap-3.5">
                      <div className="p-3 rounded-2xl bg-amber-100/80 text-amber-900 shrink-0 mt-0.5 border border-amber-200">
                        <Clock className="w-6 h-6 animate-spin text-amber-700" />
                      </div>
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="font-bold text-amber-950 text-base flex items-center gap-2">
                            <span>Solicitud Registrada en el Web Service del SAT</span>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-200 text-amber-900 uppercase tracking-wider">
                              {facturasResult.estadoSolicitud || 'En Proceso'}
                            </span>
                          </h4>

                          {autoPollActive && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-200/80 text-amber-950 border border-amber-300 animate-pulse">
                              <RefreshCw className="w-3 h-3 animate-spin text-amber-800" />
                              Auto-Sincronización Activa (cada 6s)
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-amber-950 leading-relaxed font-medium">
                          El servicio web del SAT asignó el Folio de Solicitud{' '}
                          <strong className="font-mono bg-amber-100/90 px-2 py-0.5 rounded text-amber-950 border border-amber-300">
                            {facturasResult.idSolicitud}
                          </strong>
                          . Los servidores del SAT están generando los paquetes ZIP de forma asíncrona.
                        </p>

                        <div className="bg-amber-100/50 p-3 rounded-xl border border-amber-200/80 text-[11px] text-amber-900 space-y-1">
                          <div className="font-bold flex items-center gap-1.5">
                            <Zap className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                            <span>¿Por qué ocurre esto?</span>
                          </div>
                          <p>
                            El SAT procesa descargas masivas en su servidor central de empaquetado. El sistema verifica automáticamente cada 6 segundos hasta que el SAT concluye y descarga todos los comprobantes XML a su pantalla sin que tenga que hacer nada.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-amber-200/70 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <label className="inline-flex items-center gap-2 text-xs font-bold text-amber-950 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoPollActive}
                          onChange={(e) => setAutoPollActive(e.target.checked)}
                          className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500"
                        />
                        <span>🔄 Verificar estatus en segundo plano automáticamente</span>
                      </label>

                      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        <button
                          onClick={() => {
                            setFacturaFilters(prev => ({ ...prev, tipoBusqueda: '2' }));
                            setTimeout(() => handleConsultarFacturas(), 100);
                          }}
                          disabled={isConsultingFacturas}
                          className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs inline-flex items-center gap-1.5 transition-all"
                        >
                          <FileText className="w-3.5 h-3.5" /> Modo Metadata (Resumen Rápido)
                        </button>

                        <button
                          onClick={() => handleRevisarEstatusFacturas(facturasResult.idSolicitud)}
                          disabled={isConsultingFacturas}
                          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md inline-flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                        >
                          {isConsultingFacturas ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              Verificando Paquetes en SAT...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4" />
                              Verificar Estatus Ahora
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Technical response drawer preview for transparency */}
                  <details className="text-xs text-slate-500">
                    <summary className="cursor-pointer font-semibold hover:text-slate-700 py-1">
                      Ver detalle técnico de la respuesta del SAT
                    </summary>
                    <pre className="p-3 mt-2 bg-slate-900 text-emerald-400 font-mono text-[11px] overflow-auto max-h-48 rounded-xl">
                      {JSON.stringify(facturasResult, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CONSTANCIA DE SITUACIÓN FISCAL */}
      {activeTab === 'csf' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Constancia de Situación Fiscal (CSF)</h3>
                <p className="text-xs text-slate-500">Obtenga la constancia oficial del SAT en formato PDF actualizado.</p>
              </div>

              <button
                onClick={handleConsultarCsf}
                disabled={isConsultingCsf}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-all disabled:opacity-50"
              >
                {isConsultingCsf ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Generando CSF...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Descargar Constancia CSF
                  </>
                )}
              </button>
            </div>

            {csfPdfBlobUrl ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 p-4 rounded-xl">
                  <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Constancia CSF lista para visualizar y descargar.
                  </div>
                  <a
                    href={csfPdfBlobUrl}
                    download={`Constancia_CSF_${fiel.rfc}.pdf`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-emerald-700"
                  >
                    <Download className="w-3.5 h-3.5" /> Descargar PDF
                  </a>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden h-[600px]">
                  <iframe src={csfPdfBlobUrl} className="w-full h-full" title="Constancia CSF" />
                </div>
              </div>
            ) : csfDataResult ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 p-4 rounded-xl">
                  <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Certificado e.firma verificado correctamente en el Web Service del SAT.
                  </div>
                </div>

                <div className="bg-slate-900 text-slate-100 rounded-2xl p-6 font-mono text-xs overflow-auto max-h-[500px] border border-slate-800 shadow-inner">
                  <div className="text-emerald-400 font-bold mb-3">✓ Estado de Certificación y Sincronización SAT</div>
                  <pre>{JSON.stringify(csfDataResult, null, 2)}</pre>
                </div>
              </div>
            ) : (
              <div className="p-12 border-2 border-dashed border-slate-200 rounded-2xl text-center space-y-3 bg-slate-50/50">
                <Building2 className="w-12 h-12 text-slate-300 mx-auto" />
                <h4 className="text-sm font-bold text-slate-700">Sin Constancia Cargada</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Presione el botón superior para autenticarse con sus archivos FIEL y consultar la información de su Constancia de Situación Fiscal.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: OPINIÓN DE CUMPLIMIENTO */}
      {activeTab === 'oc' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Opinión de Cumplimiento de Obligaciones Fiscales</h3>
                <p className="text-xs text-slate-500">Consulte el sentido de su Opinión emitida por el SAT (Positiva / Negativa) en PDF o estatus oficial.</p>
              </div>

              <button
                onClick={handleConsultarOc}
                disabled={isConsultingOc}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-all disabled:opacity-50"
              >
                {isConsultingOc ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Consultando Opinión...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    Obtener Opinión de Cumplimiento
                  </>
                )}
              </button>
            </div>

            {ocPdfBlobUrl ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 p-4 rounded-xl">
                  <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Opinión de Cumplimiento lista.
                  </div>
                  <a
                    href={ocPdfBlobUrl}
                    download={`Opinion_Cumplimiento_${fiel.rfc}.pdf`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg shadow-sm hover:bg-emerald-700"
                  >
                    <Download className="w-3.5 h-3.5" /> Descargar PDF
                  </a>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden h-[600px]">
                  <iframe src={ocPdfBlobUrl} className="w-full h-full" title="Opinión de Cumplimiento" />
                </div>
              </div>
            ) : ocDataResult ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 p-4 rounded-xl">
                  <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Resultado de Opinión de Cumplimiento recibido del SAT.
                  </div>
                </div>

                <div className="bg-slate-900 text-slate-100 rounded-2xl p-6 font-mono text-xs overflow-auto max-h-[500px] border border-slate-800 shadow-inner">
                  <div className="text-emerald-400 font-bold mb-3">✓ Estatus de Opinión Fiscal</div>
                  <pre>{JSON.stringify(ocDataResult, null, 2)}</pre>
                </div>
              </div>
            ) : (
              <div className="p-12 border-2 border-dashed border-slate-200 rounded-2xl text-center space-y-3 bg-slate-50/50">
                <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto" />
                <h4 className="text-sm font-bold text-slate-700">Sin Opinión Consultada</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Haga clic en el botón para firmar la solicitud con su FIEL y verificar el estado de opinión de obligaciones ante el SAT.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: DESCARGA MASIVA WEB SERVICE */}
      {activeTab === 'solicita' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-lg font-bold text-slate-900">Descarga Masiva por Web Service SAT</h3>
              <p className="text-xs text-slate-500">Envíe solicitudes de paquetes masivos de XML o Metadatos para periodos extensos.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Tipo de Comprobantes</label>
                <select
                  value={wsFilters.tipo}
                  onChange={(e) => setWsFilters({ ...wsFilters, tipo: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-slate-50"
                >
                  <option value="recibidos">📥 Facturas Recibidas</option>
                  <option value="emitidos">📤 Facturas Emitidas</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Fecha Inicial</label>
                <input
                  type="date"
                  value={wsFilters.fecha_inicial}
                  onChange={(e) => setWsFilters({ ...wsFilters, fecha_inicial: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-slate-50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Fecha Final</label>
                <input
                  type="date"
                  value={wsFilters.fecha_final}
                  onChange={(e) => setWsFilters({ ...wsFilters, fecha_final: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-slate-50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Tipo Búsqueda</label>
                <select
                  value={wsFilters.tipoBusqueda}
                  onChange={(e) => setWsFilters({ ...wsFilters, tipoBusqueda: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-slate-50"
                >
                  <option value="CFDI">XML CFDI</option>
                  <option value="Metadata">Metadatos</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={handleSolicitarWs}
                disabled={isSolicitansoWs}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-all disabled:opacity-50"
              >
                {isSolicitansoWs ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Enviando Solicitud al SAT...
                  </>
                ) : (
                  <>
                    <Archive className="w-4 h-4" />
                    Solicitar Paquete Masivo al SAT
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Solicitud History List */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h4 className="font-bold text-slate-900 text-base">Historial de Solicitudes Masivas</h4>

            {solicitaHistory.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No hay solicitudes registradas aún.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {solicitaHistory.map((item) => (
                  <div key={item.idSolicitud} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900">{item.idSolicitud}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          item.estado === 'Terminada' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {item.estado}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {item.tipo.toUpperCase()} • {item.rangoFechas} • Envia: {item.fechaSolicitud}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleVerificarWs(item.idSolicitud)}
                        disabled={isVerificandoId === item.idSolicitud}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold text-xs inline-flex items-center gap-1.5"
                      >
                        {isVerificandoId === item.idSolicitud ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Verificar Estatus
                      </button>

                      {item.paquetes.map((pkg) => (
                        <button
                          key={pkg}
                          onClick={() => handleDescargarPaqueteWs(pkg)}
                          disabled={isDescargandoPkg === pkg}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Descargar {pkg.substring(0, 8)}...
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Extracted XMLs view */}
          {extractedXmls && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 text-base">Archivos XML Extraídos ({extractedXmls.length})</h4>
                <button
                  onClick={() => setExtractedXmls(null)}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Cerrar
                </button>
              </div>

              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {extractedXmls.map((xml, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                    <span className="font-mono text-slate-700 truncate max-w-md">{xml.fileName}</span>
                    <button
                      onClick={() => downloadTextFile(xml.content, xml.fileName)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded font-semibold text-[11px] inline-flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" /> Descargar XML
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: LISTA NEGRA EFOS */}
      {activeTab === 'efos' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Consulta de Lista Negra EFOS (Artículo 69-B del CFF)</h3>
              <p className="text-xs text-slate-500">Verifique si un RFC se encuentra listado como Empresa que Factura Operaciones Simuladas (Definitivo, Presunto o Desvirtuado).</p>
            </div>

            <div className="flex gap-3 max-w-xl">
              <input
                type="text"
                placeholder="RFC a consultar (Ej. PEJU880101XXX)"
                value={efosRfcInput}
                onChange={(e) => setEfosRfcInput(e.target.value.toUpperCase())}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-300 font-mono font-bold text-sm uppercase"
              />
              <button
                onClick={handleConsultarEfos}
                disabled={isConsultingEfos || !efosRfcInput.trim()}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm inline-flex items-center gap-2 disabled:opacity-50"
              >
                {isConsultingEfos ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Consultar RFC
              </button>
            </div>

            {efosResult && (
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                <h4 className="font-bold text-slate-900 text-sm">Resultado EFOS para RFC: {efosRfcInput.toUpperCase()}</h4>
                <pre className="p-3 bg-slate-900 text-emerald-400 font-mono text-xs overflow-auto rounded-lg">
                  {JSON.stringify(efosResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: INFORMACIÓN FISCAL */}
      {activeTab === 'info' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Información Fiscal Registrada ante el SAT</h3>
                <p className="text-xs text-slate-500">Consulte régimen fiscal, domicilio, nombre fiscal y estatus del RFC.</p>
              </div>

              <button
                onClick={handleConsultarInformacionFiscal}
                disabled={isConsultingFiscal}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm inline-flex items-center gap-2 disabled:opacity-50"
              >
                {isConsultingFiscal ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Info className="w-4 h-4" />}
                Consultar Info Fiscal
              </button>
            </div>

            {fiscalInfoResult && (
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                <pre className="p-3 bg-slate-900 text-emerald-400 font-mono text-xs overflow-auto rounded-lg">
                  {JSON.stringify(fiscalInfoResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 7: GUARDAR CREDENCIALES (FIEL / CIEC) */}
      {activeTab === 'perfiles' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="border-b border-slate-100 pb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Key className="w-5 h-5 text-amber-600" />
                  Almacenamiento Local de Credenciales SAT (FIEL & CIEC)
                </h3>
                <p className="text-xs text-slate-500">
                  Guarde el RFC, Razón Social, Teléfono, Correo y su Firma Electrónica FIEL (.cer, .key, contraseña) o CIEC para no ingresarlos repetidamente.
                </p>
              </div>
              <div className="px-3 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs font-bold flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                Almacenamiento Seguro Encriptado Localmente
              </div>
            </div>

            {profileMsg && (
              <div className={`p-4 rounded-xl text-xs font-bold border flex items-center justify-between ${
                profileMsg.startsWith('✓') 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}>
                <span>{profileMsg}</span>
                <button onClick={() => setProfileMsg('')} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>
            )}

            <form onSubmit={async (e) => {
              e.preventDefault();
              setProfileMsg('');
              const cleanRfc = profRfc.trim().toUpperCase();
              const rfcRegex = /^[A-Z&Ññ]{3,4}[0-9]{6}[A-Z0-9]{3}$/i;

              if (!profName.trim() || !cleanRfc || !profEmail.trim()) {
                setProfileMsg('Error: Complete la Razón Social, RFC y Correo electrónico.');
                return;
              }

              if (!rfcRegex.test(cleanRfc)) {
                setProfileMsg('Error: RFC inválido. Formato esperado de 12 o 13 caracteres.');
                return;
              }

              const newProfile: AncofiClient = {
                id: `client-${Date.now()}`,
                name: profName.trim(),
                rfc: cleanRfc,
                email: profEmail.trim().toLowerCase(),
                phone: profPhone.trim() || undefined,
                authType: profAuthType,
                fielPassword: profAuthType === 'FIEL' ? profFielPass : undefined,
                cerFileName: profAuthType === 'FIEL' ? profCerFileName : undefined,
                cerBase64: profAuthType === 'FIEL' ? profCerB64 : undefined,
                keyFileName: profAuthType === 'FIEL' ? profKeyFileName : undefined,
                keyBase64: profAuthType === 'FIEL' ? profKeyB64 : undefined,
                ciecPassword: profAuthType === 'CIEC' ? profCiecPass : undefined,
                registeredAt: new Date().toISOString().substring(0, 10)
              };

              const existingIdx = savedProfiles.findIndex(p => p.rfc.toUpperCase() === cleanRfc);
              let updated: AncofiClient[];
              if (existingIdx >= 0) {
                updated = [...savedProfiles];
                updated[existingIdx] = { ...updated[existingIdx], ...newProfile, id: updated[existingIdx].id };
              } else {
                updated = [newProfile, ...savedProfiles];
              }

              setSavedProfiles(updated);
              saveClients(updated);

              loadProfileIntoSession(newProfile);
              setProfileMsg(`✓ Credenciales SAT (${profAuthType}) de "${profName}" guardadas y cargadas en la sesión activa.`);

              // Reset inputs
              setProfRfc('');
              setProfName('');
              setProfPhone('');
              setProfEmail('');
              setProfFielPass('');
              setProfCerFile(null);
              setProfCerFileName('');
              setProfCerB64('');
              setProfKeyFile(null);
              setProfKeyFileName('');
              setProfKeyB64('');
              setProfCiecPass('');
            }} className="space-y-6">
              
              {/* Profile Main Data */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">RFC del Contribuyente *</label>
                  <input
                    type="text"
                    required
                    placeholder="ISM980121V98"
                    value={profRfc}
                    onChange={(e) => setProfRfc(e.target.value.toUpperCase())}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono text-sm uppercase font-bold focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">Razón Social / Nombre *</label>
                  <input
                    type="text"
                    required
                    placeholder="Industrias San Miguel S.A. de C.V."
                    value={profName}
                    onChange={(e) => setProfName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">Número Celular / Teléfono</label>
                  <input
                    type="tel"
                    placeholder="5512345678"
                    value={profPhone}
                    onChange={(e) => setProfPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 uppercase">Correo Electrónico *</label>
                  <input
                    type="email"
                    required
                    placeholder="contacto@empresa.com"
                    value={profEmail}
                    onChange={(e) => setProfEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Credential Auth Type Selection */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <label className="text-xs font-bold text-slate-800 uppercase flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-600" />
                  Método de Autenticación SAT a Guardar:
                </label>
                <div className="flex gap-4">
                  <label className={`flex-1 p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3 ${
                    profAuthType === 'FIEL' 
                      ? 'border-amber-500 bg-amber-500/10 text-slate-900 font-bold' 
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}>
                    <input
                      type="radio"
                      name="profAuthType"
                      value="FIEL"
                      checked={profAuthType === 'FIEL'}
                      onChange={() => setProfAuthType('FIEL')}
                      className="text-amber-600"
                    />
                    <div>
                      <p className="text-xs font-extrabold">FIEL (e.firma Electrónica)</p>
                      <p className="text-[10px] text-slate-500 font-normal">Requiere archivos .cer, .key y Contraseña</p>
                    </div>
                  </label>

                  <label className={`flex-1 p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3 ${
                    profAuthType === 'CIEC' 
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-950 font-bold' 
                      : 'border-slate-200 bg-white text-slate-600'
                  }`}>
                    <input
                      type="radio"
                      name="profAuthType"
                      value="CIEC"
                      checked={profAuthType === 'CIEC'}
                      onChange={() => setProfAuthType('CIEC')}
                      className="text-indigo-600"
                    />
                    <div>
                      <p className="text-xs font-extrabold">CIEC (Contraseña SAT)</p>
                      <p className="text-[10px] text-slate-500 font-normal">Acceso rápido mediante Clave CIEC</p>
                    </div>
                  </label>
                </div>

                {/* FIEL Inputs */}
                {profAuthType === 'FIEL' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-200">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 uppercase flex items-center justify-between">
                        <span>Certificado (.cer)</span>
                        {profCerB64 && <span className="text-emerald-600 text-[10px]">✓ Cargado</span>}
                      </label>
                      <input
                        type="file"
                        accept=".cer"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setProfCerFile(file);
                            setProfCerFileName(file.name);
                            const b64 = await fileToBase64(file);
                            setProfCerB64(b64);
                          }
                        }}
                        className="w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-100 file:text-amber-900 cursor-pointer border border-slate-300 rounded-xl p-1 bg-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 uppercase flex items-center justify-between">
                        <span>Llave Privada (.key)</span>
                        {profKeyB64 && <span className="text-emerald-600 text-[10px]">✓ Cargado</span>}
                      </label>
                      <input
                        type="file"
                        accept=".key"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setProfKeyFile(file);
                            setProfKeyFileName(file.name);
                            const b64 = await fileToBase64(file);
                            setProfKeyB64(b64);
                          }
                        }}
                        className="w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-amber-100 file:text-amber-900 cursor-pointer border border-slate-300 rounded-xl p-1 bg-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 uppercase">Contraseña FIEL</label>
                      <div className="relative">
                        <input
                          type={showProfPass ? "text" : "password"}
                          placeholder="••••••••••••"
                          value={profFielPass}
                          onChange={(e) => setProfFielPass(e.target.value)}
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm pr-10 bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => setShowProfPass(!showProfPass)}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                        >
                          {showProfPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* CIEC Inputs */}
                {profAuthType === 'CIEC' && (
                  <div className="pt-3 border-t border-slate-200 max-w-md">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-slate-700 uppercase">Contraseña CIEC SAT</label>
                      <div className="relative">
                        <input
                          type={showProfPass ? "text" : "password"}
                          placeholder="••••••••••••"
                          value={profCiecPass}
                          onChange={(e) => setProfCiecPass(e.target.value)}
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm pr-10 bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => setShowProfPass(!showProfPass)}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                        >
                          {showProfPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm transition-all shadow-md inline-flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  <Key className="w-4 h-4" />
                  Guardar Perfil y Credenciales
                </button>
              </div>
            </form>

            {/* List of Saved Profiles */}
            <div className="pt-6 border-t border-slate-200 space-y-4">
              <h4 className="text-sm font-extrabold text-slate-900 flex items-center justify-between">
                <span>Perfiles de Contribuyentes Almacenados ({savedProfiles.length})</span>
                <span className="text-xs text-slate-500 font-normal">Haga clic en "Cargar en Sesión" para usarlo de inmediato</span>
              </h4>

              {savedProfiles.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-4">No hay credenciales ni perfiles guardados aún.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {savedProfiles.map(p => {
                    const isCurrent = p.id === selectedProfileId || p.rfc === fiel.rfc;
                    return (
                      <div
                        key={p.id}
                        className={`p-4 rounded-xl border transition-all ${
                          isCurrent 
                            ? 'bg-amber-500/10 border-amber-500/40 ring-2 ring-amber-500/20' 
                            : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-extrabold text-slate-900 text-sm">{p.name}</p>
                            <p className="font-mono text-xs font-bold text-amber-700 bg-amber-500/10 px-2 py-0.5 rounded inline-block mt-1">
                              {p.rfc}
                            </p>
                          </div>
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                            p.authType === 'FIEL' 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {p.authType || 'FIEL'}
                          </span>
                        </div>

                        <div className="mt-3 text-[11px] text-slate-600 space-y-1 border-t border-slate-200/60 pt-2">
                          <p><strong>Correo:</strong> {p.email}</p>
                          {p.phone && <p><strong>Teléfono:</strong> {p.phone}</p>}
                          {p.cerFileName && <p className="text-emerald-700 font-mono"><strong>.CER:</strong> {p.cerFileName}</p>}
                          {p.keyFileName && <p className="text-emerald-700 font-mono"><strong>.KEY:</strong> {p.keyFileName}</p>}
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-slate-200">
                          <button
                            type="button"
                            onClick={() => loadProfileIntoSession(p)}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs inline-flex items-center gap-1 shadow-sm"
                          >
                            <Zap className="w-3.5 h-3.5" /> Cargar en Sesión
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const updated = savedProfiles.filter(item => item.id !== p.id);
                              setSavedProfiles(updated);
                              saveClients(updated);
                              setProfileMsg(`Perfil de ${p.name} eliminado.`);
                            }}
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 hover:text-rose-700 text-xs font-bold"
                            title="Eliminar Perfil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA VISUALIZAR XML DE COMPROBANTE */}
      {selectedXmlModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-indigo-600" />
                  {selectedXmlModal.fileName}
                </h4>
                <p className="text-[11px] text-slate-500">Comprobante XML oficial firmado por el SAT</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => downloadTextFile(selectedXmlModal.content, selectedXmlModal.fileName)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Descargar XML
                </button>
                <button
                  onClick={() => setSelectedXmlModal(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg font-bold text-sm"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-4 overflow-auto bg-slate-900 text-emerald-300 font-mono text-xs flex-1">
              <pre className="whitespace-pre-wrap break-all">{selectedXmlModal.content}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SatWebService;
