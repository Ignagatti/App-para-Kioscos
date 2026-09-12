import type { ElectronAPI, Product, Category, SessionStatus, Client, Movement, ReportDetail, ReportMonthly, ProductApiResult } from './electron';

// Mock data for development & browser testing
let mockProductsList: Product[] = [
    { id: 1, codigo_barras: '7791234567890', nombre: 'Coca Cola 500ml', precio: 1500, precio_costo: 1000, stock: 24, categoria_id: 1, es_por_kilo: 0, precio_por_kilo: 0, categoria: 'Bebidas', marca: 'Coca-Cola', fuente_datos: 'OpenFoodFacts' },
    { id: 2, codigo_barras: '7799876543210', nombre: 'Alfajor Jorgito Chocolate', precio: 800, precio_costo: 500, stock: 30, categoria_id: 2, es_por_kilo: 0, precio_por_kilo: 0, categoria: 'Golosinas', marca: 'Jorgito', fuente_datos: 'OpenFoodFacts' },
    { id: 3, codigo_barras: '111111111', nombre: 'Queso Cremoso La Paulina', precio: 6500, precio_costo: 4500, stock: 5.5, categoria_id: 3, es_por_kilo: 1, precio_por_kilo: 6500, categoria: 'Fiambres', marca: 'La Paulina', fuente_datos: 'Manual' },
];

let mockCategoriesList: Category[] = [
    { id: 1, nombre: 'Bebidas' },
    { id: 2, nombre: 'Golosinas' },
    { id: 3, nombre: 'Fiambres' },
    { id: 4, nombre: 'Almacén' },
    { id: 5, nombre: 'Lácteos' },
    { id: 6, nombre: 'Limpieza' },
    { id: 7, nombre: 'Cigarrillos' },
    { id: 8, nombre: 'Varios' },
];

let mockClientsList: Client[] = [
    { id: 1, nombre: 'Juan Pérez', saldo: 1500, telefono: '1122334455' },
    { id: 2, nombre: 'María García', saldo: 0, telefono: '1199887766' },
];

let mockSessionState: SessionStatus | undefined = undefined;
let mockLastClosing: number | null = 5000;
let mockMovimientosList: Movement[] = [];
let mockSalesList: any[] = [];

export const mockElectronAPI: ElectronAPI = {
    db: {
        getProducts: async () => [...mockProductsList],
        getProductByBarcode: async (barcode: string) => mockProductsList.find(p => p.codigo_barras === barcode),
        searchProducts: async (query: string) => {
            const q = query.toLowerCase().trim();
            const exact = mockProductsList.find(p => p.codigo_barras === q);
            if (exact) return [exact];
            return mockProductsList.filter(p => 
                p.nombre.toLowerCase().includes(q) || 
                (p.marca && p.marca.toLowerCase().includes(q)) || 
                p.codigo_barras.includes(q)
            );
        },
        saveProduct: async (p: any) => {
            if (p.id) {
                const idx = mockProductsList.findIndex(x => x.id === p.id);
                if (idx >= 0) {
                    const cat = mockCategoriesList.find(c => c.id === p.categoria_id)?.nombre || 'Varios';
                    mockProductsList[idx] = { ...mockProductsList[idx], ...p, categoria: cat };
                }
                return { id: p.id, updated: true };
            } else {
                const newId = Date.now();
                const cat = mockCategoriesList.find(c => c.id === p.categoria_id)?.nombre || 'Varios';
                mockProductsList.push({ ...p, id: newId, categoria: cat });
                return { id: newId, updated: false };
            }
        },
        deleteProduct: async (id: number) => {
            mockProductsList = mockProductsList.filter(p => p.id !== id);
        },
        
        getCategories: async () => [...mockCategoriesList],
        addCategory: async (nombre: string) => {
            const existing = mockCategoriesList.find(c => c.nombre.toLowerCase() === nombre.toLowerCase());
            if (existing) return existing.id;
            const newId = mockCategoriesList.length + 1;
            mockCategoriesList.push({ id: newId, nombre });
            return newId;
        },
        
        getLastClosingAmount: async () => mockLastClosing,
        getSessionStatus: async () => mockSessionState,
        openCaja: async (monto: number) => {
            mockSessionState = {
                id: Date.now(),
                monto_inicial: monto,
                fecha_apertura: new Date().toISOString(),
            };
            return { id: mockSessionState.id };
        },
        closeCaja: async (data: { sessionId: number, montoEfectivo: number, montoOtros: number }) => {
            mockLastClosing = data.montoEfectivo;
            mockSessionState = undefined;
        },
        getCajaActual: async () => {
            const init = mockSessionState?.monto_inicial || 0;
            const efMov = mockMovimientosList.filter(m => m.metodo_pago === 'EFECTIVO').reduce((acc, m) => acc + (m.tipo === 'ENTRADA' ? m.monto : -m.monto), 0);
            const otMov = mockMovimientosList.filter(m => m.metodo_pago !== 'EFECTIVO').reduce((acc, m) => acc + (m.tipo === 'ENTRADA' ? m.monto : -m.monto), 0);
            return { efectivo: init + efMov, otros: otMov };
        },
        getTotalesSugeridos: async () => {
            const init = mockSessionState?.monto_inicial || 0;
            const efMov = mockMovimientosList.filter(m => m.metodo_pago === 'EFECTIVO').reduce((acc, m) => acc + (m.tipo === 'ENTRADA' ? m.monto : -m.monto), 0);
            const otMov = mockMovimientosList.filter(m => m.metodo_pago !== 'EFECTIVO').reduce((acc, m) => acc + (m.tipo === 'ENTRADA' ? m.monto : -m.monto), 0);
            return { efectivo: init + efMov, otros: otMov };
        },
        getSalesForSession: async () => [],
        getSaleDetails: async () => [],
        createSale: async (data: any) => {
            const vid = Date.now();
            mockSalesList.push({ ...data, id: vid, fecha: new Date().toISOString() });
            
            // Restar stock
            if (Array.isArray(data.items)) {
                for (const item of data.items) {
                    const p = mockProductsList.find(x => x.id === item.id);
                    if (p) p.stock = Math.max(0, p.stock - item.cantidad);
                }
            }
            
            // Movimiento de caja
            if (mockSessionState && data.paymentMethod !== 'FIADO') {
                mockMovimientosList.unshift({
                    id: Date.now(),
                    fecha: new Date().toISOString(),
                    tipo: 'VENTA',
                    categoria: data.paymentMethod,
                    monto: data.total,
                    descripcion: `Venta #${vid}`,
                    metodo_pago: data.paymentMethod,
                    sesion_id: mockSessionState.id,
                });
            }
            return { ventaId: vid };
        },
        
        getReportDetail: async (): Promise<ReportDetail[]> => [],
        getReportMonthly: async (): Promise<ReportMonthly[]> => [],
        clearHistory: async () => {
            mockSalesList = [];
            mockMovimientosList = [];
        },
        
        getClients: async () => [...mockClientsList],
        addClient: async (data: { nombre: string, telefono: string, saldo?: number }) => {
            const newId = Date.now();
            mockClientsList.push({ id: newId, nombre: data.nombre, telefono: data.telefono, saldo: data.saldo || 0 });
            return { id: newId };
        },
        payClientDebt: async (data: { clientId: number, amount: number, metodoPago?: string }) => {
            const c = mockClientsList.find(x => x.id === data.clientId);
            if (c) c.saldo = Math.max(0, c.saldo - data.amount);
            if (mockSessionState) {
                mockMovimientosList.unshift({
                    id: Date.now(),
                    fecha: new Date().toISOString(),
                    tipo: 'ENTRADA',
                    categoria: 'Cobro Fiado',
                    monto: data.amount,
                    descripcion: `Pago de deuda: ${c?.nombre || 'Cliente'}`,
                    metodo_pago: data.metodoPago || 'EFECTIVO',
                    sesion_id: mockSessionState.id,
                });
            }
        },
        addClientDebt: async (data: { clientId: number, amount: number }) => {
            const c = mockClientsList.find(x => x.id === data.clientId);
            if (c) c.saldo += data.amount;
        },
        getClientSales: async () => [],
        deleteClient: async (id: number) => {
            mockClientsList = mockClientsList.filter(c => c.id !== id);
        },
        
        addMovimiento: async (data: { tipo: string, categoria: string, monto: number, descripcion: string, sesionId: number, metodoPago: string }) => {
            mockMovimientosList.unshift({
                id: Date.now(),
                fecha: new Date().toISOString(),
                tipo: data.tipo,
                categoria: data.categoria,
                monto: data.monto,
                descripcion: data.descripcion,
                metodo_pago: data.metodoPago,
                sesion_id: data.sesionId,
            });
        },
        getMovimientos: async () => [...mockMovimientosList],
    },
    barcode: {
        lookup: async (barcode: string): Promise<ProductApiResult> => {
            try {
                // En modo navegador dev, intentar llamar a Open Food Facts directamente con fetch
                const res = await fetch(`https://world.openfoodfacts.org/api/v3/product/${barcode}.json`);
                if (res.ok) {
                    const json = await res.json();
                    if ((json.status === 'success' || json.status === 1) && json.product) {
                        const p = json.product;
                        const name = (p.product_name_es || p.product_name || p.product_name_en || '').trim();
                        if (name) {
                            return {
                                found: true,
                                source: 'OpenFoodFacts',
                                barcode,
                                name,
                                brand: (p.brands || '').split(',')[0].trim(),
                                category: (p.categories || '').split(',')[0].trim(),
                                imageUrl: p.image_url || p.image_front_url || '',
                                description: p.generic_name || '',
                            };
                        }
                    }
                }
            } catch (e) {
                // Fallback silencioso
            }
            return {
                found: false,
                barcode,
                source: 'Manual',
                name: '',
            };
        },
    },
};

// Setup window.api if it doesn't exist (development mode)
export function setupElectronAPI() {
    if (typeof window !== 'undefined' && !window.api) {
        console.warn('⚠️ Electron API not available - using fully-functional interactive mock for development');
        (window as any).api = mockElectronAPI;
    }
}
