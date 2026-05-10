package com.example.uber_surge_map_hk.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.example.uber_surge_map_hk.R
import com.example.uber_surge_map_hk.model.OrderModel
import com.example.uber_surge_map_hk.model.OrderResult
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class OrderHistoryAdapter :
    ListAdapter<OrderModel, OrderHistoryAdapter.VH>(DIFF) {

    var onItemClick: ((OrderModel) -> Unit)? = null

    private val timeFmt = SimpleDateFormat("HH:mm", Locale.getDefault())

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_order_history, parent, false)
        return VH(v)
    }

    override fun onBindViewHolder(h: VH, pos: Int) {
        val order = getItem(pos)
        h.bind(order, timeFmt)
        h.itemView.setOnClickListener { onItemClick?.invoke(order) }
    }

    class VH(v: View) : RecyclerView.ViewHolder(v) {
        private val iconBg    = v.findViewById<View>(R.id.statusIconBg)
        private val ivIcon    = v.findViewById<android.widget.ImageView>(R.id.ivStatusIcon)
        private val tvFare    = v.findViewById<TextView>(R.id.tvHistFare)
        private val tvDist    = v.findViewById<TextView>(R.id.tvHistTripDist)
        private val tvTime    = v.findViewById<TextView>(R.id.tvHistTime)
        private val tvPickup  = v.findViewById<TextView>(R.id.tvHistPickup)
        private val tvResult  = v.findViewById<TextView>(R.id.tvHistResult)

        fun bind(order: OrderModel, fmt: SimpleDateFormat) {
            val ctx = itemView.context

            val (bgRes, iconRes, colorRes) = when (order.result) {
                OrderResult.AUTO_ACCEPTED    -> Triple(R.drawable.bg_status_circle_green, R.drawable.ic_flash,        R.color.accent_green)
                OrderResult.MANUAL_ACCEPTED  -> Triple(R.drawable.bg_status_circle_blue,  R.drawable.ic_check_circle, R.color.accent_blue)
                OrderResult.REJECTED         -> Triple(R.drawable.bg_status_circle_red,   R.drawable.ic_close,        R.color.accent_red)
                OrderResult.MISSED           -> Triple(R.drawable.bg_status_circle_gray,  R.drawable.ic_timer,        R.color.text_tertiary)
                OrderResult.PENDING          -> Triple(R.drawable.bg_status_circle_gray,  R.drawable.ic_timer,        R.color.accent_yellow)
            }

            iconBg.setBackgroundResource(bgRes)
            ivIcon.setImageResource(iconRes)
            ivIcon.setColorFilter(ContextCompat.getColor(ctx, colorRes))

            tvFare.text = if (order.fare > 0) "HK$${String.format("%.1f", order.fare)}" else "未知車費"
            tvDist.text = if (order.tripDistanceKm > 0) "${String.format("%.1f", order.tripDistanceKm)} km" else ""
            tvTime.text = fmt.format(Date(order.timestampMs))

            if (order.pickupAddress.isNotEmpty()) {
                tvPickup.visibility = View.VISIBLE
                tvPickup.text = order.pickupAddress
            } else {
                tvPickup.visibility = View.GONE
            }

            tvResult.text = order.result.label()
            tvResult.setTextColor(ContextCompat.getColor(ctx, colorRes))
        }
    }

    companion object {
        val DIFF = object : DiffUtil.ItemCallback<OrderModel>() {
            override fun areItemsTheSame(a: OrderModel, b: OrderModel) = a.id == b.id
            override fun areContentsTheSame(a: OrderModel, b: OrderModel) = a == b
        }
    }
}
