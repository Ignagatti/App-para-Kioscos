-- Script para agregar columna categoria_id a productos
USE KioscoDB;

-- Agregar columna categoria_id a productos
ALTER TABLE productos ADD COLUMN categoria_id INT DEFAULT NULL;
ALTER TABLE productos ADD CONSTRAINT fk_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL;

-- Asignar categorias a productos existentes (ejemplo)
UPDATE productos SET categoria_id = (SELECT id FROM categorias WHERE nombre = 'Panificados' LIMIT 1) WHERE nombre LIKE '%pan%';
UPDATE productos SET categoria_id = (SELECT id FROM categorias WHERE nombre = 'Lácteos' LIMIT 1) WHERE nombre LIKE '%queso%' OR nombre LIKE '%leche%' OR nombre LIKE '%yogurt%' OR nombre LIKE '%mantequilla%';
UPDATE productos SET categoria_id = (SELECT id FROM categorias WHERE nombre = 'Bebidas' LIMIT 1) WHERE nombre LIKE '%bebida%' OR nombre LIKE '%jugo%' OR nombre LIKE '%gaseosa%';

-- Verificar
SELECT p.nombre, c.nombre as categoria, p.precio FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id;