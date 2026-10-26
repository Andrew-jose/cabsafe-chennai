import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { Coordinates, CaptainRecord } from '../types';
import {
  CHENNAI_MAP_CONFIG,
  CHENNAI_PROVISIONAL_POLYGON,
  isPointInChennaiServiceArea,
} from '../config/chennaiServiceArea';

interface LiveMapProps {
  pickupCoords?: Coordinates | null;
  destinationCoords?: Coordinates | null;
  captainCoords?: Coordinates | null;
  captainLabel?: string;
  routeGeometry?: [number, number][] | null;
  fleetCaptains?: Array<Omit<CaptainRecord, 'password'>>;
  showFleetMarkers?: boolean;
  onMapClick?: (coords: Coordinates) => void;
  interactiveHint?: string;
}

const DEFAULT_CENTER: [number, number] = [
  CHENNAI_MAP_CONFIG.defaultCenter.lat,
  CHENNAI_MAP_CONFIG.defaultCenter.lon,
];

/**
 * Creates a reference-matched dark obsidian + electric chartreuse (#E2FF44) pin icon
 * with a glowing circular target node and compact monospace tag.
 */
function createPinIcon(
  bgColor: string,
  labelText: string,
  ringColor: string = '#E2FF44',
  textColor: string = '#FFFFFF'
) {
  return L.divIcon({
    className: 'custom-cabsafe-pin',
    html: `
      <div style="
        display:inline-flex;
        flex-direction:column;
        align-items:center;
         gap:3px;
        transform:translate(-50%, -50%);
      ">
        <div style="
          display:inline-flex;
          align-items:center;
          gap:5px;
          background:${bgColor};
          color:${textColor};
          padding:3px 8px;
          border-radius:9999px;
          font-family:'JetBrains Mono', monospace;
          font-size:9px;
          line-height:1.2;
          font-weight:700;
          border:1.5px solid ${ringColor};
          box-shadow:0 6px 16px rgba(0,0,0,0.65);
          white-space:nowrap;
          width:max-content;
        ">
          <span>${labelText}</span>
        </div>
        <span style="
          width:14px;
          height:14px;
          border-radius:9999px;
          background:#0B0D12;
          border:3.5px solid ${ringColor};
          box-shadow:0 0 10px ${ringColor}88;
          display:inline-block;
        "></span>
      </div>
    `,
  });
}

/**
 * Resilient Dark Obsidian Canvas vector grid base layer so the Chennai map always
 * renders sleek dark streets, blocks, and arterial corridors matching the reference design.
 */
function createUrbanCanvasGridLayer(): L.GridLayer {
  const UrbanGrid = L.GridLayer.extend({
    createTile: function (coords: L.Coords) {
      const tile = document.createElement('canvas');
      const size = this.getTileSize();
      tile.width = size.x;
      tile.height = size.y;
      const ctx = tile.getContext('2d');
      if (!ctx) return tile;

      // Obsidian night base
      ctx.fillStyle = '#11141C';
      ctx.fillRect(0, 0, size.x, size.y);

      // Urban blocks
      ctx.fillStyle = '#171B26';
      const step = 64;
      for (let x = 8; x < size.x; x += step) {
        for (let y = 8; y < size.y; y += step) {
          const seed = (coords.x * 31 + coords.y * 17 + x + y) % 19;
          if (seed === 0) {
            ctx.fillStyle = '#152220';
            ctx.fillRect(x, y, step - 12, step - 12);
            ctx.fillStyle = '#171B26';
          } else {
            ctx.fillRect(x, y, step - 12, step - 12);
          }
        }
      }

      // Secondary street grid
      ctx.strokeStyle = '#1F2533';
      ctx.lineWidth = 3.5;
      for (let i = 0; i <= size.x; i += step) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, size.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(size.x, i);
        ctx.stroke();
      }

      // Arterial Anna Salai / OMR corridor diagonal
      ctx.strokeStyle = '#262E40';
      ctx.lineWidth = 6.5;
      ctx.beginPath();
      ctx.moveTo(0, size.y);
      ctx.lineTo(size.x, 0);
      ctx.stroke();

      ctx.strokeStyle = '#333D54';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, size.y);
      ctx.lineTo(size.x, 0);
      ctx.stroke();

      return tile;
    },
  });
  return new (UrbanGrid as unknown as { new (opts?: L.GridLayerOptions): L.GridLayer })({
    tileSize: 256,
  });
}

export const LiveMap: React.FC<LiveMapProps> = ({
  pickupCoords,
  destinationCoords,
  captainCoords,
  captainLabel,
  routeGeometry,
  fleetCaptains = [],
  showFleetMarkers = false,
  onMapClick,
  interactiveHint,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  // Initialize Leaflet map centered on Chennai (13.0827, 80.2707)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: DEFAULT_CENTER,
      zoom: CHENNAI_MAP_CONFIG.defaultZoom,
      minZoom: CHENNAI_MAP_CONFIG.minZoom,
      maxZoom: CHENNAI_MAP_CONFIG.maxZoom,
      zoomControl: false,
      attributionControl: false,
    });

    createUrbanCanvasGridLayer().addTo(map);

    // Standard OpenStreetMap Chennai tiles with dark-obsidian CSS filter (zero API key watermarks)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      opacity: 0.88,
      className: 'cabsafe-dark-osm-tiles',
    }).addTo(map);

    // Render provisional Chennai operating boundary polygon in subtle chartreuse
    L.polygon(CHENNAI_PROVISIONAL_POLYGON as [number, number][], {
      color: '#E2FF44',
      weight: 1.5,
      opacity: 0.45,
      dashArray: '6, 6',
      fillColor: '#E2FF44',
      fillOpacity: 0.03,
      interactive: false,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    layerGroupRef.current = group;
    mapRef.current = map;

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (onMapClickRef.current) {
        onMapClickRef.current({
          lat: Number(e.latlng.lat.toFixed(5)),
          lon: Number(e.latlng.lng.toFixed(5)),
        });
      }
    });

    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Update markers & chartreuse polyline whenever coordinates change
  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const boundsPoints: [number, number][] = [];

    // 1. Render fleet captains ONLY when explicitly requested (Admin Dispatch view)
    if (showFleetMarkers) {
      for (const cap of fleetCaptains) {
        if (cap.status !== 'active' || !cap.location?.coordinates) continue;
        const [lon, lat] = cap.location.coordinates;
        const vBadge =
          cap.vehicle.vehicleType === 'car'
            ? 'CAR'
            : cap.vehicle.vehicleType === 'cng'
              ? 'AUTO'
              : 'MOTO';
        const marker = L.marker([lat, lon], {
          icon: createPinIcon('#181B22', `${vBadge} · ${cap.fullname.firstname}`, '#E2FF44'),
        });
        marker.bindPopup(
          `<strong>${cap.fullname.firstname} ${cap.fullname.lastname || ''}</strong><br/>${cap.vehicle.color} ${cap.vehicle.model || cap.vehicle.vehicleType} (${cap.vehicle.plate})`
        );
        marker.addTo(group);
      }
    }

    // 2. Render electric chartreuse (#E2FF44) route polyline matching the reference UI
    if (routeGeometry && routeGeometry.length > 1) {
      L.polyline(routeGeometry, {
        color: '#0B0D12',
        weight: 8,
        opacity: 0.85,
      }).addTo(group);

      const polyline = L.polyline(routeGeometry, {
        color: '#E2FF44',
        weight: 4,
        opacity: 0.98,
      });
      polyline.addTo(group);
      for (const pt of routeGeometry) {
        boundsPoints.push(pt);
      }
    }

    // 3. Render Pickup Marker (chartreuse ring if inside Chennai boundary, red if outside)
    if (pickupCoords) {
      const pt: [number, number] = [pickupCoords.lat, pickupCoords.lon];
      const inside = isPointInChennaiServiceArea(pickupCoords);
      boundsPoints.push(pt);
      L.marker(pt, {
        icon: createPinIcon(
          inside ? '#181B22' : '#7F1D1D',
          inside ? 'PICKUP' : 'PICKUP (OUTSIDE AREA)',
          inside ? '#E2FF44' : '#F87171',
          inside ? '#E2FF44' : '#FECACA'
        ),
        zIndexOffset: 800,
      }).addTo(group);
    }

    // 4. Render Destination Marker (chartreuse ring if inside Chennai boundary, red if outside)
    if (destinationCoords) {
      const pt: [number, number] = [destinationCoords.lat, destinationCoords.lon];
      const inside = isPointInChennaiServiceArea(destinationCoords);
      boundsPoints.push(pt);
      L.marker(pt, {
        icon: createPinIcon(
          inside ? '#E2FF44' : '#7F1D1D',
          inside ? 'DROPOFF' : 'DROPOFF (OUTSIDE AREA)',
          inside ? '#E2FF44' : '#F87171',
          inside ? '#0B0D12' : '#FECACA'
        ),
        zIndexOffset: 800,
      }).addTo(group);
    }

    // 5. Render Active Assigned Captain Marker (only when authorized coordinates are provided)
    if (captainCoords) {
      const pt: [number, number] = [captainCoords.lat, captainCoords.lon];
      boundsPoints.push(pt);
      L.marker(pt, {
        icon: createPinIcon('#FFFFFF', captainLabel || 'CAPTAIN', '#E2FF44', '#0B0D12'),
        zIndexOffset: 1000,
      }).addTo(group);
    }

    map.invalidateSize();
    if (boundsPoints.length >= 2) {
      map.fitBounds(L.latLngBounds(boundsPoints), {
        paddingTopLeft: [44, 64],
        paddingBottomRight: [44, 44],
        maxZoom: 15,
      });
    } else if (boundsPoints.length === 1) {
      map.setView(boundsPoints[0], 13);
    } else {
      map.setView(DEFAULT_CENTER, CHENNAI_MAP_CONFIG.defaultZoom);
    }
  }, [
    pickupCoords,
    destinationCoords,
    captainCoords,
    captainLabel,
    routeGeometry,
    fleetCaptains,
    showFleetMarkers,
  ]);

  const handleRecenterChennai = () => {
    if (mapRef.current) {
      mapRef.current.setView(DEFAULT_CENTER, CHENNAI_MAP_CONFIG.defaultZoom);
    }
  };

  return (
    <div
      className="relative w-full h-full bg-[#11141C] select-none"
      data-testid="live-map-container"
      data-default-center={`${CHENNAI_MAP_CONFIG.defaultCenter.lat},${CHENNAI_MAP_CONFIG.defaultCenter.lon}`}
    >
      <div ref={containerRef} className="w-full h-full" />
      <button
        type="button"
        onClick={handleRecenterChennai}
        title="Recenter on Chennai (13.0827, 80.2707)"
        className="absolute bottom-2 left-2.5 z-20 bg-[#181B22]/90 hover:bg-[#252932] border border-white/10 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold text-[#E2FF44] cursor-pointer transition-colors"
      >
        Chennai Center (13.08°N, 80.27°E)
      </button>
      {interactiveHint && (
        <div className="pointer-events-none absolute top-2.5 left-12 right-12 z-20 flex justify-center">
          <div className="bg-[#0B0D12]/85 backdrop-blur-md text-slate-300 border border-white/10 text-[10px] px-3 py-1 rounded-full truncate">
            {interactiveHint}
          </div>
        </div>
      )}
    </div>
  );
};
