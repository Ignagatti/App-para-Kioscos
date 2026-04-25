import React, { useState, useEffect } from 'react';
import { Calendar, Activity, Trash2 } from 'lucide-react';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import type { ReportDetail, ReportMonthly } from '../types/electron';

const MySwal = withReactContent(Swal);

export default function Reportes() {
    const [view, setView] = useState<'detail' | 'monthly'>('detail');
    const [detailData, setDetailData] = useState<ReportDetail[]>([]);
    const [monthlyData, setMonthlyData] = useState<ReportMonthly[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, [view]);

    const loadData = async () => {
        setLoading(true);
        try {
            if (view === 'detail') {
                const data = await window.api.db.getReportDetail();
                setDetailData(data);
            } else {
                const data = await window.api.db.getReportMonthly();
                setMonthlyData(data);
            }
        } catch (error) {
            console.error('Error loading reports:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleClearHistory = async () => {
        const result = await MySwal.fire({
            title: '¿Vaciarlos reportes de verdad?',
            text: "Se borrarán todas las ventas y cierres de caja antiguos. Esta acción no se puede deshacer.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#334155',
            confirmButtonText: 'Sí, borrar todo',
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

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                <button 
                    className="btn" 
                    onClick={() => setView('detail')}
                    style={{ 
                        flex: 2, 
                        padding: '15px', 
                        backgroundColor: view === 'detail' ? '#3b82f6' : 'var(--bg-card)', 
                        color: 'white', 
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        fontSize: '1.1rem'
                    }}
                >
                    <Activity size={20} />
                    Detalle por Caja
                </button>
                <button 
                    className="btn" 
                    onClick={() => setView('monthly')}
                    style={{ 
                        flex: 2, 
                        padding: '15px', 
                        backgroundColor: view === 'monthly' ? '#3b82f6' : 'var(--bg-card)', 
                        color: 'white', 
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        fontSize: '1.1rem'
                    }}
                >
                    <Calendar size={20} />
                    Resumen Mensual
                </button>
                <button 
                    className="btn" 
                    onClick={handleClearHistory}
                    style={{ 
                        flex: 1, 
                        padding: '15px', 
                        backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                        color: '#ef4444', 
                        border: '1px solid #ef4444',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        fontSize: '0.9rem'
                    }}
                >
                    <Trash2 size={18} />
                    Vaciar Reportes
                </button>
            </div>

            <div className="data-table-container" style={{ flex: 1, overflowY: 'auto' }}>
                <table style={{ width: '100%' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-card)', zIndex: 1 }}>
                        {view === 'detail' ? (
                            <tr>
                                <th>Apertura</th>
                                <th>Cierre</th>
                                <th style={{ textAlign: 'right' }}>Total Ventas</th>
                                <th style={{ textAlign: 'right' }}>Efectivo en Caja</th>
                                <th style={{ textAlign: 'right' }}>Otros Medios</th>
                                <th style={{ textAlign: 'right' }}>Ganancia Neta</th>
                            </tr>
                        ) : (
                            <tr>
                                <th>Mes / Año</th>
                                <th style={{ textAlign: 'right' }}>Total Ventas</th>
                                <th style={{ textAlign: 'right' }}>Efectivo Recibido</th>
                                <th style={{ textAlign: 'right' }}>Otros Medios</th>
                                <th style={{ textAlign: 'right' }}>Ganancia Neta</th>
                            </tr>
                        )}
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px' }}>Cargando reportes...</td></tr>
                        ) : view === 'detail' ? (
                            detailData.length === 0 ? (
                                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px' }}>No hay cierres de caja registrados.</td></tr>
                            ) : detailData.map(row => (
                                <tr key={row.id}>
                                    <td>{new Date(row.fecha_apertura).toLocaleString()}</td>
                                    <td>{row.fecha_cierre ? new Date(row.fecha_cierre).toLocaleString() : 'Caja Abierta'}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>${(row.total_ventas || 0).toLocaleString()}</td>
                                    <td style={{ textAlign: 'right', color: '#4ade80' }}>${(row.monto_final_efectivo || 0).toLocaleString()}</td>
                                    <td style={{ textAlign: 'right', color: '#60a5fa' }}>${(row.monto_final_otros || 0).toLocaleString()}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 'bold', color: (row.ganancia || 0) >= 0 ? '#4ade80' : '#f87171' }}>
                                        ${(row.ganancia || 0).toLocaleString()}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            monthlyData.length === 0 ? (
                                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px' }}>No hay datos mensuales.</td></tr>
                            ) : monthlyData.map(row => (
                                <tr key={row.periodo}>
                                    <td style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{row.periodo}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 'bold' }}>${(row.total_ventas || 0).toLocaleString()}</td>
                                    <td style={{ textAlign: 'right', color: '#4ade80' }}>${(row.efectivo || 0).toLocaleString()}</td>
                                    <td style={{ textAlign: 'right', color: '#60a5fa' }}>${(row.otros || 0).toLocaleString()}</td>
                                    <td style={{ textAlign: 'right', fontWeight: 'bold', color: (row.ganancia || 0) >= 0 ? '#4ade80' : '#f87171' }}>
                                        ${(row.ganancia || 0).toLocaleString()}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
