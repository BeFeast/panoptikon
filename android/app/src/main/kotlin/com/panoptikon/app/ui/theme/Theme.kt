package com.panoptikon.app.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val DarkColorScheme = darkColorScheme(
    primary = Blue500,
    onPrimary = Slate50,
    primaryContainer = Blue600,
    onPrimaryContainer = Slate100,
    secondary = Slate600,
    onSecondary = Slate100,
    secondaryContainer = Slate700,
    onSecondaryContainer = Slate200,
    tertiary = Green500,
    onTertiary = Slate50,
    background = Slate950,
    onBackground = Slate100,
    surface = Slate900,
    onSurface = Slate100,
    surfaceVariant = Slate800,
    onSurfaceVariant = Slate300,
    outline = Slate600,
    outlineVariant = Slate700,
    error = Red500,
    onError = Slate50,
)

private val LightColorScheme = lightColorScheme(
    primary = Blue600,
    onPrimary = Slate50,
    primaryContainer = Blue400,
    onPrimaryContainer = Slate900,
    secondary = Slate500,
    onSecondary = Slate50,
    secondaryContainer = Slate200,
    onSecondaryContainer = Slate800,
    tertiary = Green500,
    onTertiary = Slate50,
    background = Slate50,
    onBackground = Slate900,
    surface = Slate100,
    onSurface = Slate900,
    surfaceVariant = Slate200,
    onSurfaceVariant = Slate600,
    outline = Slate400,
    outlineVariant = Slate300,
    error = Red500,
    onError = Slate50,
)

@Composable
fun PanoptikonTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content,
    )
}
