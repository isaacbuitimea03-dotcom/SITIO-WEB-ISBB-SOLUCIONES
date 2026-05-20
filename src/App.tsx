import React, { useState, useRef } from 'react';
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
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const appScriptUrl = 'https://script.google.com/macros/s/AKfycbyQ6utU_Qd7RwtVkLe7wh_7y1ws47t0Qplyyb2lazMRdYS9WR-njmM7CjjkhI2NRMKx/exec';
  const [iframeKey, setIframeKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  const handleRefresh = () => {
    setLoading(true);
    setIframeKey(prev => prev + 1);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(appScriptUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-gold-gradient shadow-xl sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 backdrop-blur-md p-2.5 rounded-xl border border-white/20">
              <FileSpreadsheet className="text-wheat w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter text-white leading-none">
                ISBB <span className="text-wheat">SOLUCIONES</span>
              </h1>
              <p className="text-[10px] text-wheat/70 font-medium uppercase tracking-[0.2em] mt-1">Portal de Inteligencia SAT</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a 
              href={appScriptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-2 bg-white/15 hover:bg-white/20 text-wheat hover:text-white transition-all text-xs font-bold uppercase tracking-wider px-4.5 py-2.5 rounded-xl border border-white/10"
            >
              <ExternalLink className="w-4 h-4" />
              Abrir Web App Externa
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 md:py-12 flex flex-col gap-8">
        
        {/* Banner de Integración del Sistema */}
        <div className="bg-slate-900 rounded-3xl p-6 md:p-8 text-white relative overflow-hidden shadow-xl border border-slate-800">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] bg-amber-500/10 text-wheat font-black uppercase tracking-wider border border-amber-500/20">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Nuevo Módulo Activo
              </span>
              <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                Integración de Reportes con <span className="text-wheat">Google Apps Script</span>
              </h2>
              <p className="text-slate-300 text-sm leading-relaxed">
                Hemos actualizado la plataforma migrando del extractor manual local a un potente sistema automatizado en la nube con Google Workspace. Procesamiento de altos volúmenes de XML sin límites y generación directa en Google Sheets.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a 
                href={appScriptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 bg-wheat text-slate-900 hover:bg-white px-5 py-3 rounded-2xl font-black text-sm tracking-wide transition-all shadow-md uppercase"
              >
                <ExternalLink className="w-4 h-4" /> Lanzar Pestaña Directa
              </a>
              <button 
                onClick={handleRefresh}
                className="flex items-center justify-center p-3 bg-white/10 hover:bg-white/15 text-white rounded-2xl border border-white/10 transition-all"
                title="Recargar visor"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          </div>
          {/* Ambient gradients */}
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-wheat/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-gold-900/30 rounded-full blur-3xl" />
        </div>

        {/* Workspace Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Sidebar - Información de la Plataforma */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Tarjeta de Estado & Características */}
            <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200/80 shadow-md">
              <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <CloudLightning className="w-5 h-5 text-gold-600" />
                Detalles del Módulo
              </h3>
              
              <div className="space-y-5">
                <div className="flex gap-4">
                  <div className="bg-emerald-50 text-emerald-600 p-2.5 rounded-xl border border-emerald-100 h-10 w-10 shrink-0 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Conexión Segura</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      La aplicación de Google se ejecuta encriptada bajo la infraestructura de Google Cloud con el certificado único de Apps Script.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="bg-amber-50 text-amber-600 p-2.5 rounded-xl border border-amber-100 h-10 w-10 shrink-0 flex items-center justify-center">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Reportes Compartidos</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Guarda, filtra, comparte y descarga los reportes consolidados directamente en formato Excel y Google Sheets con tu equipo de trabajo.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="bg-blue-50 text-blue-600 p-2.5 rounded-xl border border-blue-100 h-10 w-10 shrink-0 flex items-center justify-center">
                    <Monitor className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">Interfaz Automatizada</h4>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Sube tus XML, asocia tus cuentas y deja que los macros automatizados realicen las conciliaciones fiscales por ti.
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 mt-6 pt-6 space-y-3">
                <button 
                  onClick={handleCopyLink}
                  className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-gold-50/50 hover:border-gold-300 rounded-2xl border border-slate-200 text-xs font-semibold text-slate-600 transition-all group"
                >
                  <span className="truncate pr-4 text-slate-500">{appScriptUrl}</span>
                  {copied ? (
                    <span className="flex items-center gap-1 text-emerald-600 shrink-0 font-bold">
                      <Check className="w-4 h-4" /> Copiado
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-400 group-hover:text-gold-700 shrink-0">
                      <Copy className="w-4 h-4" /> Copiar URL
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Aviso de Autenticación de Google */}
            <div className="bg-amber-50/70 border border-amber-200 rounded-3xl p-6 md:p-8 space-y-4 shadow-sm">
              <div className="flex items-start gap-3">
                <HelpCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-amber-800">¿Pantalla en Blanco o Solicitud de Acceso?</h4>
                  <p className="text-xs text-amber-700/90 leading-relaxed">
                    Las medidas de seguridad de Google a veces bloquean el inicio de sesión dentro de marcos (iframes) del sitio. 
                  </p>
                </div>
              </div>
              <p className="text-xs text-amber-700 leading-relaxed">
                Si visualizas una pantalla de inicio de sesión de Google que no responde, o un error de acceso:
              </p>
              <ol className="list-decimal list-inside text-xs text-amber-800 space-y-2 pl-1 font-medium">
                <li>Haz clic en el botón de <span className="font-bold">"Lanzar Pestaña Directa"</span> arriba.</li>
                <li>Inicia sesión con tu cuenta de Google del SAT autorizada de forma externa.</li>
                <li>¡Regresa a esta página o continúa trabajando interactuando directamente en ella!</li>
              </ol>
            </div>

          </div>

          {/* Main Panel - Interactive Embedded Apps Script */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            
            {/* Mock Navegador / Cabecera del Visor */}
            <div className="bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden flex flex-col">
              
              {/* Toolbar */}
              <div className="bg-slate-900 text-white px-5 py-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  {/* Puntos de ventana de SO */}
                  <div className="flex gap-1.5 shrink-0">
                    <span className="w-3 h-3 rounded-full bg-red-400 inline-block" />
                    <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
                    <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" />
                  </div>
                  <span className="text-xs text-slate-400 font-mono tracking-tight hidden sm:inline-block bg-white/5 border border-white/10 px-3 py-1 rounded-lg">
                    https://script.google.com/macros/s/...
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-black uppercase tracking-wider">
                    Conectado
                  </span>
                  <button 
                    onClick={handleRefresh}
                    className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 transition-colors font-bold"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    Actualizar
                  </button>
                </div>
              </div>

              {/* Contenedor del Iframe */}
              <div className="relative bg-white flex-1" style={{ minHeight: '620px' }}>
                {loading && (
                  <div className="absolute inset-0 bg-slate-50/90 z-10 flex flex-col items-center justify-center text-center p-8">
                    <div className="w-12 h-12 border-4 border-slate-200 border-t-gold-shiny rounded-full animate-spin mb-4" />
                    <h3 className="text-lg font-bold text-slate-800">Conectando con Google Web App...</h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">Estableciendo canal seguro con Google Apps Script</p>
                  </div>
                )}
                
                <iframe 
                  key={iframeKey}
                  src={appScriptUrl}
                  onLoad={() => setLoading(false)}
                  className="w-full h-[620px] md:h-[720px] lg:h-[780px] border-none block"
                  allow="geolocation; microphone; camera"
                  sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                />
              </div>

            </div>

          </div>

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
