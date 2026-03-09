const { useEffect, useMemo, useRef, useState } = React;

const STORAGE_KEY = "chance_music_data_v4";
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

const FALLBACK_DATA = {
  site: { logo: "./logo.png" },
  tracks: [],
  playlists: [],
  user: { collectionTrackIds: [] }
};

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
    banner: u.banner || "https://placehold.co/1280x500/000/fff?text=Banner+1280x500",
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

  const [currentTrackId, setCurrentTrackId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [equalizerOpen, setEqualizerOpen] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [activePlaylistId, setActivePlaylistId] = useState("");

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

  const currentUser = useMemo(() => users.find((u) => u.id === session?.userId) || null, [users, session]);
  const profileUser = useMemo(() => {
    if (!currentUser) return null;
    if (!viewedProfileId) return currentUser;
    return users.find((u) => u.id === viewedProfileId) || currentUser;
  }, [users, currentUser, viewedProfileId]);

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
        const json = await res.json();
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
        setData(parsed);
        setCurrentTrackId(parsed.tracks?.[0]?.id || null);
        setActivePlaylistId(parsed.playlists?.[0]?.id || "");
        return;
      } catch {}
    }
    fetch("./data.json")
      .then((r) => r.json())
      .then((json) => {
        const d = { ...json, site: { ...json.site, logo: "./logo.png" } };
        setData(d);
        setCurrentTrackId(d.tracks?.[0]?.id || null);
        setActivePlaylistId(d.playlists?.[0]?.id || "");
      })
      .catch(() => setData(FALLBACK_DATA));
  }, []);

  useEffect(() => {
    if (!data) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data, null, 2));
  }, [data]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

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
    if (!spotifyActivePlaylistId || !spotifyToken?.accessToken) { setSpotifyTracks([]); return; }
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
      if (!username || !email || !password) {
        setAuthError("Заполни все поля.");
        return;
      }
      if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
        setAuthError("Такой ник уже занят.");
        return;
      }
      if (users.some((u) => u.email === email)) {
        setAuthError("Пользователь с таким email уже существует.");
        return;
      }
      let role = users.length === 0 ? "admin" : "user";
      if (username.toLowerCase() === "horonsky") role = "admin";
      const user = {
        id: `u_${Date.now()}`,
        username,
        email,
        password,
        role,
        avatar: "https://placehold.co/160x160/000/fff?text=Avatar",
        banner: "https://placehold.co/1280x500/000/fff?text=Banner+1280x500",
        friends: [],
        nicknameChangedAt: 0,
        nickStyle: { color: "#ffffff", glow: false }
      };
      setUsers((prev) => [...prev, user]);
      setSession({ userId: user.id });
      setAuthForm({ username: "", email: "", password: "" });
      return;
    }

    if (!password) {
      setAuthError("Введи пароль.");
      return;
    }

    let found = null;
    if (loginMethod === "email") {
      if (!email) {
        setAuthError("Введи email.");
        return;
      }
      found = users.find((u) => u.email === email && u.password === password);
    } else {
      if (!username) {
        setAuthError("Введи логин.");
        return;
      }
      found = users.find((u) => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
    }

    if (!found) {
      setAuthError("Неверные данные для входа.");
      return;
    }
    setSession({ userId: found.id });
    setAuthForm({ username: "", email: "", password: "" });
  };

  const onLogout = () => {
    setSession(null);
    setAuthMode("login");
    setAuthError("");
    setViewedProfileId(null);
    setEditProfileMode(false);
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
    setProfileError("");
    setProfileMessage("");
  };

  const openProfileByUsername = (username) => {
    const found = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
    if (found) openProfile(found.id);
  };

  const changeNickname = () => {
    if (!currentUser) return;
    setProfileError("");
    setProfileMessage("");
    const nick = newNick.trim();
    if (!nick) return setProfileError("Ник не может быть пустым.");
    if (confirmPassword !== currentUser.password) {
      return setProfileError("Для смены ника введи текущий пароль.");
    }
    if (users.some((u) => u.id !== currentUser.id && u.username.toLowerCase() === nick.toLowerCase())) {
      return setProfileError("Такой ник уже занят.");
    }
    const wait = NICK_COOLDOWN - (Date.now() - (currentUser.nicknameChangedAt || 0));
    if (currentUser.nicknameChangedAt && wait > 0) {
      return setProfileError(`Ник можно менять раз в 12 часов. Осталось ~${Math.ceil(wait / 3600000)} ч.`);
    }
    updateCurrentUser({ username: nick, nicknameChangedAt: Date.now() });
    setNewNick("");
    setConfirmPassword("");
    setProfileMessage("Ник обновлен.");
  };

  const onImagePick = (kind, file) => {
    if (!currentUser || !file) return;
    const privileged = currentUser.role === "admin" || currentUser.role === "moderator";
    const allowed = privileged ? ["image/png", "image/jpeg", "image/gif"] : ["image/png", "image/jpeg"];
    if (!allowed.includes(file.type)) {
      setProfileError(privileged ? "Можно загружать PNG, JPEG, GIF." : "Можно загружать только PNG или JPEG.");
      return;
    }
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

  const tracks = data?.tracks || [];
  const playlists = data?.playlists || [];
  const trackIndex = tracks.findIndex((t) => t.id === currentTrackId);
  const currentTrack = tracks[trackIndex] || tracks[0] || null;

  const filteredTracks = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return [];
    return tracks.filter((x) => `${x.title} ${x.artist}`.toLowerCase().includes(t));
  }, [tracks, query]);

  const filteredUsers = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return [];
    return users.filter((u) => u.username.toLowerCase().includes(t) || u.email.toLowerCase().includes(t));
  }, [users, query]);

  const waveTracks = useMemo(() => [...tracks].sort(() => Math.random() - 0.5).slice(0, 6), [tracks]);

  const today = new Date().toISOString().slice(0, 10);
  const newTracks = tracks.filter((t) => !t.isUpcoming && t.releaseDate <= today);
  const upcomingTracks = tracks.filter((t) => t.isUpcoming || t.releaseDate > today);
  const collectionTracks = tracks.filter((t) => data?.user?.collectionTrackIds?.includes(t.id));

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) || null;
  const activePlaylistTracks = activePlaylist ? activePlaylist.trackIds.map((id) => tracks.find((t) => t.id === id)).filter(Boolean) : [];

  const playTrackById = (id) => {
    setCurrentTrackId(id);
    setTimeout(() => {
      if (!audioRef.current) return;
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }, 0);
  };

  const toggleLike = () => {
    if (!currentTrack) return;
    setData((prev) => ({ ...prev, tracks: prev.tracks.map((t) => t.id === currentTrack.id ? { ...t, liked: !t.liked } : t) }));
  };

  const onPlayPause = () => {
    if (!audioRef.current || !currentTrack) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const onPrev = () => {
    if (!tracks.length) return;
    const ni = trackIndex <= 0 ? tracks.length - 1 : trackIndex - 1;
    playTrackById(tracks[ni].id);
  };

  const onNext = () => {
    if (!tracks.length) return;
    const ni = trackIndex >= tracks.length - 1 ? 0 : trackIndex + 1;
    playTrackById(tracks[ni].id);
  };

  const addCurrentTrackToPlaylist = () => {
    if (!currentTrack || !selectedPlaylistId) return;
    setData((prev) => ({
      ...prev,
      playlists: prev.playlists.map((p) => {
        if (p.id !== selectedPlaylistId) return p;
        if (p.trackIds.includes(currentTrack.id)) return p;
        return { ...p, trackIds: [...p.trackIds, currentTrack.id] };
      })
    }));
  };

  const exportJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "chance-music-data.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        setData(imported);
        setCurrentTrackId(imported.tracks?.[0]?.id || null);
        setActivePlaylistId(imported.playlists?.[0]?.id || "");
      } catch {
        alert("Некорректный JSON-файл");
      }
    };
    reader.readAsText(file);
  };

  const resetStorage = () => {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
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
      <div className="row">
        <span className="badge">{track.releaseDate}</span>
        {track.isUpcoming ? <span className="badge">Скоро</span> : <span className="badge">Новый</span>}
      </div>
      <button className="small-btn" onClick={() => playTrackById(track.id)}>Слушать</button>
    </div>
  );

  const myFriends = users.filter((u) => currentUser.friends.includes(u.id));

  return (
    <div className="app">
      <aside className="sidebar">
        <button className="logo-link" onClick={() => { setActiveView("home"); setViewedProfileId(null); }} title="На главную">
          <img className="logo" src="./logo.png" alt="Лого" />
        </button>

        <nav className="menu">
          <button className={`menu-btn ${activeView === "search" ? "active" : ""}`} onClick={() => setActiveView("search")}>Поиск</button>
          <button className={`menu-btn ${activeView === "home" ? "active" : ""}`} onClick={() => { setActiveView("home"); setViewedProfileId(null); }}>Главная</button>
          <button className={`menu-btn ${activeView === "collection" ? "active" : ""}`} onClick={() => setActiveView("collection")}>Коллекция</button>
          <button className={`menu-btn ${activeView === "developers" ? "active" : ""}`} onClick={() => setActiveView("developers")}>Разработчики</button>
          <button className={`menu-btn profile-nav ${activeView === "profile" ? "active" : ""}`} onClick={() => { setActiveView("profile"); setViewedProfileId(null); setEditProfileMode(false); }}>Профиль</button>
        </nav>

        <div className="user-box">
          <p className="muted">Роль: <span className="role-tag">{currentUser.role}</span></p>
          <p className="muted">Пользователь: <Nick user={currentUser} /></p>
        </div>
      </aside>

      <main className="main">
        <div className="toolbar">
          <button className="small-btn" onClick={exportJson}>Экспорт JSON</button>
          <label className="small-btn">Импорт JSON<input hidden type="file" accept="application/json" onChange={(e) => importJson(e.target.files?.[0])} /></label>
          <button className="small-btn" onClick={resetStorage}>Сбросить localStorage</button>
        </div>

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
            <h2 className="section-title">Дай шанс этим трекам</h2>
            <div className="grid">{waveTracks.map((t) => <TrackCard key={`w-${t.id}`} track={t} />)}</div>
            <h2 className="section-title" style={{ marginTop: 24 }}>Новые треки</h2>
            <div className="grid">{newTracks.map((t) => <TrackCard key={t.id} track={t} />)}</div>
            <h2 className="section-title" style={{ marginTop: 24 }}>Скоро выйдут</h2>
            <div className="grid">{upcomingTracks.map((t) => <TrackCard key={t.id} track={t} />)}</div>
          </section>
        )}

        {activeView === "profile" && profileUser && (
          <section>
            <h2 className="section-title">Профиль</h2>
            <div className="profile-banner-wrap"><img src={profileUser.banner} alt="banner" className="profile-banner" /></div>
            <div className="card" style={{ marginTop: 12 }}>
              <div className="row">
                <img className="avatar" src={profileUser.avatar} alt="avatar" />
                <div>
                  <Nick user={profileUser} />
                  <p className="muted">{profileUser.email}</p>
                  <p className="muted">Роль: {profileUser.role}</p>
                </div>
              </div>

              {profileUser.id !== currentUser.id && (
                <button className="small-btn" onClick={() => addFriend(profileUser.id)}>{currentUser.friends.includes(profileUser.id) ? "Уже в друзьях" : "Добавить в друзья"}</button>
              )}

              {profileUser.id === currentUser.id && (
                <>
                  {!editProfileMode && <div className="row"><button className="small-btn" onClick={() => setEditProfileMode(true)}>Редактировать профиль</button><button className="small-btn" onClick={onLogout}>Выйти из аккаунта</button></div>}

                  {editProfileMode && (
                    <div className="card" style={{ background: "#0b0b0b" }}>
                      <label className="muted">Ник (можно менять 1 раз в 12 часов)</label>
                      <input className="field" value={newNick} onChange={(e) => setNewNick(e.target.value)} placeholder="Новый ник" />
                      <label className="muted">Подтверди текущий пароль для смены ника</label>
                      <input className="field" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Текущий пароль" />
                      <button className="small-btn" onClick={changeNickname}>Обновить ник</button>

                      <label className="muted">Аватар (PNG/JPEG{currentUser.role === "admin" || currentUser.role === "moderator" ? "/GIF" : ""})</label>
                      <input className="field" type="file" accept={currentUser.role === "admin" || currentUser.role === "moderator" ? ".png,.jpg,.jpeg,.gif" : ".png,.jpg,.jpeg"} onChange={(e) => onImagePick("avatar", e.target.files?.[0])} />

                      <label className="muted">Обложка профиля (рекомендуется 1280x500)</label>
                      <input className="field" type="file" accept={currentUser.role === "admin" || currentUser.role === "moderator" ? ".png,.jpg,.jpeg,.gif" : ".png,.jpg,.jpeg"} onChange={(e) => onImagePick("banner", e.target.files?.[0])} />

                      {(currentUser.role === "admin" || currentUser.role === "moderator") && (
                        <div className="row">
                          <input className="field" type="color" value={currentUser.nickStyle.color || "#ffffff"} onChange={(e) => updateCurrentUser({ nickStyle: { ...currentUser.nickStyle, color: e.target.value } })} />
                          <label className="muted row"><input type="checkbox" checked={Boolean(currentUser.nickStyle.glow)} onChange={(e) => updateCurrentUser({ nickStyle: { ...currentUser.nickStyle, glow: e.target.checked } })} />Свечение ника</label>
                        </div>
                      )}

                      <div className="row">
                        <button className="small-btn" onClick={() => setEditProfileMode(false)}>Готово</button>
                        <button className="small-btn" onClick={onLogout}>Выйти из аккаунта</button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {profileError && <p className="spotify-error">{profileError}</p>}
              {profileMessage && <p className="ok-msg">{profileMessage}</p>}
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

                {currentUser.role === "admin" && (
                  <>
                    <h3 className="sub-title" style={{ marginTop: 18 }}>Роли пользователей</h3>
                    <div className="user-grid">
                      {users.map((u) => (
                        <div className="card" key={u.id}>
                          <button className="link-btn" onClick={() => openProfile(u.id)}><Nick user={u} /></button>
                          <p className="muted">{u.email}</p>
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

            <h2 className="section-title" style={{ marginTop: 20 }}>Мои треки</h2>
            <div className="grid">{collectionTracks.map((t) => <TrackCard key={t.id} track={t} />)}</div>

            <h2 className="section-title" style={{ marginTop: 20 }}>Локальные плейлисты</h2>
            <div className="playlist-list">{playlists.map((p) => <div key={p.id} className={`card ${p.id === activePlaylistId ? "playlist-active" : ""}`} onClick={() => setActivePlaylistId(p.id)}><img className="cover" src={p.cover} alt={p.name} /><h3>{p.name}</h3><button className="small-btn" onClick={(e) => { e.stopPropagation(); if (p.trackIds?.length) playTrackById(p.trackIds[0]); }}>Слушать плейлист</button><p className="muted">Треков: {p.trackIds?.length || 0}</p></div>)}</div>
            {activePlaylist && <div className="card" style={{ marginTop: 12 }}><h3>Треки плейлиста: {activePlaylist.name}</h3>{activePlaylistTracks.map((t) => <div key={t.id} className="playlist-track-row"><div><div>{t.title}</div><div className="muted">{t.artist}</div></div><button className="small-btn" onClick={() => playTrackById(t.id)}>Слушать</button></div>)}</div>}
          </section>
        )}
      </main>

      <footer className="player">
        <div className="player-left">{currentTrack ? <><img className="player-cover" src={currentTrack.cover} alt={currentTrack.title} /><div><div>{currentTrack.title}</div><div className="muted">{currentTrack.artist}</div></div></> : <div className="muted">Трек не выбран</div>}</div>
        <div className="player-center"><div className="controls"><button className="icon-btn" onClick={onPrev}>◀◀</button><button className="icon-btn" onClick={onPlayPause}>{isPlaying ? "❚❚" : "▶"}</button><button className="icon-btn" onClick={onNext}>▶▶</button><button className="icon-btn" onClick={toggleLike}>{currentTrack?.liked ? "♥" : "♡"}</button></div><input className="progress" type="range" min="0" max={duration || 0} step="0.1" value={progress} onChange={(e) => { const n = Number(e.target.value); setProgress(n); if (audioRef.current) audioRef.current.currentTime = n; }} /><div className="muted" style={{ textAlign: "center" }}>{formatTime(progress)} / {formatTime(duration)}</div></div>
        <div className="player-right"><textarea className="lyrics-input" value={currentTrack?.lyrics || ""} onChange={(e) => { if (!currentTrack) return; setData((prev) => ({ ...prev, tracks: prev.tracks.map((t) => t.id === currentTrack.id ? { ...t, lyrics: e.target.value } : t) })); }} placeholder="Текст трека" /><select className="small-btn" value={selectedPlaylistId} onChange={(e) => setSelectedPlaylistId(e.target.value)}><option value="">Выберите плейлист</option>{playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="small-btn" onClick={addCurrentTrackToPlaylist}>Добавить в плейлист</button><button className="small-btn" onClick={() => setEqualizerOpen((v) => !v)}>Формат файла</button><select className="small-btn" value={currentTrack?.format || "MP3"} onChange={(e) => { if (!currentTrack) return; setData((prev) => ({ ...prev, tracks: prev.tracks.map((t) => t.id === currentTrack.id ? { ...t, format: e.target.value } : t) })); }}><option>MP3</option><option>FLAC</option><option>WAV</option><option>AAC</option></select><input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(Number(e.target.value))} />{equalizerOpen && <div className="eq-panel"><label>Bass <input type="range" min="-10" max="10" defaultValue="0" /></label><label>Mid <input type="range" min="-10" max="10" defaultValue="0" /></label><label>High <input type="range" min="-10" max="10" defaultValue="0" /></label></div>}</div>
        <audio ref={audioRef} src={currentTrack?.audio || ""} onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration || 0); setProgress(0); }} onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime || 0)} onEnded={onNext} />
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);





