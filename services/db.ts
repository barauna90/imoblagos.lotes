
import { User, Empreendimento } from '../types';
import { uid } from '../utils/helpers';

const STORAGE_KEY = 'imoblagos_database_v1';

interface DBStructure {
  users: User[];
  empreendimentos: Empreendimento[];
}

const initialDB: DBStructure = {
  users: [
    // Usuário padrão para teste
    { id: '1', nome: 'Administrador', email: 'admin@imoblagos.com.br', password: '123' }
  ],
  empreendimentos: []
};

export const DB = {
  getRaw(): DBStructure {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initialDB));
      return initialDB;
    }
    return JSON.parse(data);
  },

  saveRaw(data: DBStructure) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },

  // Operações de Usuário
  getUsers(): User[] {
    return this.getRaw().users;
  },

  createUser(user: Omit<User, 'id'>): User {
    const db = this.getRaw();
    const newUser = { ...user, id: uid() };
    db.users.push(newUser);
    this.saveRaw(db);
    return newUser;
  },

  findUserByEmail(email: string): User | undefined {
    return this.getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
  },

  // Operações de Empreendimento
  getEmpreendimentos(): Empreendimento[] {
    return this.getRaw().empreendimentos;
  },

  saveEmpreendimentos(emps: Empreendimento[]) {
    const db = this.getRaw();
    db.empreendimentos = emps;
    this.saveRaw(db);
  }
};
