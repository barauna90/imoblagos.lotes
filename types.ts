
export type Status = "disponivel" | "reservado" | "vendido";
export type Role = "master" | "gestor" | "corretor";

export interface User {
  id: string;
  nome: string;
  email: string;
  role: Role;
  password?: string;
  avatar?: string;
  empreendimentosVinculados?: string[];
}

export interface Lote {
  id: string;
  quadra: string;
  numero: string;
  entrada: number;
  parcelaValor: number; 
  parcelaPrazo: number; 
  status: Status;
  cliente: string;
  corretor: string;
  imobiliaria: string;
  dataVenda?: string;
  reservaAte: string; 
  reservedById?: string; 
}

export interface Empreendimento {
  id: string;
  nome: string;
  lotes: Lote[];
  createdBy?: string; 
}

export type ViewMode = "lista" | "cards";

export interface LoteFormState {
  quadra: string;
  numero: string;
  entrada: string;
  parcelaValor: string;
  parcelaPrazo: string;
  status: Status;
  cliente: string;
  corretor: string;
  imobiliaria: string;
  dataVenda: string;
  reservaAte: string;
}
