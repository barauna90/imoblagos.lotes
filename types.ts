
export type Status = "disponivel" | "reservado" | "vendido";

export interface User {
  id: string;
  nome: string;
  email: string;
  password?: string;
  avatar?: string;
}

export interface Lote {
  id: string;
  quadra: string;
  numero: string;
  entrada: number;
  status: Status;
  cliente: string;
  corretor: string;
  reservaAte: string; // yyyy-mm-dd
}

export interface Empreendimento {
  id: string;
  nome: string;
  lotes: Lote[];
  createdBy?: string; // ID do usuário que criou
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
