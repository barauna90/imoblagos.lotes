
import { createClient } from '@supabase/supabase-js';
import { Empreendimento, Role, User, Imobiliaria } from '../types';

const SUPABASE_URL = 'https://orcvabwaoteznpxpygdl.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yY3ZhYndhb3Rlem5weHB5Z2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MjYzNjQsImV4cCI6MjA4NTMwMjM2NH0.sTE_EsEE1FAbzet3ImNHpMtXcq_I20WIIC69QHoCgUU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const getTempAdminClient = () => createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
});

export const SupabaseService = {
  async signUp(email: string, pass: string, nome: string, role: Role, imobiliaria?: string) {
    const adminClient = getTempAdminClient();
    const { data, error: authError } = await adminClient.auth.signUp({
      email,
      password: pass,
      options: { data: { nome, role, imobiliaria } }
    });
    
    if (authError) return { data: null, error: authError };

    if (data.user) {
      await this.updateProfile({
        id: data.user.id,
        nome,
        email,
        role,
        imobiliaria,
        empreendimentosVinculados: []
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

  async getProfile(id: string) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
    if (error || !data) return { data: null, error };
    return {
      data: {
        id: data.id,
        nome: data.nome,
        email: data.email,
        role: data.role,
        imobiliaria: data.imobiliaria,
        empreendimentosVinculados: data.empreendimentos_vinculados || []
      } as User,
      error: null
    };
  },

  async getProfiles() {
    const { data, error } = await supabase.from('profiles').select('*').order('nome');
    return { 
      data: (data || []).map(p => ({
        id: p.id,
        nome: p.nome,
        email: p.email,
        role: p.role,
        imobiliaria: p.imobiliaria,
        empreendimentosVinculados: p.empreendimentos_vinculados || []
      })) as User[], 
      error 
    };
  },

  async updateProfile(user: User) {
    const { error } = await supabase.from('profiles').upsert({ 
      id: user.id,
      nome: user.nome, 
      email: user.email,
      role: user.role,
      imobiliaria: user.imobiliaria,
      updated_at: new Date().toISOString(),
      empreendimentos_vinculados: user.empreendimentosVinculados || []
    });
    return { error };
  },

  // IMOBILIÁRIAS
  async getImobiliarias() {
    const { data, error } = await supabase.from('imobiliarias').select('*').order('nome');
    return { data: (data || []) as Imobiliaria[], error };
  },

  async saveImobiliaria(imob: Imobiliaria) {
    // Se não tiver ID (novo registro), remove o campo ID para o Supabase gerar automaticamente via gen_random_uuid()
    const payload = { ...imob };
    if (!payload.id) delete payload.id;
    
    const { error } = await supabase.from('imobiliarias').upsert(payload);
    return { error };
  },

  async deleteImobiliaria(id: string) {
    const { error } = await supabase.from('imobiliarias').delete().eq('id', id);
    return { error };
  },

  // EMPREENDIMENTOS
  async getEmpreendimentos() {
    const { data, error } = await supabase.from('empreendimentos').select('*').order('nome');
    return { 
      data: (data || []).map(item => ({
        id: item.id,
        nome: item.nome,
        lotes: Array.isArray(item.lotes) ? item.lotes : [],
        createdBy: item.user_id
      })) as Empreendimento[], 
      error 
    };
  },

  async saveEmpreendimento(emp: Empreendimento) {
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from('empreendimentos').upsert({ 
      id: emp.id, 
      nome: emp.nome, 
      lotes: emp.lotes, 
      user_id: session?.user?.id 
    });
    return { error };
  }
};
