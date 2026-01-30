
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Empreendimento, 
  Lote, 
  Status, 
  LoteFormState,
  User,
  Role,
  ViewMode
} from './types';
import { 
  uid, 
  formatBRL, 
  toNumber, 
  statusLabel, 
  groupByQuadra, 
  getStats,
  nowLocalISO 
} from './utils/helpers';
import { SupabaseService, supabase } from './services/supabase';
import { exportToExcel, exportToPDF } from './services/exportServices';
import { Modal, Button, Input, Select } from './components/UI';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [authError, setAuthError] = useState<string | null>(null);

  const [mainTab, setMainTab] = useState<'empreendimentos' | 'usuarios'>('empreendimentos');
  const [empreendimentos, setEmpreendimentos] = useState<Empreendimento[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [buscaUsuario, setBuscaUsuario] = useState("");
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  
  const [viewMode, setViewMode] = useState<ViewMode>("lista");
  const [filtroQuadra, setFiltroQuadra] = useState("");
  const [filtroEntrada, setFiltroEntrada] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<Status | "">("");

  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [empNome, setEmpNome] = useState("");
  const [loteModalOpen, setLoteModalOpen] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [rescueModalOpen, setRescueModalOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const [editingLote, setEditingLote] = useState<{ empId: string; loteId: string } | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  const [loteForm, setLoteForm] = useState<LoteFormState>({
    quadra: "", numero: "", entrada: "", status: "disponivel", 
    cliente: "", corretor: "", imobiliaria: "", dataVenda: "", reservaAte: ""
  });

  const [userForm, setUserForm] = useState({ 
    nome: '', email: '', role: 'corretor' as Role, password: '', empreendimentosVinculados: [] as string[]
  });

  const isMaster = currentUser?.role === 'master';
  const isCorretor = currentUser?.role === 'corretor';

  const handleSelectEmp = (id: string) => {
    setSelectedEmpId(id);
    setViewMode("lista");
    setFiltroQuadra("");
    setFiltroEntrada("");
    setFiltroStatus("");
  };

  const handleOpenNewLoteModal = () => {
    setEditingLote(null);
    setLoteForm({
      quadra: "",
      numero: "",
      entrada: "",
      status: "disponivel",
      cliente: "",
      corretor: "",
      imobiliaria: "",
      dataVenda: "",
      reservaAte: ""
    });
    setLoteModalOpen(true);
  };

  const syncProfile = useCallback(async (sessionUser: any): Promise<User> => {
    try {
      const email = sessionUser.email?.toLowerCase() || '';
      const forceMaster = email === 'diretoria@imoblagos.com' || sessionUser.user_metadata?.role === 'master';
      const { data: profile } = await SupabaseService.getProfile(sessionUser.id);
      if (profile) return { ...profile, role: forceMaster ? 'master' : profile.role };
      const newUser: User = { 
        id: sessionUser.id, email: email, nome: sessionUser.user_metadata?.nome || 'Usuário',
        role: forceMaster ? 'master' : 'corretor', empreendimentosVinculados: []
      };
      await SupabaseService.updateProfile(newUser);
      return newUser;
    } catch (err) {
      return { id: sessionUser.id, email: sessionUser.email || '', nome: sessionUser.user_metadata?.nome || 'Usuário', role: 'corretor', empreendimentosVinculados: [] };
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!currentUser) return;
    setIsDataLoading(true);
    try {
      const empsRes = await SupabaseService.getEmpreendimentos();
      setEmpreendimentos(empsRes.data || []);
      if (currentUser.role === 'master') {
        const profilesRes = await SupabaseService.getProfiles();
        setUsers(profilesRes.data || []);
      }
    } catch (e) { console.error(e); } finally { setIsDataLoading(false); }
  }, [currentUser?.id, currentUser?.role]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && mounted) {
          const user = await syncProfile(session.user);
          if (mounted) setCurrentUser(user);
        } else if (mounted) {
          setIsLoading(false);
        }
      } catch (err) { if (mounted) setIsLoading(false); }
    };
    init();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_IN' && session?.user) {
        const user = await syncProfile(session.user);
        setCurrentUser(user);
        setIsLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setSelectedEmpId(null);
        setLogoutConfirmOpen(false);
        setIsLoading(false);
      }
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [syncProfile]);

  useEffect(() => { if (currentUser) loadData(); }, [currentUser?.id, currentUser?.role, loadData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsLoading(true);
    try {
      const { error } = await SupabaseService.signIn(loginForm.email, loginForm.password);
      if (error) { setAuthError("E-mail ou senha incorretos."); setIsLoading(false); }
    } catch (err) { setAuthError("Erro na conexão."); setIsLoading(false); }
  };

  const visibleEmps = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'master') return empreendimentos;
    const vincs = currentUser.empreendimentosVinculados || [];
    return empreendimentos.filter(e => vincs.includes(e.id));
  }, [empreendimentos, currentUser]);

  const selectedEmp = useMemo(() => visibleEmps.find(e => e.id === selectedEmpId) || null, [visibleEmps, selectedEmpId]);

  const availableQuadras = useMemo(() => {
    if (!selectedEmp) return [];
    const quadras = selectedEmp.lotes.map(l => l.quadra.toUpperCase().trim());
    return Array.from(new Set(quadras)).sort((a: string, b: string) => a.localeCompare(b, undefined, { numeric: true }));
  }, [selectedEmp]);

  const filteredLotes = useMemo(() => {
    if (!selectedEmp) return [];
    return selectedEmp.lotes
      .filter(l => {
        const matchQuadra = !filtroQuadra || l.quadra.toUpperCase().trim() === filtroQuadra.toUpperCase().trim();
        const maxEntrada = filtroEntrada ? toNumber(filtroEntrada) : Infinity;
        const matchEntrada = l.entrada <= maxEntrada;
        const matchStatus = !filtroStatus || l.status === filtroStatus;
        return matchQuadra && matchEntrada && matchStatus;
      })
      .sort((a, b) => {
        const quadraA = a.quadra.toUpperCase().trim();
        const quadraB = b.quadra.toUpperCase().trim();
        const quadraComparison = quadraA.localeCompare(quadraB, undefined, { numeric: true });
        if (quadraComparison !== 0) return quadraComparison;
        return a.numero.localeCompare(b.numero, undefined, { numeric: true });
      });
  }, [selectedEmp, filtroQuadra, filtroEntrada, filtroStatus]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white font-black uppercase text-[10px] animate-pulse">Carregando...</div>;

  if (!currentUser) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl w-full max-w-md border">
        <div className="flex flex-col items-center mb-10">
          <div className="bg-[#1a1a1a] px-6 py-2.5 rounded-full flex items-center mb-10">
            <span className="text-white text-3xl font-black italic tracking-tighter">imob</span>
            <span className="text-[#f26522] text-3xl font-black italic tracking-tighter">lagos</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 italic tracking-tight uppercase">Acesso Restrito</h2>
        </div>
        {authError && <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-[10px] font-black uppercase text-center">{authError}</div>}
        <form onSubmit={handleLogin} className="space-y-4">
          <Input label="E-MAIL" type="email" value={loginForm.email} onChange={e => setLoginForm({...loginForm, email: e.target.value})} required />
          <Input label="SENHA" type="password" value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} required />
          <Button className="w-full py-4 mt-4">ENTRAR</Button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b sticky top-0 z-40 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          <div className="bg-[#1a1a1a] px-4 py-2 rounded-full flex items-center cursor-pointer" onClick={() => { setSelectedEmpId(null); setMainTab('empreendimentos'); }}>
            <span className="text-white text-xl font-black italic tracking-tighter">imob</span>
            <span className="text-[#f26522] text-xl font-black italic tracking-tighter">lagos</span>
          </div>
          {isMaster && !selectedEmpId && (
            <nav className="flex gap-2 bg-slate-50 p-1 rounded-xl border">
              <button onClick={() => setMainTab('empreendimentos')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${mainTab === 'empreendimentos' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>Projetos</button>
              <button onClick={() => setMainTab('usuarios')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${mainTab === 'usuarios' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>Equipe</button>
            </nav>
          )}
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-[9px] font-black text-slate-400 uppercase leading-none">{currentUser.role}</p>
              <p className="text-xs font-bold text-slate-900">{currentUser.nome}</p>
            </div>
            <button onClick={() => setLogoutConfirmOpen(true)} className="text-rose-500 font-black text-[10px] px-4 py-2 rounded-xl bg-rose-50 border border-rose-100 hover:bg-rose-500 hover:text-white transition-all">SAIR</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl w-full mx-auto px-4 py-8 flex-1">
        {mainTab === 'usuarios' && isMaster ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
             <div className="bg-white rounded-[2rem] border overflow-hidden shadow-sm p-10 text-center text-[10px] font-black uppercase text-slate-400 tracking-widest">Painel de Equipe Ativo</div>
          </div>
        ) : (
          !selectedEmpId ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
              <h2 className="text-3xl font-black text-slate-900 tracking-tight italic">Mapa de Disponibilidades</h2>
              {isDataLoading ? (
                <div className="py-20 text-center font-black text-indigo-500 text-[10px] uppercase">Buscando Projetos...</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {visibleEmps.map(emp => (
                    <div key={emp.id} className="bg-white rounded-[2.5rem] border p-8 flex flex-col gap-6 hover:shadow-2xl transition-all border-slate-100 group cursor-pointer" onClick={() => handleSelectEmp(emp.id)}>
                      <h3 className="text-2xl font-black text-slate-900 truncate tracking-tighter italic group-hover:text-indigo-600 transition-colors">{emp.nome}</h3>
                      <div className="grid grid-cols-3 gap-2 text-center pointer-events-none">
                        <div className="bg-emerald-50 p-2 rounded-xl border border-emerald-100"><p className="text-[8px] text-emerald-600 font-black">LIVRES</p><p className="font-black text-emerald-700 text-xl">{getStats(emp.lotes).disponivel}</p></div>
                        <div className="bg-amber-50 p-2 rounded-xl border border-amber-100"><p className="text-[8px] text-amber-600 font-black">RES.</p><p className="font-black text-amber-700 text-xl">{getStats(emp.lotes).reservado}</p></div>
                        <div className="bg-rose-50 p-2 rounded-xl border border-rose-100"><p className="text-[8px] text-rose-600 font-black">VEND.</p><p className="font-black text-rose-700 text-xl">{getStats(emp.lotes).vendido}</p></div>
                      </div>
                      <Button className="w-full py-4 text-[10px]">VER QUADRAS</Button>
                    </div>
                  ))}
                  {isMaster && <div className="border-4 border-dashed border-slate-200 rounded-[2.5rem] flex items-center justify-center p-8 cursor-pointer hover:border-indigo-200 hover:bg-white transition-all min-h-[200px]" onClick={() => setEmpModalOpen(true)}><p className="font-black text-indigo-400 uppercase text-xs tracking-widest">+ NOVO EMPREENDIMENTO</p></div>}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
               <div className="bg-white p-8 rounded-[3rem] border shadow-sm flex flex-col lg:flex-row justify-between items-center gap-6 border-slate-100">
                <div className="space-y-1 w-full lg:w-auto text-center lg:text-left">
                  <button className="text-indigo-600 font-black text-[9px] uppercase tracking-[0.2em] mb-2 flex items-center justify-center lg:justify-start gap-1 hover:gap-2 transition-all" onClick={() => { setSelectedEmpId(null); setFiltroQuadra(""); setFiltroEntrada(""); }}>← VOLTAR</button>
                  <h2 className="text-4xl font-black text-slate-900 tracking-tighter italic">{selectedEmp?.nome}</h2>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button onClick={() => setViewMode('cards')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${viewMode === 'cards' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>Cards</button>
                    <button onClick={() => setViewMode('lista')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${viewMode === 'lista' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>Lista Técnica</button>
                  </div>
                  <Button variant="outline" className="text-[9px]" onClick={() => selectedEmp && exportToExcel(selectedEmp)}>EXCEL</Button>
                  <Button variant="outline" className="text-[9px]" onClick={() => selectedEmp && exportToPDF(selectedEmp)}>PDF</Button>
                  {isMaster && <Button className="font-black px-6 py-3.5 text-xs uppercase shadow-indigo-100" onClick={handleOpenNewLoteModal}>+ ADICIONAR LOTE</Button>}
                </div>
              </div>

              <div className="bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 w-full">
                  <Select label="FILTRAR POR STATUS" value={filtroStatus} onChange={e => setFiltroStatus(e.target.value as Status)}>
                    <option value="">TODOS OS STATUS</option>
                    <option value="disponivel">DISPONÍVEL</option>
                    <option value="reservado">RESERVADO</option>
                    <option value="vendido">VENDIDO</option>
                  </Select>
                </div>
                <div className="flex-1 w-full">
                  <Select label="FILTRAR POR QUADRA" value={filtroQuadra} onChange={e => setFiltroQuadra(e.target.value)}>
                    <option value="">TODAS AS QUADRAS</option>
                    {availableQuadras.map(q => <option key={q} value={q}>QUADRA {q}</option>)}
                  </Select>
                </div>
                <div className="flex-1 w-full">
                  <Input label="ENTRADA MÁXIMA" placeholder="R$ 0,00" type="number" value={filtroEntrada} onChange={e => setFiltroEntrada(e.target.value)} />
                </div>
              </div>

              <div className="pb-20">
                {viewMode === 'cards' ? (
                  <div className="space-y-12">
                    {Object.entries(groupByQuadra(filteredLotes)).map(([quadra, lotes]) => (
                      <section key={quadra}>
                        <h3 className="text-2xl font-black text-slate-900 italic tracking-tighter uppercase mb-6 flex items-center gap-2"><span className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center text-xs not-italic">Q</span> QUADRA {quadra}</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
                          {lotes.map(lote => (
                            <div key={lote.id} className="bg-white p-6 rounded-[2rem] border shadow-sm hover:border-indigo-200 transition-all cursor-pointer border-slate-50 hover:shadow-xl active:scale-95" onClick={() => { setEditingLote({empId: selectedEmpId!, loteId: lote.id}); setLoteForm({quadra: lote.quadra, numero: lote.numero, entrada: lote.entrada.toString(), status: lote.status, cliente: lote.cliente, corretor: lote.corretor, imobiliaria: lote.imobiliaria || "", dataVenda: lote.dataVenda || "", reservaAte: lote.reservaAte}); setLoteModalOpen(true) }}>
                              <div className="flex justify-between items-start mb-4">
                                <span className="text-3xl font-black text-slate-900 tracking-tighter italic leading-none">{lote.numero}</span>
                                <div className={`w-3 h-3 rounded-full shadow-lg ${lote.status === 'disponivel' ? 'bg-emerald-400' : lote.status === 'reservado' ? 'bg-amber-400' : 'bg-rose-400'}`}></div>
                              </div>
                              <p className="text-sm font-black text-slate-800 tracking-tight">{formatBRL(lote.entrada)}</p>
                              <p className={`text-[8px] font-black uppercase mt-1 tracking-widest ${lote.status === 'disponivel' ? 'text-emerald-500' : lote.status === 'reservado' ? 'text-amber-500' : 'text-rose-500'}`}>{statusLabel(lote.status)}</p>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white rounded-[2rem] border overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b"><tr className="text-slate-400 font-black uppercase text-[10px] tracking-widest"><th className="px-8 py-5">Identificação</th><th className="px-8 py-5">Valor Entrada</th><th className="px-8 py-5">Situação</th><th className="px-8 py-5">Interessado</th><th className="px-8 py-5 text-right">Ação</th></tr></thead>
                      <tbody className="divide-y">
                        {filteredLotes.map(lote => (
                          <tr key={lote.id} className="hover:bg-slate-50 text-xs">
                            <td className="px-8 py-5 font-black text-slate-900">QUADRA {lote.quadra} - LOTE {lote.numero}</td>
                            <td className="px-8 py-5 font-bold">{formatBRL(lote.entrada)}</td>
                            <td className="px-8 py-5"><span className={`px-2 py-0.5 rounded-full font-black text-[9px] uppercase ${lote.status === 'disponivel' ? 'bg-emerald-100 text-emerald-700' : lote.status === 'reservado' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{statusLabel(lote.status)}</span></td>
                            <td className="px-8 py-5 text-slate-500">{lote.cliente || '-'}</td>
                            <td className="px-8 py-5 text-right"><button onClick={() => { setEditingLote({empId: selectedEmpId!, loteId: lote.id}); setLoteForm({quadra: lote.quadra, numero: lote.numero, entrada: lote.entrada.toString(), status: lote.status, cliente: lote.cliente, corretor: lote.corretor, imobiliaria: lote.imobiliaria || "", dataVenda: lote.dataVenda || "", reservaAte: lote.reservaAte}); setLoteModalOpen(true) }} className="text-indigo-600 font-black uppercase text-[10px]">Ficha</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )
        )}
      </main>

      <Modal isOpen={logoutConfirmOpen} onClose={() => setLogoutConfirmOpen(false)} title="Encerrar Sessão">
        <div className="space-y-6 text-center">
          <p className="text-slate-600 font-medium italic text-sm">Deseja realmente sair do sistema?</p>
          <div className="flex flex-col gap-3">
            <Button variant="danger" className="w-full py-4" onClick={() => { SupabaseService.signOut(); setLogoutConfirmOpen(false); }}>ENCERRAR AGORA</Button>
            <Button variant="ghost" className="w-full py-4 text-slate-400" onClick={() => setLogoutConfirmOpen(false)}>VOLTAR</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={loteModalOpen} onClose={() => {setLoteModalOpen(false); setEditingLote(null)}} title="Ficha Técnica da Unidade">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Input label="QUADRA" value={loteForm.quadra} disabled={!isMaster} onChange={e => setLoteForm({...loteForm, quadra: e.target.value})} />
            <Input label="LOTE" value={loteForm.numero} disabled={!isMaster} onChange={e => setLoteForm({...loteForm, numero: e.target.value})} />
          </div>
          <Input label="VALOR ENTRADA (R$)" value={loteForm.entrada} disabled={!isMaster} onChange={e => setLoteForm({...loteForm, entrada: e.target.value})} />
          <Select label="SITUAÇÃO ATUAL" value={loteForm.status} onChange={e => {
            const nextStatus = e.target.value as Status;
            // Se mudar para vendido e a data estiver vazia, preenche automático
            const nextDataVenda = (nextStatus === 'vendido' && !loteForm.dataVenda) ? nowLocalISO() : loteForm.dataVenda;
            setLoteForm({...loteForm, status: nextStatus, dataVenda: nextDataVenda});
          }}>
            <option value="disponivel">DISPONÍVEL</option>
            <option value="reservado">RESERVADO</option>
            {!isCorretor && <option value="vendido">VENDIDO</option>}
          </Select>
          
          {loteForm.status !== 'disponivel' && (
            <div className="space-y-4 pt-4 border-t border-slate-50">
              <Input label="NOME DO CLIENTE" value={loteForm.cliente} onChange={e => setLoteForm({...loteForm, cliente: e.target.value})} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="CORRETOR RESPONSÁVEL" value={isCorretor ? currentUser?.nome : loteForm.corretor} disabled={isCorretor} onChange={e => setLoteForm({...loteForm, corretor: e.target.value})} />
                <Input label="IMOBILIÁRIA" value={loteForm.imobiliaria} onChange={e => setLoteForm({...loteForm, imobiliaria: e.target.value})} placeholder="Opcional" />
              </div>
              {loteForm.status === 'vendido' && (
                <Input label="DIA/HORA DA VENDA" type="datetime-local" value={loteForm.dataVenda} onChange={e => setLoteForm({...loteForm, dataVenda: e.target.value})} />
              )}
            </div>
          )}
          
          <Button className="w-full py-4 mt-2" onClick={async () => {
             if (!selectedEmpId) return;
             const targetEmp = empreendimentos.find(e => e.id === selectedEmpId); if (!targetEmp) return;
             const newLote: Lote = { 
               id: editingLote ? editingLote.loteId : uid(), 
               quadra: loteForm.quadra.trim().toUpperCase(), 
               numero: loteForm.numero.trim(), 
               entrada: toNumber(loteForm.entrada), 
               status: loteForm.status, 
               cliente: loteForm.cliente, 
               corretor: isCorretor ? (currentUser?.nome || "") : loteForm.corretor,
               imobiliaria: loteForm.imobiliaria,
               dataVenda: loteForm.status === 'vendido' ? loteForm.dataVenda : "", // Limpa se não for vendido
               reservaAte: loteForm.reservaAte 
             };
             const updatedEmp = { 
               ...targetEmp, 
               lotes: editingLote 
                 ? targetEmp.lotes.map(l => l.id === editingLote.loteId ? newLote : l) 
                 : [...targetEmp.lotes, newLote] 
             };
             await SupabaseService.saveEmpreendimento(updatedEmp); 
             await loadData(); 
             setLoteModalOpen(false);
          }}>SALVAR DADOS</Button>
        </div>
      </Modal>

      <Modal isOpen={empModalOpen} onClose={() => setEmpModalOpen(false)} title="Novo Projeto">
        <div className="space-y-5">
          <Input label="NOME DO EMPREENDIMENTO" value={empNome} onChange={e => setEmpNome(e.target.value)} autoFocus />
          <Button className="w-full py-4" onClick={async () => { if (!empNome.trim()) return; await SupabaseService.saveEmpreendimento({ id: uid(), nome: empNome.trim(), lotes: [] }); await loadData(); setEmpNome(""); setEmpModalOpen(false); }}>CRIAR PROJETO</Button>
        </div>
      </Modal>
    </div>
  );
};

export default App;
