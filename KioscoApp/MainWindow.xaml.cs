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
    public partial class MainWindow : Window {
        // CADENA DE CONEXIÓN con tus credenciales
        string connStr = "Server=127.0.0.1;Database=KioscoDB;Uid=root;Pwd=Gtacinco135;Port=3306;";
        ObservableCollection<Producto> carrito = new ObservableCollection<Producto>();
        decimal totalVenta = 0;

        public MainWindow() {
            InitializeComponent();
            dgCarrito.ItemsSource = carrito;
            
            // Enfocar en el campo de escaneo al iniciar
            Loaded += (s, e) => {
                try {
                    txtBarcodeVenta.Focus();
                    // Probar conexión a la base de datos
                    TestDatabaseConnection();
                } catch { }
            };
        }

        private void TestDatabaseConnection() {
            try {
                using (MySqlConnection conn = new MySqlConnection(connStr)) {
                    conn.Open();
                    // Verificar si la base de datos existe
                    string checkDb = "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = 'KioscoDB'";
                    MySqlCommand cmd = new MySqlCommand(checkDb, conn);
                    var result = cmd.ExecuteScalar();
                    if (result == null) {
                        MessageBox.Show("⚠️ La base de datos 'KioscoDB' no existe.\n\nEjecuta el script database.sql en MySQL para crearla.", 
                                        "Base de Datos No Encontrada", MessageBoxButton.OK, MessageBoxImage.Warning);
                    } else {
                        // Verificar si hay productos
                        string countProducts = "SELECT COUNT(*) FROM productos";
                        MySqlCommand cmd2 = new MySqlCommand(countProducts, conn);
                        int count = Convert.ToInt32(cmd2.ExecuteScalar());
                        if (count == 0) {
                            MessageBox.Show("ℹ️ La base de datos existe pero no tiene productos.\n\nUsa la pestaña 'CARGA DE PRODUCTOS' para agregar algunos.", 
                                            "Sin Productos", MessageBoxButton.OK, MessageBoxImage.Information);
                        }
                    }
                }
            } catch (Exception ex) {
                MessageBox.Show($"❌ Error de conexión a la base de datos:\n{ex.Message}\n\nVerifica que MySQL esté ejecutándose en 127.0.0.1:3306", 
                                "Error de Conexión", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private async void TxtCargaBarcode_LostFocus(object sender, RoutedEventArgs e) {
            string barcode = txtCargaBarcode.Text.Trim();
            if (string.IsNullOrEmpty(barcode)) return;

            lblCargaStatus.Text = "Buscando en API mundial...";
            try {
                using (HttpClient client = new HttpClient()) {
                    string url = $"https://world.openfoodfacts.org/api/v0/product/{barcode}.json";
                    string response = await client.GetStringAsync(url);
                    var json = JObject.Parse(response);
                    if (json["status"]?.ToString() == "1" && json["product"] != null) {
                        txtCargaNombre.Text = json["product"]?["product_name"]?.ToString() ?? "";
                        lblCargaStatus.Text = "¡Encontrado en API!";
                    }
                }
            } catch { lblCargaStatus.Text = "Error de conexión con la API."; }
        }

        private void BtnGuardar_Click(object sender, RoutedEventArgs e) {
            try {
                // Validaciones
                if (string.IsNullOrWhiteSpace(txtCargaBarcode.Text)) {
                    lblCargaStatus.Text = "❌ Error: Ingresa un código de barras";
                    MessageBox.Show("⚠️ Ingresa un código de barras", "Validación", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }
                
                if (string.IsNullOrWhiteSpace(txtCargaNombre.Text)) {
                    lblCargaStatus.Text = "❌ Error: Ingresa el nombre";
                    MessageBox.Show("⚠️ Ingresa el nombre del producto", "Validación", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }
                
                if (!decimal.TryParse(txtCargaPrecio.Text, out decimal precioValue) || precioValue <= 0) {
                    lblCargaStatus.Text = "❌ Error: Precio inválido";
                    MessageBox.Show("⚠️ Ingresa un precio válido (mayor a 0)", "Validación", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }

                lblCargaStatus.Text = "⏳ Guardando...";

                using (MySqlConnection conn = new MySqlConnection(connStr)) {
                    conn.Open();
                    
                    // Si el código existe, actualiza; si no, inserta
                    string sql = "INSERT INTO productos (codigo_barras, nombre, precio) VALUES (@c, @n, @p) ON DUPLICATE KEY UPDATE nombre=@n, precio=@p";
                    MySqlCommand cmd = new MySqlCommand(sql, conn);
                    cmd.Parameters.AddWithValue("@c", txtCargaBarcode.Text.Trim());
                    cmd.Parameters.AddWithValue("@n", txtCargaNombre.Text.Trim());
                    cmd.Parameters.AddWithValue("@p", precioValue);
                    cmd.ExecuteNonQuery();
                    
                    // Limpiar formulario
                    string codigoGuardado = txtCargaBarcode.Text.Trim();
                    string nombreGuardado = txtCargaNombre.Text.Trim();
                    
                    txtCargaBarcode.Clear(); 
                    txtCargaNombre.Clear(); 
                    txtCargaPrecio.Clear();
                    
                    lblCargaStatus.Text = $"✅ Guardado: {nombreGuardado} (${precioValue.ToString("F2")})";
                    MessageBox.Show($"✓ Producto guardado\n\n{nombreGuardado}\nCódigo: {codigoGuardado}\nPrecio: ${precioValue.ToString("F2")}", 
                                    "Éxito", MessageBoxButton.OK, MessageBoxImage.Information);
                    
                    txtCargaBarcode.Focus();
                }
            } catch (Exception ex) { 
                lblCargaStatus.Text = $"❌ Error BD: {ex.Message}";
                MessageBox.Show($"❌ Error al guardar: {ex.Message}\n\nVerifica que MySQL esté corriendo", "Error", MessageBoxButton.OK, MessageBoxImage.Error); 
            }
        }

        private void TxtBarcodeVenta_KeyDown(object sender, KeyEventArgs e) {
            if (e.Key == Key.Enter) {
                e.Handled = true; // Prevenir que el sistema procese el ENTER
                
                string barcode = txtBarcodeVenta.Text.Trim();
                
                if (string.IsNullOrEmpty(barcode)) {
                    // ENTER vacío = Abrir panel de cobro
                    if (carrito.Count > 0) {
                        AbrirPanelCobro();
                    } else {
                        MessageBox.Show("⚠️ Agrega productos primero", "Advertencia", MessageBoxButton.OK, MessageBoxImage.Information);
                    }
                } else {
                    // ENTER con código = Buscar y agregar
                    BuscarYAgregar(barcode);
                    txtBarcodeVenta.Clear();
                    txtBarcodeVenta.Focus(); // Mantener el foco en el scanner
                }
            }
        }

        private void BuscarYAgregar(string barcode) {
            try {
                using (MySqlConnection conn = new MySqlConnection(connStr)) {
                    MySqlCommand cmd = new MySqlCommand("SELECT id, nombre, precio FROM productos WHERE codigo_barras = @c", conn);
                    cmd.Parameters.AddWithValue("@c", barcode);
                    conn.Open();
                    using (var reader = cmd.ExecuteReader()) {
                        if (reader.Read()) {
                            string? nombre = reader["nombre"]?.ToString();
                            decimal precio = reader["precio"] != DBNull.Value ? (decimal)reader["precio"] : 0;
                            carrito.Add(new Producto { 
                                Nombre = nombre ?? "Sin nombre", 
                                Precio = precio 
                            });
                            CalcularTotal();
                            // Feedback visual
                            MessageBox.Show($"✓ {nombre} agregado\n$ {precio.ToString("F2")}", "Éxito", MessageBoxButton.OK, MessageBoxImage.Information);
                        } else { 
                            MessageBox.Show($"❌ Código '{barcode}' no encontrado en la base de datos.", "Producto No Registrado", MessageBoxButton.OK, MessageBoxImage.Warning); 
                        }
                    }
                }
            } catch (Exception ex) { 
                MessageBox.Show($"Error de conexión: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error); 
            }
        }

        private void BtnQuitar_Click(object sender, RoutedEventArgs e) {
            if (dgCarrito.SelectedItem is Producto p) { carrito.Remove(p); CalcularTotal(); }
        }

        private void BtnManualOpen_Click(object sender, RoutedEventArgs e) => gridManual.Visibility = Visibility.Visible;
        
        private void BtnManualConfirm_Click(object sender, RoutedEventArgs e) {
            if (string.IsNullOrWhiteSpace(txtManualNombre.Text)) {
                MessageBox.Show("⚠️ Ingresa la descripción del producto", "Validación", MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }
            
            if (decimal.TryParse(txtManualPrecio.Text, out decimal p) && p > 0) {
                carrito.Add(new Producto { Nombre = txtManualNombre.Text, Precio = p });
                CalcularTotal();
                txtManualNombre.Clear();
                txtManualPrecio.Clear();
                gridManual.Visibility = Visibility.Collapsed;
            } else {
                MessageBox.Show("⚠️ Ingresa un precio válido", "Validación", MessageBoxButton.OK, MessageBoxImage.Warning);
            }
        }

        private void BtnManualCancel_Click(object sender, RoutedEventArgs e) => gridManual.Visibility = Visibility.Collapsed;

        private void CalcularTotal() {
            totalVenta = carrito.Sum(p => p.Precio);
            // Formato de pesos argentinos
            lblTotal.Text = totalVenta.ToString("C", CultureInfo.CreateSpecificCulture("es-AR"));
            lblItemCount.Text = carrito.Count.ToString();
        }

        private void AbrirPanelCobro() {
            lblTotalCobro.Text = totalVenta.ToString("C", CultureInfo.CreateSpecificCulture("es-AR"));
            gridCobro.Visibility = Visibility.Visible;
            cbMetodoPago.SelectedIndex = 0; // Efectivo por defecto
            txtPagaCon.Clear();
            lblVuelto.Text = "$ 0,00";
            txtPagaCon.Focus();
            // Mostrar controles de efectivo por defecto
            MostrarControlesEfectivo(true);
        }

        private void MostrarControlesEfectivo(bool mostrar) {
            // Si los controles aún no se han inicializado, salimos del método
            if (lblPagaCon == null || txtPagaCon == null || borderVuelto == null) return;

            lblPagaCon.Visibility = mostrar ? Visibility.Visible : Visibility.Collapsed;
            txtPagaCon.Visibility = mostrar ? Visibility.Visible : Visibility.Collapsed;
            borderVuelto.Visibility = mostrar ? Visibility.Visible : Visibility.Collapsed;
        }

        private void CbMetodoPago_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e) {
            // Verificamos que el ComboBox y sus items no sean nulos
            if (cbMetodoPago == null || cbMetodoPago.SelectedItem == null) return;

            string metodo = (cbMetodoPago.SelectedItem as ComboBoxItem)?.Content.ToString();
            bool esEfectivo = metodo == "Efectivo";
            
            MostrarControlesEfectivo(esEfectivo);
            
            if (esEfectivo && txtPagaCon != null) {
                txtPagaCon.Focus();
            }
        }

        private void TxtPagaCon_TextChanged(object sender, System.Windows.Controls.TextChangedEventArgs e) {
            if (decimal.TryParse(txtPagaCon.Text, out decimal paga))
                lblVuelto.Text = (paga - totalVenta).ToString("C", CultureInfo.CreateSpecificCulture("es-AR"));
        }

        private void TxtPagaCon_KeyDown(object sender, KeyEventArgs e) {
            if (e.Key == Key.Enter) {
                e.Handled = true;
                FinalizarVenta();
            } else if (e.Key == Key.Escape) {
                e.Handled = true;
                CancelarCobro();
            }
        }

        private void GridCobro_KeyDown(object sender, KeyEventArgs e) {
            if (e.Key == Key.Escape) {
                e.Handled = true;
                CancelarCobro();
            } else if (e.Key == Key.F1) {
                cbMetodoPago.SelectedIndex = 0; // Efectivo
                e.Handled = true;
            } else if (e.Key == Key.F2) {
                cbMetodoPago.SelectedIndex = 3; // Transferencia
                e.Handled = true;
            } else if (e.Key == Key.F3) {
                cbMetodoPago.SelectedIndex = 1; // Débito
                e.Handled = true;
            }
        }

        private void BtnCancelCobro_Click(object sender, RoutedEventArgs e) {
            CancelarCobro();
        }

        private void CancelarCobro() {
            gridCobro.Visibility = Visibility.Collapsed;
            txtBarcodeVenta.Clear();
            txtBarcodeVenta.Focus();
        }

        private void BtnConfirmarVenta_Click(object sender, RoutedEventArgs e) => FinalizarVenta();

        private void FinalizarVenta() {
            string metodo = ((cbMetodoPago.SelectedItem as ComboBoxItem)?.Content as string) ?? "Efectivo";
            
            if (metodo == "Efectivo") {
                // Validación básica de pago
                if (!decimal.TryParse(txtPagaCon.Text, out decimal paga) || paga < totalVenta) {
                    MessageBox.Show("El monto pagado es insuficiente.", "Aviso", MessageBoxButton.OK, MessageBoxImage.Warning);
                    return;
                }
            }

            using (MySqlConnection conn = new MySqlConnection(connStr)) {
                conn.Open();
                // Iniciamos una transacción para asegurar la integridad de los datos
                using (MySqlTransaction trans = conn.BeginTransaction()) {
                    try {
                        // 1. Insertar la Cabecera de la Venta
                        string sqlVenta = "INSERT INTO ventas (total, cantidad_items, metodo_pago) VALUES (@total, @cantidad, @metodo)";
                        MySqlCommand cmdVenta = new MySqlCommand(sqlVenta, conn, trans);
                        cmdVenta.Parameters.AddWithValue("@total", totalVenta);
                        cmdVenta.Parameters.AddWithValue("@cantidad", carrito.Count);
                        cmdVenta.Parameters.AddWithValue("@metodo", metodo);
                        cmdVenta.ExecuteNonQuery();

                        long ventaId = cmdVenta.LastInsertedId;

                        // 2. Insertar Detalles y Actualizar Stock
                        foreach (var producto in carrito) {
                            // Guardar detalle
                            string sqlDetalle = "INSERT INTO venta_detalles (venta_id, nombre, precio, cantidad, subtotal) VALUES (@id, @nom, @pre, 1, @sub)";
                            MySqlCommand cmdDetalle = new MySqlCommand(sqlDetalle, conn, trans);
                            cmdDetalle.Parameters.AddWithValue("@id", ventaId);
                            cmdDetalle.Parameters.AddWithValue("@nom", producto.Nombre);
                            cmdDetalle.Parameters.AddWithValue("@pre", producto.Precio);
                            cmdDetalle.Parameters.AddWithValue("@sub", producto.Precio);
                            cmdDetalle.ExecuteNonQuery();

                            // DESCONTAR STOCK (Solo si el producto tiene nombre registrado en la BD)
                            string sqlStock = "UPDATE productos SET stock = stock - 1 WHERE nombre = @nom";
                            MySqlCommand cmdStock = new MySqlCommand(sqlStock, conn, trans);
                            cmdStock.Parameters.AddWithValue("@nom", producto.Nombre);
                            cmdStock.ExecuteNonQuery();
                        }

                        trans.Commit(); // Si todo salió bien, guardamos cambios permanentemente
                        
                        MessageBox.Show("✓ Venta procesada y stock actualizado.", "Éxito", MessageBoxButton.OK, MessageBoxImage.Information);
                        
                        // Limpieza de interfaz
                        carrito.Clear();
                        CalcularTotal();
                        gridCobro.Visibility = Visibility.Collapsed;
                        txtBarcodeVenta.Focus();
                        
                    } catch (Exception ex) {
                        trans.Rollback(); // Si hubo error, deshacemos todo para no corromper la BD
                        MessageBox.Show($"Error crítico: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                    }
                }
            }
        }

        private void TxtBarcodeVenta_TextChanged(object sender, System.Windows.Controls.TextChangedEventArgs e) {
            string query = txtBarcodeVenta.Text.Trim();
            if (string.IsNullOrEmpty(query)) {
                lstSuggestions.Visibility = Visibility.Collapsed;
                return;
            }

            try {
                using (MySqlConnection conn = new MySqlConnection(connStr)) {
                    string sql = "SELECT nombre, precio FROM productos WHERE nombre LIKE @q OR codigo_barras LIKE @q LIMIT 10";
                    MySqlCommand cmd = new MySqlCommand(sql, conn);
                    cmd.Parameters.AddWithValue("@q", "%" + query + "%");
                    conn.Open();
                    using (var reader = cmd.ExecuteReader()) {
                        var suggestions = new System.Collections.ObjectModel.ObservableCollection<Producto>();
                        while (reader.Read()) {
                            suggestions.Add(new Producto {
                                Nombre = reader["nombre"]?.ToString() ?? "",
                                Precio = reader["precio"] != DBNull.Value ? (decimal)reader["precio"] : 0
                            });
                        }
                        lstSuggestions.ItemsSource = suggestions;
                        lstSuggestions.Visibility = suggestions.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
                    }
                }
            } catch { }
        }

        private void LstSuggestions_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e) {
            if (lstSuggestions.SelectedItem is Producto p) {
                carrito.Add(new Producto { Nombre = p.Nombre, Precio = p.Precio });
                CalcularTotal();
                txtBarcodeVenta.Clear();
                lstSuggestions.Visibility = Visibility.Collapsed;
                txtBarcodeVenta.Focus();
            }
        }

        private void TxtCargaBarcode_KeyDown(object sender, KeyEventArgs e) {
            if (e.Key == Key.Enter) {
                txtCargaNombre.Focus();
            }
        }

        private void DgInventario_CellEditEnding(object sender, System.Windows.Controls.DataGridCellEditEndingEventArgs e) {
            // Guardar cambios en el inventario
            if (e.EditAction == System.Windows.Controls.DataGridEditAction.Commit) {
                // Implementar guardado si es necesario
            }
        }
    }

    public class Producto {
        public string? Nombre { get; set; }
        public decimal Precio { get; set; }
    }
}
