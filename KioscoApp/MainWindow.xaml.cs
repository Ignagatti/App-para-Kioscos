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
using System.Collections.Generic; // Agregado para que funcione List<>

namespace KioscoApp
{
    public partial class MainWindow : Window
    {
        // Doble configuración de conexión para Emanuel y Gtacinco135
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

            // Intentar establecer la conexión válida al arrancar
            EstablecerConexionValida();

            // Cargar inventario al seleccionar la pestaña correspondiente
            MainTabs.SelectionChanged += (s, e) =>
            {
                if (MainTabs.SelectedItem is TabItem ti && ti.Header != null && ti.Header.ToString()!.Contains("INVENTARIO"))
                {
                    CargarInventario();
                }
            };

            Loaded += (s, e) =>
            {
                txtBarcodeVenta.Focus();
            };
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

        private void CargarInventario()
        {
            try
            {
                // 1. LIMPIAR la lista de respaldo para el buscador (¡Muy importante!)
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
                            // Creamos el objeto producto una sola vez
                            var nuevoProducto = new Producto {
                                Id = Convert.ToInt32(reader["id"]),
                                CodigoBarras = reader["codigo_barras"]?.ToString() ?? "",
                                Nombre = reader["nombre"]?.ToString() ?? "",
                                Precio = Convert.ToDecimal(reader["precio"]),
                                Stock = Convert.ToInt32(reader["stock"]), 
                                Categoria = reader["categoria_nombre"]?.ToString() ?? "General"
                            };

                            // 2. AGREGAR A AMBAS LISTAS
                            listaInventario.Add(nuevoProducto);      // Para que se vea en la tabla ya mismo
                            inventarioCompleto.Add(nuevoProducto);   // Para que el buscador lo tenga en memoria
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

        private void AgregarAlCarrito(string nombre, decimal precio)
        {
            carrito.Add(new Producto { Nombre = nombre, Precio = precio });
            CalcularTotal();
        }

        private void BuscarYAgregar(string barcode)
        {
            try {
                using (MySqlConnection conn = GetConnection()) {
                    MySqlCommand cmd = new MySqlCommand("SELECT nombre, precio FROM productos WHERE codigo_barras = @c", conn);
                    cmd.Parameters.AddWithValue("@c", barcode);
                    conn.Open();
                    using (var reader = cmd.ExecuteReader()) {
                        if (reader.Read()) {
                            AgregarAlCarrito(reader["nombre"]?.ToString() ?? "Producto", Convert.ToDecimal(reader["precio"]));
                        } else {
                            MessageBox.Show("Producto no encontrado.");
                        }
                    }
                }
            } catch (Exception ex) { MessageBox.Show(ex.Message); }
        }

        // EVENTOS DE VENTA
        private void TxtBarcodeVenta_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter) {
                e.Handled = true;
                if (lstSuggestions.Visibility == Visibility.Visible && lstSuggestions.Items.Count > 0) {
                    lstSuggestions.SelectedIndex = 0;
                    if (lstSuggestions.SelectedItem is Producto p) {
                        AgregarAlCarrito(p.Nombre, p.Precio);
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
                    string sql = "SELECT nombre, precio FROM productos WHERE nombre LIKE @q OR codigo_barras LIKE @q LIMIT 10";
                    MySqlCommand cmd = new MySqlCommand(sql, conn);
                    cmd.Parameters.AddWithValue("@q", "%" + query + "%");
                    conn.Open();
                    var suggestions = new ObservableCollection<Producto>();
                    using (var reader = cmd.ExecuteReader()) {
                        while (reader.Read()) {
                            suggestions.Add(new Producto { Nombre = reader["nombre"]?.ToString() ?? "", Precio = Convert.ToDecimal(reader["precio"]) });
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
                AgregarAlCarrito(p.Nombre, p.Precio);
                txtBarcodeVenta.Clear();
                lstSuggestions.Visibility = Visibility.Collapsed;
                txtBarcodeVenta.Focus();
            }
        }

        private void BtnQuitar_Click(object sender, RoutedEventArgs e)
        {
            if (dgCarrito.SelectedItem is Producto p) { carrito.Remove(p); CalcularTotal(); }
        }

        // COBRO
        private void AbrirPanelCobro()
        {
            lblTotalCobro.Text = totalVenta.ToString("C", CultureInfo.CreateSpecificCulture("es-AR"));
            gridCobro.Visibility = Visibility.Visible;
            txtPagaCon.Focus();
        }

        private void FinalizarVenta()
        {
            string metodo = (cbMetodoPago.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "Efectivo";
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
                            MySqlCommand cmdDet = new MySqlCommand("INSERT INTO venta_detalles (venta_id, nombre, precio, cantidad, subtotal) VALUES (@id, @n, @p, 1, @p)", conn, trans);
                            cmdDet.Parameters.AddWithValue("@id", ventaId);
                            cmdDet.Parameters.AddWithValue("@n", p.Nombre);
                            cmdDet.Parameters.AddWithValue("@p", p.Precio);
                            cmdDet.ExecuteNonQuery();

                            MySqlCommand cmdStock = new MySqlCommand("UPDATE productos SET stock = stock - 1 WHERE nombre = @n", conn, trans);
                            cmdStock.Parameters.AddWithValue("@n", p.Nombre);
                            cmdStock.ExecuteNonQuery();
                        }
                        trans.Commit();
                        MessageBox.Show("Venta completada.");
                        carrito.Clear(); CalcularTotal();
                        gridCobro.Visibility = Visibility.Collapsed;
                    } catch (Exception ex) { trans.Rollback(); MessageBox.Show("Error: " + ex.Message); }
                }
            }
        }

        private void TxtPagaCon_TextChanged(object sender, TextChangedEventArgs e) {
            if (decimal.TryParse(txtPagaCon.Text, out decimal paga))
                lblVuelto.Text = (paga - totalVenta).ToString("C", CultureInfo.CreateSpecificCulture("es-AR"));
        }

        private void TxtPagaCon_KeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Enter) FinalizarVenta(); }
        private void BtnConfirmarVenta_Click(object sender, RoutedEventArgs e) => FinalizarVenta();
        private void BtnCancelCobro_Click(object sender, RoutedEventArgs e) => gridCobro.Visibility = Visibility.Collapsed;
        private void GridCobro_KeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Escape) gridCobro.Visibility = Visibility.Collapsed; }
        private void CbMetodoPago_SelectionChanged(object sender, SelectionChangedEventArgs e) { }

        // CARGA DE PRODUCTOS
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
            try {
                if (!decimal.TryParse(txtCargaPrecio.Text, out decimal precioValue)) return;
                decimal.TryParse(txtCargaStock.Text, out decimal stockValue);
                using (MySqlConnection conn = GetConnection()) {
                    conn.Open();
                    string sql = "INSERT INTO productos (codigo_barras, nombre, precio, stock) VALUES (@c, @n, @p, @s) ON DUPLICATE KEY UPDATE nombre=@n, precio=@p, stock=stock+@s";
                    MySqlCommand cmd = new MySqlCommand(sql, conn);
                    cmd.Parameters.AddWithValue("@c", txtCargaBarcode.Text.Trim());
                    cmd.Parameters.AddWithValue("@n", txtCargaNombre.Text.Trim());
                    cmd.Parameters.AddWithValue("@p", precioValue);
                    cmd.Parameters.AddWithValue("@s", stockValue);
                    cmd.ExecuteNonQuery();
                    MessageBox.Show("Producto guardado.");
                }
            } catch (Exception ex) { MessageBox.Show("Error: " + ex.Message); }
        }

        private void TxtCargaBarcode_KeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Enter) txtCargaNombre.Focus(); }
        private void BtnManualOpen_Click(object sender, RoutedEventArgs e) => gridManual.Visibility = Visibility.Visible;
        private void BtnManualCancel_Click(object sender, RoutedEventArgs e) => gridManual.Visibility = Visibility.Collapsed;
        private void BtnManualConfirm_Click(object sender, RoutedEventArgs e) {
            if (decimal.TryParse(txtManualPrecio.Text, out decimal p)) { AgregarAlCarrito(txtManualNombre.Text, p); gridManual.Visibility = Visibility.Collapsed; }
        }
        
        private void DgInventario_CellEditEnding(object sender, DataGridCellEditEndingEventArgs e) { }

        // AQUÍ ES DONDE FALTABA PONER LA FUNCIÓN (DENTRO DE LA CLASE)
        private void TxtBuscarInventario_TextChanged(object sender, TextChangedEventArgs e)
        {
            // Si la lista de respaldo es nula, evitamos el error
            if (inventarioCompleto == null) return;

            string filtro = txtBuscarInventario.Text.ToLower();

            if (string.IsNullOrEmpty(filtro))
            {
                dgInventario.ItemsSource = inventarioCompleto;
            }
            else
            {
                var listaFiltrada = inventarioCompleto
                    .Where(p => p.Nombre.ToLower().Contains(filtro) || p.CodigoBarras.Contains(filtro))
                    .ToList();

                dgInventario.ItemsSource = listaFiltrada;
            }
        }

    } // <--- AQUÍ TERMINA LA CLASE MAINWINDOW

    // AQUÍ EMPIEZA LA CLASE PRODUCTO
    public class Producto {
        public int Id { get; set; }
        public string CodigoBarras { get; set; } = "";
        public string Nombre { get; set; } = "";
        public decimal Precio { get; set; }
        public decimal Stock { get; set; } 
        public string Categoria { get; set; } = "General";
    }
}