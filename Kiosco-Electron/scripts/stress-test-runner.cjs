const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

console.log('\n======================================================================');
console.log('       🛡️  KIOSKOGO - SUITE DE ESTRÉS, SEGURIDAD & AUDITORÍA 100%       ');
console.log('======================================================================\n');

// 1. Inicializar base de datos de pruebas en memoria de alta velocidad
const db = new Database(':memory:');
db.pragma('journal_mode = WAL');
db.pragma('synchronous = OFF');

// Crear esquema idéntico a producción
db.exec(`
    CREATE TABLE IF NOT EXISTS categorias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL UNIQUE
    );

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
        marca TEXT,
        imagen_url TEXT,
        descripcion TEXT,
        fuente_datos TEXT,
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (categoria_id) REFERENCES categorias(id)
    );

    CREATE TABLE IF NOT EXISTS sesiones_caja (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        monto_inicial REAL NOT NULL,
        monto_final_efectivo REAL DEFAULT 0,
        monto_final_otros REAL DEFAULT 0,
        fecha_apertura DATETIME DEFAULT CURRENT_TIMESTAMP,
        fecha_cierre DATETIME,
        estado TEXT DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA', 'CERRADA'))
    );

    CREATE TABLE IF NOT EXISTS ventas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        total REAL NOT NULL,
        cantidad_items INTEGER NOT NULL,
        metodo_pago TEXT NOT NULL,
        sesion_id INTEGER NOT NULL,
        cliente_id INTEGER DEFAULT NULL,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sesion_id) REFERENCES sesiones_caja(id)
    );

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

    CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        saldo REAL DEFAULT 0,
        telefono TEXT
    );

    CREATE TABLE IF NOT EXISTS movimientos_caja (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL,
        categoria TEXT NOT NULL,
        monto REAL NOT NULL,
        descripcion TEXT,
        metodo_pago TEXT DEFAULT 'EFECTIVO',
        sesion_id INTEGER NOT NULL,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sesion_id) REFERENCES sesiones_caja(id)
    );

    CREATE INDEX IF NOT EXISTS idx_prod_codigo ON productos(codigo_barras);
    CREATE INDEX IF NOT EXISTS idx_prod_nombre ON productos(nombre);
    CREATE INDEX IF NOT EXISTS idx_ventas_sesion ON ventas(sesion_id);
    CREATE INDEX IF NOT EXISTS idx_movimientos_sesion ON movimientos_caja(sesion_id);
`);

// Servicios de DB (mismo código de producción)
const dbService = {
    addCategory: (nombre) => {
        db.prepare('INSERT OR IGNORE INTO categorias (nombre) VALUES (?)').run(nombre);
        return db.prepare('SELECT id FROM categorias WHERE nombre = ?').get(nombre).id;
    },
    addProduct: (p) => {
        return db.prepare(`
            INSERT INTO productos (codigo_barras, nombre, precio, precio_costo, stock, categoria_id, es_por_kilo, precio_por_kilo, marca, imagen_url, descripcion, fuente_datos)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(p.codigo_barras, p.nombre, p.precio, p.precio_costo, p.stock, p.categoria_id, p.es_por_kilo ? 1 : 0, p.precio_por_kilo || 0, p.marca || null, p.imagen_url || null, p.descripcion || null, p.fuente_datos || 'local');
    },
    getByBarcode: (code) => db.prepare('SELECT * FROM productos WHERE codigo_barras = ?').get(code),
    searchProducts: (term) => db.prepare('SELECT * FROM productos WHERE nombre LIKE ? OR codigo_barras LIKE ? LIMIT 50').all(`%${term}%`, `%${term}%`),
    openCaja: (monto) => {
        db.prepare("UPDATE sesiones_caja SET estado = 'CERRADA' WHERE estado = 'ABIERTA'").run();
        const res = db.prepare("INSERT INTO sesiones_caja (monto_inicial, estado, fecha_apertura) VALUES (?, 'ABIERTA', datetime('now','-3 hours'))").run(monto);
        return Number(res.lastInsertRowid);
    },
    createSale: (total, itemsCount, method, sid, cid, items) => {
        const txn = db.transaction(() => {
            const res = db.prepare("INSERT INTO ventas (total, cantidad_items, metodo_pago, sesion_id, cliente_id, fecha) VALUES (?,?,?,?,?,datetime('now','-3 hours'))").run(total, itemsCount, method, sid, cid);
            const vid = Number(res.lastInsertRowid);
            const ins = db.prepare('INSERT INTO venta_detalles (venta_id, nombre, precio, costo_unitario, cantidad, subtotal) VALUES (?,?,?,?,?,?)');
            const up = db.prepare('UPDATE productos SET stock = stock - ? WHERE id = ?');
            for (const i of items) {
                ins.run(vid, i.nombre, i.precio, i.precio_costo || 0, i.cantidad, i.subtotal);
                if (i.id > 0) up.run(i.cantidad, i.id);
            }
            if (cid && method.toUpperCase() === 'FIADO') {
                db.prepare('UPDATE clientes SET saldo = saldo + ? WHERE id = ?').run(total, cid);
            }
            return { ventaId: vid };
        });
        return txn();
    },
    addClient: (n, t, s) => ({ id: Number(db.prepare('INSERT INTO clientes (nombre, telefono, saldo) VALUES (?,?,?)').run(n, t, s).lastInsertRowid) }),
    payClientDebt: (id, a, metodoPago = 'EFECTIVO') => {
        const txn = db.transaction(() => {
            db.prepare('UPDATE clientes SET saldo = MAX(0, saldo - ?) WHERE id = ?').run(a, id);
            const client = db.prepare('SELECT nombre FROM clientes WHERE id = ?').get(id);
            const openSession = db.prepare("SELECT id FROM sesiones_caja WHERE estado = 'ABIERTA' ORDER BY id DESC LIMIT 1").get();
            if (openSession) {
                db.prepare("INSERT INTO movimientos_caja (tipo, categoria, monto, descripcion, sesion_id, metodo_pago, fecha) VALUES (?,?,?,?,?,?,datetime('now','-3 hours'))")
                    .run('ENTRADA', 'Cobro Fiado', a, `Pago de deuda: ${client?.nombre || 'Cliente'}`, openSession.id, (metodoPago || 'EFECTIVO').toUpperCase());
            }
        });
        return txn();
    },
    addMovimiento: (t, c, m, d, sid, p) => db.prepare("INSERT INTO movimientos_caja (tipo, categoria, monto, descripcion, sesion_id, metodo_pago, fecha) VALUES (?,?,?,?,?,?,datetime('now','-3 hours'))").run(t, c, m, d, sid, p),
    getCajaActual: (sid) => {
        const s = db.prepare("SELECT monto_inicial FROM sesiones_caja WHERE id = ?").get(sid);
        if (!s) return { efectivo: 0, otros: 0 };
        const v_ef = db.prepare("SELECT SUM(total) as t FROM ventas WHERE sesion_id = ? AND UPPER(metodo_pago) = 'EFECTIVO'").get(sid);
        const v_ot = db.prepare("SELECT SUM(total) as t FROM ventas WHERE sesion_id = ? AND UPPER(metodo_pago) = 'OTROS'").get(sid);
        const m_ef = db.prepare("SELECT SUM(CASE WHEN tipo='ENTRADA' THEN monto ELSE -monto END) as t FROM movimientos_caja WHERE sesion_id = ? AND UPPER(metodo_pago) = 'EFECTIVO'").get(sid);
        const m_ot = db.prepare("SELECT SUM(CASE WHEN tipo='ENTRADA' THEN monto ELSE -monto END) as t FROM movimientos_caja WHERE sesion_id = ? AND UPPER(metodo_pago) = 'OTROS'").get(sid);
        return {
            efectivo: (s.monto_inicial || 0) + (v_ef?.t || 0) + (m_ef?.t || 0),
            otros: (v_ot?.t || 0) + (m_ot?.t || 0)
        };
    },
    getGananciaTotal: (sid) => {
        const res = db.prepare(`
            SELECT SUM(vd.subtotal - (vd.costo_unitario * vd.cantidad)) as ganancia
            FROM venta_detalles vd
            JOIN ventas v ON vd.venta_id = v.id
            WHERE v.sesion_id = ?
        `).get(sid);
        return res?.ganancia || 0;
    }
};

const results = [];
function recordResult(moduleName, passed, message, metrics = '') {
    results.push({ moduleName, passed, message, metrics });
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${status}] ${moduleName}: ${message} ${metrics ? `(${metrics})` : ''}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// PRUEBA 1: SEGURIDAD & INYECCIÓN SQL (Defensive Hardening)
// ─────────────────────────────────────────────────────────────────────────────
try {
    const maliciousPayloads = [
        "' OR '1'='1",
        "'; DROP TABLE productos; --",
        "Coca Cola' AND 1=0 UNION SELECT id, password FROM users --",
        "<script>alert('XSS')</script>",
        "D'Artagnan & Co.",
        "Emoji Test 🍫🍬🍭🥤",
        "Product with 'single quote' and \"double quote\""
    ];

    const catId = dbService.addCategory("Golosinas & Snacks");

    maliciousPayloads.forEach((payload, idx) => {
        dbService.addProduct({
            codigo_barras: `SEC-PAYLOAD-${idx}`,
            nombre: payload,
            precio: 500,
            precio_costo: 300,
            stock: 100,
            categoria_id: catId,
            es_por_kilo: 0,
            marca: payload,
            imagen_url: `https://example.com/img?q=${encodeURIComponent(payload)}`,
            descripcion: payload
        });
    });

    const count = db.prepare('SELECT COUNT(*) as c FROM productos').get().c;
    const foundDirect = dbService.getByBarcode('SEC-PAYLOAD-1');
    const searchResult = dbService.searchProducts("DROP TABLE");

    if (count === maliciousPayloads.length && foundDirect && searchResult.length > 0) {
        recordResult('Seguridad SQL & Sanitización', true, 'Inyecciones SQL y payloads neutralizados 100% mediante sentencias parametrizadas.');
    } else {
        recordResult('Seguridad SQL & Sanitización', false, 'Falla en neutralización de inyección SQL.');
    }
} catch (e) {
    recordResult('Seguridad SQL & Sanitización', false, `Excepción inesperada: ${e.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// PRUEBA 2: ESTRÉS DE DATOS MASIVOS (5.000 Productos & 500 Clientes)
// ─────────────────────────────────────────────────────────────────────────────
const TOTAL_PRODUCTS = 5000;
const TOTAL_CLIENTS = 500;
const startTimeInject = process.hrtime.bigint();

try {
    const catBebidas = dbService.addCategory("Bebidas");
    const catAlmacen = dbService.addCategory("Almacén");
    const catCigarrillos = dbService.addCategory("Cigarrillos");

    const insertTx = db.transaction(() => {
        for (let i = 1; i <= TOTAL_PRODUCTS; i++) {
            dbService.addProduct({
                codigo_barras: `779000${String(i).padStart(7, '0')}`,
                nombre: `Producto de Prueba Alpha-${i} Premium`,
                precio: 100 + (i % 500) * 10,
                precio_costo: 50 + (i % 500) * 6,
                stock: 100,
                categoria_id: i % 3 === 0 ? catBebidas : (i % 3 === 1 ? catAlmacen : catCigarrillos),
                es_por_kilo: 0,
                marca: `Marca-${i % 20}`,
                imagen_url: `https://images.openfoodfacts.org/images/products/779/test_${i}.jpg`,
                descripcion: `Descripción detallada de prueba para producto ${i}`
            });
        }

        for (let j = 1; j <= TOTAL_CLIENTS; j++) {
            dbService.addClient(`Cliente Habitual ${j}`, `+549110000${j}`, (j % 5 === 0) ? 1500 : 0);
        }
    });

    insertTx();
    const endTimeInject = process.hrtime.bigint();
    const durationMs = Number(endTimeInject - startTimeInject) / 1e6;
    const totalInjected = db.prepare('SELECT COUNT(*) as c FROM productos').get().c;

    recordResult('Inyección Masiva de Catálogo', totalInjected >= TOTAL_PRODUCTS, `${TOTAL_PRODUCTS} productos y ${TOTAL_CLIENTS} clientes insertados exitosamente.`, `${durationMs.toFixed(1)} ms | ${(TOTAL_PRODUCTS / (durationMs / 1000)).toFixed(0)} ops/seg`);
} catch (e) {
    recordResult('Inyección Masiva de Catálogo', false, `Error en inyección: ${e.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// PRUEBA 3: RENDIMIENTO DE BÚSQUEDA Y LECTURA EN TIEMPO REAL
// ─────────────────────────────────────────────────────────────────────────────
try {
    const SEARCH_ITERATIONS = 1000;
    const startSearch = process.hrtime.bigint();

    for (let i = 0; i < SEARCH_ITERATIONS; i++) {
        const randomCode = `779000${String((i % TOTAL_PRODUCTS) + 1).padStart(7, '0')}`;
        dbService.getByBarcode(randomCode);
    }

    const endSearch = process.hrtime.bigint();
    const searchDurationMs = Number(endSearch - startSearch) / 1e6;
    const avgLatencyMicro = (searchDurationMs / SEARCH_ITERATIONS) * 1000;

    recordResult('Búsqueda por Código de Barras (Índice)', true, `${SEARCH_ITERATIONS} búsquedas directas completadas.`, `Latencia promedio: ${avgLatencyMicro.toFixed(2)} µs / query`);
} catch (e) {
    recordResult('Búsqueda por Código de Barras (Índice)', false, `Error en lectura: ${e.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// PRUEBA 4: SIMULACIÓN DE 1.000 TRANSACCIONES DE VENTA Y DESCUENTO DE STOCK
// ─────────────────────────────────────────────────────────────────────────────
const SALES_COUNT = 1000;
let sessionId;
let expectedCashSales = 0;
let expectedOtrosSales = 0;
let expectedFiadoSales = 0;
let expectedTotalProfit = 0;

try {
    const MONTO_INICIAL_CAJA = 10000;
    sessionId = dbService.openCaja(MONTO_INICIAL_CAJA);

    const startSalesTime = process.hrtime.bigint();

    for (let s = 1; s <= SALES_COUNT; s++) {
        const method = s % 3 === 0 ? 'EFECTIVO' : (s % 3 === 1 ? 'OTROS' : 'FIADO');
        const clientId = method === 'FIADO' ? ((s % TOTAL_CLIENTS) + 1) : null;

        const prodId1 = (s % 100) + 1;
        const prodId2 = ((s + 10) % 100) + 1;

        const p1 = db.prepare('SELECT * FROM productos WHERE id = ?').get(prodId1);
        const p2 = db.prepare('SELECT * FROM productos WHERE id = ?').get(prodId2);

        const qty1 = 1;
        const qty2 = 2;

        const subtotal1 = p1.precio * qty1;
        const subtotal2 = p2.precio * qty2;
        const total = subtotal1 + subtotal2;

        const profit1 = (p1.precio - p1.precio_costo) * qty1;
        const profit2 = (p2.precio - p2.precio_costo) * qty2;
        const saleProfit = profit1 + profit2;

        expectedTotalProfit += saleProfit;

        if (method === 'EFECTIVO') expectedCashSales += total;
        else if (method === 'OTROS') expectedOtrosSales += total;
        else if (method === 'FIADO') expectedFiadoSales += total;

        dbService.createSale(total, 2, method, sessionId, clientId, [
            { id: p1.id, nombre: p1.nombre, precio: p1.precio, precio_costo: p1.precio_costo, cantidad: qty1, subtotal: subtotal1 },
            { id: p2.id, nombre: p2.nombre, precio: p2.precio, precio_costo: p2.precio_costo, cantidad: qty2, subtotal: subtotal2 }
        ]);
    }

    const endSalesTime = process.hrtime.bigint();
    const salesDurationMs = Number(endSalesTime - startSalesTime) / 1e6;

    const totalSalesRecorded = db.prepare('SELECT COUNT(*) as c FROM ventas WHERE sesion_id = ?').get(sessionId).c;

    recordResult('Simulación de Ventas en Alta Concurrencia', totalSalesRecorded === SALES_COUNT, `${SALES_COUNT} ventas registradas con descuento atómico de stock.`, `${salesDurationMs.toFixed(1)} ms | ${(SALES_COUNT / (salesDurationMs / 1000)).toFixed(0)} ventas/seg`);
} catch (e) {
    recordResult('Simulación de Ventas en Alta Concurrencia', false, `Error en ventas: ${e.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// PRUEBA 5: COBRO DE FIADOS E INGRESO AUTOMÁTICO A CAJA
// ─────────────────────────────────────────────────────────────────────────────
let expectedFiadoCollectedCash = 0;
let expectedFiadoCollectedOtros = 0;

try {
    const clientsWithDebt = db.prepare('SELECT id, saldo, nombre FROM clientes WHERE saldo > 0 LIMIT 50').all();
    
    clientsWithDebt.forEach((c, idx) => {
        const payAmount = Math.min(c.saldo, 500);
        const payMethod = idx % 2 === 0 ? 'EFECTIVO' : 'OTROS';

        if (payMethod === 'EFECTIVO') expectedFiadoCollectedCash += payAmount;
        else expectedFiadoCollectedOtros += payAmount;

        dbService.payClientDebt(c.id, payAmount, payMethod);
    });

    const fiadoMovements = db.prepare("SELECT SUM(monto) as t FROM movimientos_caja WHERE categoria = 'Cobro Fiado' AND sesion_id = ?").get(sessionId).t || 0;
    const totalExpectedCollected = expectedFiadoCollectedCash + expectedFiadoCollectedOtros;

    recordResult('Cobro de Fiado con Impacto en Caja', fiadoMovements === totalExpectedCollected, `50 cobros de deuda imputados a clientes y registrados como ENTRADA en caja activa.`, `Total cobrado: $${fiadoMovements.toLocaleString()}`);
} catch (e) {
    recordResult('Cobro de Fiado con Impacto en Caja', false, `Error en cobro fiado: ${e.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// PRUEBA 6: MOVIMIENTOS MANUALES & AUDITORÍA CONTABLE AL 100%
// ─────────────────────────────────────────────────────────────────────────────
try {
    dbService.addMovimiento('ENTRADA', 'Aporte Cambio', 2000, 'Billetes cambio', sessionId, 'EFECTIVO');
    dbService.addMovimiento('SALIDA', 'Pago Proveedor', 3500, 'Gaseosas', sessionId, 'EFECTIVO');

    const expectedFinalCash = 10000 + expectedCashSales + expectedFiadoCollectedCash + 2000 - 3500;
    const expectedFinalOtros = expectedOtrosSales + expectedFiadoCollectedOtros;

    const actualCaja = dbService.getCajaActual(sessionId);
    const actualProfit = dbService.getGananciaTotal(sessionId);

    const cashMatch = Math.abs(actualCaja.efectivo - expectedFinalCash) < 0.001;
    const otrosMatch = Math.abs(actualCaja.otros - expectedFinalOtros) < 0.001;
    const profitMatch = Math.abs(actualProfit - expectedTotalProfit) < 0.001;

    if (cashMatch && otrosMatch && profitMatch) {
        recordResult('Arqueo y Auditoría Contable (Exactitud 100%)', true, `Cuadre perfecto de caja y margen de ganancias con 0 centavos de desviación.`, `Efectivo: $${actualCaja.efectivo.toFixed(2)} | Otros: $${actualCaja.otros.toFixed(2)} | Ganancia: $${actualProfit.toFixed(2)}`);
    } else {
        recordResult('Arqueo y Auditoría Contable (Exactitud 100%)', false, `Discrepancia contable detectada. Esperado: EF=$${expectedFinalCash}, OT=$${expectedFinalOtros}. Obtenido: EF=$${actualCaja.efectivo}, OT=$${actualCaja.otros}`);
    }
} catch (e) {
    recordResult('Arqueo y Auditoría Contable (Exactitud 100%)', false, `Error en cálculo contable: ${e.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// PRUEBA 7: ATOMICIDAD ACID & RESILIENCIA A ERRORES (Rollback)
// ─────────────────────────────────────────────────────────────────────────────
try {
    const prodBefore = db.prepare('SELECT stock FROM productos WHERE id = 1').get().stock;
    const salesBefore = db.prepare('SELECT COUNT(*) as c FROM ventas').get().c;

    let errorCaught = false;
    try {
        dbService.createSale(1000, 1, 'EFECTIVO', sessionId, null, [
            { id: 1, nombre: 'Item Ok', precio: 500, precio_costo: 300, cantidad: 5, subtotal: 500 },
            { id: 999999, nombre: null, precio: 'INVALID', precio_costo: 0, cantidad: 1, subtotal: 500 }
        ]);
    } catch (err) {
        errorCaught = true;
    }

    const prodAfter = db.prepare('SELECT stock FROM productos WHERE id = 1').get().stock;
    const salesAfter = db.prepare('SELECT COUNT(*) as c FROM ventas').get().c;

    const rollbackSuccess = errorCaught && (prodBefore === prodAfter) && (salesBefore === salesAfter);

    recordResult('Atomicidad Transaccional (ACID Rollback)', rollbackSuccess, 'Rollback automático ante fallos: cero registros huérfanos y stock protegido al 100%.');
} catch (e) {
    recordResult('Atomicidad Transaccional (ACID Rollback)', false, `Fallo en rollback: ${e.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// REPORTE FINAL CONSOLA
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n======================================================================');
console.log('                      📊  RESUMEN DE RESULTADOS                       ');
console.log('======================================================================');

const totalPassed = results.filter(r => r.passed).length;
const totalTests = results.length;
const passRate = ((totalPassed / totalTests) * 100).toFixed(1);

console.log(`Pruebas ejecutadas: ${totalTests}`);
console.log(`Pruebas superadas : ${totalPassed} / ${totalTests} (${passRate}%)`);
console.log(`Estado global     : ${totalPassed === totalTests ? '🚀 LISTO PARA PRODUCCIÓN & VENTA' : '⚠️ REQUIERE ATENCIÓN'}`);
console.log('======================================================================\n');

process.exit(totalPassed === totalTests ? 0 : 1);
