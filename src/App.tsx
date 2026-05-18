import React, { useState, useRef } from 'react';
import { 
  FileText, 
  Upload, 
  Download, 
  Table as TableIcon, 
  PieChart, 
  AlertCircle, 
  CheckCircle2,
  Trash2,
  ChevronRight,
  Search,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { CFDIData } from './lib/xmlParser';

interface BankTransaction {
  fecha: string;
  descripcion: string;
  monto: number;
  tipo: 'Cargo' | 'Abono';
  referencia?: string;
}

interface AnalysisResult {
  filename: string;
  data?: CFDIData;
  error?: string;
  status: 'success' | 'error';
}

interface AnalysisResultPDF {
  filename: string;
  transactions: BankTransaction[];
  error?: string;
  status: 'success' | 'error';
}

export default function App() {
  const [xmlFiles, setXmlFiles] = useState<File[]>([]);
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [activeTool, setActiveTool] = useState<'xml' | 'pdf'>('xml');
  const [bankResults, setBankResults] = useState<AnalysisResultPDF[]>([]);
  const [serverHealth, setServerHealth] = useState<'checking' | 'ok' | 'fail'>('checking');
  const [serverStatusDetail, setServerStatusDetail] = useState<string>('');
  const [showSuccess, setShowSuccess] = useState(false);

  const checkServer = async () => {
    try {
      const start = Date.now();
      const res = await fetch('/api/health', { cache: 'no-store' });
      const latency = Date.now() - start;
      
      if (res.ok) {
        setServerHealth('ok');
        setServerStatusDetail(`${latency}ms`);
      } else {
        console.warn(`Health check failed with status: ${res.status}`);
        setServerHealth('fail');
        setServerStatusDetail(`HTTP ${res.status}`);
      }
    } catch (e: any) {
      console.error('Health check connection error:', e);
      setServerHealth('fail');
      setServerStatusDetail(e.message || 'Error de conexión');
    }
  };

  React.useEffect(() => {
    const timer = setTimeout(checkServer, 1500);
    const interval = setInterval(checkServer, 30000); // Check every 30s
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'xml' | 'pdf') => {
    if (e.target.files) {
      if (type === 'xml') {
        setXmlFiles(prev => [...prev, ...Array.from(e.target.files || [])]);
      } else {
        setPdfFiles(prev => [...prev, ...Array.from(e.target.files || [])]);
      }
    }
  };

  const removeFile = (index: number, type: 'xml' | 'pdf') => {
    if (type === 'xml') {
      setXmlFiles(prev => prev.filter((_, i) => i !== index));
    } else {
      setPdfFiles(prev => prev.filter((_, i) => i !== index));
    }
  };

  const uploadAndAnalyze = async () => {
    if (xmlFiles.length === 0) return;
    setLoading(true);
    
    const formData = new FormData();
    xmlFiles.forEach(file => formData.append('files', file));

    try {
      const response = await fetch('/api/analyze-xml', {
        method: 'POST',
        body: formData,
      });
      
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        if (contentType && contentType.includes('application/json')) {
          const errData = await response.json();
          throw new Error(errData.error || `Error del servidor: ${response.status}`);
        } else {
          const text = await response.text();
          console.error('Server error (non-json):', text);
          throw new Error(`Error del servidor (${response.status}). Ver consola para detalles.`);
        }
      }

      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        setResults(data);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
      } else {
        throw new Error('La respuesta del servidor no es un JSON válido');
      }
    } catch (error: any) {
      console.error('Error analyzing files:', error);
      alert(error.message || 'Error al conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  const uploadAndAnalyzeBank = async () => {
    if (pdfFiles.length === 0) return;
    
    setLoading(true);
    const formData = new FormData();
    pdfFiles.forEach(file => formData.append('files', file));

    try {
      const response = await fetch('/api/analyze-pdf-bank', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Error ${response.status}: ${text.substring(0, 100)}`);
      }

      const data = await response.json();
      setBankResults(data);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error: any) {
      console.error('Final Bank Analysis Catch:', error);
      alert(`Error al analizar PDF: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const exportBankToExcel = (results: AnalysisResultPDF[]) => {
    const allTransactions = results.flatMap(r => 
      (r.transactions || []).map(tx => ({
        'Archivo': r.filename,
        ...tx
      }))
    );

    if (allTransactions.length === 0) {
      alert('No hay movimientos para exportar.');
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(allTransactions);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte Bancario');
    XLSX.writeFile(workbook, `Reporte_Bancario_${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  const exportToExcel = () => {
    const validResults = results.filter(r => r.status === 'success' && r.data);
    if (validResults.length === 0) {
      alert('No hay datos válidos para exportar.');
      return;
    }

    // Sort by date safely
    const sortedResults = [...validResults].sort((a, b) => {
      const dateA = a.data?.fecha ? new Date(a.data.fecha).getTime() : 0;
      const dateB = b.data?.fecha ? new Date(b.data.fecha).getTime() : 0;
      return dateA - dateB;
    });

    const flattenedData = sortedResults.map(r => {
      const d = r.data!;
      const i = d.impuestos.desglose;
      return {
        'Fecha Emision': d.fecha || 'N/A',
        'UUID': d.uuid,
        'Serie': d.serie,
        'Folio': d.folio,
        'Tipo Comprobante': d.tipo,
        'RFC Emisor': d.emisorRfc,
        'Nombre Emisor': d.emisorNombre,
        'RFC Receptor': d.receptorRfc,
        'Nombre Receptor': d.receptorNombre,
        'Uso CFDI': `${d.usoCFDI} - ${d.usoCFDINombre}`,
        'Moneda': d.moneda,
        'Tipo Cambio': d.tipoCambio,
        'Subtotal (MXN)': d.subtotal,
        'Descuento (MXN)': d.descuento,
        'Base IVA 16%': i.base16,
        'IVA 16%': i.iva16,
        'Base IVA 8%': i.base8,
        'IVA 8%': i.iva8,
        'Base IVA 0%': i.base0,
        'Base Exento': i.baseExento,
        'No Objeto de Impuesto': i.baseNoObjeto,
        'Base IEPS': i.baseIEPS,
        'IEPS': i.ieps,
        'Retencion IVA': i.retIVA,
        'Retencion ISR': i.retISR,
        'Otros Traslados': i.otrosTrasladados,
        'Otros Retenidos': i.otrosRetenidos,
        'Total Trasladados': d.impuestos.totalTrasladados,
        'Total Retenidos': d.impuestos.totalRetenidos,
        'Total Factura (MXN)': d.total,
        'Metodo Pago': d.metodoPago,
        'Forma Pago': d.formaPago,
        'Conceptos': d.conceptos.map(c => `${c.cantidad} ${c.unidad} - ${c.descripcion}`).join(' | '),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(flattenedData);
    
    // Better auto-size
    const cols = Object.keys(flattenedData[0] || {}).map(key => {
      const maxLen = Math.max(
        key.length,
        ...flattenedData.map(row => String(row[key as keyof typeof row] || '').length)
      );
      return { wch: Math.min(maxLen + 2, 50) };
    });
    worksheet['!cols'] = cols;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte Fiscal');
    XLSX.writeFile(workbook, `Reporte_SAT_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  };

  const filteredResults = [...results]
    .filter(r => 
      r.filename.toLowerCase().includes(filter.toLowerCase()) ||
      (r.data?.emisorNombre.toLowerCase() || '').includes(filter.toLowerCase()) ||
      (r.data?.receptorNombre.toLowerCase() || '').includes(filter.toLowerCase()) ||
      (r.data?.uuid || '').includes(filter.toLowerCase())
    )
    .sort((a, b) => {
      if (!a.data || !b.data) return 0;
      return new Date(a.data.fecha).getTime() - new Date(b.data.fecha).getTime();
    });

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Success Toast */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-wheat/30 text-white px-8 py-4 rounded-3xl shadow-2xl flex items-center gap-4 border-l-4 border-l-wheat"
          >
            <div className="bg-wheat p-1.5 rounded-full">
              <CheckCircle2 className="w-5 h-5 text-slate-900" />
            </div>
            <div>
              <p className="text-sm font-black uppercase tracking-widest text-wheat">Éxito</p>
              <p className="text-xs font-bold text-white/70">Procesamiento completado con éxito</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-gold-gradient shadow-xl sticky top-0 z-20">
        <div className="bg-slate-900/50 backdrop-blur-sm py-1 border-b border-white/5">
          <div className="max-w-7xl mx-auto px-4 flex items-center justify-end gap-3">
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Estado del Servidor:</span>
            {serverHealth === 'checking' && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                <span className="text-[10px] font-black text-blue-400 uppercase">Conectando...</span>
              </div>
            )}
            {serverHealth === 'ok' && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                <span className="text-[10px] font-black text-emerald-400 uppercase">En Línea {serverStatusDetail && `(${serverStatusDetail})`}</span>
              </div>
            )}
            {serverHealth === 'fail' && (
              <button 
                onClick={checkServer}
                className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
              >
                <div className="w-1.5 h-1.5 bg-red-400 rounded-full shadow-[0_0_8px_rgba(248,113,113,0.6)]" />
                <span className="text-[10px] font-black text-red-400 uppercase underline decoration-dotted">
                  Desconectado {serverStatusDetail ? `[${serverStatusDetail}]` : '(Reintentar)'}
                </span>
              </button>
            )}
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 backdrop-blur-md p-2.5 rounded-xl border border-white/20">
              <FileText className="text-wheat w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter text-white leading-none">
                ISBB <span className="text-wheat">SOLUCIONES</span>
              </h1>
              <p className="text-[10px] text-wheat/70 font-medium uppercase tracking-[0.2em] mt-1">Herramienta Contable Inteligente</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex bg-white/10 p-1 rounded-xl border border-white/20">
              <button 
                onClick={() => setActiveTool('xml')}
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTool === 'xml' ? 'bg-wheat text-slate-900 shadow-lg' : 'text-wheat/60 hover:text-wheat'}`}
              >
                SAT XML
              </button>
              <button 
                onClick={() => setActiveTool('pdf')}
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTool === 'pdf' ? 'bg-wheat text-slate-900 shadow-lg' : 'text-wheat/60 hover:text-wheat'}`}
              >
                PDF BANCOS
              </button>
            </div>
            <button 
              onClick={() => { 
                setResults([]); setXmlFiles([]); 
                setBankResults([]); setPdfFiles([]); 
              }}
              className="text-sm font-semibold text-wheat/80 hover:text-wheat transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Limpiar
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* Sidebar - Upload Controls */}
          <div className="lg:col-span-4 space-y-8">
            {activeTool === 'xml' ? (
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-3 text-slate-800">
                  <div className="bg-wheat/30 p-2 rounded-lg">
                    <Upload className="w-5 h-5 text-gold-700" />
                  </div>
                  Cargar Facturas XML
                </h2>
                
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 rounded-2xl p-10 hover:border-gold-400 hover:bg-gold-50/30 transition-all cursor-pointer flex flex-col items-center justify-center text-center group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gold-50/0 group-hover:bg-gold-50/10 transition-colors" />
                  <div className="bg-slate-100 p-5 rounded-2xl group-hover:scale-110 transition-transform relative z-10">
                    <Upload className="w-10 h-10 text-slate-400 group-hover:text-gold-600" />
                  </div>
                  <p className="mt-5 text-sm font-bold text-slate-700 relative z-10">Arrastra archivos aquí</p>
                  <p className="text-xs text-slate-400 mt-2 relative z-10">Soporta múltiples archivos <span className="bg-slate-100 px-1.5 py-0.5 rounded">.xml</span> del SAT</p>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={(e) => handleFileChange(e, 'xml')} 
                    multiple 
                    accept=".xml" 
                    className="hidden" 
                  />
                </div>

                {xmlFiles.length > 0 && (
                  <div className="mt-8 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">{xmlFiles.length} seleccionados</span>
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                      {xmlFiles.map((file, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl text-xs group border border-transparent hover:border-gold-200 hover:bg-white transition-all shadow-sm">
                          <div className="flex items-center gap-2 font-medium text-slate-600">
                            <FileText className="w-4 h-4 text-gold-500" />
                            <span className="truncate max-w-[180px]">{file.name}</span>
                          </div>
                          <button onClick={() => removeFile(i, 'xml')} className="text-slate-400 hover:text-red-500 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button 
                      onClick={uploadAndAnalyze}
                      disabled={loading}
                      className="w-full bg-slate-900 text-gold font-bold py-4 rounded-2xl shadow-xl shadow-slate-200 hover:bg-slate-800 disabled:opacity-50 transition-all flex items-center justify-center gap-3 mt-6 ring-2 ring-gold/20"
                    >
                      {loading ? (
                        <div className="w-6 h-6 border-3 border-wheat/20 border-t-wheat rounded-full animate-spin" />
                      ) : (
                        <>PROCESAR XML <ChevronRight className="w-5 h-5" /></>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-3 text-slate-800">
                  <div className="bg-blue-50 p-2 rounded-lg">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  Estado de Cuenta PDF
                </h2>
                
                <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                  Utiliza <strong>IA Generativa</strong> para leer y extraer movimientos de estados de cuenta bancarios.
                </p>

                <div 
                  onClick={() => !loading && pdfInputRef.current?.click()}
                  className={`border-2 border-dashed border-slate-200 rounded-2xl p-10 transition-all flex flex-col items-center justify-center text-center group relative overflow-hidden ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-400 hover:bg-blue-50/30 cursor-pointer'}`}
                >
                  <div className="bg-slate-100 p-5 rounded-2xl group-hover:scale-110 transition-transform relative z-10">
                    <Upload className="w-10 h-10 text-slate-400 group-hover:text-blue-600" />
                  </div>
                  <p className="mt-5 text-sm font-bold text-slate-700 relative z-10">Cargar PDFs Bancarios</p>
                  <input 
                    type="file" 
                    ref={pdfInputRef} 
                    onChange={(e) => handleFileChange(e, 'pdf')} 
                    multiple
                    accept=".pdf" 
                    className="hidden" 
                  />
                </div>

                {pdfFiles.length > 0 && (
                  <div className="mt-8 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">{pdfFiles.length} archivos</span>
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                      {pdfFiles.map((file, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl text-xs group border border-transparent hover:border-blue-200 hover:bg-white transition-all shadow-sm">
                          <div className="flex items-center gap-2 font-medium text-slate-600">
                            <FileText className="w-4 h-4 text-blue-500" />
                            <span className="truncate max-w-[180px]">{file.name}</span>
                          </div>
                          <button onClick={() => removeFile(i, 'pdf')} className="text-slate-400 hover:text-red-500 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button 
                      onClick={uploadAndAnalyzeBank}
                      disabled={loading}
                      className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-blue-200 hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-3 mt-6"
                    >
                      {loading ? (
                        <div className="w-6 h-6 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>PROCESAR PDFS CON IA <ChevronRight className="w-5 h-5" /></>
                      )}
                    </button>
                  </div>
                )}

                {bankResults.length > 0 && (
                  <div className="mt-8">
                    <div className="bg-slate-900 rounded-2xl p-6 text-white overflow-hidden relative shadow-lg">
                      <h3 className="text-wheat text-[10px] font-black uppercase tracking-[0.2em] mb-4">Análisis Completado</h3>
                      <div className="space-y-4 relative z-10">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-white/60">Registros:</span>
                          <span className="font-black text-wheat">{bankResults.length}</span>
                        </div>
                        <button 
                          onClick={() => exportBankToExcel(bankResults)}
                          className="w-full bg-wheat text-slate-900 py-3 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-white transition-all flex items-center justify-center gap-2"
                        >
                          <Download className="w-4 h-4" /> Exportar Reporte
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {results.length > 0 && activeTool === 'xml' && (
              <div className="bg-slate-900 rounded-3xl p-8 text-white overflow-hidden relative shadow-2xl">
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-6">
                    <PieChart className="w-5 h-5 text-wheat" />
                    <h3 className="text-wheat text-xs font-black uppercase tracking-[0.2em]">Analítica en Vivo</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                      <p className="text-3xl font-black text-wheat">{results.filter(r => r.status === 'success').length}</p>
                      <p className="text-wheat/60 text-[10px] font-bold uppercase tracking-wider mt-1">Procesados</p>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                      <p className="text-3xl font-black text-red-400">{results.filter(r => r.status === 'error').length}</p>
                      <p className="text-wheat/60 text-[10px] font-bold uppercase tracking-wider mt-1">Errores</p>
                    </div>
                  </div>
                  <button 
                    onClick={exportToExcel}
                    className="mt-8 w-full bg-wheat text-slate-900 py-4 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-white transition-all shadow-lg text-sm uppercase tracking-wider"
                  >
                    <Download className="w-5 h-5" /> Generar Excel
                  </button>
                </div>
                <div className="absolute top-0 right-0 -mr-12 -mt-12 w-48 h-48 bg-wheat/10 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 -ml-12 -mb-12 w-48 h-48 bg-gold-900/40 rounded-full blur-3xl font-bold" />
              </div>
            )}
          </div>

          {/* Main Content - Results Table */}
          <div className="lg:col-span-8 space-y-8">
            {activeTool === 'xml' ? (
              !results.length ? (
                <div className="h-[650px] bg-white rounded-3xl border border-slate-200 flex flex-col items-center justify-center text-center p-12 shadow-sm border-dashed">
                  <div className="bg-wheat/10 p-8 rounded-full mb-8">
                    <TableIcon className="w-16 h-16 text-wheat-dark" />
                  </div>
                  <h3 className="text-3xl font-black text-slate-800 mb-3 tracking-tight">Sin Reportes</h3>
                  <p className="text-slate-400 max-w-sm text-sm leading-relaxed font-medium">
                    ISBB SOLUCIONES procesa tus archivos XML de forma local y segura. Carga tus facturas para comenzar.
                  </p>
                </div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden"
                >
                  <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-slate-50/50">
                    <div>
                      <h3 className="text-2xl font-black text-slate-800 tracking-tight transition-all">Consolidado Fiscal</h3>
                      <p className="text-xs text-slate-400 font-bold mt-1 uppercase tracking-widest italic">Registros procesados en tiempo real</p>
                    </div>
                    <div className="relative group max-w-md w-full">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-gold-600 transition-colors" />
                      <input 
                        type="text" 
                        placeholder="Buscar por RFC, Nombre, UUID..." 
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="w-full pl-12 pr-5 py-3.5 border border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-4 focus:ring-gold-500/10 focus:border-gold-400 transition-all bg-white shadow-inner"
                      />
                    </div>
                  </div>

                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                      <thead className="bg-slate-900 border-b border-white/10">
                        <tr>
                          <th className="px-8 py-5 text-[10px] font-black text-wheat uppercase tracking-[0.2em]">Estado</th>
                          <th className="px-8 py-5 text-[10px] font-black text-wheat uppercase tracking-[0.2em]">Participantes</th>
                          <th className="px-8 py-5 text-[10px] font-black text-wheat uppercase tracking-[0.2em]">Temporalidad</th>
                          <th className="px-8 py-5 text-[10px] font-black text-wheat uppercase tracking-[0.2em] text-right">Subtotal</th>
                          <th className="px-8 py-5 text-[10px] font-black text-wheat uppercase tracking-[0.2em] text-right">Impuestos</th>
                          <th className="px-8 py-5 text-[10px] font-black text-wheat uppercase tracking-[0.2em] text-right">Total MXN</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        <AnimatePresence mode='popLayout'>
                          {filteredResults.map((result, idx) => (
                            <motion.tr 
                              layout
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              key={result.data?.uuid || idx} 
                              className="hover:bg-gold-50/20 transition-colors group cursor-default"
                            >
                              <td className="px-8 py-6">
                                {result.status === 'success' ? (
                                  <div className="bg-emerald-50 w-10 h-10 rounded-full flex items-center justify-center border border-emerald-100 shadow-sm">
                                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                                  </div>
                                ) : (
                                  <div className="bg-red-50 w-10 h-10 rounded-full flex items-center justify-center border border-red-100 shadow-sm">
                                    <AlertCircle className="w-6 h-6 text-red-500" />
                                  </div>
                                )}
                              </td>
                              <td className="px-8 py-6">
                                {result.status === 'success' ? (
                                  <div className="space-y-1.5">
                                    <div className="text-sm font-black text-slate-800 truncate max-w-[220px]" title={`Emisor: ${result.data?.emisorNombre}`}>
                                      <span className="text-gold-600 font-black text-[9px] mr-2 bg-gold-50 px-1.5 py-0.5 rounded border border-gold-200">E</span>
                                      {result.data?.emisorNombre}
                                    </div>
                                    <div className="text-xs text-slate-500 font-bold truncate max-w-[220px]" title={`Receptor: ${result.data?.receptorNombre}`}>
                                      <span className="text-slate-400 font-black text-[9px] mr-2 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">R</span>
                                      {result.data?.receptorNombre}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-xs text-red-500 font-black italic">{result.error}</span>
                                )}
                              </td>
                              <td className="px-8 py-6">
                                {result.status === 'success' && (
                                  <div className="space-y-2">
                                    <div className="text-xs font-black text-slate-700 tracking-tight">
                                      {result.data?.fecha ? format(new Date(result.data.fecha), 'dd MMM, yyyy') : 'N/A'}
                                    </div>
                                    <div className="inline-flex px-3 py-1 rounded-lg text-[9px] bg-slate-900 text-wheat font-black uppercase tracking-widest shadow-sm">
                                      {result.data?.tipo}
                                    </div>
                                  </div>
                                )}
                              </td>
                              <td className="px-8 py-6 text-right whitespace-nowrap">
                                <span className="text-sm font-black text-slate-600">
                                  {result.status === 'success' && result.data ? `$${result.data.subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '-'}
                                </span>
                              </td>
                              <td className="px-8 py-6 text-right whitespace-nowrap">
                                <div className="space-y-1 bg-white/50 p-2 rounded-xl border border-slate-100">
                                  {result.status === 'success' && result.data?.impuestos?.desglose?.iva16 !== 0 && (
                                    <div className="text-[10px] font-black text-emerald-700 uppercase">IVA 16%: <span className="text-slate-900">${result.data?.impuestos?.desglose?.iva16?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></div>
                                  )}
                                  {result.status === 'success' && result.data?.impuestos?.desglose?.iva8 !== 0 && (
                                    <div className="text-[10px] font-black text-emerald-700 uppercase">IVA 8%: <span className="text-slate-900">${result.data?.impuestos?.desglose?.iva8?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></div>
                                  )}
                                  {result.status === 'success' && result.data?.impuestos?.desglose?.ieps !== 0 && (
                                    <div className="text-[10px] font-black text-blue-700 uppercase">IEPS: <span className="text-slate-900">${result.data?.impuestos?.desglose?.ieps?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></div>
                                  )}
                                  {result.status === 'success' && result.data?.impuestos?.desglose?.retIVA !== 0 && (
                                    <div className="text-[10px] font-black text-red-700 uppercase">Ret IVA: <span className="text-slate-900">-${result.data?.impuestos?.desglose?.retIVA?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></div>
                                  )}
                                  {result.status === 'success' && result.data?.impuestos?.desglose?.retISR !== 0 && (
                                    <div className="text-[10px] font-black text-red-700 uppercase">Ret ISR: <span className="text-slate-900">-${result.data?.impuestos?.desglose?.retISR?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></div>
                                  )}
                                  {result.status === 'success' && result.data?.impuestos?.desglose?.ivaExento !== 0 && (
                                    <div className="text-[10px] font-black text-slate-500 uppercase">Exento: <span className="text-slate-900">${result.data?.impuestos?.desglose?.ivaExento?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></div>
                                  )}
                                  {result.status === 'success' && result.data?.impuestos?.desglose?.baseNoObjeto !== 0 && (
                                    <div className="text-[10px] font-black text-slate-500 uppercase">No Objeto: <span className="text-slate-900">${result.data?.impuestos?.desglose?.baseNoObjeto?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></div>
                                  )}
                                </div>
                              </td>
                              <td className="px-8 py-6 text-right whitespace-nowrap">
                                <div className="inline-flex flex-col items-end">
                                  <span className="text-lg font-black text-slate-900 tracking-tighter">
                                    {result.status === 'success' && result.data ? `$${result.data.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '-'}
                                  </span>
                                  <span className="text-[8px] font-black text-gold-600 uppercase tracking-widest mt-0.5">Monto Total</span>
                                </div>
                              </td>
                            </motion.tr>
                          ))}
                        </AnimatePresence>
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )
            ) : (
              /* PDF TOOL CONTENT */
              !bankResults.length ? (
                <div className="h-[650px] bg-white rounded-3xl border border-slate-200 flex flex-col items-center justify-center text-center p-12 shadow-sm border-dashed">
                  <div className="bg-blue-50 p-8 rounded-full mb-8">
                    <FileText className="w-16 h-16 text-blue-400" />
                  </div>
                  <h3 className="text-3xl font-black text-slate-800 mb-3 tracking-tight">Reporte Bancario AI</h3>
                  <p className="text-slate-400 max-w-sm text-sm leading-relaxed font-medium">
                    Sube estados de cuenta en PDF para extraer automáticamente todos los movimientos utilizando Inteligencia Artificial.
                  </p>
                </div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden"
                >
                  <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-blue-50/30">
                    <div>
                      <h3 className="text-2xl font-black text-slate-800 tracking-tight">Consolidado Bancario</h3>
                      <p className="text-xs text-blue-600 font-bold mt-1 uppercase tracking-widest italic">{bankResults.filter(r => r.status === 'success').length} Archivos Procesados</p>
                    </div>
                    <div className="flex items-center gap-3">
                       <span className="bg-white px-4 py-2 rounded-xl border border-blue-100 text-xs font-black text-blue-600 shadow-sm">
                         EXTRACTOR INTELIGENTE
                       </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                      <thead className="bg-slate-900 border-b border-white/10">
                        <tr>
                          <th className="px-8 py-5 text-[10px] font-black text-wheat uppercase tracking-[0.2em]">Origen</th>
                          <th className="px-8 py-5 text-[10px] font-black text-wheat uppercase tracking-[0.2em]">Fecha</th>
                          <th className="px-8 py-5 text-[10px] font-black text-wheat uppercase tracking-[0.2em]">Descripción / Concepto</th>
                          <th className="px-8 py-5 text-[10px] font-black text-wheat uppercase tracking-[0.2em] text-right">Cargo</th>
                          <th className="px-8 py-5 text-[10px] font-black text-wheat uppercase tracking-[0.2em] text-right">Abono</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {bankResults.flatMap((res, rIdx) => 
                          res.status === 'success' ? 
                            res.transactions.map((tx, idx) => (
                              <tr key={`${rIdx}-${idx}`} className="hover:bg-blue-50/20 transition-colors group">
                                <td className="px-8 py-6">
                                  <div className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded truncate max-w-[120px]" title={res.filename}>
                                    {res.filename}
                                  </div>
                                </td>
                                <td className="px-8 py-6 text-xs font-bold text-slate-700">{tx.fecha}</td>
                                <td className="px-8 py-6 text-xs font-medium text-slate-600 max-w-[350px]">{tx.descripcion}</td>
                                <td className="px-8 py-6 text-right font-bold text-red-600 text-sm whitespace-nowrap">
                                  {tx.tipo === 'Cargo' ? `$${tx.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '-'}
                                </td>
                                <td className="px-8 py-6 text-right font-bold text-emerald-600 text-sm whitespace-nowrap">
                                  {tx.tipo === 'Abono' ? `$${tx.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '-'}
                                </td>
                              </tr>
                            ))
                          : (
                            <tr key={`err-${rIdx}`}>
                              <td colSpan={5} className="px-8 py-4 bg-red-50 text-red-500 text-xs font-bold">
                                Error en {res.filename}: {res.error}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )
            )}
          </div>
        </div>
      </main>

      <footer className="bg-slate-900 py-16 text-center border-t-4 border-wheat">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-black text-white tracking-tighter mb-4">
            ISBB <span className="text-wheat">SOLUCIONES</span>
          </h2>
          <p className="text-wheat/40 text-xs font-bold uppercase tracking-[0.4em]">
            Inteligencia Contable & Soluciones Fiscales Avanzadas
          </p>
          <div className="w-12 h-1 bg-wheat mx-auto my-8 rounded-full opacity-30" />
          <p className="text-white/20 text-[10px] font-medium tracking-wider">
            © {new Date().getFullYear()} ISBB SOLUCIONES - v3.4 STABLE (CLOUD RE-ROUTE)
          </p>
        </div>
      </footer>
    </div>
  );
}

