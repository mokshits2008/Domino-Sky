'use client';

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useSimulatorStore } from '@/lib/store';
import { FlightResult } from '@/engine/types';
import { getAirportTier, getAirportTierLabel } from '@/lib/formatters';

export function NetworkMapInner() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layersGroupRef = useRef<L.LayerGroup | null>(null);

  const {
    network,
    simulationResult,
    closures,
    setSelectedFlightId,
  } = useSimulatorStore();

  const [tileError, setTileError] = useState(false);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [21.5, 78.9],
      zoom: 5,
      minZoom: 4,
      maxZoom: 9,
      zoomControl: true,
      attributionControl: false,
    });

    const cartoApiKey =
      process.env.NEXT_PUBLIC_CARTO_API_KEY || 'cb1_5cr2_1_d2b9535c988184e55e0a70cb';

    const tileLayer = L.tileLayer(
      `https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png?key=${cartoApiKey}`,
      {
        subdomains: 'abcd',
        maxZoom: 19,
      }
    );

    tileLayer.on('tileerror', () => {
      setTileError(true);
    });

    tileLayer.addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    layersGroupRef.current = layerGroup;
    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Markers and Routes
  useEffect(() => {
    if (!mapInstanceRef.current || !layersGroupRef.current) return;
    const group = layersGroupRef.current;
    group.clearLayers();

    const airportMap = new Map<string, { lat: number; lng: number; tier: string; name: string; city: string }>();
    network.airports.forEach((a) => {
      airportMap.set(a.id, { lat: a.lat, lng: a.lng, tier: String(a.tier), name: a.name, city: a.city });
    });

    const flightPaxMap = new Map<string, number>();
    network.flights.forEach((f) => {
      flightPaxMap.set(f.flight_id, f.pax);
    });

    const closedAirportsSet = new Set(closures.map((c) => c.airport));

    // Group flights by route (origin -> destination) to compute max severity and pax count
    const routeMap = new Map<
      string,
      {
        origin: string;
        destination: string;
        flights: FlightResult[];
        maxSeverity: string;
        totalPax: number;
      }
    >();

    simulationResult.flights.forEach((flight) => {
      const key = `${flight.origin}-${flight.destination}`;
      const pax = flightPaxMap.get(flight.flightId) ?? 120;
      const existing = routeMap.get(key);
      if (!existing) {
        routeMap.set(key, {
          origin: flight.origin,
          destination: flight.destination,
          flights: [flight],
          maxSeverity: flight.severity,
          totalPax: pax,
        });
      } else {
        existing.flights.push(flight);
        existing.totalPax += pax;
        if (
          flight.severity === 'SEVERE' ||
          (flight.severity === 'MODERATE' && existing.maxSeverity !== 'SEVERE') ||
          (flight.severity === 'MINOR' && existing.maxSeverity === 'NONE')
        ) {
          existing.maxSeverity = flight.severity;
        }
      }
    });

    // Draw Route Polylines
    routeMap.forEach(({ origin, destination, flights, maxSeverity, totalPax }) => {
      const origCoord = airportMap.get(origin);
      const destCoord = airportMap.get(destination);
      if (!origCoord || !destCoord) return;

      let color = '#4F7494'; // On time dusty-blue
      if (maxSeverity === 'MINOR') color = '#B89B38';
      else if (maxSeverity === 'MODERATE') color = '#C86B27';
      else if (maxSeverity === 'SEVERE') color = '#C9776B';
      else if (maxSeverity === 'CANCELLED') color = '#5E5A52';

      const strokeWidth = Math.min(5, Math.max(1.8, Math.round(totalPax / 80)));

      // Slight curve via quadratic bezier or line
      const poly = L.polyline(
        [
          [origCoord.lat, origCoord.lng],
          [destCoord.lat, destCoord.lng],
        ],
        {
          color,
          weight: strokeWidth,
          opacity: 0.65,
        }
      );

      poly.bindTooltip(
        `<div class="font-sans text-xs">
          <div class="font-bold font-mono">${origin} → ${destination}</div>
          <div class="text-[11px] text-gray-600">${flights.length} flights (${totalPax} pax)</div>
          <div class="text-[10px] font-mono mt-0.5">Max status: ${maxSeverity}</div>
        </div>`
      );

      poly.on('click', () => {
        if (flights.length > 0) {
          setSelectedFlightId(flights[0].flightId);
        }
      });

      poly.addTo(group);
    });

    // Draw Airports
    network.airports.forEach((airport) => {
      const isClosed = closedAirportsSet.has(airport.id);
      const tierNum = getAirportTier(airport.tier);
      const radius = tierNum === 1 ? 8 : tierNum === 2 ? 6 : 4.5;
      const airportStats = simulationResult.perAirport[airport.id] || {
        delayedDepartures: 0,
        delayedArrivals: 0,
        totalDelayMin: 0,
      };

      // If closed, draw pulsing outer clay circle
      if (isClosed) {
        const pulseCircle = L.circleMarker([airport.lat, airport.lng], {
          radius: radius + 10,
          color: '#C9776B',
          fillColor: '#F4DAD5',
          fillOpacity: 0.45,
          weight: 2,
          dashArray: '3, 3',
        });
        pulseCircle.addTo(group);
      }

      const marker = L.circleMarker([airport.lat, airport.lng], {
        radius,
        color: isClosed ? '#C9776B' : '#2B2F3A',
        fillColor: isClosed ? '#C9776B' : tierNum === 1 ? '#4F7494' : '#FFFFFF',
        fillOpacity: 1,
        weight: 2,
      });

      marker.bindTooltip(
        `<div class="font-sans text-xs p-1">
          <div class="font-bold font-mono flex items-center justify-between">
            <span>${airport.id} — ${airport.city}</span>
            <span class="text-[10px] text-gray-500 ml-2">${getAirportTierLabel(airport.tier)}</span>
          </div>
          <div class="text-[11px] text-gray-700">${airport.name}</div>
          <div class="mt-1 text-[10px] font-mono border-t pt-1 border-gray-200">
            ${isClosed ? '<span class="text-red-700 font-bold block mb-0.5">AIRPORT CLOSED</span>' : ''}
            <div>Delayed Deps: ${airportStats.delayedDepartures}</div>
            <div>Delayed Arrs: ${airportStats.delayedArrivals}</div>
            <div>Total Delay: ${airportStats.totalDelayMin}m</div>
          </div>
        </div>`,
        { direction: 'top', offset: [0, -radius] }
      );

      marker.addTo(group);
    });
  }, [network, simulationResult, closures, setSelectedFlightId]);

  return (
    <div className="w-full h-full relative rounded-card overflow-hidden border border-border bg-surface">
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Offline Tile Error Fallback Banner */}
      {tileError && (
        <div className="absolute top-3 left-3 bg-surface/90 border border-border px-3 py-1.5 rounded-md text-[11px] text-ink-muted shadow-sm z-10">
          Showing vector topology (tiles offline)
        </div>
      )}

      {/* Map Legend Overlay */}
      <div className="absolute bottom-3 left-3 bg-surface/90 backdrop-blur-sm border border-border p-2.5 rounded-lg shadow-sm z-10 text-[11px] text-ink select-none space-y-1.5">
        <div className="font-semibold text-xs text-ink font-sans">Network Status</div>
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-primary"></span>
          <span>Tier 1 Hub</span>
          <span className="w-2 h-2 rounded-full border border-ink bg-surface ml-1"></span>
          <span>Tier 2/3</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-3 h-0.5 bg-primary"></span>
          <span>On-Time Route</span>
          <span className="w-3 h-0.5 bg-closure ml-1"></span>
          <span>Delayed Route</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-closure animate-ping"></span>
          <span className="text-closure font-medium">Closed Airport</span>
        </div>
      </div>
    </div>
  );
}
