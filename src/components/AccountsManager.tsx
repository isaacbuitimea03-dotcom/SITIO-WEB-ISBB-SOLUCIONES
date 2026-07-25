import React, { useState } from 'react';
import { 
  Users, 
  Building2, 
  UserPlus, 
  Trash2, 
  ShieldAlert, 
  CheckCircle2, 
  XCircle, 
  Search, 
  Key, 
  Mail, 
  Phone, 
  Building, 
  Plus, 
  AlertTriangle, 
  Info,
  ChevronRight,
  UserCheck,
  Check,
  X,
  Lock,
  Eye,
  EyeOff,
  Edit3,
  ShieldCheck,
  FileCode,
  FileText
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AncofiClient, fileToBase64, saveClients } from '../utils/profileHelpers';

interface AncofiUser {
  id: string;
  email: string;
  name: string;
  role: 'Administrador' | 'Contador Senior' | 'Auditor' | 'Consultor';
  status: 'Activo' | 'Inactivo';
  createdAt: string;
  password?: string;
}

interface AccountsManagerProps {
  users: AncofiUser[];
  setUsers: React.Dispatch<React.SetStateAction<AncofiUser[]>>;
  clients: AncofiClient[];
  setClients: React.Dispatch<React.SetStateAction<AncofiClient[]>>;
  currentUser: AncofiUser | null;
}

export default function AccountsManager({ 
  users, 
  setUsers, 
  clients, 
  setClients,
  currentUser 
}: AccountsManagerProps) {
  // Navigation inside the Accounts site: 'users' or 'clients'
  const [managerTab, setManagerTab] = useState<'users' | 'clients'>('clients');
  
  // Search states
  const [userQuery, setUserQuery] = useState('');
  const [clientQuery, setClientQuery] = useState('');

  // --- NEW USER FORM STATE ---
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'Administrador' | 'Contador Senior' | 'Auditor' | 'Consultor'>('Auditor');
  const [userFormError, setUserFormError] = useState('');
  const [userSuccessMsg, setUserSuccessMsg] = useState('');

  // --- CLIENT / PROFILE FORM STATE ---
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [newClientName, setNewClientName] = useState('');
  const [newClientRfc, setNewClientRfc] = useState('');
  const [newClientRegimen, setNewClientRegimen] = useState('personas_morales');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientAuthType, setNewClientAuthType] = useState<'FIEL' | 'CIEC'>('FIEL');
  
  // FIEL Credentials
  const [newClientFielPass, setNewClientFielPass] = useState('');
  const [cerFileName, setCerFileName] = useState('');
  const [cerBase64, setCerBase64] = useState('');
  const [keyFileName, setKeyFileName] = useState('');
  const [keyBase64, setKeyBase64] = useState('');

  // CIEC Credential
  const [newClientCiecPass, setNewClientCiecPass] = useState('');

  // UI state
  const [showPass, setShowPass] = useState(false);
  const [clientFormError, setClientFormError] = useState('');
  const [clientSuccessMsg, setClientSuccessMsg] = useState('');

  // --- REGIME TRANSLATIONS ---
  const REGIMEN_LABELS: Record<string, string> = {
    'personas_morales': 'General de Ley Personas Morales',
    'resico_pm': 'RESICO Persona Moral',
    'resico_pf': 'RESICO Persona Física',
    'sueldos_salarios': 'Sueldos y Salarios / Asimilados',
    'actividades_empresariales': 'Actividades Empresariales e Industriales'
  };

  // --- ACTIONS FOR USERS ---
  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormError('');
    setUserSuccessMsg('');

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) {
      setUserFormError('Todos los campos son requeridos.');
      return;
    }

    if (!emailPattern.test(newUserEmail.trim())) {
      setUserFormError('Por favor ingrese un correo electrónico válido.');
      return;
    }

    if (users.some(u => u.email.toLowerCase() === newUserEmail.trim().toLowerCase())) {
      setUserFormError('El correo electrónico ya está registrado en ANCOFI.');
      return;
    }

    const newUser: AncofiUser = {
      id: `user-${Date.now()}`,
      name: newUserName.trim(),
      email: newUserEmail.trim().toLowerCase(),
      password: newUserPassword,
      role: newUserRole,
      status: 'Activo',
      createdAt: new Date().toISOString().substring(0, 10)
    };

    setUsers(prev => [newUser, ...prev]);
    
    // Clear form
    setNewUserName('');
    setNewUserEmail('');
    setNewUserPassword('');
    setNewUserRole('Auditor');
    setUserSuccessMsg(`El usuario "${newUser.name}" se creó correctamente.`);
    setTimeout(() => {
      setShowAddUserModal(false);
      setUserSuccessMsg('');
    }, 1500);
  };

  const handleToggleUserStatus = (id: string) => {
    setUsers(prev => prev.map(u => {
      if (u.id === id) {
        // Prevent disabling yourself
        if (currentUser && currentUser.id === id) {
          alert('No puedes desactivar tu propia cuenta activa de administrador.');
          return u;
        }
        return {
          ...u,
          status: u.status === 'Activo' ? 'Inactivo' : 'Activo'
        };
      }
      return u;
    }));
  };

  const handleDeleteUser = (id: string, name: string) => {
    if (currentUser && currentUser.id === id) {
      alert('Por cuestiones de integridad, no puedes eliminar tu propia sesión activa.');
      return;
    }
    if (window.confirm(`¿Está seguro de que desea eliminar la cuenta del usuario "${name}"? Esta acción cancelará sus permisos de acceso.`)) {
      setUsers(prev => prev.filter(u => u.id !== id));
    }
  };

  // --- ACTIONS FOR CLIENTS & CREDENTIALS ---
  const handleCerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCerFileName(file.name);
      try {
        const b64 = await fileToBase64(file);
        setCerBase64(b64);
      } catch (err) {
        console.error('Error al procesar certificado CER:', err);
      }
    }
  };

  const handleKeyFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setKeyFileName(file.name);
      try {
        const b64 = await fileToBase64(file);
        setKeyBase64(b64);
      } catch (err) {
        console.error('Error al procesar llave KEY:', err);
      }
    }
  };

  const openCreateClientModal = () => {
    setEditingClientId(null);
    setNewClientName('');
    setNewClientRfc('');
    setNewClientRegimen('personas_morales');
    setNewClientEmail('');
    setNewClientPhone('');
    setNewClientAuthType('FIEL');
    setNewClientFielPass('');
    setCerFileName('');
    setCerBase64('');
    setKeyFileName('');
    setKeyBase64('');
    setNewClientCiecPass('');
    setClientFormError('');
    setClientSuccessMsg('');
    setShowAddClientModal(true);
  };

  const openEditClientModal = (client: AncofiClient) => {
    setEditingClientId(client.id);
    setNewClientName(client.name);
    setNewClientRfc(client.rfc);
    setNewClientRegimen(client.regimen || 'personas_morales');
    setNewClientEmail(client.email);
    setNewClientPhone(client.phone || '');
    setNewClientAuthType(client.authType || 'FIEL');
    setNewClientFielPass(client.fielPassword || '');
    setCerFileName(client.cerFileName || '');
    setCerBase64(client.cerBase64 || '');
    setKeyFileName(client.keyFileName || '');
    setKeyBase64(client.keyBase64 || '');
    setNewClientCiecPass(client.ciecPassword || '');
    setClientFormError('');
    setClientSuccessMsg('');
    setShowAddClientModal(true);
  };

  const handleSaveClient = (e: React.FormEvent) => {
    e.preventDefault();
    setClientFormError('');
    setClientSuccessMsg('');

    const rfcRegex = /^[A-Z&Ññ]{3,4}[0-9]{6}[A-Z0-9]{3}$/i;
    const cleanRfc = newClientRfc.trim().toUpperCase();

    if (!newClientName.trim() || !newClientRfc.trim() || !newClientEmail.trim()) {
      setClientFormError('Debe ingresar la Razón Social, el RFC y un correo electrónico de contacto.');
      return;
    }

    if (!rfcRegex.test(cleanRfc)) {
      setClientFormError('RFC inválido. Debe cumplir con la estructura fiscal del SAT (p. ej. ISM980121V98 o GOMJ850524H89).');
      return;
    }

    if (!editingClientId && clients.some(c => c.rfc.toUpperCase() === cleanRfc)) {
      setClientFormError('El RFC ingresado ya se encuentra registrado con otro cliente.');
      return;
    }

    const updatedClient: AncofiClient = {
      id: editingClientId || `client-${Date.now()}`,
      name: newClientName.trim(),
      rfc: cleanRfc,
      regimen: newClientRegimen,
      email: newClientEmail.trim().toLowerCase(),
      phone: newClientPhone.trim() || undefined,
      authType: newClientAuthType,
      fielPassword: newClientAuthType === 'FIEL' ? newClientFielPass : undefined,
      cerFileName: newClientAuthType === 'FIEL' ? cerFileName : undefined,
      cerBase64: newClientAuthType === 'FIEL' ? cerBase64 : undefined,
      keyFileName: newClientAuthType === 'FIEL' ? keyFileName : undefined,
      keyBase64: newClientAuthType === 'FIEL' ? keyBase64 : undefined,
      ciecPassword: newClientAuthType === 'CIEC' ? newClientCiecPass : undefined,
      registeredAt: editingClientId 
        ? (clients.find(c => c.id === editingClientId)?.registeredAt || new Date().toISOString().substring(0, 10))
        : new Date().toISOString().substring(0, 10)
    };

    let newClientsList: AncofiClient[];
    if (editingClientId) {
      newClientsList = clients.map(c => c.id === editingClientId ? updatedClient : c);
    } else {
      newClientsList = [updatedClient, ...clients];
    }

    setClients(newClientsList);
    saveClients(newClientsList);

    setClientSuccessMsg(editingClientId ? 'Perfil fiscal y credenciales SAT actualizadas correctamente.' : 'Perfil y credenciales SAT guardadas exitosamente.');
    setTimeout(() => {
      setShowAddClientModal(false);
      setClientSuccessMsg('');
    }, 1200);
  };

  const handleDeleteClient = (id: string, name: string) => {
    if (window.confirm(`¿Confirma eliminar a "${name}" del catálogo? Sus CFDIs no se eliminarán pero dejará de estar catalogado.`)) {
      setClients(prev => prev.filter(c => c.id !== id));
    }
  };

  // --- FILTERED SELECTIONS ---
  const filteredUsers = users.filter(u => {
    const q = userQuery.toLowerCase();
    return u.name.toLowerCase().includes(q) || 
           u.email.toLowerCase().includes(q) || 
           u.role.toLowerCase().includes(q);
  });

  const filteredClients = clients.filter(c => {
    const q = clientQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) || 
           c.rfc.toLowerCase().includes(q) || 
           c.email.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6" id="ancofi-manager-section">
      {/* Upper Navigation Tabs within administration site */}
      <div className="flex flex-col sm:flex-row bg-white border border-slate-200 rounded-3xl p-2.5 shadow-sm justify-between items-center gap-4">
        <div className="flex items-center gap-1.5 w-full sm:w-auto bg-slate-100 p-1 rounded-2xl">
          <button
            onClick={() => setManagerTab('users')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              managerTab === 'users' 
                ? 'bg-slate-900 text-white shadow-md' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/55'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Usuarios y Accesos</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ml-1 ${
              managerTab === 'users' ? 'bg-amber-500 text-slate-950' : 'bg-slate-250 text-slate-650'
            }`}>{users.length}</span>
          </button>
          <button
            onClick={() => setManagerTab('clients')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              managerTab === 'clients' 
                ? 'bg-slate-900 text-white shadow-md' 
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/55'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Empresas Clientes</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ml-1 ${
              managerTab === 'clients' ? 'bg-amber-500 text-slate-950' : 'bg-slate-250 text-slate-650'
            }`}>{clients.length}</span>
          </button>
        </div>

        {/* Action Button */}
        <div>
          {managerTab === 'users' ? (
            <button
              onClick={() => {
                setUserFormError('');
                setUserSuccessMsg('');
                setShowAddUserModal(true);
              }}
              className="bg-slate-900 hover:bg-slate-800 text-white hover:text-wheat text-xs font-bold px-4 py-2.5 rounded-xl transition-all inline-flex items-center gap-2 cursor-pointer border border-transparent shadow shadow-slate-900/10 active:scale-95"
            >
              <UserPlus className="w-4 h-4 text-wheat" />
              <span>Crear Cuenta de Acceso</span>
            </button>
          ) : (
            <button
              onClick={() => {
                setClientFormError('');
                setClientSuccessMsg('');
                setShowAddClientModal(true);
              }}
              className="bg-slate-900 hover:bg-slate-800 text-white hover:text-wheat text-xs font-bold px-4 py-2.5 rounded-xl transition-all inline-flex items-center gap-2 cursor-pointer border border-transparent shadow shadow-slate-900/10 active:scale-95"
            >
              <Building2 className="w-4 h-4 text-wheat" />
              <span>Añadir Cliente Fiscal</span>
            </button>
          )}
        </div>
      </div>

      {/* Primary Panels */}
      {managerTab === 'users' ? (
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col">
          {/* Filter Bar */}
          <div className="p-5 border-b border-slate-150 flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-50/50">
            <div className="space-y-1 self-start md:self-auto">
              <h4 className="text-sm font-black text-slate-900">Cuentas de Acceso</h4>
              <p className="text-[11px] text-slate-500">Administra los usuarios autorizados para auditoría de CFDIs y descarga de reportes.</p>
            </div>
            <div className="relative w-full md:w-80">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="Buscar por nombre, correo electrónico o rol..."
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                className="block w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:border-amber-500 focus:outline-none transition-all placeholder-slate-400 text-slate-800 shadow-inner"
              />
            </div>
          </div>

          {/* Users Table */}
          <div className="overflow-x-auto">
            {filteredUsers.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="mx-auto w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center border border-slate-200">
                  <Users className="w-5 h-5 text-slate-400" />
                </div>
                <h5 className="text-xs font-bold text-slate-700">No se encontraron usuarios legítimos</h5>
                <p className="text-[10px] text-slate-400 max-w-sm mx-auto">Prueba afinando tus criterios de búsqueda o añade un nuevo auditor desde el botón superior.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-150 bg-slate-50 text-[10px] uppercase font-mono tracking-wider text-slate-500">
                    <th className="py-3 px-6">Usuario Autorizado</th>
                    <th className="py-3 px-6">Correo del Sistema</th>
                    <th className="py-3 px-6">Rol Contable</th>
                    <th className="py-3 px-6">Contraseña Actual</th>
                    <th className="py-3 px-6">Fecha Registro</th>
                    <th className="py-3 px-6">Estado</th>
                    <th className="py-3 px-6 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredUsers.map((user) => {
                    const isSelf = currentUser && currentUser.id === user.id;
                    return (
                      <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-4 px-6 font-bold text-slate-900">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-250 flex items-center justify-center font-black text-slate-700 font-mono text-[11px] uppercase shadow-sm">
                              {user.name.substring(0, 2)}
                            </div>
                            <div>
                              <p className="font-black text-slate-850 flex items-center gap-1.5">
                                {user.name}
                                {isSelf && (
                                  <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 border border-amber-500/15 font-bold">Tú</span>
                                )}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-slate-650 font-medium font-mono">
                          {user.email}
                        </td>
                        <td className="py-4 px-6 text-slate-800 font-semibold text-[11px]">
                          <span className={`inline-flex px-2 py-1 rounded bg-slate-100 border border-slate-200 text-slate-700 ${
                            user.role === 'Administrador' ? 'border-amber-555 bg-amber-50 text-amber-800' : ''
                          }`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-slate-500 font-mono text-[11px]">
                          {user.password || '123456'}
                        </td>
                        <td className="py-4 px-6 text-slate-500">
                          {user.createdAt}
                        </td>
                        <td className="py-4 px-6">
                          <button
                            onClick={() => handleToggleUserStatus(user.id)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider uppercase transition-all duration-150 border cursor-pointer active:scale-95 ${
                              user.status === 'Activo'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                            }`}
                          >
                            {user.status === 'Activo' ? (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                <span>Activo</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3 h-3 text-rose-500" />
                                <span>Inactivo</span>
                              </>
                            )}
                          </button>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <button
                            disabled={isSelf}
                            onClick={() => handleDeleteUser(user.id, user.name)}
                            title={isSelf ? "No puedes eliminarte a ti mismo" : "Desafiliar cuenta"}
                            className={`p-1.5 rounded-lg border text-rose-500 shadow-sm transition-all focus:outline-none ${
                              isSelf 
                                ? 'opacity-30 border-slate-200 bg-slate-150 cursor-not-allowed text-slate-450' 
                                : 'bg-rose-50 hover:bg-rose-100 border-rose-150 hover:border-rose-250 cursor-pointer active:scale-90'
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col">
          {/* Client Filter Bar */}
          <div className="p-5 border-b border-slate-150 flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-50/50">
            <div className="space-y-1 self-start md:self-auto">
              <h4 className="text-sm font-black text-slate-900">Catálogo de Clientes Administrados</h4>
              <p className="text-[11px] text-slate-500">Controla las razones sociales y RFCs de los clientes bajo tu auditoría periódica de XMLs.</p>
            </div>
            <div className="relative w-full md:w-80">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <input
                type="text"
                placeholder="Buscar por RFC, denominación o correo..."
                value={clientQuery}
                onChange={(e) => setClientQuery(e.target.value)}
                className="block w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:border-amber-500 focus:outline-none transition-all placeholder-slate-400 text-slate-800 shadow-inner"
              />
            </div>
          </div>

          {/* Client Catalog Grid */}
          <div className="overflow-x-auto">
            {filteredClients.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="mx-auto w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center border border-slate-200">
                  <Building2 className="w-5 h-5 text-slate-400" />
                </div>
                <h5 className="text-xs font-bold text-slate-700">No hay clientes fiscales registrados</h5>
                <p className="text-[10px] text-slate-400 max-w-sm mx-auto">Registre las razones sociales del SAT y sus credenciales (FIEL / CIEC) para la conciliación e importación.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse min-w-[750px]">
                <thead>
                  <tr className="border-b border-slate-150 bg-slate-50 text-[10px] uppercase font-mono tracking-wider text-slate-500">
                    <th className="py-3 px-6">Razón Social Contribuyente</th>
                    <th className="py-3 px-6">RFC del SAT</th>
                    <th className="py-3 px-6">Régimen Fiscal</th>
                    <th className="py-3 px-6">Contacto Directo</th>
                    <th className="py-3 px-6">Credenciales SAT</th>
                    <th className="py-3 px-6 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredClients.map((client) => {
                    const hasFiel = client.authType === 'FIEL' || (!client.authType && (client.fielPassword || client.cerBase64));
                    const hasCiec = client.authType === 'CIEC' || client.ciecPassword;
                    return (
                      <tr key={client.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-4 px-6 font-black text-slate-900 text-slate-850">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/15 flex items-center justify-center text-amber-700 font-bold font-mono text-[10px] shadow-sm">
                              <Building2 className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="font-extrabold text-slate-850">{client.name}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6 font-mono tracking-wider text-[11px] font-black text-amber-700">
                          <span className="bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg inline-block">
                            {client.rfc}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-slate-700 font-medium">
                          <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[10px]">
                            {REGIMEN_LABELS[client.regimen] || client.regimen}
                          </span>
                        </td>
                        <td className="py-4 px-6 space-y-0.5">
                          <div className="flex items-center gap-1.5 text-slate-650">
                            <Mail className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <span className="font-mono text-[11px]">{client.email}</span>
                          </div>
                          {client.phone && (
                            <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                              <Phone className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                              <span>{client.phone}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          {hasFiel ? (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                              <span>FIEL Guardada</span>
                              {client.cerFileName && <span className="text-[9px] text-emerald-600">(.cer/.key)</span>}
                            </div>
                          ) : hasCiec ? (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-[11px] font-bold">
                              <Key className="w-3.5 h-3.5 text-blue-600" />
                              <span>CIEC Guardada</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[10px]">Sin credenciales</span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-right space-x-1.5">
                          <button
                            onClick={() => openEditClientModal(client)}
                            className="p-1.5 rounded-lg border border-indigo-200 hover:border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 shadow-sm transition-all focus:outline-none cursor-pointer active:scale-90 inline-flex items-center gap-1 text-[11px] font-bold px-2.5"
                            title="Editar Perfil y Credenciales SAT"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Editar
                          </button>
                          <button
                            onClick={() => handleDeleteClient(client.id, client.name)}
                            className="p-1.5 rounded-lg border border-rose-150 hover:border-rose-250 bg-rose-50 hover:bg-rose-100 text-rose-500 shadow-sm transition-all focus:outline-none cursor-pointer active:scale-90 inline-flex items-center"
                            title="Eliminar del Catálogo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* --- ADD USER MODAL --- */}
      <AnimatePresence>
        {showAddUserModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="bg-slate-900 text-white p-5 flex justify-between items-center border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-wheat" />
                  <div>
                    <h3 className="text-sm font-black text-white">Nueva Cuenta de Acceso</h3>
                    <p className="text-[10px] text-wheat/70 font-mono">ANCOFI AUTH SYSTEM</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAddUserModal(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddUser} className="p-6 space-y-4">
                {userFormError && (
                  <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-2 text-xs font-semibold text-rose-650">
                    <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                    <span>{userFormError}</span>
                  </div>
                )}

                {userSuccessMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-150 rounded-xl flex items-center gap-2 text-xs font-semibold text-emerald-750">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span>{userSuccessMsg}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold block">Nombre Completo del Auditor</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Lic. Alejandro Flores"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="block w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none transition-all placeholder-slate-400 text-slate-800 shadow-inner"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold block">Correo de Acceso (Usuario)</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-2.5 h-3.5 w-3.5 text-slate-450" />
                    <input
                      type="email"
                      required
                      placeholder="alejandro@ancofi.com"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      className="block w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none transition-all placeholder-slate-400 text-slate-800 shadow-inner"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold block">Contraseña Inicial</label>
                    <div className="relative">
                      <Key className="absolute left-3.5 top-2.5 h-3.5 w-3.5 text-slate-450" />
                      <input
                        type="text"
                        required
                        placeholder="Contraseña"
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        className="block w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none transition-all placeholder-slate-400 text-slate-800 shadow-inner font-mono font-bold"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold block">Rol del Sistema</label>
                    <select
                      value={newUserRole}
                      onChange={(e: any) => setNewUserRole(e.target.value)}
                      className="block w-full px-2 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none transition-all text-slate-800 shadow-inner"
                    >
                      <option value="Administrador">Administrador</option>
                      <option value="Contador Senior">Contador Senior</option>
                      <option value="Auditor">Auditor Contable</option>
                      <option value="Consultor">Consultor Externo</option>
                    </select>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddUserModal(false)}
                    className="w-1/2 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-650 rounded-xl transition-all cursor-pointer"
                  >
                    Regresar
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 py-2 text-xs font-black bg-gradient-to-r from-amber-600 to-amber-500 text-white hover:opacity-90 rounded-xl transition-all shadow cursor-pointer active:scale-95"
                  >
                    Crear Auditor
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- ADD CLIENT MODAL --- */}
      <AnimatePresence>
        {showAddClientModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="bg-slate-900 text-white p-5 flex justify-between items-center border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-wheat" />
                  <div>
                    <h3 className="text-sm font-black text-white">Nuevo Cliente SAT Administrado</h3>
                    <p className="text-[10px] text-wheat/70 font-mono">DENOMINACIÓN / RFC REGISTRY</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAddClientModal(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveClient} className="p-6 space-y-4">
                {clientFormError && (
                  <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-2 text-xs font-semibold text-rose-650">
                    <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                    <span>{clientFormError}</span>
                  </div>
                )}

                {clientSuccessMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-150 rounded-xl flex items-center gap-2 text-xs font-semibold text-emerald-750">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span>{clientSuccessMsg}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold block">Denominación o Razón Social</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Servicios Fiscales del Centro S.A."
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    className="block w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none transition-all placeholder-slate-400 text-slate-800 shadow-inner"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold block">RFC (SAT Oficial)</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. GOMJ850524H89"
                      value={newClientRfc}
                      onChange={(e) => setNewClientRfc(e.target.value)}
                      className="block w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none transition-all placeholder-slate-400 text-slate-800 shadow-inner font-mono font-bold tracking-wider uppercase"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold block">Régimen SAT</label>
                    <select
                      value={newClientRegimen}
                      onChange={(e) => setNewClientRegimen(e.target.value)}
                      className="block w-full px-2 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none transition-all text-slate-800 shadow-inner"
                    >
                      <option value="personas_morales">General de Ley Personas Morales</option>
                      <option value="resico_pm">RESICO Persona Moral</option>
                      <option value="resico_pf">RESICO Persona Física</option>
                      <option value="sueldos_salarios">Sueldos y Salarios / Asimilados</option>
                      <option value="actividades_empresariales">Actividades Empresariales</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold block">Email de Notificaciones Fiscales</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-2.5 h-3.5 w-3.5 text-slate-450" />
                    <input
                      type="email"
                      required
                      placeholder="facturacion@cliente.com"
                      value={newClientEmail}
                      onChange={(e) => setNewClientEmail(e.target.value)}
                      className="block w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none transition-all placeholder-slate-400 text-slate-800 shadow-inner font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-mono uppercase tracking-wider text-slate-500 font-bold block">Teléfono (Celular / Oficina)</label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-2.5 h-3.5 w-3.5 text-slate-450" />
                    <input
                      type="tel"
                      placeholder="e.g. 55 4433 2211"
                      value={newClientPhone}
                      onChange={(e) => setNewClientPhone(e.target.value)}
                      className="block w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-500 focus:bg-white focus:outline-none transition-all placeholder-slate-400 text-slate-800 shadow-inner"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddClientModal(false)}
                    className="w-1/2 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-650 rounded-xl transition-all cursor-pointer"
                  >
                    Regresar
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 py-2 text-xs font-black bg-gradient-to-r from-amber-600 to-amber-500 text-white hover:opacity-90 rounded-xl transition-all shadow cursor-pointer active:scale-95"
                  >
                    Guardar Cliente
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
