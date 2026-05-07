package com.example.uber_surge_map_hk

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.TextView
import androidx.activity.viewModels
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.example.uber_surge_map_hk.adapter.OrderHistoryAdapter
import com.example.uber_surge_map_hk.databinding.ActivityMainBinding
import com.example.uber_surge_map_hk.model.FilterRules
import com.example.uber_surge_map_hk.model.OrderModel
import com.example.uber_surge_map_hk.model.OrderResult
import com.example.uber_surge_map_hk.viewmodel.OrderViewModel
import com.google.android.material.chip.Chip

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val vm: OrderViewModel by viewModels()
    private val historyAdapter = OrderHistoryAdapter()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupBottomNav()
        setupClickListeners()
        setupRecyclerView()
        observeViewModel()
    }

    override fun onResume() {
        super.onResume()
        // Re-check accessibility each time user returns (they may have just enabled it)
        val enabled = isAccessibilityEnabled()
        com.example.uber_surge_map_hk.repository.OrderRepository.serviceEnabled.postValue(enabled)
    }

    // ── Setup ─────────────────────────────────────────────────────────────────

    private fun setupBottomNav() {
        binding.bottomNav.setOnItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_dashboard -> showDashboard()
                R.id.nav_history   -> showHistory()
            }
            true
        }
    }

    private fun setupClickListeners() {
        // Auto-accept toggle
        binding.btnAutoAccept.setOnClickListener {
            val rules = vm.filterRules.value ?: FilterRules()
            val newVal = !rules.autoAcceptEnabled
            rules.autoAcceptEnabled = newVal
            vm.saveRules(rules)
            updateAutoAcceptButton(newVal)
        }

        // Settings
        binding.btnSettings.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }

        // Permission cards
        binding.cardPermAccessibility.root.findViewById<View>(R.id.btnPermAction)?.setOnClickListener {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        }
        binding.cardPermOverlay.root.findViewById<View>(R.id.btnPermAction)?.setOnClickListener {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:$packageName")))
            }
        }

        // Live order dismiss
        binding.liveOrderCard.btnDismissOrder.setOnClickListener {
            vm.dismissLiveOrder()
        }

        // Rules summary "Edit"
        binding.rulesSummaryCard.tvEditRules.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }

        // History clear
        binding.btnClearHistory.setOnClickListener {
            AlertDialog.Builder(this, R.style.AlertDialogDark)
                .setTitle("清除記錄")
                .setMessage("確定要清除所有訂單記錄嗎？")
                .setPositiveButton("清除") { _, _ -> vm.clearHistory() }
                .setNegativeButton("取消", null)
                .show()
        }
    }

    private fun setupRecyclerView() {
        binding.rvHistory.adapter = historyAdapter
        binding.rvHistory.itemAnimator = null
    }

    // ── Observe ───────────────────────────────────────────────────────────────

    private fun observeViewModel() {
        vm.serviceEnabled.observe(this) { enabled -> updateServiceStatus(enabled) }
        vm.filterRules.observe(this) { rules -> onRulesChanged(rules) }
        vm.liveOrder.observe(this) { order -> onLiveOrderChanged(order) }
        vm.totalDetected.observe(this) { binding.statsCard.tvStatsDetected.text = "$it" }
        vm.totalAutoAccepted.observe(this) { binding.statsCard.tvStatsAccepted.text = "$it" }
        vm.filterRules.observe(this) { binding.statsCard.tvStatsDelay.text = "${it.acceptDelayMs}ms" }
        vm.orderHistory.observe(this) { list -> onHistoryChanged(list) }
    }

    // ── UI updates ────────────────────────────────────────────────────────────

    private fun updateServiceStatus(enabled: Boolean) {
        val dot    = binding.statusDot
        val badge  = binding.statusBadge
        val tvStat = binding.tvStatus

        if (enabled) {
            dot.setBackgroundResource(R.drawable.dot_green)
            badge.setBackgroundResource(R.drawable.bg_badge_green)
            tvStat.text = "監控中"
            tvStat.setTextColor(ContextCompat.getColor(this, R.color.accent_green))
        } else {
            dot.setBackgroundResource(R.drawable.dot_red)
            badge.setBackgroundResource(R.drawable.bg_badge_red)
            tvStat.text = "未開啟"
            tvStat.setTextColor(ContextCompat.getColor(this, R.color.accent_red))
        }

        // Show/hide permission section
        val needsPerms = !enabled || !isOverlayPermissionGranted()
        binding.permissionSection.visibility = if (needsPerms) View.VISIBLE else View.GONE

        // Set up accessibility permission card
        val accCard = binding.cardPermAccessibility
        accCard.root.findViewById<TextView>(R.id.tvPermTitle)?.text = "無障礙服務"
        accCard.root.findViewById<TextView>(R.id.tvPermDesc)?.text  = "用於偵測司機App訂單並自動點擊接單"
        accCard.root.findViewById<View>(R.id.btnPermAction)?.visibility =
            if (enabled) View.GONE else View.VISIBLE

        // Set up overlay permission card
        val overlayGranted = isOverlayPermissionGranted()
        val overCard = binding.cardPermOverlay
        overCard.root.visibility = if (overlayGranted) View.GONE else View.VISIBLE
        overCard.root.findViewById<TextView>(R.id.tvPermTitle)?.text = "懸浮視窗權限"
        overCard.root.findViewById<TextView>(R.id.tvPermDesc)?.text  = "允許搶單助手在其他App上方顯示資訊（可選）"

        // Setup guide visible only when accessibility is off
        binding.setupGuideCard.visibility = if (enabled) View.GONE else View.VISIBLE
    }

    private fun updateAutoAcceptButton(enabled: Boolean) {
        binding.btnAutoAccept.setBackgroundResource(
            if (enabled) R.drawable.bg_toggle_on else R.drawable.bg_toggle_off
        )
        binding.icAutoAccept.alpha = if (enabled) 1f else 0.4f
        binding.tvAutoAccept.text = if (enabled) "自動搶單" else "手動模式"
        binding.tvAutoAccept.setTextColor(
            ContextCompat.getColor(this,
                if (enabled) R.color.accent_blue else R.color.text_tertiary)
        )
    }

    private fun onRulesChanged(rules: FilterRules) {
        updateAutoAcceptButton(rules.autoAcceptEnabled)

        // Rebuild rule chips
        val chipGroup = binding.rulesSummaryCard.rulesChipsLayout
        chipGroup.removeAllViews()

        fun chip(text: String, bgRes: Int, textColorRes: Int) = Chip(this).apply {
            this.text = text
            chipBackgroundColor = android.content.res.ColorStateList.valueOf(0)
            setBackgroundResource(bgRes)
            setTextColor(ContextCompat.getColor(this@MainActivity, textColorRes))
            textSize = 11f
            chipMinHeight = 28f
            isClickable = false
            isFocusable = false
            setChipStrokeColorResource(android.R.color.transparent)
        }

        if (rules.minFare > 0)
            chipGroup.addView(chip("最低 HK\$${rules.minFare.toInt()}", R.drawable.bg_chip_blue, R.color.accent_blue))
        chipGroup.addView(chip("接客 ≤ ${rules.maxPickupKm}km", R.drawable.bg_chip_blue, R.color.accent_blue))
        if (rules.minTripKm > 0)
            chipGroup.addView(chip("行程 ≥ ${rules.minTripKm}km", R.drawable.bg_chip_blue, R.color.accent_blue))
        if (rules.minFarePerKm > 0)
            chipGroup.addView(chip("≥ HK\$${rules.minFarePerKm.toInt()}/km", R.drawable.bg_chip_blue, R.color.accent_blue))
        rules.blacklistList.take(3).forEach {
            chipGroup.addView(chip("✕ $it", R.drawable.bg_chip_red, R.color.accent_red))
        }
        rules.whitelistList.take(3).forEach {
            chipGroup.addView(chip("✓ $it", R.drawable.bg_chip_green, R.color.accent_green))
        }

        binding.rulesSummaryCard.autoOffWarning.visibility =
            if (!rules.autoAcceptEnabled) View.VISIBLE else View.GONE
        binding.statsCard.tvStatsDelay.text = "${rules.acceptDelayMs}ms"
    }

    private fun onLiveOrderChanged(order: OrderModel?) {
        val card = binding.liveOrderCard
        if (order == null) {
            card.root.visibility = View.GONE
            return
        }
        card.root.visibility = View.VISIBLE

        val accepted = order.result == OrderResult.AUTO_ACCEPTED
        card.root.setBackgroundResource(
            if (accepted) R.drawable.bg_order_card_accepted else R.drawable.bg_order_card
        )
        card.orderCardHeader.setBackgroundResource(
            if (accepted) R.drawable.bg_order_header_accepted else R.drawable.bg_order_header
        )
        card.tvOrderStatusLabel.text = if (accepted) "已自動接單！" else "新訂單"
        card.tvOrderStatusLabel.setTextColor(
            ContextCompat.getColor(this, if (accepted) R.color.accent_green else R.color.accent_blue)
        )
        card.icOrderStatus.setImageResource(
            if (accepted) R.drawable.ic_check_circle else R.drawable.ic_car
        )
        card.btnDismissOrder.visibility = if (accepted) View.GONE else View.VISIBLE

        // Fare chip
        card.tvFareChip.text = if (order.fare > 0) "HK$${String.format("%.1f", order.fare)}" else "未知車費"

        // Trip distance
        if (order.tripDistanceKm > 0) {
            card.tvTripDistChip.visibility = View.VISIBLE
            card.tvTripDistChip.text = "${String.format("%.1f", order.tripDistanceKm)} km"
        } else card.tvTripDistChip.visibility = View.GONE

        // Pickup distance
        if (order.pickupDistanceKm > 0) {
            card.tvPickupDistChip.visibility = View.VISIBLE
            card.tvPickupDistChip.text = "接客 ${String.format("%.1f", order.pickupDistanceKm)} km"
        } else card.tvPickupDistChip.visibility = View.GONE

        // Fare/km
        if (order.farePerKm > 0) {
            card.tvFarePerKm.visibility = View.VISIBLE
            card.tvFarePerKm.text = "HK$${String.format("%.1f", order.farePerKm)}/km"
        } else card.tvFarePerKm.visibility = View.GONE

        // Pickup address
        if (order.pickupAddress.isNotEmpty()) {
            card.pickupRow.visibility = View.VISIBLE
            card.tvPickupAddress.text = order.pickupAddress
        } else card.pickupRow.visibility = View.GONE

        // Destination address
        if (order.destinationAddress.isNotEmpty()) {
            card.destinationRow.visibility = View.VISIBLE
            card.tvDestAddress.text = order.destinationAddress
        } else card.destinationRow.visibility = View.GONE
    }

    private fun onHistoryChanged(list: List<OrderModel>) {
        val hasItems = list.isNotEmpty()
        binding.rvHistory.visibility  = if (hasItems) View.VISIBLE else View.GONE
        binding.emptyHistory.visibility = if (hasItems) View.GONE  else View.VISIBLE
        binding.btnClearHistory.visibility = if (hasItems) View.VISIBLE else View.GONE
        historyAdapter.submitList(list.toList())

        // Update history stats bar
        val detected  = vm.totalDetected.value ?: 0
        val accepted  = vm.totalAutoAccepted.value ?: 0
        val rate      = if (detected > 0) (accepted * 100 / detected) else 0
        val earnings  = list.filter {
            it.result == OrderResult.AUTO_ACCEPTED || it.result == OrderResult.MANUAL_ACCEPTED
        }.sumOf { it.fare }

        binding.tvHistDetected.text = "$detected\n偵測"
        binding.tvHistAccepted.text = "$accepted\n自動接單"
        binding.tvHistRate.text     = "$rate%\n接單率"
        binding.tvHistEarnings.text = "HK$${earnings.toInt()}\n估算收入"
    }

    // ── Tab switching ─────────────────────────────────────────────────────────

    private fun showDashboard() {
        binding.dashboardSection.visibility = View.VISIBLE
        binding.historySection.visibility   = View.GONE
    }

    private fun showHistory() {
        binding.dashboardSection.visibility = View.GONE
        binding.historySection.visibility   = View.VISIBLE
    }

    // ── Permission checks ─────────────────────────────────────────────────────

    private fun isAccessibilityEnabled(): Boolean {
        val name = "$packageName/${com.example.uber_surge_map_hk.service.OrderAccessibilityService::class.java.canonicalName}"
        val enabled = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
            ?: return false
        return enabled.split(":").any { it.equals(name, ignoreCase = true) }
    }

    private fun isOverlayPermissionGranted(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) Settings.canDrawOverlays(this) else true
}
