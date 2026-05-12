import React, { useState, useEffect } from 'react';
import { Search, Plus, AlertCircle, Edit, Trash2, PackageSearch } from 'lucide-react';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import type { Product, Category, Supplier } from '../types/electron';

const MySwal = withReactContent(Swal);

export default function Inventario() {
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    
    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
    const [selectedSupplierIds, setSelectedSupplierIds] = useState<number[]>([]);
    const [isLookingUp, setIsLookingUp] = useState(false);

    // Controlled string inputs for numbers to prevent locking
    const [inputPrecio, setInputPrecio] = useState('');
    const [inputCosto, setInputCosto] = useState('');
    const [inputStock, setInputStock] = useState('');
    const [inputPrecioKilo, setInputPrecioKilo] = useState('');

    useEffect(() => {
        loadData();
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsModalOpen(false);
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    const loadData = async () => {
        try {
            const [prodData, catData, supData] = await Promise.all([
                window.api.db.getProducts(),
                window.api.db.getCategories(),
                window.api.db.getSuppliers()
            ]);
            setProducts(prodData);
            setCategories(catData);
            setSuppliers(supData);
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleLookupBarcode = async (barcode: string) => {
        if (!barcode) return;
        setIsLookingUp(true);
        try {
            const result = await window.api.barcode.lookup(barcode);
            if (result.found && result.name) {
                setEditingProduct(prev => ({ ...prev, nombre: result.name }));
            } else {
                MySwal.fire({
                    icon: 'warning',
                    title: 'No encontrado',
                    text: 'Producto no encontrado en la base de datos mundial.',
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)'
                });
            }
        } catch (e) {
            console.error("Lookup error", e);
        } finally {
            setIsLookingUp(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const precio = parseFloat(inputPrecio) || 0;
        const costo = parseFloat(inputCosto) || 0;
        const stock = parseFloat(inputStock) || 0;
        const precioKilo = parseFloat(inputPrecioKilo) || 0;

        const isValidPrice = editingProduct?.es_por_kilo ? (precioKilo > 0) : (precio > 0);

        if (!editingProduct?.codigo_barras || !editingProduct?.nombre || !isValidPrice) {
            MySwal.fire({
                icon: 'error',
                title: 'Error',
                text: 'El código, nombre y precio de venta (mayor a 0) son obligatorios.',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)'
            });
            return;
        }

        try {
            const res = await window.api.db.saveProduct({
                id: editingProduct.id,
                codigo_barras: editingProduct.codigo_barras,
                nombre: editingProduct.nombre,
                precio: precio,
                precio_costo: costo,
                stock: stock,
                categoria_id: editingProduct.categoria_id || null,
                es_por_kilo: editingProduct.es_por_kilo ? 1 : 0,
                precio_por_kilo: precioKilo
            });

            // Save suppliers
            const productId = editingProduct.id || res.id;
            await window.api.db.updateProductSuppliers({
                productId,
                supplierIds: selectedSupplierIds
            });

            setIsModalOpen(false);
            MySwal.fire({
                icon: 'success',
                title: 'Guardado',
                text: 'El producto se guardó correctamente.',
                timer: 1500,
                showConfirmButton: false,
                background: 'var(--bg-card)',
                color: 'var(--text-primary)'
            });
            loadData();
        } catch (error) {
            console.error("Error saving:", error);
            MySwal.fire({
                icon: 'error',
                title: 'Error al guardar',
                background: 'var(--bg-card)',
                color: 'var(--text-primary)'
            });
        }
    };

    const handleDelete = async (id: number) => {
        const result = await MySwal.fire({
            title: '¿Estás seguro?',
            text: "No podrás revertir esto",
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
            await window.api.db.deleteProduct(id);
            loadData();
            MySwal.fire({
                icon: 'success',
                title: 'Eliminado!',
                timer: 1500,
                showConfirmButton: false,
                background: 'var(--bg-card)',
                color: 'var(--text-primary)'
            });
        }
    };

    const handleAddCategory = async () => {
        const { value: categoryName } = await MySwal.fire({
            title: 'Nueva Categoría',
            input: 'text',
            inputLabel: 'Nombre de la categoría',
            inputPlaceholder: 'Ej: Fiambres, Bebidas...',
            showCancelButton: true,
            confirmButtonColor: '#3b82f6',
            cancelButtonColor: '#334155',
            background: 'var(--bg-card)',
            color: 'var(--text-primary)'
        });

        if (categoryName) {
            try {
                const newCatId = await window.api.db.addCategory(categoryName);
                await loadData();
                setEditingProduct(prev => ({ ...prev, categoria_id: Number(newCatId) }));
                MySwal.fire({
                    icon: 'success',
                    title: 'Agregada!',
                    timer: 1500,
                    showConfirmButton: false,
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)'
                });
            } catch (error) {
                MySwal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'No se pudo agregar la categoría',
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)'
                });
            }
        }
    };

    const openModal = async (product?: Product) => {
        if (product) {
            setEditingProduct(product);
            setInputPrecio(product.precio?.toString() || '');
            setInputCosto(product.precio_costo?.toString() || '');
            setInputStock(product.stock?.toString() || '');
            setInputPrecioKilo(product.precio_por_kilo?.toString() || '');
            
            // Load selected suppliers
            const linked = await window.api.db.getSuppliersByProduct(product.id);
            setSelectedSupplierIds(linked.map(s => s.id));
        } else {
            setEditingProduct({
                codigo_barras: '',
                nombre: '',
                categoria_id: null,
                es_por_kilo: 0
            });
            setInputPrecio('');
            setInputCosto('');
            setInputStock('');
            setInputPrecioKilo('');
            setSelectedSupplierIds([]);
        }
        setIsModalOpen(true);
    };

    const filteredInventory = products.filter(p => {
        const name = p.nombre || '';
        const barcode = p.codigo_barras || '';
        return name.toLowerCase().includes(searchQuery.toLowerCase()) || 
               barcode.includes(searchQuery);
    });

    return (
        <div className="inventory-module" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="stats-grid">
                <div className="stat-card">
                    <span className="label">Total Productos</span>
                    <span className="value">{products.length}</span>
                </div>
                <div className="stat-card">
                    <span className="label">Stock Bajo</span>
                    <span className="value" style={{ color: '#f87171' }}>
                        {products.filter(p => (p.stock || 0) < 5).length}
                    </span>
                </div>
                <div className="stat-card">
                    <span className="label">Valor Inventario (Precio Venta)</span>
                    <span className="value" style={{ color: '#4ade80' }}>
                        ${products.reduce((acc, p) => {
                            const precioEfectivo = p.es_por_kilo ? (p.precio_por_kilo || 0) : (p.precio || 0);
                            return acc + (precioEfectivo * (p.stock || 0));
                        }, 0).toLocaleString()}
                    </span>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px' }}>
                <div className="search-bar" style={{ flex: 1, position: 'relative' }}>
                    <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={18} />
                    <input 
                        type="text" 
                        placeholder="Buscar por nombre o código de barras..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ width: '100%', padding: '12px 12px 12px 40px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', color: 'var(--text-primary)', fontSize: '1rem' }}
                    />
                </div>
                <button className="btn btn-primary" onClick={() => openModal()} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Plus size={18} />
                    Nuevo Producto
                </button>
            </div>

            <div className="data-table-container" style={{ flex: 1, overflowY: 'auto' }}>
                <table style={{ width: '100%' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--bg-card)', zIndex: 1 }}>
                        <tr>
                            <th>Código</th>
                            <th>Producto</th>
                            <th>Categoría</th>
                            <th>Proveedor</th>
                            <th>Costo</th>
                            <th>Precio</th>
                            <th>Stock</th>
                            <th style={{ textAlign: 'center' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px' }}>Cargando inventario...</td></tr>
                        ) : filteredInventory.length === 0 ? (
                            <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px' }}>No se encontraron productos.</td></tr>
                        ) : filteredInventory.map(product => (
                            <tr key={product.id}>
                                <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{product.codigo_barras}</td>
                                <td style={{ fontWeight: 600 }}>{product.nombre} {product.es_por_kilo ? <span style={{fontSize: '0.75rem', color: '#f59e0b'}}>(Fiambre/Peso)</span> : ''}</td>
                                <td>{product.categoria || '-'}</td>
                                <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{product.proveedores || '-'}</td>
                                <td style={{ color: 'var(--text-secondary)' }}>${(product.precio_costo || 0).toLocaleString()}</td>
                                <td style={{ fontWeight: 700, color: '#60a5fa' }}>${(product.precio || 0).toLocaleString()}</td>
                                <td>
                                    <span className={`badge ${(product.stock || 0) < 5 ? 'badge-low' : 'badge-ok'}`}>
                                        {(product.stock || 0) < 5 && <AlertCircle size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />}
                                        {product.stock || 0} {product.es_por_kilo ? 'kg' : ''}
                                    </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                    <button className="btn" style={{ padding: '6px', backgroundColor: 'transparent', color: '#60a5fa' }} onClick={() => openModal(product)}>
                                        <Edit size={18} />
                                    </button>
                                    <button className="btn" style={{ padding: '6px', backgroundColor: 'transparent', color: '#f87171' }} onClick={() => handleDelete(product.id)}>
                                        <Trash2 size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'var(--bg-card)', padding: '30px', borderRadius: '16px', width: '500px', border: '1px solid var(--border)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.5rem', fontWeight: 600 }}>
                            {editingProduct?.id ? 'Editar Producto' : 'Nuevo Producto'}
                        </h3>
                        
                        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Código de Barras *</label>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <input 
                                        type="text" 
                                        required 
                                        value={editingProduct?.codigo_barras || ''} 
                                        onChange={e => setEditingProduct(prev => ({ ...prev, codigo_barras: e.target.value }))}
                                        style={{ flex: 1, padding: '10px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)' }}
                                    />
                                    <button 
                                        type="button" 
                                        onClick={() => handleLookupBarcode(editingProduct?.codigo_barras || '')}
                                        disabled={!editingProduct?.codigo_barras || isLookingUp}
                                        className="btn btn-primary"
                                        style={{ padding: '10px' }}
                                        title="Buscar en Open Food Facts"
                                    >
                                        <PackageSearch size={20} />
                                    </button>
                                </div>
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Nombre *</label>
                                <input 
                                    type="text" 
                                    required 
                                    value={editingProduct?.nombre || ''} 
                                    onChange={e => setEditingProduct(prev => ({ ...prev, nombre: e.target.value }))}
                                    style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', backgroundColor: 'rgba(245, 158, 11, 0.1)', borderRadius: '8px' }}>
                                <input 
                                    type="checkbox" 
                                    id="es_por_kilo"
                                    checked={!!editingProduct?.es_por_kilo}
                                    onChange={e => setEditingProduct(prev => ({ ...prev, es_por_kilo: e.target.checked ? 1 : 0 }))}
                                    style={{ width: '20px', height: '20px' }}
                                />
                                <label htmlFor="es_por_kilo" style={{ color: '#f59e0b', fontWeight: 600, cursor: 'pointer' }}>Vender por peso (Ej: Fiambres, Pan)</label>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                        {editingProduct?.es_por_kilo ? 'Precio por Kilo ($) *' : 'Precio Venta ($) *'}
                                    </label>
                                    <input 
                                        type="number" 
                                        step="0.01" 
                                        required 
                                        value={editingProduct?.es_por_kilo ? inputPrecioKilo : inputPrecio} 
                                        onChange={e => editingProduct?.es_por_kilo ? setInputPrecioKilo(e.target.value) : setInputPrecio(e.target.value)}
                                        style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Precio Costo ($)</label>
                                    <input 
                                        type="number" 
                                        step="0.01" 
                                        value={inputCosto} 
                                        onChange={e => setInputCosto(e.target.value)}
                                        style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                        {editingProduct?.es_por_kilo ? 'Stock (Kilos)' : 'Stock (Unidades)'}
                                    </label>
                                    <input 
                                        type="number" 
                                        step="0.01" 
                                        value={inputStock} 
                                        onChange={e => setInputStock(e.target.value)}
                                        style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Categoría</label>
                                    <div style={{ display: 'flex', gap: '5px' }}>
                                        <select 
                                            value={editingProduct?.categoria_id || ''} 
                                            onChange={e => setEditingProduct(prev => ({ ...prev, categoria_id: e.target.value ? parseInt(e.target.value) : null }))}
                                            style={{ flex: 1, padding: '10px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                                        >
                                            <option value="">Ninguna</option>
                                            {categories.map(c => (
                                                <option key={c.id} value={c.id}>{c.nombre}</option>
                                            ))}
                                        </select>
                                        <button type="button" onClick={handleAddCategory} className="btn btn-primary" style={{ padding: '10px' }} title="Agregar Categoría">
                                            <Plus size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginTop: '5px' }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Proveedores (Seleccionar uno o varios)</label>
                                <div style={{ 
                                    maxHeight: '120px', 
                                    overflowY: 'auto', 
                                    padding: '10px', 
                                    backgroundColor: 'var(--bg-main)', 
                                    border: '1px solid var(--border)', 
                                    borderRadius: '8px',
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr',
                                    gap: '8px'
                                }}>
                                    {suppliers.length === 0 ? (
                                        <p style={{ gridColumn: 'span 2', fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>No hay proveedores registrados.</p>
                                    ) : suppliers.map(s => (
                                        <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                                            <input 
                                                type="checkbox" 
                                                checked={selectedSupplierIds.includes(s.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedSupplierIds([...selectedSupplierIds, s.id]);
                                                    } else {
                                                        setSelectedSupplierIds(selectedSupplierIds.filter(id => id !== s.id));
                                                    }
                                                }}
                                            />
                                            {s.nombre}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                                <button type="button" className="btn" onClick={() => setIsModalOpen(false)} style={{ backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>Cancelar</button>
                                <button type="submit" className="btn btn-primary">Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
