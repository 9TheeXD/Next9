import { useEffect, useState, useRef } from 'react';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000/api";

export interface CustomSound {
  id: string;
  name: string;
  url: string;
  duration: number;
}

// Custom hook to manage app-wide sound effects
export function useAppSounds() {
  const [clickSound, setClickSound] = useState<Audio.Sound>();
  const [navSound, setNavSound] = useState<Audio.Sound>();
  const [correctSound, setCorrectSound] = useState<Audio.Sound>();
  const [wrongSound, setWrongSound] = useState<Audio.Sound>();
  const [winSound, setWinSound] = useState<Audio.Sound>();
  const [loseSound, setLoseSound] = useState<Audio.Sound>();
  const [badgeSound, setBadgeSound] = useState<Audio.Sound>();
  const [xpSound, setXpSound] = useState<Audio.Sound>();

  // Custom synced sounds from API
  const [customSounds, setCustomSounds] = useState<CustomSound[]>([]);
  const customAudioRefs = useRef<Record<string, Audio.Sound>>({});

  useEffect(() => {
    async function loadUI_Sounds() {
      try {
        const { sound: sClick } = await Audio.Sound.createAsync(require('../../assets/sounds/click.wav'));
        const { sound: sNav } = await Audio.Sound.createAsync(require('../../assets/sounds/nav.wav'));
        const { sound: sCorrect } = await Audio.Sound.createAsync(require('../../assets/sounds/correct.wav'));
        const { sound: sWrong } = await Audio.Sound.createAsync(require('../../assets/sounds/wrong.wav'));
        const { sound: sWin } = await Audio.Sound.createAsync(require('../../assets/sounds/win.wav'));
        const { sound: sLose } = await Audio.Sound.createAsync(require('../../assets/sounds/lose.wav'));
        const { sound: sBadge } = await Audio.Sound.createAsync(require('../../assets/sounds/badge.wav'));
        const { sound: sXp } = await Audio.Sound.createAsync(require('../../assets/sounds/xp.wav'));

        setClickSound(sClick);
        setNavSound(sNav);
        setCorrectSound(sCorrect);
        setWrongSound(sWrong);
        setWinSound(sWin);
        setLoseSound(sLose);
        setBadgeSound(sBadge);
        setXpSound(sXp);
      } catch (e) {
        console.warn('Failed to load UI sounds:', e);
      }
    }

    async function syncCustomSounds() {
      try {
        const res = await fetch(`${API_URL}/sounds`);
        const json = await res.json();
        if (json.success && json.data) {
          setCustomSounds(json.data);
        }
      } catch (e) {
        console.warn('Failed to sync custom sounds from API:', e);
      }
    }

    loadUI_Sounds();
    syncCustomSounds();

    return () => {
      clickSound?.unloadAsync();
      navSound?.unloadAsync();
      correctSound?.unloadAsync();
      wrongSound?.unloadAsync();
      winSound?.unloadAsync();
      loseSound?.unloadAsync();
      badgeSound?.unloadAsync();
      xpSound?.unloadAsync();

      // Unload custom sounds
      Object.values(customAudioRefs.current).forEach(sound => {
        sound.unloadAsync();
      });
    };
  }, []);

  const playSound = async (sound?: Audio.Sound) => {
    if (!sound) return;
    try {
      await sound.replayAsync();
    } catch (e) {
      console.warn('Failed to play sound:', e);
    }
  };

  const playCustomSound = async (id?: string) => {
    if (customSounds.length === 0) return;
    
    try {
      // If no id provided, pick a random sound
      const targetSound = id 
        ? customSounds.find(s => s.id === id) 
        : customSounds[Math.floor(Math.random() * customSounds.length)];

      if (!targetSound) return;

      let soundObj = customAudioRefs.current[targetSound.id];
      
      // Load dynamically if not loaded yet
      if (!soundObj) {
        const { sound } = await Audio.Sound.createAsync({ uri: targetSound.url });
        customAudioRefs.current[targetSound.id] = sound;
        soundObj = sound;
      }

      await soundObj.replayAsync();
    } catch (e) {
      console.warn('Failed to play custom sound:', e);
    }
  };

  return {
    playClick: () => playSound(clickSound),
    playNav: () => playSound(navSound),
    playCorrect: () => playSound(correctSound),
    playWrong: () => playSound(wrongSound),
    playWin: () => playSound(winSound),
    playLose: () => playSound(loseSound),
    playBadge: () => playSound(badgeSound),
    playXP: () => playSound(xpSound),
    customSounds,
    playCustomSound,
  };
}
