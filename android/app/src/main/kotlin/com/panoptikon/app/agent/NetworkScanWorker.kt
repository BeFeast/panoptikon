package com.panoptikon.app.agent

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

/**
 * WorkManager worker that performs periodic local network scanning
 * and reports results back to the Panoptikon server.
 *
 * Currently a scaffold — full implementation will include:
 * - Local network ARP scan
 * - Service availability checks (HTTP, DNS, etc.)
 * - Presence detection (WiFi SSID / geofence)
 * - Reporting results to server via REST API
 */
class NetworkScanWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    companion object {
        private const val TAG = "NetworkScanWorker"
    }

    override suspend fun doWork(): Result {
        Log.d(TAG, "Starting network scan")

        val networkInfo = getNetworkInfo()
        Log.d(TAG, "Network: connected=${networkInfo.isConnected}, wifi=${networkInfo.isWifi}")

        // TODO: Implement full scanning logic
        // 1. ARP scan for local devices
        // 2. Check known service endpoints
        // 3. Report presence status to server
        // 4. Report scan results to server

        Log.d(TAG, "Network scan complete")
        return Result.success()
    }

    private fun getNetworkInfo(): NetworkInfo {
        val cm = applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return NetworkInfo(false, false)
        val capabilities = cm.getNetworkCapabilities(network) ?: return NetworkInfo(false, false)

        return NetworkInfo(
            isConnected = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET),
            isWifi = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI),
        )
    }

    private data class NetworkInfo(
        val isConnected: Boolean,
        val isWifi: Boolean,
    )
}
