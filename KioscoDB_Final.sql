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

-- 3. TABLA DE PRODUCTOS (Actualizada para peso y fracciones)
CREATE TABLE productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo_barras VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    precio DECIMAL(10, 2) NOT NULL,
    unidad_medida VARCHAR(20) DEFAULT 'Unidad', -- Unidad, Kg, Blister, etc.
    stock DECIMAL(10, 3) DEFAULT 0.000,         -- Ahora permite 20.500 kg
    categoria_id INT DEFAULT NULL,
    CONSTRAINT fk_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 4. TABLA DE VENTAS
CREATE TABLE ventas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    total DECIMAL(10, 2) NOT NULL,
    cantidad_items INT DEFAULT 0,
    metodo_pago VARCHAR(50) NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 5. TABLA DE DETALLES (Actualizada para cantidades fraccionadas)
CREATE TABLE venta_detalles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    venta_id INT NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    precio DECIMAL(10, 2) NOT NULL,
    cantidad DECIMAL(10, 3) DEFAULT 1.000,      -- Ahora puedes vender 0.100 de queso
    subtotal DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 6. DATOS INICIALES DE EJEMPLO
INSERT INTO categorias (nombre, descripcion) VALUES 
('Fiambrería', 'Quesos y fiambres por peso'),
('Farmacia', 'Medicamentos y tiras'),
('Bebidas', 'Gaseosas y jugos');

INSERT INTO productos (codigo_barras, nombre, precio, unidad_medida, stock, categoria_id) VALUES 
('101', 'Queso Tybo (x Kg)', 8500.00, 'Kg', 10.500, 1),
('202', 'Aspirina (x Tira)', 500.00, 'Unidad', 50.000, 2),
('7791236', 'Coca Cola 500ml', 950.00, 'Unidad', 24.000, 3);

select * from productos;