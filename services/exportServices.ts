
import { Empreendimento, Lote } from '../types';
import { 
  formatBRL, 
  formatISOToBR, 
  statusLabel, 
  groupByQuadra, 
  sanitizeSheetName, 
  sanitizeFileName 
} from '../utils/helpers';

export const exportToExcel = async (emp: Empreendimento) => {
  const { utils, writeFile } = await import("xlsx");
  
  const wb = utils.book_new();
  
  // 1. Resumo Sheet
  const resumenData = emp.lotes.map(l => ({
    "Empreendimento": emp.nome,
    "Quadra": l.quadra || "(Sem quadra)",
    "Lote": l.numero,
    "Entrada": formatBRL(l.entrada),
    "Status": statusLabel(l.status),
    "Cliente": l.cliente,
    "Corretor": l.corretor,
    "Reservado até": formatISOToBR(l.reservaAte)
  }));
  
  const wsResumo = utils.json_to_sheet(resumenData);
  utils.book_append_sheet(wb, wsResumo, "Resumo");
  
  // 2. Individual Quadra Sheets
  const grouped = groupByQuadra(emp.lotes);
  Object.entries(grouped).forEach(([quadra, lotes]) => {
    const quadraData = lotes.map(l => ({
      "Lote": l.numero,
      "Entrada": formatBRL(l.entrada),
      "Status": statusLabel(l.status),
      "Cliente": l.cliente,
      "Corretor": l.corretor,
      "Reservado até": formatISOToBR(l.reservaAte)
    }));
    
    const wsQuadra = utils.json_to_sheet(quadraData);
    utils.book_append_sheet(wb, wsQuadra, sanitizeSheetName(quadra));
  });
  
  const fileName = sanitizeFileName(`${emp.nome} - Lotes por Quadra.xlsx`);
  writeFile(wb, fileName);
};

export const exportToPDF = async (emp: Empreendimento) => {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  
  const doc = new jsPDF();
  const timestamp = new Date().toLocaleString('pt-BR');
  
  // Header
  doc.setFontSize(18);
  doc.text(emp.nome, 14, 20);
  doc.setFontSize(10);
  doc.text(`Gerado em: ${timestamp}`, 14, 28);
  
  const grouped = groupByQuadra(emp.lotes);
  let startY = 35;

  Object.entries(grouped).forEach(([quadra, lotes]) => {
    // Check if we need a new page for the next section header
    if (startY > 250) {
      doc.addPage();
      startY = 20;
    }

    doc.setFontSize(14);
    doc.text(`Quadra: ${quadra}`, 14, startY);
    startY += 5;

    const tableData = lotes.map(l => [
      l.numero,
      formatBRL(l.entrada),
      statusLabel(l.status),
      l.cliente || '-',
      l.corretor || '-',
      formatISOToBR(l.reservaAte) || '-'
    ]);

    autoTable(doc, {
      startY: startY,
      head: [['Lote', 'Entrada', 'Status', 'Cliente', 'Corretor', 'Reservado até']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [51, 65, 85] },
      styles: { fontSize: 8 },
      margin: { top: 20 },
      didDrawPage: (data) => {
        // Simple page numbering
        const str = "Página " + doc.internal.getNumberOfPages();
        doc.setFontSize(8);
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
        doc.text(str, data.settings.margin.left, pageHeight - 10);
      }
    });

    // Update startY for the next table
    // @ts-ignore - autoTable adds lastAutoTable to doc
    startY = doc.lastAutoTable.finalY + 15;
  });

  const fileName = sanitizeFileName(`${emp.nome} - Lotes por Quadra.pdf`);
  doc.save(fileName);
};
