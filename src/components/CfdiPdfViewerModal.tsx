import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { 
  FileText, 
  Download, 
  Printer, 
  Eye, 
  X, 
  FileCode, 
  CheckCircle2, 
  Copy, 
  Building2, 
  User, 
  FileSpreadsheet, 
  ShieldCheck, 
  ExternalLink,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Sparkles,
  QrCode
} from 'lucide-react';
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
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'pdf' | 'detail' | 'xml'>('pdf');
  const [pdfViewMode, setPdfViewMode] = useState<'document' | 'iframe'>('document');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(true);
  const [copiedXml, setCopiedXml] = useState<boolean>(false);
  const [copiedCadena, setCopiedCadena] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(100);

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
      
      // Generate Blob URL for raw PDF file
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

      // Generate QR Code for visual document representation
      const cleanRfcEmisor = (currentCfdi.emisorRfc || '').trim().toUpperCase();
      const cleanRfcReceptor = (currentCfdi.receptorRfc || '').trim().toUpperCase();
      const totalStr = (currentCfdi.total || 0).toFixed(6);
      const uuid = currentCfdi.uuid || '';
      const selloEight = (currentCfdi.selloCFDI || '').slice(-8);
      const satQrUrl = `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${uuid}&re=${cleanRfcEmisor}&rr=${cleanRfcReceptor}&tt=${totalStr}&fe=${selloEight}`;
      
      QRCode.toDataURL(satQrUrl, { margin: 1, width: 160 })
        .then((url) => setQrCodeDataUrl(url))
        .catch((e) => console.error('Error al generar QR de SAT:', e));
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

  const handleOpenPdfNewTab = () => {
    if (pdfBlobUrl) {
      window.open(pdfBlobUrl, '_blank');
    } else if (cfdi) {
      generateCfdiPdfBlob(cfdi).then(blob => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      });
    }
  };

  const handlePrintDocument = () => {
    window.print();
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

  const tipoComprobanteTexto = 
    cfdi.tipo === 'I' ? 'Ingreso (Factura)' :
    cfdi.tipo === 'E' ? 'Egreso (Nota de Crédito)' :
    cfdi.tipo === 'P' ? 'Pago (Complemento)' :
    cfdi.tipo === 'N' ? 'Nómina' : 'Traslado';

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[94vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden my-auto">
        
        {/* HEADER DEL MODAL */}
        <div className="p-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-base text-white">Visualizador CFDI SAT</h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                  {cfdi.version || 'CFDI 4.0'}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-bold border border-indigo-500/30">
                  {tipoComprobanteTexto}
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

          {/* TAB SWITCHER & ACTION BUTTONS */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="bg-slate-800/90 p-1 rounded-xl flex items-center gap-1 border border-slate-700">
              <button
                onClick={() => setActiveTab('pdf')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-all ${
                  activeTab === 'pdf'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <FileText className="w-3.5 h-3.5" /> Vista PDF
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
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl inline-flex items-center gap-1.5 shadow-md transition-all active:scale-95 cursor-pointer"
              title="Descargar archivo PDF comprimido"
            >
              <Download className="w-4 h-4" /> Descargar PDF
            </button>

            <button
              onClick={handleOpenPdfNewTab}
              className="px-3 py-1.5 bg-indigo-900/80 hover:bg-indigo-800 text-indigo-200 font-bold text-xs rounded-xl inline-flex items-center gap-1.5 border border-indigo-700 transition-all cursor-pointer"
              title="Abrir PDF en pestaña independiente del navegador"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Pestaña Nueva
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors ml-1 cursor-pointer"
              title="Cerrar ventana"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* SUBHEADER CONTROL BAR (FOR PDF VIEW MODE & ZOOM) */}
        {activeTab === 'pdf' && (
          <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Modo de Visualización:</span>
              <div className="bg-white p-1 rounded-lg border border-slate-300 flex items-center gap-1 shadow-2xs">
                <button
                  onClick={() => setPdfViewMode('document')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                    pdfViewMode === 'document'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  📄 Documento Imprimible (SAT)
                </button>
                <button
                  onClick={() => setPdfViewMode('iframe')}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                    pdfViewMode === 'iframe'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  🖼️ Visor Embebido (iFrame)
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {pdfViewMode === 'document' && (
                <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-slate-300 shadow-2xs">
                  <button
                    onClick={() => setZoomLevel(prev => Math.max(75, prev - 15))}
                    className="p-1 hover:bg-slate-100 rounded text-slate-600"
                    title="Reducir zoom"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-mono font-bold text-slate-700 w-12 text-center">{zoomLevel}%</span>
                  <button
                    onClick={() => setZoomLevel(prev => Math.min(150, prev + 15))}
                    className="p-1 hover:bg-slate-100 rounded text-slate-600"
                    title="Aumentar zoom"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  {zoomLevel !== 100 && (
                    <button
                      onClick={() => setZoomLevel(100)}
                      className="text-[10px] text-indigo-600 font-bold ml-1 hover:underline"
                    >
                      Restablecer
                    </button>
                  )}
                </div>
              )}

              <button
                onClick={handlePrintDocument}
                className="px-3 py-1 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-lg border border-slate-300 inline-flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600" /> Imprimir
              </button>
            </div>
          </div>
        )}

        {/* CONTENIDO PRINCIPAL SCROLLABLE */}
        <div className="flex-1 min-h-0 overflow-y-auto bg-slate-200/70 p-3 sm:p-6 space-y-4">
          
          {/* TAB 1: VISTA PREVIA PDF (DOCUMENTO IMPRIMIBLE O IFRAME) */}
          {activeTab === 'pdf' && (
            <div>
              {pdfViewMode === 'document' ? (
                /* DOCUMENTO PDF IMPRIMIBLE DE ALTA FIDELIDAD */
                <div 
                  className="mx-auto bg-white rounded-none sm:rounded-xl shadow-2xl border border-slate-300 p-6 sm:p-10 space-y-6 text-slate-900 transition-all origin-top"
                  style={{ 
                    maxWidth: '850px', 
                    transform: `scale(${zoomLevel / 100})`,
                    marginBottom: zoomLevel > 100 ? `${(zoomLevel - 100) * 4}px` : '0px'
                  }}
                >
                  {/* ENCABEZADO FISCAL SAT */}
                  <div className="border-b-2 border-slate-900 pb-4 flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 bg-slate-900 text-white font-black text-xs uppercase tracking-wider rounded">
                          SAT CFDI {cfdi.version || '4.0'}
                        </span>
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                          Comprobante Fiscal Digital por Internet
                        </span>
                      </div>
                      <h2 className="text-lg font-black text-slate-900 tracking-tight mt-1">
                        {cfdi.emisorNombre || 'EMISOR S/N'}
                      </h2>
                      <p className="text-xs font-mono font-extrabold text-indigo-900">
                        RFC: {cfdi.emisorRfc}
                      </p>
                      <p className="text-xs text-slate-600">
                        Régimen Fiscal: <span className="font-semibold">{cfdi.emisorRegimenFiscal || 'N/A'} - {cfdi.emisorRegimenFiscalDesc || ''}</span>
                      </p>
                      {cfdi.lugarExpedicion && (
                        <p className="text-xs text-slate-500">
                          Lugar de Expedición: CP {cfdi.lugarExpedicion}
                        </p>
                      )}
                    </div>

                    <div className="bg-slate-50 border border-slate-300 p-3.5 rounded-xl text-right space-y-1 font-mono text-xs w-full sm:w-auto shrink-0 shadow-2xs">
                      <div className="text-[10px] font-sans font-extrabold text-slate-500 uppercase">Tipo de Comprobante:</div>
                      <div className="font-bold text-slate-900 text-sm font-sans">{tipoComprobanteTexto}</div>
                      <div className="pt-1.5 border-t border-slate-200">
                        <span className="text-slate-500 text-[11px]">Serie / Folio: </span>
                        <span className="font-bold text-slate-900">{cfdi.serie ? `${cfdi.serie}-` : ''}{cfdi.folio || 'S/N'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px]">Fecha Emisión: </span>
                        <span className="font-bold text-slate-900">{cfdi.fecha || 'N/A'}</span>
                      </div>
                    </div>
                  </div>

                  {/* RECEPTOR DE LA FACTURA O TRABAJADOR */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                    <div className="text-[11px] font-black uppercase text-indigo-900 tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-1.5">
                      <User className="w-3.5 h-3.5 text-indigo-600" /> {cfdi.isNomina || cfdi.tipo === 'N' ? 'DATOS DEL TRABAJADOR / EMPLEADO (RECEPTOR)' : 'RECEPTOR DEL COMPROBANTE (CLIENTE)'}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="font-extrabold text-slate-900 text-sm">{cfdi.receptorNombre || 'RECEPTOR S/N'}</p>
                        <p className="font-mono font-bold text-slate-700">RFC: {cfdi.receptorRfc}</p>
                        {cfdi.isNomina && (
                          <div className="mt-1 space-y-0.5 text-slate-700 font-mono text-[11px]">
                            <p>CURP: <strong className="text-slate-900">{cfdi.nominaReceptorCurp || 'N/A'}</strong></p>
                            <p>NSS: <strong className="text-slate-900">{cfdi.nominaReceptorNss || 'N/A'}</strong></p>
                            <p>No. Empleado: <strong className="text-slate-900">{cfdi.nominaReceptorNumEmpleado || 'N/A'}</strong></p>
                          </div>
                        )}
                      </div>
                      <div className="space-y-0.5 text-slate-600">
                        {cfdi.isNomina ? (
                          <>
                            <p>Tipo Contrato: <strong className="text-slate-900">{cfdi.nominaReceptorTipoContrato || 'N/A'}</strong></p>
                            <p>Régimen Trabajador: <strong className="text-slate-900">{cfdi.nominaReceptorTipoRegimen || 'N/A'}</strong></p>
                            <p>Periodicidad: <strong className="text-slate-900">{cfdi.nominaReceptorPeriodicidadPago || 'Quincenal'}</strong> ({cfdi.nominaNumDiasPagados || 15} días pagados)</p>
                            <p>Periodo de Pago: <strong className="text-slate-900">{cfdi.nominaFechaInicialPago || ''} al {cfdi.nominaFechaFinalPago || ''}</strong></p>
                            <p>Fecha de Pago: <strong className="text-indigo-900 font-bold">{cfdi.nominaFechaPago || cfdi.fecha || ''}</strong></p>
                          </>
                        ) : (
                          <>
                            <p>Uso del CFDI: <strong className="text-slate-900">{cfdi.usoCfdi} - {cfdi.usoCfdiDesc}</strong></p>
                            <p>Régimen Fiscal Receptor: <strong className="text-slate-900">{cfdi.receptorRegimenFiscal || 'N/A'} - {cfdi.receptorRegimenFiscalDesc || ''}</strong></p>
                            {cfdi.receptorDomicilioFiscal && <p>CP Domicilio Fiscal: <strong className="text-slate-900">{cfdi.receptorDomicilioFiscal}</strong></p>}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* METODOS DE PAGO Y MONEDA */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-900 text-white p-3 rounded-xl font-mono">
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase font-sans font-bold">Moneda</span>
                      <span className="font-bold text-slate-100">{cfdi.moneda || 'MXN'} {cfdi.tipoCambio ? `(TC: ${cfdi.tipoCambio})` : ''}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase font-sans font-bold">Forma de Pago</span>
                      <span className="font-bold text-slate-100 truncate block" title={cfdi.formaPagoDesc}>{cfdi.formaPago || '99'} - {cfdi.formaPagoDesc || 'Por definir'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase font-sans font-bold">Método de Pago</span>
                      <span className="font-bold text-slate-100 truncate block" title={cfdi.metodoPagoDesc}>{cfdi.metodoPago || 'PUE'} - {cfdi.metodoPagoDesc || 'Pago en una sola exhibición'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[9px] uppercase font-sans font-bold">Tipo Comprobante</span>
                      <span className="font-bold text-slate-100">{cfdi.isNomina || cfdi.tipo === 'N' ? 'N - Nómina' : `${cfdi.tipo} - Comprobante`}</span>
                    </div>
                  </div>

                  {/* TABLA DE CONCEPTOS GENERALES */}
                  <div className="border border-slate-300 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-900 text-white font-bold uppercase text-[10px] tracking-wider">
                          <th className="p-2.5">Clave SAT</th>
                          <th className="p-2.5 text-center">Cant.</th>
                          <th className="p-2.5">Unidad</th>
                          <th className="p-2.5">Descripción de Bien o Servicio</th>
                          <th className="p-2.5 text-right">P. Unitario</th>
                          <th className="p-2.5 text-right">Descuento</th>
                          <th className="p-2.5 text-right">Importe</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {cfdi.conceptosDetalle && cfdi.conceptosDetalle.length > 0 ? (
                          cfdi.conceptosDetalle.map((c, idx) => (
                            <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                              <td className="p-2.5 font-mono text-[11px] text-slate-600 font-bold">{c.claveProdServ || '-'}</td>
                              <td className="p-2.5 text-center font-bold text-slate-900">{c.cantidad}</td>
                              <td className="p-2.5 text-slate-600">{c.claveUnidad || c.unidad || '-'}</td>
                              <td className="p-2.5 font-medium text-slate-900 max-w-xs">{c.descripcion}</td>
                              <td className="p-2.5 text-right font-mono">${(c.valorUnitario || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                              <td className="p-2.5 text-right font-mono text-slate-500">${(c.descuento || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                              <td className="p-2.5 text-right font-mono font-bold text-slate-900">${(c.importe || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))
                        ) : (
                          (cfdi.conceptos || []).map((desc, idx) => (
                            <tr key={idx} className="bg-white">
                              <td className="p-2.5 font-mono text-[11px] text-slate-600 font-bold">84111506</td>
                              <td className="p-2.5 text-center font-bold text-slate-900">1</td>
                              <td className="p-2.5 text-slate-600">ACT</td>
                              <td className="p-2.5 font-medium text-slate-900">{desc}</td>
                              <td className="p-2.5 text-right font-mono">${(cfdi.subTotal || cfdi.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                              <td className="p-2.5 text-right font-mono text-slate-500">$0.00</td>
                              <td className="p-2.5 text-right font-mono font-bold text-slate-900">${(cfdi.subTotal || cfdi.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* DESGLOSE DETALLADO DE NÓMINA (PERCEPCIONES, DEDUCCIONES Y OTROS PAGOS) */}
                  {(cfdi.isNomina || cfdi.tipo === 'N') && (
                    <div className="space-y-4 pt-2 border-t-2 border-indigo-200">
                      <div className="bg-slate-900 text-white px-3 py-2 rounded-lg text-xs font-bold tracking-wider flex items-center justify-between">
                        <span>COMPLEMENTO NÓMINA 1.2 — DESGLOSE DE CONCEPTOS DE RECIBO</span>
                        <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded uppercase">SAT Versión 1.2</span>
                      </div>

                      {/* TABLA DE PERCEPCIONES */}
                      <div className="border border-blue-200 rounded-xl overflow-hidden shadow-2xs">
                        <div className="bg-blue-700 text-white px-3 py-1.5 text-xs font-bold flex justify-between items-center">
                          <span>PERCEPCIONES (INGRESOS DEL TRABAJADOR)</span>
                          <span className="text-[11px] font-mono font-normal">Total Percepciones: ${(cfdi.nominaTotalPercepciones || cfdi.subTotal || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <table className="w-full text-left text-xs">
                          <thead className="bg-blue-50 text-blue-900 font-bold text-[10px] uppercase border-b border-blue-200">
                            <tr>
                              <th className="p-2">Clave</th>
                              <th className="p-2">Tipo SAT</th>
                              <th className="p-2">Concepto / Descripción</th>
                              <th className="p-2 text-right">Imp. Gravado</th>
                              <th className="p-2 text-right">Imp. Exento</th>
                              <th className="p-2 text-right">Importe Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-blue-100">
                            {(cfdi.percepcionesDetalle && cfdi.percepcionesDetalle.length > 0) ? (
                              cfdi.percepcionesDetalle.map((p, idx) => (
                                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-blue-50/40'}>
                                  <td className="p-2 font-mono text-slate-600 font-bold">{p.clave || p.tipoPercepcion}</td>
                                  <td className="p-2 font-mono text-slate-600">{p.tipoPercepcion} - {p.tipoPercepcionDesc || 'Sueldos'}</td>
                                  <td className="p-2 font-medium text-slate-900">{p.concepto}</td>
                                  <td className="p-2 text-right font-mono text-slate-700">${(p.importeGravado || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                                  <td className="p-2 text-right font-mono text-slate-700">${(p.importeExento || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                                  <td className="p-2 text-right font-mono font-bold text-blue-900">${(p.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                                </tr>
                              ))
                            ) : (
                              <tr className="bg-white">
                                <td className="p-2 font-mono text-slate-600 font-bold">001</td>
                                <td className="p-2 font-mono text-slate-600">001 - Sueldos y Salarios</td>
                                <td className="p-2 font-medium text-slate-900">Sueldos, Salarios Rayas y Jornales</td>
                                <td className="p-2 text-right font-mono text-slate-700">${(cfdi.percepcionSueldo || cfdi.subTotal || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                                <td className="p-2 text-right font-mono text-slate-700">$0.00</td>
                                <td className="p-2 text-right font-mono font-bold text-blue-900">${(cfdi.percepcionSueldo || cfdi.subTotal || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* TABLA DE DEDUCCIONES */}
                      <div className="border border-rose-200 rounded-xl overflow-hidden shadow-2xs">
                        <div className="bg-rose-700 text-white px-3 py-1.5 text-xs font-bold flex justify-between items-center">
                          <span>DEDUCCIONES (DESCUENTOS / RETENCIONES)</span>
                          <span className="text-[11px] font-mono font-normal">Total Deducciones: ${(cfdi.nominaTotalDeducciones || cfdi.descuento || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <table className="w-full text-left text-xs">
                          <thead className="bg-rose-50 text-rose-900 font-bold text-[10px] uppercase border-b border-rose-200">
                            <tr>
                              <th className="p-2">Clave</th>
                              <th className="p-2">Tipo SAT</th>
                              <th className="p-2">Concepto / Descripción</th>
                              <th className="p-2 text-right">Importe Deducción</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-rose-100">
                            {(cfdi.deduccionesDetalle && cfdi.deduccionesDetalle.length > 0) ? (
                              cfdi.deduccionesDetalle.map((d, idx) => (
                                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-rose-50/40'}>
                                  <td className="p-2 font-mono text-slate-600 font-bold">{d.clave || d.tipoDeduccion}</td>
                                  <td className="p-2 font-mono text-slate-600">{d.tipoDeduccion} - {d.tipoDeduccionDesc || 'Deducción'}</td>
                                  <td className="p-2 font-medium text-slate-900">{d.concepto}</td>
                                  <td className="p-2 text-right font-mono font-bold text-rose-700">-${(d.importe || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                                </tr>
                              ))
                            ) : (
                              [
                                ...(cfdi.deduccionIsr ? [{ clave: '001', tipoDeduccion: '001', tipoDeduccionDesc: 'Retención ISR', concepto: 'Retención de Impuesto Sobre la Renta (ISR)', importe: cfdi.deduccionIsr }] : []),
                                ...(cfdi.deduccionImss ? [{ clave: '002', tipoDeduccion: '002', tipoDeduccionDesc: 'Cuota IMSS', concepto: 'Aportaciones Seguridad Social (IMSS)', importe: cfdi.deduccionImss }] : [])
                              ].map((d, idx) => (
                                <tr key={idx} className="bg-white">
                                  <td className="p-2 font-mono text-slate-600 font-bold">{d.clave}</td>
                                  <td className="p-2 font-mono text-slate-600">{d.tipoDeduccion} - {d.tipoDeduccionDesc}</td>
                                  <td className="p-2 font-medium text-slate-900">{d.concepto}</td>
                                  <td className="p-2 text-right font-mono font-bold text-rose-700">-${(d.importe || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* TABLA DE OTROS PAGOS (SI EXISTE) */}
                      {cfdi.otrosPagosDetalle && cfdi.otrosPagosDetalle.length > 0 && (
                        <div className="border border-emerald-200 rounded-xl overflow-hidden shadow-2xs">
                          <div className="bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold flex justify-between items-center">
                            <span>OTROS PAGOS (SUBSIDIOS Y REEMBOLSOS)</span>
                            <span className="text-[11px] font-mono font-normal">Total Otros Pagos: ${(cfdi.nominaTotalOtrosPagos || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <table className="w-full text-left text-xs">
                            <thead className="bg-emerald-50 text-emerald-900 font-bold text-[10px] uppercase border-b border-emerald-200">
                              <tr>
                                <th className="p-2">Clave</th>
                                <th className="p-2">Tipo SAT</th>
                                <th className="p-2">Concepto / Descripción</th>
                                <th className="p-2 text-right">Subsidio Causado</th>
                                <th className="p-2 text-right">Importe</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-emerald-100">
                              {cfdi.otrosPagosDetalle.map((op, idx) => (
                                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-emerald-50/40'}>
                                  <td className="p-2 font-mono text-slate-600 font-bold">{op.clave || op.tipoOtroPago}</td>
                                  <td className="p-2 font-mono text-slate-600">{op.tipoOtroPago} - {op.tipoOtroPagoDesc}</td>
                                  <td className="p-2 font-medium text-slate-900">{op.concepto}</td>
                                  <td className="p-2 text-right font-mono text-slate-600">{op.subsidioCausado !== undefined ? `$${op.subsidioCausado.toFixed(2)}` : 'N/A'}</td>
                                  <td className="p-2 text-right font-mono font-bold text-emerald-700">+${(op.importe || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* IMPORTE CON LETRA Y RESUMEN DE TOTALES */}
                  <div className="flex flex-col sm:flex-row gap-4 items-start justify-between">
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex-1 space-y-1 w-full">
                      <div className="text-[10px] font-black uppercase text-slate-500">
                        {cfdi.isNomina || cfdi.tipo === 'N' ? 'Importe Neto Recibido en Letra:' : 'Importe Total con Letra:'}
                      </div>
                      <div className="text-xs font-bold text-indigo-950 bg-indigo-50/80 p-2.5 rounded-lg border border-indigo-100 font-mono">
                        {numeroALetras(cfdi.isNomina ? (cfdi.nominaNeto || cfdi.total) : cfdi.total, cfdi.moneda || 'MXN')}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-300 w-full sm:w-80 space-y-1.5 text-xs">
                      {cfdi.isNomina || cfdi.tipo === 'N' ? (
                        <>
                          <div className="flex justify-between text-slate-700">
                            <span>(+) Total Percepciones:</span>
                            <span className="font-mono font-bold text-blue-900">+${(cfdi.nominaTotalPercepciones || cfdi.subTotal || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                          </div>
                          {(cfdi.nominaTotalOtrosPagos || 0) > 0 && (
                            <div className="flex justify-between text-emerald-700">
                              <span>(+) Total Otros Pagos:</span>
                              <span className="font-mono font-bold">+${cfdi.nominaTotalOtrosPagos?.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-rose-600">
                            <span>(-) Total Deducciones:</span>
                            <span className="font-mono font-bold">-${(cfdi.nominaTotalDeducciones || cfdi.descuento || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="pt-2 border-t-2 border-slate-900 flex justify-between text-sm font-black text-slate-900">
                            <span>NETO A PAGAR:</span>
                            <span className="font-mono text-emerald-700 font-extrabold">${(cfdi.nominaNeto || cfdi.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between text-slate-600">
                            <span>Subtotal:</span>
                            <span className="font-mono font-bold text-slate-900">${(cfdi.subTotal || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                          </div>
                          {cfdi.descuento > 0 && (
                            <div className="flex justify-between text-rose-600">
                              <span>Descuento:</span>
                              <span className="font-mono font-bold">-${cfdi.descuento.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                            </div>
                          )}
                          {cfdi.ivaTrasladado > 0 && (
                            <div className="flex justify-between text-emerald-700">
                              <span>IVA Trasladado (16%):</span>
                              <span className="font-mono font-bold">+${cfdi.ivaTrasladado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                            </div>
                          )}
                          {cfdi.ivaRetenido > 0 && (
                            <div className="flex justify-between text-rose-600">
                              <span>Retención IVA:</span>
                              <span className="font-mono font-bold">-${cfdi.ivaRetenido.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                            </div>
                          )}
                          {cfdi.isrRetenido > 0 && (
                            <div className="flex justify-between text-rose-600">
                              <span>Retención ISR:</span>
                              <span className="font-mono font-bold">-${cfdi.isrRetenido.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                            </div>
                          )}
                          <div className="pt-2 border-t-2 border-slate-900 flex justify-between text-sm font-black text-slate-900">
                            <span>TOTAL:</span>
                            <span className="font-mono text-indigo-900">${(cfdi.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} {cfdi.moneda || 'MXN'}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* TIMBRE FISCAL DIGITAL Y QR CODE */}
                  <div className="border-t-2 border-slate-900 pt-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-black uppercase text-slate-900 tracking-wider">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" /> TIMBRE FISCAL DIGITAL DEL SAT (COMPLEMENTO TFD)
                    </div>

                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 bg-slate-950 text-slate-200 p-4 rounded-xl font-mono text-[10px] overflow-hidden">
                      {/* QR Code SAT */}
                      {qrCodeDataUrl ? (
                        <div className="bg-white p-2 rounded-lg shrink-0 border border-slate-300 flex flex-col items-center">
                          <img src={qrCodeDataUrl} alt="QR Validador SAT" className="w-28 h-28 object-contain" />
                          <span className="text-[8px] font-sans text-slate-600 font-bold mt-1">Validador SAT</span>
                        </div>
                      ) : (
                        <div className="w-28 h-28 bg-slate-800 rounded-lg shrink-0 flex items-center justify-center text-slate-500">
                          <QrCode className="w-8 h-8" />
                        </div>
                      )}

                      {/* Metadatos y Sellos */}
                      <div className="space-y-1.5 flex-1 w-full min-w-0">
                        <div>
                          <span className="text-emerald-400 font-bold">Folio Fiscal UUID: </span>
                          <strong className="text-white select-all">{cfdi.uuid || 'N/A'}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400">No. Certificado Emisor: </span>
                          <span className="text-slate-200">{cfdi.noCertificado || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">No. Certificado SAT: </span>
                          <span className="text-slate-200">{cfdi.noCertificadoSAT || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Fecha y Hora de Certificación: </span>
                          <span className="text-slate-200">{cfdi.fechaTimbrado || cfdi.fecha || 'N/A'}</span>
                        </div>

                        <div className="pt-1 border-t border-slate-800">
                          <span className="text-slate-400 block font-bold text-[9px]">Sello Digital del CFDI:</span>
                          <p className="text-slate-400 truncate text-[9px] font-mono select-all bg-slate-900 p-1 rounded mt-0.5" title={cfdi.selloCFDI}>
                            {cfdi.selloCFDI || 'N/A'}
                          </p>
                        </div>

                        <div>
                          <span className="text-slate-400 block font-bold text-[9px]">Sello del SAT:</span>
                          <p className="text-slate-400 truncate text-[9px] font-mono select-all bg-slate-900 p-1 rounded mt-0.5" title={cfdi.selloSAT}>
                            {cfdi.selloSAT || 'N/A'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-400 text-center pt-2 border-t border-slate-200 font-mono">
                    Este documento es una representación impresa de un CFDI de acuerdo con la Resolución Miscelánea Fiscal vigente.
                  </div>
                </div>
              ) : (
                /* VISOR EMBEBIDO (IFRAME) CON AVISO DE DESBLOQUEO PARA CHROME */
                <div className="space-y-3">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        Si su navegador (Google Chrome) bloquea el visor embebido con la leyenda <em>"Google bloqueó esta página"</em>, haga clic en <strong>Abrir en Nueva Pestaña</strong> o cambie a la <strong>Vista Documento Imprimible (SAT)</strong> superior.
                      </span>
                    </div>
                    <button
                      onClick={handleOpenPdfNewTab}
                      className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg shrink-0 inline-flex items-center gap-1 shadow-2xs"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Abrir en Pestaña Nueva
                    </button>
                  </div>

                  {isGeneratingPdf ? (
                    <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow-md border border-slate-300 min-h-[500px]">
                      <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                      <p className="font-bold text-sm text-slate-700 mt-3">Compilando representación PDF en memoria...</p>
                    </div>
                  ) : pdfBlobUrl ? (
                    <iframe
                      src={pdfBlobUrl}
                      title="Factura SAT PDF"
                      className="w-full h-[650px] min-h-[500px] rounded-xl bg-white shadow-xl border border-slate-300"
                    />
                  ) : (
                    <div className="p-8 text-center text-slate-500 bg-white rounded-xl border border-slate-300">
                      No se pudo inicializar el visor embebido. Puede descargarlo directamente usando el botón superior.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: DESGLOSE FISCAL VISUAL INTERACTIVO */}
          {activeTab === 'detail' && (
            <div className="space-y-6">
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
                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs flex-1 space-y-1.5 w-full">
                  <div className="text-xs font-bold text-slate-700">Importe en Letra:</div>
                  <div className="text-xs font-bold text-indigo-900 bg-indigo-50 p-2.5 rounded-lg border border-indigo-100 font-mono">
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

          {/* TAB 3: XML RAW ESTRUCTURA CODE */}
          {activeTab === 'xml' && (
            <div className="w-full rounded-xl bg-slate-950 text-emerald-300 font-mono text-xs overflow-hidden border border-slate-800 shadow-xl">
              <div className="p-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-slate-300 font-sans">
                <span className="font-bold text-xs flex items-center gap-1.5">
                  <FileCode className="w-4 h-4 text-emerald-400" /> {fileName}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyXml}
                    className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-lg inline-flex items-center gap-1.5 border border-slate-700 transition-all cursor-pointer"
                  >
                    {copiedXml ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedXml ? '¡Copiado!' : 'Copiar XML'}
                  </button>
                  <button
                    onClick={handleDownloadXml}
                    className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs rounded-lg inline-flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" /> Descargar XML
                  </button>
                </div>
              </div>
              <div className="p-4 overflow-auto max-h-[600px]">
                <pre className="whitespace-pre-wrap break-all">{xmlContent || cfdi.fileContent || 'Contenido XML no disponible'}</pre>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
