
import { Empreendimento, Lote } from '../types';
import { 
  formatBRL, 
  formatISOToBR, 
  statusLabel, 
  groupByQuadra, 
  sanitizeSheetName, 
  sanitizeFileName,
  calculateLoteTotal
} from '../utils/helpers';

export const exportToExcel = async (emp: Empreendimento) => {
  const { utils, writeFile } = await import("xlsx");
  const wb = utils.book_new();
  
  const resumenData = emp.lotes.map(l => ({
    "Quadra": l.quadra || "(Sem quadra)",
    "Lote": l.numero,
    "Entrada": formatBRL(l.entrada),
    "Parcela": formatBRL(l.parcelaValor),
    "Prazo": l.parcelaPrazo,
    "VGV Total": formatBRL(calculateLoteTotal(l)),
    "Status": statusLabel(l.status),
    "Cliente": l.cliente || "-",
    "Corretor": l.corretor || "-",
    "Imobiliária": l.imobiliaria || "-",
    "Data da Venda": l.dataVenda ? formatISOToBR(l.dataVenda) : "-"
  }));
  
  const wsResumo = utils.json_to_sheet(resumenData);
  utils.book_append_sheet(wb, wsResumo, "Relatório Completo");
  
  writeFile(wb, sanitizeFileName(`${emp.nome}_Financeiro.xlsx`));
};

export const exportToPDF = async (emp: Empreendimento) => {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF('l', 'mm', 'a4');
  
  doc.setFontSize(18);
  doc.text(`${emp.nome} - Relatório Geral`, 14, 20);
  
  const grouped = groupByQuadra(emp.lotes);
  let startY = 35;

  Object.entries(grouped).forEach(([quadra, lotes]) => {
    if (startY > 180) { doc.addPage(); startY = 20; }
    doc.setFontSize(14);
    doc.text(`Quadra: ${quadra}`, 14, startY);
    startY += 5;

    autoTable(doc, {
      startY: startY,
      head: [['Lote', 'Entrada', 'Plano', 'Total', 'Status', 'Corretor', 'Imobiliária']],
      body: lotes.map(l => [
        l.numero,
        formatBRL(l.entrada),
        `${formatBRL(l.parcelaValor)} (${l.parcelaPrazo}x)`,
        formatBRL(calculateLoteTotal(l)),
        statusLabel(l.status),
        l.corretor || '-',
        l.imobiliaria || '-'
      ]),
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59] },
      styles: { fontSize: 7 }
    });
    // @ts-ignore
    startY = doc.lastAutoTable.finalY + 15;
  });

  doc.save(sanitizeFileName(`${emp.nome}_Relatorio.pdf`));
};
