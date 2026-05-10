package com.example.uber_surge_map_hk.mock

import android.os.Handler
import android.os.Looper
import com.example.uber_surge_map_hk.model.OrderModel
import com.example.uber_surge_map_hk.model.OrderResult
import com.example.uber_surge_map_hk.repository.OrderRepository
import java.util.UUID
import kotlin.math.roundToInt
import kotlin.random.Random

/**
 * Simulates incoming ride orders every [INTERVAL_MS] ms for the mock build variant.
 * Covers a wide spread of fare/distance combinations so filter rules can be verified
 * visually: passing orders turn green (AUTO_ACCEPTED); failing orders turn grey (REJECTED).
 */
object MockOrderSimulator {

    private const val INTERVAL_MS = 5_000L
    private const val REJECT_DISPLAY_MS = 3_500L   // how long a rejected order stays visible

    private val handler = Handler(Looper.getMainLooper())
    private var running = false
    private var orderCount = 0

    // ── HK location pool ────────────────────────────────────────────────────────

    private val PICKUP_LOCATIONS = listOf(
        "銅鑼灣站 A出口",   "旺角站 D3出口",     "尖沙咀鐘樓",
        "中環渡輪碼頭",     "油麻地站 C出口",    "荃灣廣場",
        "沙田新城市廣場",   "元朗廣場",          "屯門市廣場",
        "將軍澳站 B出口",   "天水圍站",          "大圍站 A出口",
        "馬鞍山站",         "西九龍站",          "香港站 F出口",
        "觀塘站 B4出口",    "黃大仙站",          "彩虹站",
        "青衣站",           "葵芳站 A出口"
    )

    private val DEST_LOCATIONS = listOf(
        "香港國際機場 1號客運大樓",  "九龍城碼頭",           "紅磡火車站",
        "調景嶺站 A出口",            "藍田站",               "東涌站 B出口",
        "深水埗站",                  "石硤尾站",             "何文田站",
        "鑽石山站 D出口",            "坑口站",               "寶琳站",
        "粉嶺站",                    "上水站 A出口",         "大埔墟站",
        "羅湖站",                    "落馬洲站",             "九龍灣站",
        "牛頭角站",                  "彩虹站 C出口"
    )

    // ── Lifecycle ────────────────────────────────────────────────────────────────

    fun start() {
        if (running) return
        running = true
        // Fire first order after a short warm-up so the UI is ready
        handler.postDelayed(::tick, 1_500L)
    }

    fun stop() {
        running = false
        handler.removeCallbacksAndMessages(null)
    }

    /** Immediately dispatch one order (used by the manual trigger button). */
    fun triggerNow() = dispatchOrder()

    // ── Core loop ─────────────────────────────────────────────────────────────────

    private fun tick() {
        if (!running) return
        dispatchOrder()
        handler.postDelayed(::tick, INTERVAL_MS)
    }

    private fun dispatchOrder() {
        orderCount++
        val order = generateOrder()

        OrderRepository.onOrderDetected(order)

        val rules = OrderRepository.filterRules.value
        when {
            rules != null && rules.debugMode && rules.passes(order) -> {
                // Debug mode: notify user to manually accept
                OrderRepository.onOrderAwaitingManualAccept(order)
            }
            rules != null && !rules.debugMode && rules.autoAcceptEnabled && rules.passes(order) -> {
                handler.postDelayed({
                    OrderRepository.onOrderAutoAccepted(order)
                }, rules.acceptDelayMs.toLong())
            }
            else -> {
                handler.postDelayed({
                    OrderRepository.onOrderRejectedByFilter(order)
                }, REJECT_DISPLAY_MS)
            }
        }
    }

    // ── Order generation ──────────────────────────────────────────────────────────

    private fun generateOrder(): OrderModel {
        val profile = orderCount % 6
        val (fare, tripKm, pickupKm) = when (profile) {
            0 -> Triple(randomFare(120.0, 300.0), randomKm(10.0, 25.0), randomKm(0.3, 2.0))  // high value, close
            1 -> Triple(randomFare(30.0,   80.0), randomKm(2.0,   6.0), randomKm(0.3, 1.5))  // low fare, close
            2 -> Triple(randomFare(80.0,  150.0), randomKm(6.0,  15.0), randomKm(1.0, 3.0))  // medium
            3 -> Triple(randomFare(50.0,  120.0), randomKm(3.0,   8.0), randomKm(3.5, 7.0))  // far pickup
            4 -> Triple(randomFare(200.0, 300.0), randomKm(18.0, 25.0), randomKm(0.5, 2.5))  // airport-style
            else -> Triple(randomFare(30.0, 300.0), randomKm(2.0, 20.0), randomKm(0.5, 5.0)) // fully random
        }

        // Occasionally use blacklist-friendly area names to test keyword filtering
        val pickup = if (profile == 3) "天水圍站" else PICKUP_LOCATIONS.random()
        val dest   = if (profile == 4) "香港國際機場 1號客運大樓" else DEST_LOCATIONS.random()

        val rawLog = buildString {
            appendLine("═══ MOCK 模擬資料 ═══")
            appendLine("車費解析:    HK\$${"%.1f".format(fare)}")
            appendLine("行程距離:    ${"%.2f".format(tripKm)} km")
            appendLine("接客距離:    ${"%.2f".format(pickupKm)} km")
            appendLine("上車地點:    $pickup")
            appendLine("目的地:      $dest")
            appendLine("Profile:     #$profile (${profileName(profile)})")
            appendLine("─── 模擬畫面文字節點 ───")
            appendLine("[0] 新訂單")
            appendLine("[1] HK\$${"%.1f".format(fare)}")
            appendLine("[2] 行程距離 ${"%.1f".format(tripKm)} km")
            appendLine("[3] 接客距離 ${"%.1f".format(pickupKm)} km")
            appendLine("[4] 出發地")
            appendLine("[5] $pickup")
            appendLine("[6] 目的地")
            appendLine("[7] $dest")
            appendLine("[8] 接單")
        }

        return OrderModel(
            id                 = UUID.randomUUID().toString(),
            fare               = fare,
            tripDistanceKm     = tripKm,
            pickupDistanceKm   = pickupKm,
            pickupAddress      = pickup,
            destinationAddress = dest,
            timestampMs        = System.currentTimeMillis(),
            rawLog             = rawLog
        )
    }

    private fun profileName(p: Int) = when (p) {
        0 -> "高價近距"; 1 -> "低價近距"; 2 -> "中距"; 3 -> "遠接"; 4 -> "機場"; else -> "隨機"
    }

    private fun randomFare(min: Double, max: Double): Double =
        ((Random.nextDouble(min, max) * 10).roundToInt() / 10.0)

    private fun randomKm(min: Double, max: Double): Double =
        ((Random.nextDouble(min, max) * 10).roundToInt() / 10.0)
}
