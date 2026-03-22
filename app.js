
const { useEffect, useMemo, useRef, useState } = React;

const AUTH_USERS_KEY = "chance_music_users_v3";
const AUTH_SESSION_KEY = "chance_music_session_v3";
const STORAGE_KEY = "chance_music_data_v2";
const NICK_COOLDOWN = 12 * 60 * 60 * 1000;

const SPOTIFY_SETTINGS_KEY = "chance_music_spotify_settings_v1";
const SPOTIFY_AUTH_KEY = "chance_music_spotify_auth_v1";
const SPOTIFY_VERIFIER_KEY = "chance_music_spotify_verifier_v1";
const SPOTIFY_STATE_KEY = "chance_music_spotify_state_v1";
const SUPABASE_SETTINGS_KEY = "chance_music_supabase_settings_v1";
const SUPABASE_URL = "https://jazijcbkyrnqznqglzjp.supabase.co";
const SPOTIFY_SCOPES = [
  "user-read-private",
  "user-read-email",
  "playlist-read-private",
  "playlist-read-collaborative"
].join(" ");

const SOUNDCLOUD_SETTINGS_KEY = "chance_music_soundcloud_settings_v1";
const SOUNDCLOUD_AUTH_KEY = "chance_music_soundcloud_auth_v1";

const SAMPLE_TRACK = {
  id: "demo-track-1",
  title: "Chance Demo",
  artist: "Chance Music",
  cover: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=900&q=80",
  audio: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  releaseDate: "2026-03-01",
  isUpcoming: false,
  liked: false,
  format: "MP3"
};

const EQ_FREQUENCIES = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
const EQ_PRESET_GAINS = [0, 0, -6, -6, -6, -6, -6, -6, -5, -5];
const SITE_NAME = "Шанс | Music";
const ICONS = {
  play: "./icons/icon_play.svg",
  pause: "./icons/icon_pause.svg",
  prev: "./icons/icon_prev.svg",
  next: "./icons/icon_next.svg",
  volume: "./icons/icon_volume.svg",
  more: "./icons/icon_more.svg",
  likeOutline: "./icons/icon_like_outline.svg",
  likeFilled: "./icons/icon_like_filled.svg",
  likeBroken: "./icons/icon_like_broken.svg"
};
const DEV_USERS = [
  {
    id: "dev_jessew1lliams",
    username: "jessew1lliams",
    handle: "jessew1lliams",
    role: "admin",
    email: "",
    password: "",
    avatar: "https://placehold.co/160x160/000/fff?text=Avatar",
    banner: "https://placehold.co/1280x500/000/fff?text=Banner",
    friends: [],
    nicknameChangedAt: 0,
    nickStyle: { color: "#ffffff", glow: true }
  },
  {
    id: "dev_horonsky",
    username: "HORONSKY",
    handle: "horonsky",
    role: "admin",
    email: "",
    password: "",
    avatar: "https://placehold.co/160x160/000/fff?text=Avatar",
    banner: "https://placehold.co/1280x500/000/fff?text=Banner",
    friends: [],
    nicknameChangedAt: 0,
    nickStyle: { color: "#ffffff", glow: false }
  }
];

const VIEW_TO_ROUTE = {
  home: "main",
  search: "search",
  collection: "connections",
  developers: "developers",
  profile: "profile",
  admin: "admin"
};

const ROUTE_TO_VIEW = {
  main: "home",
  search: "search",
  connections: "collection",
  developers: "developers",
  profile: "profile",
  admin: "admin"
};

function getViewFromHash() {
  const raw = String(window.location.hash || "").replace(/^#\/?/, "").trim().toLowerCase();
  return ROUTE_TO_VIEW[raw] || "home";
}

function parseHashRoute() {
  const raw = String(window.location.hash || "").replace(/^#\/?/, "").trim().toLowerCase();
  const parts = raw.split("/").filter(Boolean);
  const route = parts[0] || "main";
  const view = ROUTE_TO_VIEW[route] || "home";
  const profileSlug = view === "profile" ? normalizeHandle(decodeURIComponent(parts[1] || "")) : "";
  return { view, profileSlug };
}


function formatTime(v) {
  if (!Number.isFinite(v)) return "0:00";
  const m = Math.floor(v / 60);
  const s = Math.floor(v % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function randomString(length = 64) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let r = "";
  for (let i = 0; i < length; i += 1) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

function normalizeUsers(users) {
  const list = Array.isArray(users) ? users : [];
  return list.map((u, i) => ({
    id: u.id || `u_${Date.now()}_${i}`,
    username: (u.username || u.name || "user").trim(),
    handle: normalizeHandle(u.handle || u.tag || u.username || u.name || "user"),
    email: (u.email || "").trim().toLowerCase(),
    password: u.password || "",
    role: isDeveloperAccount(u) ? "admin" : (u.role || "user"),
    avatar: u.avatar || "https://placehold.co/160x160/000/fff?text=Avatar",
    banner: u.banner || "https://placehold.co/1280x500/000/fff?text=Banner",
    friends: Array.isArray(u.friends) ? u.friends : [],
    nicknameChangedAt: Number.isFinite(u.nicknameChangedAt) ? u.nicknameChangedAt : 0,
    nickStyle: {
      color: u.nickStyle?.color || "#ffffff",
      glow: Boolean(u.nickStyle?.glow)
    }
  }));
}

function withDevUsers(users) {
  const normalized = normalizeUsers(users);
  const handles = new Set(normalized.map((u) => normalizeHandle(u.handle || u.username)));
  const merged = [...normalized];
  DEV_USERS.forEach((dev) => {
    if (!handles.has(normalizeHandle(dev.handle))) merged.push(dev);
  });
  return normalizeUsers(merged);
}
function loadUsers() {
  try {
    return withDevUsers(JSON.parse(localStorage.getItem(AUTH_USERS_KEY) || "[]"));
  } catch {
    return withDevUsers([]);
  }
}

function normalizeAppData(raw) {
  const source = raw || {};
  const track = { ...SAMPLE_TRACK };
  return {
    ...source,
    site: { ...(source.site || {}), logo: "./logo/logo2.png" },
    tracks: [track],
    playlists: [{ id: "demo-playlist", name: "Пробный плейлист", cover: track.cover, trackIds: [track.id] }],
    user: { ...(source.user || {}), collectionTrackIds: [track.id] }
  };
}

function detectAudioQuality(track) {
  if (!track) return "UNKNOWN";
  if (track.format) return String(track.format).toUpperCase();
  const m = String(track.audio || "").match(/\.([a-z0-9]+)(?:\?|$)/i);
  return m ? m[1].toUpperCase() : "UNKNOWN";
}


function normalizeHandle(raw) {
  const cleaned = String(raw || "").trim().replace(/^@+/, "").toLowerCase().replace(/[^a-z0-9_\.]/g, "");
  return cleaned;
}

function mergeUsersWithSupabase(localUsers, profiles) {
  const list = Array.isArray(localUsers) ? [...localUsers] : [];
  const byHandle = new Map(list.map((u, idx) => [normalizeHandle(u.handle || u.username), idx]));
  (Array.isArray(profiles) ? profiles : []).forEach((p) => {
    const handle = normalizeHandle(p?.handle || p?.username);
    if (!handle) return;
    const mapped = {
      id: p?.id ? `sb_${String(p.id)}` : `sb_${handle}`,
      username: String(p?.username || handle),
      handle,
      email: "",
      password: "",
      role: p?.role || "user",
      avatar: p?.avatar_url || "https://placehold.co/160x160/000/fff?text=Avatar",
      banner: p?.banner_url || "https://placehold.co/1280x500/000/fff?text=Banner",
      friends: [],
      nicknameChangedAt: 0,
      nickStyle: {
        color: p?.nick_color || "#ffffff",
        glow: Boolean(p?.nick_glow)
      }
    };
    if (byHandle.has(handle)) {
      const idx = byHandle.get(handle);
      const existing = list[idx];
      list[idx] = {
        ...existing,
        username: mapped.username || existing.username,
        handle: mapped.handle || existing.handle,
        role: mapped.role || existing.role,
        avatar: mapped.avatar || existing.avatar,
        banner: mapped.banner || existing.banner,
        nickStyle: mapped.nickStyle || existing.nickStyle
      };
    } else {
      byHandle.set(handle, list.length);
      list.push(mapped);
    }
  });
  return withDevUsers(list);
}

function isJesseAccount(user) {
  const uname = String(user?.username || "").toLowerCase();
  const handle = normalizeHandle(user?.handle);
  return uname === "jessew1lliams" || handle === "jessew1lliams";
}
function isHoronskyAccount(user) {
  const uname = String(user?.username || "").toLowerCase();
  const handle = normalizeHandle(user?.handle);
  return uname === "horonsky" || handle === "horonsky";
}

function isDeveloperAccount(user) {
  return isJesseAccount(user) || isHoronskyAccount(user);
}

function safeSetLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}


function Nick({ user }) {
  return (
    <span
      style={{
        color: user?.nickStyle?.color || "#fff",
        textShadow: user?.nickStyle?.glow ? `0 0 8px ${user?.nickStyle?.color || "#fff"}` : "none",
        fontWeight: 700
      }}
    >
      {user?.username || "Пользователь"}
    </span>
  );
}

function App() {
  const [data, setData] = useState(null);
  const [activeView, setActiveView] = useState(() => parseHashRoute().view);
  const [viewedProfileId, setViewedProfileId] = useState(null);
  const [routeProfileSlug, setRouteProfileSlug] = useState(() => parseHashRoute().profileSlug);
  const [query, setQuery] = useState("");

  const [users, setUsers] = useState(() => loadUsers());
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || "null");
    } catch {
      return null;
    }
  });

  const [authMode, setAuthMode] = useState("login");
  const [loginMethod, setLoginMethod] = useState("username");
  const [authForm, setAuthForm] = useState({ username: "", handle: "", email: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [showAuthDevelopers, setShowAuthDevelopers] = useState(false);

  const [profileError, setProfileError] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [newNick, setNewNick] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [editProfileMode, setEditProfileMode] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  const [currentTrackId, setCurrentTrackId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [playerMenuOpen, setPlayerMenuOpen] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [playerNotice, setPlayerNotice] = useState("");
  const [likeHover, setLikeHover] = useState(false);

  const [eqOpen, setEqOpen] = useState(false);
  const [eqEnabled, setEqEnabled] = useState(true);
  const [eqPreset, setEqPreset] = useState("studio");
  const [eqCustomGains, setEqCustomGains] = useState([...EQ_PRESET_GAINS]);
  const [eqLevelDb, setEqLevelDb] = useState(0);

  const [spotifyClientId, setSpotifyClientId] = useState("");
  const [spotifyRedirectUri, setSpotifyRedirectUri] = useState(`${window.location.origin}${window.location.pathname}`);
  const [spotifyToken, setSpotifyToken] = useState(null);
  const [spotifyUser, setSpotifyUser] = useState(null);
  const [spotifyPlaylists, setSpotifyPlaylists] = useState([]);
  const [spotifyActivePlaylistId, setSpotifyActivePlaylistId] = useState("");
  const [spotifyTracks, setSpotifyTracks] = useState([]);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifyError, setSpotifyError] = useState("");


  const [connectionTab, setConnectionTab] = useState("spotify");
  const [soundcloudClientId, setSoundcloudClientId] = useState("");
  const [soundcloudProfileUrl, setSoundcloudProfileUrl] = useState("https://soundcloud.com/");
  const [soundcloudConnected, setSoundcloudConnected] = useState(false);
  const [soundcloudUser, setSoundcloudUser] = useState(null);
  const [soundcloudPlaylists, setSoundcloudPlaylists] = useState([]);
  const [soundcloudActivePlaylistId, setSoundcloudActivePlaylistId] = useState("");
  const [soundcloudTracks, setSoundcloudTracks] = useState([]);
  const [soundcloudLoading, setSoundcloudLoading] = useState(false);
  const [soundcloudError, setSoundcloudError] = useState("");

  const [supabaseAnonKey, setSupabaseAnonKey] = useState("");
  const [supabaseSyncing, setSupabaseSyncing] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState("");
  const audioRef = useRef(null);
  const audioCtxRef = useRef(null);
  const eqFiltersRef = useRef([]);
  const eqGainRef = useRef(null);
  const playerMenuRef = useRef(null);
  const hashSyncRef = useRef(false);

  const currentUser = useMemo(() => users.find((u) => u.id === session?.userId) || null, [users, session]);
  const profileUser = useMemo(() => {
    if (!currentUser) return null;
    if (!viewedProfileId) return currentUser;
    return users.find((u) => u.id === viewedProfileId) || currentUser;
  }, [users, currentUser, viewedProfileId]);

  const isJesseOwner = Boolean(currentUser && isJesseAccount(currentUser));
  const isDeveloperOwner = Boolean(currentUser && isDeveloperAccount(currentUser));

  const tracks = data?.tracks || [];
  const playlists = data?.playlists || [];
  const trackIndex = tracks.findIndex((t) => t.id === currentTrackId);
  const currentTrack = tracks[trackIndex] || tracks[0] || null;
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (progress / duration) * 100)) : 0;

  useEffect(() => {
    const ok = safeSetLocalStorage(AUTH_USERS_KEY, JSON.stringify(users));
    if (!ok) {
      setProfileError("Не удалось сохранить изменения профиля. Файл изображения слишком большой для браузера.");
    }
  }, [users]);

  useEffect(() => {
    setUsers((prev) => {
      let changed = false;
      const next = prev.map((u) => {
        if (!isDeveloperAccount(u)) return u;
        if (u.role === "admin") return u;
        changed = true;
        return { ...u, role: "admin" };
      });
      return changed ? next : prev;
    });
  }, []);


  useEffect(() => {
    const timer = setTimeout(() => {
      setSidebarCollapsed(false);
    }, 180);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!session) localStorage.removeItem(AUTH_SESSION_KEY);
    else safeSetLocalStorage(AUTH_SESSION_KEY, JSON.stringify(session));
  }, [session]);

  useEffect(() => {
    const onHashChange = () => {
      const parsed = parseHashRoute();
      hashSyncRef.current = true;
      setActiveView(parsed.view);
      setRouteProfileSlug(parsed.profileSlug);
      if (parsed.view !== "profile") setViewedProfileId(null);
      setEditProfileMode(false);
    };
    window.addEventListener("hashchange", onHashChange);
    if (!window.location.hash) {
      window.history.replaceState(null, "", `#/${VIEW_TO_ROUTE.home}`);
    }
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const route = VIEW_TO_ROUTE[activeView] || VIEW_TO_ROUTE.home;
    let targetHash = `#/${route}`;
    if (activeView === "profile") {
      const targetUser = users.find((u) => u.id === viewedProfileId) || null;
      const slug = normalizeHandle(
        targetUser?.handle
        || targetUser?.username
        || routeProfileSlug
        || (!viewedProfileId ? (currentUser?.handle || currentUser?.username) : "")
        || ""
      );
      targetHash = slug ? `#/${route}/${slug}` : `#/${route}`;
    }
    if (window.location.hash !== targetHash) {
      if (hashSyncRef.current) window.history.replaceState(null, "", targetHash);
      else window.history.pushState(null, "", targetHash);
    }
    hashSyncRef.current = false;
  }, [activeView, viewedProfileId, users, currentUser, routeProfileSlug]);

  useEffect(() => {
    if (activeView !== "profile") return;
    if (!routeProfileSlug) {
      setViewedProfileId(null);
      return;
    }
    const found = users.find((u) =>
      normalizeHandle(u.handle || u.username) === routeProfileSlug
      || normalizeHandle(u.username) === routeProfileSlug
    );
    if (found) setViewedProfileId(found.id);
    else setViewedProfileId(null);
  }, [activeView, routeProfileSlug, users]);

  useEffect(() => {
    const savedSettings = localStorage.getItem(SPOTIFY_SETTINGS_KEY);
    if (savedSettings) {
      try {
        const p = JSON.parse(savedSettings);
        if (p.clientId) setSpotifyClientId(p.clientId);
        if (p.redirectUri) setSpotifyRedirectUri(p.redirectUri);
      } catch {}
    }
    const savedAuth = localStorage.getItem(SPOTIFY_AUTH_KEY);
    if (savedAuth) {
      try {
        const p = JSON.parse(savedAuth);
        if (p.accessToken && p.expiresAt > Date.now()) setSpotifyToken(p);
      } catch {}
    }

    const savedSoundcloud = localStorage.getItem(SOUNDCLOUD_SETTINGS_KEY);
    if (savedSoundcloud) {
      try {
        const p = JSON.parse(savedSoundcloud);
        if (p.clientId) setSoundcloudClientId(p.clientId);
        if (p.profileUrl) setSoundcloudProfileUrl(p.profileUrl);
        if (p.connected) setSoundcloudConnected(true);
      } catch {}
    }
    const savedSoundcloudAuth = localStorage.getItem(SOUNDCLOUD_AUTH_KEY);
    if (savedSoundcloudAuth) {
      try {
        const p = JSON.parse(savedSoundcloudAuth);
        if (p?.id) setSoundcloudUser(p);
      } catch {}
    }

    const savedSupabase = localStorage.getItem(SUPABASE_SETTINGS_KEY);
    if (savedSupabase) {
      try {
        const p = JSON.parse(savedSupabase);
        if (p?.anonKey) setSupabaseAnonKey(p.anonKey);
      } catch {}
    }
  }, []);

  useEffect(() => {
    safeSetLocalStorage(SPOTIFY_SETTINGS_KEY, JSON.stringify({ clientId: spotifyClientId.trim(), redirectUri: spotifyRedirectUri.trim() }));
  }, [spotifyClientId, spotifyRedirectUri]);

  useEffect(() => {
    safeSetLocalStorage(SOUNDCLOUD_SETTINGS_KEY, JSON.stringify({
      clientId: soundcloudClientId.trim(),
      profileUrl: soundcloudProfileUrl.trim(),
      connected: soundcloudConnected
    }));
  }, [soundcloudClientId, soundcloudProfileUrl, soundcloudConnected]);

  useEffect(() => {
    safeSetLocalStorage(SUPABASE_SETTINGS_KEY, JSON.stringify({
      url: SUPABASE_URL,
      anonKey: supabaseAnonKey.trim()
    }));
  }, [supabaseAnonKey]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (!code) return;

    const saved = JSON.parse(localStorage.getItem(SPOTIFY_SETTINGS_KEY) || "{}");
    const clientId = spotifyClientId || saved.clientId;
    const redirectUri = spotifyRedirectUri || saved.redirectUri;
    const verifier = localStorage.getItem(SPOTIFY_VERIFIER_KEY);
    const expectedState = localStorage.getItem(SPOTIFY_STATE_KEY);

    if (!clientId || !redirectUri || !verifier) {
      setSpotifyError("Не удалось завершить вход Spotify: отсутствуют данные.");
      return;
    }
    if (expectedState && state !== expectedState) {
      setSpotifyError("Ошибка безопасности Spotify: state не совпал.");
      return;
    }

    const exchange = async () => {
      setSpotifyLoading(true);
      try {
        const body = new URLSearchParams({
          client_id: clientId,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          code_verifier: verifier
        });
        const res = await fetch("https://accounts.spotify.com/api/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body
        });
        const raw = await res.text();
        let json = {};
        try { json = raw ? JSON.parse(raw) : {}; } catch { json = { error_description: raw }; }
        if (!res.ok) throw new Error(json.error_description || json.error || "Ошибка токена");
        const tokenData = { accessToken: json.access_token, expiresAt: Date.now() + (json.expires_in - 30) * 1000 };
        setSpotifyToken(tokenData);
        localStorage.setItem(SPOTIFY_AUTH_KEY, JSON.stringify(tokenData));
        localStorage.removeItem(SPOTIFY_VERIFIER_KEY);
        localStorage.removeItem(SPOTIFY_STATE_KEY);
        window.history.replaceState({}, "", window.location.pathname);
      } catch (err) {
        setSpotifyError(`Spotify login error: ${err.message}`);
      } finally {
        setSpotifyLoading(false);
      }
    };
    exchange();
  }, [spotifyClientId, spotifyRedirectUri]);

  useEffect(() => {
    const fromStorage = localStorage.getItem(STORAGE_KEY);
    if (fromStorage) {
      try {
        const parsed = JSON.parse(fromStorage);
        const normalized = normalizeAppData(parsed);
        setData(normalized);
        setCurrentTrackId(normalized.tracks?.[0]?.id || null);
        return;
      } catch {}
    }
    fetch("./data.json")
      .then((r) => r.json())
      .then((json) => {
        const normalized = normalizeAppData(json);
        setData(normalized);
        setCurrentTrackId(normalized.tracks?.[0]?.id || null);
      })
      .catch(() => {
        const normalized = normalizeAppData({});
        setData(normalized);
        setCurrentTrackId(normalized.tracks?.[0]?.id || null);
      });
  }, []);

  useEffect(() => {
    if (!data) return;
    safeSetLocalStorage(STORAGE_KEY, JSON.stringify(data, null, 2));
  }, [data]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = volume;
  }, [volume]);

  const ensureAudioGraph = () => {
    if (!audioRef.current) return false;
    try {
      const src = currentTrack?.audio || audioRef.current.currentSrc || audioRef.current.src || "";
      if (src) {
        const parsed = new URL(src, window.location.href);
        const isCrossOrigin = parsed.origin !== window.location.origin;
        if (isCrossOrigin) {
          if (audioCtxRef.current) {
            audioCtxRef.current.close().catch(() => {});
          }
          audioCtxRef.current = null;
          eqFiltersRef.current = [];
          eqGainRef.current = null;
          setEqEnabled(false);
          setEqOpen(false);
          setPlayerNotice("Эквалайзер отключен для внешнего трека, чтобы воспроизведение работало без тишины.");
          return false;
        }
      }
    } catch (_) {}
    if (audioCtxRef.current) return true;
    let ctx = null;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const source = ctx.createMediaElementSource(audioRef.current);
      const master = ctx.createGain();
      master.gain.value = Math.pow(10, eqLevelDb / 20);
      source.connect(master);
      let prev = master;
      const filters = EQ_FREQUENCIES.map((freq, idx) => {
        const f = ctx.createBiquadFilter();
        f.type = idx === 0 ? "lowshelf" : idx === EQ_FREQUENCIES.length - 1 ? "highshelf" : "peaking";
        f.frequency.value = freq;
        f.Q.value = 1;
        prev.connect(f);
        prev = f;
        return f;
      });
      prev.connect(ctx.destination);
      audioCtxRef.current = ctx;
      eqFiltersRef.current = filters;
      eqGainRef.current = master;
      setPlayerNotice("");
      return true;
    } catch (err) {
      if (ctx) ctx.close().catch(() => {});
      audioCtxRef.current = null;
      eqFiltersRef.current = [];
      eqGainRef.current = null;
      setEqEnabled(false);
      setEqOpen(false);
      setPlayerNotice("Эквалайзер отключен для этого трека (ограничение CORS), но воспроизведение работает.");
      return false;
    }
  };

  useEffect(() => {
    if (!eqFiltersRef.current.length || !audioCtxRef.current) return;
    const gains = eqPreset === "custom" ? eqCustomGains : EQ_PRESET_GAINS;
    eqFiltersRef.current.forEach((f, i) => {
      const gain = eqEnabled ? (gains[i] || 0) : 0;
      f.gain.setTargetAtTime(gain, audioCtxRef.current.currentTime, 0.05);
    });
  }, [eqPreset, eqCustomGains, eqEnabled]);

  useEffect(() => {
    if (!audioCtxRef.current || !eqGainRef.current) return;
    const linear = Math.pow(10, eqLevelDb / 20);
    eqGainRef.current.gain.setTargetAtTime(linear, audioCtxRef.current.currentTime, 0.05);
  }, [eqLevelDb]);

  useEffect(() => {
    const onDocClick = (event) => {
      if (!playerMenuOpen) return;
      if (!playerMenuRef.current) return;
      if (playerMenuRef.current.contains(event.target)) return;
      setPlayerMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [playerMenuOpen]);
  const spotifyApi = async (path) => {
    if (!spotifyToken?.accessToken) throw new Error("Нет токена Spotify");
    const res = await fetch(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${spotifyToken.accessToken}` } });
    if (res.status === 401) throw new Error("Сессия Spotify истекла. Войдите снова.");
    const raw = await res.text();
    let json = null;
    try { json = raw ? JSON.parse(raw) : {}; } catch { json = null; }
    if (!res.ok) {
      const msg = json?.error?.message || raw || "Ошибка Spotify API";
      throw new Error(`[${res.status}] ${msg}`);
    }
    if (!json) throw new Error("Spotify вернул неожиданный формат ответа.");
    return json;
  };

  const loadSpotifyHome = async () => {
    if (!spotifyToken?.accessToken) return;
    setSpotifyLoading(true);
    setSpotifyError("");
    try {
      const me = await spotifyApi("/me");
      setSpotifyUser(me);
      if (String(me?.product || "").toLowerCase() !== "premium") {
        setSpotifyError(`Spotify account product: ${me?.product || "unknown"}. Проверь, что вход выполнен в Premium-аккаунт.`);
      }
      const pls = await spotifyApi("/me/playlists?limit=20");
      setSpotifyPlaylists(pls.items || []);
      if ((pls.items || []).length) setSpotifyActivePlaylistId((v) => v || pls.items[0].id);
    } catch (err) {
      setSpotifyError(err.message);
    } finally {
      setSpotifyLoading(false);
    }
  };
  useEffect(() => { loadSpotifyHome(); }, [spotifyToken?.accessToken]);

  useEffect(() => {
    if (!spotifyActivePlaylistId || !spotifyToken?.accessToken) {
      setSpotifyTracks([]);
      return;
    }
    const loadTracks = async () => {
      setSpotifyLoading(true);
      setSpotifyError("");
      try {
        const res = await spotifyApi(`/playlists/${spotifyActivePlaylistId}/tracks?limit=50`);
        setSpotifyTracks((res.items || []).map((x) => x.track).filter(Boolean));
      } catch (err) {
        setSpotifyError(err.message);
      } finally {
        setSpotifyLoading(false);
      }
    };
    loadTracks();
  }, [spotifyActivePlaylistId, spotifyToken?.accessToken]);

  const startSpotifyLogin = async () => {
    const clientId = spotifyClientId.trim();
    const redirectUri = spotifyRedirectUri.trim();
    if (!clientId || !redirectUri) {
      setSpotifyError("Укажи Spotify Client ID и Redirect URI.");
      return;
    }
    const verifier = randomString(96);
    const state = randomString(24);

    const challenge = await createCodeChallenge(verifier);
    localStorage.setItem(SPOTIFY_VERIFIER_KEY, verifier);
    localStorage.setItem(SPOTIFY_STATE_KEY, state);
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: SPOTIFY_SCOPES,
      code_challenge_method: "S256",
      code_challenge: challenge,
      state
    });
    window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
  };

  const spotifyLogout = () => {
    localStorage.removeItem(SPOTIFY_AUTH_KEY);
    localStorage.removeItem(SPOTIFY_VERIFIER_KEY);
    localStorage.removeItem(SPOTIFY_STATE_KEY);
    setSpotifyToken(null);
    setSpotifyUser(null);
    setSpotifyPlaylists([]);
    setSpotifyTracks([]);
    setSpotifyActivePlaylistId("");
  };


  const soundcloudApi = async (path, params = {}) => {
    const clientId = soundcloudClientId.trim();
    if (!clientId) throw new Error("Укажи SoundCloud Client ID.");
    const qp = new URLSearchParams({ ...params, client_id: clientId });
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetch(`https://api.soundcloud.com${path}${sep}${qp.toString()}`);
    const raw = await res.text();
    let json = null;
    try { json = raw ? JSON.parse(raw) : {}; } catch { json = null; }
    if (!res.ok) {
      const msg = json?.errors?.[0]?.error_message || json?.error || raw || "Ошибка SoundCloud API";
      throw new Error(`[${res.status}] ${msg}`);
    }
    if (!json) throw new Error("SoundCloud вернул неожиданный формат ответа.");
    return json;
  };

  const normalizeSoundcloudTracks = (list) => (Array.isArray(list) ? list : []).filter(Boolean).map((t) => ({
    id: t.id || t.urn || t.permalink_url,
    title: t.title || "Без названия",
    artist: t.user?.username || soundcloudUser?.username || "SoundCloud",
    artwork: t.artwork_url || t.user?.avatar_url || "https://placehold.co/600x600/000/fff?text=SoundCloud",
    link: t.permalink_url || t.uri,
    durationMs: t.duration || 0
  }));

  const loadSoundcloudHome = async () => {
    const clientId = soundcloudClientId.trim();
    const profileUrl = soundcloudProfileUrl.trim();
    if (!clientId || !profileUrl) {
      setSoundcloudError("Укажи SoundCloud Client ID и ссылку на профиль.");
      return;
    }
    setSoundcloudLoading(true);
    setSoundcloudError("");
    try {
      const resolveRes = await fetch(`https://api.soundcloud.com/resolve?url=${encodeURIComponent(profileUrl)}&client_id=${encodeURIComponent(clientId)}`);
      const raw = await resolveRes.text();
      let resolved = null;
      try { resolved = raw ? JSON.parse(raw) : {}; } catch { resolved = null; }
      if (!resolveRes.ok || !resolved) {
        const msg = resolved?.errors?.[0]?.error_message || resolved?.error || raw || "Не удалось подключить SoundCloud";
        throw new Error(`[${resolveRes.status}] ${msg}`);
      }

      if (resolved.kind === "playlist") {
        setSoundcloudUser(resolved.user || null);
        setSoundcloudPlaylists([resolved]);
        setSoundcloudActivePlaylistId(String(resolved.id));
        setSoundcloudTracks(normalizeSoundcloudTracks(resolved.tracks || []));
      } else {
        const user = resolved;
        setSoundcloudUser(user);
        const primary = await soundcloudApi(`/users/${user.id}/playlists`, { limit: 20 });
        const p1 = Array.isArray(primary) ? primary : (primary?.collection || []);
        const allPlaylists = p1.length ? p1 : (await soundcloudApi(`/users/${user.id}/playlists_without_albums`, { limit: 20 }));
        const list = Array.isArray(allPlaylists) ? allPlaylists : (allPlaylists?.collection || []);
        setSoundcloudPlaylists(list);
        setSoundcloudActivePlaylistId((prev) => prev || String(list?.[0]?.id || ""));
      }

      setSoundcloudConnected(true);
      safeSetLocalStorage(SOUNDCLOUD_AUTH_KEY, JSON.stringify({
        id: resolved?.user?.id || resolved?.id || "",
        username: resolved?.user?.username || resolved?.username || ""
      }));
    } catch (err) {
      setSoundcloudError(err.message);
    } finally {
      setSoundcloudLoading(false);
    }
  };

  useEffect(() => {
    if (!soundcloudActivePlaylistId || !soundcloudConnected) {
      setSoundcloudTracks([]);
      return;
    }
    const listItem = soundcloudPlaylists.find((p) => String(p.id) === String(soundcloudActivePlaylistId));
    if (Array.isArray(listItem?.tracks) && listItem.tracks.length) {
      setSoundcloudTracks(normalizeSoundcloudTracks(listItem.tracks));
      return;
    }

    const loadTracks = async () => {
      setSoundcloudLoading(true);
      setSoundcloudError("");
      try {
        const playlist = await soundcloudApi(`/playlists/${soundcloudActivePlaylistId}`);
        setSoundcloudTracks(normalizeSoundcloudTracks(playlist?.tracks || []));
      } catch (err) {
        setSoundcloudError(err.message);
      } finally {
        setSoundcloudLoading(false);
      }
    };
    loadTracks();
  }, [soundcloudActivePlaylistId, soundcloudConnected]);

  const soundcloudLogout = () => {
    setSoundcloudConnected(false);
    setSoundcloudUser(null);
    setSoundcloudPlaylists([]);
    setSoundcloudTracks([]);
    setSoundcloudActivePlaylistId("");
    setSoundcloudError("");
    localStorage.removeItem(SOUNDCLOUD_AUTH_KEY);
  };

  const supabaseEnabled = Boolean(supabaseAnonKey.trim());

  const supabaseHeaders = {
    apikey: supabaseAnonKey.trim(),
    Authorization: `Bearer ${supabaseAnonKey.trim()}`,
    "Content-Type": "application/json"
  };

  const loadSupabaseProfiles = async () => {
    if (!supabaseEnabled) return;
    setSupabaseSyncing(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,username,handle,role,avatar_url,banner_url,nick_color,nick_glow`, {
        headers: supabaseHeaders
      });
      const raw = await res.text();
      let json = [];
      try { json = raw ? JSON.parse(raw) : []; } catch { json = []; }
      if (!res.ok) {
        const msg = json?.message || raw || "Ошибка загрузки Supabase";
        throw new Error(msg);
      }
      setUsers((prev) => mergeUsersWithSupabase(prev, json));
      setSupabaseStatus(`Supabase: загружено профилей ${Array.isArray(json) ? json.length : 0}`);
    } catch (err) {
      setSupabaseStatus(`Supabase: ${err.message}`);
    } finally {
      setSupabaseSyncing(false);
    }
  };

  const syncUserToSupabase = async (user) => {
    if (!supabaseEnabled || !user) return;
    const handle = normalizeHandle(user.handle || user.username);
    if (!handle) return;
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=handle`, {
        method: "POST",
        headers: {
          ...supabaseHeaders,
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify([{
          username: user.username,
          handle,
          role: user.role || "user",
          avatar_url: user.avatar || null,
          banner_url: user.banner || null,
          nick_color: user.nickStyle?.color || "#ffffff",
          nick_glow: Boolean(user.nickStyle?.glow)
        }])
      });
    } catch {}
  };

  useEffect(() => {
    if (!supabaseEnabled) {
      setSupabaseStatus("Supabase: вставь anon public key для общего поиска пользователей.");
      return;
    }
    loadSupabaseProfiles();
  }, [supabaseAnonKey]);
  const onAuthSubmit = (e) => {
    e.preventDefault();
    setAuthError("");
    const username = authForm.username.trim();
    const email = authForm.email.trim().toLowerCase();
    const handle = normalizeHandle(authForm.handle);
    const password = authForm.password;
    if (authMode === "register") {
      if (!username || !handle || !email || !password) return setAuthError("Заполни все поля.");
      const isDevPlaceholder = (u) => (u.id || "").startsWith("dev_") && !u.email && !u.password;
      const existingByUsername = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
      const existingByHandle = users.find((u) => normalizeHandle(u.handle) === handle);
      const existingByEmail = users.find((u) => u.email === email);
      if (existingByUsername && !isDevPlaceholder(existingByUsername)) return setAuthError("Такой ник уже занят.");
      if (existingByHandle && !isDevPlaceholder(existingByHandle)) return setAuthError("Такой @id уже занят.");
      if (existingByEmail) return setAuthError("Пользователь с таким email уже существует.");
      const claimDevUser =
        (existingByUsername && isDevPlaceholder(existingByUsername) ? existingByUsername : null) ||
        (existingByHandle && isDevPlaceholder(existingByHandle) ? existingByHandle : null);
      let role = "user";
      if (normalizeHandle(username) === "horonsky" || handle === "horonsky") role = "admin";
      if (claimDevUser) {
        const claimed = {
          ...claimDevUser,
          username,
          handle,
          email,
          password,
          role: isDeveloperAccount({ username, handle }) ? "admin" : (claimDevUser.role || role)
        };
        setUsers((prev) => prev.map((u) => (u.id === claimDevUser.id ? claimed : u)));
        setSession({ userId: claimed.id });
        syncUserToSupabase(claimed);
      } else {
        const user = {
          id: `u_${Date.now()}`,
          username,
          handle,
          email,
          password,
          role,
          avatar: "https://placehold.co/160x160/000/fff?text=Avatar",
          banner: "https://placehold.co/1280x500/000/fff?text=Banner",
          friends: [],
          nicknameChangedAt: 0,
          nickStyle: { color: "#ffffff", glow: false }
        };
        setUsers((prev) => [...prev, user]);
        setSession({ userId: user.id });
        syncUserToSupabase(user);
      }
      setAuthForm({ username: "", handle: "", email: "", password: "" });
      return;
    }

    if (!password) return setAuthError("Введи пароль.");
    let found = null;
    if (loginMethod === "email") {
      if (!email) return setAuthError("Введи email.");
      found = users.find((u) => u.email === email && u.password === password);
    } else {
      if (!username) return setAuthError("Введи логин.");
      found = users.find((u) => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
    }
    if (!found) return setAuthError("Неверные данные для входа.");
    setSession({ userId: found.id });
    setAuthForm({ username: "", handle: "", email: "", password: "" });
  };

  const onLogout = () => {
    setSession(null);
    setAuthMode("login");
    setViewedProfileId(null);
    setEditProfileMode(false);
    setProfileMenuOpen(false);
  };

  const updateCurrentUser = (patch) => {
    if (!currentUser) return;
    let updated = null;
    setUsers((prev) => prev.map((u) => {
      if (u.id !== currentUser.id) return u;
      updated = { ...u, ...patch };
      return updated;
    }));
    if (updated) syncUserToSupabase(updated);
  };

  const setRole = (id, role) => {
    if (!isDeveloperOwner) return;
    setUsers((prev) => prev.map((u) => {
      if (u.id !== id) return u;
      if (isJesseAccount(u)) return { ...u, role: "admin" };
      if (isHoronskyAccount(u) && role !== "admin") return { ...u, role: "admin" };
      return { ...u, role };
    }));
  };
  const updateCurrentUserNickStyle = (patch) => {
    if (!currentUser) return;
    const privileged = currentUser.role === "admin" || currentUser.role === "moderator" || isDeveloperAccount(currentUser);
    if (!privileged) return;
    const updated = { ...currentUser, nickStyle: { ...(currentUser.nickStyle || {}), ...patch } };
    setUsers((prev) => prev.map((u) => (
      u.id === currentUser.id
        ? { ...u, nickStyle: { ...(u.nickStyle || {}), ...patch } }
        : u
    )));
    syncUserToSupabase(updated);
  };

  const addFriend = (targetId) => {
    if (!currentUser || targetId === currentUser.id) return;
    setUsers((prev) => prev.map((u) => {
      if (u.id === currentUser.id && !u.friends.includes(targetId)) return { ...u, friends: [...u.friends, targetId] };
      if (u.id === targetId && !u.friends.includes(currentUser.id)) return { ...u, friends: [...u.friends, currentUser.id] };
      return u;
    }));
    setProfileMessage("Пользователь добавлен в друзья.");
  };

  const openProfile = (id) => {
    const target = users.find((u) => u.id === id);
    setViewedProfileId(id);
    setRouteProfileSlug(normalizeHandle(target?.handle || target?.username || ""));
    setActiveView("profile");
    setEditProfileMode(false);
    setProfileMenuOpen(false);
    setProfileError("");
    setProfileMessage("");
  };

  const openProfileByUsername = (username) => {
    const found = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
    if (found) openProfile(found.id);
  };

  const changeNickname = () => {
    if (!currentUser) return;
    const nick = newNick.trim();
    if (!nick) return setProfileError("Ник не может быть пустым.");
    if (confirmPassword !== currentUser.password) return setProfileError("Для смены ника введи текущий пароль.");
    if (users.some((u) => u.id !== currentUser.id && u.username.toLowerCase() === nick.toLowerCase())) return setProfileError("Такой ник уже занят.");
    const wait = NICK_COOLDOWN - (Date.now() - (currentUser.nicknameChangedAt || 0));
    if (currentUser.nicknameChangedAt && wait > 0) return setProfileError(`Ник можно менять раз в 12 часов. Осталось ~${Math.ceil(wait / 3600000)} ч.`);
    updateCurrentUser({ username: nick, nicknameChangedAt: Date.now() });
    setNewNick("");
    setConfirmPassword("");
    setProfileError("");
    setProfileMessage("Ник обновлен.");
  };

  const onImagePick = (kind, file) => {
    if (!currentUser || !file) return;
    const privileged = currentUser.role === "admin" || currentUser.role === "moderator";
    const allowed = privileged ? ["image/png", "image/jpeg", "image/gif"] : ["image/png", "image/jpeg"];
    if (!allowed.includes(file.type)) return setProfileError(privileged ? "Можно PNG, JPEG, GIF." : "Можно только PNG/JPEG.");
    const maxBytes = file.type === "image/gif" ? 2 * 1024 * 1024 : 4 * 1024 * 1024;
    if (file.size > maxBytes) {
      return setProfileError(file.type === "image/gif"
        ? "GIF слишком большой. Используй GIF до 2 МБ."
        : "Файл слишком большой. Используй изображение до 4 МБ.");
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const value = e.target?.result;
      if (typeof value === "string") {
        updateCurrentUser({ [kind]: value });
        setProfileError("");
        setProfileMessage(kind === "avatar" ? "Аватар обновлен." : "Баннер обновлен.");
      }
    };
    reader.readAsDataURL(file);
  };

  const filteredTracks = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return [];
    return tracks.filter((x) => `${x.title} ${x.artist}`.toLowerCase().includes(t));
  }, [tracks, query]);

  const filteredUsers = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return [];
    return users.filter((u) => {
      const uname = String(u.username || "").toLowerCase();
      const handle = normalizeHandle(u.handle || u.username);
      return uname.includes(t) || handle.includes(normalizeHandle(t));
    });
  }, [users, query]);

  const myFriends = useMemo(() => users.filter((u) => currentUser?.friends.includes(u.id)), [users, currentUser]);

  const playTrackById = (id) => {
    setCurrentTrackId(id);
    setTimeout(() => {
      if (!audioRef.current) return;
      ensureAudioGraph();
      audioRef.current.load();
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume().catch(() => {});
    }, 0);
  };

  const onPlayPause = () => {
    if (!audioRef.current || !currentTrack) return;
    ensureAudioGraph();
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }
    audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume().catch(() => {});
  };

  const playPrevTrack = () => {
    if (!tracks.length) return;
    const prevIndex = trackIndex <= 0 ? tracks.length - 1 : trackIndex - 1;
    playTrackById(tracks[prevIndex].id);
  };

  const playNextTrack = () => {
    if (!tracks.length) return;
    const nextIndex = trackIndex >= tracks.length - 1 ? 0 : trackIndex + 1;
    playTrackById(tracks[nextIndex].id);
  };

  const onStop = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setProgress(0);
    setIsPlaying(false);
  };

  const addCurrentTrackToPlaylist = () => {
    if (!currentTrack || !selectedPlaylistId) return;
    setData((prev) => ({ ...prev, playlists: prev.playlists.map((p) => p.id !== selectedPlaylistId ? p : p.trackIds.includes(currentTrack.id) ? p : { ...p, trackIds: [...p.trackIds, currentTrack.id] }) }));
    setProfileMessage("Трек добавлен в плейлист.");
  };

  const setCurrentTrackLiked = (liked) => {
    if (!currentTrack) return;
    setData((prev) => ({
      ...prev,
      tracks: (prev.tracks || []).map((t) => (t.id === currentTrack.id ? { ...t, liked } : t))
    }));
  };

  const updateEqCustomGain = (idx, value) => {
    setEqPreset("custom");
    setEqCustomGains((prev) => prev.map((x, i) => (i === idx ? value : x)));
  };

  const resetEqSettings = () => {
    setEqPreset("studio");
    setEqCustomGains([...EQ_PRESET_GAINS]);
    setEqLevelDb(0);
    setEqEnabled(true);
  };

  if (!currentUser) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <img src="./logo/logo2.png" alt="logo" className="auth-logo" />
          <h1>{SITE_NAME}</h1>
          <div className="auth-tabs">
            <button className={`menu-btn ${authMode === "login" ? "active" : ""}`} onClick={() => setAuthMode("login")}>Вход</button>
            <button className={`menu-btn ${authMode === "register" ? "active" : ""}`} onClick={() => setAuthMode("register")}>Регистрация</button>
          </div>
          {authMode === "login" && (
            <div className="row">
              <button className={`small-btn ${loginMethod === "username" ? "active" : ""}`} type="button" onClick={() => setLoginMethod("username")}>По логину</button>
              <button className={`small-btn ${loginMethod === "email" ? "active" : ""}`} type="button" onClick={() => setLoginMethod("email")}>По почте</button>
            </div>
          )}
          <form className="auth-form auth-form-lower" onSubmit={onAuthSubmit}>
            {(authMode === "register" || (authMode === "login" && loginMethod === "username")) && (
              <input className="field" placeholder={authMode === "register" ? "Ник" : "Логин"} value={authForm.username} onChange={(e) => setAuthForm((p) => ({ ...p, username: e.target.value }))} />
            )}
            {authMode === "register" && (
              <input className="field" placeholder="@id (например @jessew1lliams)" value={authForm.handle} onChange={(e) => setAuthForm((p) => ({ ...p, handle: e.target.value }))} />
            )}
            {(authMode === "register" || (authMode === "login" && loginMethod === "email")) && (
              <input className="field" type="email" placeholder="Email" value={authForm.email} onChange={(e) => setAuthForm((p) => ({ ...p, email: e.target.value }))} />
            )}
            <input className="field" type="password" placeholder="Пароль" value={authForm.password} onChange={(e) => setAuthForm((p) => ({ ...p, password: e.target.value }))} />
            {authError && <p className="spotify-error">{authError}</p>}
            <button className="small-btn auth-submit" type="submit">{authMode === "login" ? "Войти" : "Создать аккаунт"}</button>
          </form>
          <div className="auth-bottom">
            <button className="auth-dev-btn" type="button" onClick={() => setShowAuthDevelopers((v) => !v)}>Разработчики</button>
            <div className={`auth-developers ${showAuthDevelopers ? "open" : ""}`}>
              <div>@jessew1lliams</div>
              <div>@HORONSKY</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return <div className="main">Загрузка...</div>;

  const TrackCard = ({ track }) => (
    <div className="card">
      <img className="cover" src={track.cover} alt={track.title} />
      <h3>{track.title}</h3>
      <p className="muted">{track.artist}</p>
      <button className="small-btn" onClick={() => playTrackById(track.id)}>Слушать</button>
    </div>
  );

  return (
    <div className={`app ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="sidebar-top">
          <button className="logo-link" onClick={() => { setActiveView("home"); setViewedProfileId(null); }} title="На главную">
            <span className="logo-crop"><img className="logo" src="./logo/logo2.png" alt="Лого" /></span>
          </button>
        </div>

        <nav className="menu">
          <button className={`menu-btn ${activeView === "search" ? "active" : ""}`} onClick={() => setActiveView("search")}><img className="menu-icon" src="./icons/nav/nav_search.png" alt="" /><span>Поиск</span></button>
          <button className={`menu-btn ${activeView === "home" ? "active" : ""}`} onClick={() => { setActiveView("home"); setViewedProfileId(null); }}><img className="menu-icon" src="./icons/nav/nav_home.png" alt="" /><span>Главная</span></button>
          <button className={`menu-btn ${activeView === "collection" ? "active" : ""}`} onClick={() => setActiveView("collection")}><img className="menu-icon" src="./icons/nav/nav_connections.png" alt="" /><span>Подключения</span></button>
          <button className={`menu-btn ${activeView === "developers" ? "active" : ""}`} onClick={() => setActiveView("developers")}><img className="menu-icon" src="./icons/nav/nav_developers.png" alt="" /><span>Разработчики</span></button>
          <div className="menu-toggle-row">
            <button className={`sidebar-toggle ${sidebarCollapsed ? "is-collapsed" : ""}`} type="button" onClick={() => setSidebarCollapsed((v) => !v)} title={sidebarCollapsed ? "Развернуть меню" : "Свернуть меню"}>
              <img className="toggle-icon icon-left" src="./icons/nav/collapse_left.png" alt="" />
              <img className="toggle-icon icon-right" src="./icons/nav/collapse_right.png" alt="" />
            </button>
          </div>
        </nav>

        <div className="user-box">
          <p className="muted">Роль: {isDeveloperOwner ? <button className={`role-tag role-admin-btn ${activeView === "admin" ? "active" : ""}`} onClick={() => setActiveView("admin")}>ADMIN</button> : <span className="role-tag">{currentUser.role}</span>}</p>
          <p className="muted">Пользователь: <Nick user={currentUser} /></p>
        </div>

        <button className={`menu-btn profile-nav ${activeView === "profile" ? "active" : ""}`} onClick={() => { setActiveView("profile"); setViewedProfileId(null); setRouteProfileSlug(normalizeHandle(currentUser?.handle || currentUser?.username || "")); setEditProfileMode(false); }}><img className="menu-icon profile-user-icon" src="./icons/nav/nav_user.png" alt="" /><span>Профиль</span></button>
      </aside>

      <main className="main">
        {activeView === "search" && (
          <section>
            <h2 className="section-title">Поиск</h2>
            <input className="search-box" placeholder="Ищи треки и пользователей" value={query} onChange={(e) => setQuery(e.target.value)} />
            {!query.trim() && <p className="muted" style={{ marginTop: 12 }}>Начни вводить запрос.</p>}
            {query.trim() && (
              <>
                <h3 className="sub-title">Треки</h3>
                <div className="grid">{filteredTracks.map((t) => <TrackCard key={t.id} track={t} />)}</div>
                <h3 className="sub-title" style={{ marginTop: 16 }}>Пользователи</h3>
                <div className="user-grid">
                  {filteredUsers.map((u) => (
                    <div className="card" key={u.id}>
                      <img className="avatar" src={u.avatar} alt={u.username} />
                      <button className="link-btn" onClick={() => openProfile(u.id)}><Nick user={u} /></button>
                      <p className="muted">@{u.handle || normalizeHandle(u.username)} · {u.role}</p>
                      {u.id !== currentUser.id && <button className="small-btn" onClick={() => addFriend(u.id)}>{currentUser.friends.includes(u.id) ? "Уже в друзьях" : "Добавить в друзья"}</button>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {activeView === "home" && (
          <section>
            <h2 className="section-title">Пробный трек</h2>
            <div className="grid">{tracks.map((t) => <TrackCard key={t.id} track={t} />)}</div>
          </section>
        )}

        {activeView === "profile" && profileUser && (
          <section>
            <h2 className="section-title">Профиль</h2>
            <div className="profile-banner-wrap">
              <img src={profileUser.banner} alt="banner" className="profile-banner" />
              <div className="profile-banner-center">
                <img className="profile-banner-avatar" src={profileUser.avatar} alt="avatar" />
                <div className="profile-banner-nick"><Nick user={profileUser} /></div>
                <div className="profile-banner-handle">@{profileUser.handle || normalizeHandle(profileUser.username)}</div>
                <div className="profile-banner-role">{profileUser.role}</div>
              </div>
              {profileUser.id === currentUser.id && (
                <div className="profile-menu">
                  <button className="gear-btn" onClick={() => setProfileMenuOpen((v) => !v)} title="Настройки профиля">⚙</button>
                  {profileMenuOpen && (
                    <div className="profile-menu-popover">
                      <button className="small-btn" onClick={() => { setEditProfileMode((v) => !v); setProfileMenuOpen(false); }}>{editProfileMode ? "Закрыть редактирование" : "Редактировать профиль"}</button>
                      <button className="small-btn" onClick={onLogout}>Выйти из аккаунта</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {profileUser.id !== currentUser.id && <div className="row" style={{ marginTop: 12 }}><button className="small-btn" onClick={() => addFriend(profileUser.id)}>{currentUser.friends.includes(profileUser.id) ? "Уже в друзьях" : "Добавить в друзья"}</button></div>}

            {profileUser.id === currentUser.id && editProfileMode && (
              <div className="card" style={{ marginTop: 12, background: "#0b0b0b" }}>
                <label className="muted">Ник (1 раз в 12 часов)</label>
                <input className="field" value={newNick} onChange={(e) => setNewNick(e.target.value)} placeholder="Новый ник" />
                <label className="muted">Текущий пароль для смены ника</label>
                <input className="field" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Текущий пароль" />
                <button className="small-btn" onClick={changeNickname}>Обновить ник</button>
                <label className="muted">Аватар (PNG/JPEG{currentUser.role === "admin" || currentUser.role === "moderator" ? "/GIF" : ""})</label>
                <input className="field" type="file" accept={currentUser.role === "admin" || currentUser.role === "moderator" ? ".png,.jpg,.jpeg,.gif" : ".png,.jpg,.jpeg"} onChange={(e) => onImagePick("avatar", e.target.files?.[0])} />
                <label className="muted">Баннер (точно 1280x500)</label>
                <input className="field" type="file" accept={currentUser.role === "admin" || currentUser.role === "moderator" ? ".png,.jpg,.jpeg,.gif" : ".png,.jpg,.jpeg"} onChange={(e) => onImagePick("banner", e.target.files?.[0])} />
                {(currentUser.role === "admin" || currentUser.role === "moderator" || isDeveloperAccount(currentUser)) && (
                  <>
                    <label className="muted">Цвет ника</label>
                    <input
                      className="field"
                      type="color"
                      value={currentUser.nickStyle?.color || "#ffffff"}
                      onChange={(e) => updateCurrentUserNickStyle({ color: e.target.value, glow: Boolean(currentUser.nickStyle?.glow) })}
                    />
                    <label className="muted row">
                      <input
                        type="checkbox"
                        checked={Boolean(currentUser.nickStyle?.glow)}
                        onChange={(e) => updateCurrentUserNickStyle({ color: currentUser.nickStyle?.color || "#ffffff", glow: e.target.checked })}
                      />
                      Свечение ника
                    </label>
                  </>
                )}
              </div>
            )}

            {profileError && <p className="spotify-error" style={{ marginTop: 12 }}>{profileError}</p>}
            {profileMessage && <p className="ok-msg" style={{ marginTop: 12 }}>{profileMessage}</p>}

            <div className="card" style={{ marginTop: 12 }}>
              <h3 className="sub-title" style={{ margin: 0 }}>Посты</h3>
              <p className="muted">Скоро здесь появятся публикации, комментарии и реакции.</p>
            </div>

            {profileUser.id === currentUser.id && (
              <>
                <h3 className="sub-title" style={{ marginTop: 18 }}>Друзья</h3>
                <div className="user-grid">
                  {myFriends.length === 0 ? <p className="muted">Пока друзей нет.</p> : myFriends.map((f) => (
                    <div className="card" key={f.id}>
                      <img className="avatar" src={f.avatar} alt={f.username} />
                      <button className="link-btn" onClick={() => openProfile(f.id)}><Nick user={f} /></button>
                      <p className="muted">{f.role}</p>
                    </div>
                  ))}
                </div>

              </>
            )}
          </section>
        )}

        {activeView === "admin" && isDeveloperOwner && (
          <section>
            <h2 className="section-title">ADMIN</h2>
            <p className="muted" style={{ marginBottom: 12 }}>Панель управления ролями и стилем ников.</p>
            <div className="user-grid">
              {users.map((u) => (
                <div className="card" key={u.id}>
                  <button className="link-btn" onClick={() => openProfile(u.id)}><Nick user={u} /></button>
                  <p className="muted">@{u.handle || normalizeHandle(u.username)}</p>
                  <select className="field" value={u.role} onChange={(e) => setRole(u.id, e.target.value)}>
                    <option value="user">user</option>
                    <option value="moderator">moderator</option>
                    <option value="admin">admin</option>
                  </select>
                  <label className="muted">Цвет ника</label>
                  <input className="field" type="color" value={u.nickStyle?.color || "#ffffff"} onChange={(e) => setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, nickStyle: { ...(x.nickStyle || {}), color: e.target.value, glow: Boolean(x.nickStyle?.glow) } } : x))} />
                  <label className="muted row"><input type="checkbox" checked={Boolean(u.nickStyle?.glow)} onChange={(e) => setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, nickStyle: { ...(x.nickStyle || {}), color: x.nickStyle?.color || "#ffffff", glow: e.target.checked } } : x))} />Свечение ника</label>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeView === "developers" && (
          <section>
            <h2 className="section-title">Разработчики</h2>
            <div className="user-grid">
              {[
                { id: "dev_jessew1lliams", key: "jessew1lliams", title: "Founder" },
                { id: "dev_horonsky", key: "horonsky", title: "Co-Founder" }
              ].map((dev) => {
                const found = users.find((u) => u.id === dev.id || normalizeHandle(u.handle || u.username) === dev.key || (dev.key === "jessew1lliams" ? isJesseAccount(u) : isHoronskyAccount(u)));
                return (
                  <div className="card" key={dev.key}>
                    {found ? (
                      <button className="link-btn" onClick={() => openProfile(found.id)}><Nick user={found} /></button>
                    ) : (
                      <span className="muted">@{dev.key}</span>
                    )}
                    <p className="muted">{dev.title}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {activeView === "collection" && (
          <section>
            <div className="card" style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Глобальные профили (Supabase)</h3>
              <div className="row">
                <input className="field" value={SUPABASE_URL} readOnly />
                <input className="field" placeholder="Supabase anon public key" value={supabaseAnonKey} onChange={(e) => setSupabaseAnonKey(e.target.value.trim())} />
              </div>
              <div className="row">
                <button className="small-btn" onClick={loadSupabaseProfiles} disabled={!supabaseEnabled || supabaseSyncing}>
                  {supabaseSyncing ? "Синхронизация..." : "Синхронизировать профили"}
                </button>
              </div>
              <p className="muted">{supabaseStatus || "Supabase не подключен."}</p>
            </div>

            <div className="row" style={{ marginBottom: 12 }}>
              <button className={`small-btn ${connectionTab === "spotify" ? "active" : ""}`} onClick={() => setConnectionTab("spotify")}>Spotify</button>
              <button className={`small-btn ${connectionTab === "soundcloud" ? "active" : ""}`} onClick={() => setConnectionTab("soundcloud")}>SoundCloud</button>
            </div>

            {connectionTab === "spotify" && (
              <>
                <h2 className="section-title spotify-title"><span className="spotify-icon" aria-hidden="true"><img src="./icons/spotify_logo.png" alt="Spotify" /></span><span>Spotify</span></h2>

                <div className="card">
                  <div className="row">
                    <input className="field" placeholder="Client ID Spotify" value={spotifyClientId} onChange={(e) => setSpotifyClientId(e.target.value)} />
                    <input className="field" placeholder="Redirect URI" value={spotifyRedirectUri} onChange={(e) => setSpotifyRedirectUri(e.target.value)} />
                  </div>

                  <div className="row">
                    {!spotifyToken && <button className="small-btn" onClick={startSpotifyLogin}>Войти через Spotify</button>}
                    {spotifyToken && <button className="small-btn" onClick={loadSpotifyHome}>Обновить Spotify</button>}
                    {spotifyToken && <button className="small-btn" onClick={spotifyLogout}>Выйти из Spotify</button>}
                  </div>

                  {spotifyUser && (
                    <p className="muted">
                      Вход выполнен: {spotifyUser.display_name || spotifyUser.id} · Тариф: {spotifyUser.product || "неизвестно"} · Аккаунт: {spotifyUser.id}
                    </p>
                  )}

                  {spotifyError && <p className="spotify-error">{spotifyError}</p>}
                  {spotifyLoading && <p className="muted">Загрузка данных Spotify...</p>}
                </div>

                <div className="card" style={{ marginTop: 12 }}>
                  <h3>Правила подключения Spotify</h3>
                  <ul className="spotify-rules">
                    <li>Используй один и тот же аккаунт в приложении и в Spotify for Developers.</li>
                    <li>Проверь, что у аккаунта активен Premium и подтвержден способ оплаты.</li>
                    <li>Если видишь 403 по стране, это региональное ограничение аккаунта Spotify, а не ошибка сайта.</li>
                    <li>VPN обычно не помогает, если страна зафиксирована в профиле Spotify.</li>
                    <li>Client ID и Redirect URI должны полностью совпадать с настройками Spotify Dashboard.</li>
                  </ul>
                </div>

                {spotifyPlaylists.length > 0 && (
                  <div className="playlist-list" style={{ marginTop: 12 }}>
                    {spotifyPlaylists.map((p) => (
                      <div key={p.id} className={`card ${spotifyActivePlaylistId === p.id ? "playlist-active" : ""}`}>
                        <img className="cover" src={p.images?.[0]?.url || "https://placehold.co/600x600/000/fff?text=Spotify"} alt={p.name} />
                        <h3>{p.name}</h3>
                        <div className="row">
                          <button className="small-btn" onClick={() => setSpotifyActivePlaylistId(p.id)}>Открыть</button>
                          <a className="small-btn" href={p.external_urls?.spotify} target="_blank" rel="noreferrer">Открыть в Spotify</a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {spotifyActivePlaylistId && (
                  <div className="card" style={{ marginTop: 12 }}>
                    <h3>Треки выбранного плейлиста</h3>
                    {spotifyTracks.length === 0 ? (
                      <p className="muted">Треки недоступны или доступ ограничен аккаунтом.</p>
                    ) : (
                      spotifyTracks.map((t) => (
                        <div key={t.id || t.uri} className="playlist-track-row">
                          <div>
                            <div>{t.name}</div>
                            <div className="muted">{(t.artists || []).map((a) => a.name).join(", ")}</div>
                          </div>
                          <div className="row">
                            {t.preview_url && <audio controls src={t.preview_url} preload="none" />}
                            <a className="small-btn" href={t.external_urls?.spotify} target="_blank" rel="noreferrer">Открыть</a>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            )}

            {connectionTab === "soundcloud" && (
              <>
                <h2 className="section-title">SoundCloud</h2>

                <div className="card">
                  <div className="row">
                    <input className="field" placeholder="Client ID SoundCloud" value={soundcloudClientId} onChange={(e) => setSoundcloudClientId(e.target.value)} />
                    <input className="field" placeholder="Ссылка на профиль или плейлист SoundCloud" value={soundcloudProfileUrl} onChange={(e) => setSoundcloudProfileUrl(e.target.value)} />
                  </div>
                  <div className="row">
                    {!soundcloudConnected && <button className="small-btn" onClick={loadSoundcloudHome}>Подключить SoundCloud</button>}
                    {soundcloudConnected && <button className="small-btn" onClick={loadSoundcloudHome}>Обновить SoundCloud</button>}
                    {soundcloudConnected && <button className="small-btn" onClick={soundcloudLogout}>Выйти из SoundCloud</button>}
                  </div>

                  {soundcloudUser && <p className="muted">Подключен аккаунт: {soundcloudUser.username || soundcloudUser.full_name || soundcloudUser.permalink}</p>}
                  {soundcloudError && <p className="spotify-error">{soundcloudError}</p>}
                  {soundcloudLoading && <p className="muted">Загрузка данных SoundCloud...</p>}
                </div>

                <div className="card" style={{ marginTop: 12 }}>
                  <h3>Правила подключения SoundCloud</h3>
                  <ul className="spotify-rules">
                    <li>Создай приложение в SoundCloud for Developers и скопируй Client ID.</li>
                    <li>Вставь ссылку на профиль вида `https://soundcloud.com/username` или ссылку на плейлист.</li>
                    <li>Если API отвечает ошибкой 401/403, чаще всего невалидный Client ID или лимит доступа.</li>
                    <li>Для прослушивания полного трека используй кнопку "Открыть в SoundCloud".</li>
                  </ul>
                </div>

                {soundcloudPlaylists.length > 0 && (
                  <div className="playlist-list" style={{ marginTop: 12 }}>
                    {soundcloudPlaylists.map((p) => (
                      <div key={p.id || p.urn} className={`card ${String(soundcloudActivePlaylistId) === String(p.id) ? "playlist-active" : ""}`}>
                        <img className="cover" src={p.artwork_url || p.user?.avatar_url || "https://placehold.co/600x600/000/fff?text=SoundCloud"} alt={p.title} />
                        <h3>{p.title}</h3>
                        <div className="row">
                          <button className="small-btn" onClick={() => setSoundcloudActivePlaylistId(String(p.id))}>Открыть</button>
                          {p.permalink_url && <a className="small-btn" href={p.permalink_url} target="_blank" rel="noreferrer">Открыть в SoundCloud</a>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {soundcloudActivePlaylistId && (
                  <div className="card" style={{ marginTop: 12 }}>
                    <h3>Треки выбранного плейлиста</h3>
                    {soundcloudTracks.length === 0 ? (
                      <p className="muted">Треки недоступны или плейлист пустой.</p>
                    ) : (
                      soundcloudTracks.map((t) => (
                        <div key={t.id} className="playlist-track-row">
                          <div className="row" style={{ gap: 10 }}>
                            <img src={t.artwork} alt={t.title} style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover" }} />
                            <div>
                              <div>{t.title}</div>
                              <div className="muted">{t.artist} · {formatTime((t.durationMs || 0) / 1000)}</div>
                            </div>
                          </div>
                          <div className="row">
                            {t.link && <a className="small-btn" href={t.link} target="_blank" rel="noreferrer">Открыть</a>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </main>

            <footer className="player">
        <div className="player-progress-wrap">
          <input
            className="progress"
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={progress}
            style={{ background: `linear-gradient(to right, #a8a8a8 0%, #a8a8a8 ${progressPercent}%, #2d2d2d ${progressPercent}%, #2d2d2d 100%)` }}
            onChange={(e) => {
              const n = Number(e.target.value);
              setProgress(n);
              if (audioRef.current) audioRef.current.currentTime = n;
            }}
          />
          <div className="progress-times">
            <span>{formatTime(progress)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="player-left">
          {currentTrack ? (
            <>
              <img className="player-cover" src={currentTrack.cover} alt={currentTrack.title} />
              <div className="player-meta">
                <div className="player-title-row">
                  <div className="player-title">{currentTrack.title}</div>
                  <button
                    className="icon-btn like-btn like-btn-meta"
                    type="button"
                    title={currentTrack?.liked ? "Убрать лайк" : "Поставить лайк"}
                    onMouseEnter={() => setLikeHover(true)}
                    onMouseLeave={() => setLikeHover(false)}
                    onClick={() => setCurrentTrackLiked(!currentTrack?.liked)}
                  >
                    <span className={`like-icon-layer ${!currentTrack?.liked && !likeHover ? "show" : ""}`}>
                      <img className="icon-img" src={ICONS.likeOutline} alt="Не лайкнуто" />
                    </span>
                    <span className={`like-icon-layer ${((!currentTrack?.liked && likeHover) || (currentTrack?.liked && !likeHover)) ? "show" : ""}`}>
                      <img className="icon-img" src={ICONS.likeFilled} alt="Лайкнуто" />
                    </span>
                    <span className={`like-icon-layer ${(currentTrack?.liked && likeHover) ? "show" : ""}`}>
                      <img className="icon-img" src={ICONS.likeBroken} alt="Убрать лайк" />
                    </span>
                  </button>
                </div>
                <div className="muted">{currentTrack.artist}</div>
              </div>
            </>
          ) : (
            <div className="muted">Трек не выбран</div>
          )}
        </div>

        <div className="player-center">
          <div className="controls centered-controls">
            <button className="icon-btn track-nav-btn" onClick={playPrevTrack} title="Предыдущий трек">
              <img className="icon-img nav-icon-img" src={ICONS.prev} alt="Предыдущий" />
            </button>
            <button className="icon-btn play-btn" onClick={onPlayPause} title={isPlaying ? "Пауза" : "Пуск"}>
              <img className="icon-img play-icon-img" src={isPlaying ? ICONS.pause : ICONS.play} alt={isPlaying ? "Пауза" : "Пуск"} />
            </button>
            <button className="icon-btn track-nav-btn" onClick={playNextTrack} title="Следующий трек">
              <img className="icon-img nav-icon-img" src={ICONS.next} alt="Следующий" />
            </button>
          </div>
          <div className="muted player-time-left">Осталось: {formatTime(Math.max(0, (duration || 0) - (progress || 0)))}</div>
          {playerNotice && <div className="muted player-time-left">{playerNotice}</div>}
        </div>

        <div className="player-right">
          <div className="volume-wrap" onMouseEnter={() => setVolumeOpen(true)} onMouseLeave={() => setVolumeOpen(false)}>
            <button className="icon-btn volume-btn" type="button" title="Громкость">
              <img className="icon-img" src={ICONS.volume} alt="Громкость" />
            </button>
            <div className={`volume-pop ${volumeOpen ? "open" : ""}`}>
              <input
                className="volume-slider"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="player-menu-wrap" ref={playerMenuRef}>
            <button className="icon-btn dots-btn" onClick={() => setPlayerMenuOpen((v) => !v)} title="Настрой себе свой звук">
              <img className="icon-img dots-icon-img" src={ICONS.more} alt="Меню" />
            </button>
            {playerMenuOpen && (
              <div className="player-menu">
                <div className="player-menu-header">
                  <div className="menu-title">Настрой себе свой звук</div>
                  <button className="icon-btn close-btn" onClick={() => setPlayerMenuOpen(false)} title="Закрыть">✕</button>
                </div>

                <div className="menu-block">
                  <div className="menu-title">Добавить в плейлист</div>
                  <select className="small-btn" value={selectedPlaylistId} onChange={(e) => setSelectedPlaylistId(e.target.value)}>
                    <option value="">Выберите плейлист</option>
                    {playlists.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <button className="small-btn" onClick={addCurrentTrackToPlaylist}>Добавить</button>
                </div>

                <div className="menu-block">
                  <div className="menu-title">Формат файла</div>
                  <div className="quality-pill">{detectAudioQuality(currentTrack)}</div>
                </div>

                <div className="menu-block">
                  <button className="small-btn" onClick={() => setEqOpen((v) => !v)}>
                    {eqOpen ? "Скрыть эквалайзер" : "Открыть эквалайзер"}
                  </button>
                </div>

                {eqOpen && (
                  <div className="eq-panel-modern">
                    <div className="eq-top-row">
                      <h4>Эквалайзер</h4>
                      <label className="eq-switch">
                        <input type="checkbox" checked={eqEnabled} onChange={(e) => setEqEnabled(e.target.checked)} />
                        <span className="eq-switch-ui" />
                      </label>
                    </div>

                    <div className="eq-labels">
                      <span>Уровень</span>
                      <span>Эквалайзер</span>
                    </div>

                    <div className="eq-level-row">
                      <label className="eq-level-band">
                        <input
                          type="range"
                          min="-12"
                          max="12"
                          step="1"
                          value={eqLevelDb}
                          onChange={(e) => setEqLevelDb(Number(e.target.value))}
                          disabled={!eqEnabled}
                        />
                        <span>уровень</span>
                      </label>
                    </div>

                    <div className="eq-grid">
                      {EQ_FREQUENCIES.map((freq, idx) => (
                        <label key={freq} className="eq-band">
                          <input
                            type="range"
                            min="-12"
                            max="12"
                            step="1"
                            value={eqPreset === "custom" ? eqCustomGains[idx] : EQ_PRESET_GAINS[idx]}
                            onChange={(e) => updateEqCustomGain(idx, Number(e.target.value))}
                            disabled={!eqEnabled}
                          />
                          <span>{freq >= 1000 ? `${Math.round(freq / 1000)}k` : freq}</span>
                        </label>
                      ))}
                    </div>

                    <div className="eq-actions-row">
                      <select className="eq-preset-select" value={eqPreset} onChange={(e) => setEqPreset(e.target.value)}>
                        <option value="studio">Ночной баланс</option>
                        <option value="custom">Своя настройка</option>
                      </select>
                      <button className="small-btn" onClick={resetEqSettings}>По умолчанию</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <audio
          ref={audioRef}
          crossOrigin="anonymous"
          src={currentTrack?.audio || ""}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration || 0);
            setProgress(0);
          }}
          onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime || 0)}
          onEnded={() => {
            setIsPlaying(false);
            setProgress(duration || 0);
          }}
        />
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);














































































