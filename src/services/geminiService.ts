import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

export interface BankTransaction {
  fecha: string;
  descripcion: string;
  monto: number;
  tipo: 'Cargo' | 'Abono';
  referencia?: string;
}

export async function extractTransactionsFromText(text: string): Promise<BankTransaction[]> {
  const prompt = `
    Analiza el siguiente texto extraído de un estado de cuenta bancario y extrae todos los movimientos o transacciones en una lista estructurada.
    Cada transacción debe tener:
    - fecha: La fecha de la operación (formato YYYY-MM-DD si es posible inferir el año, o DD/MM).
    - descripcion: Concepto o descripción del movimiento.
    - monto: El valor numérico absoluto del importe.
    - tipo: 'Cargo' (si es un retiro/gasto) o 'Abono' (si es un depósito/pago).
    - referencia: Cualquier número de referencia o autorización (opcional).

    Texto del estado de cuenta:
    ${text.substring(0, 30000)} // Limit text size for token limits

    IMPORTANTE: Solo devuelve el JSON siguiendo estrictamente el esquema proporcionado.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
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
              tipo: { type: Type.STRING, enum: ['Cargo', 'Abono'] },
              referencia: { type: Type.STRING },
            },
            required: ['fecha', 'descripcion', 'monto', 'tipo'],
          },
        },
      },
    });

    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error("Gemini Error:", error);
    throw new Error("Error al procesar el estado de cuenta con IA");
  }
}
