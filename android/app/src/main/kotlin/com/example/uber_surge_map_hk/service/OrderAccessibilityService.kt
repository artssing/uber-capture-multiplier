package com.example.uber_surge_map_hk.service

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.example.uber_surge_map_hk.model.OrderModel
import com.example.uber_surge_map_hk.model.OrderResult
import com.example.uber_surge_map_hk.repository.OrderRepository
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

class OrderAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "OrderAssist"

        val ACCEPT_BUTTON_TEXTS = listOf(
            "接單", "搶單", "接受", "確認接單", "立即接單", "Accept", "搶  單"
        )
        val ORDER_INDICATORS = listOf(
            "新訂單", "出發地", "目的地", "行程費用", "預計費用", "接客距離", "行程距離", "接乘"
        )
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private val isProcessing = AtomicBoolean(false)
    private var lastOrderHash = ""
    private var vibrator: Vibrator? = null

    override fun onServiceConnected() {
        vibrator = getSystemService(VIBRATOR_SERVICE) as? Vibrator
        OrderRepository.serviceEnabled.postValue(true)
        Log.d(TAG, "Service connected")
    }

    override fun onInterrupt() = Unit

    override fun onDestroy() {
        super.onDestroy()
        OrderRepository.serviceEnabled.postValue(false)
    }

    // ── Event dispatch ────────────────────────────────────────────────────────

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return
        val pkg = event.packageName?.toString() ?: return
        if (!isTargetPackage(pkg)) return

        when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED,
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> scanForOrder()
        }
    }

    private fun scanForOrder() {
        val root = rootInActiveWindow ?: return
        try {
            val acceptBtn = findAcceptButton(root) ?: return

            val texts = mutableListOf<String>()
            collectTexts(root, texts)
            val fullText = texts.joinToString("\n")

            val hasIndicator = ORDER_INDICATORS.any { fullText.contains(it) } ||
                    ACCEPT_BUTTON_TEXTS.any { fullText.contains(it) }
            if (!hasIndicator) return

            val fare           = parseFare(fullText)
            val tripKm         = parseTripDistance(fullText)
            val pickupKm       = parsePickupDistance(fullText)
            val (pickup, dest) = parseAddresses(texts)

            val hash = "${fare}_${pickup}_${tripKm}"
            if (hash == lastOrderHash) return
            lastOrderHash = hash

            val rawLog = buildRawLog(texts, fare, tripKm, pickupKm, pickup, dest)

            val order = OrderModel(
                id                 = UUID.randomUUID().toString(),
                fare               = fare,
                tripDistanceKm     = tripKm,
                pickupDistanceKm   = pickupKm,
                pickupAddress      = pickup,
                destinationAddress = dest,
                timestampMs        = System.currentTimeMillis(),
                rawLog             = rawLog
            )

            Log.d(TAG, "Order detected: HK$$fare, trip=${tripKm}km, pickup=${pickupKm}km")
            vibratePulse()
            OrderRepository.onOrderDetected(order)

            val rules = OrderRepository.filterRules.value ?: return
            when {
                rules.debugMode && rules.passes(order) -> {
                    // Debug mode: alert user to manually accept, no auto-click
                    Log.d(TAG, "Debug mode: order passes filter, awaiting manual accept")
                    OrderRepository.onOrderAwaitingManualAccept(order)
                }
                !rules.debugMode && rules.autoAcceptEnabled && rules.passes(order) -> {
                    val delay = rules.acceptDelayMs.toLong()
                    mainHandler.postDelayed({
                        if (!isProcessing.getAndSet(true)) {
                            performAccept(acceptBtn, order)
                        }
                    }, delay)
                }
            }
        } finally {
            root.recycle()
        }
    }

    // ── Raw log builder ───────────────────────────────────────────────────────

    private fun buildRawLog(
        texts: List<String>,
        fare: Double, tripKm: Double, pickupKm: Double,
        pickup: String, dest: String
    ): String = buildString {
        appendLine("═══ 原始擷取資料 ═══")
        appendLine("車費解析:    HK\$${"%.1f".format(fare)}")
        appendLine("行程距離:    ${"%.2f".format(tripKm)} km")
        appendLine("接客距離:    ${"%.2f".format(pickupKm)} km")
        appendLine("上車地點:    $pickup")
        appendLine("目的地:      $dest")
        appendLine("─── 畫面所有文字節點 ───")
        texts.forEachIndexed { i, t -> appendLine("[$i] $t") }
    }

    // ── Node helpers ─────────────────────────────────────────────────────────

    private fun findAcceptButton(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        for (text in ACCEPT_BUTTON_TEXTS) {
            val nodes = root.findAccessibilityNodeInfosByText(text)
            if (nodes.isNotEmpty()) {
                return nodes.firstOrNull { it.isClickable }
                    ?: nodes.firstOrNull { clickableAncestor(it) != null }
            }
        }
        return null
    }

    private fun clickableAncestor(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        var cur: AccessibilityNodeInfo? = node.parent
        repeat(6) {
            if (cur?.isClickable == true) return cur
            cur = cur?.parent
        }
        return null
    }

    private fun collectTexts(node: AccessibilityNodeInfo, out: MutableList<String>, depth: Int = 0) {
        if (depth > 20) return
        node.text?.toString()?.trim()?.takeIf { it.length > 1 }?.let { out.add(it) }
        node.contentDescription?.toString()?.trim()?.takeIf { it.length > 1 }?.let { out.add(it) }
        repeat(node.childCount) { node.getChild(it)?.let { child -> collectTexts(child, out, depth + 1) } }
    }

    // ── Accept action ─────────────────────────────────────────────────────────

    private fun performAccept(btn: AccessibilityNodeInfo, order: OrderModel) {
        try {
            val target = if (btn.isClickable) btn else clickableAncestor(btn) ?: btn
            val clicked = target.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            if (!clicked && Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                val rect = Rect()
                target.getBoundsInScreen(rect)
                gestureTap(rect.centerX().toFloat(), rect.centerY().toFloat())
            }
            Log.d(TAG, "Accept performed (direct=$clicked)")
            vibrateSuccess()
            OrderRepository.onOrderAutoAccepted(order)
        } finally {
            isProcessing.set(false)
        }
    }

    private fun gestureTap(x: Float, y: Float) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val path = Path().apply { moveTo(x, y) }
            val gesture = GestureDescription.Builder()
                .addStroke(GestureDescription.StrokeDescription(path, 0L, 50L))
                .build()
            dispatchGesture(gesture, null, null)
        }
    }

    // ── Parsing helpers ───────────────────────────────────────────────────────

    private fun parseFare(text: String): Double {
        val patterns = listOf(
            Regex("""HK\$?\s*([\d,]+\.?\d*)"""),
            Regex("""港幣\s*([\d,]+\.?\d*)"""),
            Regex("""¥\s*([\d,]+\.?\d*)"""),
            Regex("""([\d,]+\.?\d*)\s*元"""),
            Regex("""預計[^0-9]*([\d.]+)"""),
            Regex("""費用[^0-9]*([\d.]+)"""),
        )
        for (p in patterns) {
            p.find(text)?.groupValues?.get(1)?.replace(",", "")
                ?.toDoubleOrNull()?.takeIf { it > 0 }?.let { return it }
        }
        return 0.0
    }

    private fun parseTripDistance(text: String): Double {
        val patterns = listOf(
            Regex("""行程[^0-9]*([\d.]+)\s*(?:公里|km)""", RegexOption.IGNORE_CASE),
            Regex("""距離[^0-9]*([\d.]+)\s*(?:公里|km)""", RegexOption.IGNORE_CASE),
        )
        for (p in patterns) {
            p.find(text)?.groupValues?.get(1)?.toDoubleOrNull()?.takeIf { it > 0 }?.let { return it }
        }
        return Regex("""([\d.]+)\s*(?:公里|km)""", RegexOption.IGNORE_CASE)
            .findAll(text).mapNotNull { it.groupValues[1].toDoubleOrNull() }
            .filter { it > 0 }.maxOrNull() ?: 0.0
    }

    private fun parsePickupDistance(text: String): Double {
        Regex("""(?:接客|接乘|距您)[^0-9]*([\d.]+)\s*(?:公里|km)""", RegexOption.IGNORE_CASE)
            .find(text)?.groupValues?.get(1)?.toDoubleOrNull()?.takeIf { it > 0 }?.let { return it }
        Regex("""(?:接客|接乘|距您)[^0-9]*([\d.]+)\s*(?:米|m\b)""", RegexOption.IGNORE_CASE)
            .find(text)?.groupValues?.get(1)?.toDoubleOrNull()?.takeIf { it > 0 }?.let { return it / 1000.0 }
        return 0.0
    }

    private fun parseAddresses(texts: List<String>): Pair<String, String> {
        val pickupKws = listOf("出發地", "接乘地點", "接客", "起點", "上車")
        val destKws   = listOf("目的地", "終點", "下車", "前往")
        var pickup = ""; var dest = ""

        for ((i, t) in texts.withIndex()) {
            val next = texts.getOrElse(i + 1) { "" }
            if (pickup.isEmpty() && pickupKws.any { t.contains(it) } && next.length > 4) pickup = next
            if (dest.isEmpty()   && destKws.any   { t.contains(it) } && next.length > 4) dest   = next
        }

        if (pickup.isEmpty() || dest.isEmpty()) {
            val candidates = texts.filter { s ->
                s.length > 5 && ACCEPT_BUTTON_TEXTS.none { s == it } &&
                        ORDER_INDICATORS.none { s.contains(it) } &&
                        !s.contains("¥") && !s.matches(Regex("""[\d.,\s:]+"""))
            }
            if (pickup.isEmpty()) pickup = candidates.firstOrNull() ?: ""
            if (dest.isEmpty())   dest   = candidates.lastOrNull()  ?: ""
        }
        return pickup to dest
    }

    // ── Package filter ────────────────────────────────────────────────────────

    private fun isTargetPackage(pkg: String): Boolean {
        val targets = OrderRepository.targetPackages.value ?: OrderRepository.DEFAULT_PACKAGES
        return targets.any { pkg == it || pkg.startsWith(it) }
    }

    // ── Vibration ─────────────────────────────────────────────────────────────

    private fun vibratePulse() {
        vibrator ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator!!.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 200, 100, 200), -1))
        } else {
            @Suppress("DEPRECATION") vibrator!!.vibrate(longArrayOf(0, 200, 100, 200), -1)
        }
    }

    private fun vibrateSuccess() {
        vibrator ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator!!.vibrate(VibrationEffect.createOneShot(400, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION") vibrator!!.vibrate(400)
        }
    }
}
