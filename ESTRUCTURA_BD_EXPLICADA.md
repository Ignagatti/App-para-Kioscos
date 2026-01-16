# 📊 ESTRUCTURA COMPLETA DE BASE DE DATOS KIOSCO

## Diagrama de Tablas

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  PRODUCTOS                    CATEGORIAS                   │
│  ──────────────────           ──────────────               │
│  • id (PK)                    • id (PK)                    │
│  • codigo_barras (UNIQUE)     • nombre                     │
│  • nombre                     • descripcion                │
│  • precio                                                  │
│  • stock                                                   │
│  • fecha_creacion                                          │
│                                                             │
│              ↓                      ↓                       │
│              └──────────────────────┘                       │
│                                                             │
│  USUARIOS                                                  │
│  ──────────────────                                        │
│  • id (PK)                                                 │
│  • usuario (UNIQUE)                                        │
│  • password                                                │
│  • nombre                                                  │
│  • rol (vendedor/admin/gerente)                           │
│  • activo                                                  │
│                                                             │
│              ↓                                              │
│              │                                              │
│              └─→ VENTAS  ←─────────────────────────────┐   │
│                 ──────────                            │   │
│                 • id (PK)        ┌────────────────────┘   │
│                 • total          │                        │
│                 • cantidad_items │                        │
│                 • fecha          │                        │
│                 • estado         │                        │
│                                  │                        │
│                                  ↓                        │
│                         VENTA_DETALLES                    │
│                         ──────────────────                │
│                         • id (PK)                         │
│                         • venta_id (FK)                   │
│                         • codigo_barras                   │
│                         • nombre                          │
│                         • precio                          │
│                         • cantidad                        │
│                         • subtotal                        │
│                         • fecha                           │
│                                                             │
│              ↓                                              │
│         REPORTES                                            │
│         ──────────────────                                 │
│         • id (PK)                                          │
│         • fecha_inicio                                     │
│         • fecha_fin                                        │
│         • total_ventas                                     │
│         • cantidad_transacciones                           │
│         • producto_mas_vendido                             │
│         • fecha_generacion                                 │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 Descripción de Tablas

### **1. PRODUCTOS** ✅ (Ya tienes)
```sql
id              INT PRIMARY KEY AUTO_INCREMENT
codigo_barras   VARCHAR(50) UNIQUE - El código del scanner
nombre          VARCHAR(150) - Nombre del producto
precio          DECIMAL(10,2) - Precio en pesos argentinos
stock           INT - Cantidad disponible
fecha_creacion  TIMESTAMP - Cuándo se agregó
```

### **2. VENTAS** (Registra cada transacción)
```sql
id              INT PRIMARY KEY AUTO_INCREMENT
total           DECIMAL(10,2) - Total de la venta
cantidad_items  INT - Cuántos productos
fecha           TIMESTAMP - Cuándo fue
estado          VARCHAR(20) - completada / anulada
```

### **3. VENTA_DETALLES** (Cada producto vendido)
```sql
id              INT PRIMARY KEY AUTO_INCREMENT
venta_id        INT - Referencia a ventas
codigo_barras   VARCHAR(50) - Código del producto
nombre          VARCHAR(150) - Nombre del producto
precio          DECIMAL(10,2) - Precio que se pagó
cantidad        INT - Cuántos se vendieron
subtotal        DECIMAL(10,2) - precio x cantidad
fecha           TIMESTAMP
```

### **4. CATEGORIAS** (Opcional - Organizar productos)
```sql
id              INT PRIMARY KEY AUTO_INCREMENT
nombre          VARCHAR(100) - Lácteos, Panificados, etc
descripcion     TEXT - Descripción
```

### **5. USUARIOS** (Opcional - Acceso por usuario)
```sql
id              INT PRIMARY KEY AUTO_INCREMENT
usuario         VARCHAR(50) - Usuario login
password        VARCHAR(255) - Contraseña
nombre          VARCHAR(100) - Nombre real
rol             VARCHAR(20) - admin, vendedor, gerente
activo          TINYINT - Habilitado o no
```

### **6. REPORTES** (Opcional - Estadísticas)
```sql
id              INT PRIMARY KEY AUTO_INCREMENT
fecha_inicio    DATE - Desde
fecha_fin       DATE - Hasta
total_ventas    DECIMAL(10,2) - Suma total
cantidad_transacciones INT - Cuántas ventas
producto_mas_vendido VARCHAR(150) - Cuál fue #1
```

---

## 🚀 Cómo Ejecutar

1. Abre tu cliente MySQL (DBeaver, Workbench, etc)
2. Copia TODO el contenido de: `ESTRUCTURA_BD_COMPLETA.sql`
3. Pégalo y ejecuta
4. ¡Listo! 

Las tablas se crearán automáticamente con datos de prueba.

---

## 📌 Mínimo Obligatorio

Si solo necesitas lo básico:
```sql
CREATE DATABASE KioscoDB;

CREATE TABLE productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo_barras VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    precio DECIMAL(10, 2) NOT NULL,
    stock INT DEFAULT 0
);

CREATE TABLE ventas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    total DECIMAL(10, 2) NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE venta_detalles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    venta_id INT NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    precio DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (venta_id) REFERENCES ventas(id)
);
```

Eso es lo que necesita tu app actualmente.

---

## 💡 Diferencias de Moneda

Los precios están en **Pesos Argentinos ($)**:
- Pan: $350
- Queso: $1500
- Leche: $380

Si necesitas actualizar a otra moneda, solo cambia los valores.
