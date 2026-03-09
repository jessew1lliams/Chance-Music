
const { useEffect, useMemo, useRef, useState } = React;

const STORAGE_KEY = "chance_music_data_v5";
const SITE_NAME = "Шанс | Music";
const AUTH_USERS_KEY = "chance_music_users_v3";
const AUTH_SESSION_KEY = "chance_music_session_v3";
const NICK_COOLDOWN = 12 * 60 * 60 * 1000;

const SPOTIFY_SETTINGS_KEY = "chance_music_spotify_settings_v1";
const SPOTIFY_AUTH_KEY = "chance_music_spotify_auth_v1";
const SPOTIFY_VERIFIER_KEY = "chance_music_spotify_verifier_v1";
const SPOTIFY_STATE_KEY = "chance_music_spotify_state_v1";
const SPOTIFY_SCOPES = [
  "user-read-private",
  "user-read-email",
  "playlist-read-private",
  "playlist-read-collaborative"
].join(" ");

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
    email: (u.email || "").toLowerCase(),
    password: u.password || "",
    role: u.role || (i === 0 ? "admin" : "user"),
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

function loadUsers() {
  try {
    return normalizeUsers(JSON.parse(localStorage.getItem(AUTH_USERS_KEY) || "[]"));
  } catch {
    return [];
  }
}

function normalizeAppData(raw) {
  const source = raw || {};
  const track = { ...SAMPLE_TRACK };
  return {
    ...source,
    site: { ...(source.site || {}), logo: "./logo.png" },
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
  const [activeView, setActiveView] = useState("home");
  const [viewedProfileId, setViewedProfileId] = useState(null);
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
  const [authForm, setAuthForm] = useState({ username: "", email: "", password: "" });
  const [authError, setAuthError] = useState("");

  const [profileError, setProfileError] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [newNick, setNewNick] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [editProfileMode, setEditProfileMode] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const [currentTrackId, setCurrentTrackId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [playerMenuOpen, setPlayerMenuOpen] = useState(false);

  const [eqOpen, setEqOpen] = useState(false);
  const [eqEnabled, setEqEnabled] = useState(true);
  const [eqPreset, setEqPreset] = useState("studio");
  const [eqCustomGains, setEqCustomGains] = useState([...EQ_PRESET_GAINS]);

  const [spotifyClientId, setSpotifyClientId] = useState("");
  const [spotifyRedirectUri, setSpotifyRedirectUri] = useState(`${window.location.origin}${window.location.pathname}`);
  const [spotifyToken, setSpotifyToken] = useState(null);
  const [spotifyUser, setSpotifyUser] = useState(null);
  const [spotifyPlaylists, setSpotifyPlaylists] = useState([]);
  const [spotifyActivePlaylistId, setSpotifyActivePlaylistId] = useState("");
  const [spotifyTracks, setSpotifyTracks] = useState([]);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifyError, setSpotifyError] = useState("");

  const audioRef = useRef(null);
  const audioCtxRef = useRef(null);
  const eqFiltersRef = useRef([]);

  const currentUser = useMemo(() => users.find((u) => u.id === session?.userId) || null, [users, session]);
  const profileUser = useMemo(() => {
    if (!currentUser) return null;
    if (!viewedProfileId) return currentUser;
    return users.find((u) => u.id === viewedProfileId) || currentUser;
  }, [users, currentUser, viewedProfileId]);

  const tracks = data?.tracks || [];
  const playlists = data?.playlists || [];
  const trackIndex = tracks.findIndex((t) => t.id === currentTrackId);
  const currentTrack = tracks[trackIndex] || tracks[0] || null;

  useEffect(() => {
    localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    if (!session) localStorage.removeItem(AUTH_SESSION_KEY);
    else localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  }, [session]);

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
  }, []);

  useEffect(() => {
    localStorage.setItem(SPOTIFY_SETTINGS_KEY, JSON.stringify({ clientId: spotifyClientId.trim(), redirectUri: spotifyRedirectUri.trim() }));
  }, [spotifyClientId, spotifyRedirectUri]);

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data, null, 2));
  }, [data]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = volume;
  }, [volume]);

  const ensureAudioGraph = () => {
    if (!audioRef.current || audioCtxRef.current) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = ctx.createMediaElementSource(audioRef.current);
    let prev = source;
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
  };

  useEffect(() => {
    if (!eqFiltersRef.current.length || !audioCtxRef.current) return;
    const gains = eqPreset === "custom" ? eqCustomGains : EQ_PRESET_GAINS;
    eqFiltersRef.current.forEach((f, i) => {
      const gain = eqEnabled ? (gains[i] || 0) : 0;
      f.gain.setTargetAtTime(gain, audioCtxRef.current.currentTime, 0.05);
    });
  }, [eqPreset, eqCustomGains, eqEnabled]);

  const spotifyApi = async (path) => {
    if (!spotifyToken?.accessToken) throw new Error("Нет токена Spotify");
    const res = await fetch(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${spotifyToken.accessToken}` } });
    if (res.status === 401) throw new Error("Сессия Spotify истекла. Войдите снова.");
    const raw = await res.text();
    let json = null;
    try { json = raw ? JSON.parse(raw) : {}; } catch { json = null; }
    if (!res.ok) {
      const msg = json?.error?.message || raw;
      if (msg && /premium/i.test(msg)) throw new Error("Spotify API ограничен. Нужен Premium для части функций.");
      throw new Error(msg || "Ошибка Spotify API");
    }
    if (!json) throw new Error("Spotify вернул неожиданный формат ответа.");
    return json;
  };

  const loadSpotifyHome = async () => {
    if (!spotifyToken?.accessToken) return;
    setSpotifyLoading(true);
    setSpotifyError("");
    try {
      const [me, pls] = await Promise.all([spotifyApi("/me"), spotifyApi("/me/playlists?limit=20")]);
      setSpotifyUser(me);
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

  const onAuthSubmit = (e) => {
    e.preventDefault();
    setAuthError("");
    const username = authForm.username.trim();
    const email = authForm.email.trim().toLowerCase();
    const password = authForm.password;

    if (authMode === "register") {
      if (!username || !email || !password) return setAuthError("Заполни все поля.");
      if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) return setAuthError("Такой ник уже занят.");
      if (users.some((u) => u.email === email)) return setAuthError("Пользователь с таким email уже существует.");
      let role = users.length === 0 ? "admin" : "user";
      if (username.toLowerCase() === "horonsky") role = "admin";
      const user = {
        id: `u_${Date.now()}`,
        username,
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
      setAuthForm({ username: "", email: "", password: "" });
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
    setAuthForm({ username: "", email: "", password: "" });
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
    setUsers((prev) => prev.map((u) => (u.id === currentUser.id ? { ...u, ...patch } : u)));
  };

  const setRole = (id, role) => {
    if (currentUser?.role !== "admin") return;
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
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
    setViewedProfileId(id);
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
    const reader = new FileReader();
    reader.onload = (e) => {
      const value = e.target?.result;
      if (typeof value === "string") {
        updateCurrentUser({ [kind]: value });
        setProfileError("");
        setProfileMessage(kind === "avatar" ? "Аватар обновлен." : "Обложка обновлена.");
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
    return users.filter((u) => u.username.toLowerCase().includes(t));
  }, [users, query]);

  const myFriends = useMemo(() => users.filter((u) => currentUser?.friends.includes(u.id)), [users, currentUser]);

  const playTrackById = (id) => {
    setCurrentTrackId(id);
    setTimeout(() => {
      if (!audioRef.current) return;
      ensureAudioGraph();
      audioRef.current.play().catch(() => {});
      if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume().catch(() => {});
      setIsPlaying(true);
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
    audioRef.current.play().catch(() => {});
    if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume().catch(() => {});
    setIsPlaying(true);
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

  const updateEqCustomGain = (idx, value) => {
    setEqPreset("custom");
    setEqCustomGains((prev) => prev.map((x, i) => (i === idx ? value : x)));
  };

  if (!currentUser) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <img src="./logo.png" alt="logo" className="auth-logo" />
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
            {(authMode === "register" || (authMode === "login" && loginMethod === "email")) && (
              <input className="field" type="email" placeholder="Email" value={authForm.email} onChange={(e) => setAuthForm((p) => ({ ...p, email: e.target.value }))} />
            )}
            <input className="field" type="password" placeholder="Пароль" value={authForm.password} onChange={(e) => setAuthForm((p) => ({ ...p, password: e.target.value }))} />
            {authError && <p className="spotify-error">{authError}</p>}
            <button className="small-btn auth-submit" type="submit">{authMode === "login" ? "Войти" : "Создать аккаунт"}</button>
          </form>
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
    <div className="app">
      <aside className="sidebar">
        <button className="logo-link" onClick={() => { setActiveView("home"); setViewedProfileId(null); }} title="На главную">
          <img className="logo" src="./logo.png" alt="Лого" />
        </button>

        <nav className="menu">
          <button className={`menu-btn ${activeView === "search" ? "active" : ""}`} onClick={() => setActiveView("search")}>Поиск</button>
          <button className={`menu-btn ${activeView === "home" ? "active" : ""}`} onClick={() => { setActiveView("home"); setViewedProfileId(null); }}>Главная</button>
          <button className={`menu-btn ${activeView === "collection" ? "active" : ""}`} onClick={() => setActiveView("collection")}>Spotify</button>
          <button className={`menu-btn ${activeView === "developers" ? "active" : ""}`} onClick={() => setActiveView("developers")}>Разработчики</button>
        </nav>

        <div className="user-box">
          <p className="muted">Роль: <span className="role-tag">{currentUser.role}</span></p>
          <p className="muted">Пользователь: <Nick user={currentUser} /></p>
        </div>

        <button className={`menu-btn profile-nav ${activeView === "profile" ? "active" : ""}`} onClick={() => { setActiveView("profile"); setViewedProfileId(null); setEditProfileMode(false); }}>Профиль</button>
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
                      <p className="muted">{u.role}</p>
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
                <label className="muted">Обложка профиля (точно 1280x500)</label>
                <input className="field" type="file" accept={currentUser.role === "admin" || currentUser.role === "moderator" ? ".png,.jpg,.jpeg,.gif" : ".png,.jpg,.jpeg"} onChange={(e) => onImagePick("banner", e.target.files?.[0])} />
              </div>
            )}

            {profileError && <p className="spotify-error" style={{ marginTop: 12 }}>{profileError}</p>}
            {profileMessage && <p className="ok-msg" style={{ marginTop: 12 }}>{profileMessage}</p>}

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

                {currentUser.role === "admin" && (
                  <>
                    <h3 className="sub-title" style={{ marginTop: 18 }}>Роли пользователей</h3>
                    <div className="user-grid">
                      {users.map((u) => (
                        <div className="card" key={u.id}>
                          <button className="link-btn" onClick={() => openProfile(u.id)}><Nick user={u} /></button>
                          <select className="field" value={u.role} onChange={(e) => setRole(u.id, e.target.value)}>
                            <option value="user">user</option>
                            <option value="moderator">moderator</option>
                            <option value="admin">admin</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </section>
        )}

        {activeView === "developers" && (
          <section>
            <h2 className="section-title">Разработчики</h2>
            <div className="user-grid">
              <div className="card">
                <button className="link-btn" onClick={() => openProfileByUsername("jessew1lliams")}>
                  <span style={{ color: "#fff", textShadow: "0 0 10px #fff", fontWeight: 800 }}>jessew1lliams</span>
                </button>
                <p className="muted">Founder</p>
              </div>
              <div className="card">
                <button className="link-btn" onClick={() => openProfileByUsername("HORONSKY")}>HORONSKY</button>
                <p className="muted">Co-Founder / после регистрации получит такой же доступ</p>
              </div>
            </div>
          </section>
        )}

        {activeView === "collection" && (
          <section>
            <h2 className="section-title">Spotify</h2>
            <div className="card">
              <div className="row"><input className="field" placeholder="Spotify Client ID" value={spotifyClientId} onChange={(e) => setSpotifyClientId(e.target.value)} /><input className="field" placeholder="Redirect URI" value={spotifyRedirectUri} onChange={(e) => setSpotifyRedirectUri(e.target.value)} /></div>
              <div className="row">{!spotifyToken && <button className="small-btn" onClick={startSpotifyLogin}>Войти через Spotify</button>}{spotifyToken && <button className="small-btn" onClick={loadSpotifyHome}>Обновить Spotify</button>}{spotifyToken && <button className="small-btn" onClick={spotifyLogout}>Выйти из Spotify</button>}</div>
              {spotifyUser && <p className="muted">Вход выполнен: {spotifyUser.display_name || spotifyUser.id}</p>}
              {spotifyError && <p className="spotify-error">{spotifyError}</p>}
              {spotifyLoading && <p className="muted">Загрузка Spotify...</p>}
            </div>
            {spotifyPlaylists.length > 0 && <div className="playlist-list" style={{ marginTop: 12 }}>{spotifyPlaylists.map((p) => <div key={p.id} className={`card ${spotifyActivePlaylistId === p.id ? "playlist-active" : ""}`}><img className="cover" src={p.images?.[0]?.url || "https://placehold.co/600x600/000/fff?text=Spotify"} alt={p.name} /><h3>{p.name}</h3><div className="row"><button className="small-btn" onClick={() => setSpotifyActivePlaylistId(p.id)}>Открыть</button><a className="small-btn" href={p.external_urls?.spotify} target="_blank" rel="noreferrer">В Spotify</a></div></div>)}</div>}
            {spotifyActivePlaylistId && <div className="card" style={{ marginTop: 12 }}><h3>Треки Spotify плейлиста</h3>{spotifyTracks.length === 0 ? <p className="muted">Нет треков или доступ ограничен.</p> : spotifyTracks.map((t) => <div key={t.id || t.uri} className="playlist-track-row"><div><div>{t.name}</div><div className="muted">{(t.artists || []).map((a) => a.name).join(", ")}</div></div><div className="row">{t.preview_url && <audio controls src={t.preview_url} preload="none" />}<a className="small-btn" href={t.external_urls?.spotify} target="_blank" rel="noreferrer">Открыть</a></div></div>)}</div>}
          </section>
        )}
      </main>

      <footer className="player">
        <div className="player-progress-wrap"><input className="progress" type="range" min="0" max={duration || 0} step="0.1" value={progress} onChange={(e) => { const n = Number(e.target.value); setProgress(n); if (audioRef.current) audioRef.current.currentTime = n; }} /></div>
        <div className="player-left">{currentTrack ? <><img className="player-cover" src={currentTrack.cover} alt={currentTrack.title} /><div><div>{currentTrack.title}</div><div className="muted">{currentTrack.artist}</div></div></> : <div className="muted">Трек не выбран</div>}</div>
        <div className="player-center"><div className="controls centered-controls"><button className="icon-btn" onClick={onPlayPause}>{isPlaying ? "Пауза" : "Пуск"}</button><button className="icon-btn" onClick={onStop}>Стоп</button></div><div className="muted" style={{ textAlign: "center" }}>{formatTime(progress)} / {formatTime(duration)}</div></div>
        <div className="player-right"><input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(Number(e.target.value))} /><div className="player-menu-wrap"><button className="icon-btn dots-btn" onClick={() => setPlayerMenuOpen((v) => !v)}>...</button>{playerMenuOpen && <div className="player-menu"><div className="menu-block"><div className="menu-title">Добавить в плейлист</div><select className="small-btn" value={selectedPlaylistId} onChange={(e) => setSelectedPlaylistId(e.target.value)}><option value="">Выберите плейлист</option>{playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="small-btn" onClick={addCurrentTrackToPlaylist}>Добавить</button></div><div className="menu-block"><div className="menu-title">Качество</div><div className="quality-pill">{detectAudioQuality(currentTrack)}</div></div><div className="menu-block"><button className="small-btn" onClick={() => setEqOpen((v) => !v)}>{eqOpen ? "Скрыть эквалайзер" : "Открыть эквалайзер"}</button></div>{eqOpen && <div className="eq-panel-modern"><div className="eq-top-row"><h4>Эквалайзер</h4><label className="eq-switch"><input type="checkbox" checked={eqEnabled} onChange={(e) => setEqEnabled(e.target.checked)} /><span className="eq-switch-ui" /></label></div><div className="eq-grid">{EQ_FREQUENCIES.map((freq, idx) => <label key={freq} className="eq-band"><input type="range" min="-12" max="12" step="1" value={eqPreset === "custom" ? eqCustomGains[idx] : EQ_PRESET_GAINS[idx]} onChange={(e) => updateEqCustomGain(idx, Number(e.target.value))} disabled={!eqEnabled} /><span>{freq >= 1000 ? `${Math.round(freq / 1000)}k` : freq}</span></label>)}</div><select className="eq-preset-select" value={eqPreset} onChange={(e) => setEqPreset(e.target.value)}><option value="studio">Сцена Live</option><option value="custom">Своя настройка</option></select></div>}</div>}</div></div>
        <audio ref={audioRef} src={currentTrack?.audio || ""} onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration || 0); setProgress(0); }} onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime || 0)} onEnded={onStop} />
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
