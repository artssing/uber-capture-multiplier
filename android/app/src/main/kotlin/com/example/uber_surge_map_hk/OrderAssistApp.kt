package com.example.uber_surge_map_hk

import android.app.Application
import com.example.uber_surge_map_hk.repository.OrderRepository

class OrderAssistApp : Application() {
    override fun onCreate() {
        super.onCreate()
        OrderRepository.init(this)
    }
}
