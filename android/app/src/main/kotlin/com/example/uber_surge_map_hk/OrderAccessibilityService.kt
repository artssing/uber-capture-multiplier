package com.example.uber_surge_map_hk

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean

class OrderAccessibilityService : AccessibilityService() {

    companion object {
        const val TAG = "OrderAssist"
        var instance: OrderAccessibilityService? = null

        // Broadcast actions
        const val ACTION_ORDER_DETECTED = "com.example.uber_surge_map_hk.ORDER_DETECTED"
        const val ACTION_ORDER_ACCEPTED = "com.example.uber_surge_map_hk.ORDER_ACCEPTED"
        const val ACTION_ORDER_REJECTED = "com.example.uber_surge_map_hk.ORDER_REJECTED"
        const val ACTION_SERVICE_STATUS = "com.example.uber_surge_map_hk.SERVICE_STATUS"

        // SharedPreferences keys
        const val PREFS_NAME = "order_assistant_prefs"
        const val KEY_TARGET_PACKAGES = "target_packages"
        const val KEY_AUTO_ACCEPT_ENABLED = "auto_accept_enabled"
        const val KEY_MIN_FARE = "min_fare"
        const val KEY_MAX_PICKUP_KM = "max_pickup_km"
        const val KEY_MIN_TRIP_KM = "min_trip_km"
        const val KEY_MIN_FARE_PER_KM = "min_fare_per_km"
        const val KEY_BLACKLIST = "blacklist_keywords"
        const val KEY_WHITELIST = "whitelist_keywords"
        const val KEY_ACCEPT_DELAY_MS = "accept_delay_ms"

        // Default target packages (Gaode/AutoNavi driver apps)
        val DEFAULT_PACKAGES = listOf(
            "com.autonavi.amap.driver",
            "com.amap.android.driver",
            "com.sdu.didi.psnger",  // DiDi
            "com.didi.driver",
            "com.uber.driver",
        )

        // Text patterns for accept buttons across different apps
        val ACCEPT_BUTTON_TEXTS = listOf(
            "接單", "搶單", "接受", "確認接單", "立即接單",
            "Accept", "ACCEPT", "搶  單", "接  單"
        )

        // Order popup indicator texts
        val ORDER_INDICATOR_TEXTS = listOf(
            "新訂單", "有新訂單", "接單", "搶單", "出發地", "目的地",
            "行程費用", "預計費用", "接客距離", "行程距離"
        )
    }

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var prefs: SharedPreferences
    private val isProcessingOrder = AtomicBoolean(false)
    private var lastOrderHash = ""
    private var vibrator: Vibrator? = null

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        vibrator = getSystemService(VIBRATOR_SERVICE) as? Vibrator
        Log.d(TAG, "OrderAccessibilityService connected")
        broadcastStatus(true)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return

        val packageName = event.packageName?.toString() ?: return
        if (!isTargetPackage(packageName)) return

        when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED,
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> {
                handleWindowChange(event, packageName)
            }
            AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED -> {
                handleNotification(event, packageName)
            }
        }
    }

    private fun handleWindowChange(event: AccessibilityEvent, packageName: String) {
        val rootNode = rootInActiveWindow ?: return
        try {
            detectAndHandleOrder(rootNode, packageName)
        } finally {
            rootNode.recycle()
        }
    }

    private fun handleNotification(event: AccessibilityEvent, packageName: String) {
        val text = event.text.joinToString(" ")
        if (ORDER_INDICATOR_TEXTS.any { text.contains(it) }) {
            Log.d(TAG, "Order notification from $packageName: $text")
        }
    }

    private fun detectAndHandleOrder(root: AccessibilityNodeInfo, packageName: String) {
        // Look for accept button - if present, we likely have an order popup
        val acceptButton = findAcceptButton(root) ?: return

        // Extract order details from the UI tree
        val orderData = extractOrderData(root) ?: return

        // Deduplicate
        val orderHash = "${orderData.fare}_${orderData.pickupAddress}_${orderData.timestamp}"
        if (orderHash == lastOrderHash) return
        lastOrderHash = orderHash

        Log.d(TAG, "Order detected: fare=${orderData.fare}, pickup=${orderData.pickupAddress}, dest=${orderData.destinationAddress}")

        // Vibrate to alert driver
        vibrateAlert()

        // Broadcast order to Flutter app
        broadcastOrderDetected(orderData)

        // Evaluate auto-accept
        if (shouldAutoAccept(orderData)) {
            val delayMs = prefs.getInt(KEY_ACCEPT_DELAY_MS, 800).toLong()
            handler.postDelayed({
                if (!isProcessingOrder.getAndSet(true)) {
                    performAccept(acceptButton, orderData)
                }
            }, delayMs)
        }
    }

    private fun findAcceptButton(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        for (text in ACCEPT_BUTTON_TEXTS) {
            val nodes = root.findAccessibilityNodeInfosByText(text)
            if (nodes.isNotEmpty()) {
                val clickable = nodes.firstOrNull { it.isClickable }
                    ?: nodes.firstOrNull { findClickableParent(it) != null }
                if (clickable != null) return clickable
            }
        }
        return null
    }

    private fun findClickableParent(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        var current: AccessibilityNodeInfo? = node.parent
        var depth = 0
        while (current != null && depth < 5) {
            if (current.isClickable) return current
            current = current.parent
            depth++
        }
        return null
    }

    private fun extractOrderData(root: AccessibilityNodeInfo): OrderData? {
        val allTexts = mutableListOf<String>()
        collectTexts(root, allTexts)
        val fullText = allTexts.joinToString("\n")

        if (allTexts.isEmpty()) return null

        // Only proceed if there's order-related content
        val hasOrderIndicator = ORDER_INDICATOR_TEXTS.any { fullText.contains(it) } ||
                ACCEPT_BUTTON_TEXTS.any { fullText.contains(it) }
        if (!hasOrderIndicator) return null

        val fare = parseFare(fullText)
        val tripDistanceKm = parseTripDistance(fullText)
        val pickupDistanceKm = parsePickupDistance(fullText)
        val addresses = parseAddresses(allTexts)

        return OrderData(
            fare = fare,
            tripDistanceKm = tripDistanceKm,
            pickupDistanceKm = pickupDistanceKm,
            pickupAddress = addresses.first,
            destinationAddress = addresses.second,
            rawText = fullText,
            timestamp = System.currentTimeMillis()
        )
    }

    private fun collectTexts(node: AccessibilityNodeInfo, texts: MutableList<String>, depth: Int = 0) {
        if (depth > 20) return
        val text = node.text?.toString()?.trim()
        if (!text.isNullOrEmpty() && text.length > 1) {
            texts.add(text)
        }
        val desc = node.contentDescription?.toString()?.trim()
        if (!desc.isNullOrEmpty() && desc.length > 1 && desc != text) {
            texts.add(desc)
        }
        for (i in 0 until node.childCount) {
            node.getChild(i)?.let { collectTexts(it, texts, depth + 1) }
        }
    }

    private fun parseFare(text: String): Double {
        // Match HK$/HKD/¥/港幣 followed by numbers
        val patterns = listOf(
            Regex("""HK\$?\s*([\d,]+\.?\d*)"""),
            Regex("""港幣\s*([\d,]+\.?\d*)"""),
            Regex("""¥\s*([\d,]+\.?\d*)"""),
            Regex("""([\d,]+\.?\d*)\s*元"""),
            Regex("""預計.*?([\d.]+)"""),
            Regex("""費用.*?([\d.]+)"""),
        )
        for (pattern in patterns) {
            pattern.find(text)?.groupValues?.get(1)?.replace(",", "")?.toDoubleOrNull()?.let {
                if (it > 0) return it
            }
        }
        return 0.0
    }

    private fun parseTripDistance(text: String): Double {
        val patterns = listOf(
            Regex("""行程.*?([\d.]+)\s*(?:公里|km|KM)"""),
            Regex("""距離.*?([\d.]+)\s*(?:公里|km|KM)"""),
            Regex("""([\d.]+)\s*(?:公里|km)\s*行程"""),
        )
        for (pattern in patterns) {
            pattern.find(text)?.groupValues?.get(1)?.toDoubleOrNull()?.let {
                if (it > 0) return it
            }
        }
        // Fallback: find any distance-like number
        val fallback = Regex("""([\d.]+)\s*(?:公里|km|KM)""")
        val matches = fallback.findAll(text).map {
            it.groupValues[1].toDoubleOrNull() ?: 0.0
        }.filter { it > 0 }.toList()
        return matches.maxOrNull() ?: 0.0
    }

    private fun parsePickupDistance(text: String): Double {
        val patterns = listOf(
            Regex("""接客.*?([\d.]+)\s*(?:公里|km|KM)"""),
            Regex("""接乘.*?([\d.]+)\s*(?:公里|km|KM)"""),
            Regex("""距您.*?([\d.]+)\s*(?:公里|km|KM|米|m)"""),
        )
        for (pattern in patterns) {
            val match = pattern.find(text)
            if (match != null) {
                val value = match.groupValues[1].toDoubleOrNull() ?: continue
                // Convert meters to km if unit is 米/m
                val unit = match.value.lowercase()
                return if (unit.contains("米") || (unit.contains("m") && !unit.contains("km"))) {
                    value / 1000.0
                } else {
                    value
                }
            }
        }
        return 0.0
    }

    private fun parseAddresses(texts: List<String>): Pair<String, String> {
        var pickup = ""
        var destination = ""
        var pickupIndex = -1
        var destIndex = -1

        val pickupKeywords = listOf("出發地", "接乘地點", "接客地點", "起點", "上車地點", "Pick")
        val destKeywords = listOf("目的地", "終點", "下車地點", "Destination", "前往")

        for ((i, text) in texts.withIndex()) {
            if (pickupKeywords.any { text.contains(it) } && i + 1 < texts.size) {
                pickupIndex = i + 1
            }
            if (destKeywords.any { text.contains(it) } && i + 1 < texts.size) {
                destIndex = i + 1
            }
        }

        if (pickupIndex in texts.indices) pickup = texts[pickupIndex]
        if (destIndex in texts.indices) destination = texts[destIndex]

        // Fallback: use longest non-keyword strings as addresses
        if (pickup.isEmpty() || destination.isEmpty()) {
            val candidates = texts.filter { t ->
                t.length > 5 &&
                        !ACCEPT_BUTTON_TEXTS.contains(t) &&
                        !ORDER_INDICATOR_TEXTS.any { t.contains(it) } &&
                        !t.contains("¥") && !t.contains("HK$") &&
                        !t.matches(Regex("""[\d.,\s]+"""))
            }
            if (pickup.isEmpty() && candidates.isNotEmpty()) pickup = candidates.first()
            if (destination.isEmpty() && candidates.size > 1) destination = candidates.last()
        }

        return Pair(pickup, destination)
    }

    private fun shouldAutoAccept(order: OrderData): Boolean {
        if (!prefs.getBoolean(KEY_AUTO_ACCEPT_ENABLED, false)) return false

        val minFare = prefs.getFloat(KEY_MIN_FARE, 0f).toDouble()
        val maxPickupKm = prefs.getFloat(KEY_MAX_PICKUP_KM, 99f).toDouble()
        val minTripKm = prefs.getFloat(KEY_MIN_TRIP_KM, 0f).toDouble()
        val minFarePerKm = prefs.getFloat(KEY_MIN_FARE_PER_KM, 0f).toDouble()
        val blacklist = prefs.getString(KEY_BLACKLIST, "") ?: ""
        val whitelist = prefs.getString(KEY_WHITELIST, "") ?: ""

        if (order.fare > 0 && order.fare < minFare) {
            Log.d(TAG, "Reject: fare ${order.fare} < min $minFare")
            return false
        }
        if (order.pickupDistanceKm > 0 && order.pickupDistanceKm > maxPickupKm) {
            Log.d(TAG, "Reject: pickup dist ${order.pickupDistanceKm} > max $maxPickupKm")
            return false
        }
        if (order.tripDistanceKm > 0 && order.tripDistanceKm < minTripKm) {
            Log.d(TAG, "Reject: trip dist ${order.tripDistanceKm} < min $minTripKm")
            return false
        }
        if (minFarePerKm > 0 && order.tripDistanceKm > 0 && order.fare > 0) {
            val ratio = order.fare / order.tripDistanceKm
            if (ratio < minFarePerKm) {
                Log.d(TAG, "Reject: fare/km $ratio < min $minFarePerKm")
                return false
            }
        }

        val fullAddr = "${order.pickupAddress} ${order.destinationAddress}"
        if (blacklist.isNotEmpty()) {
            val keywords = blacklist.split(",").map { it.trim() }.filter { it.isNotEmpty() }
            if (keywords.any { fullAddr.contains(it) }) {
                Log.d(TAG, "Reject: blacklisted area in $fullAddr")
                return false
            }
        }
        if (whitelist.isNotEmpty()) {
            val keywords = whitelist.split(",").map { it.trim() }.filter { it.isNotEmpty() }
            if (keywords.isNotEmpty() && keywords.none { fullAddr.contains(it) }) {
                Log.d(TAG, "Reject: not in whitelist for $fullAddr")
                return false
            }
        }

        Log.d(TAG, "Auto-accept criteria passed!")
        return true
    }

    private fun performAccept(buttonNode: AccessibilityNodeInfo, order: OrderData) {
        try {
            val clickTarget = if (buttonNode.isClickable) buttonNode
            else findClickableParent(buttonNode) ?: buttonNode

            val success = clickTarget.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            if (!success) {
                // Fallback: gesture tap on button bounds
                val rect = Rect()
                clickTarget.getBoundsInScreen(rect)
                val cx = rect.centerX().toFloat()
                val cy = rect.centerY().toFloat()
                if (cx > 0 && cy > 0) {
                    performGestureTap(cx, cy)
                }
            }
            Log.d(TAG, "Accept action performed: $success")
            broadcastOrderAccepted(order)
            vibrateSuccess()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to perform accept", e)
        } finally {
            isProcessingOrder.set(false)
        }
    }

    private fun performGestureTap(x: Float, y: Float) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val path = Path().apply { moveTo(x, y) }
            val gesture = GestureDescription.Builder()
                .addStroke(GestureDescription.StrokeDescription(path, 0, 50))
                .build()
            dispatchGesture(gesture, null, null)
        }
    }

    private fun broadcastOrderDetected(order: OrderData) {
        val intent = Intent(ACTION_ORDER_DETECTED).apply {
            putExtra("order_json", order.toJson())
        }
        sendBroadcast(intent)
        // Also notify via MainActivity's event channel
        MainActivity.sendOrderEvent(order.toJson())
    }

    private fun broadcastOrderAccepted(order: OrderData) {
        val intent = Intent(ACTION_ORDER_ACCEPTED).apply {
            putExtra("order_json", order.toJson())
        }
        sendBroadcast(intent)
        MainActivity.sendOrderEvent("{\"event\":\"accepted\",${order.toJson().trimStart('{')}")
    }

    private fun broadcastStatus(connected: Boolean) {
        val intent = Intent(ACTION_SERVICE_STATUS).apply {
            putExtra("connected", connected)
        }
        sendBroadcast(intent)
        MainActivity.sendStatusEvent(connected)
    }

    private fun vibrateAlert() {
        vibrator?.let {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                it.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 200, 100, 200), -1))
            } else {
                @Suppress("DEPRECATION")
                it.vibrate(longArrayOf(0, 200, 100, 200), -1)
            }
        }
    }

    private fun vibrateSuccess() {
        vibrator?.let {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                it.vibrate(VibrationEffect.createOneShot(400, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                it.vibrate(400)
            }
        }
    }

    private fun isTargetPackage(packageName: String): Boolean {
        val saved = prefs.getString(KEY_TARGET_PACKAGES, null)
        val targets = if (saved.isNullOrEmpty()) {
            DEFAULT_PACKAGES
        } else {
            saved.split(",").map { it.trim() }
        }
        return targets.any { packageName == it || packageName.startsWith(it) }
    }

    override fun onInterrupt() {
        Log.d(TAG, "OrderAccessibilityService interrupted")
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        broadcastStatus(false)
        Log.d(TAG, "OrderAccessibilityService destroyed")
    }

    data class OrderData(
        val fare: Double,
        val tripDistanceKm: Double,
        val pickupDistanceKm: Double,
        val pickupAddress: String,
        val destinationAddress: String,
        val rawText: String,
        val timestamp: Long
    ) {
        fun toJson(): String {
            return JSONObject().apply {
                put("fare", fare)
                put("tripDistanceKm", tripDistanceKm)
                put("pickupDistanceKm", pickupDistanceKm)
                put("pickupAddress", pickupAddress)
                put("destinationAddress", destinationAddress)
                put("timestamp", timestamp)
                put("event", "detected")
            }.toString()
        }
    }
}
