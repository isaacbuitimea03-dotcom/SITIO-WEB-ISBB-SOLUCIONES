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
  Users,
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
  Scale,
  Award,
  Lock,
  Eye,
  EyeOff,
  LogOut,
  LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import AccountsManager from './components/AccountsManager';
import BankStatementAnalyzer from './components/BankStatementAnalyzer';

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

const isIvaTasaSpecial = (lbl: string): boolean => {
  const norm = lbl.toLowerCase();
  return (
    norm.includes('iva') &&
    !norm.includes('reten') &&
    (norm.includes('16') || norm.includes('8') || norm.includes('0'))
  );
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

const getContractTypeName = (code: string): string => {
  const map: Record<string, string> = {
    '01': 'Contrato de trabajo por tiempo indeterminado',
    '02': 'Contrato de trabajo por tiempo determinado',
    '03': 'Contrato de trabajo por temporada',
    '04': 'Contrato de trabajo por obra determinada',
    '05': 'Contrato de trabajo por capacitación inicial',
    '06': 'Contrato de trabajo por periodo de prueba',
    '07': 'Contrato de trabajo por tiempo indeterminado sujeto a periodo de prueba',
    '08': 'Contrato de trabajo por tiempo indeterminado con opción de capacitación inicial',
    '09': 'Contrato de trabajo por tiempo indeterminado a tiempo parcial',
    '10': 'Contrato de trabajo por tiempo indeterminado para el campo',
    '99': 'Otro contrato'
  };
  return map[code.trim()] || 'Otro';
};

const getRegimenTypeName = (code: string): string => {
  const map: Record<string, string> = {
    '01': 'Sueldos',
    '02': 'Sueldos (Sueldos y Salarios)',
    '03': 'Jubilados',
    '04': 'Pensionados',
    '05': 'Asimilados Miembros Sociedades Cooperativas',
    '06': 'Asimilados Integrantes Sociedades Civiles',
    '07': 'Asimilados Miembros de Consejos',
    '08': 'Asimilados Comisionistas',
    '09': 'Asimilados Honorarios',
    '10': 'Asimilados Acciones o Títulos',
    '11': 'Asimilados Otros',
    '12': 'Sueldos y salarios que no causan impuesto'
  };
  return map[code.trim()] || 'Sueldos y salarios';
};

const getPeriodicidadName = (code: string): string => {
  const map: Record<string, string> = {
    '01': 'Diario',
    '02': 'Semanal',
    '03': 'Catorcenal',
    '04': 'Quincenal',
    '05': 'Mensual',
    '06': 'Bimestral',
    '07': 'Unitaria',
    '08': 'Comisión',
    '09': 'Precio alzado',
    '99': 'Otra Periodicidad'
  };
  return map[code.trim()] || 'Quincenal';
};

// Interface of extracted CFDI XML properties with detailed tax breakdown
interface ParsedCFDI {
  fileName: string;
  folio: string;
  serie: string;
  fecha: string;
  tipo: string; // 'I' (Ingreso), 'E' (Egreso), 'P' (Pago/Otros), 'N' (Nómina)
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

  // Payroll/Nómina specific optional properties (ISBB premium suite)
  isNomina?: boolean;
  nominaVersion?: string;
  nominaTipo?: string;
  nominaFechaPago?: string;
  nominaFechaInicialPago?: string;
  nominaFechaFinalPago?: string;
  nominaNumDiasPagados?: number;
  nominaReceptorCurp?: string;
  nominaReceptorNss?: string;
  nominaReceptorTipoContrato?: string;
  nominaReceptorTipoRegimen?: string;
  nominaReceptorNumEmpleado?: string;
  nominaReceptorPeriodicidadPago?: string;
  nominaReceptorClaveEntFed?: string;
  nominaTotalPercepciones?: number;
  nominaTotalDeducciones?: number;
  nominaTotalOtrosPagos?: number;
  nominaNeto?: number;
  nominaPercepcionesStr?: string;
  nominaDeduccionesStr?: string;

  // Granular payroll breakdown fields
  percepcionSueldo?: number;
  percepcionAguinaldoGrav?: number;
  percepcionAguinaldoExent?: number;
  percepcionPrimaVacGrav?: number;
  percepcionPrimaVacExent?: number;
  percepcionPrimaDomGrav?: number;
  percepcionPrimaDomExent?: number;
  percepcionHorasExtrasGrav?: number;
  percepcionHorasExtrasExent?: number;
  percepcionBonosGrav?: number;
  percepcionBonosExent?: number;
  percepcionPtuGrav?: number;
  percepcionPtuExent?: number;
  percepcionOtrosGrav?: number;
  percepcionOtrosExent?: number;

  deduccionIsr?: number;
  deduccionImss?: number;
  deduccionFondoAhorro?: number;
  deduccionDescuentos?: number;
  deduccionOtros?: number;
  fechaHoraRaw?: string;
  hora?: string;
  isCancelada?: boolean;
  allTaxesMap?: Record<string, { base: number; importe: number; tasaStr: string; type: string }>;
}

// Interface for filter preset
interface FilterPreset {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  cfdiType: string;
  rfcEmisor: string;
  rfcReceptor: string;
  conceptText: string;
}

// Interface for ANCOFI Access Accounts (Users)
interface AncofiUser {
  id: string;
  email: string;
  name: string;
  role: 'Administrador' | 'Contador Senior' | 'Auditor' | 'Consultor';
  status: 'Activo' | 'Inactivo';
  createdAt: string;
  password?: string;
}

// Interface for ANCOFI Managed Client Accounts
interface AncofiClient {
  id: string;
  rfc: string;
  name: string;
  regimen: string;
  email: string;
  phone?: string;
  registeredAt: string;
}

const DEFAULT_USERS: AncofiUser[] = [
  {
    id: 'user-1',
    email: 'demo@ancofi.com',
    name: 'Auditor de Pruebas',
    role: 'Auditor',
    status: 'Activo',
    createdAt: '2026-01-10',
    password: '123456'
  },
  {
    id: 'user-2',
    email: 'admin@ancofi.com',
    name: 'Administrador General',
    role: 'Administrador',
    status: 'Activo',
    createdAt: '2025-11-05',
    password: 'admin'
  },
  {
    id: 'user-3',
    email: 'contable@ancofi.com',
    name: 'Contador Fiscal',
    role: 'Contador Senior',
    status: 'Activo',
    createdAt: '2026-02-14',
    password: 'contable'
  }
];

const DEFAULT_CLIENTS: AncofiClient[] = [
  {
    id: 'client-1',
    rfc: 'ISM980121V98',
    name: 'Industrias San Miguel S.A. de C.V.',
    regimen: 'personas_morales',
    email: 'contacto@sanmiguel.com.mx',
    phone: '55 1234 5678',
    registeredAt: '2026-01-15'
  },
  {
    id: 'client-2',
    rfc: 'GOMJ850524H89',
    name: 'Juan Gómez Martínez',
    regimen: 'resico_pf',
    email: 'juan.gomez@gmail.com',
    phone: '81 8765 4321',
    registeredAt: '2026-02-02'
  },
  {
    id: 'client-3',
    rfc: 'LOM851201TY4',
    name: 'Logística Metropolitana Express S.A.',
    regimen: 'personas_morales',
    email: 'finanzas@logmetrop.com',
    phone: '33 9876 5432',
    registeredAt: '2026-03-11'
  }
];

export default function App() {
  // --- LOGIN & GENERAL PLATFORM STATE ---
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('ancofi_logged_in') === 'true';
    } catch (e) {
      return false;
    }
  });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Active platform tab: 'dashboard' (analizador XML), 'accounts' (administrador de cuentas) or 'bank-statements' (analizador estado de cuenta)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'accounts' | 'bank-statements'>('dashboard');

  // Load access users from database or fallback to defaults
  const [users, setUsers] = useState<AncofiUser[]>(() => {
    try {
      const saved = localStorage.getItem('ancofi_users');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn(e);
    }
    return DEFAULT_USERS;
  });

  // Save users whenever edited
  React.useEffect(() => {
    try {
      localStorage.setItem('ancofi_users', JSON.stringify(users));
    } catch (e) {
      console.warn(e);
    }
  }, [users]);

  // Load client companies accounts
  const [clients, setClients] = useState<AncofiClient[]>(() => {
    try {
      const saved = localStorage.getItem('ancofi_clients');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn(e);
    }
    return DEFAULT_CLIENTS;
  });

  // Save clients whenever edited/added
  React.useEffect(() => {
    try {
      localStorage.setItem('ancofi_clients', JSON.stringify(clients));
    } catch (e) {
      console.warn(e);
    }
  }, [clients]);

  // Current logged in user metadata
  const [currentUser, setCurrentUser] = useState<AncofiUser | null>(() => {
    try {
      const savedRole = localStorage.getItem('ancofi_current_user');
      if (savedRole) return JSON.parse(savedRole);
    } catch (e) {
      console.warn(e);
    }
    return DEFAULT_USERS[0]; // fallback
  });

  // Filter the dashboard XML data by a specific Client Company (RFC) which is insanely helpful
  const [selectedClientFilter, setSelectedClientFilter] = useState<string>('ALL');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = username.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanEmail || !cleanPass) {
      setLoginError('Por favor, ingresa tu usuario y contraseña.');
      return;
    }
    
    setIsSubmitting(true);
    setLoginError('');
    
    // Simulate slight natural verification delay for a premium feel
    setTimeout(() => {
      setIsSubmitting(false);
      
      // Dynamic validation against current accounts in the local state database!
      const matchedUser = users.find(u => u.email.toLowerCase() === cleanEmail && (u.password || '123456') === cleanPass);
      
      if (!matchedUser) {
        setLoginError('Credenciales incorrectas. Verifique correo y contraseña.');
        return;
      }

      if (matchedUser.status === 'Inactivo') {
        setLoginError('Su cuenta de acceso ANCOFI ha sido temporalmente desactivada por el administrador.');
        return;
      }
      
      setIsLoggedIn(true);
      setCurrentUser(matchedUser);
      try {
        localStorage.setItem('ancofi_logged_in', 'true');
        localStorage.setItem('ancofi_current_user', JSON.stringify(matchedUser));
      } catch (e) {
        console.warn(e);
      }
    }, 800);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentUser(null);
    try {
      localStorage.removeItem('ancofi_logged_in');
      localStorage.removeItem('ancofi_current_user');
    } catch (e) {
      console.warn(e);
    }
  };

  // --- XML AUDITOR & TAX ANALYZER STATE ---
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

  // --- STATE FOR SEARCH AND FILTER FEATURES ---
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterCfdiType, setFilterCfdiType] = useState('ALL'); // 'ALL' | 'I' | 'E' | 'P'
  const [filterRfcEmisor, setFilterRfcEmisor] = useState('');
  const [filterRfcReceptor, setFilterRfcReceptor] = useState('');
  const [filterConcept, setFilterConcept] = useState('');
  const [presetName, setPresetName] = useState('');

  // Subscription plans state
  const [selectedPlanPeriod, setSelectedPlanPeriod] = useState<'monthly' | 'yearly'>('yearly');
  const [checkoutModalPlan, setCheckoutModalPlan] = useState<{ name: string; price: string; period: string } | null>(null);
  const [subscriptionSuccess, setSubscriptionSuccess] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [isSubscribedUser, setIsSubscribedUser] = useState(() => {
    try {
      return localStorage.getItem('isbb_ancofi_premium_active') === 'true';
    } catch {
      return false;
    }
  });

  // Local storage saved filters state
  const [savedFilters, setSavedFilters] = useState<FilterPreset[]>(() => {
    try {
      const saved = localStorage.getItem('isbb_saved_filters_v2');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn(e);
    }
    return [
      {
        id: 'preset-ingresos',
        name: 'Solo Ingresos (Ventas)',
        startDate: '',
        endDate: '',
        cfdiType: 'I',
        rfcEmisor: '',
        rfcReceptor: '',
        conceptText: '',
      },
      {
        id: 'preset-gastos',
        name: 'Solo Egresos (Gastos Ded.)',
        startDate: '',
        endDate: '',
        cfdiType: 'E',
        rfcEmisor: '',
        rfcReceptor: '',
        conceptText: '',
      }
    ];
  });

  // Save filters whenever they change
  React.useEffect(() => {
    try {
      localStorage.setItem('isbb_saved_filters_v2', JSON.stringify(savedFilters));
    } catch (e) {
      console.warn(e);
    }
  }, [savedFilters]);

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
        // Fallback to concept's own subtotal Importe if the base is missing or 0
        const base = parseFloat(getAttrSafe(t, ['Base', 'base']) || '0') || cpImporte;
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
        const base = parseFloat(getAttrSafe(r, ['Base', 'base']) || '0') || cpImporte;
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
      
      // Let's first pre-calculate the bases for non-zero rates so we can subtract them from subTotal if we encounter a 0% rate without a base!
      let tempTasa16Base = 0;
      let tempImpuestoExento = 0;
      
      traslados.forEach(t => {
        const impuesto = getAttrSafe(t, ['Impuesto', 'impuesto']);
        const tipoFactor = getAttrSafe(t, ['TipoFactor', 'tipoFactor']);
        const tasaOCuotaStr = getAttrSafe(t, ['TasaOCuota', 'tasaOCuota']);
        const tasaOCuota = parseFloat(tasaOCuotaStr || '0');
        const base = parseFloat(getAttrSafe(t, ['Base', 'base']) || '0');
        const importe = parseFloat(getAttrSafe(t, ['Importe', 'importe']) || '0');

        if (impuesto === '002' || impuesto === 'IVA') {
          if (tipoFactor === 'Exento') {
            tempImpuestoExento += base;
          } else if (tipoFactor === 'Tasa' && Math.abs(tasaOCuota - 0.16) < 0.01) {
            tempTasa16Base += base || (importe / 0.16);
          }
        }
      });

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
              if (base > 0) {
                tasa0Base += base;
              } else if (tempTasa16Base > 0 || tempImpuestoExento > 0) {
                // Subtract other rates' bases from subTotal to get the 0% base dynamically and prevent taking the entire invoice total!
                const calculated0Base = Math.max(0, subTotal - (tempTasa16Base + tempImpuestoExento));
                tasa0Base += calculated0Base;
              } else {
                tasa0Base += subTotal;
              }
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

    // --- DYNAMIC TAX ANALYZER ENGINE (HIGH FIDELITY BASE & IMPORTE COLLECTION) ---
    const xmlTaxes: {
      type: 'Traslado' | 'Retencion' | 'Local';
      taxName: string;
      base: number;
      importe: number;
      tasaStr: string;
      label: string;
    }[] = [];

    const getTaxCodeName = (code: string): string => {
      const c = code.trim();
      if (c === '001' || c.toUpperCase() === 'ISR') return 'ISR';
      if (c === '002' || c.toUpperCase() === 'IVA') return 'IVA';
      if (c === '003' || c.toUpperCase() === 'IEPS') return 'IEPS';
      return c;
    };

    let hasConceptTaxes = false;
    conceptoElements.forEach(concepto => {
      const cpImporte = parseFloat(getAttrSafe(concepto, ['Importe', 'importe']) || '0');
      const cTraslados = getElementsSafe(concepto, ['cfdi:Traslado', 'Traslado']);
      if (cTraslados.length > 0) hasConceptTaxes = true;
      cTraslados.forEach(t => {
        const impCode = getAttrSafe(t, ['Impuesto', 'impuesto']) || '002';
        const impName = getTaxCodeName(impCode);
        const tipoFactor = getAttrSafe(t, ['TipoFactor', 'tipoFactor']) || 'Tasa';
        const tasaOCuotaStr = getAttrSafe(t, ['TasaOCuota', 'tasaOCuota']) || '0';
        const tasaNum = parseFloat(tasaOCuotaStr);
        // Fallback to concept's own subtotal Importe if the base is missing or 0
        const base = parseFloat(getAttrSafe(t, ['Base', 'base']) || '0') || cpImporte;
        const importe = parseFloat(getAttrSafe(t, ['Importe', 'importe']) || '0');

        let label = '';
        let tasaPct = '';
        if (tipoFactor === 'Exento') {
          label = `Traslado ${impName} Exento`;
          tasaPct = 'Exento';
        } else if (tipoFactor === 'Tasa') {
          label = `Traslado ${impName} ${(tasaNum * 100).toFixed(2)}%`;
          tasaPct = `${(tasaNum * 100).toFixed(2)}%`;
        } else {
          label = `Traslado ${impName} Cuota ${tasaNum}`;
          tasaPct = `Cuota ${tasaNum}`;
        }

        xmlTaxes.push({
          type: 'Traslado',
          taxName: impName,
          base,
          importe,
          tasaStr: tasaPct,
          label
        });
      });

      const cRetenciones = getElementsSafe(concepto, ['cfdi:Retencion', 'Retencion']);
      if (cRetenciones.length > 0) hasConceptTaxes = true;
      cRetenciones.forEach(r => {
        const impCode = getAttrSafe(r, ['Impuesto', 'impuesto']) || '001';
        const impName = getTaxCodeName(impCode);
        const base = parseFloat(getAttrSafe(r, ['Base', 'base']) || '0') || cpImporte;
        const importe = parseFloat(getAttrSafe(r, ['Importe', 'importe']) || '0');
        const tasaOCuotaStr = getAttrSafe(r, ['TasaOCuota', 'tasaOCuota', 'tasaocuota']) || '';
        
        let label = '';
        let tasaPct = '';
        if (tasaOCuotaStr) {
          const tNum = parseFloat(tasaOCuotaStr);
          label = `Retención ${impName} ${(tNum * 100).toFixed(2)}%`;
          tasaPct = `${(tNum * 100).toFixed(2)}%`;
        } else {
          label = `Retención ${impName}`;
          tasaPct = 'Retenido';
        }

        xmlTaxes.push({
          type: 'Retencion',
          taxName: impName,
          base,
          importe,
          tasaStr: tasaPct,
          label
        });
      });
    });

    if (!hasConceptTaxes) {
      const gTraslados = getElementsSafe(xmlDoc, ['cfdi:Traslado', 'Traslado']);
      
      // Let's first pre-calculate the bases for non-zero rates so we can subtract them from subTotal if we encounter a 0% rate without a base!
      let tempTasa16Base = 0;
      let tempTasa8Base = 0;
      let tempImpuestoExento = 0;

      gTraslados.forEach(t => {
        let parentNode = t.parentNode;
        let isConceptChild = false;
        while (parentNode) {
          if (parentNode.nodeName && parentNode.nodeName.toLowerCase().includes('concepto')) {
            isConceptChild = true;
            break;
          }
          parentNode = parentNode.parentNode;
        }
        if (isConceptChild) return;

        const impCode = getAttrSafe(t, ['Impuesto', 'impuesto']) || '002';
        const impName = getTaxCodeName(impCode);
        const tipoFactor = getAttrSafe(t, ['TipoFactor', 'tipoFactor']) || 'Tasa';
        const tasaOCuotaStr = getAttrSafe(t, ['TasaOCuota', 'tasaOCuota']) || '0';
        const tasaNum = parseFloat(tasaOCuotaStr);
        const base = parseFloat(getAttrSafe(t, ['Base', 'base']) || '0');
        const importe = parseFloat(getAttrSafe(t, ['Importe', 'importe']) || '0');

        if (impName === 'IVA') {
          if (tipoFactor === 'Exento') {
            tempImpuestoExento += base;
          } else if (tipoFactor === 'Tasa') {
            if (Math.abs(tasaNum - 0.16) < 0.01) {
              tempTasa16Base += base || (importe / 0.16);
            } else if (Math.abs(tasaNum - 0.08) < 0.01) {
              tempTasa8Base += base || (importe / 0.08);
            }
          }
        }
      });

      gTraslados.forEach(t => {
        let parentNode = t.parentNode;
        let isConceptChild = false;
        while (parentNode) {
          if (parentNode.nodeName && parentNode.nodeName.toLowerCase().includes('concepto')) {
            isConceptChild = true;
            break;
          }
          parentNode = parentNode.parentNode;
        }
        if (isConceptChild) return;

        const impCode = getAttrSafe(t, ['Impuesto', 'impuesto']) || '002';
        const impName = getTaxCodeName(impCode);
        const tipoFactor = getAttrSafe(t, ['TipoFactor', 'tipoFactor']) || 'Tasa';
        const tasaOCuotaStr = getAttrSafe(t, ['TasaOCuota', 'tasaOCuota']) || '0';
        const tasaNum = parseFloat(tasaOCuotaStr);
        const base = parseFloat(getAttrSafe(t, ['Base', 'base']) || '0');
        const importe = parseFloat(getAttrSafe(t, ['Importe', 'importe']) || '0');

        let label = '';
        let tasaPct = '';
        if (tipoFactor === 'Exento') {
          label = `Traslado ${impName} Exento`;
          tasaPct = 'Exento';
        } else if (tipoFactor === 'Tasa') {
          label = `Traslado ${impName} ${(tasaNum * 100).toFixed(2)}%`;
          tasaPct = `${(tasaNum * 100).toFixed(2)}%`;
        } else {
          label = `Traslado ${impName} Cuota ${tasaNum}`;
          tasaPct = `Cuota ${tasaNum}`;
        }

        let calculatedBase = base;
        if (impName === 'IVA' && tipoFactor === 'Tasa' && tasaNum === 0) {
          if (base > 0) {
            calculatedBase = base;
          } else if (tempTasa16Base > 0 || tempTasa8Base > 0 || tempImpuestoExento > 0) {
            calculatedBase = Math.max(0, subTotal - (tempTasa16Base + tempTasa8Base + tempImpuestoExento));
          } else {
            calculatedBase = subTotal;
          }
        } else if (impName === 'IVA' && tipoFactor === 'Tasa' && Math.abs(tasaNum - 0.16) < 0.01) {
          calculatedBase = base || (importe / 0.16);
        } else if (impName === 'IVA' && tipoFactor === 'Tasa' && Math.abs(tasaNum - 0.08) < 0.01) {
          calculatedBase = base || (importe / 0.08);
        } else if (calculatedBase === 0) {
          calculatedBase = subTotal;
        }

        xmlTaxes.push({
          type: 'Traslado',
          taxName: impName,
          base: calculatedBase,
          importe,
          tasaStr: tasaPct,
          label
        });
      });

      const gRetenciones = getElementsSafe(xmlDoc, ['cfdi:Retencion', 'Retencion']);
      gRetenciones.forEach(r => {
        let parentNode = r.parentNode;
        let isConceptChild = false;
        while (parentNode) {
          if (parentNode.nodeName && parentNode.nodeName.toLowerCase().includes('concepto')) {
            isConceptChild = true;
            break;
          }
          parentNode = parentNode.parentNode;
        }
        if (isConceptChild) return;

        const impCode = getAttrSafe(r, ['Impuesto', 'impuesto']) || '001';
        const impName = getTaxCodeName(impCode);
        const base = parseFloat(getAttrSafe(r, ['Base', 'base']) || '0');
        const importe = parseFloat(getAttrSafe(r, ['Importe', 'importe']) || '0');
        const tasaOCuotaStr = getAttrSafe(r, ['TasaOCuota', 'tasaOCuota']) || '';

        let label = '';
        let tasaPct = '';
        if (tasaOCuotaStr) {
          const tNum = parseFloat(tasaOCuotaStr);
          label = `Retención ${impName} ${(tNum * 100).toFixed(2)}%`;
          tasaPct = `${(tNum * 100).toFixed(2)}%`;
        } else {
          label = `Retención ${impName}`;
          tasaPct = 'Retenido';
        }

        xmlTaxes.push({
          type: 'Retencion',
          taxName: impName,
          base: base || (importe > 0 && impName === 'ISR' ? (importe / 0.10) : 0),
          importe,
          tasaStr: tasaPct,
          label
        });
      });
    }

    const localTasaLocales = getElementsSafe(xmlDoc, ['implocal:TrasladosLocales', 'TrasladosLocales']);
    localTasaLocales.forEach(lt => {
      const impLocName = getAttrSafe(lt, ['ImpLocTrasladado', 'impLocTrasladado']) || 'Impuesto Local Traslado';
      const tasaTraslado = parseFloat(getAttrSafe(lt, ['TasadeTraslado', 'tasadeTraslado']) || '0');
      const importe = parseFloat(getAttrSafe(lt, ['Importe', 'importe']) || '0');
      
      const label = `Traslado Local: ${impLocName} ${tasaTraslado.toFixed(2)}%`;
      xmlTaxes.push({
        type: 'Local',
        taxName: impLocName,
        base: subTotal,
        importe,
        tasaStr: `${tasaTraslado.toFixed(2)}%`,
        label
      });
    });

    const localRetLocales = getElementsSafe(xmlDoc, ['implocal:RetencionesLocales', 'RetencionesLocales']);
    localRetLocales.forEach(lr => {
      const impLocName = getAttrSafe(lr, ['ImpLocRetenido', 'impLocRetenido']) || 'Impuesto Local Retención';
      const tasaRetencion = parseFloat(getAttrSafe(lr, ['TasadeRetencion', 'tasadeRetencion']) || '0');
      const importe = parseFloat(getAttrSafe(lr, ['Importe', 'importe']) || '0');

      const label = `Retención Local: ${impLocName} ${tasaRetencion.toFixed(2)}%`;
      xmlTaxes.push({
        type: 'Local',
        taxName: impLocName,
        base: subTotal,
        importe,
        tasaStr: `${tasaRetencion.toFixed(2)}%`,
        label
      });
    });

    const allTaxesMap: Record<string, { base: number; importe: number; tasaStr: string; type: string }> = {};
    xmlTaxes.forEach(t => {
      const normalizedLabel = t.label.trim();
      if (!allTaxesMap[normalizedLabel]) {
        allTaxesMap[normalizedLabel] = {
          base: 0,
          importe: 0,
          tasaStr: t.tasaStr,
          type: t.type
        };
      }
      allTaxesMap[normalizedLabel].base += t.base;
      allTaxesMap[normalizedLabel].importe += t.importe;
    });

    // --- PAYROLL (NÓMINA) DETECTOR & PARSER (ISBB PREMIUM ENGINE) ---
    const nominaEl = getElementSafe(xmlDoc, ['nomina12:Nomina', 'Nomina', 'nomina11:Nomina', 'nomina:Nomina']);
    const isNomina = !!nominaEl || tipo === 'N';

    let nominaVersion = '';
    let nominaTipo = '';
    let nominaFechaPago = '';
    let nominaFechaInicialPago = '';
    let nominaFechaFinalPago = '';
    let nominaNumDiasPagados = 0;
    let nominaTotalPercepciones = 0;
    let nominaTotalDeducciones = 0;
    let nominaTotalOtrosPagos = 0;
    let nominaNeto = 0;

    let nominaReceptorCurp = '';
    let nominaReceptorNss = '';
    let nominaReceptorTipoContrato = '';
    let nominaReceptorTipoRegimen = '';
    let nominaReceptorNumEmpleado = '';
    let nominaReceptorPeriodicidadPago = '';
    let nominaReceptorClaveEntFed = '';

    let nominaPercepcionesStr = '';
    let nominaDeduccionesStr = '';

    // Granular payroll breakdown variables
    let percepcionSueldo = 0;
    let percepcionAguinaldoGrav = 0;
    let percepcionAguinaldoExent = 0;
    let percepcionPrimaVacGrav = 0;
    let percepcionPrimaVacExent = 0;
    let percepcionPrimaDomGrav = 0;
    let percepcionPrimaDomExent = 0;
    let percepcionHorasExtrasGrav = 0;
    let percepcionHorasExtrasExent = 0;
    let percepcionBonosGrav = 0;
    let percepcionBonosExent = 0;
    let percepcionPtuGrav = 0;
    let percepcionPtuExent = 0;
    let percepcionOtrosGrav = 0;
    let percepcionOtrosExent = 0;

    let deduccionIsr = 0;
    let deduccionImss = 0;
    let deduccionFondoAhorro = 0;
    let deduccionDescuentos = 0;
    let deduccionOtros = 0;

    if (isNomina) {
      if (nominaEl) {
        nominaVersion = getAttrSafe(nominaEl, ['Version', 'version']) || '1.1';
        const rawTipoNomina = getAttrSafe(nominaEl, ['TipoNomina', 'tipoNomina']) || '';
        if (rawTipoNomina === 'O') {
          nominaTipo = 'O - Ordinaria';
        } else if (rawTipoNomina === 'E') {
          nominaTipo = 'E - Extraordinaria';
        } else {
          nominaTipo = rawTipoNomina || 'Ordinaria';
        }
        
        nominaFechaPago = getAttrSafe(nominaEl, ['FechaPago', 'fechaPago']) || '';
        nominaFechaInicialPago = getAttrSafe(nominaEl, ['FechaInicialPago', 'fechaInicialPago']) || '';
        nominaFechaFinalPago = getAttrSafe(nominaEl, ['FechaFinalPago', 'fechaFinalPago']) || '';
        nominaNumDiasPagados = parseFloat(getAttrSafe(nominaEl, ['NumDiasPagados', 'numDiasPagados']) || '0');
        nominaTotalPercepciones = parseFloat(getAttrSafe(nominaEl, ['TotalPercepciones', 'totalPercepciones']) || '0');
        nominaTotalDeducciones = parseFloat(getAttrSafe(nominaEl, ['TotalDeducciones', 'totalDeducciones']) || '0');
        nominaTotalOtrosPagos = parseFloat(getAttrSafe(nominaEl, ['TotalOtrosPagos', 'totalOtrosPagos']) || '0');
        
        // Calculate net payroll
        nominaNeto = nominaTotalPercepciones + nominaTotalOtrosPagos - nominaTotalDeducciones;
        if (nominaNeto <= 0) {
          nominaNeto = total;
        }

        // Parse payroll receptor inside the Nomina element
        const nomReceptor = getElementSafe(nominaEl, ['nomina12:Receptor', 'Receptor', 'nomina11:Receptor', 'nomina:Receptor']);
        if (nomReceptor) {
          nominaReceptorCurp = getAttrSafe(nomReceptor, ['Curp', 'curp']);
          nominaReceptorNss = getAttrSafe(nomReceptor, ['NumSeguridadSocial', 'numSeguridadSocial']);
          const rawContrato = getAttrSafe(nomReceptor, ['TipoContrato', 'tipoContrato']);
          nominaReceptorTipoContrato = rawContrato ? `${rawContrato} - ${getContractTypeName(rawContrato)}` : '';
          const rawRegimen = getAttrSafe(nomReceptor, ['TipoRegimen', 'tipoRegimen']);
          nominaReceptorTipoRegimen = rawRegimen ? `${rawRegimen} - ${getRegimenTypeName(rawRegimen)}` : '';
          nominaReceptorNumEmpleado = getAttrSafe(nomReceptor, ['NumEmpleado', 'numEmpleado']);
          const rawPeriodicidad = getAttrSafe(nomReceptor, ['PeriodicidadPago', 'periodicidadPago']);
          nominaReceptorPeriodicidadPago = rawPeriodicidad ? `${rawPeriodicidad} - ${getPeriodicidadName(rawPeriodicidad)}` : '';
          nominaReceptorClaveEntFed = getAttrSafe(nomReceptor, ['ClaveEntFed', 'claveEntFed']);
        }

        // Parse Percepciones
        const percepcionesEl = getElementSafe(nominaEl, ['nomina12:Percepciones', 'Percepciones', 'nomina11:Percepciones', 'nomina:Percepciones']);
        if (percepcionesEl) {
          const percepcionList = getElementsSafe(percepcionesEl, ['nomina12:Percepcion', 'Percepcion', 'nomina11:Percepcion', 'nomina:Percepcion']);
          const pArr = percepcionList.map(p => {
            const rawTipoP = getAttrSafe(p, ['TipoPercepcion', 'tipoPercepcion']) || '';
            const tipoP = rawTipoP.trim().padStart(3, '0');
            const clave = getAttrSafe(p, ['Clave', 'clave']);
            const concepto = getAttrSafe(p, ['Concepto', 'concepto']) || '';
            const impGrav = parseFloat(getAttrSafe(p, ['ImporteGravado', 'importeGravado']) || '0');
            const impEx = parseFloat(getAttrSafe(p, ['ImporteExento', 'importeExento']) || '0');
            
            // Classify percepciones
            if (tipoP === '001') {
              percepcionSueldo += (impGrav + impEx);
            } else if (tipoP === '002') { // Aguinaldo / Gratificación Anual
              percepcionAguinaldoGrav += impGrav;
              percepcionAguinaldoExent += impEx;
            } else if (tipoP === '021') { // Prima Vacacional
              percepcionPrimaVacGrav += impGrav;
              percepcionPrimaVacExent += impEx;
            } else if (tipoP === '020') { // Prima Dominical
              percepcionPrimaDomGrav += impGrav;
              percepcionPrimaDomExent += impEx;
            } else if (tipoP === '019') { // Horas extras
              percepcionHorasExtrasGrav += impGrav;
              percepcionHorasExtrasExent += impEx;
            } else if (tipoP === '046') { // PTU
              percepcionPtuGrav += impGrav;
              percepcionPtuExent += impEx;
            } else if (
              tipoP === '038' || tipoP === '049' || tipoP === '050' ||
              concepto.toUpperCase().includes('BONO') ||
              concepto.toUpperCase().includes('PREMIO') ||
              concepto.toUpperCase().includes('PRODUCTIVIDAD') ||
              concepto.toUpperCase().includes('ASISTENCIA') ||
              concepto.toUpperCase().includes('PUNTUALIDAD') ||
              concepto.toUpperCase().includes('VALES') ||
              concepto.toUpperCase().includes('FONDO')
            ) {
              percepcionBonosGrav += impGrav;
              percepcionBonosExent += impEx;
            } else {
              percepcionOtrosGrav += impGrav;
              percepcionOtrosExent += impEx;
            }

            return `${clave || 'S/C'} (${concepto || 'Sin concepto'}): Grav: $${impGrav.toFixed(2)}, Ex: $${impEx.toFixed(2)}`;
          });
          nominaPercepcionesStr = pArr.join(' | ');
        }

        // Parse Deducciones
        const deduccionesEl = getElementSafe(nominaEl, ['nomina12:Deducciones', 'Deducciones', 'nomina11:Deducciones', 'nomina:Deducciones']);
        if (deduccionesEl) {
          const deduccionList = getElementsSafe(deduccionesEl, ['nomina12:Deduccion', 'Deduccion', 'nomina11:Deduccion', 'nomina:Deduccion']);
          const dArr = deduccionList.map(d => {
            const rawTipoD = getAttrSafe(d, ['TipoDeduccion', 'tipoDeduccion']) || '';
            const tipoD = rawTipoD.trim().padStart(3, '0');
            const clave = getAttrSafe(d, ['Clave', 'clave']);
            const concepto = getAttrSafe(d, ['Concepto', 'concepto']) || '';
            const imp = parseFloat(getAttrSafe(d, ['Importe', 'importe']) || '0');
            
            // Classify deducciones
            if (tipoD === '002') {
              deduccionIsr += imp;
            } else if (tipoD === '001') { // IMSS / Seguridad Social
              deduccionImss += imp;
            } else if (tipoD === '005' || concepto.toUpperCase().includes('AHORRO') || concepto.toUpperCase().includes('CAJA')) { // Fondo de ahorro
              deduccionFondoAhorro += imp;
            } else if (
              tipoD === '004' ||
              concepto.toUpperCase().includes('DESCUENTO') ||
              concepto.toUpperCase().includes('PRESTAMO') ||
              concepto.toUpperCase().includes('PRÉSTAMO') ||
              concepto.toUpperCase().includes('INFONAVIT') ||
              concepto.toUpperCase().includes('FONACOT') ||
              concepto.toUpperCase().includes('PENSION') ||
              concepto.toUpperCase().includes('PENSIÓN') ||
              concepto.toUpperCase().includes('SINDICATO')
            ) {
              deduccionDescuentos += imp;
            } else {
              deduccionOtros += imp;
            }

            return `${clave || 'S/C'} (${concepto || 'Sin concepto'}): $${imp.toFixed(2)}`;
          });
          nominaDeduccionesStr = dArr.join(' | ');
        }
      } else {
        nominaVersion = '1.2';
        nominaTipo = 'Nómina CFDI';
        nominaNeto = total;
      }
    }

    let parsedHora = '';
    if (fecha && fecha.includes('T')) {
      parsedHora = fecha.split('T')[1].substring(0, 8);
    } else {
      parsedHora = '00:00:00';
    }

    const lowerFileName = fileName.toLowerCase();
    const isCancelada = 
      lowerFileName.includes('cancelada') || 
      lowerFileName.includes('cancelado') || 
      lowerFileName.includes('cancel') || 
      (total === 0 && subTotal === 0 && (tipo === 'I' || tipo === 'E')) ||
      !comprobante || 
      xmlDoc.documentElement.nodeName.toLowerCase().includes('cancel');

    return {
      fileName,
      folio: folio || 'S/F',
      serie: serie || '',
      fecha: fecha ? fecha.substring(0, 10) : 'S/F',
      tipo: isNomina ? 'N' : tipo,
      fechaHoraRaw: fecha || '',
      hora: parsedHora,
      isCancelada,
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
      iepsTotal,

      // Payroll specific attributes
      isNomina,
      nominaVersion,
      nominaTipo,
      nominaFechaPago,
      nominaFechaInicialPago,
      nominaFechaFinalPago,
      nominaNumDiasPagados,
      nominaReceptorCurp,
      nominaReceptorNss,
      nominaReceptorTipoContrato,
      nominaReceptorTipoRegimen,
      nominaReceptorNumEmpleado,
      nominaReceptorPeriodicidadPago,
      nominaReceptorClaveEntFed,
      nominaTotalPercepciones,
      nominaTotalDeducciones,
      nominaTotalOtrosPagos,
      nominaNeto,
      nominaPercepcionesStr,
      nominaDeduccionesStr,

      // Detailed parsed payroll items
      percepcionSueldo,
      percepcionAguinaldoGrav,
      percepcionAguinaldoExent,
      percepcionPrimaVacGrav,
      percepcionPrimaVacExent,
      percepcionPrimaDomGrav,
      percepcionPrimaDomExent,
      percepcionHorasExtrasGrav,
      percepcionHorasExtrasExent,
      percepcionBonosGrav,
      percepcionBonosExent,
      percepcionPtuGrav,
      percepcionPtuExent,
      percepcionOtrosGrav,
      percepcionOtrosExent,
      deduccionIsr,
      deduccionImss,
      deduccionFondoAhorro,
      deduccionDescuentos,
      deduccionOtros,
      allTaxesMap
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

  // Remove a single parsed file safely by filename
  const handleRemoveFileByFilename = (fileNameToRemove: string) => {
    setUploadedFiles(prev => prev.filter(f => f.fileName !== fileNameToRemove));
    if (uploadedFiles.length <= 1) {
      setAuditResult('');
    }
  };

  // Reset entire files console
  const handleClearAllFiles = () => {
    setUploadedFiles([]);
    setAuditResult('');
  };

  // Search filtering logic for the XML table with Advanced Filter controls
  const filteredFilesList = React.useMemo(() => {
    return sortedUploadedFiles.filter(item => {
      // 0. Filter by Selected Client RFC (if active)
      if (selectedClientFilter !== 'ALL') {
        const matchesClient = 
          item.emisorRfc.toUpperCase() === selectedClientFilter.toUpperCase() ||
          item.receptorRfc.toUpperCase() === selectedClientFilter.toUpperCase();
        if (!matchesClient) return false;
      }

      // 1. Simple search query-matching
      if (xmlSearchQuery) {
        const q = xmlSearchQuery.toLowerCase();
        const matchesSimple = (
          item.fileName.toLowerCase().includes(q) ||
          item.emisorNombre.toLowerCase().includes(q) ||
          item.emisorRfc.toLowerCase().includes(q) ||
          item.receptorNombre.toLowerCase().includes(q) ||
          item.receptorRfc.toLowerCase().includes(q) ||
          item.folio.toLowerCase().includes(q) ||
          item.conceptos.some(c => c.toLowerCase().includes(q))
        );
        if (!matchesSimple) return false;
      }

      // 2. CFDI Type filter
      if (filterCfdiType !== 'ALL') {
        if (item.tipo !== filterCfdiType) return false;
      }

      // 3. Date range filters
      if (filterStartDate) {
        if (item.fecha < filterStartDate) return false;
      }
      if (filterEndDate) {
        if (item.fecha > filterEndDate) return false;
      }

      // 4. RFC Emisor filter
      if (filterRfcEmisor.trim()) {
        const emisorQ = filterRfcEmisor.trim().toLowerCase();
        const matchesEmisor = (
          item.emisorRfc.toLowerCase().includes(emisorQ) ||
          item.emisorNombre.toLowerCase().includes(emisorQ)
        );
        if (!matchesEmisor) return false;
      }

      // 5. RFC Receptor filter
      if (filterRfcReceptor.trim()) {
        const receptorQ = filterRfcReceptor.trim().toLowerCase();
        const matchesReceptor = (
          item.receptorRfc.toLowerCase().includes(receptorQ) ||
          item.receptorNombre.toLowerCase().includes(receptorQ)
        );
        if (!matchesReceptor) return false;
      }

      // 6. Specific Concepts filter
      if (filterConcept.trim()) {
        const conceptQ = filterConcept.trim().toLowerCase();
        const matchesConcept = item.conceptos.some(c => c.toLowerCase().includes(conceptQ));
        if (!matchesConcept) return false;
      }

      return true;
    });
  }, [sortedUploadedFiles, xmlSearchQuery, filterStartDate, filterEndDate, filterCfdiType, filterRfcEmisor, filterRfcReceptor, filterConcept, selectedClientFilter]);

  // High performance computations on parsed XMLs, dynamically recalculating based on active advanced filters list
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

    let impuestoExentoTotal = 0;
    let noObjetoImpuestoTotal = 0;
    let tasa0BaseTotal = 0;
    let tasa16BaseTotal = 0;
    let iepsTotalSum = 0;

    filteredFilesList.forEach(f => {
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

      impuestoExentoTotal += f.impuestoExento;
      noObjetoImpuestoTotal += f.noObjetoImpuesto;
      tasa0BaseTotal += f.tasa0Base;
      tasa16BaseTotal += f.tasa16Base;
      iepsTotalSum += f.iepsTotal;
    });

    const balanceIva = ivaTrasladadoTotal - ivaAcreditableTotal - ivaRetenidoTotal;

    return {
      totalFiles: filteredFilesList.length,
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
      impuestoExentoTotal,
      noObjetoImpuestoTotal,
      tasa0BaseTotal,
      tasa16BaseTotal,
      iepsTotalSum
    };
  }, [filteredFilesList]);

  // Export filtered catalog to standard Excel workbook (Chronological)
  const handleExportToExcel = () => {
    if (filteredFilesList.length === 0) return;
    
    // Sort all files chronologically by date and emission hour
    const sortedFiles = [...filteredFilesList].sort((a, b) => {
      const valA = a.fechaHoraRaw || a.fecha || '';
      const valB = b.fechaHoraRaw || b.fecha || '';
      return valA.localeCompare(valB);
    });

    // Exclude payroll invoices and cancelled invoices from the general audit worksheet
    const generalFiles = sortedFiles.filter(f => !f.isNomina && f.tipo !== 'N' && !f.isCancelada);

    // Collect all unique tax labels from all files to create columns for each detected tax dynamically!
    const uniqueTaxLabelsSet = new Set<string>();
    generalFiles.forEach(f => {
      if (f.allTaxesMap) {
        Object.keys(f.allTaxesMap).forEach(lbl => {
          uniqueTaxLabelsSet.add(lbl);
        });
      }
    });
    const uniqueTaxLabels = Array.from(uniqueTaxLabelsSet).sort();

    const excelRows = generalFiles.map(f => {
      const row: Record<string, any> = {
        'Fecha Emisión': f.fecha,
        'Hora Emisión': f.hora || '00:00:00',
        'Archivo': f.fileName,
        'Serie': f.serie,
        'Folio': f.folio,
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
        'Total Facturado ($)': f.total,
        'Conceptos Principales': f.conceptos.join(' | ')
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
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Auditoría General');
    
    // Add distinct high-fidelity sheet for Payroll (Nómina) break down
    const payrollFiles = sortedFiles.filter(f => f.isNomina || f.tipo === 'N');
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
        
        // --- CONCEPTOS CRUDOS DESCRIPTIVOS COMPLETO ---
        'Toda la Percepción (SAT)': f.nominaPercepcionesStr || 'No especificada',
        'Toda la Deducción (SAT)': f.nominaDeduccionesStr || 'No especificada'
      }));
      
      const payrollWorksheet = XLSX.utils.json_to_sheet(payrollRows);
      XLSX.utils.book_append_sheet(workbook, payrollWorksheet, 'Desglose de Nóminas');
    }

    // Add optional high-fidelity sheet for Cancelled invoices if any exist
    const cancelledFiles = sortedFiles.filter(f => f.isCancelada);
    if (cancelledFiles.length > 0) {
      const cancelledRows = cancelledFiles.map(f => ({
        'Fecha Emisión': f.fecha,
        'Hora Emisión': f.hora || '00:00:00',
        'Archivo': f.fileName,
        'Serie': f.serie,
        'Folio': f.folio,
        'Tipo CFDI': f.tipo === 'I' ? 'I - Ingreso (Cobros)' : f.tipo === 'E' ? 'E - Egreso (Gastos)' : f.tipo === 'N' ? 'N - Nómina (Sueldos)' : f.tipo === 'P' ? 'P - Pago' : 'Otros',
        'RFC Emisor': f.emisorRfc,
        'Razón Social Emisor': f.emisorNombre,
        'RFC Receptor': f.receptorRfc,
        'Razón Social Receptor': f.receptorNombre,
        'Total Facturado ($)': f.total,
        'Conceptos Principales': f.conceptos.join(' | '),
        'Estado': 'MARCADA COMO CANCELADA / SIN VALOR OPERATIVO'
      }));
      
      const cancelledWorksheet = XLSX.utils.json_to_sheet(cancelledRows);
      XLSX.utils.book_append_sheet(workbook, cancelledWorksheet, 'Facturas Canceladas');
    }
    
    XLSX.writeFile(workbook, `Conciliacion_XML_ISBB_${new Date().toISOString().substring(0, 10)}.xlsx`);
  };

  // --- ADVANCED FILTER ACTIONS ---
  const applyPresetFilter = (preset: FilterPreset) => {
    setFilterStartDate(preset.startDate);
    setFilterEndDate(preset.endDate);
    setFilterCfdiType(preset.cfdiType);
    setFilterRfcEmisor(preset.rfcEmisor);
    setFilterRfcReceptor(preset.rfcReceptor);
    setFilterConcept(preset.conceptText);
  };

  const handleSaveCurrentFilter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!presetName.trim()) return;
    
    const newPreset: FilterPreset = {
      id: `filter-preset-${Date.now()}`,
      name: presetName.trim(),
      startDate: filterStartDate,
      endDate: filterEndDate,
      cfdiType: filterCfdiType,
      rfcEmisor: filterRfcEmisor,
      rfcReceptor: filterRfcReceptor,
      conceptText: filterConcept
    };

    setSavedFilters(prev => [...prev, newPreset]);
    setPresetName('');
  };

  const handleRemovePreset = (idToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSavedFilters(prev => prev.filter(p => p.id !== idToRemove));
  };

  const handleResetFilters = () => {
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterCfdiType('ALL');
    setFilterRfcEmisor('');
    setFilterRfcReceptor('');
    setFilterConcept('');
    setXmlSearchQuery('');
  };

  // Send XML context to modern server-side endpoint for expert tax audit
  const handleAnalyzeXmlAI = async () => {
    if (uploadedFiles.length === 0 || auditing) return;
    
    setAuditing(true);
    setAuditResult('');
    
    // Thin down files array to strictly match active models context windows securely
    const structuredDetails = filteredFilesList.map(f => ({
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
    } catch (error: any) {
      console.error('AI XML audit error:', error);
      setAuditResult(`⚠️ Error: ${error.message || 'La auditoría con Inteligencia Artificial no pudo procesarse.'}`);
    } finally {
      setAuditing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col antialiased">
      {/* Upper header segment */}
      <header className="bg-gold-gradient shadow-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 min-h-[5rem] py-3 md:py-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 backdrop-blur-md p-2 rounded-xl border border-white/20">
              <FileSpreadsheet className="text-wheat w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tighter text-white leading-none text-shadow-sm">
                ISBB <span className="text-wheat">SOLUCIONES</span>
              </h1>
              <p className="text-[10px] text-wheat/90 font-bold uppercase tracking-wider mt-1.5">
                ANCOFI: Análisis y Conciliación Fiscal
              </p>
            </div>
          </div>

          {/* Tab Navigation Menu & Settings */}
          {isLoggedIn && (
            <div className="flex flex-wrap items-center gap-2 md:gap-4">
              <nav className="flex items-center bg-slate-900/40 p-1 rounded-xl border border-white/5">
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'dashboard'
                      ? 'bg-wheat text-slate-950 shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Conciliador XML</span>
                </button>
                <button
                  onClick={() => setActiveTab('bank-statements')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'bank-statements'
                      ? 'bg-wheat text-slate-950 shadow-sm'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Estado de Cuenta AI</span>
                </button>
                {currentUser?.email.toLowerCase() === 'demo@ancofi.com' && (
                  <button
                    onClick={() => setActiveTab('accounts')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      activeTab === 'accounts'
                        ? 'bg-wheat text-slate-950 shadow-sm'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Administración de Cuentas</span>
                  </button>
                )}
              </nav>

              <div className="h-6 w-px bg-white/10 hidden sm:block" />

              {/* User Avatar Circle */}
              <div className="flex items-center gap-2">
                <div className="flex flex-col text-right hidden sm:flex">
                  <span className="text-xs font-black text-white leading-none">
                    {currentUser?.name || 'Usuario'}
                  </span>
                  <span className="text-[9px] text-wheat/70 font-mono tracking-wider mt-0.5 uppercase">
                    {currentUser?.role || 'Auditor'}
                  </span>
                </div>
                <div className="w-8 h-8 rounded-full bg-slate-900/60 border border-wheat/20 flex items-center justify-center font-bold text-xs text-wheat uppercase shadow-inner">
                  {(currentUser?.name || 'U').substring(0, 2)}
                </div>
              </div>

              <button
                onClick={handleLogout}
                title="Cerrar sesión de ANCOFI"
                className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 hover:text-white rounded-xl px-3 py-1.5 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer border border-rose-500/15"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Salir</span>
              </button>
            </div>
          )}

          {!isLoggedIn && (
            <div className="flex items-center gap-2 self-end md:self-auto">
              <span className="bg-amber-500/10 text-wheat border border-amber-500/20 text-[9px] font-bold px-3 py-1.5 rounded-full uppercase tracking-widest inline-flex items-center gap-1.5 bg-slate-800">
                <ShieldCheck className="w-3.5 h-3.5 text-wheat animate-pulse" />
                Acceso Resguardado
              </span>
            </div>
          )}
        </div>
      </header>

      {!isLoggedIn ? (
        <div className="flex-1 flex flex-col items-center justify-start py-12 px-4 sm:px-6 lg:px-8 bg-slate-100 relative overflow-y-auto w-full">
          {/* Decorative background orbits */}
          <div className="absolute top-0 right-0 -mr-24 -mt-24 w-96 h-96 bg-wheat/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-24 -mb-24 w-96 h-96 bg-amber-550/10 rounded-full blur-3xl pointer-events-none" />

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-4xl bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-2xl grid grid-cols-1 md:grid-cols-12 min-h-[500px]"
          >
            {/* Left Brand Showcase Column */}
            <div className="md:col-span-5 bg-slate-900 p-8 text-white flex flex-col justify-between relative overflow-hidden">
              <div className="absolute inset-0 bg-gold-gradient opacity-10 pointer-events-none" />
              <div className="space-y-6 relative z-10">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] bg-slate-800 text-gold-300 font-extrabold uppercase tracking-widest border border-slate-700/60">
                  <ShieldCheck className="w-3.5 h-3.5 text-gold-400" /> SISTEMA SEGURO
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-wheat/80 font-mono tracking-widest uppercase font-black">ISBB SOLUCIONES</p>
                  <h3 className="text-3xl font-black text-white tracking-tight">
                    ANCOFI
                  </h3>
                  <p className="text-xs text-slate-350 font-medium leading-relaxed">
                    Análisis y Conciliación Fiscal de CFDIs bajo la infraestructura de ISBB.
                  </p>
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-800">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 bg-amber-500/10 p-1.5 rounded-lg border border-amber-500/20">
                      <FileSpreadsheet className="w-4 h-4 text-wheat" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Auditoría CFDI 4.0</p>
                      <p className="text-[10px] text-slate-400">Conversión inmediata de archivos XML a análisis contables.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 bg-amber-500/10 p-1.5 rounded-lg border border-amber-500/20">
                      <TrendingUp className="w-4 h-4 text-wheat" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Control Fiscal</p>
                      <p className="text-[10px] text-slate-400">Declaraciones listas con desglose de tasas del SAT.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 bg-amber-500/10 p-1.5 rounded-lg border border-amber-500/20">
                      <Bot className="w-4 h-4 text-wheat" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Análisis con Inteligencia Artificial</p>
                      <p className="text-[10px] text-slate-400">Detección automática de inconsistencias en segundos.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-8 relative z-10">
                <p className="text-[9px] text-slate-400 font-mono">ANCOFI v2026.1 • Protegido con SSL de 256 bits</p>
              </div>
            </div>

            {/* Right Form Column */}
            <div className="md:col-span-7 p-8 sm:p-12 flex flex-col justify-center bg-white">
              <div className="space-y-6 max-w-md w-full mx-auto">
                <div className="space-y-1">
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">Ingreso al Sistema</h2>
                  <p className="text-xs text-slate-500 font-medium">Proporcione sus credenciales fiscales para ingresar a la plataforma.</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                  {loginError && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-xs font-medium text-red-650"
                    >
                      <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <span>{loginError}</span>
                    </motion.div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">Usuario / Correo Electrónico</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <User className="h-4 w-4 text-slate-400" />
                      </div>
                      <input
                        type="email"
                        required
                        placeholder="ejemplo@ancofi.com"
                        value={username}
                        onChange={(e) => {
                          setUsername(e.target.value);
                          if (loginError) setLoginError('');
                        }}
                        className="block w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none transition-all placeholder-slate-400 text-slate-800"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Contraseña</label>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Lock className="h-4 w-4 text-slate-400" />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (loginError) setLoginError('');
                        }}
                        className="block w-full pl-10 pr-10 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none transition-all placeholder-slate-400 text-slate-800"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full mt-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 text-white font-black py-3 px-4 rounded-xl shadow-lg border-b-2 border-amber-700/40 hover:shadow-xl transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider relative overflow-hidden active:scale-[0.98] cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        <span>Verificando Acceso contable...</span>
                      </>
                    ) : (
                      <>
                        <LogIn className="w-4 h-4" />
                        <span>INGRESA AL SISTEMA ANCOFI</span>
                      </>
                    )}
                  </button>

                  <div className="text-center pt-2">
                    <p className="text-[10px] text-slate-450">
                      Sugerencia de prueba: <span className="font-bold text-slate-500">demo@ancofi.com</span> y contraseña <span className="font-bold text-slate-500 font-mono">123456</span>
                    </p>
                  </div>
                </form>
              </div>
            </div>
          </motion.div>
        </div>
      ) : (
        <>
          {activeTab === 'dashboard' ? (
            <>
              {/* Hero Header Area */}
              <div className="bg-slate-900 border-b border-slate-800 py-10 text-white relative overflow-hidden">
                <div className="max-w-7xl mx-auto px-4 relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
                  <div className="space-y-3 max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] bg-slate-800 text-gold-300 font-black uppercase tracking-wider border border-slate-705">
                        <Award className="w-3.5 h-3.5 text-gold-400" /> Conciliador de XML Premium / ISBB
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
                  
                  <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center self-start md:self-auto select-none">
                    <div className="flex items-center gap-3.5 bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700/50">
                      <div className="bg-wheat/10 p-2 rounded-xl">
                        <Bot className="text-wheat w-5 h-5 pointer-events-none" />
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider leading-none">Módulos Activos</p>
                        <p className="text-[11px] text-wheat font-semibold mt-1">Consola Fiscal Activa</p>
                      </div>
                    </div>

                    {/* Integrated dynamic client selector */}
                    <div className="flex flex-col justify-center bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700/50 min-w-[200px]">
                      <label className="text-[9px] text-wheat uppercase font-black tracking-widest block mb-1 hover:text-white transition-colors">
                        Empresa Cliente Selector:
                      </label>
                      <select
                        value={selectedClientFilter}
                        onChange={(e) => setSelectedClientFilter(e.target.value)}
                        className="bg-slate-900 text-white text-xs rounded-xl px-2.5 py-1.5 focus:border-amber-500 focus:outline-none transition-all cursor-pointer font-bold border border-slate-700 focus:ring-1 focus:ring-amber-500"
                      >
                        <option value="ALL">🔍 Todos los CFDIs SAT</option>
                        {clients.map(c => (
                          <option key={c.id} value={c.rfc}>🏢 {c.name.substring(0, 18)}... ({c.rfc})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                {/* Decorative background shapes */}
                <div className="absolute top-0 right-0 -mr-24 -mt-24 w-80 h-80 bg-wheat/5 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-0 -ml-24 -mb-24 w-80 h-80 bg-gold-900/20 rounded-full blur-3xl pointer-events-none" />
              </div>

      {/* Main Container Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 flex flex-col gap-8">
        <div className="space-y-8" id="xml-analyzer-container">
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

                      {/* Toggle Advanced Filters Button */}
                      <button 
                        onClick={() => setIsAdvancedFiltersOpen(!isAdvancedFiltersOpen)}
                        className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border shadow-sm ${
                          isAdvancedFiltersOpen 
                            ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-850' 
                            : 'bg-white text-slate-705 border-slate-200 hover:bg-slate-50'
                        }`}
                        title="Activar panel de búsqueda y filtros detallados"
                      >
                        <Search className="w-4 h-4" />
                        Filtros Avanzados
                        {(filterStartDate || filterEndDate || filterCfdiType !== 'ALL' || filterRfcEmisor || filterRfcReceptor || filterConcept) && (
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        )}
                      </button>

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

                  <AnimatePresence initial={false}>
                    {isAdvancedFiltersOpen && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="bg-slate-50/75 rounded-2xl border border-slate-200 p-5 space-y-4 overflow-hidden"
                      >
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                          <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                            Panel de Filtrado Avanzado
                          </span>
                          <button 
                            onClick={handleResetFilters}
                            className="text-[10px] font-bold text-red-600 hover:text-red-700 uppercase flex items-center gap-1 transition-colors"
                          >
                            Restablecer Filtros
                          </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                          {/* Column 1: Dates & CFDI Type */}
                          <div className="space-y-3">
                            <div>
                              <span className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Rango de Fechas (Desde / Hasta)</span>
                              <div className="grid grid-cols-2 gap-2">
                                <input 
                                  type="date"
                                  value={filterStartDate}
                                  onChange={(e) => setFilterStartDate(e.target.value)}
                                  className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-bold focus:border-gold-500 outline-none transition-colors"
                                />
                                <input 
                                  type="date"
                                  value={filterEndDate}
                                  onChange={(e) => setFilterEndDate(e.target.value)}
                                  className="bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs text-slate-700 font-bold focus:border-gold-500 outline-none transition-colors"
                                />
                              </div>
                            </div>

                            <div>
                              <span className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Tipo de CFDI</span>
                              <select 
                                value={filterCfdiType}
                                onChange={(e) => setFilterCfdiType(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-bold focus:border-gold-500 outline-none transition-colors"
                              >
                                <option value="ALL">Todos los tipos</option>
                                <option value="I">I - Ingresos (Ventas/Cobros)</option>
                                <option value="E">E - Egresos (Gastos)</option>
                                <option value="P">P - Complementos de Pago</option>
                                <option value="N">N - Nóminas (Recibos de Sueldo)</option>
                              </select>
                            </div>
                          </div>

                          {/* Column 2: RFC Emisor, Receptor & Specific concepts */}
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">RFC/Nombre Emisor</span>
                                <input 
                                  type="text"
                                  placeholder="RFC o Nombre..."
                                  value={filterRfcEmisor}
                                  onChange={(e) => setFilterRfcEmisor(e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-semibold focus:border-gold-500 outline-none transition-colors"
                                />
                              </div>
                              <div>
                                <span className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">RFC/Nombre Receptor</span>
                                <input 
                                  type="text"
                                  placeholder="RFC o Nombre..."
                                  value={filterRfcReceptor}
                                  onChange={(e) => setFilterRfcReceptor(e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-semibold focus:border-gold-500 outline-none transition-colors"
                                />
                              </div>
                            </div>

                            <div>
                              <span className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5">Conceptos o Productos Específicos</span>
                              <input 
                                type="text"
                                placeholder="Ej: honorarios, gasolina, arrendamiento..."
                                value={filterConcept}
                                onChange={(e) => setFilterConcept(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-medium focus:border-gold-500 outline-none transition-colors"
                              />
                            </div>
                          </div>

                          {/* Column 3: Predefined & Saved Presets */}
                          <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col justify-between">
                            <div>
                              <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Filtros Guardados</span>
                              
                              <div className="flex flex-wrap gap-1 max-h-[80px] overflow-y-auto mb-2 content-start">
                                {savedFilters.map((preset) => (
                                  <div
                                    key={preset.id}
                                    onClick={() => applyPresetFilter(preset)}
                                    className="text-[9px] bg-slate-50 hover:bg-gold-50 hover:text-gold-700 hover:border-gold-200 text-slate-650 px-2.5 py-1 rounded-lg border border-slate-200 font-bold flex items-center gap-1 transition-all cursor-pointer"
                                    title="Aplicar preset"
                                  >
                                    <span>{preset.name}</span>
                                    <span 
                                      onClick={(e) => handleRemovePreset(preset.id, e)}
                                      className="text-slate-400 hover:text-red-600 font-black ml-1 text-[11px] h-3 w-3 flex items-center justify-center rounded-full hover:bg-red-50"
                                      title="Quitar preset"
                                    >
                                      ×
                                    </span>
                                  </div>
                                ))}

                                {savedFilters.length === 0 && (
                                  <span className="text-[10px] text-slate-450 italic">Sin filtros guardados aún</span>
                                )}
                              </div>
                            </div>

                            {/* Save Preset Form */}
                            <form onSubmit={handleSaveCurrentFilter} className="flex gap-1 border-t border-slate-100 pt-2 shrink-0">
                              <input 
                                type="text"
                                placeholder="Guardar como..."
                                value={presetName}
                                onChange={(e) => setPresetName(e.target.value)}
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-[10px] font-semibold text-slate-700 focus:border-gold-400 outline-none transition-colors"
                                required
                              />
                              <button
                                type="submit"
                                className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold px-2.5 py-1 rounded-xl text-[9px] uppercase tracking-wider transition-all"
                              >
                                Guardar
                              </button>
                            </form>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

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
                                item.isCancelada
                                  ? 'bg-rose-50 text-rose-700 border border-rose-100'
                                  : item.tipo === 'I' 
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                    : item.tipo === 'E' 
                                      ? 'bg-amber-50 text-amber-700 border border-amber-100' 
                                      : item.tipo === 'N'
                                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                        : 'bg-slate-150 text-slate-600 border border-slate-200'
                              }`}>
                                {item.isCancelada
                                  ? 'Cancelada'
                                  : item.tipo === 'I' ? 'Cobro (I)' : item.tipo === 'E' ? 'Gasto (E)' : item.tipo === 'N' ? 'Nómina (N)' : `Pago (${item.tipo})`}
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
                              ${(item.tipo === 'I' ? item.ivaTrasladado : item.tipo === 'E' ? item.ivaAcreditable : 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                                  onClick={() => handleRemoveFileByFilename(item.fileName)}
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
                           {selectedFile.allTaxesMap && Object.keys(selectedFile.allTaxesMap).length > 0 && (
                            <div className="border-t border-slate-800 pt-2 col-span-2 space-y-1.5">
                              <p className="text-[9px] text-amber-400 font-black uppercase tracking-wider">Análisis Detallado de Impuestos CFDI:</p>
                              <div className="grid grid-cols-1 gap-1">
                                {Object.entries(selectedFile.allTaxesMap).map(([taxLabel, rawDetails]) => {
                                  const details = rawDetails as { base: number; importe: number; tasaStr: string; type: string };
                                  const showBaseLine = isIvaTasaSpecial(taxLabel);
                                  return (
                                    <div key={taxLabel} className="bg-slate-950/40 p-2 rounded-lg border border-slate-800/80 flex flex-col gap-0.5 text-[9px]">
                                      <div className="flex justify-between font-extrabold text-slate-100">
                                        <span>{taxLabel}</span>
                                        <span className="text-emerald-400">${details.importe.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                      </div>
                                      <div className="flex justify-between text-[8px] text-slate-400 font-mono">
                                        {showBaseLine ? (
                                          <span>Base Gravable: ${details.base.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        ) : (
                                          <span />
                                        )}
                                        <span>Factor: {details.tasaStr}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
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

                      {selectedFile.isNomina && (
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white space-y-3">
                          <p className="text-amber-400 font-extrabold text-[10px] border-b border-slate-800 pb-1.5 uppercase tracking-wider flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" /> Desglose de Nómina (Complemento SAT)
                          </p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px]">
                            <div>
                              <span className="text-slate-400 block font-semibold">Tipo de Nómina:</span>
                              <span className="font-bold text-slate-100">{selectedFile.nominaTipo || 'Ordinaria'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-semibold">Periodo Pago:</span>
                              <span className="font-bold text-slate-100 truncate inline-block max-w-[130px]" title={`${selectedFile.nominaFechaInicialPago || '?'} al ${selectedFile.nominaFechaFinalPago || '?'}`}>
                                {selectedFile.nominaFechaInicialPago || '?'} al {selectedFile.nominaFechaFinalPago || '?'}
                              </span>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-semibold">Días Pagados:</span>
                              <span className="font-bold text-slate-100 font-mono">{selectedFile.nominaNumDiasPagados || 0} días</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-semibold">No. de Empleado:</span>
                              <span className="font-bold text-slate-100 font-mono">{selectedFile.nominaReceptorNumEmpleado || 'N/A'}</span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-slate-400 block font-semibold">CURP o NSS del Trabajador:</span>
                              <span className="font-bold text-slate-100 font-mono truncate block" title={`CURP: ${selectedFile.nominaReceptorCurp || 'N/A'} - NSS: ${selectedFile.nominaReceptorNss || 'N/A'}`}>
                                CURP: {selectedFile.nominaReceptorCurp || 'N/A'} | NSS: {selectedFile.nominaReceptorNss || 'N/A'}
                              </span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-slate-400 block font-semibold">Régimen Fiscal Receptor:</span>
                              <span className="font-bold text-slate-100 truncate block font-sans" title={selectedFile.nominaReceptorTipoRegimen || 'N/A'}>{selectedFile.nominaReceptorTipoRegimen || 'N/A'}</span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-slate-400 block font-semibold">Tipo Contrato Laboral:</span>
                              <span className="font-bold text-slate-100 truncate block font-sans" title={selectedFile.nominaReceptorTipoContrato || 'N/A'}>{selectedFile.nominaReceptorTipoContrato || 'N/A'}</span>
                            </div>
                          </div>
                          
                          <div className="w-full h-px bg-slate-800 my-1.5" />
                          <div className="grid grid-cols-3 gap-2 text-center text-[9px] font-bold">
                            <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                              <span className="text-slate-450 block text-[8px] uppercase font-bold">Percepciones</span>
                              <span className="text-emerald-400 font-mono font-extrabold">${(selectedFile.nominaTotalPercepciones || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                              <span className="text-slate-450 block text-[8px] uppercase font-bold">Deducciones</span>
                              <span className="text-rose-400 font-mono font-extrabold">${(selectedFile.nominaTotalDeducciones || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="bg-indigo-950 p-2 rounded-xl border border-indigo-900/30">
                              <span className="text-indigo-300 block text-[8px] uppercase font-bold">Neto Recibido</span>
                              <span className="text-slate-100 font-mono font-extrabold">${(selectedFile.nominaNeto || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>

                          {/* Detailed In-App Payroll Receipt Breakdown */}
                          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-3.5 text-[10.5px]">
                            <div>
                              <p className="text-emerald-400 font-extrabold text-[9px] uppercase tracking-wider mb-2 border-b border-slate-900 pb-1.5 flex justify-between">
                                <span>Percepciones Desglosadas</span>
                                <span className="text-[7.5px] text-slate-400">Gravado / Exento</span>
                              </p>
                              <div className="space-y-1 bg-slate-900/45 p-1 rounded-lg">
                                <div className="flex justify-between items-center px-1.5 py-1">
                                  <span className="text-slate-400 font-medium">Sueldo Base (Importe Total):</span>
                                  <span className="font-bold text-emerald-400 font-mono">${(selectedFile.percepcionSueldo || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center px-1.5 py-1">
                                  <span className="text-slate-400 font-medium">Aguinaldo (Gratificación Anual):</span>
                                  <span className="font-bold text-slate-200 font-mono text-[9.5px]">
                                    ${(selectedFile.percepcionAguinaldoGrav || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} <span className="text-slate-600 font-normal">/</span> <span className="text-emerald-400">${(selectedFile.percepcionAguinaldoExent || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                  </span>
                                </div>
                                <div className="flex justify-between items-center px-1.5 py-1">
                                  <span className="text-slate-400 font-medium">Prima Vacacional:</span>
                                  <span className="font-bold text-slate-200 font-mono text-[9.5px]">
                                    ${(selectedFile.percepcionPrimaVacGrav || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} <span className="text-slate-600 font-normal">/</span> <span className="text-emerald-400">${(selectedFile.percepcionPrimaVacExent || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                  </span>
                                </div>
                                <div className="flex justify-between items-center px-1.5 py-1">
                                  <span className="text-slate-400 font-medium">Prima Dominical:</span>
                                  <span className="font-bold text-slate-200 font-mono text-[9.5px]">
                                    ${(selectedFile.percepcionPrimaDomGrav || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} <span className="text-slate-600 font-normal">/</span> <span className="text-emerald-400">${(selectedFile.percepcionPrimaDomExent || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                  </span>
                                </div>
                                <div className="flex justify-between items-center px-1.5 py-1">
                                  <span className="text-slate-400 font-medium">Horas Extras:</span>
                                  <span className="font-bold text-slate-200 font-mono text-[9.5px]">
                                    ${(selectedFile.percepcionHorasExtrasGrav || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} <span className="text-slate-600 font-normal">/</span> <span className="text-emerald-400">${(selectedFile.percepcionHorasExtrasExent || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                  </span>
                                </div>
                                <div className="flex justify-between items-center px-1.5 py-1">
                                  <span className="text-slate-400 font-medium">Reparto de Utilidades PTU:</span>
                                  <span className="font-bold text-slate-200 font-mono text-[9.5px]">
                                    ${(selectedFile.percepcionPtuGrav || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} <span className="text-slate-600 font-normal">/</span> <span className="text-emerald-400">${(selectedFile.percepcionPtuExent || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                  </span>
                                </div>
                                <div className="flex justify-between items-center px-1.5 py-1">
                                  <span className="text-slate-400 font-medium">Bonos, Premios y Vales:</span>
                                  <span className="font-bold text-slate-200 font-mono text-[9.5px]">
                                    ${(selectedFile.percepcionBonosGrav || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} <span className="text-slate-600 font-normal">/</span> <span className="text-emerald-400">${(selectedFile.percepcionBonosExent || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                  </span>
                                </div>
                                {(selectedFile.percepcionOtrosGrav || 0) + (selectedFile.percepcionOtrosExent || 0) > 0 && (
                                  <div className="flex justify-between items-center px-1.5 py-1">
                                    <span className="text-slate-400 font-medium">Otros Estímulos / Percepciones:</span>
                                    <span className="font-bold text-slate-200 font-mono text-[9.5px]">
                                      ${(selectedFile.percepcionOtrosGrav || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })} <span className="text-slate-600 font-normal">/</span> <span className="text-emerald-400">${(selectedFile.percepcionOtrosExent || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div>
                              <p className="text-rose-450 font-extrabold text-[9px] uppercase tracking-wider mb-2 border-b border-slate-900 pb-1.5">
                                Deducciones Desglosadas
                              </p>
                              <div className="space-y-1 bg-slate-900/45 p-1 rounded-lg">
                                <div className="flex justify-between items-center px-1.5 py-1">
                                  <span className="text-slate-400 font-medium">Imposición ISR Retenido:</span>
                                  <span className="font-bold text-rose-400 font-mono">${(selectedFile.deduccionIsr || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center px-1.5 py-1">
                                  <span className="text-slate-400 font-medium">Seguridad Social IMSS:</span>
                                  <span className="font-bold text-rose-400 font-mono">${(selectedFile.deduccionImss || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center px-1.5 py-1">
                                  <span className="text-slate-400 font-medium">Fondo de Ahorro / Caja:</span>
                                  <span className="font-bold text-rose-400 font-mono">${(selectedFile.deduccionFondoAhorro || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between items-center px-1.5 py-1">
                                  <span className="text-slate-400 font-medium">Descuentos, Créditos e Infonavit:</span>
                                  <span className="font-bold text-rose-400 font-mono">${(selectedFile.deduccionDescuentos || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                </div>
                                {(selectedFile.deduccionOtros || 0) > 0 && (
                                  <div className="flex justify-between items-center px-1.5 py-1">
                                    <span className="text-slate-400 font-medium">Otras Deducciones / Sindicato:</span>
                                    <span className="font-bold text-rose-400 font-mono">${(selectedFile.deduccionOtros || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {selectedFile.nominaPercepcionesStr && (
                            <div className="text-[9.5px] mt-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 max-h-[100px] overflow-y-auto">
                              <span className="text-emerald-400 font-bold uppercase block mb-1">Conceptos SAT Percepciones (Crudo):</span>
                              <p className="text-slate-300 leading-normal font-sans">{selectedFile.nominaPercepcionesStr}</p>
                            </div>
                          )}

                          {selectedFile.nominaDeduccionesStr && (
                            <div className="text-[9.5px] mt-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 max-h-[100px] overflow-y-auto">
                              <span className="text-rose-400 font-bold uppercase block mb-1">Conceptos SAT Deducciones (Crudo):</span>
                              <p className="text-slate-300 leading-normal font-sans">{selectedFile.nominaDeduccionesStr}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* No subscription plans information banner */}


              



        </div>
      </main>
            </>
          ) : activeTab === 'bank-statements' ? (
            <>
              <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 flex flex-col gap-12 animate-fade-in">
                <BankStatementAnalyzer />
              </main>
            </>
          ) : (
            <>
              {currentUser?.email.toLowerCase() === 'demo@ancofi.com' ? (
                <>
                  {/* Hero Banner Area for Administration view */}
                  <div className="bg-slate-900 border-b border-slate-800 py-10 text-white relative overflow-hidden">
                    <div className="max-w-7xl mx-auto px-4 relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8 animate-fade-in">
                      <div className="space-y-3 max-w-3xl">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] bg-slate-800 text-gold-300 font-black uppercase tracking-wider border border-slate-705">
                            <Users className="w-3.5 h-3.5 text-gold-400" /> Administración ANCOFI
                          </span>
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] bg-emerald-500/10 text-emerald-300 font-black uppercase tracking-wider border border-emerald-500/20">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Resguardo de Accesos SSL
                          </span>
                        </div>
                        <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight">
                          Administrar <span className="text-wheat">Cuentas & Clientes</span>
                        </h2>
                        <p className="text-slate-300 text-sm leading-relaxed">
                          Catálogo centralizado de autoría contable. Agregue nuevos usuarios autorizados, otorgue diferentes roles de auditoría, desactive accesos dinámicamente, e incorpore las razones sociales de clientes para segregar y clasificar CFDIs XML de forma automatizada por RFC.
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-4 bg-slate-800/60 p-3.5 rounded-2xl border border-slate-700/50 self-start md:self-auto select-none">
                        <div className="bg-wheat/10 p-2.5 rounded-xl">
                          <Users className="text-wheat w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider leading-none">Cuentas Activas</p>
                          <p className="text-xs text-wheat font-semibold mt-1.5">
                            {users.filter(u => u.status === 'Activo').length} Auditores • {clients.length} Empresas
                          </p>
                        </div>
                      </div>
                    </div>
                    {/* Decorative background shapes */}
                    <div className="absolute top-0 right-0 -mr-24 -mt-24 w-80 h-80 bg-wheat/5 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute bottom-0 left-0 -ml-24 -mb-24 w-80 h-80 bg-gold-900/20 rounded-full blur-3xl pointer-events-none" />
                  </div>

                  {/* Main Container Layout for Administration Panel */}
                  <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 flex flex-col gap-8 animate-fade-in">
                    <AccountsManager 
                      users={users} 
                      setUsers={setUsers} 
                      clients={clients} 
                      setClients={setClients}
                      currentUser={currentUser}
                    />
                  </main>
                </>
              ) : (
                <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-16 flex flex-col items-center justify-center text-center gap-6 animate-fade-in">
                  <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center border-2 border-rose-500/20 text-rose-500 shadow-xl shadow-rose-500/5">
                    <AlertTriangle className="w-10 h-10 text-rose-500" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">Acceso Altamente Restringido</h3>
                    <p className="text-sm text-slate-555 max-w-md leading-relaxed">
                      Por políticas estrictas de seguridad de <strong className="text-slate-900">ISBB Soluciones</strong>, solamente el personal con cuenta de <strong className="text-slate-900">Auditor de Pruebas</strong> del Sistema ANCOFI (<code className="bg-slate-100 px-1 py-0.5 rounded text-amber-600 font-bold font-mono text-[11px]">demo@ancofi.com</code>) está autorizado para administrar accesos y cuentas.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('dashboard')}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-black text-xs px-6 py-3 rounded-2xl shadow-lg hover:shadow-xl transition-all hover:text-wheat cursor-pointer active:scale-95 flex items-center gap-2"
                  >
                    <span>Regresar al Conciliador XML</span>
                  </button>
                </main>
              )}
            </>
          )}
        </>
      )}

      {/* Checkout Modal */}
      {checkoutModalPlan && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200 flex flex-col"
          >
            <div className="bg-slate-900 p-6 text-white flex justify-between items-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gold-gradient opacity-10 pointer-events-none" />
              <div className="relative z-10">
                <span className="bg-amber-500/10 text-wheat border border-amber-500/20 text-[9px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                  Pago Seguro SSL de 256 bits
                </span>
                <h4 className="font-extrabold text-lg text-white mt-1.5 flex items-center gap-1.5">
                  <Lock className="w-5 h-5 text-wheat" />
                  Suscripción ANCOFI
                </h4>
              </div>
              <button 
                onClick={() => {
                  setCheckoutModalPlan(null);
                  setSubscriptionSuccess(false);
                  setCardNumber('');
                  setCardName('');
                }}
                className="bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs rounded-xl text-slate-300 hover:text-white border border-white/5 transition-colors font-bold z-10 cursor-pointer"
              >
                Cancelar
              </button>
            </div>

            <div className="p-6 space-y-4">
              {subscriptionSuccess ? (
                <div className="text-center py-6 space-y-4">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600 border border-emerald-205">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xl font-black text-slate-900">¡Suscripción Activada!</h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Gracias por confiar en <strong className="text-slate-800">ISBB Soluciones</strong>. El Sistema ANCOFI ahora está completamente desbloqueado para sus CFDIs.
                    </p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-150 inline-block w-full">
                    <p className="text-[10px] text-slate-400 font-mono uppercase">ID Transacción:</p>
                    <p className="text-xs font-mono font-bold text-slate-800">TXN-ISBB-{Math.floor(100000 + Math.random() * 900000)}</p>
                  </div>
                  <button
                    onClick={() => {
                      setCheckoutModalPlan(null);
                      setSubscriptionSuccess(false);
                      setCardNumber('');
                      setCardName('');
                    }}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-3 rounded-2xl text-xs transition-all uppercase tracking-wider cursor-pointer"
                  >
                    Empezar a usar Premium
                  </button>
                </div>
              ) : (
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    setPaymentLoading(true);
                    setTimeout(() => {
                      setPaymentLoading(false);
                      setSubscriptionSuccess(true);
                      setIsSubscribedUser(true);
                      try {
                        localStorage.setItem('isbb_ancofi_premium_active', 'true');
                      } catch(err) {
                        console.warn(err);
                      }
                    }, 1800);
                  }}
                  className="space-y-4"
                >
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Plan Seleccionado:</p>
                      <p className="text-sm font-black text-slate-800">{checkoutModalPlan.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black text-amber-600">{checkoutModalPlan.price}</p>
                      <p className="text-[10px] text-slate-400 font-mono font-bold">{checkoutModalPlan.period}</p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Nombre del Titular</label>
                    <input 
                      type="text"
                      required
                      placeholder="Ej. Isaac Buitimea"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none transition-all placeholder-slate-400 text-slate-800 font-medium"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Número de Tarjeta</label>
                    <div className="relative">
                      <input 
                        type="text"
                        required
                        maxLength={19}
                        placeholder="4000 1234 5678 9010"
                        value={cardNumber}
                        onChange={(e) => {
                          let v = e.target.value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
                          let matches = v.match(/\d{4,16}/g);
                          let match = matches && matches[0] || '';
                          let parts = [];
                          for (let i=0, len=match.length; i<len; i+=4) {
                            parts.push(match.substring(i, i+4));
                          }
                          if (parts.length > 0) {
                            setCardNumber(parts.join(' '));
                          } else {
                            setCardNumber(v);
                          }
                        }}
                        className="w-full pl-3.5 pr-12 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none transition-all placeholder-slate-400 text-slate-800 font-mono font-bold"
                      />
                      <div className="absolute right-3.5 inset-y-0 flex items-center text-slate-400 font-black text-xs">
                        💳
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider">Vencimiento</label>
                      <input 
                        type="text"
                        required
                        maxLength={5}
                        placeholder="MM/AA"
                        className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none transition-all placeholder-slate-400 text-slate-800 font-mono font-bold"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider">CVV</label>
                      <input 
                        type="password"
                        required
                        maxLength={4}
                        placeholder="•••"
                        className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none transition-all placeholder-slate-400 text-slate-800 font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-450 text-center flex items-center justify-center gap-1.5">
                    <span>🔒 Datos cifrados bajo estándares de seguridad ISBB Bancaria</span>
                  </div>

                  <button
                    type="submit"
                    disabled={paymentLoading}
                    className="w-full mt-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-600 text-white font-black py-3 px-4 rounded-xl shadow-lg border-b-2 border-amber-700/40 hover:shadow-xl transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider relative overflow-hidden cursor-pointer"
                  >
                    {paymentLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                        <span>Verificando Fondos...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 text-wheat" />
                        <span>Confirmar Pago de {checkoutModalPlan.price}</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-slate-900 py-16 text-center border-t-4 border-wheat mt-auto">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-black text-white tracking-tighter mb-4">
            ISBB <span className="text-wheat">SOLUCIONES</span>
          </h2>
          <p className="text-wheat/40 text-xs font-bold uppercase tracking-[0.3em]">
            ANCOFI: SISTEMA DE ANÁLISIS Y CONCILIACIÓN FISCAL
          </p>
          <div className="w-12 h-1 bg-wheat mx-auto my-8 rounded-full opacity-30" />
          <p className="text-white/20 text-[10px] font-medium tracking-wider">
            © {new Date().getFullYear()} ISBB SOLUCIONES - Plataforma Especializada en Automatización Contable y Conciliación SAT (Sistema ANCOFI)
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
