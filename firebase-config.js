/* =========================================================
   PUT YOUR FIREBASE + CLOUDINARY DETAILS HERE
   (README.md explains exactly where to find each value)
   ========================================================= */

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Cloudinary (images/videos are stored here — no Firebase Storage cost)
const CLOUDINARY_CLOUD_NAME = "YOUR_CLOUD_NAME";
const CLOUDINARY_UPLOAD_PRESET = "YOUR_UNSIGNED_UPLOAD_PRESET";

// Emergency backup login (see README "Emergency Backup Login").
// Create a SECOND user with this exact email in Firebase Authentication,
// and set its password to your own chosen 10-digit emergency code.
const EMERGENCY_ACCESS_EMAIL = "emergency-access@mauryabatteryworks.internal";

// Both index.html and admin.html load this same file.
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
