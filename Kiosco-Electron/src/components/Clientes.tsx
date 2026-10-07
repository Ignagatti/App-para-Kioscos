import React, { useState, useEffect } from 'react';
import { Search, Plus, DollarSign, List, Trash2 } from 'lucide-react';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import type { Client, Sale, SessionStatus } from '../types/electron';

const MySwal = withReactContent(Swal);

interface ClientesProps {
    session: SessionStatus | null;
}

export default function Clientes({ session }: ClientesProps) {
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Modal state for New Client
    const [isNewModalOpen, setIsNewModalOpen] = useState(false);
    const [newClient, setNewClient] = useState({ nombre: '', telefono: '', saldo: '' });
    
    // Modal state for Payment
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [paymentAmount, setPaymentAmount] = useState<number | ''>('');

    // Modal state for History
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [clientHistory, setClientHistory] = useState<Sale[]>([]);

    useEffect(() => {
        loadData();
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsNewModalOpen(false);
                setIsPaymentModalOpen(false);
                setIsHistoryModalOpen(false);
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    const loadData = async () => {
        try {
            const data = await window.api.db.getClients();
            setClients(data);
        } catch (error) {
            console.error('Error loading clients:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddClient = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newClient.nombre) {
            MySwal.fire({
                icon: 'error',
                title: 'Faltan datos',
                text: 'El nombre es obligatorio.',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)'
            });
            return;
        }
        try {
            const saldo = parseFloat(newClient.saldo) || 0;
            await window.api.db.addClient({ nombre: newClient.nombre, telefono: newClient.telefono, saldo });
            setIsNewModalOpen(false);
            setNewClient({ nombre: '', telefono: '', saldo: '' });
            loadData();
            MySwal.fire({
                icon: 'success',
                title: 'Cliente guardado',
                timer: 1500,
                showConfirmButton: false,
                background: 'var(--bg-card)',
                color: 'var(--text-primary)'
            });
        } catch (error) {
            console.error("Error adding client:", error);
            MySwal.fire('Error', 'Error al agregar cliente.', 'error');
        }
    };

    const handlePayment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedClient || paymentAmount === '' || paymentAmount <= 0) {
            MySwal.fire('Atención', 'Ingresa un monto válido mayor a cero.', 'warning');
            return;
        }
        if (Number(paymentAmount) > (selectedClient.saldo || 0)) {
            MySwal.fire('Atención', `El monto ingresado ($${Number(paymentAmount).toLocaleString()}) supera la deuda actual ($${(selectedClient.saldo || 0).toLocaleString()}).`, 'warning');
            return;
        }
        try {
            await window.api.db.payClientDebt({ clientId: selectedClient.id, amount: Number(paymentAmount) });
            if (session) {
                await window.api.db.addMovimiento({
                    tipo: 'ENTRADA',
                    categoria: 'Cobro de Fiado',
                    monto: Number(paymentAmount),
                    descripcion: `Pago de deuda - ${selectedClient.nombre}`,
                    sesionId: session.id,
                    metodoPago: 'EFECTIVO'
                });
            }
            setIsPaymentModalOpen(false);
            setPaymentAmount('');
            setSelectedClient(null);
            loadData();
            MySwal.fire({
                icon: 'success',
                title: 'Pago registrado con éxito.',
                timer: 1500,
                showConfirmButton: false,
                background: 'var(--bg-card)',
                color: 'var(--text-primary)'
            });
        } catch (error) {
            console.error("Error paying debt:", error);
            MySwal.fire('Error', 'Error al registrar pago.', 'error');
        }
    };

    const viewHistory = async (client: Client) => {
        try {
            const history = await window.api.db.getClientSales(client.id);
            setClientHistory(history);
            setSelectedClient(client);
            setIsHistoryModalOpen(true);
        } catch (error) {
            console.error("Error loading history:", error);
        }
    };

    const handleDeleteClient = async (id: number) => {
        const result = await MySwal.fire({
            title: '¿Estás seguro?',
            text: "Se borrará el cliente y se desvincularán sus deudas pasadas. Esta acción no se puede deshacer.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#334155',
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)'
        });

        if (result.isConfirmed) {
            try {
                await window.api.db.deleteClient(id);
                loadData();
                MySwal.fire({
                    icon: 'success',
                    title: 'Cliente eliminado',
                    timer: 1500,
                    showConfirmButton: false,
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)'
                });
            } catch (error) {
                console.error("Error deleting client:", error);
                MySwal.fire('Error', 'Error al eliminar cliente.', 'error');
            }
        }
    };

    const filteredClients = clients.filter(c => 
        (c.nombre || "").toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="stats-grid">
                <div className="stat-card">
                    <span className="label">Total Clientes</span>
                    <span className="value">{clients.length}</span>
                </div>
                <div className="stat-card">
                    <span className="label">Deuda Total (A cobrar)</span>
                    <span className="value" style={{ color: '#f59e0b' }}>
                        ${clients.reduce((acc, c) => acc + (c.saldo || 0), 0).toLocaleString()}
                    </span>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                <div className="search-bar" style={{ flex: 1, position: 'relative' }}>
                    <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={18} />
                    <input 
                        type="text" 
                        placeholder="Buscar cliente por nombre..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ width: '100%', padding: '12px 12px 12px 40px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--text-primary)', fontSize: '1rem' }}
                    />
                </div>
                <button className="btn btn-primary" onClick={() => setIsNewModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Plus size={18} />
                    Nuevo Cliente
                </button>
            </div>

            <div className="data-table-container" style={{ flex: 1, overflowY: 'auto' }}>
                <table style={{ width: '100%' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-card)', zIndex: 1 }}>
                        <tr>
                            <th>Nombre</th>
                            <th>Teléfono</th>
                            <th style={{ textAlign: 'right' }}>Saldo Deudor</th>
                            <th style={{ textAlign: 'center' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={4} style={{ textAlign: 'center', padding: '40px' }}>Cargando clientes...</td></tr>
                        ) : filteredClients.length === 0 ? (
                            <tr><td colSpan={4} style={{ textAlign: 'center', padding: '40px' }}>No se encontraron clientes.</td></tr>
                        ) : filteredClients.map(client => (
                            <tr key={client.id}>
                                <td style={{ fontWeight: 600 }}>{client.nombre}</td>
                                <td>{client.telefono || '-'}</td>
                                <td style={{ fontWeight: 700, color: (client.saldo || 0) > 0 ? '#f87171' : '#4ade80', textAlign: 'right' }}>
                                    ${(client.saldo || 0).toLocaleString()}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                    <button 
                                        className="btn" 
                                        title="Registrar Pago"
                                        style={{ padding: '6px', backgroundColor: 'transparent', color: '#4ade80' }} 
                                        onClick={() => { setSelectedClient(client); setIsPaymentModalOpen(true); }}
                                    >
                                        <DollarSign size={18} />
                                    </button>
                                    <button 
                                        className="btn" 
                                        title="Ver Historial de Fiados"
                                        style={{ padding: '6px', backgroundColor: 'transparent', color: '#60a5fa' }} 
                                        onClick={() => viewHistory(client)}
                                    >
                                        <List size={18} />
                                    </button>
                                    <button 
                                        className="btn" 
                                        title="Eliminar Cliente"
                                        style={{ padding: '6px', backgroundColor: 'transparent', color: '#f87171' }} 
                                        onClick={() => handleDeleteClient(client.id)}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* New Client Modal */}
            {isNewModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'var(--bg-card)', padding: '30px', borderRadius: '16px', width: '400px', border: '1px solid var(--border)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.5rem', fontWeight: 600 }}>Nuevo Cliente</h3>
                        <form onSubmit={handleAddClient} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Nombre *</label>
                                <input type="text" required value={newClient.nombre} onChange={e => setNewClient({ ...newClient, nombre: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Teléfono</label>
                                <input type="text" value={newClient.telefono} onChange={e => setNewClient({ ...newClient, telefono: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Deuda inicial ($)</label>
                                <input type="number" step="0.01" min="0" placeholder="0" value={newClient.saldo} onChange={e => setNewClient({ ...newClient, saldo: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                                <button type="button" className="btn" onClick={() => setIsNewModalOpen(false)} style={{ backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Payment Modal */}
            {isPaymentModalOpen && selectedClient && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'var(--bg-card)', padding: '30px', borderRadius: '16px', width: '400px', border: '1px solid var(--border)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.5rem', fontWeight: 600 }}>Registrar Pago</h3>
                        <p style={{ marginBottom: '20px', color: 'var(--text-secondary)' }}>Cliente: <strong style={{ color: 'var(--text-primary)' }}>{selectedClient.nombre}</strong><br/>Deuda actual: <strong style={{ color: '#f87171' }}>${(selectedClient.saldo || 0).toLocaleString()}</strong></p>
                        <form onSubmit={handlePayment} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Monto a pagar ($) *</label>
                                <input type="number" step="0.01" min="0.01" max={selectedClient.saldo || 0} required value={paymentAmount} onChange={e => setPaymentAmount(e.target.value ? Number(e.target.value) : '')} style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                                <button type="button" className="btn" onClick={() => setIsPaymentModalOpen(false)} style={{ backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" style={{ backgroundColor: '#22c55e' }}>Confirmar Pago</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* History Modal */}
            {isHistoryModalOpen && selectedClient && (
                 <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                 <div style={{ backgroundColor: 'var(--bg-card)', padding: '30px', borderRadius: '16px', width: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
                     <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.5rem', fontWeight: 600 }}>Historial de Fiados - {selectedClient.nombre}</h3>
                     <div className="data-table-container" style={{ flex: 1, overflowY: 'auto' }}>
                        <table style={{ width: '100%' }}>
                            <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-card)', zIndex: 1 }}>
                                <tr>
                                    <th>Fecha</th>
                                    <th>Venta ID</th>
                                    <th style={{ textAlign: 'right' }}>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {clientHistory.length === 0 ? (
                                    <tr><td colSpan={3} style={{ textAlign: 'center', padding: '20px' }}>No hay ventas fiadas registradas.</td></tr>
                                ) : clientHistory.map(sale => (
                                    <tr key={sale.id}>
                                        <td>{new Date(sale.fecha).toLocaleString()}</td>
                                        <td>#{sale.id}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 'bold' }}>${(sale.total || 0).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                     </div>
                     <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                         <button type="button" className="btn" onClick={() => setIsHistoryModalOpen(false)} style={{ backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>Cerrar</button>
                     </div>
                 </div>
             </div>
            )}
        </div>
    );
}
