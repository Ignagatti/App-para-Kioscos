using System;
using System.Collections.ObjectModel;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using MySqlConnector;
using Newtonsoft.Json.Linq;
using System.Data;
using Google.Cloud.Vision.V1;
using Microsoft.Win32;
using Google.Apis.CustomSearchAPI.v1;
using Google.Apis.Services;

namespace KioscoApp
{
    public partial class MainWindow : Window {
        // CADENA DE CONEXIÓN con tus credenciales
        string connStr = "Server=127.0.0.1;Database=KioscoDB;Uid=root;Pwd=Gtacinco135;Port=3306;";
        ObservableCollection<Producto> carrito = new ObservableCollection<Producto>();
        decimal totalVenta = 0;
        // Reemplaza con tu API key de Barcode Lookup
        const string BarcodeLookupApiKey = "TU_API_KEY_AQUI";
        // Reemplaza con tu API key de Google Custom Search y Search Engine ID
        const string GoogleApiKey = "TU_GOOGLE_API_KEY";
        const string SearchEngineId = "TU_SEARCH_ENGINE_ID";

        public MainWindow() {
            InitializeComponent();
            dgCarrito.ItemsSource = carrito;
            
            // Enfocar en el campo de escaneo al iniciar
            Loaded += (s, e) => {
                try {
                    txtBarcodeVenta.Focus();
                    // Probar conexión a la base de datos
                    TestDatabaseConnection();
                    // Cargar inventario
                    CargarInventario();
                } catch { }
            };
        }

        private void TestDatabaseConnection() {
            try {
                using (MySqlConnection conn = new MySqlConnection("Server=127.0.0.1;Uid=root;Pwd=Gtacinco135;Port=3306;")) {
                    conn.Open();
                    
                    // Verificar si la base de datos existe
                    string checkDb = "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = 'KioscoDB'";
                    MySqlCommand cmd = new MySqlCommand(checkDb, conn);
                    var result = cmd.ExecuteScalar();
                    
                    if (result == null) {
                        // Crear la base de datos completa con maqueta
                        CrearBaseDatosMaqueta(conn);
                        MessageBox.Show("✅ Base de datos 'KioscoDB' creada con datos de maqueta.\n\n¡La app está lista para usar!", 
                                        "Base de Datos Creada", MessageBoxButton.OK, MessageBoxImage.Information);
                    } else {
                        // Verificar si hay productos
                        using (MySqlConnection connDb = new MySqlConnection(connStr)) {
                            connDb.Open();
                            string countProducts = "SELECT COUNT(*) FROM productos";
                            MySqlCommand cmd2 = new MySqlCommand(countProducts, connDb);
                            int count = Convert.ToInt32(cmd2.ExecuteScalar());
                            if (count == 0) {
                                // Insertar datos de maqueta si no hay productos
                                InsertarDatosMaqueta(connDb);
                                MessageBox.Show("ℹ️ La base de datos existía pero estaba vacía.\n\nSe insertaron datos de maqueta.", 
                                                "Datos Agregados", MessageBoxButton.OK, MessageBoxImage.Information);
                            }
                        }
                    }
                }
            } catch (Exception ex) {
                MessageBox.Show($"❌ Error de conexión a la base de datos:\n{ex.Message}\n\nVerifica que MySQL esté ejecutándose en 127.0.0.1:3306", 
                                "Error de Conexión", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        private void CrearBaseDatosMaqueta(MySqlConnection conn) {
            try {
                // Crear base de datos
                MySqlCommand cmd = new MySqlCommand("CREATE DATABASE KioscoDB;", conn);
                cmd.ExecuteNonQuery();
                
                // Usar la base de datos
                cmd = new MySqlCommand("USE KioscoDB;", conn);
                cmd.ExecuteNonQuery();
                
                // Crear tablas
                string[] createTables = {
                    @"CREATE TABLE categorias (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        nombre VARCHAR(100) NOT NULL UNIQUE,
                        descripcion TEXT,
                        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
                    
                    @"CREATE TABLE productos (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        codigo_barras VARCHAR(50) UNIQUE,
                        nombre VARCHAR(150) NOT NULL,
                        precio DECIMAL(10, 2) NOT NULL,
                        stock INT DEFAULT 0,
                        categoria_id INT DEFAULT NULL,
                        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        INDEX idx_codigo (codigo_barras),
                        FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
                    
                    @"CREATE TABLE ventas (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        total DECIMAL(10, 2) NOT NULL,
                        cantidad_items INT DEFAULT 0,
                        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        fecha_anulada TIMESTAMP NULL,
                        estado VARCHAR(20) DEFAULT 'completada',
                        INDEX idx_fecha (fecha),
                        INDEX idx_estado (estado)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
                    
                    @"CREATE TABLE venta_detalles (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        venta_id INT NOT NULL,
                        codigo_barras VARCHAR(50),
                        nombre VARCHAR(150) NOT NULL,
                        precio DECIMAL(10, 2) NOT NULL,
                        cantidad INT DEFAULT 1,
                        subtotal DECIMAL(10, 2) NOT NULL,
                        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
                        INDEX idx_venta (venta_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"
                };
                
                foreach (string sql in createTables) {
                    cmd = new MySqlCommand(sql, conn);
                    cmd.ExecuteNonQuery();
                }
                
                // Insertar datos de maqueta
                InsertarDatosMaqueta(conn);
                
            } catch (Exception ex) {
                MessageBox.Show($"Error creando base de datos: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void InsertarDatosMaqueta(MySqlConnection conn) {
            try {
                // Insertar categorías
                string[] insertCategorias = {
                    "INSERT INTO categorias (nombre, descripcion) VALUES ('Lácteos', 'Quesos, leche, mantequilla')",
                    "INSERT INTO categorias (nombre, descripcion) VALUES ('Panificados', 'Pan, facturas, sandwiches')",
                    "INSERT INTO categorias (nombre, descripcion) VALUES ('Bebidas', 'Leche, jugos, gaseosas')"
                };
                
                foreach (string sql in insertCategorias) {
                    MySqlCommand cmd = new MySqlCommand(sql, conn);
                    cmd.ExecuteNonQuery();
                }
                
                // Insertar productos
                string[] insertProductos = {
                    "INSERT INTO productos (codigo_barras, nombre, precio, stock, categoria_id) VALUES ('123456789', 'Pan Integral 500g', 350.00, 50, 2)",
                    "INSERT INTO productos (codigo_barras, nombre, precio, stock, categoria_id) VALUES ('987654321', 'Queso Oaxaca 250g', 1500.00, 30, 1)",
                    "INSERT INTO productos (codigo_barras, nombre, precio, stock, categoria_id) VALUES ('555666777', 'Leche Integral 1L', 380.00, 100, 1)",
                    "INSERT INTO productos (codigo_barras, nombre, precio, stock, categoria_id) VALUES ('111222333', 'Yogurt Natural 500g', 280.00, 40, 1)",
                    "INSERT INTO productos (codigo_barras, nombre, precio, stock, categoria_id) VALUES ('444555666', 'Mantequilla 250g', 650.00, 25, 1)",
                    "INSERT INTO productos (codigo_barras, nombre, precio, stock, categoria_id) VALUES ('777888999', 'Jamón Serrano 250g', 1800.00, 15, 1)",
                    "INSERT INTO productos (codigo_barras, nombre, precio, stock, categoria_id) VALUES ('222333444', 'Queso Fresco 500g', 1200.00, 35, 1)",
                    "INSERT INTO productos (codigo_barras, nombre, precio, stock, categoria_id) VALUES ('333444555', 'Coca Cola 2.25L', 450.00, 60, 3)",
                    "INSERT INTO productos (codigo_barras, nombre, precio, stock, categoria_id) VALUES ('666777888', 'Factura de Jamón', 180.00, 80, 2)"
                };
                
                foreach (string sql in insertProductos) {
                    MySqlCommand cmd = new MySqlCommand(sql, conn);
                    cmd.ExecuteNonQuery();
                }
                
            } catch (Exception ex) {
                MessageBox.Show($"Error insertando datos de maqueta: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
        private async void TxtCargaBarcode_LostFocus(object sender, RoutedEventArgs e) {
            string barcode = txtCargaBarcode.Text.Trim();
            if (string.IsNullOrEmpty(barcode)) return;

            if (BarcodeLookupApiKey == "TU_API_KEY_AQUI") {
                // Si no hay key válida, usar OpenFoodFacts directamente
                lblCargaStatus.Text = "Buscando en OpenFoodFacts...";
                await BuscarEnOpenFoodFacts(barcode);
                return;
            }

            lblCargaStatus.Text = "Buscando en Barcode Lookup...";
            try {
                using (HttpClient client = new HttpClient()) {
                    client.Timeout = TimeSpan.FromSeconds(10); // Timeout de 10 segundos
                    string url = $"https://api.barcodelookup.com/v3/products?barcode={barcode}&key={BarcodeLookupApiKey}";
                    HttpResponseMessage responseMessage = await client.GetAsync(url);
                    if (responseMessage.IsSuccessStatusCode) {
                        string response = await responseMessage.Content.ReadAsStringAsync();
                        var json = JObject.Parse(response);
                        if (json["products"] != null && json["products"].HasValues) {
                            var product = json["products"][0];
                            string productName = product["product_name"]?.ToString() ?? "";
                            if (!string.IsNullOrEmpty(productName)) {
                                txtCargaNombre.Text = productName;
                                lblCargaStatus.Text = "¡Encontrado en Barcode Lookup!";
                                return;
                            }
                        }
                        lblCargaStatus.Text = "No encontrado en Barcode Lookup.";
                    } else if (responseMessage.StatusCode == System.Net.HttpStatusCode.Forbidden) {
                        lblCargaStatus.Text = "API Key inválida, intentando con OpenFoodFacts...";
                        await BuscarEnOpenFoodFacts(barcode);
                        return;
                    } else {
                        lblCargaStatus.Text = $"Error en Barcode Lookup ({(int)responseMessage.StatusCode}), intentando OpenFoodFacts...";
                        await BuscarEnOpenFoodFacts(barcode);
                        return;
                    }
                }
            } catch (Exception ex) {
                lblCargaStatus.Text = $"Error de conexión con Barcode Lookup: {ex.Message}. Intentando OpenFoodFacts...";
                await BuscarEnOpenFoodFacts(barcode);
            }
        }

        private async Task BuscarEnOpenFoodFacts(string barcode) {
            try {
                using (HttpClient client = new HttpClient()) {
                    client.Timeout = TimeSpan.FromSeconds(10); // Timeout de 10 segundos
                    string url = $"https://world.openfoodfacts.org/api/v0/product/{barcode}.json";
                    string response = await client.GetStringAsync(url);
                    var json = JObject.Parse(response);
                    if (json["status"]?.ToString() == "1" && json["product"] != null) {
                        txtCargaNombre.Text = json["product"]?["product_name"]?.ToString() ?? "";
                        lblCargaStatus.Text = "¡Encontrado en OpenFoodFacts!";
                    } else {
                        if (GoogleApiKey != "TU_GOOGLE_API_KEY" && SearchEngineId != "TU_SEARCH_ENGINE_ID") {
                            lblCargaStatus.Text = "No encontrado en OpenFoodFacts, intentando Google Search...";
                            await BuscarEnGoogle(barcode);
                        } else {
                            lblCargaStatus.Text = "No encontrado. Configura Google Search para mejores resultados.";
                        }
                    }
                }
            } catch {
                if (GoogleApiKey != "TU_GOOGLE_API_KEY" && SearchEngineId != "TU_SEARCH_ENGINE_ID") {
                    lblCargaStatus.Text = "Error de conexión con OpenFoodFacts. Intentando Google Search...";
                    await BuscarEnGoogle(barcode);
                } else {
                    lblCargaStatus.Text = "Error de conexión. Configura Google Search para mejores resultados.";
                }
            }
        }

        private async Task BuscarEnGoogle(string barcode) {
            try {
                var service = new CustomSearchAPIService(new BaseClientService.Initializer
                {
                    ApiKey = GoogleApiKey
                });

                var request = service.Cse.List();
                request.Cx = SearchEngineId;
                request.Q = $"producto código de barras {barcode}";
                request.Num = 1;

                var result = await request.ExecuteAsync();
                if (result.Items != null && result.Items.Count > 0) {
                    string title = result.Items[0].Title;
                    // Extraer nombre del título, asumiendo que es algo como "Producto XYZ - Marca"
                    string productName = title.Split('-')[0].Trim();
                    txtCargaNombre.Text = productName;
                    lblCargaStatus.Text = "¡Encontrado en Google Search!";
                } else {
                    lblCargaStatus.Text = "No encontrado en Google Search.";
                }
            } catch (Exception ex) {
                lblCargaStatus.Text = $"Error con Google Search: {ex.Message}";
            }
        }

        private async void TxtCargaBarcode_KeyDown(object sender, KeyEventArgs e) {
            if (e.Key == Key.Enter) {
                e.Handled = true;
                TxtCargaBarcode_LostFocus(sender, null);
                txtCargaNombre.Focus();
            }
        }

        private async void BtnGoogleLens_Click(object sender, RoutedEventArgs e) {
            OpenFileDialog openFileDialog = new OpenFileDialog();
            openFileDialog.Filter = "Image files (*.jpg, *.jpeg, *.png, *.bmp)|*.jpg;*.jpeg;*.png;*.bmp";
            if (openFileDialog.ShowDialog() == true) {
                string imagePath = openFileDialog.FileName;
                lblCargaStatus.Text = "Procesando imagen con Google Lens...";
                try {
                    var client = ImageAnnotatorClient.Create();
                    var image = Image.FromFile(imagePath);
                    
                    // Detectar texto (incluyendo posibles códigos de barras)
                    var textAnnotations = await client.DetectTextAsync(image);
                    if (textAnnotations != null && textAnnotations.Count > 0) {
                        string detectedText = textAnnotations[0].Description;
                        // Asumir que el primer texto es el nombre o código
                        if (detectedText.Length < 20) { // Probablemente código de barras
                            txtCargaBarcode.Text = detectedText.Trim();
                        } else {
                            txtCargaNombre.Text = detectedText.Trim();
                        }
                    }
                    
                    lblCargaStatus.Text = "¡Datos extraídos de la imagen!";
                } catch (Exception ex) {
                    lblCargaStatus.Text = $"Error con Google Lens: {ex.Message}";
                }
            }
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

        private void TxtBarcodeVenta_TextChanged(object sender, System.Windows.Controls.TextChangedEventArgs e) {
            string input = txtBarcodeVenta.Text.Trim();
            if (string.IsNullOrEmpty(input)) {
                lstSuggestions.Items.Clear();
                lstSuggestions.Visibility = Visibility.Collapsed;
                return;
            }

            try {
                using (MySqlConnection conn = new MySqlConnection(connStr)) {
                    conn.Open();
                    string sql = "SELECT nombre, precio FROM productos WHERE nombre LIKE @input OR codigo_barras LIKE @input LIMIT 10";
                    MySqlCommand cmd = new MySqlCommand(sql, conn);
                    cmd.Parameters.AddWithValue("@input", "%" + input + "%");
                    using (var reader = cmd.ExecuteReader()) {
                        lstSuggestions.Items.Clear();
                        while (reader.Read()) {
                            string nombre = reader["nombre"]?.ToString() ?? "";
                            decimal precio = reader["precio"] != DBNull.Value ? (decimal)reader["precio"] : 0;
                            lstSuggestions.Items.Add(new Producto { Nombre = nombre, Precio = precio });
                        }
                        lstSuggestions.Visibility = lstSuggestions.Items.Count > 0 ? Visibility.Visible : Visibility.Collapsed;
                    }
                }
            } catch {
                // Silenciar errores para no molestar al usuario
            }
        }

        private void TxtBarcodeVenta_KeyDown(object sender, KeyEventArgs e) {
            if (e.Key == Key.Enter) {
                e.Handled = true; // Prevenir que el sistema procese el ENTER
                
                string input = txtBarcodeVenta.Text.Trim();
                
                if (string.IsNullOrEmpty(input)) {
                    // ENTER vacío = Abrir panel de cobro
                    if (carrito.Count > 0) {
                        AbrirPanelCobro();
                    } else {
                        MessageBox.Show("⚠️ Agrega productos primero", "Advertencia", MessageBoxButton.OK, MessageBoxImage.Information);
                    }
                } else {
                    // ENTER con código = Buscar y agregar
                    BuscarYAgregar(input);
                    txtBarcodeVenta.Clear();
                    lstSuggestions.Items.Clear();
                    lstSuggestions.Visibility = Visibility.Collapsed;
                    txtBarcodeVenta.Focus(); // Mantener el foco en el scanner
                }
            } else if (e.Key == Key.Down && lstSuggestions.Items.Count > 0) {
                // Flecha abajo para seleccionar sugerencia
                lstSuggestions.SelectedIndex = 0;
                lstSuggestions.Focus();
            }
        }

        private void BuscarYAgregar(string input) {
            try {
                using (MySqlConnection conn = new MySqlConnection(connStr)) {
                    conn.Open();
                    
                    // Primero buscar por código de barras exacto
                    MySqlCommand cmd = new MySqlCommand("SELECT id, nombre, precio FROM productos WHERE codigo_barras = @c", conn);
                    cmd.Parameters.AddWithValue("@c", input);
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
                            MostrarMensajeTemporal($"✓ {nombre} agregado");
                            return;
                        }
                    }
                    
                    // Si no encontró por código, buscar por nombre (primera coincidencia)
                    cmd = new MySqlCommand("SELECT id, nombre, precio FROM productos WHERE nombre LIKE @n LIMIT 1", conn);
                    cmd.Parameters.AddWithValue("@n", "%" + input + "%");
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
                            MostrarMensajeTemporal($"✓ {nombre} agregado");
                            return;
                        }
                    }
                    
                    // No encontrado
                    MostrarMensajeTemporal($"❌ '{input}' no encontrado");
                }
            } catch (Exception ex) { 
                MessageBox.Show($"Error de conexión: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error); 
            }
        }

        private void CargarInventario() {
            try {
                using (MySqlConnection conn = new MySqlConnection(connStr)) {
                    conn.Open();
                    string sql = @"SELECT p.id, p.codigo_barras, p.nombre, p.precio, p.stock, 
                                   COALESCE(c.nombre, 'Sin Categoría') as categoria
                                   FROM productos p 
                                   LEFT JOIN categorias c ON p.categoria_id = c.id 
                                   ORDER BY c.nombre, p.nombre";
                    MySqlCommand cmd = new MySqlCommand(sql, conn);
                    using (var reader = cmd.ExecuteReader()) {
                        var productos = new List<ProductoInventario>();
                        while (reader.Read()) {
                            productos.Add(new ProductoInventario {
                                Id = reader["id"] != DBNull.Value ? (int)reader["id"] : 0,
                                CodigoBarras = reader["codigo_barras"]?.ToString(),
                                Nombre = reader["nombre"]?.ToString(),
                                Categoria = reader["categoria"]?.ToString(),
                                Precio = reader["precio"] != DBNull.Value ? (decimal)reader["precio"] : 0,
                                Stock = reader["stock"] != DBNull.Value ? (int)reader["stock"] : 0
                            });
                        }
                        
                        // Agrupar por categoría para el DataGrid
                        var view = System.Windows.Data.CollectionViewSource.GetDefaultView(productos);
                        view.GroupDescriptions.Add(new System.Windows.Data.PropertyGroupDescription("Categoria"));
                        dgInventario.ItemsSource = view;
                    }
                }
            } catch (Exception ex) {
                MessageBox.Show($"Error al cargar inventario: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void LstSuggestions_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e) {
            if (lstSuggestions.SelectedItem is Producto p) {
                carrito.Add(new Producto { Nombre = p.Nombre, Precio = p.Precio });
                CalcularTotal();
                MostrarMensajeTemporal($"✓ {p.Nombre} agregado");
                txtBarcodeVenta.Clear();
                lstSuggestions.Items.Clear();
                lstSuggestions.Visibility = Visibility.Collapsed;
                txtBarcodeVenta.Focus();
            }
        }

        private void DgInventario_CellEditEnding(object sender, System.Windows.Controls.DataGridCellEditEndingEventArgs e) {
            if (e.EditAction == System.Windows.Controls.DataGridEditAction.Commit) {
                var producto = e.Row.Item as ProductoInventario;
                if (producto != null) {
                    try {
                        using (MySqlConnection conn = new MySqlConnection(connStr)) {
                            conn.Open();
                            string sql = "UPDATE productos SET precio = @precio, stock = @stock WHERE id = @id";
                            MySqlCommand cmd = new MySqlCommand(sql, conn);
                            cmd.Parameters.AddWithValue("@precio", producto.Precio);
                            cmd.Parameters.AddWithValue("@stock", producto.Stock);
                            cmd.Parameters.AddWithValue("@id", producto.Id);
                            cmd.ExecuteNonQuery();
                        }
                        MessageBox.Show("✅ Cambios guardados", "Éxito", MessageBoxButton.OK, MessageBoxImage.Information);
                    } catch (Exception ex) {
                        MessageBox.Show($"❌ Error al guardar: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
                    }
                }
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
            txtPagaCon.Clear();
            lblVuelto.Text = "$ 0,00";
            txtPagaCon.Focus();
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
            // Guardar venta en base de datos
            try {
                using (MySqlConnection conn = new MySqlConnection(connStr)) {
                    conn.Open();
                    
                    // Crear registro de venta
                    string sqlVenta = "INSERT INTO ventas (total, cantidad_items) VALUES (@total, @cantidad)";
                    MySqlCommand cmdVenta = new MySqlCommand(sqlVenta, conn);
                    cmdVenta.Parameters.AddWithValue("@total", totalVenta);
                    cmdVenta.Parameters.AddWithValue("@cantidad", carrito.Count);
                    cmdVenta.ExecuteNonQuery();
                    
                    // Obtener el ID de la venta insertada
                    MySqlCommand cmdId = new MySqlCommand("SELECT LAST_INSERT_ID()", conn);
                    object? result = cmdId.ExecuteScalar();
                    long ventaId = result != null ? (long)result : 0;
                    
                    // Guardar detalles de cada producto
                    foreach (var producto in carrito) {
                        string sqlDetalle = "INSERT INTO venta_detalles (venta_id, nombre, precio, cantidad, subtotal) VALUES (@venta_id, @nombre, @precio, @cantidad, @subtotal)";
                        MySqlCommand cmdDetalle = new MySqlCommand(sqlDetalle, conn);
                        cmdDetalle.Parameters.AddWithValue("@venta_id", ventaId);
                        cmdDetalle.Parameters.AddWithValue("@nombre", producto.Nombre ?? "Sin nombre");
                        cmdDetalle.Parameters.AddWithValue("@precio", producto.Precio);
                        cmdDetalle.Parameters.AddWithValue("@cantidad", 1);
                        cmdDetalle.Parameters.AddWithValue("@subtotal", producto.Precio);
                        cmdDetalle.ExecuteNonQuery();
                    }
                }
                
                MessageBox.Show($"✓ ¡Venta Finalizada!\n\nTotal: {totalVenta.ToString("C", CultureInfo.CreateSpecificCulture("es-AR"))}\nProductos: {carrito.Count}", 
                                "Éxito", MessageBoxButton.OK, MessageBoxImage.Information);
                carrito.Clear(); 
                CalcularTotal();
                gridCobro.Visibility = Visibility.Collapsed;
                txtBarcodeVenta.Focus();
            } catch (Exception ex) {
                MessageBox.Show($"Error al guardar la venta: {ex.Message}", "Error", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private async void MostrarMensajeTemporal(string mensaje) {
            lblMensaje.Text = mensaje;
            lblMensaje.Visibility = Visibility.Visible;
            await Task.Delay(2000); // Esperar 2 segundos
            lblMensaje.Visibility = Visibility.Collapsed;
        }
    }

    public class Producto {
        public string? Nombre { get; set; }
        public decimal Precio { get; set; }
    }

    public class ProductoInventario {
        public string? CodigoBarras { get; set; }
        public string? Nombre { get; set; }
        public string? Categoria { get; set; }
        public decimal Precio { get; set; }
        public int Stock { get; set; }
        public int Id { get; set; }
    }
}
