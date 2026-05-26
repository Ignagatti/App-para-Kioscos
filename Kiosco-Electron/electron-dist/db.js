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
        -- 8. Proveedores
        CREATE TABLE IF NOT EXISTS proveedores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            contacto TEXT,
            telefono TEXT,
            email TEXT,
            direccion TEXT,
            notas TEXT,
            fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- 9. Relación Producto-Proveedor (Muchos a Muchos)
        CREATE TABLE IF NOT EXISTS producto_proveedor (
            producto_id INTEGER NOT NULL,
            proveedor_id INTEGER NOT NULL,
            PRIMARY KEY (producto_id, proveedor_id),
            FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
            FOREIGN KEY (proveedor_id) REFERENCES proveedores(id) ON DELETE CASCADE
        );

        -- Índices para velocidad
        CREATE INDEX IF NOT EXISTS idx_prod_codigo ON productos(codigo_barras);
        CREATE INDEX IF NOT EXISTS idx_ventas_sesion ON ventas(sesion_id);
        CREATE INDEX IF NOT EXISTS idx_pp_prod ON producto_proveedor(producto_id);
        CREATE INDEX IF NOT EXISTS idx_pp_prov ON producto_proveedor(proveedor_id);

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
function getPeriodStart(period) {
    const map = {
        today: "date('now', '-3 hours')",
        week: "date('now', '-3 hours', '-6 days')",
        month: "date('now', '-3 hours', 'start of month')",
    };
    return map[period] ?? "'2000-01-01'";
}
const PRODUCT_SELECT = `
    SELECT p.*, COALESCE(c.nombre, 'Varios') as categoria,
    (SELECT GROUP_CONCAT(prov.nombre, ', ') FROM proveedores prov JOIN producto_proveedor pp ON prov.id = pp.proveedor_id WHERE pp.producto_id = p.id) as proveedores
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
    getLastClosingAmount: () => {
        const row = exports.db.prepare("SELECT monto_final_efectivo FROM sesiones_caja WHERE estado = 'CERRADA' ORDER BY fecha_cierre DESC LIMIT 1").get();
        return row?.monto_final_efectivo ?? null;
    },
    // ── Categorías ──
    getCategories: () => exports.db.prepare('SELECT * FROM categorias ORDER BY nombre').all(),
    addCategory: (nombre) => {
        exports.db.prepare('INSERT OR IGNORE INTO categorias (nombre) VALUES (?)').run(nombre);
        const row = exports.db.prepare('SELECT id FROM categorias WHERE nombre = ?').get(nombre);
        return row?.id ?? 0;
    },
    // ── Caja ──
    getSessionStatus: () => exports.db.prepare("SELECT * FROM sesiones_caja WHERE estado = 'ABIERTA' LIMIT 1").get(),
    openCaja: (monto) => ({ id: Number(exports.db.prepare("INSERT INTO sesiones_caja (monto_inicial, fecha_apertura) VALUES (?,datetime('now','-3 hours'))").run(monto).lastInsertRowid) }),
    closeCaja: (id, ef, ot) => {
        exports.db.prepare("UPDATE sesiones_caja SET monto_final_efectivo=?, monto_final_otros=?, fecha_cierre=datetime('now','-3 hours'), estado='CERRADA' WHERE id=?").run(ef, ot, id);
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
            const res = exports.db.prepare("INSERT INTO ventas (total, cantidad_items, metodo_pago, sesion_id, cliente_id, fecha) VALUES (?,?,?,?,?,datetime('now','-3 hours'))").run(total, itemsCount, method, sid, cid);
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
    addClient: (n, t, s) => ({ id: Number(exports.db.prepare('INSERT INTO clientes (nombre, telefono, saldo) VALUES (?,?,?)').run(n, t, s).lastInsertRowid) }),
    payClientDebt: (id, a) => exports.db.prepare('UPDATE clientes SET saldo = saldo - ? WHERE id = ?').run(a, id),
    addClientDebt: (id, amount) => exports.db.prepare('UPDATE clientes SET saldo = saldo + ? WHERE id = ?').run(amount, id),
    getClientSales: (id) => exports.db.prepare("SELECT * FROM ventas WHERE cliente_id = ? AND UPPER(metodo_pago) = 'FIADO' ORDER BY fecha DESC").all(id),
    deleteClient: (id) => {
        const txn = exports.db.transaction(() => {
            // Desvincular ventas del cliente antes de borrarlo
            exports.db.prepare('UPDATE ventas SET cliente_id = NULL WHERE cliente_id = ?').run(id);
            // Borrar el cliente
            exports.db.prepare('DELETE FROM clientes WHERE id = ?').run(id);
        });
        return txn();
    },
    // ── Movimientos ──
    addMovimiento: (t, c, m, d, sid, p) => exports.db.prepare("INSERT INTO movimientos_caja (tipo, categoria, monto, descripcion, sesion_id, metodo_pago, fecha) VALUES (?,?,?,?,?,?,datetime('now','-3 hours'))").run(t, c, m, d, sid, p),
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
    // ── Proveedores ──
    getSuppliers: () => exports.db.prepare('SELECT * FROM proveedores ORDER BY nombre').all(),
    saveSupplier: (s) => {
        if (s.id) {
            exports.db.prepare('UPDATE proveedores SET nombre=?, contacto=?, telefono=?, email=?, direccion=?, notas=? WHERE id=?')
                .run(s.nombre, s.contacto, s.telefono, s.email, s.direccion, s.notas, s.id);
            return { id: s.id, updated: true };
        }
        else {
            const res = exports.db.prepare('INSERT INTO proveedores (nombre, contacto, telefono, email, direccion, notas) VALUES (?,?,?,?,?,?)')
                .run(s.nombre, s.contacto, s.telefono, s.email, s.direccion, s.notas);
            return { id: Number(res.lastInsertRowid), updated: false };
        }
    },
    deleteSupplier: (id) => exports.db.prepare('DELETE FROM proveedores WHERE id = ?').run(id),
    getSuppliersByProduct: (productId) => {
        return exports.db.prepare(`
            SELECT prov.* FROM proveedores prov
            JOIN producto_proveedor pp ON prov.id = pp.proveedor_id
            WHERE pp.producto_id = ?
        `).all(productId);
    },
    getProductsBySupplier: (supplierId) => {
        return exports.db.prepare(`
            ${PRODUCT_SELECT}
            JOIN producto_proveedor pp ON p.id = pp.producto_id
            WHERE pp.proveedor_id = ?
            ORDER BY p.nombre
        `).all(supplierId);
    },
    updateProductSuppliers: (productId, supplierIds) => {
        const txn = exports.db.transaction(() => {
            exports.db.prepare('DELETE FROM producto_proveedor WHERE producto_id = ?').run(productId);
            const ins = exports.db.prepare('INSERT INTO producto_proveedor (producto_id, proveedor_id) VALUES (?, ?)');
            for (const sid of supplierIds) {
                ins.run(productId, sid);
            }
        });
        return txn();
    },
    // ── Estadísticas ──
    getStatsResumen: (period) => {
        const from = getPeriodStart(period);
        return exports.db.prepare(`
            SELECT
                (SELECT COUNT(*) FROM ventas WHERE date(fecha) >= ${from}) as total_ventas,
                (SELECT COALESCE(SUM(total), 0) FROM ventas WHERE date(fecha) >= ${from}) as ingresos,
                (SELECT COALESCE(AVG(total), 0) FROM ventas WHERE date(fecha) >= ${from}) as ticket_promedio,
                (SELECT COALESCE(SUM(vd.subtotal - vd.costo_unitario * vd.cantidad), 0)
                 FROM venta_detalles vd JOIN ventas v ON vd.venta_id = v.id
                 WHERE date(v.fecha) >= ${from}) as ganancia
        `).get();
    },
    getTopProductos: (period) => {
        const from = getPeriodStart(period);
        return exports.db.prepare(`
            SELECT
                vd.nombre,
                SUM(vd.cantidad) as cantidad_total,
                SUM(vd.subtotal) as ingresos_total,
                SUM(vd.subtotal - vd.costo_unitario * vd.cantidad) as ganancia_total,
                COALESCE((SELECT es_por_kilo FROM productos WHERE nombre = vd.nombre LIMIT 1), 0) as es_por_kilo
            FROM venta_detalles vd
            JOIN ventas v ON vd.venta_id = v.id
            WHERE date(v.fecha) >= ${from}
            GROUP BY vd.nombre
            ORDER BY cantidad_total DESC
            LIMIT 10
        `).all();
    },
    getMenosVendidos: (period) => {
        const from = getPeriodStart(period);
        return exports.db.prepare(`
            SELECT
                p.nombre,
                p.es_por_kilo,
                COALESCE(s.cantidad_total, 0) as cantidad_total,
                COALESCE(s.ingresos_total, 0) as ingresos_total,
                COALESCE(s.ganancia_total, 0) as ganancia_total
            FROM productos p
            LEFT JOIN (
                SELECT
                    LOWER(vd.nombre) as nombre_lower,
                    SUM(vd.cantidad) as cantidad_total,
                    SUM(vd.subtotal) as ingresos_total,
                    SUM(vd.subtotal - vd.costo_unitario * vd.cantidad) as ganancia_total
                FROM venta_detalles vd
                JOIN ventas v ON vd.venta_id = v.id
                WHERE date(v.fecha) >= ${from}
                GROUP BY LOWER(vd.nombre)
            ) s ON LOWER(p.nombre) = s.nombre_lower
            ORDER BY cantidad_total ASC, p.nombre ASC
            LIMIT 10
        `).all();
    },
    getStatsMetodoPago: (period) => {
        const from = getPeriodStart(period);
        return exports.db.prepare(`
            SELECT metodo_pago, COUNT(*) as cantidad, COALESCE(SUM(total), 0) as monto_total
            FROM ventas WHERE date(fecha) >= ${from}
            GROUP BY metodo_pago
        `).all();
    },
    getStatsCategorias: (period) => {
        const from = getPeriodStart(period);
        return exports.db.prepare(`
            SELECT
                COALESCE(c.nombre, 'Sin categoría') as categoria,
                COALESCE(SUM(vd.subtotal), 0) as ingresos,
                COALESCE(SUM(vd.cantidad), 0) as unidades,
                COALESCE(SUM(vd.subtotal - vd.costo_unitario * vd.cantidad), 0) as ganancia
            FROM venta_detalles vd
            JOIN ventas v ON vd.venta_id = v.id
            LEFT JOIN (SELECT LOWER(nombre) as nom, MIN(categoria_id) as cat_id FROM productos GROUP BY LOWER(nombre)) p
                ON LOWER(vd.nombre) = p.nom
            LEFT JOIN categorias c ON c.id = p.cat_id
            WHERE date(v.fecha) >= ${from}
            GROUP BY p.cat_id, COALESCE(c.nombre, 'Sin categoría')
            ORDER BY ingresos DESC
        `).all();
    },
    getStatsHoraPico: (period) => {
        const from = getPeriodStart(period);
        return exports.db.prepare(`
            SELECT
                CAST(strftime('%H', fecha) AS INTEGER) as hora,
                COUNT(*) as cantidad_ventas,
                COALESCE(SUM(total), 0) as monto_total
            FROM ventas
            WHERE date(fecha) >= ${from}
            GROUP BY hora
            ORDER BY hora
        `).all();
    },
    getProductosBajoStock: (umbral = 5) => {
        return exports.db.prepare(`
            SELECT p.nombre, p.stock, p.precio, p.es_por_kilo, COALESCE(c.nombre, 'Varios') as categoria
            FROM productos p
            LEFT JOIN categorias c ON c.id = p.categoria_id
            WHERE p.stock <= ? AND p.stock >= 0
            ORDER BY p.stock ASC
            LIMIT 20
        `).all(umbral);
    },
};
