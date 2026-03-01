package com.panoptikon.app.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class DashboardStats(
    @SerialName("online_devices") val onlineDevices: Int = 0,
    @SerialName("total_devices") val totalDevices: Int = 0,
    @SerialName("unread_alerts") val unreadAlerts: Int = 0,
    @SerialName("wan_download_mbps") val wanDownloadMbps: Double? = null,
    @SerialName("wan_upload_mbps") val wanUploadMbps: Double? = null,
    @SerialName("agents_online") val agentsOnline: Int = 0,
    @SerialName("agents_total") val agentsTotal: Int = 0,
)

@Serializable
data class Device(
    val id: Int,
    val mac: String,
    val name: String? = null,
    @SerialName("custom_name") val customName: String? = null,
    val vendor: String? = null,
    @SerialName("is_online") val isOnline: Boolean = false,
    @SerialName("ip_address") val ipAddress: String? = null,
    @SerialName("first_seen") val firstSeen: String? = null,
    @SerialName("last_seen") val lastSeen: String? = null,
    @SerialName("device_type") val deviceType: String? = null,
    @SerialName("os_name") val osName: String? = null,
    @SerialName("open_ports") val openPorts: List<Int>? = null,
) {
    val displayName: String
        get() = customName ?: name ?: mac
}

@Serializable
data class Alert(
    val id: Int,
    @SerialName("alert_type") val alertType: String,
    val message: String,
    val severity: String = "info",
    @SerialName("is_read") val isRead: Boolean = false,
    @SerialName("created_at") val createdAt: String,
    @SerialName("device_mac") val deviceMac: String? = null,
    @SerialName("device_name") val deviceName: String? = null,
)

@Serializable
data class Agent(
    val id: Int,
    val name: String,
    val hostname: String? = null,
    @SerialName("is_online") val isOnline: Boolean = false,
    @SerialName("last_seen") val lastSeen: String? = null,
    @SerialName("cpu_usage") val cpuUsage: Double? = null,
    @SerialName("memory_usage") val memoryUsage: Double? = null,
    val version: String? = null,
)

@Serializable
data class TopDevice(
    val mac: String,
    val name: String? = null,
    @SerialName("download_bytes") val downloadBytes: Long = 0,
    @SerialName("upload_bytes") val uploadBytes: Long = 0,
)

@Serializable
data class RouterStatus(
    val hostname: String? = null,
    val model: String? = null,
    val version: String? = null,
    val uptime: String? = null,
    @SerialName("cpu_usage") val cpuUsage: Double? = null,
    @SerialName("memory_usage") val memoryUsage: Double? = null,
)

@Serializable
data class AuthStatus(
    @SerialName("authenticated") val isAuthenticated: Boolean = false,
    val username: String? = null,
    @SerialName("auth_enabled") val authEnabled: Boolean = false,
)

@Serializable
data class LoginRequest(
    val username: String,
    val password: String,
)

@Serializable
data class LoginResponse(
    val token: String? = null,
    val error: String? = null,
)
