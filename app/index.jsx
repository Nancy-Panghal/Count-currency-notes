// index.js — Currency Note Counter
// Camera always visible. Tap shutter to scan. Flip icon toggles front/back.
// History icon (top-right) slides open HistorySidebar.
// Each scan: Gemini detects ALL notes in frame → sum added to running total.
// No 2000 note (withdrawn by RBI). No image picker. No session concept.

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Animated, Dimensions, StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { GoogleGenerativeAI } from "@google/generative-ai";
import AsyncStorage from "@react-native-async-storage/async-storage";
import HistorySidebar from "./History";

const API_KEY   = "YOUR_API_KEY_HERE";
const genAI     = new GoogleGenerativeAI(API_KEY);
const model     = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const { width: SW, height: SH } = Dimensions.get("window");
const HISTORY_KEY = "note_counter_history";
const MAX_HISTORY = 10;


const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatTimestamp(isoString) {
  const d = new Date(isoString);
  const day   = d.getDate();
  const month = MONTHS[d.getMonth()];
  const year  = d.getFullYear();
  let   h     = d.getHours(), m = d.getMinutes();
  const ampm  = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${day} ${month} ${year}  ${h}:${m.toString().padStart(2,"0")} ${ampm}`;
}

async function loadHistory() {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveHistory(list) {
  try { await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch {}
}

// ── Component ──────────────────────────────────────────────────────────────
export default function Index() {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [facing, setFacing]           = useState("back");
  const [loading, setLoading]         = useState(false);
  const [loadMsg, setLoadMsg]         = useState("");
  const [totalSum, setTotalSum]       = useState(0);
  const [lastNotes, setLastNotes]     = useState([]); // notes from most recent scan
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [history, setHistory]         = useState([]);

  // Animations
  const totalScale   = useRef(new Animated.Value(1)).current;
  const totalOpacity = useRef(new Animated.Value(1)).current;
  const flashAnim    = useRef(new Animated.Value(0)).current;
  const sidebarAnim  = useRef(new Animated.Value(SW)).current;
  const resultAnim   = useRef(new Animated.Value(0)).current;

  useEffect(() => { loadHistory().then(setHistory); }, []);

  // ── Sidebar slide ──────────────────────────────────────────────────────
  const openSidebar = useCallback(() => {
    setSidebarOpen(true);
    Animated.spring(sidebarAnim, {
      toValue: 0, useNativeDriver: true, damping: 20, stiffness: 160,
    }).start();
  }, [sidebarAnim]);

  const closeSidebar = useCallback(() => {
    Animated.timing(sidebarAnim, {
      toValue: SW, duration: 260, useNativeDriver: true,
    }).start(() => setSidebarOpen(false));
  }, [sidebarAnim]);

  // ── Camera flash on capture ────────────────────────────────────────────
  const triggerFlash = () => {
    flashAnim.setValue(1);
    Animated.timing(flashAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start();
  };

  // ── Total punch animation ──────────────────────────────────────────────
  const punchTotal = () => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(totalScale,   { toValue: 1.22, duration: 100, useNativeDriver: true }),
        Animated.timing(totalOpacity, { toValue: 0.7,  duration: 100, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(totalScale,   { toValue: 1, useNativeDriver: true, damping: 12 }),
        Animated.timing(totalOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]),
    ]).start();
  };

  // ── Result card slide in ───────────────────────────────────────────────
  const showResult = () => {
    resultAnim.setValue(60);
    Animated.spring(resultAnim, {
      toValue: 0, useNativeDriver: true, damping: 16, stiffness: 140,
    }).start();
  };

  // ── Core: capture + AI ────────────────────────────────────────────────
  const handleCapture = async () => {
    if (!cameraRef.current || loading) return;
    triggerFlash();
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.65 });
      await processImage(photo.base64);
    } catch (e) { console.error(e); }
  };

  const handlePickImage = async () => {
    if (loading) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      base64: true,
      quality: 0.65,
    });
    if (!result.canceled && result.assets[0].base64) {
      await processImage(result.assets[0].base64);
    }
  };

  const processImage = async (base64) => {
    setLoading(true); setLoadMsg("Detecting notes…");
    try {
      const prompt = `You are an Indian currency detection AI.
Examine this image and identify ALL visible Indian currency notes.
Valid denominations: 5, 10, 20, 50, 100, 200, 500.
Return ONLY a comma-separated list of integers. Example: 500,200,100
If no valid Indian note is visible, return: 0
No explanation. No extra text. Only the numbers.`;

      setLoadMsg("Analyzing…");
      const result = await model.generateContent([
        prompt,
        { inlineData: { data: base64, mimeType: "image/jpeg" } },
      ]);

      const raw   = result.response.text().trim();
      const notes = raw
        .split(",")
        .map((s) => parseInt(s.replace(/\D/g, ""), 10))
        .filter((n) => n > 0 && [5,10,20,50,100,200,500].includes(n));

      if (notes.length === 0) {
        setLoadMsg("No notes found"); 
        setTimeout(() => setLoadMsg(""), 1800);
        return;
      }

      const subtotal = notes.reduce((a, b) => a + b, 0);

      // Build history entry
      const entry = {
        id:        Date.now().toString(),
        timestamp: new Date().toISOString(),
        notes,
        total:     subtotal,
      };

      // Update running total
      setTotalSum((prev) => { punchTotal(); return prev + subtotal; });
      setLastNotes(notes);
      showResult();

      // Persist history (max 10, newest first)
      const updated = [entry, ...history].slice(0, MAX_HISTORY);
      setHistory(updated);
      await saveHistory(updated);

    } catch (err) {
      console.error("Gemini error:", err);
      setLoadMsg("API error — check key");
      setTimeout(() => setLoadMsg(""), 2000);
    } finally {
      setLoading(false);
      setLoadMsg("");
    }
  };

  const resetTotal = () => {
    setTotalSum(0);
    setLastNotes([]);
  };

  // ── Permission gate ────────────────────────────────────────────────────
  if (!permission) return <View style={s.root} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={s.root} edges={["top","bottom"]}>
        <StatusBar barStyle="light-content" backgroundColor="#080808" />
        <View style={s.permBox}>
          <Text style={s.permIcon}>📷</Text>
          <Text style={s.permTitle}>Camera Access Required</Text>
          <Text style={s.permSub}>Allow camera to scan currency notes</Text>
          <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
            <Text style={s.permBtnText}>Allow Camera</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {/* ── CAMERA (full screen) ── */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
      />

      {/* ── FLASH overlay ── */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, s.flashLayer, { opacity: flashAnim }]}
      />

      {/* ── VIGNETTE (dark edges for readability) ── */}
      <View style={[StyleSheet.absoluteFill, s.vignette]} pointerEvents="none" />

      {/* ── TOP BAR ── */}
      <SafeAreaView style={s.topBar} edges={["top"]}>
        {/* Reset button */}
        <TouchableOpacity style={s.topBtn} onPress={resetTotal}>
          <Text style={s.topBtnText}>↺</Text>
        </TouchableOpacity>

        <Text style={s.appName}>NOTE COUNTER</Text>

        {/* History icon */}
        <TouchableOpacity style={s.topBtn} onPress={openSidebar}>
          <Text style={s.topBtnText}>⊞</Text>
          {history.length > 0 && (
            <View style={s.historyDot}>
              <Text style={s.historyDotText}>{Math.min(history.length, 9)}</Text>
            </View>
          )}
        </TouchableOpacity>
      </SafeAreaView>

      {/* ── TOTAL DISPLAY (center) ── */}
      <View style={s.totalWrap} pointerEvents="none">
        <Text style={s.totalLabel}>TOTAL</Text>
        <Animated.Text style={[s.totalAmount, {
          transform: [{ scale: totalScale }],
          opacity:   totalOpacity,
        }]}>
          ₹{totalSum.toLocaleString("en-IN")}
        </Animated.Text>
      </View>

      {/* ── LAST SCAN RESULT (slides up after each scan) ── */}
      {lastNotes.length > 0 && (
        <Animated.View
          style={[s.resultCard, { transform: [{ translateY: resultAnim }] }]}
          pointerEvents="none"
        >
          <Text style={s.resultLabel}>DETECTED</Text>
          <View style={s.resultPills}>
            {lastNotes.map((n, i) => (
              <View key={i} style={s.pill}>
                <Text style={s.pillText}>₹{n}</Text>
              </View>
            ))}
          </View>
          <Text style={s.resultSum}>
            +₹{lastNotes.reduce((a, b) => a + b, 0).toLocaleString("en-IN")}
          </Text>
        </Animated.View>
      )}

      {/* ── BOTTOM CONTROLS ── */}
      <SafeAreaView style={s.bottomBar} edges={["bottom"]}>

        {/* Flip button */}
        <TouchableOpacity
          style={s.flipBtn}
          onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
        >
          <Text style={s.flipIcon}>⇌</Text>
          <Text style={s.flipLabel}>Flip</Text>
        </TouchableOpacity>

        {/* Shutter */}
        <TouchableOpacity
          style={[s.shutter, loading && s.shutterDisabled]}
          onPress={handleCapture}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#080808" />
          ) : (
            <View style={s.shutterCore} />
          )}
        </TouchableOpacity>

        {/* Spacer to balance flip button */}
        <TouchableOpacity
          style={s.galleryBtn}
          onPress={handlePickImage}
          disabled={loading}
        >
          <Text style={s.galleryIcon}>🖼</Text>
          <Text style={s.galleryLabel}>Gallery</Text>
        </TouchableOpacity>
      </SafeAreaView>

      {/* ── LOADING MESSAGE ── */}
      {!!loadMsg && (
        <View style={s.loadMsgWrap} pointerEvents="none">
          <Text style={s.loadMsgText}>{loadMsg}</Text>
        </View>
      )}

      {/* ── HISTORY SIDEBAR ── */}
      {sidebarOpen && (
        <>
          {/* Backdrop */}
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={closeSidebar}
          />
          <Animated.View style={[s.sidebar, { transform: [{ translateX: sidebarAnim }] }]}>
            <HistorySidebar
              history={history}
              onClose={closeSidebar}
              onClear={async () => {
                setHistory([]);
                await saveHistory([]);
              }}
            />
          </Animated.View>
        </>
      )}
    </View>
  );
}

const SHUTTER = 76;

const s = StyleSheet.create({
  root:            { flex: 1, backgroundColor: "#080808" },

  // Permission
  permBox:         { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  permIcon:        { fontSize: 52, marginBottom: 16 },
  permTitle:       { color: "#F5F0E8", fontSize: 22, fontWeight: "800", marginBottom: 8 },
  permSub:         { color: "#666", fontSize: 14, textAlign: "center", marginBottom: 32 },
  permBtn:         { backgroundColor: "#C9A84C", paddingVertical: 14, paddingHorizontal: 40,
                     borderRadius: 14 },
  permBtnText:     { color: "#080808", fontSize: 16, fontWeight: "800" },

  // Overlays
  flashLayer:      { backgroundColor: "#FFF5D0" },
  vignette:        { backgroundColor: "transparent",
                     shadowColor: "#000", shadowOffset: { width: 0, height: 0 },
                     shadowOpacity: 0, shadowRadius: 0,
                     // Pure CSS vignette via nested approach handled in topBar/bottomBar gradients
                   },

  // Top bar
  topBar:          { position: "absolute", top: 0, left: 0, right: 0,
                     flexDirection: "row", alignItems: "center",
                     justifyContent: "space-between", paddingHorizontal: 20,
                     paddingBottom: 12,
                     backgroundColor: "rgba(8,8,8,0.55)" },
  topBtn:          { width: 44, height: 44, borderRadius: 22,
                     backgroundColor: "rgba(255,255,255,0.1)",
                     alignItems: "center", justifyContent: "center" },
  topBtnText:      { color: "#F5F0E8", fontSize: 20, fontWeight: "700" },
  historyDot:      { position: "absolute", top: 2, right: 2, width: 16, height: 16,
                     borderRadius: 8, backgroundColor: "#C9A84C",
                     alignItems: "center", justifyContent: "center" },
  historyDotText:  { color: "#080808", fontSize: 9, fontWeight: "900" },
  appName:         { color: "#C9A84C", fontSize: 12, fontWeight: "800",
                     letterSpacing: 3.5 },

  // Total
  totalWrap:       { position: "absolute", top: "28%", left: 0, right: 0,
                     alignItems: "center" },
  totalLabel:      { color: "rgba(201,168,76,0.7)", fontSize: 11,
                     letterSpacing: 4, fontWeight: "700", marginBottom: 4 },
  totalAmount:     { color: "#F5F0E8", fontSize: 58, fontWeight: "900",
                     letterSpacing: -1, textShadowColor: "rgba(0,0,0,0.8)",
                     textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 12 },

  // Result card
  resultCard:      { position: "absolute", bottom: 170, left: 20, right: 20,
                     backgroundColor: "rgba(12,12,12,0.88)",
                     borderRadius: 18, padding: 16,
                     borderWidth: 1, borderColor: "rgba(201,168,76,0.3)",
                     alignItems: "center" },
  resultLabel:     { color: "rgba(201,168,76,0.7)", fontSize: 10,
                     letterSpacing: 3, fontWeight: "700", marginBottom: 8 },
  resultPills:     { flexDirection: "row", flexWrap: "wrap",
                     justifyContent: "center", gap: 6, marginBottom: 8 },
  pill:            { backgroundColor: "rgba(201,168,76,0.15)",
                     borderWidth: 1, borderColor: "rgba(201,168,76,0.4)",
                     paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  pillText:        { color: "#C9A84C", fontSize: 13, fontWeight: "700" },
  resultSum:       { color: "#F5F0E8", fontSize: 22, fontWeight: "900" },

  // Bottom controls
  bottomBar:       { position: "absolute", bottom: 0, left: 0, right: 0,
                     flexDirection: "row", alignItems: "center",
                     justifyContent: "space-between", paddingHorizontal: 36,
                     paddingTop: 20, paddingBottom: 10,
                     backgroundColor: "rgba(8,8,8,0.65)" },
  flipBtn:         { width: 64, alignItems: "center" },
  flipIcon:        { color: "#F5F0E8", fontSize: 26, fontWeight: "300" },
  flipLabel:       { color: "#888", fontSize: 10, letterSpacing: 1.5, marginTop: 2 },
  galleryBtn:      { width: 64, alignItems: "center" },
  galleryIcon:     { fontSize: 26 },
  galleryLabel:    { color: "#888", fontSize: 10, letterSpacing: 1.5, marginTop: 2 },

  shutter:         { width: SHUTTER, height: SHUTTER, borderRadius: SHUTTER / 2,
                     backgroundColor: "#F5F0E8",
                     alignItems: "center", justifyContent: "center",
                     borderWidth: 3, borderColor: "#C9A84C",
                     shadowColor: "#C9A84C",
                     shadowOffset: { width: 0, height: 0 },
                     shadowOpacity: 0.6, shadowRadius: 14, elevation: 10 },
  shutterDisabled: { opacity: 0.5 },
  shutterCore:     { width: SHUTTER - 22, height: SHUTTER - 22,
                     borderRadius: (SHUTTER - 22) / 2,
                     backgroundColor: "#C9A84C" },

  // Load message
  loadMsgWrap:     { position: "absolute", bottom: 170, left: 0, right: 0,
                     alignItems: "center" },
  loadMsgText:     { backgroundColor: "rgba(8,8,8,0.85)",
                     color: "#C9A84C", fontSize: 13, fontWeight: "600",
                     paddingHorizontal: 18, paddingVertical: 7,
                     borderRadius: 20, letterSpacing: 0.5,
                     overflow: "hidden" },

  // Sidebar shell (content is HistorySidebar component)
  sidebar:         { position: "absolute", top: 0, right: 0, bottom: 0,
                     width: SW * 0.82,
                     shadowColor: "#000", shadowOffset: { width: -4, height: 0 },
                     shadowOpacity: 0.5, shadowRadius: 20, elevation: 20 },
});