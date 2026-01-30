
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Empreendimento, Lote, Status, LoteFormState, User, Role, AppSection, Imobiliaria 
} from './types';
import { 
  uid, formatBRL, toNumber, maskCurrency, maskCNPJ, maskPhone, getStats, nowLocalISO, calculateLoteTotal 
} from './utils/helpers';
import { SupabaseService, supabase } from './services/supabase';
import { exportToExcel } from './services/exportServices';
import { Modal, Button, Input, Select } from './components/UI';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<AppSection>('projetos');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [view, setView] = useState<'landing' | 'login' | 'app'>('landing');
  
  const [empreendimentos, setEmpreendimentos] = useState<Empreendimento[]>([]);
  const [equipe, setEquipe] = useState<User[]>([]);
  const [imobiliarias, setImobiliarias] = useState<Imobiliaria[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  
  const [filtroQuadra, setFiltroQuadra] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<Status | "">("");

  // Modais
  const [loteModalOpen, setLoteModalOpen] = useState(false);
  const [loteViewModalOpen, setLoteViewModalOpen] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userEditModalOpen, setUserEditModalOpen] = useState(false);
  const [imobModalOpen, setImobModalOpen] = useState(false);
  const [imobDeleteModalOpen, setImobDeleteModalOpen] = useState(false);
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [authError, setAuthError] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({ nome: '', email: '', password: '', role: 'corretor' as Role, imobiliaria: '' });
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingImob, setEditingImob] = useState<Imobiliaria | null>(null);
  const [imobForm, setImobForm] = useState<Imobiliaria>({ id: '', nome: '', cnpj: '', contato: '' });
  const [empNome, setEmpNome] = useState("");

  const [editingLote, setEditingLote] = useState<{ empId: string; loteId: string } | null>(null);
  const [viewingLote, setViewingLote] = useState<Lote | null>(null);
  const [loteForm, setLoteForm] = useState<LoteFormState>({
    quadra: "", numero: "", entrada: "", parcelaValor: "", parcelaPrazo: "",
    status: "disponivel", cliente: "", corretor: "", imobiliaria: "", dataVenda: "", reservaAte: "",
    frente: "", fundos: "", lateralDireita: "", lateralEsquerda: ""
  });

  const isMaster = currentUser?.role === 'master';
  const isCorretor = currentUser?.role === 'corretor';

  const Logo = ({ className = "", collapsed = false }: { className?: string, collapsed?: boolean }) => {
    if (collapsed) {
      return (
        <div className={`bg-black w-12 h-12 rounded-full flex flex-col items-center justify-center shadow-lg border-2 border-white ring-2 ring-black/10 overflow-hidden ${className}`}>
          <div className="flex flex-col items-center justify-center -space-y-1.5 translate-y-0.5">
            <span className="text-white text-[8px] font-black italic tracking-tighter uppercase leading-none">imob</span>
            <span className="text-[#f26522] text-[8px] font-black italic tracking-tighter uppercase leading-none">lagos</span>
          </div>
        </div>
      );
    }
    return (
      <div className={`bg-[#1a1a1a] px-4 py-2 rounded-full inline-flex items-center justify-center shadow-md border border-white/10 ${className}`}>
        <span className="text-white text-base font-black italic tracking-tighter">imob</span>
        <span className="text-[#f26522] text-base font-black italic tracking-tighter">lagos</span>
      </div>
    );
  };

  const syncProfile = useCallback(async (sessionUser: any): Promise<User> => {
    const { data: profile } = await SupabaseService.getProfile(sessionUser.id);
    if (profile) return profile;
    const newUserObj: User = { 
      id: sessionUser.id, 
      email: sessionUser.email || '', 
      nome: sessionUser.user_metadata?.nome || 'Usuário',
      role: sessionUser.user_metadata?.role || 'corretor', 
      imobiliaria: sessionUser.user_metadata?.imobiliaria || '',
      empreendimentosVinculados: []
    };
    await SupabaseService.updateProfile(newUserObj);
    return newUserObj;
  }, []);

  const loadData = useCallback(async () => {
    if (!currentUser) return;
    const [empsRes, teamRes, imobRes] = await Promise.all([
      SupabaseService.getEmpreendimentos(),
      isMaster ? SupabaseService.getProfiles() : Promise.resolve({ data: [] }),
      SupabaseService.getImobiliarias()
    ]);
    setEmpreendimentos(empsRes.data || []);
    setEquipe(teamRes.data || []);
    setImobiliarias(imobRes.data || []);
  }, [currentUser, isMaster]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        syncProfile(session.user).then(user => { 
          setCurrentUser(user); 
          setView('app');
          setIsLoading(false); 
        });
      } else {
        setIsLoading(false);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const user = await syncProfile(session.user);
        setCurrentUser(user);
        setView('app');
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setView('landing');
        setSelectedEmpId(null);
        setActiveSection('projetos');
      }
    });
    return () => subscription.unsubscribe();
  }, [syncProfile]);

  useEffect(() => { if (currentUser) loadData(); }, [currentUser, loadData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const { error } = await SupabaseService.signIn(loginForm.email, loginForm.password);
    if (error) setAuthError("Credenciais inválidas. Verifique seu e-mail e senha.");
  };

  const handleLogout = async () => {
    await SupabaseService.signOut();
  };

  const selectedEmp = useMemo(() => empreendimentos.find(e => e.id === selectedEmpId) || null, [empreendimentos, selectedEmpId]);

  const filteredLotes = useMemo(() => {
    if (!selectedEmp) return [];
    return selectedEmp.lotes.filter(l => {
      const matchQ = !filtroQuadra || l.quadra.toUpperCase().includes(filtroQuadra.toUpperCase());
      const matchS = !filtroStatus || l.status === filtroStatus;
      return matchQ && matchS;
    });
  }, [selectedEmp, filtroQuadra, filtroStatus]);

  const financialStats = useMemo(() => {
    const list = selectedEmp ? [selectedEmp] : empreendimentos;
    const sold = list.flatMap(e => e.lotes).filter(l => l.status === 'vendido');
    const vgvTotal = sold.reduce((acc, l) => acc + calculateLoteTotal(l), 0);
    const vgvEntrada = sold.reduce((acc, l) => acc + l.entrada, 0);
    const vgvFinanciado = vgvTotal - vgvEntrada;
    return { count: sold.length, vgvTotal, vgvEntrada, vgvFinanciado, soldItems: sold };
  }, [empreendimentos, selectedEmp]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white font-black uppercase text-[9px] tracking-widest animate-pulse">ImobLagos Carregando...</div>;

  // VIEW: LANDING PAGE (PROFISSIONAL)
  if (view === 'landing' && !currentUser) return (
    <div className="min-h-screen bg-white flex flex-col font-sans">
      {/* HEADER */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b z-50 h-20 px-6 sm:px-12 flex justify-between items-center">
        <Logo />
        <Button variant="secondary" onClick={() => setView('login')} className="h-10 px-6 text-[9px]">ACESSO RESTRITO</Button>
      </nav>

      {/* HERO SECTION */}
      <section className="pt-40 pb-24 px-6 sm:px-12 bg-slate-50 relative overflow-hidden">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative z-10">
          <div className="space-y-8">
            <div className="inline-block bg-[#f26522]/10 px-4 py-2 rounded-full border border-[#f26522]/20">
              <span className="text-[#f26522] text-[10px] font-black uppercase tracking-widest">Exclusividade em Vendas</span>
            </div>
            <h1 className="text-5xl sm:text-7xl font-black text-slate-900 leading-[1.1] tracking-tighter italic">
              ZERE O SEU <br />
              <span className="text-[#f26522]">EMPREENDIMENTO.</span>
            </h1>
            <p className="text-xl text-slate-500 font-medium max-w-lg leading-relaxed">
              Não apenas vendemos lotes. Nós entregamos um ecossistema completo de vendas exclusivas, marketing de performance e liquidação total de unidades.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <a href="https://wa.me/5522997459149" target="_blank" rel="noopener noreferrer" className="bg-[#25D366] text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-xl shadow-green-100 flex items-center justify-center gap-3">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.653a11.883 11.883 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                AGENDAR REUNIÃO
              </a>
              <Button variant="outline" className="h-14 px-8 border-slate-200" onClick={() => setView('login')}>ÁREA DO CORRETOR</Button>
            </div>
          </div>
          <div className="hidden lg:flex justify-center relative">
             <div className="bg-slate-900 w-[400px] h-[500px] rounded-[3rem] shadow-2xl rotate-3 flex flex-col p-8 text-white relative z-20 overflow-hidden">
                <Logo className="mb-8" />
                <div className="space-y-6">
                   <div className="h-1.5 w-12 bg-[#f26522] rounded-full"></div>
                   <h3 className="text-2xl font-black italic">Dashboard <br /> em Tempo Real</h3>
                   <div className="space-y-3">
                      <div className="bg-white/5 p-4 rounded-2xl flex justify-between">
                         <span className="text-[10px] font-black uppercase opacity-40">Status</span>
                         <span className="text-[10px] font-black uppercase text-emerald-400">92% Vendido</span>
                      </div>
                      <div className="bg-white/5 p-4 rounded-2xl flex justify-between">
                         <span className="text-[10px] font-black uppercase opacity-40">VGV Bruto</span>
                         <span className="text-[10px] font-black uppercase text-indigo-400">R$ 14.2M</span>
                      </div>
                   </div>
                </div>
                <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-[#f26522] rounded-full blur-3xl opacity-20"></div>
             </div>
             <div className="absolute inset-0 bg-indigo-600/5 blur-[120px] rounded-full"></div>
          </div>
        </div>
        <div className="absolute bottom-0 right-0 w-1/3 h-1/2 bg-[#f26522]/5 blur-[120px] rounded-full -mr-40 -mb-40"></div>
      </section>

      {/* SERVICES SECTION */}
      <section className="py-24 px-6 sm:px-12 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 space-y-4">
             <h2 className="text-[10px] font-black text-[#f26522] uppercase tracking-[0.4em]">Nosso Diferencial</h2>
             <h3 className="text-4xl font-black text-slate-900 italic tracking-tighter">O Ciclo Completo do Sucesso.</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="p-10 bg-slate-50 rounded-[2.5rem] border border-transparent hover:border-[#f26522]/20 hover:bg-white transition-all group">
              <div className="w-12 h-12 bg-[#f26522] rounded-2xl flex items-center justify-center text-white mb-8 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
              </div>
              <h4 className="text-lg font-black text-slate-900 mb-4 uppercase">Material de Vendas</h4>
              <p className="text-slate-500 font-medium leading-relaxed">Produzimos todo o conteúdo criativo, do 3D ao material impresso, garantindo que o seu produto brilhe no mercado.</p>
            </div>
            <div className="p-10 bg-slate-50 rounded-[2.5rem] border border-transparent hover:border-[#f26522]/20 hover:bg-white transition-all group">
              <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mb-8 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
              </div>
              <h4 className="text-lg font-black text-slate-900 mb-4 uppercase">Marketing de Performance</h4>
              <p className="text-slate-500 font-medium leading-relaxed">Campanhas segmentadas em Google e Meta Ads para atrair leads qualificados e prontos para fechar negócio.</p>
            </div>
            <div className="p-10 bg-slate-50 rounded-[2.5rem] border border-transparent hover:border-[#f26522]/20 hover:bg-white transition-all group">
              <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white mb-8 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>
              <h4 className="text-lg font-black text-slate-900 mb-4 uppercase">Venda Exclusiva</h4>
              <p className="text-slate-500 font-medium leading-relaxed">Trabalhamos com exclusividade para manter a unidade de discurso e acelerar a velocidade de venda total.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-24 px-6 sm:px-12 bg-slate-900 text-white text-center overflow-hidden relative">
         <div className="max-w-4xl mx-auto space-y-8 relative z-10">
            <h3 className="text-4xl sm:text-5xl font-black italic tracking-tighter">Pronto para transformar sua gleba em um <span className="text-[#f26522]">caso de sucesso?</span></h3>
            <p className="text-slate-400 text-lg font-medium">Agende agora uma consultoria estratégica sem custos.</p>
            <div className="pt-4">
               <a href="https://wa.me/5522997459149" target="_blank" rel="noopener noreferrer" className="inline-flex bg-[#f26522] text-white px-12 py-5 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-[#e05a1b] hover:scale-105 transition-all shadow-2xl shadow-orange-900/20 gap-3">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.653a11.883 11.883 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                  FALAR COM ESPECIALISTA
               </a>
            </div>
         </div>
         <div className="absolute top-0 left-0 w-64 h-64 bg-indigo-600/10 blur-[100px] rounded-full -ml-32 -mt-32"></div>
         <div className="absolute bottom-0 right-0 w-64 h-64 bg-[#f26522]/10 blur-[100px] rounded-full -mr-32 -mb-32"></div>
      </section>

      {/* FOOTER */}
      <footer className="py-12 px-6 sm:px-12 bg-white border-t">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <Logo />
          <div className="flex gap-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <button onClick={() => setView('login')} className="hover:text-slate-900">Acesso Restrito</button>
            <a href="#" className="hover:text-slate-900">Privacidade</a>
            <a href="#" className="hover:text-slate-900">Termos</a>
          </div>
          <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
            © 2024 ImobLagos - Soluções Imobiliárias
          </p>
        </div>
      </footer>
    </div>
  );

  // VIEW: LOGIN
  if (view === 'login' && !currentUser) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl w-full max-w-sm border-t-8 border-[#f26522]">
        <div className="flex flex-col items-center mb-8">
          <button onClick={() => setView('landing')} className="mb-6 hover:scale-105 transition-transform">
             <Logo className="scale-110" />
          </button>
          <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Painel de Controle</h2>
        </div>
        {authError && <p className="mb-4 text-rose-500 text-center font-bold text-xs bg-rose-50 p-3 rounded-xl border border-rose-100">{authError}</p>}
        <form onSubmit={handleLogin} className="space-y-4">
          <Input label="E-MAIL" type="email" value={loginForm.email} onChange={e => setLoginForm({...loginForm, email: e.target.value})} required placeholder="seu@email.com" />
          <Input label="SENHA" type="password" value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} required placeholder="••••••••" />
          <Button className="w-full h-12 mt-4 text-[10px]">ENTRAR NO PAINEL</Button>
          <button type="button" onClick={() => setView('landing')} className="w-full text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 pt-2">Voltar ao Início</button>
        </form>
      </div>
    </div>
  );

  // VIEW: MAIN APP (Dashboard)
  return (
    <div className="flex min-h-screen bg-[#f8fafc]">
      {/* SIDEBAR */}
      <aside className={`bg-white border-r transition-all duration-300 flex flex-col sticky top-0 h-screen z-50 shadow-sm ${isSidebarOpen ? 'w-60' : 'w-24'}`}>
        <div className="p-4 flex items-center justify-between border-b h-[72px] shrink-0">
          <div className="flex-1 flex justify-center">
             <Logo collapsed={!isSidebarOpen} />
          </div>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 absolute -right-3 top-8 bg-white border shadow-sm z-10">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={isSidebarOpen ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} />
            </svg>
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-2 overflow-y-auto custom-scrollbar pt-6">
          {[
            { id: 'projetos', label: 'Projetos', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
            { id: 'financeiro', label: 'Financeiro', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', hide: isCorretor },
            { id: 'imobiliarias', label: 'Parceiros', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z', hide: !isMaster },
            { id: 'equipe', label: 'Equipe', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', hide: !isMaster },
          ].map(item => !item.hide && (
            <button 
              key={item.id} 
              onClick={() => setActiveSection(item.id as AppSection)}
              className={`w-full flex items-center gap-4 p-3.5 rounded-2xl transition-all group ${activeSection === item.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-900'}`}
            >
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={item.icon} />
              </svg>
              {isSidebarOpen && <span className="font-black text-[10px] uppercase tracking-widest leading-none">{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t space-y-2">
           <div className={`flex items-center gap-3 p-3 rounded-2xl bg-slate-50 mb-2 ${!isSidebarOpen && 'justify-center'}`}>
              <div className="w-8 h-8 rounded-full bg-[#f26522] flex items-center justify-center text-white font-black text-xs">
                {currentUser?.nome.charAt(0)}
              </div>
              {isSidebarOpen && (
                <div className="flex flex-col truncate">
                  <span className="text-[10px] font-black text-slate-900 truncate uppercase">{currentUser?.nome}</span>
                  <span className="text-[8px] font-bold text-slate-400 truncate uppercase">{currentUser?.role}</span>
                </div>
              )}
           </div>
           <button onClick={() => setLogoutConfirmOpen(true)} className={`w-full flex items-center gap-4 p-3.5 rounded-2xl text-rose-500 hover:bg-rose-50 transition-all ${!isSidebarOpen && 'justify-center'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              {isSidebarOpen && <span className="font-black text-[10px] uppercase tracking-widest leading-none">Desconectar</span>}
           </button>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="h-[72px] bg-white border-b px-8 flex items-center justify-between shrink-0 sticky top-0 z-40 shadow-sm">
          <div className="flex items-center gap-4">
            <h1 className="text-sm font-black text-slate-900 uppercase tracking-widest italic leading-none">
              {activeSection === 'projetos' ? 'Gestão de Loteamentos' : 
               activeSection === 'financeiro' ? 'Controladoria Financeira' : 
               activeSection === 'imobiliarias' ? 'Parceiros Comerciais' : 'Acessos e Equipe'}
            </h1>
            <div className="h-4 w-px bg-slate-200"></div>
            <select 
              value={selectedEmpId || ""} 
              onChange={e => setSelectedEmpId(e.target.value || null)}
              className="bg-slate-50 border-none text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-lg text-indigo-600 outline-none focus:ring-2 ring-indigo-500/20"
            >
              <option value="">FILTRO GERAL</option>
              {empreendimentos.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
             <div className="flex items-center gap-2 bg-emerald-50 px-4 py-1.5 rounded-full border border-emerald-100">
               <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
               <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Sistema Ativo</span>
             </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-slate-50/30">
          {activeSection === 'projetos' && (
            <div className="space-y-6">
              {!selectedEmpId ? (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-black text-slate-900 uppercase italic">Meus Loteamentos</h2>
                    {isMaster && <Button onClick={() => setEmpModalOpen(true)} className="h-10 px-6 text-[9px]">+ CADASTRAR PROJETO</Button>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {empreendimentos.map(emp => (
                      <div key={emp.id} className="bg-white p-6 rounded-[2rem] border shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group" onClick={() => setSelectedEmpId(emp.id)}>
                        <h3 className="text-base font-black text-slate-900 mb-6 uppercase truncate group-hover:text-indigo-600 transition-colors">{emp.nome}</h3>
                        <div className="grid grid-cols-3 gap-3">
                           <div className="bg-emerald-50 p-3 rounded-2xl text-center"><p className="text-[8px] font-black text-emerald-600 uppercase mb-1">Livres</p><p className="font-black text-sm text-emerald-700">{getStats(emp.lotes).disponivel}</p></div>
                           <div className="bg-amber-50 p-3 rounded-2xl text-center"><p className="text-[8px] font-black text-amber-600 uppercase mb-1">Res.</p><p className="font-black text-sm text-amber-700">{getStats(emp.lotes).reservado}</p></div>
                           <div className="bg-rose-50 p-3 rounded-2xl text-center"><p className="text-[8px] font-black text-rose-600 uppercase mb-1">Vend.</p><p className="font-black text-sm text-rose-700">{getStats(emp.lotes).vendido}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-6 pb-12">
                  <div className="bg-white p-6 rounded-[2.5rem] border shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="flex flex-col">
                      <button onClick={() => setSelectedEmpId(null)} className="text-indigo-600 font-black text-[9px] uppercase tracking-widest mb-2 flex items-center gap-2">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" /></svg>
                        VOLTAR AOS PROJETOS
                      </button>
                      <h2 className="text-2xl font-black text-slate-900 uppercase italic">{selectedEmp?.nome}</h2>
                    </div>
                    {isMaster && (
                      <Button onClick={() => { 
                        setEditingLote(null); 
                        setLoteForm({quadra: "", numero: "", entrada: "", parcelaValor: "", parcelaPrazo: "", status: "disponivel", cliente: "", corretor: "", imobiliaria: "", dataVenda: "", reservaAte: "", frente: "", fundos: "", lateralDireita: "", lateralEsquerda: "" }); 
                        setLoteModalOpen(true); 
                      }} className="h-11 px-8 text-[9px]">+ NOVO LOTE</Button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-4 items-end bg-white p-5 rounded-[2rem] border shadow-sm">
                    <div className="flex-1 min-w-[150px]"><Input label="FILTRAR QUADRA" value={filtroQuadra} onChange={e => setFiltroQuadra(e.target.value)} /></div>
                    <div className="flex-1 min-w-[150px]"><Select label="DISPONIBILIDADE" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as Status)}><option value="">TODOS OS LOTES</option><option value="disponivel">SOMENTE LIVRES</option><option value="reservado">SOMENTE RESERVADOS</option><option value="vendido">SOMENTE VENDIDOS</option></Select></div>
                    <Button variant="outline" className="h-12 px-6 text-[9px]" onClick={() => selectedEmp && exportToExcel(selectedEmp)}>EXPORTAR XLSX</Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {filteredLotes.map(lote => (
                      <div key={lote.id} className="bg-white p-6 rounded-[2rem] border shadow-sm flex flex-col justify-between hover:border-indigo-400 hover:shadow-lg transition-all">
                        <div className="mb-6">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">QUADRA {lote.quadra}</p>
                              <p className="text-lg font-black text-slate-900 uppercase">LOTE {lote.numero}</p>
                            </div>
                            <div className={`w-3 h-3 rounded-full shadow-sm ring-4 ring-offset-2 ${lote.status === 'disponivel' ? 'bg-emerald-400 ring-emerald-50' : lote.status === 'reservado' ? 'bg-amber-400 ring-amber-50' : 'bg-rose-400 ring-rose-50'}`}></div>
                          </div>
                          <div className="space-y-2 bg-slate-50 p-4 rounded-2xl text-[10px]">
                             <p className="font-black text-indigo-500 uppercase tracking-widest">Sinal: <span className="text-slate-900">{formatBRL(lote.entrada)}</span></p>
                             <p className="font-bold text-slate-600 italic">{lote.parcelaPrazo}x de {formatBRL(lote.parcelaValor)}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setViewingLote(lote); setLoteViewModalOpen(true); }} className="flex-1 bg-slate-50 py-3 rounded-xl text-[9px] font-black uppercase text-slate-500 hover:bg-slate-100 transition-colors">Detalhes</button>
                          {isMaster && (
                            <button onClick={() => {
                                setEditingLote({ empId: selectedEmpId!, loteId: lote.id });
                                setLoteForm({
                                  quadra: lote.quadra, numero: lote.numero, 
                                  entrada: maskCurrency(lote.entrada.toString().replace('.', '')),
                                  parcelaValor: maskCurrency(lote.parcelaValor.toString().replace('.', '')),
                                  parcelaPrazo: lote.parcelaPrazo.toString(),
                                  status: lote.status, cliente: lote.cliente, corretor: lote.corretor,
                                  imobiliaria: lote.imobiliaria || "", dataVenda: lote.dataVenda || "", reservaAte: lote.reservaAte,
                                  frente: lote.dimensoes?.frente || "", fundos: lote.dimensoes?.fundos || "",
                                  lateralDireita: lote.dimensoes?.lateralDireita || "", lateralEsquerda: lote.dimensoes?.lateralEsquerda || ""
                                });
                                setLoteModalOpen(true);
                              }} className="flex-1 bg-slate-900 py-3 rounded-xl text-[9px] font-black uppercase text-white hover:bg-black transition-colors">Editar</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSection === 'financeiro' && !isCorretor && (
            <div className="space-y-8 animate-in slide-in-from-bottom duration-500">
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
                    <p className="text-[10px] font-black opacity-40 uppercase mb-2 tracking-[0.2em]">VGV Total Consolidado</p>
                    <p className="text-3xl font-black italic">{formatBRL(financialStats.vgvTotal)}</p>
                    <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -mr-12 -mt-12"></div>
                  </div>
                  <div className="bg-white p-8 rounded-[2.5rem] border border-emerald-100 shadow-sm">
                    <p className="text-[10px] font-black text-emerald-500 uppercase mb-2 tracking-[0.2em]">Recebido (Entradas)</p>
                    <p className="text-2xl font-black text-slate-900">{formatBRL(financialStats.vgvEntrada)}</p>
                  </div>
                  <div className="bg-white p-8 rounded-[2.5rem] border border-amber-100 shadow-sm">
                    <p className="text-[10px] font-black text-amber-500 uppercase mb-2 tracking-[0.2em]">Financiamento em Carteira</p>
                    <p className="text-2xl font-black text-slate-900">{formatBRL(financialStats.vgvFinanciado)}</p>
                  </div>
                  <div className="bg-white p-8 rounded-[2.5rem] border shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase mb-2 tracking-[0.2em]">Unidades Contratadas</p>
                    <p className="text-2xl font-black text-slate-900">{financialStats.count}</p>
                  </div>
               </div>
            </div>
          )}
        </div>
      </main>

      {/* MODALS REMAIN THE SAME... */}
      <Modal isOpen={logoutConfirmOpen} onClose={() => setLogoutConfirmOpen(false)} title="Sair do Sistema">
        <div className="space-y-6 text-center">
          <p className="font-bold text-slate-500 text-sm italic">Deseja realmente encerrar sua sessão de trabalho?</p>
          <div className="flex flex-col gap-3">
            <Button variant="danger" className="w-full h-12" onClick={handleLogout}>SIM, DESCONECTAR</Button>
            <Button variant="ghost" className="w-full h-10" onClick={() => setLogoutConfirmOpen(false)}>CANCELAR</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={empModalOpen} onClose={() => setEmpModalOpen(false)} title="Novo Loteamento">
        <div className="space-y-4">
          <Input label="NOME DO EMPREENDIMENTO" value={empNome} onChange={e => setEmpNome(e.target.value.toUpperCase())} placeholder="EX: RESIDENCIAL LAGOS I" />
          <Button className="w-full h-12 mt-2 text-[10px]" onClick={async () => { 
             if (!empNome) return; 
             await SupabaseService.saveEmpreendimento({ id: uid(), nome: empNome, lotes: [] }); 
             await loadData(); 
             setEmpModalOpen(false); 
          }}>CRIAR PROJETO</Button>
        </div>
      </Modal>

      <Modal isOpen={loteModalOpen} onClose={() => setLoteModalOpen(false)} title={editingLote ? "Ficha de Edição" : "Registrar Nova Unidade"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="QUADRA" value={loteForm.quadra} onChange={e => setLoteForm({...loteForm, quadra: e.target.value.toUpperCase()})} />
            <Input label="NÚMERO" value={loteForm.numero} onChange={e => setLoteForm({...loteForm, numero: e.target.value})} />
          </div>
          <Input label="SINAL / ENTRADA (R$)" value={loteForm.entrada} onChange={e => setLoteForm({...loteForm, entrada: maskCurrency(e.target.value)})} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="VALOR PARCELA (R$)" value={loteForm.parcelaValor} onChange={e => setLoteForm({...loteForm, parcelaValor: maskCurrency(e.target.value)})} />
            <Input label="PRAZO (M)" type="number" value={loteForm.parcelaPrazo} onChange={e => setLoteForm({...loteForm, parcelaPrazo: e.target.value})} />
          </div>
          <Select label="STATUS ATUAL" value={loteForm.status} onChange={e => {
            const st = e.target.value as Status;
            setLoteForm({ ...loteForm, status: st, dataVenda: st === 'vendido' ? nowLocalISO() : "" });
          }}>
            <option value="disponivel">DISPONÍVEL</option>
            <option value="reservado">RESERVADO</option>
            <option value="vendido">VENDIDO</option>
          </Select>
          <Button className="w-full h-12 text-[10px] mt-2" onClick={async () => {
             const updatedLote: Lote = {
               id: editingLote ? editingLote.loteId : uid(),
               quadra: loteForm.quadra.toUpperCase(),
               numero: loteForm.numero,
               entrada: toNumber(loteForm.entrada),
               parcelaValor: toNumber(loteForm.parcelaValor),
               parcelaPrazo: parseInt(loteForm.parcelaPrazo) || 0,
               status: loteForm.status,
               cliente: loteForm.cliente,
               corretor: currentUser?.nome || "",
               imobiliaria: loteForm.imobiliaria,
               dataVenda: loteForm.dataVenda,
               reservaAte: loteForm.reservaAte,
               dimensoes: { frente: loteForm.frente, fundos: loteForm.fundos, lateralDireita: loteForm.lateralDireita, lateralEsquerda: loteForm.lateralEsquerda }
             };
             const newList = editingLote ? selectedEmp!.lotes.map(l => l.id === editingLote.loteId ? updatedLote : l) : [...selectedEmp!.lotes, updatedLote];
             await SupabaseService.saveEmpreendimento({...selectedEmp!, lotes: newList});
             await loadData(); setLoteModalOpen(false);
          }}>GRAVAR ALTERAÇÕES</Button>
        </div>
      </Modal>
    </div>
  );
};

export default App;
