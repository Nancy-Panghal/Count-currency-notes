// HistorySidebar.js — Scan History Panel
// Slides in from right. Shows last 10 scans, newest first.
// Each card: date/time (readable), individual note pills, scan total.
// "Clear All" wipes AsyncStorage + state.

import React, { useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Animated, Dimensions, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width: SW } = Dimensions.get("window");
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const NOTE_COLORS = {
  500:  { bg: "rgba(130,90,30,0.25)",  border: "rgba(201,168,76,0.6)",  text: "#C9A84C" },
  200:  { bg: "rgba(70,120,70,0.25)",  border: "rgba(100,180,100,0.6)", text: "#7EC87E" },
  100:  { bg: "rgba(50,100,160,0.25)", border: "rgba(80,140,220,0.5)",  text: "#7EB8F0" },
  50:   { bg: "rgba(100,60,140,0.25)", border: "rgba(160,100,220,0.5)", text: "#C090E8" },
  20:   { bg: "rgba(160,80,40,0.25)",  border: "rgba(220,130,80,0.5)",  text: "#E89060" },
  10:   { bg: "rgba(40,120,110,0.25)", border: "rgba(70,180,160,0.5)",  text: "#60C8B8" },
  5:    { bg: "rgba(80,80,80,0.25)",   border: "rgba(140,140,140,0.5)", text: "#AAAAAA" },
};

function formatTimestamp(isoString) {
  const d     = new Date(isoString);
  const day   = d.getDate().toString().padStart(2, "0");
  const month = MONTHS[d.getMonth()];
  const year  = d.getFullYear();
  let   h     = d.getHours();
  const min   = d.getMinutes().toString().padStart(2, "0");
  const ampm  = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return { date: `${day} ${month} ${year}`, time: `${h}:${min} ${ampm}` };
}

// Group notes by denomination for compact display
function groupNotes(notes) {
  const map = {};
  for (const n of notes) map[n] = (map[n] || 0) + 1;
  return Object.entries(map)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([denom, count]) => ({ denom: Number(denom), count }));
}

export default function HistorySidebar({ history, onClose, onClear }) {
  // Stagger cards in
  const staggerAnims = useRef(
    Array.from({ length: 10 }, () => new Animated.Value(0))
  ).current;

  useEffect(() => {
    const anims = history.slice(0, 10).map((_, i) =>
      Animated.timing(staggerAnims[i], {
        toValue:  1,
        duration: 320,
        delay:    i * 55,
        useNativeDriver: true,
      })
    );
    Animated.parallel(anims).start();
  }, [history]);

  const handleClear = () => {
    Alert.alert(
      "Clear All History",
      "This will permanently delete all scan records.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: onClear },
      ]
    );
  };

  const grandTotal = history.reduce((s, e) => s + e.total, 0);

  return (
    <View style={s.root}>
      <SafeAreaView style={s.inner} edges={["top", "bottom"]}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View>
            <Text style={s.title}>HISTORY</Text>
            <Text style={s.subtitle}>{history.length} scan{history.length !== 1 ? "s" : ""}</Text>
          </View>
          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <Text style={s.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* ── Grand total band ── */}
        {history.length > 0 && (
          <View style={s.grandTotalBand}>
            <Text style={s.grandTotalLabel}>ALL TIME TOTAL</Text>
            <Text style={s.grandTotalValue}>
              ₹{grandTotal.toLocaleString("en-IN")}
            </Text>
          </View>
        )}

        {/* ── Cards ── */}
        <ScrollView
          style={s.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
        >
          {history.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🗂️</Text>
              <Text style={s.emptyTitle}>No scans yet</Text>
              <Text style={s.emptySub}>
                Tap the shutter button to scan{"\n"}your first batch of notes
              </Text>
            </View>
          ) : (
            history.map((entry, idx) => {
              const { date, time } = formatTimestamp(entry.timestamp);
              const grouped        = groupNotes(entry.notes);
              const anim           = staggerAnims[Math.min(idx, 9)];

              return (
                <Animated.View
                  key={entry.id}
                  style={[
                    s.card,
                    idx === 0 && s.cardLatest,
                    {
                      opacity: anim,
                      transform: [{
                        translateX: anim.interpolate({
                          inputRange:  [0, 1],
                          outputRange: [30, 0],
                        }),
                      }],
                    },
                  ]}
                >
                  {/* Card header: date + time */}
                  <View style={s.cardHeader}>
                    <View>
                      <Text style={s.cardDate}>{date}</Text>
                      <Text style={s.cardTime}>{time}</Text>
                    </View>
                    {idx === 0 && (
                      <View style={s.latestBadge}>
                        <Text style={s.latestBadgeText}>LATEST</Text>
                      </View>
                    )}
                  </View>

                  {/* Divider */}
                  <View style={s.cardDivider} />

                  {/* Note pills */}
                  <View style={s.pillsRow}>
                    {grouped.map(({ denom, count }) => {
                      const col = NOTE_COLORS[denom] ?? NOTE_COLORS[5];
                      return (
                        <View
                          key={denom}
                          style={[s.notePill, { backgroundColor: col.bg, borderColor: col.border }]}
                        >
                          <Text style={[s.notePillDenom, { color: col.text }]}>₹{denom}</Text>
                          {count > 1 && (
                            <Text style={[s.notePillCount, { color: col.text }]}>×{count}</Text>
                          )}
                        </View>
                      );
                    })}
                  </View>

                  {/* Scan total */}
                  <View style={s.cardFooter}>
                    <Text style={s.cardTotalLabel}>SCAN TOTAL</Text>
                    <Text style={s.cardTotalValue}>
                      ₹{entry.total.toLocaleString("en-IN")}
                    </Text>
                  </View>
                </Animated.View>
              );
            })
          )}
        </ScrollView>

        {/* ── Clear button ── */}
        {history.length > 0 && (
          <TouchableOpacity style={s.clearBtn} onPress={handleClear}>
            <Text style={s.clearBtnText}>🗑  Clear All History</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root:            { flex: 1, backgroundColor: "#0E0E10" },
  inner:           { flex: 1 },

  // Header
  header:          { flexDirection: "row", alignItems: "flex-start",
                     justifyContent: "space-between",
                     paddingHorizontal: 20, paddingTop: 6, paddingBottom: 14,
                     borderBottomWidth: 1, borderBottomColor: "#1C1C20" },
  title:           { color: "#C9A84C", fontSize: 14, fontWeight: "800",
                     letterSpacing: 3.5 },
  subtitle:        { color: "#555", fontSize: 12, marginTop: 3 },
  closeBtn:        { width: 36, height: 36, borderRadius: 18,
                     backgroundColor: "#1C1C20",
                     alignItems: "center", justifyContent: "center" },
  closeBtnText:    { color: "#AAA", fontSize: 15, fontWeight: "600" },

  // Grand total
  grandTotalBand:  { marginHorizontal: 16, marginTop: 14, marginBottom: 4,
                     backgroundColor: "rgba(201,168,76,0.08)",
                     borderRadius: 14, paddingVertical: 12, paddingHorizontal: 18,
                     borderWidth: 1, borderColor: "rgba(201,168,76,0.2)",
                     flexDirection: "row", alignItems: "center",
                     justifyContent: "space-between" },
  grandTotalLabel: { color: "rgba(201,168,76,0.7)", fontSize: 10,
                     letterSpacing: 2.5, fontWeight: "700" },
  grandTotalValue: { color: "#C9A84C", fontSize: 22, fontWeight: "900" },

  // Scroll
  scroll:          { flex: 1, paddingHorizontal: 14, paddingTop: 10 },

  // Empty
  empty:           { alignItems: "center", paddingTop: 60 },
  emptyIcon:       { fontSize: 44, marginBottom: 14 },
  emptyTitle:      { color: "#F5F0E8", fontSize: 17, fontWeight: "700", marginBottom: 6 },
  emptySub:        { color: "#555", fontSize: 13, textAlign: "center", lineHeight: 20 },

  // Cards
  card:            { backgroundColor: "#141416", borderRadius: 16,
                     padding: 16, marginBottom: 10,
                     borderWidth: 1, borderColor: "#1E1E22" },
  cardLatest:      { borderColor: "rgba(201,168,76,0.35)",
                     backgroundColor: "#141210" },
  cardHeader:      { flexDirection: "row", justifyContent: "space-between",
                     alignItems: "flex-start", marginBottom: 10 },
  cardDate:        { color: "#F5F0E8", fontSize: 14, fontWeight: "700" },
  cardTime:        { color: "#666", fontSize: 11, marginTop: 2, letterSpacing: 0.5 },
  latestBadge:     { backgroundColor: "rgba(201,168,76,0.15)",
                     borderWidth: 1, borderColor: "rgba(201,168,76,0.4)",
                     paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  latestBadgeText: { color: "#C9A84C", fontSize: 9, fontWeight: "800",
                     letterSpacing: 1.5 },
  cardDivider:     { height: 1, backgroundColor: "#1E1E22", marginBottom: 10 },

  // Note pills
  pillsRow:        { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  notePill:        { flexDirection: "row", alignItems: "center",
                     paddingHorizontal: 10, paddingVertical: 4,
                     borderRadius: 20, borderWidth: 1, gap: 3 },
  notePillDenom:   { fontSize: 12, fontWeight: "700" },
  notePillCount:   { fontSize: 11, fontWeight: "600", opacity: 0.8 },

  // Card footer
  cardFooter:      { flexDirection: "row", justifyContent: "space-between",
                     alignItems: "center", paddingTop: 10,
                     borderTopWidth: 1, borderTopColor: "#1E1E22" },
  cardTotalLabel:  { color: "#555", fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  cardTotalValue:  { color: "#F5F0E8", fontSize: 18, fontWeight: "900" },

  // Clear button
  clearBtn:        { marginHorizontal: 16, marginBottom: 8, marginTop: 4,
                     backgroundColor: "rgba(180,40,40,0.12)",
                     borderWidth: 1, borderColor: "rgba(180,40,40,0.3)",
                     borderRadius: 14, paddingVertical: 13,
                     alignItems: "center" },
  clearBtnText:    { color: "#E05050", fontSize: 14, fontWeight: "700" },
});