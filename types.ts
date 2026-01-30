
export type Status = "disponivel" | "reservado" | "vendido";
export type Role = "master" | "gestor" | "corretor";

export interface Imobiliaria {
  id: string;
  nome: string;
  cnpj?: string;
  contato?: string;
}

export interface User {
  id: string;
  nome: string;
  email: string;
  role: Role;
  imobiliaria?: string; // Nome da imobiliária vinculada
  imobiliariaId?: string; // ID da imobiliária para vínculo estruturado
  password?: string;
  avatar?: string;
  empreendimentosVinculados?: string[];
}

export interface LoteDimensoes {
  frente: string;
  fundos: string;
  lateralDireita: string;
  lateralEsquerda: string;
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
  dimensoes?: LoteDimensoes;
}

export interface Empreendimento {
  id: string;
  nome: string;
  lotes: Lote[];
  createdBy?: string; 
}

export type ViewMode = "lista" | "cards";
export type AppSection = "projetos" | "financeiro" | "equipe" | "imobiliarias";

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
  frente: string;
  fundos: string;
  lateralDireita: string;
  lateralEsquerda: string;
}
