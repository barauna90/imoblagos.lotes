
export type Status = "disponivel" | "reservado" | "vendido";
export type Role = "master" | "gestor" | "corretor";

export interface User {
  id: string;
  nome: string;
  email: string;
  role: Role;
  password?: string;
  avatar?: string;
  empreendimentosVinculados?: string[]; // IDs dos empreendimentos que este usuário pode ver
}

export interface Lote {
  id: string;
  quadra: string;
  numero: string;
  entrada: number;
  status: Status;
  cliente: string;
  corretor: string;
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
  status: Status;
  cliente: string;
  corretor: string;
  reservaAte: string;
}
