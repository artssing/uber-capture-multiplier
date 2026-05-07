package com.example.uber_surge_map_hk

import android.os.Bundle
import android.view.MenuItem
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.example.uber_surge_map_hk.databinding.ActivitySettingsBinding
import com.example.uber_surge_map_hk.model.FilterRules
import com.example.uber_surge_map_hk.viewmodel.OrderViewModel

class SettingsActivity : AppCompatActivity() {

    private lateinit var binding: ActivitySettingsBinding
    private val vm: OrderViewModel by viewModels()
    private val packageRows = mutableListOf<String>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        loadCurrentRules()
        loadPackages()
        setupClickListeners()
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) { finish(); return true }
        return super.onOptionsItemSelected(item)
    }

    // ── Load ──────────────────────────────────────────────────────────────────

    private fun loadCurrentRules() {
        val r = vm.filterRules.value ?: FilterRules()
        binding.etMinFare.setText(if (r.minFare > 0) r.minFare.toInt().toString() else "")
        binding.etMinFarePerKm.setText(if (r.minFarePerKm > 0) r.minFarePerKm.toInt().toString() else "")
        binding.etMaxPickupKm.setText(if (r.maxPickupKm > 0) r.maxPickupKm.toString() else "")
        binding.etMinTripKm.setText(if (r.minTripKm > 0) r.minTripKm.toString() else "")
        binding.etBlacklist.setText(r.blacklistKeywords)
        binding.etWhitelist.setText(r.whitelistKeywords)
        binding.etAcceptDelay.setText(r.acceptDelayMs.toString())
    }

    private fun loadPackages() {
        vm.targetPackages.observe(this) { pkgs ->
            packageRows.clear()
            packageRows.addAll(pkgs)
            refreshPackageViews()
        }
    }

    // ── Save ──────────────────────────────────────────────────────────────────

    private fun setupClickListeners() {
        binding.btnSave.setOnClickListener { saveAndFinish() }
        binding.btnAddPackage.setOnClickListener { addPackage() }
    }

    private fun saveAndFinish() {
        val rules = FilterRules(
            autoAcceptEnabled = vm.filterRules.value?.autoAcceptEnabled ?: false,
            minFare       = binding.etMinFare.text?.toString()?.toDoubleOrNull() ?: 0.0,
            maxPickupKm   = binding.etMaxPickupKm.text?.toString()?.toDoubleOrNull() ?: 5.0,
            minTripKm     = binding.etMinTripKm.text?.toString()?.toDoubleOrNull() ?: 0.0,
            minFarePerKm  = binding.etMinFarePerKm.text?.toString()?.toDoubleOrNull() ?: 0.0,
            blacklistKeywords = binding.etBlacklist.text?.toString()?.trim() ?: "",
            whitelistKeywords = binding.etWhitelist.text?.toString()?.trim() ?: "",
            acceptDelayMs = binding.etAcceptDelay.text?.toString()?.toIntOrNull() ?: 800
        )
        vm.saveRules(rules)
        vm.savePackages(packageRows.toList())
        finish()
    }

    // ── Package management ────────────────────────────────────────────────────

    private fun addPackage() {
        val pkg = binding.etNewPackage.text?.toString()?.trim() ?: return
        if (pkg.isEmpty() || packageRows.contains(pkg)) return
        packageRows.add(pkg)
        binding.etNewPackage.text?.clear()
        refreshPackageViews()
    }

    private fun refreshPackageViews() {
        val container = binding.packagesContainer
        container.removeAllViews()
        for ((i, pkg) in packageRows.withIndex()) {
            val row = layoutInflater.inflate(R.layout.item_package_row, container, false)
            row.findViewById<TextView>(R.id.tvPackageName).text = pkg
            row.findViewById<View>(R.id.btnRemovePackage).setOnClickListener {
                packageRows.removeAt(i)
                refreshPackageViews()
            }
            container.addView(row)
        }
    }
}
