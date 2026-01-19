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



-- 3. TABLA DE SESIONES DE CAJA (Nueva: Para controlar aperturas y cierres)

-- Esta tabla permite saber con cuánto se abrió, cuánto hubo al final y si el turno sigue activo.

CREATE TABLE sesiones_caja (

    id INT AUTO_INCREMENT PRIMARY KEY,

    fecha_apertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    monto_inicial DECIMAL(10, 2) NOT NULL,

    fecha_cierre TIMESTAMP NULL,

    monto_final_efectivo DECIMAL(10, 2) DEFAULT 0,

    monto_final_otros DECIMAL(10, 2) DEFAULT 0,

    estado ENUM('ABIERTA', 'CERRADA') DEFAULT 'ABIERTA'

) ENGINE=InnoDB;



-- 4. TABLA DE PRODUCTOS

-- Mantiene el soporte para decimales (quesos/pesables).

CREATE TABLE productos (

    id INT AUTO_INCREMENT PRIMARY KEY,

    codigo_barras VARCHAR(50) UNIQUE NOT NULL,

    nombre VARCHAR(150) NOT NULL,

    precio DECIMAL(10, 2) NOT NULL,

    stock DECIMAL(10, 3) DEFAULT 0.000, 

    categoria_id INT DEFAULT NULL,

    CONSTRAINT fk_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL

) ENGINE=InnoDB;



-- 5. TABLA DE VENTAS (Actualizada con sesion_id)

-- Cada venta queda vinculada a una apertura de caja específica para los reportes.

CREATE TABLE ventas (

    id INT AUTO_INCREMENT PRIMARY KEY,

    total DECIMAL(10, 2) NOT NULL,

    cantidad_items INT DEFAULT 0,

    metodo_pago VARCHAR(50) NOT NULL,

    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    sesion_id INT NOT NULL,

    CONSTRAINT fk_sesion_venta FOREIGN KEY (sesion_id) REFERENCES sesiones_caja(id) ON DELETE CASCADE

) ENGINE=InnoDB;



-- 6. TABLA DE DETALLES

CREATE TABLE venta_detalles (

    id INT AUTO_INCREMENT PRIMARY KEY,

    venta_id INT NOT NULL,

    nombre VARCHAR(150) NOT NULL,

    precio DECIMAL(10, 2) NOT NULL,

    cantidad DECIMAL(10, 3) DEFAULT 1.000,

    subtotal DECIMAL(10, 2) NOT NULL,

    FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE

) ENGINE=InnoDB;



-- 7. DATOS INICIALES

INSERT INTO categorias (nombre, descripcion) VALUES 

('Panificados', 'Productos de panadería'),

('Lácteos', 'Leches y derivados'),

('Fiambrería', 'Quesos y embutidos por peso'),

('Farmacia', 'Medicamentos y cuidado');



INSERT INTO productos (codigo_barras, nombre, precio, stock, categoria_id) VALUES 

('7791234', 'Pan de salvado', 1500.00, 20.000, 1),

('7791235', 'Leche Descremada 1L', 1200.00, 30.000, 2),

('7791237', 'Queso Tybo (Precio x Kg)', 8500.00, 10.500, 3),

('101', 'Aspirina (x Tira)', 500.00, 100.000, 4);