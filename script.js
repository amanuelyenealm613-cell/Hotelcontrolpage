const firebaseConfig = { 
    apiKey: "AIzaSyCm6vPlapGOIn95I3NER6t1g3FHR1xKI3g", 
    authDomain: "adane-hotel.firebaseapp.com", 
    databaseURL: "https://adane-hotel-default-rtdb.firebaseio.com", 
    projectId: "adane-hotel" 
};

if (!firebase.apps.length) { 
    firebase.initializeApp(firebaseConfig); 
}
const database = firebase.database();

let loggedInHotelKey = "";
let html5QrCode = null;
let isScannerRunning = false;

function verifyHotelId(e) {
    e.preventDefault();
    let enteredId = document.getElementById('inputHotelId').value.trim();
    database.ref('hotels').once('value', (snapshot) => {
        let foundKey = "";
        snapshot.forEach((child) => {
            let h = child.val();
            if (child.key === enteredId || h.hotelId === enteredId) foundKey = child.key;
        });
        if (foundKey) {
            loggedInHotelKey = foundKey;
            document.getElementById('hotelAuthScreen').classList.add('hidden');
            document.getElementById('hotelDashboard').classList.remove('hidden');
            document.getElementById('headerHotelName').innerText = `Hotel Management (ID: ${loggedInHotelKey})`;
            loadHotelDashboardData();
        } else { 
            alert("❌ Invalid Hotel ID!"); 
        }
    });
}

function logoutHotel() {
    stopQrScanner();
    document.getElementById('hotelDashboard').classList.add('hidden');
    document.getElementById('hotelAuthScreen').classList.remove('hidden');
}

function loadHotelDashboardData() {
    database.ref('hotels/' + loggedInHotelKey).once('value', (snapshot) => {
        let hData = snapshot.val();
        if (hData) {
            let mapUrl = hData.mapUrl || hData.location || '';
            document.getElementById('hotelMapUrlInput').value = mapUrl;
            if(mapUrl) {
                let btnMap = document.getElementById('viewMapBtn');
                btnMap.href = mapUrl;
                document.getElementById('mapPreviewContainer').classList.remove('hidden');
            }
        }
    });

    database.ref('hotels/' + loggedInHotelKey + '/services').on('value', (snapshot) => {
        let tableBody = document.getElementById('servicesTableBody');
        tableBody.innerHTML = '';
        snapshot.forEach((child) => {
            let s = child.val();
            tableBody.innerHTML += `
                <tr>
                    <td><img src="${s.img || ''}" style="width:40px; height:40px; border-radius:4px; object-fit:cover;" onerror="this.src='https://images.unsplash.com/photo-1540541338287-41700207dee6?q=80&w=100'"></td>
                    <td>${(s.category || '').toUpperCase()}</td>
                    <td>${s.title}</td>
                    <td>${s.price} ETB</td>
                    <td><b style="color:var(--primary-gold);">${s.quantity}</b></td>
                    <td>
                        <button class="btn-sm btn-green" onclick="adjustStock('${child.key}', 1)">+</button>
                        <button class="btn-sm btn-orange" onclick="adjustStock('${child.key}', -1)">-</button>
                        <button class="btn-sm btn-red" onclick="deleteService('${child.key}')">Delete</button>
                    </td>
                </tr>
            `;
        });
    });

    database.ref('orders').on('value', (snapshot) => {
        let ordersTable = document.getElementById('hotelOrdersTableBody');
        ordersTable.innerHTML = '';
        let count = 0;
        let revenue = 0;

        snapshot.forEach((child) => {
            let o = child.val();
            if (o.hotelId === loggedInHotelKey) {
                count++;
                if(o.used || (o.status && o.status.includes('Verified'))) {
                    revenue += Number(o.price || 0);
                }
                ordersTable.innerHTML += `
                    <tr>
                        <td><b>${o.id}</b><br><small style="color:var(--primary-gold);">${o.qrCode || ''}</small></td>
                        <td>${o.service}</td>
                        <td>${o.customer}</td>
                        <td>${o.price} ETB</td>
                        <td>
                            <button class="btn-sm btn-blue" onclick="viewImg('${o.faydaImg}', 'Fayda ID Photo')">ID</button>
                            <button class="btn-sm btn-green" onclick="viewImg('${o.receiptImg}', 'Payment Receipt Photo')">Receipt</button>
                        </td>
                        <td style="color:${o.used ? 'var(--danger)' : (o.status && o.status.includes('Verified') ? 'var(--success)' : 'var(--primary-gold)')};">
                            ${o.used ? '🛑 Service Used' : o.status}
                        </td>
                    </tr>
                `;
            }
        });
        document.getElementById('hotelTotalOrders').innerText = count;
        document.getElementById('hotelTotalRevenue').innerText = revenue + " ETB";
    });
}

function getHotelGpsCoordinates() {
    const statusText = document.getElementById('mapStatus');
    const btnText = document.getElementById('gpsBtnText');

    if (navigator.geolocation) {
        btnText.innerText = "🔄 Getting Location...";
        statusText.style.color = "var(--primary-gold)";
        statusText.innerText = "Please allow browser location permission...";

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                const mapLink = `https://www.google.com/maps?q=${lat},${lon}`;
                
                document.getElementById('hotelMapUrlInput').value = mapLink;
                btnText.innerText = "📍 Location Secured Successfully!";
                statusText.style.color = "var(--success)";
                statusText.innerText = "✅ GPS Location captured successfully.";
            },
            (error) => {
                btnText.innerText = "Get Current Location (GPS)";
                statusText.style.color = "var(--danger)";
                statusText.innerText = "⚠️ Location permission denied or unavailable.";
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    } else {
        statusText.style.color = "var(--danger)";
        statusText.innerText = "⚠️ Geolocation is not supported by this browser.";
    }
}

function saveHotelMapUrl(e) {
    e.preventDefault();
    let mapUrl = document.getElementById('hotelMapUrlInput').value.trim();
    if(!mapUrl) { alert("Please enter a valid Google Maps URL!"); return; }

    database.ref('hotels/' + loggedInHotelKey).update({
        mapUrl: mapUrl
    }).then(() => {
        alert("✅ Google Maps URL saved successfully!");
        let btnMap = document.getElementById('viewMapBtn');
        btnMap.href = mapUrl;
        document.getElementById('mapPreviewContainer').classList.remove('hidden');
    }).catch(err => {
        alert("Error: " + err.message);
    });
}

function addNewService(e) {
    e.preventDefault();
    let category = document.getElementById('serviceCategory').value;
    let title = document.getElementById('serviceTitle').value.trim();
    let price = document.getElementById('servicePrice').value.trim();
    let quantity = document.getElementById('serviceQty').value.trim();
    let desc = document.getElementById('serviceDesc').value.trim();
    let imgFile = document.getElementById('serviceImgFile').files[0];

    if(!imgFile) { alert("Please select a service image!"); return; }

    let reader = new FileReader();
    reader.readAsDataURL(imgFile);
    reader.onload = function(evt) {
        database.ref('hotels/' + loggedInHotelKey + '/services').push({
            category: category, title: title, price: price, quantity: quantity, desc: desc, img: evt.target.result
        }).then(() => {
            alert("✅ New service registered successfully!");
            document.getElementById('addServiceForm').reset();
        });
    };
}

function adjustStock(id, amount) {
    database.ref('hotels/' + loggedInHotelKey + '/services/' + id).once('value', (snapshot) => {
        let s = snapshot.val();
        let newQty = Number(s.quantity || 0) + amount;
        if(newQty >= 0) {
            database.ref('hotels/' + loggedInHotelKey + '/services/' + id).update({ quantity: newQty });
        }
    });
}

function deleteService(id) {
    if(confirm("Are you sure you want to delete this service?")) {
        database.ref('hotels/' + loggedInHotelKey + '/services/' + id).remove();
    }
}

function viewImg(url, title) {
    if(!url) { alert("No image attached!"); return; }
    document.getElementById('imgModalTitle').innerText = title;
    document.getElementById('modalBodyContent').innerHTML = `
        <img src="${url}" style="width:100%; max-height:350px; object-fit:contain; border-radius:6px; border:1px solid var(--border-color);">
    `;
    document.getElementById('imgModal').classList.add('active');
}

function closeImgModal() { 
    document.getElementById('imgModal').classList.remove('active'); 
}

async function stopQrScanner() {
    if (html5QrCode && isScannerRunning) {
        try {
            await html5QrCode.stop();
            html5QrCode.clear();
            isScannerRunning = false;
        } catch (err) {}
    }
}

async function startQrScanner() {
    await stopQrScanner();
    if(!html5QrCode) html5QrCode = new Html5Qrcode("reader");

    html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
            await stopQrScanner();
            verifyOrderByQr(decodedText);
        },
        () => {}
    ).then(() => { isScannerRunning = true; }).catch(err => alert("Failed to open camera: " + err));
}

function verifyOrderByQr(qrToken) {
    database.ref('orders').once('value', (snapshot) => {
        let foundOrderKey = "";
        let orderData = null;

        snapshot.forEach((child) => {
            let o = child.val();
            if(o.hotelId === loggedInHotelKey && (o.qrCode === qrToken || o.id === qrToken)) {
                foundOrderKey = child.key;
                orderData = o;
            }
        });

        if(foundOrderKey && orderData) {
            if(orderData.used === true) {
                alert(`🛑 Warning!\nThis QR code has already been scanned and used!`);
            } else {
                database.ref('orders/' + foundOrderKey).update({
                    status: "Verified & Service Provided",
                    used: true
                }).then(() => {
                    document.getElementById('imgModalTitle').innerText = `✅ Verified Order: ${orderData.id}`;
                    document.getElementById('modalBodyContent').innerHTML = `
                        <div style="text-align:left; font-size:14px; margin-bottom:10px; background:rgba(255,255,255,0.05); padding:10px; border-radius:6px;">
                            <b>Customer:</b> ${orderData.customer}<br>
                            <b>Service:</b> ${orderData.service}<br>
                            <b>Price:</b> ${orderData.price} ETB<br>
                            <b>Status:</b> Payment Verified & Service Provided
                        </div>
                        <p style="font-size:12px; color:var(--primary-gold); margin-bottom:5px; text-align:left;">Payment Receipt:</p>
                        <img src="${orderData.receiptImg}" style="width:100%; max-height:220px; object-fit:contain; border-radius:6px; border:1px solid var(--border-color);">
                    `;
                    document.getElementById('imgModal').classList.add('active');
                });
            }
        } else {
            alert("❌ No valid QR code found matching this hotel!");
        }
    });
}

function updatePoolStatus() {
    let status = document.getElementById('poolStatusSelect').value;
    document.getElementById('poolStatusText').innerText = status === 'Open' ? '🟢 Open' : '🔴 Closed';
    alert("✅ Swimming pool status updated!");
}
