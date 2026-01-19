-- 1. LIMPIEZA Y CREACIÓN
DROP DATABASE IF EXISTS KioscoDB;
CREATE DATABASE KioscoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE KioscoDB;

-- 2. TABLA DE CATEGORÍAS
CREATE TABLE categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT
) ENGINE=InnoDB;

-- 3. TABLA DE PRODUCTOS
-- Se usa DECIMAL(10,3) para permitir stock fraccionado (ej: 1.500 kg de queso)
CREATE TABLE productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo_barras VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    precio DECIMAL(10, 2) NOT NULL,
    stock DECIMAL(10, 3) DEFAULT 0.000, 
    categoria_id INT DEFAULT NULL,
    CONSTRAINT fk_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 4. TABLA DE VENTAS
-- Incluye 'metodo_pago' para que la App no de error al finalizar
CREATE TABLE ventas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    total DECIMAL(10, 2) NOT NULL,
    cantidad_items INT DEFAULT 0,
    metodo_pago VARCHAR(50) NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 5. TABLA DE DETALLES
-- 'cantidad' es DECIMAL para poder vender 0.100 kg (100 gramos)
CREATE TABLE venta_detalles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    venta_id INT NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    precio DECIMAL(10, 2) NOT NULL,
    cantidad DECIMAL(10, 3) DEFAULT 1.000,
    subtotal DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 6. DATOS INICIALES
INSERT INTO categorias (nombre, descripcion) VALUES 
('Panificados', 'Productos de panadería'),
('Lácteos', 'Leches y derivados'),
('Fiambrería', 'Quesos y embutidos por peso'),
('Farmacia', 'Medicamentos y artículos de cuidado');

-- Productos de ejemplo (7791237 es el queso para probar gramos)
INSERT INTO productos (codigo_barras, nombre, precio, stock, categoria_id) VALUES 
('7791234', 'Pan de salvado', 1500.00, 20.000, 1),
('7791235', 'Leche Descremada 1L', 1200.00, 30.000, 2),
('7791237', 'Queso Tybo (Precio x Kg)', 8500.00, 10.500, 3),
('101', 'Aspirina (x Tira)', 500.00, 100.000, 4);

-- Verificación
SELECT * FROM productos;

select * from productos;