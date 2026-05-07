package com.example.uber_surge_map_hk.model

data class FilterRules(
    var autoAcceptEnabled: Boolean = false,
    var minFare: Double = 0.0,
    var maxPickupKm: Double = 5.0,
    var minTripKm: Double = 0.0,
    var minFarePerKm: Double = 0.0,
    var blacklistKeywords: String = "",
    var whitelistKeywords: String = "",
    var acceptDelayMs: Int = 800
) {
    val blacklistList: List<String>
        get() = blacklistKeywords.split(",").map { it.trim() }.filter { it.isNotEmpty() }

    val whitelistList: List<String>
        get() = whitelistKeywords.split(",").map { it.trim() }.filter { it.isNotEmpty() }

    fun passes(order: OrderModel): Boolean {
        if (minFare > 0 && order.fare > 0 && order.fare < minFare) return false
        if (maxPickupKm > 0 && order.pickupDistanceKm > 0 && order.pickupDistanceKm > maxPickupKm) return false
        if (minTripKm > 0 && order.tripDistanceKm > 0 && order.tripDistanceKm < minTripKm) return false
        if (minFarePerKm > 0 && order.farePerKm > 0 && order.farePerKm < minFarePerKm) return false

        val fullAddr = "${order.pickupAddress} ${order.destinationAddress}"
        if (blacklistList.any { fullAddr.contains(it) }) return false
        if (whitelistList.isNotEmpty() && whitelistList.none { fullAddr.contains(it) }) return false

        return true
    }
}
