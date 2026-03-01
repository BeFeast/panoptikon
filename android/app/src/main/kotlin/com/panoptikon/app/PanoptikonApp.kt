package com.panoptikon.app

import android.app.Application
import com.panoptikon.app.data.api.ApiClient
import com.panoptikon.app.data.repository.PanoptikonRepository
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.runBlocking

private val Application.dataStore by preferencesDataStore(name = "settings")
private val SERVER_URL_KEY = stringPreferencesKey("server_url")

class PanoptikonApp : Application() {

    lateinit var repository: PanoptikonRepository
        private set

    override fun onCreate() {
        super.onCreate()

        // Load saved server URL and configure API client
        val savedUrl = runBlocking {
            dataStore.data.map { it[SERVER_URL_KEY] }.first()
        }
        if (!savedUrl.isNullOrBlank()) {
            ApiClient.configure(savedUrl)
        }

        repository = PanoptikonRepository()
    }
}
