
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

export const maskCurrency = (value: string) => {
  let v = value.replace(/\D/g, "");
  if (!v) return "";
  v = (Number(v) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return v;
};

export const maskCNPJ = (value: string) => {
  let v = value.replace(/\D/g, "");
  if (v.length > 14) v = v.slice(0, 14);
  v = v.replace(/^(\d{2})(\d)/, "$1.$2");
  v = v.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
  v = v.replace(/\.(\d{3})(\d)/, ".$1/$2");
  v = v.replace(/(\d{4})(\d)/, "$1-$2");
  return v;
};

export const maskPhone = (value: string) => {
  let v = value.replace(/\D/g, "");
  if (v.length > 11) v = v.slice(0, 11);
  v = v.replace(/^(\d{2})(\d)/g, "($1) $2");
  v = v.replace(/(\d)(\d{4})$/, "$1-$2");
  return v;
};

export const toNumber = (str: string | number): number => {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  let clean = str.toString().trim();
  if (clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else {
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

export const sanitizeFileName = (name: string) => name.replace(/[<>:"/\\|?*]/g, '_').trim();
