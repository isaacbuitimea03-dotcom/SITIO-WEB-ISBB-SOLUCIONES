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

// 1. Asesor Fiscal AI Consultations
router.post('/analyze-tax-ai', async (req: Request, res: Response) => {
  try {
    const { prompt, chatHistory } = req.body;
    
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ 
        error: 'Servicio de Inteligencia Artificial de ISBB SOLUCIONES no configurado. Configure la clave API.' 
      });
    }

    const systemInstruction = `Eres un Asesor Fiscal y Contador Público Certificado (CPA) de nivel Senior de ISBB SOLUCIONES, experto en la legislación contable de México (SAT, Ley del Impuesto Sobre la Renta [LISR], Ley del Impuesto al Valor Agregado [LIVA], Código Fiscal de la Federación, vigencia CFDI 4.0, regímenes RESICO, Personas Físicas con Actividad Empresarial, y Personas Morales). 
    
    Tu misión es responder de manera sumamente clara, rigurosa, precisa y profesional. Proporciona siempre cálculos contables estructurados y explicados punto por punto (ej. Ingresos, Deducciones, Base de Pago, Tasas del Impuesto, Impuesto a Pagar y Retenciones). Brinda consejos prácticos sobre cumplimiento con el SAT y estrategias legales de optimización contable (deducciones permitidas, validación de facturas, conciliación bancaria vs XML).
    
    Usa un tono formal, alentador, confiable y muy profesional, apoyado en formato markdown pulcro (tablas, listas, negritas) para dar una asesoría ejecutiva.`;

    // Map chatHistory to Gemini Content format
    const contents: any[] = [];
    if (chatHistory && Array.isArray(chatHistory)) {
      chatHistory.forEach((msg: any) => {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content || '' }]
        });
      });
    }
    
    contents.push({
      role: 'user',
      parts: [{ text: prompt || '' }]
    });

    const response = await generateContentWithRetry({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        systemInstruction,
        temperature: 0.3,
      }
    });

    res.json({ response: response.text });
  } catch (error: any) {
    console.error('Error conducting Tax AI consultation:', error);
    res.status(500).json({ error: error.message || 'Error interno al procesar su consulta fiscal con IA.' });
  }
});

// 2. Audit XML file lists using AI
router.post('/analyze-xml-ai', async (req: Request, res: Response) => {
  try {
    const { xmlMetadataList, fileDetails, xmlSummary, query, regimen } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ 
        error: 'Servicio de Inteligencia Artificial no configurado. Configure la clave API.' 
      });
    }

    let itemsToAnalyze: any[] = [];
    if (Array.isArray(xmlMetadataList) && xmlMetadataList.length > 0) {
      itemsToAnalyze = xmlMetadataList;
    } else if (Array.isArray(fileDetails) && fileDetails.length > 0) {
      itemsToAnalyze = fileDetails;
    } else if (xmlSummary && typeof xmlSummary === 'object') {
      itemsToAnalyze = [xmlSummary];
    }

    if (itemsToAnalyze.length === 0) {
      return res.status(400).json({ error: 'No se proporcionaron datos de CFDIs para auditar.' });
    }

    const systemInstruction = `Eres un Auditor Fiscal Experto de ISBB SOLUCIONES. Tu objetivo es realizar auditorías detalladas e identificar anomalías, riesgos de discrepancia fiscal, impuestos trasladados y retenidos incorrectamente, y optimización de deducciones basándote exclusivamente en los datos de CFDIs (facturas XML del SAT) que el usuario te proporciona.
    ${regimen ? `Régimen Fiscal del contribuyente: ${regimen}` : ''}
    
    Realiza un análisis minucioso y profesional. Genera siempre secciones bien estructuradas en markdown:
    1. **Resumen Ejecutivo**: Principales métricas observadas (Ingresos vs Egresos de forma agregada).
    2. **Hallazgos de Auditoría & Riesgos**: Desglosa alertas contables específicas detectadas (por ejemplo: tasas incorrectas de IVA, CFDIs de pago sin complemento, facturas duplicadas, discrepancias en RFCs).
    3. **Análisis de Impuestos**: Desglose de IVA (16%, 0%, exento), ISR retenido, etc.
    4. **Recomendaciones Contables**: Medidas preventivas inmediatas que la empresa o persona debe tomar de cara a una posible revisión del SAT.`;

    const formattedData = itemsToAnalyze.map((cfdi: any) => ({
      folio: cfdi.folio || cfdi.folioSat || 'S/N',
      fecha: cfdi.fecha || cfdi.fechaEmision || 'Sin fecha',
      emisorRfc: cfdi.emisorRfc || cfdi.rfcEmisor,
      emisorNombre: cfdi.emisorNombre || cfdi.nombreEmisor,
      receptorRfc: cfdi.receptorRfc || cfdi.rfcReceptor,
      receptorNombre: cfdi.receptorNombre || cfdi.nombreReceptor,
      tipo: cfdi.tipo || cfdi.tipoComprobante,
      subTotal: cfdi.subTotal,
      descuento: cfdi.descuento,
      total: cfdi.total,
      ivaTrasladado: cfdi.ivaTrasladado || cfdi.iva,
      ivaRetenido: cfdi.ivaRetenido,
      isrRetenido: cfdi.isrRetenido,
      conceptos: Array.isArray(cfdi.conceptos) ? cfdi.conceptos.join(', ') : (cfdi.conceptos || ''),
      usoCfdi: cfdi.usoCfdiDesc || cfdi.usoCfdi,
      formaPago: cfdi.formaPagoDesc || cfdi.formaPago
    }));

    const prompt = `Por favor audita y analiza los siguientes datos de facturas SAT (CFDIs) y responde a la consulta del usuario.
    
    ---
    CONSULTA DE USUARIO: ${query || 'Auditoría fiscal general de todos los comprobantes cargados.'}
    ---
    
    DATOS EXTRAÍDOS DE FACTURAS XML (${formattedData.length} CFDIs):
    ${JSON.stringify(formattedData, null, 2)}`;

    const response = await generateContentWithRetry({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction,
        temperature: 0.2,
      }
    });

    res.json({ response: response.text });
  } catch (error: any) {
    console.error('Error conducting XML AI audit:', error);
    res.status(500).json({ error: error.message || 'Error interno de procesamiento de auditoría XML con IA' });
  }
});

export default router;
