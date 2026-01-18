# 🎯 KIOSCO APP - GUÍA RÁPIDA

## ✅ Tu Base de Datos
```sql
CREATE DATABASE KioscoDB;
CREATE TABLE productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo_barras VARCHAR(50) UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    precio DECIMAL(10, 2) NOT NULL,
    stock INT DEFAULT 0
);
```

## 🔗 Conexión MySQL
- **Host:** 127.0.0.1
- **Usuario:** root
- **Contraseña:** Gtacinco135
- **Puerto:** 3306
- **Base de datos:** KioscoDB

## 📥 PASO 1: Cargar Datos de Prueba

Ejecuta el script `insertar_productos.sql` en tu MySQL (DBeaver o Workbench):

```
USE KioscoDB;

INSERT INTO productos (codigo_barras, nombre, precio, stock) VALUES
('123456789', 'Pan Integral 500g', 45.00, 50),
('987654321', 'Queso Oaxaca 250g', 150.00, 30),
('555666777', 'Leche Integral 1L', 38.00, 100),
('111222333', 'Yogurt Natural 500g', 28.00, 40),
('444555666', 'Mantequilla 250g', 65.00, 25),
('777888999', 'Jamon Serrano 250g', 180.00, 15),
('222333444', 'Queso Fresco 500g', 120.00, 35);
```

## 🎮 PASO 2: Usar la Aplicación

### 📱 PESTAÑA VENTA (Principal)
1. **Escanea o escribe un código** (ej: `123456789`)
2. Presiona **ENTER**
3. El producto se agrega automáticamente
4. Repite para más productos
5. Presiona **ENTER vacío** para abrir panel de cobro

### 💳 PANEL DE COBRO
1. Ingresa el monto pagado
2. Se calcula automáticamente el cambio
3. Presiona **ENTER** para finalizar
4. O presiona **ESC** o botón rojo para volver atrás

### 📦 PESTAÑA CARGA DE PRODUCTOS
1. Escanea o escribe el código de barras
2. Se intenta buscar automáticamente en la API mundial
3. Ajusta nombre y precio
4. Haz clic en "GUARDAR EN BASE DE DATOS"

## 📊 Códigos de Prueba
| Código | Producto | Precio |
|--------|----------|--------|
| 123456789 | Pan Integral 500g | $45.00 |
| 987654321 | Queso Oaxaca 250g | $150.00 |
| 555666777 | Leche Integral 1L | $38.00 |
| 111222333 | Yogurt Natural 500g | $28.00 |

## ⌨️ Atajos de Teclado
- **ENTER:** Agrega producto o finaliza cobro
- **ENTER vacío:** Abre panel de cobro
- **ESC:** Cancela cobro y vuelve atrás
- **Click rojo:** Volver atrás desde cobro

## ❌ Si no funciona
1. Verifica que MySQL esté corriendo
2. Checa credenciales: Usuario `root`, Contraseña `Gtacinco135`
3. Asegúrate de que la tabla `productos` exista
4. Reinicia la aplicación

¡Listo para usar! 🚀
