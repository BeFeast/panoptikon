package com.panoptikon.app.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Router
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.panoptikon.app.data.repository.PanoptikonRepository
import com.panoptikon.app.ui.screens.alerts.AlertsScreen
import com.panoptikon.app.ui.screens.dashboard.DashboardScreen
import com.panoptikon.app.ui.screens.devices.DevicesScreen
import com.panoptikon.app.ui.screens.router.RouterScreen
import com.panoptikon.app.ui.screens.settings.SettingsScreen

enum class Screen(val route: String, val label: String, val icon: ImageVector) {
    Dashboard("dashboard", "Dashboard", Icons.Default.Dashboard),
    Devices("devices", "Devices", Icons.Default.Devices),
    Router("router", "Router", Icons.Default.Router),
    Alerts("alerts", "Alerts", Icons.Default.Notifications),
    Settings("settings", "Settings", Icons.Default.Settings),
}

@Composable
fun PanoptikonNavGraph(repository: PanoptikonRepository) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination

    Scaffold(
        bottomBar = {
            NavigationBar {
                Screen.entries.forEach { screen ->
                    NavigationBarItem(
                        icon = { Icon(screen.icon, contentDescription = screen.label) },
                        label = { Text(screen.label) },
                        selected = currentDestination?.hierarchy?.any { it.route == screen.route } == true,
                        onClick = {
                            navController.navigate(screen.route) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                    )
                }
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Dashboard.route,
            modifier = Modifier.padding(innerPadding),
        ) {
            composable(Screen.Dashboard.route) { DashboardScreen(repository) }
            composable(Screen.Devices.route) { DevicesScreen(repository) }
            composable(Screen.Router.route) { RouterScreen(repository) }
            composable(Screen.Alerts.route) { AlertsScreen(repository) }
            composable(Screen.Settings.route) { SettingsScreen() }
        }
    }
}
