import React, { useState, useEffect } from 'react';
import { FileText, Download, Printer, Eye, X, FileCode, CheckCircle2, Copy, Sparkles, Building2, User, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import { ParsedCFDI, parseXMLData } from '../utils/xmlParser';
import { generateCfdiPdfBlob, downloadCfdiPdf, numeroALetras } from '../utils/cfdiPdfGenerator';

interface CfdiPdfViewerModalProps {
  xmlContent?: string;
  parsedCfdi?: ParsedCFDI;
  fileName?: string;
  onClose: () => void;
}

export const CfdiPdfViewerModal: React.FC<CfdiPdfViewerModalProps> = ({
  xmlContent,
  parsedCfdi: initialParsedCfdi,
  fileName = 'factura.xml',
  onClose
}) => {
  const [cfdi, setCfdi] = useState<ParsedCFDI | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pdf' | 'xml' | 'detail'>('pdf');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(true);
  const [copiedXml, setCopiedXml] = useState<boolean>(false);

  useEffect(() => {
    let currentCfdi: ParsedCFDI | null = null;
    if (initialParsedCfdi) {
      currentCfdi = initialParsedCfdi;
    } else if (xmlContent) {
      currentCfdi = parseXMLData(xmlContent, fileName);
    }

    setCfdi(currentCfdi);

    if (currentCfdi) {
      setIsGeneratingPdf(true);
      generateCfdiPdfBlob(currentCfdi)
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          setPdfBlobUrl(url);
        })
        .catch((err) => {
          console.error('Error al generar PDF de CFDI:', err);
        })
        .finally(() => {
          setIsGeneratingPdf(false);
        });
    }

    return () => {
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, [xmlContent, initialParsedCfdi, fileName]);

  const handleDownloadPdf = () => {
    if (cfdi) {
      downloadCfdiPdf(cfdi, `Factura_SAT_${cfdi.emisorRfc}_${cfdi.folio || cfdi.uuid?.substring(0, 8) || 'CFDI'}.pdf`);
    }
  };

  const handleDownloadXml = () => {
    const rawXml = xmlContent || cfdi?.fileContent;
    if (!rawXml) return;
    const blob = new Blob([rawXml], { type: 'text/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.endsWith('.xml') ? fileName : `${fileName}.xml`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  };

  const handleCopyXml = () => {
    const rawXml = xmlContent || cfdi?.fileContent;
    if (rawXml) {
      navigator.clipboard.writeText(rawXml);
      setCopiedXml(true);
      setTimeout(() => setCopiedXml(false), 2000);
    }
  };

  if (!cfdi) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-6 overflow-hidden animate-fade-in">
      <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header Modal */}
        <div className="p-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white">Factura SAT - Vista Previa CFDI</h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                  {cfdi.version || 'CFDI 4.0'}
                </span>
                {cfdi.isCancelada && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-bold border border-rose-500/30">
                    CANCELADA
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                <span>Folio Fiscal UUID: <strong className="font-mono text-slate-200">{cfdi.uuid || cfdi.folio || 'S/N'}</strong></span>
              </p>
            </div>
          </div>

          {/* Navigation tabs & Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="bg-slate-800/80 p-1 rounded-xl flex items-center gap-1 border border-slate-700">
              <button
                onClick={() => setActiveTab('pdf')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${
                  activeTab === 'pdf'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <FileText className="w-3.5 h-3.5" /> Representación PDF
              </button>
              <button
                onClick={() => setActiveTab('detail')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${
                  activeTab === 'detail'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Desglose Fiscal
              </button>
              <button
                onClick={() => setActiveTab('xml')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${
                  activeTab === 'xml'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" /> Estructura XML
              </button>
            </div>

            <button
              onClick={handleDownloadPdf}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl inline-flex items-center gap-1.5 shadow-md transition-all active:scale-95"
              title="Descargar Factura en PDF"
            >
              <Download className="w-4 h-4" /> Descargar PDF
            </button>

            {(xmlContent || cfdi.fileContent) && (
              <button
                onClick={handleDownloadXml}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl inline-flex items-center gap-1.5 border border-slate-700 transition-all"
                title="Descargar XML Original"
              >
                <Download className="w-3.5 h-3.5" /> XML
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-hidden bg-slate-100 relative">
          {/* TAB 1: PDF PREVIEW */}
          {activeTab === 'pdf' && (
            <div className="w-full h-full flex flex-col items-center justify-center p-2 sm:p-4 overflow-auto">
              {isGeneratingPdf ? (
                <div className="flex flex-col items-center gap-3 p-8 bg-white rounded-2xl shadow-lg border border-slate-200">
                  <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="font-bold text-sm text-slate-700">Generando vista en formato PDF de la factura SAT...</p>
                </div>
              ) : pdfBlobUrl ? (
                <iframe
                  src={pdfBlobUrl}
                  title="Factura SAT PDF"
                  className="w-full h-full min-h-[600px] rounded-xl bg-white shadow-xl border border-slate-300"
                />
              ) : (
                <div className="p-8 text-center text-slate-500">
                  No se pudo cargar la vista previa del PDF. Puede descargarlo directamente usando el botón superior.
                </div>
              )}
            </div>
          )}

          {/* TAB 2: DESGLOSE FISCAL VISUAL */}
          {activeTab === 'detail' && (
            <div className="w-full h-full overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-50">
              {/* Resumen General Card */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Emisor */}
                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase tracking-wider">
                    <Building2 className="w-4 h-4" /> Datos del Emisor (Quien Expide)
                  </div>
                  <div className="font-extrabold text-slate-900 text-base">{cfdi.emisorNombre}</div>
                  <div className="text-xs text-slate-600 font-mono">RFC: <strong className="text-slate-900">{cfdi.emisorRfc}</strong></div>
                  <div className="text-xs text-slate-600">Régimen: {cfdi.emisorRegimenFiscal} - {cfdi.emisorRegimenFiscalDesc}</div>
                  {cfdi.lugarExpedicion && (
                    <div className="text-xs text-slate-500">Lugar de Expedición: CP {cfdi.lugarExpedicion}</div>
                  )}
                </div>

                {/* Receptor */}
                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs uppercase tracking-wider">
                    <User className="w-4 h-4" /> Datos del Receptor (Cliente / Receptor)
                  </div>
                  <div className="font-extrabold text-slate-900 text-base">{cfdi.receptorNombre}</div>
                  <div className="text-xs text-slate-600 font-mono">RFC: <strong className="text-slate-900">{cfdi.receptorRfc}</strong></div>
                  <div className="text-xs text-slate-600">Uso CFDI: {cfdi.usoCfdi} - {cfdi.usoCfdiDesc}</div>
                  {cfdi.receptorRegimenFiscal && (
                    <div className="text-xs text-slate-600">Régimen Receptor: {cfdi.receptorRegimenFiscal} - {cfdi.receptorRegimenFiscalDesc}</div>
                  )}
                </div>
              </div>

              {/* Detalle de Conceptos Table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="p-3 bg-slate-100 border-b border-slate-200 font-bold text-xs text-slate-800 flex items-center justify-between">
                  <span>Conceptos / Partidas Facturadas ({cfdi.conceptosDetalle?.length || cfdi.conceptos.length})</span>
                  <span className="text-[11px] font-normal text-slate-500">Forma de Pago: {cfdi.formaPago} | Método: {cfdi.metodoPago}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Clave P/S</th>
                        <th className="p-2.5">Cant.</th>
                        <th className="p-2.5">Unidad</th>
                        <th className="p-2.5">Descripción</th>
                        <th className="p-2.5 text-right">P. Unitario</th>
                        <th className="p-2.5 text-right">Descuento</th>
                        <th className="p-2.5 text-right">Importe</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(cfdi.conceptosDetalle || []).map((c, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2.5 font-mono text-[11px] text-slate-600">{c.claveProdServ || '-'}</td>
                          <td className="p-2.5 font-bold">{c.cantidad}</td>
                          <td className="p-2.5 text-slate-600">{c.claveUnidad || c.unidad || '-'}</td>
                          <td className="p-2.5 font-medium text-slate-900 max-w-xs">{c.descripcion}</td>
                          <td className="p-2.5 text-right font-mono">${(c.valorUnitario || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2.5 text-right font-mono text-slate-500">${(c.descuento || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                          <td className="p-2.5 text-right font-mono font-bold text-slate-900">${(c.importe || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Subtotales y Totales */}
              <div className="flex flex-col md:flex-row gap-4 items-start justify-between">
                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex-1 space-y-1.5">
                  <div className="text-xs font-bold text-slate-700">Importe en Letra:</div>
                  <div className="text-xs font-bold text-indigo-900 bg-indigo-50 p-2.5 rounded-lg border border-indigo-100">
                    {numeroALetras(cfdi.total, cfdi.moneda || 'MXN')}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs w-full md:w-80 space-y-2">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Subtotal:</span>
                    <span className="font-mono font-bold">${(cfdi.subTotal || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {cfdi.descuento > 0 && (
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>Descuento:</span>
                      <span className="font-mono font-bold text-rose-600">-${cfdi.descuento.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {cfdi.ivaTrasladado > 0 && (
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>IVA Trasladado (16%):</span>
                      <span className="font-mono font-bold text-emerald-600">+${cfdi.ivaTrasladado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {cfdi.ivaRetenido > 0 && (
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>Retención IVA:</span>
                      <span className="font-mono font-bold text-rose-600">-${cfdi.ivaRetenido.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  {cfdi.isrRetenido > 0 && (
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>Retención ISR:</span>
                      <span className="font-mono font-bold text-rose-600">-${cfdi.isrRetenido.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-extrabold text-slate-900">
                    <span>TOTAL:</span>
                    <span className="font-mono text-indigo-700">${(cfdi.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span>
                  </div>
                </div>
              </div>

              {/* Sello Timbre Digital */}
              <div className="p-4 rounded-xl bg-slate-900 text-slate-200 space-y-2 font-mono text-[11px] overflow-hidden">
                <div className="flex items-center gap-2 text-emerald-400 font-bold font-sans text-xs">
                  <ShieldCheck className="w-4 h-4" /> Timbre Fiscal Digital SAT (TFD)
                </div>
                <div>Folio Fiscal UUID: <strong className="text-white">{cfdi.uuid || 'N/A'}</strong></div>
                <div>No. Certificado SAT: <span className="text-slate-300">{cfdi.noCertificadoSAT || 'N/A'}</span></div>
                <div className="truncate">Sello Digital CFDI: <span className="text-slate-400">{cfdi.selloCFDI || 'N/A'}</span></div>
                <div className="truncate">Sello SAT: <span className="text-slate-400">{cfdi.selloSAT || 'N/A'}</span></div>
              </div>
            </div>
          )}

          {/* TAB 3: XML ESTRUCTURA CODE */}
          {activeTab === 'xml' && (
            <div className="w-full h-full flex flex-col bg-slate-950 text-emerald-300 font-mono text-xs overflow-hidden">
              <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-slate-300 font-sans">
                <span className="font-bold text-xs flex items-center gap-1.5">
                  <FileCode className="w-4 h-4 text-emerald-400" /> {fileName}
                </span>
                <button
                  onClick={handleCopyXml}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-lg inline-flex items-center gap-1.5 border border-slate-700 transition-all"
                >
                  {copiedXml ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedXml ? '¡Copiado!' : 'Copiar XML'}
                </button>
              </div>
              <div className="flex-1 p-4 overflow-auto">
                <pre className="whitespace-pre-wrap break-all">{xmlContent || cfdi.fileContent || 'Contenido XML no disponible'}</pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
