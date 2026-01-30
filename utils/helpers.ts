
import { Status, Lote } from '../types';

export const uid = () => Math.random().toString(36).substring(2, 11);

export const nowLocalISO = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  const localISOTime = (new Date(now.getTime() - offset)).toISOString().slice(0, 16);
  return localISOTime;
};

export const formatBRL = (n: number) => 
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

/**
 * Máscara para input de moeda em tempo real
 */
export const maskCurrency = (value: string) => {
  let v = value.replace(/\D/g, "");
  if (!v) return "";
  v = (Number(v) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return v;
};

/**
 * Converte string formatada (BR) para número puro (float)
 */
export const toNumber = (str: string | number): number => {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  
  let clean = str.toString().trim();
  
  // Se tem vírgula (Padrão BR: 1.234,56), remove os pontos de milhar e troca a vírgula por ponto
  if (clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else {
    // Se não tem vírgula mas tem múltiplos pontos, remove-os (milhares)
    const points = (clean.match(/\./g) || []).length;
    if (points > 1) clean = clean.replace(/\./g, '');
  }
  
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val;
};

export const calculateLoteTotal = (lote: { parcelaValor: string | number, parcelaPrazo: string | number }) => {
  const v = typeof lote.parcelaValor === 'string' ? toNumber(lote.parcelaValor) : lote.parcelaValor;
  const p = typeof lote.parcelaPrazo === 'string' ? toNumber(lote.parcelaPrazo) : lote.parcelaPrazo;
  return (v || 0) * (p || 0);
};

export const statusLabel = (status: Status): string => {
  const labels: Record<Status, string> = {
    disponivel: "Disponível",
    reservado: "Reservado",
    vendido: "Vendido"
  };
  return labels[status];
};

export const formatISOToBR = (iso: string): string => {
  if (!iso) return '';
  const [datePart, timePart] = iso.split('T');
  const [y, m, d] = datePart.split('-');
  return timePart ? `${d}/${m}/${y} ${timePart}` : `${d}/${m}/${y}`;
};

export const groupByQuadra = (lotes: Lote[]) => {
  const groups: Record<string, Lote[]> = {};
  lotes.forEach(l => {
    const qName = l.quadra.trim().toUpperCase() || "(S/Q)";
    if (!groups[qName]) groups[qName] = [];
    groups[qName].push(l);
  });
  
  const sortedQuadras = Object.keys(groups).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const result: Record<string, Lote[]> = {};
  sortedQuadras.forEach(q => {
    result[q] = groups[q].sort((a, b) => {
      const numA = parseInt(a.numero.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.numero.replace(/\D/g, '')) || 0;
      return numA - numB;
    });
  });
  return result;
};

export const getStats = (lotes: Lote[]) => {
  return {
    total: lotes.length,
    disponivel: lotes.filter(l => l.status === 'disponivel').length,
    reservado: lotes.filter(l => l.status === 'reservado').length,
    vendido: lotes.filter(l => l.status === 'vendido').length,
  };
};

export const getDashboardStats = (lotes: Lote[], month: number, year: number) => {
  const soldInPeriod = lotes.filter(l => {
    if (l.status !== 'vendido' || !l.dataVenda) return false;
    const date = new Date(l.dataVenda);
    return date.getMonth() === month && date.getFullYear() === year;
  });

  const vgv = soldInPeriod.reduce((acc, l) => acc + calculateLoteTotal(l), 0);

  const rankingMap: Record<string, { corretor: string; imobiliaria: string; vendas: number }> = {};
  soldInPeriod.forEach(l => {
    const key = `${l.corretor}_${l.imobiliaria}`.toUpperCase();
    if (!rankingMap[key]) {
      rankingMap[key] = { 
        corretor: l.corretor || "Corretor Lagos", 
        imobiliaria: l.imobiliaria || "Particular", 
        vendas: 0 
      };
    }
    rankingMap[key].vendas++;
  });

  return { 
    salesCount: soldInPeriod.length, 
    vgv, 
    ranking: Object.values(rankingMap).sort((a, b) => b.vendas - a.vendas).slice(0, 3) 
  };
};

export const sanitizeFileName = (name: string) => name.replace(/[<>:"/\\|?*]/g, '_').trim();
export const sanitizeSheetName = (name: string) => name.replace(/[\\/?*\[\]:]/g, '_').substring(0, 31);
