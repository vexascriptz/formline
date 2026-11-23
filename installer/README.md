# drop. Windows installer (v0.9)

A small, native-feeling WPF installer for the existing drop. Chrome extension.

- Single Windows x64 `.exe`, built on GitHub Actions from the checked-in source.
- Does not request administrator privileges, modify Chrome policy, or install a browser extension without user approval.
- Embeds the current `extension/{manifest.json,main.js,popup.html}` at build time. It writes them into `%LOCALAPPDATA%\drop\extension`.
- Opens Chrome's official `chrome://extensions` page. Users must select **Developer mode → Load unpacked** themselves, then select the extension folder shown in the app.
- No network requests, telemetry, elevation, or browser policy changes from the installer. The installed extension itself sends the video ID to the user's existing Daki server, currently over HTTP; this should be upgraded to HTTPS before wider distribution.

## Build

Windows 10/11 with .NET 8 SDK:

```powershell
dotnet publish installer/DropInstaller.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:EnableCompressionInSingleFile=true
```

The GitHub Actions workflow publishes the binary as a Release download.

## Windows SmartScreen warning

The executable is **not code-signed**. Running without administrator permissions avoids a Windows elevation consent dialog, but does **not** suppress SmartScreen or a Windows `Unknown publisher` notice. The proper way to identify a publisher is to sign the binary with a trusted code-signing certificate; Microsoft Defender SmartScreen reputation can still require time or additional trust. Do not disable Windows security or try to conceal signer status.
