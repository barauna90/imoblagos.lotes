
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
  getStats 
} from './utils/helpers';
import { SupabaseService, supabase } from './services/supabase';
import { exportToExcel, exportToPDF } from './services/exportServices';
import { Modal, Button, Input, Select } from './components/UI';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [authError, setAuthError] = useState<string | null>(null);

  const [mainTab, setMainTab] = useState<'empreendimentos' | 'usuarios'>('empreendimentos');
  const [empreendimentos, setEmpreendimentos] = useState<Empreendimento[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [buscaUsuario, setBuscaUsuario] = useState("");
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  // Novos estados para visualização e filtros
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [filtroQuadra, setFiltroQuadra] = useState("");
  const [filtroEntrada, setFiltroEntrada] = useState("");

  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [empNome, setEmpNome] = useState("");
  const [loteModalOpen, setLoteModalOpen] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const [editingLote, setEditingLote] = useState<{ empId: string; loteId: string } | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  const [loteForm, setLoteForm] = useState<LoteFormState>({
    quadra: "", numero: "", entrada: "", status: "disponivel", 
    cliente: "", corretor: "", reservaAte: ""
  });

  const [userForm, setUserForm] = useState({ 
    nome: '', email: '', role: 'corretor' as Role, password: '', empreendimentosVinculados: [] as string[]
  });

  const isMaster = currentUser?.role === 'master';
  const isCorretor = currentUser?.role === 'corretor';

  const mapUserFromSession = useCallback(async (sessionUser: any): Promise<User> => {
    const email = sessionUser.email?.toLowerCase() || '';
    const forceMaster = email.includes('diretoria@imoblagos');
    
    let profileData: any = null;
    try {
      const { data } = await SupabaseService.getProfiles();
      profileData = data?.find(p => p.id === sessionUser.id);
    } catch (e) {
      console.warn("Perfil não encontrado no DB, usando metadados.");
    }

    const mapped: User = { 
      id: sessionUser.id, 
      email: email, 
      nome: forceMaster ? 'Bruno Barauna' : (profileData?.nome || sessionUser.user_metadata?.nome || 'Usuário'), 
      role: forceMaster ? 'master' : (profileData?.role || sessionUser.user_metadata?.role || 'corretor'),
      empreendimentosVinculados: profileData?.empreendimentosVinculados || sessionUser.user_metadata?.empreendimentosVinculados || []
    };
    
    SupabaseService.updateProfile(mapped).catch(() => {});
    return mapped;
  }, []);

  const loadData = useCallback(async () => {
    if (!currentUser) return;
    setIsUsersLoading(true);
    try {
      const [profilesRes, empsRes] = await Promise.all([
        SupabaseService.getProfiles(),
        SupabaseService.getEmpreendimentos()
      ]);
      setUsers(profilesRes.data || []);
      setEmpreendimentos(empsRes.data || []);
      setUsersError(profilesRes.error ? profilesRes.error.message : null);
    } catch (e: any) {
      setUsersError(e.message);
    } finally {
      setIsUsersLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const user = await mapUserFromSession(session.user);
          setCurrentUser(user);
        }
      } catch (e) {
        console.error("Erro na sessão inicial:", e);
      } finally {
        setIsLoading(false);
      }
    };
    initAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const user = await mapUserFromSession(session.user);
        setCurrentUser(user);
        setIsLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setSelectedEmpId(null);
      }
    });
    return () => subscription.unsubscribe();
  }, [mapUserFromSession]);

  useEffect(() => {
    if (currentUser) loadData();
  }, [currentUser, loadData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsLoading(true);
    const { error } = await SupabaseService.signIn(loginForm.email, loginForm.password);
    if (error) { 
      setAuthError("E-mail ou senha incorretos."); 
      setIsLoading(false); 
    }
  };

  const handleSaveUser = async () => {
    if (!isMaster) return;
    setIsUsersLoading(true);
    if (editingUser) {
      const updatedUser: User = { ...editingUser, nome: userForm.nome, role: userForm.role, empreendimentosVinculados: userForm.empreendimentosVinculados };
      const { error } = await SupabaseService.updateProfile(updatedUser);
      if (!error) {
        setUsers(prev => prev.map(u => u.id === editingUser.id ? updatedUser : u));
        setUserModalOpen(false);
        setEditingUser(null);
      } else { alert("Erro ao salvar: " + error.message); }
    } else {
      const { error } = await SupabaseService.signUp(userForm.email, userForm.password, userForm.nome, userForm.role, userForm.empreendimentosVinculados);
      if (!error) { 
        alert("Usuário cadastrado com sucesso!"); 
        loadData(); 
        setUserModalOpen(false); 
      } else { alert(error.message); }
    }
    setIsUsersLoading(false);
  };

  const filteredUsers = useMemo(() => users.filter(u => u.nome.toLowerCase().includes(buscaUsuario.toLowerCase()) || u.email.toLowerCase().includes(buscaUsuario.toLowerCase())), [users, buscaUsuario]);
  const visibleEmps = useMemo(() => isMaster ? empreendimentos : empreendimentos.filter(e => currentUser?.empreendimentosVinculados?.includes(e.id)), [empreendimentos, currentUser, isMaster]);
  const selectedEmp = useMemo(() => visibleEmps.find(e => e.id === selectedEmpId) || null, [visibleEmps, selectedEmpId]);

  // Lógica de filtragem de lotes
  const filteredLotes = useMemo(() => {
    if (!selectedEmp) return [];
    return selectedEmp.lotes.filter(l => {
      const matchQuadra = !filtroQuadra || l.quadra.toLowerCase().includes(filtroQuadra.toLowerCase());
      const maxEntrada = filtroEntrada ? toNumber(filtroEntrada) : Infinity;
      const matchEntrada = l.entrada <= maxEntrada;
      return matchQuadra && matchEntrada;
    });
  }, [selectedEmp, filtroQuadra, filtroEntrada]);

  if (isLoading && !currentUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white font-black uppercase tracking-widest text-[10px]">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        Sincronizando...
      </div>
    );
  }

  if (!currentUser) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl w-full max-w-md border border-slate-200">
        <div className="flex flex-col items-center mb-10">
          <div className="bg-[#1a1a1a] px-6 py-2.5 rounded-full flex items-center mb-10">
            <span className="text-white text-3xl font-black italic tracking-tighter">imob</span>
            <span className="text-[#f26522] text-3xl font-black italic tracking-tighter">lagos</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 italic tracking-tight">Painel de Acesso</h2>
        </div>
        {authError && <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-[10px] font-black uppercase text-center">{authError}</div>}
        <form onSubmit={handleLogin} className="space-y-4">
          <Input label="E-MAIL" type="email" value={loginForm.email} onChange={e => setLoginForm({...loginForm, email: e.target.value})} required placeholder="Ex: corretor@imoblagos.com" />
          <Input label="SENHA" type="password" value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} required placeholder="******" />
          <Button className="w-full py-4 mt-4" variant="primary" disabled={isLoading}>ENTRAR NO SISTEMA</Button>
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
              <button onClick={() => setMainTab('empreendimentos')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${mainTab === 'empreendimentos' ? 'bg-white shadow text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>Projetos</button>
              <button onClick={() => setMainTab('usuarios')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${mainTab === 'usuarios' ? 'bg-white shadow text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>Equipe</button>
            </nav>
          )}
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-[9px] font-black text-slate-400 uppercase leading-none tracking-widest">{currentUser.role}</p>
              <p className="text-xs font-bold text-slate-900">{currentUser.nome}</p>
            </div>
            <button onClick={() => setLogoutConfirmOpen(true)} className="text-rose-500 font-black text-[10px] px-4 py-2 rounded-xl bg-rose-50 border border-rose-100 hover:bg-rose-500 hover:text-white transition-all">SAIR</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl w-full mx-auto px-4 py-8 flex-1">
        {mainTab === 'usuarios' && isMaster ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
             <div className="flex justify-between items-end">
              <div>
                <h2 className="text-3xl font-black text-slate-900 italic tracking-tight">Equipe Comercial</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Gestão de colaboradores</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={loadData} disabled={isUsersLoading} className="text-[10px]">🔄 RECARREGAR</Button>
                <Button onClick={() => { setEditingUser(null); setUserForm({ nome: '', email: '', role: 'corretor', password: '', empreendimentosVinculados: [] }); setUserModalOpen(true); }} className="text-[10px]">+ NOVO ACESSO</Button>
              </div>
            </div>
            <Input placeholder="Buscar por nome ou e-mail..." value={buscaUsuario} onChange={e => setBuscaUsuario(e.target.value)} className="py-4 px-6 rounded-2xl bg-white shadow-sm border-none" />
            <div className="bg-white rounded-[2rem] border overflow-hidden shadow-sm">
              {isUsersLoading ? <div className="p-20 text-center animate-pulse text-indigo-500 font-black uppercase text-[10px]">Carregando Equipe...</div> : (
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b"><tr className="text-slate-400 font-black uppercase text-[10px] tracking-widest"><th className="px-8 py-5">Colaborador</th><th className="px-8 py-5">Vínculos</th><th className="px-8 py-5 text-right">Ação</th></tr></thead>
                  <tbody className="divide-y">
                    {filteredUsers.map(user => (
                      <tr key={user.id} className="hover:bg-indigo-50/20 transition-all">
                        <td className="px-8 py-6"><p className="font-bold text-slate-900 mb-0.5">{user.nome}</p><p className="text-[9px] font-black text-slate-400 uppercase">{user.email}</p></td>
                        <td className="px-8 py-6"><div className="flex flex-wrap gap-1">{user.role === 'master' ? <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">ACESSO TOTAL</span> : (user.empreendimentosVinculados?.length ? user.empreendimentosVinculados.map(id => <span key={id} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-bold border">{empreendimentos.find(e => e.id === id)?.nome || 'Projeto'}</span>) : <span className="text-[9px] font-bold text-rose-300 italic">Sem permissões</span>)}</div></td>
                        <td className="px-8 py-6 text-right"><button onClick={() => { setEditingUser(user); setUserForm({ nome: user.nome, email: user.email, role: user.role, password: '', empreendimentosVinculados: user.empreendimentosVinculados || [] }); setUserModalOpen(true); }} className="text-indigo-500 font-black text-[10px] uppercase bg-indigo-50 px-3 py-1.5 rounded-lg border hover:bg-indigo-600 hover:text-white transition-all">Editar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          !selectedEmpId ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
              <h2 className="text-3xl font-black text-slate-900 tracking-tight italic">Nossos Projetos</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {visibleEmps.map(emp => (
                  <div key={emp.id} className="bg-white rounded-[2.5rem] border p-8 flex flex-col gap-6 hover:shadow-2xl transition-all border-slate-100 group">
                    <h3 className="text-2xl font-black text-slate-900 truncate tracking-tighter italic group-hover:text-indigo-600 transition-colors">{emp.nome}</h3>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-emerald-50 p-2 rounded-xl border border-emerald-100"><p className="text-[8px] text-emerald-600 font-black">LIVRES</p><p className="font-black text-emerald-700 text-xl">{getStats(emp.lotes).disponivel}</p></div>
                      <div className="bg-amber-50 p-2 rounded-xl border border-amber-100"><p className="text-[8px] text-amber-600 font-black">RES.</p><p className="font-black text-amber-700 text-xl">{getStats(emp.lotes).reservado}</p></div>
                      <div className="bg-rose-50 p-2 rounded-xl border border-rose-100"><p className="text-[8px] text-rose-600 font-black">VEND.</p><p className="font-black text-rose-700 text-xl">{getStats(emp.lotes).vendido}</p></div>
                    </div>
                    <Button className="w-full py-4 text-[10px]" onClick={() => setSelectedEmpId(emp.id)}>VER DISPONIBILIDADE</Button>
                  </div>
                ))}
                {isMaster && <div className="border-4 border-dashed border-slate-200 rounded-[2.5rem] flex items-center justify-center p-8 cursor-pointer hover:border-indigo-200 hover:bg-white transition-all" onClick={() => setEmpModalOpen(true)}><p className="font-black text-indigo-400 uppercase text-xs tracking-widest">+ LANÇAR PROJETO</p></div>}
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
               {/* Cabeçalho do Projeto */}
               <div className="bg-white p-8 rounded-[3rem] border shadow-sm flex flex-col lg:flex-row justify-between items-center gap-6 border-slate-100 relative">
                <div className="space-y-1 w-full lg:w-auto text-center lg:text-left">
                  <button className="text-indigo-600 font-black text-[9px] uppercase tracking-[0.2em] mb-2 flex items-center justify-center lg:justify-start gap-1 hover:gap-2 transition-all" onClick={() => { setSelectedEmpId(null); setFiltroQuadra(""); setFiltroEntrada(""); }}>← VOLTAR</button>
                  <h2 className="text-4xl font-black text-slate-900 tracking-tighter italic">{selectedEmp?.nome}</h2>
                </div>
                
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button onClick={() => setViewMode('cards')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${viewMode === 'cards' ? 'bg-white shadow text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>Cards</button>
                    <button onClick={() => setViewMode('lista')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${viewMode === 'lista' ? 'bg-white shadow text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>Lista</button>
                  </div>
                  <Button variant="outline" className="text-[9px]" onClick={() => exportToExcel(selectedEmp!)}>EXCEL</Button>
                  <Button variant="outline" className="text-[9px]" onClick={() => exportToPDF(selectedEmp!)}>PDF</Button>
                  {isMaster && <Button className="font-black px-6 py-3.5 text-xs uppercase shadow-indigo-100" onClick={() => setLoteModalOpen(true)}>+ NOVO LOTE</Button>}
                </div>
              </div>

              {/* Barra de Filtros */}
              <div className="bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1 w-full">
                  <Input label="FILTRAR POR QUADRA" placeholder="Ex: A, B, C..." value={filtroQuadra} onChange={e => setFiltroQuadra(e.target.value)} />
                </div>
                <div className="flex-1 w-full">
                  <Input label="ENTRADA MÁXIMA (R$)" placeholder="Ex: 10000" type="number" value={filtroEntrada} onChange={e => setFiltroEntrada(e.target.value)} />
                </div>
                {(filtroQuadra || filtroEntrada) && (
                  <Button variant="ghost" onClick={() => { setFiltroQuadra(""); setFiltroEntrada(""); }} className="text-[9px] text-rose-500 font-black mb-1">LIMPAR FILTROS</Button>
                )}
              </div>

              {/* Conteúdo: Cards ou Lista */}
              <div className="pb-20">
                {viewMode === 'cards' ? (
                  <div className="space-y-12">
                    {Object.entries(groupByQuadra(filteredLotes)).map(([quadra, lotes]) => (
                      <section key={quadra}>
                        <h3 className="text-2xl font-black text-slate-900 italic tracking-tighter uppercase mb-6 flex items-center gap-2"><span className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center text-xs not-italic shadow-lg">Q</span> QUADRA {quadra}</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-6">
                          {lotes.map(lote => (
                            <div key={lote.id} className="bg-white p-6 rounded-[2rem] border shadow-sm hover:border-indigo-200 transition-all cursor-pointer border-slate-50 hover:shadow-xl active:scale-95" onClick={() => { setEditingLote({empId: selectedEmpId!, loteId: lote.id}); setLoteForm({quadra: lote.quadra, numero: lote.numero, entrada: lote.entrada.toString(), status: lote.status, cliente: lote.cliente, corretor: lote.corretor, reservaAte: lote.reservaAte}); setLoteModalOpen(true) }}>
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
                    {filteredLotes.length === 0 && (
                      <div className="p-20 text-center bg-white rounded-[2rem] border-2 border-dashed border-slate-100">
                        <p className="font-black text-slate-300 uppercase text-xs italic tracking-widest">Nenhum lote encontrado com esses filtros.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b">
                        <tr className="text-slate-400 font-black uppercase text-[10px] tracking-widest">
                          <th className="px-8 py-5">QDR / LOTE</th>
                          <th className="px-8 py-5">ENTRADA</th>
                          <th className="px-8 py-5">STATUS</th>
                          <th className="px-8 py-5">CLIENTE / CORRETOR</th>
                          <th className="px-8 py-5 text-right">AÇÃO</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredLotes.sort((a,b) => a.quadra.localeCompare(b.quadra) || a.numero.localeCompare(b.numero, undefined, {numeric: true})).map(lote => (
                          <tr key={lote.id} className="hover:bg-indigo-50/20 transition-all text-xs">
                            <td className="px-8 py-5"><span className="font-black text-slate-900">Q {lote.quadra}</span> - LOTE {lote.numero}</td>
                            <td className="px-8 py-5 font-bold text-slate-700">{formatBRL(lote.entrada)}</td>
                            <td className="px-8 py-5">
                              <span className={`px-3 py-1 rounded-full font-black text-[9px] uppercase tracking-tighter ${lote.status === 'disponivel' ? 'bg-emerald-100 text-emerald-700' : lote.status === 'reservado' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                                {statusLabel(lote.status)}
                              </span>
                            </td>
                            <td className="px-8 py-5">
                              {lote.cliente ? (
                                <div><p className="font-bold text-slate-900">{lote.cliente}</p><p className="text-[9px] font-black text-slate-400 uppercase">Corretor: {lote.corretor || '-'}</p></div>
                              ) : <span className="text-slate-300 italic">Disponível</span>}
                            </td>
                            <td className="px-8 py-5 text-right">
                              <button onClick={() => { setEditingLote({empId: selectedEmpId!, loteId: lote.id}); setLoteForm({quadra: lote.quadra, numero: lote.numero, entrada: lote.entrada.toString(), status: lote.status, cliente: lote.cliente, corretor: lote.corretor, reservaAte: lote.reservaAte}); setLoteModalOpen(true) }} className="text-indigo-500 font-black text-[10px] uppercase hover:underline">Ver Detalhes</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {filteredLotes.length === 0 && <div className="p-20 text-center text-slate-400 font-black uppercase text-xs">Nenhum lote para listar.</div>}
                  </div>
                )}
              </div>
            </div>
          )
        )}
      </main>

      {/* Reutilizando os mesmos modais do sistema anterior */}
      <Modal isOpen={logoutConfirmOpen} onClose={() => setLogoutConfirmOpen(false)} title="Encerrar Sessão">
        <div className="space-y-6 text-center">
          <p className="text-slate-600 font-medium">Você será desconectado do painel administrativo.</p>
          <div className="flex flex-col gap-3">
            <Button variant="danger" className="w-full py-4 shadow-rose-100" onClick={() => SupabaseService.signOut()}>SIM, SAIR AGORA</Button>
            <Button variant="ghost" className="w-full py-4 text-slate-400 font-bold" onClick={() => setLogoutConfirmOpen(false)}>CANCELAR</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={userModalOpen} onClose={() => setUserModalOpen(false)} title={editingUser ? "Configurar Acesso" : "Novo Colaborador"}>
        <div className="space-y-6">
          <Input label="NOME COMPLETO" value={userForm.nome} onChange={e => setUserForm({...userForm, nome: e.target.value})} />
          <Input label="E-MAIL" type="email" value={userForm.email} disabled={!!editingUser} onChange={e => setUserForm({...userForm, email: e.target.value})} />
          {!editingUser && <Input label="SENHA INICIAL" type="password" value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} />}
          <Select label="CARGO / NÍVEL" value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value as Role})}>
            <option value="corretor">Corretor</option>
            <option value="gestor">Gestor</option>
            <option value="master">Administrador Master</option>
          </Select>
          {userForm.role !== 'master' && (
            <div className="pt-4 border-t">
              <p className="text-[9px] font-black text-slate-400 uppercase mb-4 tracking-widest">Liberar Projetos:</p>
              <div className="grid gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                {empreendimentos.map(emp => (
                  <button key={emp.id} onClick={() => setUserForm(p => ({...p, empreendimentosVinculados: p.empreendimentosVinculados.includes(emp.id) ? p.empreendimentosVinculados.filter(v => v !== emp.id) : [...p.empreendimentosVinculados, emp.id]}))} className={`flex items-center justify-between p-3 rounded-xl border transition-all text-left ${userForm.empreendimentosVinculados.includes(emp.id) ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-100 text-slate-600'}`}>
                    <span className="text-xs font-bold">{emp.nome}</span>
                    {userForm.empreendimentosVinculados.includes(emp.id) && (
                      <div className="w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center text-white">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7"/></svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Button className="w-full py-4 shadow-indigo-100" onClick={handleSaveUser} disabled={isUsersLoading}>{isUsersLoading ? 'PROCESSANDO...' : 'SALVAR ACESSO'}</Button>
        </div>
      </Modal>

      <Modal isOpen={loteModalOpen} onClose={() => {setLoteModalOpen(false); setEditingLote(null)}} title={editingLote ? "Ficha da Unidade" : "Adicionar Lote"}>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Input label="QUADRA" value={loteForm.quadra} disabled={!isMaster} onChange={e => setLoteForm({...loteForm, quadra: e.target.value})} />
            <Input label="LOTE Nº" value={loteForm.numero} disabled={!isMaster} onChange={e => setLoteForm({...loteForm, numero: e.target.value})} />
          </div>
          <Input label="ENTRADA (R$)" value={loteForm.entrada} disabled={!isMaster} onChange={e => setLoteForm({...loteForm, entrada: e.target.value})} />
          <Select label="SITUAÇÃO" value={loteForm.status} onChange={e => setLoteForm({...loteForm, status: e.target.value as Status})}>
            <option value="disponivel">LIVRE</option>
            <option value="reservado">RESERVADO</option>
            {!isCorretor && <option value="vendido">VENDIDO</option>}
          </Select>
          {loteForm.status !== 'disponivel' && (
            <div className="space-y-4 pt-4 border-t border-slate-50">
              {loteForm.status === 'reservado' && <Input label="VALIDADE RESERVA" type="datetime-local" value={loteForm.reservaAte} onChange={e => setLoteForm({...loteForm, reservaAte: e.target.value})} />}
              <Input label="CLIENTE" value={loteForm.cliente} onChange={e => setLoteForm({...loteForm, cliente: e.target.value})} />
              <Input label="CORRETOR" value={isCorretor ? currentUser.nome : loteForm.corretor} disabled={isCorretor} onChange={e => setLoteForm({...loteForm, corretor: e.target.value})} />
            </div>
          )}
          <Button className="w-full py-4 mt-2 shadow-lg" onClick={async () => {
             if (!selectedEmpId) return;
             const targetEmp = empreendimentos.find(e => e.id === selectedEmpId); if (!targetEmp) return;
             const newLote: Lote = { id: editingLote ? editingLote.loteId : uid(), quadra: loteForm.quadra.trim().toUpperCase(), numero: loteForm.numero.trim(), entrada: toNumber(loteForm.entrada), status: loteForm.status, cliente: loteForm.cliente, corretor: isCorretor ? currentUser.nome : loteForm.corretor, reservaAte: loteForm.reservaAte };
             const updatedEmp = { ...targetEmp, lotes: editingLote ? targetEmp.lotes.map(l => l.id === editingLote.loteId ? newLote : l) : [...targetEmp.lotes, newLote] };
             await SupabaseService.saveEmpreendimento(updatedEmp); await loadData(); setLoteModalOpen(false);
          }}>{editingLote ? 'ATUALIZAR' : 'CADASTRAR'}</Button>
        </div>
      </Modal>

      <Modal isOpen={empModalOpen} onClose={() => setEmpModalOpen(false)} title="Novo Projeto">
        <div className="space-y-5">
          <Input label="NOME DO PROJETO" value={empNome} onChange={e => setEmpNome(e.target.value)} autoFocus />
          <Button className="w-full py-4 shadow-indigo-100" onClick={async () => { if (!empNome.trim()) return; await SupabaseService.saveEmpreendimento({ id: uid(), nome: empNome.trim(), lotes: [] }); await loadData(); setEmpNome(""); setEmpModalOpen(false); }}>CRIAR PROJETO</Button>
        </div>
      </Modal>
    </div>
  );
};

export default App;
