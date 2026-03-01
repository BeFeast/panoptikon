package com.panoptikon.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.panoptikon.app.ui.navigation.PanoptikonNavGraph
import com.panoptikon.app.ui.theme.PanoptikonTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val app = application as PanoptikonApp

        setContent {
            PanoptikonTheme {
                PanoptikonNavGraph(repository = app.repository)
            }
        }
    }
}
