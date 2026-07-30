import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { parseXMLData, isIvaTasaSpecial, ParsedCFDI } from '../utils/xmlParser';
import { AncofiClient, getSavedClients, saveClients, fileToBase64, base64ToFile } from '../utils/profileHelpers';
import { downloadCsfPdf, buildCsfDataFromClient, downloadClientCsfFileOrGeneratedPdf, generateCsfPdfBlob } from '../utils/csfPdfGenerator';
import { CfdiPdfViewerModal } from './CfdiPdfViewerModal';
import { downloadCfdiPdf } from '../utils/cfdiPdfGenerator';

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
  Edit3,
  Timer,
  Activity,
  Package,
  Square
} from 'lucide-react';

export interface SatSyncMetrics {
  active: boolean;
  idSolicitud: string;
  estado: string;
  elapsedSeconds: number;
  nextPollCountdown: number;
  currentIntervalSeconds: number;
  pollAttempts: number;
  packagesFound: number;
  xmlsDownloaded: number;
  downloadSpeed: number;
  lastPollTime: string;
  message: string;
}

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
  // Active Tab: 'portal' | 'masiva' | 'perfiles'
  const [activeTab, setActiveTab] = useState<'portal' | 'masiva' | 'perfiles'>('portal');

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
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('fetch failed') || msg.includes('Load failed')) {
      return 'Error de comunicación con el servidor API (Failed to fetch). Verifique su conexión a internet o reintente la solicitud en un momento.';
    }
    if (msg.startsWith('<!doctype') || msg.startsWith('<html') || msg.includes('<!DOCTYPE html>') || msg.includes('página HTML')) {
      return 'El servidor devolvió un formato de respuesta no esperado. Por favor reintente la operación en un momento.';
    }
    return msg;
  };

  // Helper for fetching with automatic retries on transient network errors, with AbortSignal support
  const fetchWithRetry = async (url: string, options?: RequestInit, maxRetries = 2, delayMs = 1000): Promise<Response> => {
    let lastError: any = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (options?.signal?.aborted) {
        throw new DOMException('The user aborted a request.', 'AbortError');
      }
      try {
        const res = await fetch(url, options);
        // Retry on transient server errors (502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout)
        if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < maxRetries) {
          const backoffDelay = delayMs * Math.pow(2, attempt);
          console.warn(`[fetchWithRetry] HTTP ${res.status} on attempt ${attempt + 1}/${maxRetries + 1} for ${url}, retrying in ${backoffDelay}ms...`);
          await new Promise(r => setTimeout(r, backoffDelay));
          continue;
        }
        return res;
      } catch (err: any) {
        if (err?.name === 'AbortError' || options?.signal?.aborted) {
          throw err;
        }
        lastError = err;
        const msg = String(err?.message || '');
        const isNetworkOrTimeout = err?.name === 'TypeError' ||
                                   msg.includes('Failed to fetch') ||
                                   msg.includes('fetch failed') ||
                                   msg.includes('NetworkError') ||
                                   msg.includes('Load failed');
        if (isNetworkOrTimeout && attempt < maxRetries) {
          const backoffDelay = delayMs * Math.pow(2, attempt);
          console.warn(`[fetchWithRetry] Transient network error on attempt ${attempt + 1}/${maxRetries + 1} for ${url}, retrying in ${backoffDelay}ms...`);
          await new Promise(r => setTimeout(r, backoffDelay));
          continue;
        }
        throw err;
      }
    }
    throw lastError;
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

    if (keyFile) {
      fd.append('llavePrivada', keyFile);
    } else if (selectedProfileId) {
      const savedClients = getSavedClients();
      const p = savedClients.find(c => c.id === selectedProfileId);
      if (p?.keyBase64) fd.append('keyBase64', p.keyBase64);
    }

    if (certFile) {
      fd.append('Certificado', certFile);
    } else if (selectedProfileId) {
      const savedClients = getSavedClients();
      const p = savedClients.find(c => c.id === selectedProfileId);
      if (p?.cerBase64) fd.append('cerBase64', p.cerBase64);
    }

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
  const [csfMode, setCsfMode] = useState<'scraper' | 'fiel'>('scraper');
  const [csfScraperInput, setCsfScraperInput] = useState('');
  const [isConsultingScraperCsf, setIsConsultingScraperCsf] = useState(false);
  const [csfScraperData, setCsfScraperData] = useState<any>(null);
  const [isConsultingCsf, setIsConsultingCsf] = useState(false);
  const [csfPdfBlobUrl, setCsfPdfBlobUrl] = useState<string | null>(null);
  const [csfDataResult, setCsfDataResult] = useState<any>(null);
  const [selectedCsfClientRfc, setSelectedCsfClientRfc] = useState<string>('');

  const handleDownloadDirectCsfPdf = async (targetClientRfc?: string) => {
    setErrorMessage('');
    setSuccessMessage('');
    const clientsList = getSavedClients();
    const rfcToUse = targetClientRfc || selectedCsfClientRfc || fiel.rfc;
    const matchedClient = clientsList.find(c => c.rfc.toUpperCase() === rfcToUse.toUpperCase());
    
    const clientToUse = matchedClient || {
      rfc: fiel.rfc || 'ISM980121V98',
      name: fiel.razonSocial || 'CONTRIBUYENTE ANCOFI SAT',
      regimen: fiel.regimen || 'personas_morales',
      email: fiel.email || 'contacto@sat.gob.mx'
    };

    await downloadClientCsfFileOrGeneratedPdf(clientToUse);
    setSuccessMessage(`¡Constancia de Situación Fiscal (CSF) descargada para ${clientToUse.name} (${clientToUse.rfc})!`);
  };

  /**
   * Obtiene la Constancia de Situación Fiscal (CSF) del usuario vía csf-sat-scraper,
   * procesa el binario / datos recibidos y genera un archivo PDF descargable en el navegador.
   */
  const handleObtenerYDescargarCsfConScraper = async (customInput?: string) => {
    setErrorMessage('');
    setSuccessMessage('');

    const targetInput = customInput || csfScraperInput || fiel.rfc;
    if (!targetInput || !targetInput.trim()) {
      setErrorMessage('Por favor ingrese la URL de la Cédula de Identificación Fiscal, el enlace QR del SAT o idCIF_RFC.');
      return;
    }

    setIsConsultingScraperCsf(true);
    try {
      const res = await fetchWithRetry('/api/sat/csf-scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: targetInput.trim(),
          rfc: fiel.rfc || undefined,
          asBinary: true
        })
      });

      const contentType = res.headers.get('content-type') || '';
      let pdfBlob: Blob;
      let csfObj: any = null;

      if (contentType.includes('application/pdf')) {
        // Binario PDF recibido directamente del scraper
        const arrayBuffer = await res.arrayBuffer();
        pdfBlob = new Blob([arrayBuffer], { type: 'application/pdf' });
      } else {
        // Respuesta JSON parseada con los datos fiscales escaneados
        const data = await parseResponseJson(res);
        if (!data.csf && !data.rfc) {
          throw new Error(data.error || 'No se pudo obtener la Constancia de Situación Fiscal.');
        }

        csfObj = data.csf || data;
        setCsfScraperData(csfObj);

        // Guardar datos escaneados en perfil si está en el catálogo
        try {
          const savedClients = getSavedClients();
          const existingIndex = savedClients.findIndex(c => c.rfc.toUpperCase() === (csfObj.rfc || '').toUpperCase());
          if (existingIndex >= 0) {
            savedClients[existingIndex].csfData = csfObj;
            if (csfObj.domicilio) savedClients[existingIndex].domicilio = csfObj.domicilio;
            if (csfObj.curp) savedClients[existingIndex].curp = csfObj.curp;
            saveClients(savedClients);
          }
        } catch (saveErr) {
          console.error('Error al guardar datos de CSF en perfil de cliente:', saveErr);
        }

        if (data.pdfBase64) {
          const b64 = data.pdfBase64.replace(/^data:application\/pdf;base64,/, '');
          const binaryString = atob(b64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          pdfBlob = new Blob([bytes], { type: 'application/pdf' });
        } else {
          // Procesar el binario / datos para generar el Blob PDF descargable
          pdfBlob = await generateCsfPdfBlob(csfObj);
        }
      }

      // Procesar binario y generar enlace de descarga directa en el navegador
      const blobUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = blobUrl;
      const cleanRfc = (csfObj?.rfc || fiel.rfc || 'SAT').toUpperCase().trim();
      link.download = `Constancia_Situacion_Fiscal_${cleanRfc}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      setSuccessMessage(`¡Constancia de Situación Fiscal (CSF) procesada con csf-sat-scraper y descargada en PDF exitosamente!`);
    } catch (err: any) {
      console.error('Error en handleObtenerYDescargarCsfConScraper:', err);
      setErrorMessage(formatFetchError(err));
    } finally {
      setIsConsultingScraperCsf(false);
    }
  };

  const handleScrapeCsf = async (customInput?: string) => {
    setErrorMessage('');
    setSuccessMessage('');

    const targetInput = customInput || csfScraperInput || fiel.rfc;
    if (!targetInput || !targetInput.trim()) {
      setErrorMessage('Por favor ingrese la URL de la Cédula de Identificación Fiscal, el enlace QR del SAT o idCIF_RFC.');
      return;
    }

    setIsConsultingScraperCsf(true);
    try {
      const res = await fetchWithRetry('/api/sat/csf-scraper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: targetInput.trim(), rfc: fiel.rfc || undefined })
      });

      const data = await parseResponseJson(res);
      if (data.csf) {
        setCsfScraperData(data.csf);
        setSuccessMessage(`¡Constancia de Situación Fiscal (CSF) obtenida vía Scraper SAT para ${data.csf.nombreCompleto} (${data.csf.rfc})!`);
        
        // Save real extracted CSF data into saved client profile if present
        try {
          const savedClients = getSavedClients();
          const existingIndex = savedClients.findIndex(c => c.rfc.toUpperCase() === data.csf.rfc.toUpperCase());
          if (existingIndex >= 0) {
            savedClients[existingIndex].csfData = data.csf;
            if (data.csf.domicilio) savedClients[existingIndex].domicilio = data.csf.domicilio;
            if (data.csf.curp) savedClients[existingIndex].curp = data.csf.curp;
            saveClients(savedClients);
          }
        } catch (saveErr) {
          console.error('Error saving CSF data into client profile:', saveErr);
        }
      } else {
        setCsfScraperData(data);
        setSuccessMessage('¡Constancia obtenida exitosamente!');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(formatFetchError(err));
    } finally {
      setIsConsultingScraperCsf(false);
    }
  };

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
      const res = await fetchWithRetry('/api/sat/csffiel', {
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
      const res = await fetchWithRetry('/api/sat/ocfiel', {
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
    tipoComprobante: 'ALL' as 'ALL' | 'I' | 'E' | 'P' | 'N' | 'T',
    rfcFiltro: '',
    descargaComprobantes: true,
    descargaPdfs: false
  });

  const [isConsultingFacturas, setIsConsultingFacturas] = useState(false);
  const [facturasResult, setFacturasResult] = useState<any>(null);
  const [searchFacturaText, setSearchFacturaText] = useState('');
  const [autoPollActive, setAutoPollActive] = useState(false);
  const [syncMetrics, setSyncMetrics] = useState<SatSyncMetrics>({
    active: false,
    idSolicitud: '',
    estado: 'En Proceso',
    elapsedSeconds: 0,
    nextPollCountdown: 2,
    currentIntervalSeconds: 2,
    pollAttempts: 0,
    packagesFound: 0,
    xmlsDownloaded: 0,
    downloadSpeed: 0,
    lastPollTime: '',
    message: ''
  });
  const isPollingInFlightRef = useRef(false);

  // References for request cancellation and worker cleanup
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const activeSearchIdRef = useRef<number>(0);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const cancelAndCleanupPreviousQuery = () => {
    // 1. Cancel previous HTTP requests
    if (activeAbortControllerRef.current) {
      try {
        activeAbortControllerRef.current.abort();
      } catch {
        // ignore
      }
      activeAbortControllerRef.current = null;
    }

    // 2. Increment search ID to invalidate any background async loops
    activeSearchIdRef.current++;

    // 3. Clear pending poll timers
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }

    // 4. Reset poll flags and metrics
    isPollingInFlightRef.current = false;
    setAutoPollActive(false);
    setSyncMetrics(prev => ({
      ...prev,
      active: false,
      message: 'Consulta previa cancelada.'
    }));

    // 5. Clear batch progress state
    setBatchSyncInfo(null);
  };

  // Unmount cleanup
  useEffect(() => {
    return () => {
      cancelAndCleanupPreviousQuery();
    };
  }, []);

  const startSyncMetrics = (idSolicitud: string, initialStatus = 'En Proceso') => {
    setSyncMetrics({
      active: true,
      idSolicitud,
      estado: initialStatus,
      elapsedSeconds: 0,
      nextPollCountdown: 2,
      currentIntervalSeconds: 2,
      pollAttempts: 1,
      packagesFound: 0,
      xmlsDownloaded: 0,
      downloadSpeed: 0,
      lastPollTime: new Date().toLocaleTimeString('es-MX'),
      message: 'Iniciando sincronización adaptativa en tiempo real con los servidores del SAT...'
    });
    setAutoPollActive(true);
  };

  const stopSyncPolling = () => {
    setSyncMetrics(prev => ({
      ...prev,
      active: false,
      message: 'Sincronización pausada por el usuario.'
    }));
    setAutoPollActive(false);
  };
  const [selectedXmlModal, setSelectedXmlModal] = useState<{ fileName: string; content: string } | null>(null);
  const [batchSyncInfo, setBatchSyncInfo] = useState<{
    active: boolean;
    currentLabel: string;
    completedMonths: number;
    totalMonths: number;
    accumulatedCount: number;
  } | null>(null);

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

      const res = await fetchWithRetry('/api/sat/facfiel', {
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

  function splitDateRangeIntoIntervals(
    startDateStr: string,
    endDateStr: string
  ): { start: string; end: string; label: string }[] {
    let s = startDateStr;
    let e = endDateStr;

    if (s > e) {
      s = endDateStr;
      e = startDateStr;
    }

    const [sY, sM, sD] = s.split('-').map(Number);
    const [eY, eM, eD] = e.split('-').map(Number);

    if (!sY || !sM || !sD || !eY || !eM || !eD) {
      return [{ start: s, end: e, label: `${s} a ${e}` }];
    }

    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const pad = (n: number) => String(n).padStart(2, '0');

    const intervals: { start: string; end: string; label: string }[] = [];

    let currY = sY;
    let currM = sM;

    while (currY < eY || (currY === eY && currM <= eM)) {
      const maxDaysInMonth = new Date(currY, currM, 0).getDate();

      // Half 1: Day 1 to 15
      const q1StartDay = (currY === sY && currM === sM) ? sD : 1;
      const q1EndDay = (currY === eY && currM === eM) ? Math.min(eD, 15) : 15;

      if (q1StartDay <= q1EndDay && q1StartDay <= 15) {
        const startStr = `${currY}-${pad(currM)}-${pad(q1StartDay)}`;
        const endStr = `${currY}-${pad(currM)}-${pad(q1EndDay)}`;
        intervals.push({
          start: startStr,
          end: endStr,
          label: `${monthNames[currM - 1]} 1a Quincena ${currY} (${pad(q1StartDay)} al ${pad(q1EndDay)})`
        });
      }

      // Half 2: Day 16 to end of month
      const q2StartDay = (currY === sY && currM === sM) ? Math.max(sD, 16) : 16;
      const q2EndDay = (currY === eY && currM === eM) ? Math.min(eD, maxDaysInMonth) : maxDaysInMonth;

      if (q2StartDay <= q2EndDay && q2StartDay <= maxDaysInMonth) {
        const startStr = `${currY}-${pad(currM)}-${pad(q2StartDay)}`;
        const endStr = `${currY}-${pad(currM)}-${pad(q2EndDay)}`;
        intervals.push({
          start: startStr,
          end: endStr,
          label: `${monthNames[currM - 1]} 2a Quincena ${currY} (${pad(q2StartDay)} al ${pad(q2EndDay)})`
        });
      }

      currM++;
      if (currM > 12) {
        currM = 1;
        currY++;
      }
    }

    return intervals.length > 0 ? intervals : [{ start: s, end: e, label: `${s} a ${e}` }];
  }

  const handleConsultarFacturas = async () => {
    // 1. Fully cancel and clean up any active search or polling loop
    cancelAndCleanupPreviousQuery();

    // 2. Initialize new AbortController and Search ID
    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;
    const signal = abortController.signal;
    const searchId = activeSearchIdRef.current;

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

    // Auto-correct inverted dates if user accidentally selected end date before start date
    let fStart = facturaFilters.fecha_inicial;
    let fEnd = facturaFilters.fecha_final;
    if (fStart > fEnd) {
      const tmp = fStart;
      fStart = fEnd;
      fEnd = tmp;
      setFacturaFilters({ ...facturaFilters, fecha_inicial: fStart, fecha_final: fEnd });
    }

    setIsConsultingFacturas(true);
    setFacturasResult(null);

    const startD = new Date(fStart);
    const endD = new Date(fEnd);
    const dayDiff = Math.round((endD.getTime() - startD.getTime()) / (1000 * 3600 * 24));

    // For any range > 15 days, automatically split period into intervals to strictly respect SAT 2,000 CFDI limits
    const shouldSplit = dayDiff > 15;

    if (shouldSplit) {
      const intervals = splitDateRangeIntoIntervals(fStart, fEnd);
      let allFacturas: any[] = [];
      let allXmls: any[] = [];
      const seenUuids = new Set<string>();
      const seenXmlFiles = new Set<string>();
      let lastSolicitudId = '';

      if (searchId !== activeSearchIdRef.current || signal.aborted) return;

      setBatchSyncInfo({
        active: true,
        currentLabel: intervals[0]?.label || '',
        completedMonths: 0,
        totalMonths: intervals.length,
        accumulatedCount: 0
      });

      try {
        const CONCURRENCY = 1; // Controlled sequential execution to avoid SAT 5005 collisions
        let completedCount = 0;

        const fetchPeriod = async (period: { start: string; end: string; label: string }) => {
          if (searchId !== activeSearchIdRef.current || signal.aborted) {
            throw new DOMException('The user aborted a request.', 'AbortError');
          }

          const fd = getFormDataWithFiles();
          fd.append('fecha_inicial', `${period.start}T00:00:00`);
          fd.append('fecha_final', `${period.end}T23:59:59`);
          fd.append('tipo', facturaFilters.tipo);
          fd.append('tipoBusqueda', facturaFilters.tipoBusqueda);
          fd.append('estatusFactura', facturaFilters.estatusFactura);
          fd.append('descargaComprobantes', String(facturaFilters.descargaComprobantes));
          fd.append('descargaPdfs', String(facturaFilters.descargaPdfs));

          const res = await fetchWithRetry('/api/sat/facfiel', {
            method: 'POST',
            body: fd,
            signal
          });

          if (searchId !== activeSearchIdRef.current || signal.aborted) {
            throw new DOMException('The user aborted a request.', 'AbortError');
          }

          let currentData = await parseResponseJson(res);

          // Poll up to 25 attempts (~50s) per interval until SAT finishes or downloads packages
          let pollAttempts = 0;
          while (
            (!currentData.facturas || currentData.facturas.length === 0) &&
            currentData.idSolicitud &&
            (currentData.estadoSolicitud === 'En Proceso' || currentData.estadoSolicitud === 'Aceptada') &&
            pollAttempts < 25
          ) {
            if (searchId !== activeSearchIdRef.current || signal.aborted) {
              throw new DOMException('The user aborted a request.', 'AbortError');
            }

            pollAttempts++;
            await new Promise(r => setTimeout(r, 2000));

            if (searchId !== activeSearchIdRef.current || signal.aborted) {
              throw new DOMException('The user aborted a request.', 'AbortError');
            }

            const pollFd = getFormDataWithFiles();
            pollFd.append('requestId', currentData.idSolicitud);
            pollFd.append('fecha_inicial', `${period.start}T00:00:00`);
            pollFd.append('fecha_final', `${period.end}T23:59:59`);
            pollFd.append('tipo', facturaFilters.tipo);
            pollFd.append('tipoBusqueda', facturaFilters.tipoBusqueda);
            pollFd.append('estatusFactura', facturaFilters.estatusFactura);

            try {
              const pollRes = await fetchWithRetry('/api/sat/facfiel', { method: 'POST', body: pollFd, signal });
              if (searchId !== activeSearchIdRef.current || signal.aborted) break;
              const pollData = await parseResponseJson(pollRes);
              if (pollData) {
                currentData = pollData;
                if (currentData.facturas && currentData.facturas.length > 0) {
                  break;
                }
                if (currentData.estadoSolicitud === 'Terminada' || currentData.estadoSolicitud === 'Rechazada' || currentData.estadoSolicitud === 'Error') {
                  break;
                }
              }
            } catch (err: any) {
              if (err?.name === 'AbortError' || signal.aborted) throw err;
              console.warn(`[SAT Poll Error] Intento ${pollAttempts} fallido para periodo ${period.label}:`, err);
            }
          }

          return currentData;
        };

        for (let i = 0; i < intervals.length; i += CONCURRENCY) {
          if (searchId !== activeSearchIdRef.current || signal.aborted) break;

          const chunk = intervals.slice(i, i + CONCURRENCY);
          const currentLabels = chunk.map(p => p.label).join(', ');

          setBatchSyncInfo({
            active: true,
            currentLabel: currentLabels,
            completedMonths: completedCount,
            totalMonths: intervals.length,
            accumulatedCount: allFacturas.length
          });

          const results = await Promise.all(
            chunk.map(p => fetchPeriod(p).catch(err => {
              if (err?.name === 'AbortError' || signal.aborted) throw err;
              console.warn('Error en periodo:', p.label, err);
              return { error: formatFetchError(err) };
            }))
          );

          if (searchId !== activeSearchIdRef.current || signal.aborted) break;

          for (const data of results) {
            if (data?.error) {
              const errLower = String(data.error).toLowerCase();
              if (
                errLower.includes('contraseña') ||
                errLower.includes('fiel') ||
                errLower.includes('llave') ||
                errLower.includes('certificado') ||
                errLower.includes('private key') ||
                errLower.includes('incorrecta')
              ) {
                throw new Error(data.error);
              }
            }

            if (data?.idSolicitud) {
              lastSolicitudId = data.idSolicitud;
              registerSolicitudInHistory(data.idSolicitud, data.estadoSolicitud || 'Aceptada', data.facturas?.length);
            }

            // Deduplicate UUIDs
            if (data?.facturas && data.facturas.length > 0) {
              for (const item of data.facturas) {
                const uuid = (item.uuid || item.folio || '').toString().trim().toUpperCase();
                if (uuid && uuid.length >= 10) {
                  if (!seenUuids.has(uuid)) {
                    seenUuids.add(uuid);
                    allFacturas.push(item);
                  }
                } else {
                  allFacturas.push(item);
                }
              }
            }

            if (data?.xmlFiles && data.xmlFiles.length > 0) {
              for (const xmlFile of data.xmlFiles) {
                const key = xmlFile.fileName || xmlFile.content.substring(0, 100);
                if (!seenXmlFiles.has(key)) {
                  seenXmlFiles.add(key);
                  allXmls.push(xmlFile);
                }
              }
            }
          }

          completedCount += chunk.length;

          if (searchId !== activeSearchIdRef.current || signal.aborted) break;

          // Stream live results to UI table
          setFacturasResult({
            idSolicitud: lastSolicitudId || 'BATCH_ANUAL',
            estadoSolicitud: 'Terminada',
            facturas: [...allFacturas],
            comprobantes: [...allFacturas],
            xmlFiles: [...allXmls],
            mensaje: `Procesando periodo... (${completedCount}/${intervals.length} intervalos sincronizados - ${allFacturas.length} comprobantes únicos encontrados)`
          });

          setBatchSyncInfo({
            active: true,
            currentLabel: currentLabels,
            completedMonths: Math.min(completedCount, intervals.length),
            totalMonths: intervals.length,
            accumulatedCount: allFacturas.length
          });

          if (i + CONCURRENCY < intervals.length) {
            await new Promise(r => setTimeout(r, 400));
          }
        }

        if (searchId === activeSearchIdRef.current && !signal.aborted) {
          setFacturasResult({
            idSolicitud: lastSolicitudId || 'BATCH_ANUAL',
            estadoSolicitud: 'Terminada',
            facturas: allFacturas,
            comprobantes: allFacturas,
            xmlFiles: allXmls,
            mensaje: `Sincronización del periodo (${fStart} a ${fEnd}) completada. Se obtuvieron ${allFacturas.length} comprobantes en ${intervals.length} intervalos.`
          });

          setSuccessMessage(`¡Sincronización del periodo (${fStart} a ${fEnd}) completada con éxito! Se obtuvieron ${allFacturas.length} comprobantes fiscales sin duplicados.`);
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || signal.aborted) {
          console.log('[SatWebService] Búsqueda previa abortada por el usuario o por nueva consulta.');
          return;
        }
        console.error(err);
        if (searchId === activeSearchIdRef.current) {
          setErrorMessage(formatFetchError(err));
        }
      } finally {
        if (searchId === activeSearchIdRef.current) {
          setBatchSyncInfo(null);
          setIsConsultingFacturas(false);
        }
      }

      return;
    }

    // Standard single range query (<= 15 days)
    try {
      const fd = getFormDataWithFiles();
      fd.append('fecha_inicial', `${fStart}T00:00:00`);
      fd.append('fecha_final', `${fEnd}T23:59:59`);
      fd.append('tipo', facturaFilters.tipo);
      fd.append('tipoBusqueda', facturaFilters.tipoBusqueda);
      fd.append('estatusFactura', facturaFilters.estatusFactura);
      fd.append('descargaComprobantes', String(facturaFilters.descargaComprobantes));
      fd.append('descargaPdfs', String(facturaFilters.descargaPdfs));

      const res = await fetchWithRetry('/api/sat/facfiel', {
        method: 'POST',
        body: fd,
        signal
      });

      if (searchId !== activeSearchIdRef.current || signal.aborted) return;

      const data = await parseResponseJson(res);
      if (searchId !== activeSearchIdRef.current || signal.aborted) return;

      setFacturasResult(data);

      if (data.idSolicitud) {
        registerSolicitudInHistory(data.idSolicitud, data.estadoSolicitud || 'Aceptada', data.facturas?.length);
      }

      if (data.facturas && data.facturas.length > 0) {
        setSuccessMessage(`¡Consulta completada con éxito! Se obtuvieron ${data.facturas.length} comprobante(s) fiscal(es).`);
        setAutoPollActive(false);
      } else if (data.idSolicitud && (data.estadoSolicitud === 'En Proceso' || data.estadoSolicitud === 'Aceptada' || data.codEstatus === 5004 || data.codEstatus === 5000)) {
        startSyncMetrics(data.idSolicitud, data.estadoSolicitud || 'En Proceso');
        setSuccessMessage(`⚡ Solicitud procesándose en los servidores del SAT (ID: ${data.idSolicitud}). Sincronizando en tiempo real...`);
      } else {
        setAutoPollActive(false);
        setSuccessMessage('¡Consulta finalizada exitosamente!');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || signal.aborted) {
        console.log('[SatWebService] Búsqueda previa abortada por el usuario o por nueva consulta.');
        return;
      }
      console.error(err);
      if (searchId === activeSearchIdRef.current) {
        setErrorMessage(formatFetchError(err));
      }
    } finally {
      if (searchId === activeSearchIdRef.current) {
        setIsConsultingFacturas(false);
      }
    }
  };

  // 1-Second Clock Ticker Effect for Live Dashboard
  useEffect(() => {
    if (!syncMetrics.active) return;

    const ticker = setInterval(() => {
      setSyncMetrics(prev => {
        if (!prev.active) return prev;
        const nextElapsed = prev.elapsedSeconds + 1;
        const nextCountdown = prev.nextPollCountdown - 1;

        return {
          ...prev,
          elapsedSeconds: nextElapsed,
          nextPollCountdown: Math.max(0, nextCountdown)
        };
      });
    }, 1000);

    return () => clearInterval(ticker);
  }, [syncMetrics.active]);

  // Adaptive Polling Execution Effect
  useEffect(() => {
    if (!syncMetrics.active || syncMetrics.nextPollCountdown > 0) return;
    if (isPollingInFlightRef.current) return;

    const currentSearchId = activeSearchIdRef.current;
    const signal = activeAbortControllerRef.current?.signal;

    const executeAdaptivePoll = async () => {
      if (currentSearchId !== activeSearchIdRef.current || signal?.aborted) return;
      isPollingInFlightRef.current = true;
      const currentId = syncMetrics.idSolicitud;

      try {
        const fd = getFormDataWithFiles();
        fd.append('requestId', currentId);
        fd.append('fecha_inicial', `${facturaFilters.fecha_inicial}T00:00:00`);
        fd.append('fecha_final', `${facturaFilters.fecha_final}T23:59:59`);
        fd.append('tipo', facturaFilters.tipo);
        fd.append('tipoBusqueda', facturaFilters.tipoBusqueda);
        fd.append('estatusFactura', facturaFilters.estatusFactura);

        const pollStartTime = Date.now();
        const res = await fetchWithRetry('/api/sat/facfiel', { method: 'POST', body: fd, signal });
        if (currentSearchId !== activeSearchIdRef.current || signal?.aborted) return;

        const data = await parseResponseJson(res);
        if (currentSearchId !== activeSearchIdRef.current || signal?.aborted) return;

        const pollDurationSec = Math.max(1, (Date.now() - pollStartTime) / 1000);

        const xmlCount = data?.facturas?.length || 0;
        const pkgCount = data?.idsPaquetes?.length || (xmlCount > 0 ? 1 : 0);
        const speed = xmlCount > 0 ? Math.round(xmlCount / pollDurationSec) : 0;
        const estadoText = data?.estadoSolicitud || 'En Proceso';

        if (data && currentSearchId === activeSearchIdRef.current) {
          setFacturasResult(data);
        }

        if (xmlCount > 0 || estadoText === 'Terminada') {
          registerSolicitudInHistory(currentId, 'Terminada', xmlCount);
          setSyncMetrics(prev => ({
            ...prev,
            active: false,
            estado: 'Completada',
            pollAttempts: prev.pollAttempts + 1,
            packagesFound: pkgCount,
            xmlsDownloaded: xmlCount,
            downloadSpeed: speed,
            lastPollTime: new Date().toLocaleTimeString('es-MX'),
            message: `¡Sincronización completada! ${xmlCount} comprobante(s) procesado(s).`
          }));
          setSuccessMessage(`¡Completado! Se descargaron ${xmlCount} comprobante(s) fiscal(es) del SAT.`);
          setAutoPollActive(false);
        } else if (estadoText === 'Rechazada' || estadoText === 'Error' || estadoText === 'Vencida') {
          setSyncMetrics(prev => ({
            ...prev,
            active: false,
            estado: estadoText,
            message: data?.mensaje || `Solicitud ${estadoText} por el SAT.`
          }));
          setErrorMessage(data?.mensaje || `Solicitud ${estadoText} por el SAT.`);
          setAutoPollActive(false);
        } else {
          const elapsed = syncMetrics.elapsedSeconds;
          let baseInterval = 2;
          if (elapsed > 180) {
            baseInterval = 10;
          } else if (elapsed > 60) {
            baseInterval = 4 + Math.floor((elapsed - 60) / 30) * 2;
          }

          if (pkgCount > 0 || estadoText === 'Aceptada') {
            baseInterval = 2;
          }

          const jitter = Math.random() * 0.8;
          const nextInterval = Math.round((baseInterval + jitter) * 10) / 10;

          if (currentSearchId === activeSearchIdRef.current) {
            setSyncMetrics(prev => ({
              ...prev,
              estado: estadoText,
              pollAttempts: prev.pollAttempts + 1,
              packagesFound: pkgCount,
              nextPollCountdown: Math.round(nextInterval),
              currentIntervalSeconds: Math.round(nextInterval),
              lastPollTime: new Date().toLocaleTimeString('es-MX'),
              message: `Estatus SAT: ${estadoText}. Próxima verificación adaptativa en ${Math.round(nextInterval)}s...`
            }));
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || signal?.aborted) return;
        console.warn('[Adaptive Poll Warning]:', err);
        if (currentSearchId === activeSearchIdRef.current) {
          const elapsed = syncMetrics.elapsedSeconds;
          const retryInterval = elapsed > 60 ? 6 : 3;
          setSyncMetrics(prev => ({
            ...prev,
            nextPollCountdown: retryInterval,
            currentIntervalSeconds: retryInterval,
            message: 'Reintentando verificación adaptativa...'
          }));
        }
      } finally {
        isPollingInFlightRef.current = false;
      }
    };

    executeAdaptivePoll();
  }, [syncMetrics.nextPollCountdown, syncMetrics.active]);

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

      const res = await fetchWithRetry('/api/sat/solicita', {
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

      const res = await fetchWithRetry('/api/sat/verifica', {
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

      const res = await fetchWithRetry('/api/sat/descarga', {
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

      const res = await fetchWithRetry(`/api/sat/efos/${encodeURIComponent(efosRfcInput.trim().toUpperCase())}`, {
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
      const res = await fetchWithRetry('/api/sat/informacionfiscalfiel', {
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

      {/* LIVE ADAPTIVE SAT SYNCHRONIZATION DASHBOARD PANEL */}
      {(syncMetrics.active || syncMetrics.elapsedSeconds > 0) && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-800/80 rounded-2xl p-5 shadow-xl text-white space-y-4 animate-fadeIn">
          {/* Header & Status Badge */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-800/50 pb-3">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl border ${syncMetrics.active ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 animate-pulse' : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'}`}>
                <RefreshCw className={`w-5 h-5 ${syncMetrics.active ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Sincronización Inteligente SAT
                  </h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${
                    syncMetrics.estado === 'Completada' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                    syncMetrics.estado === 'Rechazada' || syncMetrics.estado === 'Error' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
                    'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}>
                    {syncMetrics.estado}
                  </span>
                </div>
                <p className="text-xs text-indigo-200 mt-0.5">
                  ID Solicitud SAT: <span className="font-mono font-bold text-amber-300">{syncMetrics.idSolicitud || '---'}</span>
                </p>
              </div>
            </div>

            {syncMetrics.active && (
              <button
                type="button"
                onClick={stopSyncPolling}
                className="px-3.5 py-1.5 rounded-xl bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/40 text-rose-200 font-bold text-xs transition-all inline-flex items-center gap-1.5 self-start sm:self-center"
              >
                <Square className="w-3.5 h-3.5" /> Detener Sincronización
              </button>
            )}
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {/* 1. Tiempo Transcurrido */}
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
                <Clock className="w-3.5 h-3.5 text-indigo-400" /> Tiempo Transcurrido
              </div>
              <p className="text-lg font-mono font-black text-amber-400">
                {Math.floor(syncMetrics.elapsedSeconds / 60).toString().padStart(2, '0')}:
                {(syncMetrics.elapsedSeconds % 60).toString().padStart(2, '0')}
              </p>
            </div>

            {/* 2. Próxima Consulta */}
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
                <Timer className="w-3.5 h-3.5 text-amber-400" /> Próxima Consulta
              </div>
              <p className="text-lg font-mono font-black text-emerald-400">
                {syncMetrics.active ? (
                  syncMetrics.nextPollCountdown > 0 ? `${syncMetrics.nextPollCountdown}s` : 'Consultando...'
                ) : '---'}
              </p>
            </div>

            {/* 3. Consultas Realizadas */}
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
                <Activity className="w-3.5 h-3.5 text-cyan-400" /> Consultas
              </div>
              <p className="text-lg font-mono font-black text-white">
                {syncMetrics.pollAttempts}
              </p>
            </div>

            {/* 4. Paquetes Encontrados */}
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
                <Package className="w-3.5 h-3.5 text-purple-400" /> Paquetes SAT
              </div>
              <p className="text-lg font-mono font-black text-purple-300">
                {syncMetrics.packagesFound}
              </p>
            </div>

            {/* 5. XMLs Procesados */}
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
                <FileText className="w-3.5 h-3.5 text-emerald-400" /> XMLs Extraídos
              </div>
              <p className="text-lg font-mono font-black text-emerald-300">
                {syncMetrics.xmlsDownloaded}
              </p>
            </div>

            {/* 6. Velocidad */}
            <div className="bg-slate-800/80 border border-slate-700/60 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
                <Zap className="w-3.5 h-3.5 text-amber-400" /> Rendimiento
              </div>
              <p className="text-lg font-mono font-black text-cyan-300">
                {syncMetrics.downloadSpeed > 0 ? `${syncMetrics.downloadSpeed} XML/s` : '---'}
              </p>
            </div>
          </div>

          {/* Countdown Progress Bar */}
          {syncMetrics.active && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-indigo-300 font-medium">
                <span>{syncMetrics.message || 'Sincronizando con el servicio del SAT...'}</span>
                <span>{syncMetrics.lastPollTime ? `Última consulta: ${syncMetrics.lastPollTime}` : ''}</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-indigo-500 via-amber-400 to-emerald-400 h-full transition-all duration-1000 ease-linear rounded-full"
                  style={{
                    width: `${Math.max(0, Math.min(100, (1 - syncMetrics.nextPollCountdown / Math.max(1, syncMetrics.currentIntervalSeconds)) * 100))}%`
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* NAVIGATION TABS */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('portal')}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${
            activeTab === 'portal'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Search className="w-4 h-4 text-amber-300" />
          Módulo Portal SAT "Buscar CFDI"
        </button>

        <button
          onClick={() => setActiveTab('masiva')}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${
            activeTab === 'masiva'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-100'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Package className="w-4 h-4 text-cyan-300" />
          Módulo Descarga Masiva (ZIP)
        </button>

        <button
          onClick={() => setActiveTab('perfiles')}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${
            activeTab === 'perfiles'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Key className="w-4 h-4 text-amber-800" />
          Mis Clientes / Credenciales SAT
        </button>
      </div>

      {/* TAB CONTENT AREAS */}

      {/* MODULO 1: PORTAL SAT - BUSCAR CFDI (CONSULTA RAPIDA & TABLA) */}
      {activeTab === 'portal' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-4 gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Search className="w-5 h-5 text-indigo-600" />
                  Portal SAT - Consulta "Buscar CFDI" (Búsqueda Rápida)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Módulo independiente que emula la consulta directa en la sección "Buscar CFDI" del portal oficial del SAT. Obtenga la tabla de comprobantes con sus folios, montos, RFCs y descargue XMLs individuales al instante.
                </p>
              </div>
              <span className="px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold shrink-0">
                ⚡ Consulta Directa & Tabla Inmediata
              </span>
            </div>

            {/* Filter controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Tipo de Consulta</label>
                <select
                  value={facturaFilters.tipo}
                  onChange={(e) => setFacturaFilters({ ...facturaFilters, tipo: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-slate-50"
                >
                  <option value="recibidos">📥 Facturas Recibidas (Gastos/Compras)</option>
                  <option value="emitidos">📤 Facturas Emitidas (Ventas/Ingresos)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Fecha Inicial (Emisión)</label>
                <input
                  type="date"
                  value={facturaFilters.fecha_inicial}
                  onChange={(e) => setFacturaFilters({ ...facturaFilters, fecha_inicial: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-slate-50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Fecha Final (Emisión)</label>
                <input
                  type="date"
                  value={facturaFilters.fecha_final}
                  onChange={(e) => setFacturaFilters({ ...facturaFilters, fecha_final: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-slate-50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Tipo de Comprobante</label>
                <select
                  value={facturaFilters.tipoComprobante}
                  onChange={(e) => setFacturaFilters({ ...facturaFilters, tipoComprobante: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-slate-50"
                >
                  <option value="ALL">Todos los Tipos (I, E, P, N, T)</option>
                  <option value="I">🟢 I - Ingreso (Factura de Venta)</option>
                  <option value="E">🟠 E - Egreso (Nota de Crédito / Devolución)</option>
                  <option value="P">🟣 P - Pago (Complemento de Recepción de Pagos)</option>
                  <option value="N">🔵 N - Nómina (Recibo de Sueldo/Salario)</option>
                  <option value="T">⚪ T - Traslado (Carta Cobre / Mercancías)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Estatus del CFDI en el SAT</label>
                <select
                  value={facturaFilters.estatusFactura}
                  onChange={(e) => setFacturaFilters({ ...facturaFilters, estatusFactura: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-slate-50"
                >
                  <option value="-1">Todos los Estatus (Vigentes y Cancelados)</option>
                  <option value="1">Vigentes únicamente</option>
                  <option value="0">Cancelados únicamente</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Filtro por RFC Específico (Opcional)</label>
                <input
                  type="text"
                  placeholder="Ej. AAA010101AAA"
                  value={facturaFilters.rfcFiltro}
                  onChange={(e) => setFacturaFilters({ ...facturaFilters, rfcFiltro: e.target.value.toUpperCase() })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono uppercase bg-slate-50"
                />
              </div>
            </div>

            {/* Quick Range Presets */}
            <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
              <span className="text-xs font-bold text-slate-500 mr-1">Rangos rápidos:</span>
              <button
                type="button"
                onClick={() => setFacturaFilters({ ...facturaFilters, fecha_inicial: '2024-01-01', fecha_final: '2024-12-31' })}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                  facturaFilters.fecha_inicial === '2024-01-01' && facturaFilters.fecha_final === '2024-12-31'
                    ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                }`}
              >
                📅 Año 2024
              </button>
              <button
                type="button"
                onClick={() => setFacturaFilters({ ...facturaFilters, fecha_inicial: '2025-01-01', fecha_final: '2025-12-31' })}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                  facturaFilters.fecha_inicial === '2025-01-01' && facturaFilters.fecha_final === '2025-12-31'
                    ? 'bg-indigo-100 text-indigo-700 border-indigo-300'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                }`}
              >
                📅 Año 2025
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                  const today = now.toISOString().split('T')[0];
                  setFacturaFilters({ ...facturaFilters, fecha_inicial: firstDay, fecha_final: today });
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-all"
              >
                📅 Mes Actual
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-6">
                <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={facturaFilters.descargaComprobantes}
                    onChange={(e) => setFacturaFilters({ ...facturaFilters, descargaComprobantes: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  Obtener archivos XML individuales de comprobantes
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
                    Buscando CFDI en SAT...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Buscar CFDI (Portal SAT)
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Immediate Results Table */}
          {facturasResult && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
              {/* CASE 1: Facturas recovered (length > 0) */}
              {facturasResult.facturas && facturasResult.facturas.length > 0 ? (
                <div className="space-y-6">
                  {/* Header Stats & Export */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-indigo-50/60 border border-indigo-100">
                    <div>
                      <div className="flex items-center gap-2 text-indigo-950 font-bold text-base">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <span>Tabla de Resultados: {facturasResult.facturas.length} Comprobante(s) Encontrado(s)</span>
                      </div>
                      <p className="text-xs text-indigo-700/80 mt-0.5">
                        Folio Consulta SAT: <code className="font-mono bg-white/80 px-1.5 py-0.5 rounded text-[11px]">{facturasResult.idSolicitud || 'PORTAL-SAT-DIRECT'}</code>
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

                  {/* Search box for table */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Comprobantes Fiscales Digitales (CFDI 4.0 / 3.3)
                    </p>
                    <input
                      type="text"
                      placeholder="Filtrar por UUID, RFC, Razón Social..."
                      value={searchFacturaText}
                      onChange={(e) => setSearchFacturaText(e.target.value)}
                      className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs w-full max-w-xs focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {/* Facturas Interactive Table */}
                  <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase text-[10px] tracking-wider">
                          <th className="p-3">Folio Fiscal (UUID)</th>
                          <th className="p-3">RFC Emisor / Razón Social</th>
                          <th className="p-3">RFC Receptor / Razón Social</th>
                          <th className="p-3">Fecha Emisión</th>
                          <th className="p-3">Tipo</th>
                          <th className="p-3">Estado</th>
                          <th className="p-3 text-right">Total ($)</th>
                          <th className="p-3 text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                        {facturasResult.facturas
                          .filter((f: any) => {
                            if (facturaFilters.tipoComprobante !== 'ALL') {
                              const ef = (f.efectoDelComprobante || f.tipoDeComprobante || f.tipo || '').toUpperCase();
                              if (!ef.startsWith(facturaFilters.tipoComprobante)) return false;
                            }
                            if (facturaFilters.rfcFiltro.trim()) {
                              const qRfc = facturaFilters.rfcFiltro.trim().toLowerCase();
                              const em = (f.rfcEmisor || f.rfCemisor || '').toLowerCase();
                              const rec = (f.rfcReceptor || '').toLowerCase();
                              if (!em.includes(qRfc) && !rec.includes(qRfc)) return false;
                            }
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
                          .map((f: any, idx: number) => {
                            const tipoCode = (f.efectoDelComprobante || f.tipoDeComprobante || 'I').substring(0, 1).toUpperCase();
                            const isCancelado = f.estatus === '0' || f.estadoComprobante === 'Cancelado' || f.isCancelada;

                            return (
                              <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                                <td className="p-3 font-mono text-[11px] text-slate-900 font-semibold max-w-[170px] truncate" title={f.uuid}>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigator.clipboard.writeText(f.uuid || '');
                                        setSuccessMessage(`UUID copiado al portapapeles: ${f.uuid}`);
                                      }}
                                      className="text-slate-400 hover:text-slate-700"
                                      title="Copiar UUID"
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                    <span className="truncate">{f.uuid || 'S/N'}</span>
                                  </div>
                                </td>

                                <td className="p-3 max-w-[170px] truncate">
                                  <div className="font-bold text-slate-900 text-[11px] font-mono">{f.rfcEmisor || f.rfCemisor || 'N/A'}</div>
                                  <div className="text-[10px] text-slate-500 truncate" title={f.nombreEmisor || f.razonSocialEmisor}>{f.nombreEmisor || f.razonSocialEmisor || 'N/A'}</div>
                                </td>

                                <td className="p-3 max-w-[170px] truncate">
                                  <div className="font-bold text-slate-900 text-[11px] font-mono">{f.rfcReceptor || 'N/A'}</div>
                                  <div className="text-[10px] text-slate-500 truncate" title={f.nombreReceptor || f.razonSocialReceptor}>{f.nombreReceptor || f.razonSocialReceptor || 'N/A'}</div>
                                </td>

                                <td className="p-3 whitespace-nowrap text-slate-600 font-mono text-[11px]">{f.fechaEmision || f.fecha || 'N/A'}</td>

                                <td className="p-3 whitespace-nowrap">
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                                    tipoCode === 'I' ? 'bg-emerald-100 text-emerald-800' :
                                    tipoCode === 'E' ? 'bg-amber-100 text-amber-800' :
                                    tipoCode === 'P' ? 'bg-purple-100 text-purple-800' :
                                    tipoCode === 'N' ? 'bg-blue-100 text-blue-800' :
                                    'bg-slate-100 text-slate-800'
                                  }`}>
                                    {tipoCode === 'I' ? 'Ingreso' : tipoCode === 'E' ? 'Egreso' : tipoCode === 'P' ? 'Pago' : tipoCode === 'N' ? 'Nómina' : 'Traslado'}
                                  </span>
                                </td>

                                <td className="p-3 whitespace-nowrap">
                                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                                    isCancelado ? 'bg-rose-100 text-rose-800' : 'bg-emerald-50 text-emerald-700'
                                  }`}>
                                    {isCancelado ? 'Cancelado' : 'Vigente'}
                                  </span>
                                </td>

                                <td className="p-3 text-right font-mono font-bold text-slate-900 text-xs whitespace-nowrap">
                                  {typeof f.totalNum === 'number' && !isNaN(f.totalNum)
                                    ? `$${f.totalNum.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                    : typeof f.total === 'number'
                                      ? `$${f.total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                      : (f.total || '$0.00')}
                                </td>

                                <td className="p-3 text-center whitespace-nowrap">
                                  <div className="flex items-center justify-center gap-1.5">
                                    {f.rawXml ? (
                                      <>
                                        <button
                                          onClick={() => downloadTextFile(f.rawXml, f.fileName || `${f.uuid || 'Factura'}.xml`)}
                                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] inline-flex items-center gap-1 shadow-2xs transition-all"
                                          title="Descargar XML Individual"
                                        >
                                          <Download className="w-3.5 h-3.5" /> Descargar XML
                                        </button>
                                        <button
                                          onClick={() => setSelectedXmlModal({ fileName: f.fileName || `${f.uuid}.xml`, content: f.rawXml })}
                                          className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[11px] inline-flex items-center gap-1"
                                          title="Ver Representación PDF / Vista Previa"
                                        >
                                          <FileText className="w-3.5 h-3.5" />
                                        </button>
                                      </>
                                    ) : (
                                      <span className="text-[10px] text-slate-400 italic">Metadata (Sin XML)</span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (facturasResult.estadoSolicitud === 'Rechazada' || facturasResult.estadoSolicitud === 'Error' || facturasResult.estadoSolicitud === 'Vencida') ? (
                <div className="space-y-4">
                  <div className="p-5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 space-y-2">
                    <h4 className="font-bold text-sm">Error en Consulta Portal SAT</h4>
                    <p className="text-xs">{facturasResult.mensaje || 'Error al conectar con los servidores del SAT.'}</p>
                  </div>
                </div>
              ) : (
                <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-2">
                  <p className="text-sm font-bold text-slate-800">No se encontraron comprobantes para el periodo y filtros seleccionados.</p>
                  <p className="text-xs text-slate-500">Pruebe ampliando el rango de fechas o cambiando el tipo de consulta (Emitidas / Recibidas).</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODULO 2: DESCARGA MASIVA (SERVICIO WEB SOAP SAT) */}
      {activeTab === 'masiva' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-4 gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Package className="w-5 h-5 text-indigo-600" />
                  Servicio Web SAT - Descarga Masiva en Lote (SOAP)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Módulo de alto volumen para generar solicitudes asíncronas de paquetes comprimidos (.ZIP) mediante los WSDL SOAP oficiales del SAT (<code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-indigo-700">SolicitaDescarga.svc</code>). Ideal para descargas históricas y auditorías contables.
                </p>
              </div>
              <span className="px-3 py-1.5 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-xl text-xs font-bold shrink-0">
                📦 Paquetes Masivos comprimidos (.ZIP)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Tipo de Comprobantes</label>
                <select
                  value={wsFilters.tipo}
                  onChange={(e) => setWsFilters({ ...wsFilters, tipo: e.target.value as any })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-slate-50"
                >
                  <option value="recibidos">📥 Recibidos (Gastos/Compras)</option>
                  <option value="emitidos">📤 Emitidos (Ventas/Ingresos)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Tipo de Búsqueda SOAP</label>
                <select
                  value={wsFilters.tipoBusqueda}
                  onChange={(e) => setWsFilters({ ...wsFilters, tipoBusqueda: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-slate-50"
                >
                  <option value="1">CFDI Completos (.XML)</option>
                  <option value="2">Resumen Metadatos (.TXT)</option>
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
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={handleSolicitarWs}
                disabled={isSolicitansoWs}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md transition-all disabled:opacity-50"
              >
                {isSolicitansoWs ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Enviando Solicitud SOAP al SAT...
                  </>
                ) : (
                  <>
                    <Package className="w-4 h-4" />
                    Solicitar Paquete Masivo al SAT
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Historial de solicitudes masivas */}
          {solicitaHistory.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <h4 className="text-sm font-extrabold text-slate-900">Historial de Solicitudes Masivas WSDL SOAP</h4>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 font-bold uppercase text-[10px] text-slate-700">
                      <th className="p-3">ID Solicitud SAT</th>
                      <th className="p-3">Fecha Solicitud</th>
                      <th className="p-3">Tipo</th>
                      <th className="p-3">Rango Fechas</th>
                      <th className="p-3">Estatus</th>
                      <th className="p-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                    {solicitaHistory.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-bold text-indigo-700">{item.idSolicitud}</td>
                        <td className="p-3">{item.fechaSolicitud}</td>
                        <td className="p-3 capitalize">{item.tipo}</td>
                        <td className="p-3">{item.rangoFechas}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            item.estado === 'Terminada' ? 'bg-emerald-100 text-emerald-800' :
                            item.estado === 'Rechazada' ? 'bg-rose-100 text-rose-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {item.estado}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleVerificarWs(item.idSolicitud)}
                              disabled={isVerificandoId === item.idSolicitud}
                              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] inline-flex items-center gap-1 shadow-2xs"
                            >
                              <RefreshCw className={`w-3 h-3 ${isVerificandoId === item.idSolicitud ? 'animate-spin' : ''}`} />
                              Verificar Estatus
                            </button>

                            {item.paquetes && item.paquetes.length > 0 && (
                              item.paquetes.map((pkgId, pIdx) => (
                                <button
                                  key={pIdx}
                                  onClick={() => handleDescargarPaqueteWs(pkgId)}
                                  disabled={isDescargandoPkg === pkgId}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] inline-flex items-center gap-1 shadow-2xs"
                                >
                                  <Download className="w-3 h-3" /> Descargar Paquete {pIdx + 1}
                                </button>
                              ))
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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

      {/* MODAL PARA VISUALIZAR PDF Y XML DE COMPROBANTE SAT */}
      {selectedXmlModal && (
        <CfdiPdfViewerModal
          xmlContent={selectedXmlModal.content}
          fileName={selectedXmlModal.fileName}
          onClose={() => setSelectedXmlModal(null)}
        />
      )}
    </div>
  );
}

export default SatWebService;
