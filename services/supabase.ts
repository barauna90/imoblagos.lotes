
import { createClient } from '@supabase/supabase-js';
import { Empreendimento, Role, User } from '../types';

const SUPABASE_URL = 'https://orcvabwaoteznpxpygdl.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yY3ZhYndhb3Rlem5weHB5Z2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MjYzNjQsImV4cCI6MjA4NTMwMjM2NH0.sTE_EsEE1FAbzet3ImNHpMtXcq_I20WIIC69QHoCgUU';

// Instância principal única
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Função para criar cliente administrativo temporário apenas quando necessário
// e sem persistência de sessão para não conflitar com a principal
const getTempAdminClient = () => createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

export const SupabaseService = {
  async signUp(email: string, pass: string, nome: string, role: Role) {
    const adminClient = getTempAdminClient();
    const { data, error: authError } = await adminClient.auth.signUp({
      email,
      password: pass,
      options: { data: { nome, role } }
    });
    
    if (authError) return { data: null, error: authError };

    if (data.user) {
      await this.updateProfile({
        id: data.user.id,
        nome,
        email,
        role,
        empreendimentosVinculados: []
      });
    }
    return { data, error: null };
  },

  async updateAuthUser(id: string, attributes: { email?: string; password?: string }) {
    const adminClient = getTempAdminClient();
    // Nota: admin.updateUserById exige Service Role Key, mas mantemos a estrutura
    const { data, error } = await adminClient.auth.admin.updateUserById(id, attributes);
    return { data, error };
  },

  async signIn(email: string, pass: string) {
    return await supabase.auth.signInWithPassword({ email, password: pass });
  },

  async signOut() {
    return await supabase.auth.signOut();
  },

  async getProfile(id: string) {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
      if (error) return { data: null, error };
      if (!data) return { data: null, error: null };
      
      return {
        data: {
          id: data.id,
          nome: data.nome,
          email: data.email,
          role: data.role,
          empreendimentosVinculados: Array.isArray(data.empreendimentos_vinculados) ? data.empreendimentos_vinculados : []
        } as User,
        error: null
      };
    } catch (err: any) {
      return { data: null, error: err };
    }
  },

  async getProfiles() {
    try {
      const { data, error } = await supabase.from('profiles').select('*').order('nome');
      if (error) throw error;

      const profiles = (data || []).map(p => ({
        id: p.id,
        nome: p.nome || 'Usuário',
        email: p.email || '',
        role: p.role || 'corretor',
        empreendimentosVinculados: Array.isArray(p.empreendimentos_vinculados) ? p.empreendimentos_vinculados : []
      }));

      return { data: profiles as User[], error: null };
    } catch (err: any) {
      console.error("Erro ao carregar equipe:", err);
      return { data: [], error: err };
    }
  },

  async updateProfile(user: User) {
    try {
      const payload: any = { 
        id: user.id,
        nome: user.nome, 
        email: user.email,
        role: user.role,
        updated_at: new Date().toISOString(),
        empreendimentos_vinculados: user.empreendimentosVinculados || []
      };

      const { error } = await supabase.from('profiles').upsert(payload);
      return { error };
    } catch (err: any) {
      return { error: err };
    }
  },

  async getEmpreendimentos() {
    try {
      const { data, error } = await supabase.from('empreendimentos').select('*').order('nome');
      if (error) throw error;

      const emps = (data || []).map(item => ({
        id: item.id,
        nome: item.nome,
        lotes: Array.isArray(item.lotes) ? item.lotes : [],
        createdBy: item.user_id
      }));

      return { data: emps as Empreendimento[], error: null };
    } catch (err: any) {
      console.error("Erro ao carregar empreendimentos:", err);
      return { data: [], error: err };
    }
  },

  async saveEmpreendimento(emp: Empreendimento) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return { error: new Error("Sessão expirada") };

      const { error } = await supabase.from('empreendimentos').upsert({ 
        id: emp.id, 
        nome: emp.nome, 
        lotes: emp.lotes, 
        user_id: session.user.id 
      });
      return { error };
    } catch (err: any) {
      return { error: err };
    }
  }
};
