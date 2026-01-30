
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Empreendimento, 
  Lote, 
  Status, 
  LoteFormState,
  User,
  ViewMode,
  Role
} from './types';
import { 
  uid, 
  formatBRL, 
  toNumber, 
  maskCurrency,
  statusLabel, 
  groupByQuadra, 
  getStats,
  nowLocalISO,
  calculateLoteTotal,
  getDashboardStats
} from './utils/helpers';
import { SupabaseService, supabase } from './services/supabase';
import { exportToExcel } from './services/exportServices';
import { Modal, Button, Input, Select } from './components/UI';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'empreendimentos' | 'equipe'>('empreendimentos');
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [authError, setAuthError] = useState<string | null>(null);

  const [empreendimentos, setEmpreendimentos] = useState<Empreendimento[]>([]);
  const [equipe, setEquipe] = useState<User[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [filtroQuadra, setFiltroQuadra] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<Status | "">("");

  const [dashMonth, setDashMonth] = useState(new Date().getMonth());
  const [dashYear, setDashYear] = useState(new Date().getFullYear());

  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [loteModalOpen, setLoteModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [clearProjectConfirmOpen, setClearProjectConfirmOpen] = useState(false);

  const [empNome, setEmpNome] = useState("");
  const [newUser, setNewUser] = useState({ nome: '', email: '', password: '', role: 'corretor' as Role });

  const [editingLote, setEditingLote] = useState<{ empId: string; loteId: string } | null>(null);
  const [loteForm, setLoteForm] = useState<LoteFormState>({
    quadra: "", numero: "", entrada: "", parcelaValor: "", parcelaPrazo: "",
    status: "disponivel", cliente: "", corretor: "", imobiliaria: "", dataVenda: "", reservaAte: ""
  });

  const [bulkForm, setBulkForm] = useState({
    quadra: "", inicio: "", fim: "", entrada: "", parcelaValor: "", parcelaPrazo: "",
    status: "disponivel" as Status, cliente: "", corretor: "", imobiliaria: "", dataVenda: ""
  });

  const isMaster = currentUser?.role === 'master';
  const isCorretor = currentUser?.role === 'corretor';

  const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const years = [2024, 2025, 2026];

  const syncProfile = useCallback(async (sessionUser: any): Promise<User> => {
    const { data: profile } = await SupabaseService.getProfile(sessionUser.id);
    if (profile) return profile;
    const newUserObj: User = { 
      id: sessionUser.id, 
      email: sessionUser.email || '', 
      nome: sessionUser.user_metadata?.nome || 'Usuário',
      role: sessionUser.user_metadata?.role || 'corretor', 
      empreendimentosVinculados: []
    };
    await SupabaseService.updateProfile(newUserObj);
    return newUserObj;
  }, []);

  const loadData = useCallback(async () => {
    if (!currentUser) return;
    const [empsRes, teamRes] = await Promise.all([
      SupabaseService.getEmpreendimentos(),
      isMaster ? SupabaseService.getProfiles() : Promise.resolve({ data: [] })
    ]);
    setEmpreendimentos(empsRes.data || []);
    setEquipe(teamRes.data || []);
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
        setActiveTab('empreendimentos');
      }
    });
    return () => subscription.unsubscribe();
  }, [syncProfile]);

  useEffect(() => { if (currentUser) loadData(); }, [currentUser, loadData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const { error } = await SupabaseService.signIn(loginForm.email, loginForm.password);
    if (error) setAuthError("Dados incorretos.");
  };

  const handleLogout = async () => {
    try {
      await SupabaseService.signOut();
      // Limpeza forçada do estado para garantir que a UI mude mesmo se o listener demorar
      setCurrentUser(null);
      setSelectedEmpId(null);
      setActiveTab('empreendimentos');
      setLogoutConfirmOpen(false);
    } catch (error) {
      console.error("Erro ao sair:", error);
      // Mesmo com erro, tentamos resetar a UI localmente
      setCurrentUser(null);
      setLogoutConfirmOpen(false);
    }
  };

  const handleBulkCreate = async () => {
    if (!selectedEmp || !bulkForm.quadra) return;
    const start = parseInt(bulkForm.inicio);
    const end = parseInt(bulkForm.fim);
    const newLotes: Lote[] = [];
    for (let i = start; i <= end; i++) {
      newLotes.push({
        id: uid(),
        quadra: bulkForm.quadra.trim().toUpperCase(),
        numero: i.toString().padStart(2, '0'),
        entrada: toNumber(bulkForm.entrada),
        parcelaValor: toNumber(bulkForm.parcelaValor),
        parcelaPrazo: parseInt(bulkForm.parcelaPrazo) || 0,
        status: "disponivel",
        cliente: "",
        corretor: "",
        imobiliaria: "",
        reservaAte: ""
      });
    }
    await SupabaseService.saveEmpreendimento({ ...selectedEmp, lotes: [...selectedEmp.lotes, ...newLotes] });
    await loadData();
    setBulkModalOpen(false);
  };

  const handleClearAllLotes = async () => {
    if (!selectedEmp) return;
    await SupabaseService.saveEmpreendimento({ ...selectedEmp, lotes: [] });
    await loadData();
    setClearProjectConfirmOpen(false);
  };

  const selectedEmp = useMemo(() => empreendimentos.find(e => e.id === selectedEmpId) || null, [empreendimentos, selectedEmpId]);
  const dashStats = useMemo(() => selectedEmp ? getDashboardStats(selectedEmp.lotes, dashMonth, dashYear) : null, [selectedEmp, dashMonth, dashYear]);

  const filteredLotes = useMemo(() => {
    if (!selectedEmp) return [];
    return selectedEmp.lotes
      .filter(l => {
        const matchQ = !filtroQuadra || l.quadra.toUpperCase() === filtroQuadra.toUpperCase();
        const matchS = !filtroStatus || l.status === filtroStatus;
        return matchQ && matchS;
      })
      .sort((a, b) => {
        const qComp = a.quadra.localeCompare(b.quadra, undefined, { numeric: true });
        if (qComp !== 0) return qComp;
        return (parseInt(a.numero.replace(/\D/g, '')) || 0) - (parseInt(b.numero.replace(/\D/g, '')) || 0);
      });
  }, [selectedEmp, filtroQuadra, filtroStatus]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white font-black uppercase text-[10px] tracking-widest">Iniciando Sistema...</div>;

  if (!currentUser) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white p-10 rounded-[3rem] shadow-2xl w-full max-w-md border">
        <div className="flex flex-col items-center mb-10">
          <div className="bg-[#1a1a1a] px-6 py-3 rounded-full flex items-center mb-6">
            <span className="text-white text-3xl font-black italic tracking-tighter">imob</span>
            <span className="text-[#f26522] text-3xl font-black italic tracking-tighter">lagos</span>
          </div>
          <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bem-vindo de volta</h2>
        </div>
        {authError && <p className="mb-4 text-rose-500 text-center font-bold text-xs uppercase">{authError}</p>}
        <form onSubmit={handleLogin} className="space-y-4">
          <Input label="E-MAIL" value={loginForm.email} onChange={e => setLoginForm({...loginForm, email: e.target.value})} required />
          <Input label="SENHA" type="password" value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} required />
          <Button className="w-full py-4 mt-2">ENTRAR</Button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b sticky top-0 z-40 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="bg-[#1a1a1a] px-4 py-2 rounded-full flex items-center cursor-pointer" onClick={() => { setSelectedEmpId(null); setActiveTab('empreendimentos'); }}>
              <span className="text-white text-xl font-black italic tracking-tighter">imob</span>
              <span className="text-[#f26522] text-xl font-black italic tracking-tighter">lagos</span>
            </div>
            {isMaster && (
              <div className="hidden sm:flex bg-slate-100 p-1 rounded-2xl gap-1">
                <button onClick={() => setActiveTab('empreendimentos')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'empreendimentos' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>Mapa</button>
                <button onClick={() => setActiveTab('equipe')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'equipe' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>Equipe</button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
             <span className="hidden sm:inline text-xs font-bold text-slate-500">{currentUser.nome}</span>
             <button onClick={() => setLogoutConfirmOpen(true)} className="p-2.5 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
             </button>
          </div>
        </div>
        {isMaster && (
          <div className="sm:hidden border-t flex justify-around p-2 bg-white">
            <button onClick={() => setActiveTab('empreendimentos')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase ${activeTab === 'empreendimentos' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}>Mapa</button>
            <button onClick={() => setActiveTab('equipe')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase ${activeTab === 'equipe' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}>Equipe</button>
          </div>
        )}
      </header>

      <main className="max-w-7xl w-full mx-auto px-4 py-8 flex-1">
        {activeTab === 'equipe' ? (
          <div className="space-y-6 animate-in fade-in">
             <div className="flex justify-between items-center">
               <h2 className="text-3xl font-black italic tracking-tighter">Colaboradores</h2>
               <Button onClick={() => setUserModalOpen(true)}>+ ADICIONAR</Button>
             </div>
             <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[600px]">
                    <thead className="bg-slate-50 border-b">
                      <tr className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                        <th className="px-8 py-5">Nome</th>
                        <th className="px-8 py-5">E-mail</th>
                        <th className="px-8 py-5">Perfil</th>
                        <th className="px-8 py-5 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {equipe.map(m => (
                        <tr key={m.id} className="text-xs font-medium">
                          <td className="px-8 py-5 font-bold text-slate-900">{m.nome}</td>
                          <td className="px-8 py-5 text-slate-500">{m.email}</td>
                          <td className="px-8 py-5"><span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${m.role === 'master' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>{m.role}</span></td>
                          <td className="px-8 py-5 text-right"><button className="text-indigo-600 font-bold">Editar</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
             </div>
          </div>
        ) : !selectedEmpId ? (
          <div className="space-y-8 animate-in fade-in">
            <h2 className="text-3xl font-black italic tracking-tighter">Projetos Ativos</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {empreendimentos.map(emp => (
                <div key={emp.id} className="bg-white rounded-[3rem] border p-10 hover:shadow-2xl transition-all cursor-pointer group active:scale-[0.98]" onClick={() => setSelectedEmpId(emp.id)}>
                  <h3 className="text-2xl font-black text-slate-900 italic mb-8 group-hover:text-indigo-600 transition-colors">{emp.nome}</h3>
                  <div className="grid grid-cols-3 gap-3 text-center mb-8">
                    <div className="bg-emerald-50 p-4 rounded-3xl border border-emerald-100"><p className="text-[9px] font-black text-emerald-600 mb-1">LIVRES</p><p className="font-black text-2xl text-emerald-700">{getStats(emp.lotes).disponivel}</p></div>
                    <div className="bg-amber-50 p-4 rounded-3xl border border-amber-100"><p className="text-[9px] font-black text-amber-600 mb-1">RES.</p><p className="font-black text-2xl text-amber-700">{getStats(emp.lotes).reservado}</p></div>
                    <div className="bg-rose-50 p-4 rounded-3xl border border-rose-100"><p className="text-[9px] font-black text-rose-600 mb-1">VEND.</p><p className="font-black text-2xl text-rose-700">{getStats(emp.lotes).vendido}</p></div>
                  </div>
                  <Button className="w-full py-5 rounded-2xl">VISUALIZAR QUADRAS</Button>
                </div>
              ))}
              {isMaster && (
                <button className="border-4 border-dashed rounded-[3rem] flex flex-col items-center justify-center p-10 text-slate-300 hover:text-indigo-400 hover:border-indigo-200 transition-all min-h-[300px]" onClick={() => setEmpModalOpen(true)}>
                  <svg className="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                  <span className="font-black text-sm uppercase tracking-widest">Novo Projeto</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in slide-in-from-right-4">
             <div className="bg-white p-6 sm:p-10 rounded-[3rem] border shadow-sm">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-12">
                  <div>
                    <button onClick={() => setSelectedEmpId(null)} className="text-indigo-600 font-black text-[10px] uppercase tracking-widest mb-2 flex items-center gap-1 hover:translate-x-[-4px] transition-transform">← VOLTAR PROJETOS</button>
                    <h2 className="text-4xl font-black text-slate-900 italic tracking-tighter">{selectedEmp?.nome}</h2>
                  </div>
                  <div className="flex flex-wrap gap-2 w-full lg:w-auto">
                    <div className="flex bg-slate-100 p-1.5 rounded-2xl mr-4">
                      <button onClick={() => setViewMode('cards')} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase ${viewMode === 'cards' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>Visual</button>
                      <button onClick={() => setViewMode('lista')} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase ${viewMode === 'lista' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>Tabela</button>
                    </div>
                    {isMaster && (
                      <div className="flex gap-2 ml-auto">
                        <Button variant="danger" className="bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-500 hover:text-white" onClick={() => setClearProjectConfirmOpen(true)}>ZERAR PROJETO</Button>
                        <Button variant="secondary" onClick={() => setBulkModalOpen(true)}>MASSA</Button>
                        <Button onClick={() => setLoteModalOpen(true)}>+ LOTE</Button>
                      </div>
                    )}
                  </div>
                </div>

                {dashStats && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-8 space-y-4">
                      <div className="flex items-center justify-between px-2">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Vendas de {months[dashMonth]}</h4>
                        <div className="flex gap-2">
                          <Select className="py-2 text-[10px]" value={dashMonth} onChange={e => setDashMonth(parseInt(e.target.value))}>
                            {months.map((m, i) => <option key={m} value={i}>{m}</option>)}
                          </Select>
                          <Select className="py-2 text-[10px]" value={dashYear} onChange={e => setDashYear(parseInt(e.target.value))}>
                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-indigo-50/50 p-8 rounded-[2rem] border border-indigo-100">
                          <p className="text-[10px] font-black text-indigo-400 uppercase mb-2">Vendidos</p>
                          <p className="text-4xl font-black text-indigo-700 italic">{dashStats.salesCount} unid.</p>
                        </div>
                        <div className="bg-emerald-50/50 p-8 rounded-[2rem] border border-emerald-100">
                          <p className="text-[10px] font-black text-emerald-400 uppercase mb-2">VGV</p>
                          <p className="text-2xl font-black text-emerald-700 italic">{formatBRL(dashStats.vgv)}</p>
                        </div>
                      </div>
                    </div>
                    <div className="lg:col-span-4 bg-slate-900 p-8 rounded-[2.5rem] text-white">
                      <h4 className="text-[10px] font-black uppercase tracking-widest mb-6 opacity-40">🏆 Melhores Parceiros</h4>
                      <div className="space-y-4">
                        {dashStats.ranking.length > 0 ? dashStats.ranking.map((r, i) => (
                          <div key={i} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                            <div className="truncate pr-4">
                              <p className="text-xs font-black uppercase truncate">{r.corretor}</p>
                              <p className="text-[9px] font-bold text-indigo-400 uppercase">{r.imobiliaria}</p>
                            </div>
                            <span className="text-amber-400 font-black text-sm whitespace-nowrap">{r.vendas} v.</span>
                          </div>
                        )) : <p className="text-center py-8 text-[9px] opacity-20 italic uppercase tracking-widest">Sem vendas...</p>}
                      </div>
                    </div>
                  </div>
                )}
             </div>

             <div className="flex flex-wrap gap-4 items-end bg-white p-4 rounded-3xl border shadow-sm">
                <div className="flex-1 min-w-[200px]"><Select label="SITUAÇÃO" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as Status)}><option value="">TODOS OS LOTES</option><option value="disponivel">DISPONÍVEL</option><option value="reservado">RESERVADO</option><option value="vendido">VENDIDO</option></Select></div>
                <div className="flex-1 min-w-[200px]"><Input label="QUADRA" placeholder="Ex: G" value={filtroQuadra} onChange={e => setFiltroQuadra(e.target.value)} /></div>
                <Button variant="outline" className="w-full sm:w-auto h-12 px-8" onClick={() => selectedEmp && exportToExcel(selectedEmp)}>EXPORTAR</Button>
             </div>

             <div className="pb-24">
                {viewMode === 'cards' ? (
                  <div className="space-y-12">
                    {Object.entries(groupByQuadra(filteredLotes)).map(([quadra, lotes]) => (
                      <section key={quadra}>
                        <h3 className="text-xl font-black italic uppercase mb-6 flex items-center gap-3"><span className="w-10 h-10 bg-slate-900 text-white rounded-2xl flex items-center justify-center text-xs not-italic">Q</span> Quadra {quadra}</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                          {lotes.map(lote => (
                            <div 
                              key={lote.id} 
                              className={`bg-white p-6 rounded-[2.5rem] border shadow-sm hover:border-indigo-400 transition-all cursor-pointer active:scale-95 flex flex-col justify-between ${lote.status === 'vendido' ? 'bg-slate-50/50' : ''}`} 
                              onClick={() => { 
                                setEditingLote({empId: selectedEmpId!, loteId: lote.id}); 
                                setLoteForm({
                                  quadra: lote.quadra, 
                                  numero: lote.numero, 
                                  entrada: maskCurrency(lote.entrada.toString().replace('.', '')), 
                                  parcelaValor: maskCurrency(lote.parcelaValor.toString().replace('.', '')), 
                                  parcelaPrazo: lote.parcelaPrazo.toString(), 
                                  status: lote.status, 
                                  cliente: lote.cliente, 
                                  corretor: lote.corretor, 
                                  imobiliaria: lote.imobiliaria || "", 
                                  dataVenda: lote.dataVenda || "", 
                                  reservaAte: lote.reservaAte
                                }); 
                                setLoteModalOpen(true);
                              }}
                            >
                              <div>
                                <div className="flex justify-between items-start mb-4">
                                  <span className="text-4xl font-black text-slate-900 tracking-tighter italic">{lote.numero}</span>
                                  <div className={`w-3 h-3 rounded-full shadow-lg ${lote.status === 'disponivel' ? 'bg-emerald-400' : lote.status === 'reservado' ? 'bg-amber-400' : 'bg-rose-400'}`}></div>
                                </div>
                                
                                <div className="space-y-3 mt-4">
                                  <div>
                                    <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest leading-none mb-1">Entrada</p>
                                    <p className="text-lg font-black text-slate-900">{formatBRL(lote.entrada)}</p>
                                  </div>
                                  
                                  <div className="flex justify-between items-end gap-2">
                                    <div className="flex-1">
                                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Parcelas</p>
                                      <p className="text-sm font-bold text-slate-700">{formatBRL(lote.parcelaValor)}</p>
                                    </div>
                                    <div className="bg-slate-100 px-3 py-1 rounded-lg">
                                      <p className="text-[10px] font-black text-slate-500">{lote.parcelaPrazo}x</p>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {lote.status === 'vendido' && (
                                <div className="mt-6 pt-4 border-t border-slate-100">
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1.5 overflow-hidden">
                                      <svg className="w-2.5 h-2.5 text-rose-500 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                                      <p className="text-[9px] font-bold text-slate-600 truncate uppercase">{lote.corretor || '---'}</p>
                                    </div>
                                    <div className="flex items-center gap-1.5 overflow-hidden">
                                      <svg className="w-2.5 h-2.5 text-slate-400 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4zm3 1h6v4H7V5zm6 6H7v2h6v-2z" clipRule="evenodd" /></svg>
                                      <p className="text-[9px] font-black text-slate-400 truncate uppercase tracking-tighter">{lote.imobiliaria || '---'}</p>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white rounded-[2.5rem] border shadow-sm overflow-hidden">
                    <div className="overflow-x-auto scrollbar-hide">
                      <table className="w-full text-left min-w-[900px]">
                        <thead className="bg-slate-50 border-b">
                          <tr className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                            <th className="px-8 py-6">Unidade</th>
                            <th className="px-8 py-6">Entrada</th>
                            <th className="px-8 py-6">Total do Lote</th>
                            <th className="px-8 py-6">Parcelamento</th>
                            <th className="px-8 py-6">Imobiliária</th>
                            <th className="px-8 py-6 text-right">Ficha</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {filteredLotes.map(lote => (
                            <tr key={lote.id} className="hover:bg-slate-50">
                              <td className="px-8 py-5 font-black text-slate-900">Q{lote.quadra} L{lote.numero}</td>
                              <td className="px-8 py-5 font-black text-indigo-600 text-sm">{formatBRL(lote.entrada)}</td>
                              <td className="px-8 py-5 font-bold text-slate-800">{formatBRL(calculateLoteTotal(lote))}</td>
                              <td className="px-8 py-5 text-slate-500 font-medium text-xs">{lote.parcelaPrazo}x de {formatBRL(lote.parcelaValor)}</td>
                              <td className="px-8 py-5 font-bold uppercase text-[9px] text-slate-400">{lote.imobiliaria || '-'}</td>
                              <td className="px-8 py-5 text-right"><button onClick={() => { setEditingLote({empId: selectedEmpId!, loteId: lote.id}); setLoteForm({quadra: lote.quadra, numero: lote.numero, entrada: maskCurrency(lote.entrada.toString().replace('.', '')), parcelaValor: maskCurrency(lote.parcelaValor.toString().replace('.', '')), parcelaPrazo: lote.parcelaPrazo.toString(), status: lote.status, cliente: lote.cliente, corretor: lote.corretor, imobiliaria: lote.imobiliaria || "", dataVenda: lote.dataVenda || "", reservaAte: lote.reservaAte}); setLoteModalOpen(true) }} className="text-indigo-600 font-black uppercase text-[10px]">Ver Ficha</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
             </div>
          </div>
        )}
      </main>

      {/* MODAL FICHA DO LOTE */}
      <Modal isOpen={loteModalOpen} onClose={() => setLoteModalOpen(false)} title="Ficha Técnica do Lote">
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Input label="QUADRA" value={loteForm.quadra} disabled={!isMaster} onChange={e => setLoteForm({...loteForm, quadra: e.target.value.toUpperCase()})} />
            <Input label="NÚMERO" value={loteForm.numero} disabled={!isMaster} onChange={e => setLoteForm({...loteForm, numero: e.target.value})} />
          </div>
          <Input label="VALOR DA ENTRADA (R$)" placeholder="0,00" value={loteForm.entrada} disabled={!isMaster} onChange={e => setLoteForm({...loteForm, entrada: maskCurrency(e.target.value)})} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="VALOR PARCELA (R$)" placeholder="0,00" value={loteForm.parcelaValor} disabled={!isMaster} onChange={e => setLoteForm({...loteForm, parcelaValor: maskCurrency(e.target.value)})} />
            <Input label="PRAZO (MESES)" type="number" value={loteForm.parcelaPrazo} disabled={!isMaster} onChange={e => setLoteForm({...loteForm, parcelaPrazo: e.target.value})} />
          </div>
          <div className="p-8 bg-[#0f172a] rounded-[2.5rem] shadow-2xl border border-slate-800">
            <p className="text-[10px] font-black uppercase text-slate-500 mb-2 tracking-[0.2em]">Valor Total Automático</p>
            <p className="text-3xl font-black text-indigo-400 italic">
              {formatBRL(calculateLoteTotal(loteForm))}
            </p>
          </div>
          <Select label="STATUS DA UNIDADE" value={loteForm.status} onChange={e => {
            const st = e.target.value as Status;
            setLoteForm({...loteForm, status: st, dataVenda: st === 'vendido' ? nowLocalISO() : ""});
          }}>
            <option value="disponivel">Lote Disponível</option>
            <option value="reservado">Reservar Lote</option>
            {!isCorretor && <option value="vendido">Marcar como Vendido</option>}
          </Select>
          {loteForm.status !== 'disponivel' && (
            <div className="space-y-4 pt-6 border-t border-slate-100">
              <Input label="NOME DO CLIENTE" placeholder="Nome Completo" value={loteForm.cliente} onChange={e => setLoteForm({...loteForm, cliente: e.target.value})} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="CORRETOR" value={isCorretor ? currentUser?.nome : loteForm.corretor} disabled={isCorretor} onChange={e => setLoteForm({...loteForm, corretor: e.target.value})} />
                <Input label="IMOBILIÁRIA" value={loteForm.imobiliaria} onChange={e => setLoteForm({...loteForm, imobiliaria: e.target.value})} />
              </div>
            </div>
          )}
          <Button className="w-full py-5 rounded-2xl shadow-xl shadow-indigo-200" onClick={async () => {
             if (!selectedEmp) return;
             const newLote: Lote = { 
               id: editingLote ? editingLote.loteId : uid(), 
               quadra: loteForm.quadra.trim().toUpperCase(), 
               numero: loteForm.numero.trim(), 
               entrada: toNumber(loteForm.entrada),
               parcelaValor: toNumber(loteForm.parcelaValor),
               parcelaPrazo: parseInt(loteForm.parcelaPrazo) || 0,
               status: loteForm.status, 
               cliente: loteForm.cliente, 
               corretor: isCorretor ? (currentUser?.nome || "") : loteForm.corretor,
               imobiliaria: loteForm.imobiliaria,
               dataVenda: loteForm.status === 'vendido' ? (loteForm.dataVenda || nowLocalISO()) : "",
               reservaAte: loteForm.reservaAte 
             };
             const updatedLotes = editingLote 
               ? selectedEmp.lotes.map(l => l.id === editingLote.loteId ? newLote : l)
               : [...selectedEmp.lotes, newLote];
             await SupabaseService.saveEmpreendimento({ ...selectedEmp, lotes: updatedLotes }); 
             await loadData(); 
             setLoteModalOpen(false);
          }}>ATUALIZAR DADOS</Button>
        </div>
      </Modal>

      {/* MODAL CONFIRMAÇÃO ZERAR PROJETO */}
      <Modal isOpen={clearProjectConfirmOpen} onClose={() => setClearProjectConfirmOpen(false)} title="Atenção: Ação Crítica">
        <div className="space-y-6">
          <div className="p-6 bg-rose-50 border border-rose-100 rounded-3xl text-rose-600">
            <div className="flex items-center gap-3 mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <p className="font-black uppercase text-xs tracking-widest">Ação Irreversível</p>
            </div>
            <p className="text-sm font-medium leading-relaxed">
              Você está prestes a apagar <strong>TODOS</strong> os lotes deste projeto. Isso removerá registros de vendas, reservas e tabelas de preços. Esta ação não pode ser desfeita.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button variant="danger" className="w-full h-16 rounded-2xl" onClick={handleClearAllLotes}>SIM, APAGAR TUDO</Button>
            <Button variant="ghost" className="w-full" onClick={() => setClearProjectConfirmOpen(false)}>CANCELAR E VOLTAR</Button>
          </div>
        </div>
      </Modal>

      {/* OUTROS MODAIS */}
      <Modal isOpen={userModalOpen} onClose={() => setUserModalOpen(false)} title="Novo Colaborador">
        <div className="space-y-4">
          <Input label="NOME" value={newUser.nome} onChange={e => setNewUser({...newUser, nome: e.target.value})} />
          <Input label="E-MAIL" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} />
          <Input label="SENHA" type="password" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
          <Select label="CARGO" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as Role})}>
            <option value="corretor">Corretor</option>
            <option value="gestor">Gestor</option>
            <option value="master">Master</option>
          </Select>
          <Button className="w-full py-4 mt-2" onClick={async () => {
            const { error } = await SupabaseService.signUp(newUser.email, newUser.password, newUser.nome, newUser.role);
            if (error) alert(error.message);
            else { await loadData(); setUserModalOpen(false); }
          }}>CRIAR CONTA</Button>
        </div>
      </Modal>

      <Modal isOpen={bulkModalOpen} onClose={() => setBulkModalOpen(false)} title="Criação em Massa">
        <div className="space-y-4">
          <Input label="QUADRA" value={bulkForm.quadra} onChange={e => setBulkForm({...bulkForm, quadra: e.target.value})} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="INÍCIO" type="number" value={bulkForm.inicio} onChange={e => setBulkForm({...bulkForm, inicio: e.target.value})} />
            <Input label="FIM" type="number" value={bulkForm.fim} onChange={e => setBulkForm({...bulkForm, fim: e.target.value})} />
          </div>
          <Input label="ENTRADA PADRÃO" value={bulkForm.entrada} onChange={e => setBulkForm({...bulkForm, entrada: maskCurrency(e.target.value)})} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="VALOR PARCELA" value={bulkForm.parcelaValor} onChange={e => setBulkForm({...bulkForm, parcelaValor: maskCurrency(e.target.value)})} />
            <Input label="PRAZO" type="number" value={bulkForm.parcelaPrazo} onChange={e => setBulkForm({...bulkForm, parcelaPrazo: e.target.value})} />
          </div>
          <Button className="w-full py-4" onClick={handleBulkCreate}>GERAR LOTEAMENTO</Button>
        </div>
      </Modal>

      <Modal isOpen={empModalOpen} onClose={() => setEmpModalOpen(false)} title="Novo Loteamento">
        <div className="space-y-4">
          <Input label="NOME DO PROJETO" value={empNome} onChange={e => setEmpNome(e.target.value)} />
          <Button className="w-full py-4" onClick={async () => { if (!empNome.trim()) return; await SupabaseService.saveEmpreendimento({ id: uid(), nome: empNome.trim(), lotes: [] }); await loadData(); setEmpNome(""); setEmpModalOpen(false); }}>SALVAR PROJETO</Button>
        </div>
      </Modal>

      <Modal isOpen={logoutConfirmOpen} onClose={() => setLogoutConfirmOpen(false)} title="Sair">
        <div className="space-y-6 text-center">
          <p className="text-slate-600 font-medium">Encerrar sua sessão de trabalho?</p>
          <div className="flex flex-col gap-2">
            <Button variant="danger" className="w-full h-14" onClick={handleLogout}>SIM, SAIR</Button>
            <Button variant="ghost" className="w-full" onClick={() => setLogoutConfirmOpen(false)}>CANCELAR</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default App;
