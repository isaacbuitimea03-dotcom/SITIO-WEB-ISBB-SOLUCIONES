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

  // 3. RECEPTOR BOX
  const receptorBoxHeight = 22;
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(margin, y, contentWidth, receptorBoxHeight, 1.5, 1.5, 'FD');

  doc.setFillColor(darkHeader[0], darkHeader[1], darkHeader[2]);
  doc.rect(margin, y, contentWidth, 5.5, 'F');
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('RECEPTOR / CLIENTE', margin + 3, y + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  let recY = y + 8.5;

  doc.setFont('helvetica', 'bold');
  doc.text(`${cfdi.receptorNombre || 'SIN RAZÓN SOCIAL'}`, margin + 3, recY);
  doc.text(`RFC: ${cfdi.receptorRfc || 'N/A'}`, margin + 110, recY);
  recY += 3.8;

  doc.setFont('helvetica', 'normal');
  doc.text(`Uso CFDI: ${cfdi.usoCfdi || 'G03'} - ${cfdi.usoCfdiDesc || 'Gastos en general'}`, margin + 3, recY);
  doc.text(`Régimen Fiscal: ${cfdi.receptorRegimenFiscal || '601'} - ${cfdi.receptorRegimenFiscalDesc || 'General'}`, margin + 110, recY);
  recY += 3.8;

  if (cfdi.receptorDomicilioFiscal) {
    doc.text(`Domicilio Fiscal (C.P.): ${cfdi.receptorDomicilioFiscal}`, margin + 3, recY);
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
    : (cfdi.conceptos || ['Concepto General']).map(c => ({
        claveProdServ: '84111506',
        noIdentificacion: '1',
        cantidad: 1,
        claveUnidad: 'E48',
        unidad: 'Servicio',
        descripcion: c,
        valorUnitario: cfdi.subTotal || cfdi.total || 0,
        importe: cfdi.subTotal || cfdi.total || 0,
        descuento: cfdi.descuento || 0
      }));

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);

  items.forEach((item, index) => {
    // Check for page overflow
    if (y > pageHeight - 50) {
      doc.addPage();
      y = margin + 5;
      // Re-draw table header on new page
      doc.setFillColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
      doc.rect(margin, y, contentWidth, 6, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      let cx = margin;
      tableHeaders.forEach(th => {
        if (th.align === 'right') doc.text(th.name, cx + th.width - 1.5, y + 4.2, { align: 'right' });
        else if (th.align === 'center') doc.text(th.name, cx + (th.width / 2), y + 4.2, { align: 'center' });
        else doc.text(th.name, cx + 1.5, y + 4.2);
        cx += th.width;
      });
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    }

    // Row alternating background
    if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, contentWidth, 7, 'F');
    }

    const descLines = doc.splitTextToSize(item.descripcion || 'Sin descripción', tableHeaders[4].width - 3);
    const rowHeight = Math.max(6, descLines.length * 3.2 + 2);

    let cx = margin;
    // Clave ProdServ
    doc.text(item.claveProdServ || '01010101', cx + 1.5, y + 4);
    cx += tableHeaders[0].width;

    // No Ident
    doc.text(item.noIdentificacion || '-', cx + 1.5, y + 4);
    cx += tableHeaders[1].width;

    // Cantidad
    doc.text(String(item.cantidad || 1), cx + (tableHeaders[2].width / 2), y + 4, { align: 'center' });
    cx += tableHeaders[2].width;

    // Unidad
    const unidadStr = `${item.claveUnidad || 'E48'} ${item.unidad ? `(${item.unidad})` : ''}`.trim();
    doc.text(unidadStr.substring(0, 14), cx + 1.5, y + 4);
    cx += tableHeaders[3].width;

    // Descripcion
    doc.text(descLines, cx + 1.5, y + 3.8);
    cx += tableHeaders[4].width;

    // P. Unitario
    const vu = typeof item.valorUnitario === 'number' ? item.valorUnitario : 0;
    doc.text(`$${vu.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, cx + tableHeaders[5].width - 1.5, y + 4, { align: 'right' });
    cx += tableHeaders[5].width;

    // Descto
    const descVal = typeof item.descuento === 'number' ? item.descuento : 0;
    doc.text(descVal > 0 ? `$${descVal.toFixed(2)}` : '$0.00', cx + tableHeaders[6].width - 1.5, y + 4, { align: 'right' });
    cx += tableHeaders[6].width;

    // Importe
    const impVal = typeof item.importe === 'number' ? item.importe : 0;
    doc.text(`$${impVal.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, cx + tableHeaders[7].width - 1.5, y + 4, { align: 'right' });

    y += rowHeight;

    // Draw thin line under row
    doc.setDrawColor(241, 245, 249);
    doc.line(margin, y, margin + contentWidth, y);
  });

  y += 3;

  // 5. IMPORTE CON LETRA & TOTALES SECTION
  if (y > pageHeight - 65) {
    doc.addPage();
    y = margin + 5;
  }

  const totalesBoxWidth = 80;
  const letrasBoxWidth = contentWidth - totalesBoxWidth - 4;

  // Importe con letra box
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.setDrawColor(accentBorder[0], accentBorder[1], accentBorder[2]);
  doc.roundedRect(margin, y, letrasBoxWidth, 26, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('IMPORTE CON LETRA:', margin + 3, y + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  const letrasStr = numeroALetras(cfdi.total, cfdi.moneda || 'MXN');
  const letrasLines = doc.splitTextToSize(letrasStr, letrasBoxWidth - 6);
  doc.text(letrasLines, margin + 3, y + 8.5);

  // Forma y Método de Pago inside Letras box
  let payY = y + 16;
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
  doc.roundedRect(totalesX, y, totalesBoxWidth, 26, 1.5, 1.5, 'FD');

  let totY = y + 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);

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

  y += 30;

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
