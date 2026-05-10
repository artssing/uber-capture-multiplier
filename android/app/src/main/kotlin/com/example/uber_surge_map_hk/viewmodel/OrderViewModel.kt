package com.example.uber_surge_map_hk.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import com.example.uber_surge_map_hk.model.FilterRules
import com.example.uber_surge_map_hk.model.OrderModel
import com.example.uber_surge_map_hk.repository.OrderRepository

class OrderViewModel(app: Application) : AndroidViewModel(app) {

    val liveOrder           = OrderRepository.liveOrder
    val orderHistory        = OrderRepository.orderHistory
    val serviceEnabled      = OrderRepository.serviceEnabled
    val totalDetected       = OrderRepository.totalDetected
    val totalAutoAccepted   = OrderRepository.totalAutoAccepted
    val filterRules         = OrderRepository.filterRules
    val targetPackages      = OrderRepository.targetPackages
    val pendingDebugOrder   = OrderRepository.pendingDebugOrder

    fun dismissLiveOrder()  = OrderRepository.dismissLiveOrder()
    fun clearHistory()      = OrderRepository.clearHistory()
    fun dismissPendingDebug() = OrderRepository.dismissPendingDebug()

    fun onOrderManualAccepted(order: OrderModel) =
        OrderRepository.onOrderManualAccepted(order)

    fun saveRules(rules: FilterRules) =
        OrderRepository.saveRules(getApplication(), rules)

    fun savePackages(packages: List<String>) =
        OrderRepository.savePackages(getApplication(), packages)
}
