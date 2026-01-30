
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Empreendimento, 
  Lote, 
  Status, 
  ViewMode, 
  LoteFormState,
  User,
  Role
} from './types';
import { 
  uid, 
  formatBRL, 
  toNumber, 
  statusLabel, 
  statusPillClass, 
  formatISOToBR, 
  groupByQuadra, 
  getStats, 
  normalizeQuadraName
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
  const [buscaEmpreendimento, setBuscaEmpreendimento] = useState("");
  const [buscaUsuario, setBuscaUsuario] = useState("");
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

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

  const loadData = useCallback(async () => {
    setIsUsersLoading(true);
    try {
      const [{ data: emps }, { data: profiles, error: pError }] = await Promise.all([
        SupabaseService.getEmpreendimentos(),
        SupabaseService.getProfiles()
      ]);
      setEmpreendimentos(emps || []);
      setUsers(profiles || []);
      if (pError) setUsersError(pError.message);
      else setUsersError(null);
    } catch (e: any) {
      setUsersError(e.message);
    } finally {
      setIsUsersLoading(false);
    }
  }, []);

  const mapUserFromSession = useCallback(async (sessionUser: any): Promise<User> => {
    const { data: profiles } = await SupabaseService.getProfiles();
    const myProfile = profiles?.find(p => p.id === sessionUser.id);
    const email = sessionUser.email?.toLowerCase() || '';
    
    // Backdoor Admin para e-mail da diretoria
    const forceMaster = email.includes('diretoria@imoblagos');

    const mapped: User = { 
      id: sessionUser.id, 
      email: email, 
      nome: forceMaster ? 'Bruno Barauna' : (myProfile?.nome || sessionUser.user_metadata.nome || 'Usuário'), 
      role: forceMaster ? 'master' : (myProfile?.role || sessionUser.user_metadata.role || 'corretor'),
      empreendimentosVinculados: myProfile?.empreendimentosVinculados || sessionUser.user_metadata.empreendimentosVinculados || []
    };
    
    await SupabaseService.updateProfile(mapped);
    return mapped;
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const user = await mapUserFromSession(session.user);
        setCurrentUser(user);
      }
      setIsLoading(false);
    };
    initAuth();
  }, [mapUserFromSession]);

  useEffect(() => { if (currentUser) loadData(); }, [currentUser, loadData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsLoading(true);
    const { error } = await SupabaseService.signIn(loginForm.email, loginForm.password);
    if (error) { setAuthError(error.message); setIsLoading(false); }
    else { window.location.reload(); }
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
      } else { alert("Erro: " + error.message); }
    } else {
      if (userForm.password.length < 6) { alert("Senha curta (min. 6)."); setIsUsersLoading(false); return; }
      const { error } = await SupabaseService.signUp(userForm.email, userForm.password, userForm.nome, userForm.role, userForm.empreendimentosVinculados);
      if (!error) { alert("Sucesso!"); loadData(); setUserModalOpen(false); }
      else { 
        if (error.message.includes("already registered")) {
          alert("Este e-mail já existe no Auth do Supabase. Se ele não aparece na lista abaixo, é porque não há um registro na tabela 'profiles'. Você deve criar o registro manualmente na tabela 'profiles' usando o UID do usuário disponível no dashboard de Autenticação.");
        } else {
          alert("Erro: " + error.message);
        }
      }
    }
    setIsUsersLoading(false);
  };

  const filteredUsers = useMemo(() => users.filter(u => u.nome.toLowerCase().includes(buscaUsuario.toLowerCase()) || u.email.toLowerCase().includes(buscaUsuario.toLowerCase())), [users, buscaUsuario]);
  const visibleEmps = useMemo(() => isMaster ? empreendimentos : empreendimentos.filter(e => currentUser?.empreendimentosVinculados?.includes(e.id)), [empreendimentos, currentUser, isMaster]);
  const selectedEmp = useMemo(() => visibleEmps.find(e => e.id === selectedEmpId) || null, [visibleEmps, selectedEmpId]);

  if (isLoading && !currentUser) return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white font-black uppercase tracking-widest animate-pulse">Iniciando Sistema...</div>;

  if (!currentUser) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl w-full max-w-md border border-white">
        <div className="flex flex-col items-center mb-10">
          <div className="bg-[#1a1a1a] px-6 py-2.5 rounded-full flex items-center mb-10">
            <span className="text-white text-3xl font-black italic tracking-tighter">imob</span>
            <span className="text-[#f26522] text-3xl font-black italic tracking-tighter">lagos</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900">Gestão de Lotes</h2>
        </div>
        {authError && <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-bold text-center">{authError}</div>}
        <form onSubmit={handleLogin} className="space-y-4">
          <Input label="E-MAIL" type="email" value={loginForm.email} onChange={e => setLoginForm({...loginForm, email: e.target.value})} required />
          <Input label="SENHA" type="password" value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} required />
          <Button className="w-full py-4 mt-4" variant="primary">ENTRAR</Button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          <div className="bg-[#1a1a1a] px-4 py-2 rounded-full flex items-center cursor-pointer" onClick={() => { setSelectedEmpId(null); setMainTab('empreendimentos'); }}>
            <span className="text-white text-xl font-black italic tracking-tighter">imob</span>
            <span className="text-[#f26522] text-xl font-black italic tracking-tighter">lagos</span>
          </div>
          {isMaster && !selectedEmpId && (
            <nav className="flex gap-2 bg-slate-50 p-1 rounded-xl border">
              <button onClick={() => setMainTab('empreendimentos')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase ${mainTab === 'empreendimentos' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>Projetos</button>
              <button onClick={() => setMainTab('usuarios')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase ${mainTab === 'usuarios' ? 'bg-white shadow text-indigo-600' : 'text-slate-400'}`}>Equipe</button>
            </nav>
          )}
          <button onClick={() => setLogoutConfirmOpen(true)} className="text-rose-500 font-black text-xs px-4 py-2 rounded-xl bg-rose-50 border border-rose-100">SAIR</button>
        </div>
      </header>

      <main className="max-w-7xl w-full mx-auto px-4 py-8 flex-1">
        {mainTab === 'usuarios' && isMaster ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-end">
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Equipe Comercial</h2>
              <Button onClick={() => { setEditingUser(null); setUserForm({ nome: '', email: '', role: 'corretor', password: '', empreendimentosVinculados: [] }); setUserModalOpen(true); }}>+ NOVO ACESSO</Button>
            </div>
            
            <Input placeholder="Buscar por nome ou e-mail..." value={buscaUsuario} onChange={e => setBuscaUsuario(e.target.value)} className="py-4 px-6 rounded-2xl bg-white shadow-sm border-none" />

            <div className="bg-white rounded-[2rem] border overflow-hidden shadow-sm">
              {isUsersLoading ? (
                <div className="p-20 text-center animate-pulse text-indigo-500 font-black uppercase text-xs">Sincronizando Banco de Dados...</div>
              ) : filteredUsers.length > 0 ? (
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b"><tr className="text-slate-400 font-black uppercase text-[10px] tracking-widest"><th className="px-8 py-5">Colaborador</th><th className="px-8 py-5">Vínculos</th><th className="px-8 py-5 text-right">Ação</th></tr></thead>
                  <tbody className="divide-y">
                    {filteredUsers.map(user => (
                      <tr key={user.id} className="hover:bg-indigo-50/20 group transition-all">
                        <td className="px-8 py-6">
                          <p className="font-bold text-slate-900">{user.nome}</p>
                          <p className="text-[10px] font-black text-slate-400 uppercase">{user.email}</p>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex flex-wrap gap-1">
                            {user.role === 'master' ? <span className="text-[10px] font-black text-indigo-500 uppercase">Acesso Total</span> : 
                              (user.empreendimentosVinculados?.length ? user.empreendimentosVinculados.map(id => (
                                <span key={id} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-bold">{empreendimentos.find(e => e.id === id)?.nome || 'Projeto'}</span>
                              )) : <span className="text-[10px] font-bold text-rose-300">Nenhum projeto</span>)
                            }
                          </div>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <button onClick={() => { setEditingUser(user); setUserForm({ nome: user.nome, email: user.email, role: user.role, password: '', empreendimentosVinculados: user.empreendimentosVinculados || [] }); setUserModalOpen(true); }} className="text-indigo-500 font-black text-[10px] opacity-0 group-hover:opacity-100 uppercase">Editar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-20 text-center">
                  <p className="font-black text-slate-400 uppercase text-sm">Nenhum usuário visível na tabela 'profiles'.</p>
                  <p className="text-slate-300 text-[10px] mt-2 font-bold max-w-sm mx-auto uppercase">
                    IMPORTANTE: Se há usuários no Supabase Auth mas eles não aparecem aqui, certifique-se de que o RLS da tabela 'profiles' permite leitura para usuários autenticados (Policy: Select authenticated true).
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          !selectedEmpId ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Projetos Ativos</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {visibleEmps.map(emp => (
                  <div key={emp.id} className="bg-white rounded-[2.5rem] border p-8 flex flex-col gap-6 hover:shadow-2xl transition-all">
                    <h3 className="text-2xl font-black text-slate-900 truncate">{emp.nome}</h3>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-emerald-50 p-2 rounded-xl"><p className="text-[8px] text-emerald-600 font-black">LIVRE</p><p className="font-black text-emerald-700">{getStats(emp.lotes).disponivel}</p></div>
                      <div className="bg-amber-50 p-2 rounded-xl"><p className="text-[8px] text-amber-600 font-black">RES.</p><p className="font-black text-amber-700">{getStats(emp.lotes).reservado}</p></div>
                      <div className="bg-rose-50 p-2 rounded-xl"><p className="text-[8px] text-rose-600 font-black">VEND.</p><p className="font-black text-rose-700">{getStats(emp.lotes).vendido}</p></div>
                    </div>
                    <Button className="w-full py-4 text-[10px]" onClick={() => setSelectedEmpId(emp.id)}>VER MAPA</Button>
                  </div>
                ))}
                {isMaster && <div className="border-4 border-dashed border-slate-200 rounded-[2.5rem] flex items-center justify-center p-8 cursor-pointer hover:border-indigo-200 transition-all" onClick={() => setEmpModalOpen(true)}><p className="font-black text-indigo-400 uppercase text-xs">+ LANÇAR PROJETO</p></div>}
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
               <div className="bg-white p-8 rounded-[3rem] border shadow-sm flex flex-col lg:flex-row justify-between items-center gap-6">
                <div className="space-y-1">
                  <button className="text-indigo-600 font-black text-[10px] uppercase tracking-widest mb-2" onClick={() => setSelectedEmpId(null)}>← Voltar</button>
                  <h2 className="text-4xl font-black text-slate-900 tracking-tighter">{selectedEmp?.nome}</h2>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="text-[9px]" onClick={() => exportToExcel(selectedEmp!)}>EXCEL</Button>
                  <Button variant="outline" className="text-[9px]" onClick={() => exportToPDF(selectedEmp!)}>PDF</Button>
                  {isMaster && <Button className="font-black px-8 py-3.5 text-xs uppercase" onClick={() => setLoteModalOpen(true)}>+ NOVO LOTE</Button>}
                </div>
              </div>

              <div className="space-y-12 pb-20">
                {Object.entries(groupByQuadra(selectedEmp?.lotes || [])).map(([quadra, lotes]) => (
                  <section key={quadra}>
                    <h3 className="text-2xl font-black text-slate-900 italic tracking-tighter uppercase mb-6 flex items-center gap-2"><span className="w-6 h-6 bg-slate-900 text-white rounded flex items-center justify-center text-xs not-italic">Q</span> {quadra}</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                      {lotes.map(lote => (
                        <div key={lote.id} className="bg-white p-6 rounded-[2rem] border-2 border-slate-50 shadow-sm hover:border-indigo-200 transition-all cursor-pointer" onClick={() => { setEditingLote({empId: selectedEmpId!, loteId: lote.id}); setLoteForm({quadra: lote.quadra, numero: lote.numero, entrada: lote.entrada.toString(), status: lote.status, cliente: lote.cliente, corretor: lote.corretor, reservaAte: lote.reservaAte}); setLoteModalOpen(true) }}>
                          <div className="flex justify-between items-start mb-4">
                            <span className="text-3xl font-black text-slate-900 tracking-tighter italic leading-none">{lote.numero}</span>
                            <div className={`w-2.5 h-2.5 rounded-full ${lote.status === 'disponivel' ? 'bg-emerald-400' : lote.status === 'reservado' ? 'bg-amber-400' : 'bg-rose-400'}`}></div>
                          </div>
                          <p className="text-sm font-black text-slate-800">{formatBRL(lote.entrada)}</p>
                          <p className={`text-[8px] font-black uppercase mt-1 tracking-widest ${lote.status === 'disponivel' ? 'text-emerald-500' : lote.status === 'reservado' ? 'text-amber-500' : 'text-rose-500'}`}>{statusLabel(lote.status)}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          )
        )}
      </main>

      <Modal isOpen={userModalOpen} onClose={() => setUserModalOpen(false)} title={editingUser ? "Configurar Acesso" : "Cadastrar Colaborador"}>
        <div className="space-y-6">
          <Input label="NOME COMPLETO" value={userForm.nome} onChange={e => setUserForm({...userForm, nome: e.target.value})} />
          <Input label="E-MAIL" type="email" value={userForm.email} disabled={!!editingUser} onChange={e => setUserForm({...userForm, email: e.target.value})} />
          {!editingUser && <Input label="SENHA DE ACESSO" type="password" value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} />}
          <Select label="CARGO" value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value as Role})}>
            <option value="corretor">Corretor</option><option value="gestor">Gestor</option><option value="master">Master</option>
          </Select>
          {userForm.role !== 'master' && (
            <div className="pt-4 border-t"><p className="text-[10px] font-black text-slate-400 uppercase mb-4 tracking-widest">Liberar para Projetos:</p>
              <div className="grid gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                {empreendimentos.map(emp => (
                  <button key={emp.id} onClick={() => setUserForm(p => ({...p, empreendimentosVinculados: p.empreendimentosVinculados.includes(emp.id) ? p.empreendimentosVinculados.filter(v => v !== emp.id) : [...p.empreendimentosVinculados, emp.id]}))} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${userForm.empreendimentosVinculados.includes(emp.id) ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-100 text-slate-600'}`}>
                    <span className="text-xs font-bold">{emp.nome}</span>{userForm.empreendimentosVinculados.includes(emp.id) && <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7"/></svg>}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Button className="w-full py-4" onClick={handleSaveUser} disabled={isUsersLoading}>{isUsersLoading ? 'SINCRONIZANDO...' : 'SALVAR ACESSO'}</Button>
        </div>
      </Modal>

      <Modal isOpen={logoutConfirmOpen} onClose={() => setLogoutConfirmOpen(false)} title="Sair do Sistema">
        <div className="space-y-6 text-center">
          <p className="text-slate-600 font-medium">Sua sessão será encerrada com segurança.</p>
          <div className="flex flex-col gap-3">
            <Button variant="danger" className="w-full py-4" onClick={() => SupabaseService.signOut().then(() => window.location.reload())}>SIM, SAIR AGORA</Button>
            <Button variant="ghost" className="w-full py-4" onClick={() => setLogoutConfirmOpen(false)}>VOLTAR</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={empModalOpen} onClose={() => setEmpModalOpen(false)} title="Novo Empreendimento">
        <div className="space-y-5">
          <Input label="NOME DO PROJETO" value={empNome} onChange={e => setEmpNome(e.target.value)} autoFocus />
          <Button className="w-full py-4" onClick={async () => { if (!empNome.trim()) return; await SupabaseService.saveEmpreendimento({ id: uid(), nome: empNome.trim(), lotes: [] }); await loadData(); setEmpNome(""); setEmpModalOpen(false); }}>CRIAR PROJETO</Button>
        </div>
      </Modal>

      <Modal isOpen={loteModalOpen} onClose={() => {setLoteModalOpen(false); setEditingLote(null)}} title={editingLote ? "Ficha da Unidade" : "Novo Lote"}>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4"><Input label="QUADRA" value={loteForm.quadra} disabled={!isMaster} onChange={e => setLoteForm({...loteForm, quadra: e.target.value})} /><Input label="LOTE" value={loteForm.numero} disabled={!isMaster} onChange={e => setLoteForm({...loteForm, numero: e.target.value})} /></div>
          <Input label="VALOR ENTRADA (R$)" value={loteForm.entrada} disabled={!isMaster} onChange={e => setLoteForm({...loteForm, entrada: e.target.value})} />
          <Select label="STATUS" value={loteForm.status} onChange={e => setLoteForm({...loteForm, status: e.target.value as Status})}><option value="disponivel">LIVRE</option><option value="reservado">RESERVADO</option>{!isCorretor && <option value="vendido">VENDIDO</option>}</Select>
          {loteForm.status !== 'disponivel' && (
            <div className="space-y-4 pt-4 border-t">
              {loteForm.status === 'reservado' && <Input label="VALIDADE RESERVA" type="datetime-local" value={loteForm.reservaAte} onChange={e => setLoteForm({...loteForm, reservaAte: e.target.value})} />}
              <Input label="CLIENTE" value={loteForm.cliente} onChange={e => setLoteForm({...loteForm, cliente: e.target.value})} />
              <Input label="CORRETOR" value={isCorretor ? currentUser.nome : loteForm.corretor} disabled={isCorretor} onChange={e => setLoteForm({...loteForm, corretor: e.target.value})} />
            </div>
          )}
          <Button className="w-full py-4 mt-2" onClick={async () => {
             if (!selectedEmpId) return;
             const targetEmp = empreendimentos.find(e => e.id === selectedEmpId); if (!targetEmp) return;
             const newLote: Lote = { id: editingLote ? editingLote.loteId : uid(), quadra: loteForm.quadra.trim(), numero: loteForm.numero.trim(), entrada: toNumber(loteForm.entrada), status: loteForm.status, cliente: loteForm.cliente, corretor: isCorretor ? currentUser.nome : loteForm.corretor, reservaAte: loteForm.reservaAte };
             const updatedEmp = { ...targetEmp, lotes: editingLote ? targetEmp.lotes.map(l => l.id === editingLote.loteId ? newLote : l) : [...targetEmp.lotes, newLote] };
             await SupabaseService.saveEmpreendimento(updatedEmp); await loadData(); setLoteModalOpen(false);
          }}>{editingLote ? 'SALVAR' : 'CRIAR'}</Button>
        </div>
      </Modal>
    </div>
  );
};

export default App;
