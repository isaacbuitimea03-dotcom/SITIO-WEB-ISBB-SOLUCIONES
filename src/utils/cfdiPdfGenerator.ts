import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { ParsedCFDI, parseXMLData } from './xmlParser';

// Helper to convert numbers to Spanish text ("Importe con letra")
export function numeroALetras(amount: number, currency: string = 'MXN'): string {
  if (isNaN(amount) || amount < 0) return 'CERO PESOS 00/100 M.N.';

  const enterotunc = Math.floor(amount);
  const centavosNum = Math.round((amount - enterotunc) * 100);
  const centavosStr = centavosNum < 10 ? `0${centavosNum}` : `${centavosNum}`;

  const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const especiales: Record<number, string> = {
    11: 'ONCE', 12: 'DOCE', 13: 'TRECE', 14: 'CATORCE', 15: 'QUINCE',
    16: 'DIECISEIS', 17: 'DIECISIETE', 18: 'DIECIOCHO', 19: 'DIECINUEVE',
    21: 'VEINTIUNO', 22: 'VEINTIDOS', 23: 'VEINTITRES', 24: 'VEINTICUATRO',
    25: 'VEINTICINCO', 26: 'VEINTISEIS', 27: 'VEINTISIETE', 28: 'VEINTIOCHO', 29: 'VEINTINUEVE'
  };
  const cientos = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHO CIENTOS', 'NOVECIENTOS'];

  function parseChunk(num: number): string {
    if (num === 0) return '';
    if (num === 100) return 'CIEN';
    let res = '';
    const u = num % 10;
    const d = Math.floor((num % 100) / 10);
    const c = Math.floor(num / 100);

    if (c > 0) res += cientos[c] + ' ';

    const duo = d * 10 + u;
    if (especiales[duo]) {
      res += especiales[duo];
    } else {
      if (d > 0) {
        res += decenas[d];
        if (u > 0) res += ' Y ' + unidades[u];
      } else if (u > 0) {
        res += unidades[u];
      }
    }
    return res.trim();
  }

  function convertNumber(n: number): string {
    if (n === 0) return 'CERO';
    let words = '';

    const millones = Math.floor(n / 1000000);
    let resto = n % 1000000;
    const miles = Math.floor(resto / 1000);
    const unidadesChunk = resto % 1000;

    if (millones > 0) {
      if (millones === 1) words += 'UN MILLON ';
      else words += parseChunk(millones) + ' MILLONES ';
    }

    if (miles > 0) {
      if (miles === 1) words += 'MIL ';
      else words += parseChunk(miles) + ' MIL ';
    }

    if (unidadesChunk > 0) {
      words += parseChunk(unidadesChunk);
    }

    return words.trim();
  }

  const textoEntero = convertNumber(enterotunc);
  const currencyUpper = currency.toUpperCase();
  const sufijoMoneda = currencyUpper === 'USD' ? 'DÓLARES' : currencyUpper === 'EUR' ? 'EUROS' : 'PESOS';
  const tipoMonedaStr = currencyUpper === 'USD' ? 'USD' : currencyUpper === 'EUR' ? 'EUR' : 'M.N.';

  return `(${textoEntero} ${sufijoMoneda} ${centavosStr}/100 ${tipoMonedaStr})`.toUpperCase();
}

/**
 * Generates an official-looking SAT Invoice PDF from a ParsedCFDI or XML string.
 */
export async function generateCfdiPdfBlob(input: ParsedCFDI | string): Promise<Blob> {
  const cfdi: ParsedCFDI = typeof input === 'string' ? parseXMLData(input, 'factura.xml') : input;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter'
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 215.9 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 279.4 mm
  const margin = 10;
  const contentWidth = pageWidth - (margin * 2);

  // Color Palette
  const primaryColor = [15, 23, 42]; // Slate 900
  const secondaryColor = [30, 41, 59]; // Slate 800
  const accentBorder = [203, 213, 225]; // Slate 300
  const lightBg = [248, 250, 252]; // Slate 50
  const darkHeader = [241, 245, 249]; // Slate 100

  let y = margin;

  // 1. HEADER BAR
  doc.setFillColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.rect(margin, y, contentWidth, 12, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  const titleText = `REPRESENTACIÓN IMPRESA DE UN CFDI ${cfdi.version || '4.0'}`;
  doc.text(titleText, margin + 4, y + 7.5);

  const tipoStr = cfdi.tipo === 'I' ? 'I - INGRESO' :
                  cfdi.tipo === 'E' ? 'E - EGRESO' :
                  cfdi.tipo === 'N' ? 'N - NÓMINA' :
                  cfdi.tipo === 'P' ? 'P - PAGO' : 'COMPROBANTE FISCAL';
  doc.setFontSize(8);
  doc.text(tipoStr, pageWidth - margin - 4, y + 7.5, { align: 'right' });

  y += 15;

  // 2. EMISOR & FACTURA INFO BOXES (Side by Side)
  const boxWidth = (contentWidth - 4) / 2;
  const boxHeight = 38;

  // Left Box: Emisor
  doc.setDrawColor(accentBorder[0], accentBorder[1], accentBorder[2]);
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(margin, y, boxWidth, boxHeight, 1.5, 1.5, 'FD');

  doc.setFillColor(darkHeader[0], darkHeader[1], darkHeader[2]);
  doc.rect(margin, y, boxWidth, 6, 'F');
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('EMISOR', margin + 3, y + 4.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  let ey = y + 9.5;

  doc.setFont('helvetica', 'bold');
  const emisorNombreTrunc = doc.splitTextToSize(cfdi.emisorNombre || 'SIN RAZÓN SOCIAL', boxWidth - 6);
  doc.text(emisorNombreTrunc, margin + 3, ey);
  ey += (emisorNombreTrunc.length * 3.2);

  doc.setFont('helvetica', 'normal');
  doc.text(`RFC: ${cfdi.emisorRfc || 'N/A'}`, margin + 3, ey);
  ey += 3.5;
  
  const regimenStr = `Régimen: ${cfdi.emisorRegimenFiscal || ''} - ${cfdi.emisorRegimenFiscalDesc || 'Sin especificar'}`;
  const regimenLines = doc.splitTextToSize(regimenStr, boxWidth - 6);
  doc.text(regimenLines, margin + 3, ey);
  ey += (regimenLines.length * 3.2);

  if (cfdi.lugarExpedicion) {
    doc.text(`Lugar de Expedición (C.P.): ${cfdi.lugarExpedicion}`, margin + 3, ey);
  }

  // Right Box: Datos del Comprobante & Folio Fiscal
  const rightBoxX = margin + boxWidth + 4;
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(rightBoxX, y, boxWidth, boxHeight, 1.5, 1.5, 'FD');

  doc.setFillColor(darkHeader[0], darkHeader[1], darkHeader[2]);
  doc.rect(rightBoxX, y, boxWidth, 6, 'F');
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('DATOS DEL COMPROBANTE FISCAL', rightBoxX + 3, y + 4.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  let ry = y + 9.5;

  doc.setFont('helvetica', 'bold');
  doc.text(`FOLIO FISCAL (UUID):`, rightBoxX + 3, ry);
  ry += 3.2;
  doc.setFont('courier', 'bold');
  doc.setFontSize(7);
  doc.text(cfdi.uuid || cfdi.folio || 'N/A', rightBoxX + 3, ry);
  ry += 3.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const serieFolio = [cfdi.serie ? `Serie: ${cfdi.serie}` : '', cfdi.folio ? `Folio: ${cfdi.folio}` : ''].filter(Boolean).join('  |  ') || 'Serie/Folio: S/N';
  doc.text(serieFolio, rightBoxX + 3, ry);
  ry += 3.2;

  doc.text(`Fecha y Hora Emisión: ${cfdi.fechaHoraRaw || cfdi.fecha || 'N/A'}`, rightBoxX + 3, ry);
  ry += 3.2;

  doc.text(`Fecha Timbrado SAT: ${cfdi.fechaTimbrado || cfdi.fecha || 'N/A'}`, rightBoxX + 3, ry);
  ry += 3.2;

  doc.text(`No. Certificado CSD: ${cfdi.noCertificado || 'N/A'}`, rightBoxX + 3, ry);

  y += boxHeight + 4;

  // 3. RECEPTOR / TRABAJADOR BOX
  const isNomina = cfdi.isNomina || cfdi.tipo === 'N';
  const receptorBoxHeight = isNomina ? 32 : 22;
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(margin, y, contentWidth, receptorBoxHeight, 1.5, 1.5, 'FD');

  doc.setFillColor(darkHeader[0], darkHeader[1], darkHeader[2]);
  doc.rect(margin, y, contentWidth, 5.5, 'F');
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(isNomina ? 'RECEPTOR / TRABAJADOR DE NÓMINA' : 'RECEPTOR / CLIENTE', margin + 3, y + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  let recY = y + 8.5;

  doc.setFont('helvetica', 'bold');
  doc.text(`${cfdi.receptorNombre || 'SIN RAZÓN SOCIAL'}`, margin + 3, recY);
  doc.text(`RFC: ${cfdi.receptorRfc || 'N/A'}`, margin + 110, recY);
  recY += 3.8;

  doc.setFont('helvetica', 'normal');
  if (isNomina) {
    doc.text(`CURP: ${cfdi.nominaReceptorCurp || 'N/A'}`, margin + 3, recY);
    doc.text(`NSS: ${cfdi.nominaReceptorNss || 'N/A'}`, margin + 65, recY);
    doc.text(`No. Empleado: ${cfdi.nominaReceptorNumEmpleado || 'N/A'}`, margin + 125, recY);
    recY += 3.8;

    doc.text(`Contrato: ${(cfdi.nominaReceptorTipoContrato || 'N/A').substring(0, 32)}`, margin + 3, recY);
    doc.text(`Régimen: ${(cfdi.nominaReceptorTipoRegimen || 'N/A').substring(0, 32)}`, margin + 90, recY);
    recY += 3.8;

    doc.text(`Periodicidad: ${cfdi.nominaReceptorPeriodicidadPago || 'Quincenal'} (${cfdi.nominaNumDiasPagados || 15} días)`, margin + 3, recY);
    doc.text(`Periodo: ${cfdi.nominaFechaInicialPago || ''} al ${cfdi.nominaFechaFinalPago || ''}`, margin + 65, recY);
    doc.text(`Fecha Pago: ${cfdi.nominaFechaPago || cfdi.fecha || ''}`, margin + 135, recY);
  } else {
    doc.text(`Uso CFDI: ${cfdi.usoCfdi || 'G03'} - ${cfdi.usoCfdiDesc || 'Gastos en general'}`, margin + 3, recY);
    doc.text(`Régimen Fiscal: ${cfdi.receptorRegimenFiscal || '601'} - ${cfdi.receptorRegimenFiscalDesc || 'General'}`, margin + 110, recY);
    recY += 3.8;

    if (cfdi.receptorDomicilioFiscal) {
      doc.text(`Domicilio Fiscal (C.P.): ${cfdi.receptorDomicilioFiscal}`, margin + 3, recY);
    }
  }

  y += receptorBoxHeight + 5;

  // 4. CONCEPTOS TABLE
  const tableHeaders = [
    { name: 'Clave P/S', width: 20, align: 'left' },
    { name: 'No. Ident', width: 20, align: 'left' },
    { name: 'Cant.', width: 14, align: 'center' },
    { name: 'Unidad', width: 18, align: 'left' },
    { name: 'Descripción', width: 73, align: 'left' },
    { name: 'P. Unitario', width: 22, align: 'right' },
    { name: 'Descto.', width: 12, align: 'right' },
    { name: 'Importe', width: 22, align: 'right' }
  ];

  // Draw Table Header
  doc.setFillColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
  doc.rect(margin, y, contentWidth, 6, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);

  let currentX = margin;
  tableHeaders.forEach(th => {
    if (th.align === 'right') {
      doc.text(th.name, currentX + th.width - 1.5, y + 4.2, { align: 'right' });
    } else if (th.align === 'center') {
      doc.text(th.name, currentX + (th.width / 2), y + 4.2, { align: 'center' });
    } else {
      doc.text(th.name, currentX + 1.5, y + 4.2);
    }
    currentX += th.width;
  });

  y += 6;

  // Items
  const items = cfdi.conceptosDetalle && cfdi.conceptosDetalle.length > 0
    ? cfdi.conceptosDetalle
    : (cfdi.conceptos || ['Pago de nómina']).map(c => ({
        claveProdServ: '84111506',
        noIdentificacion: '1',
        cantidad: 1,
        claveUnidad: 'ACT',
        unidad: 'Actividad',
        descripcion: c,
        valorUnitario: cfdi.subTotal || cfdi.total || 0,
        importe: cfdi.subTotal || cfdi.total || 0,
        descuento: cfdi.descuento || 0
      }));

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);

  items.forEach((item, index) => {
    if (y > pageHeight - 50) {
      doc.addPage();
      y = margin + 5;
    }

    if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, 7, 'F');
    }

    const descLines = doc.splitTextToSize(item.descripcion || 'Sin descripción', tableHeaders[4].width - 3);
    const rowHeight = Math.max(6, descLines.length * 3.2 + 2);

    let cx = margin;
    doc.text(item.claveProdServ || '84111506', cx + 1.5, y + 4);
    cx += tableHeaders[0].width;

    doc.text(item.noIdentificacion || '-', cx + 1.5, y + 4);
    cx += tableHeaders[1].width;

    doc.text(String(item.cantidad || 1), cx + (tableHeaders[2].width / 2), y + 4, { align: 'center' });
    cx += tableHeaders[2].width;

    const unidadStr = `${item.claveUnidad || 'ACT'} ${item.unidad ? `(${item.unidad})` : ''}`.trim();
    doc.text(unidadStr.substring(0, 14), cx + 1.5, y + 4);
    cx += tableHeaders[3].width;

    doc.text(descLines, cx + 1.5, y + 3.8);
    cx += tableHeaders[4].width;

    const vu = typeof item.valorUnitario === 'number' ? item.valorUnitario : 0;
    doc.text(`$${vu.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, cx + tableHeaders[5].width - 1.5, y + 4, { align: 'right' });
    cx += tableHeaders[5].width;

    const descVal = typeof item.descuento === 'number' ? item.descuento : 0;
    doc.text(descVal > 0 ? `$${descVal.toFixed(2)}` : '$0.00', cx + tableHeaders[6].width - 1.5, y + 4, { align: 'right' });
    cx += tableHeaders[6].width;

    const impVal = typeof item.importe === 'number' ? item.importe : 0;
    doc.text(`$${impVal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, cx + tableHeaders[7].width - 1.5, y + 4, { align: 'right' });

    y += rowHeight;

    doc.setDrawColor(241, 245, 249);
    doc.line(margin, y, margin + contentWidth, y);
  });

  y += 4;

  // 4.5. NÓMINA ITEMIZATION (PERCEPCIONES, DEDUCCIONES Y OTROS PAGOS)
  if (isNomina) {
    if (y > pageHeight - 60) {
      doc.addPage();
      y = margin + 5;
    }

    // SECTION HEADER FOR PAYROLL COMPLEMENT
    doc.setFillColor(30, 41, 59); // Slate-800
    doc.rect(margin, y, contentWidth, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('COMPLEMENTO DE NÓMINA 1.2 — DESGLOSE DETALLADO DE PERCEPCIONES Y DEDUCCIONES', margin + 3, y + 4.2);
    y += 7;

    // A. TABLA DE PERCEPCIONES
    const percHeaders = [
      { name: 'Clave', width: 16, align: 'left' },
      { name: 'Tipo SAT', width: 22, align: 'left' },
      { name: 'Concepto / Descripción', width: 72, align: 'left' },
      { name: 'Imp. Gravado', width: 23, align: 'right' },
      { name: 'Imp. Exento', width: 23, align: 'right' },
      { name: 'Importe Total', width: 24, align: 'right' }
    ];

    doc.setFillColor(37, 99, 235); // Blue-600
    doc.rect(margin, y, contentWidth, 5.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);

    let pcx = margin;
    percHeaders.forEach(th => {
      if (th.align === 'right') doc.text(th.name, pcx + th.width - 1.5, y + 3.8, { align: 'right' });
      else doc.text(th.name, pcx + 1.5, y + 3.8);
      pcx += th.width;
    });
    y += 5.5;

    // Percepciones rows
    const percepcionesList = (cfdi.percepcionesDetalle && cfdi.percepcionesDetalle.length > 0)
      ? cfdi.percepcionesDetalle
      : [
          { tipoPercepcion: '001', tipoPercepcionDesc: 'Sueldos y Salarios', clave: '001', concepto: 'Sueldos, Salarios Rayas y Jornales', importeGravado: cfdi.percepcionSueldo || cfdi.subTotal || 0, importeExento: 0, total: cfdi.percepcionSueldo || cfdi.subTotal || 0 },
          ...(cfdi.percepcionAguinaldoGrav || cfdi.percepcionAguinaldoExent ? [{ tipoPercepcion: '002', tipoPercepcionDesc: 'Aguinaldo', clave: '002', concepto: 'Gratificación Anual (Aguinaldo)', importeGravado: cfdi.percepcionAguinaldoGrav || 0, importeExento: cfdi.percepcionAguinaldoExent || 0, total: (cfdi.percepcionAguinaldoGrav || 0) + (cfdi.percepcionAguinaldoExent || 0) }] : []),
          ...(cfdi.percepcionPrimaVacGrav || cfdi.percepcionPrimaVacExent ? [{ tipoPercepcion: '020', tipoPercepcionDesc: 'Prima Vacacional', clave: '020', concepto: 'Prima Vacacional', importeGravado: cfdi.percepcionPrimaVacGrav || 0, importeExento: cfdi.percepcionPrimaVacExent || 0, total: (cfdi.percepcionPrimaVacGrav || 0) + (cfdi.percepcionPrimaVacExent || 0) }] : []),
          ...(cfdi.percepcionBonosGrav || cfdi.percepcionBonosExent ? [{ tipoPercepcion: '038', tipoPercepcionDesc: 'Bonos / Incentivos', clave: '038', concepto: 'Bonos e Incentivos', importeGravado: cfdi.percepcionBonosGrav || 0, importeExento: cfdi.percepcionBonosExent || 0, total: (cfdi.percepcionBonosGrav || 0) + (cfdi.percepcionBonosExent || 0) }] : []),
          ...(cfdi.percepcionOtrosGrav || cfdi.percepcionOtrosExent ? [{ tipoPercepcion: '049', tipoPercepcionDesc: 'Otras Percepciones', clave: '049', concepto: 'Otras Percepciones', importeGravado: cfdi.percepcionOtrosGrav || 0, importeExento: cfdi.percepcionOtrosExent || 0, total: (cfdi.percepcionOtrosGrav || 0) + (cfdi.percepcionOtrosExent || 0) }] : [])
        ];

    let sumGrav = 0;
    let sumExent = 0;
    let sumTotalPerc = 0;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);

    percepcionesList.forEach((p, idx) => {
      if (y > pageHeight - 45) {
        doc.addPage();
        y = margin + 5;
      }

      if (idx % 2 === 1) {
        doc.setFillColor(241, 245, 249);
        doc.rect(margin, y, contentWidth, 5.5, 'F');
      }

      sumGrav += p.importeGravado || 0;
      sumExent += p.importeExento || 0;
      sumTotalPerc += p.total || 0;

      let cx = margin;
      doc.text(p.clave || p.tipoPercepcion || '-', cx + 1.5, y + 3.8);
      cx += percHeaders[0].width;

      doc.text(p.tipoPercepcion || '001', cx + 1.5, y + 3.8);
      cx += percHeaders[1].width;

      const pConcept = (p.concepto || p.tipoPercepcionDesc || 'Percepción').substring(0, 48);
      doc.text(pConcept, cx + 1.5, y + 3.8);
      cx += percHeaders[2].width;

      doc.text(`$${(p.importeGravado || 0).toFixed(2)}`, cx + percHeaders[3].width - 1.5, y + 3.8, { align: 'right' });
      cx += percHeaders[3].width;

      doc.text(`$${(p.importeExento || 0).toFixed(2)}`, cx + percHeaders[4].width - 1.5, y + 4.2, { align: 'right' });
      cx += percHeaders[4].width;

      doc.text(`$${(p.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, cx + percHeaders[5].width - 1.5, y + 3.8, { align: 'right' });

      y += 5.5;
    });

    // Subtotal Row Percepciones
    doc.setFillColor(239, 246, 255);
    doc.rect(margin, y, contentWidth, 5.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 58, 138);

    doc.text('TOTAL PERCEPCIONES:', margin + 3, y + 3.8);
    let subcx = margin + percHeaders[0].width + percHeaders[1].width + percHeaders[2].width;
    doc.text(`$${sumGrav.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, subcx + percHeaders[3].width - 1.5, y + 3.8, { align: 'right' });
    subcx += percHeaders[3].width;
    doc.text(`$${sumExent.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, subcx + percHeaders[4].width - 1.5, y + 3.8, { align: 'right' });
    subcx += percHeaders[4].width;
    doc.text(`$${(cfdi.nominaTotalPercepciones || sumTotalPerc).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, subcx + percHeaders[5].width - 1.5, y + 3.8, { align: 'right' });

    y += 7.5;

    // B. TABLA DE DEDUCCIONES
    if (y > pageHeight - 50) {
      doc.addPage();
      y = margin + 5;
    }

    const dedHeaders = [
      { name: 'Clave', width: 20, align: 'left' },
      { name: 'Tipo SAT', width: 25, align: 'left' },
      { name: 'Concepto / Descripción', width: 95, align: 'left' },
      { name: 'Importe Deducción', width: 40, align: 'right' }
    ];

    doc.setFillColor(220, 38, 38); // Red-600
    doc.rect(margin, y, contentWidth, 5.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);

    let dcx = margin;
    dedHeaders.forEach(th => {
      if (th.align === 'right') doc.text(th.name, dcx + th.width - 1.5, y + 3.8, { align: 'right' });
      else doc.text(th.name, dcx + 1.5, y + 3.8);
      dcx += th.width;
    });
    y += 5.5;

    const deduccionesList = (cfdi.deduccionesDetalle && cfdi.deduccionesDetalle.length > 0)
      ? cfdi.deduccionesDetalle
      : [
          ...(cfdi.deduccionIsr ? [{ tipoDeduccion: '001', tipoDeduccionDesc: 'Retención ISR', clave: '001', concepto: 'Retención de ISR', importe: cfdi.deduccionIsr }] : []),
          ...(cfdi.deduccionImss ? [{ tipoDeduccion: '002', tipoDeduccionDesc: 'Cuota IMSS', clave: '002', concepto: 'Aportaciones Seguridad Social (IMSS)', importe: cfdi.deduccionImss }] : []),
          ...(cfdi.deduccionFondoAhorro ? [{ tipoDeduccion: '005', tipoDeduccionDesc: 'Fondo Ahorro', clave: '005', concepto: 'Fondo de Ahorro', importe: cfdi.deduccionFondoAhorro }] : []),
          ...(cfdi.deduccionDescuentos ? [{ tipoDeduccion: '004', tipoDeduccionDesc: 'Descuentos', clave: '004', concepto: 'Descuentos Varios / INFONAVIT', importe: cfdi.deduccionDescuentos }] : []),
          ...(cfdi.deduccionOtros ? [{ tipoDeduccion: '099', tipoDeduccionDesc: 'Otras Deducciones', clave: '099', concepto: 'Otras Deducciones', importe: cfdi.deduccionOtros }] : [])
        ];

    let sumDed = 0;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);

    if (deduccionesList.length === 0) {
      doc.text('Sin deducciones registradas en este periodo.', margin + 3, y + 3.8);
      y += 5.5;
    } else {
      deduccionesList.forEach((d, idx) => {
        if (y > pageHeight - 45) {
          doc.addPage();
          y = margin + 5;
        }

        if (idx % 2 === 1) {
          doc.setFillColor(254, 242, 242);
          doc.rect(margin, y, contentWidth, 5.5, 'F');
        }

        sumDed += d.importe || 0;

        let cx = margin;
        doc.text(d.clave || d.tipoDeduccion || '-', cx + 1.5, y + 3.8);
        cx += dedHeaders[0].width;

        doc.text(d.tipoDeduccion || '001', cx + 1.5, y + 3.8);
        cx += dedHeaders[1].width;

        const dConcept = (d.concepto || d.tipoDeduccionDesc || 'Deducción').substring(0, 65);
        doc.text(dConcept, cx + 1.5, y + 3.8);
        cx += dedHeaders[2].width;

        doc.text(`$${(d.importe || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, cx + dedHeaders[3].width - 1.5, y + 3.8, { align: 'right' });

        y += 5.5;
      });
    }

    // Subtotal Row Deducciones
    doc.setFillColor(254, 226, 226);
    doc.rect(margin, y, contentWidth, 5.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(153, 27, 27);

    doc.text('TOTAL DEDUCCIONES:', margin + 3, y + 3.8);
    let subDcx = margin + dedHeaders[0].width + dedHeaders[1].width + dedHeaders[2].width;
    doc.text(`$${(cfdi.nominaTotalDeducciones || sumDed).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, subDcx + dedHeaders[3].width - 1.5, y + 3.8, { align: 'right' });

    y += 7.5;

    // C. TABLA DE OTROS PAGOS (SI APLICA)
    if (cfdi.otrosPagosDetalle && cfdi.otrosPagosDetalle.length > 0) {
      if (y > pageHeight - 50) {
        doc.addPage();
        y = margin + 5;
      }

      const opHeaders = [
        { name: 'Clave', width: 20, align: 'left' },
        { name: 'Tipo SAT', width: 25, align: 'left' },
        { name: 'Concepto / Descripción', width: 75, align: 'left' },
        { name: 'Subsidio Causado', width: 30, align: 'right' },
        { name: 'Importe', width: 30, align: 'right' }
      ];

      doc.setFillColor(22, 101, 52); // Green-700
      doc.rect(margin, y, contentWidth, 5.5, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);

      let opcx = margin;
      opHeaders.forEach(th => {
        if (th.align === 'right') doc.text(th.name, opcx + th.width - 1.5, y + 3.8, { align: 'right' });
        else doc.text(th.name, opcx + 1.5, y + 3.8);
        opcx += th.width;
      });
      y += 5.5;

      let sumOp = 0;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);

      cfdi.otrosPagosDetalle.forEach((op, idx) => {
        if (y > pageHeight - 45) {
          doc.addPage();
          y = margin + 5;
        }

        if (idx % 2 === 1) {
          doc.setFillColor(240, 253, 244);
          doc.rect(margin, y, contentWidth, 5.5, 'F');
        }

        sumOp += op.importe || 0;

        let cx = margin;
        doc.text(op.clave || op.tipoOtroPago || '-', cx + 1.5, y + 3.8);
        cx += opHeaders[0].width;

        doc.text(op.tipoOtroPago || '001', cx + 1.5, y + 3.8);
        cx += opHeaders[1].width;

        doc.text((op.concepto || op.tipoOtroPagoDesc || 'Otro Pago').substring(0, 50), cx + 1.5, y + 3.8);
        cx += opHeaders[2].width;

        doc.text(op.subsidioCausado !== undefined ? `$${op.subsidioCausado.toFixed(2)}` : 'N/A', cx + opHeaders[3].width - 1.5, y + 3.8, { align: 'right' });
        cx += opHeaders[3].width;

        doc.text(`$${(op.importe || 0).toFixed(2)}`, cx + opHeaders[4].width - 1.5, y + 3.8, { align: 'right' });

        y += 5.5;
      });

      // Subtotal Row Otros Pagos
      doc.setFillColor(220, 252, 231);
      doc.rect(margin, y, contentWidth, 5.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20, 83, 45);

      doc.text('TOTAL OTROS PAGOS:', margin + 3, y + 3.8);
      let subOpcx = margin + opHeaders[0].width + opHeaders[1].width + opHeaders[2].width + opHeaders[3].width;
      doc.text(`$${(cfdi.nominaTotalOtrosPagos || sumOp).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, subOpcx + opHeaders[4].width - 1.5, y + 3.8, { align: 'right' });

      y += 7.5;
    }
  }

  // 5. IMPORTE CON LETRA & TOTALES SECTION
  if (y > pageHeight - 65) {
    doc.addPage();
    y = margin + 5;
  }

  const totalesBoxWidth = 85;
  const letrasBoxWidth = contentWidth - totalesBoxWidth - 4;

  // Importe con letra box
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.setDrawColor(accentBorder[0], accentBorder[1], accentBorder[2]);
  doc.roundedRect(margin, y, letrasBoxWidth, 28, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(isNomina ? 'IMPORTE NETO A RECIBIR CON LETRA:' : 'IMPORTE CON LETRA:', margin + 3, y + 4.5);

  const totalNett = isNomina ? (cfdi.nominaNeto || cfdi.total) : cfdi.total;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  const letrasStr = numeroALetras(totalNett, cfdi.moneda || 'MXN');
  const letrasLines = doc.splitTextToSize(letrasStr, letrasBoxWidth - 6);
  doc.text(letrasLines, margin + 3, y + 8.5);

  // Forma y Método de Pago inside Letras box
  let payY = y + 16.5;
  doc.setFont('helvetica', 'bold');
  doc.text(`Forma de Pago: `, margin + 3, payY);
  doc.setFont('helvetica', 'normal');
  doc.text(`${cfdi.formaPago || '99'} - ${cfdi.formaPagoDesc || 'Por definir'}`, margin + 25, payY);

  payY += 3.5;
  doc.setFont('helvetica', 'bold');
  doc.text(`Método de Pago: `, margin + 3, payY);
  doc.setFont('helvetica', 'normal');
  doc.text(`${cfdi.metodoPago || 'PUE'} - ${cfdi.metodoPagoDesc || 'Pago en una sola exhibición'}`, margin + 26, payY);

  payY += 3.5;
  doc.setFont('helvetica', 'bold');
  doc.text(`Moneda / T.C.: `, margin + 3, payY);
  doc.setFont('helvetica', 'normal');
  doc.text(`${cfdi.moneda || 'MXN'} (Tipo Cambio: ${cfdi.tipoCambio || '1'})`, margin + 25, payY);

  // Totales box
  const totalesX = margin + letrasBoxWidth + 4;
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(totalesX, y, totalesBoxWidth, 28, 1.5, 1.5, 'FD');

  let totY = y + 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);

  if (isNomina) {
    // Total Percepciones
    doc.text('(+) Total Percepciones:', totalesX + 3, totY);
    doc.text(`$${(cfdi.nominaTotalPercepciones || cfdi.subTotal || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, totalesX + totalesBoxWidth - 3, totY, { align: 'right' });
    totY += 3.8;

    // Total Otros Pagos
    if (cfdi.nominaTotalOtrosPagos && cfdi.nominaTotalOtrosPagos > 0) {
      doc.text('(+) Total Otros Pagos:', totalesX + 3, totY);
      doc.text(`$${cfdi.nominaTotalOtrosPagos.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, totalesX + totalesBoxWidth - 3, totY, { align: 'right' });
      totY += 3.8;
    }

    // Total Deducciones
    doc.text('(-) Total Deducciones:', totalesX + 3, totY);
    doc.text(`-$${(cfdi.nominaTotalDeducciones || cfdi.descuento || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, totalesX + totalesBoxWidth - 3, totY, { align: 'right' });
    totY += 4.2;

    // Line separator before Total Neto
    doc.setDrawColor(accentBorder[0], accentBorder[1], accentBorder[2]);
    doc.line(totalesX + 2, totY, totalesX + totalesBoxWidth - 2, totY);
    totY += 4;

    // NETO A PAGAR
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text('NETO A PAGAR:', totalesX + 3, totY);
    doc.text(`$${totalNett.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`, totalesX + totalesBoxWidth - 3, totY, { align: 'right' });
  } else {
    // Subtotal
    doc.text('Subtotal:', totalesX + 3, totY);
    doc.text(`$${(cfdi.subTotal || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, totalesX + totalesBoxWidth - 3, totY, { align: 'right' });
    totY += 3.5;

    // Descuento
    if (cfdi.descuento && cfdi.descuento > 0) {
      doc.text('Descuento:', totalesX + 3, totY);
      doc.text(`-$${cfdi.descuento.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, totalesX + totalesBoxWidth - 3, totY, { align: 'right' });
      totY += 3.5;
    }

    // IVA Trasladado
    if (cfdi.ivaTrasladado !== undefined && cfdi.ivaTrasladado >= 0) {
      doc.text('IVA Trasladado (16%):', totalesX + 3, totY);
      doc.text(`+$${cfdi.ivaTrasladado.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, totalesX + totalesBoxWidth - 3, totY, { align: 'right' });
      totY += 3.5;
    }

    // IEPS
    if (cfdi.iepsTotal && cfdi.iepsTotal > 0) {
      doc.text('IEPS:', totalesX + 3, totY);
      doc.text(`+$${cfdi.iepsTotal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, totalesX + totalesBoxWidth - 3, totY, { align: 'right' });
      totY += 3.5;
    }

    // Retenciones (ISR/IVA)
    if (cfdi.ivaRetenido && cfdi.ivaRetenido > 0) {
      doc.text('Retención IVA:', totalesX + 3, totY);
      doc.text(`-$${cfdi.ivaRetenido.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, totalesX + totalesBoxWidth - 3, totY, { align: 'right' });
      totY += 3.5;
    }
    if (cfdi.isrRetenido && cfdi.isrRetenido > 0) {
      doc.text('Retención ISR:', totalesX + 3, totY);
      doc.text(`-$${cfdi.isrRetenido.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, totalesX + totalesBoxWidth - 3, totY, { align: 'right' });
      totY += 3.5;
    }

    // Line separator before Total
    doc.setDrawColor(accentBorder[0], accentBorder[1], accentBorder[2]);
    doc.line(totalesX + 2, totY, totalesX + totalesBoxWidth - 2, totY);
    totY += 3.5;

    // TOTAL
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text('TOTAL:', totalesX + 3, totY);
    doc.text(`$${(cfdi.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`, totalesX + totalesBoxWidth - 3, totY, { align: 'right' });
  }

  y += 32;

  // 6. SAT SEALS & QR CODE SECTION
  if (y > pageHeight - 55) {
    doc.addPage();
    y = margin + 5;
  }

  // Generate QR Code URL according to SAT specs
  const totalFormatted = (cfdi.total || 0).toFixed(6);
  const sello8 = (cfdi.selloCFDI || cfdi.selloSAT || '12345678').slice(-8);
  const qrString = `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${cfdi.uuid || ''}&re=${cfdi.emisorRfc || ''}&rr=${cfdi.receptorRfc || ''}&tt=${totalFormatted}&fe=${sello8}`;

  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(qrString, { margin: 1, width: 140 });
  } catch (err) {
    console.warn('Error generando código QR de CFDI:', err);
  }

  const qrSize = 34;
  if (qrDataUrl) {
    doc.addImage(qrDataUrl, 'PNG', margin, y, qrSize, qrSize);
  } else {
    doc.rect(margin, y, qrSize, qrSize);
    doc.setFontSize(6);
    doc.text('QR SAT', margin + 10, y + 17);
  }

  const stampsX = margin + qrSize + 4;
  const stampsWidth = contentWidth - qrSize - 4;

  let stampY = y;
  doc.setFontSize(6);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);

  // Sello Digital del CFDI
  doc.setFont('helvetica', 'bold');
  doc.text('SELLO DIGITAL DEL CFDI:', stampsX, stampY + 2.5);
  doc.setFont('courier', 'normal');
  doc.setFontSize(5);
  const selloCfdiStr = cfdi.selloCFDI || 'SELLO_CFDI_NO_DISPONIBLE_EN_ORIGEN_XML';
  const selloCfdiLines = doc.splitTextToSize(selloCfdiStr, stampsWidth);
  doc.text(selloCfdiLines.slice(0, 2), stampsX, stampY + 5.5);

  stampY += 10;

  // Sello SAT
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.text('SELLO DIGITAL DEL SAT:', stampsX, stampY + 2.5);
  doc.setFont('courier', 'normal');
  doc.setFontSize(5);
  const selloSatStr = cfdi.selloSAT || 'SELLO_SAT_NO_DISPONIBLE_EN_ORIGEN_XML';
  const selloSatLines = doc.splitTextToSize(selloSatStr, stampsWidth);
  doc.text(selloSatLines.slice(0, 2), stampsX, stampY + 5.5);

  stampY += 10;

  // Cadena Original del complemento de certificación
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.text('CADENA ORIGINAL DEL COMPLEMENTO DE CERTIFICACIÓN DIGITAL DEL SAT:', stampsX, stampY + 2.5);
  doc.setFont('courier', 'normal');
  doc.setFontSize(5);
  const cadenaStr = cfdi.cadenaOriginalSAT || `||1.1|${cfdi.uuid || 'N/A'}|${cfdi.fechaTimbrado || cfdi.fecha || ''}|${cfdi.rfcProvCertif || 'SAT970701NN3'}|${selloCfdiStr.slice(0, 30)}...|${cfdi.noCertificadoSAT || ''}||`;
  const cadenaLines = doc.splitTextToSize(cadenaStr, stampsWidth);
  doc.text(cadenaLines.slice(0, 2), stampsX, stampY + 5.5);

  y += qrSize + 4;

  // Footer Legend
  doc.setDrawColor(accentBorder[0], accentBorder[1], accentBorder[2]);
  doc.line(margin, y, margin + contentWidth, y);
  y += 3.5;

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text('ESTE DOCUMENTO ES UNA REPRESENTACIÓN IMPRESA DE UN CFDI', pageWidth / 2, y, { align: 'center' });

  return doc.output('blob');
}

/**
 * Trigger immediate browser download of the generated SAT invoice PDF.
 */
export async function downloadCfdiPdf(input: ParsedCFDI | string, customFileName?: string): Promise<void> {
  const cfdi: ParsedCFDI = typeof input === 'string' ? parseXMLData(input, 'factura.xml') : input;
  const pdfBlob = await generateCfdiPdfBlob(cfdi);
  
  const fileName = customFileName || `Factura_SAT_${cfdi.emisorRfc}_${cfdi.folio || cfdi.uuid?.substring(0, 8) || 'CFDI'}.pdf`;
  const url = URL.createObjectURL(pdfBlob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}

/**
 * Open generated PDF in a new tab for instant browser preview or direct printing.
 */
export async function previewCfdiPdfInNewTab(input: ParsedCFDI | string): Promise<void> {
  const cfdi: ParsedCFDI = typeof input === 'string' ? parseXMLData(input, 'factura.xml') : input;
  const pdfBlob = await generateCfdiPdfBlob(cfdi);
  const url = URL.createObjectURL(pdfBlob);
  window.open(url, '_blank');
}
