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

    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch((error) => console.error('Playback failed:', error));
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

  useEffect(() => {
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

    return () => {
      cancelAnimationFrame(animationFrame);
      document.removeEventListener('click', initializeAudio);
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

      <audio ref={audioRef} />
    </div>
  );
}

export default App;