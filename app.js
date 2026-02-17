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

console.log("APP JS LOADED");


// ---------------- HASH HELPER ----------------
async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}


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


// ---------------- CREATE CAMPAIGN ----------------
function waitForUser() {
  return new Promise(resolve => {
    const unsub = auth.onAuthStateChanged(user => {
      unsub();
      resolve(user);
    });
  });
}

const createForm = document.getElementById("createCampaignForm");

if (createForm) {
  createForm.addEventListener("submit", async e => {
    e.preventDefault();

    const user = await waitForUser();
    if (!user) return alert("Login required");

    const campaign = {
      title: document.getElementById("title").value,
      description: document.getElementById("description").value,
      target: Number(document.getElementById("target").value),
      raised: 0,
      deadline: document.getElementById("deadline").value,
      creatorId: user.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      await db.collection("campaigns").add(campaign);
      alert("Campaign created!");
      createForm.reset();
    } catch (err) {
      console.error(err);
      alert("Error creating campaign.");
    }
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

    if (snap.empty) return container.innerHTML = "<p>No campaigns yet.</p>";

    snap.forEach(doc => {
      const c = doc.data();
      const percent = (c.raised / (c.target || 1)) * 100;
      const img = `https://source.unsplash.com/600x400/?${encodeURIComponent(c.title)}`;

      container.innerHTML += `
        <div class="campaign-card">
          <img src="${img}">
          <div class="card-content">
            <h3>${c.title}</h3>
            <div class="progress-bar">
              <div class="progress" style="width:${percent}%"></div>
            </div>
            <p>₹${c.raised} of ₹${c.target}</p>
            <button onclick="viewCampaign('${doc.id}')">View Campaign</button>
          </div>
        </div>`;
    });

  } catch {
    container.innerHTML = "<p>Failed to load campaigns.</p>";
  }
}

function viewCampaign(id) {
  window.location.href = `pages/campaign.html?id=${id}`;
}


// ---------------- CAMPAIGN PAGE ----------------
// ---------------- CAMPAIGN PAGE ----------------
async function loadCampaignPage() {
  const donateBtn = document.getElementById("donateBtn");
  const donateInput = document.getElementById("donateAmount");
  if (!donateBtn || !donateInput) return;

  const id = new URLSearchParams(window.location.search).get("id");
  if (!id) return;

  const ref = db.collection("campaigns").doc(id);
  const doc = await ref.get();
  if (!doc.exists) return;

  const c = doc.data();

  // restore all UI fields
  document.getElementById("cTitle").innerText = c.title;
  document.getElementById("cDesc").innerText = c.description;
  document.getElementById("campRaised").innerText = c.raised;
  document.getElementById("campTarget").innerText = c.target;
  document.getElementById("campDeadline").innerText = c.deadline || "---";
  document.getElementById("campCategory").innerText = c.category || "General";

  const percent = c.target > 0 ? (c.raised / c.target) * 100 : 0;
  document.getElementById("campProgress").style.width = percent + "%";

  await loadTransactions(id);

  donateBtn.addEventListener("click", async () => {
    const amt = Number(donateInput.value);
    if (!amt || amt <= 0) return;

    const snap = await db.collection("transactions")
      .where("campaignId", "==", id)
      .get();

    let txNumber = 1;
    let prevHash = "GENESIS";

    if (!snap.empty) {
      const list = snap.docs.map(d => d.data())
        .sort((a,b)=>(a.txNumber||0)-(b.txNumber||0));
      const last = list[list.length-1];
      txNumber = (last.txNumber||0)+1;
      prevHash = last.hash || "GENESIS";
    }

    const hash = await sha256(id + amt + Date.now() + prevHash);

    await ref.update({
      raised: firebase.firestore.FieldValue.increment(amt)
    });

    await db.collection("transactions").add({
      campaignId: id,
      donor: "anon",
      amount: amt,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      txNumber,
      previousHash: prevHash,
      hash
    });

    // refresh UI after donation
    const updated = (await ref.get()).data();

    document.getElementById("campRaised").innerText = updated.raised;

    const p = updated.target > 0
      ? (updated.raised / updated.target) * 100
      : 0;

    document.getElementById("campProgress").style.width = p + "%";

    alert("Donation recorded on blockchain ✅");

    await loadTransactions(id);
  });
}


// ---------------- TRANSACTION LOG + TAMPER CHECK ----------------
async function loadTransactions(campaignId) {
  const container = document.getElementById("transactionLog");
  if (!container) return;

  const snap = await db.collection("transactions")
    .where("campaignId", "==", campaignId)
    .get();

  container.innerHTML = "";

  const list = snap.docs
    .map(d => d.data())
    .sort((a,b)=> (a.txNumber||0)-(b.txNumber||0));

  if (!list.length) {
    container.innerHTML = "<p>No transactions yet.</p>";
    return;
  }

  let tampered = false;

  for (let i=1;i<list.length;i++){
    if(list[i].previousHash !== list[i-1].hash){
      tampered = true;
      break;
    }
  }

  if(tampered){
    container.innerHTML +=
      `<p style="color:red;font-weight:bold">
        ⚠ Blockchain tampered! Ledger integrity broken.
      </p>`;
  }

  list.forEach(tx=>{
    container.innerHTML += `
      <div class="tx-card">
        <p><strong>Transaction #${tx.txNumber}</strong></p>
        <p><strong>Donor:</strong> ${tx.donor}</p>
        <p><strong>Amount:</strong> ₹${tx.amount}</p>
        <p><strong>Prev Hash:</strong><br>${tx.previousHash}</p>
        <p><strong>Hash:</strong><br>${tx.hash}</p>
      </div>`;
  });
}


// ---------------- DASHBOARD ----------------
async function loadDashboard() {
  const container = document.getElementById("dashboardCampaigns");
  if (!container) return;

  auth.onAuthStateChanged(async user => {
    if (!user) return container.innerHTML = "<p>Please login.</p>";

    const snap = await db.collection("campaigns")
      .where("creatorId", "==", user.uid)
      .get();

    container.innerHTML = "";
    let total = 0;

    snap.forEach(doc => {
      const c = doc.data();
      total += c.raised || 0;

      container.innerHTML += `
        <div class="campaign-card">
          <h3>${c.title}</h3>
          <p>₹${c.raised} of ₹${c.target}</p>
        </div>`;
    });

    document.getElementById("totalCampaigns").innerText = snap.size;
    document.getElementById("totalRaised").innerText = total;
  });
}


// ---------------- PAGE LOADER ----------------
document.addEventListener("DOMContentLoaded", () => {
  loadCampaigns();
  loadDashboard();
  loadCampaignPage();
});
