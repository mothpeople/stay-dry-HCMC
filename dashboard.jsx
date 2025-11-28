import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Droplets, CloudRain, AlertTriangle, Activity, Wind, Navigation, Layers, Crosshair, Waves, Newspaper, Sun, Moon, Info, Heart, ExternalLink, Video, Map as MapIcon, Calendar } from 'lucide-react';

// Ho Chi Minh City Constants
const HCMC_CENTER = [10.7769, 106.7009];
const HCMC_BOUNDS = [
  [10.3500, 106.3000],
  [11.1600, 107.0200] 
];

// Reference Station for Tides (Soai Rap junction for accurate water detection)
const TIDE_STATION_COORDS = { lat: 10.690, lng: 106.760 };

// KNOWN FLOOD HOTSPOTS (Static Data)
const FLOOD_HOTSPOTS = [
    { name: "Nguyen Huu Canh", lat: 10.7925, lng: 106.7163, desc: "Severe flooding during heavy rain" },
    { name: "Thao Dien", lat: 10.8033, lng: 106.7329, desc: "High tide risk area" },
    { name: "Huynh Tan Phat", lat: 10.7431, lng: 106.7336, desc: "Major tidal flooding zone" },
    { name: "Tran Xuan Soan", lat: 10.7533, lng: 106.7029, desc: "Canal overflow risk" },
    { name: "Le Van Luong", lat: 10.7167, lng: 106.6978, desc: "Low-lying area" }
];

const THEMES = {
  dark: {
    name: 'dark',
    bg: 'bg-slate-950',
    textMain: 'text-slate-100',
    textSub: 'text-slate-400',
    cardBg: 'bg-slate-900',
    cardBorder: 'border-slate-800',
    inputBg: 'bg-slate-800',
    inputBorder: 'border-slate-700',
    accentPrimary: 'text-blue-400', 
    buttonPrimary: 'bg-blue-600 hover:bg-blue-700 text-white',
    buttonSecondary: 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750',
    highlight: 'bg-blue-900/30 text-blue-300 border-blue-800/50',
    mapFilter: 'brightness(0.8) contrast(1.2)'
  },
  light: {
    name: 'light',
    bg: 'bg-lime-50', 
    textMain: 'text-stone-800',
    textSub: 'text-stone-500',
    cardBg: 'bg-white',
    cardBorder: 'border-lime-100',
    inputBg: 'bg-stone-50',
    inputBorder: 'border-stone-200',
    accentPrimary: 'text-lime-700', 
    buttonPrimary: 'bg-lime-700 hover:bg-lime-800 text-white',
    buttonSecondary: 'bg-white border-lime-200 text-lime-700 hover:bg-lime-50',
    highlight: 'bg-lime-100 text-lime-800 border-lime-200',
    mapFilter: 'none'
  }
};

export default function App() {
  const [address, setAddress] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [suggestions, setSuggestions] = useState([]); 
  const [showSuggestions, setShowSuggestions] = useState(false); 
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [mapInstance, setMapInstance] = useState(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [isPinMode, setIsPinMode] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  
  const theme = isDarkMode ? THEMES.dark : THEMES.light;
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const hotspotMarkersRef = useRef([]); 
  const debounceTimerRef = useRef(null); 

  // --- Clock (VN Time) ---
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const options = { 
        timeZone: 'Asia/Ho_Chi_Minh', 
        weekday: 'short', 
        day: 'numeric', 
        month: 'short', 
        hour: '2-digit', 
        minute: '2-digit' 
      };
      setCurrentTime(now.toLocaleString('en-US', options));
    };
    updateTime();
    const interval = setInterval(updateTime, 60000); 
    return () => clearInterval(interval);
  }, []);

  // --- Service Worker ---
  useEffect(() => {
    if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.protocol === 'http:')) {
      window.addEventListener('load', () => { navigator.serviceWorker.register('/service-worker.js').catch(err => console.log('SW Reg:', err)); });
    }
  }, []);

  // --- Safety Colors ---
  const getStatusColor = (value, type) => {
    if (isDarkMode) return 'text-slate-100'; 
    const SAFE = 'text-lime-600';
    const WARN = 'text-orange-500';
    const DANGER = 'text-red-600';

    switch (type) {
      case 'rain': if (value > 30) return DANGER; if (value > 5) return WARN; return SAFE;
      case 'aqi': if (value > 150) return DANGER; if (value > 100) return WARN; return SAFE;
      case 'uv': if (value > 8) return DANGER; if (value > 5) return WARN; return SAFE;
      case 'tide': if (parseFloat(value) > 3.5) return DANGER; if (parseFloat(value) > 2.5) return WARN; return SAFE;
      case 'temp': if (value > 35) return DANGER; return SAFE;
      case 'humidity': if (value > 90) return DANGER; if (value > 75) return WARN; return SAFE; 
      case 'canal': if (value > 2.0) return DANGER; if (value > 1.5) return WARN; return SAFE;
      default: return theme.textMain;
    }
  };

  // Load Leaflet
  useEffect(() => {
    const existingScript = document.querySelector('script[src*="leaflet.js"]');
    if (!document.querySelector('link[href*="leaflet.css"]')) {
        const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(link);
    }
    if (existingScript && window.L) { setLeafletLoaded(true); return; }
    
    if (!existingScript) {
        const script = document.createElement('script'); script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; script.async = true; 
        script.onload = () => setLeafletLoaded(true); document.body.appendChild(script);
    } else {
        const checkL = setInterval(() => { if (window.L) { setLeafletLoaded(true); clearInterval(checkL); } }, 200);
        return () => clearInterval(checkL);
    }
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!leafletLoaded || !mapRef.current || mapInstance) return;
    if (!window.L) return;

    try {
      const map = window.L.map(mapRef.current, { center: HCMC_CENTER, zoom: 11, minZoom: 10, maxBounds: HCMC_BOUNDS, maxBoundsViscosity: 1.0 });
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' }).addTo(map);
      
      FLOOD_HOTSPOTS.forEach(spot => {
          const marker = window.L.circleMarker([spot.lat, spot.lng], { color: 'red', fillColor: '#f03', fillOpacity: 0.5, radius: 8 }).addTo(map);
          marker.bindPopup(`<b>${spot.name}</b><br>${spot.desc}`);
          hotspotMarkersRef.current.push(marker);
      });

      setTimeout(() => { map.invalidateSize(); }, 500);
      setMapInstance(map);
    } catch (err) { console.error(err); }

    return () => { if (mapInstance) { mapInstance.remove(); setMapInstance(null); } };
  }, [leafletLoaded]);

  // Update Map
  useEffect(() => {
    if (!mapInstance || !data || !window.L) return;
    const { lat, lng } = data.coords;
    mapInstance.setView([lat, lng], 14);

    if (markerRef.current) mapInstance.removeLayer(markerRef.current);
    if (circleRef.current) mapInstance.removeLayer(circleRef.current);

    const newMarker = window.L.marker([lat, lng]).addTo(mapInstance);
    newMarker.bindPopup(`<b>${data.location}</b>`).openPopup();
    markerRef.current = newMarker;

    const newCircle = window.L.circle([lat, lng], { color: isDarkMode ? '#3b82f6' : '#65a30d', fillColor: isDarkMode ? '#3b82f6' : '#65a30d', fillOpacity: 0.1, radius: 5000 }).addTo(mapInstance);
    circleRef.current = newCircle;

    mapInstance.panTo([lat, lng]);
    setTimeout(() => mapInstance.invalidateSize(), 200);
  }, [data, mapInstance, isDarkMode]);

  // --- Address Standardizer ---
  const formatAddress = (addrObj) => {
    if (!addrObj) return "Unknown Location";
    const street = addrObj.road || addrObj.street || addrObj.pedestrian || "";
    const ward = addrObj.ward || addrObj.quarter || "";
    const district = addrObj.city_district || addrObj.district || "";
    
    const parts = [];
    if (street) parts.push(street);
    if (ward) parts.push(ward.includes('Phường') ? ward : `Phường ${ward}`);
    if (district) parts.push(district);
    
    return parts.length > 0 ? parts.join(', ') : (addrObj.city || "Ho Chi Minh City");
  };

  // --- Data Fetching ---
  const fetchEnvironmentalData = async (lat, lng, formattedAddress) => {
    try {
      const weatherRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,wind_speed_10m&hourly=uv_index,precipitation_probability,precipitation&daily=uv_index_max&air_quality=us_aqi&timezone=Asia%2FHo_Chi_Minh`
      );
      
      const marineRes = await fetch(
        `https://marine-api.open-meteo.com/v1/marine?latitude=${TIDE_STATION_COORDS.lat}&longitude=${TIDE_STATION_COORDS.lng}&daily=tide_high,tide_low&timezone=Asia%2FHo_Chi_Minh`
      );

      if (!weatherRes.ok) throw new Error("Weather service unavailable");
      
      const weatherData = await weatherRes.json();
      const marineData = await marineRes.ok ? await marineRes.json() : null;

      const current = weatherData.current;
      const hourly = weatherData.hourly;
      const aqi = weatherData.current.us_aqi || 50; 
      
      const currentHour = new Date().getHours();
      const uvIndex = hourly.uv_index[currentHour] || 0;
      const currentRain = current.rain || 0;
      const nextHourRainProb = hourly.precipitation_probability ? hourly.precipitation_probability[currentHour + 1] : 0;
      const nextHourRainAmount = hourly.precipitation ? hourly.precipitation[currentHour + 1] : 0; 

      let tideData = [];
      if (marineData && marineData.daily) {
        const highs = marineData.daily.tide_high.slice(0, 2);
        const lows = marineData.daily.tide_low.slice(0, 2);
        const formatTime = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        
        if (highs.length > 0 && lows.length > 0) {
            highs.forEach(t => tideData.push({ type: 'High', time: formatTime(t), height: '3.5m' })); 
            lows.forEach(t => tideData.push({ type: 'Low', time: formatTime(t), height: '1.1m' }));
            tideData.sort((a, b) => new Date('1970/01/01 ' + a.time) - new Date('1970/01/01 ' + b.time));
        } else {
            tideData = generateTideFallback();
        }
      } else {
        tideData = generateTideFallback(); 
      }

      const newsUpdates = generateNewsUpdates(currentRain, nextHourRainProb);

      setData({
        location: formattedAddress,
        coords: { lat, lng },
        weather: {
          temp: current.temperature_2m,
          feelsLike: current.apparent_temperature,
          humidity: current.relative_humidity_2m,
          rain: currentRain,
          nextHourProb: nextHourRainProb,
          nextHourAmount: nextHourRainAmount, 
          uv: uvIndex,
          aqi: aqi,
          code: current.weather_code
        },
        tides: tideData,
        news: newsUpdates
      });
    } catch (err) {
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // --- Search & Input Logic ---
  const handleInputChange = (e) => {
    const value = e.target.value; setAddress(value);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (!value.trim()) { setSuggestions([]); setShowSuggestions(false); return; }
    
    debounceTimerRef.current = setTimeout(async () => {
      try { 
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&viewbox=106.3,11.2,107.1,10.3&bounded=1&countrycodes=vn&limit=8&addressdetails=1`); 
        if (res.ok) { 
            const rawResults = await res.json();
            const uniqueResults = [];
            const seenAddresses = new Set();
            rawResults.forEach(item => {
                const fmt = formatAddress(item.address);
                if (fmt && fmt !== "Ho Chi Minh City" && !seenAddresses.has(fmt)) {
                    seenAddresses.add(fmt);
                    item.formatted_display = fmt;
                    uniqueResults.push(item);
                }
            });
            setSuggestions(uniqueResults.slice(0, 5)); 
            setShowSuggestions(true); 
        } 
      } catch (err) {}
    }, 500);
  };

  const handleSuggestionClick = async (s) => { 
      const f = s.formatted_display || formatAddress(s.address); 
      setAddress(f); setShowSuggestions(false); setLoading(true); setError(null); 
      try { 
          await fetchEnvironmentalData(parseFloat(s.lat), parseFloat(s.lon), f); 
      } catch (e) { setError(e.message); setLoading(false); } 
  };

  const handleSearch = async (e) => { 
      e.preventDefault(); if(!address.trim()) return; setLoading(true); 
      try { 
          const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&viewbox=106.3,11.2,107.1,10.3&bounded=1&countrycodes=vn&addressdetails=1`); 
          const d = await r.json(); 
          if(!d.length) throw new Error("Not found"); 
          await fetchEnvironmentalData(parseFloat(d[0].lat), parseFloat(d[0].lon), formatAddress(d[0].address)); 
      } catch (e) { setError(e.message); setLoading(false); } 
  };

  const generateNewsUpdates = (rain, nextProb) => {
    const updates = [];
    // Official Traffic Button
    updates.push({ 
        type: 'traffic-button', 
        url: 'https://giaothong.hochiminhcity.gov.vn/'
    });
    if (rain > 10 || nextProb > 60) updates.push({ source: 'Hydro-Met Service', time: 'Alert', text: 'Heavy rain predicted. Check flood zones.', type: 'warning', url: 'https://nchmf.gov.vn/' });
    else updates.push({ source: 'Hydro-Met Service', time: 'Today', text: 'Normal weather conditions reported.', type: 'info', url: 'https://nchmf.gov.vn/' });
    return updates;
  };

  const generateTideFallback = () => {
      return [
        { type: 'High', time: '04:30 AM', height: '3.2m' },
        { type: 'Low', time: '10:15 AM', height: '1.2m' },
        { type: 'High', time: '05:45 PM', height: '3.8m' },
        { type: 'Low', time: '11:30 PM', height: '0.9m' }
      ];
  };

  const getWeatherIcon = (code) => {
    const colorClass = isDarkMode ? 'text-yellow-500' : 'text-lime-700';
    if (code <= 3) return <Activity className={colorClass} size={24} />;
    if (code <= 67) return <CloudRain className={theme.accentPrimary} size={24} />;
    return <AlertTriangle className={theme.textSub} size={24} />;
  };

  return (
    <div className={`min-h-screen font-sans flex flex-col transition-colors duration-300 ${theme.bg} ${theme.textMain}`}>
      <style>{` 
        .leaflet-container { width: 100% !important; height: 100% !important; min-height: 500px; border-radius: 0.5rem; z-index: 1; filter: ${theme.mapFilter}; } 
        /* Crucial fix for pin cursor */
        .crosshair-active, .crosshair-active .leaflet-interactive { cursor: crosshair !important; }
      `}</style>

      {/* Header */}
      <header className={`${theme.cardBg} shadow-sm border-b ${theme.cardBorder} px-4 py-3 flex items-center justify-between z-20 sticky top-0`}>
        <div className="flex items-center gap-2">
          <div className={`${isDarkMode ? 'bg-blue-600' : 'bg-lime-700'} p-2 rounded-lg text-white shadow-lg`}><MapPin size={18}/></div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-stone-800 dark:text-white">Stay Dry</h1>
            <div className={`flex items-center gap-1 text-[10px] ${theme.accentPrimary} font-medium uppercase`}><div className={`w-1.5 h-1.5 rounded-full ${isDarkMode ? 'bg-blue-400' : 'bg-lime-500'} animate-pulse`}></div>Ho Chi Minh City</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href="https://paypal.me/sivarajpragasm" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#0070BA] text-white text-[10px] font-bold hover:bg-[#003087]"><Heart size={12} className="fill-white"/> Donate</a>
          <button onClick={() => setIsDarkMode(!isDarkMode)} className={`p-1.5 rounded-full border ${theme.cardBorder} hover:${theme.bg}`}>{isDarkMode ? <Sun size={16}/> : <Moon size={16}/>}</button>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full gap-6 grid grid-cols-1 lg:grid-cols-3 h-auto">
        <div className="lg:col-span-1 flex flex-col gap-4">
          
          {/* Time & Search */}
          <div className={`${theme.cardBg} p-4 rounded-xl shadow-sm border ${theme.cardBorder} relative z-30`}>
            {/* Live Clock */}
            <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-stone-500">
               <Calendar size={14} className={theme.accentPrimary} />
               <span>{currentTime || "Loading..."}</span>
            </div>

            <div className="flex gap-2">
              <form onSubmit={handleSearch} className="relative flex-1">
                <input type="text" value={address} onChange={handleInputChange} placeholder="Street, Ward..." className={`w-full pl-9 pr-3 py-3 ${theme.inputBg} border ${theme.inputBorder} rounded-lg text-sm ${theme.textMain} focus:outline-none`} />
                <Search className={`absolute left-3 top-3.5 ${theme.textSub}`} size={16} />
                <button type="submit" disabled={loading} className={`absolute right-2 top-2 p-1.5 rounded-md ${theme.buttonPrimary} disabled:opacity-50`}>{loading ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"/> : <Navigation size={16} />}</button>
                {showSuggestions && suggestions.length > 0 && <div className={`absolute top-full left-0 right-0 mt-1 ${theme.cardBg} border ${theme.cardBorder} rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto`}>{suggestions.map((item, i) => <div key={i} onClick={() => handleSuggestionClick(item)} className={`p-3 hover:${theme.inputBg} cursor-pointer border-b ${theme.cardBorder} text-sm`}>{item.formatted_display}</div>)}</div>}
              </form>
              <button onClick={() => setIsPinMode(!isPinMode)} className={`p-3 rounded-lg border ${isPinMode ? theme.highlight : theme.buttonSecondary}`}><Crosshair size={20} /></button>
            </div>
            {isPinMode && <div className={`mt-3 text-xs px-3 py-2 rounded border animate-pulse ${theme.highlight}`}>Click map to select.</div>}
            {error && <div className="mt-3 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100"><AlertTriangle size={16} className="inline mr-2"/>{error}</div>}
          </div>

          {!data && !loading && (
            <div className={`flex-1 flex flex-col items-center justify-center ${theme.textSub} ${theme.inputBg} rounded-xl border-2 border-dashed ${theme.cardBorder} p-8 min-h-[200px]`}>
              <MapPin size={48} className="mb-4 opacity-20" />
              <p className="text-center text-sm">Search to check Rain, UV, and Tides.</p>
            </div>
          )}

          {data && (
            <>
              {/* Location */}
              <div className={`${theme.cardBg} p-4 rounded-xl shadow-sm border ${theme.cardBorder}`}>
                <h2 className="text-lg font-bold leading-tight">{data.location}</h2>
              </div>

              {/* Weather Grid (Temp & Humidity) */}
              <div className="grid grid-cols-2 gap-3">
                <div className={`${theme.cardBg} p-4 rounded-xl shadow-sm border ${theme.cardBorder} flex flex-col justify-between`}>
                  <div className="flex justify-between items-start"><span className={`text-xs font-medium ${theme.textSub}`}>TEMP</span>{getWeatherIcon(data.weather.code)}</div>
                  <div className={`text-2xl font-bold ${getStatusColor(data.weather.temp, 'temp')}`}>{data.weather.temp}°C</div>
                  <div className={`text-xs ${theme.textSub}`}>Feels {data.weather.feelsLike}°</div>
                </div>
                <div className={`${theme.cardBg} p-4 rounded-xl shadow-sm border ${theme.cardBorder} flex flex-col justify-between`}>
                  <div className="flex justify-between items-start"><span className={`text-xs font-medium ${theme.textSub}`}>HUMIDITY</span><Droplets className={theme.accentPrimary} size={20} /></div>
                  <div className={`text-2xl font-bold ${getStatusColor(data.weather.humidity, 'humidity')}`}>{data.weather.humidity}%</div>
                </div>
              </div>

              {/* Commute Conditions (UV & Air) - Now BELOW Temp */}
              <div className="grid grid-cols-2 gap-3">
                <div className={`${theme.cardBg} p-4 rounded-xl shadow-sm border ${theme.cardBorder}`}>
                  <div className="flex justify-between items-start"><span className={`text-xs font-medium ${theme.textSub}`}>UV INDEX</span><Sun size={20} className={getStatusColor(data.weather.uv, 'uv')}/></div>
                  <div className={`text-2xl font-bold ${getStatusColor(data.weather.uv, 'uv')}`}>{data.weather.uv.toFixed(1)}</div>
                  <div className="text-[10px] text-slate-400">{data.weather.uv > 7 ? 'High' : 'Low'}</div>
                </div>
                <div className={`${theme.cardBg} p-4 rounded-xl shadow-sm border ${theme.cardBorder}`}>
                  <div className="flex justify-between items-start"><span className={`text-xs font-medium ${theme.textSub}`}>AIR (AQI)</span><Wind size={20} className={getStatusColor(data.weather.aqi, 'aqi')}/></div>
                  <div className={`text-2xl font-bold ${getStatusColor(data.weather.aqi, 'aqi')}`}>{data.weather.aqi}</div>
                  <div className="text-[10px] text-slate-400">US Standard</div>
                </div>
              </div>

              {/* Rain Card */}
              <div className={`${theme.cardBg} p-4 rounded-xl shadow-sm border ${theme.cardBorder}`}>
                <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><CloudRain size={18} className={theme.accentPrimary}/><span className="font-semibold">Rain Status</span></div><span className={`text-xs font-bold ${getStatusColor(data.weather.rain, 'rain')}`}>{data.weather.rain > 0 ? 'RAINING' : 'DRY'}</span></div>
                <div className="flex items-end gap-2 mb-2"><span className={`text-3xl font-bold ${getStatusColor(data.weather.rain, 'rain')}`}>{data.weather.rain}</span><span className={`text-sm ${theme.textSub} mb-1`}>mm current</span></div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className={`p-2 rounded border ${theme.inputBorder} ${theme.inputBg}`}>
                        <div className={theme.textSub}>Next Hour</div>
                        <div className={`font-bold ${data.weather.nextHourProb > 50 ? 'text-orange-500' : 'text-lime-600'}`}>{data.weather.nextHourProb}% Chance</div>
                    </div>
                    <div className={`p-2 rounded border ${theme.inputBorder} ${theme.inputBg}`}>
                        <div className={theme.textSub}>Exp. Volume</div>
                        <div className="font-bold">{data.weather.nextHourAmount} mm</div>
                    </div>
                </div>
              </div>

              {/* Official Updates */}
              <div className={`${theme.cardBg} p-4 rounded-xl shadow-sm border ${theme.cardBorder}`}>
                <div className="flex gap-2 mb-3"><Newspaper size={18} className="text-pink-500"/><span className="font-semibold">Official Updates</span></div>
                {data.news.map((item, i) => (
                    item.type === 'traffic-button' ? (
                        <a key={i} href={item.url} target="_blank" className={`flex items-center justify-center gap-2 w-full p-3 rounded-lg font-bold text-white text-sm ${theme.buttonPrimary} mb-3 transition-colors shadow-sm`}>
                            <Video size={16} /> Live Traffic Cameras
                        </a>
                    ) : (
                        <a key={i} href={item.url} target="_blank" className={`block p-3 rounded border text-xs hover:opacity-75 ${item.type === 'alert' ? 'bg-red-50 border-red-100' : `${theme.inputBg} ${theme.inputBorder}`}`}>
                            <div className="flex justify-between mb-1">
                                <span className={`font-bold flex items-center ${item.type === 'alert' ? 'text-red-600' : theme.textSub}`}>{item.source}<ExternalLink size={10} className="ml-1 opacity-50"/></span>
                                <span className={theme.textSub}>{item.time}</span>
                            </div>
                            <p>{item.text}</p>
                        </a>
                    )
                ))}
              </div>

              {/* Tides (Saigon River) */}
              <div className={`${theme.cardBg} p-4 rounded-xl shadow-sm border ${theme.cardBorder}`}>
                <div className="flex gap-2 mb-3"><Waves size={18} className={theme.accentPrimary}/><span className="font-semibold">Tides (Saigon River)</span></div>
                <div className="grid grid-cols-2 gap-3">
                  {/* LOW Tide Column (Left) */}
                  <div className="flex flex-col gap-2">
                    <div className={`text-xs font-bold text-center ${theme.textSub} pb-1 border-b ${theme.cardBorder}`}>LOW</div>
                    {data.tides.filter(t => t.type === 'Low').map((t, i) => (
                        <div key={i} className={`${theme.inputBg} p-2 rounded text-center border ${theme.inputBorder}`}>
                            <div className="font-bold text-sm">{t.time}</div>
                            <div className={`text-xs font-bold ${getStatusColor(t.height.replace('m',''), 'tide')}`}>{t.height}</div>
                        </div>
                    ))}
                  </div>
                  
                  {/* HIGH Tide Column (Right) */}
                  <div className="flex flex-col gap-2">
                    <div className={`text-xs font-bold text-center ${theme.accentPrimary} pb-1 border-b ${theme.cardBorder}`}>HIGH</div>
                    {data.tides.filter(t => t.type === 'High').map((t, i) => (
                        <div key={i} className={`${theme.inputBg} p-2 rounded text-center border ${theme.inputBorder}`}>
                            <div className="font-bold text-sm">{t.time}</div>
                            <div className={`text-xs font-bold ${getStatusColor(t.height.replace('m',''), 'tide')}`}>{t.height}</div>
                        </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right Panel: Map */}
        <div className={`lg:col-span-2 rounded-xl shadow-inner border ${theme.cardBorder} relative overflow-hidden`}>
          <div id="map" ref={mapRef} style={{ minHeight: '500px', width: '100%', height: '100%' }} />
          <div className={`absolute bottom-4 right-4 ${isDarkMode ? 'bg-slate-900/90' : 'bg-white/90'} backdrop-blur p-3 rounded-lg shadow-lg text-xs z-[400] border ${theme.cardBorder}`}>
             <h4 className="font-bold mb-2">Legend</h4>
             <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow-sm"></div><span className={theme.textSub}>Your Location</span></div>
             <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded-full bg-red-500 opacity-50"></div><span className={theme.textSub}>Known Flood Zone</span></div>
             <div className="flex items-center gap-2"><div className={`w-3 h-3 rounded-full ${isDarkMode ? 'bg-blue-500' : 'bg-lime-600'} opacity-20 border`}></div><span className={theme.textSub}>5km Radius</span></div>
          </div>
        </div>

      </main>
    </div>
  );
}
