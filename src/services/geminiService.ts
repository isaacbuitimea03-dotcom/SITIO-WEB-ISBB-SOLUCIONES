import { GoogleGenAI, Type } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

function getAI() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("La clave de API de Gemini (GEMINI_API_KEY) no está configurada.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

export interface BankTransaction {
  fecha: string;
  descripcion: string;
  monto: number;
  tipo: 'Cargo' | 'Abono';
  referencia?: string;
}

export async function extractTransactionsFromPDF(buffer: Buffer): Promise<BankTransaction[]> {
  console.log('[GeminiService] Analizando PDF buffer. Tamaño:', buffer.length, 'bytes');
  const ai = getAI();
  
  const prompt = `
    Analiza este estado de cuenta bancario y extrae TODOS los movimientos o transacciones en una lista estructurada (JSON).
    Busca en todas las páginas del documento.
    
    Cada transacción debe tener:
    - fecha: La fecha de la operación (DD/MM/YYYY).
    - descripcion: Concepto detallado del movimiento.
    - monto: El valor numérico del importe (positivo siempre).
    - tipo: Debe ser 'Cargo' para retiros/pagos/gastos, o 'Abono' para depósitos/pagos recibidos.
    - referencia: Número de referencia o autorización (si existe).

    REGLAS CRÍTICAS:
    1. No omitas ningún movimiento.
    2. Identifica correctamente la columna de Cargos (Retiros) y Abonos (Depósitos).
    3. Si el documento tiene varias secciones (ej. compras, pagos de tarjeta, transferencias), inclúyelas todas.
    4. Responde EXCLUSIVAMENTE con el arreglo JSON solicitado. No incluyas markdown o explicaciones.
  `;

  const maxRetries = 5;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[GeminiService] Llamando a Gemini API (${attempt}/${maxRetries})...`);
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            {
              inlineData: {
                data: buffer.toString('base64'),
                mimeType: 'application/pdf'
              }
            },
            { text: prompt }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                fecha: { type: Type.STRING },
                descripcion: { type: Type.STRING },
                monto: { type: Type.NUMBER },
                tipo: { type: Type.STRING, description: "Cargo o Abono" },
                referencia: { type: Type.STRING },
              },
              required: ['fecha', 'descripcion', 'monto', 'tipo'],
            },
          },
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error("La IA no generó una respuesta válida (texto vacío).");
      }
      
      const data = JSON.parse(text);
      console.log(`[GeminiService] Éxito en intento ${attempt}. Transacciones: ${Array.isArray(data) ? data.length : 'N/A'}`);
      return data;
    } catch (error: any) {
      lastError = error;
      const errorMsg = typeof error === 'string' ? error : (error.message || JSON.stringify(error));
      console.error(`[GeminiService] Error intento ${attempt}:`, errorMsg.substring(0, 200));
      
      // Extended retry check
      const isRetryable = 
        errorMsg.includes('503') || 
        errorMsg.includes('429') || 
        errorMsg.includes('500') ||
        errorMsg.includes('high demand') || 
        errorMsg.includes('Overloaded') ||
        errorMsg.includes('UNAVAILABLE') ||
        errorMsg.includes('rate limit');
      
      if (isRetryable && attempt < maxRetries) {
        // Exponential backoff with jitter: 2s, 4s, 8s, 16s... plus random 0-2s
        const backoff = Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * 2000;
        const delay = backoff + jitter;
        
        console.log(`[GeminiService] Error reintentable detectado. Esperando ${Math.round(delay)}ms antes del siguiente intento...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error(`[GeminiService] Error no reintentable o intentos agotados.`);
        break;
      }
    }
  }

  throw new Error(`Error de Procesamiento (IA): No se pudo analizar el documento tras ${maxRetries} intentos debido a la alta demanda del servicio. Por favor, intenta de nuevo en unos minutos.`);
}
