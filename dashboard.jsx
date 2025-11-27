import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Droplets, CloudRain, AlertTriangle, Activity, Wind, Navigation, Layers, Crosshair, Waves, Newspaper, Sun, Moon, Info, Heart, ExternalLink } from 'lucide-react';

// Ho Chi Minh City Constants
const HCMC_CENTER = [10.7769, 106.7009];
const HCMC_BOUNDS = [
  [10.3500, 106.3000],
  [11.1600, 107.0200] 
];

// Color Themes
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
    accentSecondary: 'text-lime-400',
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
    accentSecondary: 'text-lime-600',
    buttonPrimary: 'bg-lime-700 hover:bg-lime-800 text-white',
    buttonSecondary: 'bg-white border-lime-200 text-lime-700 hover:bg-lime-50',
    highlight: 'bg-lime-100 text-lime-800 border-lime-200',
    mapFilter: 'none'
  }
};

export default function App() {
  // State
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
  
  const theme = isDarkMode ? THEMES.dark : THEMES.light;

  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const debounceTimerRef = useRef(null); 

  // --- PWA Service Worker Registration ---
  useEffect(() => {
    if ('serviceWorker' in navigator && 
        (window.location.protocol === 'https:' || window.location.protocol === 'http:')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
          .catch(err => console.log('SW Reg:', err));
      });
    }
  }, []);

  // --- Helper for Safety Color Coding ---
  const getStatusColor = (value, type) => {
    if (isDarkMode) return 'text-slate-100'; 

    const SAFE = 'text-lime-600';
    const WARN = 'text-orange-500';
    const DANGER = 'text-red-600';

    switch (type) {
      case 'rain': 
        if (value > 30) return DANGER;
        if (value > 10) return WARN;
        return SAFE;
      case 'flood':
        if (value === 'Critical' || value === 'High') return DANGER;
        if (value === 'Moderate') return WARN;
        return SAFE;
      case 'traffic':
        if (value === 'Heavy') return DANGER;
        if (value === 'Moderate') return WARN;
        return SAFE;
      case 'tide':
        if (value > 3.5) return WARN;
        return SAFE;
      case 'canal':
        if (value > 2.0) return DANGER; 
        if (value > 1.5) return WARN;
        return SAFE;
      case 'temp':
        if (value > 35) return DANGER;
        if (value > 31) return WARN;
        return SAFE;
      default:
        return theme.textMain;
    }
  };

  // 1. Force Load Leaflet CSS & JS
  useEffect(() => {
    // Check/Inject CSS
    if (!document.querySelector('link[href*="leaflet.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
    }

    // Check/Inject JS
    const existingScript = document.querySelector('script[src*="leaflet.js"]');
    if (existingScript && window.L) {
      setLeafletLoaded(true);
    } else if (!existingScript) {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.async = true;
        script.onload = () => setLeafletLoaded(true);
        document.body.appendChild(script);
    } else {
        const checkL = setInterval(() => {
            if (window.L) {
                setLeafletLoaded(true);
                clearInterval(checkL);
            }
        }, 200);
        return () => clearInterval(checkL);
    }
  }, []);

  // 2. Initialize Map
  useEffect(() => {
    if (!leafletLoaded || !mapRef.current || mapInstance) return;
    if (!window.L) return;

    try {
      const map = window.L.map(mapRef.current, {
        center: HCMC_CENTER,
        zoom: 12,
        minZoom: 10,
        maxBounds: HCMC_BOUNDS, 
        maxBoundsViscosity: 1.0 
      });

      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      // Critical Fix: Force redraw to prevent gray/white tiles
      setTimeout(() => { 
          map.invalidateSize(); 
      }, 100);
      setTimeout(() => { 
          map.invalidateSize(); 
      }, 1000);

      setMapInstance(map);
    } catch (err) {
      console.error(err);
    }

    return () => {
      if (mapInstance) {
        mapInstance.remove();
        setMapInstance(null);
      }
    };
  }, [leafletLoaded]);

  // 3. Resize Observer (Fixes map when switching views/devices)
  useEffect(() => {
      if(!mapInstance || !mapRef.current) return;
      
      const resizeObserver = new ResizeObserver(() => {
          mapInstance.invalidateSize();
      });
      
      resizeObserver.observe(mapRef.current);
      
      return () => {
          resizeObserver.disconnect();
      };
  }, [mapInstance]);

  // 4. Update Map Data
  useEffect(() => {
    if (!mapInstance || !data || !window.L) return;

    const { lat, lng } = data.coords;
    mapInstance.setView([lat, lng], 13);

    if (markerRef.current) mapInstance.removeLayer(markerRef.current);
    if (circleRef.current) mapInstance.removeLayer(circleRef.current);

    const newMarker = window.L.marker([lat, lng]).addTo(mapInstance);
    newMarker.bindPopup(`<b>${data.location}</b>`).openPopup();
    markerRef.current = newMarker;

    const newCircle = window.L.circle([lat, lng], {
      color: isDarkMode ? '#3b82f6' : '#65a30d',
      fillColor: isDarkMode ? '#3b82f6' : '#65a30d',
      fillOpacity: 0.1,
      radius: 5000
    }).addTo(mapInstance);
    circleRef.current = newCircle;

    mapInstance.panInsideBounds(HCMC_BOUNDS);
    setTimeout(() => mapInstance.invalidateSize(), 200);
  }, [data, mapInstance, isDarkMode]);


  // --- Helpers ---
  const formatAddress = (addrObj) => {
    if (!addrObj) return "Unknown Location";
    const street = addrObj.road || addrObj.pedestrian || addrObj.street || "";
    const ward = addrObj.quarter || addrObj.ward || addrObj.neighbourhood || "";
    const district = addrObj.city_district || addrObj.district || addrObj.suburb || "";
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
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,wind_speed_10m&hourly=soil_moisture_0_to_1cm,precipitation_probability&timezone=Asia%2FHo_Chi_Minh`
      );
      const marineRes = await fetch(
        `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}&daily=tide_high,tide_low&timezone=Asia%2FHo_Chi_Minh`
      );

      if (!weatherRes.ok) throw new Error("Weather service unavailable");
      
      const weatherData = await weatherRes.json();
      const marineData = await marineRes.ok ? await marineRes.json() : null;

      const current = weatherData.current;
      const hourly = weatherData.hourly;
      
      const recentSoilMoisture = hourly.soil_moisture_0_to_1cm[0] || 0;
      const currentRain = current.rain || 0;
      const nextHourRainProb = hourly.precipitation_probability ? hourly.precipitation_probability[1] : 0;

      // Tides
      let tideData = [];
      if (marineData && marineData.daily) {
        const highs = marineData.daily.tide_high.slice(0, 2);
        const lows = marineData.daily.tide_low.slice(0, 2);
        const formatTime = (isoString) => {
            const date = new Date(isoString);
            return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        };
        highs.forEach(t => tideData.push({ type: 'High', time: formatTime(t), height: '3.5m' }));
        lows.forEach(t => tideData.push({ type: 'Low', time: formatTime(t), height: '1.1m' }));
        tideData.sort((a, b) => new Date('1970/01/01 ' + a.time) - new Date('1970/01/01 ' + b.time));
      } else {
        tideData = generateTideData(); 
      }

      // Flood Risk
      const canalLevel = 1.2 + (currentRain * 0.05); 
      const warningThreshold = 2.0; 
      let floodRiskScore = 0;
      let floodRiskLevel = "Low";

      if (recentSoilMoisture > 0.35) floodRiskScore += 15;
      if (recentSoilMoisture > 0.45) floodRiskScore += 15;
      if (currentRain > 5) floodRiskScore += 10;
      if (currentRain > 15) floodRiskScore += 10;
      if (currentRain > 30) floodRiskScore += 10;
      if (canalLevel > 1.5) floodRiskScore += 15;
      if (canalLevel > warningThreshold) floodRiskScore += 25;

      if (floodRiskScore > 80) floodRiskLevel = "Critical";
      else if (floodRiskScore > 50) floodRiskLevel = "High";
      else if (floodRiskScore > 30) floodRiskLevel = "Moderate";

      const trafficConditions = generateTrafficReport(currentRain, current.is_day);
      const newsUpdates = generateNewsUpdates(floodRiskLevel, currentRain, nextHourRainProb);

      setData({
        location: formattedAddress,
        coords: { lat, lng },
        weather: {
          temp: current.temperature_2m,
          feelsLike: current.apparent_temperature,
          humidity: current.relative_humidity_2m,
          rain: currentRain,
          nextHourProb: nextHourRainProb,
          wind: current.wind_speed_10m,
          code: current.weather_code
        },
        flood: {
          level: floodRiskLevel,
          score: floodRiskScore,
          soilMoisture: recentSoilMoisture,
          canalLevel: canalLevel.toFixed(2), 
          warningThreshold: warningThreshold
        },
        traffic: trafficConditions,
        tides: tideData,
        news: newsUpdates
      });
    } catch (err) {
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!address.trim()) return;
    setShowSuggestions(false); setLoading(true); setError(null);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&viewbox=106.3,11.2,107.1,10.3&bounded=1&countrycodes=vn&addressdetails=1`);
      if (!res.ok) throw new Error("Geocoding unavailable");
      const geoData = await res.json();
      if (!geoData || geoData.length === 0) throw new Error("Address not found in HCMC.");
      const loc = geoData[0];
      const lat = parseFloat(loc.lat); const lon = parseFloat(loc.lon);
      if (lat < HCMC_BOUNDS[0][0] || lat > HCMC_BOUNDS[1][0] || lon < HCMC_BOUNDS[0][1] || lon > HCMC_BOUNDS[1][1]) throw new Error("Location outside HCMC.");
      await fetchEnvironmentalData(lat, lon, formatAddress(loc.address));
    } catch (err) { setError(err.message); setLoading(false); }
  };

  // ... (Input handlers: handleInputChange, handleSuggestionClick, handleMapClick - same logic as previous)
  const handleInputChange = (e) => {
    const value = e.target.value;
    setAddress(value);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (!value.trim()) { setSuggestions([]); setShowSuggestions(false); return; }
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&viewbox=106.3,11.2,107.1,10.3&bounded=1&countrycodes=vn&limit=5&addressdetails=1`);
        if (res.ok) { const results = await res.json(); setSuggestions(results); setShowSuggestions(true); }
      } catch (err) { console.error(err); }
    }, 500);
  };

  const handleSuggestionClick = async (suggestion) => {
    const formatted = formatAddress(suggestion.address);
    setAddress(formatted); setShowSuggestions(false); setSuggestions([]); setLoading(true); setError(null);
    try {
       const latNum = parseFloat(suggestion.lat); const lonNum = parseFloat(suggestion.lon);
       if (latNum < HCMC_BOUNDS[0][0] || latNum > HCMC_BOUNDS[1][0] || lonNum < HCMC_BOUNDS[0][1] || lonNum > HCMC_BOUNDS[1][1]) throw new Error("Location outside HCMC.");
       await fetchEnvironmentalData(latNum, lonNum, formatted);
    } catch (err) { setError(err.message); setLoading(false); }
  };

  const generateTrafficReport = (rain, isDay) => {
    const baseCongestion = Math.floor(Math.random() * 30) + 10;
    const rainFactor = rain > 0 ? 20 : 0;
    const totalCongestion = Math.min(baseCongestion + rainFactor, 100);
    let status = "Clear";
    if (totalCongestion > 40) status = "Moderate";
    if (totalCongestion > 70) status = "Heavy";
    return { congestion: totalCongestion, status: status, avgSpeed: 50 - (totalCongestion * 0.4), incidents: totalCongestion > 60 ? 1 : 0 };
  };

  const generateTideData = () => [
    { type: 'High', time: '04:30 AM', height: '3.8m' },
    { type: 'Low', time: '10:15 AM', height: '1.2m' },
    { type: 'High', time: '05:45 PM', height: '4.1m' },
    { type: 'Low', time: '11:30 PM', height: '0.9m' }
  ];

  const generateNewsUpdates = (riskLevel, rain, nextProb) => {
    const updates = [];
    // Prioritize the Official Traffic Portal
    updates.push({
        source: 'HCMC Traffic Portal',
        time: 'Official Source',
        text: 'Check live cameras and official congestion maps.',
        type: 'info',
        url: 'https://giaothong.hochiminhcity.gov.vn/'
    });

    if (riskLevel === 'High' || riskLevel === 'Critical') {
        updates.push({
            source: 'Flood Control',
            time: 'Live Alert',
            text: 'High water levels detected in low-lying districts.',
            type: 'alert',
            url: 'https://phongchongthientai.hochiminhcity.gov.vn/'
        });
    }
    if (rain > 10) {
         updates.push({
            source: 'Hydro-Met Service',
            time: '25m ago',
            text: 'Heavy rain advisory in effect.',
            type: 'warning',
            url: 'https://nchmf.gov.vn/'
        });
    }
    return updates;
  };

  const getWeatherIcon = (code) => {
    const colorClass = isDarkMode ? 'text-yellow-500' : 'text-lime-700';
    if (code <= 3) return <Activity className={colorClass} size={24} />;
    if (code <= 67) return <CloudRain className={theme.accentPrimary} size={24} />;
    return <AlertTriangle className={theme.textSub} size={24} />;
  };

  return (
    <div className={`min-h-screen font-sans flex flex-col transition-colors duration-300 ${theme.bg} ${theme.textMain}`}>
      {/* Inline Styles for robust map sizing */}
      <style>{`
        .leaflet-container { 
            width: 100% !important; 
            height: 100% !important; 
            min-height: 500px; /* FORCED HEIGHT */
            border-radius: 0.5rem; 
            z-index: 1; 
            filter: ${theme.mapFilter}; 
        }
      `}</style>

      {/* Header */}
      <header className={`${theme.cardBg} shadow-sm border-b ${theme.cardBorder} px-4 py-3 md:px-6 md:py-4 flex items-center justify-between z-20 sticky top-0`}>
        <div className="flex items-center gap-2 md:gap-3">
          <div className={`${isDarkMode ? 'bg-blue-600' : 'bg-lime-700'} p-1.5 md:p-2 rounded-lg text-white shadow-lg`}>
            <MapPin size={18} className="md:w-5 md:h-5" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl tracking-tight text-stone-800 dark:text-white">
               <span className="font-bold">Stay Dry:</span> <span className="font-normal">Ho Chi Minh City</span>
            </h1>
            <div className={`flex items-center gap-1 text-[10px] ${theme.accentPrimary} font-medium uppercase`}>
               <div className={`w-1.5 h-1.5 rounded-full ${isDarkMode ? 'bg-blue-400' : 'bg-lime-500'} animate-pulse`}></div>
               Ho Chi Minh City
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <a href="https://paypal.me/sivarajpragasm" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 md:gap-2 px-3 py-1.5 md:py-2 rounded-full bg-[#0070BA] text-white text-[10px] md:text-xs font-bold hover:bg-[#003087] shadow-sm">
            <Heart size={12} className="fill-white" /> Donate
          </a>
          <button onClick={() => setIsDarkMode(!isDarkMode)} className={`p-1.5 md:p-2 rounded-full border ${theme.cardBorder} ${theme.textSub} hover:${theme.bg}`}>
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full gap-6 grid grid-cols-1 lg:grid-cols-3 h-auto">
        
        {/* Left Panel */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          
          {/* Search Box */}
          <div className={`${theme.cardBg} p-4 rounded-xl shadow-sm border ${theme.cardBorder} relative z-30`}>
            <label className={`block text-xs font-semibold ${theme.textSub} mb-2`}>FIND LOCATION</label>
            <div className="flex gap-2">
              <form onSubmit={handleSearch} className="relative flex-1">
                <input type="text" value={address} onChange={handleInputChange} placeholder="Street, Ward..." className={`w-full pl-9 pr-3 py-3 ${theme.inputBg} border ${theme.inputBorder} rounded-lg text-sm ${theme.textMain} focus:outline-none`} />
                <Search className={`absolute left-3 top-3.5 ${theme.textSub}`} size={16} />
                <button type="submit" disabled={loading} className={`absolute right-2 top-2 p-1.5 rounded-md ${theme.buttonPrimary} disabled:opacity-50`}>
                  {loading ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"/> : <Navigation size={16} />}
                </button>
                {showSuggestions && suggestions.length > 0 && (
                  <div className={`absolute top-full left-0 right-0 mt-1 ${theme.cardBg} border ${theme.cardBorder} rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto`}>
                    {suggestions.map((item, i) => (
                      <div key={i} onClick={() => handleSuggestionClick(item)} className={`p-3 hover:${theme.inputBg} cursor-pointer border-b ${theme.cardBorder} text-sm`}>{formatAddress(item.address)}</div>
                    ))}
                  </div>
                )}
              </form>
              <button onClick={() => setIsPinMode(!isPinMode)} className={`p-3 rounded-lg border ${isPinMode ? theme.highlight : theme.buttonSecondary}`}><Crosshair size={20} /></button>
            </div>
            {isPinMode && <div className={`mt-3 text-xs px-3 py-2 rounded border animate-pulse ${theme.highlight}`}>Click anywhere on the map.</div>}
            {error && <div className="mt-3 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100"><AlertTriangle size={16} className="inline mr-2"/>{error}</div>}
          </div>

          {!data && !loading && (
            <div className={`flex-1 flex flex-col items-center justify-center ${theme.textSub} ${theme.inputBg} rounded-xl border-2 border-dashed ${theme.cardBorder} p-8 min-h-[200px]`}>
              <MapPin size={48} className="mb-4 opacity-20" />
              <p className="text-center text-sm">Search for a location to view real-time data.</p>
            </div>
          )}

          {data && (
            <>
              {/* Location & Data Cards */}
              <div className={`${theme.cardBg} p-4 rounded-xl shadow-sm border ${theme.cardBorder}`}>
                <h2 className="text-lg font-bold leading-tight">{data.location}</h2>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className={`${theme.cardBg} p-4 rounded-xl shadow-sm border ${theme.cardBorder}`}>
                  <div className="flex justify-between"><span className={`text-xs font-medium ${theme.textSub}`}>TEMP</span>{getWeatherIcon(data.weather.code)}</div>
                  <div className={`text-2xl font-bold ${getStatusColor(data.weather.temp, 'temp')}`}>{data.weather.temp}°C</div>
                </div>
                <div className={`${theme.cardBg} p-4 rounded-xl shadow-sm border ${theme.cardBorder}`}>
                  <div className="flex justify-between"><span className={`text-xs font-medium ${theme.textSub}`}>HUMIDITY</span><Droplets className={theme.accentPrimary} size={20}/></div>
                  <div className="text-2xl font-bold">{data.weather.humidity}%</div>
                </div>
              </div>

              {/* Traffic Card - UPDATED to link to Official Portal */}
              <div className={`${theme.cardBg} p-4 rounded-xl shadow-sm border ${theme.cardBorder}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex gap-2">
                    <Layers size={18} className="text-orange-500"/>
                    <span className="font-semibold">Traffic Information</span>
                  </div>
                  <a 
                    href="https://giaothong.hochiminhcity.gov.vn/" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 hover:bg-blue-100"
                  >
                    OFFICIAL MAP <ExternalLink size={10} />
                  </a>
                </div>
                
                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  <div className={`${theme.inputBg} p-2 rounded border ${theme.inputBorder}`}>
                    <div className={`text-xs ${theme.textSub}`}>STATUS</div>
                    <div className={`font-bold text-sm ${getStatusColor(data.traffic.status, 'traffic')}`}>{data.traffic.status}</div>
                  </div>
                  <div className={`${theme.inputBg} p-2 rounded border ${theme.inputBorder}`}>
                    <div className={`text-xs ${theme.textSub}`}>SPEED</div>
                    <div className="font-bold text-sm">{data.traffic.avgSpeed.toFixed(0)}</div>
                  </div>
                  <div className={`${theme.inputBg} p-2 rounded border ${theme.inputBorder}`}>
                    <div className={`text-xs ${theme.textSub}`}>INCIDENTS</div>
                    <div className="font-bold text-sm">{data.traffic.incidents}</div>
                  </div>
                </div>
                <div className={`text-[10px] ${theme.textSub} italic text-center`}>
                  Values are estimated based on weather conditions.<br/>
                  Use the <a href="https://giaothong.hochiminhcity.gov.vn/" target="_blank" className="underline text-blue-500">Official Portal</a> for live cameras.
                </div>
              </div>

              {/* Other Cards */}
              <div className={`${theme.cardBg} p-4 rounded-xl shadow-sm border ${theme.cardBorder}`}>
                <div className="flex items-center gap-2 mb-3"><CloudRain size={18} className={theme.accentPrimary} /><span className="font-semibold">Rain</span></div>
                <div className="flex items-end gap-2"><span className={`text-3xl font-bold ${getStatusColor(data.weather.rain, 'rain')}`}>{data.weather.rain}</span><span className={`text-sm ${theme.textSub} mb-1`}>mm</span></div>
                <div className={`mt-3 ${theme.inputBg} rounded p-2 text-xs flex justify-between border ${theme.inputBorder}`}><span>Forecast (1h):</span><span className={`font-bold ${data.weather.nextHourProb > 50 ? 'text-orange-500' : 'text-lime-600'}`}>{data.weather.nextHourProb}% Chance</span></div>
              </div>

              <div className={`p-4 rounded-xl shadow-sm border ${data.flood.level === 'High' ? 'bg-red-50 border-red-200' : `${theme.cardBg} ${theme.cardBorder}`}`}>
                <div className="flex justify-between mb-3"><div className="flex gap-2"><Activity size={18} className={getStatusColor(data.flood.level, 'flood')} /><span className={`font-semibold ${getStatusColor(data.flood.level, 'flood')}`}>Flood Risk</span></div><span className={`text-xs font-bold px-2 py-1 rounded uppercase ${data.flood.level === 'High' ? 'bg-red-100 text-red-700' : 'bg-lime-100 text-lime-700'}`}>{data.flood.level}</span></div>
                <div className={`w-full ${theme.inputBg} h-2 rounded-full overflow-hidden mb-3`}><div className={`h-full ${data.flood.score > 50 ? 'bg-red-500' : 'bg-lime-500'}`} style={{ width: `${data.flood.score}%` }}></div></div>
                <div className={`flex gap-2 text-xs ${theme.textSub} p-2 ${theme.inputBg} rounded-md border ${theme.inputBorder}`}><Waves size={16}/><div className="flex-1 flex justify-between"><span>Canal Levels:</span><span className={`font-bold ${getStatusColor(data.flood.canalLevel, 'canal')}`}>{data.flood.canalLevel}m</span></div></div>
              </div>

              <div className={`${theme.cardBg} p-4 rounded-xl shadow-sm border ${theme.cardBorder}`}>
                <div className="flex gap-2 mb-3"><Newspaper size={18} className="text-pink-500"/><span className="font-semibold">Alerts</span></div>
                <div className="space-y-2">{data.news.map((item, i) => (<a key={i} href={item.url} target="_blank" className={`block p-3 rounded border text-xs hover:opacity-75 ${item.type === 'alert' ? 'bg-red-50 border-red-100' : `${theme.inputBg} ${theme.inputBorder}`}`}><div className="flex justify-between mb-1"><span className={`font-bold flex items-center ${item.type === 'alert' ? 'text-red-600' : theme.textSub}`}>{item.source}<ExternalLink size={10} className="ml-1 opacity-50"/></span><span className={theme.textSub}>{item.time}</span></div><p>{item.text}</p></a>))}</div>
              </div>

              <div className={`${theme.cardBg} p-4 rounded-xl shadow-sm border ${theme.cardBorder}`}>
                <div className="flex gap-2 mb-3"><Waves size={18} className={theme.accentPrimary}/><span className="font-semibold">Tides (Real-Time)</span></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <div className={`text-xs font-bold text-center ${theme.accentPrimary} pb-1 border-b ${theme.cardBorder}`}>HIGH</div>
                    {data.tides.filter(t => t.type === 'High').map((t, i) => (<div key={i} className={`${theme.inputBg} p-2 rounded text-center border ${theme.inputBorder}`}><div className="font-bold text-sm">{t.time}</div><div className={`text-xs ${getStatusColor(parseFloat(t.height), 'tide')}`}>{t.height}</div></div>))}
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className={`text-xs font-bold text-center ${theme.textSub} pb-1 border-b ${theme.cardBorder}`}>LOW</div>
                    {data.tides.filter(t => t.type === 'Low').map((t, i) => (<div key={i} className={`${theme.inputBg} p-2 rounded text-center border ${theme.inputBorder}`}><div className="font-bold text-sm">{t.time}</div><div className="text-xs text-lime-600">{t.height}</div></div>))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right Panel: Map */}
        <div className={`lg:col-span-2 rounded-xl shadow-inner border ${theme.cardBorder} relative overflow-hidden`}>
          {/* NOTE: Inline style here enforces map height as critical fix */}
          <div id="map" ref={mapRef} style={{ minHeight: '500px', width: '100%', height: '100%' }} />
          <div className={`absolute bottom-4 right-4 ${isDarkMode ? 'bg-slate-900/90' : 'bg-white/90'} backdrop-blur p-3 rounded-lg shadow-lg text-xs z-[400] border ${theme.cardBorder}`}>
             <h4 className="font-bold mb-2">Legend</h4>
             <div className="flex items-center gap-2 mb-1"><div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow-sm"></div><span className={theme.textSub}>Target</span></div>
             <div className="flex items-center gap-2"><div className={`w-3 h-3 rounded-full ${isDarkMode ? 'bg-blue-500' : 'bg-lime-600'} opacity-20 border`}></div><span className={theme.textSub}>5km Zone</span></div>
          </div>
        </div>

      </main>
    </div>
  );
}
