package com.example.uber_surge_map_hk

import android.app.Application
import com.example.uber_surge_map_hk.mock.MockOrderSimulator
import com.example.uber_surge_map_hk.repository.OrderRepository

class OrderAssistApp : Application() {
    override fun onCreate() {
        super.onCreate()
        OrderRepository.init(this)
        if (BuildConfig.IS_MOCK) {
            // In the mock build variant the real accessibility service is not needed;
            // mark service as "enabled" so the UI shows the monitoring state.
            OrderRepository.serviceEnabled.postValue(true)
            MockOrderSimulator.start()
        }
    }
}
