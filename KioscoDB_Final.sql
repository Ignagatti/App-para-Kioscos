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

-- 3. TABLA DE PRODUCTOS (Sincronizada con tu C# e Inventario)
CREATE TABLE productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo_barras VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    precio DECIMAL(10, 2) NOT NULL,
    stock INT DEFAULT 0,
    categoria_id INT DEFAULT NULL,
    CONSTRAINT fk_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 4. TABLA DE VENTAS (Con la columna metodo_pago que pedía el error)
CREATE TABLE ventas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    total DECIMAL(10, 2) NOT NULL,
    cantidad_items INT DEFAULT 0,
    metodo_pago VARCHAR(50) NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 5. TABLA DE DETALLES
CREATE TABLE venta_detalles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    venta_id INT NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    precio DECIMAL(10, 2) NOT NULL,
    cantidad INT DEFAULT 1,
    subtotal DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 6. DATOS INICIALES
INSERT INTO categorias (nombre, descripcion) VALUES 
('Panificados', 'Productos de panadería'),
('Lácteos', 'Leches y derivados'),
('Bebidas', 'Gaseosas y jugos'),
('Snacks', 'Golosinas y papas');

INSERT INTO productos (codigo_barras, nombre, precio, stock, categoria_id) VALUES 
('7791234', 'Pan de salvado', 1500.00, 20, 1),
('7791235', 'Leche Descremada 1L', 1200.00, 30, 2),
('7791236', 'Coca Cola 500ml', 950.00, 50, 3),
('7791237', 'Alfajor Triple', 800.00, 100, 4);