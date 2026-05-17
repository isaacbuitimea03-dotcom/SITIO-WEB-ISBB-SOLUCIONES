import { GoogleGenAI, Type } from "@google/genai";

let genAI: GoogleGenAI | null = null;

function getGenAI() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("La clave de API de Gemini (GEMINI_API_KEY) no está configurada.");
    }
    genAI = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return genAI;
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
  const ai = getGenAI();
  
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
    4. Responde EXCLUSIVAMENTE con el arreglo JSON solicitado.
  `;

  try {
    console.log('[GeminiService] Llamando a Gemini API (gemini-3-flash-preview)...');
    
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
    console.log('[GeminiService] Crudo:', text?.substring(0, 100));
    
    if (!text) {
      throw new Error("La IA no generó texto en la respuesta.");
    }

    const data = JSON.parse(text);
    console.log('[GeminiService] Parseado con éxito:', Array.isArray(data) ? data.length : 'no es array');
    return data;
  } catch (error: any) {
    console.error("[GeminiService] Detalle del Error:", error);
    throw new Error(`Falla en IA: ${error.message}`);
  }
}
