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
using System.Windows.Documents; // Necesario para imprimir en WPF

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
            CargarClientes();
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

                // Agregar columna 'es_por_kilo' a productos si no existe
                try {
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

                // Tabla Clientes
                string sqlClientes = @"
                    CREATE TABLE IF NOT EXISTS Clientes (
                        Id INTEGER PRIMARY KEY AUTOINCREMENT,
                        Nombre TEXT NOT NULL,
                        Saldo DECIMAL DEFAULT 0,
                        Telefono TEXT
                    );";
                    
                using (SqliteCommand cmd = new SqliteCommand(sqlClientes, conn))
                {
                    cmd.ExecuteNonQuery();
                }

                // Tabla Movimientos
                string sqlMovimientos = @"
                    CREATE TABLE IF NOT EXISTS Movimientos_Caja (
                        Id INTEGER PRIMARY KEY AUTOINCREMENT,
                        Fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
                        Tipo TEXT NOT NULL,
                        Categoria TEXT NOT NULL,
                        Monto DECIMAL NOT NULL,
                        Descripcion TEXT,
                        SesionId INTEGER
                    );";
                
                using (SqliteCommand cmd = new SqliteCommand(sqlMovimientos, conn))
                {
                    cmd.ExecuteNonQuery();
                }

                // Agregar columna 'precio_por_kilo' a productos si no existe
                try {
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

                // --- NUEVO: Agregar columna 'cliente_id' a ventas si no existe (PARA EL FIADO) ---
                try {
                    SqliteCommand checkCol3 = new SqliteCommand("PRAGMA table_info(ventas)", conn);
                    bool hasClienteId = false;
                    using (var reader = checkCol3.ExecuteReader()) {
                        while (reader.Read()) {
                            if (reader.GetString(1) == "cliente_id") {
                                hasClienteId = true;
                                break;
                            }
                        }
                    }
                    if (!hasClienteId) {
                        // Agregamos la columna cliente_id permitiendo nulos (NULL)
                        SqliteCommand addCol3 = new SqliteCommand("ALTER TABLE ventas ADD COLUMN cliente_id INTEGER DEFAULT NULL", conn);
                        addCol3.ExecuteNonQuery();
                    }
                } catch (Exception ex) { 
                    MessageBox.Show($"Error agregando columna cliente_id: {ex.Message}");
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

        private void CbMetodoPago_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            // --- CORRECCIÓN: Evitar error al iniciar la ventana ---
            if (panelCliente == null || panelPagoEfectivo == null || cbSelectorCliente == null || txtPagaCon == null) 
                return; 
            // -----------------------------------------------------

            // Obtenemos el texto de lo que se seleccionó
            string metodo = "";
            var item = cbMetodoPago.SelectedItem;
            
            if (item is ComboBoxItem cbi) metodo = cbi.Content?.ToString() ?? "";
            else if (item is TextBlock tb) metodo = tb.Text;
            else if (item != null) metodo = item.ToString() ?? "";

            // Lógica de visualización
            if (metodo == "Fiado")
            {
                panelCliente.Visibility = Visibility.Visible;      // Mostrar Cliente
                panelPagoEfectivo.Visibility = Visibility.Collapsed; // Ocultar Paga Con
                
                // Enfocar el combo de clientes automáticamente
                cbSelectorCliente.Focus();
            }
            else
            {
                panelCliente.Visibility = Visibility.Collapsed;    // Ocultar Cliente
                panelPagoEfectivo.Visibility = Visibility.Visible;   // Mostrar Paga Con
                
                // Si es efectivo, enfocamos el campo de pago
                if (gridCobro.Visibility == Visibility.Visible) 
                    txtPagaCon.Focus();
            }
        }

        // 1. Activa el modo "Crear Cliente" (Oculta el combo, muestra el textbox)
        private void BtnModoCrearCliente_Click(object sender, RoutedEventArgs e)
        {
            gridSeleccionCliente.Visibility = Visibility.Collapsed;
            gridCrearClienteRapido.Visibility = Visibility.Visible;
            txtNuevoClienteRapido.Clear();
            txtNuevoClienteRapido.Focus();
        }

        // 2. Cancela y vuelve al combo
        private void BtnCancelarClienteRapido_Click(object sender, RoutedEventArgs e)
        {
            gridCrearClienteRapido.Visibility = Visibility.Collapsed;
            gridSeleccionCliente.Visibility = Visibility.Visible;
        }

        // 3. Guarda el cliente, recarga la lista y lo deja seleccionado
        private void BtnGuardarClienteRapido_Click(object sender, RoutedEventArgs e)
        {
            string nombre = txtNuevoClienteRapido.Text.Trim();
            if (string.IsNullOrEmpty(nombre)) return;

            try
            {
                long nuevoId = 0;
                using (SqliteConnection conn = GetConnection())
                {
                    conn.Open();
                    // Insertamos y recuperamos el ID generado al mismo tiempo
                    SqliteCommand cmd = new SqliteCommand("INSERT INTO Clientes (Nombre, Saldo) VALUES (@n, 0); SELECT last_insert_rowid();", conn);
                    cmd.Parameters.AddWithValue("@n", nombre);
                    nuevoId = (long)cmd.ExecuteScalar();
                }

                // --- Recargar el Combo ---
                // Copiamos la lógica de CargarClientes pero solo para este combo
                using (SqliteConnection conn = GetConnection())
                {
                    conn.Open();
                    SqliteCommand cmd = new SqliteCommand("SELECT Id, Nombre FROM Clientes ORDER BY Nombre", conn);
                    var clientesCobro = new List<Cliente>();
                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read())
                        {
                            clientesCobro.Add(new Cliente { Id = r.GetInt32(0), Nombre = r.GetString(1) });
                        }
                    }
                    cbSelectorCliente.ItemsSource = clientesCobro;
                }

                // --- Volver a la vista normal ---
                gridCrearClienteRapido.Visibility = Visibility.Collapsed;
                gridSeleccionCliente.Visibility = Visibility.Visible;

                // --- Seleccionar automáticamente al nuevo ---
                cbSelectorCliente.SelectedValue = (int)nuevoId;
                
                // Actualizar también la tabla principal de clientes por si está visible de fondo
                CargarClientes();
            }
            catch (Exception ex)
            {
                MessageBox.Show("Error al crear cliente: " + ex.Message);
            }
        }

        private void FinalizarVenta() {
            if (carrito.Count == 0) return;

            // --- CORRECCIÓN CLAVE: LECTURA SEGURA DEL MÉTODO DE PAGO ---
            string metodoPago = "Efectivo"; 
            var itemSeleccionado = cbMetodoPago.SelectedItem;

            if (itemSeleccionado is ComboBoxItem cbi)
                metodoPago = cbi.Content?.ToString() ?? "Efectivo";
            else if (itemSeleccionado is TextBlock tb)
                metodoPago = tb.Text;
            else if (itemSeleccionado != null)
                metodoPago = itemSeleccionado.ToString() ?? "Efectivo";
            // -----------------------------------------------------------

            int? clienteIdSeleccionado = null;

            // --- LÓGICA ESPECIAL PARA FIADO ---
            if (metodoPago == "Fiado")
            {
                // Validar que haya seleccionado un cliente
                if (cbSelectorCliente.SelectedItem is Cliente cliente)
                {
                    clienteIdSeleccionado = cliente.Id;
                    // Para fiado, no validamos el "Paga Con" porque no entra plata ahora
                }
                else
                {
                    MostrarErrorPago("⚠️ Para fiar, tenés que seleccionar un CLIENTE de la lista.");
                    return;
                }
            }
            else 
            {
                // Lógica normal de pago (Efectivo/Transferencia)
                if (!decimal.TryParse(txtPagaCon.Text, out decimal montoPago) || montoPago <= 0)
                {
                    MostrarErrorPago("⚠️ Ingresá un monto válido para el pago.");
                    return;
                }
                if (montoPago < totalVenta)
                {
                    decimal falta = totalVenta - montoPago;
                    MostrarErrorPago($"❌ Falta: ${falta:F2}");
                    return;
                }
            }
            
            borderErrorPago.Visibility = Visibility.Collapsed;

            // --- PASO 1: VALIDACIÓN DE STOCK ---
            var productosRequeridos = carrito
                .GroupBy(p => p.Id)
                .Select(g => new { Id = g.Key, CantidadRequerida = g.Sum(p => p.EsPorKilo ? p.Peso / 1000m : 1m) })
                .ToList();

            using (SqliteConnection conn = GetConnection()) {
                conn.Open();

                // Validar Stock
                foreach (var item in productosRequeridos) {
                    if (item.Id <= 0) continue;
                    SqliteCommand cmdCheck = new SqliteCommand("SELECT nombre, stock FROM productos WHERE id = @id", conn);
                    cmdCheck.Parameters.AddWithValue("@id", item.Id);
                    using (var reader = cmdCheck.ExecuteReader()) {
                        if (reader.Read()) {
                            if (reader.GetDecimal(1) < item.CantidadRequerida) {
                                MostrarAlerta($"¡No hay suficiente stock de '{reader.GetString(0)}'!");
                                return;
                            }
                        }
                    }
                }
            
                // --- PASO 2: PROCESAR VENTA ---
                long idVenta = 0;
                using (SqliteTransaction t = conn.BeginTransaction()) {
                    bool committed = false;
                    try {
                        // A. Insertar Venta (Ahora con cliente_id)
                        SqliteCommand cV = new SqliteCommand("INSERT INTO ventas (total, cantidad_items, metodo_pago, sesion_id, cliente_id) VALUES (@t, @c, @m, @sid, @cid); SELECT last_insert_rowid();", conn, t);
                        cV.Parameters.AddWithValue("@t", totalVenta);
                        cV.Parameters.AddWithValue("@c", carrito.Count);
                        cV.Parameters.AddWithValue("@m", metodoPago);
                        cV.Parameters.AddWithValue("@sid", sesionIdActiva);
                        cV.Parameters.AddWithValue("@cid", clienteIdSeleccionado.HasValue ? (object)clienteIdSeleccionado.Value : DBNull.Value);
                        idVenta = Convert.ToInt64(cV.ExecuteScalar());

                        // B. Guardar Detalles y Descontar Stock
                        foreach (var p in carrito) {
                            decimal cantidadDetalle = p.EsPorKilo ? (p.Peso / 1000m) : 1m;
                            decimal precioUnitario = p.EsPorKilo ? p.PrecioPorKilo : p.Precio;

                            SqliteCommand cD = new SqliteCommand("INSERT INTO venta_detalles (venta_id, nombre, precio, cantidad, subtotal) VALUES (@id, @n, @precio, @cantidad, @subtotal)", conn, t);
                            cD.Parameters.AddWithValue("@id", idVenta);
                            cD.Parameters.AddWithValue("@n", p.Nombre);
                            cD.Parameters.AddWithValue("@precio", precioUnitario);
                            cD.Parameters.AddWithValue("@cantidad", cantidadDetalle);
                            cD.Parameters.AddWithValue("@subtotal", p.Subtotal);
                            cD.ExecuteNonQuery();

                            if (p.Id > 0) {
                                SqliteCommand cU = new SqliteCommand("UPDATE productos SET stock = stock - @q WHERE id = @pid", conn, t);
                                cU.Parameters.AddWithValue("@q", cantidadDetalle);
                                cU.Parameters.AddWithValue("@pid", p.Id);
                                cU.ExecuteNonQuery();
                            }
                        }

                        // C. SI ES FIADO -> AUMENTAR DEUDA DEL CLIENTE
                        if (metodoPago == "Fiado" && clienteIdSeleccionado.HasValue)
                        {
                            SqliteCommand cDeuda = new SqliteCommand("UPDATE Clientes SET Saldo = Saldo + @total WHERE Id = @id", conn, t);
                            cDeuda.Parameters.AddWithValue("@total", totalVenta);
                            cDeuda.Parameters.AddWithValue("@id", clienteIdSeleccionado.Value);
                            cDeuda.ExecuteNonQuery();
                        }

                        t.Commit();
                        committed = true;

                    } catch (Exception ex) {
                        if (!committed) try { t.Rollback(); } catch {}
                        MostrarAlerta("Error al procesar venta: " + ex.Message);
                        return;
                    }
                }

                // Imprimir ticket
                if (chkImprimirTicket.IsChecked == true) {
                    decimal pagoReal = metodoPago == "Fiado" ? 0 : (decimal.TryParse(txtPagaCon.Text, out decimal p) ? p : totalVenta);
                    try { ImprimirTicket(idVenta, totalVenta, pagoReal, pagoReal - totalVenta); } catch {}
                }

                // Limpieza UI
                carrito.Clear();
                CalcularTotal();
                gridCobro.Visibility = Visibility.Collapsed;
                txtBarcodeVenta.Clear();
                txtBarcodeVenta.Focus();
                CargarCaja(); // Actualiza la caja visualmente
                CargarClientes(); // Actualiza la tabla de clientes si está visible
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
            borderErrorPago.Visibility = Visibility.Collapsed;

            // Cargar clientes (Igual que antes)
            try {
                using (SqliteConnection conn = GetConnection()) {
                    conn.Open();
                    SqliteCommand cmd = new SqliteCommand("SELECT Id, Nombre FROM Clientes ORDER BY Nombre", conn);
                    var clientesCobro = new List<Cliente>();
                    using (var r = cmd.ExecuteReader()) {
                        while (r.Read()) {
                            clientesCobro.Add(new Cliente { Id = r.GetInt32(0), Nombre = r.GetString(1) });
                        }
                    }
                    cbSelectorCliente.ItemsSource = clientesCobro;
                }
            } catch {}

            // Resetear selección
            cbSelectorCliente.SelectedIndex = -1;
            
            // IMPORTANTE: Esto dispara el evento SelectionChanged que escribimos arriba
            // y acomoda la visual (Oculta cliente, muestra efectivo)
            cbMetodoPago.SelectedIndex = 0; 

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
        private void BtnCancelCobro_Click(object sender, RoutedEventArgs e) { 
            gridCobro.Visibility = Visibility.Collapsed;
            borderErrorPago.Visibility = Visibility.Collapsed;
        }
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
                            var product = data["product"] as JObject;
                            string nombre = product?["product_name"]?.ToString() ?? product?["generic_name"]?.ToString() ?? "";
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

                    // 1. Calcular totales monetarios
                    SqliteCommand cmdTotales = new SqliteCommand(@"
                        SELECT 
                            SUM(CASE WHEN metodo_pago = 'Efectivo' THEN total ELSE 0 END) as efectivo, 
                            SUM(CASE WHEN metodo_pago != 'Efectivo' THEN total ELSE 0 END) as otros 
                        FROM ventas 
                        WHERE sesion_id = @sid", conn);
                    
                    cmdTotales.Parameters.AddWithValue("@sid", sesionIdActiva);
                    
                    decimal efectivo = 0, otros = 0;
                    using (var r = cmdTotales.ExecuteReader())
                    {
                        if (r.Read())
                        {
                            efectivo = r.IsDBNull(0) ? 0 : r.GetDecimal(0);
                            otros = r.IsDBNull(1) ? 0 : r.GetDecimal(1);
                        }
                    }
                    
                    lblCajaEfectivo.Text = (montoAperturaActual + efectivo).ToString("C");
                    lblCajaOtros.Text = otros.ToString("C");
                    lblCajaTotal.Text = (montoAperturaActual + efectivo + otros).ToString("C");

                    // 2. Traer items individuales de la BD
                    string sql = @"
                        SELECT 
                            v.id, 
                            v.fecha, 
                            v.metodo_pago, 
                            v.total,
                            vd.nombre,
                            vd.cantidad
                        FROM ventas v
                        LEFT JOIN venta_detalles vd ON v.id = vd.venta_id
                        WHERE v.sesion_id = @sid
                        ORDER BY v.fecha DESC";

                    SqliteCommand cmd = new SqliteCommand(sql, conn);
                    cmd.Parameters.AddWithValue("@sid", sesionIdActiva);

                    var datosCrudos = new List<dynamic>();

                    using (var r = cmd.ExecuteReader())
                    {
                        while (r.Read())
                        {
                            datosCrudos.Add(new {
                                Id = r.GetInt32(0),
                                Fecha = r.GetDateTime(1),
                                MetodoPago = r.GetString(2),
                                Total = r.GetDecimal(3),
                                NombreProducto = r.IsDBNull(4) ? "Venta General" : r.GetString(4),
                                Cantidad = r.IsDBNull(5) ? 0m : r.GetDecimal(5)
                            });
                        }
                    }

                    // 3. Agrupar en memoria para generar el texto bonito (x2, gr, etc)
                    var listaVentas = datosCrudos
                        .GroupBy(x => x.Id)
                        .Select(grupoVenta => {
                            var ventaInfo = grupoVenta.First();
                            
                            // Agrupamos los productos POR NOMBRE dentro de la misma venta
                            var detalles = grupoVenta
                                .GroupBy(d => (string)d.NombreProducto) 
                                .Select(prodGroup => {
                                    string nombre = prodGroup.Key;
                                    decimal cantTotal = prodGroup.Sum(x => (decimal)x.Cantidad);

                                    if (nombre == "Pago de fiados") return nombre;

                                    // Si es decimal o menor a 1, asumimos que es PESO (KG)
                                    if (cantTotal % 1 != 0 || (cantTotal < 1 && cantTotal > 0)) 
                                    {
                                        int gramos = (int)(cantTotal * 1000);
                                        string textoGramos = $"{gramos} gr";
                                        if (!nombre.Contains(textoGramos) && !nombre.Contains($"{gramos}g"))
                                        {
                                            return $"{nombre} ({textoGramos})";
                                        }
                                        return nombre;
                                    }
                                    // Si es entero mayor a 1, es CANTIDAD (x2, x3...)
                                    else if (cantTotal > 1) 
                                    {
                                        return $"{nombre} (x{(int)cantTotal})";
                                    }
                                    
                                    // Si es 1 unidad simple
                                    return nombre; 
                                });

                            return new VentaResumen
                            {
                                Id = ventaInfo.Id,
                                Fecha = ventaInfo.Fecha,
                                MetodoPago = ventaInfo.MetodoPago,
                                Total = ventaInfo.Total,
                                DetalleTexto = string.Join(", ", detalles)
                            };
                        }).ToList();

                    dgHistorialVentas.ItemsSource = listaVentas;
                    CargarMovimientos();
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
                    var countObj = cmdCheck.ExecuteScalar();
                    long count = countObj != null ? Convert.ToInt64(countObj) : 0L;

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
                    Nombre = productoPesoActual,
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

        // Función para mostrar errores de pago dentro del modal de cobro
        private void MostrarErrorPago(string mensaje)
        {
            lblErrorPago.Text = mensaje;
            borderErrorPago.Visibility = Visibility.Visible;
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

        // 1. Cargar Clientes al iniciar o al cambiar de pestaña
        private void CargarClientes()
        {
            try
            {
                List<Cliente> lista = new List<Cliente>();
                using (SqliteConnection conn = GetConnection())
                {
                    conn.Open();
                    SqliteCommand cmd = new SqliteCommand("SELECT Id, Nombre, Saldo FROM Clientes ORDER BY Nombre", conn);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            lista.Add(new Cliente
                            {
                                Id = reader.GetInt32(0),
                                Nombre = reader.GetString(1),
                                Saldo = reader.GetDecimal(2)
                            });
                        }
                    }
                }
                dgClientes.ItemsSource = lista;
            }
            catch (Exception ex)
            {
                MostrarAlerta($"❌ Error al cargar clientes:\n\n{ex.Message}");
            }
        }

        // 2. Crear un Cliente Nuevo
        private void BtnCrearCliente_Click(object sender, RoutedEventArgs e)
        {
            if (string.IsNullOrWhiteSpace(txtNombreCliente.Text)) { MostrarAlerta("⚠️ Poné un nombre del cliente."); return; }

            try
            {
                using (SqliteConnection conn = GetConnection())
                {
                    conn.Open();
                    SqliteCommand cmd = new SqliteCommand("INSERT INTO Clientes (Nombre, Saldo) VALUES (@nombre, 0)", conn);
                    cmd.Parameters.AddWithValue("@nombre", txtNombreCliente.Text);
                    cmd.ExecuteNonQuery();
                }
                
                string nombreNuevo = txtNombreCliente.Text;
                txtNombreCliente.Clear();
                CargarClientes(); // Recargar la lista
                MostrarAlerta($"✅ Cliente '{nombreNuevo}' creado exitosamente.");
            }
            catch (Exception ex)
            {
                MostrarAlerta($"❌ Error al crear cliente:\n\n{ex.Message}");
            }
        }

        // 3. Cuando seleccionás a alguien en la tabla
        private void DgClientes_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (dgClientes.SelectedItem is Cliente cliente)
            {
                panelDeuda.Visibility = Visibility.Visible;
                lblInfoSeleccion.Visibility = Visibility.Collapsed;
                lblClienteSeleccionado.Text = $"👤 {cliente.Nombre}";
                txtMontoFiado.Focus();
            }
            else
            {
                panelDeuda.Visibility = Visibility.Collapsed;
                lblInfoSeleccion.Visibility = Visibility.Visible;
            }
        }

        // 4. Botón FIAR (Aumentar Deuda)
        private void BtnFiar_Click(object sender, RoutedEventArgs e) => ModificarSaldo(1);

        // 5. Botón PAGAR (Disminuir Deuda)
        private void BtnPagarDeuda_Click(object sender, RoutedEventArgs e)
        {
            if (dgClientes.SelectedItem is Cliente cliente && decimal.TryParse(txtMontoFiado.Text, out decimal monto))
            {
                // Validación: no puede pagar más de lo que debe
                if (monto > cliente.Saldo)
                {
                    MostrarAlerta($"⚠️ No puedés pagar más de lo que debe.\n\nDeuda actual: ${cliente.Saldo:F2}\nIntentás pagar: ${monto:F2}");
                    return;
                }

                try
                {
                    string metodoPago = (cbMetodoPagoCobro.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "Efectivo";
                    
                    using (SqliteConnection conn = GetConnection())
                    {
                        conn.Open();
                        
                        // 1. Actualizar saldo del cliente
                        SqliteCommand cmdActualizar = new SqliteCommand("UPDATE Clientes SET Saldo = Saldo - @monto WHERE Id = @id", conn);
                        cmdActualizar.Parameters.AddWithValue("@monto", monto);
                        cmdActualizar.Parameters.AddWithValue("@id", cliente.Id);
                        cmdActualizar.ExecuteNonQuery();

                        // 2. Registrar el pago como una venta especial en la tabla ventas
                        // (Para que se contabilice en caja - efectivo o "otros").
                        // Además guardamos un detalle para que en el historial se vea
                        // "Pago de fiados" en lugar de "Sin detalle".
                        SqliteCommand cmdVenta = new SqliteCommand("INSERT INTO ventas (total, cantidad_items, metodo_pago, sesion_id) VALUES (@total, 1, @metodo, @sesion); SELECT last_insert_rowid();", conn);
                        cmdVenta.Parameters.AddWithValue("@total", monto);
                        cmdVenta.Parameters.AddWithValue("@metodo", metodoPago);
                        cmdVenta.Parameters.AddWithValue("@sesion", sesionIdActiva);
                        long idVenta = Convert.ToInt64(cmdVenta.ExecuteScalar());

                        // Insertar detalle para que aparezca en el historial
                        SqliteCommand cmdDetalle = new SqliteCommand("INSERT INTO venta_detalles (venta_id, nombre, precio, cantidad, subtotal) VALUES (@id, @n, @precio, @cantidad, @subtotal)", conn);
                        cmdDetalle.Parameters.AddWithValue("@id", idVenta);
                        cmdDetalle.Parameters.AddWithValue("@n", "Pago de fiados");
                        cmdDetalle.Parameters.AddWithValue("@precio", monto);
                        cmdDetalle.Parameters.AddWithValue("@cantidad", 1);
                        cmdDetalle.Parameters.AddWithValue("@subtotal", monto);
                        cmdDetalle.ExecuteNonQuery();

                        // Nota: no modificamos aquí `montoAperturaActual` porque
                        // el pago ya se registra en la tabla `ventas` y
                        // `CargarCaja()` suma los `ventas` para calcular la caja.
                        // Evitamos duplicar el monto en efectivo.
                    }

                    txtMontoFiado.Clear();
                    CargarClientes();
                    CargarCaja();  // Refrescar la caja para ver ambos valores actualizados
                    
                    MostrarAlerta($"✅ ${monto:F2} pagado.\n\nDeuda actualizada.\nRegistrado en caja como {metodoPago}.");
                }
                catch (Exception ex)
                {
                    MostrarAlerta($"❌ Error al procesar el pago:\n\n{ex.Message}");
                }
            }
            else
            {
                MostrarAlerta("⚠️ Seleccioná un cliente e ingresá un monto válido.");
            }
        }

        // Lógica compartida para sumar o restar plata
        private void ModificarSaldo(int factor)
        {
            if (dgClientes.SelectedItem is Cliente cliente && decimal.TryParse(txtMontoFiado.Text, out decimal monto))
            {
                // Validación: al pagar, no puede quedar negativo
                if (factor == -1) // Si es un pago (factor -1)
                {
                    decimal nuevoSaldo = cliente.Saldo - monto;
                    if (nuevoSaldo < 0)
                    {
                        MostrarAlerta($"⚠️ No puedés pagar más de lo que debe.\n\nDeuda actual: ${cliente.Saldo:F2}\nIntentás pagar: ${monto:F2}\n\nPodés pagar máximo: ${cliente.Saldo:F2}");
                        return;
                    }
                }

                try
                {
                    using (SqliteConnection conn = GetConnection())
                    {
                        conn.Open();
                        SqliteCommand cmd = new SqliteCommand("UPDATE Clientes SET Saldo = Saldo + @monto WHERE Id = @id", conn);
                        // Si factor es 1 suma, si es -1 resta
                        cmd.Parameters.AddWithValue("@monto", monto * factor);
                        cmd.Parameters.AddWithValue("@id", cliente.Id);
                        cmd.ExecuteNonQuery();
                    }
                    txtMontoFiado.Clear();
                    CargarClientes(); // Actualizar tabla para ver el nuevo saldo
                    string accion = factor == 1 ? "fiado" : "pagado";
                    MostrarAlerta($"✅ ${monto:F2} {accion}.\n\nDeuda actualizada.");
                }
                catch (Exception ex)
                {
                    MostrarAlerta($"❌ Error al modificar saldo:\n\n{ex.Message}");
                }
            }
            else
            {
                MostrarAlerta("⚠️ Seleccioná un cliente e ingresá un monto válido.");
            }
        }

        private void ImprimirTicket(long nroVenta, decimal total, decimal pago, decimal vuelto)
        {
            try
            {
                PrintDialog printDialog = new PrintDialog();
                
                // Si querés que imprima directo en la predeterminada sin preguntar, comentá la línea 'if' y dejá lo de adentro.
                // if (printDialog.ShowDialog() == true) 
                {
                    // 1. Configuramos el documento (Ancho típico de ticket térmica: 80mm ~ 300px)
                    FlowDocument doc = new FlowDocument();
                    doc.PagePadding = new Thickness(10);
                    doc.ColumnWidth = 300; 
                    doc.FontFamily = new FontFamily("Consolas"); // Fuente monoespaciada tipo ticket
                    doc.FontSize = 10;

                    // 2. Encabezado
                    Paragraph header = new Paragraph(new Run("KIOSCO 'TU NOMBRE'\nEsperanza, Santa Fe\n--------------------------------")) 
                    { TextAlignment = TextAlignment.Center };
                    doc.Blocks.Add(header);

                    // 3. Datos de la Venta
                    Paragraph details = new Paragraph();
                    details.Inlines.Add(new Run($"Fecha: {DateTime.Now:dd/MM/yyyy HH:mm}\n"));
                    details.Inlines.Add(new Run($"Venta Nro: {nroVenta}\n"));
                    doc.Blocks.Add(details);

                    // 4. Lista de Productos (centrada como en un ticket)
                    doc.Blocks.Add(new Paragraph(new Run("--------------------------------")) { TextAlignment = TextAlignment.Center });

                    foreach (var p in carrito)
                    {
                        string nombreCorto = p.Nombre.Length > 20 ? p.Nombre.Substring(0, 20) : p.Nombre;
                        string linea = $"{p.CantidadTexto}  {nombreCorto}  {p.Subtotal:0.00}";
                        var pLine = new Paragraph(new Run(linea)) { TextAlignment = TextAlignment.Center };
                        doc.Blocks.Add(pLine);
                    }

                    doc.Blocks.Add(new Paragraph(new Run("--------------------------------")) { TextAlignment = TextAlignment.Center });

                    // 5. Totales (centrados)
                    var totals = new Paragraph();
                    totals.Inlines.Add(new Run($"TOTAL: $ {total:0.00}\n") { FontWeight = FontWeights.Bold, FontSize = 14 });
                    totals.Inlines.Add(new Run($"Su Pago: $ {pago:0.00}\n"));
                    totals.Inlines.Add(new Run($"Vuelto: $ {vuelto:0.00}"));
                    totals.TextAlignment = TextAlignment.Center;
                    doc.Blocks.Add(totals);

                    // 6. Pie de página
                    Paragraph footer = new Paragraph(new Run("\n¡Gracias por su compra!\n")) 
                    { TextAlignment = TextAlignment.Center, FontSize = 9 };
                    doc.Blocks.Add(footer);

                    // 7. Mandar a Imprimir
                    // IDocumentPaginatorSource es la interfaz que permite imprimir el FlowDocument
                    printDialog.PrintDocument(((IDocumentPaginatorSource)doc).DocumentPaginator, "Ticket Venta " + nroVenta);
                }
            }
            catch (Exception ex)
            {
                MostrarAlerta("No se pudo imprimir el ticket.\n" + ex.Message);
            }
        }

        private string tipoMovimientoActual = "ENTRADA"; // Para saber si es entrada o salida

        private void CargarMovimientos()
        {
            try
            {
                List<MovimientoCaja> movimientos = new List<MovimientoCaja>();
                using (SqliteConnection conn = GetConnection())
                {
                    conn.Open();
                    SqliteCommand cmd = new SqliteCommand(
                        "SELECT Id, Fecha, Tipo, Categoria, Monto, Descripcion, SesionId FROM Movimientos_Caja WHERE SesionId = @sesion ORDER BY Fecha DESC",
                        conn);
                    cmd.Parameters.AddWithValue("@sesion", sesionIdActiva);
                    
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            movimientos.Add(new MovimientoCaja
                            {
                                Id = reader.GetInt32(0),
                                Fecha = reader.GetDateTime(1),
                                Tipo = reader.GetString(2),
                                Categoria = reader.GetString(3),
                                Monto = reader.GetDecimal(4),
                                Descripcion = reader.IsDBNull(5) ? "" : reader.GetString(5),
                                SesionId = reader.GetInt32(6)
                            });
                        }
                    }
                }
                dgMovimientos.ItemsSource = movimientos;
            }
            catch (Exception ex)
            {
                MostrarAlerta($"❌ Error al cargar movimientos:\n\n{ex.Message}");
            }
        }

        private void BtnRegistrarEntrada_Click(object sender, RoutedEventArgs e)
        {
            tipoMovimientoActual = "ENTRADA";
            lblTituloMovimiento.Text = "💵 REGISTRAR ENTRADA";
            cbCategoriaMov.Items.Clear();
            cbCategoriaMov.Items.Add(new ComboBoxItem { Content = "Cambio Banco" });
            cbCategoriaMov.Items.Add(new ComboBoxItem { Content = "Aporte de Capital" });
            cbCategoriaMov.Items.Add(new ComboBoxItem { Content = "Otro" });
            cbCategoriaMov.SelectedIndex = 0;
            
            txtMontoMov.Clear();
            txtDescripcionMov.Clear();
            gridMovimiento.Visibility = Visibility.Visible;
            txtMontoMov.Focus();
        }

        private void BtnRegistrarSalida_Click(object sender, RoutedEventArgs e)
        {
            tipoMovimientoActual = "SALIDA";
            lblTituloMovimiento.Text = "💸 REGISTRAR SALIDA";
            cbCategoriaMov.Items.Clear();
            cbCategoriaMov.Items.Add(new ComboBoxItem { Content = "Pago a Proveedor" });
            cbCategoriaMov.Items.Add(new ComboBoxItem { Content = "Extracción Personal" });
            cbCategoriaMov.Items.Add(new ComboBoxItem { Content = "Compra Artículos" });
            cbCategoriaMov.Items.Add(new ComboBoxItem { Content = "Otro" });
            cbCategoriaMov.SelectedIndex = 0;
            
            txtMontoMov.Clear();
            txtDescripcionMov.Clear();
            gridMovimiento.Visibility = Visibility.Visible;
            txtMontoMov.Focus();
        }

        private void BtnGuardarMovimiento_Click(object sender, RoutedEventArgs e)
        {
            if (!decimal.TryParse(txtMontoMov.Text, out decimal monto) || monto <= 0)
            {
                MostrarAlerta("⚠️ Ingresá un monto válido (mayor a 0).");
                return;
            }

            string categoria = (cbCategoriaMov.SelectedItem as ComboBoxItem)?.Content.ToString() ?? "Otro";

            try
            {
                using (SqliteConnection conn = GetConnection())
                {
                    conn.Open();
                    SqliteCommand cmd = new SqliteCommand(
                        "INSERT INTO Movimientos_Caja (Fecha, Tipo, Categoria, Monto, Descripcion, SesionId) VALUES (@fecha, @tipo, @categoria, @monto, @desc, @sesion)",
                        conn);
                    cmd.Parameters.AddWithValue("@fecha", DateTime.Now);
                    cmd.Parameters.AddWithValue("@tipo", tipoMovimientoActual);
                    cmd.Parameters.AddWithValue("@categoria", categoria);
                    cmd.Parameters.AddWithValue("@monto", monto);
                    cmd.Parameters.AddWithValue("@desc", txtDescripcionMov.Text);
                    cmd.Parameters.AddWithValue("@sesion", sesionIdActiva);
                    
                    cmd.ExecuteNonQuery();
                }

                // Actualizar la caja según el tipo de movimiento
                if (tipoMovimientoActual == "SALIDA")
                {
                    montoAperturaActual -= monto;
                    lblCajaEfectivo.Text = montoAperturaActual.ToString("C");
                }

                gridMovimiento.Visibility = Visibility.Collapsed;
                CargarMovimientos();
                MostrarAlerta($"✅ {tipoMovimientoActual.ToLower()} de ${monto:F2} registrada correctamente.");
            }
            catch (Exception ex)
            {
                MostrarAlerta($"❌ Error al registrar movimiento:\n\n{ex.Message}");
            }
        }

        private void BtnCancelarMovimiento_Click(object sender, RoutedEventArgs e)
        {
            gridMovimiento.Visibility = Visibility.Collapsed;
        }
    }

    public class Producto {
        public int Id { get; set; }
        public string CodigoBarras { get; set; } = "";
        public string Nombre { get; set; } = "";

        private decimal _precio;
        public decimal Precio { get => _precio; set => _precio = value < 0m ? 0m : value; }

        private decimal _stock;
        public decimal Stock { get => _stock; set => _stock = value < 0m ? 0m : value; }

        public string Categoria { get; set; } = "";
        public bool EsPorKilo { get; set; } = false;

        private decimal _precioPorKilo;
        public decimal PrecioPorKilo { get => _precioPorKilo; set => _precioPorKilo = value < 0m ? 0m : value; }

        public int CategoriaId { get; set; }

        private decimal _peso;
        // Peso en gramos
        public decimal Peso { get => _peso; set => _peso = value < 0m ? 0m : value; } // Para productos por kilo en carrito

        // Cantidad para cálculos: si es por kilo devuelve kilos, si es unidad devuelve 1
        public decimal Cantidad => EsPorKilo ? (Peso / 1000m) : 1m;

        // Subtotal: precio por unidad o precio por kilo * kilos
        public decimal Subtotal => EsPorKilo ? (PrecioPorKilo * (Peso / 1000m)) : Precio;

        // Texto formateado para mostrar cantidad en UI e impresión (ej: "250 g", "0.25 kg", "x1 un.")
        public string CantidadTexto
        {
            get
            {
                if (EsPorKilo)
                {
                    if (Peso < 1000m) return $"{(int)Peso} g"; // mostrar gramos como entero
                    return $"{(Peso / 1000m):0.###} kg"; // mostrar kilos con hasta 3 decimales
                }
                return $"x{(int)Cantidad} un."; // unidades
            }
        }

        // Texto para mostrar precio: "$ 123,00" o "$ 123,00 / kg"
        public string PrecioTexto => EsPorKilo ? $"{PrecioPorKilo.ToString("C2")} / kg" : Precio.ToString("C2");

        public decimal PrecioEfectivo
        {
            get => EsPorKilo ? PrecioPorKilo : Precio;
            set
            {
                if (EsPorKilo)
                    PrecioPorKilo = value < 0m ? 0m : value;
                else
                    Precio = value < 0m ? 0m : value;
            }
        }

        // Validación simple para asegurar consistencia (se puede llamar después de asignar desde UI o DB)
        public void Validate()
        {
            if (Precio < 0m) Precio = 0m;
            if (PrecioPorKilo < 0m) PrecioPorKilo = 0m;
            if (Stock < 0m) Stock = 0m;
            if (Peso < 0m) Peso = 0m;
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

    public class Cliente
    {
        public int Id { get; set; }
        public string Nombre { get; set; }= "";
        public decimal Saldo { get; set; } // Lo que te debe
        public string Telefono { get; set; }= "";
    }

    public class MovimientoCaja
    {
        public int Id { get; set; }
        public DateTime Fecha { get; set; }
        public string Tipo { get; set; } = ""; // ENTRADA o SALIDA
        public string Categoria { get; set; } = ""; // Proveedor, Extracción Personal, etc.
        public decimal Monto { get; set; }
        public string Descripcion { get; set; } = "";
        public int SesionId { get; set; }

        public string FechaTexto => Fecha.ToString("HH:mm");
        public string TipoColor => Tipo == "ENTRADA" ? "#4CAF50" : "#F44336";
        public string MontoTexto => $"{(Tipo == "ENTRADA" ? "+" : "-")}$ {Monto:F2}";
    }

}
    
    