-- Script Completo para KioscoDB
-- Ejecuta esto en tu MySQL (DBeaver, Workbench, o phpMyAdmin)

-- CREAR LA BASE DE DATOS
CREATE DATABASE IF NOT EXISTS KioscoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- USAR LA BASE DE DATOS
USE KioscoDB;

-- CREAR TABLA DE PRODUCTOS
CREATE TABLE IF NOT EXISTS productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo_barras VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    precio DECIMAL(10, 2) NOT NULL,
    stock INT DEFAULT 0,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- INSERTAR DATOS DE PRUEBA
INSERT INTO productos (codigo_barras, nombre, precio, stock) VALUES
('123456789', 'Pan Integral 500g', 45.00, 50),
('987654321', 'Queso Oaxaca 250g', 150.00, 30),
('555666777', 'Leche Integral 1L', 38.00, 100),
('111222333', 'Yogurt Natural 500g', 28.00, 40),
('444555666', 'Mantequilla 250g', 65.00, 25),
('777888999', 'Jamon Serrano 250g', 180.00, 15),
('222333444', 'Queso Fresco 500g', 120.00, 35)
ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), precio=VALUES(precio);

-- VER LOS PRODUCTOS CREADOS
SELECT * FROM productos;
