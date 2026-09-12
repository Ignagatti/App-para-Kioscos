import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, AlertCircle, Edit, Trash2, PackageSearch, Globe, Database, Sparkles, Loader2, Image as ImageIcon } from 'lucide-react';
import Swal from 'sweetalert2';
import withReactContent from 'sweetalert2-react-content';
import type { Product, Category } from '../types/electron';

const MySwal = withReactContent(Swal);

export default function Inventario() {
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
    const [isLookingUp, setIsLookingUp] = useState(false);
    const [apiLookupStatus, setApiLookupStatus] = useState<string | null>(null);

    // Form inputs
    const [inputPrecio, setInputPrecio] = useState('');
    const [inputCosto, setInputCosto] = useState('');
    const [inputStock, setInputStock] = useState('');
    const [inputPrecioKilo, setInputPrecioKilo] = useState('');
    const [inputMarca, setInputMarca] = useState('');
    const [inputImagenUrl, setInputImagenUrl] = useState('');
    const [inputDescripcion, setInputDescripcion] = useState('');
    const [fuenteDatos, setFuenteDatos] = useState<string | null>(null);

    // Refs for keyboard focus flow
    const barcodeInputRef = useRef<HTMLInputElement>(null);
    const precioInputRef = useRef<HTMLInputElement>(null);
    const nombreInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadData();
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !Swal.isVisible()) {
                setIsModalOpen(false);
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    const loadData = async () => {
        try {
            const [prodData, catData] = await Promise.all([
                window.api.db.getProducts(),
                window.api.db.getCategories()
            ]);
            setProducts(prodData);
            setCategories(catData);
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Asignador inteligente de categoría basado en el texto recibido de la API
    const findMatchingCategory = (categoryHint?: string, currentCategories: Category[] = categories): number | null => {
        if (!categoryHint || currentCategories.length === 0) return null;
        const normalizedHint = categoryHint.toLowerCase();

        for (const cat of currentCategories) {
            const catName = cat.nombre.toLowerCase();
            if (normalizedHint.includes(catName) || catName.includes(normalizedHint)) {
                return cat.id;
            }
        }

        const keywordsMap: Record<string, string[]> = {
            'Bebidas': ['beverage', 'drink', 'soda', 'gaseosa', 'agua', 'jugo', 'cerveza', 'vino', 'refresco', 'aperitivo'],
            'Golosinas': ['snack', 'candy', 'chocolate', 'caramel', 'dulce', 'galletita', 'biscuit', 'alfajor', 'chupetin', 'confite', 'barrita'],
            'Fiambres': ['jamon', 'queso', 'salame', 'embutido', 'fiambre', 'panceta', 'salchicha'],
            'Lácteos': ['dairy', 'milk', 'leche', 'yogur', 'yogurt', 'manteca', 'crema', 'dulce de leche'],
            'Limpieza': ['cleaning', 'detergent', 'lavandina', 'jabon', 'shampoo', 'desodorante', 'limpiador', 'papel'],
            'Almacén': ['pasta', 'arroz', 'harina', 'aceite', 'fideos', 'conserva', 'enlatado', 'aderezo', 'mayonesa', 'ketchup', 'mostaza', 'galletitas'],
            'Cigarrillos': ['tobacco', 'cigarette', 'cigarro', 'tabaco', 'fumador'],
        };

        for (const [targetCatName, keywords] of Object.entries(keywordsMap)) {
            const matchedCategory = currentCategories.find(c => c.nombre.toLowerCase() === targetCatName.toLowerCase());
            if (matchedCategory && keywords.some(k => normalizedHint.includes(k))) {
                return matchedCategory.id;
            }
        }

        return null;
    };

    const handleLookupBarcode = async (barcodeToSearch: string) => {
        const cleanBarcode = barcodeToSearch.trim();
        if (!cleanBarcode) return;

        // 1. PASO PRIMORDIAL: Verificar si ya existe en la base de datos local
        try {
            const localProduct = await window.api.db.getProductByBarcode(cleanBarcode);
            if (localProduct && (!editingProduct?.id || editingProduct.id !== localProduct.id)) {
                const result = await MySwal.fire({
                    icon: 'info',
                    title: 'Producto ya registrado',
                    html: `
                        <div style="text-align: left; background: rgba(255,255,255,0.05); padding: 14px; border-radius: 8px; margin: 12px 0; border: 1px solid var(--border);">
                            <p style="margin: 0 0 6px 0; font-size: 1.05rem;"><strong>Producto:</strong> ${localProduct.nombre}</p>
                            ${localProduct.marca ? `<p style="margin: 0 0 6px 0; font-size: 0.9rem; color: var(--text-secondary);"><strong>Marca:</strong> ${localProduct.marca}</p>` : ''}
                            <p style="margin: 0 0 6px 0; color: #4ade80;"><strong>Precio actual:</strong> $${(localProduct.precio || 0).toLocaleString()}</p>
                            <p style="margin: 0; color: #60a5fa;"><strong>Stock actual:</strong> ${localProduct.stock || 0} ${localProduct.es_por_kilo ? 'kg' : 'u'}</p>
                        </div>
                        <p style="margin-top: 10px; font-size: 0.95rem;">¿Deseas editar este producto o sumar stock?</p>
                    `,
                    showCancelButton: true,
                    confirmButtonText: 'Editar / Actualizar Stock',
                    cancelButtonText: 'Ingresar otro código',
                    confirmButtonColor: '#3b82f6',
                    cancelButtonColor: '#334155',
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)'
                });

                if (result.isConfirmed) {
                    openModal(localProduct);
                }
                return;
            }
        } catch (e) {
            console.error("Error al consultar DB local:", e);
        }

        // 2. PASO SECUNDARIO: Si NO existe en BD local, consultar APIs externas (Open Food Facts v3 -> UPCitemdb)
        setIsLookingUp(true);
        setApiLookupStatus('Consultando Open Food Facts y catálogo global...');
        try {
            const apiResult = await window.api.barcode.lookup(cleanBarcode);
            if (apiResult.found && apiResult.name) {
                const matchedCatId = findMatchingCategory(apiResult.category);
                
                setEditingProduct(prev => ({
                    ...prev,
                    codigo_barras: cleanBarcode,
                    nombre: apiResult.name,
                    marca: apiResult.brand || prev?.marca || '',
                    categoria_id: matchedCatId || prev?.categoria_id || null,
                }));
                
                if (apiResult.brand) setInputMarca(apiResult.brand);
                if (apiResult.imageUrl) setInputImagenUrl(apiResult.imageUrl);
                if (apiResult.description) setInputDescripcion(apiResult.description);
                setFuenteDatos(apiResult.source || 'OpenFoodFacts');

                // Enfocar inmediatamente en el precio de venta para agilizar la carga
                setTimeout(() => {
                    precioInputRef.current?.focus();
                    precioInputRef.current?.select();
                }, 150);
            } else {
                setFuenteDatos('Manual');
                MySwal.fire({
                    icon: 'warning',
                    title: 'No encontrado',
                    text: 'Producto no encontrado en la base de datos mundial.',
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)'
                });
                setTimeout(() => {
                    nombreInputRef.current?.focus();
                }, 150);
            }
        } catch (e) {
            console.error("Lookup error:", e);
            setFuenteDatos('Manual');
        } finally {
            setIsLookingUp(false);
            setApiLookupStatus(null);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const precio = parseFloat(inputPrecio) || 0;
        const costo = parseFloat(inputCosto) || 0;
        const stock = parseFloat(inputStock) || 0;
        const precioKilo = parseFloat(inputPrecioKilo) || 0;

        const isValidPrice = editingProduct?.es_por_kilo ? (precioKilo > 0) : (precio > 0);

        if (!editingProduct?.codigo_barras?.trim() || !editingProduct?.nombre?.trim() || !isValidPrice) {
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
            await window.api.db.saveProduct({
                id: editingProduct.id,
                codigo_barras: editingProduct.codigo_barras.trim(),
                nombre: editingProduct.nombre.trim(),
                precio: precio,
                precio_costo: costo,
                stock: stock,
                categoria_id: editingProduct.categoria_id || null,
                es_por_kilo: editingProduct.es_por_kilo ? 1 : 0,
                precio_por_kilo: precioKilo,
                marca: inputMarca.trim() || null,
                imagen_url: inputImagenUrl.trim() || null,
                descripcion: inputDescripcion.trim() || null,
                fuente_datos: fuenteDatos || (editingProduct.id ? editingProduct.fuente_datos : 'Manual'),
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
                text: 'Revisá que el código de barras no esté duplicado con otro producto.',
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

        if (categoryName?.trim()) {
            try {
                const newCatId = await window.api.db.addCategory(categoryName.trim());
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

    const openModal = (product?: Product, initialBarcode?: string) => {
        if (product) {
            setEditingProduct(product);
            setInputPrecio(product.precio?.toString() || '');
            setInputCosto(product.precio_costo?.toString() || '');
            setInputStock(product.stock?.toString() || '');
            setInputPrecioKilo(product.precio_por_kilo?.toString() || '');
            setInputMarca(product.marca || '');
            setInputImagenUrl(product.imagen_url || '');
            setInputDescripcion(product.descripcion || '');
            setFuenteDatos(product.fuente_datos || 'Manual');
        } else {
            const barcode = initialBarcode || '';
            setEditingProduct({
                codigo_barras: barcode,
                nombre: '',
                categoria_id: null,
                es_por_kilo: 0
            });
            setInputPrecio('');
            setInputCosto('');
            setInputStock('');
            setInputPrecioKilo('');
            setInputMarca('');
            setInputImagenUrl('');
            setInputDescripcion('');
            setFuenteDatos(null);

            if (barcode) {
                setTimeout(() => handleLookupBarcode(barcode), 100);
            }
        }
        setIsModalOpen(true);
        setTimeout(() => {
            if (!product && !initialBarcode) {
                barcodeInputRef.current?.focus();
            }
        }, 150);
    };

    const handleSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && searchQuery.trim()) {
            const query = searchQuery.trim();
            const exactProduct = products.find(p => p.codigo_barras === query);
            if (exactProduct) {
                openModal(exactProduct);
            } else if (/^\d{6,}$/.test(query) && filteredInventory.length === 0) {
                const res = await MySwal.fire({
                    title: 'Código no encontrado',
                    text: `El código "${query}" no está en tu inventario. ¿Deseas darlo de alta ahora?`,
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, buscar y crear',
                    cancelButtonText: 'Cancelar',
                    confirmButtonColor: '#3b82f6',
                    cancelButtonColor: '#334155',
                    background: 'var(--bg-card)',
                    color: 'var(--text-primary)'
                });
                if (res.isConfirmed) {
                    openModal(undefined, query);
                    setSearchQuery('');
                }
            }
        }
    };

    const filteredInventory = products.filter(p => {
        const name = p.nombre || '';
        const barcode = p.codigo_barras || '';
        const brand = p.marca || '';
        const category = p.categoria || '';
        const q = searchQuery.toLowerCase();
        return name.toLowerCase().includes(q) || 
               barcode.includes(q) ||
               brand.toLowerCase().includes(q) ||
               category.toLowerCase().includes(q);
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
                        onKeyDown={handleSearchKeyDown}
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
                            <th style={{ width: '50px' }}></th>
                            <th>Código</th>
                            <th>Producto</th>
                            <th>Categoría</th>
                            <th>Costo</th>
                            <th>Precio</th>
                            <th>Stock</th>
                            <th>Origen</th>
                            <th style={{ textAlign: 'center' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={9} style={{ textAlign: 'center', padding: '40px' }}>Cargando inventario...</td></tr>
                        ) : filteredInventory.length === 0 ? (
                            <tr><td colSpan={9} style={{ textAlign: 'center', padding: '40px' }}>No se encontraron productos.</td></tr>
                        ) : filteredInventory.map(product => (
                            <tr key={product.id}>
                                <td style={{ textAlign: 'center', padding: '8px' }}>
                                    {product.imagen_url ? (
                                        <img 
                                            src={product.imagen_url} 
                                            alt={product.nombre} 
                                            style={{ width: '36px', height: '36px', objectFit: 'contain', borderRadius: '6px', backgroundColor: '#ffffff', padding: '2px' }}
                                            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                        />
                                    ) : (
                                        <div style={{ width: '36px', height: '36px', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                                            <ImageIcon size={16} />
                                        </div>
                                    )}
                                </td>
                                <td style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{product.codigo_barras}</td>
                                <td>
                                    <div style={{ fontWeight: 600 }}>
                                        {product.nombre} {product.es_por_kilo ? <span style={{fontSize: '0.75rem', color: '#f59e0b'}}>(Fiambre/Peso)</span> : ''}
                                    </div>
                                    {product.marca && (
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                            Marca: {product.marca}
                                        </div>
                                    )}
                                </td>
                                <td>{product.categoria || '-'}</td>
                                <td style={{ color: 'var(--text-secondary)' }}>${(product.precio_costo || 0).toLocaleString()}</td>
                                <td style={{ fontWeight: 700, color: '#60a5fa' }}>${(product.precio || 0).toLocaleString()}</td>
                                <td>
                                    <span className={`badge ${(product.stock || 0) < 5 ? 'badge-low' : 'badge-ok'}`}>
                                        {(product.stock || 0) < 5 && <AlertCircle size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />}
                                        {product.stock || 0} {product.es_por_kilo ? 'kg' : ''}
                                    </span>
                                </td>
                                <td>
                                    {product.fuente_datos === 'OpenFoodFacts' && (
                                        <span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: '6px', backgroundColor: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            <Globe size={11} /> OpenFoodFacts
                                        </span>
                                    )}
                                    {product.fuente_datos === 'UPCitemdb' && (
                                        <span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: '6px', backgroundColor: 'rgba(96, 165, 250, 0.15)', color: '#60a5fa', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            <PackageSearch size={11} /> UPCitemdb
                                        </span>
                                    )}
                                    {(!product.fuente_datos || product.fuente_datos === 'Manual') && (
                                        <span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: '6px', backgroundColor: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            <Database size={11} /> Manual
                                        </span>
                                    )}
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
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'var(--bg-card)', padding: '28px', borderRadius: '16px', width: '560px', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>
                                {editingProduct?.id ? 'Editar Producto' : 'Nuevo Producto'}
                            </h3>
                            {fuenteDatos && (
                                <span style={{
                                    fontSize: '0.8rem',
                                    padding: '4px 10px',
                                    borderRadius: '8px',
                                    backgroundColor: fuenteDatos === 'OpenFoodFacts' ? 'rgba(34, 197, 94, 0.2)' : fuenteDatos === 'UPCitemdb' ? 'rgba(96, 165, 250, 0.2)' : 'rgba(148, 163, 184, 0.2)',
                                    color: fuenteDatos === 'OpenFoodFacts' ? '#4ade80' : fuenteDatos === 'UPCitemdb' ? '#60a5fa' : '#cbd5e1',
                                    fontWeight: 600,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    border: '1px solid var(--border)'
                                }}>
                                    <Sparkles size={13} /> {fuenteDatos === 'OpenFoodFacts' ? 'Open Food Facts v3' : fuenteDatos === 'UPCitemdb' ? 'UPCitemdb' : 'Manual'}
                                </span>
                            )}
                        </div>
                        
                        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {/* Código de barras */}
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Código de Barras *</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input 
                                        ref={barcodeInputRef}
                                        type="text" 
                                        required 
                                        placeholder="Ej: 7791234567890"
                                        value={editingProduct?.codigo_barras || ''} 
                                        onChange={e => setEditingProduct(prev => ({ ...prev, codigo_barras: e.target.value }))}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleLookupBarcode(editingProduct?.codigo_barras || '');
                                            }
                                        }}
                                        style={{ flex: 1, padding: '10px 12px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '1.05rem' }}
                                    />
                                    <button 
                                        type="button" 
                                        onClick={() => handleLookupBarcode(editingProduct?.codigo_barras || '')}
                                        disabled={!editingProduct?.codigo_barras || isLookingUp}
                                        className="btn btn-primary"
                                        style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                                        title="Buscar en Open Food Facts"
                                    >
                                        {isLookingUp ? <Loader2 size={18} className="animate-spin" /> : <PackageSearch size={18} />}
                                        <span>{isLookingUp ? 'Buscando...' : 'Consultar API'}</span>
                                    </button>
                                </div>
                                {apiLookupStatus && (
                                    <div style={{ fontSize: '0.8rem', color: '#60a5fa', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Loader2 size={12} className="animate-spin" /> {apiLookupStatus}
                                    </div>
                                )}
                            </div>

                            {/* Vista previa de imagen si existe */}
                            {inputImagenUrl && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                    <img 
                                        src={inputImagenUrl} 
                                        alt="Vista previa" 
                                        style={{ width: '48px', height: '48px', objectFit: 'contain', backgroundColor: '#ffffff', borderRadius: '6px', padding: '2px' }}
                                        onError={() => setInputImagenUrl('')}
                                    />
                                    <div style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Imagen obtenida del catálogo</div>
                                        {inputImagenUrl}
                                    </div>
                                </div>
                            )}

                            {/* Nombre del Producto */}
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Nombre *</label>
                                <input 
                                    ref={nombreInputRef}
                                    type="text" 
                                    required 
                                    placeholder="Ej: Coca Cola 500ml"
                                    value={editingProduct?.nombre || ''} 
                                    onChange={e => setEditingProduct(prev => ({ ...prev, nombre: e.target.value }))}
                                    style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box', fontSize: '1rem', fontWeight: 600 }}
                                />
                            </div>

                            {/* Marca y Categoría */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Marca / Fabricante</label>
                                    <input 
                                        type="text" 
                                        placeholder="Ej: Coca-Cola, Arcor..."
                                        value={inputMarca} 
                                        onChange={e => setInputMarca(e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }}
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

                            {/* Venta por peso */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', backgroundColor: 'rgba(245, 158, 11, 0.1)', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                                <input 
                                    type="checkbox" 
                                    id="es_por_kilo"
                                    checked={!!editingProduct?.es_por_kilo}
                                    onChange={e => setEditingProduct(prev => ({ ...prev, es_por_kilo: e.target.checked ? 1 : 0 }))}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                />
                                <label htmlFor="es_por_kilo" style={{ color: '#f59e0b', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
                                    Vender por peso (Ej: Fiambres, Pan)
                                </label>
                            </div>

                            {/* Precios */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: '#4ade80', fontWeight: 600 }}>
                                        {editingProduct?.es_por_kilo ? 'Precio por Kilo ($) *' : 'Precio Venta ($) *'}
                                    </label>
                                    <input 
                                        ref={precioInputRef}
                                        type="number" 
                                        step="0.01" 
                                        required 
                                        placeholder="0.00"
                                        value={editingProduct?.es_por_kilo ? inputPrecioKilo : inputPrecio} 
                                        onChange={e => editingProduct?.es_por_kilo ? setInputPrecioKilo(e.target.value) : setInputPrecio(e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--bg-main)', border: '1px solid #4ade80', borderRadius: '8px', color: '#4ade80', fontSize: '1.15rem', fontWeight: 700, boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Precio Costo ($)</label>
                                    <input 
                                        type="number" 
                                        step="0.01" 
                                        placeholder="0.00"
                                        value={inputCosto} 
                                        onChange={e => setInputCosto(e.target.value)}
                                        style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '1.15rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            {/* Stock inicial */}
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                    {editingProduct?.es_por_kilo ? 'Stock (Kilos)' : 'Stock (Unidades)'}
                                </label>
                                <input 
                                    type="number" 
                                    step="0.01" 
                                    placeholder="0"
                                    value={inputStock} 
                                    onChange={e => setInputStock(e.target.value)}
                                    style={{ width: '100%', padding: '10px 12px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                                />
                            </div>

                            {/* Botones de acción */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
                                <button type="button" className="btn" onClick={() => setIsModalOpen(false)} style={{ backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '10px 18px' }}>
                                    Cancelar
                                </button>
                                <button type="submit" className="btn btn-primary" style={{ padding: '10px 24px', fontWeight: 600 }}>
                                    Guardar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
