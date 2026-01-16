# 🔧 CREAR BASE DE DATOS - PASO A PASO

## ❌ Problema: "Base de datos desconocida (Unknown database 'KioscoDB')"

Esto significa que la base de datos aún NO existe. Sigue estos pasos:

---

## ✅ OPCIÓN 1: Usar DBeaver (Recomendado)

1. **Abre DBeaver**
2. Conecta a tu MySQL (127.0.0.1, usuario: root, contraseña: Gtacinco135)
3. Haz clic derecho en la conexión → "SQL Script" → "New SQL Script"
4. Copia y pega TODO el contenido de: `CREAR_BD_COMPLETA.sql`
5. Selecciona todo (Ctrl+A)
6. Ejecuta (Ctrl+Enter o botón Play)
7. Listo ✓

---

## ✅ OPCIÓN 2: Usar MySQL Workbench

1. **Abre MySQL Workbench**
2. Conecta a tu servidor (127.0.0.1:3306)
3. Haz clic en "File" → "Open SQL Script"
4. Selecciona: `CREAR_BD_COMPLETA.sql`
5. Haz clic en el botón "Execute" (rayo) en la barra de herramientas
6. Listo ✓

---

## ✅ OPCIÓN 3: Usar Línea de Comandos (CMD)

1. **Abre Command Prompt (CMD)**
2. Navega a la carpeta del proyecto:
   ```
   cd C:\Users\SFC\OneDrive\Desktop\KioscoApp
   ```

3. Ejecuta el script:
   ```
   mysql -h 127.0.0.1 -u root -pGtacinco135 < CREAR_BD_COMPLETA.sql
   ```

4. Si ves "Query OK", ¡listo! ✓

---

## ✅ OPCIÓN 4: Copiar y Pegar el Script

Si ninguna opción anterior funciona, copia esto en tu cliente MySQL:

```sql
CREATE DATABASE IF NOT EXISTS KioscoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE KioscoDB;

CREATE TABLE IF NOT EXISTS productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo_barras VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    precio DECIMAL(10, 2) NOT NULL,
    stock INT DEFAULT 0,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO productos (codigo_barras, nombre, precio, stock) VALUES
('123456789', 'Pan Integral 500g', 45.00, 50),
('987654321', 'Queso Oaxaca 250g', 150.00, 30),
('555666777', 'Leche Integral 1L', 38.00, 100),
('111222333', 'Yogurt Natural 500g', 28.00, 40);

SELECT * FROM productos;
```

---

## 🔍 Verificar que Funciona

Ejecuta este comando para verificar:
```sql
SELECT * FROM KioscoDB.productos;
```

Deberías ver una tabla con productos como:
```
| id | codigo_barras | nombre               | precio | stock |
|----|----------------|----------------------|--------|-------|
| 1  | 123456789     | Pan Integral 500g   | 45.00  | 50    |
| 2  | 987654321     | Queso Oaxaca 250g   | 150.00 | 30    |
```

Si ves esto, ¡la BD está lista! ✓

---

## 🚀 Después de Crear la BD

1. Cierra la aplicación KioscoApp (si está abierta)
2. Reabre la aplicación
3. ¡Debería conectar sin problemas!

---

## ❓ ¿Aún no funciona?

Verifica:
- ✓ MySQL está corriendo (XAMPP/WAMP)
- ✓ Usuario: root, Contraseña: Gtacinco135
- ✓ Host: 127.0.0.1, Puerto: 3306
- ✓ La BD `KioscoDB` existe (ejecuta: `SHOW DATABASES;`)
- ✓ La tabla `productos` existe (ejecuta: `USE KioscoDB; SHOW TABLES;`)
