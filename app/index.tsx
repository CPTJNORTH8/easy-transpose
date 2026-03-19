import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated as RNAnimated,
  Dimensions,
  Keyboard,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { Audio, AVPlaybackStatus } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WebView } from "react-native-webview";
import Colors from "@/constants/colors";
import HelpModal from "@/components/HelpModal";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const C = Colors.light;
const PANEL_COLLAPSED = SCREEN_HEIGHT - 220;
const PANEL_EXPANDED = SCREEN_HEIGHT * 0.44;
const STORAGE_KEY = "@transpose_songs_v1";

const API_BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`;

type InfoState = { title: string } | null;
type KeyState = { key: string; mode: string } | null;
type PlayerState = "idle" | "loading" | "playing" | "paused" | "error";

type SavedSong = {
  url: string;
  title: string;
  key?: string;
  mode?: string;
  savedAt: number;
};

function extractYouTubeVideoId(rawUrl: string): string | null {
  try {
    const u = rawUrl.trim();
    // youtu.be/ID
    const short = u.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (short) return short[1];
    // /shorts/ID or /embed/ID
    const pathSeg = u.match(/\/(?:shorts|embed)\/([a-zA-Z0-9_-]{11})/);
    if (pathSeg) return pathSeg[1];
    // ?v=ID or &v=ID
    const param = u.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (param) return param[1];
    // bare 11-char video ID (e.g. the user just pasted the ID)
    const bare = u.match(/^([a-zA-Z0-9_-]{11})(?:[?&]|$)/);
    if (bare) return bare[1];
  } catch {}
  return null;
}

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES  = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

function transposeKey(key: string, mode: string, semitones: number): string {
  const names = semitones >= 0 ? SHARP_NAMES : FLAT_NAMES;
  const idx = SHARP_NAMES.indexOf(key);
  if (idx === -1) return key;
  const newIdx = ((idx + semitones) % 12 + 12) % 12;
  return `${names[newIdx]}${mode === "minor" ? "m" : ""}`;
}

function formatKey(key: string, mode: string): string {
  return `${key}${mode === "minor" ? "m" : ""}`;
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function AdjustButton({
  label, onPress, color, bg, border, disabled,
}: {
  label: string; onPress: () => void; color: string;
  bg: string; border: string; disabled?: boolean;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const handlePress = () => {
    if (disabled) return;
    scale.value = withSpring(0.85, { damping: 15, stiffness: 400 }, () => { scale.value = withSpring(1); });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };
  return (
    <Pressable onPress={handlePress} disabled={disabled}>
      <Animated.View style={[styles.adjustBtn, { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.4 : 1 }, animStyle]}>
        <Text style={[styles.adjustBtnText, { color }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

export default function TransposeScreen() {
  const insets = useSafeAreaInsets();

  const [url, setUrl] = useState("");
  const [semitones, setSemitones] = useState(0);
  const [speed, setSpeed] = useState(1.0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [playerState, setPlayerState] = useState<PlayerState>("idle");
  const [info, setInfo] = useState<InfoState>(null);
  const [detectedKey, setDetectedKey] = useState<KeyState>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [savedSongs, setSavedSongs] = useState<SavedSong[]>([]);
  const [showHelp, setShowHelp] = useState(false);

  const soundRef = useRef<Audio.Sound | null>(null);
  const progressTrackWidth = useRef(0);
  const panelY = useRef(new RNAnimated.Value(PANEL_COLLAPSED)).current;
  const isPlaying = playerState === "playing";
  const hasAudio = playerState !== "idle";
  const isSaved = savedSongs.some(s => s.url === url);

  const directAudioUrlRef = useRef<string | null>(null);
  const currentYTUrlRef = useRef<string | null>(null);
  const pendingReloadRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speedRef = useRef(1.0);
  const [webViewRequest, setWebViewRequest] = useState<{ url: string; id: number } | null>(null);
  const webViewResolveRef = useRef<((r: { audioUrl: string; title: string; duration: number }) => void) | null>(null);
  const webViewRejectRef = useRef<((e: Error) => void) | null>(null);
  const webViewRequestId = useRef(0);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: false,
    });
    loadSavedSongs();
    return () => { stopAndUnload(); };
  }, []);

  // ── Library persistence ───────────────────────────────────────────────────
  const loadSavedSongs = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) setSavedSongs(JSON.parse(raw));
    } catch {}
  }, []);

  const persistSongs = useCallback(async (songs: SavedSong[]) => {
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(songs)); } catch {}
  }, []);

  const saveSong = useCallback(() => {
    if (!info || !url) return;
    const song: SavedSong = {
      url,
      title: info.title,
      key: detectedKey?.key,
      mode: detectedKey?.mode,
      savedAt: Date.now(),
    };
    const next = [song, ...savedSongs.filter(s => s.url !== url)];
    setSavedSongs(next);
    persistSongs(next);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [url, info, detectedKey, savedSongs, persistSongs]);

  const unsaveSong = useCallback((targetUrl: string) => {
    const next = savedSongs.filter(s => s.url !== targetUrl);
    setSavedSongs(next);
    persistSongs(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [savedSongs, persistSongs]);

  // ── Audio engine ──────────────────────────────────────────────────────────
  const stopAndUnload = useCallback(async () => {
    if (soundRef.current) {
      try { await soundRef.current.stopAsync(); await soundRef.current.unloadAsync(); } catch {}
      soundRef.current = null;
    }
  }, []);

  const buildStreamUrl = useCallback((directUrl: string | null, semi: number, seek = 0) => {
    const params = new URLSearchParams({ semitones: semi.toString() });
    if (directUrl) params.set("directUrl", directUrl);
    else params.set("url", currentYTUrlRef.current || "");
    if (seek > 0.5) params.set("seek", seek.toFixed(2));
    return `${API_BASE}/audio/stream?${params}`;
  }, []);

  const fetchAudioUrlViaWebView = useCallback((youtubeUrl: string): Promise<{ audioUrl: string; title: string; duration: number }> => {
    return new Promise((resolve, reject) => {
      const videoId = extractYouTubeVideoId(youtubeUrl);
      if (!videoId) {
        reject(new Error("Could not find a YouTube video ID in that link"));
        return;
      }
      // Use the embed URL — it never requires sign-in or consent pages
      const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&origin=https://www.youtube.com`;
      webViewRequestId.current += 1;
      const id = webViewRequestId.current;
      // Set up resolve/reject wrappers that clear the timeout — set BEFORE state update
      const timer = setTimeout(() => {
        if (webViewRequestId.current === id) {
          webViewResolveRef.current = null;
          webViewRejectRef.current = null;
          setWebViewRequest(null);
          reject(new Error("Timed out — YouTube took too long to respond"));
        }
      }, 8000);
      webViewResolveRef.current = (r) => { clearTimeout(timer); resolve(r); };
      webViewRejectRef.current = (e) => { clearTimeout(timer); reject(e); };
      setWebViewRequest({ url: embedUrl, id });
    });
  }, []);

  const loadAndPlay = useCallback(async (u: string, semi: number, spd: number, reuseUrl?: boolean, startPosition = 0) => {
    speedRef.current = spd;
    await stopAndUnload();
    setPlayerState("loading");
    setError(null);
    if (!startPosition) { setPosition(0); setDuration(0); }
    setDetectedKey(null);

    try {
      let directAudioUrl = directAudioUrlRef.current;
      const isSameVideo = currentYTUrlRef.current === u;

      // Only re-extract the audio URL when loading a brand-new song.
      // For pitch/speed changes (reuseUrl=true, same video), skip WebView/yt-dlp entirely —
      // directAudioUrl may be null here (server-fallback path) and that's fine; the server
      // has the URL cached and will serve it instantly without running yt-dlp again.
      if (!reuseUrl || !isSameVideo) {
        currentYTUrlRef.current = u;
        directAudioUrlRef.current = null;

        // Try WebView first (phone IP → no bot detection)
        let webViewResult: { audioUrl: string; title: string; duration: number } | null = null;
        try {
          webViewResult = await fetchAudioUrlViaWebView(u);
        } catch (webViewErr) {
          console.warn("[loadAndPlay] WebView extraction failed:", (webViewErr as any)?.message, "→ falling back to server yt-dlp");
        }

        if (webViewResult) {
          directAudioUrl = webViewResult.audioUrl;
          directAudioUrlRef.current = directAudioUrl;
          setInfo({ title: webViewResult.title || "" });
          if (webViewResult.duration > 0) setDuration(webViewResult.duration);
          // Key detection using direct URL
          fetch(`${API_BASE}/audio/key?${new URLSearchParams({ directUrl: directAudioUrl })}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data?.key) setDetectedKey({ key: data.key, mode: data.mode }); })
            .catch(() => {});
        } else {
          // Fallback: let the server use yt-dlp (tv_embedded / web_embedded clients)
          directAudioUrl = null;
          directAudioUrlRef.current = null;
          // Set placeholder so the Now Playing / save button section appears
          setInfo({ title: "" });
          // Try to get real title from server (best effort)
          fetch(`${API_BASE}/audio/info?${new URLSearchParams({ url: u })}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
              if (data?.title) setInfo({ title: data.title });
              if (data?.duration > 0) setDuration(data.duration);
            })
            .catch(() => {});
          // Key detection via server yt-dlp
          fetch(`${API_BASE}/audio/key?${new URLSearchParams({ url: u })}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data?.key) setDetectedKey({ key: data.key, mode: data.mode }); })
            .catch(() => {});
        }
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: buildStreamUrl(directAudioUrl, semi, startPosition) },
        { shouldPlay: true, progressUpdateIntervalMillis: 1000 },
        (s: AVPlaybackStatus) => {
          if (!s.isLoaded) return;
          setPosition(s.positionMillis / 1000);
          if (s.durationMillis) setDuration(s.durationMillis / 1000);
          if (s.didJustFinish) setPlayerState("paused");
        }
      );
      soundRef.current = sound;
      // Apply speed client-side — instant, no server processing needed.
      if (spd !== 1.0) {
        try { await sound.setRateAsync(spd, true); } catch {}
      }
      setPlayerState("playing");
      setPanelOpen(true);
      RNAnimated.spring(panelY, { toValue: PANEL_EXPANDED, useNativeDriver: false, damping: 20, stiffness: 180 }).start();
    } catch (err: any) {
      console.error("[loadAndPlay] error:", err?.message, err);
      setError(err?.message || "Could not load audio. Check the URL and try again.");
      setPlayerState("error");
    }
  }, [stopAndUnload, buildStreamUrl, fetchAudioUrlViaWebView, panelY]);

  const togglePlay = useCallback(async () => {
    if (!soundRef.current) return;
    try {
      if (isPlaying) { await soundRef.current.pauseAsync(); setPlayerState("paused"); }
      else { await soundRef.current.playAsync(); setPlayerState("playing"); }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
  }, [isPlaying]);

  const handleSubmitUrl = useCallback(() => {
    const trimmed = url.trim();
    if (!trimmed) return;
    Keyboard.dismiss();
    loadAndPlay(trimmed, semitones, speed);
  }, [url, semitones, speed, loadAndPlay]);

  const loadSavedSong = useCallback((song: SavedSong) => {
    setUrl(song.url);
    setSemitones(0);
    setSpeed(1.0);
    loadAndPlay(song.url, 0, 1.0);
  }, [loadAndPlay]);

  const seekTo = useCallback((locationX: number) => {
    if (!soundRef.current || duration <= 0 || progressTrackWidth.current <= 0) return;
    const pct = Math.max(0, Math.min(1, locationX / progressTrackWidth.current));
    soundRef.current.setPositionAsync(pct * duration * 1000);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [duration]);

  const currentSongIndex = savedSongs.findIndex(s => s.url === url);

  const playPrevSong = useCallback(() => {
    if (savedSongs.length === 0) return;
    const prevIndex = currentSongIndex <= 0 ? savedSongs.length - 1 : currentSongIndex - 1;
    loadSavedSong(savedSongs[prevIndex]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [savedSongs, currentSongIndex, loadSavedSong]);

  const playNextSong = useCallback(() => {
    if (savedSongs.length === 0) return;
    const nextIndex = currentSongIndex < 0 || currentSongIndex >= savedSongs.length - 1 ? 0 : currentSongIndex + 1;
    loadSavedSong(savedSongs[nextIndex]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [savedSongs, currentSongIndex, loadSavedSong]);

  const reloadWithNewSettings = useCallback((newSemi: number, newSpeed: number) => {
    const trimmed = url.trim();
    if (!trimmed || !hasAudio) return;
    // Cancel any pending reload so rapid button presses merge into one request
    if (pendingReloadRef.current) clearTimeout(pendingReloadRef.current);
    // Capture position now (before audio stops) so we can resume from the same spot
    const capturedPosition = position;
    pendingReloadRef.current = setTimeout(() => {
      pendingReloadRef.current = null;
      loadAndPlay(trimmed, newSemi, newSpeed, true, capturedPosition);
    }, 150);
  }, [url, hasAudio, position, loadAndPlay]);

  const adjustSemitones = useCallback((delta: number) => {
    const next = Math.max(-12, Math.min(12, semitones + delta));
    setSemitones(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    reloadWithNewSettings(next, speed);
  }, [semitones, speed, reloadWithNewSettings]);

  const adjustSpeed = useCallback((delta: number) => {
    const next = Math.round(Math.max(0.25, Math.min(2.0, speed + delta)) * 100) / 100;
    setSpeed(next);
    speedRef.current = next;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Apply speed instantly on the existing sound — no server round-trip needed.
    if (soundRef.current) {
      soundRef.current.setRateAsync(next, true).catch(() => {});
    }
  }, [speed]);

  const resetAll = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Reset speed instantly on the existing sound
    if (speed !== 1.0) {
      setSpeed(1.0);
      speedRef.current = 1.0;
      if (soundRef.current) soundRef.current.setRateAsync(1.0, true).catch(() => {});
    }
    // Reset pitch (needs server reload only if it was non-zero)
    if (semitones !== 0) {
      setSemitones(0);
      reloadWithNewSettings(0, 1.0);
    }
  }, [semitones, speed, reloadWithNewSettings]);

  const stopAll = useCallback(() => {
    stopAndUnload();
    setPlayerState("idle"); setInfo(null); setDetectedKey(null);
    setPosition(0); setDuration(0); setSemitones(0); setSpeed(1.0);
    setPanelOpen(false); panelY.setValue(PANEL_COLLAPSED);
    directAudioUrlRef.current = null; currentYTUrlRef.current = null;
    setWebViewRequest(null);
  }, [stopAndUnload, panelY]);

  const togglePanel = useCallback(() => {
    const toValue = panelOpen ? PANEL_COLLAPSED : PANEL_EXPANDED;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    RNAnimated.spring(panelY, { toValue, useNativeDriver: false, damping: 20, stiffness: 180 }).start();
    setPanelOpen(!panelOpen);
  }, [panelOpen, panelY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 5,
      onPanResponderGrant: () => { (panelY as any).stopAnimation(); },
      onPanResponderMove: (_, g) => {
        const base = panelOpen ? PANEL_EXPANDED : PANEL_COLLAPSED;
        panelY.setValue(Math.max(PANEL_EXPANDED, Math.min(PANEL_COLLAPSED, base + g.dy)));
      },
      onPanResponderRelease: (_, g) => {
        const base = panelOpen ? PANEL_EXPANDED : PANEL_COLLAPSED;
        const dest = base + g.dy < (PANEL_EXPANDED + PANEL_COLLAPSED) / 2 ? PANEL_EXPANDED : PANEL_COLLAPSED;
        setPanelOpen(dest === PANEL_EXPANDED);
        if (dest === PANEL_EXPANDED !== panelOpen) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        RNAnimated.spring(panelY, { toValue: dest, useNativeDriver: false, damping: 20, stiffness: 200 }).start();
      },
    })
  ).current;

  const semiLabel = semitones === 0 ? "0" : semitones > 0 ? `+${semitones}` : `${semitones}`;
  const hasChanged = semitones !== 0 || speed !== 1.0;
  const progressPct = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* ── HEADER ──────────────────────────────── */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}>🎵</Text>
        <Text style={styles.headerTitle}>Easy Transpose</Text>
        <Pressable onPress={() => setShowHelp(true)} style={styles.helpBtn} hitSlop={12}>
          <Text style={styles.helpBtnText}>How to get songs</Text>
        </Pressable>
      </View>

      <HelpModal visible={showHelp} onClose={() => setShowHelp(false)} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* ── URL INPUT ───────────────────────────── */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>YOUTUBE LINK</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Paste a YouTube URL…"
              placeholderTextColor={C.textTertiary}
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              onSubmitEditing={handleSubmitUrl}
              selectionColor={C.tint}
            />
            <Pressable onPress={handleSubmitUrl} style={[styles.goBtn, { opacity: url.trim() ? 1 : 0.4 }]} disabled={!url.trim()}>
              {playerState === "loading"
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.goBtnIcon}>▶</Text>}
            </Pressable>
          </View>
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>

        {/* ── NOW PLAYING ─────────────────────────── */}
        {info && (
          <View style={styles.nowPlaying}>
            <View style={{ flex: 1, gap: 8 }}>
              <View style={styles.nowPlayingTitleRow}>
                <Text style={styles.nowPlayingTitle} numberOfLines={2}>{info.title}</Text>
              </View>
              {detectedKey ? (
                <View style={styles.keyRow}>
                  <View style={styles.keyBadge}>
                    <Text style={styles.keyBadgeText}>{formatKey(detectedKey.key, detectedKey.mode)}</Text>
                  </View>
                  {semitones !== 0 && (
                    <>
                      <Text style={styles.keyArrow}>→</Text>
                      <View style={[styles.keyBadge, styles.keyBadgeActive]}>
                        <Text style={[styles.keyBadgeText, { color: C.tint }]}>
                          {transposeKey(detectedKey.key, detectedKey.mode, semitones)}
                        </Text>
                      </View>
                      <Text style={styles.keyDelta}>
                        {semitones > 0 ? `+${semitones}` : semitones} semitone{Math.abs(semitones) !== 1 ? "s" : ""}
                      </Text>
                    </>
                  )}
                </View>
              ) : (
                <View style={styles.keyRow}>
                  <ActivityIndicator size="small" color={C.textSecondary} style={{ transform: [{ scale: 0.7 }] }} />
                  <Text style={styles.keyDetecting}>Detecting key…</Text>
                </View>
              )}

              {/* Save button */}
              <Pressable
                onPress={isSaved ? () => unsaveSong(url) : saveSong}
                style={[styles.saveSongBtn, isSaved && styles.saveSongBtnSaved]}
              >
                <Text style={[styles.saveSongBtnIcon, isSaved && { color: C.tint }]}>
                  {isSaved ? "🔖" : "＋🔖"}
                </Text>
                <Text style={[styles.saveSongBtnText, isSaved && { color: C.tint }]}>
                  {isSaved ? "Saved to library" : "Save song"}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── SAVED SONGS ─────────────────────────── */}
        {savedSongs.length > 0 && (
          <View style={styles.librarySection}>
            <Text style={styles.libraryLabel}>SAVED SONGS</Text>
            {savedSongs.map(song => (
              <Pressable key={song.url} onPress={() => loadSavedSong(song)} style={styles.savedSongRow}>
                <View style={styles.savedSongIcon}>
                  <Text style={styles.savedSongIconEmoji}>🎵</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.savedSongTitle} numberOfLines={1}>{song.title}</Text>
                  {song.key && (
                    <Text style={styles.savedSongKey}>{formatKey(song.key, song.mode ?? "major")}</Text>
                  )}
                </View>
                <Pressable onPress={() => unsaveSong(song.url)} hitSlop={10}>
                  <Text style={styles.removeSongBtn}>✕</Text>
                </Pressable>
              </Pressable>
            ))}
          </View>
        )}

        {/* ── TIPS (when idle and no saved songs) ─── */}
        {playerState === "idle" && savedSongs.length === 0 && (
          <View style={styles.tips}>
            {[
              { icon: "🎼", text: "Real pitch shift — key changes independently of speed" },
              { icon: "⚡", text: "Adjust playback speed without affecting the key" },
              { icon: "🔖", text: "Save songs to your library to load them instantly" },
            ].map((t, i) => (
              <View key={i} style={styles.tipRow}>
                <Text style={styles.tipIcon}>{t.icon}</Text>
                <Text style={styles.tipText}>{t.text}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 240 }} />
      </ScrollView>

      {/* ── CONTROLS PANEL ──────────────────────── */}
      {hasAudio && (
        <RNAnimated.View style={[styles.panel, { top: panelY, paddingBottom: insets.bottom + 8 }]}>

          <View {...panResponder.panHandlers} style={styles.dragArea}>
            <View style={styles.handle} />
            <View style={styles.panelTopRow}>
              <View style={styles.panelTitleRow}>
                <Text style={styles.panelTitleIcon}>🎵</Text>
                <Text style={styles.panelTitle}>Controls</Text>
                {hasChanged && <View style={styles.activeDot} />}
              </View>
              <View style={styles.panelTopRight}>
                {hasChanged && (
                  <Pressable onPress={resetAll} style={styles.resetBtn} hitSlop={8}>
                    <Text style={styles.resetBtnText}>Reset</Text>
                  </Pressable>
                )}
                <Pressable onPress={stopAll} style={styles.iconBtn} hitSlop={8}>
                  <Text style={styles.iconBtnText}>✕</Text>
                </Pressable>
                <Pressable onPress={togglePanel} style={styles.iconBtn} hitSlop={12}>
                  <Text style={styles.iconBtnText}>{panelOpen ? "∨" : "∧"}</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* Playback controls */}
          <View style={styles.playbackBar}>
            {/* Prev / Play / Next row */}
            <View style={styles.transportRow}>
              <Pressable
                onPress={playPrevSong}
                style={[styles.skipBtn, savedSongs.length < 2 && { opacity: 0.3 }]}
                disabled={savedSongs.length < 2}
                hitSlop={12}
              >
                <Text style={styles.skipBtnText}>⏮</Text>
              </Pressable>

              <Pressable onPress={togglePlay} style={styles.playBtn}>
                {playerState === "loading"
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.playBtnText}>{isPlaying ? "⏸" : "▶"}</Text>}
              </Pressable>

              <Pressable
                onPress={playNextSong}
                style={[styles.skipBtn, savedSongs.length < 2 && { opacity: 0.3 }]}
                disabled={savedSongs.length < 2}
                hitSlop={12}
              >
                <Text style={styles.skipBtnText}>⏭</Text>
              </Pressable>
            </View>

            {/* Seekable progress bar */}
            <View style={styles.progressArea}>
              <Pressable
                onLayout={e => { progressTrackWidth.current = e.nativeEvent.layout.width; }}
                onPress={e => seekTo(e.nativeEvent.locationX)}
                style={styles.progressTrack}
                hitSlop={{ top: 10, bottom: 10 }}
              >
                <View style={[styles.progressFill, { width: `${progressPct * 100}%` as any }]} />
                {duration > 0 && (
                  <View style={[styles.progressThumb, { left: `${progressPct * 100}%` as any }]} />
                )}
              </Pressable>
              <View style={styles.progressTimes}>
                <Text style={styles.timeText}>{formatTime(position)}</Text>
                {duration > 0 && <Text style={styles.timeText}>{formatTime(duration)}</Text>}
              </View>
            </View>

            {/* Status pill */}
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{semiLabel} st</Text>
              <Text style={[styles.statusPillText, { color: C.accentSecondary }]}> · {speed.toFixed(2)}×</Text>
            </View>
          </View>

          {/* Pitch */}
          <View style={styles.controlSection}>
            <Text style={styles.sectionLabel}>PITCH (semitones)</Text>
            <View style={styles.btnRow}>
              {([-2, -1] as number[]).map(d => (
                <AdjustButton key={d} label={`${d}`} onPress={() => adjustSemitones(d)}
                  color={C.tint} bg={C.accentDim} border="rgba(61,142,255,0.2)" disabled={playerState === "loading"} />
              ))}
              <View style={styles.bigDisplay}>
                <Text style={styles.bigValue}>{semiLabel}</Text>
              </View>
              {([1, 2] as number[]).map(d => (
                <AdjustButton key={d} label={`+${d}`} onPress={() => adjustSemitones(d)}
                  color={C.tint} bg={C.accentDim} border="rgba(61,142,255,0.2)" disabled={playerState === "loading"} />
              ))}
            </View>
          </View>

          <View style={styles.divider} />

          {/* Speed */}
          <View style={styles.controlSection}>
            <Text style={[styles.sectionLabel, { color: C.accentSecondary }]}>SPEED</Text>
            <View style={styles.btnRow}>
              {([-0.25, -0.1] as number[]).map(d => (
                <AdjustButton key={d} label={d.toFixed(2)} onPress={() => adjustSpeed(d)}
                  color={C.accentSecondary} bg="rgba(0,200,160,0.1)" border="rgba(0,200,160,0.2)" disabled={playerState === "loading"} />
              ))}
              <View style={styles.bigDisplay}>
                <Text style={[styles.bigValue, { color: C.accentSecondary }]}>{speed.toFixed(2)}</Text>
              </View>
              {([0.1, 0.25] as number[]).map(d => (
                <AdjustButton key={d} label={`+${d.toFixed(2)}`} onPress={() => adjustSpeed(d)}
                  color={C.accentSecondary} bg="rgba(0,200,160,0.1)" border="rgba(0,200,160,0.2)" disabled={playerState === "loading"} />
              ))}
            </View>
          </View>

        </RNAnimated.View>
      )}

      {/* ── YOUTUBE AUDIO EXTRACTOR WEBVIEW ── */}
      {webViewRequest && (
        <>
          {/* Visible loading banner so the user knows something is happening */}
          <View style={styles.webViewBanner} pointerEvents="none">
            <Text style={styles.webViewBannerText}>🎵 Fetching audio from YouTube…</Text>
          </View>
          {/* Off-screen WebView using embed URL (no sign-in required) */}
          <View style={styles.hiddenWebView} pointerEvents="none">
            <WebView
              key={webViewRequest.id}
              source={{ uri: webViewRequest.url }}
              style={{ width: 375, height: 667 }}
              javaScriptEnabled
              domStorageEnabled
              thirdPartyCookiesEnabled
              sharedCookiesEnabled
              mediaPlaybackRequiresUserAction={false}
              allowsInlineMediaPlayback
              injectedJavaScriptBeforeContentLoaded={`
(function() {
  var done = false;
  window.__rnAudioDone = false;
  function rnPost(d) {
    if (!window.ReactNativeWebView) return;
    if (window.__rnAudioDone && d.type !== 'error') return;
    if (d.type === 'audioReady') window.__rnAudioDone = done = true;
    window.ReactNativeWebView.postMessage(JSON.stringify(d));
  }
  window.__rnAudioPost = rnPost;

  function extractAudio(data) {
    if (done) return false;
    var fmts = (data.streamingData && data.streamingData.adaptiveFormats) || [];
    var audio = fmts.filter(function(f){ return f.mimeType && f.mimeType.startsWith('audio'); });
    audio.sort(function(a,b){ return (b.bitrate||0)-(a.bitrate||0); });
    if (audio.length > 0 && audio[0].url) {
      var title = (data.videoDetails && data.videoDetails.title) || '';
      var dur = parseInt((data.videoDetails && data.videoDetails.lengthSeconds)||'0')||0;
      rnPost({type:'audioReady', url:audio[0].url, title:title, duration:dur});
      return true;
    }
    return false;
  }
  window.__rnExtractAudio = extractAudio;

  // Intercept fetch
  var _fetch = window.fetch;
  window.fetch = function(input, opts) {
    var url = (typeof input === 'string') ? input : (input && input.url ? input.url : '');
    var p = _fetch.call(this, input, opts);
    if (url && url.indexOf('youtubei/v1/player') !== -1) {
      p.then(function(resp) { resp.clone().json().then(extractAudio).catch(function(){}); }).catch(function(){});
    }
    return p;
  };

  // Intercept XHR
  var _open = XMLHttpRequest.prototype.open;
  var _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function(m, url) { this.__url = url; return _open.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function() {
    if (this.__url && String(this.__url).indexOf('youtubei/v1/player') !== -1) {
      var xhr = this; var _ol = xhr.onload;
      xhr.onload = function() { try { extractAudio(JSON.parse(xhr.responseText)); } catch(e) {} if (_ol) _ol.apply(this, arguments); };
    }
    return _send.apply(this, arguments);
  };

  // Fast poll — ytInitialPlayerResponse is injected by an early inline <script>
  // so it often appears within 300-800ms, well before the page "load" event fires.
  var pollCount = 0;
  var poll = setInterval(function() {
    pollCount++;
    if (done) { clearInterval(poll); return; }
    if (window.ytInitialPlayerResponse) {
      clearInterval(poll);
      extractAudio(window.ytInitialPlayerResponse);
      return;
    }
    // Also try yt.playerResponse
    try { if (window.yt && window.yt.playerResponse) { clearInterval(poll); extractAudio(window.yt.playerResponse); return; } } catch(e) {}
    if (pollCount > 120) clearInterval(poll); // stop after 12s
  }, 100);
})();
true;
`}
              injectedJavaScript={`
(function() {
  var post = window.__rnAudioPost;
  var extract = window.__rnExtractAudio;
  if (!post || !extract) return;

  // 1. Try ytInitialPlayerResponse — baked into page HTML by YouTube
  if (window.ytInitialPlayerResponse && extract(window.ytInitialPlayerResponse)) return;

  // 2. Try yt.playerResponse (alternate location)
  try {
    var yt = window.yt;
    if (yt && yt.playerResponse && extract(yt.playerResponse)) return;
  } catch(e) {}

  // 3. Scan all script tags for ytInitialPlayerResponse JSON
  var scripts = document.querySelectorAll('script');
  for (var i = 0; i < scripts.length; i++) {
    var t = scripts[i].textContent || '';
    var idx = t.indexOf('ytInitialPlayerResponse');
    if (idx !== -1) {
      try {
        var json = t.substring(idx + 'ytInitialPlayerResponse'.length).replace(/^\\s*=\\s*/, '');
        // find balanced JSON object
        var depth = 0; var start = json.indexOf('{');
        if (start === -1) continue;
        for (var j = start; j < json.length; j++) {
          if (json[j] === '{') depth++;
          else if (json[j] === '}') { depth--; if (depth === 0) { var obj = JSON.parse(json.substring(start, j+1)); if (extract(obj)) return; break; } }
        }
      } catch(e) {}
    }
  }

  // 4. Autoplay trigger — force the embed player to initialize
  // (fall through: the fetch/XHR intercepts will catch it when the player loads)
  // Set a timeout so user gets meaningful error if nothing worked
  setTimeout(function() {
    if (!window.__rnAudioDone) {
      post({type:'error', reason:'Could not find audio stream in YouTube embed page'});
    }
  }, 10000);
})();
true;
`}
              onMessage={(event) => {
                try {
                  const data = JSON.parse(event.nativeEvent.data);
                  setWebViewRequest(null);
                  if (data.type === "audioReady" && data.url) {
                    const resolve = webViewResolveRef.current;
                    webViewResolveRef.current = null;
                    webViewRejectRef.current = null;
                    resolve?.({ audioUrl: data.url, title: data.title || "", duration: data.duration || 0 });
                  } else {
                    const reject = webViewRejectRef.current;
                    webViewResolveRef.current = null;
                    webViewRejectRef.current = null;
                    reject?.(new Error(data.reason || "Failed to get audio URL from YouTube"));
                  }
                } catch {
                  setWebViewRequest(null);
                  const reject = webViewRejectRef.current;
                  webViewRejectRef.current = null;
                  webViewResolveRef.current = null;
                  reject?.(new Error("Unexpected response from YouTube"));
                }
              }}
              onError={() => {
                setWebViewRequest(null);
                const reject = webViewRejectRef.current;
                webViewRejectRef.current = null;
                webViewResolveRef.current = null;
                reject?.(new Error("Failed to connect to YouTube"));
              }}
            />
          </View>
        </>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.background },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 20 },

  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  headerIcon: { fontSize: 22 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 26, color: C.text, letterSpacing: -0.5, flex: 1 },
  helpBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.surfaceElevated,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  helpBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: C.textSecondary,
  },

  inputSection: { gap: 8, marginBottom: 20 },
  inputLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: C.textSecondary, letterSpacing: 1 },
  inputRow: { flexDirection: "row", gap: 10 },
  input: {
    flex: 1, backgroundColor: C.surface, borderRadius: 14, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 16, paddingVertical: 14, fontFamily: "Inter_400Regular", fontSize: 14, color: C.text,
  },
  goBtn: { width: 52, height: 52, backgroundColor: C.tint, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  goBtnIcon: { fontSize: 20, color: "#fff", lineHeight: 26 },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 13, color: "#FF6B6B" },

  nowPlaying: {
    flexDirection: "row", gap: 10, marginBottom: 24, backgroundColor: C.surface,
    borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14,
  },
  nowPlayingTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  nowPlayingTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: C.text, flex: 1, lineHeight: 20 },
  saveSongBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start",
    backgroundColor: C.surfaceElevated,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  saveSongBtnIcon: { fontSize: 15 },
  saveSongBtnSaved: {
    backgroundColor: C.accentDim,
    borderColor: "rgba(61,142,255,0.25)",
  },
  saveSongBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: C.textSecondary,
  },

  keyArrow: { fontSize: 13, color: C.textSecondary },
  keyRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  keyBadge: {
    backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 6, borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)", paddingHorizontal: 8, paddingVertical: 3,
  },
  keyBadgeActive: { backgroundColor: "rgba(61,142,255,0.15)", borderColor: "rgba(61,142,255,0.3)" },
  keyBadgeText: { fontFamily: "Inter_700Bold", fontSize: 13, color: C.text },
  keyDelta: { fontFamily: "Inter_400Regular", fontSize: 12, color: C.textSecondary },
  keyDetecting: { fontFamily: "Inter_400Regular", fontSize: 12, color: C.textSecondary },

  librarySection: { gap: 8, marginBottom: 24 },
  libraryLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: C.textSecondary, letterSpacing: 1 },
  savedSongRow: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.surface,
    borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12,
  },
  savedSongIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: C.accentDim,
    alignItems: "center", justifyContent: "center",
  },
  savedSongIconEmoji: { fontSize: 16 },
  removeSongBtn: { fontSize: 16, color: C.textSecondary, padding: 2 },
  savedSongTitle: { fontFamily: "Inter_500Medium", fontSize: 14, color: C.text },
  savedSongKey: { fontFamily: "Inter_400Regular", fontSize: 12, color: C.textSecondary, marginTop: 2 },

  tips: { gap: 10 },
  tipRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: C.surface, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 14,
  },
  tipIcon: { fontSize: 18, width: 22, textAlign: "center" },
  tipText: { fontFamily: "Inter_400Regular", fontSize: 13, color: C.textSecondary, flex: 1, lineHeight: 19 },

  panel: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    backgroundColor: C.backgroundSecondary, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    borderTopWidth: 1, borderColor: C.border,
    shadowColor: "#000", shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.7, shadowRadius: 24, elevation: 24,
  },
  dragArea: { paddingTop: 10, paddingHorizontal: 16, paddingBottom: 4 },
  handle: { width: 36, height: 4, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 2, alignSelf: "center", marginBottom: 10 },
  panelTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  panelTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  panelTitle: { fontFamily: "Inter_700Bold", fontSize: 14, color: C.text },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.tint },
  panelTopRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  resetBtn: { backgroundColor: C.surfaceElevated, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  resetBtnText: { fontFamily: "Inter_500Medium", fontSize: 12, color: C.textSecondary },
  iconBtn: { width: 30, height: 30, backgroundColor: C.surfaceElevated, borderRadius: 15, alignItems: "center", justifyContent: "center" },

  playbackBar: { flexDirection: "column", paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10, gap: 12 },
  transportRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 36 },
  skipBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  playBtn: { width: 58, height: 58, backgroundColor: C.tint, borderRadius: 29, alignItems: "center", justifyContent: "center" },
  playBtnText: { fontSize: 24, color: "#fff", lineHeight: 30 },
  skipBtnText: { fontSize: 22, color: C.text },
  iconBtnText: { fontSize: 14, color: C.textSecondary, lineHeight: 18 },
  panelTitleIcon: { fontSize: 14 },
  progressArea: { gap: 6 },
  progressTrack: { height: 6, backgroundColor: C.border, borderRadius: 3, overflow: "visible" },
  progressFill: { position: "absolute", top: 0, left: 0, height: "100%", backgroundColor: C.tint, borderRadius: 3 },
  progressThumb: { position: "absolute", top: -5, width: 16, height: 16, borderRadius: 8, backgroundColor: "#fff", marginLeft: -8, shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },
  progressTimes: { flexDirection: "row", justifyContent: "space-between" },
  timeText: { fontFamily: "Inter_400Regular", fontSize: 11, color: C.textSecondary },
  statusPill: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  statusPillText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: C.tint },

  controlSection: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: C.tint, letterSpacing: 1.2 },
  btnRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  adjustBtn: { borderRadius: 10, width: 52, height: 42, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  adjustBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  bigDisplay: { flex: 1, alignItems: "center", justifyContent: "center", height: 42 },
  bigValue: { fontFamily: "Inter_700Bold", fontSize: 26, color: C.tint },
  divider: { height: 1, backgroundColor: C.border, marginHorizontal: 16 },
  hiddenWebView: { position: "absolute", left: -500, top: -800, width: 375, height: 667 },
  webViewBanner: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(61,142,255,0.15)", borderTopWidth: 1, borderTopColor: "rgba(61,142,255,0.3)", paddingVertical: 8, alignItems: "center", zIndex: 99 },
  webViewBannerText: { color: "#3D8EFF", fontFamily: "Inter_500Medium", fontSize: 13 },
});
