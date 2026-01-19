using System;
using System.Collections.ObjectModel;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using MySqlConnector;
using Newtonsoft.Json.Linq;
using System.Data;
using System.Collections.Generic;

namespace KioscoApp
{
    public partial class MainWindow : Window
    {
        private string[] posiblesConnStrs = {
            "Server=127.0.0.1;Database=KioscoDB;Uid=root;Pwd=Emanuel;Port=3306;AllowUserVariables=True",
            "Server=127.0.0.1;Database=KioscoDB;Uid=root;Pwd=Gtacinco135;Port=3306;AllowUserVariables=True"  
        };

        ObservableCollection<Producto> carrito = new ObservableCollection<Producto>();
        List<Producto> inventarioCompleto = new List<Producto>();
        private string connStrActiva = "";
        decimal totalVenta = 0;

        public MainWindow()
        {
            InitializeComponent();
            dgCarrito.ItemsSource = carrito;
            EstablecerConexionValida();
            CargarCategoriasComboBox();

            MainTabs.SelectionChanged += (s, e) =>
            {
                if (MainTabs.SelectedItem is TabItem ti && ti.Header != null)
                {
                    string tabHeader = ti.Header.ToString()!;
                    if (tabHeader.Contains("INVENTARIO")) CargarInventario();
                    else if (tabHeader.Contains("CAJA")) CargarCaja();
                }
            };

            Loaded += (s, e) => { txtBarcodeVenta.Focus(); };
        }

        private void EstablecerConexionValida()
        {
            foreach (string cadena in posiblesConnStrs)
            {
                try
                {
                    using (MySqlConnection conn = new MySqlConnection(cadena))
                    {
                        conn.Open();
                        connStrActiva = cadena;
                        return; 
                    }
                }
                catch { continue; }
            }
            if (string.IsNullOrEmpty(connStrActiva))
                MessageBox.Show("❌ Error: No se pudo conectar a la base de datos MySQL.");
        }

        private MySqlConnection GetConnection() => new MySqlConnection(connStrActiva);

        // --- LÓGICA DE CAJA ---
        private void CargarCaja()
        {
            try
            {
                ObservableCollection<VentaResumen> ventas = new ObservableCollection<VentaResumen>();
                decimal totalEfectivo = 0;
                decimal totalOtros = 0;

                using (MySqlConnection conn = GetConnection())
                {
                    conn.Open();
                    string sql = @"SELECT v.fecha, v.metodo_pago, v.cantidad_items, v.total, 
                                   GROUP_CONCAT(CONCAT(vd.nombre, ' (x', vd.cantidad, ')') SEPARATOR ', ') as detalle
                                   FROM ventas v
                                   LEFT JOIN venta_detalles vd ON v.id = vd.venta_id
                                   GROUP BY v.id
                                   ORDER BY v.fecha DESC";

                    MySqlCommand cmd = new MySqlCommand(sql, conn);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var v = new VentaResumen {
                                Fecha = Convert.ToDateTime(reader["fecha"]),
                                MetodoPago = reader["metodo_pago"].ToString() ?? "Efectivo",
                                CantidadItems = Convert.ToInt32(reader["cantidad_items"]),
                                Total = Convert.ToDecimal(reader["total"]),
                                DetalleTexto = reader["detalle"]?.ToString() ?? "Sin detalle"
                            };
                            ventas.Add(v);
                            if (v.MetodoPago == "Efectivo") totalEfectivo += v.Total;
                            else totalOtros += v.Total;
                        }
                    }
                }

                if (FindName("dgHistorialVentas") is DataGrid dg) dg.ItemsSource = ventas;
                if (FindName("lblCajaEfectivo") is TextBlock lblE) lblE.Text = totalEfectivo.ToString("C", CultureInfo.CreateSpecificCulture("es-AR"));
                if (FindName("lblCajaOtros") is TextBlock lblO) lblO.Text = totalOtros.ToString("C", CultureInfo.CreateSpecificCulture("es-AR"));
                if (FindName("lblCajaTotal") is TextBlock lblT) lblT.Text = (totalEfectivo + totalOtros).ToString("C", CultureInfo.CreateSpecificCulture("es-AR"));
            }
            catch (Exception ex) { MessageBox.Show("Error al cargar caja: " + ex.Message); }
        }

        private void CargarCategoriasComboBox()
        {
            try
            {
                List<Categoria> listaCategorias = new List<Categoria>();
                using (MySqlConnection conn = GetConnection())
                {
                    conn.Open();
                    MySqlCommand cmd = new MySqlCommand("SELECT id, nombre FROM categorias", conn);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            listaCategorias.Add(new Categoria { 
                                Id = Convert.ToInt32(reader["id"]), 
                                Nombre = reader["nombre"].ToString() 
                            });
                        }
                    }
                }
                cbCargaCategoria.ItemsSource = listaCategorias;
                cbCargaCategoria.SelectedIndex = 0; 
            }
            catch { }
        }

        private void CargarInventario()
        {
            try
            {
                inventarioCompleto.Clear(); 
                ObservableCollection<Producto> listaInventario = new ObservableCollection<Producto>();
                using (MySqlConnection conn = GetConnection())
                {
                    conn.Open();
                    string sql = @"SELECT p.id, p.codigo_barras, p.nombre, p.precio, p.stock, c.nombre as categoria_nombre 
                                   FROM productos p LEFT JOIN categorias c ON p.categoria_id = c.id";
                    MySqlCommand cmd = new MySqlCommand(sql, conn);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            var nuevoProducto = new Producto {
                                Id = Convert.ToInt32(reader["id"]),
                                CodigoBarras = reader["codigo_barras"]?.ToString() ?? "",
                                Nombre = reader["nombre"]?.ToString() ?? "",
                                Precio = Convert.ToDecimal(reader["precio"]),
                                Stock = Convert.ToInt32(reader["stock"]), 
                                Categoria = reader["categoria_nombre"]?.ToString() ?? "General"
                            };
                            listaInventario.Add(nuevoProducto);
                            inventarioCompleto.Add(nuevoProducto);
                        }
                    }
                }
                dgInventario.ItemsSource = listaInventario;
            } 
            catch (Exception ex) { MessageBox.Show("Error al cargar inventario: " + ex.Message); }
        }

        private void CalcularTotal()
        {
            totalVenta = carrito.Sum(p => p.Precio);
            lblTotal.Text = totalVenta.ToString("C", CultureInfo.CreateSpecificCulture("es-AR"));
            lblItemCount.Text = carrito.Count.ToString();
        }

        // --- LÓGICA DE AGREGAR AL CARRITO (CON CONTROL DE STOCK) ---
        private void AgregarAlCarrito(string nombre, decimal precio, int stockDisponible)
        {
            // 1. Buscamos si ya está en el carrito
            var productoExistente = carrito.FirstOrDefault(p => p.Nombre == nombre);
            
            // 2. Calculamos cuántos quedarían en total si agregamos uno más
            int cantidadEnCarrito = (productoExistente != null) ? productoExistente.Cantidad : 0;
            
            // 3. VALIDACIÓN DE STOCK: Si queremos vender más de lo que hay, ERROR.
            if (cantidadEnCarrito + 1 > stockDisponible)
            {
                MessageBox.Show($"⚠️ Stock insuficiente.\nSolo tenés {stockDisponible} unidades de {nombre}.", "Error de Stock", MessageBoxButton.OK, MessageBoxImage.Warning);
                return; // Cortamos la función, no se agrega nada.
            }

            // 4. Si hay stock, procedemos
            if (productoExistente != null)
            {
                productoExistente.Cantidad++;
                productoExistente.Precio = productoExistente.PrecioUnitario * productoExistente.Cantidad;
                dgCarrito.Items.Refresh();
            }
            else
            {
                carrito.Add(new Producto { 
                    Nombre = nombre, 
                    Precio = precio, 
                    PrecioUnitario = precio, 
                    Cantidad = 1,
                    Stock = stockDisponible // Guardamos el dato por las dudas
                });
            }
            CalcularTotal();
        }

        private void BuscarYAgregar(string barcode)
        {
            try {
                using (MySqlConnection conn = GetConnection()) {
                    // MODIFICADO: Ahora también traemos el STOCK de la base de datos
                    MySqlCommand cmd = new MySqlCommand("SELECT nombre, precio, stock FROM productos WHERE codigo_barras = @c", conn);
                    cmd.Parameters.AddWithValue("@c", barcode);
                    conn.Open();
                    using (var reader = cmd.ExecuteReader()) {
                        if (reader.Read()) {
                            string nom = reader["nombre"]?.ToString() ?? "Producto";
                            decimal pre = Convert.ToDecimal(reader["precio"]);
                            int stk = Convert.ToInt32(reader["stock"]); // Leemos el stock real
                            
                            AgregarAlCarrito(nom, pre, stk); // Pasamos el stock a la función
                        } else {
                            MessageBox.Show("Producto no encontrado.");
                        }
                    }
                }
            } catch (Exception ex) { MessageBox.Show(ex.Message); }
        }

        private void TxtBarcodeVenta_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter) {
                e.Handled = true;
                if (lstSuggestions.Visibility == Visibility.Visible && lstSuggestions.Items.Count > 0) {
                    lstSuggestions.SelectedIndex = 0;
                    if (lstSuggestions.SelectedItem is Producto p) {
                        AgregarAlCarrito(p.Nombre, p.Precio, p.Stock); // Pasamos el stock de la sugerencia
                        txtBarcodeVenta.Clear();
                        lstSuggestions.Visibility = Visibility.Collapsed;
                        return;
                    }
                }
                string barcode = txtBarcodeVenta.Text.Trim();
                if (string.IsNullOrEmpty(barcode)) { if (carrito.Count > 0) AbrirPanelCobro(); }
                else { BuscarYAgregar(barcode); txtBarcodeVenta.Clear(); }
            }
        }

        private void TxtBarcodeVenta_TextChanged(object sender, TextChangedEventArgs e)
        {
            string query = txtBarcodeVenta.Text.Trim();
            if (string.IsNullOrEmpty(query)) { lstSuggestions.Visibility = Visibility.Collapsed; return; }
            try {
                using (MySqlConnection conn = GetConnection()) {
                    // MODIFICADO: Traemos STOCK también
                    string sql = "SELECT nombre, precio, stock FROM productos WHERE nombre LIKE @q OR codigo_barras LIKE @q LIMIT 10";
                    MySqlCommand cmd = new MySqlCommand(sql, conn);
                    cmd.Parameters.AddWithValue("@q", "%" + query + "%");
                    conn.Open();
                    var suggestions = new ObservableCollection<Producto>();
                    using (var reader = cmd.ExecuteReader()) {
                        while (reader.Read()) {
                            suggestions.Add(new Producto { 
                                Nombre = reader["nombre"]?.ToString() ?? "", 
                                Precio = Convert.ToDecimal(reader["precio"]),
                                Stock = Convert.ToInt32(reader["stock"]) // Guardamos stock en la sugerencia
                            });
                        }
                    }
                    lstSuggestions.ItemsSource = suggestions;
                    lstSuggestions.Visibility = suggestions.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
                }
            } catch { }
        }

        private void LstSuggestions_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (lstSuggestions.SelectedItem is Producto p) {
                AgregarAlCarrito(p.Nombre, p.Precio, p.Stock); // Pasamos el stock
                txtBarcodeVenta.Clear();
                lstSuggestions.Visibility = Visibility.Collapsed;
                txtBarcodeVenta.Focus();
            }
        }

        private void BtnQuitar_Click(object sender, RoutedEventArgs e)
        {
            if (dgCarrito.SelectedItem is Producto p) { carrito.Remove(p); CalcularTotal(); }
        }

        private void AbrirPanelCobro()
        {
            lblTotalCobro.Text = totalVenta.ToString("C", CultureInfo.CreateSpecificCulture("es-AR"));
            gridCobro.Visibility = Visibility.Visible;
            txtPagaCon.Focus();
        }

        private void FinalizarVenta()
        {
            string metodo = (cbMetodoPago.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "Efectivo";

            // --- 1. VALIDACIÓN DE DINERO (NUEVO) ---
            // Si paga en efectivo, verificamos que alcance la plata
            if (metodo == "Efectivo")
            {
                if (!decimal.TryParse(txtPagaCon.Text, out decimal paga) || paga < totalVenta)
                {
                    MessageBox.Show("🛑 El pago es insuficiente. Faltan $" + (totalVenta - paga), "Error de Pago", MessageBoxButton.OK, MessageBoxImage.Error);
                    return; // Cortamos acá, no se registra nada en la base de datos
                }
            }

            using (MySqlConnection conn = GetConnection()) {
                conn.Open();
                using (MySqlTransaction trans = conn.BeginTransaction()) {
                    try {
                        MySqlCommand cmdVenta = new MySqlCommand("INSERT INTO ventas (total, cantidad_items, metodo_pago) VALUES (@t, @c, @m)", conn, trans);
                        cmdVenta.Parameters.AddWithValue("@t", totalVenta);
                        cmdVenta.Parameters.AddWithValue("@c", carrito.Count);
                        cmdVenta.Parameters.AddWithValue("@m", metodo);
                        cmdVenta.ExecuteNonQuery();
                        long ventaId = cmdVenta.LastInsertedId;

                        foreach (var p in carrito) {
                            MySqlCommand cmdDet = new MySqlCommand("INSERT INTO venta_detalles (venta_id, nombre, precio, cantidad, subtotal) VALUES (@id, @n, @pu, @cant, @sub)", conn, trans);
                            cmdDet.Parameters.AddWithValue("@id", ventaId);
                            cmdDet.Parameters.AddWithValue("@n", p.Nombre);
                            cmdDet.Parameters.AddWithValue("@pu", p.PrecioUnitario); 
                            cmdDet.Parameters.AddWithValue("@cant", p.Cantidad);     
                            cmdDet.Parameters.AddWithValue("@sub", p.Precio);        
                            cmdDet.ExecuteNonQuery();

                            MySqlCommand cmdStock = new MySqlCommand("UPDATE productos SET stock = stock - @cant WHERE nombre = @n", conn, trans);
                            cmdStock.Parameters.AddWithValue("@n", p.Nombre);
                            cmdStock.Parameters.AddWithValue("@cant", p.Cantidad);
                            cmdStock.ExecuteNonQuery();
                        }
                        trans.Commit();
                        MessageBox.Show("✅ Venta completada exitosamente.");
                        carrito.Clear(); CalcularTotal();
                        gridCobro.Visibility = Visibility.Collapsed;
                    } catch (Exception ex) { trans.Rollback(); MessageBox.Show("Error: " + ex.Message); }
                }
            }
        }

        private void TxtPagaCon_TextChanged(object sender, TextChangedEventArgs e) {
            if (decimal.TryParse(txtPagaCon.Text, out decimal paga))
            {
                decimal vuelto = paga - totalVenta;
                if (vuelto < 0) vuelto = 0; // No mostramos vuelto negativo
                lblVuelto.Text = vuelto.ToString("C", CultureInfo.CreateSpecificCulture("es-AR"));
            }
        }

        private void TxtPagaCon_KeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Enter) FinalizarVenta(); }
        private void BtnConfirmarVenta_Click(object sender, RoutedEventArgs e) => FinalizarVenta();
        private void BtnCancelCobro_Click(object sender, RoutedEventArgs e) => gridCobro.Visibility = Visibility.Collapsed;
        private void GridCobro_KeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Escape) gridCobro.Visibility = Visibility.Collapsed; }
        private void CbMetodoPago_SelectionChanged(object sender, SelectionChangedEventArgs e) { }

        private async void TxtCargaBarcode_LostFocus(object sender, RoutedEventArgs e)
        {
            string barcode = txtCargaBarcode.Text.Trim();
            if (string.IsNullOrEmpty(barcode)) return;
            try {
                using (HttpClient client = new HttpClient()) {
                    string url = $"https://world.openfoodfacts.org/api/v0/product/{barcode}.json";
                    string response = await client.GetStringAsync(url);
                    var json = JObject.Parse(response);
                    if (json["status"]?.ToString() == "1") txtCargaNombre.Text = json["product"]?["product_name"]?.ToString() ?? "";
                }
            } catch { }
        }

        private void BtnGuardar_Click(object sender, RoutedEventArgs e)
        {
            try 
            {
                if (!decimal.TryParse(txtCargaPrecio.Text, out decimal precioValue)) 
                {
                    MessageBox.Show("El precio debe ser un número."); return;
                }
                decimal.TryParse(txtCargaStock.Text, out decimal stockValue);
                int catId = (int)(cbCargaCategoria.SelectedValue ?? 1);

                using (MySqlConnection conn = GetConnection()) 
                {
                    conn.Open();
                    string sql = @"INSERT INTO productos (codigo_barras, nombre, precio, stock, categoria_id) 
                                   VALUES (@c, @n, @p, @s, @cat) 
                                   ON DUPLICATE KEY UPDATE nombre=@n, precio=@p, stock=stock+@s, categoria_id=@cat";
                    
                    MySqlCommand cmd = new MySqlCommand(sql, conn);
                    cmd.Parameters.AddWithValue("@c", txtCargaBarcode.Text.Trim());
                    cmd.Parameters.AddWithValue("@n", txtCargaNombre.Text.Trim());
                    cmd.Parameters.AddWithValue("@p", precioValue);
                    cmd.Parameters.AddWithValue("@s", stockValue);
                    cmd.Parameters.AddWithValue("@cat", catId);
                    
                    cmd.ExecuteNonQuery();
                    MessageBox.Show("Producto guardado correctamente.");
                    txtCargaBarcode.Clear(); txtCargaNombre.Clear(); txtCargaPrecio.Clear();
                    txtCargaStock.Text = "0"; txtCargaBarcode.Focus();
                }
            } 
            catch (Exception ex) { MessageBox.Show("Error: " + ex.Message); }
        }

        private void TxtCargaBarcode_KeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Enter) txtCargaNombre.Focus(); }
        
        // --- BOTONES MANUALES ---
        private void BtnManualOpen_Click(object sender, RoutedEventArgs e) => gridManual.Visibility = Visibility.Visible;
        private void BtnManualCancel_Click(object sender, RoutedEventArgs e) => gridManual.Visibility = Visibility.Collapsed;
        private void BtnManualConfirm_Click(object sender, RoutedEventArgs e) {
            // Producto manual se asume con stock infinito (9999) porque no está en inventario
            if (decimal.TryParse(txtManualPrecio.Text, out decimal p)) { AgregarAlCarrito(txtManualNombre.Text, p, 9999); gridManual.Visibility = Visibility.Collapsed; }
        }

        // --- CATEGORÍAS ---
        private void BtnNuevaCategoria_Click(object sender, RoutedEventArgs e) {
            gridSeleccionCategoria.Visibility = Visibility.Collapsed;
            gridNuevaCategoria.Visibility = Visibility.Visible;
            txtNuevaCategoriaNombre.Focus();
        }
        private void BtnCancelarNuevaCategoria_Click(object sender, RoutedEventArgs e) {
            gridNuevaCategoria.Visibility = Visibility.Collapsed;
            gridSeleccionCategoria.Visibility = Visibility.Visible;
            txtNuevaCategoriaNombre.Clear();
        }
        private void BtnGuardarNuevaCategoria_Click(object sender, RoutedEventArgs e) {
            string nombreCat = txtNuevaCategoriaNombre.Text.Trim();
            if (string.IsNullOrEmpty(nombreCat)) return;
            try {
                using (MySqlConnection conn = GetConnection()) {
                    conn.Open();
                    MySqlCommand cmdCheck = new MySqlCommand("SELECT COUNT(*) FROM categorias WHERE nombre = @n", conn);
                    cmdCheck.Parameters.AddWithValue("@n", nombreCat);
                    int count = Convert.ToInt32(cmdCheck.ExecuteScalar());
                    if (count > 0) { MessageBox.Show("Esa categoría ya existe."); return; }
                    MySqlCommand cmd = new MySqlCommand("INSERT INTO categorias (nombre) VALUES (@n)", conn);
                    cmd.Parameters.AddWithValue("@n", nombreCat);
                    cmd.ExecuteNonQuery();
                }
                CargarCategoriasComboBox();
                foreach (Categoria cat in cbCargaCategoria.Items) {
                    if (cat.Nombre.Equals(nombreCat, StringComparison.OrdinalIgnoreCase)) {
                        cbCargaCategoria.SelectedItem = cat; break;
                    }
                }
                BtnCancelarNuevaCategoria_Click(null, null); 
            } catch (Exception ex) { MessageBox.Show("Error al crear categoría: " + ex.Message); }
        }

        private void DgInventario_CellEditEnding(object sender, DataGridCellEditEndingEventArgs e) { }

        private void TxtBuscarInventario_TextChanged(object sender, TextChangedEventArgs e)
        {
            if (inventarioCompleto == null) return;
            string filtro = txtBuscarInventario.Text.ToLower();
            if (string.IsNullOrEmpty(filtro)) dgInventario.ItemsSource = inventarioCompleto;
            else dgInventario.ItemsSource = inventarioCompleto.Where(p => p.Nombre.ToLower().Contains(filtro) || p.CodigoBarras.Contains(filtro)).ToList();
        }
    }

    // --- CLASES ---
    public class Producto {
        public int Id { get; set; }
        public string CodigoBarras { get; set; } = "";
        public string Nombre { get; set; } = "";
        public decimal Precio { get; set; } 
        public decimal PrecioUnitario { get; set; } 
        public int Cantidad { get; set; } = 1; 
        public int Stock { get; set; }
        public string Categoria { get; set; } = "General";

        // --- NUEVO: ESTO ELIGE EL COLOR SOLO ---
        public string ColorEstado 
        { 
            get 
            {
                if (Stock <= 0) return "#F44336"; // ROJO (Sin stock o negativo)
                if (Stock <= 5) return "#FF9800"; // NARANJA (Queda poco)
                return "#4CAF50";                 // VERDE (Hay stock)
            } 
        }
    }
}

    public class Categoria {
        public int Id { get; set; }
        public string Nombre { get; set; }
    }

    public class VentaResumen {
        public DateTime Fecha { get; set; }
        public string MetodoPago { get; set; } = "";
        public int CantidadItems { get; set; }
        public decimal Total { get; set; }
        public string DetalleTexto { get; set; } = "";
    }
