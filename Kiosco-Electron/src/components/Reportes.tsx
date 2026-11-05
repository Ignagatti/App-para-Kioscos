import { useState, useEffect } from 'react';
import {
    Calendar, Trash2, Package, Receipt, ArrowUpDown,
    X, Search, ChevronDown, ChevronUp, Clock
} from 'lucide-react';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import type { ReportDetail, SessionFullDetail } from '../types/electron';

const MySwal = withReactContent(Swal);

function fmtMoney(n: number) {
    return `$${Math.round(n || 0).toLocaleString('es-AR')}`;
}

function fmtCant(n: number, esPorKilo?: number) {
    if (esPorKilo) {
        return `${parseFloat((n || 0).toFixed(3))} kg`;
    }
    return `${Number.isInteger(n) ? n : n.toFixed(2)} uds`;
}

function formatDuration(start: string, end: string | null) {
    if (!end) return 'En curso';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (isNaN(ms) || ms < 0) return '-';
    const totalMins = Math.floor(ms / 60000);
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hrs === 0) return `${mins}m`;
    return `${hrs}h ${mins}m`;
}

export default function Reportes() {
    const [detailData, setDetailData] = useState<ReportDetail[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchFilter, setSearchFilter] = useState('');

    // Selected Session Modal State
    const [selectedSession, setSelectedSession] = useState<ReportDetail | null>(null);
    const [sessionFull, setSessionFull] = useState<SessionFullDetail | null>(null);
    const [loadingModal, setLoadingModal] = useState(false);
    const [modalTab, setModalTab] = useState<'productos' | 'tickets' | 'movimientos'>('productos');
    const [productSearch, setProductSearch] = useState('');
    const [expandedSaleId, setExpandedSaleId] = useState<number | null>(null);

    useEffect(() => {
        loadData();
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setSelectedSession(null);
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await window.api.db.getReportDetail();
            setDetailData(data);
        } catch (error) {
            console.error('Error loading reports:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenSessionDetail = async (row: ReportDetail) => {
        setSelectedSession(row);
        setModalTab('productos');
        setProductSearch('');
        setExpandedSaleId(null);
        setLoadingModal(true);
        try {
            if (window.api.db.getSessionFullDetail) {
                const full = await window.api.db.getSessionFullDetail(row.id);
                setSessionFull(full);
            } else {
                // Fallback si no se reinició el proceso principal de Electron aún
                const sales = await window.api.db.getSalesForSession(row.id);
                const movs = await window.api.db.getMovimientos(row.id);
                const ventasWithDetails = await Promise.all(
                    sales.map(async (s) => {
                        const detalles = await window.api.db.getSaleDetails(s.id);
                        return { ...s, detalles };
                    })
                );
                const prodMap = new Map<string, {
                    nombre: string;
                    categoria: string;
                    es_por_kilo: number;
                    cantidad_total: number;
                    precio_unitario: number;
                    subtotal_total: number;
                    costo_total: number;
                    ganancia_total: number;
                }>();

                for (const v of ventasWithDetails) {
                    for (const d of v.detalles) {
                        const prev = prodMap.get(d.nombre);
                        const costo = (d.costo_unitario || 0) * d.cantidad;
                        const gan = d.subtotal - costo;
                        if (prev) {
                            prev.cantidad_total += d.cantidad;
                            prev.subtotal_total += d.subtotal;
                            prev.costo_total += costo;
                            prev.ganancia_total += gan;
                        } else {
                            prodMap.set(d.nombre, {
                                nombre: d.nombre,
                                categoria: 'General',
                                es_por_kilo: Number.isInteger(d.cantidad) ? 0 : 1,
                                cantidad_total: d.cantidad,
                                precio_unitario: d.precio,
                                subtotal_total: d.subtotal,
                                costo_total: costo,
                                ganancia_total: gan,
                            });
                        }
                    }
                }
                setSessionFull({
                    productos: Array.from(prodMap.values()).sort((a, b) => b.subtotal_total - a.subtotal_total),
                    ventas: ventasWithDetails,
                    movimientos: movs.filter(m => m.tipo !== 'VENTA'),
                });
            }
        } catch (error) {
            console.error('Error loading session detail:', error);
        } finally {
            setLoadingModal(false);
        }
    };

    const handleClearHistory = async () => {
        const result = await MySwal.fire({
            title: '¿Vaciar el historial de cierres?',
            text: "Se borrarán todos los cierres de caja cerrados y sus ventas asociadas. Esta acción no se puede deshacer.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#c44d4d',
            cancelButtonColor: '#3a3f3c',
            confirmButtonText: 'Sí, borrar historial',
            cancelButtonText: 'Cancelar',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)'
        });

        if (result.isConfirmed) {
            await window.api.db.clearHistory();
            await loadData();
            MySwal.fire({
                icon: 'success',
                title: 'Historial vaciado',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                timer: 1500,
                showConfirmButton: false
            });
        }
    };

    const filteredRows = detailData.filter(row => {
        if (!searchFilter.trim()) return true;
        const q = searchFilter.toLowerCase();
        const aperturaStr = new Date(row.fecha_apertura).toLocaleString('es-AR').toLowerCase();
        const cierreStr = row.fecha_cierre ? new Date(row.fecha_cierre).toLocaleString('es-AR').toLowerCase() : 'abierta';
        const topProd = (row.top_producto || '').toLowerCase();
        return aperturaStr.includes(q) || cierreStr.includes(q) || topProd.includes(q) || `#${row.id}`.includes(q);
    });

    const totalHistoricoVentas = detailData.reduce((acc, r) => acc + (r.total_ventas || 0), 0);
    const totalHistoricoGanancia = detailData.reduce((acc, r) => acc + (r.ganancia || 0), 0);
    const totalTickets = detailData.reduce((acc, r) => acc + (r.cantidad_ventas || 0), 0);

    const filteredModalProducts = (sessionFull?.productos || []).filter(p =>
        p.nombre.toLowerCase().includes(productSearch.toLowerCase()) ||
        (p.categoria || '').toLowerCase().includes(productSearch.toLowerCase())
    );

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Resumen Superior */}
            <div className="stats-grid" style={{ marginBottom: 0 }}>
                <div className="stat-card" style={{ padding: '18px 22px' }}>
                    <span className="label">Turnos / Cierres Registrados</span>
                    <span className="value">{detailData.length}</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {totalTickets} ventas en total
                    </span>
                </div>
                <div className="stat-card" style={{ padding: '18px 22px' }}>
                    <span className="label">Facturación Acumulada</span>
                    <span className="value" style={{ color: 'var(--primary-light)' }}>
                        {fmtMoney(totalHistoricoVentas)}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        Promedio {fmtMoney(detailData.length ? totalHistoricoVentas / detailData.length : 0)} por turno
                    </span>
                </div>
                <div className="stat-card" style={{ padding: '18px 22px' }}>
                    <span className="label">Ganancia Neta Acumulada</span>
                    <span className="value" style={{ color: 'var(--success-light)' }}>
                        {fmtMoney(totalHistoricoGanancia)}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        Margen prom. {totalHistoricoVentas > 0 ? `${Math.round((totalHistoricoGanancia / totalHistoricoVentas) * 100)}%` : '0%'}
                    </span>
                </div>
            </div>

            {/* Barra de búsqueda + Vaciar */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    <input
                        type="text"
                        placeholder="Filtrar cierres por fecha (ej: 05/11), #turno o producto más vendido..."
                        value={searchFilter}
                        onChange={e => setSearchFilter(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '12px 14px 12px 42px',
                            backgroundColor: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: '10px',
                            color: 'var(--text-primary)',
                            fontSize: '0.92rem',
                            boxSizing: 'border-box',
                        }}
                    />
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', padding: '0 6px' }}>
                    Hacé clic en un cierre para ver todo lo que se vendió ese día
                </div>
                <button
                    className="btn"
                    onClick={handleClearHistory}
                    style={{
                        padding: '11px 16px',
                        backgroundColor: 'rgba(196, 77, 77, 0.12)',
                        color: 'var(--danger-light)',
                        border: '1px solid var(--danger)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '0.85rem',
                        flexShrink: 0,
                    }}
                >
                    <Trash2 size={16} />
                    Vaciar Cierres
                </button>
            </div>

            {/* Tabla Principal de Cierres de Caja */}
            <div className="data-table-container" style={{ flex: 1, overflowY: 'auto' }}>
                <table style={{ width: '100%' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-card)', zIndex: 1 }}>
                        <tr>
                            <th>Turno / Fecha</th>
                            <th>Actividad del Día</th>
                            <th style={{ textAlign: 'right' }}>Ventas Efectivo</th>
                            <th style={{ textAlign: 'right' }}>Otros / Fiado</th>
                            <th style={{ textAlign: 'right' }}>Arqueo Efectivo</th>
                            <th style={{ textAlign: 'right' }}>Total Vendido</th>
                            <th style={{ textAlign: 'right' }}>Ganancia Neta</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px' }}>Cargando cierres de caja...</td></tr>
                        ) : filteredRows.length === 0 ? (
                            <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>No hay cierres de caja registrados.</td></tr>
                        ) : filteredRows.map(row => {
                            const isAbierta = row.estado === 'ABIERTA' || !row.fecha_cierre;
                            const ventasEf = row.ventas_efectivo ?? 0;
                            const ventasOt = row.ventas_otros ?? 0;
                            const ventasFi = row.ventas_fiado ?? 0;
                            const esperadoEf = (row.monto_inicial || 0) + ventasEf + (row.entradas_efectivo || 0) - (row.salidas_efectivo || 0);
                            const diferenciaEf = isAbierta ? 0 : Math.round((row.monto_final_efectivo || 0) - esperadoEf);
                            const margenPct = (row.total_ventas || 0) > 0
                                ? Math.round(((row.ganancia || 0) / row.total_ventas) * 100)
                                : 0;

                            return (
                                <tr
                                    key={row.id}
                                    onClick={() => handleOpenSessionDetail(row)}
                                    style={{ cursor: 'pointer', transition: 'background-color 0.15s' }}
                                    title="Hacé clic para ver el detalle de productos vendidos y tickets de este turno"
                                >
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                                                {new Date(row.fecha_apertura).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                            </span>
                                            {isAbierta ? (
                                                <span className="badge badge-ok" style={{ fontSize: '0.68rem' }}>EN CURSO</span>
                                            ) : (
                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>#{row.id}</span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                                            {new Date(row.fecha_apertura).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                            {' → '}
                                            {row.fecha_cierre
                                                ? new Date(row.fecha_cierre).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                                                : 'Abierta'}
                                            {' · '}
                                            <span>{formatDuration(row.fecha_apertura, row.fecha_cierre)}</span>
                                        </div>
                                    </td>

                                    <td>
                                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                            {row.cantidad_ventas ?? 0} ventas
                                            <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: '6px', fontSize: '0.8rem' }}>
                                                ({Math.round((row.unidades_vendidas || 0) * 100) / 100} ítems)
                                            </span>
                                        </div>
                                        {row.top_producto && (
                                            <div style={{ fontSize: '0.76rem', color: 'var(--primary-light)', marginTop: '2px' }}>
                                                ★ Más salió: {row.top_producto}
                                            </div>
                                        )}
                                    </td>

                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--success-light)' }}>{fmtMoney(ventasEf)}</div>
                                        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                                            Inicio: {fmtMoney(row.monto_inicial || 0)}
                                        </div>
                                    </td>

                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--accent)' }}>
                                            Otros: {fmtMoney(ventasOt)}
                                        </div>
                                        {ventasFi > 0 && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--warning)' }}>
                                                Fiado: {fmtMoney(ventasFi)}
                                            </div>
                                        )}
                                    </td>

                                    <td style={{ textAlign: 'right' }}>
                                        {isAbierta ? (
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                Esperado: {fmtMoney(esperadoEf)}
                                            </span>
                                        ) : (
                                            <>
                                                <div style={{ fontWeight: 600 }}>{fmtMoney(row.monto_final_efectivo || 0)}</div>
                                                <div style={{
                                                    fontSize: '0.74rem',
                                                    fontWeight: 600,
                                                    color: diferenciaEf === 0
                                                        ? 'var(--text-secondary)'
                                                        : diferenciaEf > 0
                                                            ? 'var(--success-light)'
                                                            : 'var(--danger-light)'
                                                }}>
                                                    {diferenciaEf === 0
                                                        ? 'Arqueo exacto'
                                                        : diferenciaEf > 0
                                                            ? `+${fmtMoney(diferenciaEf)} sobrante`
                                                            : `${fmtMoney(diferenciaEf)} faltante`}
                                                </div>
                                            </>
                                        )}
                                    </td>

                                    <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '1rem' }}>
                                        {fmtMoney(row.total_ventas || 0)}
                                    </td>

                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{
                                            fontWeight: 700,
                                            fontSize: '0.98rem',
                                            color: (row.ganancia || 0) >= 0 ? 'var(--success-light)' : 'var(--danger-light)'
                                        }}>
                                            {fmtMoney(row.ganancia || 0)}
                                        </div>
                                        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                                            {margenPct}% margen
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Modal de Detalle Completo del Cierre / Día */}
            {selectedSession && (
                <div
                    onClick={() => setSelectedSession(null)}
                    style={{
                        position: 'fixed',
                        top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.78)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        padding: '24px',
                        backdropFilter: 'blur(3px)',
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            backgroundColor: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: '18px',
                            width: '960px',
                            maxWidth: '95vw',
                            height: '86vh',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.65)',
                            overflow: 'hidden',
                        }}
                    >
                        {/* Cabecera del Modal */}
                        <div style={{
                            padding: '22px 28px',
                            borderBottom: '1px solid var(--border)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            backgroundColor: 'var(--bg-sidebar)',
                        }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Calendar size={20} color="var(--primary-light)" />
                                    <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>
                                        Resumen del Turno #{selectedSession.id} — {new Date(selectedSession.fecha_apertura).toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                                    </h3>
                                    {(selectedSession.estado === 'ABIERTA' || !selectedSession.fecha_cierre) && (
                                        <span className="badge badge-ok">CAJA EN CURSO</span>
                                    )}
                                </div>
                                <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginTop: '5px', display: 'flex', gap: '16px' }}>
                                    <span>
                                        <Clock size={13} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                                        Apertura: <strong>{new Date(selectedSession.fecha_apertura).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</strong>
                                    </span>
                                    <span>
                                        Cierre: <strong>{selectedSession.fecha_cierre ? new Date(selectedSession.fecha_cierre).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : 'Abierta actualmente'}</strong>
                                    </span>
                                    <span>
                                        Duración: <strong>{formatDuration(selectedSession.fecha_apertura, selectedSession.fecha_cierre)}</strong>
                                    </span>
                                </div>
                            </div>
                            <button
                                className="btn"
                                onClick={() => setSelectedSession(null)}
                                style={{ backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '8px' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Tarjetas de Desglose Financiero del Turno */}
                        {(() => {
                            const s = selectedSession;
                            const isAbierta = s.estado === 'ABIERTA' || !s.fecha_cierre;
                            const esperadoEf = (s.monto_inicial || 0) + (s.ventas_efectivo || 0) + (s.entradas_efectivo || 0) - (s.salidas_efectivo || 0);
                            const difEf = isAbierta ? 0 : Math.round((s.monto_final_efectivo || 0) - esperadoEf);

                            return (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(5, 1fr)',
                                    gap: '12px',
                                    padding: '18px 28px',
                                    borderBottom: '1px solid var(--border)',
                                    backgroundColor: 'var(--bg-main)',
                                }}>
                                    <div style={{ padding: '12px 14px', backgroundColor: 'var(--bg-card)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Total Vendido</div>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 700, marginTop: '4px' }}>{fmtMoney(s.total_ventas || 0)}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                            {s.cantidad_ventas ?? 0} tickets · {Math.round((s.unidades_vendidas || 0) * 100) / 100} ítems
                                        </div>
                                    </div>

                                    <div style={{ padding: '12px 14px', backgroundColor: 'var(--bg-card)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Ganancia Limpia</div>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--success-light)', marginTop: '4px' }}>{fmtMoney(s.ganancia || 0)}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                            Costo mercadería: {fmtMoney(s.costo_total || 0)}
                                        </div>
                                    </div>

                                    <div style={{ padding: '12px 14px', backgroundColor: 'var(--bg-card)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Por Medio de Pago</div>
                                        <div style={{ fontSize: '0.8rem', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            <span>Efectivo: <strong style={{ color: 'var(--success-light)' }}>{fmtMoney(s.ventas_efectivo || 0)}</strong></span>
                                            <span>Otros/QR: <strong style={{ color: 'var(--accent)' }}>{fmtMoney(s.ventas_otros || 0)}</strong></span>
                                            <span>Fiado: <strong style={{ color: 'var(--warning)' }}>{fmtMoney(s.ventas_fiado || 0)}</strong></span>
                                        </div>
                                    </div>

                                    <div style={{ padding: '12px 14px', backgroundColor: 'var(--bg-card)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Caja y Movimientos</div>
                                        <div style={{ fontSize: '0.8rem', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            <span>Inicio: <strong>{fmtMoney(s.monto_inicial || 0)}</strong></span>
                                            <span>Entradas: <strong style={{ color: 'var(--success-light)' }}>+{fmtMoney(s.entradas_manuales || 0)}</strong></span>
                                            <span>Salidas: <strong style={{ color: 'var(--danger-light)' }}>-{fmtMoney(s.salidas_manuales || 0)}</strong></span>
                                        </div>
                                    </div>

                                    <div style={{ padding: '12px 14px', backgroundColor: 'var(--bg-card)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Arqueo Efectivo</div>
                                        <div style={{ fontSize: '0.8rem', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            <span>Esperado: <strong>{fmtMoney(esperadoEf)}</strong></span>
                                            <span>Declarado: <strong>{isAbierta ? 'En curso' : fmtMoney(s.monto_final_efectivo || 0)}</strong></span>
                                            {!isAbierta && (
                                                <span style={{
                                                    fontWeight: 700,
                                                    color: difEf === 0 ? 'var(--text-secondary)' : difEf > 0 ? 'var(--success-light)' : 'var(--danger-light)'
                                                }}>
                                                    {difEf === 0 ? '✓ Exacto' : difEf > 0 ? `+${fmtMoney(difEf)} sobra` : `${fmtMoney(difEf)} falta`}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Pestañas del Modal */}
                        <div style={{
                            display: 'flex',
                            gap: '10px',
                            padding: '14px 28px',
                            borderBottom: '1px solid var(--border)',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }}>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    className="btn"
                                    onClick={() => setModalTab('productos')}
                                    style={{
                                        padding: '8px 16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        fontSize: '0.88rem',
                                        backgroundColor: modalTab === 'productos' ? 'var(--primary)' : 'var(--bg-main)',
                                        color: modalTab === 'productos' ? '#fff' : 'var(--text-secondary)',
                                        border: `1px solid ${modalTab === 'productos' ? 'var(--primary)' : 'var(--border)'}`,
                                    }}
                                >
                                    <Package size={16} />
                                    Productos Vendidos ({sessionFull?.productos.length ?? 0})
                                </button>
                                <button
                                    className="btn"
                                    onClick={() => setModalTab('tickets')}
                                    style={{
                                        padding: '8px 16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        fontSize: '0.88rem',
                                        backgroundColor: modalTab === 'tickets' ? 'var(--primary)' : 'var(--bg-main)',
                                        color: modalTab === 'tickets' ? '#fff' : 'var(--text-secondary)',
                                        border: `1px solid ${modalTab === 'tickets' ? 'var(--primary)' : 'var(--border)'}`,
                                    }}
                                >
                                    <Receipt size={16} />
                                    Tickets Individuales ({sessionFull?.ventas.length ?? 0})
                                </button>
                                <button
                                    className="btn"
                                    onClick={() => setModalTab('movimientos')}
                                    style={{
                                        padding: '8px 16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        fontSize: '0.88rem',
                                        backgroundColor: modalTab === 'movimientos' ? 'var(--primary)' : 'var(--bg-main)',
                                        color: modalTab === 'movimientos' ? '#fff' : 'var(--text-secondary)',
                                        border: `1px solid ${modalTab === 'movimientos' ? 'var(--primary)' : 'var(--border)'}`,
                                    }}
                                >
                                    <ArrowUpDown size={16} />
                                    Entradas / Salidas ({sessionFull?.movimientos.length ?? 0})
                                </button>
                            </div>

                            {modalTab === 'productos' && (
                                <div style={{ position: 'relative', width: '260px' }}>
                                    <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                                    <input
                                        type="text"
                                        placeholder="Buscar producto vendido..."
                                        value={productSearch}
                                        onChange={e => setProductSearch(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '7px 10px 7px 32px',
                                            backgroundColor: 'var(--bg-main)',
                                            border: '1px solid var(--border)',
                                            borderRadius: '8px',
                                            color: 'var(--text-primary)',
                                            fontSize: '0.84rem',
                                            boxSizing: 'border-box',
                                        }}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Contenido de la Pestaña Seleccionada */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
                            {loadingModal ? (
                                <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-secondary)' }}>
                                    Cargando detalle de ventas del día...
                                </div>
                            ) : modalTab === 'productos' ? (
                                filteredModalProducts.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-secondary)' }}>
                                        No se registraron productos vendidos en este turno.
                                    </div>
                                ) : (
                                    <div className="data-table-container">
                                        <table style={{ width: '100%' }}>
                                            <thead>
                                                <tr>
                                                    <th>Producto</th>
                                                    <th>Categoría</th>
                                                    <th style={{ textAlign: 'right' }}>Cantidad Vendida</th>
                                                    <th style={{ textAlign: 'right' }}>Precio Prom.</th>
                                                    <th style={{ textAlign: 'right' }}>Costo Total</th>
                                                    <th style={{ textAlign: 'right' }}>Total Vendido</th>
                                                    <th style={{ textAlign: 'right' }}>Ganancia</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredModalProducts.map((p, idx) => {
                                                    const margen = p.subtotal_total > 0
                                                        ? Math.round((p.ganancia_total / p.subtotal_total) * 100)
                                                        : 0;
                                                    return (
                                                        <tr key={idx}>
                                                            <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                                                            <td>
                                                                <span className="badge" style={{ backgroundColor: 'var(--bg-main)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                                                                    {p.categoria || 'Varios'}
                                                                </span>
                                                            </td>
                                                            <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary-light)' }}>
                                                                {fmtCant(p.cantidad_total, p.es_por_kilo)}
                                                            </td>
                                                            <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                                                                {fmtMoney(p.precio_unitario)}
                                                            </td>
                                                            <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                                                                {fmtMoney(p.costo_total)}
                                                            </td>
                                                            <td style={{ textAlign: 'right', fontWeight: 700 }}>
                                                                {fmtMoney(p.subtotal_total)}
                                                            </td>
                                                            <td style={{ textAlign: 'right' }}>
                                                                <span style={{ fontWeight: 700, color: 'var(--success-light)' }}>
                                                                    {fmtMoney(p.ganancia_total)}
                                                                </span>
                                                                <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginLeft: '6px' }}>
                                                                    ({margen}%)
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )
                            ) : modalTab === 'tickets' ? (
                                (sessionFull?.ventas.length ?? 0) === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-secondary)' }}>
                                        No hay tickets registrados en este turno.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {sessionFull!.ventas.map(v => {
                                            const isExpanded = expandedSaleId === v.id;
                                            const metodoUpper = (v.metodo_pago || '').toUpperCase();
                                            const badgeColor = metodoUpper === 'EFECTIVO'
                                                ? 'var(--success-light)'
                                                : metodoUpper === 'OTROS'
                                                    ? 'var(--accent)'
                                                    : 'var(--warning)';

                                            return (
                                                <div
                                                    key={v.id}
                                                    style={{
                                                        backgroundColor: 'var(--bg-main)',
                                                        border: '1px solid var(--border)',
                                                        borderRadius: '12px',
                                                        overflow: 'hidden',
                                                    }}
                                                >
                                                    <div
                                                        onClick={() => setExpandedSaleId(isExpanded ? null : v.id)}
                                                        style={{
                                                            padding: '14px 18px',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                            <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                                                                #{v.id}
                                                            </span>
                                                            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                                                                {new Date(v.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs
                                                            </span>
                                                            <span style={{
                                                                padding: '3px 10px',
                                                                borderRadius: '6px',
                                                                fontSize: '0.74rem',
                                                                fontWeight: 700,
                                                                border: `1px solid ${badgeColor}`,
                                                                color: badgeColor,
                                                            }}>
                                                                {v.metodo_pago}
                                                            </span>
                                                            {v.cliente_nombre && (
                                                                <span style={{ fontSize: '0.82rem', color: 'var(--warning)' }}>
                                                                    Cliente: <strong>{v.cliente_nombre}</strong>
                                                                </span>
                                                            )}
                                                            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                                                {v.detalles?.map(d => `${d.nombre} (x${Number.isInteger(d.cantidad) ? d.cantidad : d.cantidad.toFixed(2)})`).join(', ')}
                                                            </span>
                                                        </div>

                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                                                            <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                                                                {fmtMoney(v.total)}
                                                            </span>
                                                            {isExpanded ? <ChevronUp size={18} color="var(--text-secondary)" /> : <ChevronDown size={18} color="var(--text-secondary)" />}
                                                        </div>
                                                    </div>

                                                    {isExpanded && v.detalles && (
                                                        <div style={{
                                                            padding: '12px 18px',
                                                            borderTop: '1px solid var(--border)',
                                                            backgroundColor: 'var(--bg-card)',
                                                        }}>
                                                            <table style={{ width: '100%', fontSize: '0.85rem' }}>
                                                                <thead>
                                                                    <tr>
                                                                        <th style={{ padding: '8px' }}>Producto</th>
                                                                        <th style={{ padding: '8px', textAlign: 'right' }}>Cantidad</th>
                                                                        <th style={{ padding: '8px', textAlign: 'right' }}>Precio Unit.</th>
                                                                        <th style={{ padding: '8px', textAlign: 'right' }}>Subtotal</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {v.detalles.map((d, i) => (
                                                                        <tr key={i}>
                                                                            <td style={{ padding: '8px', fontWeight: 600 }}>{d.nombre}</td>
                                                                            <td style={{ padding: '8px', textAlign: 'right' }}>
                                                                                {Number.isInteger(d.cantidad) ? d.cantidad : `${(d.cantidad * 1000).toFixed(0)}g`}
                                                                            </td>
                                                                            <td style={{ padding: '8px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                                                                                {fmtMoney(d.precio)}
                                                                            </td>
                                                                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: 'var(--primary-light)' }}>
                                                                                {fmtMoney(d.subtotal)}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )
                            ) : (
                                (sessionFull?.movimientos.length ?? 0) === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-secondary)' }}>
                                        No hubo entradas ni salidas manuales de dinero en este turno.
                                    </div>
                                ) : (
                                    <div className="data-table-container">
                                        <table style={{ width: '100%' }}>
                                            <thead>
                                                <tr>
                                                    <th>Hora</th>
                                                    <th>Tipo</th>
                                                    <th>Medio</th>
                                                    <th>Categoría</th>
                                                    <th>Descripción</th>
                                                    <th style={{ textAlign: 'right' }}>Monto</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sessionFull!.movimientos.map((m, i) => (
                                                    <tr key={i}>
                                                        <td style={{ color: 'var(--text-secondary)' }}>
                                                            {new Date(m.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                                        </td>
                                                        <td>
                                                            <span className={`badge ${m.tipo === 'ENTRADA' ? 'badge-ok' : 'badge-low'}`}>
                                                                {m.tipo}
                                                            </span>
                                                        </td>
                                                        <td>{m.metodo_pago || 'EFECTIVO'}</td>
                                                        <td style={{ fontWeight: 600 }}>{m.categoria}</td>
                                                        <td style={{ color: 'var(--text-secondary)' }}>{m.descripcion || '-'}</td>
                                                        <td style={{
                                                            textAlign: 'right',
                                                            fontWeight: 700,
                                                            color: m.tipo === 'ENTRADA' ? 'var(--success-light)' : 'var(--danger-light)',
                                                        }}>
                                                            {m.tipo === 'ENTRADA' ? '+' : '-'}{fmtMoney(m.monto)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
