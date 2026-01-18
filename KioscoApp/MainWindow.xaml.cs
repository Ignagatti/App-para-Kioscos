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

namespace KioscoApp
{
    public partial class MainWindow : Window
    {
        string connStr = "Server=127.0.0.1;Database=KioscoDB;Uid=root;Pwd=Gtacinco135;Port=3306;";
        ObservableCollection<Producto> carrito = new ObservableCollection<Producto>();
        decimal totalVenta = 0;

        public MainWindow()
        {
            InitializeComponent();
            dgCarrito.ItemsSource = carrito;

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
                TestDatabaseConnection();
            };
        }

        private void CargarInventario()
        {
            try
            {
                ObservableCollection<Producto> listaInventario = new ObservableCollection<Producto>();
                using (MySqlConnection conn = new MySqlConnection(connStr))
                {
                    conn.Open();
                    string sql = @"SELECT p.id, p.codigo_barras, p.nombre, p.precio, p.stock, c.nombre as categoria_nombre 
                                   FROM productos p 
                                   LEFT JOIN categorias c ON p.categoria_id = c.id";

                    MySqlCommand cmd = new MySqlCommand(sql, conn);
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            listaInventario.Add(new Producto
                            {
                                Id = Convert.ToInt32(reader["id"]),
                                CodigoBarras = reader["codigo_barras"]?.ToString() ?? "",
                                Nombre = reader["nombre"]?.ToString() ?? "Sin nombre",
                                Precio = Convert.ToDecimal(reader["precio"]),
                                Stock = Convert.ToInt32(reader["stock"]),
                                Categoria = reader["categoria_nombre"]?.ToString() ?? "General"
                            });
                        }
                    }
                }
                dgInventario.ItemsSource = listaInventario;
            }
            catch (Exception ex) { MessageBox.Show("Error al cargar inventario: " + ex.Message); }
        }

        private void TestDatabaseConnection()
        {
            try
            {
                using (MySqlConnection conn = new MySqlConnection(connStr)) { conn.Open(); }
            }
            catch (Exception ex) { MessageBox.Show($"Error de conexión: {ex.Message}"); }
        }

        private async void TxtCargaBarcode_LostFocus(object sender, RoutedEventArgs e)
        {
            string barcode = txtCargaBarcode.Text.Trim();
            if (string.IsNullOrEmpty(barcode)) return;
            try
            {
                using (HttpClient client = new HttpClient())
                {
                    string url = $"https://world.openfoodfacts.org/api/v0/product/{barcode}.json";
                    string response = await client.GetStringAsync(url);
                    var json = JObject.Parse(response);
                    if (json["status"]?.ToString() == "1")
                    {
                        txtCargaNombre.Text = json["product"]?["product_name"]?.ToString() ?? "";
                    }
                }
            }
            catch { }
        }

        private void BtnGuardar_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(txtCargaBarcode.Text) || string.IsNullOrWhiteSpace(txtCargaNombre.Text)) return;
                if (!decimal.TryParse(txtCargaPrecio.Text, out decimal precioValue)) return;
                int.TryParse(txtCargaStock.Text, out int stockValue);

                using (MySqlConnection conn = new MySqlConnection(connStr))
                {
                    conn.Open();
                    string sql = "INSERT INTO productos (codigo_barras, nombre, precio, stock) VALUES (@c, @n, @p, @s) ON DUPLICATE KEY UPDATE nombre=@n, precio=@p, stock=stock+@s";
                    MySqlCommand cmd = new MySqlCommand(sql, conn);
                    cmd.Parameters.AddWithValue("@c", txtCargaBarcode.Text.Trim());
                    cmd.Parameters.AddWithValue("@n", txtCargaNombre.Text.Trim());
                    cmd.Parameters.AddWithValue("@p", precioValue);
                    cmd.Parameters.AddWithValue("@s", stockValue);
                    cmd.ExecuteNonQuery();
                    
                    MessageBox.Show("✓ Producto guardado.");
                    txtCargaBarcode.Clear(); txtCargaNombre.Clear(); txtCargaPrecio.Clear(); txtCargaStock.Text = "0";
                }
            }
            catch (Exception ex) { MessageBox.Show("Error: " + ex.Message); }
        }

        private void TxtBarcodeVenta_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter)
            {
                e.Handled = true;
                if (lstSuggestions.Visibility == Visibility.Visible && lstSuggestions.Items.Count > 0)
                {
                    lstSuggestions.SelectedIndex = 0;
                    if (lstSuggestions.SelectedItem is Producto p)
                    {
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

        private void BuscarYAgregar(string barcode)
        {
            try
            {
                using (MySqlConnection conn = new MySqlConnection(connStr))
                {
                    MySqlCommand cmd = new MySqlCommand("SELECT nombre, precio FROM productos WHERE codigo_barras = @c", conn);
                    cmd.Parameters.AddWithValue("@c", barcode);
                    conn.Open();
                    using (var reader = cmd.ExecuteReader())
                    {
                        if (reader.Read())
                        {
                            AgregarAlCarrito(reader["nombre"]?.ToString() ?? "Producto", Convert.ToDecimal(reader["precio"]));
                        }
                    }
                }
            }
            catch (Exception ex) { MessageBox.Show(ex.Message); }
        }

        private void AgregarAlCarrito(string nombre, decimal precio)
        {
            carrito.Add(new Producto { Nombre = nombre, Precio = precio });
            CalcularTotal();
        }

        private void BtnQuitar_Click(object sender, RoutedEventArgs e)
        {
            if (dgCarrito.SelectedItem is Producto p) { carrito.Remove(p); CalcularTotal(); }
        }

        private void CalcularTotal()
        {
            totalVenta = carrito.Sum(p => p.Precio);
            lblTotal.Text = totalVenta.ToString("C", CultureInfo.CreateSpecificCulture("es-AR"));
            lblItemCount.Text = carrito.Count.ToString();
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

            using (MySqlConnection conn = new MySqlConnection(connStr))
            {
                conn.Open();
                using (MySqlTransaction trans = conn.BeginTransaction())
                {
                    try
                    {
                        MySqlCommand cmdVenta = new MySqlCommand("INSERT INTO ventas (total, cantidad_items, metodo_pago) VALUES (@t, @c, @m)", conn, trans);
                        cmdVenta.Parameters.AddWithValue("@t", totalVenta);
                        cmdVenta.Parameters.AddWithValue("@c", carrito.Count);
                        cmdVenta.Parameters.AddWithValue("@m", metodo);
                        cmdVenta.ExecuteNonQuery();
                        long ventaId = cmdVenta.LastInsertedId;

                        foreach (var p in carrito)
                        {
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
                    }
                    catch (Exception ex) { trans.Rollback(); MessageBox.Show("Error: " + ex.Message); }
                }
            }
        }

        private void TxtBarcodeVenta_TextChanged(object sender, TextChangedEventArgs e)
        {
            string query = txtBarcodeVenta.Text.Trim();
            if (string.IsNullOrEmpty(query)) { lstSuggestions.Visibility = Visibility.Collapsed; return; }
            try
            {
                using (MySqlConnection conn = new MySqlConnection(connStr))
                {
                    string sql = "SELECT nombre, precio FROM productos WHERE nombre LIKE @q OR codigo_barras LIKE @q LIMIT 10";
                    MySqlCommand cmd = new MySqlCommand(sql, conn);
                    cmd.Parameters.AddWithValue("@q", "%" + query + "%");
                    conn.Open();
                    var suggestions = new ObservableCollection<Producto>();
                    using (var reader = cmd.ExecuteReader())
                    {
                        while (reader.Read())
                        {
                            suggestions.Add(new Producto { Nombre = reader["nombre"]?.ToString() ?? "", Precio = Convert.ToDecimal(reader["precio"]) });
                        }
                    }
                    lstSuggestions.ItemsSource = suggestions;
                    lstSuggestions.Visibility = suggestions.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
                }
            }
            catch { }
        }

        private void LstSuggestions_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (lstSuggestions.SelectedItem is Producto p)
            {
                AgregarAlCarrito(p.Nombre, p.Precio);
                txtBarcodeVenta.Clear();
                lstSuggestions.Visibility = Visibility.Collapsed;
            }
        }

        private void BtnManualOpen_Click(object sender, RoutedEventArgs e) => gridManual.Visibility = Visibility.Visible;
        private void BtnManualCancel_Click(object sender, RoutedEventArgs e) => gridManual.Visibility = Visibility.Collapsed;
        private void BtnManualConfirm_Click(object sender, RoutedEventArgs e)
        {
            if (decimal.TryParse(txtManualPrecio.Text, out decimal p))
            {
                AgregarAlCarrito(txtManualNombre.Text, p);
                gridManual.Visibility = Visibility.Collapsed;
            }
        }
        private void TxtPagaCon_TextChanged(object sender, TextChangedEventArgs e)
        {
            if (decimal.TryParse(txtPagaCon.Text, out decimal paga))
                lblVuelto.Text = (paga - totalVenta).ToString("C", CultureInfo.CreateSpecificCulture("es-AR"));
        }
        private void TxtPagaCon_KeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Enter) FinalizarVenta(); }
        private void BtnConfirmarVenta_Click(object sender, RoutedEventArgs e) => FinalizarVenta();
        private void BtnCancelCobro_Click(object sender, RoutedEventArgs e) => gridCobro.Visibility = Visibility.Collapsed;
        private void CbMetodoPago_SelectionChanged(object sender, SelectionChangedEventArgs e) { }
        private void GridCobro_KeyDown(object sender, KeyEventArgs e) { }
        private void TxtCargaBarcode_KeyDown(object sender, KeyEventArgs e) { if (e.Key == Key.Enter) txtCargaNombre.Focus(); }
        private void DgInventario_CellEditEnding(object sender, DataGridCellEditEndingEventArgs e) { }
    }

    public class Producto
    {
        public int Id { get; set; }
        public string CodigoBarras { get; set; } = "";
        public string Nombre { get; set; } = "";
        public decimal Precio { get; set; }
        public int Stock { get; set; }
        public string Categoria { get; set; } = "General";
    }
}