import React, { useState } from 'react';
import { 
  FileText, 
  Upload, 
  Download, 
  Trash2,
  FileSearch,
  Monitor,
  MousePointer2,
  Save,
  Info,
  Loader2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { format, parseISO } from 'date-fns';
import { CFDIData } from './lib/xmlParser';
import { USO_CFDI, FORMA_PAGO, METODO_PAGO } from './lib/catalogs';

interface AnalysisResult {
  filename: string;
  data?: CFDIData;
  status: 'success' | 'error';
  error?: string;
}

export default function App() {
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');

  const handleFiles = async (fileList: FileList) => {
    const xmlFiles = Array.from(fileList).filter(file => file.name.endsWith('.xml'));
    if (xmlFiles.length === 0) return;

    setLoading(true);
    const formData = new FormData();
    xmlFiles.forEach(file => formData.append('files', file));

    try {
      const response = await fetch('/api/analyze-xml', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Error en el servidor');
      const data = await response.json();
      setResults(data);
    } catch (error: any) {
      alert('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    const validResults = [...results]
      .filter(r => r.status === 'success' && r.data)
      .sort((a, b) => new Date(a.data!.fecha).getTime() - new Date(b.data!.fecha).getTime());

    if (validResults.length === 0) return;

    const dataToExport = validResults.map(r => ({
      'Fecha': format(parseISO(r.data!.fecha), 'yyyy-MM-dd HH:mm:ss'),
      'Serie': r.data!.serie,
      'Folio': r.data!.folio,
      'UUID': r.data!.uuid,
      'RFC Emisor': r.data!.emisorRfc,
      'Nombre Emisor': r.data!.emisorNombre,
      'RFC Receptor': r.data!.receptorRfc,
      'Nombre Receptor': r.data!.receptorNombre,
      'Uso CFDI': `${r.data!.usoCFDI} - ${USO_CFDI[r.data!.usoCFDI] || 'N/A'}`,
      'Metodo Pago': `${r.data!.metodoPago} - ${METODO_PAGO[r.data!.metodoPago] || 'N/A'}`,
      'Forma Pago': `${r.data!.formaPago} - ${FORMA_PAGO[r.data!.formaPago] || 'N/A'}`,
      'Conceptos': r.data!.conceptos,
      'Subtotal': r.data!.subtotal,
      'Descuento': r.data!.descuento,
      'IVA Trasladado (002)': r.data!.impuestos.ivaTrasladado,
      'IEPS Trasladado (003)': r.data!.impuestos.iepsTrasladado,
      'IVA Retenido': r.data!.impuestos.ivaRetenido,
      'ISR Retenido': r.data!.impuestos.isrRetenido,
      'Total Impuestos Trasl.': r.data!.impuestos.totalTrasladados,
      'Total Impuestos Ret.': r.data!.impuestos.totalRetenidos,
      'Total': r.data!.total,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    
    // Auto-size columns (rough estimate)
    const maxWidths = dataToExport.reduce((acc: any, row: any) => {
      Object.keys(row).forEach((key, i) => {
        const value = String(row[key]);
        acc[i] = Math.max(acc[i] || 0, value.length, key.length);
      });
      return acc;
    }, []);
    worksheet['!cols'] = maxWidths.map((w: number) => ({ w: w + 2 }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'REPORTE CONTABLE');
    XLSX.writeFile(workbook, `REPORTE_SAT_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-[#008080] font-sans text-black p-4">
      <style dangerouslySetInnerHTML={{ __html: `
        @font-face {
          font-family: 'Pixel';
          src: local('Tahoma'), local('Arial');
        }
        .retro-bevel {
          border-top: 2px solid #ffffff;
          border-left: 2px solid #ffffff;
          border-right: 2px solid #000000;
          border-bottom: 2px solid #000000;
        }
        .retro-inset {
          border-top: 2px solid #000000;
          border-left: 2px solid #000000;
          border-right: 2px solid #ffffff;
          border-bottom: 2px solid #ffffff;
        }
      `}} />

      <div className="max-w-6xl mx-auto">
        
        {/* Main Application Window */}
        <div className="bg-[#c0c0c0] retro-bevel shadow-[2px_2px_0px_rgba(0,0,0,1)]">
          
          {/* Title Bar */}
          <div className="bg-gradient-to-r from-[#000080] to-[#1084d0] p-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="bg-[#c0c0c0] p-0.5">
                <FileSearch size={14} className="text-black" />
              </div>
              <span className="text-white text-[12px] font-bold tracking-wide">ISBB XML ANALYZER Pro v1.0 [Y2K-LIGHT]</span>
            </div>
            <div className="flex gap-1">
              <button className="bg-[#c0c0c0] retro-bevel w-5 h-[18px] text-[10px] flex items-center justify-center font-bold">_</button>
              <button className="bg-[#c0c0c0] retro-bevel w-5 h-[18px] text-[10px] flex items-center justify-center font-bold">□</button>
              <button className="bg-[#c0c0c0] retro-bevel w-5 h-[18px] text-[10px] flex items-center justify-center font-bold text-red-800">X</button>
            </div>
          </div>

          {/* Menu Bar */}
          <div className="flex gap-4 px-2 py-1 border-b border-[#808080] text-[10px]">
            <span className="cursor-default hover:bg-[#000080] hover:text-white px-1">Archivo</span>
            <span className="cursor-default hover:bg-[#000080] hover:text-white px-1">Editar</span>
            <span className="cursor-default hover:bg-[#000080] hover:text-white px-1">Ver</span>
            <span className="cursor-default hover:bg-[#000080] hover:text-white px-1">Ayuda</span>
          </div>

          {/* Main Content Area */}
          <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
            
            {/* Sidebar Controls */}
            <div className="md:col-span-1 border-r border-[#808080] pr-4 space-y-4">
              <div className="bg-white retro-inset p-2">
                <p className="text-[9px] font-bold mb-2 uppercase">Subir Archivos</p>
                <label className="cursor-pointer bg-[#c0c0c0] retro-bevel p-2 flex flex-col items-center gap-2 hover:bg-[#d0d0d0] active:scale-[0.98]">
                  <Upload size={24} />
                  <span className="text-[9px] font-bold">BUSCAR XML...</span>
                  <input type="file" multiple accept=".xml" className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
                </label>
              </div>

              <div className="bg-white retro-inset p-2">
                <p className="text-[9px] font-bold mb-2 uppercase">Herramientas</p>
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={exportToExcel}
                    disabled={results.length === 0}
                    className="bg-[#c0c0c0] retro-bevel p-2 text-[9px] font-bold flex items-center gap-2 disabled:opacity-50 active:scale-[0.98]"
                  >
                    <Save size={14} /> GENERAR.XLS
                  </button>
                  <button 
                    onClick={() => setResults([])}
                    disabled={results.length === 0}
                    className="bg-[#c0c0c0] retro-bevel p-2 text-[9px] font-bold flex items-center gap-2 disabled:opacity-50 active:scale-[0.98]"
                  >
                    <Trash2 size={14} /> BORRAR LISTA
                  </button>
                </div>
              </div>

              <div className="mt-4 p-2 bg-[#ffffcc] border border-[#808080] text-[9px] font-medium">
                <div className="flex items-center gap-1 mb-1">
                  <Info size={10} />
                  <span className="font-bold uppercase">NOTAS:</span>
                </div>
                <p>Versión optimizada para bajo consumo de recursos. Procesamiento 100% servidor.</p>
              </div>
            </div>

            {/* Results Grid / Table */}
            <div className="md:col-span-3 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Monitor size={16} />
                  <span className="text-[11px] font-bold">MONITOR DE PROCESAMIENTO</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-bold">FILTRAR:</span>
                  <input 
                    type="text" 
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="retro-inset bg-white px-2 py-0.5 text-[10px] focus:outline-none w-32" 
                  />
                </div>
              </div>

              <div className="bg-white retro-inset h-[400px] overflow-auto">
                <table className="w-full text-left text-[10px] border-collapse">
                  <thead className="bg-[#c0c0c0] border-b border-black sticky top-0 z-20">
                    <tr>
                      <th className="border-r border-[#808080] px-2 py-1">Fecha</th>
                      <th className="border-r border-[#808080] px-2 py-1">Folio</th>
                      <th className="border-r border-[#808080] px-2 py-1">RFC Emisor</th>
                      <th className="border-r border-[#808080] px-2 py-1">Concepto</th>
                      <th className="border-r border-[#808080] px-2 py-1 text-right">IVA</th>
                      <th className="border-r border-[#808080] px-2 py-1 text-right">Monto Total</th>
                      <th className="px-2 py-1">Estatus</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {results.length > 0 ? (
                      [...results]
                        .filter(r => 
                          r.filename.toLowerCase().includes(filter.toLowerCase()) || 
                          r.data?.emisorRfc.toLowerCase().includes(filter.toLowerCase()) ||
                          r.data?.emisorNombre.toLowerCase().includes(filter.toLowerCase()) ||
                          r.data?.conceptos.toLowerCase().includes(filter.toLowerCase())
                        )
                        .sort((a, b) => {
                          if (!a.data || !b.data) return 0;
                          return new Date(a.data.fecha).getTime() - new Date(b.data.fecha).getTime();
                        })
                        .map((result, idx) => (
                        <tr key={idx} className="border-b border-[#eeeeee] hover:bg-[#e0e0f0]">
                          <td className="border-r border-[#eeeeee] px-2 py-1 whitespace-nowrap">
                            {result.data?.fecha ? format(parseISO(result.data.fecha), 'dd/MM/yy') : '-'}
                          </td>
                          <td className="border-r border-[#eeeeee] px-2 py-1">
                            {result.data?.folio || '-'}
                          </td>
                          <td className="border-r border-[#eeeeee] px-2 py-1 uppercase truncate max-w-[100px]">
                            {result.data?.emisorRfc || 'N/A'}
                          </td>
                          <td className="border-r border-[#eeeeee] px-2 py-1 truncate max-w-[200px]">
                            {result.data?.conceptos || result.error || 'N/A'}
                          </td>
                          <td className="border-r border-[#eeeeee] px-2 py-1 text-right">
                            ${(result.data?.impuestos.ivaTrasladado || 0).toFixed(2)}
                          </td>
                          <td className="border-r border-[#eeeeee] px-2 py-1 text-right font-bold">
                            ${(result.data?.total || 0).toFixed(2)}
                          </td>
                          <td className="px-2 py-1">
                            {result.status === 'success' ? (
                              <span className="text-green-700 font-bold">[OK]</span>
                            ) : (
                              <span className="text-red-700 font-bold">[ERR]</span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="p-20 text-center text-[#808080] italic text-[11px] font-sans">
                          &lt; SISTEMA LISTO PARA CARGA &gt;<br/>
                          (Arrastre archivos XML para analizar)
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Totals Section */}
              <div className="bg-[#ffffcc] retro-inset p-3 flex flex-wrap gap-8 justify-end text-[11px]">
                  <div className="flex flex-col items-end">
                    <span className="text-[9px] font-bold text-slate-500 uppercase">Subtotal Acumulado</span>
                    <span className="font-mono font-bold">
                      ${results.reduce((acc, curr) => acc + (curr.data?.subtotal || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[9px] font-bold text-slate-500 uppercase">IVA Acumulado</span>
                    <span className="font-mono font-bold text-blue-800">
                      ${results.reduce((acc, curr) => acc + (curr.data?.impuestos.ivaTrasladado || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[9px] font-bold text-slate-500 uppercase">Total General</span>
                    <span className="font-mono font-bold text-lg leading-none mt-1">
                      ${results.reduce((acc, curr) => acc + (curr.data?.total || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
              </div>

              {/* Status Bar */}
              <div className="bg-[#c0c0c0] retro-inset p-0.5 text-[9px] flex gap-2">
                <div className="bg-[#c0c0c0] border border-inset border-[#808080] px-2 flex-1 shadow-[inset_1px_1px_0px_#000]">
                  Registros: {results.length}
                </div>
                <div className="bg-[#c0c0c0] border border-inset border-[#808080] px-3 shadow-[inset_1px_1px_0px_#000]">
                  Ver: 1.0.4-L
                </div>
                <div className="bg-[#c0c0c0] border border-inset border-[#808080] px-3 flex items-center gap-1 shadow-[inset_1px_1px_0px_#000]">
                  <MousePointer2 size={10} /> {loading ? 'PROCESANDO...' : 'SISTEMA'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Icons */}
        <div className="mt-8 flex gap-10">
          <div className="flex flex-col items-center gap-1">
            <div className="bg-[#c0c0c0] p-1 border-2 border-white shadow-md cursor-pointer hover:bg-[#d0d0d0]">
              <Monitor size={40} className="text-blue-900" />
            </div>
            <span className="text-white text-[10px] font-bold [text-shadow:_1px_1px_0_rgb(0_0_0_/_40%)]">MI COMPUTADORA</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="bg-[#c0c0c0] p-1 border-2 border-white shadow-md cursor-pointer hover:bg-[#d0d0d0]">
              <Trash2 size={40} className="text-slate-700" />
            </div>
            <span className="text-white text-[10px] font-bold [text-shadow:_1px_1px_0_rgb(0_0_0_/_40%)]">PAPELERA</span>
          </div>
        </div>

      </div>

      {/* Taskbar */}
      <div className="fixed bottom-0 left-0 right-0 h-9 bg-[#c0c0c0] border-t-2 border-white flex items-center justify-between px-1 shadow-[0_-1px_0px_black,inset_1px_1px_0px_white]">
        <div className="flex gap-1 h-full py-1">
          <button className="bg-[#c0c0c0] retro-bevel flex items-center gap-1 px-3 shadow-[1px_1px_0px_black] active:scale-[0.98] hover:bg-[#d0d0d0]">
            <div className="bg-gradient-to-br from-green-500 to-green-800 p-0.5 rounded-sm">
               <Monitor size={12} className="text-white" />
            </div>
            <span className="font-bold text-[13px] italic tracking-tighter leading-none">Inicio</span>
          </button>
          <div className="w-[1.5px] h-full bg-[#808080] border-l border-white mx-1" />
          <div className="flex items-center gap-2 px-3 retro-inset bg-[#ececec]">
            <FileText size={14} className="text-blue-900" />
            <span className="text-[11px] font-bold truncate max-w-[100px]">ISBB XML...</span>
          </div>
        </div>
        <div className="retro-inset px-4 h-full flex items-center gap-3 bg-[#c0c0c0]">
          {loading && <Loader2 size={12} className="animate-spin text-blue-900" />}
          <span className="text-[11px] font-bold tabular-nums">{format(new Date(), 'HH:mm')}</span>
        </div>
      </div>
    </div>
  );
}
