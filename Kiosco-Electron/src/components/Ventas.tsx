import React, { useState, useRef, useEffect } from 'react';
import { Search, ShoppingCart, Trash2, Banknote, CreditCard, User, AlertCircle } from 'lucide-react';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import type { Product, SessionStatus, Client } from '../types/electron';

const MySwal = withReactContent(Swal);

interface CartItem extends Product {
    cantidad: number;
    subtotal: number;
    cartId?: number;
}

interface VentasProps {
    session: SessionStatus | null;
    quickPayKey?: string;
}

export default function Ventas({ session, quickPayKey = 'F12' }: VentasProps) {
    const [cart, setCart] = useState<CartItem[]>([]);
    const [saleSearch, setSaleSearch] = useState('');
    const [clients, setClients] = useState<Client[]>([]);
    const [selectedClient, setSelectedClient] = useState<number | null>(null);
    const saleInputRef = useRef<HTMLInputElement>(null);

    const [searchResults, setSearchResults] = useState<Product[]>([]);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);


    useEffect(() => {
        loadClients();
        if (saleInputRef.current) saleInputRef.current.focus();
        
        const handleKeyDown = (e: KeyboardEvent) => {
            if (Swal.isVisible()) return;
            if (e.key === quickPayKey && cart.length > 0 && session) {
                handleCompleteSale('EFECTIVO');
            }
            if (e.key === 'Escape') {
                setSearchResults([]);
                setSaleSearch('');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [cart, session, selectedClient, quickPayKey]);

    // Búsqueda en tiempo real (debounce)
    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            if (saleSearch.trim().length >= 2) {
                const results = await window.api.db.searchProducts(saleSearch);
                setSearchResults(results);
            } else {
                setSearchResults([]);
            }
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [saleSearch]);

    const loadClients = async () => {
        const data = await window.api.db.getClients();
        setClients(data);
    };

    const lastEnterTime = useRef<number>(0);

    const buildItems = () => cart.map(item => ({
        id: item.id,
        codigo_barras: item.codigo_barras,
        nombre: item.nombre,
        precio: item.precio,
        precio_costo: item.precio_costo,
        cantidad: item.cantidad,
        subtotal: item.subtotal
    }));

    const finalizeSale = async (total: number, metodoPago: string, clientId: number | null) => {
        await window.api.db.createSale({
            total,
            paymentMethod: metodoPago,
            sessionId: session!.id,
            clientId,
            items: buildItems()
        });
        setCart([]);
        setSelectedClient(null);
        setIsPaymentModalOpen(false);
        
        MySwal.fire({
            icon: 'success',
            title: 'Venta completada',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)',
            timer: 1000,
            showConfirmButton: false
        });
        
        setTimeout(() => { if (saleInputRef.current) saleInputRef.current.focus(); }, 100);
    };

    const handleCompleteSale = async (metodoPago: string, clientIdOverride?: number | null) => {
        if (!session) {
            MySwal.fire('Error', 'Debes abrir la caja primero.', 'error');
            return;
        }
        if (metodoPago === 'FIADO' && !selectedClient && !clientIdOverride) {
            setIsClientSearchOpen(true);
            setTimeout(() => clientSearchRef.current?.focus(), 50);
            return;
        }

        const total = cart.reduce((acc, item) => acc + (item.subtotal || 0), 0);

        // Pago mixto: cliente seleccionado + método efectivo u otros
        if (selectedClient && (metodoPago === 'EFECTIVO' || metodoPago === 'OTROS')) {
            const { value: abonoStr, isConfirmed } = await MySwal.fire({
                title: 'Pago con Cliente',
                html: `<p style="margin-bottom:8px">Total: <strong style="font-size:1.2rem">$${total.toLocaleString()}</strong></p>
                       <p style="margin:0;opacity:0.75;font-size:0.9rem">¿Cuánto abona ahora? (0 = todo a fiado)</p>`,
                input: 'number',
                inputPlaceholder: `Máximo $${total.toLocaleString()}`,
                showCancelButton: true,
                confirmButtonText: 'Confirmar',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#3b82f6',
                cancelButtonColor: '#334155',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                inputAttributes: { min: '0', step: '1' },
                inputValidator: (value) => {
                    if (value === '' || value === null) return 'Ingresá un monto (puede ser 0).';
                    const n = parseFloat(value);
                    if (isNaN(n) || n < 0) return 'Ingresá un número válido mayor o igual a 0.';
                    if (n > total) return `El monto no puede superar el total de $${total.toLocaleString()}.`;
                }
            });

            if (!isConfirmed) return;

            const abono = parseFloat(abonoStr);
            const deuda = Math.round((total - abono) * 100) / 100;

            try {
                if (abono <= 0) {
                    // Todo va a fiado
                    await finalizeSale(total, 'FIADO', selectedClient);
                } else if (deuda <= 0) {
                    // Paga el total completo: venta normal sin deuda
                    await finalizeSale(total, metodoPago, null);
                } else {
                    // Pago mixto: abona algo ahora, el resto queda como deuda
                    await finalizeSale(total, metodoPago, null);
                    await window.api.db.addClientDebt({ clientId: selectedClient, amount: deuda });
                    // Corrección de caja: restamos la parte que NO se cobró en efectivo
                    await window.api.db.addMovimiento({
                        tipo: 'SALIDA',
                        categoria: 'Fiado Parcial',
                        monto: deuda,
                        descripcion: `Deuda por pago parcial`,
                        sesionId: session.id,
                        metodoPago: metodoPago
                    });
                }
            } catch (error) {
                console.error("Error al completar venta:", error);
                MySwal.fire('Error', 'Hubo un error al procesar la venta.', 'error');
            }
            return;
        }

        try {
            if (metodoPago === 'EFECTIVO') {
                const { value: pagaConStr, isConfirmed } = await MySwal.fire({
                    title: 'Cobro en Efectivo',
                    html: `
                        <div style="font-size: 1.5rem; margin-bottom: 20px;">Total: <strong style="color: #4ade80;">$${total.toLocaleString()}</strong></div>
                        <div style="margin-bottom: 10px; opacity: 0.8;">¿Con cuánto paga el cliente?</div>
                        <input id="paga-con" type="number" class="swal2-input" style="width: 80%; margin: 10px auto; text-align: center; font-size: 1.8rem; font-weight: 700; color: white; background: #1e293b; border: 1px solid #334155;" placeholder="0">
                        <div id="vuelto-display" style="font-size: 2.2rem; font-weight: 800; color: #4ade80; margin-top: 15px; min-height: 3.5rem;"></div>
                    `,
                    didOpen: () => {
                        const input = document.getElementById('paga-con') as HTMLInputElement;
                        const display = document.getElementById('vuelto-display');
                        input.focus();
                        
                        input.onkeydown = (e) => {
                            if (e.key === 'Enter') {
                                MySwal.clickConfirm();
                            }
                        };

                        input.oninput = () => {
                            const val = parseFloat(input.value) || 0;
                            if (val >= total) {
                                display!.innerHTML = `<span style="font-size: 1rem; opacity: 0.7; display: block;">Vuelto:</span> $${(val - total).toLocaleString()}`;
                            } else {
                                display!.innerHTML = '';
                            }
                        };
                    },
                    preConfirm: () => {
                        const input = document.getElementById('paga-con') as HTMLInputElement;
                        const val = parseFloat(input.value);
                        if (isNaN(val) || val < total) {
                            Swal.showValidationMessage(`El monto debe ser al menos $${total.toLocaleString()}`);
                            return false;
                        }
                        return input.value;
                    },
                    showCancelButton: true,
                    confirmButtonText: 'Completar Venta',
                    cancelButtonText: 'Cancelar',
                    confirmButtonColor: '#22c55e',
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)',
                });

                if (!isConfirmed) return;
            }

            await finalizeSale(
                total,
                metodoPago,
                metodoPago === 'FIADO' ? (clientIdOverride ?? selectedClient) : null
            );
        } catch (error) {
            console.error("Error al completar venta:", error);
            MySwal.fire('Error', 'Hubo un error al procesar la venta.', 'error');
        }
    };

    const [isClientSearchOpen, setIsClientSearchOpen] = useState(false);
    const [clientSearch, setClientSearch] = useState('');
    const [highlightedClientIndex, setHighlightedClientIndex] = useState(0);
    const clientSearchRef = useRef<HTMLInputElement>(null);

    const filteredClientsForSearch = clients.filter(c => 
        (c.nombre || "").toLowerCase().includes(clientSearch.toLowerCase())
    );

    // Modal hotkeys con protección de "rebote"
    const modalOpenedAt = useRef<number>(0);
    useEffect(() => {
        if (!isPaymentModalOpen) {
            modalOpenedAt.current = 0;
            setIsClientSearchOpen(false); // Cerrar búsqueda si se cierra modal
            setClientSearch('');
            // Cuando se cierra el modal, devolver foco al input
            setTimeout(() => {
                if (saleInputRef.current) saleInputRef.current.focus();
            }, 100);
            return;
        }
        
        // Cuando se abre el modal, quitar foco del input para que no se escriban números
        if (saleInputRef.current) saleInputRef.current.blur();
        
        modalOpenedAt.current = Date.now();

        const handleModalKeys = (e: KeyboardEvent) => {
            if (Swal.isVisible()) return;
            if (isClientSearchOpen) return; // Si está abierta la búsqueda de clientes, no procesar estas teclas

            // Ignorar teclas si el modal se abrió hace menos de 300ms
            if (Date.now() - modalOpenedAt.current < 300) return;

            if (e.key === '1' || e.key === 'Enter') {
                e.preventDefault();
                handleCompleteSale('EFECTIVO');
            } else if (e.key === '2') {
                e.preventDefault();
                handleCompleteSale('OTROS');
            } else if (e.key === '3') {
                e.preventDefault();
                setIsClientSearchOpen(true);
                setTimeout(() => clientSearchRef.current?.focus(), 50);
            } else if (e.key === 'Escape') {
                setIsPaymentModalOpen(false);
            }
        };

        window.addEventListener('keydown', handleModalKeys);
        return () => window.removeEventListener('keydown', handleModalKeys);
    }, [isPaymentModalOpen, isClientSearchOpen, cart, selectedClient, clients]);

    const handleClientSearchKeys = async (e: React.KeyboardEvent) => {
        e.stopPropagation(); // Evitar que el Enter llegue al manejador del modal
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedClientIndex(prev => Math.min(prev + 1, filteredClientsForSearch.length));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedClientIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredClientsForSearch.length > 0 && highlightedClientIndex < filteredClientsForSearch.length) {
                const client = filteredClientsForSearch[highlightedClientIndex];
                setSelectedClient(client.id);
                handleCompleteSale('FIADO', client.id);
            } else if (clientSearch.trim()) {
                // Crear cliente nuevo si no hay resultados o si se elige "Crear"
                const res = await window.api.db.addClient({ nombre: clientSearch.trim(), telefono: '' });
                setSelectedClient(res.id);
                await loadClients();
                handleCompleteSale('FIADO', res.id);
            }
        } else if (e.key === 'Escape') {
            setIsClientSearchOpen(false);
            setClientSearch('');
        }
    };

    const handleSaleSearch = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const now = Date.now();
            
            if (saleSearch.trim()) {
                // Si hay texto, buscar producto y resetear tiempo de enter
                lastEnterTime.current = 0;
                const results = await window.api.db.searchProducts(saleSearch);
                if (results.length === 1) {
                    await processAddToCart(results[0]);
                    setSaleSearch('');
                    setSearchResults([]);
                } else if (results.length > 1) {
                    setSearchResults(results);
                }
            } else {
                // Si el input está vacío, chequear doble enter
                if (cart.length > 0 && session) {
                    const timeDiff = now - lastEnterTime.current;
                    if (timeDiff < 500) { // Doble clic rápido (500ms)
                        setIsPaymentModalOpen(true);
                        lastEnterTime.current = 0;
                    } else {
                        lastEnterTime.current = now;
                        const Toast = MySwal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1000 });
                        Toast.fire({ icon: 'info', title: 'Presioná ENTER de nuevo para cobrar' });
                    }
                }
            }
        }
    };

    const handleSelectResult = async (product: Product) => {
        await processAddToCart(product);
        setSaleSearch('');
        setSearchResults([]);
        if (saleInputRef.current) saleInputRef.current.focus();
    };

    const processAddToCart = async (product: Product) => {
        if (product.es_por_kilo) {
            const { value: gramosStr } = await MySwal.fire({
                title: 'Venta por peso',
                input: 'number',
                inputLabel: `Ingresa los gramos de ${product.nombre}`,
                inputPlaceholder: 'Ej: 250',
                showCancelButton: true,
                confirmButtonColor: '#3b82f6',
                cancelButtonColor: '#334155',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                inputAttributes: {
                    min: '1',
                    step: '1'
                }
            });

            if (gramosStr) {
                const gramos = parseFloat(gramosStr);
                const kilos = gramos / 1000;
                // El precio base para este item será el precio por kilo
                const precio = product.precio_por_kilo || product.precio || 0;
                const subtotal = kilos * precio;
                
                // Agregarlo como un item único en el carrito para no mezclar pesos
                setCart(prev => [...prev, { 
                    ...product, 
                    precio: precio, 
                    cantidad: kilos, 
                    subtotal: subtotal,
                    cartId: Date.now() + Math.random() // ID único para el Carrito (React key)
                }]);
            }
        } else {
            setCart(prev => {
                const existing = prev.find(item => item.codigo_barras === product.codigo_barras && !item.es_por_kilo);
                if (existing) {
                    return prev.map(item => 
                        item.codigo_barras === product.codigo_barras 
                            ? { ...item, cantidad: item.cantidad + 1, subtotal: (item.cantidad + 1) * (item.precio || 0) }
                            : item
                    );
                }
                return [...prev, { ...product, cantidad: 1, subtotal: product.precio || 0, cartId: Date.now() + Math.random() }];
            });
        }
    };

    const updateQuantity = (cartId: number, delta: number) => {
        setCart(prev => prev.map(item => {
            if ((item.cartId || item.id) === cartId) {
                if (item.es_por_kilo) return item;
                const newQuantity = Math.max(1, item.cantidad + delta);
                return { ...item, cantidad: newQuantity, subtotal: newQuantity * (item.precio || 0) };
            }
            return item;
        }));
    };

    const removeFromCart = (cartId: number) => {
        setCart(prev => prev.filter(item => (item.cartId || item.id) !== cartId));
    };


    const totalCart = cart.reduce((acc, item) => acc + (item.subtotal || 0), 0);

    return (
        <div style={{ display: 'flex', gap: '25px', height: '100%' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
                <div className="search-bar" style={{ marginBottom: '20px', position: 'relative' }}>
                    <Search style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={24} />
                    <input 
                        ref={saleInputRef}
                        type="text" 
                        placeholder="Escaneá un código o escribí el nombre... (Enter)" 
                        value={saleSearch}
                        onChange={(e) => setSaleSearch(e.target.value)}
                        onKeyDown={handleSaleSearch}
                        autoFocus
                        style={{ width: '100%', padding: '20px 20px 20px 55px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--primary)', borderRadius: '16px', color: 'var(--text-primary)', fontSize: '1.25rem', boxShadow: '0 0 15px rgba(59, 130, 246, 0.1)', boxSizing: 'border-box' }}
                    />
                    {searchResults.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', backgroundColor: 'var(--bg-card)', border: '1px solid var(--primary)', borderRadius: '12px', marginTop: '10px', zIndex: 10, maxHeight: '300px', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
                            {searchResults.map(p => (
                                <div 
                                    key={p.id} 
                                    onClick={() => handleSelectResult(p)}
                                    style={{ padding: '15px 20px', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                    onMouseOver={e => e.currentTarget.style.backgroundColor = 'var(--border)'}
                                    onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <div>
                                        <div style={{ fontWeight: 600 }}>{p.nombre} {p.es_por_kilo ? <span style={{fontSize: '0.75rem', color: '#f59e0b'}}>(Peso)</span> : ''}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{p.codigo_barras}</div>
                                    </div>
                                    <div style={{ fontWeight: 700, color: '#4ade80' }}>
                                        ${(p.es_por_kilo ? (p.precio_por_kilo || p.precio) : p.precio || 0).toLocaleString()} {p.es_por_kilo ? '/kg' : ''}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                
                <div className="data-table-container" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                    {cart.length === 0 ? (
                        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)', margin: 'auto' }}>
                            <ShoppingCart size={80} style={{ marginBottom: '20px', opacity: 0.1, display: 'block', margin: '0 auto 20px' }} />
                            <p style={{ fontSize: '1.1rem' }}>El carrito está vacío.<br/>Empezá a escanear productos.</p>
                        </div>
                    ) : (
                        <table style={{ width: '100%' }}>
                            <thead>
                                <tr>
                                    <th>Producto</th>
                                    <th style={{ textAlign: 'center' }}>Cant.</th>
                                    <th style={{ textAlign: 'right' }}>Precio</th>
                                    <th style={{ textAlign: 'right' }}>Subtotal</th>
                                    <th style={{ width: '50px', textAlign: 'center' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {cart.map(item => (
                                    <tr key={item.cartId || item.id}>
                                        <td>
                                            <div style={{ fontWeight: 600 }}>{item.nombre}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{item.codigo_barras}</div>
                                        </td>
                                        <td>
                                            {item.es_por_kilo ? (
                                                <div style={{ textAlign: 'center', fontWeight: 700 }}>
                                                    {(item.cantidad * 1000)}g
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                    <button className="btn" style={{ padding: '2px 8px', backgroundColor: 'var(--border)', color: 'var(--text-primary)' }} onClick={() => updateQuantity(item.cartId || item.id, -1)}>-</button>
                                                    <span style={{ fontWeight: 700, minWidth: '20px', textAlign: 'center' }}>{item.cantidad}</span>
                                                    <button className="btn" style={{ padding: '2px 8px', backgroundColor: 'var(--border)', color: 'var(--text-primary)' }} onClick={() => updateQuantity(item.cartId || item.id, 1)}>+</button>
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'right' }}>${(item.precio || 0).toLocaleString()} {item.es_por_kilo ? '/kg' : ''}</td>
                                        <td style={{ fontWeight: 700, color: '#60a5fa', textAlign: 'right' }}>${(item.subtotal || 0).toLocaleString()}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <button className="btn" style={{ padding: '6px', color: '#f87171', backgroundColor: 'transparent' }} onClick={() => removeFromCart(item.cartId || item.id)}>
                                                <Trash2 size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            <div style={{ width: '380px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div className="stat-card" style={{ background: 'linear-gradient(135deg, #1e40af, #6d28d9)', border: 'none', padding: '30px', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
                    <span className="label" style={{ color: 'rgba(255,255,255,0.6)', letterSpacing: '1px', fontWeight: 600 }}>TOTAL A PAGAR</span>
                    <span className="value" style={{ fontSize: '3.5rem', marginTop: '10px', color: 'white' }}>${(totalCart || 0).toLocaleString()}</span>
                </div>
                
                <div style={{ padding: '15px', backgroundColor: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: 'var(--text-secondary)' }}>
                        <User size={18} />
                        <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Cliente (Para Fiado)</span>
                    </div>
                    <select 
                        value={selectedClient || ''} 
                        onChange={(e) => setSelectedClient(e.target.value ? Number(e.target.value) : null)}
                        style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px' }}
                    >
                        <option value="">Consumidor Final</option>
                        {clients.map(c => (
                            <option key={c.id} value={c.id}>{c.nombre}</option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <button 
                        className="btn" 
                        onClick={() => handleCompleteSale('EFECTIVO')}
                        disabled={cart.length === 0 || !session}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '15px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', opacity: (cart.length === 0 || !session) ? 0.5 : 1 }}
                    >
                        <Banknote size={24} color="#4ade80" />
                        <span>Efectivo</span>
                    </button>
                    <button 
                        className="btn" 
                        onClick={() => handleCompleteSale('OTROS')}
                        disabled={cart.length === 0 || !session}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '15px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', opacity: (cart.length === 0 || !session) ? 0.5 : 1 }}
                    >
                        <CreditCard size={24} color="#60a5fa" />
                        <span>Otros</span>
                    </button>
                    <button 
                        className="btn" 
                        onClick={() => handleCompleteSale('FIADO')}
                        disabled={cart.length === 0 || !session}
                        style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '15px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', opacity: (cart.length === 0 || !session) ? 0.5 : 1 }}
                    >
                        <User size={20} color="#f59e0b" />
                        <span>Anotar en Fiado</span>
                    </button>
                </div>

                {!session && (
                    <div style={{ color: '#f87171', fontSize: '0.875rem', textAlign: 'center', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', padding: '10px', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>
                        <AlertCircle size={16} />
                        Debés abrir caja para realizar ventas
                    </div>
                )}
            </div>

            {/* Modal de Cobro Pro */}
            {isPaymentModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(5px)' }}>
                    <div style={{ backgroundColor: 'var(--bg-card)', padding: '40px', borderRadius: '24px', width: '500px', border: '1px solid var(--primary)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)', position: 'relative' }}>
                        <h2 style={{ marginTop: 0, marginBottom: '10px', textAlign: 'center', fontSize: '1.2rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '2px' }}>Confirmar Cobro</h2>
                        <div style={{ fontSize: '4.5rem', fontWeight: 800, textAlign: 'center', color: '#4ade80', marginBottom: '30px', textShadow: '0 0 20px rgba(74, 222, 128, 0.2)' }}>
                            ${totalCart.toLocaleString()}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <button 
                                onClick={() => handleCompleteSale('EFECTIVO')}
                                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', backgroundColor: 'rgba(34, 197, 94, 0.1)', border: '2px solid #22c55e', borderRadius: '16px', color: 'white', cursor: 'pointer', transition: 'all 0.2s' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ backgroundColor: '#22c55e', padding: '10px', borderRadius: '12px' }}><Banknote size={24} /></div>
                                    <span style={{ fontSize: '1.2rem', fontWeight: 600 }}>Efectivo</span>
                                </div>
                                <span style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: '4px 12px', borderRadius: '8px', fontSize: '0.9rem' }}>Presioná [1] o [Enter]</span>
                            </button>

                            <button 
                                onClick={() => handleCompleteSale('OTROS')}
                                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '2px solid #3b82f6', borderRadius: '16px', color: 'white', cursor: 'pointer' }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ backgroundColor: '#3b82f6', padding: '10px', borderRadius: '12px' }}><CreditCard size={24} /></div>
                                    <span style={{ fontSize: '1.2rem', fontWeight: 600 }}>Otros (Débito/QR)</span>
                                </div>
                                <span style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: '4px 12px', borderRadius: '8px', fontSize: '0.9rem' }}>Presioná [2]</span>
                            </button>

                            <button 
                                onClick={() => handleCompleteSale('FIADO')}
                                disabled={cart.length === 0}
                                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', backgroundColor: selectedClient ? 'rgba(245, 158, 11, 0.1)' : 'rgba(255,255,255,0.05)', border: `2px solid ${selectedClient ? '#f59e0b' : '#334155'}`, borderRadius: '16px', color: 'white', cursor: cart.length > 0 ? 'pointer' : 'not-allowed', opacity: cart.length > 0 ? 1 : 0.5 }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ backgroundColor: selectedClient ? '#f59e0b' : '#334155', padding: '10px', borderRadius: '12px' }}><User size={24} /></div>
                                    <span style={{ fontSize: '1.2rem', fontWeight: 600 }}>Anotar Fiado</span>
                                </div>
                                <span style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: '4px 12px', borderRadius: '8px', fontSize: '0.9rem' }}>Presioná [3]</span>
                            </button>
                        </div>

                        <button 
                            onClick={() => setIsPaymentModalOpen(false)}
                            style={{ width: '100%', marginTop: '25px', padding: '12px', backgroundColor: 'transparent', border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                        >
                            Cancelar (Esc)
                        </button>

                        {/* Sub-Modal de Búsqueda de Clientes */}
                        {isClientSearchOpen && (
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--bg-card)', borderRadius: '24px', padding: '30px', display: 'flex', flexDirection: 'column', zIndex: 1100 }}>
                                <h3 style={{ marginTop: 0, marginBottom: '20px' }}>Buscar Cliente</h3>
                                <input 
                                    ref={clientSearchRef}
                                    type="text" 
                                    placeholder="Nombre del cliente..." 
                                    value={clientSearch}
                                    onChange={e => {
                                        setClientSearch(e.target.value);
                                        setHighlightedClientIndex(0);
                                    }}
                                    onKeyDown={handleClientSearchKeys}
                                    style={{ width: '100%', padding: '15px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--primary)', borderRadius: '12px', color: 'var(--text-primary)', fontSize: '1.1rem', marginBottom: '15px' }}
                                />
                                
                                <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '12px' }}>
                                    {filteredClientsForSearch.map((c, idx) => (
                                        <div 
                                            key={c.id} 
                                            style={{ 
                                                padding: '12px 20px', 
                                                backgroundColor: idx === highlightedClientIndex ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                                                borderBottom: '1px solid var(--border)',
                                                cursor: 'pointer'
                                            }}
                                            onClick={() => {
                                                setSelectedClient(c.id);
                                                handleCompleteSale('FIADO');
                                            }}
                                        >
                                            <div style={{ fontWeight: 600 }}>{c.nombre}</div>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Saldo: ${(c.saldo || 0).toLocaleString()}</div>
                                        </div>
                                    ))}
                                    
                                    {clientSearch.trim() && (
                                        <div 
                                            style={{ 
                                                padding: '12px 20px', 
                                                backgroundColor: highlightedClientIndex === filteredClientsForSearch.length ? 'rgba(74, 222, 128, 0.1)' : 'transparent',
                                                borderTop: filteredClientsForSearch.length > 0 ? '1px dashed var(--border)' : 'none',
                                                cursor: 'pointer',
                                                textAlign: 'center'
                                            }}
                                            onClick={async () => {
                                                const res = await window.api.db.addClient({ nombre: clientSearch.trim(), telefono: '' });
                                                setSelectedClient(res.id);
                                                await loadClients();
                                                handleCompleteSale('FIADO', res.id);
                                            }}
                                        >
                                            <div style={{ color: '#4ade80', fontWeight: 600 }}>
                                                {filteredClientsForSearch.length > 0 ? '¿No está en la lista?' : 'No existe:'} 
                                                <span style={{ color: 'var(--text-primary)' }}> "{clientSearch}"</span>
                                            </div>
                                            <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>Presioná [Enter] para crear y cobrar</div>
                                        </div>
                                    )}
                                </div>
                                <div style={{ marginTop: '15px', fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                                    [↑↓] Navegar • [Enter] Seleccionar • [Esc] Volver
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
