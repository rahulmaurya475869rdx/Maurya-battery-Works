/* =========================================================
   PUT YOUR FIREBASE + CLOUDINARY DETAILS HERE
   (README.md explains exactly where to find each value)
   ========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyC9H4aW1NcReM-5rcswkV2H5usWTNxV8sU",
  authDomain: "maurya-battery-works.firebaseapp.com",
  projectId: "maurya-battery-works",
  storageBucket: "maurya-battery-works.firebasestorage.app",
  messagingSenderId: "992788120390",
  appId: "1:992788120390:web:9c5a2c94f51d77846e9922"
};

// Cloudinary (images/videos are stored here — no Firebase Storage cost)
const CLOUDINARY_CLOUD_NAME = "m1lkmgfe";
const CLOUDINARY_UPLOAD_PRESET = "Mbw store";

// Emergency backup login (see README "Emergency Backup Login").
// Create a SECOND user with this exact email in Firebase Authentication,
// and set its password to your own chosen 10-digit emergency code.
const EMERGENCY_ACCESS_EMAIL = "emergency-access@mauryabatteryworks.internal";

// Both index.html and admin.html load this same file.
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
