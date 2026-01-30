
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
  
  const resumenData = emp.lotes.map(l => ({
    "Empreendimento": emp.nome,
    "Quadra": l.quadra || "(Sem quadra)",
    "Lote": l.numero,
    "Entrada": formatBRL(l.entrada),
    "Status": statusLabel(l.status),
    "Cliente": l.cliente,
    "Corretor": l.corretor,
    "Imobiliária": l.imobiliaria || "-",
    "Reservado até": formatISOToBR(l.reservaAte)
  }));
  
  const wsResumo = utils.json_to_sheet(resumenData);
  utils.book_append_sheet(wb, wsResumo, "Resumo");
  
  const grouped = groupByQuadra(emp.lotes);
  Object.entries(grouped).forEach(([quadra, lotes]) => {
    const quadraData = lotes.map(l => ({
      "Lote": l.numero,
      "Entrada": formatBRL(l.entrada),
      "Status": statusLabel(l.status),
      "Cliente": l.cliente,
      "Corretor": l.corretor,
      "Imobiliária": l.imobiliaria || "-",
      "Reservado até": formatISOToBR(l.reservaAte)
    }));
    
    const wsQuadra = utils.json_to_sheet(quadraData);
    utils.book_append_sheet(wb, wsQuadra, sanitizeSheetName(quadra));
  });
  
  writeFile(wb, sanitizeFileName(`${emp.nome}.xlsx`));
};

export const exportToPDF = async (emp: Empreendimento) => {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF('l', 'mm', 'a4'); // 'l' para landscape (paisagem) por causa da coluna extra
  
  doc.setFontSize(18);
  doc.text(emp.nome, 14, 20);
  doc.setFontSize(10);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);
  
  const grouped = groupByQuadra(emp.lotes);
  let startY = 35;

  Object.entries(grouped).forEach(([quadra, lotes]) => {
    if (startY > 180) { doc.addPage(); startY = 20; }
    doc.setFontSize(14);
    doc.text(`Quadra: ${quadra}`, 14, startY);
    startY += 5;

    autoTable(doc, {
      startY: startY,
      head: [['Lote', 'Entrada', 'Status', 'Cliente', 'Corretor', 'Imobiliária', 'Validade']],
      body: lotes.map(l => [
        l.numero,
        formatBRL(l.entrada),
        statusLabel(l.status),
        l.cliente || '-',
        l.corretor || '-',
        l.imobiliaria || '-',
        formatISOToBR(l.reservaAte) || '-'
      ]),
      theme: 'grid',
      headStyles: { fillColor: [51, 65, 85] },
      styles: { fontSize: 8 },
      margin: { top: 20 }
    });
    // @ts-ignore
    startY = doc.lastAutoTable.finalY + 15;
  });

  doc.save(sanitizeFileName(`${emp.nome}.pdf`));
};
