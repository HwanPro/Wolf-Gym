using System.Drawing;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace WolfGymLauncher;

internal sealed class LauncherForm : Form
{
    private readonly string[] _args;
    private readonly CancellationTokenSource _startupCancellation = new();
    private readonly WebView2 _webView = new() { Dock = DockStyle.Fill };
    private readonly Label _status = new()
    {
        AutoSize = true,
        ForeColor = Color.FromArgb(195, 209, 224),
        Font = new Font("Segoe UI", 9F),
        Text = "Preparando Wolf Gym...",
        Anchor = AnchorStyles.Right,
    };
    private bool _isClosing;

    public LauncherForm(string[] args)
    {
        _args = args;
        Text = "Wolf Gym";
        Icon = LoadIcon();
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(960, 640);
        Size = new Size(1360, 860);
        BackColor = Color.FromArgb(12, 17, 27);

        var header = new Panel
        {
            Dock = DockStyle.Top,
            Height = 58,
            BackColor = Color.FromArgb(17, 25, 38),
            Padding = new Padding(22, 0, 22, 0),
        };
        var brand = new Label
        {
            AutoSize = true,
            Text = "WOLF GYM",
            ForeColor = Color.White,
            Font = new Font("Segoe UI Semibold", 13F, FontStyle.Bold),
            Dock = DockStyle.Left,
            TextAlign = ContentAlignment.MiddleLeft,
        };
        var statusHost = new Panel { Dock = DockStyle.Right, Width = 390 };
        _status.Dock = DockStyle.Right;
        _status.TextAlign = ContentAlignment.MiddleRight;
        statusHost.Controls.Add(_status);
        header.Controls.Add(statusHost);
        header.Controls.Add(brand);

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 2,
            BackColor = BackColor,
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.Controls.Add(header, 0, 0);
        layout.Controls.Add(_webView, 0, 1);
        Controls.Add(layout);
        Shown += OnShownAsync;
        FormClosing += OnFormClosing;
    }

    public void SetStatus(string message)
    {
        if (_isClosing || IsDisposed) return;
        _status.Text = message;
    }

    private async void OnShownAsync(object? sender, EventArgs e)
    {
        try
        {
            var updateStarted = await Program.StartAsync(
                _args,
                SetStatus,
                _startupCancellation.Token);

            if (_isClosing) return;
            if (updateStarted)
            {
                Close();
                return;
            }

            SetStatus("Abriendo Wolf Gym...");
            var profileDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "WolfGym",
                "WebView2");
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: profileDir);
            await _webView.EnsureCoreWebView2Async(environment);
            _webView.CoreWebView2.NavigationCompleted += (_, navigation) =>
            {
                if (navigation.IsSuccess && !_isClosing)
                {
                    _status.Visible = false;
                }
            };
            _webView.CoreWebView2.Navigate(Program.AppUrl);
            SetStatus("Sistema listo · cerrar esta ventana detiene los servicios");
        }
        catch (OperationCanceledException)
        {
            // La ventana se cerró mientras arrancaban los servicios.
        }
        catch (Exception ex)
        {
            SetStatus("No se pudo iniciar Wolf Gym");
            if (!_isClosing)
            {
                MessageBox.Show(
                    this,
                    $"{ex.Message}\n\nRevisa los registros en la carpeta logs junto a WolfGymLauncher.exe.\n\nSi el mensaje menciona WebView2, instala Microsoft Edge WebView2 Runtime.",
                    "Wolf Gym",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
        }
    }

    private void OnFormClosing(object? sender, FormClosingEventArgs e)
    {
        if (_isClosing) return;
        _isClosing = true;
        _startupCancellation.Cancel();
        Program.Shutdown();
    }

    private static Icon? LoadIcon()
    {
        var iconPath = Path.Combine(AppContext.BaseDirectory, "WolfGym.ico");
        return File.Exists(iconPath) ? new Icon(iconPath) : null;
    }
}
