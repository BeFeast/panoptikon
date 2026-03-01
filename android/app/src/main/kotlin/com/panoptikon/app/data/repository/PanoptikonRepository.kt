package com.panoptikon.app.data.repository

import com.panoptikon.app.data.api.ApiClient
import com.panoptikon.app.data.model.Agent
import com.panoptikon.app.data.model.Alert
import com.panoptikon.app.data.model.AuthStatus
import com.panoptikon.app.data.model.DashboardStats
import com.panoptikon.app.data.model.Device
import com.panoptikon.app.data.model.LoginRequest
import com.panoptikon.app.data.model.RouterStatus
import com.panoptikon.app.data.model.TopDevice

class PanoptikonRepository {

    private val api get() = ApiClient.getApi()

    suspend fun authStatus(): Result<AuthStatus> = runCatching { api.authStatus() }

    suspend fun login(username: String, password: String): Result<Unit> = runCatching {
        api.login(LoginRequest(username, password))
    }

    suspend fun logout(): Result<Unit> = runCatching { api.logout() }

    suspend fun dashboardStats(): Result<DashboardStats> = runCatching { api.dashboardStats() }

    suspend fun topDevices(): Result<List<TopDevice>> = runCatching { api.topDevices() }

    suspend fun devices(): Result<List<Device>> = runCatching { api.devices() }

    suspend fun device(id: Int): Result<Device> = runCatching { api.device(id) }

    suspend fun alerts(unreadOnly: Boolean = false): Result<List<Alert>> = runCatching {
        api.alerts(unreadOnly)
    }

    suspend fun markAlertRead(id: Int): Result<Unit> = runCatching { api.markAlertRead(id) }

    suspend fun markAllAlertsRead(): Result<Unit> = runCatching { api.markAllAlertsRead() }

    suspend fun agents(): Result<List<Agent>> = runCatching { api.agents() }

    suspend fun routerStatus(): Result<RouterStatus> = runCatching { api.mikrotikStatus() }
}
