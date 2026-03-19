import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";

const C = Colors.light;

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.phoneFrame}>
      <View style={styles.phoneNotch} />
      <View style={styles.phoneScreen}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  modal: {
    flex: 1,
    backgroundColor: C.background,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: C.text,
  },
  closeBtn: {
    width: 34,
    height: 34,
    backgroundColor: C.surfaceElevated,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  modalContent: {
    padding: 20,
    gap: 16,
  },
  stepCard: {
    backgroundColor: C.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 16,
  },
  stepNumRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.tint,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  stepNumText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#fff",
  },
  stepTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: C.text,
    marginBottom: 4,
  },
  stepDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 19,
  },
  stepIllustration: {
    alignItems: "center",
  },
  phoneFrame: {
    width: 200,
    backgroundColor: "#0d0d14",
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.12)",
    overflow: "hidden",
    padding: 8,
    gap: 6,
  },
  phoneNotch: {
    width: 60,
    height: 8,
    backgroundColor: "#1a1a2e",
    borderRadius: 4,
    alignSelf: "center",
    marginBottom: 2,
  },
  phoneScreen: {
    gap: 6,
    minHeight: 130,
  },
  ytHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 4,
  },
  ytHeaderText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: C.text,
  },
  ytSearch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  ytSearchText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "rgba(255,255,255,0.3)",
  },
  ytVideoCard: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  ytThumbnail: {
    width: 70,
    height: 45,
    backgroundColor: "#1a1a2e",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  ytVideoTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: C.text,
    lineHeight: 14,
  },
  ytVideoSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: C.textSecondary,
  },
  ytVideoPlayer: {
    height: 80,
    backgroundColor: "#111",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  ytVideoMeta: {
    paddingHorizontal: 2,
  },
  ytVideoMetaTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: C.text,
  },
  ytActionRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 4,
  },
  ytAction: {
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 8,
  },
  ytActionHighlight: {
    backgroundColor: C.tint,
    paddingHorizontal: 10,
  },
  ytActionLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 8,
    color: "rgba(255,255,255,0.5)",
  },
  shareSheet: {
    backgroundColor: "#1c1c2e",
    borderRadius: 14,
    padding: 10,
    gap: 8,
    width: "100%",
  },
  shareSheetHandle: {
    width: 32,
    height: 3,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    alignSelf: "center",
  },
  shareSheetTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: C.text,
    textAlign: "center",
  },
  shareSheetRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  shareSheetItem: {
    alignItems: "center",
    gap: 4,
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
  },
  shareSheetItemActive: {
    backgroundColor: C.accentDim,
  },
  shareSheetItemLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 8,
    color: "rgba(255,255,255,0.4)",
    textAlign: "center",
  },
  tpHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 2,
  },
  tpHeaderTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: C.text,
  },
  tpInputLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 8,
    color: C.textSecondary,
    letterSpacing: 0.5,
    paddingHorizontal: 2,
  },
  tpInputRow: {
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
  },
  tpInput: {
    flex: 1,
    backgroundColor: C.surfaceElevated,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: C.border,
  },
  tpInputActive: {
    borderColor: C.tint,
  },
  tpInputText: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: C.textSecondary,
  },
  tpPlayBtn: {
    width: 28,
    height: 28,
    backgroundColor: C.tint,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tpHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: C.accentSecondary,
    textAlign: "center",
    marginTop: 2,
  },
  doneTip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(0,200,160,0.08)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,200,160,0.2)",
    padding: 14,
  },
  doneTipText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: C.textSecondary,
    flex: 1,
    lineHeight: 19,
  },

  ytLogoBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 4,
  },
  ytLogoIcon: {
    width: 20,
    height: 14,
    backgroundColor: "#FF0000",
    borderRadius: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  ytLogoText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    color: C.text,
    flex: 1,
  },
  ytBigThumbnail: {
    height: 72,
    backgroundColor: "#1a1a2e",
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  ytVideoInfo: {
    paddingHorizontal: 2,
    gap: 2,
  },
  calloutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 2,
  },
  calloutText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: C.accentSecondary,
  },
  shareSheetIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: C.tint,
    alignItems: "center",
    justifyContent: "center",
  },
  ytProgressBar: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 2,
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 2,
  },
  ytProgressFill: {
    width: "25%",
    height: 3,
    backgroundColor: "#FF0000",
    borderRadius: 2,
  },
  ytProgressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF0000",
    marginLeft: -4,
  },
  shareCalloutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 3,
    paddingRight: 18,
    marginTop: 1,
  },
  ytShareLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    color: "#fff",
  },
  ytLogoPlay: {
    fontSize: 8,
    color: "#fff",
  },
  ytIconText: {
    fontSize: 12,
  },
  ytEmojiIcon: {
    fontSize: 14,
  },
  closeBtnText: {
    fontSize: 16,
    color: C.textSecondary,
    fontFamily: "Inter_600SemiBold",
  },
  doneTipIcon: {
    fontSize: 20,
  },
});

function Step1Screen() {
  return (
    <PhoneFrame>
      {/* YouTube red logo bar */}
      <View style={styles.ytLogoBar}>
        <View style={styles.ytLogoIcon}>
          <Text style={styles.ytLogoPlay}>▶</Text>
        </View>
        <Text style={styles.ytLogoText}>YouTube</Text>
        <Text style={styles.ytIconText}>🔍</Text>
        <Text style={styles.ytIconText}>👤</Text>
      </View>
      {/* Video thumbnail */}
      <View style={styles.ytBigThumbnail}>
        <Text style={{ fontSize: 28 }}>▶</Text>
      </View>
      {/* Video info */}
      <View style={styles.ytVideoInfo}>
        <Text style={styles.ytVideoTitle} numberOfLines={2}>Your Song — Artist Name</Text>
        <Text style={styles.ytVideoSub}>1.2M views · 3:45</Text>
      </View>
    </PhoneFrame>
  );
}

function Step2Screen() {
  return (
    <PhoneFrame>
      {/* Video player */}
      <View style={styles.ytVideoPlayer}>
        <Text style={{ fontSize: 22, color: "white" }}>▶</Text>
      </View>
      {/* Progress bar */}
      <View style={styles.ytProgressBar}>
        <View style={styles.ytProgressFill} />
        <View style={styles.ytProgressDot} />
      </View>
      {/* YouTube bottom bar — exactly matching real YouTube icons as emoji */}
      <View style={styles.ytActionRow}>
        <View style={styles.ytAction}>
          <Text style={styles.ytEmojiIcon}>👍</Text>
        </View>
        <View style={styles.ytAction}>
          <Text style={styles.ytEmojiIcon}>👎</Text>
        </View>
        <View style={styles.ytAction}>
          <Text style={styles.ytEmojiIcon}>💬</Text>
        </View>
        <View style={styles.ytAction}>
          <Text style={styles.ytEmojiIcon}>🔖</Text>
        </View>
        {/* Share — highlighted in blue */}
        <View style={[styles.ytAction, styles.ytActionHighlight]}>
          <Text style={[styles.ytEmojiIcon, { fontSize: 12 }]}>↗️</Text>
          <Text style={styles.ytShareLabel}>Share</Text>
        </View>
        <View style={styles.ytAction}>
          <Text style={styles.ytEmojiIcon}>•••</Text>
        </View>
      </View>
      {/* Arrow callout */}
      <View style={styles.shareCalloutRow}>
        <Text style={[styles.calloutText, { fontSize: 11 }]}>↑ Tap the Share button</Text>
      </View>
    </PhoneFrame>
  );
}

function Step3Screen() {
  return (
    <PhoneFrame>
      <View style={styles.shareSheet}>
        <View style={styles.shareSheetHandle} />
        <Text style={styles.shareSheetTitle}>Share video via</Text>
        <View style={styles.shareSheetRow}>
          {/* Copy link highlighted */}
          <View style={[styles.shareSheetItem, styles.shareSheetItemActive]}>
            <View style={styles.shareSheetIconCircle}>
              <Text style={{ fontSize: 14 }}>🔗</Text>
            </View>
            <Text style={[styles.shareSheetItemLabel, { color: C.tint }]}>Copy{"\n"}link</Text>
          </View>
          <View style={styles.shareSheetItem}>
            <View style={[styles.shareSheetIconCircle, { backgroundColor: "#25D366" }]}>
              <Text style={{ fontSize: 14 }}>💬</Text>
            </View>
            <Text style={styles.shareSheetItemLabel}>WhatsApp</Text>
          </View>
          <View style={styles.shareSheetItem}>
            <View style={[styles.shareSheetIconCircle, { backgroundColor: "#1877F2" }]}>
              <Text style={{ fontSize: 14 }}>📘</Text>
            </View>
            <Text style={styles.shareSheetItemLabel}>Facebook</Text>
          </View>
          <View style={styles.shareSheetItem}>
            <View style={[styles.shareSheetIconCircle, { backgroundColor: "rgba(255,255,255,0.1)" }]}>
              <Text style={{ fontSize: 12, color: "#fff" }}>•••</Text>
            </View>
            <Text style={styles.shareSheetItemLabel}>More</Text>
          </View>
        </View>
      </View>
      <View style={[styles.calloutRow, { justifyContent: "flex-start", paddingLeft: 12 }]}>
        <Text style={[styles.calloutText, { fontSize: 11 }]}>↑ Tap Copy link</Text>
      </View>
    </PhoneFrame>
  );
}

function Step4Screen() {
  return (
    <PhoneFrame>
      <View style={styles.tpHeader}>
        <Text style={{ fontSize: 12 }}>🎵</Text>
        <Text style={styles.tpHeaderTitle}>Transpose</Text>
      </View>
      <Text style={styles.tpInputLabel}>YOUTUBE LINK</Text>
      <View style={styles.tpInputRow}>
        <View style={[styles.tpInput, styles.tpInputActive]}>
          <Text style={styles.tpInputText} numberOfLines={1}>youtube.com/watch?v=…</Text>
        </View>
        <View style={styles.tpPlayBtn}>
          <Text style={{ fontSize: 11, color: "#fff" }}>▶</Text>
        </View>
      </View>
      <Text style={styles.tpHint}>Tap & hold the box → Paste</Text>
    </PhoneFrame>
  );
}

const STEPS = [
  {
    number: 1,
    title: "Open YouTube & find your song",
    description: "Search for any song you want to practice in the YouTube app.",
    Screen: Step1Screen,
  },
  {
    number: 2,
    title: 'Tap the "Share" button',
    description: "While the video is open, tap the Share button (the arrow icon) below the video player.",
    Screen: Step2Screen,
  },
  {
    number: 3,
    title: 'Tap "Copy link"',
    description: `A share sheet will appear. Tap "Copy link" to copy the song's URL to your clipboard.`,
    Screen: Step3Screen,
  },
  {
    number: 4,
    title: "Paste the link into Transpose",
    description: "Switch back to Transpose, tap the URL box, paste the link, then tap the play button.",
    Screen: Step4Screen,
  },
];

export default function HelpModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modal, { paddingTop: insets.top || 20 }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>How to get a YouTube link</Text>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.modalContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {STEPS.map(({ number, title, description, Screen }) => (
            <View key={number} style={styles.stepCard}>
              <View style={styles.stepNumRow}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{number}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepTitle}>{title}</Text>
                  <Text style={styles.stepDesc}>{description}</Text>
                </View>
              </View>
              <View style={styles.stepIllustration}>
                <Screen />
              </View>
            </View>
          ))}

          <View style={styles.doneTip}>
            <Text style={styles.doneTipIcon}>✅</Text>
            <Text style={styles.doneTipText}>
              That's it! The song will load and you can shift the key and speed using the controls panel.
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
