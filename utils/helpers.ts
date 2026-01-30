
import { Status, Lote } from '../types';

export const uid = () => Math.random().toString(36).substring(2, 11);

/** Retorna a data/hora local no formato yyyy-mm-ddThh:mm para comparação e inputs */
export const nowLocalISO = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  const localISOTime = (new Date(now.getTime() - offset)).toISOString().slice(0, 16);
  return localISOTime;
};

export const formatBRL = (n: number) => 
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

export const toNumber = (str: string): number => {
  if (!str) return 0;
  const clean = str.replace(/\./g, '').replace(',', '.');
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : val;
};

export const statusLabel = (status: Status): string => {
  const labels: Record<Status, string> = {
    disponivel: "Disponível",
    reservado: "Reservado",
    vendido: "Vendido"
  };
  return labels[status];
};

export const statusPillClass = (status: Status): string => {
  switch (status) {
    case 'disponivel': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    case 'reservado': return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'vendido': return 'bg-rose-100 text-rose-700 border-rose-200';
    default: return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

export const formatISOToBR = (iso: string): string => {
  if (!iso) return '';
  // Formato esperado: yyyy-mm-ddThh:mm ou yyyy-mm-dd
  const [datePart, timePart] = iso.split('T');
  const [y, m, d] = datePart.split('-');
  const dateStr = `${d}/${m}/${y}`;
  return timePart ? `${dateStr} ${timePart}` : dateStr;
};

export const sanitizeSheetName = (name: string): string => {
  let sanitized = name.replace(/[:\\/?*[\]]/g, '').trim();
  if (sanitized === "") sanitized = "Aba";
  return sanitized.substring(0, 31);
};

export const sanitizeFileName = (name: string): string => {
  return name.replace(/[\\/:?*"<>|]/g, '').trim();
};

export const normalizeQuadraName = (q: string) => q.trim() || "(Sem quadra)";

export const groupByQuadra = (lotes: Lote[]) => {
  const groups: Record<string, Lote[]> = {};
  
  lotes.forEach(l => {
    const qName = normalizeQuadraName(l.quadra);
    if (!groups[qName]) groups[qName] = [];
    groups[qName].push(l);
  });

  const sortedQuadras = Object.keys(groups).sort((a, b) => 
    a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
  );

  const result: Record<string, Lote[]> = {};
  sortedQuadras.forEach(q => {
    result[q] = groups[q].sort((a, b) => 
      a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true })
    );
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

export const expireReservations = (lotes: Lote[]): { updatedLotes: Lote[], changed: boolean } => {
  const agora = nowLocalISO();
  let changed = false;
  
  const updatedLotes = lotes.map(l => {
    // Compara strings ISO locais: "2023-10-27T10:00" < "2023-10-27T11:00"
    if (l.status === 'reservado' && l.reservaAte && l.reservaAte < agora) {
      changed = true;
      return { 
        ...l, 
        status: 'disponivel' as Status, 
        cliente: "", 
        corretor: "", 
        reservaAte: "" 
      };
    }
    return l;
  });
  
  return { updatedLotes, changed };
};
