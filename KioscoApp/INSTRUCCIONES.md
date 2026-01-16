# 📋 Guía de Configuración - KioscoApp

## ⚙️ PASO 1: Preparar la Base de Datos MySQL

### Opción A: Usar phpMyAdmin (XAMPP)
1. Abre http://localhost/phpmyadmin
2. Copia y pega el contenido del archivo `database.sql` en la pestaña "SQL"
3. Haz clic en "Ejecutar"

### Opción B: Usar comandos MySQL
```bash
mysql -u root -p < database.sql
```

---

## 🎮 PASO 2: Usar la Aplicación

### Pestaña CARGA DE PRODUCTOS
1. **Escanea o escribe un código** (ej: 123456789)
2. Si el código existe en la API mundial, se llena automáticamente el nombre
3. Ajusta el precio en pesos mexicanos ($)
4. Haz clic en "GUARDAR EN BASE DE DATOS"

### Pestaña VENTA
1. **Escanea el código de barras** del producto con tu scanner
2. El producto se agrega automáticamente al carrito
3. Repite para agregar más productos
4. **PRESIONA ENTER VACÍO** para abrir el panel de cobro
5. Ingresa el monto pagado
6. Se calcula automáticamente el cambio
7. **PRESIONA ENTER DOS VECES**:
   - Primera vez: confirma el monto
   - Segunda vez: finaliza la venta (se guarda en BD)

---

## 💾 Base de Datos - Estructura

### Tabla: `productos`
- **id**: Identificador único
- **codigo_barras**: Código único del scanner
- **nombre**: Nombre del producto
- **precio**: Precio en pesos ($)
- **fecha_creacion**: Registro automático

### Tabla: `ventas`
- **id**: Identificador de la venta
- **total**: Total a pagar
- **fecha**: Timestamp automático

### Tabla: `venta_detalles`
- **id**: Identificador único
- **venta_id**: Referencia a la venta
- **nombre**: Producto vendido
- **precio**: Precio vendido

---

## 🔧 Configuración de Conexión

Si tu MySQL tiene usuario/contraseña diferentes, edita esta línea en `MainWindow.xaml.cs`:

```csharp
string connStr = "Server=localhost;Database=KioscoDB;Uid=root;Pwd=;";
```

Cambia:
- `Uid=root` → tu usuario
- `Pwd=` → tu contraseña (ej: `Pwd=12345`)

---

## ✅ Prueba con Códigos de Ejemplo

Los códigos pre-cargados son:
- **123456789** → Pan Integral ($25.00)
- **987654321** → Queso Oaxaca ($150.00)
- **555666777** → Leche 1L ($35.00)
- **111222333** → Yogurt Natural ($28.00)

---

## 🆘 Solución de Problemas

### ❌ "Error de conexión"
→ Verifica que MySQL esté corriendo (XAMPP control panel)

### ❌ "Código no encontrado"
→ Carga primero el producto en la pestaña "CARGA DE PRODUCTOS"

### ❌ El scanner no escribe
→ Asegúrate de que el campo de escaneo esté en foco (haz clic en él)
