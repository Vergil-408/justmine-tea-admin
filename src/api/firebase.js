import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

// PENTING: config ini HARUS SAMA PERSIS dengan src/api/firebase.js di app customer,
// supaya Admin/Kasir ini membaca & menulis ke database Firestore yang sama.
// (apiKey Firebase untuk web memang bukan rahasia; yang melindungi data adalah Security Rules.)
export const firebaseConfig = {
  apiKey: "AIzaSyDiQISTMea-z9H7Gdd5oR3hTrrTSJ6_VvM",
  authDomain: "justmine-tea.firebaseapp.com",
  projectId: "justmine-tea",
  storageBucket: "justmine-tea.firebasestorage.app",
  messagingSenderId: "567738805461",
  appId: "1:567738805461:web:06b546c1d723eabfea865c",
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)
auth.languageCode = 'id' // email atur/reset password berbahasa Indonesia
