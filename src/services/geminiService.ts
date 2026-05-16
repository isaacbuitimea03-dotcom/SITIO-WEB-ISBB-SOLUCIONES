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
  console.log('Gemini Service: Starting extraction from PDF buffer. Size:', buffer.length);
  const ai = getGenAI();
  
  const prompt = `
    Analiza este estado de cuenta bancario y extrae TODOS los movimientos o transacciones en una lista estructurada (JSON).
    Busca en todas las páginas del documento.
    
    Cada transacción debe tener:
    - fecha: La fecha de la operación en formato DD/MM/YYYY.
    - descripcion: Concepto detallado del movimiento.
    - monto: El valor numérico del importe (positivo siempre).
    - tipo: Debe ser 'Cargo' para retiros/pagos/gastos, o 'Abono' para depósitos/pagos recibidos.
    - referencia: Número de referencia o autorización (si existe).

    REGLAS CRÍTICAS:
    1. No omitas ningún movimiento.
    2. Identifica correctamente la columna de Cargos (Retiros) y Abonos (Depósitos).
    3. Si el documento tiene varias secciones (ej. compras, pagos de tarjeta, transferencias), inclúyelas todas.
    4. Responde ÚNICAMENTE con el JSON solicitado.
  `;

  try {
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
              tipo: { type: Type.STRING, description: "Debe ser 'Cargo' o 'Abono'" },
              referencia: { type: Type.STRING },
            },
            required: ['fecha', 'descripcion', 'monto', 'tipo'],
          },
        },
      },
    });

    const text = response.text;
    if (!text) {
      console.warn('Gemini Service: Empty response text');
      throw new Error("Gemini no devolvió ninguna respuesta válida.");
    }

    console.log('Gemini Service: Successfully received text response');
    const data = JSON.parse(text);
    console.log('Gemini Service: Successfully parsed JSON. Items:', data.length);
    return data;
  } catch (error: any) {
    console.error("Gemini PDF Service Error:", error);
    const errorMessage = error.message || "Error desconocido en el servicio de IA";
    throw new Error(`Error en el análisis de IA: ${errorMessage}`);
  }
}
