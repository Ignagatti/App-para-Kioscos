"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbService = void 0;
exports.initDb = initDb;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
// La ruta de la base de datos debe ser la misma que la de WPF
// %AppData%/KioscoApp/kiosco.db
const dbPath = path_1.default.join(electron_1.app.getPath('appData'), 'KioscoApp', 'kiosco.db');
// Asegurarse de que el directorio existe
const dbDir = path_1.default.dirname(dbPath);
if (!fs_1.default.existsSync(dbDir)) {
    fs_1.default.mkdirSync(dbDir, { recursive: true });
}
const db = new better_sqlite3_1.default(dbPath, { verbose: console.log });
// Inicializar tablas si no existen (opcional, ya deberían existir)
function initDb() {
    // Podríamos correr el script SQL aquí si fuera necesario
}
exports.dbService = {
    getProducts: () => {
        return db.prepare('SELECT p.*, c.nombre as Categoria FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id').all();
    },
    getCategories: () => {
        return db.prepare('SELECT * FROM categorias ORDER BY nombre').all();
    },
    getProductByBarcode: (barcode) => {
        return db.prepare('SELECT * FROM productos WHERE codigo_barras = ?').get(barcode);
    },
    searchProducts: (query) => {
        const words = query.split(' ').filter(w => w.length > 0);
        const whereClause = words.map(() => `nombre LIKE ?`).join(' AND ');
        const params = words.map(w => `%${w}%`);
        return db.prepare(`SELECT * FROM productos WHERE ${whereClause} LIMIT 20`).all(...params);
    },
    createSale: (total, itemsCount, paymentMethod, sessionId, clientId) => {
        const insertVenta = db.prepare('INSERT INTO ventas (total, cantidad_items, metodo_pago, sesion_id, cliente_id) VALUES (?, ?, ?, ?, ?)');
        const result = insertVenta.run(total, itemsCount, paymentMethod, sessionId, clientId);
        return result.lastInsertRowid;
    },
    addSaleDetail: (ventaId, nombre, precio, costo, cantidad, subtotal) => {
        const insertDetail = db.prepare('INSERT INTO venta_detalles (venta_id, nombre, precio, costo_unitario, cantidad, subtotal) VALUES (?, ?, ?, ?, ?, ?)');
        return insertDetail.run(ventaId, nombre, precio, costo, cantidad, subtotal);
    },
    updateStock: (productId, quantity) => {
        const update = db.prepare('UPDATE productos SET stock = stock - ? WHERE id = ?');
        return update.run(quantity, productId);
    },
    getSessionStatus: () => {
        return db.prepare("SELECT id, monto_inicial FROM sesiones_caja WHERE estado = 'ABIERTA' LIMIT 1").get();
    }
};
