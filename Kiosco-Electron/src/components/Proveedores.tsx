import React, { useState, useEffect } from 'react';
import { Search, Plus, Trash2, Edit2, Phone, Mail, MapPin, Package, X } from 'lucide-react';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import type { Supplier, Product } from '../types/electron';

const MySwal = withReactContent(Swal);

export default function Proveedores() {
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Modal state for Add/Edit Supplier
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<Partial<Supplier> | null>(null);
    const [formData, setFormData] = useState({
        nombre: '',
        contacto: '',
        telefono: '',
        email: '',
        direccion: '',
        notas: ''
    });

    // Modal state for Products by Supplier
    const [isProductsModalOpen, setIsProductsModalOpen] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
    const [supplierProducts, setSupplierProducts] = useState<Product[]>([]);
    const [loadingProducts, setLoadingProducts] = useState(false);

    useEffect(() => {
        loadData();
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsModalOpen(false);
                setIsProductsModalOpen(false);
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    const loadData = async () => {
        try {
            const data = await window.api.db.getSuppliers();
            setSuppliers(data);
        } catch (error) {
            console.error('Error loading suppliers:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenAddModal = () => {
        setEditingSupplier(null);
        setFormData({
            nombre: '',
            contacto: '',
            telefono: '',
            email: '',
            direccion: '',
            notas: ''
        });
        setIsModalOpen(true);
    };

    const handleOpenEditModal = (supplier: Supplier) => {
        setEditingSupplier(supplier);
        setFormData({
            nombre: supplier.nombre || '',
            contacto: supplier.contacto || '',
            telefono: supplier.telefono || '',
            email: supplier.email || '',
            direccion: supplier.direccion || '',
            notas: supplier.notas || ''
        });
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.nombre) {
            MySwal.fire('Error', 'El nombre es obligatorio.', 'error');
            return;
        }

        try {
            const data = {
                ...formData,
                id: editingSupplier?.id
            };
            await window.api.db.saveSupplier(data);
            setIsModalOpen(false);
            loadData();
            MySwal.fire({
                icon: 'success',
                title: editingSupplier ? 'Proveedor actualizado' : 'Proveedor guardado',
                timer: 1500,
                showConfirmButton: false,
                background: 'var(--bg-card)',
                color: 'var(--text-primary)'
            });
        } catch (error) {
            console.error("Error saving supplier:", error);
            MySwal.fire('Error', 'Ocurrió un error al guardar.', 'error');
        }
    };

    const handleDelete = async (id: number) => {
        const result = await MySwal.fire({
            title: '¿Estás seguro?',
            text: "Se eliminará el proveedor y sus vínculos con los productos.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)'
        });

        if (result.isConfirmed) {
            try {
                await window.api.db.deleteSupplier(id);
                loadData();
                MySwal.fire('Eliminado', 'Proveedor eliminado correctamente.', 'success');
            } catch (error) {
                console.error("Error deleting supplier:", error);
                MySwal.fire('Error', 'Error al eliminar proveedor.', 'error');
            }
        }
    };

    const handleViewProducts = async (supplier: Supplier) => {
        setSelectedSupplier(supplier);
        setIsProductsModalOpen(true);
        setLoadingProducts(true);
        try {
            const products = await window.api.db.getProductsBySupplier(supplier.id);
            setSupplierProducts(products);
        } catch (error) {
            console.error("Error loading supplier products:", error);
        } finally {
            setLoadingProducts(false);
        }
    };

    const filteredSuppliers = suppliers.filter(s => 
        (s.nombre || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.contacto || "").toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="stats-grid">
                <div className="stat-card">
                    <span className="label">Total Proveedores</span>
                    <span className="value">{suppliers.length}</span>
                </div>
                <div className="stat-card">
                    <span className="label">Gestión de Proveedores</span>
                    <span className="value" style={{ fontSize: '1.2rem' }}>
                        Activo
                    </span>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                <div className="search-bar" style={{ flex: 1, position: 'relative' }}>
                    <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={18} />
                    <input 
                        type="text" 
                        placeholder="Buscar proveedor por nombre o contacto..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ width: '100%', padding: '12px 12px 12px 40px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--text-primary)', fontSize: '1rem' }}
                    />
                </div>
                <button className="btn btn-primary" onClick={handleOpenAddModal} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Plus size={18} />
                    Nuevo Proveedor
                </button>
            </div>

            <div className="data-table-container" style={{ flex: 1, overflowY: 'auto' }}>
                <table style={{ width: '100%' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-card)', zIndex: 1 }}>
                        <tr>
                            <th>Nombre</th>
                            <th>Contacto</th>
                            <th>Teléfono</th>
                            <th>Email</th>
                            <th style={{ textAlign: 'center' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px' }}>Cargando proveedores...</td></tr>
                        ) : filteredSuppliers.length === 0 ? (
                            <tr><td colSpan={5} style={{ textAlign: 'center', padding: '40px' }}>No se encontraron proveedores.</td></tr>
                        ) : filteredSuppliers.map(supplier => (
                            <tr key={supplier.id} onClick={() => handleViewProducts(supplier)} style={{ cursor: 'pointer' }}>
                                <td style={{ fontWeight: 600 }}>{supplier.nombre}</td>
                                <td>{supplier.contacto || '-'}</td>
                                <td>{supplier.telefono || '-'}</td>
                                <td>{supplier.email || '-'}</td>
                                <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                    <button 
                                        className="btn" 
                                        title="Ver Productos"
                                        style={{ padding: '6px', backgroundColor: 'transparent', color: '#60a5fa' }} 
                                        onClick={() => handleViewProducts(supplier)}
                                    >
                                        <Package size={18} />
                                    </button>
                                    <button 
                                        className="btn" 
                                        title="Editar Proveedor"
                                        style={{ padding: '6px', backgroundColor: 'transparent', color: '#f59e0b' }} 
                                        onClick={() => handleOpenEditModal(supplier)}
                                    >
                                        <Edit2 size={18} />
                                    </button>
                                    <button 
                                        className="btn" 
                                        title="Eliminar Proveedor"
                                        style={{ padding: '6px', backgroundColor: 'transparent', color: '#f87171' }} 
                                        onClick={() => handleDelete(supplier.id)}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Add/Edit Modal */}
            {isModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'var(--bg-card)', padding: '30px', borderRadius: '16px', width: '500px', border: '1px solid var(--border)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>{editingSupplier ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h3>
                            <X size={24} style={{ cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={() => setIsModalOpen(false)} />
                        </div>
                        <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Nombre de la Empresa *</label>
                                <input type="text" required value={formData.nombre} onChange={e => setFormData({ ...formData, nombre: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Persona de Contacto</label>
                                <input type="text" value={formData.contacto} onChange={e => setFormData({ ...formData, contacto: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Teléfono</label>
                                <div style={{ position: 'relative' }}>
                                    <Phone size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                                    <input type="text" value={formData.telefono} onChange={e => setFormData({ ...formData, telefono: e.target.value })} style={{ width: '100%', padding: '10px 10px 10px 30px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                                </div>
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Email (Opcional)</label>
                                <div style={{ position: 'relative' }}>
                                    <Mail size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                                    <input type="text" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} style={{ width: '100%', padding: '10px 10px 10px 30px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                                </div>
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Dirección</label>
                                <div style={{ position: 'relative' }}>
                                    <MapPin size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                                    <input type="text" value={formData.direccion} onChange={e => setFormData({ ...formData, direccion: e.target.value })} style={{ width: '100%', padding: '10px 10px 10px 30px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                                </div>
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Notas</label>
                                <textarea value={formData.notas} onChange={e => setFormData({ ...formData, notas: e.target.value })} style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box', height: '80px', resize: 'none' }} />
                            </div>
                            <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                <button type="button" className="btn" onClick={() => setIsModalOpen(false)} style={{ backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Products by Supplier Modal */}
            {isProductsModalOpen && selectedSupplier && (
                 <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'var(--bg-card)', padding: '30px', borderRadius: '16px', width: '700px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>Productos de {selectedSupplier.nombre}</h3>
                                <p style={{ margin: '5px 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Total: {supplierProducts.length} productos vinculados</p>
                            </div>
                            <X size={24} style={{ cursor: 'pointer', color: 'var(--text-secondary)' }} onClick={() => setIsProductsModalOpen(false)} />
                        </div>
                        
                        <div className="data-table-container" style={{ flex: 1, overflowY: 'auto' }}>
                            <table style={{ width: '100%' }}>
                                <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-card)', zIndex: 1 }}>
                                    <tr>
                                        <th>Código</th>
                                        <th>Producto</th>
                                        <th>Categoría</th>
                                        <th style={{ textAlign: 'right' }}>Stock</th>
                                        <th style={{ textAlign: 'right' }}>Precio</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loadingProducts ? (
                                        <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>Buscando productos...</td></tr>
                                    ) : supplierProducts.length === 0 ? (
                                        <tr><td colSpan={5} style={{ textAlign: 'center', padding: '20px' }}>Este proveedor aún no tiene productos vinculados.</td></tr>
                                    ) : supplierProducts.map(product => (
                                        <tr key={product.id}>
                                            <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{product.codigo_barras}</td>
                                            <td style={{ fontWeight: 600 }}>{product.nombre}</td>
                                            <td><span className="badge">{product.categoria}</span></td>
                                            <td style={{ textAlign: 'right', fontWeight: 600, color: product.stock <= 5 ? '#f87171' : 'inherit' }}>
                                                {product.stock} {product.es_por_kilo ? 'kg' : 'u'}
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 700 }}>${product.precio.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                            <button type="button" className="btn" onClick={() => setIsProductsModalOpen(false)} style={{ backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>Cerrar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
