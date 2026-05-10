package com.example.uber_surge_map_hk.monitor

import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import com.example.uber_surge_map_hk.model.OrderModel
import com.example.uber_surge_map_hk.repository.OrderRepository
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.util.UUID

/**
 * Reads OKGO's native WebSocket logs from logcat in real-time.
 * Requires READ_LOGS permission, which must be granted once via adb:
 *   adb shell pm grant com.example.uber_surge_map_hk android.permission.READ_LOGS
 *
 * Parses grabResultPush messages to extract:
 *   - driverOrderPrice  → fare (HKD)
 *   - mileage           → pickup distance (metres → km)
 *   - duration          → pickup ETA (minutes)
 *   - orderId           → deduplication key
 */
object OkgoLogcatMonitor {

    private const val TAG     = "OkgoLogcat"
    private const val TAG_RAW = "OkgoRaw"        // full OKGO JSON, for diff comparison
    private const val READ_LOGS = "android.permission.READ_LOGS"
    private const val LOG_CHUNK = 3800            // Android logcat line limit ~4000

    @Volatile private var running = false
    private var readerThread: Thread? = null
    private var lastOrderId = ""

    fun isPermissionGranted(ctx: Context): Boolean =
        ctx.checkSelfPermission(READ_LOGS) == PackageManager.PERMISSION_GRANTED

    fun start(ctx: Context) {
        if (running) return
        if (!isPermissionGranted(ctx)) {
            Log.w(TAG, "READ_LOGS not granted — logcat monitor disabled.\n" +
                    "Grant with: adb shell pm grant ${ctx.packageName} android.permission.READ_LOGS")
            OrderRepository.logcatMonitorState.postValue(LogcatState.NO_PERMISSION)
            return
        }
        running = true
        readerThread = Thread({ readLoop() }, "okgo-logcat").apply {
            isDaemon = true
            start()
        }
        Log.d(TAG, "Logcat monitor started")
        OrderRepository.logcatMonitorState.postValue(LogcatState.RUNNING)
    }

    fun stop() {
        running = false
        readerThread?.interrupt()
        readerThread = null
        OrderRepository.logcatMonitorState.postValue(LogcatState.STOPPED)
    }

    // ── Reader loop ───────────────────────────────────────────────────────────

    private fun readLoop() {
        var process: Process? = null
        try {
            // Use :V (Verbose) instead of :I so we don't miss Debug-level OKGO messages.
            // Use -v tag format so each line carries "D/LIBCONNECTION: ..." — visible in our logs.
            process = Runtime.getRuntime().exec(
                arrayOf("logcat", "-v", "tag", "-s", "LIBCONNECTION:V")
            )

            // Drain stderr in background so it never blocks the reader thread
            val errStream = process.errorStream
            Thread({
                errStream.bufferedReader().forEachLine { Log.w(TAG, "logcat stderr: $it") }
            }, "okgo-logcat-err").apply { isDaemon = true; start() }

            val reader = BufferedReader(InputStreamReader(process.inputStream))
            Log.d(TAG, "Logcat process started (LIBCONNECTION:V), reading…")

            var lineCount = 0
            var grabCount = 0

            while (running) {
                val line = reader.readLine() ?: break
                lineCount++

                // Heartbeat every 200 lines so we know the reader is alive
                if (lineCount % 200 == 0) {
                    Log.d(TAG, "[heartbeat] lines=$lineCount  grabResultPush hits=$grabCount")
                }

                // Log any line that mentions "grab" at verbose level for visibility
                if (line.contains("grab", ignoreCase = true)) {
                    Log.v(TAG, "[grab line] $line")
                    grabCount++
                }

                if (line.contains("grabResultPush") && line.contains("driverOrderPrice")) {
                    parseOrderLine(line)
                } else if (line.contains("grabResultPush")) {
                    // grabResultPush present but no driverOrderPrice — log for diagnosis
                    Log.w(TAG, "[no driverOrderPrice] $line")
                }
            }
            Log.d(TAG, "Reader loop ended. Total lines=$lineCount  grabResultPush hits=$grabCount")
        } catch (e: InterruptedException) {
            // normal shutdown
        } catch (e: Exception) {
            Log.e(TAG, "Logcat read error: ${e.message}")
            OrderRepository.logcatMonitorState.postValue(LogcatState.ERROR)
        } finally {
            process?.destroy()
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Log strings longer than Android's ~4000-char limit by splitting into chunks. */
    private fun logLong(tag: String, msg: String) {
        var offset = 0
        val total = msg.length
        var part = 1
        while (offset < total) {
            val end = minOf(offset + LOG_CHUNK, total)
            Log.d(tag, "[${part}] ${msg.substring(offset, end)}")
            offset = end
            part++
        }
    }

    // ── Order parsing ─────────────────────────────────────────────────────────

    private fun parseOrderLine(line: String) {
        try {
            // Line format:
            // session::receive inner =====> down msg: ..., id=grabResultPush_..., body={JSON}
            val bodyIdx = line.indexOf("body=")
            if (bodyIdx < 0) return
            val jsonStr = line.substring(bodyIdx + 5).trim()
            val obj = JSONObject(jsonStr)

            // operateType 1 = new order push; log others so we can see what values OKGO uses
            val operateType = obj.optInt("operateType", -1)
            if (operateType != 1) {
                Log.w(TAG, "[skip] grabResultPush with operateType=$operateType (expected 1)")
                return
            }

            val orderId = obj.optString("orderId").takeIf { it.isNotEmpty() } ?: return
            if (orderId == lastOrderId) return   // already processed
            lastOrderId = orderId

            // ── Log raw OKGO JSON for comparison ──────────────────────────────
            Log.d(TAG_RAW, "══════════ OKGO grabResultPush [orderId=$orderId] ══════════")
            logLong(TAG_RAW, jsonStr)
            Log.d(TAG_RAW, "══════════ END ══════════")

            val fare = obj.optDouble("driverOrderPrice", 0.0)

            // mileage is pickup distance in metres; duration is ETA in minutes
            var pickupKm = 0.0
            var etaMinutes = 0
            var mileageRawM = 0.0
            runCatching {
                val matchMap = obj.getJSONObject("matchInfoMap")
                val driverId = matchMap.keys().next()
                val dir = matchMap.getJSONObject(driverId).getJSONObject("driverDirection")
                mileageRawM = dir.getDouble("mileage")
                pickupKm = mileageRawM / 1000.0
                etaMinutes = dir.optInt("duration", 0)
            }

            val mainTag = runCatching {
                obj.getJSONArray("mainTag").optString(0, "")
            }.getOrDefault("")

            // ── Log parsed fields so user can compare against OkgoRaw ─────────
            Log.d(TAG, "══════════ 解析結果 [orderId=$orderId] ══════════")
            Log.d(TAG, "driverOrderPrice (原始)  = ${obj.optDouble("driverOrderPrice", 0.0)} HKD")
            Log.d(TAG, "車費 (app顯示)           = HK\$${"%.2f".format(fare)}")
            Log.d(TAG, "mileage (原始,metre)     = $mileageRawM m")
            Log.d(TAG, "接客距離 (app顯示)        = ${"%.3f".format(pickupKm)} km")
            Log.d(TAG, "duration (原始,秒/分鐘)  = $etaMinutes")
            Log.d(TAG, "接客預計 (app顯示)        = ${etaMinutes} 分鐘")
            Log.d(TAG, "訂單類型 mainTag         = ${mainTag.ifEmpty { "(空)" }}")
            Log.d(TAG, "══════════ END ══════════")

            val rawLog = buildString {
                appendLine("═══ OKGO logcat 訂單 ═══")
                appendLine("orderId:    $orderId")
                appendLine("車費:       HK\$${"%.2f".format(fare)}")
                appendLine("接客距離:   ${"%.3f".format(pickupKm)} km")
                appendLine("接客預計:   ${etaMinutes} 分鐘")
                if (mainTag.isNotEmpty()) appendLine("訂單類型:   $mainTag")
                appendLine("─── 原始 JSON ───")
                appendLine(jsonStr)
            }

            val order = OrderModel(
                id                 = UUID.randomUUID().toString(),
                fare               = fare,
                tripDistanceKm     = 0.0,        // not in grabResultPush payload
                pickupDistanceKm   = pickupKm,
                pickupAddress      = "",          // not in grabResultPush payload
                destinationAddress = "",
                timestampMs        = System.currentTimeMillis(),
                rawLog             = rawLog
            )

            OrderRepository.onOrderDetected(order)

            val rules = OrderRepository.filterRules.value ?: return
            when {
                rules.debugMode && rules.passes(order) ->
                    OrderRepository.onOrderAwaitingManualAccept(order)
                !rules.debugMode && rules.autoAcceptEnabled && rules.passes(order) ->
                    OrderRepository.schedulePendingAccept(order)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Parse error on line: ${e.message}")
        }
    }
}

enum class LogcatState { STOPPED, RUNNING, NO_PERMISSION, ERROR }
