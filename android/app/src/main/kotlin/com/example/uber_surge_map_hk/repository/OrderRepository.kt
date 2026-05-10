package com.example.uber_surge_map_hk.repository

import android.content.Context
import android.content.SharedPreferences
import androidx.lifecycle.MutableLiveData
import com.example.uber_surge_map_hk.model.FilterRules
import com.example.uber_surge_map_hk.model.OrderModel
import com.example.uber_surge_map_hk.model.OrderResult

object OrderRepository {

    val DEFAULT_PACKAGES = listOf(
        // OKGO 可以出發（香港網約車司機專用）
        "www.okgo.sj"
    )

    // ── Live data observed by UI ─────────────────────────────────────────────
    val liveOrder       = MutableLiveData<OrderModel?>(null)
    val orderHistory    = MutableLiveData<List<OrderModel>>(emptyList())
    val serviceEnabled  = MutableLiveData(false)
    val totalDetected   = MutableLiveData(0)
    val totalAutoAccepted = MutableLiveData(0)
    val filterRules     = MutableLiveData(FilterRules())
    val targetPackages  = MutableLiveData<List<String>>(DEFAULT_PACKAGES)

    private val _history = mutableListOf<OrderModel>()

    // ── Prefs keys ───────────────────────────────────────────────────────────
    private const val PREFS = "order_assistant_prefs"
    private const val KEY_AUTO_ACCEPT   = "auto_accept_enabled"
    private const val KEY_MIN_FARE      = "min_fare"
    private const val KEY_MAX_PICKUP    = "max_pickup_km"
    private const val KEY_MIN_TRIP      = "min_trip_km"
    private const val KEY_MIN_FARE_PER_KM = "min_fare_per_km"
    private const val KEY_BLACKLIST     = "blacklist_keywords"
    private const val KEY_WHITELIST     = "whitelist_keywords"
    private const val KEY_DELAY_MS      = "accept_delay_ms"
    private const val KEY_PACKAGES      = "target_packages"

    // ── Init from SharedPreferences ──────────────────────────────────────────
    fun init(ctx: Context) {
        val p = prefs(ctx)
        filterRules.value = FilterRules(
            autoAcceptEnabled = p.getBoolean(KEY_AUTO_ACCEPT, false),
            minFare           = p.getFloat(KEY_MIN_FARE, 0f).toDouble(),
            maxPickupKm       = p.getFloat(KEY_MAX_PICKUP, 5f).toDouble(),
            minTripKm         = p.getFloat(KEY_MIN_TRIP, 0f).toDouble(),
            minFarePerKm      = p.getFloat(KEY_MIN_FARE_PER_KM, 0f).toDouble(),
            blacklistKeywords = p.getString(KEY_BLACKLIST, "") ?: "",
            whitelistKeywords = p.getString(KEY_WHITELIST, "") ?: "",
            acceptDelayMs     = p.getInt(KEY_DELAY_MS, 800)
        )
        val saved = p.getString(KEY_PACKAGES, null)
        targetPackages.value = if (saved.isNullOrEmpty()) DEFAULT_PACKAGES
                               else saved.split(",").map { it.trim() }
    }

    fun saveRules(ctx: Context, rules: FilterRules) {
        filterRules.postValue(rules)
        prefs(ctx).edit().apply {
            putBoolean(KEY_AUTO_ACCEPT,   rules.autoAcceptEnabled)
            putFloat(KEY_MIN_FARE,        rules.minFare.toFloat())
            putFloat(KEY_MAX_PICKUP,      rules.maxPickupKm.toFloat())
            putFloat(KEY_MIN_TRIP,        rules.minTripKm.toFloat())
            putFloat(KEY_MIN_FARE_PER_KM, rules.minFarePerKm.toFloat())
            putString(KEY_BLACKLIST,      rules.blacklistKeywords)
            putString(KEY_WHITELIST,      rules.whitelistKeywords)
            putInt(KEY_DELAY_MS,          rules.acceptDelayMs)
            apply()
        }
    }

    fun savePackages(ctx: Context, packages: List<String>) {
        targetPackages.postValue(packages)
        prefs(ctx).edit().putString(KEY_PACKAGES, packages.joinToString(",")).apply()
    }

    // ── Called by AccessibilityService (background thread safe) ─────────────
    fun onOrderDetected(order: OrderModel) {
        totalDetected.postValue((totalDetected.value ?: 0) + 1)
        liveOrder.postValue(order)
        addToHistory(order)
    }

    fun onOrderAutoAccepted(order: OrderModel) {
        totalAutoAccepted.postValue((totalAutoAccepted.value ?: 0) + 1)
        order.result = OrderResult.AUTO_ACCEPTED
        replaceInHistory(order)
        liveOrder.postValue(order)
    }

    fun onOrderRejectedByFilter(order: OrderModel) {
        order.result = OrderResult.REJECTED
        replaceInHistory(order)
        // Only clear live card if this order is still the one being shown
        if (liveOrder.value?.id == order.id) {
            liveOrder.postValue(null)
        }
    }

    // ── UI actions ───────────────────────────────────────────────────────────
    fun dismissLiveOrder() {
        val o = liveOrder.value
        if (o != null && o.result == OrderResult.PENDING) {
            o.result = OrderResult.MISSED
            replaceInHistory(o)
        }
        liveOrder.postValue(null)
    }

    fun clearHistory() {
        _history.clear()
        orderHistory.postValue(emptyList())
        totalDetected.postValue(0)
        totalAutoAccepted.postValue(0)
    }

    // ── Helpers ──────────────────────────────────────────────────────────────
    private fun addToHistory(order: OrderModel) {
        _history.removeAll { it.id == order.id }
        _history.add(0, order)
        if (_history.size > 300) _history.removeAt(_history.lastIndex)
        orderHistory.postValue(_history.toList())
    }

    private fun replaceInHistory(order: OrderModel) {
        val idx = _history.indexOfFirst { it.id == order.id }
        if (idx >= 0) _history[idx] = order else _history.add(0, order)
        orderHistory.postValue(_history.toList())
    }

    private fun prefs(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
