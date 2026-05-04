import React, { useState, useEffect } from 'react';
import { Lock, Unlock, DollarSign } from 'lucide-react';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import type { SessionStatus, Movement } from '../types/electron';

const MySwal = withReactContent(Swal);

interface CajaProps {
    session: SessionStatus | null;
    onSessionChange: (session: SessionStatus | null) => void;
}

export default function Caja({ session, onSessionChange }: CajaProps) {
    const [montoInicial, setMontoInicial] = useState('');
    const [lastClosingAmount, setLastClosingAmount] = useState<number | null>(null);

    // Close Session State
    const [montoEfectivo, setMontoEfectivo] = useState('');
    const [montoOtros, setMontoOtros] = useState('');
    
    // Movement State
    const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
    const [movTipo, setMovTipo] = useState('ENTRADA');
    const [movCategoria, setMovCategoria] = useState('');
    const [movMonto, setMovMonto] = useState<number | ''>('');
    const [movDesc, setMovDesc] = useState('');
    const [movMetodo, setMovMetodo] = useState('EFECTIVO');
    
    const [movimientos, setMovimientos] = useState<Movement[]>([]);
    const [cajaTotal, setCajaTotal] = useState({ efectivo: 0, otros: 0 });

    useEffect(() => {
        if (!session) {
            window.api.db.getLastClosingAmount().then(amount => {
                if (amount !== null && amount !== undefined) {
                    setLastClosingAmount(amount);
                    setMontoInicial(String(amount));
                } else {
                    setLastClosingAmount(null);
                }
            }).catch(() => {});
        }
    }, [session]);

    useEffect(() => {
        if (session) {
            loadMovimientos(session.id);
            loadCajaTotal(session.id);
        }
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsMovementModalOpen(false);
        };
        window.addEventListener('keydown', handleEsc);
        
        // Polling to update caja total every 5 seconds just in case of new sales
        const interval = setInterval(() => {
            if (session) loadCajaTotal(session.id);
        }, 5000);
        
        return () => {
            window.removeEventListener('keydown', handleEsc);
            clearInterval(interval);
        };
    }, [session]);

    const loadMovimientos = async (sessionId: number) => {
        try {
            const data = await window.api.db.getMovimientos(sessionId);
            setMovimientos(data);
        } catch (e) {
            console.error(e);
        }
    };

    const loadCajaTotal = async (sessionId: number) => {
        try {
            const data = await window.api.db.getCajaActual(sessionId);
            setCajaTotal(data);
        } catch (e) {
            console.error(e);
        }
    };

    const handleOpen = async (e: React.FormEvent) => {
        e.preventDefault();
        const mi = parseFloat(montoInicial.replace(/\./g, '').replace(',', '.'));
        if (!montoInicial.trim() || isNaN(mi) || mi < 0) {
            MySwal.fire('Atención', 'Ingresa un monto inicial válido.', 'warning');
            return;
        }
        try {
            await window.api.db.openCaja(mi);
            const newSession = await window.api.db.getSessionStatus();
            onSessionChange(newSession || null);
            setMontoInicial('');
            MySwal.fire({
                icon: 'success',
                title: 'Caja abierta',
                timer: 1500,
                showConfirmButton: false,
                background: 'var(--bg-card)',
                color: 'var(--text-primary)'
            });
        } catch (error) {
            console.error("Error abriendo caja:", error);
            MySwal.fire('Error', 'Error al abrir caja.', 'error');
        }
    };

    const handleClose = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!session) return;
        const ef = parseFloat(montoEfectivo.replace(/\./g, '').replace(',', '.'));
        const ot = parseFloat(montoOtros.replace(/\./g, '').replace(',', '.'));
        if (!montoEfectivo.trim() || isNaN(ef) || !montoOtros.trim() || isNaN(ot)) {
            MySwal.fire('Atención', 'Ingresa los montos finales.', 'warning');
            return;
        }

        const result = await MySwal.fire({
            title: '¿Cerrar caja?',
            text: "Estás por cerrar el turno actual.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#334155',
            confirmButtonText: 'Sí, cerrar',
            cancelButtonText: 'Cancelar',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)'
        });

        if (result.isConfirmed) {
            try {
                await window.api.db.closeCaja({
                    sessionId: session.id,
                    montoEfectivo: ef || 0,
                    montoOtros: ot || 0
                });
                onSessionChange(null);
                setMontoEfectivo('');
                setMontoOtros('');
                MySwal.fire({
                    icon: 'success',
                    title: 'Caja cerrada con éxito.',
                    timer: 1500,
                    showConfirmButton: false,
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)'
                });
            } catch (error) {
                console.error("Error cerrando caja:", error);
                MySwal.fire('Error', 'Error al cerrar caja.', 'error');
            }
        }
    };

    const handleAddMovement = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!session) return;
        if (movMonto === '' || movMonto <= 0 || !movCategoria) {
            MySwal.fire('Faltan datos', 'Completa los campos obligatorios.', 'warning');
            return;
        }

        try {
            await window.api.db.addMovimiento({
                tipo: movTipo,
                categoria: movCategoria,
                monto: Number(movMonto),
                descripcion: movDesc,
                sesionId: session.id,
                metodoPago: movMetodo
            });
            setIsMovementModalOpen(false);
            setMovCategoria('');
            setMovMonto('');
            setMovDesc('');
            loadMovimientos(session.id);
            MySwal.fire({
                icon: 'success',
                title: 'Movimiento registrado',
                timer: 1500,
                showConfirmButton: false,
                background: 'var(--bg-card)',
                color: 'var(--text-primary)'
            });
        } catch (error) {
            console.error("Error adding movement:", error);
            MySwal.fire('Error', 'Error al registrar movimiento.', 'error');
        }
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'stretch', flex: 1, minHeight: 0 }}>
                {/* Panel Izquierdo: Estado y Acciones de Caja */}
                <div style={{ flex: 1, backgroundColor: 'var(--bg-card)', padding: '30px', borderRadius: '16px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {session ? <Unlock color="#4ade80" /> : <Lock color="#f87171" />}
                        Estado de Caja
                    </h3>
                    
                    {!session ? (
                        <form onSubmit={handleOpen} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div style={{ padding: '20px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', color: '#f87171', textAlign: 'center', marginBottom: '10px' }}>
                                La caja está cerrada. Debes abrirla para comenzar a operar.
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)' }}>Monto Inicial ($)</label>
                                <input
                                    type="number"
                                    step="1"
                                    min="0"
                                    required
                                    value={montoInicial}
                                    onChange={e => setMontoInicial(e.target.value)}
                                    style={{ width: '100%', padding: '15px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '1.1rem', boxSizing: 'border-box' }}
                                />
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ backgroundColor: '#22c55e', padding: '15px', fontSize: '1.1rem', marginTop: '10px' }}>
                                Abrir Caja
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleClose} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                                <div style={{ padding: '15px', backgroundColor: 'var(--bg-main)', border: '2px solid #4ade80', borderRadius: '12px', textAlign: 'center' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>Efectivo</span>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#4ade80', margin: '5px 0' }}>
                                        ${cajaTotal.efectivo.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                </div>
                                <div style={{ padding: '15px', backgroundColor: 'var(--bg-main)', border: '2px solid #60a5fa', borderRadius: '12px', textAlign: 'center' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>Otros (QR/Tarj)</span>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#60a5fa', margin: '5px 0' }}>
                                        ${cajaTotal.otros.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                </div>
                            </div>

                            <div style={{ padding: '15px', backgroundColor: 'rgba(34, 197, 94, 0.1)', borderRadius: '8px', color: '#4ade80', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <strong>Caja Abierta</strong><br/>
                                    <span style={{ fontSize: '0.85rem' }}>Desde: {new Date(session.fecha_apertura).toLocaleString()}</span>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <span style={{ fontSize: '0.85rem' }}>Monto Inicial</span><br/>
                                    <strong>${session.monto_inicial.toLocaleString()}</strong>
                                </div>
                            </div>
                            
                            <div style={{ marginBottom: '10px' }}>
                                <div style={{ marginBottom: '15px' }}>
                                    <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)' }}>Efectivo en Caja al cierre ($)</label>
                                    <input 
                                        type="number" 
                                        step="1" 
                                        required 
                                        value={montoEfectivo} 
                                        onChange={e => setMontoEfectivo(e.target.value)}
                                        style={{ width: '100%', padding: '15px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '1.1rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                        <label style={{ color: 'var(--text-secondary)' }}>Total cobrado por otros medios ($)</label>
                                        <button 
                                            type="button"
                                            onClick={async () => {
                                                if (session) {
                                                    const sug = await window.api.db.getTotalesSugeridos(session.id);
                                                    setMontoEfectivo(Math.round(sug.efectivo).toString());
                                                    setMontoOtros(Math.round(sug.otros).toString());
                                                }
                                            }}
                                            style={{ fontSize: '0.75rem', backgroundColor: 'rgba(96, 165, 250, 0.1)', color: '#60a5fa', border: '1px solid #60a5fa', padding: '2px 8px', borderRadius: '4px', cursor: 'pointer' }}
                                        >
                                            Sugerir montos
                                        </button>
                                    </div>
                                    <input 
                                        type="number" 
                                        step="1" 
                                        required 
                                        value={montoOtros} 
                                        onChange={e => setMontoOtros(e.target.value)}
                                        style={{ width: '100%', padding: '15px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '1.1rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ backgroundColor: '#ef4444', padding: '15px', fontSize: '1.1rem' }}>
                                Cerrar Caja
                            </button>
                        </form>
                    )}
                </div>

                {/* Panel Derecho: Movimientos */}
                <div style={{ flex: 1, backgroundColor: 'var(--bg-card)', padding: '30px', borderRadius: '16px', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <DollarSign color="#60a5fa" />
                            Movimientos de Dinero
                        </h3>
                        <button 
                            className="btn btn-primary" 
                            onClick={() => setIsMovementModalOpen(true)}
                            disabled={!session}
                            style={{ padding: '8px 15px' }}
                        >
                            Nuevo
                        </button>
                    </div>
                    
                    <div className="data-table-container" style={{ flex: 1, overflowY: 'auto' }}>
                        <table style={{ width: '100%' }}>
                            <thead>
                                <tr>
                                    <th>Hora</th>
                                    <th>Tipo</th>
                                    <th>Método</th>
                                    <th>Categoría</th>
                                    <th>Descripción</th>
                                    <th style={{ textAlign: 'right' }}>Monto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {!session ? (
                                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px' }}>Abre la caja para ver y registrar movimientos.</td></tr>
                                ) : movimientos.length === 0 ? (
                                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px' }}>No hay movimientos en esta sesión.</td></tr>
                                ) : movimientos.map((mov, idx) => (
                                    <tr key={idx}>
                                        <td style={{ color: 'var(--text-secondary)' }}>{new Date(mov.fecha).toLocaleTimeString()}</td>
                                        <td>
                                            <span style={{ 
                                                padding: '4px 10px', 
                                                borderRadius: '20px', 
                                                fontSize: '0.75rem', 
                                                fontWeight: 700,
                                                backgroundColor: mov.tipo === 'ENTRADA' ? 'rgba(34, 197, 94, 0.1)' : 
                                                                mov.tipo === 'VENTA' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                                color: mov.tipo === 'ENTRADA' ? '#22c55e' : 
                                                       mov.tipo === 'VENTA' ? '#3b82f6' : '#ef4444'
                                            }}>
                                                {mov.tipo}
                                            </span>
                                        </td>
                                        <td>
                                            <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{mov.metodo_pago}</span>
                                        </td>
                                        <td>{mov.categoria}</td>
                                        <td>{mov.descripcion}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 700, color: mov.tipo === 'SALIDA' ? '#ef4444' : '#22c55e' }}>
                                            {mov.tipo === 'SALIDA' ? '-' : '+'}${mov.monto.toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modal de Movimiento */}
            {isMovementModalOpen && session && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'var(--bg-card)', padding: '30px', borderRadius: '16px', width: '450px', border: '1px solid var(--border)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.5rem', fontWeight: 600 }}>Registrar Movimiento</h3>
                        <form onSubmit={handleAddMovement} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Tipo de Movimiento</label>
                                <select 
                                    value={movTipo} 
                                    onChange={e => setMovTipo(e.target.value)}
                                    style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)' }}
                                >
                                    <option value="ENTRADA">Entrada de Dinero (Suma a caja)</option>
                                    <option value="SALIDA">Salida de Dinero (Resta a caja)</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Medio de Pago</label>
                                <select 
                                    value={movMetodo} 
                                    onChange={e => setMovMetodo(e.target.value)}
                                    style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)' }}
                                >
                                    <option value="EFECTIVO">Efectivo</option>
                                    <option value="OTROS">Otros (QR/Tarjeta)</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Categoría *</label>
                                <input 
                                    type="text" 
                                    required 
                                    placeholder="Ej: Pago a proveedor, Retiro dueño..."
                                    value={movCategoria} 
                                    onChange={e => setMovCategoria(e.target.value)} 
                                    style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }} 
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Monto ($) *</label>
                                <input 
                                    type="number" 
                                    step="1" 
                                    required 
                                    value={movMonto} 
                                    onChange={e => setMovMonto(e.target.value ? Number(e.target.value) : '')} 
                                    style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }} 
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Descripción (Opcional)</label>
                                <textarea 
                                    rows={3}
                                    value={movDesc} 
                                    onChange={e => setMovDesc(e.target.value)} 
                                    style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box', resize: 'none' }} 
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                <button type="button" className="btn" onClick={() => setIsMovementModalOpen(false)} style={{ backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">Registrar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
