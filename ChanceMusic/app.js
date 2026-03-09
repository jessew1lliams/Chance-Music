const { useEffect, useMemo, useRef, useState } = React;

const STORAGE_KEY = "chance_music_data_v2";
const SITE_NAME = "Шанс | Music";
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
  site: {
    logo: "https://placehold.co/64x64/111827/F9FAFB?text=LOGO"
  },
  tracks: [],
  playlists: [],
  user: { collectionTrackIds: [] }
};

function formatTime(value) {
  if (!Number.isFinite(value)) return "0:00";
  const min = Math.floor(value / 60);
  const sec = Math.floor(value % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function randomString(length = 64) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  let result = "";
  for (let i = 0; i < length; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

function App() {
  const [data, setData] = useState(null);
  const [activeView, setActiveView] = useState("home");
  const [query, setQuery] = useState("");
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

  useEffect(() => {
    const savedSettings = localStorage.getItem(SPOTIFY_SETTINGS_KEY);
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        if (parsed.clientId) setSpotifyClientId(parsed.clientId);
        if (parsed.redirectUri) setSpotifyRedirectUri(parsed.redirectUri);
      } catch {}
    }

    const savedAuth = localStorage.getItem(SPOTIFY_AUTH_KEY);
    if (savedAuth) {
      try {
        const parsed = JSON.parse(savedAuth);
        if (parsed.accessToken && parsed.expiresAt > Date.now()) {
          setSpotifyToken(parsed);
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      SPOTIFY_SETTINGS_KEY,
      JSON.stringify({ clientId: spotifyClientId.trim(), redirectUri: spotifyRedirectUri.trim() })
    );
  }, [spotifyClientId, spotifyRedirectUri]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (!code) return;

    const clientId = spotifyClientId || JSON.parse(localStorage.getItem(SPOTIFY_SETTINGS_KEY) || "{}").clientId;
    const redirectUri = spotifyRedirectUri || JSON.parse(localStorage.getItem(SPOTIFY_SETTINGS_KEY) || "{}").redirectUri;
    const verifier = localStorage.getItem(SPOTIFY_VERIFIER_KEY);
    const expectedState = localStorage.getItem(SPOTIFY_STATE_KEY);

    if (!clientId || !redirectUri || !verifier) {
      setSpotifyError("Не удалось завершить вход Spotify: нет client id / redirect uri / code verifier.");
      return;
    }

    if (expectedState && state !== expectedState) {
      setSpotifyError("Ошибка безопасности Spotify: state не совпал.");
      return;
    }

    const exchange = async () => {
      setSpotifyLoading(true);
      setSpotifyError("");
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
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body
        });

        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error_description || json.error || "Ошибка получения токена");
        }

        const tokenData = {
          accessToken: json.access_token,
          expiresAt: Date.now() + (json.expires_in - 30) * 1000
        };

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
      } catch (err) {
        console.error("Storage parse error", err);
      }
    }

    fetch("./data.json")
      .then((r) => r.json())
      .then((json) => {
        setData(json);
        setCurrentTrackId(json.tracks?.[0]?.id || null);
        setActivePlaylistId(json.playlists?.[0]?.id || "");
      })
      .catch(() => {
        setData(FALLBACK_DATA);
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

  const spotifyApi = async (path) => {
    if (!spotifyToken?.accessToken) throw new Error("Нет токена Spotify");
    const res = await fetch(`https://api.spotify.com/v1${path}`, {
      headers: {
        Authorization: `Bearer ${spotifyToken.accessToken}`
      }
    });

    if (res.status === 401) {
      throw new Error("Сессия Spotify истекла. Войдите снова.");
    }

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error?.message || "Ошибка Spotify API");
    }
    return json;
  };

  const loadSpotifyHome = async () => {
    if (!spotifyToken?.accessToken) return;
    setSpotifyLoading(true);
    setSpotifyError("");
    try {
      const [me, playlistsRes] = await Promise.all([
        spotifyApi("/me"),
        spotifyApi("/me/playlists?limit=20")
      ]);

      setSpotifyUser(me);
      setSpotifyPlaylists(playlistsRes.items || []);
      if ((playlistsRes.items || []).length > 0) {
        setSpotifyActivePlaylistId((prev) => prev || playlistsRes.items[0].id);
      }
    } catch (err) {
      setSpotifyError(err.message);
    } finally {
      setSpotifyLoading(false);
    }
  };

  useEffect(() => {
    loadSpotifyHome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotifyToken?.accessToken]);

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
        setSpotifyTracks((res.items || []).map((item) => item.track).filter(Boolean));
      } catch (err) {
        setSpotifyError(err.message);
      } finally {
        setSpotifyLoading(false);
      }
    };

    loadTracks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotifyActivePlaylistId, spotifyToken?.accessToken]);

  const startSpotifyLogin = async () => {
    const clientId = spotifyClientId.trim();
    const redirectUri = spotifyRedirectUri.trim();

    if (!clientId || !redirectUri) {
      setSpotifyError("Укажи Spotify Client ID и Redirect URI.");
      return;
    }

    setSpotifyError("");
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

  const tracks = data?.tracks || [];
  const playlists = data?.playlists || [];
  const trackIndex = tracks.findIndex((t) => t.id === currentTrackId);
  const currentTrack = tracks[trackIndex] || tracks[0] || null;

  const filteredTracks = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return [];
    return tracks.filter((t) => `${t.title} ${t.artist}`.toLowerCase().includes(text));
  }, [tracks, query]);

  const waveTracks = useMemo(() => {
    const base = [...tracks];
    base.sort(() => Math.random() - 0.5);
    return base.slice(0, 6);
  }, [tracks]);

  const today = new Date().toISOString().slice(0, 10);
  const newTracks = tracks.filter((t) => !t.isUpcoming && t.releaseDate <= today);
  const upcomingTracks = tracks.filter((t) => t.isUpcoming || t.releaseDate > today);

  const collectionTracks = tracks.filter((t) => data?.user?.collectionTrackIds?.includes(t.id));

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) || null;
  const activePlaylistTracks = activePlaylist
    ? activePlaylist.trackIds.map((id) => tracks.find((t) => t.id === id)).filter(Boolean)
    : [];

  const updateTrack = (id, patch) => {
    setData((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t))
    }));
  };

  const updatePlaylist = (id, patch) => {
    setData((prev) => ({
      ...prev,
      playlists: prev.playlists.map((p) => (p.id === id ? { ...p, ...patch } : p))
    }));
  };

  const toggleLike = () => {
    if (!currentTrack) return;
    updateTrack(currentTrack.id, { liked: !currentTrack.liked });
  };

  const playTrackById = (id) => {
    setCurrentTrackId(id);
    setTimeout(() => {
      if (!audioRef.current) return;
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }, 0);
  };

  const playPlaylist = (playlist) => {
    if (!playlist?.trackIds?.length) return;
    playTrackById(playlist.trackIds[0]);
  };

  const onPlayPause = () => {
    if (!audioRef.current || !currentTrack) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }
    audioRef.current.play().catch(() => {});
    setIsPlaying(true);
  };

  const onPrev = () => {
    if (!tracks.length) return;
    const nextIndex = trackIndex <= 0 ? tracks.length - 1 : trackIndex - 1;
    playTrackById(tracks[nextIndex].id);
  };

  const onNext = () => {
    if (!tracks.length) return;
    const nextIndex = trackIndex >= tracks.length - 1 ? 0 : trackIndex + 1;
    playTrackById(tracks[nextIndex].id);
  };

  const onSeek = (value) => {
    const n = Number(value);
    setProgress(n);
    if (audioRef.current) audioRef.current.currentTime = n;
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
      <button className="small-btn" onClick={() => playTrackById(track.id)}>
        Слушать
      </button>
    </div>
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img className="logo" src={data.site.logo} alt="Лого" />
          <div className="site-name">{SITE_NAME}</div>
        </div>

        <nav className="menu">
          <button className={`menu-btn ${activeView === "search" ? "active" : ""}`} onClick={() => setActiveView("search")}>Поиск</button>
          <button className={`menu-btn ${activeView === "home" ? "active" : ""}`} onClick={() => setActiveView("home")}>Главная</button>
          <button className={`menu-btn ${activeView === "collection" ? "active" : ""}`} onClick={() => setActiveView("collection")}>Коллекция</button>
        </nav>

        <p className="muted">Лого можно менять в `data.json`, название зафиксировано.</p>
      </aside>

      <main className="main">
        <div className="toolbar">
          <button className="small-btn" onClick={exportJson}>Экспорт JSON</button>
          <label className="small-btn">
            Импорт JSON
            <input hidden type="file" accept="application/json" onChange={(e) => importJson(e.target.files?.[0])} />
          </label>
          <button className="small-btn" onClick={resetStorage}>Сбросить localStorage</button>
        </div>

        {activeView === "search" && (
          <section>
            <h2 className="section-title">Поиск треков</h2>
            <input
              className="search-box"
              placeholder="Введите название трека или артиста"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {!query.trim() && <p className="muted" style={{ marginTop: 12 }}>Начни вводить запрос, и я покажу треки.</p>}
            {query.trim() && filteredTracks.length === 0 && <p className="muted" style={{ marginTop: 12 }}>Ничего не найдено.</p>}
            <div className="grid" style={{ marginTop: 14 }}>
              {filteredTracks.map((track) => (
                <TrackCard key={track.id} track={track} />
              ))}
            </div>
          </section>
        )}

        {activeView === "home" && (
          <section>
            <h2 className="section-title">Дай шанс этим трекам</h2>
            <div className="grid">
              {waveTracks.map((track) => (
                <TrackCard key={`wave-${track.id}`} track={track} />
              ))}
            </div>

            <h2 className="section-title" style={{ marginTop: 24 }}>Новые треки</h2>
            <div className="grid">
              {newTracks.map((track) => (
                <TrackCard key={track.id} track={track} />
              ))}
            </div>

            <h2 className="section-title" style={{ marginTop: 24 }}>Скоро выйдут</h2>
            <div className="grid">
              {upcomingTracks.map((track) => (
                <TrackCard key={track.id} track={track} />
              ))}
            </div>
          </section>
        )}

        {activeView === "collection" && (
          <section>
            <h2 className="section-title">Spotify</h2>
            <div className="card">
              <div className="row">
                <input
                  className="field"
                  placeholder="Spotify Client ID"
                  value={spotifyClientId}
                  onChange={(e) => setSpotifyClientId(e.target.value)}
                />
                <input
                  className="field"
                  placeholder="Redirect URI"
                  value={spotifyRedirectUri}
                  onChange={(e) => setSpotifyRedirectUri(e.target.value)}
                />
              </div>
              <div className="row">
                {!spotifyToken && <button className="small-btn" onClick={startSpotifyLogin}>Войти через Spotify</button>}
                {spotifyToken && <button className="small-btn" onClick={loadSpotifyHome}>Обновить Spotify</button>}
                {spotifyToken && <button className="small-btn" onClick={spotifyLogout}>Выйти из Spotify</button>}
              </div>
              {spotifyUser && <p className="muted">Вход выполнен: {spotifyUser.display_name || spotifyUser.id}</p>}
              {spotifyError && <p className="spotify-error">{spotifyError}</p>}
              {spotifyLoading && <p className="muted">Загрузка Spotify...</p>}
            </div>

            {spotifyPlaylists.length > 0 && (
              <>
                <h2 className="section-title" style={{ marginTop: 20 }}>Плейлисты Spotify</h2>
                <div className="playlist-list">
                  {spotifyPlaylists.map((playlist) => (
                    <div
                      key={`sp-${playlist.id}`}
                      className={`card ${spotifyActivePlaylistId === playlist.id ? "playlist-active" : ""}`}
                    >
                      <img
                        className="cover"
                        src={playlist.images?.[0]?.url || "https://placehold.co/600x600/111827/f9fafb?text=Spotify"}
                        alt={playlist.name}
                      />
                      <h3>{playlist.name}</h3>
                      <p className="muted">Треков: {playlist.tracks?.total || 0}</p>
                      <div className="row">
                        <button className="small-btn" onClick={() => setSpotifyActivePlaylistId(playlist.id)}>Открыть</button>
                        <a className="small-btn" href={playlist.external_urls?.spotify} target="_blank" rel="noreferrer">В Spotify</a>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {spotifyActivePlaylistId && (
              <div className="card" style={{ marginTop: 16 }}>
                <h3>Треки Spotify плейлиста</h3>
                {spotifyTracks.length === 0 && <p className="muted">Нет треков или доступ ограничен.</p>}
                {spotifyTracks.map((track) => (
                  <div key={`s-track-${track.id || track.uri}`} className="playlist-track-row">
                    <div>
                      <div>{track.name}</div>
                      <div className="muted">{(track.artists || []).map((a) => a.name).join(", ")}</div>
                    </div>
                    <div className="row">
                      {track.preview_url && <audio controls src={track.preview_url} preload="none" />}
                      <a className="small-btn" href={track.external_urls?.spotify} target="_blank" rel="noreferrer">Открыть</a>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <h2 className="section-title" style={{ marginTop: 24 }}>Мои треки</h2>
            <div className="grid">
              {collectionTracks.map((track) => (
                <TrackCard key={track.id} track={track} />
              ))}
            </div>

            <h2 className="section-title" style={{ marginTop: 24 }}>Локальные плейлисты</h2>
            <div className="playlist-list">
              {playlists.map((playlist) => {
                const playlistTracks = playlist.trackIds.map((id) => tracks.find((t) => t.id === id)).filter(Boolean);
                return (
                  <div
                    key={playlist.id}
                    className={`card ${playlist.id === activePlaylistId ? "playlist-active" : ""}`}
                    onClick={() => setActivePlaylistId(playlist.id)}
                  >
                    <img className="cover" src={playlist.cover} alt={playlist.name} />
                    <input
                      className="field"
                      value={playlist.name}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updatePlaylist(playlist.id, { name: e.target.value })}
                      placeholder="Название плейлиста"
                    />
                    <input
                      className="field"
                      value={playlist.cover}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updatePlaylist(playlist.id, { cover: e.target.value })}
                      placeholder="URL обложки"
                    />
                    <textarea
                      className="field"
                      value={playlist.description}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updatePlaylist(playlist.id, { description: e.target.value })}
                      placeholder="Описание"
                    />
                    <div className="row">
                      <button
                        className="small-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          updatePlaylist(playlist.id, {
                            descriptionVisible: !playlist.descriptionVisible
                          });
                        }}
                      >
                        {playlist.descriptionVisible ? "Скрыть описание" : "Показать описание"}
                      </button>
                      <button
                        className="small-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          playPlaylist(playlist);
                        }}
                      >
                        Слушать плейлист
                      </button>
                    </div>
                    {playlist.descriptionVisible && <p className="muted">{playlist.description || "Описание пустое"}</p>}
                    <p className="muted">Треков: {playlistTracks.length}</p>
                  </div>
                );
              })}
            </div>

            {activePlaylist && (
              <div className="card" style={{ marginTop: 16 }}>
                <h3>Треки плейлиста: {activePlaylist.name}</h3>
                {activePlaylistTracks.length === 0 && <p className="muted">В этом плейлисте пока нет треков.</p>}
                {activePlaylistTracks.map((track) => (
                  <div key={`playlist-track-${track.id}`} className="playlist-track-row">
                    <div>
                      <div>{track.title}</div>
                      <div className="muted">{track.artist}</div>
                    </div>
                    <button className="small-btn" onClick={() => playTrackById(track.id)}>Слушать</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="player">
        <div className="player-left">
          {currentTrack ? (
            <>
              <img className="player-cover" src={currentTrack.cover} alt={currentTrack.title} />
              <div>
                <div>{currentTrack.title}</div>
                <div className="muted">{currentTrack.artist}</div>
              </div>
            </>
          ) : (
            <div className="muted">Трек не выбран</div>
          )}
        </div>

        <div className="player-center">
          <div className="controls">
            <button className="icon-btn" onClick={onPrev}>◀◀</button>
            <button className="icon-btn" onClick={onPlayPause}>{isPlaying ? "❚❚" : "▶"}</button>
            <button className="icon-btn" onClick={onNext}>▶▶</button>
            <button className="icon-btn" onClick={toggleLike}>{currentTrack?.liked ? "♥" : "♡"}</button>
          </div>
          <input className="progress" type="range" min="0" max={duration || 0} step="0.1" value={progress} onChange={(e) => onSeek(e.target.value)} />
          <div className="muted" style={{ textAlign: "center" }}>
            {formatTime(progress)} / {formatTime(duration)}
          </div>
        </div>

        <div className="player-right">
          <textarea
            className="lyrics-input"
            value={currentTrack?.lyrics || ""}
            onChange={(e) => currentTrack && updateTrack(currentTrack.id, { lyrics: e.target.value })}
            placeholder="Текст трека"
          />

          <select className="small-btn" value={selectedPlaylistId} onChange={(e) => setSelectedPlaylistId(e.target.value)}>
            <option value="">Выберите плейлист</option>
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button className="small-btn" onClick={addCurrentTrackToPlaylist}>Добавить в плейлист</button>

          <button className="small-btn" onClick={() => setEqualizerOpen((v) => !v)}>Формат файла</button>
          <select
            className="small-btn"
            value={currentTrack?.format || "MP3"}
            onChange={(e) => currentTrack && updateTrack(currentTrack.id, { format: e.target.value })}
          >
            <option>MP3</option>
            <option>FLAC</option>
            <option>WAV</option>
            <option>AAC</option>
          </select>

          <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(Number(e.target.value))} />

          {equalizerOpen && (
            <div className="eq-panel">
              <label>Bass <input type="range" min="-10" max="10" defaultValue="0" /></label>
              <label>Mid <input type="range" min="-10" max="10" defaultValue="0" /></label>
              <label>High <input type="range" min="-10" max="10" defaultValue="0" /></label>
            </div>
          )}
        </div>

        <audio
          ref={audioRef}
          src={currentTrack?.audio || ""}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration || 0);
            setProgress(0);
          }}
          onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime || 0)}
          onEnded={onNext}
        />
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
