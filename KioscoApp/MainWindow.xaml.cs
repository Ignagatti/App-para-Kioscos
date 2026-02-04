using System;
using System.Collections.ObjectModel;
using System.Linq;
using System.Net.Http;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using Microsoft.Data.Sqlite;
using Newtonsoft.Json.Linq;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Globalization;

namespace KioscoApp
{
    public partial class MainWindow : Window
    {
        // Conexión a SQLite (archivo local)
        private string connStrActiva = $"Data Source={Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "KioscoApp", "kiosco.db")}";

        ObservableCollection<Producto> carrito = new ObservableCollection<Producto>();
        List<Producto> inventarioCompleto = new List<Producto>();
        private int sesionIdActiva = 0; 
        private decimal montoAperturaActual = 0;
        private decimal totalVenta = 0;
        private string productoPesoActual = "";
        private decimal precioPorKiloActual = 0;
        private int productoIdActual = 0;
        private bool esperandoPeso = false;
        private decimal stockActualProducto = 0;

        public MainWindow()
        {
            Thread.CurrentThread.CurrentCulture = new CultureInfo("es-AR");
            Thread.CurrentThread.CurrentUICulture = new CultureInfo("es-AR");

            InitializeComponent();
            dgCarrito.ItemsSource = carrito;
            InicializarBaseDatos();
            VerificarEstadoCaja();
            CargarCategorias();

            MainTabs.SelectionChanged += (s, e) => {
                if (MainTabs.SelectedItem is TabItem ti) {
                    string h = ti.Header.ToString()!;
                    if (h.Contains("INVENTARIO")) CargarInventario();
                    else if (h.Contains("CAJA")) CargarCaja();
                    else if (h.Contains("REPORTES")) CargarReportes();
                }
            };
        }

        private void InicializarBaseDatos()
        {
            // Crear la carpeta si no existe
            string? dbDir = Path.GetDirectoryName(connStrActiva.Replace("Data Source=", ""));
            if (dbDir != null && !Directory.Exists(dbDir)) Directory.CreateDirectory(dbDir);

            // Ejecutar el script SQL para crear tablas
            using (SqliteConnection conn = new SqliteConnection(connStrActiva))
            {
                conn.Open();
                string sql = File.ReadAllText("database_sqlite.sql");
                using (SqliteCommand cmd = new SqliteCommand(sql, conn))
                {
                    cmd.ExecuteNonQuery();
                }

                // Agregar columnas nuevas si no existen
                try {
                    // Verificar si la columna es_por_kilo existe
                    SqliteCommand checkCol1 = new SqliteCommand("PRAGMA table_info(productos)", conn);
                    bool hasEsPorKilo = false;
                    using (var reader = checkCol1.ExecuteReader()) {
                        while (reader.Read()) {
                            if (reader.GetString(1) == "es_por_kilo") {
                                hasEsPorKilo = true;
                                break;
                            }
                        }
                    }
                    if (!hasEsPorKilo) {
                        SqliteCommand addCol1 = new SqliteCommand("ALTER TABLE productos ADD COLUMN es_por_kilo INTEGER DEFAULT 0", conn);
                        addCol1.ExecuteNonQuery();
                    }
                } catch (Exception ex) { 
                    MessageBox.Show($"Error agregando columna es_por_kilo: {ex.Message}");
                }

                try {
                    // Verificar si la columna precio_por_kilo existe
                    SqliteCommand checkCol2 = new SqliteCommand("PRAGMA table_info(productos)", conn);
                    bool hasPrecioPorKilo = false;
                    using (var reader = checkCol2.ExecuteReader()) {
                        while (reader.Read()) {
                            if (reader.GetString(1) == "precio_por_kilo") {
                                hasPrecioPorKilo = true;
                                break;
                            }
                        }
                    }
                    if (!hasPrecioPorKilo) {
                        SqliteCommand addCol2 = new SqliteCommand("ALTER TABLE productos ADD COLUMN precio_por_kilo REAL DEFAULT 0", conn);
                        addCol2.ExecuteNonQuery();
                    }
                } catch (Exception ex) { 
                    MessageBox.Show($"Error agregando columna precio_por_kilo: {ex.Message}");
                }
            }
        }

        private SqliteConnection GetConnection() => new SqliteConnection(connStrActiva);

        private void VerificarEstadoCaja() {
            try {
                using (SqliteConnection conn = GetConnection()) {
                    conn.Open();
                    SqliteCommand cmd = new SqliteCommand("SELECT id, monto_inicial FROM sesiones_caja WHERE estado = 'ABIERTA' LIMIT 1", conn);
                    using (var r = cmd.ExecuteReader()) {
                        if (r.Read()) { 
                            sesionIdActiva = r.GetInt32(0); 
                            montoAperturaActual = r.GetDecimal(1); 
                            lblCajaEfectivo.Text = montoAperturaActual.ToString("C");
                            gridApertura.Visibility = Visibility.Collapsed; 
                        } else { gridApertura.Visibility = Visibility.Visible; }
                    }
                }
            } catch { gridApertura.Visibility = Visibility.Visible; }
        }

        private void CargarCategorias() {
            try {
                using (SqliteConnection conn = GetConnection()) {
                    conn.Open();
                    SqliteCommand cmd = new SqliteCommand("SELECT id, nombre FROM categorias ORDER BY nombre", conn);
                    var cats = new List<object>();
                    var seen = new HashSet<string>();
                    using (var r = cmd.ExecuteReader()) {
                        while (r.Read()) {
                            string nombre = r.GetString(1);
                            if (!seen.Contains(nombre)) {
                                seen.Add(nombre);
                                cats.Add(new { Id = r.GetInt32(0), Nombre = nombre });
                            }
                        }
                    }
                    cbCargaCategoria.ItemsSource = cats;
                }
            } catch { }
        }

        private void FinalizarVenta() {
            if (carrito.Count == 0) return;

            // --- PASO 1: VALIDACIÓN DE STOCK ---
            // Agrupamos para saber cuánto necesitamos de cada producto (por si escaneaste 3 Cocas iguales)
            var productosRequeridos = carrito
                .GroupBy(p => p.Id)
                .Select(g => new { Id = g.Key, CantidadRequerida = g.Count() })
                .ToList();

            using (SqliteConnection conn = GetConnection()) {
                conn.Open();

                // Revisamos producto por producto si hay stock suficiente
                foreach (var item in productosRequeridos) {
                    // Ignoramos productos que no estén en BD (Id 0 o manuales sin control)
                    if (item.Id <= 0) continue;

                    SqliteCommand cmdCheck = new SqliteCommand("SELECT nombre, stock FROM productos WHERE id = @id", conn);
                    cmdCheck.Parameters.AddWithValue("@id", item.Id);

                    using (var reader = cmdCheck.ExecuteReader()) {
                        if (reader.Read()) {
                            string nombre = reader.GetString(0);
                            decimal stockActual = reader.GetDecimal(1);

                            // Si lo que tengo es MENOR a lo que quiero vender... ¡ERROR!
                            if (stockActual < item.CantidadRequerida) {
                                MostrarAlerta($"¡No hay suficiente stock de '{nombre}'!\n\nStock actual: {stockActual}\nIntentás vender: {item.CantidadRequerida}\n\nLa venta fue cancelada.");
                                return; // <--- ESTO ES LA CLAVE: Corta la función y no vende nada.
                            }
                        }
                    }
                }
            
                // --- PASO 2: SI LLEGAMOS ACÁ, HAY STOCK. PROCEDEMOS A VENDER ---
                string m = (cbMetodoPago.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "Efectivo";
                
                using (SqliteTransaction t = conn.BeginTransaction()) {
                    try {
                        // 1. Crear la Venta (Cabecera)
                        SqliteCommand cV = new SqliteCommand("INSERT INTO ventas (total, cantidad_items, metodo_pago, sesion_id) VALUES (@t, @c, @m, @sid); SELECT last_insert_rowid();", conn, t);
                        cV.Parameters.AddWithValue("@t", totalVenta); 
                        cV.Parameters.AddWithValue("@c", carrito.Count); 
                        cV.Parameters.AddWithValue("@m", m); 
                        cV.Parameters.AddWithValue("@sid", sesionIdActiva);
                        long idVenta = Convert.ToInt64(cV.ExecuteScalar());

                        // 2. Guardar Detalles y Descontar Stock
                        foreach (var p in carrito) {
                            // Detalle
                            SqliteCommand cD = new SqliteCommand("INSERT INTO venta_detalles (venta_id, nombre, precio, cantidad, subtotal) VALUES (@id, @n, @p, 1, @p)", conn, t);
                            cD.Parameters.AddWithValue("@id", idVenta); 
                            cD.Parameters.AddWithValue("@n", p.Nombre); 
                            cD.Parameters.AddWithValue("@p", p.Precio); 
                            cD.ExecuteNonQuery();

                            // Descuento de Stock
                            if (p.Id > 0) {
                                SqliteCommand cU = new SqliteCommand("UPDATE productos SET stock = stock - 1 WHERE id = @pid", conn, t);
                                cU.Parameters.AddWithValue("@pid", p.Id);
                                cU.ExecuteNonQuery();
                            }
                        }
                        t.Commit(); // Confirmar cambios en BD
                        
                        // 3. Limpieza de interfaz
                        carrito.Clear(); 
                        CalcularTotal(); 
                        gridCobro.Visibility = Visibility.Collapsed; 
                        txtBarcodeVenta.Clear(); 
                        txtBarcodeVenta.Focus();
                        
                        // Actualizar cajita de ventas
                        CargarCaja();
                        
                        // Feedback opcional (podrías usar MostrarAlerta si querés avisar que se vendió)
                        // MessageBox.Show("Venta registrada"); 
                        
                    } catch (Exception ex) { 
                        t.Rollback(); // Si falla algo, deshacemos todo
                        MostrarAlerta("Error al procesar venta: " + ex.Message); 
                    }
                }
            }
        }

        private void CalcularTotal() { 
            totalVenta = carrito.Sum(p => p.Precio); 
            lblTotal.Text = totalVenta.ToString("C2"); 
            lblItemCount.Text = carrito.Count.ToString(); 
        }

        private void BuscarYAgregar(string b) { 
            try { 
                using (SqliteConnection conn = GetConnection()) { 
                    // 1. AGREGAMOS 'stock' a la consulta SQL
                    SqliteCommand cmd = new SqliteCommand("SELECT id, nombre, precio, es_por_kilo, precio_por_kilo, stock FROM productos WHERE codigo_barras = @c", conn); 
                    cmd.Parameters.AddWithValue("@c", b); 
                    conn.Open(); 
                    using (var r = cmd.ExecuteReader()) { 
                        if (r.Read()) {
                            int id = r.GetInt32(0);
                            string nombre = r.GetString(1);
                            decimal precio = r.GetDecimal(2);
                            bool esPorKilo = r.GetBoolean(3);
                            decimal precioPorKilo = r.GetDecimal(4);
                            decimal stock = r.GetDecimal(5); // Leemos el stock de la BD

                            // --- VALIDACIÓN DE STOCK ---
                            // Contamos cuánto ya tenemos en el carrito de este producto
                            decimal cantidadEnCarrito = carrito.Where(p => p.Id == id).Sum(p => esPorKilo ? p.Peso / 1000 : 1);

                            // Si NO es por kilo (es por unidad) y nos pasamos... ALERTA
                            if (!esPorKilo && (cantidadEnCarrito + 1 > stock)) {
                                MostrarAlerta($"¡Stock Insuficiente!\n\nQuedan {stock} unidades de '{nombre}' y ya tenés {cantidadEnCarrito} en el carrito.");
                                return; // <--- FRENAMOS ACÁ
                            }

                            // Si ES por kilo y ya está en 0... ALERTA
                            if (esPorKilo && stock <= 0) {
                                MostrarAlerta($"¡No hay stock de '{nombre}'!");
                                return; // <--- FRENAMOS ACÁ
                            }

                            // Si pasó la validación, seguimos...
                            if (esPorKilo) {
                                productoIdActual = id;
                                productoPesoActual = nombre;
                                precioPorKiloActual = precioPorKilo;
                                stockActualProducto = stock; // Guardamos el stock para validar el peso después

                                lblProductoPeso.Text = $"Producto: {nombre} (Disp: {stock} kg)";
                                txtGramosPeso.Clear();
                                gridPeso.Visibility = Visibility.Visible;
                                txtGramosPeso.Focus();
                                esperandoPeso = true;
                            } else {
                                // Agregamos directo
                                carrito.Add(new Producto { Id = id, Nombre = nombre, Precio = precio, Stock = stock });
                                CalcularTotal();
                            }
                        } else { MessageBox.Show("Producto no registrado."); } 
                    } 
                } 
            } catch (Exception ex) { MessageBox.Show(ex.Message); } 
        }

        private void TxtBarcodeVenta_KeyDown(object sender, KeyEventArgs e) { 
            if (esperandoPeso) return; // No procesar si estamos esperando peso
            if (e.Key == Key.Enter) { 
                if (lstSuggestions.Visibility == Visibility.Visible && lstSuggestions.Items.Count > 0) {
                    // Seleccionar la primera sugerencia (esto dispara SelectionChanged automáticamente)
                    lstSuggestions.SelectedIndex = 0;
                    e.Handled = true;
                } else {
                    string b = txtBarcodeVenta.Text.Trim(); 
                    if (string.IsNullOrEmpty(b) && carrito.Count > 0) { AbrirPanelCobro(); } 
                    else if (!string.IsNullOrEmpty(b)) { BuscarYAgregar(b); txtBarcodeVenta.Clear(); }
                }
            } 
        }

        private void BtnGuardar_Click(object sender, RoutedEventArgs e) {
            try { 
                // Validacion basica: que no este vacio el codigo
                if (string.IsNullOrWhiteSpace(txtCargaBarcode.Text)) {
                    MessageBox.Show("Por favor ingresá un código de barras.");
                    return;
                }

                using (SqliteConnection conn = GetConnection()) { 
                    conn.Open(); 
                    
                    // 1. Verificar si existe
                    SqliteCommand checkCmd = new SqliteCommand("SELECT nombre FROM productos WHERE codigo_barras = @c", conn);
                    checkCmd.Parameters.AddWithValue("@c", txtCargaBarcode.Text);
                    
                    var existingName = checkCmd.ExecuteScalar();

                    if (existingName != null) 
                    {
                        // ACÁ ES EL CAMBIO:
                        // En vez de MessageBox.Show(...), usamos la nueva alerta:
                        MostrarAlerta($"El código '{txtCargaBarcode.Text}' ya pertenece al producto: '{existingName}'.\n\nNo se permite duplicar códigos.");
                        
                        return; // Esto es muy importante para que corte y no guarde
                    }
                    
                    // 2. Si llegamos aca, es porque NO existe. Insertamos el nuevo.
                    SqliteCommand insertCmd = new SqliteCommand("INSERT INTO productos (codigo_barras, nombre, precio, stock, categoria_id, es_por_kilo, precio_por_kilo) VALUES (@c, @n, @p, @s, @cat, @epk, @ppk)", conn);
                    insertCmd.Parameters.AddWithValue("@c", txtCargaBarcode.Text); 
                    insertCmd.Parameters.AddWithValue("@n", txtCargaNombre.Text); 
                    insertCmd.Parameters.AddWithValue("@p", decimal.Parse(txtCargaPrecio.Text)); 
                    insertCmd.Parameters.AddWithValue("@s", decimal.Parse(txtCargaStock.Text)); 
                    insertCmd.Parameters.AddWithValue("@cat", cbCargaCategoria.SelectedValue ?? 1);
                    insertCmd.Parameters.AddWithValue("@epk", cbCargaCategoria.Text.ToLower().Contains("fiambre") ? 1 : 0);
                    insertCmd.Parameters.AddWithValue("@ppk", cbCargaCategoria.Text.ToLower().Contains("fiambre") ? decimal.Parse(txtCargaPrecio.Text) : 0);
                    
                    insertCmd.ExecuteNonQuery();

                    MessageBox.Show("Producto Guardado Exitosamente.");
                    
                    // Limpiar campos
                    txtCargaBarcode.Clear();
                    txtCargaNombre.Clear();
                    txtCargaPrecio.Clear();
                    txtCargaStock.Text = "0";
                    cbCargaCategoria.SelectedIndex = 0;
                    lblCargaStatus.Text = "Listo";
                    lblCargaStatus.Foreground = new SolidColorBrush(Color.FromRgb(102, 102, 102));
                    txtCargaBarcode.Focus();
                    
                    CargarInventario(); 
                } 
            } catch (Exception ex) { MessageBox.Show("Error: " + ex.Message); }
        }

        private void AbrirPanelCobro() { 
            lblTotalCobro.Text = totalVenta.ToString("C2"); 
            txtPagaCon.Clear();
            lblVuelto.Text = "$ 0.00";
            gridCobro.Visibility = Visibility.Visible; 
            txtPagaCon.Focus(); 
        }

        private void TxtPagaCon_TextChanged(object sender, TextChangedEventArgs e) { 
            if (decimal.TryParse(txtPagaCon.Text, out decimal p)) 
                lblVuelto.Text = (p - totalVenta).ToString("C2"); 
        }

        private void BtnAbrirCaja_Click(object sender, RoutedEventArgs e) {
            if (decimal.TryParse(txtMontoInicial.Text, out decimal m)) {
                try {
                    using (SqliteConnection conn = GetConnection()) {
                        conn.Open();
                        SqliteCommand cmd = new SqliteCommand("INSERT INTO sesiones_caja (monto_inicial, estado) VALUES (@m, 'ABIERTA'); SELECT last_insert_rowid();", conn);
                        cmd.Parameters.AddWithValue("@m", m);
                        sesionIdActiva = Convert.ToInt32(cmd.ExecuteScalar());
                        montoAperturaActual = m;
                        lblCajaEfectivo.Text = m.ToString("C");
                        lblCajaTotal.Text = "$ 0";
                        lblCajaOtros.Text = "$ 0";
                    }
                    gridApertura.Visibility = Visibility.Collapsed;
                } catch (Exception ex) { MessageBox.Show(ex.Message); }
            }
        }

        // --- Eventos faltantes para que no de error ---
        private void BtnManualOpen_Click(object sender, RoutedEventArgs e) => gridManual.Visibility = Visibility.Visible;
        private void BtnManualCancel_Click(object sender, RoutedEventArgs e) => gridManual.Visibility = Visibility.Collapsed;
        private void BtnManualConfirm_Click(object sender, RoutedEventArgs e) {
            if (decimal.TryParse(txtManualPrecio.Text, out decimal p)) {
                carrito.Add(new Producto { Nombre = txtManualNombre.Text, Precio = p });
                CalcularTotal();
                gridManual.Visibility = Visibility.Collapsed;
            }
        }
        private void BtnQuitar_Click(object sender, RoutedEventArgs e) { if (dgCarrito.SelectedItem is Producto p) { carrito.Remove(p); CalcularTotal(); } }
        private void BtnConfirmarVenta_Click(object sender, RoutedEventArgs e) => FinalizarVenta();
        private void BtnCancelCobro_Click(object sender, RoutedEventArgs e) => gridCobro.Visibility = Visibility.Collapsed;
        private void TxtPagaCon_KeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Enter) FinalizarVenta(); }
        private void GridCobro_KeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Escape) gridCobro.Visibility = Visibility.Collapsed; }
        private void TxtCargaBarcode_KeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Enter) txtCargaNombre.Focus(); }
        private async void TxtCargaBarcode_LostFocus(object sender, RoutedEventArgs e) {
            string codigo = txtCargaBarcode.Text.Trim();
            if (string.IsNullOrEmpty(codigo)) return;

            try {
                using (HttpClient client = new HttpClient())
                {
                    client.Timeout = TimeSpan.FromSeconds(5);
                    string url = $"https://world.openfoodfacts.org/api/v0/product/{codigo}.json";
                    HttpResponseMessage response = await client.GetAsync(url);
                    
                    if (response.IsSuccessStatusCode)
                    {
                        string json = await response.Content.ReadAsStringAsync();
                        JObject data = JObject.Parse(json);
                        
                        if (data["product"] != null)
                        {
                            string nombre = data["product"]["product_name"]?.ToString() ?? data["product"]["generic_name"]?.ToString() ?? "";
                            if (!string.IsNullOrEmpty(nombre))
                            {
                                txtCargaNombre.Text = nombre;
                                lblCargaStatus.Text = "✓ Producto encontrado";
                                lblCargaStatus.Foreground = new SolidColorBrush(Color.FromRgb(76, 175, 80)); // Verde
                                return;
                            }
                        }
                    }
                    lblCargaStatus.Text = "⚠ Producto no encontrado en BD internacional";
                    lblCargaStatus.Foreground = new SolidColorBrush(Color.FromRgb(255, 152, 0)); // Naranja
                }
            } catch (Exception ex) {
                lblCargaStatus.Text = "❌ Error: " + ex.Message;
                lblCargaStatus.Foreground = new SolidColorBrush(Color.FromRgb(244, 67, 54)); // Rojo
            }
        }
        private void TxtBuscarInventario_TextChanged(object sender, TextChangedEventArgs e) {
            string filtro = txtBuscarInventario.Text.ToLower();
            var filtrado = inventarioCompleto.Where(p => p.Nombre.ToLower().Contains(filtro) || p.CodigoBarras.Contains(filtro)).ToList();
            dgInventario.ItemsSource = filtrado;
        }
        private void DgInventario_KeyDown(object sender, KeyEventArgs e) { }
        private void DataGrid_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e) {
            if (e.ClickCount == 2) {
                var dataGrid = sender as DataGrid;
                if (dataGrid?.SelectedItem is Producto producto) {
                    var result = MessageBox.Show($"¿Está seguro de eliminar el producto '{producto.Nombre}'?", 
                                               "Confirmar eliminación", 
                                               MessageBoxButton.YesNo, 
                                               MessageBoxImage.Warning);
                    if (result == MessageBoxResult.Yes) {
                        try {
                            using (SqliteConnection conn = GetConnection()) {
                                conn.Open();
                                SqliteCommand cmd = new SqliteCommand("DELETE FROM productos WHERE id = @id", conn);
                                cmd.Parameters.AddWithValue("@id", producto.Id);
                                cmd.ExecuteNonQuery();
                                CargarInventario(); // Recargar la lista
                            }
                        } catch (Exception ex) {
                            MessageBox.Show($"Error al eliminar: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                        }
                    }
                }
            }
        }
        private void BtnCerrarCaja_Click(object sender, RoutedEventArgs e) {
            try {
                using (SqliteConnection conn = GetConnection()) {
                    conn.Open();
                    // Calcular totales de ventas
                    SqliteCommand cmdVentas = new SqliteCommand("SELECT SUM(CASE WHEN metodo_pago = 'Efectivo' THEN total ELSE 0 END) as efectivo, SUM(CASE WHEN metodo_pago != 'Efectivo' THEN total ELSE 0 END) as otros FROM ventas WHERE sesion_id = @sid", conn);
                    cmdVentas.Parameters.AddWithValue("@sid", sesionIdActiva);
                    decimal efectivo = 0, otros = 0;
                    using (var r = cmdVentas.ExecuteReader()) {
                        if (r.Read()) {
                            efectivo = r.IsDBNull(0) ? 0 : r.GetDecimal(0);
                            otros = r.IsDBNull(1) ? 0 : r.GetDecimal(1);
                        }
                    }
                    // Cerrar sesión
                    SqliteCommand cmdCerrar = new SqliteCommand("UPDATE sesiones_caja SET estado = 'CERRADA', fecha_cierre = CURRENT_TIMESTAMP, monto_final_efectivo = @ef, monto_final_otros = @ot WHERE id = @id", conn);
                    cmdCerrar.Parameters.AddWithValue("@ef", montoAperturaActual + efectivo);
                    cmdCerrar.Parameters.AddWithValue("@ot", otros);
                    cmdCerrar.Parameters.AddWithValue("@id", sesionIdActiva);
                    cmdCerrar.ExecuteNonQuery();
                }
                sesionIdActiva = 0;
                gridApertura.Visibility = Visibility.Visible;
                lblCajaEfectivo.Text = "$ 0";
                lblCajaTotal.Text = "$ 0";
                dgHistorialVentas.ItemsSource = null;
            } catch (Exception ex) { MessageBox.Show(ex.Message); }
        }
        private void CargarInventario() {
            try {
                using (SqliteConnection conn = GetConnection()) {
                    conn.Open();
                    SqliteCommand cmd = new SqliteCommand("SELECT p.id, p.codigo_barras, p.nombre, COALESCE(c.nombre, 'Sin Categoría') as categoria, p.precio, p.stock, p.es_por_kilo, p.precio_por_kilo, p.categoria_id FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id", conn);
                    using (var r = cmd.ExecuteReader()) {
                        inventarioCompleto.Clear();
                        while (r.Read()) {
                            inventarioCompleto.Add(new Producto {
                                Id = r.GetInt32(0),
                                CodigoBarras = r.GetString(1),
                                Nombre = r.GetString(2),
                                Categoria = r.GetString(3),
                                Precio = r.GetDecimal(4),
                                Stock = r.GetDecimal(5),
                                EsPorKilo = r.GetBoolean(6),
                                PrecioPorKilo = r.GetDecimal(7),
                                CategoriaId = r.GetInt32(8)
                            });
                        }
                    }
                    dgInventario.ItemsSource = inventarioCompleto;
                    dgInventario.Items.Refresh();
                }
            } catch { }
        }
        private void CargarCaja()
        {
            try
            {
                using (SqliteConnection conn = GetConnection())
                {
                    conn.Open();

                    // 1. Calcular totales (Efectivo vs Otros)
                    SqliteCommand cmdVentas = new SqliteCommand(@"
                        SELECT 
                            SUM(CASE WHEN metodo_pago = 'Efectivo' THEN total ELSE 0 END) as efectivo, 
                            SUM(CASE WHEN metodo_pago != 'Efectivo' THEN total ELSE 0 END) as otros 
                        FROM ventas 
                        WHERE sesion_id = @sid", conn);
                    
                    cmdVentas.Parameters.AddWithValue("@sid", sesionIdActiva);
                    
                    decimal efectivo = 0, otros = 0;
                    using (var r = cmdVentas.ExecuteReader())
                    {
                        if (r.Read())
                        {
                            efectivo = r.IsDBNull(0) ? 0 : r.GetDecimal(0);
                            otros = r.IsDBNull(1) ? 0 : r.GetDecimal(1);
                        }
                    }
                    
                    lblCajaEfectivo.Text = (montoAperturaActual + efectivo).ToString("C");
                    lblCajaOtros.Text = otros.ToString("C");
                    lblCajaTotal.Text = (efectivo + otros).ToString("C");

                    // 2. Traer el historial CON DETALLE (Adaptado para SQLite)
                    string sql = @"
                        SELECT 
                            v.id, 
                            v.fecha, 
                            v.metodo_pago, 
                            v.total,
                            GROUP_CONCAT(
                                vd.nombre || ' (' || 
                                CASE 
                                    WHEN vd.cantidad < 1 THEN CAST((vd.cantidad * 1000) AS INT) || ' gr'
                                    ELSE CAST(vd.cantidad AS INT) || ' un.'
                                END || ')', 
                                ', '
                            ) as detalle_completo
                        FROM ventas v
                        LEFT JOIN venta_detalles vd ON v.id = vd.venta_id
                        WHERE v.sesion_id = @sid
                        GROUP BY v.id
                        ORDER BY v.fecha DESC";

                    SqliteCommand cmd = new SqliteCommand(sql, conn);
                    cmd.Parameters.AddWithValue("@sid", sesionIdActiva);

                    var listaVentas = new List<VentaResumen>();
                    
                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read())
                        {
                            listaVentas.Add(new VentaResumen
                            {
                                Id = r.GetInt32(0),
                                Fecha = r.GetDateTime(1),
                                MetodoPago = r.GetString(2),
                                Total = r.GetDecimal(3),
                                DetalleTexto = r.IsDBNull(4) ? "Sin detalle" : r.GetString(4)
                            });
                        }
                    }
                    dgHistorialVentas.ItemsSource = listaVentas;
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Error cargando caja: " + ex.Message);
            }
        }
        private void CargarReportes() {
            try {
                using (SqliteConnection conn = GetConnection()) {
                    conn.Open();
                    SqliteCommand cmd = new SqliteCommand("SELECT id, fecha_apertura, fecha_cierre, monto_final_efectivo, monto_final_otros FROM sesiones_caja WHERE estado = 'CERRADA' ORDER BY fecha_cierre DESC", conn);
                    var cierres = new List<dynamic>();
                    using (var r = cmd.ExecuteReader()) {
                        while (r.Read()) {
                            var efectivo = r.IsDBNull(3) ? 0 : r.GetDecimal(3);
                            var otros = r.IsDBNull(4) ? 0 : r.GetDecimal(4);
                            cierres.Add(new {
                                Id = r.GetInt32(0),
                                FechaCierre = r.GetDateTime(2),
                                MontoFinalEfectivo = efectivo,
                                MontoFinalOtros = otros,
                                TotalDia = efectivo + otros
                            });
                        }
                    }
                    dgHistorialCierres.ItemsSource = cierres;
                    lblRecaudacionTotalHistorica.Text = cierres.Sum(c => (decimal)c.TotalDia).ToString("C");
                }
            } catch { }
        }
        private void LstSuggestions_SelectionChanged(object sender, SelectionChangedEventArgs e) {
            if (lstSuggestions.SelectedItem is Producto p) {
                
                // --- VALIDACIÓN DE STOCK ---
                decimal cantidadEnCarrito = carrito.Where(x => x.Id == p.Id).Sum(x => x.EsPorKilo ? x.Peso / 1000 : 1);

                if (!p.EsPorKilo && (cantidadEnCarrito + 1 > p.Stock)) {
                    MostrarAlerta($"¡Stock Insuficiente!\nStock disponible: {p.Stock}");
                    lstSuggestions.SelectedIndex = -1; 
                    return;
                }

                if (p.EsPorKilo) {
                    if (p.Stock <= 0) {
                        MostrarAlerta($"¡No hay stock de '{p.Nombre}'!");
                        lstSuggestions.SelectedIndex = -1;
                        return;
                    }
                    productoIdActual = p.Id;
                    productoPesoActual = p.Nombre;
                    precioPorKiloActual = p.PrecioPorKilo;
                    stockActualProducto = p.Stock; // Guardamos stock

                    lblProductoPeso.Text = $"Producto: {p.Nombre} (Disp: {p.Stock} kg)";
                    txtGramosPeso.Clear();
                    gridPeso.Visibility = Visibility.Visible;
                    txtGramosPeso.Focus();
                    esperandoPeso = true;
                } else {
                    carrito.Add(p);
                    CalcularTotal();
                    txtBarcodeVenta.Clear();
                    txtBarcodeVenta.Focus();
                }
                lstSuggestions.Visibility = Visibility.Collapsed;
            }
        }
        private void ActualizarSugerencias() {
            string texto = txtBarcodeVenta.Text.Trim();
            if (!string.IsNullOrEmpty(texto) && !long.TryParse(texto, out _)) {
                try {
                    using (SqliteConnection conn = GetConnection()) {
                        conn.Open();
                        // Agregamos 'stock' al SELECT
                        SqliteCommand cmd = new SqliteCommand("SELECT id, nombre, precio, es_por_kilo, precio_por_kilo, stock FROM productos WHERE nombre LIKE @n LIMIT 10", conn);
                        cmd.Parameters.AddWithValue("@n", "%" + texto + "%");
                        var sugerencias = new List<Producto>();
                        using (var r = cmd.ExecuteReader()) {
                            while (r.Read()) {
                                sugerencias.Add(new Producto { 
                                    Id = r.GetInt32(0), 
                                    Nombre = r.GetString(1), 
                                    Precio = r.GetDecimal(2),
                                    EsPorKilo = r.GetBoolean(3),
                                    PrecioPorKilo = r.GetDecimal(4),
                                    Stock = r.GetDecimal(5) // Guardamos el stock
                                });
                            }
                        }
                        lstSuggestions.ItemsSource = sugerencias;
                        lstSuggestions.Visibility = sugerencias.Any() ? Visibility.Visible : Visibility.Collapsed;
                    }
                } catch { }
            } else {
                lstSuggestions.Visibility = Visibility.Collapsed;
            }
        }

        private void TxtBarcodeVenta_TextChanged(object sender, TextChangedEventArgs e) {
            ActualizarSugerencias();
        }
        private void BtnNuevaCategoria_Click(object sender, RoutedEventArgs e) { gridNuevaCategoria.Visibility = Visibility.Visible; }
        private void BtnGuardarNuevaCategoria_Click(object sender, RoutedEventArgs e)
        {
            // 1. Validar que haya escrito algo (usamos el nombre del TextBox del XAML)
            string nombreCategoria = txtNuevaCategoriaNombre.Text.Trim();
            
            if (string.IsNullOrEmpty(nombreCategoria))
            {
                MessageBox.Show("Por favor, escribí un nombre para la categoría.", "Atención", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            try
            {
                using (SqliteConnection conn = GetConnection())
                {
                    conn.Open();

                    // 2. Verificar si ya existe para no duplicar
                    SqliteCommand cmdCheck = new SqliteCommand("SELECT COUNT(*) FROM categorias WHERE nombre = @n", conn);
                    cmdCheck.Parameters.AddWithValue("@n", nombreCategoria);
                    long count = (long)cmdCheck.ExecuteScalar();

                    if (count > 0)
                    {
                        MessageBox.Show("¡Esa categoría ya existe!", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                        return;
                    }

                    // 3. Insertar la nueva categoría
                    SqliteCommand cmdInsert = new SqliteCommand("INSERT INTO categorias (nombre) VALUES (@n)", conn);
                    cmdInsert.Parameters.AddWithValue("@n", nombreCategoria);
                    cmdInsert.ExecuteNonQuery();
                }

                // 4. Feedback y limpieza
                MessageBox.Show($"Categoría '{nombreCategoria}' creada exitosamente.");
                
                txtNuevaCategoriaNombre.Clear(); // Limpiar el campo
                gridNuevaCategoria.Visibility = Visibility.Collapsed; // Ocultar el panel de "Nueva"
                
                // 5. IMPORTANTE: Recargar el ComboBox para ver la nueva categoría
                CargarCategorias(); 
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Error al crear categoría: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        private void BtnCancelarNuevaCategoria_Click(object sender, RoutedEventArgs e) { gridNuevaCategoria.Visibility = Visibility.Collapsed; }

        private void TxtGramosPeso_PreviewTextInput(object sender, TextCompositionEventArgs e)
        {
            if (!char.IsDigit(e.Text, 0) && e.Text != "." && e.Text != ",")
            {
                e.Handled = true;
            }
        }

        private void BtnAceptarPeso_Click(object sender, RoutedEventArgs e)
        {
            if (decimal.TryParse(txtGramosPeso.Text.Replace(",", "."), out decimal gramos) && gramos > 0)
            {
                decimal kilosRequeridos = gramos / 1000;
                
                // Verificamos cuánto peso de este producto ya tenemos en el carrito
                decimal kilosEnCarrito = carrito.Where(x => x.Id == productoIdActual).Sum(x => x.Peso / 1000);
                
                // VALIDACIÓN
                if (kilosEnCarrito + kilosRequeridos > stockActualProducto) {
                    MostrarAlerta($"¡Te pasaste del stock!\n\nDisponible: {stockActualProducto} kg\nYa tenés en carrito: {kilosEnCarrito} kg\nIntentás llevar: {kilosRequeridos} kg");
                    return;
                }

                decimal precioCalculado = kilosRequeridos * precioPorKiloActual;
                carrito.Add(new Producto { 
                    Id = productoIdActual,
                    Nombre = $"{productoPesoActual} ({gramos}g)", 
                    Precio = Math.Round(precioCalculado, 2),
                    Peso = gramos,
                    EsPorKilo = true,
                    PrecioPorKilo = precioPorKiloActual,
                    Stock = stockActualProducto
                });
                CalcularTotal();
                gridPeso.Visibility = Visibility.Collapsed;
                esperandoPeso = false;
                txtBarcodeVenta.Clear();
                txtBarcodeVenta.Focus();
            }
            else
            {
                MessageBox.Show("Ingrese un peso válido en gramos.", "Error", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }

        private void BtnCancelarPeso_Click(object sender, RoutedEventArgs e)
        {
            gridPeso.Visibility = Visibility.Collapsed;
            esperandoPeso = false;
            txtBarcodeVenta.Clear();
            txtBarcodeVenta.Focus();
        }

        private void GridPeso_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
            {
                BtnAceptarPeso_Click(null!, null!);
            }
            else if (e.Key == Key.Escape)
            {
                BtnCancelarPeso_Click(null!, null!);
            }
        }

        private void DgInventario_CellEditEnding(object sender, DataGridCellEditEndingEventArgs e)
        {
            if (e.EditAction == DataGridEditAction.Commit)
            {
                if (e.Row.Item is Producto producto)
                {
                    try
                    {
                        using (SqliteConnection conn = GetConnection())
                        {
                            conn.Open();
                            SqliteCommand cmd = new SqliteCommand("UPDATE productos SET nombre = @n, precio = @p, stock = @s, es_por_kilo = @epk, precio_por_kilo = @ppk WHERE id = @id", conn);
                            cmd.Parameters.AddWithValue("@id", producto.Id);
                            cmd.Parameters.AddWithValue("@n", producto.Nombre);
                            cmd.Parameters.AddWithValue("@p", producto.Precio);
                            cmd.Parameters.AddWithValue("@s", producto.Stock);
                            cmd.Parameters.AddWithValue("@epk", producto.EsPorKilo);
                            cmd.Parameters.AddWithValue("@ppk", producto.PrecioPorKilo);
                            cmd.ExecuteNonQuery();
                        }
                        // Recargar inventario para reflejar cambios en sugerencias
                        CargarInventario();
                        // Actualizar sugerencias si hay texto en búsqueda
                        if (!string.IsNullOrEmpty(txtBarcodeVenta.Text.Trim()))
                        {
                            ActualizarSugerencias();
                        }
                        // Actualizar precios en el carrito si el producto editado está ahí
                        foreach (var item in carrito)
                        {
                            if (item.Id == producto.Id)
                            {
                                if (item.EsPorKilo && item.Peso > 0)
                                {
                                    // Recalcular precio basado en nuevo precio por kilo
                                    item.PrecioPorKilo = producto.PrecioPorKilo;
                                    item.Precio = Math.Round((producto.PrecioPorKilo * item.Peso) / 1000, 2);
                                }
                                else
                                {
                                    item.Precio = producto.Precio;
                                    item.PrecioPorKilo = producto.PrecioPorKilo;
                                }
                            }
                        }
                        CalcularTotal();
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show($"Error al guardar cambios: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                    }
                }
            }
        }

        // 1. Este es el botón de la tabla (SOLO PREGUNTA)
        private void BtnEliminarProducto_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is int id)
            {
                idProductoABorrar = id; // Guardamos el ID para después

                // Buscamos el nombre para mostrarlo en el cartel
                var prod = inventarioCompleto.FirstOrDefault(p => p.Id == id);
                string nombre = prod != null ? prod.Nombre : "este producto";

                lblMensajeEliminar.Text = $"Se eliminará '{nombre}' permanentemente.\nEsta acción no se puede deshacer.";
                
                gridConfirmDelete.Visibility = Visibility.Visible; // Mostramos el cartel
            }
        }

        // 2. Este es el botón "SÍ, BORRAR" del cartel (EJECUTA EL BORRADO)
        private void BtnConfirmarEliminar_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                using (SqliteConnection conn = GetConnection())
                {
                    conn.Open();
                    SqliteCommand cmd = new SqliteCommand("DELETE FROM productos WHERE id = @id", conn);
                    cmd.Parameters.AddWithValue("@id", idProductoABorrar);
                    cmd.ExecuteNonQuery();
                }
                
                // Cerramos cartel y recargamos
                gridConfirmDelete.Visibility = Visibility.Collapsed;
                CargarInventario();
                
                // Si justo tenías ese producto buscado en la caja, limpiamos las sugerencias
                ActualizarSugerencias(); 
            }
            catch (Exception ex)
            {
                MostrarAlerta("Error al eliminar: " + ex.Message);
            }
        }

        // 3. Este es el botón "CANCELAR"
        private void BtnCancelarEliminar_Click(object sender, RoutedEventArgs e)
        {
            gridConfirmDelete.Visibility = Visibility.Collapsed; // Solo cierra y no hace nada
        }
        // Función para mostrar el cartel lindo
        private void MostrarAlerta(string mensaje)
        {
            txtAlertMessage.Text = mensaje;
            gridCustomAlert.Visibility = Visibility.Visible;
        }

        // Función para cerrar el cartel
        private void BtnCerrarAlerta_Click(object sender, RoutedEventArgs e)
        {
            gridCustomAlert.Visibility = Visibility.Collapsed;
        }
        // Variable temporal para saber a qué producto le estamos sumando
        private int idProductoAEditar = 0;  
        private int idProductoABorrar = 0; // <--- Variable nueva
        private bool esModoResta = false;
        // --- BLOQUE DE GESTIÓN DE STOCK (SUMAR Y RESTAR) ---

        private void BtnSumarStock_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is int id)
            {
                idProductoAEditar = id;
                esModoResta = false;

                var prod = inventarioCompleto.FirstOrDefault(p => p.Id == id);
                lblNombreProductoStock.Text = prod != null ? $"{prod.Nombre}" : "Producto desconocido";
                
                // --- TEXTOS PARA SUMAR ---
                lblTituloStock.Text = "📦 Ingreso de Mercadería";
                lblTextoCantidad.Text = "Cantidad a sumar:";
                
                txtCantidadStock.Clear();
                gridStockInput.Visibility = Visibility.Visible;
                txtCantidadStock.Focus();
            }
        }

        private void BtnRestarStock_Click(object sender, RoutedEventArgs e)
        {
            if (sender is Button btn && btn.Tag is int id)
            {
                idProductoAEditar = id;
                esModoResta = true;

                var prod = inventarioCompleto.FirstOrDefault(p => p.Id == id);
                lblNombreProductoStock.Text = prod != null ? $"{prod.Nombre}" : "Producto desconocido";
                
                // --- TEXTOS PARA RESTAR ---
                lblTituloStock.Text = "📉 Ajuste de Stock (Resta)";
                lblTextoCantidad.Text = "Cantidad a quitar:";
                
                txtCantidadStock.Clear();
                gridStockInput.Visibility = Visibility.Visible;
                txtCantidadStock.Focus();
            }
        }

        private void BtnConfirmarStock_Click(object sender, RoutedEventArgs e)
        {
            if (decimal.TryParse(txtCantidadStock.Text.Replace(",", "."), out decimal cantidad) && cantidad > 0)
            {
                try
                {
                    using (SqliteConnection conn = GetConnection())
                    {
                        conn.Open();
                        
                        // Si es resta, convertimos el número a negativo
                        decimal cantidadFinal = esModoResta ? (cantidad * -1) : cantidad;

                        // Validacion extra: No dejar stock negativo si restamos
                        if (esModoResta) {
                            // Consultamos stock actual para ver si alcanza
                            SqliteCommand cmdCheck = new SqliteCommand("SELECT stock FROM productos WHERE id = @id", conn);
                            cmdCheck.Parameters.AddWithValue("@id", idProductoAEditar);
                            decimal stockActual = Convert.ToDecimal(cmdCheck.ExecuteScalar());
                            
                            if (stockActual + cantidadFinal < 0) {
                                MostrarAlerta($"No podés restar {cantidad} unidades. Solo tenés {stockActual} en stock.");
                                return;
                            }
                        }

                        // La magia: Sumamos el número (que puede ser negativo)
                        SqliteCommand cmd = new SqliteCommand("UPDATE productos SET stock = stock + @cant WHERE id = @id", conn);
                        cmd.Parameters.AddWithValue("@cant", cantidadFinal);
                        cmd.Parameters.AddWithValue("@id", idProductoAEditar);
                        cmd.ExecuteNonQuery();
                    }

                    CargarInventario();
                    gridStockInput.Visibility = Visibility.Collapsed;
                    
                    // Opcional: Mostrar confirmación
                    // string operacion = esModoResta ? "descontadas" : "agregadas";
                    // MostrarAlerta($"Se han {operacion} {cantidad} unidades correctamente.");
                }
                catch (Exception ex)
                {
                    MostrarAlerta("Error al actualizar: " + ex.Message);
                }
            }
            else
            {
                MostrarAlerta("Por favor ingresá una cantidad válida (mayor a 0).");
            }
        }

        private void BtnCancelarStock_Click(object sender, RoutedEventArgs e)
        {
            gridStockInput.Visibility = Visibility.Collapsed;
        }

        private void TxtCantidadStock_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter) BtnConfirmarStock_Click(null!, null!);
            if (e.Key == Key.Escape) gridStockInput.Visibility = Visibility.Collapsed;
        }
    }

    public class Producto {
        public int Id { get; set; }
        public string CodigoBarras { get; set; } = "";
        public string Nombre { get; set; } = "";
        public decimal Precio { get; set; }
        public decimal Stock { get; set; }
        public string Categoria { get; set; } = "";
        public bool EsPorKilo { get; set; } = false;
        public decimal PrecioPorKilo { get; set; } = 0;
        public int CategoriaId { get; set; }
        public decimal Peso { get; set; } = 0; // Para productos por kilo en carrito

        public decimal PrecioEfectivo
        {
            get => EsPorKilo ? PrecioPorKilo : Precio;
            set
            {
                if (EsPorKilo)
                    PrecioPorKilo = value;
                else
                    Precio = value;
            }
        }
    }
    public class VentaResumen
{
    public int Id { get; set; }
    public DateTime Fecha { get; set; }
    public string MetodoPago { get; set; } = "";
    public decimal Total { get; set; }
    public string DetalleTexto { get; set; } = "";
}
    
}
    