# Launcher Icons Placeholder

The following mipmap directories need launcher icons:
- mipmap-mdpi (48x48)
- mipmap-hdpi (72x72)
- mipmap-xhdpi (96x96)
- mipmap-xxhdpi (144x144)
- mipmap-xxxhdpi (192x192)

## Quick Setup Options:

### Option 1: Android Studio Image Asset Tool
1. Right-click on `res` folder
2. New → Image Asset
3. Choose Icon Type: "Launcher Icons (Adaptive and Legacy)"
4. Upload your icon image
5. Click "Next" → "Finish"

### Option 2: Use Default Android Icons (Temporary)
The app will use Android's default launcher icons until custom ones are added.

### Option 3: Online Icon Generator
1. Visit: https://romannurik.github.io/AndroidAssetStudio/icons-launcher.html
2. Upload your icon
3. Download the generated assets
4. Extract to `app/src/main/res/`

## Required Files:
- `ic_launcher.png` (legacy icon)
- `ic_launcher_round.png` (round icon for some devices)
- `ic_launcher.xml` (adaptive icon - optional)

For now, the app will compile without custom icons but will show Android's default icon.
