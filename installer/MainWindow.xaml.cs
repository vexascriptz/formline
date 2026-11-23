using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
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

    public MainWindow()
    {
        InitializeComponent();
        FolderPathText.Text = ExtensionFolder;
        SetStage(0);
    }

    private void Titlebar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ChangedButton == MouseButton.Left && e.ButtonState == MouseButtonState.Pressed)
        {
            try { DragMove(); } catch (InvalidOperationException) { }
        }
    }

    private void Close_Click(object sender, RoutedEventArgs e) => Close();
    private void Minimize_Click(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;

    private void SetStage(int stage)
    {
        PrepareView.Visibility = stage == 0 ? Visibility.Visible : Visibility.Collapsed;
        ChromeView.Visibility = stage == 1 ? Visibility.Visible : Visibility.Collapsed;
        DoneView.Visibility = stage == 2 ? Visibility.Visible : Visibility.Collapsed;

        var dots = new[] { DotOne, DotTwo, DotThree };
        var labels = new[] { LabelOne, LabelTwo, LabelThree };
        var numbers = new[] { null, NumTwo, NumThree };
        for (var i = 0; i < 3; i++)
        {
            var selected = i == stage;
            var finished = i < stage;
            dots[i].Background = new SolidColorBrush(
                (Color)ColorConverter.ConvertFromString(selected ? "#B999FF" : finished ? "#463356" : "#302A39"));
            labels[i].Foreground = new SolidColorBrush(
                (Color)ColorConverter.ConvertFromString(selected ? "#F5F1FB" : finished ? "#A99AB7" : "#897F94"));
            labels[i].FontWeight = selected ? FontWeights.SemiBold : FontWeights.Normal;
            if (numbers[i] != null)
                numbers[i]!.Foreground = new SolidColorBrush(
                    (Color)ColorConverter.ConvertFromString(selected ? "#1B1323" : "#9D90AC"));
        }
    }

    private void Install_Click(object sender, RoutedEventArgs e)
    {
        InstallButton.IsEnabled = false;
        PrepareError.Visibility = Visibility.Collapsed;
        try
        {
            Directory.CreateDirectory(ExtensionFolder);
            // Only these three embedded files are written. No registry edits or Chrome policy changes.
            foreach (var name in new[] { "manifest.json", "main.js", "popup.html" })
            {
                var resourceName = $"DropInstaller.Payload.{name}";
                using var resource = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName)
                    ?? throw new InvalidOperationException($"Missing embedded extension file: {name}");
                var destination = Path.Combine(ExtensionFolder, name);
                var temporary = destination + ".tmp";
                using (var output = new FileStream(temporary, FileMode.Create, FileAccess.Write, FileShare.None))
                    resource.CopyTo(output);
                File.Move(temporary, destination, true);
            }
            SetStage(1);
        }
        catch (Exception ex)
        {
            PrepareError.Text = $"Couldn't prepare the files: {ex.Message}";
            PrepareError.Visibility = Visibility.Visible;
        }
        finally
        {
            InstallButton.IsEnabled = true;
        }
    }

    private static string? FindChrome()
    {
        foreach (var hive in new[] { Registry.CurrentUser, Registry.LocalMachine })
        {
            try
            {
                using var key = hive.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe");
                var path = key?.GetValue("") as string;
                if (!string.IsNullOrWhiteSpace(path) && File.Exists(path)) return path;
            }
            catch { /* No permission to inspect a registry view; try local paths. */ }
        }
        foreach (var path in new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome\Application\chrome.exe")
        })
            if (File.Exists(path)) return path;
        return null;
    }

    private void OpenChrome_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var executable = FindChrome();
            if (executable is null)
            {
                ChromeStatus.Text = "Chrome wasn't found. Open Chrome manually and enter chrome://extensions in its address bar.";
                if (DoneView.IsVisible) SetStage(1);
                return;
            }
            Process.Start(new ProcessStartInfo
            {
                FileName = executable,
                Arguments = "chrome://extensions",
                UseShellExecute = true
            });
            ChromeStatus.Text = "Chrome opened. Turn on Developer mode, then choose Load unpacked.";
        }
        catch (Exception ex)
        {
            ChromeStatus.Text = "Couldn't open Chrome automatically: " + ex.Message;
            if (DoneView.IsVisible) SetStage(1);
        }
    }

    private void CopyPath_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            Clipboard.SetText(ExtensionFolder);
            ChromeStatus.Text = "Copied. Paste this folder path into Chrome's folder picker.";
        }
        catch
        {
            ChromeStatus.Text = "Copy failed. The full folder path is shown above.";
        }
    }

    private void Finished_Click(object sender, RoutedEventArgs e) => SetStage(2);
}
