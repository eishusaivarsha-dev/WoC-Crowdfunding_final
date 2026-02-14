// ---------------- FIREBASE ----------------
const firebaseConfig = {
  apiKey: "AIzaSyBhH0e2AKy27LQQINa6LVnMc4KxEssbCFU",
  authDomain: "crowdfund-91490.firebaseapp.com",
  projectId: "crowdfund-91490",
  storageBucket: "crowdfund-91490.appspot.com",
  messagingSenderId: "805018461050",
  appId: "1:805018461050:web:c7a760f4e2f1dadf09ecc3"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();


// ---------------- AUTH ----------------
let LoginMode = true;

function openAuthModal() {
  const el = document.getElementById("authBackdrop");
  if (el) el.style.display = "flex";
  switchToLogin();
}

function closeAuthModal() {
  const el = document.getElementById("authBackdrop");
  if (el) el.style.display = "none";
}

function switchToSignup() {
  LoginMode = false;
  document.getElementById("authTitle").innerText = "Sign Up";
  document.getElementById("authToggleText").innerHTML =
    `Already have an account?
     <span onclick="switchToLogin()" class="auth-link">Login</span>`;
}

function switchToLogin() {
  LoginMode = true;
  document.getElementById("authTitle").innerText = "Login";
  document.getElementById("authToggleText").innerHTML =
    `Don't have an account?
     <span onclick="switchToSignup()" class="auth-link">Sign up</span>`;
}

async function handleAuthSubmit() {
  const email = document.getElementById("authEmail").value;
  const password = document.getElementById("authPassword").value;

  try {
    if (LoginMode) {
      await auth.signInWithEmailAndPassword(email, password);
    } else {
      await auth.createUserWithEmailAndPassword(email, password);
    }

    closeAuthModal();
    alert("Logged in!");
  } catch (err) {
    alert(err.message);
  }
}

async function googleLogin() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
    closeAuthModal();
  } catch (err) {
    alert(err.message);
  }
}

auth.onAuthStateChanged(user => {
  const btn = document.querySelector(".login-btn");
  if (!btn) return;
  btn.innerText = user ? "Logout" : "Login";
  btn.onclick = user ? logout : openAuthModal;
});

function logout() {
  auth.signOut();
  alert("Logged out");
}


// ---------------- DONATION LEDGER ----------------
async function generateDonationHash(donor, amount, timestamp, previousHash) {
  const raw = donor + amount + timestamp + previousHash;
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const arr = Array.from(new Uint8Array(hashBuffer));
  return arr.map(b => b.toString(16).padStart(2, "0")).join("");
}

let donationLedger = [];
let currentCampaignId = null;

function loadLedger(id) {
  currentCampaignId = id;
  const saved = localStorage.getItem(`donationLedger_${id}`);
  donationLedger = saved ? JSON.parse(saved) : [];
  renderTransactionLog();
}

async function recordDonation(donor, amount) {
  const timestamp = Date.now();
  const prev = donationLedger.length
    ? donationLedger[donationLedger.length - 1].hash
    : "GENESIS";

  const hash = await generateDonationHash(donor, amount, timestamp, prev);

  donationLedger.push({ donor, amount, timestamp, previousHash: prev, hash });

  localStorage.setItem(
    `donationLedger_${currentCampaignId}`,
    JSON.stringify(donationLedger)
  );

  renderTransactionLog();
}

function renderTransactionLog() {
  const container = document.getElementById("transactionLog");
  if (!container) return;

  container.innerHTML = "";

  donationLedger.forEach((tx, index) => {
    container.innerHTML += `
      <div class="tx-card">
        <p><strong>Transaction #${index + 1}</strong></p>
        <p><strong>Donor:</strong> ${tx.donor}</p>
        <p><strong>Amount:</strong> ₹${tx.amount}</p>
        <p><strong>Time:</strong> ${new Date(tx.timestamp).toLocaleString()}</p>
        <p class="hash"><strong>Prev Hash:</strong><br>${tx.previousHash}</p>
        <p class="hash"><strong>Hash:</strong><br>${tx.hash}</p>
      </div>
    `;
  });
}


// ---------------- CAMPAIGN LIST ----------------
async function loadCampaigns() {
  const container = document.getElementById("campaigns");
  if (!container) return;

  container.innerHTML = "<p>Loading campaigns...</p>";

  try {
    const snap = await db.collection("campaigns").get();
    container.innerHTML = "";

    if (snap.empty) {
      container.innerHTML = "<p>No campaigns yet.</p>";
      return;
    }

    snap.forEach(doc => {
      const c = doc.data();

      const title = c.title || "Campaign";
      const raised = c.raised || 0;
      const target = c.target || 1;
      const percent = (raised / target) * 100;

      const img =
        `https://source.unsplash.com/600x400/?${encodeURIComponent(title)}`;

      container.innerHTML += `
        <div class="campaign-card">
          <img src="${img}">
          <div class="card-content">
            <h3>${title}</h3>
            <div class="progress-bar">
              <div class="progress" style="width:${percent}%"></div>
            </div>
            <p>₹${raised} of ₹${target}</p>
            <button onclick="viewCampaign('${doc.id}')">View Campaign</button>
          </div>
        </div>
      `;
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = "<p>Failed to load campaigns.</p>";
  }
}

function viewCampaign(id) {
  window.location.href = `pages/campaign.html?id=${id}`;
}


// ---------------- DASHBOARD ----------------
function loadDashboard() {
  const container = document.getElementById("dashboardCampaigns");
  if (!container) return;

  auth.onAuthStateChanged(async user => {
    if (!user) {
      container.innerHTML = "<p>Please login to view dashboard.</p>";
      return;
    }

    container.innerHTML = "<p>Loading...</p>";

    const snapshot = await db
      .collection("campaigns")
      .where("creatorId", "==", user.uid)
      .get();

    container.innerHTML = "";

    let total = 0;
    let labels = [];
    let values = [];

    snapshot.forEach(doc => {
      const c = doc.data();
      total += c.raised || 0;

      labels.push(c.title);
      values.push(c.raised);

      container.innerHTML += `
        <div class="campaign-card">
          <h3>${c.title}</h3>
          <p>₹${c.raised} of ₹${c.target}</p>
        </div>
      `;
    });

    document.getElementById("totalCampaigns").innerText = snapshot.size;
    document.getElementById("totalRaised").innerText = total;

    renderCharts(labels, values);
  });
}
function renderCharts(labels, values) {

  const ctx1 = document.getElementById("campaignChart");
  const ctx2 = document.getElementById("moneyChart");

  if (!ctx1 || !ctx2) return;

  new Chart(ctx1, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "Funds Raised",
        data: values
      }]
    }
  });

  new Chart(ctx2, {
    type: "pie",
    data: {
      labels: labels,
      datasets: [{
        data: values
      }]
    }
  });
}

// ---------------- SAFE PAGE LOADER ----------------
document.addEventListener("DOMContentLoaded", async () => {

  loadCampaigns();
  loadDashboard();

  const donateBtn = document.getElementById("donateBtn");
  const donateInput = document.getElementById("donateAmount");

  if (!donateBtn || !donateInput) return;

  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) return;

  loadLedger(id);

  const ref = db.collection("campaigns").doc(id);
  const doc = await ref.get();
  if (!doc.exists) return;

  const c = doc.data();

  document.getElementById("cTitle").innerText = c.title;
  document.getElementById("cDesc").innerText = c.description;
  document.getElementById("campRaised").innerText = c.raised;
  document.getElementById("campTarget").innerText = c.target;
  document.getElementById("campDeadline").innerText = c.deadline || "---";
  document.getElementById("campCategory").innerText = c.category || "General";

  const percent = c.target > 0 ? (c.raised / c.target) * 100 : 0;
  document.getElementById("campProgress").style.width = percent + "%";

  donateBtn.addEventListener("click", async () => {
    const amt = Number(donateInput.value);
    if (!amt || amt <= 0) return;

    await ref.update({
      raised: firebase.firestore.FieldValue.increment(amt)
    });

    await recordDonation("anon", amt);

    const updated = (await ref.get()).data();

    document.getElementById("campRaised").innerText = updated.raised;

    const p = updated.target > 0
      ? (updated.raised / updated.target) * 100
      : 0;

    document.getElementById("campProgress").style.width = p + "%";

    alert("Donation successful ❤️");
  });

});

