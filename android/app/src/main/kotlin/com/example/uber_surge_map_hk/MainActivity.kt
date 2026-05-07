package com.example.uber_surge_map_hk

import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {

    companion object {
        private const val CONTROL_CHANNEL = "order_assistant/control"
        private const val ORDER_EVENTS_CHANNEL = "order_assistant/orders"
        private const val STATUS_EVENTS_CHANNEL = "order_assistant/status"

        private var orderEventSink: EventChannel.EventSink? = null
        private var statusEventSink: EventChannel.EventSink? = null

        fun sendOrderEvent(json: String) {
            orderEventSink?.success(json)
        }

        fun sendStatusEvent(connected: Boolean) {
            statusEventSink?.success(connected)
        }
    }

    private lateinit var prefs: SharedPreferences

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        prefs = getSharedPreferences(OrderAccessibilityService.PREFS_NAME, MODE_PRIVATE)

        // Control method channel: Flutter → Android
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CONTROL_CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "isAccessibilityEnabled" -> result.success(isAccessibilityServiceEnabled())
                    "openAccessibilitySettings" -> {
                        startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                        result.success(null)
                    }
                    "isOverlayPermissionGranted" -> result.success(isOverlayPermissionGranted())
                    "requestOverlayPermission" -> {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                            startActivity(
                                Intent(
                                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                    Uri.parse("package:$packageName")
                                )
                            )
                        }
                        result.success(null)
                    }
                    "updateFilterRules" -> {
                        val args = call.arguments as? Map<*, *>
                        if (args != null) updateFilterRules(args)
                        result.success(null)
                    }
                    "getFilterRules" -> result.success(getFilterRules())
                    "setAutoAcceptEnabled" -> {
                        val enabled = call.argument<Boolean>("enabled") ?: false
                        prefs.edit().putBoolean(OrderAccessibilityService.KEY_AUTO_ACCEPT_ENABLED, enabled).apply()
                        result.success(null)
                    }
                    "isAutoAcceptEnabled" -> {
                        result.success(prefs.getBoolean(OrderAccessibilityService.KEY_AUTO_ACCEPT_ENABLED, false))
                    }
                    "setTargetPackages" -> {
                        val packages = call.argument<List<String>>("packages") ?: listOf()
                        prefs.edit().putString(
                            OrderAccessibilityService.KEY_TARGET_PACKAGES,
                            packages.joinToString(",")
                        ).apply()
                        result.success(null)
                    }
                    "getTargetPackages" -> {
                        val saved = prefs.getString(OrderAccessibilityService.KEY_TARGET_PACKAGES, "")
                        val packages = if (saved.isNullOrEmpty()) {
                            OrderAccessibilityService.DEFAULT_PACKAGES
                        } else {
                            saved.split(",").map { it.trim() }
                        }
                        result.success(packages)
                    }
                    "getInstalledDriverApps" -> result.success(getInstalledDriverApps())
                    else -> result.notImplemented()
                }
            }

        // Order events channel: Android → Flutter
        EventChannel(flutterEngine.dartExecutor.binaryMessenger, ORDER_EVENTS_CHANNEL)
            .setStreamHandler(object : EventChannel.StreamHandler {
                override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
                    orderEventSink = events
                }
                override fun onCancel(arguments: Any?) {
                    orderEventSink = null
                }
            })

        // Service status channel: Android → Flutter
        EventChannel(flutterEngine.dartExecutor.binaryMessenger, STATUS_EVENTS_CHANNEL)
            .setStreamHandler(object : EventChannel.StreamHandler {
                override fun onListen(arguments: Any?, events: EventChannel.EventSink?) {
                    statusEventSink = events
                    // Send current status immediately
                    events?.success(isAccessibilityServiceEnabled())
                }
                override fun onCancel(arguments: Any?) {
                    statusEventSink = null
                }
            })
    }

    private fun isAccessibilityServiceEnabled(): Boolean {
        val serviceName = "$packageName/${OrderAccessibilityService::class.java.canonicalName}"
        val enabledServices = Settings.Secure.getString(
            contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        return enabledServices.split(":").any { it.equals(serviceName, ignoreCase = true) }
    }

    private fun isOverlayPermissionGranted(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(this)
        } else true
    }

    private fun updateFilterRules(args: Map<*, *>) {
        prefs.edit().apply {
            (args["minFare"] as? Double)?.let { putFloat(OrderAccessibilityService.KEY_MIN_FARE, it.toFloat()) }
            (args["maxPickupKm"] as? Double)?.let { putFloat(OrderAccessibilityService.KEY_MAX_PICKUP_KM, it.toFloat()) }
            (args["minTripKm"] as? Double)?.let { putFloat(OrderAccessibilityService.KEY_MIN_TRIP_KM, it.toFloat()) }
            (args["minFarePerKm"] as? Double)?.let { putFloat(OrderAccessibilityService.KEY_MIN_FARE_PER_KM, it.toFloat()) }
            (args["blacklistKeywords"] as? String)?.let { putString(OrderAccessibilityService.KEY_BLACKLIST, it) }
            (args["whitelistKeywords"] as? String)?.let { putString(OrderAccessibilityService.KEY_WHITELIST, it) }
            (args["acceptDelayMs"] as? Int)?.let { putInt(OrderAccessibilityService.KEY_ACCEPT_DELAY_MS, it) }
        }.apply()
    }

    private fun getFilterRules(): Map<String, Any> {
        return mapOf(
            "minFare" to prefs.getFloat(OrderAccessibilityService.KEY_MIN_FARE, 0f).toDouble(),
            "maxPickupKm" to prefs.getFloat(OrderAccessibilityService.KEY_MAX_PICKUP_KM, 5f).toDouble(),
            "minTripKm" to prefs.getFloat(OrderAccessibilityService.KEY_MIN_TRIP_KM, 0f).toDouble(),
            "minFarePerKm" to prefs.getFloat(OrderAccessibilityService.KEY_MIN_FARE_PER_KM, 0f).toDouble(),
            "blacklistKeywords" to (prefs.getString(OrderAccessibilityService.KEY_BLACKLIST, "") ?: ""),
            "whitelistKeywords" to (prefs.getString(OrderAccessibilityService.KEY_WHITELIST, "") ?: ""),
            "acceptDelayMs" to prefs.getInt(OrderAccessibilityService.KEY_ACCEPT_DELAY_MS, 800),
            "autoAcceptEnabled" to prefs.getBoolean(OrderAccessibilityService.KEY_AUTO_ACCEPT_ENABLED, false)
        )
    }

    private fun getInstalledDriverApps(): List<String> {
        val pm = packageManager
        return OrderAccessibilityService.DEFAULT_PACKAGES.filter { pkg ->
            try {
                pm.getPackageInfo(pkg, 0)
                true
            } catch (e: Exception) {
                false
            }
        }
    }

    override fun onResume() {
        super.onResume()
        // Re-check accessibility status when returning to app
        statusEventSink?.success(isAccessibilityServiceEnabled())
    }
}
