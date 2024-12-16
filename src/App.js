import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import {
  FaPlay, FaPause, FaStepForward, FaStepBackward,
  FaRandom, FaVolumeUp, FaVolumeMute, FaRedoAlt, FaList
} from 'react-icons/fa';

function App() {
  const [currentSongIndex, setCurrentSongIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [repeatMode, setRepeatMode] = useState('none'); // 'none', 'one', 'all'
  const [shuffleMode, setShuffleMode] = useState(false);
  const [playlist, setPlaylist] = useState([]);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [analyzerData, setAnalyzerData] = useState(new Uint8Array(64));
  const audioRef = useRef(null);
  const progressBarRef = useRef(null);
  const analyzerRef = useRef(null);
  const audioContextRef = useRef(null);
  const playlistRef = useRef(null);

  const configureAudioSession = () => {
    try {
      if (window.webkit && window.webkit.messageHandlers) {
        // iOS-specific audio session configuration
        if (window.webkit.messageHandlers.configureAudioSession) {
          window.webkit.messageHandlers.configureAudioSession.postMessage({
            category: 'playback',
            options: ['mixWithOthers', 'allowBluetooth', 'allowBluetoothA2DP']
          });
        }
      }
    } catch (error) {
      console.error('Error configuring audio session:', error);
    }
  };

  useEffect(() => {
    const loadSongs = () => {
      try {
        const songFiles = require.context('./assets/songs', false, /\.(mp3|wav)$/);
        const loadedSongs = songFiles.keys().map((key) => {
          const url = songFiles(key);
          const title = key.replace('./', '').replace(/\.(mp3|wav)$/, '');
          return {
            id: Math.random().toString(36).substr(2, 9),
            title,
            url,
          };
        });

        setPlaylist(loadedSongs);
      } catch (error) {
        console.error('Error loading songs:', error);
        setPlaylist([]);
      }
    };

    loadSongs();
  }, []);

  const handleNext = useCallback(() => {
    if (!playlist.length) return;

    let nextIndex;
    if (shuffleMode) {
      do {
        nextIndex = Math.floor(Math.random() * playlist.length);
      } while (nextIndex === currentSongIndex && playlist.length > 1);
    } else {
      nextIndex = (currentSongIndex + 1) % playlist.length;
    }

    setCurrentSongIndex(nextIndex);
  }, [playlist.length, currentSongIndex, shuffleMode]);

  const handlePrevious = useCallback(() => {
    if (!playlist.length) return;

    const prevIndex = (currentSongIndex - 1 + playlist.length) % playlist.length;
    setCurrentSongIndex(prevIndex);
  }, [playlist.length, currentSongIndex]);

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Configure audio session before playing
    configureAudioSession();

    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    if (isPlaying) {
      audio.pause();
    } else {
      // Play audio after user interaction
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            // Audio started playing
          })
          .catch(error => console.error('Playback failed:', error));
      }
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleProgressBarClick = (e) => {
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickPosition = (e.clientX - rect.left) / rect.width;
    const newTime = clickPosition * duration;

    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    audioRef.current.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const handleTouchVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    audioRef.current.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const formatTime = (time) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const toggleRepeatMode = () => {
    const modes = ['none', 'one', 'all'];
    setRepeatMode(modes[(modes.indexOf(repeatMode) + 1) % modes.length]);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateDuration = () => setDuration(audio.duration || 0);
    const updateTime = () => setCurrentTime(audio.currentTime || 0);

    const handleAudioEnded = () => {
      if (repeatMode === 'one') {
        audio.currentTime = 0;
        audio.play();
      } else if (repeatMode === 'all' || shuffleMode) {
        handleNext();
      } else if (currentSongIndex < playlist.length - 1) {
        handleNext();
      } else {
        setIsPlaying(false);
      }
    };

    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('ended', handleAudioEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('ended', handleAudioEnded);
    };
  }, [playlist, repeatMode, shuffleMode, handleNext, currentSongIndex]);

  // Modified useEffect to only update source when song changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playlist[currentSongIndex]) return;

    const currentSrc = audio.src;
    const newSrc = playlist[currentSongIndex].url;

    // Only update the source if it's different
    if (currentSrc !== newSrc) {
      audio.src = newSrc;
      if (isPlaying) {
        audio.play().catch((error) => console.error('Playback failed:', error));
      }
    }
  }, [currentSongIndex, playlist]);

  // Initialize audio context on user interaction
  const initializeAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      analyzerRef.current = audioContextRef.current.createAnalyser();
      analyzerRef.current.fftSize = 128;

      const audio = audioRef.current;
      if (!audio) return;

      try {
        const source = audioContextRef.current.createMediaElementSource(audio);
        source.connect(analyzerRef.current);
        analyzerRef.current.connect(audioContextRef.current.destination);
      } catch (error) {
        console.log('Audio already connected');
      }
    }

    // Resume audio context if it's suspended
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
  };

  // Set up analyzer update loop
  const updateAnalyzer = () => {
    if (analyzerRef.current) {
      const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount);
      analyzerRef.current.getByteFrequencyData(dataArray);
      setAnalyzerData(dataArray);
    }
    requestAnimationFrame(updateAnalyzer);
  };

  // Start analyzer update loop
  const animationFrame = requestAnimationFrame(updateAnalyzer);

  // Add click listener to initialize audio context
  document.addEventListener('click', initializeAudio, { once: true });

  // Add touch event listeners for mobile controls
  useEffect(() => {
    const handleTouchStart = () => {
      initializeAudio();
    };

    document.addEventListener('touchstart', handleTouchStart, { once: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (playlistRef.current && !playlistRef.current.contains(event.target) && 
          !event.target.closest('.playlist-toggle-btn')) {
        setShowPlaylist(false);
      }
    };

    if (showPlaylist) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPlaylist]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Add these properties for mobile background playback
    audio.setAttribute('playsinline', 'true');
    audio.setAttribute('webkit-playsinline', 'true');
    audio.setAttribute('x-webkit-airplay', 'allow');

    // Optional: Request wake lock to prevent device from sleeping
    try {
      if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').catch(err => 
          console.log('Wake Lock error:', err)
        );
      }
    } catch (err) {
      console.log('Wake Lock API not supported');
    }
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Enable background audio playback
    const enableBackgroundPlayback = async () => {
      try {
        // Configure audio session for iOS
        configureAudioSession();

        if ('mediaSession' in navigator) {
          navigator.mediaSession.setActionHandler('play', handlePlayPause);
          navigator.mediaSession.setActionHandler('pause', handlePlayPause);
          navigator.mediaSession.setActionHandler('previoustrack', handlePrevious);
          navigator.mediaSession.setActionHandler('nexttrack', handleNext);

          // Set metadata for iOS
          navigator.mediaSession.metadata = new MediaMetadata({
            title: playlist[currentSongIndex]?.title || 'Unknown',
            artist: 'Unknown Artist',
            album: 'Unknown Album',
          });
        }

        // iOS specific settings
        audio.setAttribute('playsinline', 'true');
        audio.setAttribute('webkit-playsinline', 'true');
        audio.setAttribute('x-webkit-airplay', 'allow');

        // Set audio session category (iOS)
        if (window.webkit && window.webkit.messageHandlers) {
          // Request audio session
          document.addEventListener('visibilitychange', () => {
            if (document.hidden && isPlaying) {
              audio.play().catch(error => console.error('Playback failed:', error));
            }
          });
        }
      } catch (error) {
        console.error('Error setting up background playback:', error);
      }
    };

    enableBackgroundPlayback();

    // Handle visibility change
    const handleVisibilityChange = () => {
      if (document.hidden && isPlaying) {
        audio.play().catch(error => console.error('Playback failed:', error));
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isPlaying, handlePlayPause, handlePrevious, handleNext, currentSongIndex, playlist]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleAppStateChange = () => {
      if (document.hidden) {
        // App going to background
        if (isPlaying) {
          // Ensure audio keeps playing
          audio.play().catch(error => console.error('Playback failed:', error));
        }
      } else {
        // App coming to foreground
        configureAudioSession();
        if (isPlaying) {
          audio.play().catch(error => console.error('Playback failed:', error));
        }
      }
    };

    // Configure audio session on mount
    configureAudioSession();

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleAppStateChange);
    
    // Handle audio interruptions
    audio.addEventListener('pause', () => {
      if (isPlaying) {
        audio.play().catch(error => console.error('Playback failed:', error));
      }
    });

    return () => {
      document.removeEventListener('visibilitychange', handleAppStateChange);
      audio.removeEventListener('pause', () => {});
    };
  }, [isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleAudioFocus = () => {
      if ('audioSession' in navigator) {
        navigator.audioSession.addEventListener('statechange', () => {
          if (navigator.audioSession.state === 'interrupted') {
            audio.pause();
          } else if (navigator.audioSession.state === 'running' && isPlaying) {
            audio.play().catch(error => console.error('Playback failed:', error));
          }
        });
      }
    };

    handleAudioFocus();
  }, [isPlaying]);

  return (
    <div className="music-player-container">
      <div className="player-controls">
        <div className="song-info">
          <h3>{playlist[currentSongIndex]?.title || 'No Song Loaded'}</h3>
        </div>

        <div className="equalizer">
          {analyzerData && [...analyzerData].map((value, index) => (
            <div
              key={index}
              className="equalizer-bar"
              style={{
                height: `${value * 0.5}%`,
                backgroundColor: `hsl(${(index * 360) / analyzerData.length}, 70%, 60%)`
              }}
            />
          ))}
        </div>

        <div className="progress-bar" ref={progressBarRef} onClick={handleProgressBarClick}>
          <div
            className="progress"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          ></div>
          <span className="time-display">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        <div className="main-controls">
          <button onClick={() => setShuffleMode(!shuffleMode)} className={shuffleMode ? 'active' : ''}>
            <FaRandom />
          </button>
          <button onClick={handlePrevious}>
            <FaStepBackward />
          </button>
          <button onClick={handlePlayPause} className="play-button">
            {isPlaying ? <FaPause /> : <FaPlay />}
          </button>
          <button onClick={handleNext}>
            <FaStepForward />
          </button>
          <button onClick={toggleRepeatMode} className={repeatMode !== 'none' ? 'active' : ''}>
            <FaRedoAlt />
          </button>
        </div>

        <div className="volume-controls">
          <button onClick={toggleMute}>
            {isMuted ? <FaVolumeMute /> : <FaVolumeUp />}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={handleVolumeChange}
            onTouchEnd={handleTouchVolumeChange}
          />
        </div>

        <button className="playlist-toggle-btn" onClick={() => setShowPlaylist(!showPlaylist)}>
          <FaList />
        </button>
      </div>

      {showPlaylist && (
        <div className="playlist-sidebar" ref={playlistRef}>
          <div className="playlist">
            {playlist.map((song, index) => (
              <div
                key={song.id}
                className={`playlist-item ${index === currentSongIndex ? 'active' : ''}`}
                onClick={() => setCurrentSongIndex(index)}
              >
                <span>{song.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <audio 
        ref={audioRef}
        playsInline
        preload="auto"
        x-webkit-airplay="allow"
        webkit-playsinline="true"
        controls={false}
        autoPlay={false}
        style={{ display: 'none' }}
      />
    </div>
  );
}

export default App;