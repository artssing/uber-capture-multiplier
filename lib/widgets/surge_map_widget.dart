import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import '../models/surge_zone.dart';
import '../providers/surge_provider.dart';

class SurgeMapWidget extends StatefulWidget {
  const SurgeMapWidget({super.key});

  @override
  State<SurgeMapWidget> createState() => _SurgeMapWidgetState();
}

class _SurgeMapWidgetState extends State<SurgeMapWidget>
    with TickerProviderStateMixin {
  final MapController _mapController = MapController();

  // Hong Kong center coordinates
  static const LatLng _hkCenter = LatLng(22.3500, 114.1500);
  static const double _initialZoom = 11.0;

  @override
  Widget build(BuildContext context) {
    return Consumer<SurgeProvider>(
      builder: (context, provider, _) {
        return FlutterMap(
          mapController: _mapController,
          options: MapOptions(
            initialCenter: _hkCenter,
            initialZoom: _initialZoom,
            minZoom: 9.0,
            maxZoom: 16.0,
            onTap: (_, __) => provider.selectZone(null),
          ),
          children: [
            // Dark-style tile layer similar to Uber's map
            TileLayer(
              urlTemplate:
                  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
              subdomains: const ['a', 'b', 'c', 'd'],
              retinaMode: MediaQuery.of(context).devicePixelRatio > 1.0,
              userAgentPackageName: 'com.example.uber_surge_map_hk',
            ),
            // Surge zone polygon overlays
            PolygonLayer(
              polygons: provider.zones.map((zone) {
                final isSelected = provider.selectedZone?.id == zone.id;
                return Polygon(
                  points: zone.polygon,
                  color: zone.surgeColor.withOpacity(zone.surgeOpacity),
                  borderColor: isSelected
                      ? Colors.white
                      : zone.surgeColor.withOpacity(0.7),
                  borderStrokeWidth: isSelected ? 2.5 : 1.0,
                );
              }).toList(),
            ),
            // Tap detection layer using markers at zone centers
            MarkerLayer(
              markers: provider.zones.map((zone) {
                return Marker(
                  point: zone.center,
                  width: 80,
                  height: 36,
                  child: GestureDetector(
                    onTap: () => provider.selectZone(
                      provider.selectedZone?.id == zone.id ? null : zone,
                    ),
                    child: _ZoneLabel(zone: zone),
                  ),
                );
              }).toList(),
            ),
          ],
        );
      },
    );
  }
}

class _ZoneLabel extends StatelessWidget {
  final SurgeZone zone;

  const _ZoneLabel({required this.zone});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.65),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: zone.surgeColor.withOpacity(0.8),
          width: 1.0,
        ),
      ),
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: Text(
          zone.multiplierLabel,
          style: TextStyle(
            color: zone.surgeColor,
            fontSize: 13,
            fontWeight: FontWeight.bold,
            letterSpacing: 0.3,
          ),
        ),
      ),
    );
  }
}
