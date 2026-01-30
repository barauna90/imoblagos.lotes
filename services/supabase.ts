
import { createClient } from '@supabase/supabase-js';
import { Empreendimento, Role, User } from '../types';

const SUPABASE_URL = 'https://orcvabwaoteznpxpygdl.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yY3ZhYndhb3Rlem5weHB5Z2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MjYzNjQsImV4cCI6MjA4NTMwMjM2NH0.sTE_EsEE1FAbzet3ImNHpMtXcq_I20WIIC69QHoCgUU';

// Cliente principal para operações autenticadas
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Cliente auxiliar para criação de usuários sem derrubar a sessão do Admin
const createAuthClient = () => createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

export const SupabaseService = {
  async signUp(email: string, pass: string, nome: string, role: Role, empreendimentosVinculados: string[] = []) {
    const authClient = createAuthClient();
    
    const { data, error } = await authClient.auth.signUp({
      email,
      password: pass,
      options: { 
        data: { nome, role, empreendimentosVinculados },
      }
    });
    
    if (error) return { data: null, error };

    if (data.user) {
      // Criação compulsória do perfil na tabela pública
      await this.updateProfile({
        id: data.user.id,
        nome,
        email,
        role,
        empreendimentosVinculados
      });
    }
    
    return { data, error: null };
  },

  async signIn(email: string, pass: string) {
    return await supabase.auth.signInWithPassword({ email, password: pass });
  },

  async signOut() {
    return await supabase.auth.signOut();
  },

  async getProfiles() {
    // Busca na tabela public.profiles. Se retornar vazio, verifique o RLS no dashboard do Supabase.
    const { data, error } = await supabase
      .from('profiles')
      .select('*');
    
    if (error) {
      console.error("Erro ao buscar perfis:", error.message);
      return { data: [], error };
    }

    const mapped = (data || []).map(p => ({
      id: p.id,
      nome: p.nome || 'Sem Nome',
      email: p.email || 'Sem Email',
      role: p.role || 'corretor',
      empreendimentosVinculados: p.empreendimentos_vinculados || []
    }));

    return { data: mapped as User[], error: null };
  },

  async updateProfile(user: User) {
    const { error } = await supabase
      .from('profiles')
      .upsert({ 
        id: user.id,
        nome: user.nome, 
        email: user.email,
        role: user.role,
        empreendimentos_vinculados: user.empreendimentosVinculados || [],
        updated_at: new Date().toISOString()
      });
    return { error };
  },

  async getEmpreendimentos() {
    const { data, error } = await supabase
      .from('empreendimentos')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) return { data: [], error };

    return { 
      data: (data || []).map(item => ({
        id: item.id,
        nome: item.nome,
        lotes: Array.isArray(item.lotes) ? item.lotes : [],
        createdBy: item.user_id
      })) as Empreendimento[], 
      error: null 
    };
  },

  async saveEmpreendimento(emp: Empreendimento) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return { error: new Error("Sessão expirada") };

    const { error } = await supabase.from('empreendimentos').upsert({ 
      id: emp.id, 
      nome: emp.nome, 
      lotes: emp.lotes, 
      user_id: session.user.id 
    });
    return { error };
  }
};
