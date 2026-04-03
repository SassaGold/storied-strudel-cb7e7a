import React, { useEffect, useRef, useState } from "react";
import { Platform, StyleProp, ViewStyle } from "react-native";
import WebView from "react-native-webview";

export interface GpsPoint {
  latitude: number;
  longitude: number;
}

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

interface Props {
  style?: StyleProp<ViewStyle>;
  /** Controlled region — inject JS updates when this changes. */
  region?: MapRegion;
  /** Static region — used only on first render. */
  initialRegion?: MapRegion;
  route?: GpsPoint[];
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
}

function deltaToZoom(latDelta: number): number {
  if (latDelta <= 0) return 14;
  return Math.max(2, Math.min(18, Math.round(Math.log(360 / latDelta) / Math.LN2)));
}

/** Validate that a value is a finite number, returning a fallback if not. */
function safeNum(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

function buildHtml(region: MapRegion, route: GpsPoint[], interactive: boolean): string {
  const zoom = deltaToZoom(region.latitudeDelta);
  // Sanitize to finite numbers before embedding in JS to prevent injection.
  const lat = safeNum(region.latitude, 0);
  const lng = safeNum(region.longitude, 0);
  const coordsJson = JSON.stringify(
    route.map((p) => [safeNum(p.latitude, 0), safeNum(p.longitude, 0)])
  );
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="initial-scale=1.0,maximum-scale=1.0,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{width:100%;height:100%;margin:0;padding:0;background:#ddd;}</style>
</head><body>
<div id="map"></div>
<script>
var map=L.map('map',{
  zoomControl:${interactive},
  scrollWheelZoom:${interactive},
  dragging:${interactive},
  touchZoom:${interactive},
  doubleClickZoom:false,
  attributionControl:false
}).setView([${lat},${lng}],${zoom});
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:19,errorTileUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='}).addTo(map);
var routeLine=null;
function setRoute(coords){
  if(routeLine){map.removeLayer(routeLine);routeLine=null;}
  if(coords.length>1){routeLine=L.polyline(coords,{color:'#ff6600',weight:4}).addTo(map);}
}
function setView(lat,lng,z){map.setView([lat,lng],z);}
setRoute(${coordsJson});
function handleMsg(e){
  try{
    var d=JSON.parse(e.data);
    if(d.t==='update'){setRoute(d.c);setView(d.lat,d.lng,d.z);}
  }catch(_){}
}
window.addEventListener('message',handleMsg);
document.addEventListener('message',handleMsg);
</script>
</body></html>`;
}

export default function LeafletMapView({
  style,
  region,
  initialRegion,
  route = [],
  scrollEnabled = true,
  zoomEnabled = true,
}: Props) {
  const webRef = useRef<WebView>(null);
  const loaded = useRef(false);
  const interactive = scrollEnabled !== false && zoomEnabled !== false;
  const effectiveRegion = region ?? initialRegion;

  // Generate HTML once on mount using initial values.
  const [html] = useState<string>(() => {
    if (!effectiveRegion) return "";
    return buildHtml(effectiveRegion, route, interactive);
  });

  // Push live updates via injected JS when the controlled `region` prop changes.
  useEffect(() => {
    if (!loaded.current || !region || !webRef.current) return;
    const zoom = deltaToZoom(region.latitudeDelta);
    // Sanitize to finite numbers before embedding in JS to prevent injection.
    const lat = safeNum(region.latitude, 0);
    const lng = safeNum(region.longitude, 0);
    const coordsJson = JSON.stringify(
      route.map((p) => [safeNum(p.latitude, 0), safeNum(p.longitude, 0)])
    );
    webRef.current.injectJavaScript(
      `setRoute(${coordsJson});setView(${lat},${lng},${zoom});true;`
    );
  }, [region, route]);

  if (!effectiveRegion || !html) return null;

  return (
    <WebView
      ref={webRef}
      style={style}
      source={{
        html,
        baseUrl: Platform.OS === "android" ? "file:///android_asset/" : undefined,
      }}
      scrollEnabled={false}
      originWhitelist={["*"]}
      mixedContentMode="always"
      onLoadEnd={() => {
        loaded.current = true;
      }}
    />
  );
}
