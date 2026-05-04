import { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Package,
  BarChart3,
  Users,
  ShoppingCart,
  Wallet,
  Moon,
  Sun,
  Settings,
} from 'lucide-react';
import type { SessionStatus } from './types/electron';
import { useShortcuts } from './hooks/useShortcuts';

// Components
import Ventas from './components/Ventas';
import Inventario from './components/Inventario';
import Reportes from './components/Reportes';
import Clientes from './components/Clientes';
import Caja from './components/Caja';
import Configuracion from './components/Configuracion';

function App() {
  const [activeTab, setActiveTab] = useState('venta');
  const [session, setSession] = useState<SessionStatus | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const { shortcuts, setShortcut, resetShortcuts } = useShortcuts();

  useEffect(() => {
    document.body.className = theme;
  }, [theme]);

  useEffect(() => {
    loadSession();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === shortcuts.tabVentas)    setActiveTab('venta');
      if (e.key === shortcuts.tabInventario) setActiveTab('inventario');
      if (e.key === shortcuts.tabReportes)  setActiveTab('reportes');
      if (e.key === shortcuts.tabClientes)  setActiveTab('clientes');
      if (e.key === shortcuts.tabCaja)      setActiveTab('caja');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);

  const loadSession = async () => {
    try {
      const sessionData = await window.api.db.getSessionStatus();
      setSession(sessionData || null);
    } catch (error) {
      console.error('Error loading session:', error);
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <ShoppingBag className="text-primary" size={28} />
          <h1>Kiosco Pro</h1>
        </div>

        <nav>
          <div className={`nav-item ${activeTab === 'venta' ? 'active' : ''}`} onClick={() => setActiveTab('venta')}>
            <ShoppingCart size={20} />
            <span>Ventas ({shortcuts.tabVentas})</span>
          </div>
          <div className={`nav-item ${activeTab === 'inventario' ? 'active' : ''}`} onClick={() => setActiveTab('inventario')}>
            <Package size={20} />
            <span>Inventario ({shortcuts.tabInventario})</span>
          </div>
          <div className={`nav-item ${activeTab === 'caja' ? 'active' : ''}`} onClick={() => setActiveTab('caja')}>
            <Wallet size={20} />
            <span>Caja ({shortcuts.tabCaja})</span>
          </div>
          <div className={`nav-item ${activeTab === 'clientes' ? 'active' : ''}`} onClick={() => setActiveTab('clientes')}>
            <Users size={20} />
            <span>Clientes/Fiados ({shortcuts.tabClientes})</span>
          </div>
          <div className={`nav-item ${activeTab === 'reportes' ? 'active' : ''}`} onClick={() => setActiveTab('reportes')}>
            <BarChart3 size={20} />
            <span>Reportes ({shortcuts.tabReportes})</span>
          </div>
          <div className={`nav-item ${activeTab === 'configuracion' ? 'active' : ''}`} onClick={() => setActiveTab('configuracion')}>
            <Settings size={20} />
            <span>Configuración</span>
          </div>
        </nav>

        <div style={{ marginTop: 'auto', padding: '0 24px' }}>
            <div style={{
                padding: '12px',
                backgroundColor: session ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                borderRadius: '8px',
                fontSize: '0.8rem',
                color: session ? '#4ade80' : '#f87171',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '15px'
            }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: session ? '#22c55e' : '#ef4444' }} />
                {session ? 'CAJA ABIERTA' : 'CAJA CERRADA'}
            </div>
            <div className="nav-item" style={{ paddingLeft: 0 }} onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}>
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                <span>{theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}</span>
            </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="header" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2>
              {activeTab === 'caja' ? 'CAJA' :
               activeTab === 'configuracion' ? 'CONFIGURACIÓN' :
               activeTab.toUpperCase()}
            </h2>
          </div>
        </header>

        <div style={{ flex: 1, overflow: 'hidden' }}>
            {activeTab === 'venta'         && <Ventas session={session} quickPayKey={shortcuts.pagarEfectivo} />}
            {activeTab === 'inventario'    && <Inventario />}
            {activeTab === 'caja'          && <Caja session={session} onSessionChange={setSession} />}
            {activeTab === 'clientes'      && <Clientes />}
            {activeTab === 'reportes'      && <Reportes />}
            {activeTab === 'configuracion' && (
                <Configuracion
                    shortcuts={shortcuts}
                    onShortcutChange={setShortcut}
                    onReset={resetShortcuts}
                />
            )}
        </div>
      </main>
    </div>
  );
}

export default App;
