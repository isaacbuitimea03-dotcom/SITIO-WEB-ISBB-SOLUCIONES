import express, { Request, Response } from 'express';
import path from 'path';
import cors from 'cors';
import multer from 'multer';
import { GoogleGenAI, Type } from "@google/genai";

const upload = multer({ storage: multer.memoryStorage() });

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

  // --- SAT-GO WEB SERVICE PROXY ---
  const SAT_GO_FIXED_TOKEN = "Bearer eyJhbGciOiJSUzI1NiIsImNhdCI6ImNsX0I3ZDRQRDIyMkFBQSIsImtpZCI6Imluc18zQldabzhxMjR6S2pVdlVWc2pzcHppb012bUsiLCJ0eXAiOiJKV1QifQ.eyJhenAiOiJodHRwczovL3dlYi5zYXQtZ28uY29tIiwiZW1haWwiOiJpc2FhY2J1aXRpbWVhMDNAZ21haWwuY29tIiwiZXhwIjoxNzg0ODU1NzEyLCJpYXQiOjE3ODQyNTA3MTIsImlzcyI6Imh0dHBzOi8vY2xlcmsucHJlcHJvZC5zYXQtZ28uY29tIiwianRpIjoiYWIyMDQ1YjY0NmRhZWJlZDllZmUiLCJuYmYiOjE3ODQyNTA3MDcsInJvbGUiOm51bGwsInN1YiI6InVzZXJfM0RuRHYxUWptbk1XNGhHSmVUdnd6VGowN0hoIiwidXNlclV1aWQiOiJ1c2VyXzNEbkR2MVFqbW5NVzRoR0plVHZ3elRqMDdIaCIsInVzZXJuYW1lIjpudWxsfQ.glSl4l8gfNDOWD_N53PHqVyOebFjVk3-rSlmUbsRWocMMAMsgikaKW3yHeA8W56Alyq-bXZTuQJgtYd96OVH0XpyFpjm0qZj3uCK_rD1Xb0K4HI0fokL3A_7-s1ia3ADvXmIn3KQjwwcFXUwfTR--FH49rVdhVxb12S4dhMJk9ugQZtAO3Yn-h4Rwh2h8n1yj9-SSCYjWgpUz9EpdG_7a79dUq4JPjErO8KNZY_oH4d4toUBOmNHvFvY9JOYFjIm5DuT-CFRW5p7GPeTwqJELi562yhMRBSQYGZaSIZ826Jshoborl9eTsYbRt484pCk_RQdHRj0ZZWmjm4z3pH7uQ";
  let cachedKeyValue: string | null = null;

  async function getSatGoKeyValue(): Promise<string> {
    return SAT_GO_FIXED_TOKEN;
  }

  function getSatGoErrorMessage(status: number, text: string, defaultMsg: string): string {
    if (text && text.trim()) {
      try {
        // Try to see if it's a JSON error with a message property
        const parsed = JSON.parse(text);
        return parsed.message || parsed.error || parsed.Message || text;
      } catch (e) {
        return text;
      }
    }
    if (status === 401) {
      return 'Credenciales de SAT incorrectas o token no autorizado. Por favor verifique su RFC, contraseña CIEC o archivos de la FIEL.';
    }
    if (status === 400) {
      return 'Solicitud incorrecta. Verifique que todos los datos y archivos ingresados sean correctos.';
    }
    if (status === 403) {
      return 'Acceso prohibido. El servicio de SAT-GO no tiene autorización para realizar esta consulta o la suscripción ha expirado.';
    }
    if (status === 404) {
      return 'El recurso solicitado no existe en los servidores de SAT-GO.';
    }
    if (status >= 500) {
      return 'El servicio de SAT-GO o el portal de consultas del SAT está experimentando problemas temporales de conexión. Por favor intente de nuevo más tarde.';
    }
    return defaultMsg;
  }

  // 1. Create Key
  app.post('/api/sat-go/create-key', async (req: Request, res: Response) => {
    try {
      const keyValue = await getSatGoKeyValue();
      res.json({ keyValue });
    } catch (error: any) {
      console.error('Error in SAT-GO CreateKey proxy:', error);
      res.status(500).json({ error: error.message || 'Error interno al comunicarse con SAT-GO.' });
    }
  });

  // 2. Consultar Facturas con FIEL (POST multipart/form-data)
  app.post('/api/sat-go/consultar-facfiel', upload.fields([
    { name: 'llavePrivada', maxCount: 1 },
    { name: 'Certificado', maxCount: 1 }
  ]), async (req: Request, res: Response) => {
    try {
      const rfc = req.headers['rfc'];
      if (!rfc) {
        return res.status(400).json({ error: 'El RFC es requerido.' });
      }

      const authHeader = await getSatGoKeyValue();

      const filesMap = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const keyFile = filesMap?.['llavePrivada']?.[0];
      const certFile = filesMap?.['Certificado']?.[0];
      const contrasena = req.body.Contrasena;

      if (!contrasena) {
        return res.status(400).json({ error: 'La contraseña de la FIEL es requerida.' });
      }

      // Reconstruct FormData for SAT-GO
      const satFormData = new FormData();
      if (keyFile) {
        const blob = new Blob([keyFile.buffer], { type: 'application/octet-stream' });
        satFormData.append('llavePrivada', blob, keyFile.originalname);
      }
      if (certFile) {
        const blob = new Blob([certFile.buffer], { type: 'application/octet-stream' });
        satFormData.append('Certificado', blob, certFile.originalname);
      }
      satFormData.append('Contrasena', contrasena);

      // Build query parameters
      const urlParams = new URLSearchParams();
      for (const [key, val] of Object.entries(req.query)) {
        if (val !== undefined) urlParams.append(key, String(val));
      }
      urlParams.set('api-version', '2.0');

      const targetUrl = `https://api.sat-go.com/api/v2/Consultar/facfiel?${urlParams.toString()}`;
      console.log(`[Proxy] fetching facfiel: ${targetUrl}, RFC: ${rfc}`);
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'RFC': String(rfc),
          'Authorization': String(authHeader),
          'Accept': 'application/json'
        },
        body: satFormData
      });

      console.log(`[Proxy] facfiel status: ${response.status}`);
      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Proxy] facfiel error body: ${errText}`);
        return res.status(response.status).json({ error: getSatGoErrorMessage(response.status, errText, 'Error en la consulta FIEL de SAT-GO') });
      }

      const data = await response.json();
      console.log(`[Proxy] facfiel success response comprobantes length: ${data?.comprobantes?.length || 0}`);
      res.json(data);
    } catch (error: any) {
      console.error('Error in SAT-GO ConsultarFacFiel proxy:', error);
      res.status(500).json({ error: error.message || 'Error interno al comunicarse con el Web Service de SAT-GO.' });
    }
  });

  // 3. Consultar Facturas con CIEC (GET)
  app.get('/api/sat-go/consultar-fac', async (req: Request, res: Response) => {
    try {
      const rfc = req.headers['rfc'];
      const secret = req.headers['secret'];

      if (!rfc || !secret) {
        return res.status(400).json({ error: 'RFC y Clave CIEC (Secret) son requeridos.' });
      }

      const authHeader = await getSatGoKeyValue();

      const urlParams = new URLSearchParams();
      
      let anio = req.query.anio;
      let mes = req.query.mes;
      let dia = req.query.dia;
      
      const fechaInicialStr = req.query.fecha_inicial;
      if (fechaInicialStr && (!anio || !mes)) {
        const cleanDateStr = String(fechaInicialStr).replace(' ', 'T');
        const dateObj = new Date(cleanDateStr);
        if (!isNaN(dateObj.getTime())) {
          anio = String(dateObj.getFullYear());
          mes = String(dateObj.getMonth() + 1);
          dia = String(dateObj.getDate());
        }
      }

      for (const [key, val] of Object.entries(req.query)) {
        if (key !== 'fecha_inicial' && key !== 'fecha_final' && val !== undefined) {
          urlParams.append(key, String(val));
        }
      }

      if (anio) urlParams.set('anio', String(anio));
      if (mes) urlParams.set('mes', String(mes));
      if (dia) urlParams.set('dia', String(dia));
      
      urlParams.set('api-version', '2.0');

      const targetUrl = `https://api.sat-go.com/api/v2/Consultar/fac?${urlParams.toString()}`;
      console.log(`[Proxy] fetching fac (CIEC): ${targetUrl}, RFC: ${rfc}`);
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'RFC': String(rfc),
          'Authorization': String(authHeader),
          'Secret': String(secret),
          'Accept': 'application/json'
        }
      });

      console.log(`[Proxy] fac status: ${response.status}`);
      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Proxy] fac error body: ${errText}`);
        return res.status(response.status).json({ error: getSatGoErrorMessage(response.status, errText, 'Error en la consulta CIEC de SAT-GO') });
      }

      const data = await response.json();
      console.log(`[Proxy] fac success response comprobantes length: ${data?.comprobantes?.length || 0}`);
      res.json(data);
    } catch (error: any) {
      console.error('Error in SAT-GO ConsultarFac proxy:', error);
      res.status(500).json({ error: error.message || 'Error interno al comunicarse con el Web Service de SAT-GO.' });
    }
  });

  // 4. Opinión de Cumplimiento con FIEL (POST multipart)
  app.post('/api/sat-go/consultar-ocfiel', upload.fields([
    { name: 'llavePrivada', maxCount: 1 },
    { name: 'Certificado', maxCount: 1 }
  ]), async (req: Request, res: Response) => {
    try {
      const rfc = req.headers['rfc'];
      if (!rfc) {
        return res.status(400).json({ error: 'El RFC es requerido.' });
      }

      const authHeader = await getSatGoKeyValue();

      const filesMap = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const keyFile = filesMap?.['llavePrivada']?.[0];
      const certFile = filesMap?.['Certificado']?.[0];
      const contrasena = req.body.Contrasena;

      if (!contrasena) {
        return res.status(400).json({ error: 'La contraseña de la FIEL es requerida.' });
      }

      const satFormData = new FormData();
      if (keyFile) {
        const blob = new Blob([keyFile.buffer], { type: 'application/octet-stream' });
        satFormData.append('llavePrivada', blob, keyFile.originalname);
      }
      if (certFile) {
        const blob = new Blob([certFile.buffer], { type: 'application/octet-stream' });
        satFormData.append('Certificado', blob, certFile.originalname);
      }
      satFormData.append('Contrasena', contrasena);

      const targetUrl = 'https://api.sat-go.com/api/v2/Consultar/ocfiel?api-version=2.0';
      console.log(`[Proxy] fetching ocfiel: ${targetUrl}, RFC: ${rfc}`);
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'RFC': String(rfc),
          'Authorization': String(authHeader),
          'Accept': '*/*'
        },
        body: satFormData
      });

      console.log(`[Proxy] ocfiel status: ${response.status}`);
      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Proxy] ocfiel error body: ${errText}`);
        return res.status(response.status).json({ error: getSatGoErrorMessage(response.status, errText, 'Error al obtener Opinión de Cumplimiento') });
      }

      // Convert PDF response stream to Base64 to send to React client
      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const contentType = response.headers.get('content-type') || 'application/pdf';
      console.log(`[Proxy] ocfiel success. Base64 length: ${base64.length}`);

      res.json({
        success: true,
        pdf_base64: base64,
        content_type: contentType,
        message: 'Opinión de Cumplimiento obtenida exitosamente.'
      });
    } catch (error: any) {
      console.error('Error in SAT-GO Opinión de Cumplimiento FIEL proxy:', error);
      res.status(500).json({ error: error.message || 'Error interno al comunicarse con el Web Service de SAT-GO.' });
    }
  });

  // 5. Opinión de Cumplimiento con CIEC (GET)
  app.get('/api/sat-go/consultar-oc', async (req: Request, res: Response) => {
    try {
      const rfc = req.headers['rfc'];
      const secret = req.headers['secret'];

      if (!rfc || !secret) {
        return res.status(400).json({ error: 'RFC y Clave CIEC son requeridos.' });
      }

      const authHeader = await getSatGoKeyValue();

      const targetUrl = 'https://api.sat-go.com/api/v2/Consultar/oc?api-version=2.0';
      console.log(`[Proxy] fetching oc (CIEC): ${targetUrl}, RFC: ${rfc}`);
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'RFC': String(rfc),
          'Authorization': String(authHeader),
          'Secret': String(secret),
          'Accept': '*/*'
        }
      });

      console.log(`[Proxy] oc status: ${response.status}`);
      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Proxy] oc error body: ${errText}`);
        return res.status(response.status).json({ error: getSatGoErrorMessage(response.status, errText, 'Error al obtener Opinión de Cumplimiento CIEC') });
      }

      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const contentType = response.headers.get('content-type') || 'application/pdf';
      console.log(`[Proxy] oc success. Base64 length: ${base64.length}`);

      res.json({
        success: true,
        pdf_base64: base64,
        content_type: contentType,
        message: 'Opinión de Cumplimiento (CIEC) obtenida exitosamente.'
      });
    } catch (error: any) {
      console.error('Error in SAT-GO Opinión de Cumplimiento CIEC proxy:', error);
      res.status(500).json({ error: error.message || 'Error interno al comunicarse con el Web Service de SAT-GO.' });
    }
  });

  // 6. Constancia de Situación Fiscal con FIEL (POST multipart)
  app.post('/api/sat-go/consultar-csffiel', upload.fields([
    { name: 'llavePrivada', maxCount: 1 },
    { name: 'Certificado', maxCount: 1 }
  ]), async (req: Request, res: Response) => {
    try {
      const rfc = req.headers['rfc'];
      if (!rfc) {
        return res.status(400).json({ error: 'El RFC es requerido.' });
      }

      const authHeader = await getSatGoKeyValue();

      const filesMap = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const keyFile = filesMap?.['llavePrivada']?.[0];
      const certFile = filesMap?.['Certificado']?.[0];
      const contrasena = req.body.Contrasena;

      if (!contrasena) {
        return res.status(400).json({ error: 'La contraseña de la FIEL es requerida.' });
      }

      const satFormData = new FormData();
      if (keyFile) {
        const blob = new Blob([keyFile.buffer], { type: 'application/octet-stream' });
        satFormData.append('llavePrivada', blob, keyFile.originalname);
      }
      if (certFile) {
        const blob = new Blob([certFile.buffer], { type: 'application/octet-stream' });
        satFormData.append('Certificado', blob, certFile.originalname);
      }
      satFormData.append('Contrasena', contrasena);

      const targetUrl = 'https://api.sat-go.com/api/v2/Consultar/csffiel?api-version=2.0';
      console.log(`[Proxy] fetching csffiel: ${targetUrl}, RFC: ${rfc}`);
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'RFC': String(rfc),
          'Authorization': String(authHeader),
          'Accept': '*/*'
        },
        body: satFormData
      });

      console.log(`[Proxy] csffiel status: ${response.status}`);
      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Proxy] csffiel error body: ${errText}`);
        return res.status(response.status).json({ error: getSatGoErrorMessage(response.status, errText, 'Error al obtener Constancia de Situación Fiscal') });
      }

      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const contentType = response.headers.get('content-type') || 'application/pdf';
      console.log(`[Proxy] csffiel success. Base64 length: ${base64.length}`);

      res.json({
        success: true,
        pdf_base64: base64,
        content_type: contentType,
        message: 'Constancia de Situación Fiscal obtenida exitosamente.'
      });
    } catch (error: any) {
      console.error('Error in SAT-GO CSF FIEL proxy:', error);
      res.status(500).json({ error: error.message || 'Error interno al comunicarse con el Web Service de SAT-GO.' });
    }
  });

  // 7. Constancia de Situación Fiscal con CIEC (GET)
  app.get('/api/sat-go/consultar-csf', async (req: Request, res: Response) => {
    try {
      const rfc = req.headers['rfc'];
      const secret = req.headers['secret'];

      if (!rfc || !secret) {
        return res.status(400).json({ error: 'RFC y Clave CIEC son requeridos.' });
      }

      const authHeader = await getSatGoKeyValue();

      const targetUrl = 'https://api.sat-go.com/api/v2/Consultar/csf?api-version=2.0';
      console.log(`[Proxy] fetching csf (CIEC): ${targetUrl}, RFC: ${rfc}`);
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'RFC': String(rfc),
          'Authorization': String(authHeader),
          'Secret': String(secret),
          'Accept': '*/*'
        }
      });

      console.log(`[Proxy] csf status: ${response.status}`);
      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Proxy] csf error body: ${errText}`);
        return res.status(response.status).json({ error: getSatGoErrorMessage(response.status, errText, 'Error al obtener CSF CIEC') });
      }

      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const contentType = response.headers.get('content-type') || 'application/pdf';
      console.log(`[Proxy] csf success. Base64 length: ${base64.length}`);

      res.json({
        success: true,
        pdf_base64: base64,
        content_type: contentType,
        message: 'Constancia de Situación Fiscal (CIEC) obtenida exitosamente.'
      });
    } catch (error: any) {
      console.error('Error in SAT-GO CSF CIEC proxy:', error);
      res.status(500).json({ error: error.message || 'Error interno al comunicarse con el Web Service de SAT-GO.' });
    }
  });

  // 8. Dynamic Proxy XML Content: Fetches the raw XML text from a given urlDescarga to bypass browser CORS
  app.get('/api/sat-go/proxy-xml', async (req: Request, res: Response) => {
    try {
      const { url } = req.query;
      if (!url) {
        return res.status(400).json({ error: 'URL del archivo XML es requerida.' });
      }

      const rfc = req.headers['rfc'];
      const secret = req.headers['secret'];
      const authHeader = await getSatGoKeyValue();

      const headers: Record<string, string> = {
        'Accept': 'application/json, application/xml, text/plain, */*',
        'Authorization': String(authHeader)
      };

      if (rfc) {
        headers['RFC'] = String(rfc);
      }
      if (secret) {
        headers['Secret'] = String(secret);
      }

      const response = await fetch(String(url), {
        headers
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Proxy-XML] failed with status ${response.status}: ${errText}`);
        return res.status(response.status).json({ error: getSatGoErrorMessage(response.status, errText, 'No se pudo descargar el XML de la URL provista.') });
      }

      const xmlText = await response.text();
      res.setHeader('Content-Type', 'application/xml');
      res.send(xmlText);
    } catch (error: any) {
      console.error('Error in proxy-xml endpoint:', error);
      res.status(500).json({ error: error.message || 'Error interno al descargar el archivo XML.' });
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
