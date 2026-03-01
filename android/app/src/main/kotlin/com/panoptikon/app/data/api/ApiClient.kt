package com.panoptikon.app.data.api

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit

object ApiClient {

    private val json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        isLenient = true
    }

    private var retrofit: Retrofit? = null
    private var api: PanoptikonApi? = null

    fun configure(baseUrl: String, sessionCookie: String? = null) {
        val normalizedUrl = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"

        val client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .apply {
                if (sessionCookie != null) {
                    addInterceptor { chain ->
                        val request = chain.request().newBuilder()
                            .addHeader("Cookie", sessionCookie)
                            .build()
                        chain.proceed(request)
                    }
                }
                addInterceptor(
                    HttpLoggingInterceptor().apply {
                        level = HttpLoggingInterceptor.Level.BASIC
                    }
                )
            }
            .build()

        val contentType = "application/json".toMediaType()
        retrofit = Retrofit.Builder()
            .baseUrl(normalizedUrl)
            .client(client)
            .addConverterFactory(json.asConverterFactory(contentType))
            .build()

        api = retrofit!!.create(PanoptikonApi::class.java)
    }

    fun getApi(): PanoptikonApi {
        return api ?: throw IllegalStateException(
            "API client not configured. Call ApiClient.configure(baseUrl) first."
        )
    }
}
