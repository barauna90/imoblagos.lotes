
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

  const Logo = ({ className = "" }: { className?: string }) => (
    <div className={`bg-[#1a1a1a] px-3 py-1.5 rounded-full inline-flex items-center justify-center shadow-md border border-white/5 ${className}`}>
      <span className="text-white text-sm font-black italic tracking-tighter">imob</span>
      <span className="text-[#f26522] text-sm font-black italic tracking-tighter">lagos</span>
    </div>
  );

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
      (isMaster || currentUser.role === 'gestor') ? SupabaseService.getProfiles() : Promise.resolve({ data: [] }),
      SupabaseService.getImobiliarias()
    ]);
    setEmpreendimentos(empsRes.data || []);
    setEquipe(teamRes.data || []);
    setImobiliarias(imobRes.data || []);
  }, [currentUser, isMaster]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) syncProfile(session.user).then(user => { setCurrentUser(user); setIsLoading(false); });
      else setIsLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const user = await syncProfile(session.user);
        setCurrentUser(user);
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setSelectedEmpId(null);
        setActiveSection('projetos');
      }
    });
    return () => subscription.unsubscribe();
  }, [syncProfile]);

  useEffect(() => { if (currentUser) loadData(); }, [currentUser, loadData]);

  // Segurança: Se um corretor tentar acessar financeiro, volta para projetos
  useEffect(() => {
    if (isCorretor && activeSection === 'financeiro') {
      setActiveSection('projetos');
    }
  }, [isCorretor, activeSection]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const { error } = await SupabaseService.signIn(loginForm.email, loginForm.password);
    if (error) setAuthError("Dados inválidos.");
  };

  const handleLogout = async () => {
    await SupabaseService.signOut();
    setCurrentUser(null);
    setLogoutConfirmOpen(false);
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

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white font-black uppercase text-[9px] tracking-widest animate-pulse">Lagos System...</div>;

  if (!currentUser) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-[2rem] shadow-xl w-full max-w-sm border">
        <div className="flex flex-col items-center mb-6">
          <Logo className="scale-110 mb-6" />
          <h2 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Controle de Acesso</h2>
        </div>
        {authError && <p className="mb-4 text-rose-500 text-center font-bold text-xs bg-rose-50 p-2 rounded-lg">{authError}</p>}
        <form onSubmit={handleLogin} className="space-y-3">
          <Input label="E-MAIL" type="email" value={loginForm.email} onChange={e => setLoginForm({...loginForm, email: e.target.value})} required />
          <Input label="SENHA" type="password" value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} required />
          <Button className="w-full h-11 mt-2 text-[10px]">ENTRAR</Button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#f8fafc]">
      {/* SIDEBAR COMPACTA */}
      <aside className={`bg-white border-r transition-all duration-300 flex flex-col sticky top-0 h-screen z-50 shadow-sm ${isSidebarOpen ? 'w-56' : 'w-20'}`}>
        <div className="p-3 flex items-center justify-between border-b h-[60px] shrink-0">
          {isSidebarOpen ? <Logo className="scale-90" /> : <div className="bg-[#1a1a1a] w-10 h-10 rounded-xl flex items-center justify-center text-[#f26522] font-black italic shadow-md">i</div>}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={isSidebarOpen ? "M11 19l-7-7 7-7m8 14l-7-7 7-7" : "M13 5l7 7-7 7M5 5l7 7-7 7"} />
            </svg>
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-1.5 overflow-y-auto custom-scrollbar">
          {[
            { id: 'projetos', label: 'Projetos', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
            { id: 'financeiro', label: 'Financeiro', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', hide: isCorretor },
            { id: 'imobiliarias', label: 'Parceiros', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', hide: !isMaster && currentUser?.role !== 'gestor' },
            { id: 'equipe', label: 'Acessos', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z', hide: !isMaster },
          ].map(item => !item.hide && (
            <button 
              key={item.id} 
              onClick={() => setActiveSection(item.id as AppSection)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all group ${activeSection === item.id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:bg-slate-50'}`}
            >
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={item.icon} />
              </svg>
              {isSidebarOpen && <span className="font-bold text-[10px] uppercase tracking-widest">{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t space-y-2">
           <button onClick={() => setLogoutConfirmOpen(true)} className={`w-full flex items-center gap-3 p-3 rounded-xl text-rose-500 hover:bg-rose-50 transition-all`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              {isSidebarOpen && <span className="font-bold text-[10px] uppercase tracking-widest">Sair</span>}
           </button>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* HEADER REDUZIDO */}
        <header className="h-[60px] bg-white border-b px-4 sm:px-6 flex items-center justify-between shrink-0 sticky top-0 z-40">
          <div className="flex items-center gap-4">
            {!isSidebarOpen && <Logo className="scale-75 origin-left" />}
            <div className="flex flex-col">
               <h1 className="text-[9px] font-black text-slate-900 uppercase tracking-widest italic leading-none">
                 {activeSection === 'projetos' ? 'Gestão de Lotes' : 
                  activeSection === 'financeiro' ? 'Financeiro' : 
                  activeSection === 'imobiliarias' ? 'Parceiros' : 'Usuários'}
               </h1>
               <div className="mt-1 flex items-center gap-2">
                  <span className="text-[7px] font-black text-slate-400 uppercase">PROJETO:</span>
                  <select 
                    value={selectedEmpId || ""} 
                    onChange={e => setSelectedEmpId(e.target.value || null)}
                    className="bg-slate-50 border-none text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded text-indigo-600 outline-none"
                  >
                    <option value="">FILTRO GERAL</option>
                    {empreendimentos.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                  </select>
               </div>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
            <span className="text-[8px] font-black text-emerald-700 uppercase tracking-widest">Conectado</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
          {activeSection === 'projetos' && (
            <div className="space-y-4">
              {!selectedEmpId ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h2 className="text-base font-black text-slate-900 uppercase">Loteamentos</h2>
                    {isMaster && <Button onClick={() => setEmpModalOpen(true)} className="h-8 px-3 text-[8px]">+ PROJETO</Button>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {empreendimentos.map(emp => (
                      <div key={emp.id} className="bg-white p-4 rounded-2xl border shadow-sm hover:shadow-md transition-all cursor-pointer" onClick={() => setSelectedEmpId(emp.id)}>
                        <h3 className="text-sm font-black text-slate-900 mb-3 uppercase truncate">{emp.nome}</h3>
                        <div className="grid grid-cols-3 gap-2">
                           <div className="bg-emerald-50 p-1.5 rounded-xl text-center"><p className="text-[6px] font-black text-emerald-600 uppercase mb-0.5">Livre</p><p className="font-black text-xs text-emerald-700">{getStats(emp.lotes).disponivel}</p></div>
                           <div className="bg-amber-50 p-1.5 rounded-xl text-center"><p className="text-[6px] font-black text-amber-600 uppercase mb-0.5">Res.</p><p className="font-black text-xs text-amber-700">{getStats(emp.lotes).reservado}</p></div>
                           <div className="bg-rose-50 p-1.5 rounded-xl text-center"><p className="text-[6px] font-black text-rose-600 uppercase mb-0.5">Vend.</p><p className="font-black text-xs text-rose-700">{getStats(emp.lotes).vendido}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 pb-8">
                  <div className="bg-white p-4 rounded-2xl border shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div className="flex flex-col">
                      <button onClick={() => setSelectedEmpId(null)} className="text-indigo-600 font-black text-[8px] uppercase tracking-widest mb-1">← VOLTAR</button>
                      <h2 className="text-lg font-black text-slate-900 uppercase">{selectedEmp?.nome}</h2>
                    </div>
                    {isMaster && <Button onClick={() => { setEditingLote(null); setLoteForm({quadra: "", numero: "", entrada: "", parcelaValor: "", parcelaPrazo: "", status: "disponivel", cliente: "", corretor: "", imobiliaria: "", dataVenda: "", reservaAte: "", frente: "", fundos: "", lateralDireita: "", lateralEsquerda: "" }); setLoteModalOpen(true); }} className="h-9 px-4 text-[8px] w-full md:w-auto">+ NOVO LOTE</Button>}
                  </div>

                  <div className="flex flex-wrap gap-2 items-end bg-white p-3 rounded-2xl border shadow-sm">
                    <div className="flex-1 min-w-[100px]"><Input label="QUADRA" value={filtroQuadra} onChange={e => setFiltroQuadra(e.target.value)} /></div>
                    <div className="flex-1 min-w-[100px]"><Select label="SITUAÇÃO" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as Status)}><option value="">TODOS</option><option value="disponivel">LIVRE</option><option value="reservado">RESERVADO</option><option value="vendido">VENDIDO</option></Select></div>
                    <Button variant="outline" className="h-9 px-3 text-[8px]" onClick={() => selectedEmp && exportToExcel(selectedEmp)}>XLSX</Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {filteredLotes.map(lote => (
                      <div key={lote.id} className="bg-white p-4 rounded-2xl border shadow-sm flex flex-col justify-between hover:border-indigo-400 transition-all">
                        <div className="mb-3">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Q{lote.quadra}</p>
                              <p className="text-sm font-black text-slate-900 uppercase">LOTE {lote.numero}</p>
                            </div>
                            <div className={`w-2 h-2 rounded-full ${lote.status === 'disponivel' ? 'bg-emerald-400' : lote.status === 'reservado' ? 'bg-amber-400' : 'bg-rose-400'}`}></div>
                          </div>
                          <div className="space-y-1 bg-slate-50 p-2 rounded-xl text-[9px]">
                             <p className="font-black text-indigo-500 uppercase tracking-widest">Sinal: <span className="text-slate-900">{formatBRL(lote.entrada)}</span></p>
                             <p className="font-bold text-slate-600">{lote.parcelaPrazo}x {formatBRL(lote.parcelaValor)}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setViewingLote(lote); setLoteViewModalOpen(true); }} className="flex-1 bg-slate-50 py-2 rounded-lg text-[8px] font-black uppercase text-slate-500 hover:bg-slate-100">Ver</button>
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
                              }} className="flex-1 bg-indigo-600 py-2 rounded-lg text-[8px] font-black uppercase text-white hover:bg-indigo-700">Editar</button>
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
            <div className="space-y-4 animate-in slide-in-from-bottom duration-300">
              <h2 className="text-base font-black text-slate-900 uppercase">Controladoria</h2>
              <p className="text-[8px] font-bold text-slate-400 uppercase -mt-3">{selectedEmp ? `Projeto: ${selectedEmp.nome}` : 'Geral (Consolidado)'}</p>
              
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <div className="bg-slate-900 p-4 rounded-xl shadow-sm text-white"><p className="text-[7px] font-black opacity-50 uppercase mb-1">VGV Total</p><p className="text-sm font-black italic">{formatBRL(financialStats.vgvTotal)}</p></div>
                <div className="bg-white p-4 rounded-xl border border-emerald-100"><p className="text-[7px] font-black text-emerald-500 uppercase mb-1">Entradas</p><p className="text-sm font-black text-slate-900">{formatBRL(financialStats.vgvEntrada)}</p></div>
                <div className="bg-white p-4 rounded-xl border border-amber-100"><p className="text-[7px] font-black text-amber-500 uppercase mb-1">Financiado</p><p className="text-sm font-black text-slate-900">{formatBRL(financialStats.vgvFinanciado)}</p></div>
                <div className="bg-white p-4 rounded-xl border"><p className="text-[7px] font-black text-slate-400 uppercase mb-1">Vendas</p><p className="text-sm font-black text-slate-900">{financialStats.count}</p></div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-2xl border">
                  <h3 className="text-[10px] font-black uppercase mb-3 border-b pb-2">Recebíveis de Sinal</h3>
                  <div className="space-y-1.5">
                    {financialStats.soldItems.map(l => (
                      <div key={l.id} className="flex justify-between items-center p-2.5 bg-slate-50 rounded-lg">
                         <div className="truncate pr-3 font-black text-[8px] text-slate-900 uppercase">Q{l.quadra} L{l.numero} • {l.cliente}</div>
                         <p className="text-[10px] font-black text-emerald-600 shrink-0">{formatBRL(l.entrada)}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border">
                  <h3 className="text-[10px] font-black uppercase mb-3 border-b pb-2">Fluxo de Carteira</h3>
                  <div className="space-y-1.5">
                    {financialStats.soldItems.map(l => (
                      <div key={l.id} className="flex justify-between items-center p-2.5 bg-slate-50 rounded-lg">
                         <div className="truncate pr-3 font-black text-[8px] text-slate-900 uppercase">Q{l.quadra} L{l.numero} • {l.parcelaPrazo}x</div>
                         <p className="text-[10px] font-black text-amber-600 shrink-0">{formatBRL(l.parcelaValor)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'imobiliarias' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                 <h2 className="text-base font-black text-slate-900 uppercase">Parceiros</h2>
                 {(isMaster || currentUser?.role === 'gestor') && <Button onClick={() => { setImobForm({ id: '', nome: '', cnpj: '', contato: '' }); setEditingImob(null); setImobModalOpen(true); }} className="h-8 px-3 text-[8px]">+ ADICIONAR</Button>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                 {imobiliarias.map(imob => (
                   <div key={imob.id} className="bg-white p-4 rounded-2xl border shadow-sm group hover:border-indigo-400 transition-all">
                      <div className="flex justify-between items-start mb-3">
                        <div className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center text-white">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                        </div>
                        {(isMaster || currentUser?.role === 'gestor') && (
                          <div className="flex gap-1">
                            <button onClick={() => { setEditingImob(imob); setImobForm(imob); setImobModalOpen(true); }} className="p-1 hover:bg-indigo-50 text-indigo-600 rounded-md"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                            {isMaster && <button onClick={() => { setEditingImob(imob); setImobDeleteModalOpen(true); }} className="p-1 hover:bg-rose-50 text-rose-500 rounded-md"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>}
                          </div>
                        )}
                      </div>
                      <h3 className="text-[11px] font-black text-slate-900 uppercase truncate mb-0.5">{imob.nome}</h3>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{imob.cnpj || 'SEM CNPJ'}</p>
                   </div>
                 ))}
              </div>
            </div>
          )}

          {activeSection === 'equipe' && isMaster && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                 <h2 className="text-base font-black text-slate-900 uppercase">Usuários</h2>
                 <Button onClick={() => setUserModalOpen(true)} className="h-8 px-3 text-[8px]">+ NOVO USUÁRIO</Button>
              </div>
              <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
                 <table className="w-full text-left min-w-[500px]">
                    <thead className="bg-slate-50 border-b">
                      <tr className="text-[7px] font-black uppercase text-slate-400 tracking-widest">
                        <th className="px-4 py-2">Nome</th>
                        <th className="px-4 py-2">E-mail</th>
                        <th className="px-4 py-2">Role</th>
                        <th className="px-4 py-2 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {equipe.map(u => (
                        <tr key={u.id} className="text-[9px] hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-black text-slate-900 uppercase">{u.nome}</td>
                          <td className="px-4 py-3 text-slate-500">{u.email}</td>
                          <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase ${u.role === 'master' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{u.role}</span></td>
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => { setEditingUser(u); setUserEditModalOpen(true); }} className="text-indigo-600 font-black uppercase text-[7px] hover:underline">Editar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                 </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* MODAIS (MANTENDO O PADRÃO COMPACTO) */}
      <Modal isOpen={imobModalOpen} onClose={() => setImobModalOpen(false)} title={editingImob ? "Editar Parceiro" : "Novo Parceiro"}>
        <div className="space-y-3">
          <Input label="NOME DO PARCEIRO" value={imobForm.nome} onChange={e => setImobForm({...imobForm, nome: e.target.value.toUpperCase()})} />
          <Input label="CNPJ" value={imobForm.cnpj} placeholder="00.000.000/0000-00" onChange={e => setImobForm({...imobForm, cnpj: maskCNPJ(e.target.value)})} />
          <Input label="CONTATO" value={imobForm.contato} placeholder="(00) 00000-0000" onChange={e => setImobForm({...imobForm, contato: maskPhone(e.target.value)})} />
          <Button className="w-full h-10 mt-2 text-[9px]" onClick={async () => {
             if (!imobForm.nome) return alert("Informe o nome.");
             await SupabaseService.saveImobiliaria(imobForm);
             await loadData();
             setImobModalOpen(false);
          }}>{editingImob ? "SALVAR" : "CADASTRAR"}</Button>
        </div>
      </Modal>

      <Modal isOpen={loteModalOpen} onClose={() => setLoteModalOpen(false)} title={editingLote ? "Editar Lote" : "Novo Lote"}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Input label="QUADRA" value={loteForm.quadra} onChange={e => setLoteForm({...loteForm, quadra: e.target.value.toUpperCase()})} />
            <Input label="NÚMERO" value={loteForm.numero} onChange={e => setLoteForm({...loteForm, numero: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-lg">
             <Input label="FRENTE" value={loteForm.frente} onChange={e => setLoteForm({...loteForm, frente: e.target.value})} />
             <Input label="FUNDOS" value={loteForm.fundos} onChange={e => setLoteForm({...loteForm, fundos: e.target.value})} />
             <Input label="LAT DIR" value={loteForm.lateralDireita} onChange={e => setLoteForm({...loteForm, lateralDireita: e.target.value})} />
             <Input label="LAT ESQ" value={loteForm.lateralEsquerda} onChange={e => setLoteForm({...loteForm, lateralEsquerda: e.target.value})} />
          </div>
          <Input label="SINAL (R$)" value={loteForm.entrada} onChange={e => setLoteForm({...loteForm, entrada: maskCurrency(e.target.value)})} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="PARCELA (R$)" value={loteForm.parcelaValor} onChange={e => setLoteForm({...loteForm, parcelaValor: maskCurrency(e.target.value)})} />
            <Input label="PRAZO (MESES)" type="number" value={loteForm.parcelaPrazo} onChange={e => setLoteForm({...loteForm, parcelaPrazo: e.target.value})} />
          </div>
          <Select label="STATUS" value={loteForm.status} onChange={e => {
            const st = e.target.value as Status;
            setLoteForm({ ...loteForm, status: st, dataVenda: st === 'vendido' ? nowLocalISO() : "" });
          }}>
            <option value="disponivel">DISPONÍVEL</option>
            <option value="reservado">RESERVADO</option>
            <option value="vendido">VENDIDO</option>
          </Select>
          {loteForm.status !== 'disponivel' && (
            <div className="p-3 bg-indigo-50 rounded-lg space-y-2">
               <Input label="CLIENTE" value={loteForm.cliente} onChange={e => setLoteForm({...loteForm, cliente: e.target.value})} />
               <Select label="IMOBILIÁRIA" value={loteForm.imobiliaria} onChange={e => setLoteForm({...loteForm, imobiliaria: e.target.value})}>
                  <option value="">Lagos Direct</option>
                  {imobiliarias.map(imob => <option key={imob.id} value={imob.nome}>{imob.nome}</option>)}
               </Select>
            </div>
          )}
          <Button className="w-full h-11 text-[9px]" onClick={async () => {
             const updatedLote: Lote = {
               id: editingLote ? editingLote.loteId : uid(),
               quadra: loteForm.quadra.toUpperCase(),
               numero: loteForm.numero,
               entrada: toNumber(loteForm.entrada),
               parcelaValor: toNumber(loteForm.parcelaValor),
               parcelaPrazo: parseInt(loteForm.parcelaPrazo) || 0,
               status: loteForm.status,
               cliente: loteForm.cliente,
               corretor: loteForm.corretor || currentUser?.nome || "",
               imobiliaria: loteForm.imobiliaria,
               dataVenda: loteForm.dataVenda,
               reservaAte: loteForm.reservaAte,
               dimensoes: { frente: loteForm.frente, fundos: loteForm.fundos, lateralDireita: loteForm.lateralDireita, lateralEsquerda: loteForm.lateralEsquerda }
             };
             const newList = editingLote ? selectedEmp!.lotes.map(l => l.id === editingLote.loteId ? updatedLote : l) : [...selectedEmp!.lotes, updatedLote];
             await SupabaseService.saveEmpreendimento({...selectedEmp!, lotes: newList});
             await loadData(); setLoteModalOpen(false);
          }}>SALVAR</Button>
        </div>
      </Modal>

      <Modal isOpen={logoutConfirmOpen} onClose={() => setLogoutConfirmOpen(false)} title="Sair">
        <div className="space-y-4 text-center">
          <p className="font-bold text-slate-600 text-[10px] uppercase">Deseja encerrar a sessão?</p>
          <div className="flex flex-col gap-2">
            <Button variant="danger" className="w-full h-10" onClick={handleLogout}>SIM, SAIR</Button>
            <Button variant="ghost" className="w-full h-8" onClick={() => setLogoutConfirmOpen(false)}>CANCELAR</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={empModalOpen} onClose={() => setEmpModalOpen(false)} title="Novo Loteamento">
        <div className="space-y-3">
          <Input label="NOME DO EMPREENDIMENTO" value={empNome} onChange={e => setEmpNome(e.target.value.toUpperCase())} />
          <Button className="w-full h-10 mt-2 text-[9px]" onClick={async () => { 
             if (!empNome) return; 
             await SupabaseService.saveEmpreendimento({ id: uid(), nome: empNome, lotes: [] }); 
             await loadData(); 
             setEmpModalOpen(false); 
          }}>CRIAR PROJETO</Button>
        </div>
      </Modal>

      <Modal isOpen={loteViewModalOpen} onClose={() => setLoteViewModalOpen(false)} title="Ficha Técnica">
        {viewingLote && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <div><p className="text-[7px] font-black text-indigo-500 uppercase">Unidade</p><h3 className="text-2xl font-black text-slate-900 italic">Q{viewingLote.quadra} L{viewingLote.numero}</h3></div>
              <span className={`px-2 py-1 rounded-full text-[7px] font-black uppercase ${viewingLote.status === 'disponivel' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{viewingLote.status}</span>
            </div>
            <div className="bg-[#1a1a1a] p-4 rounded-xl text-white">
               <div className="grid grid-cols-2 gap-4 border-b border-white/10 pb-3 mb-3">
                  <div><p className="text-[6px] font-black text-white/40 uppercase mb-0.5">Sinal</p><p className="text-sm font-black text-[#f26522]">{formatBRL(viewingLote.entrada)}</p></div>
                  <div><p className="text-[6px] font-black text-white/40 uppercase mb-0.5">Plano</p><p className="text-sm font-black text-white">{viewingLote.parcelaPrazo}x {formatBRL(viewingLote.parcelaValor)}</p></div>
               </div>
               <div className="flex justify-between items-center"><p className="text-[7px] font-black text-white/40 uppercase">VGV Total</p><p className="text-lg font-black text-indigo-400">{formatBRL(calculateLoteTotal(viewingLote))}</p></div>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
               {[
                 {l: 'Fren.', v: viewingLote.dimensoes?.frente},
                 {l: 'Fund.', v: viewingLote.dimensoes?.fundos},
                 {l: 'Dir.', v: viewingLote.dimensoes?.lateralDireita},
                 {l: 'Esq.', v: viewingLote.dimensoes?.lateralEsquerda}
               ].map(d => (
                 <div key={d.l} className="bg-slate-50 p-2 rounded-lg border text-center"><p className="text-[6px] font-black text-slate-400 uppercase">{d.l}</p><p className="text-[9px] font-black text-slate-900">{d.v || '--'}m</p></div>
               ))}
            </div>
            <Button className="w-full h-10 text-[9px]" onClick={() => setLoteViewModalOpen(false)}>FECHAR</Button>
          </div>
        )}
      </Modal>

      <Modal isOpen={userEditModalOpen} onClose={() => setUserEditModalOpen(false)} title="Editar Perfil">
        {editingUser && (
          <div className="space-y-3">
             <Input label="NOME" value={editingUser.nome} onChange={e => setEditingUser({...editingUser, nome: e.target.value})} />
             <Select label="PARCEIRO" value={editingUser.imobiliaria || ''} onChange={e => setEditingUser({...editingUser, imobiliaria: e.target.value})}>
               <option value="">Lagos Direct</option>
               {imobiliarias.map(imob => <option key={imob.id} value={imob.nome}>{imob.nome}</option>)}
             </Select>
             <Select label="ACESSO" value={editingUser.role} onChange={e => setEditingUser({...editingUser, role: e.target.value as Role})}>
               <option value="corretor">Corretor</option>
               <option value="gestor">Gestor</option>
               <option value="master">Master</option>
             </Select>
             <Button className="w-full h-10 mt-2 text-[9px]" onClick={async () => {
                await SupabaseService.updateProfile(editingUser);
                await loadData();
                setUserEditModalOpen(false);
             }}>ATUALIZAR</Button>
          </div>
        )}
      </Modal>

      <Modal isOpen={userModalOpen} onClose={() => setUserModalOpen(false)} title="Novo Usuário">
        <div className="space-y-3">
          <Input label="NOME" value={newUser.nome} onChange={e => setNewUser({...newUser, nome: e.target.value})} />
          <Input label="E-MAIL" type="email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} />
          <Input label="SENHA" type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
          <Select label="PERFIL" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as Role})}>
            <option value="corretor">Corretor</option>
            <option value="gestor">Gestor</option>
            <option value="master">Master</option>
          </Select>
          <Button className="w-full h-10 mt-2 text-[9px]" onClick={async () => {
            const { error } = await SupabaseService.signUp(newUser.email, newUser.password, newUser.nome, newUser.role, newUser.imobiliaria);
            if (!error) { await loadData(); setUserModalOpen(false); } else { alert(error.message); }
          }}>Habilitar Acesso</Button>
        </div>
      </Modal>
    </div>
  );
};

export default App;
