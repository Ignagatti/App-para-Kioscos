# 📱 SCANNER CON CELULAR - GUÍA COMPLETA

## 🚀 Cómo Funciona

La app de escritorio ahora tiene un **servidor web** que recibe códigos del celular:

```
Celular → Lee código con cámara → Envía a PC → Se agrega automáticamente
```

---

## ⚙️ PASO 1: Configurar IP de la PC

1. **Abre Command Prompt (CMD)** en tu PC
2. Escribe: `ipconfig`
3. Busca tu **IPv4 Address** (algo como `192.168.x.x`)
4. Apúntala (ej: `192.168.1.100`)

---

## 📲 PASO 2: Abrir Scanner en el Celular

1. **Conecta tu celular a la MISMA red WiFi** que la PC
2. En el celular, abre un navegador (Chrome, Firefox, etc)
3. Escribe en la barra de direcciones:
   ```
   http://TU_IP_PC:5000/scanner-celular.html
   ```
   Ejemplo:
   ```
   http://192.168.1.100:5000/scanner-celular.html
   ```

---

## 🔧 PASO 3: Configurar en la Página del Celular

1. Se abrirá la página del scanner
2. **Ingresa la IP de tu PC** (arriba)
3. **Puerto: 5000** (ya está puesto)
4. Haz clic en "▶️ Iniciar"

---

## ✅ PASO 4: Usar el Scanner

1. **La cámara del celular se abrirá**
2. **Apunta al código de barras** (o QR)
3. Cuando lo lea, se enviará **automáticamente** a la PC
4. El producto se agregará al carrito

---

## 📝 Archivo de la Página Web

La página está en:
```
C:\Users\SFC\OneDrive\Desktop\KioscoApp\scanner-celular.html
```

Si necesitas servir la página desde un servidor web, puedes guardarla en:
- **IIS** (si tienes configurado)
- **Apache** 
- **Nginx**

O simplemente usa: `http://TU_IP:5000/scanner-celular.html`

---

## 🔍 Cómo Obtener la IP de tu PC

**Windows - Command Prompt:**
```bash
ipconfig
```

Busca: `IPv4 Address` (no uses `127.0.0.1`, ese es solo local)

**Ejemplo de salida:**
```
Ethernet adapter Conexión de área local:
   IPv4 Address. . . . . . . . . : 192.168.1.100
```

---

## 🆘 Solución de Problemas

### ❌ "No puedo acceder a la página"
1. Verifica que ambos estén en la **misma red WiFi**
2. Checa que la **IP sea correcta** (no uses 127.0.0.1)
3. Abre la app de escritorio primero
4. Intenta desde otro navegador

### ❌ "No me deja usar la cámara"
1. El navegador debe permitir acceso a cámara
2. En Android: Configuración → Permisos → Cámara → Habilitar
3. En iPhone: Configuración → Privacidad → Cámara → Habilitar

### ❌ "Lee mal los códigos"
1. Mejora la iluminación
2. Acerca más o aleja el código
3. Intenta con un código QR (lee más rápido)

---

## 💡 Recomendaciones

✅ **Usa un QR Code** en lugar de código de barras (más rápido)
✅ **Ten buena iluminación** para leer mejor
✅ **Coloca el celular en un soporte** para dejar las manos libres
✅ **Prueба primero sin clientes** para familiarizarte

---

## 🔒 Seguridad

El servidor escucha en `http://+:5000/`:
- Solo en tu red local (WiFi)
- Si quieres hacerlo público, necesita HTTPS y autenticación
- Por ahora es seguro para uso interno

¡Listo! Ya puedes usar tu celular como scanner. 🎯
