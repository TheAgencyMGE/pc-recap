# Install PC Recap

Download PC Recap only from the [official GitHub Releases page](https://github.com/TheAgencyMGE/pc-recap/releases/latest). Version 1.2 beta packages are unsigned, so your operating system may ask you to confirm that you trust the download.

## Windows 10 and 11

1. Download `PC-Recap-1.2.0-Setup.exe`.
2. Open the installer.
3. If Microsoft Defender SmartScreen appears, confirm that the file came from the official PC Recap release, choose **More info**, then choose **Run anyway**.
4. Choose an installation folder and finish setup.

PC Recap can keep tracking from the system tray after its window closes. Startup launch is optional and can be changed in Settings.

## macOS 12 or newer

Choose the correct DMG:

- Apple Silicon (`arm64`) for M1, M2, M3, M4, and newer Apple silicon Macs.
- Intel (`x64`) for Intel-based Macs.

Then:

1. Open the downloaded DMG.
2. Drag PC Recap into **Applications**.
3. In Applications, Control-click PC Recap and choose **Open**.
4. If macOS still blocks it, open **System Settings → Privacy & Security**, locate the PC Recap notice, and choose **Open Anyway**.
5. Approve any foreground-app or automation permission PC Recap explains during onboarding.

The beta is not notarized. You should not disable Gatekeeper system-wide to install it.

## Linux x64

Foreground tracking currently requires an X11 session and the `xprop` command. On Wayland, PC Recap still opens but Tracking Health reports foreground collection as unavailable.

### AppImage

```bash
chmod +x PC-Recap-1.2.0-linux-x64.AppImage
./PC-Recap-1.2.0-linux-x64.AppImage
```

If `xprop` is missing, install the package that provides it for your distribution, such as `x11-utils` on Debian or Ubuntu.

### Debian or Ubuntu

```bash
sudo apt install ./PC-Recap-1.2.0-linux-x64.deb
```

## Verify a checksum

Every release asset has a matching `.sha256` file. Download both files from the same release, then compare them locally.

Windows PowerShell:

```powershell
Get-FileHash .\PC-Recap-1.2.0-Setup.exe -Algorithm SHA256
Get-Content .\PC-Recap-1.2.0-Setup.exe.sha256
```

macOS or Linux:

```bash
shasum -a 256 PC-Recap-1.2.0-mac-arm64.dmg
cat PC-Recap-1.2.0-mac-arm64.dmg.sha256
```

The hexadecimal values should match exactly. If they do not, delete the package and download it again from the official release.

## Updating

PC Recap does not auto-update yet. Download the newer package from GitHub Releases and install it over the existing app. Your activity database is stored separately from the application, but making a `.pcr` backup before a beta update is still recommended.

If installation or tracking fails, check the in-app Tracking Health panel and follow [SUPPORT.md](../SUPPORT.md).
