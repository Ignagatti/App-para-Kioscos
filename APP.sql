-- 1. CREACIÓN DE LA BASE DE DATOS
DROP DATABASE IF EXISTS KioscoDB;
CREATE DATABASE KioscoDB;
USE KioscoDB;

-- 2. CREACIÓN DE TABLAS (Ordenadas por jerarquía de llaves foráneas)

CREATE TABLE categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT
);

CREATE TABLE productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo_barras VARCHAR(50) UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    precio DECIMAL(10, 2) NOT NULL,
    stock INT DEFAULT 0,
    categoria_id INT DEFAULT NULL,
    CONSTRAINT fk_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL
);

CREATE TABLE ventas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    total DECIMAL(10, 2) NOT NULL,
    cantidad_items INT,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE venta_detalles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    venta_id INT NOT NULL,
    nombre VARCHAR(150),
    precio DECIMAL(10, 2),
    cantidad INT,
    subtotal DECIMAL(10, 2),
    FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------
-- 3. INSERCIÓN DE DATOS INICIALES
-- ---------------------------------------------------------

-- Insertar categorías primero
INSERT INTO categorias (nombre, descripcion) VALUES 
('Panificados', 'Productos de panadería y bollería'),
('Lácteos', 'Leches, quesos y derivados'),
('Bebidas', 'Gaseosas, jugos y aguas'),
('Snacks', 'Papas fritas, galletitas y golosinas');

-- Insertar algunos productos de ejemplo
INSERT INTO productos (codigo_barras, nombre, precio, stock) VALUES 
('7791234', 'Pan de salvado', 1500.00, 20),
('7791235', 'Leche Descremada 1L', 1200.00, 30),
('7791236', 'Coca Cola Sin Azúcar 500ml', 950.00, 50),
('7791237', 'Queso Tybo 200g', 2100.00, 15),
('7791238', 'Jugo de Naranja 1L', 800.00, 25),
('7791239', 'Gaseosa de Lima Limón', 900.00, 40);

-- ---------------------------------------------------------
-- 4. ACTUALIZACIÓN AUTOMÁTICA DE CATEGORÍAS
-- ---------------------------------------------------------

-- Desactivamos el modo seguro para permitir actualizaciones masivas
SET SQL_SAFE_UPDATES = 0;

-- Asignar Panificados
UPDATE productos 
SET categoria_id = (SELECT id FROM categorias WHERE nombre = 'Panificados') 
WHERE nombre LIKE '%pan%';

-- Asignar Lácteos
UPDATE productos 
SET categoria_id = (SELECT id FROM categorias WHERE nombre = 'Lácteos') 
WHERE nombre LIKE '%queso%' OR nombre LIKE '%leche%' OR nombre LIKE '%yogurt%' OR nombre LIKE '%mantequilla%';

-- Asignar Bebidas
UPDATE productos 
SET categoria_id = (SELECT id FROM categorias WHERE nombre = 'Bebidas') 
WHERE nombre LIKE '%bebida%' OR nombre LIKE '%jugo%' OR nombre LIKE '%gaseosa%' OR nombre LIKE '%cola%';

-- Reactivamos el modo seguro por precaución
SET SQL_SAFE_UPDATES = 1;

-- ---------------------------------------------------------
-- 5. VERIFICACIÓN
-- ---------------------------------------------------------

-- Consulta para ver los productos con su categoría unida (JOIN)
SELECT 
    p.id, 
    p.nombre AS Producto, 
    p.precio, 
    c.nombre AS Categoria 
FROM productos p
LEFT JOIN categorias c ON p.categoria_id = c.id;