export interface AncofiClient {
  id: string;
  rfc: string;
  name: string; // Razón Social / Denominación
  regimen?: string;
  email: string;
  phone?: string; // Número de celular
  curp?: string;
  authType?: 'FIEL' | 'CIEC'; // Método guardado
  fielPassword?: string;
  cerFileName?: string;
  cerBase64?: string;
  keyFileName?: string;
  keyBase64?: string;
  ciecPassword?: string;
  // Official Constancia de Situación Fiscal PDF & Data
  csfPdfFileName?: string;
  csfPdfBase64?: string;
  csfData?: any;
  domicilio?: {
    codigoPostal?: string;
    tipoVialidad?: string;
    nombreVialidad?: string;
    numeroExterior?: string;
    numeroInterior?: string;
    colonia?: string;
    municipio?: string;
    entidadFederativa?: string;
    domicilioCompleto?: string;
  };
  registeredAt: string;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
}

export function base64ToFile(base64: string, filename: string): File {
  try {
    const arr = base64.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const bstr = atob(arr.length > 1 ? arr[1] : arr[0]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  } catch (e) {
    console.error('Error converting base64 to File:', e);
    return new File([], filename, { type: 'application/octet-stream' });
  }
}

export const STORAGE_KEY_CLIENTS = 'ancofi_clients';

export function getSavedClients(): AncofiClient[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CLIENTS);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Error loading saved clients:', e);
  }
  return [
    {
      id: 'client-1',
      rfc: 'ISM980121V98',
      name: 'Industrias San Miguel S.A. de C.V.',
      regimen: 'personas_morales',
      email: 'contacto@sanmiguel.com.mx',
      phone: '55 1234 5678',
      authType: 'FIEL',
      registeredAt: '2026-01-15'
    },
    {
      id: 'client-2',
      rfc: 'GOMJ850524H89',
      name: 'Juan Gómez Martínez',
      regimen: 'resico_pf',
      email: 'juan.gomez@gmail.com',
      phone: '55 8765 4321',
      authType: 'CIEC',
      registeredAt: '2026-02-01'
    }
  ];
}

export function saveClients(clients: AncofiClient[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_CLIENTS, JSON.stringify(clients));
  } catch (e) {
    console.error('Error saving clients:', e);
  }
}
