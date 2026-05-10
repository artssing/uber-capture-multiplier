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
import com.example.uber_surge_map_hk.model.OrderResult
import com.example.uber_surge_map_hk.repository.OrderRepository
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Listens for OKGO UI events and clicks the accept button when:
 *  - autoAcceptEnabled is true, AND
 *  - OrderRepository.pendingAccept holds an order (set by OkgoLogcatMonitor), AND
 *  - debugMode is off
 *
 * Order detection and filtering is handled entirely by OkgoLogcatMonitor.
 * This service is responsible only for the UI tap action.
 */
class OrderAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "OrderAssist"

        val ACCEPT_BUTTON_TEXTS = listOf(
            "接單", "搶單", "接受", "確認接單", "立即接單", "Accept", "搶  單"
        )
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private val isProcessing = AtomicBoolean(false)
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
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> tryAccept()
        }
    }

    // ── Accept trigger ────────────────────────────────────────────────────────

    private fun tryAccept() {
        val order = OrderRepository.pendingAccept.value ?: return
        if (isProcessing.get()) return

        val rules = OrderRepository.filterRules.value ?: return
        if (!rules.autoAcceptEnabled || rules.debugMode) return

        // Find accept button in ALL windows belonging to OKGO, not just active window
        val root = findOkgoRoot() ?: return
        try {
            val btn = findAcceptButton(root) ?: return
            if (!isProcessing.getAndSet(true)) {
                mainHandler.postDelayed({
                    performAccept(btn, order)
                }, rules.acceptDelayMs.toLong())
            }
        } finally {
            root.recycle()
        }
    }

    private fun findOkgoRoot(): AccessibilityNodeInfo? {
        val targets = OrderRepository.targetPackages.value ?: OrderRepository.DEFAULT_PACKAGES
        // Prefer an OKGO window; fall back to rootInActiveWindow
        return windows.mapNotNull { it.root }
            .firstOrNull { node ->
                val pkg = node.packageName?.toString() ?: return@firstOrNull false
                targets.any { t -> pkg == t || pkg.startsWith(t) }
            } ?: rootInActiveWindow
    }

    // ── Accept action ─────────────────────────────────────────────────────────

    private fun performAccept(btn: AccessibilityNodeInfo, order: com.example.uber_surge_map_hk.model.OrderModel) {
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
            OrderRepository.clearPendingAccept()
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

    // ── Package filter ────────────────────────────────────────────────────────

    private fun isTargetPackage(pkg: String): Boolean {
        val targets = OrderRepository.targetPackages.value ?: OrderRepository.DEFAULT_PACKAGES
        return targets.any { pkg == it || pkg.startsWith(it) }
    }

    // ── Vibration ─────────────────────────────────────────────────────────────

    private fun vibrateSuccess() {
        vibrator ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator!!.vibrate(VibrationEffect.createOneShot(400, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION") vibrator!!.vibrate(400)
        }
    }
}
