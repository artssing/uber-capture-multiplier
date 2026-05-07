package com.example.uber_surge_map_hk.model

import com.google.gson.Gson

enum class OrderResult {
    PENDING, AUTO_ACCEPTED, MANUAL_ACCEPTED, REJECTED, MISSED;

    fun label(): String = when (this) {
        PENDING       -> "待處理"
        AUTO_ACCEPTED -> "自動接單"
        MANUAL_ACCEPTED -> "手動接單"
        REJECTED      -> "已拒絕"
        MISSED        -> "已錯過"
    }
}

data class OrderModel(
    val id: String,
    val fare: Double,
    val tripDistanceKm: Double,
    val pickupDistanceKm: Double,
    val pickupAddress: String,
    val destinationAddress: String,
    val timestampMs: Long,
    var result: OrderResult = OrderResult.PENDING
) {
    val farePerKm: Double get() = if (tripDistanceKm > 0) fare / tripDistanceKm else 0.0

    companion object {
        private val gson = Gson()
        fun fromJson(json: String): OrderModel? = runCatching { gson.fromJson(json, OrderModel::class.java) }.getOrNull()
    }

    fun toJson(): String = Gson().toJson(this)
}
