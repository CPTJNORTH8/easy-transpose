import { Router } from "express";
import { spawn, execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";

const execFileAsync = promisify(execFile);

const YTDLP = "/home/runner/workspace/.pythonlibs/bin/yt-dlp";
const PYTHON = "/home/runner/workspace/.pythonlibs/bin/python3";
// Use process.cwd() so this works in both dev (tsx) and production (bundled CJS)
const DETECT_KEY_SCRIPT = path.resolve(process.cwd(), "artifacts/api-server/scripts/detect_key.py");

const router: Router = Router();

let cookieFilePath: string | null = null;

function ensureCookieFile(): string | null {
  const raw = process.env.YOUTUBE_COOKIES;
  if (!raw) return null;
  if (!cookieFilePath) {
    cookieFilePath = path.join(os.tmpdir(), "yt_cookies.txt");
  }
  try {
    fs.writeFileSync(cookieFilePath, raw, "utf8");
    return cookieFilePath;
  } catch {
    return null;
  }
}

function ytdlpArgs(extraArgs: string[]): string[] {
  const cookiePath = ensureCookieFile();
  const base: string[] = [];
  if (cookiePath) base.push("--cookies", cookiePath);
  return [...base, ...extraArgs];
}

function buildAtempoChain(speed: number): string {
  const filters: string[] = [];
  let remaining = speed;
  while (remaining > 2.0) { filters.push("atempo=2.0"); remaining /= 2.0; }
  while (remaining < 0.5) { filters.push("atempo=0.5"); remaining /= 0.5; }
  filters.push(`atempo=${remaining.toFixed(4)}`);
  return filters.join(",");
}

// Cache resolved audio URLs so yt-dlp only runs once per YouTube URL.
// YouTube signed URLs are valid for ~6 hours; we use a 4-hour TTL to be safe.
const audioUrlCache = new Map<string, { resolved: string; cachedAt: number }>();
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

async function resolveAudioUrl(url: string, directUrl?: string): Promise<string> {
  if (directUrl) return directUrl;

  // Return cached URL if still fresh — avoids re-running yt-dlp on every pitch change
  const cached = audioUrlCache.get(url);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    console.log(`[yt-dlp] cache hit for ${url}`);
    return cached.resolved;
  }

  // Try multiple player clients in order of reliability
  // android_embedded uses ANDROID_VR client which bypasses bot detection
  const clients = ["android_embedded", "web_embedded", "web"];
  let lastErr: unknown;
  for (const client of clients) {
    try {
      const { stdout } = await execFileAsync(YTDLP, ytdlpArgs([
        "-f", "bestaudio", "-g", "--no-playlist",
        "--extractor-args", `youtube:player_client=${client}`,
        url,
      ]), { timeout: 20000 });
      const resolved = stdout.trim().split("\n")[0];
      if (resolved) {
        console.log(`[yt-dlp] resolved via client=${client}, caching result`);
        audioUrlCache.set(url, { resolved, cachedAt: Date.now() });
        return resolved;
      }
    } catch (err) {
      console.warn(`[yt-dlp] client=${client} failed:`, (err as any)?.stderr?.slice(0, 200) || (err as any)?.message);
      lastErr = err;
    }
  }
  throw lastErr;
}

router.get("/audio/key", async (req, res) => {
  const { url, directUrl } = req.query;
  if (!directUrl && !url) {
    res.status(400).json({ error: "url or directUrl is required" });
    return;
  }

  try {
    const audioUrl = await resolveAudioUrl(
      url as string,
      directUrl as string | undefined
    );
    if (!audioUrl) { res.status(404).json({ error: "No audio found" }); return; }

    const ffmpeg = spawn("ffmpeg", [
      "-reconnect", "1", "-reconnect_streamed", "1",
      "-i", audioUrl,
      "-t", "30", "-vn", "-ac", "1", "-ar", "22050", "-f", "f32le", "pipe:1",
    ]);
    const python = spawn(PYTHON, [DETECT_KEY_SCRIPT, "22050"]);
    ffmpeg.stdout.pipe(python.stdin);
    let result = "";
    python.stdout.on("data", (d) => { result += d.toString(); });
    ffmpeg.stderr.on("data", () => {});
    python.stderr.on("data", (d) => console.error("[detect_key]", d.toString().slice(0, 200)));
    python.on("close", () => {
      const parts = result.trim().split(" ");
      res.json({ key: parts[0] || "?", mode: parts[1] || "major" });
    });
    ffmpeg.on("error", (err) => { if (!res.headersSent) res.status(500).json({ error: err.message }); });
  } catch (err: any) {
    console.error("[audio/key]", err?.message);
    if (!res.headersSent) res.status(500).json({ error: "Key detection failed" });
  }
});

router.get("/audio/info", async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "url is required" });
    return;
  }
  try {
    const { stdout } = await execFileAsync(YTDLP, ytdlpArgs([
      "--no-playlist", "--print", "%(title)s\n%(duration)s\n%(thumbnail)s", url,
    ]), { timeout: 15000 });
    const [title, duration, thumbnail] = stdout.trim().split("\n");
    res.json({ title, duration: parseInt(duration) || 0, thumbnail });
  } catch (err) {
    console.error("[audio/info]", err);
    res.status(500).json({ error: "Could not fetch video info" });
  }
});

router.get("/audio/stream", async (req, res) => {
  const { url, directUrl, semitones = "0", seek = "0" } = req.query;

  if (!directUrl && !url) {
    res.status(400).json({ error: "url or directUrl is required" });
    return;
  }

  const semitonesNum = parseFloat(semitones as string) || 0;
  const seekSecs = Math.max(0, parseFloat(seek as string) || 0);

  try {
    const audioUrl = await resolveAudioUrl(
      url as string,
      directUrl as string | undefined
    );
    if (!audioUrl) { res.status(404).json({ error: "No audio found" }); return; }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Access-Control-Allow-Origin", "*");

    // Fast seek before -i avoids decoding every frame up to the position.
    const ffmpegArgs: string[] = [
      "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5",
    ];
    if (seekSecs > 0.5) ffmpegArgs.push("-ss", seekSecs.toFixed(2));
    ffmpegArgs.push("-i", audioUrl, "-vn");

    // Skip all processing when no pitch shift is needed.
    // Speed is handled client-side via setRateAsync (instant, no server needed).
    if (Math.abs(semitonesNum) >= 0.01) {
      const pitchRatio = Math.pow(2, semitonesNum / 12);
      const correctedRate = 1 / pitchRatio;
      // asetrate shifts pitch by changing the declared sample rate (tape-deck technique).
      // This starts almost instantly — no FFT windows or frame analysis required.
      // atempo then corrects the playback speed back to 1× so only pitch changes.
      // Normalise to 44100 first so the rate maths are predictable.
      const shiftedRate = Math.round(44100 * pitchRatio);
      const atempoFilter = buildAtempoChain(correctedRate);
      ffmpegArgs.push("-af", `aresample=44100,asetrate=${shiftedRate},${atempoFilter},aresample=44100`);
    }

    ffmpegArgs.push("-f", "mp3", "-q:a", "4", "pipe:1");

    const ffmpeg = spawn("ffmpeg", ffmpegArgs);

    ffmpeg.stdout.pipe(res);
    ffmpeg.stderr.on("data", (d) => {
      const msg = d.toString();
      if (!msg.includes("size=") && !msg.includes("time=")) console.error("[ffmpeg]", msg.slice(0, 200));
    });
    ffmpeg.on("close", (code) => {
      if (code !== 0) console.error(`[ffmpeg] exited with code ${code}`);
      if (!res.writableEnded) res.end();
    });
    req.on("close", () => { ffmpeg.kill("SIGTERM"); });

  } catch (err: any) {
    console.error("[audio/stream]", err?.message || err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to stream audio" });
  }
});

export default router;
