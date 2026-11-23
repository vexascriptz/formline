using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using Microsoft.Win32;

namespace DropInstaller;

public partial class MainWindow : Window
{
    private static readonly string ExtensionFolder = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "drop", "extension");

    private int _stage;
    private bool _openingBrowser;

    public MainWindow()
    {
        InitializeComponent();
        FolderPathText.Text = ExtensionFolder;
        ShowStage(0);
    }

    private void Titlebar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ChangedButton == MouseButton.Left && e.ButtonState == MouseButtonState.Pressed)
            try { DragMove(); } catch (InvalidOperationException) { }
    }

    private void Close_Click(object sender, RoutedEventArgs e) => Close();
    private void Minimize_Click(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;

    private void ShowStage(int stage)
    {
        _stage = Math.Clamp(stage, 0, 4);
        PreparePage.Visibility = _stage == 0 ? Visibility.Visible : Visibility.Collapsed;
        BrowserPage.Visibility = _stage == 1 ? Visibility.Visible : Visibility.Collapsed;
        DeveloperPage.Visibility = _stage == 2 ? Visibility.Visible : Visibility.Collapsed;
        LoadPage.Visibility = _stage == 3 ? Visibility.Visible : Visibility.Collapsed;
        DonePage.Visibility = _stage == 4 ? Visibility.Visible : Visibility.Collapsed;

        StepCounter.Text = $"STEP {_stage + 1} OF 5";
        var progressBars = new[] { ProgressOne, ProgressTwo, ProgressThree, ProgressFour, ProgressFive };
        for (var i = 0; i < progressBars.Length; i++)
            progressBars[i].Background = new SolidColorBrush(
                i <= _stage ? Color.FromRgb(184, 156, 244) : Color.FromRgb(55, 48, 60));

        BackButton.Visibility = _stage == 0 ? Visibility.Hidden : Visibility.Visible;
        NextButton.Content = _stage switch
        {
            0 => "Prepare and open Chrome  →",
            1 => "Next: Developer mode  →",
            2 => "Next: Load unpacked  →",
            3 => "I've loaded drop.  →",
            _ => "Finish"
        };
    }

    private void Back_Click(object sender, RoutedEventArgs e)
    {
        if (!_openingBrowser && _stage > 0) ShowStage(_stage - 1);
    }

    private async void Next_Click(object sender, RoutedEventArgs e)
    {
        if (_openingBrowser) return;
        if (_stage == 4) { Close(); return; }
        if (_stage == 0)
        {
            if (!PrepareFiles()) return;
            ShowStage(1);
            await OpenExtensionsPageAsync();
            return;
        }
        ShowStage(_stage + 1);
    }

    private bool PrepareFiles()
    {
        PrepareError.Visibility = Visibility.Collapsed;
        try
        {
            Directory.CreateDirectory(ExtensionFolder);
            // Install ONLY three bundled files in the current user's app data.
            // Chrome policy, security settings, and the registry are never modified.
            foreach (var name in new[] { "manifest.json", "main.js", "popup.html" })
            {
                using var resource = Assembly.GetExecutingAssembly().GetManifestResourceStream(
                    $"DropInstaller.Payload.{name}") ??
                    throw new InvalidOperationException($"Installer is missing {name}.");

                var destination = Path.Combine(ExtensionFolder, name);
                var temp = destination + ".tmp";
                using (var file = new FileStream(temp, FileMode.Create, FileAccess.Write, FileShare.None))
                    resource.CopyTo(file);
                File.Move(temp, destination, overwrite: true);
            }
            return true;
        }
        catch (Exception ex)
        {
            PrepareError.Text = "Could not prepare extension files: " + ex.Message;
            PrepareError.Visibility = Visibility.Visible;
            return false;
        }
    }

    private static string? FindDefaultBrowserExecutable()
    {
        try
        {
            // ASSOCSTR_EXECUTABLE = 2. Read the user's default HTTPS browser.
            uint length = 2048;
            var buffer = new StringBuilder((int)length);
            var hr = AssocQueryString(0, 2, "https", null, buffer, ref length);
            if (hr == 0)
            {
                var executable = buffer.ToString().Trim().Trim('"');
                if (File.Exists(executable)) return executable;
            }
        }
        catch { /* Fall back to installed Chromium browsers. */ }
        return null;
    }

    private static string? ExtensionsUrlFor(string executable)
    {
        var name = Path.GetFileName(executable).ToLowerInvariant();
        return name switch
        {
            "chrome.exe" or "chromium.exe" => "chrome://extensions",
            "msedge.exe" => "edge://extensions",
            "brave.exe" => "brave://extensions",
            "vivaldi.exe" => "vivaldi://extensions",
            "opera.exe" => "opera://extensions",
            "launcher.exe" when executable.Contains("opera", StringComparison.OrdinalIgnoreCase) => "opera://extensions",
            _ => null // Firefox does not support Chromium extensions.
        };
    }

    private static string? FindSupportedBrowser(out string? url)
    {
        var defaultBrowser = FindDefaultBrowserExecutable();
        if (defaultBrowser != null)
        {
            url = ExtensionsUrlFor(defaultBrowser);
            if (url != null) return defaultBrowser;
        }
        foreach (var executable in new[] { "chrome.exe", "msedge.exe" })
        {
            foreach (var hive in new[] { Registry.CurrentUser, Registry.LocalMachine })
            {
                try
                {
                    using var key = hive.OpenSubKey(
                        @"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\" + executable);
                    var path = key?.GetValue("") as string;
                    if (!string.IsNullOrWhiteSpace(path) && File.Exists(path))
                    {
                        url = ExtensionsUrlFor(path);
                        return path;
                    }
                }
                catch { /* Continue to well-known installation locations. */ }
            }
        }
        foreach (var root in new[]
        {
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
        })
        {
            foreach (var relative in new[]
            {
                @"Google\Chrome\Application\chrome.exe",
                @"Microsoft\Edge\Application\msedge.exe"
            })
            {
                var path = Path.Combine(root, relative);
                if (File.Exists(path))
                {
                    url = ExtensionsUrlFor(path);
                    return path;
                }
            }
        }
        url = null;
        return null;
    }

    private async void OpenChrome_Click(object sender, RoutedEventArgs e) =>
        await OpenExtensionsPageAsync();

    private async Task OpenExtensionsPageAsync()
    {
        if (_openingBrowser) return;
        _openingBrowser = true;
        NextButton.IsEnabled = false;
        RetryBrowserButton.IsEnabled = false;
        ChromeStatus.Text = "Opening the Extensions page…";

        try
        {
            var executable = FindSupportedBrowser(out var extensionsUrl);
            if (executable is null || extensionsUrl is null)
            {
                ChromeStatus.Text = "Chrome or Edge was not found. Install a Chromium browser first.";
                return;
            }

            BrowserIllustrationUrl.Text = extensionsUrl;

            // Launch the actual browser executable, not the Windows URL handler.
            // Many Windows URL handlers drop internal chrome:// URLs.
            var start = new ProcessStartInfo(executable)
            {
                UseShellExecute = false,
                WorkingDirectory = Path.GetDirectoryName(executable) ?? Environment.CurrentDirectory
            };
            start.ArgumentList.Add("--new-window");
            start.ArgumentList.Add(extensionsUrl);
            Process.Start(start);

            // Some browsers open their home page even when given chrome://extensions
            // as a command-line argument. We deliberately navigate via the actual
            // browser's address bar, without changing the user's clipboard or policy.
            bool navigated = await TryNavigateBrowserAddressBarAsync(executable, extensionsUrl);
            ChromeStatus.Text = navigated
                ? "Sent the Extensions address directly to your browser. Continue once the page opens."
                : "Browser started, but Windows didn't allow this installer to focus it. Click ‘Open Extensions again’ to retry.";
        }
        catch (Exception ex)
        {
            ChromeStatus.Text = "Couldn't open the Extensions page: " + ex.Message;
        }
        finally
        {
            _openingBrowser = false;
            NextButton.IsEnabled = true;
            RetryBrowserButton.IsEnabled = true;
        }
    }

    private static async Task<bool> TryNavigateBrowserAddressBarAsync(string executable, string url)
    {
        for (int attempt = 0; attempt < 12; attempt++)
        {
            await Task.Delay(attempt == 0 ? 850 : 250);
            var target = FindBrowserWindow(executable);
            if (target == IntPtr.Zero) continue;
            ShowWindow(target, 9); // SW_RESTORE
            SetForegroundWindow(target);
            await Task.Delay(140);

            // Never type into another application: verify the browser is focused.
            var active = GetForegroundWindow();
            if (active == IntPtr.Zero || !BelongsToExecutable(active, executable))
                continue;

            if (!SendKeyboardComboAndUrl(url)) return false;
            return true;
        }
        return false;
    }

    private static IntPtr FindBrowserWindow(string executable)
    {
        var active = GetForegroundWindow();
        if (active != IntPtr.Zero && BelongsToExecutable(active, executable))
            return active;

        var processName = Path.GetFileNameWithoutExtension(executable);
        foreach (var process in Process.GetProcessesByName(processName))
        {
            try
            {
                if (process.MainWindowHandle != IntPtr.Zero &&
                    IsWindowVisible(process.MainWindowHandle) &&
                    BelongsToExecutable(process.MainWindowHandle, executable))
                    return process.MainWindowHandle;
            }
            catch { /* Try the next browser process. */ }
            finally { process.Dispose(); }
        }
        return IntPtr.Zero;
    }

    private static bool BelongsToExecutable(IntPtr hwnd, string executable)
    {
        GetWindowThreadProcessId(hwnd, out uint processId);
        if (processId == 0) return false;
        try
        {
            using var process = Process.GetProcessById(checked((int)processId));
            return string.Equals(process.MainModule?.FileName, executable, StringComparison.OrdinalIgnoreCase);
        }
        catch { return false; }
    }

    // SendInput simulates only Ctrl+L, the internal page address, and Enter.
    // It never changes browser settings, Chrome policy, or Chrome's extension approval.
    private static bool SendKeyboardComboAndUrl(string url)
    {
        return SendKey(0x11, false) && // Ctrl down
               SendKey(0x4C, false) && // L down
               SendKey(0x4C, true) &&
               SendKey(0x11, true) &&
               SendUnicodeText(url) &&
               SendKey(0x0D, false) && // Enter down
               SendKey(0x0D, true);
    }

    private static bool SendKey(ushort virtualKey, bool keyUp)
    {
        var input = new INPUT
        {
            type = 1,
            union = new InputUnion
            {
                keyboard = new KEYBDINPUT { wVk = virtualKey, dwFlags = keyUp ? 0x0002u : 0u }
            }
        };
        return SendInput(1, new[] { input }, Marshal.SizeOf<INPUT>()) == 1;
    }

    private static bool SendUnicodeText(string text)
    {
        foreach (char character in text)
        {
            foreach (bool keyUp in new[] { false, true })
            {
                var input = new INPUT
                {
                    type = 1,
                    union = new InputUnion
                    {
                        keyboard = new KEYBDINPUT
                        {
                            wScan = character,
                            dwFlags = 0x0004u | (keyUp ? 0x0002u : 0u)
                        }
                    }
                };
                if (SendInput(1, new[] { input }, Marshal.SizeOf<INPUT>()) != 1) return false;
            }
        }
        return true;
    }

    private void CopyPath_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            Clipboard.SetText(ExtensionFolder);
            FolderStatus.Text = "Folder path copied. Paste it into Chrome's folder picker.";
        }
        catch { FolderStatus.Text = "Unable to use clipboard. The folder path is shown above."; }
    }

    private void OpenFolder_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            Process.Start(new ProcessStartInfo("explorer.exe")
            {
                UseShellExecute = true,
                ArgumentList = { ExtensionFolder }
            });
            FolderStatus.Text = "Opened your extension folder. Select this folder in Chrome.";
        }
        catch (Exception ex) { FolderStatus.Text = "Could not open folder: " + ex.Message; }
    }

    [DllImport("shlwapi.dll", CharSet = CharSet.Unicode)]
    private static extern uint AssocQueryString(uint flags, uint str, string association,
        string? extra, StringBuilder result, ref uint length);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetForegroundWindow(IntPtr hwnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ShowWindow(IntPtr hwnd, int command);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool IsWindowVisible(IntPtr hwnd);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint count, INPUT[] input, int size);

    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT
    {
        public uint type;
        public InputUnion union;
    }

    // Include the MOUSEINPUT field to give the union its correct native size
    // (32 bytes on x64), even though this application sends only keyboard input.
    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public MOUSEINPUT mouse;
        [FieldOffset(0)] public KEYBDINPUT keyboard;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr extraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr extraInfo;
    }
}
