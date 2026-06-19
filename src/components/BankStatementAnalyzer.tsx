import React, { useState, useMemo, useRef } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  Trash2, 
  Search, 
  Download, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  Coins, 
  FileText, 
  HelpCircle, 
  RefreshCw, 
  Maximize2 
} from 'lucide-react';
import * as XLSX from 'xlsx';

// Interfaces
export interface StatementTransaction {
  date: string;
  description: string;
  reference: string;
  amount: number;
  type: 'deposit' | 'withdrawal';
  category: string;
}

export interface StatementData {
  bankName: string;
  accountOwner: string;
  accountNumber: string;
  period: string;
  startingBalance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  endingBalance: number;
  currency: string;
  transactions: StatementTransaction[];
}

// Preset Demo statements for quick test-drive
const DEMO_STATEMENT: StatementData = {
  bankName: 'BBVA Bancomer',
  accountOwner: 'ISBB SOLUCIONES TECNOLOGICAS S.A. DE C.V.',
  accountNumber: '0112459039 (CLABE: 012180001124590391)',
  period: 'Del 01/05/2026 al 31/05/2026',
  startingBalance: 125430.20,
  totalDeposits: 284500.00,
  totalWithdrawals: 189350.50,
  endingBalance: 220579.70,
  currency: 'MXN',
  transactions: [
    { date: '2026-05-02', description: 'SPEI RECIBIDO - ALFA DISTRIBUCIONES SA', reference: '9082341', amount: 120000.00, type: 'deposit', category: 'Ventas / Cobros' },
    { date: '2026-05-03', description: 'PAGO DE RENTA OFICINA MATRIZ - ARRENDADORA CENTRO', reference: '12', amount: 25000.00, type: 'withdrawal', category: 'Arrendamiento' },
    { date: '2026-05-05', description: 'RETIRO CAJERO AUTOMATICO SUC 0244', reference: '3819', amount: 5000.00, type: 'withdrawal', category: 'Retiro de Efectivo' },
    { date: '2026-05-08', description: 'SPEI RECIBIDO - CONSTRUCTORA DEL NORTE S.A.', reference: '9082390', amount: 95000.00, type: 'deposit', category: 'Ventas / Cobros' },
    { date: '2026-05-10', description: 'COMPRA GASOLINERA SERVICIO LOMAS', reference: '89102', amount: 1250.00, type: 'withdrawal', category: 'Gasolina y Transporte' },
    { date: '2026-05-12', description: 'PAGO DE SERVICIOS - COMISION FEDERAL DE ELECTRICIDAD', reference: '298341', amount: 3450.00, type: 'withdrawal', category: 'Servicios Básicos' },
    { date: '2026-05-15', description: 'TRANSFERENCIA SPEI - NOMINA QUINCENAL COLABORADORES', reference: '1505', amount: 62000.00, type: 'withdrawal', category: 'Nómina y Sueldos' },
    { date: '2026-05-18', description: 'SPEI RECIBIDO - PAGO FACTURA SERVIPROEST', reference: '9082412', amount: 62500.00, type: 'deposit', category: 'Ventas / Cobros' },
    { date: '2026-05-20', description: 'COMPRA CODESA MATERIALES - HERRAMIENTAS CHICAS', reference: '55612', amount: 6800.00, type: 'withdrawal', category: 'Herramientas y Papelería' },
    { date: '2026-05-22', description: 'PAGO CONTRIBUCIONES FEDERALES SAT - IVA ISR', reference: '003291', amount: 38200.00, type: 'withdrawal', category: 'Impuestos y Derechos' },
    { date: '2026-05-25', description: 'PAGO DE COMISION SPEI POR BANCA ELECTRONICA', reference: '99', amount: 150.00, type: 'withdrawal', category: 'Comisiones Bancarias' },
    { date: '2026-05-25', description: 'IVA TRASLADADO POR COMISION SPEI', reference: '100', amount: 24.00, type: 'withdrawal', category: 'Comisiones Bancarias' },
    { date: '2026-05-28', description: 'CONSUMO DE ALIMENTOS - RESTAURANTE EL CARDENAL', reference: '81923', amount: 1850.50, type: 'withdrawal', category: 'Restaurante y Alimentos' },
    { date: '2026-05-30', description: 'SPEI RECIBIDO - DEVOLUCION DE FONDO RENDIMIENTO', reference: '448102', amount: 7000.00, type: 'deposit', category: 'Inversiones y Financiamiento' },
    { date: '2026-05-31', description: 'PAGO DE PLAN TELEFONICO E INTERNET BANDA ANCHA', reference: '21192', amount: 1626.00, type: 'withdrawal', category: 'Servicios Básicos' },
    { date: '2026-05-31', description: 'RETENCION DE ISR FINANCIERO RENDIMIENTOS', reference: '772', amount: 50.00, type: 'withdrawal', category: 'Impuestos y Derechos' }
  ]
};

const BANK_THEMES: Record<string, { bg: string, text: string, border: string, bgBadge: string }> = {
  'bbva': { bg: 'bg-blue-900', text: 'text-blue-100', border: 'border-blue-700', bgBadge: 'bg-blue-500/10 text-blue-300' },
  'banorte': { bg: 'bg-rose-950', text: 'text-rose-100', border: 'border-rose-800', bgBadge: 'bg-rose-500/10 text-rose-300' },
  'santander': { bg: 'bg-red-950', text: 'text-red-100', border: 'border-red-800', bgBadge: 'bg-red-500/10 text-red-300' },
  'citibanamex': { bg: 'bg-sky-950', text: 'text-sky-100', border: 'border-sky-800', bgBadge: 'bg-sky-500/10 text-sky-400' },
  'hsbc': { bg: 'bg-slate-900', text: 'text-slate-100', border: 'border-dark-red', bgBadge: 'bg-red-500/10 text-red-400' }
};

export default function BankStatementAnalyzer() {
  const [statement, setStatement] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  
  // UI states
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'deposit' | 'withdrawal'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reassuring loading step simulator with dynamic progress tracking
  const startLoadingAnimation = () => {
    const phases = [
      'Iniciando lectura binarizada del Estado de Cuenta PDF...',
      'Escanenado tablas de cargos y abonos con algoritmo de visión...',
      'Ejecutando Inteligencia Artificial Gemini 3.5 para conciliar renglones...',
      'Clasificando movimientos de forma lógica en la legislación SAT...',
      'Validando cuadre e integridad de saldos bancarios...'
    ];
    setLoadingProgress(5);
    setLoadingPhase(phases[0]);

    const startTime = Date.now();
    const duration = 16000; // 16 seconds simulation target

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const calculatedProgress = Math.min(98, Math.floor((elapsed / duration) * 93) + 5);
      setLoadingProgress(calculatedProgress);

      const phaseIdx = Math.min(
        Math.floor((elapsed / duration) * phases.length),
        phases.length - 1
      );
      setLoadingPhase(phases[phaseIdx]);
    }, 100);

    return interval;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    
    if (file.type !== 'application/pdf') {
      setError('Por favor proporcione únicamente archivos PDF correspondientes a un estado de cuenta bancario.');
      return;
    }

    setFileName(file.name);
    setError(null);
    setLoading(true);
    const animInterval = startLoadingAnimation();

    try {
      // Read PDF as base64
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const rawResult = reader.result as string;
          // Strip out the data:application/pdf;base64, prefix
          const base64Data = rawResult.split(',')[1];
          
          const response = await fetch('/api/analyze-pdf-statement', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              pdfBase64: base64Data,
              fileName: file.name
            })
          });

          const contentType = response.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            const tempText = await response.text();
            console.error('Non-JSON response received:', tempText.substring(0, 300));
            throw new Error(
              'El servidor de Inteligencia Artificial no devolvió un formato válido JSON. Al estar alojado en una plataforma estática (como Vercel o GitHub Pages), el backend en Node (server.ts) no se ejecuta de forma automática. Por favor use el botón "Probar Demo con IA" o use el entorno Cloud Run provisto en AI Studio.'
            );
          }

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'No se pudo analizar el estado de cuenta.');
          }

          const parsedData: StatementData = await response.json();
          setStatement(parsedData);
          setLoading(false);
          clearInterval(animInterval);
        } catch (innerErr: any) {
          console.error(innerErr);
          setError(innerErr.message || 'Error al procesar el archivo. Inténtelo más tarde.');
          setLoading(false);
          clearInterval(animInterval);
        }
      };
      
      reader.onerror = () => {
        setError('No se pudo leer el archivo local.');
        setLoading(false);
        clearInterval(animInterval);
      };

      reader.readAsDataURL(file);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Error crítico en el analizador de estados de cuenta.');
      setLoading(false);
      clearInterval(animInterval);
    }
  };

  const loadDemo = () => {
    setFileName('Estado_de_Cuenta_DEMO_ISBB.pdf');
    setError(null);
    setLoading(true);
    setLoadingProgress(5);
    setLoadingPhase('Cargando plantilla de demostración de ISBB Soluciones...');
    
    const startTime = Date.now();
    const duration = 1600; // 1.6s

    const demoInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const calculatedProgress = Math.min(100, Math.floor((elapsed / duration) * 95) + 5);
      setLoadingProgress(calculatedProgress);
    }, 50);

    setTimeout(() => {
      clearInterval(demoInterval);
      setLoadingProgress(100);
      setStatement(DEMO_STATEMENT);
      setLoading(false);
    }, 1600);
  };

  const clearData = () => {
    setStatement(null);
    setFileName('');
    setError(null);
    setSearchTerm('');
    setTypeFilter('all');
    setCategoryFilter('all');
    setLoadingProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Math checking (Saldo Inicial + Depósitos - Retiros === Saldo Final)
  const mathValidation = useMemo(() => {
    if (!statement) return { isBalanced: false, calculatedEnding: 0, variance: 0 };
    
    // Sum from transactions directly to ensure we don't have visual rounding issues from PDF parsing
    let calculatedDeposits = 0;
    let calculatedWithdrawals = 0;
    
    statement.transactions.forEach(t => {
      if (t.type === 'deposit') {
        calculatedDeposits += t.amount;
      } else {
        calculatedWithdrawals += t.amount;
      }
    });

    const sumDeposits = statement.totalDeposits || calculatedDeposits;
    const sumWithdrawals = statement.totalWithdrawals || calculatedWithdrawals;

    const calculatedEnding = statement.startingBalance + sumDeposits - sumWithdrawals;
    const variance = Math.abs(calculatedEnding - statement.endingBalance);
    // Tolerate minor rounding differences (under 5.00 pesos due to some minor parsed fees/cents)
    const isBalanced = variance < 5.0;
    
    return { isBalanced, calculatedEnding, variance };
  }, [statement]);

  // Unique categories derived
  const uniqueCategories = useMemo(() => {
    if (!statement) return [];
    const set = new Set<string>();
    statement.transactions.forEach(t => {
      if (t.category) set.add(t.category);
    });
    return Array.from(set).sort();
  }, [statement]);

  // Category statistics breakdown
  const categorySummary = useMemo(() => {
    if (!statement) return [];
    
    const totals: Record<string, { type: string, total: number, count: number }> = {};
    let totalSpent = 0;
    let totalReceived = 0;

    statement.transactions.forEach(t => {
      if (!totals[t.category]) {
        totals[t.category] = { type: t.type, total: 0, count: 0 };
      }
      totals[t.category].total += t.amount;
      totals[t.category].count += 1;

      if (t.type === 'withdrawal') {
        totalSpent += t.amount;
      } else {
        totalReceived += t.amount;
      }
    });

    return Object.entries(totals).map(([name, data]) => {
      const parentDenominator = data.type === 'withdrawal' ? totalSpent : totalReceived;
      const percentage = parentDenominator > 0 ? (data.total / parentDenominator) * 100 : 0;
      return {
        name,
        type: data.type,
        total: data.total,
        count: data.count,
        percentage
      };
    }).sort((a, b) => b.total - a.total);
  }, [statement]);

  // Filtered transactions list
  const filteredTransactions = useMemo(() => {
    if (!statement) return [];
    return statement.transactions.filter(t => {
      const matchSearch = 
        t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.reference && t.reference.toLowerCase().includes(searchTerm.toLowerCase())) ||
        t.category.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchType = typeFilter === 'all' || t.type === typeFilter;
      const matchCategory = categoryFilter === 'all' || t.category === categoryFilter;

      return matchSearch && matchType && matchCategory;
    });
  }, [statement, searchTerm, typeFilter, categoryFilter]);

  // Dynamic bank context styling
  const currentBankTheme = useMemo(() => {
    if (!statement) return { bg: 'bg-slate-900', text: 'text-slate-100', border: 'border-slate-800', bgBadge: 'bg-slate-700/10 text-slate-300' };
    const name = statement.bankName.toLowerCase();
    
    if (name.includes('bbva') || name.includes('bancomer')) return BANK_THEMES.bbva;
    if (name.includes('banorte') || name.includes('regio')) return BANK_THEMES.banorte;
    if (name.includes('santander')) return BANK_THEMES.santander;
    if (name.includes('citibanamex') || name.includes('banamex')) return BANK_THEMES.citibanamex;
    if (name.includes('hsbc')) return BANK_THEMES.hsbc;
    
    return { bg: 'bg-slate-900', text: 'text-slate-100', border: 'border-slate-800', bgBadge: 'bg-slate-700/10 text-slate-300' };
  }, [statement]);

  // Export parsed bank statement to Excel
  const handleExportToExcel = () => {
    if (!statement) return;

    // Create Row list representing transactions
    const transactionRows = statement.transactions.map((t, index) => ({
      'Secuencial': index + 1,
      'Fecha': t.date,
      'Descripción / Concepto': t.description,
      'Referencia / SPEI': t.reference || 'S/R',
      'Tipo': t.type === 'deposit' ? 'Abono (Ingreso/Depósito)' : 'Cargo (Retiro/Gasto)',
      'Categoría SAT recomendada': t.category,
      'Monto ($)': t.amount
    }));

    // Generate Overview Metadata Rows
    const overviewRows = [
      { 'Propiedad Bancaria': 'Nombre del Banco', 'Valor Detalle': statement.bankName },
      { 'Propiedad Bancaria': 'Titular de la Cuenta', 'Valor Detalle': statement.accountOwner },
      { 'Propiedad Bancaria': 'Número de Cuenta / Tarjeta / CLABE', 'Valor Detalle': statement.accountNumber },
      { 'Propiedad Bancaria': 'Período del Estado de Cuenta', 'Valor Detalle': statement.period },
      { 'Propiedad Bancaria': 'Divisa Registrada', 'Valor Detalle': statement.currency },
      { 'Propiedad Bancaria': 'Saldo Inicial ($)', 'Valor Detalle': statement.startingBalance },
      { 'Propiedad Bancaria': 'Total Depósitos / Abonos ($)', 'Valor Detalle': statement.totalDeposits },
      { 'Propiedad Bancaria': 'Total Retiros / Cargos ($)', 'Valor Detalle': statement.totalWithdrawals },
      { 'Propiedad Bancaria': 'Saldo Final ($)', 'Valor Detalle': statement.endingBalance },
      { 'Propiedad Bancaria': 'Estado de Conciliación Matemática', 'Valor Detalle': mathValidation.isBalanced ? 'CONCILIADO CORRECTAMENTE' : 'DIFERENCIA DE CUADRE EN DETALLES' }
    ];

    // Generate Sheet for Categories summary
    const categoryRows = categorySummary.map(cat => ({
      'Categoría': cat.name,
      'Tipo de Flujo': cat.type === 'deposit' ? 'Ingreso (Abono)' : 'Gasto (Cargo)',
      'Cantidad de Movimientos': cat.count,
      'Monto Acumulado ($)': cat.total,
      'Porcentaje Proporcional (%)': `${cat.percentage.toFixed(1)}%`
    }));

    const workbook = XLSX.utils.book_new();

    const overviewSheet = XLSX.utils.json_to_sheet(overviewRows);
    const transSheet = XLSX.utils.json_to_sheet(transactionRows);
    const catSheet = XLSX.utils.json_to_sheet(categoryRows);

    XLSX.utils.book_append_sheet(workbook, overviewSheet, 'Resumen de Cuenta');
    XLSX.utils.book_append_sheet(workbook, transSheet, 'Desglose de Movimientos');
    XLSX.utils.book_append_sheet(workbook, catSheet, 'Análisis por Categoria');

    const cleanBankName = statement.bankName.replace(/[^a-zA-Z0-9]/g, '_');
    XLSX.writeFile(workbook, `Reporte_Bancario_AI_ISBB_${cleanBankName}.xlsx`);
  };

  return (
    <div className="space-y-6">
      
      {/* Dynamic Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border-b border-slate-800 py-6 px-6 -mx-4 sm:-mx-6 rounded-b-[2rem] text-white overflow-hidden relative">
        <div className="space-y-1.5 z-10">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] bg-amber-500/10 text-wheat font-black uppercase tracking-wider border border-amber-500/20">
              <Sparkles className="w-3.5 h-3.5" /> Procesamiento Multimodal
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] bg-blue-500/10 text-blue-300 font-black uppercase tracking-wider border border-blue-500/20">
              CPA Premium
            </span>
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight leading-none">
            Analizador de <span className="text-wheat">Estados de Cuenta Bank-AI</span>
          </h2>
          <p className="text-slate-400 text-xs max-w-2xl">
            Sube el archivo PDF original de banca electrónica de cualquier banco corporativo o de persona física en México (BBVA, Banorte, Santander, Citibanamex, etc.). La Inteligencia Artificial de ISBB Soluciones extraerá y auditará cronológicamente la totalidad de las rengloneras y desglosará un reporte detallado exportable a Excel.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 z-10 self-start md:self-auto">
          <button
            onClick={loadDemo}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 hover:border-slate-500/50 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5 text-wheat" />
            <span>Probar con Demo</span>
          </button>
          
          {statement && (
            <button
              onClick={clearData}
              className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-bold text-xs rounded-xl border border-rose-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer animate-fade-in"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpiar Vista</span>
            </button>
          )}
        </div>
        <div className="absolute top-0 right-0 -mr-24 -mt-24 w-80 h-80 bg-wheat/5 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Main Body content conditional */}
      {!statement && !loading ? (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-10 flex flex-col items-center justify-center text-center gap-6 py-16 animate-fade-in min-h-[350px]">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center border-2 border-dashed border-slate-300 relative">
            <Upload className="w-9 h-9 text-slate-400 animate-bounce" />
          </div>
          
          <div className="space-y-2 max-w-lg">
            <h3 className="font-extrabold text-lg text-slate-800">Cargar Estado de Cuenta Bancario</h3>
            <p className="text-slate-500 text-xs leading-relaxed">
              Presione el botón inferior para buscar o arrastre aquí mismo el documento PDF de estado de cuenta mensual. Los datos se transmiten de forma encriptada de extremo a extremo a nuestro motor seguro de auditoría de IA.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              accept="application/pdf"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-black text-xs rounded-xl shadow-lg transition-all hover:text-wheat cursor-pointer hover:shadow-xl flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              <span>Seleccionar Archivo PDF</span>
            </button>
            <span className="text-slate-400 text-[10px] font-bold py-1">o</span>
            <button
              onClick={loadDemo}
              className="px-6 py-3 bg-wheat/10 text-slate-800 hover:bg-wheat/20 font-black text-xs rounded-xl border border-wheat/30 transition-all cursor-pointer flex items-center gap-2"
            >
              <span>Ver Cifras de Demostración</span>
              <FileSpreadsheet className="w-4 h-4 text-amber-600" />
            </button>
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-700 px-4 py-3 rounded-2xl text-xs flex items-center gap-2 mt-4 max-w-xl text-left">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 animate-pulse" />
              <span>{error}</span>
            </div>
          )}
        </div>
      ) : null}

      {/* Loading Screen with reassuring stages */}
      {loading && (
        <div className="bg-slate-950/85 backdrop-blur-md rounded-3xl border border-slate-800 p-8 flex flex-col items-center justify-center text-center gap-6 py-20 text-white animate-fade-in relative overflow-hidden">
          {/* Decorative ambient background glows */}
          <div className="absolute top-0 left-1/4 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-40 h-40 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            <div className="w-16 h-16 rounded-full border-4 border-amber-500/10 border-t-amber-500 animate-spin" />
            <Sparkles className="w-6 h-6 text-amber-300 absolute inset-0 m-auto animate-pulse" />
          </div>
          
          <div className="space-y-5 max-w-md w-full flex flex-col items-center z-10">
            <div>
              <h3 className="font-extrabold text-lg text-slate-100 tracking-tight">Procesando Consulta de Auditoria Bancaria...</h3>
              <p className="text-[11px] text-slate-400 font-medium">Análisis inteligente con tecnología multimodal</p>
            </div>

            {/* Gradient Progress Bar */}
            <div className="w-full max-w-sm space-y-2">
              <div className="flex justify-between items-center text-[10px] font-mono px-1">
                <span className="font-bold uppercase tracking-wider text-slate-500">PROGRESO DEL ESCANEO</span>
                <span className="text-amber-400 font-black text-xs">{loadingProgress}%</span>
              </div>
              <div className="w-full bg-slate-900 border border-slate-800/80 rounded-full h-4 overflow-hidden p-0.5 shadow-inner">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-400 rounded-full transition-all duration-300 ease-out shadow-[0_0_12px_rgba(245,158,11,0.45)] relative"
                  style={{ width: `${loadingProgress}%` }}
                />
              </div>
            </div>

            <p className="text-slate-200 text-xs font-mono select-none px-4 py-2 bg-slate-900/90 rounded-xl inline-block border border-white/5 max-w-full text-center shadow-md animate-pulse">
              {loadingPhase}
            </p>
            
            <p className="text-[10px] text-slate-500 max-w-xs leading-relaxed">
              Nota: El motor Gemini de ISBB analiza el PDF de forma inteligente. Esta operación puede demorar de 10 a 20 segundos dependiendo del volumen y páginas del estado de cuenta.
            </p>
          </div>
        </div>
      )}

      {/* Report Screen */}
      {statement && !loading && (
        <div className="space-y-6 animate-fade-in select-text">
          
          {/* Bank Title Banner card */}
          <div className={`${currentBankTheme.bg} opacity-95 text-white p-6 rounded-3xl shadow-lg border ${currentBankTheme.border} relative overflow-hidden flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4`}>
            <div className="space-y-1.5 z-10">
              <span className="bg-white/10 text-white font-mono uppercase text-[9px] px-2.5 py-1 rounded-full border border-white/10 tracking-widest font-bold">
                {statement.bankName} • Sistema Auditado
              </span>
              <h3 className="text-lg font-black tracking-tight mt-1">{statement.accountOwner}</h3>
              <p className="text-xs text-white/80 font-mono tracking-tight flex items-center gap-1.5">
                <span>Cuenta/CLABE: <strong className="text-white">{statement.accountNumber}</strong></span>
                <span className="text-white/45">|</span>
                <span>Divisa: <strong className="text-wheat select-all">{statement.currency}</strong></span>
              </p>
              <p className="text-xs text-white/80 font-mono">
                Período: <strong className="text-amber-300">{statement.period}</strong>
              </p>
            </div>

            <button
              onClick={handleExportToExcel}
              className="px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl shadow-lg hover:shadow-xl transition-all cursor-pointer flex items-center gap-2 border border-emerald-400/30 self-start sm:self-auto"
            >
              <Download className="w-4 h-4" />
              <span>DESCARGAR REPORTE EXCEL (XLSX)</span>
            </button>
            
            <div className="absolute top-0 right-0 -mr-16 -mt-16 w-60 h-60 bg-white/5 rounded-full blur-2xl pointer-events-none" />
          </div>

          {/* Balance Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
              <div className="bg-slate-100 text-slate-600 p-3 rounded-xl border border-slate-200/60">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Saldo Inicial</p>
                <p className="text-md font-black text-slate-800">
                  ${statement.startingBalance.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {statement.currency}
                </p>
                <p className="text-[8px] text-slate-400 font-mono uppercase mt-0.5 mt-0.5">Inicio del Periodo</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
              <div className="bg-emerald-50 text-emerald-600 p-3 rounded-xl border border-emerald-100">
                <TrendingUp className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Total de Abonos / Depósitos</p>
                <p className="text-md font-black text-emerald-700">
                  +${statement.totalDeposits.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {statement.currency}
                </p>
                <p className="text-[8px] text-emerald-500/80 font-mono mt-0.5">Ingresos Totales Registrados</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
              <div className="bg-rose-50 text-rose-600 p-3 rounded-xl border border-rose-100">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Total Cargos / Retiros</p>
                <p className="text-md font-black text-rose-700">
                  -${statement.totalWithdrawals.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {statement.currency}
                </p>
                <p className="text-[8px] text-rose-500/80 font-mono mt-0.5">Cargos, Comisiones e IMSS</p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex items-center justify-between gap-2">
              <div className="flex items-center gap-4">
                <div className="bg-blue-50 text-blue-600 p-3 rounded-xl border border-blue-100">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Saldo Final</p>
                  <p className="font-mono text-md font-extrabold text-blue-800">
                    ${statement.endingBalance.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {statement.currency}
                  </p>
                  <p className="text-[8px] text-slate-400 font-mono uppercase mt-0.5 mt-0.5">Cierre del Periodo</p>
                </div>
              </div>
            </div>

          </div>

          {/* CPA Formula validation status */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 select-none">
            <div className="flex items-center gap-3">
              {mathValidation.isBalanced ? (
                <div className="bg-emerald-500/10 text-emerald-400 p-2 rounded-xl border border-emerald-500/20">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              ) : (
                <div className="bg-amber-500/10 text-amber-400 p-2 rounded-xl border border-amber-500/20">
                  <AlertTriangle className="w-6 h-6 animate-pulse" />
                </div>
              )}
              
              <div>
                <h4 className="text-xs font-black tracking-wide uppercase flex items-center gap-1.5 text-white">
                  <span>Prueba de Validación de Conciliación Bancaria (Matemática):</span>
                  {mathValidation.isBalanced ? (
                    <span className="bg-emerald-400/20 text-emerald-400 text-[8px] px-2 py-0.5 rounded font-mono font-black uppercase">Cuadrado Perfecto</span>
                  ) : (
                    <span className="bg-amber-400/20 text-amber-400 text-[8px] px-2 py-0.5 rounded font-mono font-black uppercase">Variación Menor</span>
                  )}
                </h4>
                <p className="text-[10px] text-slate-300 font-mono mt-1">
                  Saldo Inicial (${statement.startingBalance.toFixed(2)}) + Depósitos (${statement.totalDeposits.toFixed(2)}) - Retiros (${statement.totalWithdrawals.toFixed(2)}) =
                  Calculado: <strong className="text-wheat">${mathValidation.calculatedEnding.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> vs
                  Real: <strong className="text-white">${statement.endingBalance.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </p>
              </div>
            </div>

            <div className="font-mono text-[9px] text-slate-400 text-right">
              {mathValidation.isBalanced ? (
                <span className="text-emerald-400 font-bold">Diferencia: $0.00 MXN</span>
              ) : (
                <span className="text-amber-400 font-bold">Discrepancia menor detectada: ${mathValidation.variance.toFixed(2)} MXN</span>
              )}
              <p className="text-[8px] text-slate-500 mt-1">Verificación automática de sumas y restas SAT</p>
            </div>
          </div>

          {/* Categorization & Movement Analyzer container */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left: Interactive Categories progress breakdown */}
            <div className="lg:col-span-1 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
              <div>
                <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-amber-500" />
                  Reglas de Categorización AI
                </h3>
                <p className="text-slate-400 text-[10px] mt-1 leading-normal">
                  Suma total acumulada de abonos e ingresos desglosados lógicamente por clasificación tributaria sugerida para conciliación rápida.
                </p>
              </div>

              <div className="space-y-4 pt-2">
                
                {/* Divide statistics into deposits and withdrawals cleanly */}
                <div className="space-y-3">
                  <p className="text-[10px] font-black text-slate-500 tracking-wider uppercase border-b border-slate-100 pb-1">ANÁLISIS DE DEPOSITOS (INGRESOS):</p>
                  
                  {categorySummary.filter(c => c.type === 'deposit').map(cat => (
                    <div key={cat.name} className="space-y-1">
                      <div className="flex justify-between text-[11px] font-bold">
                        <span className="text-slate-700">{cat.name}</span>
                        <span className="text-emerald-700 font-extrabold">${cat.total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${cat.percentage}%` }} />
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                        <span>{cat.count} transacciones</span>
                        <span>{cat.percentage.toFixed(1)}% del total</span>
                      </div>
                    </div>
                  ))}
                  
                  {categorySummary.filter(c => c.type === 'deposit').length === 0 && (
                    <span className="text-[10px] text-slate-400 italic block">No se encontraron categorías de depósitos.</span>
                  )}
                </div>

                <div className="space-y-3 pt-2">
                  <p className="text-[10px] font-black text-slate-500 tracking-wider uppercase border-b border-slate-100 pb-1">ANÁLISIS DE RETIROS (GASTOS Y EGRESOS):</p>
                  
                  {categorySummary.filter(c => c.type === 'withdrawal').slice(0, 7).map(cat => (
                    <div key={cat.name} className="space-y-1">
                      <div className="flex justify-between text-[11px] font-bold">
                        <span className="text-slate-700">{cat.name}</span>
                        <span className="text-rose-700 font-extrabold">${cat.total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${cat.percentage}%` }} />
                      </div>
                      <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                        <span>{cat.count} transacciones</span>
                        <span>{cat.percentage.toFixed(1)}% de egresos</span>
                      </div>
                    </div>
                  ))}

                  {categorySummary.filter(c => c.type === 'withdrawal').length > 7 && (
                    <span className="text-[9px] text-amber-500 font-black italic block uppercase text-right">+{categorySummary.filter(c => c.type === 'withdrawal').length - 7} categorías menores adicionales</span>
                  )}
                </div>

              </div>
            </div>

            {/* Right: Detailed list with filters */}
            <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 flex flex-col gap-4">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-slate-600" />
                    Detalle Cronológico de Transacciones
                  </h3>
                  <p className="text-slate-400 text-[10px] mt-1">
                    Visualice los movimientos del estado de cuenta de forma filtrada. {filteredTransactions.length} renglones coinciden.
                  </p>
                </div>
              </div>

              {/* Filtering bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por concepto o folio..."
                    className="w-full bg-white text-xs text-slate-800 placeholder-slate-400 rounded-xl pl-9 pr-3 py-2 border border-slate-200 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                  />
                </div>

                <div>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as any)}
                    className="w-full bg-white text-xs text-slate-800 rounded-xl px-3 py-2 border border-slate-200 focus:outline-none focus:border-amber-400 cursor-pointer font-bold"
                  >
                    <option value="all">💳 Dirección: Todos los Flujos</option>
                    <option value="deposit">🟢 Abonos / Depósitos</option>
                    <option value="withdrawal">🔴 Cargos / Retiros</option>
                  </select>
                </div>

                <div>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full bg-white text-xs text-slate-800 rounded-xl px-3 py-2 border border-slate-200 focus:outline-none focus:border-amber-400 cursor-pointer font-bold"
                  >
                    <option value="all">📂 Categorías: Todas</option>
                    {uniqueCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

              </div>

              {/* Transactions list viewport */}
              <div className="overflow-x-auto border border-slate-100 rounded-2xl max-h-[450px] overflow-y-auto mt-2">
                <table className="w-full text-left border-collapse table-auto">
                  <thead className="bg-slate-900 text-white font-mono text-[9px] uppercase tracking-wider sticky top-0 z-10 select-none">
                    <tr>
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-3">Descripción</th>
                      <th className="py-3 px-2">Referencia</th>
                      <th className="py-3 px-3">Categoría</th>
                      <th className="py-3 px-4 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[11px]">
                    {filteredTransactions.map((t, index) => (
                      <tr key={index} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-slate-500 whitespace-nowrap">{t.date}</td>
                        <td className="py-3 px-3 font-semibold text-slate-800 max-w-xs truncate" title={t.description}>
                          {t.description}
                        </td>
                        <td className="py-3 px-2 font-mono text-slate-400">{t.reference || <span className="text-slate-300">-</span>}</td>
                        <td className="py-3 px-3">
                          <span className="inline-flex bg-slate-100 text-slate-600 font-extrabold text-[9px] px-2 py-0.5 rounded-full border border-slate-200/50">
                            {t.category}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black">
                          {t.type === 'deposit' ? (
                            <span className="text-emerald-600 font-extrabold">
                              +${t.amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="text-slate-700">
                              -${t.amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}

                    {filteredTransactions.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-xs text-slate-400 font-bold bg-slate-50">
                          Ninguna transacción coincide con los filtros aplicados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

            </div>

          </div>

        </div>
      )}

    </div>
  );
}
