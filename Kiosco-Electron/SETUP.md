# Kiosco Pro - Guía de Configuración

## ✅ Estado del Proyecto
- **Compilación**: ✓ Funciona perfectamente
- **Desarrollo**: ✓ `npm run dev` listo para usar
- **Producción**: ✓ Build generado en `dist/`
- **Tests**: ✓ Configurados con Vitest

## 🚀 Instalación Rápida

```bash
# Ir al directorio del proyecto
cd Kiosco-Electron

# Las dependencias ya están instaladas, pero si necesitas actualizar:
npm install

# Iniciar desarrollo
npm run dev
```

Luego abre: **http://localhost:5173**

## 📝 Comandos Disponibles

| Comando | Descripción |
|---------|------------|
| `npm run dev` | Inicia servidor de desarrollo (Vite + Mock API) |
| `npm run build` | Compila para producción (carpeta `dist/`) |
| `npm run electron:dev` | Ejecuta con Electron real (requiere DB SQLite configurada) |
| `npm run electron:build` | Compila archivos de Electron |
| `npm test` | Ejecuta tests en modo watch |
| `npm run test:run` | Ejecuta tests una sola vez |
| `npm run test:ui` | Abre UI interactivo de tests |
| `npm run lint` | Verifica código con ESLint |
| `npm run preview` | Vista previa del build de producción |

## 📱 Pantallas Disponibles

- **Ventas (F1)**: Procesar ventas, carrito de compras
- **Inventario (F2)**: Gestión de productos y stock
- **Caja (F5)**: Apertura/cierre de caja, movimientos
- **Clientes/Fiados (F4)**: Registrar clientes y deudas
- **Reportes (F3)**: Reportes de ventas y cierres

## ⚙️ Estructura del Proyecto

```
src/
├── App.tsx              # Componente principal
├── main.tsx             # Punto de entrada
├── index.css            # Estilos globales
├── components/          # Componentes React
│   ├── Ventas.tsx
│   ├── Inventario.tsx
│   ├── Caja.tsx
│   ├── Clientes.tsx
│   └── Reportes.tsx
├── types/
│   ├── electron.ts      # Tipos de la API
│   └── electronMocks.ts # Mock data para desarrollo
├── utils/               # Funciones utilitarias
├── assets/              # Imágenes y recursos
└── test/                # Tests unitarios

electron/
├── main.ts              # Proceso principal de Electron
├── preload.ts           # Bridge API entre Electron y React
└── db.ts                # Conexión a base de datos SQLite
```

## 🔒 API Mock para Desarrollo

Para facilitar el desarrollo, se incluye una API simulada (`src/types/electronMocks.ts`) que se carga automáticamente cuando ejecutas `npm run dev`.

**Datos de ejemplo incluidos:**
- 2 clientes: Juan Pérez y María García
- 3 productos: Agua, Pan, Queso
- 1 categoría de caja abierta con mock data

Cuando ejecutes `npm run electron:dev`, se usará la **API real de Electron** con la base de datos SQLite.

## 🐛 Notas sobre Vulnerabilidades NPM

El proyecto tiene 8 vulnerabilidades reportadas, pero **son seguras** porque:

- **Ubicación**: Todas están en dependencias de **desarrollo** (electron-rebuild, request, node-gyp)
- **Impacto**: No afectan la aplicación en producción
- **Motivo**: `electron-rebuild` usa dependencias antiguas (tar, node-gyp)

Si necesitas resolver esto para una auditoría de seguridad:

```bash
# Opción 1: Instalar Visual Studio Build Tools (recomendado para desarrollo Electron)
# Luego ejecutar:
npm audit fix --force

# Opción 2: Aceptar los riesgos (es normal en proyectos Electron)
npm install --no-audit
```

## 🧪 Tests

El proyecto incluye tests con Vitest:

```bash
# Ejecutar tests
npm run test

# Tests disponibles:
# - src/test/unit/caja.utils.test.ts
# - src/test/unit/venta.utils.test.ts
# - src/test/integration/venta-parcial.test.tsx
# - src/test/components/Clientes.test.tsx
```

## 💻 Configuración de Desarrollo Recomendada

**Visual Studio Code + Extensiones sugeridas:**
- ESLint
- Prettier
- TypeScript Vue Plugin
- Vitest

## 🤝 Trabajo en Equipo

Como están trabajando dos personas en el proyecto:

1. **Commits limpios**: Ambos deben hacer commits descriptivos
2. **Package-lock.json**: Compartir para evitar conflictos de versiones
3. **Rama develop**: Crear para cambios experimentales
4. **Pulls antes de push**: Actualizar con cambios del compañero

## 🎯 Próximos Pasos Recomendados

1. ✓ Clonar el repositorio (si están usando Git)
2. ✓ Ejecutar `npm install`
3. ✓ Probar con `npm run dev`
4. ✓ Si todo funciona → ¡A desarrollar!

---

**¿Preguntas?** Revisar los comentarios en el código o hacer un issue en el repositorio.
