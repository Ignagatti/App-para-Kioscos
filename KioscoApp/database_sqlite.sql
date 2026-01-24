-- Crear tablas para SQLite
CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_barras TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    precio REAL NOT NULL,
    stock REAL DEFAULT 0,
    categoria_id INTEGER,
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
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sesion_id) REFERENCES sesiones_caja(id)
);

CREATE TABLE IF NOT EXISTS venta_detalles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venta_id INTEGER NOT NULL,
    nombre TEXT NOT NULL,
    precio REAL NOT NULL,
    cantidad REAL NOT NULL,
    subtotal REAL NOT NULL,
    FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE
);

-- Insertar categorías iniciales
INSERT OR IGNORE INTO categorias (nombre) VALUES ('General'), ('Bebidas'), ('Golosinas');