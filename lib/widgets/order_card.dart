import 'package:flutter/material.dart';
import '../models/order_model.dart';

class LiveOrderCard extends StatelessWidget {
  final OrderModel order;
  final VoidCallback onDismiss;

  const LiveOrderCard({
    super.key,
    required this.order,
    required this.onDismiss,
  });

  @override
  Widget build(BuildContext context) {
    final isAccepted = order.result == OrderResult.autoAccepted;

    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      decoration: BoxDecoration(
        color: const Color(0xFF1C1C1E),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isAccepted ? const Color(0xFF34C759) : const Color(0xFF276EF1),
          width: 1.5,
        ),
        boxShadow: [
          BoxShadow(
            color: (isAccepted ? const Color(0xFF34C759) : const Color(0xFF276EF1))
                .withOpacity(0.25),
            blurRadius: 20,
            spreadRadius: 2,
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 12, 12),
            decoration: BoxDecoration(
              color: (isAccepted ? const Color(0xFF34C759) : const Color(0xFF276EF1))
                  .withOpacity(0.15),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(15)),
            ),
            child: Row(
              children: [
                Icon(
                  isAccepted ? Icons.check_circle : Icons.directions_car,
                  color: isAccepted ? const Color(0xFF34C759) : const Color(0xFF276EF1),
                  size: 18,
                ),
                const SizedBox(width: 8),
                Text(
                  isAccepted ? '已自動接單！' : '新訂單',
                  style: TextStyle(
                    color: isAccepted ? const Color(0xFF34C759) : const Color(0xFF276EF1),
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                  ),
                ),
                const Spacer(),
                if (!isAccepted)
                  GestureDetector(
                    onTap: onDismiss,
                    child: const Icon(Icons.close, color: Colors.white38, size: 18),
                  ),
              ],
            ),
          ),

          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Fare + distances
                Row(
                  children: [
                    _StatChip(
                      icon: Icons.payments_outlined,
                      label: order.fare > 0 ? 'HK\$${order.fare.toStringAsFixed(1)}' : '未知',
                      color: const Color(0xFFFFCC00),
                    ),
                    const SizedBox(width: 8),
                    if (order.tripDistanceKm > 0)
                      _StatChip(
                        icon: Icons.route_outlined,
                        label: '${order.tripDistanceKm.toStringAsFixed(1)} km',
                        color: const Color(0xFF64D2FF),
                      ),
                    const SizedBox(width: 8),
                    if (order.pickupDistanceKm > 0)
                      _StatChip(
                        icon: Icons.near_me_outlined,
                        label: '接客 ${order.pickupDistanceKm.toStringAsFixed(1)} km',
                        color: const Color(0xFFFF9F0A),
                      ),
                  ],
                ),

                if (order.farePerKm > 0) ...[
                  const SizedBox(height: 8),
                  Text(
                    'HK\$${order.farePerKm.toStringAsFixed(1)}/km',
                    style: const TextStyle(color: Colors.white54, fontSize: 12),
                  ),
                ],

                if (order.pickupAddress.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  _AddressRow(
                    icon: Icons.trip_origin,
                    iconColor: const Color(0xFF276EF1),
                    label: '接客',
                    address: order.pickupAddress,
                  ),
                ],
                if (order.destinationAddress.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  _AddressRow(
                    icon: Icons.location_on,
                    iconColor: const Color(0xFFFF453A),
                    label: '目的地',
                    address: order.destinationAddress,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;

  const _StatChip({required this.icon, required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 13),
          const SizedBox(width: 4),
          Text(label, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _AddressRow extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String label;
  final String address;

  const _AddressRow({
    required this.icon,
    required this.iconColor,
    required this.label,
    required this.address,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: iconColor, size: 14),
        const SizedBox(width: 6),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(color: Colors.white38, fontSize: 10)),
              Text(
                address,
                style: const TextStyle(color: Colors.white87, fontSize: 13),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class OrderHistoryTile extends StatelessWidget {
  final OrderModel order;

  const OrderHistoryTile({super.key, required this.order});

  @override
  Widget build(BuildContext context) {
    final Color statusColor;
    final IconData statusIcon;
    switch (order.result) {
      case OrderResult.autoAccepted:
        statusColor = const Color(0xFF34C759);
        statusIcon = Icons.flash_on;
        break;
      case OrderResult.manualAccepted:
        statusColor = const Color(0xFF276EF1);
        statusIcon = Icons.check;
        break;
      case OrderResult.rejected:
        statusColor = const Color(0xFFFF453A);
        statusIcon = Icons.close;
        break;
      case OrderResult.missed:
        statusColor = Colors.white38;
        statusIcon = Icons.access_time;
        break;
      case OrderResult.pending:
        statusColor = const Color(0xFFFFCC00);
        statusIcon = Icons.hourglass_empty;
        break;
    }

    final time = order.timestamp;
    final timeStr =
        '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF1C1C1E),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: statusColor.withOpacity(0.15),
              shape: BoxShape.circle,
            ),
            child: Icon(statusIcon, color: statusColor, size: 18),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    if (order.fare > 0)
                      Text(
                        'HK\$${order.fare.toStringAsFixed(1)}',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                        ),
                      ),
                    if (order.tripDistanceKm > 0) ...[
                      const SizedBox(width: 6),
                      Text(
                        '${order.tripDistanceKm.toStringAsFixed(1)}km',
                        style: const TextStyle(color: Colors.white54, fontSize: 12),
                      ),
                    ],
                    const Spacer(),
                    Text(timeStr, style: const TextStyle(color: Colors.white38, fontSize: 11)),
                  ],
                ),
                if (order.pickupAddress.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    order.pickupAddress,
                    style: const TextStyle(color: Colors.white54, fontSize: 11),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
                const SizedBox(height: 2),
                Text(
                  order.resultLabel,
                  style: TextStyle(color: statusColor, fontSize: 11),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
