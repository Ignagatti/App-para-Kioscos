-- Script de prueba para KioscoDB
-- Asegúrate de tener la base de datos y tabla creadas primero

USE KioscoDB;

-- Insertar productos de prueba
INSERT INTO productos (codigo_barras, nombre, precio, stock) VALUES
('123456789', 'Pan Integral 500g', 45.00, 50),
('987654321', 'Queso Oaxaca 250g', 150.00, 30),
('555666777', 'Leche Integral 1L', 38.00, 100),
('111222333', 'Yogurt Natural 500g', 28.00, 40),
('444555666', 'Mantequilla 250g', 65.00, 25),
('777888999', 'Jamon Serrano 250g', 180.00, 15),
('222333444', 'Queso Fresco 500g', 120.00, 35);

-- Ver todos los productos cargados
SELECT * FROM productos;
