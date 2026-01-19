-- Crear base de datos
CREATE DATABASE IF NOT EXISTS KioscoDB;
USE KioscoDB;

-- Tabla de productos
CREATE TABLE IF NOT EXISTS productos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    codigo_barras VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    precio DECIMAL(10, 2) NOT NULL,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de ventas
CREATE TABLE IF NOT EXISTS ventas (
    id INT PRIMARY KEY AUTO_INCREMENT,
    total DECIMAL(10, 2) NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_fecha (fecha)
);

-- Tabla de detalles de ventas
CREATE TABLE IF NOT EXISTS venta_detalles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    venta_id INT NOT NULL,
    nombre VARCHAR(255) NOT NULL,
    precio DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
    INDEX idx_venta (venta_id)
);

CREATE TABLE IF NOT EXISTS categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL
);

-- Insertamos algunas categorías básicas para empezar
INSERT INTO categorias (nombre) VALUES ('General'), ('Bebidas'), ('Golosinas'), ('Cigarrillos'), ('Librería'), ('Limpieza');

-- Inserts de ejemplo
INSERT INTO productos (codigo_barras, nombre, precio) VALUES
('123456789', 'Pan Integral', 25.00),
('987654321', 'Queso Oaxaca', 150.00),
('555666777', 'Leche 1L', 35.00),
('111222333', 'Yogurt Natural', 28.00);
