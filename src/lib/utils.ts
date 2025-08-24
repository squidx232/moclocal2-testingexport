import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDateToDDMMYY(timestamp: number | undefined): string {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return 'Invalid Date';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
  const year = String(date.getFullYear()).slice(-2); // Get last two digits of year
  return `${day}/${month}/${year}`;
}

export function formatTimestampToDateTime(timestamp: number | undefined): string {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return 'Invalid Date';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

export function formatTimestampToDate(timestamp: number | undefined): string {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return 'Invalid Date';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Notification sound utility
let notificationAudio: HTMLAudioElement | null = null;
let soundEnabled = true;

export function setSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
  localStorage.setItem('notificationSoundEnabled', enabled.toString());
}

export function isSoundEnabled(): boolean {
  const stored = localStorage.getItem('notificationSoundEnabled');
  return stored !== null ? stored === 'true' : true; // Default to enabled
}

export function playNotificationSound() {
  try {
    // Check if sound is enabled
    if (!isSoundEnabled()) {
      return;
    }

    // Create a simple beep sound if the audio file is not available
    if (!notificationAudio) {
      try {
        notificationAudio = new Audio('/notification.mp3');
        notificationAudio.volume = 0.6;
        notificationAudio.preload = 'auto';
        
        // Test if the audio file is valid
        notificationAudio.addEventListener('error', () => {
          console.log('Audio file not found or invalid, using fallback beep');
          notificationAudio = null;
        });
      } catch (error) {
        console.log('Error loading audio file:', error);
        notificationAudio = null;
      }
    }
    
    if (notificationAudio) {
      notificationAudio.currentTime = 0;
      const playPromise = notificationAudio.play();
      
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.log('Notification sound could not be played:', error.message);
          // Fallback to browser beep
          playFallbackBeep();
        });
      }
    } else {
      // Fallback to browser beep
      playFallbackBeep();
    }
  } catch (error) {
    console.log('Error playing notification sound:', error);
    // Fallback to browser beep
    playFallbackBeep();
  }
}

function playFallbackBeep() {
  try {
    // Create a simple beep using Web Audio API
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (error) {
    console.log('Fallback beep failed:', error);
  }
}

export function enableNotificationSound() {
  try {
    if (!notificationAudio) {
      notificationAudio = new Audio('/notification.mp3');
      notificationAudio.volume = 0.6;
      notificationAudio.preload = 'auto';
    }
    
    // Enable audio context with a silent test
    const testAudio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT');
    testAudio.volume = 0.01;
    testAudio.play().catch(() => {});
  } catch (error) {
    console.log('Error enabling notification sound:', error);
  }
}
