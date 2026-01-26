# Window Transparency

## Current Status

The app has a "Transparency" slider in Settings > Terminal > Window that adjusts the background opacity. However, this does **not** show the macOS desktop behind the window - it only lightens the background color.

## Why True Transparency Isn't Implemented

To see the desktop through the window on macOS, Tauri requires enabling `macOSPrivateApi` in `tauri.conf.json`:

```json
{
  "app": {
    "macOSPrivateApi": true
  }
}
```

**This blocks App Store submission.** Apple rejects apps using private APIs.

### What macOSPrivateApi enables

- `NSVisualEffectView` for native vibrancy/blur effects
- True window transparency (see-through to desktop)
- `fullScreenEnabled` preference

### Alternatives considered

1. **CSS `backdrop-filter: blur()`** - Only blurs content *within* the webview, not the desktop behind it. Also has known bugs with Tauri's transparent window mode.

2. **iTerm2's approach** - Custom blur shader on captured desktop content. Too complex for our use case.

3. **Simple transparency without blur** - Requires `macOSPrivateApi` anyway.

## Future Options

If we decide App Store isn't required:
1. Add `"macOSPrivateApi": true` to `tauri.conf.json`
2. Use `window-vibrancy` crate for native blur effects
3. Distribute via direct download (still notarizable)

## Current Implementation

The "Transparency" slider adjusts `--theme-bg-transparent` CSS variable, which sets the background color's alpha channel. This provides a dimming effect but not true transparency.

## References

- [Tauri Window Customization](https://v2.tauri.app/learn/window-customization/)
- [window-vibrancy crate](https://github.com/tauri-apps/window-vibrancy)
- [Tauri docs issue on macOSPrivateApi](https://github.com/tauri-apps/tauri-docs/issues/463)
