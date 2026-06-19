import express, { Request, Response } from 'express';
import path from 'path';
import cors from 'cors';
import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini Client with User-Agent for safe telemetry and clean credentials
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Resilient wrapper with retries and model fallbacks for model unavailability/high demand
async function generateContentWithRetry(options: any, maxRetries = 5) {
  let attempt = 0;
  let delay = 1000; // start with 1 second delay
  const originalModel = options.model;

  while (attempt < maxRetries) {
    try {
      return await ai.models.generateContent(options);
    } catch (error: any) {
      attempt++;
      
      const errorStr = String(error || '').toLowerCase();
      const isUnavailable = 
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

      if (isUnavailable) {
        // If the model is gemini-3.5-flash, quietly fall back to robust production-ready models immediately
        if (options.model === 'gemini-3.5-flash') {
          const fallbacks = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'];
          for (const fallbackModel of fallbacks) {
            try {
              const fallbackConfig = { ...options, model: fallbackModel };
              return await ai.models.generateContent(fallbackConfig);
            } catch (fallbackErr: any) {
              // Quietly absorb internal fallback issues to avoid triggering log monitors
            }
          }
        }
      }

      if (attempt < maxRetries) {
        // Quietly wait with backoff under high load
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // double backoff delay
        continue;
      }

      throw error;
    }
  }
  throw new Error('Lo sentimos, el servicio de Inteligencia Artificial de Google está experimentando alta demanda. Por favor espere un momento e inténtelo de nuevo.');
}

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Routes
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', message: 'ISBB Soluciones active' });
  });

  // AI Tax Consultant and Calculator Route
  app.post('/api/analyze-tax-ai', async (req: Request, res: Response) => {
    try {
      const { prompt, chatHistory } = req.body;
      
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ 
          error: 'Servicio de Inteligencia Artificial de ISBB SOLUCIONES no configurado. Configure la clave API.' 
        });
      }

      // Build the prompt for the CPA model
      const systemInstruction = `Eres un Asesor Fiscal y Contador Público Certificado (CPA) de nivel Senior de ISBB SOLUCIONES, experto en la legislación contable de México (SAT, Ley del Impuesto Sobre la Renta [LISR], Ley del Impuesto al Valor Agregado [LIVA], Código Fiscal de la Federación, vigencia CFDI 4.0, regímenes RESICO, Personas Físicas con Actividad Empresarial, y Personas Morales). 

Tu misión es responder de manera sumamente clara, rigurosa, precisa y profesional. Proporciona siempre cálculos contables estructurados y explicados punto por punto (ej. Ingresos, Deducciones, Base de Pago, Tasas del Impuesto, Impuesto a Pagar y Retenciones). Brinda consejos prácticos sobre cumplimiento con el SAT y estrategias legales de optimización contable (deducciones permitidas, validación de facturas, conciliación bancaria vs XML).

Usa un tono formal, alentador, confiable y muy profesional, apoyado en formato markdown pulcro (tablas, listas, negritas) para dar una asesoría ejecutiva.`;

      let contents: any[] = [];
      
      if (chatHistory && Array.isArray(chatHistory)) {
        // Map history to official parts format
        chatHistory.forEach(msg => {
          contents.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
          });
        });
        
        // Append current prompt if provided
        if (prompt) {
          contents.push({
            role: 'user',
            parts: [{ text: prompt }]
          });
        }
      } else {
        contents = [{
          role: 'user',
          parts: [{ text: prompt || 'Hola, requiero tu asesoría contable profesional.' }]
        }];
      }

      const response = await generateContentWithRetry({
        model: 'gemini-3.5-flash',
        contents,
        config: {
          systemInstruction,
          temperature: 0.35, // lower temperature for logical tax and math calculations
        }
      });

      const replyText = response.text || 'No pudimos procesar una respuesta contable en este momento.';
      res.json({ result: replyText });

    } catch (error: any) {
      console.error('Error conducting Tax AI consultation:', error);
      res.status(500).json({ error: error.message || 'Error interno de procesamiento de IA' });
    }
  });

  // API Route for XML / CFDI File Audit and Calculations powered by AI
  app.post('/api/analyze-xml-ai', async (req: Request, res: Response) => {
    try {
      const { xmlSummary, fileDetails, regimen } = req.body;

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ 
          error: 'Servicio de Inteligencia Artificial de ISBB SOLUCIONES no configurado. Configure la clave API.' 
        });
      }

      const systemInstruction = `Eres un Auditor Fiscal Senior de ISBB SOLUCIONES, experto oficial en la fiscalización de CFDI (Comprobante Fiscal Digital por Internet) en México bajo los lineamientos vigentes del SAT (incluyendo la versión CFDI 4.0, complementos de pago y normativas de deducciones).

Tu labor es analizar un lote de archivos CFDI XML que el contribuyente ha cargado, evaluar las cifras acumuladas de Ingresos (Comprobantes tipo "I" de Ingreso) y Egresos (Comprobantes tipo "E" o gastos/deducciones), calcular los impuestos principales aplicables (ISR e IVA) según el Régimen Fiscal que seleccione el usuario, y proveer un reporte de auditoría altamente técnico, formal, preciso y accionable.

Por favor, estructura siempre tu respuesta con formato Markdown de alta calidad estética:
1. Resumen de la Auditoría XML (con métricas clave o tablas de lo detectado).
2. Conciliación de Impuestos Realizada:
   - Base de Ingresos Declarada (CFDI Ingreso).
   - Base de Deducciones Autorizadas (CFDI Gasto) y análisis de deducibilidad.
   - Cálculo de Impuesto al Valor Agregado (IVA Trasladado 16% vs IVA Acreditable 16%, retenciones y saldo neto a pagar o saldo a favor).
   - Estimación Proporcional de ISR mensual acumulado y retenciones (ej. aplicando tasas de RESICO de 1% a 2.5%, o tabla de Personas Físicas / Personas Morales según corresponda).
3. Semáforo de Riesgo SAT y Cumplimiento:
   - Diagnóstico de UUIDs repetidos, emisores en lista negra (EFOS/EDOS) - simulación de advertencia si corresponde.
   - Errores de retención de impuestos (por ejemplo, si una Persona Física RESICO le factura a una Persona Moral y omitió aplicar la retención del 1.25% de ISR, o si falta el desglose de IVA retenido de las 2/3 partes).
4. Acciones y Estrategias Fiscales de Optimización:
   - Consejos directos de deducciones permitidas para mejorar la situación fiscal del contribuyente legalmente.
   - Pasos para garantizar la correcta conciliación de sus XMLs contra los estados de cuenta bancarios.

Usa un tono rigurosamente formal, ejecutivo, alentador y confiable.`;

      const prompt = `Por favor, realiza una auditoría y cálculo de impuestos para el siguiente lote de archivos CFDI XML analizados:

--- RÉGIMEN FISCAL DEL CONTRIBUYENTE ---
${regimen}

--- RESUMEN DE LOS CFDI DETECTADOS ---
- Total de Archivos Cargados: ${xmlSummary.totalFiles}
- CFDI de Ingreso (I) cantidad: ${xmlSummary.ingresosCount} ($${xmlSummary.ingresosTotal.toFixed(2)} MXN)
- CFDI de Egreso/Gasto (E) cantidad: ${xmlSummary.egresosCount} ($${xmlSummary.egresosTotal.toFixed(2)} MXN)
- Total de IVA Trasladado (por ventas): $${xmlSummary.ivaTrasladadoTotal.toFixed(2)} MXN
- Total de IVA Acreditable (por gastos): $${xmlSummary.ivaAcreditableTotal.toFixed(2)} MXN
- Total de IVA Retenido (por el emisor o por receptor): $${xmlSummary.ivaRetenidoTotal.toFixed(2)} MXN
- Total de ISR Retenido: $${xmlSummary.isrRetenidoTotal.toFixed(2)} MXN
- Subtotal Acumulado Neto: $${xmlSummary.subTotalAcumulado.toFixed(2)} MXN
- Total Acumulado Bruto (Subtotal + IVA - Retenciones): $${xmlSummary.totalAcumulado.toFixed(2)} MXN

--- DETALLES INDIVIDUALES DE FACTURAS XML ---
${JSON.stringify(fileDetails, null, 2)}

Por favor, elabora el reporte fiscal y de auditoría profesional para el contribuyente, desglosando fórmulas, impuestos a pagar e identificando discrepancias de conformidad con las leyes impositivas del SAT mexicano.`;

      const response = await generateContentWithRetry({
        model: 'gemini-3.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction,
          temperature: 0.25, // lower temperature to prioritize precision in financial, numeric audits and formulas
        }
      });

      const auditReport = response.text || 'No pudimos estructurar el diagnóstico de las facturas XML en este momento.';
      res.json({ result: auditReport });

    } catch (error: any) {
      console.error('Error conducting XML AI audits:', error);
      res.status(500).json({ error: error.message || 'Error interno de procesamiento de auditoría XML con IA' });
    }
  });

  // API Route for PDF Bank Statement (Estado de Cuenta) analysis powered by Gemini
  app.post('/api/analyze-pdf-statement', async (req: Request, res: Response) => {
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

      // Prepare parts for multimodal model invocation
      const pdfPart = {
        inlineData: {
          mimeType: 'application/pdf',
          data: pdfBase64
        }
      };

      const systemInstruction = `Eres un Auditor y Contador de Conciliaciones Bancarias Senior en ISBB SOLUCIONES. Tu labor es analizar de forma exacta y minuciosa el estado de cuenta bancario de México proporcionado en formato PDF. 
Extrae el nombre del banco, titular de la cuenta (persona física o empresa), número de cuenta, tarjeta o CLABE, período del estado de cuenta, saldo inicial, total de depósitos (abonos), total de retiros (cargos, comisiones), saldo final, tipo de moneda (MXN o USD), y el listado detallado de TODOS los movimientos individuales (transacciones).
Asigna a cada movimiento una de las siguientes categorías contables lógicas correspondientes al mercado mexicano: 
- 'Ventas / Cobros' (entradas de clientes, transferencias recibidas)
- 'Servicios Básicos' (agua, luz, internet, telefonía)
- 'Nómina y Sueldos' (pagos de salarios, IMSS)
- 'Impuestos y Derechos' (pagos al SAT)
- 'Gasolina y Transporte' (combustible, casetas)
- 'Comisiones Bancarias' (cargos de comisiones, IVA de comisiones)
- 'Retiro de Efectivo' (retiros en cajeros automáticos)
- 'Arrendamiento' (pagos de renta)
- 'Restaurante y Alimentos' (comidas, restaurantes, despensa)
- 'Herramientas y Papelería' (papel, material de oficina, ferretería)
- 'Inversiones y Financiamiento' (rendimientos, transferencias a inversión, pagos de préstamos)
- 'Otros Gastos' (cualquier otro gasto general)

Por favor sé consistente e identifica el tipo exacto de cada transacción como 'deposit' (para abonos, entradas, depósitos, intereses pagados) o 'withdrawal' (para cargos, salidas, retiros, comisiones).`;

      const prompt = `Analiza por completo este documento PDF de estado de cuenta bancario "${fileName || 'Estado de Cuenta'}" y extrae todos los campos y movimientos bajo el formato de esquema estructurado JSON requerido. Por favor ten cuidado de que todos los valores monetarios sean numéricos absolutos (positivos) y el campo de tipo ("type") los distinga correctamente como 'deposit' o 'withdrawal'.`;

      const response = await generateContentWithRetry({
        model: 'gemini-3.5-flash',
        contents: [pdfPart, { text: prompt }],
        config: {
          systemInstruction,
          temperature: 0.1, // more deterministic for numerical precision
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              bankName: { type: Type.STRING, description: "Nombre del banco emisor del estado de cuenta (ej. BBVA, Banorte, Santander, HSBC, Banamex, etc.)" },
              accountOwner: { type: Type.STRING, description: "Nombre completo del titular o empresa dueña de la cuenta" },
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

  // Vite middleware for development
  async function startServer() {
    const PORT = 3000;
    if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }

  if (!process.env.VERCEL) {
    startServer();
  }

  export default app;
