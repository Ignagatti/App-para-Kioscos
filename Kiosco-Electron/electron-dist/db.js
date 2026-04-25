"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbService = exports.db = void 0;
exports.initDb = initDb;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
// Usamos v2 para evitar cualquier conflicto con bases de datos previas
const dbPath = path_1.default.join(electron_1.app.getPath('appData'), 'KioscoApp', 'kiosco_v2.db');
const dbDir = path_1.default.dirname(dbPath);
if (!fs_1.default.existsSync(dbDir)) {
    fs_1.default.mkdirSync(dbDir, { recursive: true });
}
exports.db = new better_sqlite3_1.default(dbPath);
exports.db.pragma('journal_mode = WAL');
function initDb() {
    exports.db.exec(`
        -- 1. Categorías
        CREATE TABLE IF NOT EXISTS categorias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL UNIQUE
        );

        -- 2. Productos
        CREATE TABLE IF NOT EXISTS productos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo_barras TEXT UNIQUE NOT NULL,
            nombre TEXT NOT NULL,
            precio REAL NOT NULL,
            precio_costo REAL DEFAULT 0,
            stock REAL DEFAULT 0,
            categoria_id INTEGER,
            es_por_kilo INTEGER DEFAULT 0,
            precio_por_kilo REAL DEFAULT 0,
            fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (categoria_id) REFERENCES categorias(id)
        );

        -- 3. Sesiones de Caja
        CREATE TABLE IF NOT EXISTS sesiones_caja (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            monto_inicial REAL NOT NULL,
            monto_final_efectivo REAL DEFAULT 0,
            monto_final_otros REAL DEFAULT 0,
            fecha_apertura DATETIME DEFAULT CURRENT_TIMESTAMP,
            fecha_cierre DATETIME,
            estado TEXT DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA', 'CERRADA'))
        );

        -- 4. Ventas
        CREATE TABLE IF NOT EXISTS ventas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            total REAL NOT NULL,
            cantidad_items INTEGER NOT NULL,
            metodo_pago TEXT NOT NULL, -- EFECTIVO, OTROS, FIADO
            sesion_id INTEGER NOT NULL,
            cliente_id INTEGER DEFAULT NULL,
            fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sesion_id) REFERENCES sesiones_caja(id)
        );

        -- 5. Detalles de Venta
        CREATE TABLE IF NOT EXISTS venta_detalles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            venta_id INTEGER NOT NULL,
            nombre TEXT NOT NULL,
            precio REAL NOT NULL,
            costo_unitario REAL DEFAULT 0,
            cantidad REAL NOT NULL,
            subtotal REAL NOT NULL,
            FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE
        );

        -- 6. Clientes
        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            saldo REAL DEFAULT 0,
            telefono TEXT
        );

        -- 7. Movimientos Manuales
        CREATE TABLE IF NOT EXISTS movimientos_caja (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL, -- ENTRADA, SALIDA
            categoria TEXT NOT NULL,
            monto REAL NOT NULL,
            descripcion TEXT,
            metodo_pago TEXT DEFAULT 'EFECTIVO',
            sesion_id INTEGER NOT NULL,
            fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sesion_id) REFERENCES sesiones_caja(id)
        );
        -- Índices para velocidad
        CREATE INDEX IF NOT EXISTS idx_prod_codigo ON productos(codigo_barras);
        CREATE INDEX IF NOT EXISTS idx_ventas_sesion ON ventas(sesion_id);

        -- Datos iniciales
        INSERT OR IGNORE INTO categorias (nombre) VALUES 
        ('Golosinas'), ('Bebidas'), ('Fiambres'), ('Almacén'), 
        ('Lácteos'), ('Limpieza'), ('Cigarrillos'), ('Varios');
    `);
    // Migración rápida para metodo_pago
    try {
        exports.db.exec("ALTER TABLE movimientos_caja ADD COLUMN metodo_pago TEXT DEFAULT 'EFECTIVO'");
    }
    catch (e) { /* Ya existe */ }
    console.log("Base de Datos v2 Inicializada en:", dbPath);
}
const PRODUCT_SELECT = `
    SELECT p.*, COALESCE(c.nombre, 'Varios') as categoria 
    FROM productos p 
    LEFT JOIN categorias c ON p.categoria_id = c.id
`;
exports.dbService = {
    // ── Productos ──
    getProducts: () => exports.db.prepare(`${PRODUCT_SELECT} ORDER BY p.nombre`).all(),
    getProductByBarcode: (barcode) => exports.db.prepare(`${PRODUCT_SELECT} WHERE p.codigo_barras = ?`).get(barcode),
    searchProducts: (query) => {
        const exact = exports.db.prepare(`${PRODUCT_SELECT} WHERE p.codigo_barras = ?`).get(query);
        if (exact)
            return [exact];
        return exports.db.prepare(`${PRODUCT_SELECT} WHERE p.nombre LIKE ? ORDER BY p.nombre LIMIT 20`).all(`%${query}%`);
    },
    saveProduct: (p) => {
        if (p.id) {
            exports.db.prepare('UPDATE productos SET codigo_barras=?, nombre=?, precio=?, precio_costo=?, stock=?, categoria_id=?, es_por_kilo=?, precio_por_kilo=? WHERE id=?')
                .run(p.codigo_barras, p.nombre, p.precio, p.precio_costo, p.stock, p.categoria_id, p.es_por_kilo, p.precio_por_kilo, p.id);
            return { id: p.id, updated: true };
        }
        else {
            const res = exports.db.prepare('INSERT INTO productos (codigo_barras, nombre, precio, precio_costo, stock, categoria_id, es_por_kilo, precio_por_kilo) VALUES (?,?,?,?,?,?,?,?)')
                .run(p.codigo_barras, p.nombre, p.precio, p.precio_costo, p.stock, p.categoria_id, p.es_por_kilo, p.precio_por_kilo);
            return { id: Number(res.lastInsertRowid), updated: false };
        }
    },
    deleteProduct: (id) => exports.db.prepare('DELETE FROM productos WHERE id = ?').run(id),
    // ── Categorías ──
    getCategories: () => exports.db.prepare('SELECT * FROM categorias ORDER BY nombre').all(),
    addCategory: (nombre) => Number(exports.db.prepare('INSERT OR IGNORE INTO categorias (nombre) VALUES (?)').run(nombre).lastInsertRowid),
    // ── Caja ──
    getSessionStatus: () => exports.db.prepare("SELECT * FROM sesiones_caja WHERE estado = 'ABIERTA' LIMIT 1").get(),
    openCaja: (monto) => ({ id: Number(exports.db.prepare("INSERT INTO sesiones_caja (monto_inicial) VALUES (?)").run(monto).lastInsertRowid) }),
    closeCaja: (id, ef, ot) => {
        exports.db.prepare("UPDATE sesiones_caja SET monto_final_efectivo=?, monto_final_otros=?, fecha_cierre=datetime('now','localtime'), estado='CERRADA' WHERE id=?").run(ef, ot, id);
        return { success: true };
    },
    getCajaActual: (sid) => {
        try {
            const s = exports.db.prepare("SELECT monto_inicial FROM sesiones_caja WHERE id = ?").get(sid);
            if (!s)
                return { efectivo: 0, otros: 0 };
            const v_ef = exports.db.prepare("SELECT SUM(total) as t FROM ventas WHERE sesion_id = ? AND UPPER(metodo_pago) = 'EFECTIVO'").get(sid);
            const v_ot = exports.db.prepare("SELECT SUM(total) as t FROM ventas WHERE sesion_id = ? AND UPPER(metodo_pago) = 'OTROS'").get(sid);
            // Usamos una subconsulta o COALESCE para manejar la posible ausencia de la columna en versiones viejas de la DB antes del reinicio
            let ef_mov_val = 0;
            let ot_mov_val = 0;
            try {
                const m_ef = exports.db.prepare("SELECT SUM(CASE WHEN tipo='ENTRADA' THEN monto ELSE -monto END) as t FROM movimientos_caja WHERE sesion_id = ? AND UPPER(metodo_pago) = 'EFECTIVO'").get(sid);
                ef_mov_val = m_ef?.t || 0;
                const m_ot = exports.db.prepare("SELECT SUM(CASE WHEN tipo='ENTRADA' THEN monto ELSE -monto END) as t FROM movimientos_caja WHERE sesion_id = ? AND UPPER(metodo_pago) = 'OTROS'").get(sid);
                ot_mov_val = m_ot?.t || 0;
            }
            catch (e) {
                // Si falla por falta de columna, sumamos todo a efectivo por defecto
                const m_all = exports.db.prepare("SELECT SUM(CASE WHEN tipo='ENTRADA' THEN monto ELSE -monto END) as t FROM movimientos_caja WHERE sesion_id = ?").get(sid);
                ef_mov_val = m_all?.t || 0;
            }
            return {
                efectivo: (s.monto_inicial || 0) + (v_ef?.t || 0) + ef_mov_val,
                otros: (v_ot?.t || 0) + ot_mov_val
            };
        }
        catch (e) {
            console.error("Error en getCajaActual:", e);
            return { efectivo: 0, otros: 0 };
        }
    },
    getTotalesSugeridos: (sid) => {
        try {
            return exports.dbService.getCajaActual(sid); // Ahora son lo mismo conceptualmente para el cierre
        }
        catch (e) {
            return { efectivo: 0, otros: 0 };
        }
    },
    getSalesForSession: (sid) => exports.db.prepare("SELECT * FROM ventas WHERE sesion_id = ? ORDER BY fecha DESC").all(sid),
    getSaleDetails: (vid) => exports.db.prepare("SELECT * FROM venta_detalles WHERE venta_id = ?").all(vid),
    // ── Ventas ──
    createSale: (total, itemsCount, method, sid, cid, items) => {
        const txn = exports.db.transaction(() => {
            const res = exports.db.prepare('INSERT INTO ventas (total, cantidad_items, metodo_pago, sesion_id, cliente_id) VALUES (?,?,?,?,?)').run(total, itemsCount, method, sid, cid);
            const vid = Number(res.lastInsertRowid);
            const ins = exports.db.prepare('INSERT INTO venta_detalles (venta_id, nombre, precio, costo_unitario, cantidad, subtotal) VALUES (?,?,?,?,?,?)');
            const up = exports.db.prepare('UPDATE productos SET stock = stock - ? WHERE id = ?');
            for (const i of items) {
                ins.run(vid, i.nombre, i.precio, i.precio_costo || 0, i.cantidad, i.subtotal);
                if (i.id > 0)
                    up.run(i.cantidad, i.id);
            }
            if (cid && method.toUpperCase() === 'FIADO')
                exports.db.prepare('UPDATE clientes SET saldo = saldo + ? WHERE id = ?').run(total, cid);
            return { ventaId: vid };
        });
        return txn();
    },
    // ── Reportes ──
    getReportDetail: () => exports.db.prepare(`
        SELECT s.*, 
        COALESCE((SELECT SUM(total) FROM ventas WHERE sesion_id = s.id), 0) as total_ventas,
        COALESCE((SELECT SUM(vd.subtotal - (vd.costo_unitario * vd.cantidad)) FROM venta_detalles vd JOIN ventas v ON vd.venta_id = v.id WHERE v.sesion_id = s.id), 0) as ganancia
        FROM sesiones_caja s WHERE estado = 'CERRADA' ORDER BY fecha_cierre DESC
    `).all(),
    getReportMonthly: () => exports.db.prepare(`
        SELECT strftime('%Y-%m', fecha_cierre) as periodo, 
        SUM(monto_final_efectivo) as efectivo, SUM(monto_final_otros) as otros,
        SUM((SELECT SUM(total) FROM ventas WHERE sesion_id = sesiones_caja.id)) as total_ventas,
        SUM((SELECT SUM(vd.subtotal - (vd.costo_unitario * vd.cantidad)) FROM venta_detalles vd JOIN ventas v ON vd.venta_id = v.id WHERE v.sesion_id = sesiones_caja.id)) as ganancia
        FROM sesiones_caja WHERE estado = 'CERRADA' GROUP BY periodo ORDER BY periodo DESC
    `).all(),
    // ── Clientes ──
    getClients: () => exports.db.prepare('SELECT * FROM clientes ORDER BY nombre').all(),
    addClient: (n, t) => ({ id: Number(exports.db.prepare('INSERT INTO clientes (nombre, telefono, saldo) VALUES (?,?,0)').run(n, t).lastInsertRowid) }),
    payClientDebt: (id, a) => exports.db.prepare('UPDATE clientes SET saldo = saldo - ? WHERE id = ?').run(a, id),
    getClientSales: (id) => exports.db.prepare("SELECT * FROM ventas WHERE cliente_id = ? AND UPPER(metodo_pago) = 'FIADO' ORDER BY fecha DESC").all(id),
    // ── Movimientos ──
    addMovimiento: (t, c, m, d, sid, p) => exports.db.prepare('INSERT INTO movimientos_caja (tipo, categoria, monto, descripcion, sesion_id, metodo_pago) VALUES (?,?,?,?,?,?)').run(t, c, m, d, sid, p),
    getMovimientos: (sid) => {
        return exports.db.prepare(`
            SELECT id, tipo, categoria, monto, descripcion, metodo_pago, fecha FROM movimientos_caja WHERE sesion_id = ?
            UNION ALL
            SELECT id, 'VENTA' as tipo, metodo_pago as categoria, total as monto, 'Venta #' || id as descripcion, metodo_pago, fecha FROM ventas WHERE sesion_id = ?
            ORDER BY fecha DESC
        `).all(sid, sid);
    },
    clearHistory: () => {
        exports.db.transaction(() => {
            // Borrar detalles de ventas de sesiones cerradas
            exports.db.prepare(`
                DELETE FROM venta_detalles 
                WHERE venta_id IN (SELECT id FROM ventas WHERE sesion_id IN (SELECT id FROM sesiones_caja WHERE estado = 'CERRADA'))
            `).run();
            // Borrar ventas de sesiones cerradas
            exports.db.prepare(`
                DELETE FROM ventas 
                WHERE sesion_id IN (SELECT id FROM sesiones_caja WHERE estado = 'CERRADA')
            `).run();
            // Borrar movimientos de sesiones cerradas
            exports.db.prepare(`
                DELETE FROM movimientos_caja 
                WHERE sesion_id IN (SELECT id FROM sesiones_caja WHERE estado = 'CERRADA')
            `).run();
            // Finalmente borrar las sesiones cerradas
            exports.db.prepare("DELETE FROM sesiones_caja WHERE estado = 'CERRADA'").run();
        })();
        return { success: true };
    },
};
