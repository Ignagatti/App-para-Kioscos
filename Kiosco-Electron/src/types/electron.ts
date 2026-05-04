export interface Product {
    id: number;
    codigo_barras: string;
    nombre: string;
    precio: number;
    precio_costo: number;
    stock: number;
    categoria_id: number | null;
    es_por_kilo: number;
    precio_por_kilo: number;
    categoria: string;
}

export interface Category {
    id: number;
    nombre: string;
}

export interface SessionStatus {
    id: number;
    monto_inicial: number;
    fecha_apertura: string;
}

export interface Sale {
    id: number;
    total: number;
    cantidad_items: number;
    metodo_pago: string;
    fecha: string;
    cliente_id: number | null;
}

export interface SaleDetail {
    nombre: string;
    precio: number;
    cantidad: number;
    subtotal: number;
}

export interface ReportDetail {
    id: number;
    fecha_apertura: string;
    fecha_cierre: string;
    monto_final_efectivo: number;
    monto_final_otros: number;
    total_ventas: number;
    ganancia: number;
}

export interface ReportMonthly {
    periodo: string;
    efectivo: number;
    otros: number;
    total_ventas: number;
    ganancia: number;
}

export interface Client {
    id: number;
    nombre: string;
    saldo: number;
    telefono: string;
}

export interface Movement {
    id: number;
    fecha: string;
    tipo: string;
    categoria: string;
    monto: number;
    descripcion: string;
    metodo_pago: string;
    sesion_id: number;
}

export interface ElectronAPI {
    db: {
        getProducts: () => Promise<Product[]>;
        getProductByBarcode: (barcode: string) => Promise<Product | undefined>;
        searchProducts: (query: string) => Promise<Product[]>;
        saveProduct: (data: any) => Promise<{ id: number, updated: boolean }>;
        deleteProduct: (id: number) => Promise<void>;
        
        getCategories: () => Promise<Category[]>;
        addCategory: (nombre: string) => Promise<number>;
        
        getLastClosingAmount: () => Promise<number | null>;
        getSessionStatus: () => Promise<SessionStatus | undefined>;
        openCaja: (monto: number) => Promise<{ id: number }>;
        closeCaja: (data: { sessionId: number, montoEfectivo: number, montoOtros: number }) => Promise<void>;
        getCajaActual: (sessionId: number) => Promise<{ efectivo: number, otros: number }>;
        getTotalesSugeridos: (sessionId: number) => Promise<{ efectivo: number, otros: number }>;
        getSalesForSession: (sessionId: number) => Promise<Sale[]>;
        getSaleDetails: (ventaId: number) => Promise<SaleDetail[]>;
        createSale: (data: any) => Promise<{ ventaId: number }>;
        
        getReportDetail: () => Promise<ReportDetail[]>;
        getReportMonthly: () => Promise<ReportMonthly[]>;
        clearHistory: () => Promise<void>;
        
        getClients: () => Promise<Client[]>;
        addClient: (data: { nombre: string, telefono: string, saldo?: number }) => Promise<{ id: number }>;
        payClientDebt: (data: { clientId: number, amount: number }) => Promise<void>;
        addClientDebt: (data: { clientId: number, amount: number }) => Promise<void>;
        getClientSales: (clientId: number) => Promise<Sale[]>;
        deleteClient: (id: number) => Promise<void>;
        
        addMovimiento: (data: { tipo: string, categoria: string, monto: number, descripcion: string, sesionId: number, metodoPago: string }) => Promise<void>;
        getMovimientos: (sessionId: number) => Promise<Movement[]>;
    };
    barcode: {
        lookup: (barcode: string) => Promise<{ found: boolean, name?: string }>;
    };
}

declare global {
    interface Window {
        api: ElectronAPI;
    }
}
