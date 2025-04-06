let map;
let startMarker, endMarker;
let directionsService, directionsRenderer;
let bikeMarker = null;
let watchID;
let weatherUpdateInterval;
let trafficLayer;
let trackingPath = null; // Store route line
let routeCoordinates = [];
let isFirstUpdate = true; // Track first location update
let prevLat = null, prevLng = null;
let userMarker = null; // Global variable
let notificationQueue = [];
let isNotificationVisible = false;
let polylinePath;
let animatedMarker;
let lastLat = null;
let lastLng = null;
let lastBearing = null;

//GOOGLE_BACKEND_API_KEY="AIzaSyCowS_C_sBgN4skNga0w0kbFi33j-Y--1s"
const TOMTOM_API_KEY ="TXxkSyngpPPnOBtfCmGLitjqyqG2oaVP"

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBvU4jnxWWgV-9IOALby0WyNrvLu5q_I3Q",
    authDomain: "project-traffic-c4f70.firebaseapp.com",
    databaseURL: "https://project-traffic-c4f70-default-rtdb.firebaseio.com/",
    projectId: "project-traffic-c4f70",
    storageBucket: "project-traffic-c4f70.appspot.com",
    messagingSenderId: "1042538059004",
    appId: "1:1042538059004:web:7f30b1121eddbcdaa0b379",
    measurementId: "G-2CQQ3YVY6R"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
async function getAccurateLocation() {
    try {
        const response = await fetch(`https://www.googleapis.com/geolocation/v1/geolocate?key=AIzaSyCxztHfiYL5BA2pyUX1txeGnvPDz6GqKjk`, {
            method: "POST"
        });
        const data = await response.json();

        if (data.location) {
            console.log("✅ Accurate Location Found:", data.location);
            return { lat: data.location.lat, lng: data.location.lng };
        } else {
            console.error("❌ Error getting accurate location:", data);
            return null;
        }
    } catch (error) {
        console.error("❌ Geolocation API Error:", error);
        return null;
    }
}


// Example: Update the source field with an accurate location
async function updateLocation() {
    const location = await getAccurateLocation();
    if (location) {
        document.getElementById("source").value = `${location.lat}, ${location.lng}`;
    }
}

async function initMap() {
    console.log("🗺️ Google Maps API initialized");

    let userLocation = await getAccurateLocation();

    if (!userLocation) {
        console.warn("⚠️ Using fallback location (Guntur)");
        userLocation = { lat: 16.3067, lng: 80.4365 };
    }

    map = new google.maps.Map(document.getElementById("map"), {
        center: userLocation,
        zoom: 14,
    });

    new google.maps.Marker({
        position: userLocation,
        map: map,
        title: "You are here!",
        icon: {
            url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
            scaledSize: new google.maps.Size(40, 40),
        },
    });

    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer();
    directionsRenderer.setMap(map);

    trafficLayer = new google.maps.TrafficLayer();
    trafficLayer.setMap(map);

    const locationCheckbox = document.getElementById("useCurrentLocation");
    if (locationCheckbox) {
        locationCheckbox.addEventListener("change", function () {
            const sourceInput = document.getElementById("source");
            if (this.checked && sourceInput) {
                sourceInput.value = `${userLocation.lat}, ${userLocation.lng}`;
                console.log("✅ Source location autofilled:", sourceInput.value);
            }
        });
    }

    attachLiveTracking();
}

function distanceBetween(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of Earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

function getDynamicTimeout(distanceKm) {
    const avgSpeedMps = 6.94; // Approximate speed in meters per second (urban driving)
    const estimatedTimeSec = (distanceKm * 1000) / avgSpeedMps;
    return Math.min(Math.max(estimatedTimeSec * 1000, 15000), 600000); // 15s min, 10 mins max
}

function attachLiveTracking() {
    if (watchID !== null) {
        console.warn("⚠️ Live tracking is already active.");
        return;
    }

    if (navigator.geolocation) {
        const geocoder = new google.maps.Geocoder();
        let lastUpdatedTime = 0;

        watchID = navigator.geolocation.watchPosition(
            (position) => {
                const currentTime = Date.now();
                if (currentTime - lastUpdatedTime > 5000) { // Update every 5 seconds
                    lastUpdatedTime = currentTime;

                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    const newPosition = new google.maps.LatLng(lat, lng);

                    // Smooth transition + live marker
                    if (!bikeMarker) {
                        bikeMarker = new google.maps.Marker({
                            position: newPosition,
                            map: map,
                            title: "Your Bike",
                            icon: {
                                url: "https://maps.google.com/mapfiles/kml/shapes/motorcycling.png",
                                scaledSize: new google.maps.Size(50, 50),
                                anchor: new google.maps.Point(25, 25),
                            },
                        });
                        console.log("🏍️ Bike Marker Added!");
                    } else {
                        bikeMarker.setPosition(newPosition);
                    }

                    // Optional: toggle recentering
                    if (isFirstUpdate || distanceBetween(prevLat, prevLng, lat, lng) > 0.05) {
                        if (autoCenter) map.setCenter(newPosition);
                        isFirstUpdate = false;
                    }

                    prevLat = lat;
                    prevLng = lng;

                    // Draw path
                    routeCoordinates.push({ lat, lng });
                    if (trackingPath) {
                        trackingPath.setPath(routeCoordinates);
                    } else {
                        trackingPath = new google.maps.Polyline({
                            path: routeCoordinates,
                            geodesic: true,
                            strokeColor: "#FF0000",
                            strokeOpacity: 1.0,
                            strokeWeight: 4,
                            map: map,
                        });
                    }

                    // Reverse Geocode Address
                    geocoder.geocode({ location: { lat, lng } }, function (results, status) {
                        if (status === "OK" && results[0]) {
                            const address = results[0].formatted_address;
                            const locationDiv = document.getElementById("currentLocationText");
                            if (locationDiv) {
                                locationDiv.textContent = "📍 You are currently at: " + address;
                            }
                            console.log("📍 Live Address:", address);
                        } else {
                            console.warn("🧭 Geocoder failed: " + status);
                        }
                    });
                }
            },
            (error) => {
                console.error("❌ Error getting live location:", error);
                let msg = "";
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        msg = "📛 Permission denied.";
                        break;
                    case error.POSITION_UNAVAILABLE:
                        msg = "📡 Location unavailable.";
                        break;
                    case error.TIMEOUT:
                        msg = "⏱️ Location request timed out.";
                        break;
                    default:
                        msg = "⚠️ Unknown error.";
                }
                alert(msg);
                if (watchID !== null) {
                    navigator.geolocation.clearWatch(watchID);
                    watchID = null;
                }
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 15000,
            }
        );

        console.log("✅ Live Tracking Started.");
    } else {
        alert("⚠️ Geolocation not supported.");
    }
}


// Ensure the DOM is fully loaded before accessing elements
window.onload = function () {
    initMap();
    attachEventListeners();
};

// Function to attach event listeners
function attachEventListeners() {
    const locationCheckbox = document.getElementById("useCurrentLocation");
    if (!locationCheckbox) {
        console.warn("⚠️ Warning: Element with ID 'useCurrentLocation' not found. Check HTML structure.");
        return;
    }
    locationCheckbox.addEventListener("change", function () {
        if (this.checked) {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        let lat = position.coords.latitude;
                        let lng = position.coords.longitude;
                        let sourceField = document.getElementById("source");
                        if (sourceField) { 
                            sourceField.value = `${lat}, ${lng}`;
                            console.log("✅ Source location set to:", sourceField.value);
                        } else {
                            console.warn("⚠️ Warning: Source input field not found.");
                        }
                    },
                    (error) => {
                        console.error("❌ Error getting location:", error);
                        alert("⚠️ Failed to get location. Please enable location services and try again.");
                    }
                );
            } else {
                alert("⚠️ Geolocation is not supported by this browser.");
            }
        } else {
            let sourceField = document.getElementById("source");
            if (sourceField) {
                sourceField.value = ""; 
            }
        }
    });
}

function getMapBounds() {
    if (!map) {
        console.error("Map not initialized.");
        return;
    }
    setTimeout(() => {
        const bounds = map.getBounds();
        if (!bounds) {
            console.error("Map bounds not available.");
            return;
        }
        const ne = bounds.getNorthEast(); 
        const sw = bounds.getSouthWest();
        console.log(`Bounds: Min [${sw.lat()}, ${sw.lng()}], Max [${ne.lat()}, ${ne.lng()}]`);
        detectTrafficIncidents(sw.lat(), sw.lng(), ne.lat(), ne.lng());
        const minLat = sw.lat();
        const minLon = sw.lng();
        const maxLat = ne.lat();
        const maxLon = ne.lng();
        console.log(`Map Bounds: Min [${minLat}, ${minLon}], Max [${maxLat}, ${maxLon}]`);
        detectTrafficIncidents(minLat, minLon, maxLat, maxLon);
    }, 1000);
}
const locationCheckbox = document.getElementById("useCurrentLocation");
if (locationCheckbox) { 
    locationCheckbox.addEventListener("change", function () {
        if (this.checked) {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        let lat = position.coords.latitude;
                        let lng = position.coords.longitude;
                        let sourceField = document.getElementById("source");
                        if (sourceField) { 
                            sourceField.value = `${lat}, ${lng}`;
                            console.log("Source location set to:", sourceField.value);
                        }
                    },
                    (error) => {
                        console.error("Error getting location:", error);
                        alert("Failed to get location. Please enable location services and try again.");
                    }
                );
            } else {
                alert("Geolocation is not supported by this browser.");
            }
        } else {
            let sourceField = document.getElementById("source");
            if (sourceField) {
                sourceField.value = ""; 
            }
        }
    });
} else {
    console.warn("Element with ID 'useCurrentLocation' not found.");
}


function toggleLiveTracking() {
    if (watchID) {
        console.warn("Live tracking is already active.");
        return;
    }

    const destinationInput = document.getElementById("destination").value;
    if (!destinationInput) {
        alert("Please enter a destination.");
        return;
    }

    setTrackingMessage("⏳ Locating and calculating route...");

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function (position) {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const origin = new google.maps.LatLng(lat, lng);

                const geocoder = new google.maps.Geocoder();
                geocoder.geocode({ address: destinationInput }, function (results, status) {
                    if (status === "OK") {
                        const destination = results[0].geometry.location;

                        console.log("🧭 Origin:", origin.toString());
                        console.log("🎯 Destination:", destination.toString());

                        const distance = google.maps.geometry.spherical.computeDistanceBetween(origin, destination) / 1000;
                        console.log(`📏 Distance: ${distance.toFixed(2)} km`);

                        const estimatedTime = (distance * 1000) / 6.94;
                        let adjustedTimeout = Math.min(Math.max(estimatedTime * 1000, 15000), 600000);
                        console.log(`⏳ Adjusted Timeout: ${adjustedTimeout / 1000} seconds`);

                        setTrackingMessage("✅ Live tracking started!");

                        const bounds = new google.maps.LatLngBounds();
                        bounds.extend(origin);
                        bounds.extend(destination);
                        map.fitBounds(bounds);

                        google.maps.event.addListenerOnce(map, 'bounds_changed', function () {
                            map.setZoom(20); // Deep zoom on first view
                        });

                        sourceMarker = new google.maps.Marker({
                            position: origin,
                            map: map,
                            title: "Your Location",
                            icon: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png"
                        });

                        destinationMarker = new google.maps.Marker({
                            position: destination,
                            map: map,
                            title: "Destination",
                            icon: "http://maps.google.com/mapfiles/ms/icons/green-dot.png"
                        });

                        const directionsService = new google.maps.DirectionsService();
                        const directionsRenderer = new google.maps.DirectionsRenderer({ suppressMarkers: true });
                        directionsRenderer.setMap(map);

                        const request = {
                            origin: origin,
                            destination: destination,
                            travelMode: google.maps.TravelMode.DRIVING
                        };

                        directionsService.route(request, function (result, status) {
                            if (status === "OK") {
                                directionsRenderer.setDirections(result);

                                // ✅ Start live tracking
                                watchID = navigator.geolocation.watchPosition(
                                    function (pos) {
                                        const liveLat = pos.coords.latitude;
                                        const liveLng = pos.coords.longitude;
                                        const speed = pos.coords.speed || 0;
                                        const heading = pos.coords.heading || 0;

                                        const livePosition = new google.maps.LatLng(liveLat, liveLng);
                                        // real cordinates 
                                        console.log(`📍 Moving to: Latitude: ${liveLat}, Longitude: ${liveLng}`);
                                        detectTurningPoint(liveLat, liveLng);

                                        // 🚨 Detect Danger Zones
                                        isDangerAhead(lat, lng).then((danger) => {
                                            updateDangerZoneUI(danger);
                                        });
                                        
                                        // Dynamic zoom based on speed (between 17–20)
                                        const zoomLevel = speed > 10 ? 17 : speed > 3 ? 18 : 20;
                                        if (map.getZoom() !== zoomLevel) {
                                            map.setZoom(zoomLevel);
                                        }

                                        if (!bikeMarker) {
                                            bikeMarker = new google.maps.Marker({
                                                position: livePosition,
                                                map: map,
                                                icon: {
                                                    url: "https://maps.google.com/mapfiles/kml/shapes/cycling.png",
                                                    scaledSize: new google.maps.Size(40, 40),
                                                    rotation: heading
                                                },
                                                title: "Your Bike"
                                            });
                                        } else {
                                            bikeMarker.setPosition(livePosition);
                                            bikeMarker.setIcon({
                                                url: "https://maps.google.com/mapfiles/kml/shapes/cycling.png",
                                                scaledSize: new google.maps.Size(40, 40),
                                                rotation: heading
                                            });
                                        }
                                        
                                        // Smooth pan animation
                                        map.panTo(livePosition);
                                    },
                                    function (error) {
                                        console.error("Geolocation error:", error);
                                    },
                                    {
                                        enableHighAccuracy: true,
                                        maximumAge: 0,
                                        timeout: 1000000
                                    }
                                );
                            } else {
                                console.error("❌ Route failed:", status);
                                setTrackingMessage("⚠️ Route calculation failed.");
                            }
                        });
                    } else {
                        console.error("❌ Geocode failed: " + status);
                        alert("⚠️ Unable to find destination. Please enter a valid location.");
                        setTrackingMessage("");
                    }
                });
            },
            function (error) {
                console.error("❌ Error getting initial location:", error);
                alert("⚠️ Failed to get your location. Please check GPS settings.");
                setTrackingMessage("");
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    } else {
        alert("⚠️ Geolocation is not supported by this browser.");
        setTrackingMessage("");
    }
}

// Helper function to show status messages
function setTrackingMessage(msg) {
    const statusEl = document.getElementById("tracking-status");
    if (statusEl) {
        statusEl.textContent = msg;
    }
}
function startLiveTracking(timeout, origin, destination) {
    let lastUpdatedTime = 0;

    // Initialize animated marker if not already
    if (!animatedMarker) {
        animatedMarker = new google.maps.Marker({
            position: origin,
            map: map,
            icon: {
                url: "https://maps.gstatic.com/mapfiles/ms2/micons/red-dot.png",
                scaledSize: new google.maps.Size(40, 40)
            }
        });
    }

    // Initialize polyline path if needed
    if (!polylinePath) {
        polylinePath = new google.maps.Polyline({
            path: [],
            geodesic: true,
            strokeColor: "#00ffff",
            strokeOpacity: 0.8,
            strokeWeight: 4,
            map: map
        });
    }

    watchID = navigator.geolocation.watchPosition(
        function successCallback(position) {
            const currentTime = new Date().getTime();

            if (currentTime - lastUpdatedTime > 5000) { // Update every 5 sec
                lastUpdatedTime = currentTime;

                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const currentLatLng = new google.maps.LatLng(lat, lng);

                console.log("📍 Updated Location:", lat, lng);
                updateBikePosition(lat, lng, position.coords.heading); // custom
                fetchWeather(lat, lng); // optional weather update

                // Move animated marker
                animatedMarker.setPosition(currentLatLng);
                polylinePath.getPath().push(currentLatLng);
                map.panTo(currentLatLng);

                // ✅ Danger zone detection (real-time)
                const placeService = new google.maps.places.PlacesService(map);
                const dangerRequest = {
                    location: currentLatLng,
                    radius: 100, // meters
                    keyword: "danger" // Can be changed to accident, hazard, etc.
                };

                placeService.nearbySearch(dangerRequest, function (results, status) {
                    if (status === google.maps.places.PlacesServiceStatus.OK && results.length > 0) {
                        console.log("⚠️ Danger zone detected nearby!");
                        updateDangerZoneUI(true);
                    } else {
                        updateDangerZoneUI(false);
                    }
                });

                // Recalculate and update directions
                const request = {
                    origin: currentLatLng,
                    destination: destination,
                    travelMode: google.maps.TravelMode.DRIVING
                };

                directionsService.route(request, function (result, status) {
                    if (status === "OK") {
                        directionsRenderer.setDirections(result);
                    } else {
                        console.error("❌ Directions request failed: " + status);
                        setTrackingMessage("⚠️ Directions update failed.");
                    }
                });
            }
        },
        function errorCallback(error) {
            console.error("❌ Error getting live location:", error);
            let msg = "";

            switch (error.code) {
                case error.PERMISSION_DENIED:
                    msg = "📛 Permission denied. Please allow location access.";
                    break;
                case error.POSITION_UNAVAILABLE:
                    msg = "📡 Location unavailable. Try again later.";
                    break;
                case error.TIMEOUT:
                    msg = `⏱️ Location request timed out after ${timeout / 1000} seconds.`;
                    break;
                default:
                    msg = "⚠️ Unknown error occurred.";
            }

            alert(msg);
            setTrackingMessage("❌ Tracking stopped due to location error.");

            if (watchID !== null) {
                navigator.geolocation.clearWatch(watchID);
                watchID = null;
            }
        },
        {
            enableHighAccuracy: true,
            timeout: timeout,
            maximumAge: 0
        }
    );

    console.log("✅ Live Tracking Started.");
    setTrackingMessage("🛰️ Tracking in progress...");
    startWeatherUpdates(); // optional weather updates
}


function setTrackingMessage(msg) {
    const statusEl = document.getElementById("tracking-status");
    if (statusEl) {
        statusEl.textContent = msg;
    }
}
let autoCenter = true; 
function updateBikePosition(lat, lng, heading = 0) {
    const position = new google.maps.LatLng(lat, lng);

    if (!bikeMarker) {
        bikeMarker = new google.maps.Marker({
            position: position,
            map: map,
            icon: {
                url: "https://maps.google.com/mapfiles/kml/shapes/cycling.png",
                scaledSize: new google.maps.Size(40, 40),
                rotation: heading
            },
            title: "Your Bike"
        });
    } else {
        bikeMarker.setPosition(position);
        bikeMarker.setIcon({
            url: "https://maps.google.com/mapfiles/kml/shapes/cycling.png",
            scaledSize: new google.maps.Size(40, 40),
            rotation: heading
        });
    }

    if (autoCenter) {
        map.panTo(position);
    }
}

function getBearing(lat1, lng1, lat2, lng2) {
    const toRad = deg => deg * Math.PI / 180;
    const toDeg = rad => rad * 180 / Math.PI;

    const dLng = toRad(lng2 - lng1);
    const y = Math.sin(dLng) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
              Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);

    let bearing = toDeg(Math.atan2(y, x));
    return (bearing + 360) % 360;
}

function angleDifference(b1, b2) {
    let diff = Math.abs(b1 - b2);
    return diff > 180 ? 360 - diff : diff;
}


function stopLiveTracking() {
    if (watchID) {
        navigator.geolocation.clearWatch(watchID);
        watchID = null;
        console.log("🛑 Live tracking stopped.");
        setTrackingMessage("🛑 Tracking stopped.");

        // Clear polyline path
        if (polylinePath) {
            polylinePath.setMap(null);
            polylinePath = null;
        }

        // Clear animated marker
        if (animatedMarker) {
            animatedMarker.setMap(null);
            animatedMarker = null;
        }

        // Optionally stop weather updates if you have a loop
        if (weatherUpdateInterval) {
            clearInterval(weatherUpdateInterval);
            weatherUpdateInterval = null;
        }

        // Get final current location
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                function (position) {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    console.log(`📍 Current Location: (${lat}, ${lng})`);

                    // Update or create user marker
                    if (!userMarker) {
                        userMarker = new google.maps.Marker({
                            position: { lat, lng },
                            map: map,
                            title: "You are here",
                            icon: {
                                url: "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
                                scaledSize: new google.maps.Size(40, 40),
                            },
                        });
                    } else {
                        userMarker.setPosition({ lat, lng });
                    }

                    map.setCenter({ lat, lng });

                    // Reverse geocode
                    const geocoder = new google.maps.Geocoder();
                    const latlng = { lat, lng };

                    geocoder.geocode({ location: latlng }, function (results, status) {
                        if (status === "OK") {
                            if (results[0]) {
                                const address = results[0].formatted_address;
                                console.log("📌 Address:", address);
                                alert("📍 You are currently at:\n" + address);

                                const locationDiv = document.getElementById("currentLocationText");
                                if (locationDiv) {
                                    locationDiv.textContent = "📍 Current Address: " + address;
                                }
                            } else {
                                alert("No address found.");
                            }
                        } else {
                            console.error("Geocoder failed: " + status);
                            alert("Failed to get address.");
                        }
                    });
                },
                function (error) {
                    console.error("❌ Error fetching location:", error);
                    alert("Failed to fetch current location.");
                },
                {
                    timeout: 5000,
                    enableHighAccuracy: true,
                    maximumAge: 0
                }
            );
        } else {
            alert("Geolocation is not supported.");
        }
    } else {
        console.log("⚠️ No active tracking to stop.");
        setTrackingMessage("⚠️ No active tracking to stop.");
    }
}


async function getRoute() {
    console.log("getRoute() function triggered!");
    clearPreviousData();

    let source = document.getElementById("source").value;
    let destination = document.getElementById("destination").value;
    let useCurrentLocation = document.getElementById("useCurrentLocation").checked;

    if (!destination) {
        alert("Please enter a destination!");
        return;
    }

    let startLat, startLng;
    if (useCurrentLocation || source === "") {
        console.log("Using user's current location...");
        try {
            let position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true });
            });
            startLat = position.coords.latitude;
            startLng = position.coords.longitude;
            console.log(`Current Location: (${startLat}, ${startLng})`);
        } catch (error) {
            console.error("GPS Error:", error);
            alert("Failed to get your current location! Please enter a source manually.");
            return;
        }
    } else {
        console.log(`User-entered source: ${source}`);
        try {
            let sourceData = await fetch(`https://graphhopper.com/api/1/geocode?q=${encodeURIComponent(source)}&key=${GRAPH_HOPPER_API_KEY}`)
                .then(res => res.json());

            if (sourceData.hits.length === 0) {
                alert("Invalid source location!");
                return;
            }
            startLat = sourceData.hits[0].point.lat;
            startLng = sourceData.hits[0].point.lng;
            console.log(`Converted Source: ${source} (${startLat}, ${startLng})`);
        } catch (error) {
            console.error("Error fetching source location:", error);
            alert("Failed to fetch source location!");
            return;
        }
    }

    try {
        let destData = await fetch(`https://graphhopper.com/api/1/geocode?q=${encodeURIComponent(destination)}&key=${GRAPH_HOPPER_API_KEY}`)
            .then(res => res.json());

        if (destData.hits.length === 0) {
            alert("Invalid destination location!");
            return;
        }

        let destLat = destData.hits[0].point.lat;
        let destLng = destData.hits[0].point.lng;
        console.log(`📍 Destination: ${destination} (${destLat}, ${destLng})`);

        setMarkers(startLat, startLng, destLat, destLng);

        const directionsRequest = {
            origin: { lat: startLat, lng: startLng },
            destination: { lat: destLat, lng: destLng },
            travelMode: google.maps.TravelMode.DRIVING
        };

        directionsService.route(directionsRequest, async function (result, status) {
            if (status === google.maps.DirectionsStatus.OK) {
                directionsRenderer.setDirections(result);
                console.log("Route successfully drawn!");
                const weatherBox = document.getElementById('weather-output');
                if (weatherBox) {
                    weatherBox.style.display = 'block';
                }
                document.getElementById('traffic-info').style.display = 'block';
                let route = result.routes[0].legs[0];
                document.getElementById("route-summary").innerText =`Distance between ${source || "Your Current Location"} and ${destination} | ${route.distance.text} | Time Taken: ${route.duration.text}`;

                fetchWeather(startLat, startLng);
                detectTrafficIncidents(startLat, startLng);

                // Fetch additional traffic details from TomTom API
                const trafficData = await fetchTrafficData(startLat, startLng);
                if (trafficData) {
                    //document.getElementById("current-speed").innerText = `Current Speed: ${trafficData.currentSpeed} km/h`;
                    //document.getElementById("free-flow-speed").innerText = `Free Flow Speed: ${trafficData.freeFlowSpeed} km/h`;
                    //document.getElementById("travel-time").innerText = `Travel Time: ${trafficData.travelTime} mins`;
                    document.getElementById("road-closure").innerText = `Road Closure: ${trafficData.roadClosure ? "Yes" : "No"}`;
                }
            } else {
                console.error("Error fetching route:", status);
                alert("Could not find a valid route!");
            }
        });
    } catch (error) {
        console.error("Error in getRoute():", error);
        alert("Failed to get route details. Check API keys and network.");
    }
}
async function fetchTrafficData(lat, lon) {
    const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${lat},${lon}&key=${TOMTOM_API_KEY}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Traffic API request failed: ${response.statusText}`);
        const data = await response.json();

        if (data.flowSegmentData) {
            return {
                currentSpeed: data.flowSegmentData.currentSpeed,
                freeFlowSpeed: data.flowSegmentData.freeFlowSpeed,
                travelTime: Math.round(data.flowSegmentData.currentTravelTime / 60),
                roadClosure: data.flowSegmentData.roadClosure || "No Data"
            };
        }
    } catch (error) {
        console.error("Traffic API Error:", error);
    }
    return null;
}

function setMarkers(startLat, startLng, destLat, destLng) {
    if (startMarker) startMarker.setMap(null);
    if (endMarker) endMarker.setMap(null);

    startMarker = new google.maps.Marker({
        position: { lat: startLat, lng: startLng },
        map: map,
        title: "Start Location",
        icon: "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
    });
    endMarker = new google.maps.Marker({
        position: { lat: destLat, lng: destLng },
        map: map,
        title: "Destination",
        icon: "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
    });
    map.setCenter({ lat: (startLat + destLat) / 2, lng: (startLng + destLng) / 2 });
}
function drawRoute(startLat, startLng, destLat, destLng) {
    const request = {
        origin: { lat: startLat, lng: startLng },
        destination: { lat: destLat, lng: destLng },
        travelMode: google.maps.TravelMode.DRIVING,
    };
    directionsService.route(request, function (result, status) {
        if (status == google.maps.DirectionsStatus.OK) {
            directionsRenderer.setDirections(result);
        } else {
            console.error("Error fetching route:", status);
        }
    });
}
function startWeatherUpdates() {
    if (navigator.geolocation) {
        weatherUpdateInterval = setInterval(() => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    let lat = position.coords.latitude;
                    let lng = position.coords.longitude;
                    fetchWeather(lat, lng);
                },
                (error) => console.error("Error getting location:", error),
                {
                    timeout: 15000,
                    enableHighAccuracy: true,
                    maximumAge: 0
                    
                }
            );
        }, 60000); 
    } else {
        alert("Geolocation is not supported by this browser.");
    }
}
function stopWeatherUpdates() {
    clearInterval(weatherUpdateInterval);
}
function fetchWeather(lat, lng) {
    const url = `https://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=${lat},${lng}&alerts=yes`;
    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.error) {
                console.error("Weather API Error:", data.error.message);
                return;
            }
            document.getElementById("weather-output").innerHTML = `
                <h4>Current Weather</h4>
                <p><b>Location:</b> ${data.location.name}</p>
                <p><b>Temperature:</b> ${data.current.temp_c}°C</p>
                <p><b>Condition:</b> ${data.current.condition.text}</p>
            `;
            checkWeatherAlerts(data);
        })
        .catch(error => console.error("Weather Fetch Error:", error));
}

function detectTurningPoint(currLat, currLng) {
    if (lastLat !== null && lastLng !== null) {
        const newBearing = getBearing(lastLat, lastLng, currLat, currLng);

        if (lastBearing !== null) {
            const angleChange = angleDifference(lastBearing, newBearing);

            if (angleChange >= 30) { // Turning threshold
                console.log("🔁 Turning Detected:", angleChange.toFixed(1), "degrees");

                // You can notify about turn alone here
                showNotification("↩️ Turn Detected", `You turned ${angleChange.toFixed(1)}°`);

                // Check if a danger zone lies ahead after the turn
                if (isDangerAhead(currLat, currLng)) {
                    showNotification("⚠️ Dangerous Turn", "You're turning toward a danger zone!");
                }
            }
        }

        lastBearing = newBearing;
    }

    lastLat = currLat;
    lastLng = currLng;
}

function showNotification(title, message) {
    const popup = document.getElementById('popup');
    const beep = document.getElementById('beep-sound');
    // Fix: Use backticks for template literal
    popup.innerHTML = `<strong>${title}</strong><br>${message}`;
    popup.classList.add('show');
    // Remove after 5s
    setTimeout(() => {
        popup.classList.remove('show');
    }, 5000);
    // Beep sound (with autoplay handling)
    beep.play().catch(() => {
        document.addEventListener("click", () => beep.play(), { once: true });
    });
    // Optional: vibration feedback
    if (navigator.vibrate) {
        navigator.vibrate([300, 100, 300]);
    }
    // Browser Notification
    if (!('Notification' in window)) {
        //alert(`${title}: ${message}`);
    } else if (Notification.permission === 'granted') {
        new Notification(title, { body: message });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                new Notification(title, { body: message });
            } else {
                //alert(`${title}: ${message}`);
            }
        });
    } else {
        //alert(`${title}: ${message}`);
    }
}
function queueNotification(title, message, duration = 5000) {
    notificationQueue.push({ title, message, duration });
    processNotificationQueue();
}
function processNotificationQueue() {
    if (isNotificationVisible || notificationQueue.length === 0) return;
    const { title, message, duration } = notificationQueue.shift();
    isNotificationVisible = true;
    // 👇 This is the "wrapped" part — we call your original notification here
    showNotification(title, message);
    // ⏳ Wait, then allow next one to show
    setTimeout(() => {
        isNotificationVisible = false;
        setTimeout(processNotificationQueue, 300); // small gap
    }, duration);
}

function isDangerAhead(lat, lng) {
    return new Promise((resolve, reject) => {
        const request = {
            location: new google.maps.LatLng(lat, lng),
            radius: 100,
            keyword: "danger" // Try: 'accident', 'hazard', etc.
        };

        const service = new google.maps.places.PlacesService(map); // `map` must be your current Google Map instance

        service.nearbySearch(request, function (results, status) {
            if (status === google.maps.places.PlacesServiceStatus.OK && results.length > 0) {
                resolve(true); // 🚨 Danger zone detected
            } else {
                resolve(false); // ✅ No danger nearby
            }
        });
    });
}

function checkWeatherAlerts(weatherData) {
    const severeConditions = /(storm|heavy rain|thunderstorm|tornado|hurricane|blizzard)/i;
    let conditionText = weatherData.current.condition.text.toLowerCase();
    let alertBox = document.getElementById("weather-alerts");  
    if (!alertBox) return;
    if (severeConditions.test(conditionText)) {
        // alertBox.innerHTML = `<p>Severe Weather Alert: ${weatherData.current.condition.text}</p>`;
        //alertBox.style.color = "red";
        queueNotification("Weather Alert!", weatherData.current.condition.text);
        
    } else {
        //alertBox.innerHTML = `<p>No severe weather alerts.</p>`;
        // alertBox.style.color = "green";
        //queueNotification("Weather Alert!", 'No severe weather alerts.');
    }
}
const originalToggleLiveTracking = toggleLiveTracking;
toggleLiveTracking = function () {
    originalToggleLiveTracking();
    startWeatherUpdates();
};
const originalStopLiveTracking = stopLiveTracking;
stopLiveTracking = function () {
    originalStopLiveTracking();
    stopWeatherUpdates();
};
async function detectTrafficIncidents(userLat, userLon) {
    console.log(`Fetching TomTom Traffic Data for: ${userLat}, ${userLon}`);
    const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${userLat},${userLon}&key=${TOMTOM_API_KEY}`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Traffic API request failed: ${response.statusText}`);
        const data = await response.json();
        console.log("Traffic Data:", data);
        if (data.flowSegmentData) {
            let congestionLevel = data.flowSegmentData.currentSpeed < data.flowSegmentData.freeFlowSpeed * 0.5 ? "Heavy Congestion" : "Normal Traffic";   
            updateDangerZoneUI(congestionLevel === "Heavy Congestion");
        } else {
            console.warn("No traffic data available.");
            updateDangerZoneUI(false);
        }
    } catch (error) {
        console.error("Traffic API Error:", error);
    }
}
function getUserLocationAndDetectTraffic() {
    console.log("Getting user location and detecting traffic...");
    let dangerDetected = Math.random() < 0.5; 
    updateDangerZoneUI(dangerDetected);
  }
window.onload = getUserLocationAndDetectTraffic;
 
function updateDangerZoneUI(dangerDetected) {
    let dangerZoneDiv = document.getElementById("danger-zones");
    if (!dangerZoneDiv) {
        console.error("Element #danger-zones not found.");
        return;
    }

    if (dangerDetected) {
        dangerZoneDiv.innerHTML = "<strong>🚨 Danger Zone Detected!</strong>";
        dangerZoneDiv.style.color = "red";
        dangerZoneDiv.style.fontWeight = "bold";
        showNotification("⚠️ Danger Zone", "You are in or approaching a danger zone!");
    } else {
        dangerZoneDiv.innerHTML = "<strong>No Danger Zones.</strong>";
        dangerZoneDiv.style.color = "green";
        dangerZoneDiv.style.fontWeight = "normal";
        console.log("✅ No danger zones nearby.");
    }
}

//Naturally Occurring Weather Condition Checking
function detectWeatherHazards(lat, lng) {
    const weatherURL = `https://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=${lat},${lng}`;
    fetch(weatherURL)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Weather API error: ${response.status}`);
            }
            return response.json();
        })
        .then(weatherData => {
            const conditionText = weatherData.current.condition.text.toLowerCase();
            const severeConditions = ["storm","heavy rain","thunderstorm","tornado","hurricane","fog","snow","blizzard"];
            const matchedCondition = severeConditions.find(c => conditionText.includes(c));
            if (matchedCondition) {
                queueNotification("Weather Alert!", `Severe weather detected: ${weatherData.current.condition.text}`);
            } else {  
                console.log("No severe weather warnings at this time.");
                queueNotification("Weather Update", "No severe weather warnings at this time.");
            }
        })
        .catch(error => {
            console.error("Weather API Fetch Error:", error.message);
        });
}
function clearPreviousData() {
    document.getElementById("weather-output").innerHTML = "";
    document.getElementById("weather-alerts").innerHTML = "";
    document.getElementById("danger-zones").innerHTML = "";
}
async function refreshWeather() {
    const sourceInput = document.getElementById("source");
    const useCurrentLocation = document.getElementById("useCurrentLocation").checked;
    if (useCurrentLocation) {
        const location = await getAccurateLocation();
        if (location) {
            fetchWeather(location.lat, location.lng);
            queueNotification("🌤️ Weather Refreshed", "Weather info updated for your current location.");
        } else {
            console.log("Unable to fetch your current location");
        }
    } else {
        const source = sourceInput.value.trim();
        if (!source) {
            showNotification("⚠️ Empty Location", "Please enter a location before refreshing.");
            return;
        }
        fetch(`https://graphhopper.com/api/1/geocode?q=${encodeURIComponent(source)}&key=${GRAPH_HOPPER_API_KEY}`)
            .then(res => res.json())
            .then(sourceData => {
                if (sourceData.hits.length > 0) {
                    const startLat = sourceData.hits[0].point.lat;
                    const startLng = sourceData.hits[0].point.lng;
                    fetchWeather(startLat, startLng);
                    queueNotification("🌤️ Weather Refreshed", `Weather info updated for "${source}"`);
                } else {
                    alert(" Location Not Found,Please enter a valid location.");
                }
            })
            .catch(error => {
                console.error("Error fetching weather:", error);
                alert(" Error", "Failed to refresh weather data.");
            });
    }
}

window.initMap = initMap;
window.toggleLiveTracking = toggleLiveTracking;
window.stopLiveTracking = stopLiveTracking;
window.getRoute = getRoute;
window.refreshWeather = refreshWeather;
window.updateBikePosition = updateBikePosition;
window.detectTrafficIncidents = detectTrafficIncidents;
window.detectWeatherHazards = detectWeatherHazards;
window.fetchWeather = fetchWeather;
window.clearPreviousData = clearPreviousData;
window.setMarkers = setMarkers;
window.drawRoute = drawRoute;
window.onload = function() {
    localStorage.removeItem("userLocation");
    localStorage.removeItem("boundingBox");
    let sourceInput = document.getElementById("source");
    let destinationInput = document.getElementById("destination");
    let weatherInfo = document.getElementById("weather-info");

    if (sourceInput) sourceInput.value = "";
    if (destinationInput) destinationInput.value = "";
    if (weatherInfo) weatherInfo.innerHTML = "";
    console.log("Cleared previous user location and bounding box on reload.");
};
