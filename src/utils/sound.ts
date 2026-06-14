// Highly robust sound synthesizer using standard Web Audio API (cross-browser compatible)
class SoundSynth {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private initCtx() {
    if (!this.ctx) {
      // @ts-ignore
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    // Resume context if suspended (browser security policy for user interaction)
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Play a happy ting-ting success chime
  playSuccess() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      
      // Note 1 (C5)
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now); // C5
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc1.start(now);
      osc1.stop(now + 0.15);

      // Note 2 (E5 then G5 fast sequence)
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(783.99, now + 0.1); // G5
      gain2.gain.setValueAtTime(0, now);
      gain2.gain.setValueAtTime(0.15, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.4);
    } catch (e) {
      console.warn("AudioContext error:", e);
    }
  }

  // Play a gentle, cartoonish "boing/whoops" sound for incorrect answers (never scary)
  playIncorrect() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      // Frequency drop from 220Hz to 110Hz to mimic "boing/slide"
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = 'triangle'; // Warmer than sawtooth, fun cartoon feel
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.35);
      
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.35);
      
      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {
      console.warn("AudioContext error:", e);
    }
  }

  // Cute pop click sound for selecting options and navigation
  playClick() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);
      
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.08);
      
      osc.start(now);
      osc.stop(now + 0.08);
    } catch (e) {
      console.warn("AudioContext error:", e);
    }
  }

  // Triumphant level-completed fanfare!
  playVictory() {
    if (!this.enabled) return;
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const notes = [
        { f: 261.63, d: 0.1 }, // C4
        { f: 329.63, d: 0.1 }, // E4
        { f: 392.00, d: 0.1 }, // G4
        { f: 523.25, d: 0.3 }, // C5 (triumphant hold)
      ];

      let delay = 0;
      notes.forEach((note) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.f, now + delay);
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.setValueAtTime(0.12, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + note.d);
        
        osc.start(now + delay);
        osc.stop(now + delay + note.d);
        
        delay += note.d - 0.02; // overlap slightly for seamless melody
      });
    } catch (e) {
      console.warn("AudioContext error:", e);
    }
  }

  // Read text using speech synthesis (TTS) - helps kids learn pronunciation!
  speakWord(text: string) {
    if (!this.enabled) return;
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // Cancel any current utterances
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US'; // English speaking setting
        utterance.rate = 0.85; // Speak slightly slower for kids to understand clearly
        utterance.pitch = 1.15; // Slightly higher pitch for a friendly child-like voice
        window.speechSynthesis.speak(utterance);
      }
    } catch (e) {
      console.warn("TTS error:", e);
    }
  }
}

export const sound = new SoundSynth();
export default sound;
