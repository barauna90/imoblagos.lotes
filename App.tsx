
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Empreendimento, 
  Lote, 
  Status, 
  ViewMode, 
  LoteFormState,
  User 
} from './types';
import { 
  uid, 
  todayISO, 
  formatBRL, 
  toNumber, 
  statusLabel, 
  statusPillClass, 
  formatISOToBR, 
  groupByQuadra, 
  getStats, 
  expireReservations,
  normalizeQuadraName
} from './utils/helpers';
import { DB } from './services/db';
import { exportToExcel, exportToPDF } from './services/exportServices';
import { Modal, Button, Input, Select } from './components/UI';

const App: React.FC = () => {
  // --- Auth State ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginForm, setLoginForm] = useState({ email: '', password: '', nome: '' });

  // --- App States ---
  const [empreendimentos, setEmpreendimentos] = useState<Empreendimento[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [buscaEmpreendimento, setBuscaEmpreendimento] = useState("");
  const [viewByEmp, setViewByEmp] = useState<Record<string, ViewMode>>({});

  // Modals
  const [empModalOpen, setEmpModalOpen] = useState(false);
  const [empNome, setEmpNome] = useState("");

  const [loteModalOpen, setLoteModalOpen] = useState(false);
  const [editing, setEditing] = useState<{ empId: string; loteId: string } | null>(null);
  const [loteForm, setLoteForm] = useState<LoteFormState>({
    quadra: "", numero: "", entrada: "", status: "disponivel", 
    cliente: "", corretor: "", reservaAte: ""
  });

  // Filters
  const [fQuadra, setFQuadra] = useState<string>("ALL");
  const [fNumero, setFNumero] = useState("");
  const [fEntradaMin, setFEntradaMin] = useState("");
  const [fEntradaMax, setFEntradaMax] = useState("");

  // --- Initial Load & Session ---
  useEffect(() => {
    // Carregar sessão
    const savedUser = sessionStorage.getItem('imob_session');
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
    }
    // Carregar banco de dados
    setEmpreendimentos(DB.getEmpreendimentos());
  }, []);

  // --- Save Logic ---
  useEffect(() => {
    if (currentUser) {
      DB.saveEmpreendimentos(empreendimentos);
    }
  }, [empreendimentos, currentUser]);

  // --- Auth Handlers ---
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const user = DB.findUserByEmail(loginForm.email);
    if (user && user.password === loginForm.password) {
      setCurrentUser(user);
      sessionStorage.setItem('imob_session', JSON.stringify(user));
      setLoginForm({ email: '', password: '', nome: '' });
    } else {
      alert("E-mail ou senha incorretos.");
    }
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginForm.nome || !loginForm.email || !loginForm.password) {
      alert("Preencha todos os campos.");
      return;
    }
    if (DB.findUserByEmail(loginForm.email)) {
      alert("Este e-mail já está cadastrado.");
      return;
    }
    const newUser = DB.createUser({
      nome: loginForm.nome,
      email: loginForm.email,
      password: loginForm.password
    });
    setCurrentUser(newUser);
    sessionStorage.setItem('imob_session', JSON.stringify(newUser));
    setLoginForm({ email: '', password: '', nome: '' });
  };

  const handleLogout = () => {
    if (confirm("Deseja realmente sair?")) {
      setCurrentUser(null);
      sessionStorage.removeItem('imob_session');
      setSelectedEmpId(null);
    }
  };

  // --- Auto-Expiration ---
  const handleExpiration = useCallback(() => {
    if (!currentUser) return;
    setEmpreendimentos(prev => {
      let anyChanged = false;
      const next = prev.map(emp => {
        const { updatedLotes, changed } = expireReservations(emp.lotes);
        if (changed) anyChanged = true;
        return { ...emp, lotes: updatedLotes };
      });
      return anyChanged ? next : prev;
    });
  }, [currentUser]);

  useEffect(() => {
    handleExpiration();
    const interval = setInterval(handleExpiration, 30000);
    return () => clearInterval(interval);
  }, [handleExpiration]);

  // --- Derived Data ---
  const filteredEmps = useMemo(() => {
    return empreendimentos.filter(e => e.nome.toLowerCase().includes(buscaEmpreendimento.toLowerCase()));
  }, [empreendimentos, buscaEmpreendimento]);

  const selectedEmp = useMemo(() => {
    return empreendimentos.find(e => e.id === selectedEmpId) || null;
  }, [empreendimentos, selectedEmpId]);

  const availableQuadras = useMemo(() => {
    if (!selectedEmp) return [];
    const qs = new Set<string>(selectedEmp.lotes.map(l => normalizeQuadraName(l.quadra)));
    return Array.from(qs).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [selectedEmp]);

  const filteredLotes = useMemo(() => {
    if (!selectedEmp) return [];
    return selectedEmp.lotes.filter(l => {
      const qMatch = fQuadra === "ALL" || normalizeQuadraName(l.quadra) === fQuadra;
      const nMatch = l.numero.toLowerCase().includes(fNumero.toLowerCase());
      const minMatch = !fEntradaMin || l.entrada >= toNumber(fEntradaMin);
      const maxMatch = !fEntradaMax || l.entrada <= toNumber(fEntradaMax);
      return qMatch && nMatch && minMatch && maxMatch;
    });
  }, [selectedEmp, fQuadra, fNumero, fEntradaMin, fEntradaMax]);

  const groupedLotes = useMemo(() => groupByQuadra(filteredLotes), [filteredLotes]);

  // --- Handlers ---
  const handleAddEmp = () => {
    if (!empNome.trim()) return;
    const newEmp: Empreendimento = { id: uid(), nome: empNome.trim(), lotes: [], createdBy: currentUser?.id };
    setEmpreendimentos([...empreendimentos, newEmp]);
    setEmpNome("");
    setEmpModalOpen(false);
  };

  const handleSaveLote = () => {
    if (!selectedEmp) return;
    const { quadra, numero, entrada, status, cliente, corretor, reservaAte } = loteForm;

    if (!quadra.trim() || !numero.trim() || !entrada.trim()) {
      alert("Preencha os campos obrigatórios.");
      return;
    }

    const isDuplicate = selectedEmp.lotes.some(l => 
      l.numero.toLowerCase() === numero.toLowerCase() && 
      normalizeQuadraName(l.quadra) === normalizeQuadraName(quadra) &&
      (!editing || l.id !== editing.loteId)
    );

    if (isDuplicate) {
      alert(`O lote ${numero} já existe na quadra ${quadra}.`);
      return;
    }

    const cleanedLote: Lote = {
      id: editing ? editing.loteId : uid(),
      quadra: quadra.trim(),
      numero: numero.trim(),
      entrada: toNumber(entrada),
      status,
      cliente: status !== 'disponivel' ? cliente : "",
      corretor: status !== 'disponivel' ? corretor : "",
      reservaAte: status === 'reservado' ? reservaAte : ""
    };

    setEmpreendimentos(empreendimentos.map(e => {
      if (e.id !== selectedEmp.id) return e;
      const lotes = editing 
        ? e.lotes.map(l => l.id === editing.loteId ? cleanedLote : l)
        : [...e.lotes, cleanedLote];
      return { ...e, lotes };
    }));

    setLoteModalOpen(false);
  };

  const resetNavigation = () => {
    setSelectedEmpId(null);
    setFQuadra("ALL");
    setBuscaEmpreendimento("");
  };

  // --- Render Login ---
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md border border-slate-200">
          <div className="flex flex-col items-center mb-8">
            <span className="text-[10px] font-black tracking-[0.2em] text-slate-800 mb-1">IMOBILIÁRIA</span>
            <div className="bg-[#1a1a1a] px-6 py-2 rounded-full flex items-center mb-4">
              <span className="text-white text-3xl font-black italic tracking-tighter">imob</span>
              <span className="text-[#f26522] text-3xl font-black italic tracking-tighter">lagos</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800">
              {authMode === 'login' ? 'Acessar Sistema' : 'Criar Nova Conta'}
            </h2>
          </div>

          <form onSubmit={authMode === 'login' ? handleLogin : handleRegister} className="space-y-4">
            {authMode === 'register' && (
              <Input label="Nome Completo" placeholder="Seu nome" value={loginForm.nome} onChange={e => setLoginForm({...loginForm, nome: e.target.value})} required />
            )}
            <Input label="E-mail" type="email" placeholder="email@exemplo.com" value={loginForm.email} onChange={e => setLoginForm({...loginForm, email: e.target.value})} required />
            <Input label="Senha" type="password" placeholder="••••••••" value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} required />
            
            <Button className="w-full py-3 text-lg font-bold" variant="primary">
              {authMode === 'login' ? 'Entrar' : 'Cadastrar'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button 
              onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
              className="text-indigo-600 font-bold hover:underline text-sm"
            >
              {authMode === 'login' ? 'Não tem uma conta? Cadastre-se' : 'Já tem uma conta? Faça login'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Render Dashboard ---
  const currentView = selectedEmpId ? (viewByEmp[selectedEmpId] || "lista") : "lista";

  return (
    <div className="min-h-screen pb-20 bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 py-3 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          <div className="flex flex-col cursor-pointer" onClick={resetNavigation}>
            <span className="text-[10px] font-black tracking-[0.2em] text-slate-800 ml-1 mb-0.5">IMOBILIÁRIA</span>
            <div className="bg-[#1a1a1a] px-5 py-1.5 rounded-full flex items-center leading-none">
              <span className="text-white text-2xl font-black italic tracking-tighter">imob</span>
              <span className="text-[#f26522] text-2xl font-black italic tracking-tighter">lagos</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-xs font-bold text-slate-400">Olá,</span>
              <span className="text-sm font-black text-slate-800">{currentUser.nome}</span>
            </div>
            <Button variant="ghost" className="text-rose-600" onClick={handleLogout}>
              Sair
            </Button>
            {!selectedEmpId && (
              <Button onClick={() => setEmpModalOpen(true)}>Novo Empreendimento</Button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {!selectedEmpId ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col gap-1">
              <h2 className="text-3xl font-black text-slate-800">Painel de Controle</h2>
              <p className="text-slate-500">Gerencie todos os seus empreendimentos em um só lugar.</p>
            </div>

            <div className="relative">
              <Input placeholder="Buscar empreendimento pelo nome..." value={buscaEmpreendimento} onChange={e => setBuscaEmpreendimento(e.target.value)} className="pl-12 py-3 rounded-2xl" />
              <svg className="w-6 h-6 absolute left-4 top-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEmps.map(emp => {
                const stats = getStats(emp.lotes);
                return (
                  <div key={emp.id} className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
                    <h3 className="text-xl font-black text-slate-800 truncate">{emp.nome}</h3>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-emerald-50 p-2 rounded-2xl text-center"><p className="text-[10px] text-emerald-600 font-bold">Disp.</p><p className="font-black text-emerald-700">{stats.disponivel}</p></div>
                      <div className="bg-amber-50 p-2 rounded-2xl text-center"><p className="text-[10px] text-amber-600 font-bold">Res.</p><p className="font-black text-amber-700">{stats.reservado}</p></div>
                      <div className="bg-rose-50 p-2 rounded-2xl text-center"><p className="text-[10px] text-rose-600 font-bold">Vend.</p><p className="font-black text-rose-700">{stats.vendido}</p></div>
                    </div>
                    <div className="flex gap-2">
                      <Button className="flex-1" onClick={() => setSelectedEmpId(emp.id)}>Abrir Mapa</Button>
                      <Button variant="outline" className="text-rose-500" onClick={() => {if(confirm("Excluir?")) setEmpreendimentos(empreendimentos.filter(e => e.id !== emp.id))}}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
              <div className="space-y-1">
                <Button variant="ghost" className="p-0 text-slate-400 hover:text-indigo-600 mb-2" onClick={resetNavigation}>
                  ← Voltar ao painel
                </Button>
                <h2 className="text-3xl font-black text-slate-900 leading-tight">{selectedEmp.nome}</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => exportToExcel(selectedEmp)}>Excel</Button>
                <Button variant="outline" onClick={() => exportToPDF(selectedEmp)}>PDF</Button>
                <Button onClick={() => setLoteModalOpen(true)}>Novo Lote</Button>
              </div>
            </div>

            {/* Filters Area */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end bg-white p-6 rounded-[2rem] border border-slate-200">
              <Select label="Quadra" value={fQuadra} onChange={e => setFQuadra(e.target.value)}>
                <option value="ALL">Todas as Quadras</option>
                {availableQuadras.map(q => <option key={q} value={q}>{q}</option>)}
              </Select>
              <Input label="Nº Lote" placeholder="Ex: 10" value={fNumero} onChange={e => setFNumero(e.target.value)} />
              <Input label="Valor Mín." placeholder="0,00" value={fEntradaMin} onChange={e => setFEntradaMin(e.target.value)} />
              <Input label="Valor Máx." placeholder="0,00" value={fEntradaMax} onChange={e => setFEntradaMax(e.target.value)} />
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button className={`flex-1 py-2 rounded-lg font-bold transition-all ${currentView === 'lista' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`} onClick={() => setViewByEmp({...viewByEmp, [selectedEmpId!]: 'lista'})}>Lista</button>
                <button className={`flex-1 py-2 rounded-lg font-bold transition-all ${currentView === 'cards' ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`} onClick={() => setViewByEmp({...viewByEmp, [selectedEmpId!]: 'cards'})}>Cards</button>
              </div>
            </div>

            {/* Content Area */}
            <div className="space-y-10">
              {(Object.entries(groupedLotes) as [string, Lote[]][]).map(([quadra, lotes]) => (
                <section key={quadra}>
                  <div className="flex items-center gap-4 mb-4">
                    <h3 className="text-2xl font-black text-slate-800">Quadra {quadra}</h3>
                    <div className="h-px flex-1 bg-slate-200"></div>
                  </div>
                  {currentView === 'lista' ? (
                    <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-100"><tr className="text-slate-400 font-bold uppercase text-[10px] tracking-widest"><th className="px-6 py-4">Lote</th><th className="px-6 py-4">Entrada</th><th className="px-6 py-4">Status</th><th className="px-6 py-4">Comercial</th><th className="px-6 py-4 text-right">Ações</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {lotes.map(lote => (
                            <tr key={lote.id} className="hover:bg-slate-50/50">
                              <td className="px-6 py-4 font-black text-slate-900">{lote.numero}</td>
                              <td className="px-6 py-4 font-bold text-slate-600">{formatBRL(lote.entrada)}</td>
                              <td className="px-6 py-4">
                                <span className={`px-3 py-1 rounded-full text-[10px] font-black border uppercase ${statusPillClass(lote.status)}`}>{statusLabel(lote.status)}</span>
                              </td>
                              <td className="px-6 py-4">
                                {lote.status !== 'disponivel' ? (
                                  <div className="flex flex-col"><span className="text-xs font-bold text-slate-800">{lote.cliente}</span><span className="text-[10px] text-slate-400">Corretor: {lote.corretor}</span></div>
                                ) : <span className="text-slate-200">—</span>}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <button onClick={() => {setEditing({empId: selectedEmpId!, loteId: lote.id}); setLoteForm({quadra: lote.quadra, numero: lote.numero, entrada: lote.entrada.toString(), status: lote.status, cliente: lote.cliente, corretor: lote.corretor, reservaAte: lote.reservaAte}); setLoteModalOpen(true)}} className="p-2 hover:bg-indigo-50 rounded-xl text-slate-400 hover:text-indigo-600 transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                                  <button onClick={() => {if(confirm("Remover?")) setEmpreendimentos(empreendimentos.map(e => e.id === selectedEmpId ? {...e, lotes: e.lotes.filter(lt => lt.id !== lote.id)} : e))}} className="p-2 hover:bg-rose-50 rounded-xl text-slate-400 hover:text-rose-600 transition-all"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {lotes.map(lote => (
                        <div key={lote.id} className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm relative group">
                          <div className="flex justify-between items-start mb-4">
                            <span className="text-3xl font-black text-slate-900 italic">#{lote.numero}</span>
                            <span className={`px-2 py-1 rounded-lg text-[10px] font-black border ${statusPillClass(lote.status)}`}>{statusLabel(lote.status)}</span>
                          </div>
                          <div className="space-y-3">
                            <div><p className="text-[10px] uppercase font-bold text-slate-400">Entrada</p><p className="text-xl font-black text-slate-800">{formatBRL(lote.entrada)}</p></div>
                            {lote.status !== 'disponivel' && (
                              <div className="pt-3 border-t border-slate-50"><p className="text-[10px] font-bold text-slate-400 uppercase">Cliente</p><p className="text-sm font-bold text-slate-700 truncate">{lote.cliente}</p></div>
                            )}
                          </div>
                          <div className="absolute inset-0 bg-indigo-600/95 rounded-[2rem] flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-all duration-300">
                             <Button variant="secondary" onClick={() => {setEditing({empId: selectedEmpId!, loteId: lote.id}); setLoteForm({quadra: lote.quadra, numero: lote.numero, entrada: lote.entrada.toString(), status: lote.status, cliente: lote.cliente, corretor: lote.corretor, reservaAte: lote.reservaAte}); setLoteModalOpen(true)}}>Editar</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Modals permanecem similares, mas conectados ao novo estado de gravação */}
      <Modal isOpen={empModalOpen} onClose={() => setEmpModalOpen(false)} title="Novo Empreendimento">
        <div className="space-y-4">
          <Input label="Nome comercial" value={empNome} onChange={e => setEmpNome(e.target.value)} autoFocus />
          <Button className="w-full" onClick={handleAddEmp}>Criar agora</Button>
        </div>
      </Modal>

      <Modal isOpen={loteModalOpen} onClose={() => {setLoteModalOpen(false); setEditing(null)}} title={editing ? "Ajustar Lote" : "Adicionar Lote"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Quadra" value={loteForm.quadra} onChange={e => setLoteForm({...loteForm, quadra: e.target.value})} />
            <Input label="Número" value={loteForm.numero} onChange={e => setLoteForm({...loteForm, numero: e.target.value})} />
          </div>
          <Input label="Entrada (R$)" value={loteForm.entrada} onChange={e => setLoteForm({...loteForm, entrada: e.target.value})} />
          <Select label="Status" value={loteForm.status} onChange={e => setLoteForm({...loteForm, status: e.target.value as Status})}>
            <option value="disponivel">Livre / Disponível</option>
            <option value="reservado">Reservado / Em análise</option>
            <option value="vendido">Vendido / Contrato</option>
          </Select>
          {loteForm.status !== 'disponivel' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
              {loteForm.status === 'reservado' && <Input label="Expira em" type="date" value={loteForm.reservaAte} onChange={e => setLoteForm({...loteForm, reservaAte: e.target.value})} />}
              <Input label="Cliente" value={loteForm.cliente} onChange={e => setLoteForm({...loteForm, cliente: e.target.value})} />
              <Input label="Corretor" value={loteForm.corretor} onChange={e => setLoteForm({...loteForm, corretor: e.target.value})} />
            </div>
          )}
          <Button className="w-full" onClick={handleSaveLote}>Gravar Informações</Button>
        </div>
      </Modal>
    </div>
  );
};

export default App;
