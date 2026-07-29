import { Router, Request, Response } from 'express';
import { GoogleGenAI, Type } from "@google/genai";

const router = Router();

// Helper to get GoogleGenAI instance on-demand
function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY || '';
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// Helper for generating content with retry and fallback
async function generateContentWithRetry(options: any, maxRetries = 3) {
  let attempt = 0;
  let delay = 1000;
  const ai = getAiClient();
  
  while (attempt < maxRetries) {
    try {
      return await ai.models.generateContent(options);
    } catch (error: any) {
      attempt++;
      const errorStr = String(error || '').toLowerCase();
      const isRateLimitOrUnavailable = 
        error?.status === 503 ||
        error?.status === 'UNAVAILABLE' || 
        error?.code === 503 || 
        error?.status === 'RESOURCE_EXHAUSTED' ||
        error?.code === 429 ||
        errorStr.includes('503') || 
        errorStr.includes('unavailable') ||
        errorStr.includes('demand') ||
        errorStr.includes('overloaded') ||
        errorStr.includes('quota') ||
        errorStr.includes('rate limit');

      if (isRateLimitOrUnavailable && attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }
      throw error;
    }
  }
  throw new Error('El servicio de Inteligencia Artificial de Google está experimentando alta demanda. Por favor intente de nuevo en unos momentos.');
}

// Route for PDF Bank Statement (Estado de Cuenta) analysis powered by Gemini 2.0+ Multimodal PDF features
router.post(['/analyze-pdf-statement', '/bank/analyze-pdf-statement', '/api/bank/analyze-pdf-statement', '/api/analyze-pdf-statement'], async (req: Request, res: Response) => {
  try {
    const { pdfBase64, fileName } = req.body;

    if (!pdfBase64) {
      return res.status(400).json({ error: 'Por favor cargue un archivo PDF de estado de cuenta válido.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ 
        error: 'Servicio de Inteligencia Artificial de ISBB SOLUCIONES no configurado. Configure la clave API.' 
      });
    }

    const systemInstruction = `Eres un Auditor y Contador de Conciliaciones Bancarias Senior en ISBB SOLUCIONES. Tu labor es analizar de forma exacta y minuciosa el estado de cuenta bancario de México proporcionado en formato PDF. 
    
    Debes mapear, extraer y ordenar de forma perfecta todos los campos generales (nombre del banco, titular de la cuenta, número de cuenta, CLABE, saldo inicial, saldo final, abonos totales, cargos totales, moneda) y la tabla completa de movimientos contables históricos sin omitir ninguna transacción. 
    
    Para cada transacción, extrae: la fecha (date), descripción completa (description), referencia o folio de rastreo (reference), monto absoluto numérico (amount), y clasifícala estrictamente en tipo ('deposit' para abonos / depósitos, 'withdrawal' para cargos / retiros / gastos). Asimismo, asigna de forma inteligente una categoría contable lógica para clasificar dicho movimiento.`;

    const prompt = `Analiza por completo este documento PDF de estado de cuenta bancario "${fileName || 'Estado de Cuenta'}" y extrae todos los campos y movimientos bajo el formato de esquema estructurado JSON requerido. Por favor ten cuidado de que todos los valores monetarios sean numéricos absolutos (positivos) y el campo de tipo ("type") los distinga correctamente como 'deposit' o 'withdrawal'.`;

    const response = await generateContentWithRetry({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: pdfBase64
              }
            },
            {
              text: prompt
            }
          ]
        }
      ],
      config: {
        systemInstruction,
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            bankName: { type: Type.STRING, description: "Nombre comercial del banco de México (ej. BBVA, Santander, Banorte, Citibanamex, etc.)" },
            accountOwner: { type: Type.STRING, description: "Nombre completo de la persona física o moral titular de la cuenta bancaria" },
            accountNumber: { type: Type.STRING, description: "Número de cuenta, CLABE, contrato o tarjeta que aparezca en el estado de cuenta" },
            period: { type: Type.STRING, description: "Período o rango de fechas del estado de cuenta (ej. 'Mayo 2026', 'Del 01/05/2026 al 31/05/2026')" },
            startingBalance: { type: Type.NUMBER, description: "Saldo inicial del período" },
            totalDeposits: { type: Type.NUMBER, description: "Total de abonos / depósitos en el período" },
            totalWithdrawals: { type: Type.NUMBER, description: "Total de cargos / cargos por retiro / compras en el período" },
            endingBalance: { type: Type.NUMBER, description: "Saldo final del período" },
            currency: { type: Type.STRING, description: "Moneda de la cuenta (ej. MXN, USD)" },
            transactions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  date: { type: Type.STRING, description: "Fecha del movimiento en formato YYYY-MM-DD o DD/MM/YYYY" },
                  description: { type: Type.STRING, description: "Descripción completa o concepto de la transacción como aparece en el estado de cuenta" },
                  reference: { type: Type.STRING, description: "Referencia, clave de rastreo, SPEI, número de cargo o de autorización. Si no existe, dejar como cadena vacía." },
                  amount: { type: Type.NUMBER, description: "Monto absoluto de la transacción (positivo)" },
                  type: { type: Type.STRING, description: "Tipo de movimiento contable. Debe ser estrictamente 'deposit' o 'withdrawal'" },
                  category: { type: Type.STRING, description: "Clasificación o categoría contable lógica recomendada para este movimiento" }
                },
                required: ["date", "description", "amount", "type", "category"]
              }
            }
          },
          required: ["bankName", "accountOwner", "period", "startingBalance", "totalDeposits", "totalWithdrawals", "endingBalance", "currency", "transactions"]
        }
      }
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error('La IA no pudo procesar o devolver datos estructurados del estado de cuenta bancario.');
    }

    const parsedJSON = JSON.parse(responseText.trim());
    res.json(parsedJSON);

  } catch (error: any) {
    console.error('Error analyzing Bank Statement PDF:', error);
    res.status(500).json({ error: error.message || 'Error interno al decodificar y analizar el archivo PDF con IA.' });
  }
});

export default router;
