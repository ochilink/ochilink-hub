# Ochilink Favicon & Icon Package

This package provides a production-ready icon and favicon set generated from the original Ochilink vector mark (`OL.svg`).

---

## 📦 Included Assets & Specifications

| Asset | Dimensions | Format | Purpose |
| :--- | :--- | :--- | :--- |
| `favicon.svg` | Scalable Vector | SVG | Modern browsers (Chrome, Firefox, Safari 16+, Edge). Sharp at any resolution. |
| `favicon.ico` | 16x16, 32x32, 48x48 | Multi-res ICO | Legacy browsers, desktop bookmarks, legacy shortcuts. |
| `favicon-16x16.png` | 16x16 px | Transparent PNG | Standard browser tab icon (1x display). |
| `favicon-32x32.png` | 32x32 px | Transparent PNG | High-DPI / Retina browser tab icon. |
| `favicon-48x48.png` | 48x48 px | Transparent PNG | Windows desktop shortcuts & search listing icon. |
| `favicon-96x96.png` | 96x96 px | Transparent PNG | Google search results icon and taskbar shortcuts. |
| `apple-touch-icon.png` | 180x180 px | PNG (padded) | iOS Safari Add to Home Screen (prevents iOS black background bug). |
| `apple-touch-icon-brand.png` | 180x180 px | PNG (#00532b) | Alternative Apple touch icon with brand forest green background. |
| `android-chrome-192x192.png` | 192x192 px | PNG | Android Chrome home screen & PWA installable app icon. |
| `android-chrome-512x512.png` | 512x512 px | PNG | PWA splash screen & high-res mobile icon. |
| `android-chrome-maskable-192x192.png` | 192x192 px | PNG (maskable) | Android adaptive icon with 18% safe-zone margin. |
| `android-chrome-maskable-512x512.png` | 512x512 px | PNG (maskable) | High-res Android adaptive icon. |
| `mstile-150x150.png` | 150x150 px | PNG (#00532b) | Windows Start Menu pinned tile icon. |
| `icon-1024x1024.png` | 1024x1024 px | PNG | Master high-res brand icon for app stores, avatars, and marketing. |
| `site.webmanifest` | JSON | Manifest | Web App Manifest configuration file. |
| `browserconfig.xml` | XML | Config | Microsoft Windows browser tile configuration. |

---

## 🚀 HTML Integration

Add the following tags to the `<head>` section of your website or web application:

```html
<!-- Primary Vector Favicon (Modern Browsers) -->
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />

<!-- Fallback PNG Favicons -->
<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />

<!-- Legacy Favicon for older browsers -->
<link rel="shortcut icon" href="/favicon.ico" />

<!-- Apple Touch Icon (iOS Home Screen) -->
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />

<!-- Web App Manifest (Android, Chrome, PWA) -->
<link rel="manifest" href="/site.webmanifest" />

<!-- Browser & Theme Colors -->
<meta name="apple-mobile-web-app-title" content="Ochilink" />
<meta name="application-name" content="Ochilink" />
<meta name="theme-color" content="#00532b" />
<meta name="msapplication-TileColor" content="#00532b" />
<meta name="msapplication-config" content="/browserconfig.xml" />
```

---

## 📱 `site.webmanifest` Configuration

```json
{
  "name": "Ochilink",
  "short_name": "Ochilink",
  "icons": [
    {
      "src": "/favicon-16x16.png",
      "sizes": "16x16",
      "type": "image/png"
    },
    {
      "src": "/favicon-32x32.png",
      "sizes": "32x32",
      "type": "image/png"
    },
    {
      "src": "/android-chrome-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/android-chrome-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    },
    {
      "src": "/android-chrome-maskable-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/android-chrome-maskable-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "theme_color": "#00532b",
  "background_color": "#ffffff",
  "display": "standalone"
}
```

---

## 🎨 Brand Palette Summary

- **Primary Dark Green**: `#00532b` (Deep forest shadow & theme color)
- **Primary Mid Green**: `#417b37` (Gradient start)
- **Accent Kelly Green**: `#67a135` (Gradient highlight)
- **Background Contrast**: `#ffffff` (White base for iOS/maskable safe padding)
