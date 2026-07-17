import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Download, 
  Key, 
  Lock, 
  RefreshCw, 
  FileDown, 
  Search, 
  Briefcase, 
  ShieldAlert, 
  Sparkles,
  Eye,
  EyeOff,
  Upload,
  Calendar,
  Layers,
  ArrowRight
} from 'lucide-react';

interface ParsedCFDI {
  fileName: string;
  folio: string;
  serie: string;
  fecha: string;
  tipo: string;
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
  usoCfdi: string;
  usoCfdiDesc: string;
  formaPago: string;
  formaPagoDesc: string;
  impuestoExento: number;
  noObjetoImpuesto: number;
  tasa0Base: number;
  tasa16Base: number;
  iepsTotal: number;
  isNomina?: boolean;
}

interface SatWebServiceProps {
  onImportXMLs: (xmls: { text: string; fileName: string }[]) => void;
  setActiveTab: (tab: 'dashboard' | 'accounts' | 'bank-statements' | 'sat-ws') => void;
}

export const SatWebService: React.FC<SatWebServiceProps> = ({ onImportXMLs, setActiveTab }) => {
  const [rfc, setRfc] = useState(() => localStorage.getItem('sat_ws_rfc') || '');
  const [authMode, setAuthMode] = useState<'fiel' | 'ciec'>('fiel');
  
  // FIEL credentials
  const [contrasena, setContrasena] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [certFile, setCertFile] = useState<File | null>(null);

  // CIEC credentials
  const [ciec, setCiec] = useState('');
  const [showCiec, setShowCiec] = useState(false);

  // Consult parameters
  const [tipo, setTipo] = useState<'recibidos' | 'emitidos'>('recibidos');
  const [estatusFactura, setEstatusFactura] = useState<number>(-1); // -1 = Todos, 1 = Vigente, 0 = Cancelada
  const [tipoBusqueda, setTipoBusqueda] = useState<number>(1); // 1 = Fecha, 2 = Folio
  const [fechaInicial, setFechaInicial] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().substring(0, 16); // yyyy-mm-ddThh:mm
  });
  const [fechaFinal, setFechaFinal] = useState(() => {
    return new Date().toISOString().substring(0, 16);
  });
  const [descargaComprobantes, setDescargaComprobantes] = useState<boolean>(true);

  // UI state
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [facturas, setFacturas] = useState<any[]>([]);
  const [requestId, setRequestId] = useState<string>('');
  
  // PDF Base64 response for Op or CSF
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string>('');

  // Save basic configurations in localStorage
  useEffect(() => {
    localStorage.setItem('sat_ws_rfc', rfc);
  }, [rfc]);

  const handleConsultFacturas = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rfc.trim()) {
      setError('El RFC es obligatorio.');
      return;
    }

    setLoading(true);
    setLoadingStatus('Consultando facturas en el Web Service del SAT...');
    setError(null);
    setSuccessMessage(null);
    setFacturas([]);

    try {
      const queryParams = new URLSearchParams({
        tipoBusqueda: tipoBusqueda.toString(),
        estatusFactura: estatusFactura.toString(),
        fecha_inicial: fechaInicial.replace('T', ' ') + (fechaInicial.length === 16 ? ':00' : ''),
        fecha_final: fechaFinal.replace('T', ' ') + (fechaFinal.length === 16 ? ':00' : ''),
        tipo,
        descargaComprobantes: descargaComprobantes.toString().toUpperCase()
      });

      if (requestId.trim()) {
        queryParams.append('requestId', requestId.trim());
      }

      let res;
      if (authMode === 'fiel') {
        if (!contrasena) {
          throw new Error('La contraseña de la FIEL es requerida para este método.');
        }
        if (!keyFile || !certFile) {
          throw new Error('Los archivos .key y .cer de la FIEL son obligatorios.');
        }

        const formData = new FormData();
        formData.append('llavePrivada', keyFile);
        formData.append('Certificado', certFile);
        formData.append('Contrasena', contrasena);

        res = await fetch(`/api/sat-go/consultar-facfiel?${queryParams.toString()}`, {
          method: 'POST',
          headers: {
            'RFC': rfc.trim().toUpperCase()
          },
          body: formData
        });
      } else {
        if (!ciec) {
          throw new Error('La clave CIEC es obligatoria para este método.');
        }

        res = await fetch(`/api/sat-go/consultar-fac?${queryParams.toString()}`, {
          method: 'GET',
          headers: {
            'RFC': rfc.trim().toUpperCase(),
            'Secret': ciec
          }
        });
      }

      let data;
      try {
        data = await res.json();
      } catch (err) {
        throw new Error(`Error en el servidor de la aplicación (Código de Estado: ${res.status}).`);
      }

      if (!res.ok) {
        throw new Error(data.error || 'La consulta al Web Service del SAT falló.');
      }

      const comprobantes = data.comprobantes || [];
      setFacturas(comprobantes);
      if (data.requestId) {
        setRequestId(data.requestId);
      }

      setSuccessMessage(`Se encontraron ${comprobantes.length} facturas con éxito.`);
    } catch (err: any) {
      setError(err.message || 'Error inesperado al consultar facturas.');
    } finally {
      setLoading(false);
    }
  };

  const handleDescargarOpinion = async () => {
    if (!rfc.trim()) {
      setError('El RFC es obligatorio.');
      return;
    }

    setLoading(true);
    setLoadingStatus('Generando y descargando Opinión del Cumplimiento desde el SAT...');
    setError(null);
    setSuccessMessage(null);

    try {
      let res;
      if (authMode === 'fiel') {
        if (!contrasena) throw new Error('La contraseña de la FIEL es requerida.');
        if (!keyFile || !certFile) throw new Error('Los archivos .key y .cer de la FIEL son requeridos.');

        const formData = new FormData();
        formData.append('llavePrivada', keyFile);
        formData.append('Certificado', certFile);
        formData.append('Contrasena', contrasena);

        res = await fetch('/api/sat-go/consultar-ocfiel', {
          method: 'POST',
          headers: {
            'RFC': rfc.trim().toUpperCase()
          },
          body: formData
        });
      } else {
        if (!ciec) throw new Error('La clave CIEC es obligatoria.');

        res = await fetch('/api/sat-go/consultar-oc', {
          method: 'GET',
          headers: {
            'RFC': rfc.trim().toUpperCase(),
            'Secret': ciec
          }
        });
      }

      let data;
      try {
        data = await res.json();
      } catch (err) {
        throw new Error(`Error en el servidor de la aplicación (Código de Estado: ${res.status}).`);
      }

      if (!res.ok) {
        throw new Error(data.error || 'No se pudo obtener la opinión de cumplimiento.');
      }

      if (data.pdf_base64) {
        // Trigger download of PDF
        const byteCharacters = atob(data.pdf_base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `OpinionCumplimiento_${rfc.trim().toUpperCase()}_${new Date().toISOString().substring(0, 10)}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        setSuccessMessage('¡Opinión de Cumplimiento fiscal descargada en formato PDF de manera exitosa!');
      } else {
        throw new Error('No se recibieron los datos del archivo PDF.');
      }
    } catch (err: any) {
      setError(err.message || 'Error al descargar opinión del cumplimiento.');
    } finally {
      setLoading(false);
    }
  };

  const handleDescargarCsf = async () => {
    if (!rfc.trim()) {
      setError('El RFC es obligatorio.');
      return;
    }

    setLoading(true);
    setLoadingStatus('Generando y descargando Constancia de Situación Fiscal (CSF)...');
    setError(null);
    setSuccessMessage(null);

    try {
      let res;
      if (authMode === 'fiel') {
        if (!contrasena) throw new Error('La contraseña de la FIEL es requerida.');
        if (!keyFile || !certFile) throw new Error('Los archivos .key y .cer de la FIEL son requeridos.');

        const formData = new FormData();
        formData.append('llavePrivada', keyFile);
        formData.append('Certificado', certFile);
        formData.append('Contrasena', contrasena);

        res = await fetch('/api/sat-go/consultar-csffiel', {
          method: 'POST',
          headers: {
            'RFC': rfc.trim().toUpperCase()
          },
          body: formData
        });
      } else {
        if (!ciec) throw new Error('La clave CIEC es obligatoria.');

        res = await fetch('/api/sat-go/consultar-csf', {
          method: 'GET',
          headers: {
            'RFC': rfc.trim().toUpperCase(),
            'Secret': ciec
          }
        });
      }

      let data;
      try {
        data = await res.json();
      } catch (err) {
        throw new Error(`Error en el servidor de la aplicación (Código de Estado: ${res.status}).`);
      }

      if (!res.ok) {
        throw new Error(data.error || 'No se pudo obtener la Constancia de Situación Fiscal.');
      }

      if (data.pdf_base64) {
        // Trigger download of PDF
        const byteCharacters = atob(data.pdf_base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `CSF_${rfc.trim().toUpperCase()}_${new Date().toISOString().substring(0, 10)}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        setSuccessMessage('¡Constancia de Situación Fiscal (CSF) descargada de manera exitosa!');
      } else {
        throw new Error('No se recibieron los datos del archivo PDF.');
      }
    } catch (err: any) {
      setError(err.message || 'Error al descargar Constancia de Situación Fiscal.');
    } finally {
      setLoading(false);
    }
  };

  // MAGICAL FEATURE: Download individual XMLs, parse them, and feed them into the App's Conciliador XML
  const handleImportToConciliator = async () => {
    const urlsWithDownload = facturas.filter(f => f.urlDescarga);
    if (urlsWithDownload.length === 0) {
      setError('No hay comprobantes con URL de descarga XML en el resultado actual.');
      return;
    }

    setLoading(true);
    setLoadingStatus(`Descargando y procesando ${urlsWithDownload.length} archivos XML del SAT...`);
    setError(null);
    setSuccessMessage(null);

    try {
      const xmlContents: { text: string; fileName: string }[] = [];
      let successCount = 0;

      // Fetch each XML sequentially to avoid server-side concurrency rate limits
      for (let i = 0; i < urlsWithDownload.length; i++) {
        const f = urlsWithDownload[i];
        setLoadingStatus(`[${i + 1}/${urlsWithDownload.length}] Descargando XML: ${f.uuid.substring(0, 8)}...`);

        try {
          const res = await fetch(`/api/sat-go/proxy-xml?url=${encodeURIComponent(f.urlDescarga)}`, {
            headers: {
              'RFC': rfc.trim().toUpperCase(),
              'Secret': ciec || ''
            }
          });
          if (!res.ok) {
            let errMsg = 'No se pudo descargar el XML';
            try {
              const errData = await res.json();
              errMsg = errData.error || errMsg;
            } catch (jsonErr) {
              try {
                const text = await res.text();
                errMsg = text || errMsg;
              } catch (textErr) {}
            }
            throw new Error(errMsg);
          }
          const text = await res.text();
          
          if (text && text.includes('<?xml') || text.includes('<cfdi:Comprobante') || text.includes('<Comprobante')) {
            xmlContents.push({
              text,
              fileName: f.fileName || `${f.uuid}.xml`
            });
            successCount++;
          }
        } catch (e) {
          console.error(`Error downloading XML for ${f.uuid}:`, e);
        }
      }

      if (xmlContents.length > 0) {
        onImportXMLs(xmlContents);
        setSuccessMessage(`¡Éxito! Se importaron ${successCount} de ${urlsWithDownload.length} archivos XML directamente a tu Conciliador XML.`);
        
        // Wait 2 seconds, then redirect to the main Conciliador XML dashboard
        setTimeout(() => {
          setActiveTab('dashboard');
        }, 2200);
      } else {
        throw new Error('No se pudo descargar ningún archivo XML válido. Asegúrate de que las facturas tengan URLs de descarga disponibles.');
      }
    } catch (err: any) {
      setError(err.message || 'Error al importar facturas al Conciliador.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 py-6 animate-fade-in text-slate-900">
      {/* Hero Header Area */}
      <div className="bg-slate-900 rounded-3xl border border-slate-800 p-6 md:p-8 text-white relative overflow-hidden shadow-2xl">
        <div className="relative z-10 max-w-4xl space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] bg-slate-800 text-gold-300 font-bold uppercase tracking-wider border border-slate-700">
              <RefreshCw className="w-3.5 h-3.5 text-gold-400 animate-spin" /> Conexión Web Service SAT
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] bg-emerald-500/10 text-emerald-300 font-bold uppercase tracking-wider border border-emerald-500/20">
              ✓ Automatización ISBB
            </span>
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight leading-none">
            Módulo de <span className="text-wheat">Descarga SAT-GO</span>
          </h2>
          <p className="text-slate-300 text-sm md:text-base leading-relaxed max-w-3xl">
            Sincroniza directamente con los servidores del SAT en tiempo real para descargar opiniones de cumplimiento, constancias fiscales y comprobantes XML (CFDIs emitidos/recibidos). Una vez arrojados, puedes importarlos de forma automática al Conciliador XML para generar el reporte de Excel.
          </p>
        </div>
        <div className="absolute top-0 right-0 -mr-24 -mt-24 w-80 h-80 bg-wheat/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-24 -mb-24 w-80 h-80 bg-gold-900/20 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Global Alerts */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-600 px-6 py-4 rounded-2xl flex items-start gap-3 shadow-lg shadow-red-500/5">
          <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="space-y-1 text-sm">
            <span className="font-bold">Se presentó un inconveniente:</span>
            <p className="text-slate-600">{error}</p>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 px-6 py-4 rounded-2xl flex items-start gap-3 shadow-lg shadow-emerald-500/5">
          <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="space-y-1 text-sm">
            <span className="font-bold">Operación exitosa:</span>
            <p className="text-slate-600">{successMessage}</p>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex flex-col items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl max-w-md w-full text-center space-y-6 shadow-2xl">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-wheat/10 rounded-full flex items-center justify-center border border-wheat/20">
                <Loader2 className="w-8 h-8 text-wheat animate-spin" />
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-white font-extrabold text-lg">Procesando Solicitud SAT...</h4>
              <p className="text-slate-400 text-sm font-mono tracking-wide">{loadingStatus}</p>
            </div>
            <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
              <div className="bg-wheat h-full animate-pulse-width w-2/3 rounded-full" />
            </div>
            <p className="text-[10px] text-slate-500 italic">Este proceso interactúa de forma segura con los servidores del SAT.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Credentials Setup */}
        <div className="lg:col-span-5 space-y-8">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Key className="w-5 h-5 text-slate-700" />
              1. Credenciales SAT-GO
            </h3>

            {/* Instruction block */}
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 text-xs text-emerald-800 space-y-2 leading-relaxed">
              <p className="font-bold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                Sincronización SAT Directa
              </p>
              <p>
                Este módulo utiliza una conexión de alta velocidad pre-configurada con SAT-GO. No requieres ingresar tokens temporales ni llaves de acceso.<br />
                <strong>Instrucciones:</strong><br />
                1. Registra el RFC del contribuyente.<br />
                2. Selecciona tu método de acceso preferido (FIEL o CIEC).<br />
                3. Proporciona tus credenciales temporales y consulta directamente.
              </p>
            </div>

            <div className="space-y-4">
              {/* RFC Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">RFC del Contribuyente</label>
                <input
                  type="text"
                  value={rfc}
                  onChange={(e) => setRfc(e.target.value.toUpperCase())}
                  placeholder="RFC de 12 o 13 dígitos"
                  maxLength={13}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 font-mono focus:outline-none focus:ring-1 focus:ring-slate-400 focus:bg-white uppercase"
                />
              </div>

              {/* Authentication Mode Switcher */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Método de Validación SAT</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setAuthMode('fiel')}
                    className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      authMode === 'fiel'
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Firma Electrónica (FIEL)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode('ciec')}
                    className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      authMode === 'ciec'
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Clave CIEC
                  </button>
                </div>
              </div>

              {/* FIEL Inputs */}
              {authMode === 'fiel' ? (
                <div className="space-y-4 pt-2 animate-fade-in">
                  {/* .key file drag and drop upload */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Archivo de Clave Privada (.key)</label>
                    <div className="border border-dashed border-slate-200 rounded-xl p-3 bg-slate-50/50 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Upload className="w-4 h-4 text-slate-400" />
                        <span className="text-[11px] text-slate-600 truncate max-w-[180px]">
                          {keyFile ? keyFile.name : 'Seleccionar archivo .key'}
                        </span>
                      </div>
                      <label className="bg-slate-200 hover:bg-slate-300 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase cursor-pointer transition-colors text-slate-800">
                        Examine
                        <input
                          type="file"
                          accept=".key"
                          onChange={(e) => setKeyFile(e.target.files?.[0] || null)}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {/* .cer file drag and drop upload */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Archivo de Certificado (.cer)</label>
                    <div className="border border-dashed border-slate-200 rounded-xl p-3 bg-slate-50/50 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Upload className="w-4 h-4 text-slate-400" />
                        <span className="text-[11px] text-slate-600 truncate max-w-[180px]">
                          {certFile ? certFile.name : 'Seleccionar archivo .cer'}
                        </span>
                      </div>
                      <label className="bg-slate-200 hover:bg-slate-300 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase cursor-pointer transition-colors text-slate-800">
                        Examine
                        <input
                          type="file"
                          accept=".cer"
                          onChange={(e) => setCertFile(e.target.files?.[0] || null)}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Private Key Password */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Contraseña de Clave Privada</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={contrasena}
                        onChange={(e) => setContrasena(e.target.value)}
                        placeholder="Contraseña de tu FIEL"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400 focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 pt-2 animate-fade-in">
                  {/* CIEC Password */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Clave CIEC / Contraseña SAT</label>
                    <div className="relative">
                      <input
                        type={showCiec ? 'text' : 'password'}
                        value={ciec}
                        onChange={(e) => setCiec(e.target.value)}
                        placeholder="Ingresa tu clave de acceso al SAT"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-10 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400 focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCiec(!showCiec)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showCiec ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Query Forms & Quick Actions */}
        <div className="lg:col-span-7 space-y-8">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <Layers className="w-5 h-5 text-slate-700" />
              2. Consulta y Acciones Disponibles
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Op de cumplimiento card */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <span className="bg-slate-200 text-slate-800 font-mono text-[9px] font-bold px-2 py-0.5 rounded uppercase">SAT PDF</span>
                  <h4 className="text-sm font-extrabold text-slate-900">Opinión del Cumplimiento</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Obtén el estatus fiscal de cumplimiento oficial generado por el SAT en tiempo real de forma inmediata.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDescargarOpinion}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer w-full"
                >
                  <FileDown className="w-4 h-4" /> Descargar Opinión PDF
                </button>
              </div>

              {/* CSF card */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <span className="bg-slate-200 text-slate-800 font-mono text-[9px] font-bold px-2 py-0.5 rounded uppercase">SAT PDF</span>
                  <h4 className="text-sm font-extrabold text-slate-900">Constancia de Situación Fiscal</h4>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Descarga la constancia oficial (CSF) del contribuyente con datos de regímenes, domicilio, obligaciones, etc.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDescargarCsf}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-1.5 transition-colors cursor-pointer w-full"
                >
                  <FileDown className="w-4 h-4" /> Descargar Constancia PDF
                </button>
              </div>
            </div>

            <div className="h-px bg-slate-100 my-4" />

            {/* Facturas query parameters */}
            <form onSubmit={handleConsultFacturas} className="space-y-6">
              <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-slate-700" /> Parámetros de Consulta de CFDIs (Facturas XML)
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">Tipo de Comprobante</label>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as 'recibidos' | 'emitidos')}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none"
                  >
                    <option value="recibidos">Recibidos (Egresos/Gastos)</option>
                    <option value="emitidos">Emitidos (Ingresos/Ventas)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">Estatus en el SAT</label>
                  <select
                    value={estatusFactura}
                    onChange={(e) => setEstatusFactura(parseInt(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none"
                  >
                    <option value={-1}>Todos los Comprobantes</option>
                    <option value={1}>Vigente</option>
                    <option value={0}>Cancelada</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">Tipo de Búsqueda</label>
                  <select
                    value={tipoBusqueda}
                    onChange={(e) => setTipoBusqueda(parseInt(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none"
                  >
                    <option value={1}>Por Fecha de Emisión</option>
                    <option value={2}>Por Folio Fiscal</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">Fecha Inicial</label>
                  <input
                    type="datetime-local"
                    step="1"
                    value={fechaInicial}
                    onChange={(e) => setFechaInicial(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">Fecha Final</label>
                  <input
                    type="datetime-local"
                    step="1"
                    value={fechaFinal}
                    onChange={(e) => setFechaFinal(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="descargaComprobantes"
                  checked={descargaComprobantes}
                  onChange={(e) => setDescargaComprobantes(e.target.checked)}
                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-400 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="descargaComprobantes" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                  Habilitar descarga automatizada de archivos XML individuales (Requerido para importar)
                </label>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full bg-slate-900 hover:bg-slate-800 text-wheat hover:text-white font-extrabold text-xs py-3 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99]"
                >
                  <Search className="w-4 h-4" /> Consultar Facturas CFDIs en el SAT
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Results Section */}
      {facturas.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6 animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-lg font-black text-slate-900">Resultados de Facturas Encontradas</h3>
              <p className="text-xs text-slate-500">Se detectaron {facturas.length} comprobantes vigentes/cancelados en el período.</p>
            </div>
            
            <button
              type="button"
              onClick={handleImportToConciliator}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-6 py-3 rounded-2xl flex items-center gap-2 transition-all cursor-pointer shadow-lg hover:shadow-xl hover:scale-105"
            >
              <Sparkles className="w-4 h-4 text-gold-300" />
              <span>Analizar & Importar al Conciliador XML</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-mono uppercase tracking-wider text-slate-500 border-b border-slate-100">
                  <th className="py-3 px-4">Emisor</th>
                  <th className="py-3 px-4">Receptor</th>
                  <th className="py-3 px-4">Fecha Emisión</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-center">Estatus</th>
                  <th className="py-3 px-4">UUID (Folio Fiscal)</th>
                  <th className="py-3 px-4 text-center">Archivo XML</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {facturas.map((f, i) => (
                  <tr key={i} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 max-w-[200px]">
                      <div className="font-bold text-slate-800 truncate">{f.razonSocialEmisor || 'N/A'}</div>
                      <div className="text-[10px] text-slate-500 font-mono uppercase">{f.rfCemisor || 'N/A'}</div>
                    </td>
                    <td className="py-3 px-4 max-w-[200px]">
                      <div className="font-bold text-slate-800 truncate">{f.razonSocialReceptor || 'N/A'}</div>
                      <div className="text-[10px] text-slate-500 font-mono uppercase">{f.rfcReceptor || 'N/A'}</div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                      {f.fechaEmision ? new Date(f.fechaEmision).toLocaleString('es-MX') : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-right font-black text-slate-800 whitespace-nowrap">
                      ${typeof f.total === 'number' ? f.total.toFixed(2) : parseFloat(String(f.total || '0')).toFixed(2)} MXN
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                        f.estadoDeComprobante === 'Vigente'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                          : 'bg-rose-50 text-rose-700 border-rose-100'
                      }`}>
                        {f.estadoDeComprobante || 'N/A'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[10px] text-slate-500">
                      <span title={f.uuid}>{f.uuid ? `${f.uuid.substring(0, 15)}...` : 'N/A'}</span>
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {f.urlDescarga ? (
                        <a
                          href={f.urlDescarga}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-slate-900 hover:text-emerald-600 font-bold hover:underline"
                        >
                          <Download className="w-3.5 h-3.5" /> Descargar
                        </a>
                      ) : (
                        <span className="text-slate-400">No habilitada</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
