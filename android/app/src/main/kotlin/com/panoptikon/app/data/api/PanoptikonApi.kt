package com.panoptikon.app.data.api

import com.panoptikon.app.data.model.Agent
import com.panoptikon.app.data.model.Alert
import com.panoptikon.app.data.model.AuthStatus
import com.panoptikon.app.data.model.DashboardStats
import com.panoptikon.app.data.model.Device
import com.panoptikon.app.data.model.LoginRequest
import com.panoptikon.app.data.model.LoginResponse
import com.panoptikon.app.data.model.RouterStatus
import com.panoptikon.app.data.model.TopDevice
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface PanoptikonApi {

    // Auth
    @GET("api/v1/auth/status")
    suspend fun authStatus(): AuthStatus

    @POST("api/v1/auth/login")
    suspend fun login(@Body request: LoginRequest): LoginResponse

    @POST("api/v1/auth/logout")
    suspend fun logout()

    // Dashboard
    @GET("api/v1/dashboard/stats")
    suspend fun dashboardStats(): DashboardStats

    @GET("api/v1/dashboard/top-devices")
    suspend fun topDevices(): List<TopDevice>

    // Devices
    @GET("api/v1/devices")
    suspend fun devices(): List<Device>

    @GET("api/v1/devices/{id}")
    suspend fun device(@Path("id") id: Int): Device

    // Alerts
    @GET("api/v1/alerts")
    suspend fun alerts(@Query("unread") unreadOnly: Boolean = false): List<Alert>

    @PATCH("api/v1/alerts/{id}/read")
    suspend fun markAlertRead(@Path("id") id: Int)

    @POST("api/v1/alerts/read-all")
    suspend fun markAllAlertsRead()

    // Agents
    @GET("api/v1/agents")
    suspend fun agents(): List<Agent>

    // Router (MikroTik — primary)
    @GET("api/v1/mikrotik/status")
    suspend fun mikrotikStatus(): RouterStatus
}
