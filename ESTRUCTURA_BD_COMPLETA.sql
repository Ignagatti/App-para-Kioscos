-- ESTRUCTURA COMPLETA DE BASE DE DATOS PARA KIOSCO
-- Ejecuta esto en tu MySQL

USE KioscoDB;

-- ============================================
-- TABLA 1: PRODUCTOS (Ya tienes esta)
-- ============================================
CREATE TABLE IF NOT EXISTS productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo_barras VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    precio DECIMAL(10, 2) NOT NULL,
    stock INT DEFAULT 0,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_codigo (codigo_barras)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA 2: VENTAS (Registra cada venta)
-- ============================================
CREATE TABLE IF NOT EXISTS ventas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    total DECIMAL(10, 2) NOT NULL,
    cantidad_items INT DEFAULT 0,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_anulada TIMESTAMP NULL,
    estado VARCHAR(20) DEFAULT 'completada', -- completada, anulada
    INDEX idx_fecha (fecha),
    INDEX idx_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA 3: VENTA_DETALLES (Productos de cada venta)
-- ============================================
CREATE TABLE IF NOT EXISTS venta_detalles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    venta_id INT NOT NULL,
    codigo_barras VARCHAR(50),
    nombre VARCHAR(150) NOT NULL,
    precio DECIMAL(10, 2) NOT NULL,
    cantidad INT DEFAULT 1,
    subtotal DECIMAL(10, 2) NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
    INDEX idx_venta (venta_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA 4: CATEGORIAS (Opcional - para organizar productos)
-- ============================================
CREATE TABLE IF NOT EXISTS categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA 5: USUARIOS (Opcional - para control de acceso)
-- ============================================
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    nombre VARCHAR(100),
    rol VARCHAR(20) DEFAULT 'vendedor', -- vendedor, admin, gerente
    activo TINYINT DEFAULT 1,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_ultimo_acceso TIMESTAMP NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA 6: REPORTES (Opcional - historial de resúmenes)
-- ============================================
CREATE TABLE IF NOT EXISTS reportes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    total_ventas DECIMAL(10, 2),
    cantidad_transacciones INT,
    producto_mas_vendido VARCHAR(150),
    fecha_generacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- INSERTAR DATOS DE PRUEBA
-- ============================================

-- Categorías
INSERT INTO categorias (nombre, descripcion) VALUES
('Lácteos', 'Quesos, leche, mantequilla'),
('Panificados', 'Pan, facturas, sandwiches'),
('Bebidas', 'Leche, jugos, gaseosas')
ON DUPLICATE KEY UPDATE nombre=VALUES(nombre);

-- Productos
INSERT INTO productos (codigo_barras, nombre, precio, stock) VALUES
('123456789', 'Pan Integral 500g', 350.00, 50),
('987654321', 'Queso Oaxaca 250g', 1500.00, 30),
('555666777', 'Leche Integral 1L', 380.00, 100),
('111222333', 'Yogurt Natural 500g', 280.00, 40),
('444555666', 'Mantequilla 250g', 650.00, 25),
('777888999', 'Jamon Serrano 250g', 1800.00, 15),
('222333444', 'Queso Fresco 500g', 1200.00, 35)
ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), precio=VALUES(precio);

-- Usuario por defecto (opcional)
INSERT INTO usuarios (usuario, password, nombre, rol) VALUES
('admin', 'admin123', 'Administrador', 'admin')
ON DUPLICATE KEY UPDATE nombre=VALUES(nombre);

-- ============================================
-- VER TODAS LAS TABLAS
-- ============================================
SHOW TABLES;

-- ============================================
-- VER ESTRUCTURA DE CADA TABLA
-- ============================================
DESCRIBE productos;
DESCRIBE ventas;
DESCRIBE venta_detalles;
DESCRIBE categorias;
DESCRIBE usuarios;
DESCRIBE reportes;
